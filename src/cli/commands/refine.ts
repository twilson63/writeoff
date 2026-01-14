/**
 * Refine Command - Flywheel Refinement (Phase II)
 *
 * Takes an existing markdown file through iterative improvement cycles
 * using writer and judge models until a score threshold is reached.
 */

import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';

import { loadEnv, getJudgeModels, validateApiKeys } from '../../config/env.js';
import { parseModelList, parseModelString } from '../../config/models.js';
import { runFlywheel } from '../../core/flywheel.js';
import { createFlywheelProgress } from '../progress.js';
import { unifiedDiff } from '../../utils/diff.js';
import type { FlywheelSession, FlywheelIteration } from '../../types/index.js';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_WRITER_MODEL = 'anthropic:claude-opus-4-0520';
const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_THRESHOLD = 90;
const DEFAULT_OUTPUT_DIR = './results';

// =============================================================================
// Output Helpers
// =============================================================================

function generateTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function saveOutputs(
  session: FlywheelSession,
  outputDir: string,
  options: { writeDiffs: boolean; diffContext: number }
): Promise<string> {
  const timestamp = generateTimestamp();
  const sessionDir = path.join(outputDir, `${timestamp}-refine`);

  await fs.mkdir(sessionDir, { recursive: true });
  await fs.mkdir(path.join(sessionDir, 'iterations'), { recursive: true });

  const diffsDir = path.join(sessionDir, 'diffs');
  if (options.writeDiffs) {
    await fs.mkdir(diffsDir, { recursive: true });
  }

  await fs.writeFile(path.join(sessionDir, 'original.md'), session.originalPost, 'utf-8');

  for (let i = 0; i < session.iterations.length; i++) {
    const iteration = session.iterations[i];
    const iterNum = iteration.iteration;

    await fs.writeFile(
      path.join(sessionDir, 'iterations', `${iterNum}.md`),
      iteration.post.content,
      'utf-8'
    );

    await fs.writeFile(
      path.join(sessionDir, 'iterations', `${iterNum}-judgments.json`),
      JSON.stringify(iteration, null, 2),
      'utf-8'
    );

    if (options.writeDiffs && i > 0) {
      const prev = session.iterations[i - 1];
      const patch = unifiedDiff(prev.post.content, iteration.post.content, {
        fromFile: `iterations/${prev.iteration}.md`,
        toFile: `iterations/${iteration.iteration}.md`,
        context: options.diffContext,
      });

      if (patch) {
        await fs.writeFile(
          path.join(diffsDir, `${prev.iteration}-${iteration.iteration}.patch`),
          patch,
          'utf-8'
        );
      }
    }
  }

  if (session.finalPost) {
    await fs.writeFile(path.join(sessionDir, 'final.md'), session.finalPost.content, 'utf-8');
  }

  await fs.writeFile(path.join(sessionDir, 'summary.json'), JSON.stringify(session, null, 2), 'utf-8');

  return sessionDir;
}

function printSummary(session: FlywheelSession, outputDir: string, keepBest: boolean): void {
  const startingScore = session.iterations.length > 0 ? session.iterations[0].averageScore : 0;

  console.log('\n' + '='.repeat(60));
  console.log('REFINEMENT COMPLETE');
  console.log('='.repeat(60));
  console.log();
  console.log(`Starting Score:    ${startingScore.toFixed(1)}/100`);
  console.log(`Final Score:       ${session.finalScore.toFixed(1)}/100`);
  console.log(`Best Score:        ${session.bestScore.toFixed(1)}/100 (iter ${session.bestIteration})`);
  console.log(`Iterations:        ${session.iterations.length}`);

  const reason =
    session.stoppedReason === 'threshold'
      ? 'Threshold reached'
      : session.stoppedReason === 'no_improvement'
        ? 'No improvement'
        : 'Max iterations reached';
  console.log(`Stop Reason:       ${reason}`);

  if (keepBest && session.bestIteration > 0) {
    const lastIter = session.iterations[session.iterations.length - 1]?.iteration ?? 0;
    if (session.bestIteration !== lastIter) {
      console.log(`Final Post:        Best iteration (iter ${session.bestIteration})`);
    }
  }

  console.log();
  console.log(`Results saved to:  ${outputDir}`);
  console.log('='.repeat(60));
}

// =============================================================================
// Command Definition
// =============================================================================

