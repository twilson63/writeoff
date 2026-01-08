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

/**
 * Generate a timestamp string for directory naming
 */
function generateTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Save all flywheel outputs to the results directory
 */
async function saveOutputs(
  session: FlywheelSession,
  outputDir: string
): Promise<string> {
  const timestamp = generateTimestamp();
  const sessionDir = path.join(outputDir, `${timestamp}-refine`);

  // Create directories
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.mkdir(path.join(sessionDir, 'iterations'), { recursive: true });

  // Save original post
  await fs.writeFile(
    path.join(sessionDir, 'original.md'),
    session.originalPost,
    'utf-8'
  );

  // Save each iteration
  for (const iteration of session.iterations) {
    const iterNum = iteration.iteration;

    // Save iteration post
    await fs.writeFile(
      path.join(sessionDir, 'iterations', `${iterNum}.md`),
      iteration.post.content,
      'utf-8'
    );

    // Save iteration judgments
    await fs.writeFile(
      path.join(sessionDir, 'iterations', `${iterNum}-judgments.json`),
      JSON.stringify(iteration.judgments, null, 2),
      'utf-8'
    );
  }

  // Save final post
  if (session.finalPost) {
    await fs.writeFile(
      path.join(sessionDir, 'final.md'),
      session.finalPost.content,
      'utf-8'
    );
  }

  // Save summary
  await fs.writeFile(
    path.join(sessionDir, 'summary.json'),
    JSON.stringify(session, null, 2),
    'utf-8'
  );

  return sessionDir;
}

/**
 * Print summary of the refinement session
 */
function printSummary(session: FlywheelSession, outputDir: string): void {
  const startingScore =
    session.iterations.length > 0 ? session.iterations[0].averageScore : 0;

  console.log('\n' + '='.repeat(60));
  console.log('REFINEMENT COMPLETE');
  console.log('='.repeat(60));
  console.log();
  console.log(`Starting Score:    ${startingScore.toFixed(1)}/100`);
  console.log(`Final Score:       ${session.finalScore.toFixed(1)}/100`);
  console.log(`Iterations:        ${session.iterations.length}`);
  console.log(
    `Stop Reason:       ${
      session.stoppedReason === 'threshold'
        ? 'Threshold reached'
        : 'Max iterations reached'
    }`
  );
  console.log();
  console.log(`Results saved to:  ${outputDir}`);
  console.log('='.repeat(60));
}

// =============================================================================
// Command Definition
// =============================================================================

/**
 * Create the refine command for the flywheel refinement process.
 */
export function createRefineCommand(): Command {
  const command = new Command('refine')
    .description('Iteratively refine a markdown file using AI feedback')
    .argument('<file>', 'Path to markdown file to refine')
    .option(
      '--writer <model>',
      'Writer model for refinement',
      DEFAULT_WRITER_MODEL
    )
    .option(
      '--judges <models>',
      'Comma-separated judge models (overrides env)'
    )
    .option(
      '--max-iterations <n>',
      'Maximum iterations',
      String(DEFAULT_MAX_ITERATIONS)
    )
    .option(
      '--threshold <n>',
      'Score threshold to stop',
      String(DEFAULT_THRESHOLD)
    )
    .option('-o, --output <dir>', 'Output directory', DEFAULT_OUTPUT_DIR)
    .action(async (filePath: string, options) => {
      try {
        // Load environment and validate API keys
        loadEnv();
        const keyValidation = validateApiKeys();
        if (!keyValidation.valid) {
          console.error(
            'Error: No API keys configured. Please set at least one of:',
            keyValidation.missing.join(', ')
          );
          process.exit(1);
        }

        // Resolve and read the input file
        const absolutePath = path.resolve(filePath);
        let fileContent: string;
        try {
          fileContent = await fs.readFile(absolutePath, 'utf-8');
        } catch (err) {
          console.error(`Error: Unable to read file "${filePath}"`);
          if (err instanceof Error) {
            console.error(err.message);
          }
          process.exit(1);
        }

        if (!fileContent.trim()) {
          console.error('Error: Input file is empty');
          process.exit(1);
        }

        // Parse writer model
        let writerModel;
        try {
          writerModel = parseModelString(options.writer);
        } catch (err) {
          console.error(`Error parsing writer model: ${err instanceof Error ? err.message : err}`);
          process.exit(1);
        }

        // Parse judge models
        let judgeModelStrings: string[];
        if (options.judges) {
          judgeModelStrings = options.judges
            .split(',')
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0);
        } else {
          judgeModelStrings = getJudgeModels();
        }

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

        // Parse numeric options
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

        // Display configuration
        console.log('\nStarting flywheel refinement...');
        console.log(`  Input:          ${filePath}`);
        console.log(`  Writer:         ${writerModel.friendlyName} (${writerModel.provider})`);
        console.log(`  Judges:         ${judgeModels.map((m) => m.friendlyName).join(', ')}`);
        console.log(`  Max Iterations: ${maxIterations}`);
        console.log(`  Threshold:      ${threshold}/100`);
        console.log(`  Output:         ${options.output}`);
        console.log();

        // Create progress bar
        const progress = createFlywheelProgress(maxIterations);
        let lastScore = 0;

        progress.start();

        // Run the flywheel
        const session = await runFlywheel({
          initialPost: fileContent,
          writerModel,
          judgeModels,
          maxIterations,
          threshold,
          onIteration: (iteration: FlywheelIteration) => {
            const improvement = iteration.averageScore - lastScore;
            const improvementStr =
              lastScore > 0
                ? ` (${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)})`
                : '';
            lastScore = iteration.averageScore;

            progress.update(
              iteration.iteration,
              `Score: ${iteration.averageScore.toFixed(1)}${improvementStr}`
            );
          },
        });

        progress.stop();

        // Save outputs
        const outputDir = await saveOutputs(session, options.output);

        // Print summary
        printSummary(session, outputDir);
      } catch (err) {
        console.error('\nError during refinement:');
        if (err instanceof Error) {
          console.error(err.message);
          if (process.env.DEBUG) {
            console.error(err.stack);
          }
        } else {
          console.error(err);
        }
        process.exit(1);
      }
    });

  return command;
}
