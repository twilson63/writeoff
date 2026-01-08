/**
 * Flywheel - Iterative refinement system (Phase II)
 * 
 * The flywheel takes a post through iterative improvement cycles:
 * 1. Submit post to judges for evaluation
 * 2. Collect feedback and scores
 * 3. If score >= threshold or max iterations reached: stop
 * 4. Otherwise: refine post using feedback and repeat
 */

import type {
  FlywheelIteration,
  FlywheelSession,
  ModelConfig,
  WriterResult,
  JudgmentResult,
} from '../types/index.js';
import { generatePost } from './writer.js';
import { judgePostWithMultipleJudges, aggregateResults } from './judge.js';
import { WRITER_SYSTEM_PROMPT } from '../prompts/writer.js';
import { generate } from '../providers/ai.js';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_THRESHOLD = 90;

// =============================================================================
// Feedback Formatting
// =============================================================================

/**
 * Combine all judge feedback into a clear, actionable prompt for the writer.
 * Lists each criterion with scores and specific feedback from all judges.
 * 
 * @param judgments - Array of judgment results from multiple judges
 * @returns Formatted feedback string for the writer
 */
export function formatFeedbackForWriter(judgments: JudgmentResult[]): string {
  if (judgments.length === 0) {
    return 'No feedback available.';
  }

  const sections: string[] = [];
  
  // Group feedback by criterion
  const criteriaFeedback: Record<string, { scores: number[]; feedback: string[] }> = {};
  
  for (const judgment of judgments) {
    for (const score of judgment.scores) {
      if (!criteriaFeedback[score.criterion]) {
        criteriaFeedback[score.criterion] = { scores: [], feedback: [] };
      }
      criteriaFeedback[score.criterion].scores.push(score.score);
      if (score.feedback.trim()) {
        criteriaFeedback[score.criterion].feedback.push(
          `[${judgment.judgeFriendlyName}]: ${score.feedback}`
        );
      }
    }
  }

  // Format each criterion section
  for (const [criterion, data] of Object.entries(criteriaFeedback)) {
    const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    const scoreRange = `${Math.min(...data.scores)}-${Math.max(...data.scores)}`;
    
    let section = `## ${criterion.charAt(0).toUpperCase() + criterion.slice(1)}\n`;
    section += `Average Score: ${avgScore.toFixed(1)}/100 (range: ${scoreRange})\n\n`;
    
    if (data.feedback.length > 0) {
      section += 'Feedback:\n';
      for (const fb of data.feedback) {
        section += `- ${fb}\n`;
      }
    }
    
    sections.push(section);
  }

  // Calculate overall average
  const overallScores = judgments.map(j => j.overallScore);
  const overallAvg = overallScores.reduce((a, b) => a + b, 0) / overallScores.length;

  let result = `# Judge Feedback Summary\n\n`;
  result += `Overall Average Score: ${overallAvg.toFixed(1)}/100\n\n`;
  result += sections.join('\n');
  result += '\n---\n\n';
  result += 'Please improve the post based on the feedback above. ';
  result += 'Focus especially on criteria with lower scores. ';
  result += 'Maintain what is working well while addressing the specific issues raised.';

  return result;
}

// =============================================================================
// Post Refinement
// =============================================================================

/**
 * System prompt for refinement that includes context about the task.
 */
const REFINEMENT_SYSTEM_PROMPT = `${WRITER_SYSTEM_PROMPT}

You are refining an existing blog post based on judge feedback. Your task is to:
1. Carefully read the original post and the feedback provided
2. Address the specific issues raised by the judges
3. Improve areas with lower scores while preserving strengths
4. Maintain the original voice, topic, and core message
5. Output the complete improved post, not just the changes`;

/**
 * Generate an improved version of a post using judge feedback.
 * 
 * @param post - The current version of the post to improve
 * @param writerModel - The model configuration for the writer
 * @param feedback - Formatted feedback from the judges
 * @returns The improved post content
 */
export async function refinePost(
  post: string,
  writerModel: ModelConfig,
  feedback: string
): Promise<string> {
  const userPrompt = `Here is the current blog post:

---
${post}
---

${feedback}

Please provide the improved version of the entire post:`;

  return generate(writerModel, REFINEMENT_SYSTEM_PROMPT, userPrompt);
}

// =============================================================================
// Flywheel Runner
// =============================================================================

/**
 * Options for running the flywheel refinement process.
 */
export interface FlywheelOptions {
  /** The initial post content to refine */
  initialPost: string;
  /** The model to use for writing/refining */
  writerModel: ModelConfig;
  /** The models to use for judging */
  judgeModels: ModelConfig[];
  /** Maximum number of iterations (default: 100) */
  maxIterations?: number;
  /** Score threshold to stop at (default: 90) */
  threshold?: number;
  /** Callback invoked after each iteration */
  onIteration?: (iteration: FlywheelIteration) => void;
}

/**
 * Generate a unique session ID based on timestamp.
 */
function generateSessionId(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `flywheel-${timestamp}`;
}

/**
 * Run the flywheel refinement loop.
 * 
 * The flywheel iteratively improves a post by:
 * 1. Sending the current post to judges for evaluation
 * 2. Checking if the average score meets the threshold
 * 3. If not, collecting feedback and generating an improved version
 * 4. Repeating until threshold is met or max iterations reached
 * 
 * @param options - Configuration options for the flywheel
 * @returns Complete flywheel session with all iterations and final result
 */
export async function runFlywheel(options: FlywheelOptions): Promise<FlywheelSession> {
  const {
    initialPost,
    writerModel,
    judgeModels,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    threshold = DEFAULT_THRESHOLD,
    onIteration,
  } = options;

  const sessionId = generateSessionId();
  const iterations: FlywheelIteration[] = [];
  
  let currentPost = initialPost;
  let stoppedReason: 'threshold' | 'max_iterations' = 'max_iterations';
  let finalScore = 0;

  for (let i = 1; i <= maxIterations; i++) {
    // Create a WriterResult for the current post
    const postResult: WriterResult = {
      modelId: writerModel.modelId,
      friendlyName: writerModel.friendlyName,
      content: currentPost,
      generatedAt: new Date(),
    };

    // Send to judges for evaluation
    const judgments = await judgePostWithMultipleJudges(judgeModels, postResult);
    
    // Calculate average score across all judges
    const averageScore = judgments.length > 0
      ? judgments.reduce((sum, j) => sum + j.overallScore, 0) / judgments.length
      : 0;

    // Record this iteration
    const iteration: FlywheelIteration = {
      iteration: i,
      post: postResult,
      judgments,
      averageScore,
    };
    iterations.push(iteration);

    // Notify callback if provided
    if (onIteration) {
      onIteration(iteration);
    }

    finalScore = averageScore;

    // Check if we've reached the threshold
    if (averageScore >= threshold) {
      stoppedReason = 'threshold';
      break;
    }

    // If not at max iterations, refine the post
    if (i < maxIterations) {
      const feedback = formatFeedbackForWriter(judgments);
      currentPost = await refinePost(currentPost, writerModel, feedback);
    }
  }

  // Build the final post result
  const lastIteration = iterations[iterations.length - 1];
  const finalPost: WriterResult | null = lastIteration ? {
    modelId: writerModel.modelId,
    friendlyName: writerModel.friendlyName,
    content: lastIteration.post.content,
    generatedAt: lastIteration.post.generatedAt,
  } : null;

  return {
    id: sessionId,
    originalPost: initialPost,
    writerModel,
    iterations,
    finalPost,
    finalScore,
    stoppedReason,
  };
}
