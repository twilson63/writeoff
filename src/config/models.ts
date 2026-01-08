import { ModelConfig } from '../types/index.js';

// =============================================================================
// Model ID Mappings
// =============================================================================

/**
 * Map of friendly names to full model IDs
 */
export const MODEL_ID_MAP: Record<string, string> = {
  'gemini-flash': 'google/gemini-2.5-flash',
  'kimi-k2': 'moonshotai/kimi-k2-thinking',
  'gpt-5.2': 'openai/gpt-5.2',
  'claude-opus-4': 'claude-opus-4-0520',
};

/**
 * Reverse map: model IDs to friendly names
 */
const REVERSE_MODEL_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(MODEL_ID_MAP).map(([friendly, id]) => [id, friendly])
);

// =============================================================================
// Default Model Configurations
// =============================================================================

/**
 * Default writer models in provider:model format
 */
export const DEFAULT_WRITER_MODELS: string[] = [
  'openrouter:google/gemini-2.5-flash',
  'openrouter:moonshotai/kimi-k2-thinking',
  'openrouter:openai/gpt-5.2',
  'anthropic:claude-opus-4-0520',
];

/**
 * Default judge models in provider:model format
 */
export const DEFAULT_JUDGE_MODELS: string[] = [
  'openrouter:google/gemini-2.5-flash',
  'openrouter:moonshotai/kimi-k2-thinking',
  'anthropic:claude-opus-4-0520',
];

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert a model ID to a friendly display name.
 * Examples:
 *   "google/gemini-2.5-flash" -> "Gemini Flash"
 *   "moonshotai/kimi-k2-thinking" -> "Kimi K2"
 *   "openai/gpt-5.2" -> "GPT 5.2"
 *   "claude-opus-4-0520" -> "Claude Opus 4"
 */
export function getFriendlyName(modelId: string): string {
  // Check reverse map for known models
  const knownFriendly = REVERSE_MODEL_MAP[modelId];
  if (knownFriendly) {
    return formatFriendlyName(knownFriendly);
  }

  // Generate friendly name from model ID
  // Remove provider prefix if present (e.g., "google/gemini-2.5-flash" -> "gemini-2.5-flash")
  const modelName = modelId.includes('/') ? modelId.split('/').pop()! : modelId;

  // Clean up the model name
  return formatModelName(modelName);
}

/**
 * Format a short friendly name into a display name
 * Examples: "gemini-flash" -> "Gemini Flash", "gpt-5.2" -> "GPT 5.2"
 */
function formatFriendlyName(name: string): string {
  return name
    .split('-')
    .map((part) => {
      // Keep version numbers as-is
      if (/^\d/.test(part)) {
        return part;
      }
      // Uppercase common acronyms
      if (['gpt', 'ai'].includes(part.toLowerCase())) {
        return part.toUpperCase();
      }
      // Capitalize first letter
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

/**
 * Format a model name into a friendly display name
 * Examples: "gemini-2.5-flash" -> "Gemini 2.5 Flash"
 */
function formatModelName(name: string): string {
  // Remove common suffixes like timestamps
  const cleaned = name.replace(/-\d{4}$/, '');

  return cleaned
    .split('-')
    .map((part) => {
      // Keep version numbers as-is
      if (/^\d/.test(part)) {
        return part;
      }
      // Uppercase common acronyms
      if (['gpt', 'ai', 'k2'].includes(part.toLowerCase())) {
        return part.toUpperCase();
      }
      // Capitalize first letter
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

/**
 * Parse a model string in "provider:model-id" format into a ModelConfig.
 * @param modelStr - String like "openrouter:google/gemini-2.5-flash" or "anthropic:claude-opus-4-0520"
 * @returns ModelConfig with provider, modelId, and friendlyName
 * @throws Error if the format is invalid or provider is unknown
 */
export function parseModelString(modelStr: string): ModelConfig {
  const trimmed = modelStr.trim();

  if (!trimmed.includes(':')) {
    throw new Error(
      `Invalid model string format: "${modelStr}". Expected "provider:model-id" format.`
    );
  }

  const colonIndex = trimmed.indexOf(':');
  const provider = trimmed.slice(0, colonIndex).toLowerCase();
  const modelId = trimmed.slice(colonIndex + 1);

  if (!modelId) {
    throw new Error(`Invalid model string: "${modelStr}". Model ID cannot be empty.`);
  }

  if (provider !== 'openrouter' && provider !== 'anthropic') {
    throw new Error(
      `Unknown provider "${provider}" in model string "${modelStr}". ` +
        `Supported providers: openrouter, anthropic`
    );
  }

  return {
    provider,
    modelId,
    friendlyName: getFriendlyName(modelId),
  };
}

/**
 * Parse an array of model strings into ModelConfig objects.
 * @param modelStrings - Array of strings like ["openrouter:google/gemini-2.5-flash", "anthropic:claude-opus-4-0520"]
 * @returns Array of ModelConfig objects
 */
export function parseModelList(modelStrings: string[]): ModelConfig[] {
  return modelStrings.map(parseModelString);
}
