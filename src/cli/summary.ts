/**
 * ASCII summary output rendering for writeoff CLI
 */

import type { AggregatedResult, JudgingCriteria } from '../types/index.js';

// Re-import the weights value (not just type)
const WEIGHTS: Readonly<JudgingCriteria> = {
  narrative: 40,
  structure: 25,
  audienceFit: 20,
  aiDetection: 15,
} as const;

// Box drawing characters
const BOX_DOUBLE_HORIZONTAL = '=';
const BOX_SINGLE_HORIZONTAL = '-';
const BOX_VERTICAL = '|';
const BOX_CORNER_PLUS = '+';

// Bar characters
const BAR_FILLED = '█';
const BAR_EMPTY = '░';

/**
 * Render a progress bar based on score 0-100
 * @param score - Score from 0 to 100
 * @param width - Total width of the bar (default 20)
 * @returns String like "████████████████████░░░"
 */
export function renderScoreBar(score: number, width: number = 20): string {
  const clampedScore = Math.max(0, Math.min(100, score));
  const filledCount = Math.round((clampedScore / 100) * width);
  const emptyCount = width - filledCount;
  return BAR_FILLED.repeat(filledCount) + BAR_EMPTY.repeat(emptyCount);
}

/**
 * Truncate a string with "..." if too long
 * @param prompt - The string to truncate
 * @param maxLength - Maximum length (default 50)
 * @returns Truncated string with "..." if needed
 */
export function truncatePrompt(prompt: string, maxLength: number = 50): string {
  // Normalize whitespace
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  
  if (normalized.length <= maxLength) {
    return normalized;
  }
  
  return normalized.slice(0, maxLength - 3) + '...';
}

/**
 * Pad a string to a specific width
 */
function padRight(str: string, width: number): string {
  if (str.length >= width) {
    return str.slice(0, width);
  }
  return str + ' '.repeat(width - str.length);
}

/**
 * Pad a string to center it within a width
 */
function padCenter(str: string, width: number): string {
  if (str.length >= width) {
    return str.slice(0, width);
  }
  const totalPadding = width - str.length;
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return ' '.repeat(leftPadding) + str + ' '.repeat(rightPadding);
}

/**
 * Create a horizontal line
 */
function horizontalLine(char: string, width: number): string {
  return BOX_CORNER_PLUS + char.repeat(width - 2) + BOX_CORNER_PLUS;
}

/**
 * Create a content line with borders
 */
function contentLine(content: string, width: number): string {
  const innerWidth = width - 4; // Account for "| " and " |"
  const paddedContent = padRight(content, innerWidth);
  return BOX_VERTICAL + '  ' + paddedContent + BOX_VERTICAL;
}

/**
 * Create an empty line with borders
 */
function emptyLine(width: number): string {
  return contentLine('', width);
}

/**
 * Format criterion name for display
 */
function formatCriterionName(criterion: keyof JudgingCriteria): string {
  const names: Record<keyof JudgingCriteria, string> = {
    narrative: 'Narrative',
    structure: 'Structure',
    audienceFit: 'Audience',
    aiDetection: 'AI Detection',
  };
  return names[criterion];
}

interface RenderSummaryOptions {
  prompt: string;
  results: AggregatedResult[];
  winner: AggregatedResult | null;
  outputDir: string;
}

/**
 * Render the full ASCII box summary
 */
export function renderSummary(options: RenderSummaryOptions): string {
  const { prompt, results, winner, outputDir } = options;
  const width = 64; // Total box width
  const innerWidth = width - 4;
  
  const lines: string[] = [];
  
  // Top border
  lines.push(horizontalLine(BOX_DOUBLE_HORIZONTAL, width));
  
  // Title
  lines.push(contentLine(padCenter('WRITEOFF RESULTS', innerWidth), width));
  
  // Title separator
  lines.push(horizontalLine(BOX_DOUBLE_HORIZONTAL, width));
  
  // Prompt line
  const truncatedPrompt = truncatePrompt(prompt, innerWidth - 12);
  lines.push(contentLine(`Prompt: "${truncatedPrompt}"`, width));
  
  // Prompt separator
  lines.push(horizontalLine(BOX_SINGLE_HORIZONTAL, width));
  
  // Empty line
  lines.push(emptyLine(width));
  
  // Rankings header
  lines.push(contentLine('RANKINGS', width));
  lines.push(contentLine('-'.repeat(innerWidth - 2), width));
  
  // Sort results by overall average (descending)
  const sortedResults = [...results].sort((a, b) => b.overallAverage - a.overallAverage);
  
  // Render each ranking
  sortedResults.forEach((result, index) => {
    const rank = `#${index + 1}`;
    const name = padRight(result.postFriendlyName, 18);
    const score = result.overallAverage.toFixed(1).padStart(5);
    const bar = renderScoreBar(result.overallAverage, 23);
    const line = `${rank}  ${name} ${score}  ${bar}`;
    lines.push(contentLine(line, width));
  });
  
  // Empty line
  lines.push(emptyLine(width));
  
  // Winner breakdown
  if (winner) {
    lines.push(contentLine(`BREAKDOWN (Winner: ${winner.postFriendlyName})`, width));
    lines.push(contentLine('-'.repeat(innerWidth - 2), width));
    
    // Show each criterion with weight and score
    const criteria: (keyof JudgingCriteria)[] = ['narrative', 'structure', 'audienceFit', 'aiDetection'];
    
    for (const criterion of criteria) {
      const weight = WEIGHTS[criterion];
      const score = Math.round(winner.averageScores[criterion]);
      const name = formatCriterionName(criterion);
      const line = `${padRight(name, 14)} (${weight}%)`.padEnd(22) + `${score}/100`;
      lines.push(contentLine(line, width));
    }
  } else {
    lines.push(contentLine('No results to display', width));
  }
  
  // Empty line
  lines.push(emptyLine(width));
  
  // Output directory
  lines.push(contentLine(`Output: ${outputDir}`, width));
  
  // Bottom border
  lines.push(horizontalLine(BOX_DOUBLE_HORIZONTAL, width));
  
  return lines.join('\n');
}

/**
 * Print the summary to console
 */
export function printSummary(options: RenderSummaryOptions): void {
  console.log(renderSummary(options));
}
