import dotenv from 'dotenv';

// Default model configurations
const DEFAULT_WRITER_MODELS = [
  'openrouter:google/gemini-2.5-flash',
  'openrouter:moonshotai/kimi-k2-thinking',
  'openrouter:openai/gpt-5.2',
  'anthropic:claude-opus-4-0520',
];

const DEFAULT_JUDGE_MODELS = [
  'openrouter:openai/gpt-5.2',
  'openrouter:moonshotai/kimi-k2-thinking',
  'openrouter:google/gemini-3-flash-preview',
  'openrouter:anthropic/claude-opus-4.5',
];

let envLoaded = false;

/**
 * Load environment variables from .env file and validate configuration.
 * Warns if API keys are missing.
 */
export function loadEnv(): void {
  if (envLoaded) return;

  dotenv.config();
  envLoaded = true;

  // Warn about missing API keys
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('Warning: OPENROUTER_API_KEY is not set. OpenRouter models will not be available.');
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('Warning: ANTHROPIC_API_KEY is not set. Anthropic models will not be available.');
  }
}

/**
 * Get the OpenRouter API key from environment.
 */
export function getOpenRouterApiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY;
}

/**
 * Get the Anthropic API key from environment.
 */
export function getAnthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}

function parsePositiveIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

/**
 * Maximum number of concurrent LLM requests.
 */
export function getMaxConcurrency(): number {
  return parsePositiveIntEnv('WRITEOFF_MAX_CONCURRENCY', 5);
}

/**
 * Maximum number of retries for transient model/provider failures.
 */
export function getMaxRetries(): number {
  return parsePositiveIntEnv('WRITEOFF_MAX_RETRIES', 2);
}

export function getRetryBaseMs(): number {
  return parsePositiveIntEnv('WRITEOFF_RETRY_BASE_MS', 500);
}

export function getRetryMaxMs(): number {
  return parsePositiveIntEnv('WRITEOFF_RETRY_MAX_MS', 8000);
}

/**
 * Parse a comma-separated model string into an array.
 * Format: "provider:model-id,provider:model-id"
 */
function parseModels(modelString: string | undefined, defaults: string[]): string[] {
  if (!modelString || modelString.trim() === '') {
    return defaults;
  }

  return modelString
    .split(',')
    .map((model) => model.trim())
    .filter((model) => model.length > 0);
}

/**
 * Get the configured writer models.
 * Returns parsed WRITER_MODELS env var or defaults.
 */
export function getWriterModels(): string[] {
  return parseModels(process.env.WRITER_MODELS, DEFAULT_WRITER_MODELS);
}

/**
 * Get the configured judge models.
 * Returns parsed JUDGE_MODELS env var or defaults.
 */
export function getJudgeModels(): string[] {
  return parseModels(process.env.JUDGE_MODELS, DEFAULT_JUDGE_MODELS);
}

/**
 * Validate that at least one API key is configured.
 * Returns validation result with list of missing keys.
 */
export function validateApiKeys(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!process.env.OPENROUTER_API_KEY) {
    missing.push('OPENROUTER_API_KEY');
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    missing.push('ANTHROPIC_API_KEY');
  }

  return {
    valid: missing.length < 2, // At least one key must be present
    missing,
  };
}
