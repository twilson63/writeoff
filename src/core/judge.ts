/**
 * Post evaluation and judging functionality
 * Handles running judges against posts and aggregating results
 */

import type {
  JudgmentResult,
  CriterionScore,
  AggregatedResult,
  ModelConfig,
  WriterResult,
  JudgingCriteria,
} from '../types/index.js';
import { CRITERIA_WEIGHTS } from '../types/index.js';
import { generate } from '../providers/ai.js';
import { JUDGE_SYSTEM_PROMPT, getJudgePrompt } from '../prompts/judge.js';
import { parseModelString } from '../config/models.js';

// =============================================================================
// Response Parsing
// =============================================================================

/**
 * Parse a judgment response from an LLM into a structured JudgmentResult.
 * Handles both raw JSON and JSON wrapped in markdown code blocks.
 *
 * @param response - The raw response string from the judge LLM
 * @param judgeModel - The model configuration of the judge
 * @param postModelId - The model ID of the post being judged
 * @returns A structured JudgmentResult object
 * @throws Error if the response cannot be parsed as valid JSON or has invalid structure
 */
export function parseJudgmentResponse(
  response: string,
  judgeModel: ModelConfig,
  postModelId: string
): JudgmentResult {
  // Extract JSON from markdown code blocks if present
  let jsonStr = response.trim();

  // Handle ```json ... ``` blocks
  const jsonBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    jsonStr = jsonBlockMatch[1].trim();
  }

  // Parse the JSON
  let parsed: { scores: CriterionScore[]; overallScore: number };
  try {
    parsed = JSON.parse(jsonStr);
  } catch (error) {
    throw new Error(
      `Failed to parse judge response as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Validate the parsed structure
  if (!Array.isArray(parsed.scores)) {
    throw new Error('Invalid judge response: "scores" must be an array');
  }

  if (typeof parsed.overallScore !== 'number') {
    throw new Error('Invalid judge response: "overallScore" must be a number');
  }

  // Validate each score
  for (const score of parsed.scores) {
    if (!score.criterion || typeof score.score !== 'number' || !score.feedback) {
      throw new Error(
        'Invalid judge response: each score must have criterion, score, and feedback'
      );
    }
  }

  return {
    judgeModelId: judgeModel.modelId,
    judgeFriendlyName: judgeModel.friendlyName,
    postModelId,
    scores: parsed.scores,
    overallScore: parsed.overallScore,
    judgedAt: new Date(),
  };
}

// =============================================================================
// Single Judge Evaluation
// =============================================================================

/**
 * Judge a single post using a single judge model.
 *
 * @param judgeModel - The model configuration for the judge
 * @param post - The post to evaluate
 * @returns A JudgmentResult with scores and feedback
 * @throws Error if generation fails or response cannot be parsed
 */
export async function judgePost(
  judgeModel: ModelConfig,
  post: WriterResult
): Promise<JudgmentResult> {
  const userPrompt = getJudgePrompt(post.content);

  const response = await generate(judgeModel, JUDGE_SYSTEM_PROMPT, userPrompt);

  try {
    return parseJudgmentResponse(response, judgeModel, post.modelId);
  } catch (error) {
    // Re-throw with more context
    throw new Error(
      `Failed to parse judgment from ${judgeModel.friendlyName} for post by ${post.friendlyName}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

// =============================================================================
// Multi-Judge Evaluation
// =============================================================================

/**
 * Judge a single post with multiple judges in parallel.
 *
 * @param judges - Array of judge model configurations
 * @param post - The post to evaluate
 * @param onProgress - Optional callback for progress updates
 * @returns Array of JudgmentResults from all judges
 */
export async function judgePostWithMultipleJudges(
  judges: ModelConfig[],
  post: WriterResult,
  onProgress?: (judge: string, status: 'start' | 'done' | 'error') => void
): Promise<JudgmentResult[]> {
  const judgePromises = judges.map(async (judge) => {
    onProgress?.(judge.friendlyName, 'start');

    try {
      const result = await judgePost(judge, post);
      onProgress?.(judge.friendlyName, 'done');
      return result;
    } catch (error) {
      onProgress?.(judge.friendlyName, 'error');
      throw error;
    }
  });

  return Promise.all(judgePromises);
}

/**
 * Judge all posts with all judges in parallel.
 * Each post is evaluated by each judge, all running concurrently.
 *
 * @param judges - Array of judge model configurations
 * @param posts - Array of posts to evaluate
 * @param onProgress - Optional callback for progress updates
 * @returns Flat array of all JudgmentResults
 */
export async function judgeAllPosts(
  judges: ModelConfig[],
  posts: WriterResult[],
  onProgress?: (judge: string, post: string, status: 'start' | 'done' | 'error') => void
): Promise<JudgmentResult[]> {
  // Create all judge-post pairs for parallel execution
  const judgmentPromises: Promise<JudgmentResult>[] = [];

  for (const post of posts) {
    for (const judge of judges) {
      const promise = (async () => {
        onProgress?.(judge.friendlyName, post.friendlyName, 'start');

        try {
          const result = await judgePost(judge, post);
          onProgress?.(judge.friendlyName, post.friendlyName, 'done');
          return result;
        } catch (error) {
          onProgress?.(judge.friendlyName, post.friendlyName, 'error');
          throw error;
        }
      })();

      judgmentPromises.push(promise);
    }
  }

  return Promise.all(judgmentPromises);
}

// =============================================================================
// Result Aggregation
// =============================================================================

/**
 * Aggregate judgment results across all judges for each post.
 * Calculates weighted averages based on CRITERIA_WEIGHTS.
 *
 * @param posts - Array of posts that were evaluated
 * @param judgments - Array of all judgments from all judges
 * @returns Array of AggregatedResults sorted by overallAverage descending
 */
export function aggregateResults(
  posts: WriterResult[],
  judgments: JudgmentResult[]
): AggregatedResult[] {
  // Group judgments by post model ID
  const judgmentsByPost = new Map<string, JudgmentResult[]>();

  for (const judgment of judgments) {
    const existing = judgmentsByPost.get(judgment.postModelId) || [];
    existing.push(judgment);
    judgmentsByPost.set(judgment.postModelId, existing);
  }

  // Calculate aggregated results for each post
  const results: AggregatedResult[] = posts.map((post) => {
    const postJudgments = judgmentsByPost.get(post.modelId) || [];

    // Calculate average scores for each criterion
    const criteriaKeys: (keyof JudgingCriteria)[] = [
      'narrative',
      'structure',
      'audienceFit',
      'aiDetection',
    ];

    const averageScores: Record<keyof JudgingCriteria, number> = {
      narrative: 0,
      structure: 0,
      audienceFit: 0,
      aiDetection: 0,
    };

    if (postJudgments.length > 0) {
      for (const criterion of criteriaKeys) {
        let total = 0;
        let count = 0;

        for (const judgment of postJudgments) {
          const score = judgment.scores.find((s) => s.criterion === criterion);
          if (score) {
            total += score.score;
            count++;
          }
        }

        averageScores[criterion] = count > 0 ? total / count : 0;
      }
    }

    // Calculate weighted overall average
    let overallAverage = 0;
    let totalWeight = 0;

    for (const criterion of criteriaKeys) {
      const weight = CRITERIA_WEIGHTS[criterion];
      overallAverage += averageScores[criterion] * weight;
      totalWeight += weight;
    }

    // Normalize by total weight (should be 100, but this handles edge cases)
    overallAverage = totalWeight > 0 ? overallAverage / totalWeight : 0;

    return {
      postModelId: post.modelId,
      postFriendlyName: post.friendlyName,
      averageScores,
      overallAverage,
      judgments: postJudgments,
    };
  });

  // Sort by overallAverage descending (highest score first)
  results.sort((a, b) => b.overallAverage - a.overallAverage);

  return results;
}

// =============================================================================
// Winner Determination
// =============================================================================

/**
 * Determine the winning post from aggregated results.
 * The winner is the post with the highest overall average score.
 *
 * @param results - Array of aggregated results (should already be sorted)
 * @returns The winning AggregatedResult or null if no results
 */
export function determineWinner(results: AggregatedResult[]): AggregatedResult | null {
  if (results.length === 0) {
    return null;
  }

  // Results should already be sorted, but ensure we return the highest
  return results[0];
}
