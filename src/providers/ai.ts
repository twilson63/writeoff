/**
 * Vercel AI SDK provider setup for OpenRouter and Anthropic
 */

import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import {
  getOpenRouterApiKey,
  getAnthropicApiKey,
  getMaxRetries,
  getRetryBaseMs,
  getRetryMaxMs,
} from '../config/env.js';
import type { ModelConfig } from '../types/index.js';

// =============================================================================
// Provider Instances
// =============================================================================

function getOpenRouterProvider() {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set. Please add it to your .env file.');
  }

  return createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
  });
}

function getAnthropicProvider() {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Please add it to your .env file.');
  }

  return createAnthropic({ apiKey });
}

// =============================================================================
// Model Resolution
// =============================================================================

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function getErrorCode(err: unknown): unknown {
  if (typeof err !== 'object' || err === null) return undefined;
  const anyErr = err as Record<string, unknown>;
  return anyErr.code ?? anyErr.status ?? anyErr.statusCode;
}

function isRetryableError(err: unknown): boolean {
  const code = getErrorCode(err);
  if (code === 429) return true;
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EAI_AGAIN') return true;

  const msg = getErrorMessage(err).toLowerCase();
  return (
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('timeout') ||
    msg.includes('temporarily') ||
    msg.includes('overloaded')
  );
}

/**
 * Generate text using the specified model and prompts.
 * Retries transient failures with exponential backoff.
 */
export async function generate(
  config: ModelConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const model = getModel(config);

  const maxRetries = getMaxRetries();
  const baseMs = getRetryBaseMs();
  const maxMs = getRetryMaxMs();

  let attempt = 0;
  // attempt 0 = initial try, then up to maxRetries retries.
  for (;;) {
    try {
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        maxTokens: 8000,
      });

      return result.text;
    } catch (err) {
      const retryable = isRetryableError(err);
      if (!retryable || attempt >= maxRetries) {
        const suffix = attempt > 0 ? ` (after ${attempt} retry/retries)` : '';
        throw new Error(`LLM request failed for ${config.friendlyName}${suffix}: ${getErrorMessage(err)}`);
      }

      const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt));
      const jitter = Math.floor(Math.random() * 250);
      await sleep(exp + jitter);
      attempt++;
    }
  }
}
