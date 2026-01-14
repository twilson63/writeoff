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
import { judgePostWithMultipleJudges, computeOverallFromJudgments } from './judge.js';
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
        criteriaFeedback[score.criterion].feedback.push(`[${judgment.judgeFriendlyName}]: ${score.feedback}`);
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

  const overallAvg = computeOverallFromJudgments(judgments);

  let result = `# Judge Feedback Summary\n\n`;
  result += `Overall Average Score (computed): ${overallAvg.toFixed(1)}/100\n\n`;
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

export type RefinementMode = 'blog' | 'generic';

const BLOG_REFINEMENT_SYSTEM_PROMPT = `${WRITER_SYSTEM_PROMPT}

You are refining an existing blog post based on judge feedback. Your task is to:
1. Carefully read the original post and the feedback provided
2. Address the specific issues raised by the judges
3. Improve areas with lower scores while preserving strengths
4. Maintain the original voice, topic, and core message
5. Output the complete improved post, not just the changes`;

const GENERIC_REFINEMENT_SYSTEM_PROMPT = `You are a skilled editor and communicator.

You are refining an existing draft based on judge feedback. Your task is to:
1. Carefully read the original draft and the feedback provided
2. Address the specific issues raised by the judges
3. Improve areas with lower scores while preserving strengths
4. Maintain the original intent, voice, and structure unless the feedback requires changes
5. Output the complete improved draft, not just the changes

Important:
- Preserve headings, lists, and formatting unless there is a clear reason to change them
- Do not add a title that changes the document type
- Do not wrap your output in code fences (no \`\`\`markdown blocks)`;

/**
 * Generate an improved version of a post using judge feedback.
 */
export async function refinePost(
  post: string,
  writerModel: ModelConfig,
  feedback: string,
  mode: RefinementMode = 'blog'
): Promise<string> {
  const systemPrompt = mode === 'generic' ? GENERIC_REFINEMENT_SYSTEM_PROMPT : BLOG_REFINEMENT_SYSTEM_PROMPT;

  const userPrompt = `Here is the current draft:

---
${post}
---

${feedback}

Please provide the improved version of the entire draft:`;

  return generate(writerModel, systemPrompt, userPrompt);
}

// =============================================================================
// Flywheel Runner
// =============================================================================

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
  /** Refinement mode for system prompt */
  refinementMode?: RefinementMode;
  /** If true, finalPost is best iteration (not last) */
  keepBest?: boolean;
  /** Minimum improvement over bestScore to reset patience */
  minImprovement?: number;
  /** Stop after this many non-improving iterations (0 disables) */
  patience?: number;
  /** Callback invoked after each iteration */
  onIteration?: (iteration: FlywheelIteration) => void;
}

function generateSessionId(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `flywheel-${timestamp}`;
}

export async function runFlywheel(options: FlywheelOptions): Promise<FlywheelSession> {
  const {
    initialPost,
    writerModel,
    judgeModels,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    threshold = DEFAULT_THRESHOLD,
    refinementMode = 'blog',
    keepBest = false,
    minImprovement = 0,
    patience = 0,
    onIteration,
  } = options;

  const sessionId = generateSessionId();
  const iterations: FlywheelIteration[] = [];

  let currentPost = initialPost;
  let stoppedReason: FlywheelSession['stoppedReason'] = 'max_iterations';

  let bestScore = 0;
  let bestIteration = 0;
  let nonImprovingCount = 0;

  for (let i = 1; i <= maxIterations; i++) {
    const postResult: WriterResult = {
      modelId: writerModel.modelId,
      friendlyName: writerModel.friendlyName,
      content: currentPost,
      generatedAt: new Date(),
    };

    const judged = await judgePostWithMultipleJudges(judgeModels, postResult);

    const averageScore = computeOverallFromJudgments(judged.judgments);
    const averageScoreJudgeReported = judged.judgments.length
      ? judged.judgments.reduce((sum, j) => sum + j.overallScore, 0) / judged.judgments.length
      : 0;

    const iteration: FlywheelIteration = {
      iteration: i,
      post: postResult,
      judgments: judged.judgments,
      judgeFailures: judged.failures,
      averageScore,
      averageScoreJudgeReported,
    };
    iterations.push(iteration);

    onIteration?.(iteration);

    // Track best iteration
    if (averageScore > bestScore + minImprovement) {
      bestScore = averageScore;
      bestIteration = i;
      nonImprovingCount = 0;
    } else {
      nonImprovingCount++;
    }

    if (averageScore >= threshold) {
      stoppedReason = 'threshold';
      break;
    }

    if (patience > 0 && nonImprovingCount >= patience) {
      stoppedReason = 'no_improvement';
      break;
    }

    if (i < maxIterations) {
      const feedback = formatFeedbackForWriter(judged.judgments);
      currentPost = await refinePost(currentPost, writerModel, feedback, refinementMode);
    }
  }

  const lastIteration = iterations[iterations.length - 1];

  // Fallback: if we never set bestIteration (e.g., empty judgments), use last.
  if (iterations.length > 0 && bestIteration === 0) {
    bestIteration = lastIteration.iteration;
    bestScore = lastIteration.averageScore;
  }

  const chosenIteration =
    keepBest && bestIteration > 0
      ? iterations.find((it) => it.iteration === bestIteration) ?? lastIteration
      : lastIteration;

  const finalPost: WriterResult | null = chosenIteration
    ? {
        modelId: writerModel.modelId,
        friendlyName: writerModel.friendlyName,
        content: chosenIteration.post.content,
        generatedAt: chosenIteration.post.generatedAt,
      }
    : null;

  const finalScore = chosenIteration ? chosenIteration.averageScore : 0;

  return {
    id: sessionId,
    originalPost: initialPost,
    writerModel,
    iterations,
    finalPost,
    finalScore,
    bestScore,
    bestIteration,
    stoppedReason,
  };
}
