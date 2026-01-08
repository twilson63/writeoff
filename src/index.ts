#!/usr/bin/env node

import { program } from 'commander';
import { createGenerateCommand } from './cli/commands/generate.js';
import { createJudgeCommand } from './cli/commands/judge.js';
import { createRefineCommand } from './cli/commands/refine.js';
import { loadEnv } from './config/env.js';

// Load environment variables
loadEnv();

// Set up the CLI
program
  .name('writeoff')
  .description('CLI tool that benchmarks LLM writing capabilities')
  .version('1.0.0');

// Add commands
program.addCommand(createGenerateCommand());
program.addCommand(createJudgeCommand());
program.addCommand(createRefineCommand());

// Show help if no command provided
program.action(() => {
  program.help();
});

// Parse and run
program.parse();
