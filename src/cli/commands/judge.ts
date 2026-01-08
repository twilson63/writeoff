/**
 * Judge-only command for evaluating a single markdown file
 * Judges an existing post without generating new content
 */

import { Command } from 'commander';
import { readFile, mkdir, writeFile, copyFile } from 'fs/promises';
import path from 'path';
import { loadEnv, getJudgeModels, validateApiKeys } from '../../config/env.js';
import { parseModelList } from '../../config/models.js';
import { judgePostWithMultipleJudges, aggregateResults } from '../../core/judge.js';
import { createJudgeProgress } from '../progress.js';
import { printSummary } from '../summary.js';
import type { WriterResult, JudgmentResult, AggregatedResult } from '../../types/index.js';

/**
 * Create the judge command for evaluating a single markdown file
 */
export function createJudgeCommand(): Command {
  const command = new Command('judge')
    .description('Judge an existing markdown file using configured judge models')
    .argument('<file>', 'Path to markdown file to judge')
    .option('--judges <models>', 'Comma-separated judge models (overrides JUDGE_MODELS env)')
    .option('-o, --output <dir>', 'Output directory', './results')
    .action(async (file: string, options: { judges?: string; output: string }) => {
      try {
        // Load environment and validate
        loadEnv();
        const apiValidation = validateApiKeys();
        if (!apiValidation.valid) {
          console.error('Error: No API keys configured.');
          console.error(`Missing: ${apiValidation.missing.join(', ')}`);
          console.error('Please set at least one of OPENROUTER_API_KEY or ANTHROPIC_API_KEY in your .env file.');
          process.exit(1);
        }

        // Resolve input file path
        const inputPath = path.resolve(file);

        // Read the markdown file
        let content: string;
        try {
          content = await readFile(inputPath, 'utf-8');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            console.error(`Error: File not found: ${inputPath}`);
          } else {
            console.error(`Error reading file: ${(error as Error).message}`);
          }
          process.exit(1);
        }

        // Parse judge models
        const judgeModelStrings = options.judges
          ? options.judges.split(',').map((m) => m.trim())
          : getJudgeModels();

        let judgeModels;
        try {
          judgeModels = parseModelList(judgeModelStrings);
        } catch (error) {
          console.error(`Error parsing judge models: ${(error as Error).message}`);
          process.exit(1);
        }

        if (judgeModels.length === 0) {
          console.error('Error: No judge models configured.');
          console.error('Set JUDGE_MODELS in .env or use --judges option.');
          process.exit(1);
        }

        console.log(`\nJudging file: ${path.basename(inputPath)}`);
        console.log(`Using ${judgeModels.length} judge(s): ${judgeModels.map((m) => m.friendlyName).join(', ')}\n`);

        // Create mock WriterResult for the input file
        const mockPost: WriterResult = {
          modelId: 'user-input',
          friendlyName: 'User Input',
          content,
          generatedAt: new Date(),
        };

        // Set up progress tracking
        const progress = createJudgeProgress(judgeModels.length);
        progress.start();

        let completedJudgments = 0;

        // Judge the post with all judges
        let judgments: JudgmentResult[];
        try {
          judgments = await judgePostWithMultipleJudges(
            judgeModels,
            mockPost,
            (judge, status) => {
              if (status === 'done') {
                completedJudgments++;
                progress.update(completedJudgments, judge);
              }
            }
          );
        } catch (error) {
          progress.stop();
          console.error(`\nError during judging: ${(error as Error).message}`);
          process.exit(1);
        }

        progress.stop();
        console.log('\n');

        // Aggregate results (single post)
        const aggregated = aggregateResults([mockPost], judgments);
        const result = aggregated[0] || null;

        // Create output directory with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const outputDir = path.resolve(options.output, timestamp);

        try {
          // Create output directories
          await mkdir(path.join(outputDir, 'judgments'), { recursive: true });

          // Copy input file
          await copyFile(inputPath, path.join(outputDir, 'input.md'));

          // Save individual judgment files
          for (const judgment of judgments) {
            const judgeName = judgment.judgeFriendlyName.toLowerCase().replace(/\s+/g, '-');
            const judgmentPath = path.join(outputDir, 'judgments', `${judgeName}.json`);
            await writeFile(judgmentPath, JSON.stringify(judgment, null, 2), 'utf-8');
          }

          // Save summary
          const summary = {
            inputFile: inputPath,
            judgedAt: new Date().toISOString(),
            judges: judgeModels.map((m) => ({ modelId: m.modelId, friendlyName: m.friendlyName })),
            result: result
              ? {
                  overallAverage: result.overallAverage,
                  averageScores: result.averageScores,
                  judgmentCount: result.judgments.length,
                }
              : null,
          };
          await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
        } catch (error) {
          console.error(`Error saving output files: ${(error as Error).message}`);
          process.exit(1);
        }

        // Print ASCII summary
        printSummary({
          prompt: `Judging: ${path.basename(inputPath)}`,
          results: aggregated,
          winner: result,
          outputDir,
        });
      } catch (error) {
        console.error(`Unexpected error: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  return command;
}
