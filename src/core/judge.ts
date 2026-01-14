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
  JudgeFailure,
} from '../types/index.js';
import { CRITERIA_WEIGHTS } from '../types/index.js';
import { generate } from '../providers/ai.js';
import { JUDGE_SYSTEM_PROMPT, getJudgePrompt } from '../prompts/judge.js';
import { getMaxConcurrency } from '../config/env.js';
import { pLimit } from '../utils/limit.js';

export interface JudgeRunResult {
  judgments: JudgmentResult[];
  failures: JudgeFailure[];
}

const CRITERIA_KEYS = Object.keys(CRITERIA_WEIGHTS) as Array<keyof JudgingCriteria>;

function normalizeCriterion(raw: unknown): keyof JudgingCriteria | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase().replace(/[^a-z]/g, '');

  // Accept a few common variations.
  switch (key) {
    case 'narrative':
    case 'narrativeflow':
    case 'flow':
      return 'narrative';
    case 'structure':
      return 'structure';
    case 'audiencefit':
    case 'audience':
      return 'audienceFit';
    case 'accuracy':
      return 'accuracy';
    case 'aidetection':
    case 'ai':
    case 'aiflag':
      return 'aiDetection';
    default:
      return null;
  }
}

export function computeOverallFromScores(scores: CriterionScore[]): number {
  const scoreByCriterion = new Map<keyof JudgingCriteria, number>();
  for (const s of scores) {
    scoreByCriterion.set(s.criterion, s.score);
  }

  let totalWeight = 0;
  let weightedSum = 0;

  for (const criterion of CRITERIA_KEYS) {
    const weight = CRITERIA_WEIGHTS[criterion];
    const score = scoreByCriterion.get(criterion) ?? 0;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

export function computeOverallFromJudgments(judgments: JudgmentResult[]): number {
  if (judgments.length === 0) return 0;

  // Average each criterion across judges, then apply weights.
  const sums: Record<keyof JudgingCriteria, number> = {
    narrative: 0,
    structure: 0,
    audienceFit: 0,
    accuracy: 0,
    aiDetection: 0,
  };

  const counts: Record<keyof JudgingCriteria, number> = {
    narrative: 0,
    structure: 0,
    audienceFit: 0,
    accuracy: 0,
    aiDetection: 0,
  };

  for (const j of judgments) {
    for (const s of j.scores) {
      sums[s.criterion] += s.score;
      counts[s.criterion] += 1;
    }
  }

  const averaged: Record<keyof JudgingCriteria, number> = {
    narrative: counts.narrative ? sums.narrative / counts.narrative : 0,
    structure: counts.structure ? sums.structure / counts.structure : 0,
    audienceFit: counts.audienceFit ? sums.audienceFit / counts.audienceFit : 0,
    accuracy: counts.accuracy ? sums.accuracy / counts.accuracy : 0,
    aiDetection: counts.aiDetection ? sums.aiDetection / counts.aiDetection : 0,
  };

  let totalWeight = 0;
  let weightedSum = 0;
  for (const criterion of CRITERIA_KEYS) {
    const weight = CRITERIA_WEIGHTS[criterion];
    weightedSum += averaged[criterion] * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

function validateAndNormalizeScores(input: unknown): { scores: CriterionScore[]; warnings: string[] } {
  if (!Array.isArray(input)) {
    throw new Error('Invalid judge response: "scores" must be an array');
  }

  const warnings: string[] = [];
  const seen = new Set<keyof JudgingCriteria>();
  const normalized: CriterionScore[] = [];

  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('Invalid judge response: each score must be an object');
    }

    const record = raw as Record<string, unknown>;
    const criterion = normalizeCriterion(record.criterion);
    if (!criterion) {
      throw new Error(
        `Invalid judge response: unknown criterion "${String(record.criterion)}"`
      );
    }

    if (seen.has(criterion)) {
      throw new Error(`Invalid judge response: duplicate criterion "${criterion}"`);
    }
    seen.add(criterion);

    const score = record.score;
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      throw new Error(`Invalid judge response: score for "${criterion}" must be a number`);
    }

    if (score < 1 || score > 100) {
      throw new Error(`Invalid judge response: score for "${criterion}" must be 1-100`);
    }

    const feedback = record.feedback;
    if (typeof feedback !== 'string') {
      throw new Error(`Invalid judge response: feedback for "${criterion}" must be a string`);
    }
    if (feedback.trim().length === 0) {
      warnings.push(`Empty feedback for criterion "${criterion}"`);
    }

    normalized.push({ criterion, score, feedback });
  }

  // Ensure all criteria are present exactly once.
  for (const required of CRITERIA_KEYS) {
    if (!seen.has(required)) {
      throw new Error(`Invalid judge response: missing criterion "${required}"`);
    }
  }

  if (normalized.length !== CRITERIA_KEYS.length) {
    throw new Error(`Invalid judge response: expected ${CRITERIA_KEYS.length} scores`);
  }

  return { scores: normalized, warnings };
}

// =============================================================================
// Response Parsing
// =============================================================================

/**
 * Parse a judgment response from an LLM into a structured JudgmentResult.
 * Handles both raw JSON and JSON wrapped in markdown code blocks.
 */
export function parseJudgmentResponse(
  response: string,
  judgeModel: ModelConfig,
  postModelId: string
): JudgmentResult {
  // Extract JSON from markdown code blocks if present
  let jsonStr = response.trim();

  const jsonBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    jsonStr = jsonBlockMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (error) {
    throw new Error(
      `Failed to parse judge response as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid judge response: root must be a JSON object');
  }

  const record = parsed as Record<string, unknown>;

  const { scores, warnings } = validateAndNormalizeScores(record.scores);

  const overallScore = record.overallScore;
  if (typeof overallScore !== 'number' || !Number.isFinite(overallScore)) {
    throw new Error('Invalid judge response: "overallScore" must be a number');
  }
  if (overallScore < 1 || overallScore > 100) {
    throw new Error('Invalid judge response: "overallScore" must be 1-100');
  }

  const overallScoreComputed = computeOverallFromScores(scores);
  const parseWarnings = [...warnings];

  // If the judge-reported overall differs substantially, keep a warning.
  if (Math.abs(overallScore - overallScoreComputed) >= 5) {
    parseWarnings.push(
      `Judge overallScore (${overallScore.toFixed(1)}) differs from computed (${overallScoreComputed.toFixed(1)})`
    );
  }

  return {
    judgeModelId: judgeModel.modelId,
    judgeFriendlyName: judgeModel.friendlyName,
    postModelId,
    scores,
    overallScore,
    overallScoreComputed,
    parseWarnings: parseWarnings.length ? parseWarnings : undefined,
    judgedAt: new Date(),
  };
}

// =============================================================================
// Single Judge Evaluation
// =============================================================================

function buildRepairPrompt(originalPrompt: string, badResponse: string, errorMessage: string): string {
  return `${originalPrompt}

---

Your previous response was invalid JSON (or did not match the required schema).

Error: ${errorMessage}

Return ONLY a valid JSON object with:
- "scores": an array of exactly ${CRITERIA_KEYS.length} objects (one per criterion)
- "overallScore": a number 1-100

Rules:
- Use criteria exactly from this set: ${CRITERIA_KEYS.map((c) => `"${c}"`).join(', ')}
- Each criterion must appear exactly once
- Scores must be integers or decimals between 1 and 100
- Do not wrap JSON in code fences

Invalid response (for reference only):
${badResponse}`;
}

/**
 * Judge a single post using a single judge model.
 * Retries once with a repair prompt if the judge returns invalid JSON.
 */
export async function judgePost(judgeModel: ModelConfig, post: WriterResult): Promise<JudgmentResult> {
  const userPrompt = getJudgePrompt(post.content);

  const response = await generate(judgeModel, JUDGE_SYSTEM_PROMPT, userPrompt);

  try {
    return parseJudgmentResponse(response, judgeModel, post.modelId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    const repairedResponse = await generate(
      judgeModel,
      JUDGE_SYSTEM_PROMPT,
      buildRepairPrompt(userPrompt, response, message)
    );

    const repaired = parseJudgmentResponse(repairedResponse, judgeModel, post.modelId);
    repaired.parseWarnings = [...(repaired.parseWarnings ?? []), 'Repaired invalid judge output'];
    return repaired;
  }
}

// =============================================================================
// Multi-Judge Evaluation
// =============================================================================

/**
 * Judge a single post with multiple judges.
 * Returns partial results and failures instead of failing the entire run.
 */
export async function judgePostWithMultipleJudges(
  judges: ModelConfig[],
  post: WriterResult,
  onProgress?: (judge: string, status: 'start' | 'done' | 'error') => void
): Promise<JudgeRunResult> {
  const limit = pLimit(getMaxConcurrency());

  const tasks = judges.map((judge) =>
    limit(async () => {
      onProgress?.(judge.friendlyName, 'start');
      try {
        const result = await judgePost(judge, post);
        onProgress?.(judge.friendlyName, 'done');
        return { ok: true as const, result };
      } catch (err) {
        onProgress?.(judge.friendlyName, 'error');
        return {
          ok: false as const,
          failure: {
            judgeModelId: judge.modelId,
            judgeFriendlyName: judge.friendlyName,
            postModelId: post.modelId,
            postFriendlyName: post.friendlyName,
            error: err instanceof Error ? err.message : String(err),
            failedAt: new Date(),
          } satisfies JudgeFailure,
        };
      }
    })
  );

  const results = await Promise.all(tasks);

  const judgments: JudgmentResult[] = [];
  const failures: JudgeFailure[] = [];
  for (const r of results) {
    if (r.ok) judgments.push(r.result);
    else failures.push(r.failure);
  }

  return { judgments, failures };
}

/**
 * Judge all posts with all judges.
 * Returns partial results and failures instead of failing the entire run.
 */
export async function judgeAllPosts(
  judges: ModelConfig[],
  posts: WriterResult[],
  onProgress?: (judge: string, post: string, status: 'start' | 'done' | 'error') => void
): Promise<JudgeRunResult> {
  const limit = pLimit(getMaxConcurrency());

  const tasks: Array<Promise<{ ok: true; result: JudgmentResult } | { ok: false; failure: JudgeFailure }>> = [];

  for (const post of posts) {
    for (const judge of judges) {
      tasks.push(
        limit(async () => {
          onProgress?.(judge.friendlyName, post.friendlyName, 'start');
          try {
            const result = await judgePost(judge, post);
            onProgress?.(judge.friendlyName, post.friendlyName, 'done');
            return { ok: true as const, result };
          } catch (err) {
            onProgress?.(judge.friendlyName, post.friendlyName, 'error');
            return {
              ok: false as const,
              failure: {
                judgeModelId: judge.modelId,
                judgeFriendlyName: judge.friendlyName,
                postModelId: post.modelId,
                postFriendlyName: post.friendlyName,
                error: err instanceof Error ? err.message : String(err),
                failedAt: new Date(),
              },
            };
          }
        })
      );
    }
  }

  const settled = await Promise.all(tasks);

  const judgments: JudgmentResult[] = [];
  const failures: JudgeFailure[] = [];
  for (const r of settled) {
    if (r.ok) judgments.push(r.result);
    else failures.push(r.failure);
  }

  return { judgments, failures };
}

// =============================================================================
// Result Aggregation
// =============================================================================

/**
 * Aggregate judgment results across all judges for each post.
 * Calculates weighted averages based on CRITERIA_WEIGHTS.
 */
export function aggregateResults(posts: WriterResult[], judgments: JudgmentResult[]): AggregatedResult[] {
  const judgmentsByPost = new Map<string, JudgmentResult[]>();

  for (const judgment of judgments) {
    const existing = judgmentsByPost.get(judgment.postModelId) || [];
    existing.push(judgment);
    judgmentsByPost.set(judgment.postModelId, existing);
  }

  const results: AggregatedResult[] = posts.map((post) => {
    const postJudgments = judgmentsByPost.get(post.modelId) || [];

    const averageScores: Record<keyof JudgingCriteria, number> = {
      narrative: 0,
      structure: 0,
      audienceFit: 0,
      accuracy: 0,
      aiDetection: 0,
    };

    if (postJudgments.length > 0) {
      for (const criterion of CRITERIA_KEYS) {
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

    let overallAverage = 0;
    let totalWeight = 0;

    for (const criterion of CRITERIA_KEYS) {
      const weight = CRITERIA_WEIGHTS[criterion];
      overallAverage += averageScores[criterion] * weight;
      totalWeight += weight;
    }

    overallAverage = totalWeight > 0 ? overallAverage / totalWeight : 0;

    return {
      postModelId: post.modelId,
      postFriendlyName: post.friendlyName,
      averageScores,
      overallAverage,
      judgments: postJudgments,
    };
  });

  results.sort((a, b) => b.overallAverage - a.overallAverage);
  return results;
}

// =============================================================================
// Winner Determination
// =============================================================================

export function determineWinner(results: AggregatedResult[]): AggregatedResult | null {
  if (results.length === 0) return null;
  return results[0];
}
