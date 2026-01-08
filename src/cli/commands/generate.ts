/**
 * Main generate command for the writeoff CLI
 * Orchestrates the full workflow: generate posts, judge them, aggregate results
 */

import { Command } from 'commander';
import { readFile, mkdir, writeFile } from 'fs/promises';
import path from 'path';

import {
  loadEnv,
  getWriterModels,
  getJudgeModels,
  validateApiKeys,
} from '../../config/env.js';
import { parseModelList } from '../../config/models.js';
import { generatePostsFromModels } from '../../core/writer.js';
import { judgeAllPosts, aggregateResults, determineWinner } from '../../core/judge.js';
import { createWriterProgress, createJudgeProgress } from '../progress.js';
import { printSummary } from '../summary.js';
import type {
  ModelConfig,
  WriterResult,
  JudgmentResult,
  AggregatedResult,
  WriteoffSession,
} from '../../types/index.js';

/**
 * Generate a timestamp-based session ID
 */
function generateSessionId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

/**
 * Sanitize a model name for use as a filename
 */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Save all session outputs to the results directory
 */
async function saveSessionOutputs(
  session: WriteoffSession,
  outputDir: string
): Promise<string> {
  const sessionDir = path.join(outputDir, session.id);

  // Create directory structure
  await mkdir(sessionDir, { recursive: true });
  await mkdir(path.join(sessionDir, 'posts'), { recursive: true });
  await mkdir(path.join(sessionDir, 'judgments'), { recursive: true });

  // Save prompt
  await writeFile(path.join(sessionDir, 'prompt.md'), session.prompt, 'utf-8');

  // Save each post
  for (const post of session.posts) {
    const filename = `${sanitizeFilename(post.friendlyName)}.md`;
    await writeFile(path.join(sessionDir, 'posts', filename), post.content, 'utf-8');
  }

  // Group judgments by judge
  const judgmentsByJudge = new Map<string, JudgmentResult[]>();
  for (const judgment of session.judgments) {
    const judgeKey = sanitizeFilename(judgment.judgeFriendlyName);
    if (!judgmentsByJudge.has(judgeKey)) {
      judgmentsByJudge.set(judgeKey, []);
    }
    judgmentsByJudge.get(judgeKey)!.push(judgment);
  }

  // Save judgments by judge
  for (const [judgeKey, judgments] of judgmentsByJudge) {
    const filename = `${judgeKey}.json`;
    await writeFile(
      path.join(sessionDir, 'judgments', filename),
      JSON.stringify(judgments, null, 2),
      'utf-8'
    );
  }

  // Save full session summary
  await writeFile(
    path.join(sessionDir, 'summary.json'),
    JSON.stringify(session, null, 2),
    'utf-8'
  );

  return sessionDir;
}

/**
 * Create the generate command
 */
