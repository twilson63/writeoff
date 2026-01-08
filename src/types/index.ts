/**
 * Type definitions for the writeoff CLI tool
 * A benchmarking system for evaluating LLM writing capabilities
 */

// =============================================================================
// Model Configuration
// =============================================================================

/**
 * Configuration for an LLM model
 */
export interface ModelConfig {
  provider: 'openrouter' | 'anthropic';
  modelId: string;
  friendlyName: string;
}

// =============================================================================
// Writer Types
// =============================================================================

/**
 * Result of generating a blog post from an LLM
 */
export interface WriterResult {
  modelId: string;
  friendlyName: string;
  content: string;
  generatedAt: Date;
}

// =============================================================================
// Judging Types
// =============================================================================

/**
 * Criteria weights for evaluating blog posts
 * - narrative (40%): Flow, storytelling, engagement
 * - structure (25%): Organization, headings, transitions
 * - audienceFit (20%): Tone, knowledge level
 * - aiDetection (15%): Penalizes AI writing patterns including:
 *   - Phrase-turning/juxtaposition ("It's not X, it's Y")
 *   - Section opener clichés ("Here's the bottom line", "Let me put it to you straight")
 *   - Perfectly symmetrical lists and formulaic structure
 *   - Generic transitions and confident unsourced claims
 *   Rewards: admitted mistakes, specific anecdotes, idiosyncratic voice
 */
export interface JudgingCriteria {
  narrative: number;
  structure: number;
  audienceFit: number;
  aiDetection: number;
}

/**
 * Criteria weights as percentages (must sum to 100)
 */
export const CRITERIA_WEIGHTS: Readonly<JudgingCriteria> = {
  narrative: 40,
  structure: 25,
  audienceFit: 20,
  aiDetection: 15,
} as const;

/**
 * Score for a single criterion from a judge
 */
export interface CriterionScore {
  criterion: keyof JudgingCriteria;
  /** Score from 1-100 */
  score: number;
  feedback: string;
}

/**
 * Complete judgment result from one judge for one post
 */
export interface JudgmentResult {
  judgeModelId: string;
  judgeFriendlyName: string;
  postModelId: string;
  scores: CriterionScore[];
  /** Weighted overall score based on criteria weights */
  overallScore: number;
  judgedAt: Date;
}

// =============================================================================
// Aggregation Types
// =============================================================================

/**
 * Aggregated scores for one post across all judges
 */
export interface AggregatedResult {
  postModelId: string;
  postFriendlyName: string;
  /** Average score for each criterion across all judges */
  averageScores: Record<keyof JudgingCriteria, number>;
  /** Weighted average of all criteria across all judges */
  overallAverage: number;
  /** Individual judgments from each judge */
  judgments: JudgmentResult[];
}

// =============================================================================
// Session Types
// =============================================================================

/**
 * Complete writeoff session containing all posts, judgments, and results
 */
export interface WriteoffSession {
  /** Unique session identifier (timestamp-based) */
  id: string;
  /** The writing prompt used for generation */
  prompt: string;
  /** Optional input file path if prompt was loaded from file */
  inputFile?: string;
  /** Generated posts from all writer models */
  posts: WriterResult[];
  /** Individual judgments from all judges */
  judgments: JudgmentResult[];
  /** Aggregated results for each post */
  results: AggregatedResult[];
  /** The winning post (highest overall average) or null if no posts */
  winner: AggregatedResult | null;
  createdAt: Date;
}

// =============================================================================
// Flywheel (Phase II) Types
// =============================================================================

/**
 * A single iteration in the flywheel refinement process
 */
export interface FlywheelIteration {
  iteration: number;
  post: WriterResult;
  judgments: JudgmentResult[];
  averageScore: number;
}

/**
 * Complete flywheel refinement session
 */
export interface FlywheelSession {
  /** Unique session identifier */
  id: string;
  /** The original post content before refinement */
  originalPost: string;
  /** The model used for writing/refining */
  writerModel: ModelConfig;
  /** All iterations of refinement */
  iterations: FlywheelIteration[];
  /** The final refined post or null if process failed */
  finalPost: WriterResult | null;
  /** Final weighted average score */
  finalScore: number;
  /** Reason the flywheel stopped */
  stoppedReason: 'threshold' | 'max_iterations';
}