export function createRefineCommand(): Command {
  const command = new Command('refine')
    .description('Iteratively refine a markdown file using AI feedback')
    .argument('<file>', 'Path to markdown file to refine')
    .option('--writer <model>', 'Writer model for refinement', DEFAULT_WRITER_MODEL)
    .option('--judges <models>', 'Comma-separated judge models (overrides env)')
    .option('--mode <mode>', 'Refinement mode: blog or generic', 'blog')
    .option('--max-iterations <n>', 'Maximum iterations', String(DEFAULT_MAX_ITERATIONS))
    .option('--threshold <n>', 'Score threshold to stop', String(DEFAULT_THRESHOLD))
    .option('--no-keep-best', 'Use last iteration as final post')
    .option('--min-improvement <n>', 'Minimum score improvement to reset patience', '0')
    .option('--patience <n>', 'Stop after N non-improving iterations (0 disables)', '0')
    .option('--diff', 'Write unified diffs between iterations')
    .option('--diff-context <n>', 'Unified diff context lines', '3')
    .option('-o, --output <dir>', 'Output directory', DEFAULT_OUTPUT_DIR)
    .action(async (filePath: string, options) => {
      try {
        loadEnv();
        const keyValidation = validateApiKeys();
        if (!keyValidation.valid) {
          console.error('Error: No API keys configured. Please set at least one of:', keyValidation.missing.join(', '));
          process.exit(1);
        }

        const absolutePath = path.resolve(filePath);
        let fileContent: string;
        try {
          fileContent = await fs.readFile(absolutePath, 'utf-8');
        } catch (err) {
          console.error(`Error: Unable to read file "${filePath}"`);
          if (err instanceof Error) console.error(err.message);
          process.exit(1);
        }

        if (!fileContent.trim()) {
          console.error('Error: Input file is empty');
          process.exit(1);
        }

        let writerModel;
        try {
          writerModel = parseModelString(options.writer);
        } catch (err) {
          console.error(`Error parsing writer model: ${err instanceof Error ? err.message : err}`);
          process.exit(1);
        }

        const judgeModelStrings: string[] = options.judges
          ? options.judges
              .split(',')
              .map((s: string) => s.trim())
              .filter((s: string) => s.length > 0)
          : getJudgeModels();

        let judgeModels;
        try {
          judgeModels = parseModelList(judgeModelStrings);
        } catch (err) {
          console.error(`Error parsing judge models: ${err instanceof Error ? err.message : err}`);
          process.exit(1);
        }

        if (judgeModels.length === 0) {
          console.error('Error: No judge models configured');
          process.exit(1);
        }

        const maxIterations = parseInt(options.maxIterations, 10);
        if (isNaN(maxIterations) || maxIterations < 1) {
          console.error('Error: --max-iterations must be a positive integer');
          process.exit(1);
        }

        const threshold = parseInt(options.threshold, 10);
        if (isNaN(threshold) || threshold < 1 || threshold > 100) {
          console.error('Error: --threshold must be an integer between 1 and 100');
          process.exit(1);
        }

        const minImprovement = Number.parseFloat(options.minImprovement);
        if (!Number.isFinite(minImprovement) || minImprovement < 0) {
          console.error('Error: --min-improvement must be a non-negative number');
          process.exit(1);
        }

        const patience = parseInt(options.patience, 10);
        if (isNaN(patience) || patience < 0) {
          console.error('Error: --patience must be a non-negative integer');
          process.exit(1);
        }

        const diffContext = parseInt(options.diffContext, 10);
        if (isNaN(diffContext) || diffContext < 0 || diffContext > 20) {
          console.error('Error: --diff-context must be an integer between 0 and 20');
          process.exit(1);
        }

        const mode = String(options.mode ?? 'blog').toLowerCase();
        if (mode !== 'blog' && mode !== 'generic') {
          console.error('Error: --mode must be either "blog" or "generic"');
          process.exit(1);
        }
        const refinementMode = mode as 'blog' | 'generic';

        const keepBest = Boolean(options.keepBest);
        const writeDiffs = Boolean(options.diff);

        console.log('\nStarting flywheel refinement...');
        console.log(`  Input:          ${filePath}`);
        console.log(`  Writer:         ${writerModel.friendlyName} (${writerModel.provider})`);
        console.log(`  Mode:           ${refinementMode}`);
        console.log(`  Judges:         ${judgeModels.map((m) => m.friendlyName).join(', ')}`);
        console.log(`  Max Iterations: ${maxIterations}`);
        console.log(`  Threshold:      ${threshold}/100`);
        console.log(`  Keep Best:      ${keepBest ? 'yes' : 'no'}`);
        console.log(`  Patience:       ${patience} (min improvement: ${minImprovement})`);
        console.log(`  Diffs:          ${writeDiffs ? `yes (context=${diffContext})` : 'no'}`);
        console.log(`  Output:         ${options.output}`);
        console.log();

        const progress = createFlywheelProgress(maxIterations);
        let lastScore = 0;
        progress.start();

        const session = await runFlywheel({
          initialPost: fileContent,
          writerModel,
          judgeModels,
          maxIterations,
          threshold,
          refinementMode,
          keepBest,
          minImprovement,
          patience,
          onIteration: (iteration: FlywheelIteration) => {
            const improvement = iteration.averageScore - lastScore;
            const improvementStr =
              lastScore > 0 ? ` (${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)})` : '';
            lastScore = iteration.averageScore;

            const failuresSuffix = iteration.judgeFailures.length
              ? ` | ${iteration.judgeFailures.length} judge failure(s)`
              : '';

            progress.update(
              iteration.iteration,
              `Score: ${iteration.averageScore.toFixed(1)}${improvementStr}${failuresSuffix}`
            );
          },
        });

        progress.stop();

        const outputDir = await saveOutputs(session, options.output, { writeDiffs, diffContext });
        printSummary(session, outputDir, keepBest);
      } catch (err) {
        console.error('\nError during refinement:');
        if (err instanceof Error) {
          console.error(err.message);
          if (process.env.DEBUG) console.error(err.stack);
        } else {
          console.error(err);
        }
        process.exit(1);
      }
    });

  return command;
}