export function createGenerateCommand(): Command {
  const command = new Command('generate')
    .description('Generate blog posts from multiple LLMs and judge them')
    .argument('[prompt]', 'The writing prompt/topic for blog post generation')
    .option('-i, --input <file>', 'Read prompt/content from a markdown file')
    .option('-w, --writers <models>', 'Comma-separated writer models (overrides env)')
    .option('-j, --judges <models>', 'Comma-separated judge models (overrides env)')
    .option('-o, --output <dir>', 'Output directory for results', './results')
    .action(async (promptArg: string | undefined, options) => {
      try {
        // Load environment and validate
        loadEnv();
        const validation = validateApiKeys();

        if (!validation.valid) {
          console.error('Error: No API keys configured.');
          console.error('Please set at least one of the following environment variables:');
          for (const key of validation.missing) {
            console.error(`  - ${key}`);
          }
          process.exit(1);
        }

        // Determine the prompt
        let prompt: string;
        let inputFile: string | undefined;

        if (options.input) {
          // Read prompt from file
          try {
            inputFile = path.resolve(options.input);
            prompt = await readFile(inputFile, 'utf-8');
            prompt = prompt.trim();
          } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
              console.error(`Error: Input file not found: ${options.input}`);
            } else {
              console.error(`Error reading input file: ${err.message}`);
            }
            process.exit(1);
          }
        } else if (promptArg) {
          prompt = promptArg;
        } else {
          console.error('Error: A prompt is required.');
          console.error('Provide a prompt as an argument or use --input <file> to read from a file.');
          process.exit(1);
        }

        if (!prompt) {
          console.error('Error: Prompt cannot be empty.');
          process.exit(1);
        }

        // Parse writer and judge models
        const writerModelStrings = options.writers
          ? options.writers.split(',').map((s: string) => s.trim())
          : getWriterModels();

        const judgeModelStrings = options.judges
          ? options.judges.split(',').map((s: string) => s.trim())
          : getJudgeModels();

        let writerModels: ModelConfig[];
        let judgeModels: ModelConfig[];

        try {
          writerModels = parseModelList(writerModelStrings);
        } catch (error) {
          console.error(`Error parsing writer models: ${(error as Error).message}`);
          process.exit(1);
        }

        try {
          judgeModels = parseModelList(judgeModelStrings);
        } catch (error) {
          console.error(`Error parsing judge models: ${(error as Error).message}`);
          process.exit(1);
        }

        if (writerModels.length === 0) {
          console.error('Error: No writer models configured.');
          process.exit(1);
        }

        if (judgeModels.length === 0) {
          console.error('Error: No judge models configured.');
          process.exit(1);
        }

        console.log(`\nWriteoff Session`);
        console.log(`================`);
        console.log(`Writers: ${writerModels.map((m) => m.friendlyName).join(', ')}`);
        console.log(`Judges: ${judgeModels.map((m) => m.friendlyName).join(', ')}`);
        console.log(`Prompt: ${prompt.length > 100 ? prompt.slice(0, 100) + '...' : prompt}`);
        console.log();

        // Phase 1: Generate posts
        console.log('Phase 1: Generating posts...');
        const writerProgress = createWriterProgress(writerModels.length);
        writerProgress.start();

        const posts: WriterResult[] = await generatePostsFromModels(
          writerModels,
          prompt,
          undefined,
          (model, status) => {
            if (status === 'done') {
              writerProgress.increment(model);
            } else if (status === 'error') {
              writerProgress.increment(`${model} (failed)`);
            }
          }
        );

        writerProgress.stop();
        console.log(`Generated ${posts.length}/${writerModels.length} posts successfully.\n`);

        if (posts.length === 0) {
          console.error('Error: No posts were generated. Check your API keys and model configurations.');
          process.exit(1);
        }

        // Phase 2: Judge posts
        console.log('Phase 2: Judging posts...');
        const totalJudgments = posts.length * judgeModels.length;
        const judgeProgress = createJudgeProgress(totalJudgments);
        judgeProgress.start();

        const judgments: JudgmentResult[] = await judgeAllPosts(
          judgeModels,
          posts,
          (judge: string, post: string, status: 'start' | 'done' | 'error') => {
            if (status === 'done') {
              judgeProgress.increment(`${judge} -> ${post}`);
            } else if (status === 'error') {
              judgeProgress.increment(`${judge} -> ${post} (failed)`);
            }
          }
        );

        judgeProgress.stop();
        console.log(`Completed ${judgments.length}/${totalJudgments} judgments.\n`);

        if (judgments.length === 0) {
          console.error('Error: No judgments were completed. Check your API keys and model configurations.');
          process.exit(1);
        }

        // Phase 3: Aggregate results
        console.log('Phase 3: Aggregating results...');
        const results: AggregatedResult[] = aggregateResults(posts, judgments);
        const winner = determineWinner(results);

        // Create session object
        const session: WriteoffSession = {
          id: generateSessionId(),
          prompt,
          inputFile,
          posts,
          judgments,
          results,
          winner,
          createdAt: new Date(),
        };

        // Save outputs
        const outputDir = path.resolve(options.output);
        const sessionDir = await saveSessionOutputs(session, outputDir);
        console.log(`Results saved to: ${sessionDir}\n`);

        // Print summary
        printSummary({
          prompt: session.prompt,
          results: session.results,
          winner: session.winner,
          outputDir: sessionDir,
        });

      } catch (error) {
        console.error(`\nUnexpected error: ${(error as Error).message}`);
        if (process.env.DEBUG) {
          console.error((error as Error).stack);
        }
        process.exit(1);
      }
    });

  return command;
}
