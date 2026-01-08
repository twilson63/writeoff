/**
 * Vercel AI SDK provider setup for OpenRouter and Anthropic
 */

import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { getOpenRouterApiKey, getAnthropicApiKey } from '../config/env.js';
import type { ModelConfig } from '../types/index.js';

// =============================================================================
// Provider Instances
// =============================================================================

/**
 * Create OpenRouter provider instance (lazy initialization)
 */
function getOpenRouterProvider() {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is not set. Please add it to your .env file.'
    );
  }

  return createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
  });
}

/**
 * Create Anthropic provider instance (lazy initialization)
 */
function getAnthropicProvider() {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Please add it to your .env file.'
    );
  }

  return createAnthropic({
    apiKey,
  });
}

// =============================================================================
// Model Resolution
// =============================================================================

/**
 * Get the appropriate model instance based on provider configuration.
 *
 * @param config - The model configuration specifying provider and model ID
 * @returns The model instance ready for use with generateText
 * @throws Error if the API key for the specified provider is missing
 */
export function getModel(config: ModelConfig) {
  switch (config.provider) {
    case 'openrouter':
      return getOpenRouterProvider()(config.modelId);
    case 'anthropic':
      return getAnthropicProvider()(config.modelId);
    default:
      throw new Error(`Unknown provider: ${(config as ModelConfig).provider}`);
  }
}

// =============================================================================
// Text Generation
// =============================================================================

/**
 * Generate text using the specified model and prompts.
 *
 * @param config - The model configuration
 * @param systemPrompt - The system prompt to set context/behavior
 * @param userPrompt - The user prompt with the actual request
 * @returns The generated text response
 * @throws Error if API key is missing or generation fails
 */
export async function generate(
  config: ModelConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const model = getModel(config);

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 8000, // Appropriate for long-form writing
  });

  return result.text;
}
