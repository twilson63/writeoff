/**
 * Blog post generation module
 * Handles generating posts from single or multiple models
 */

import type { WriterResult, ModelConfig } from '../types/index.js';
import { generate } from '../providers/ai.js';
import { WRITER_SYSTEM_PROMPT, getWriterPrompt } from '../prompts/writer.js';
import { parseModelString } from '../config/models.js';

/**
 * Generate a blog post using a specific model.
 *
 * @param model - The model configuration to use for generation
 * @param prompt - The writing prompt/topic
 * @param existingContent - Optional existing content to expand/improve
 * @returns WriterResult with the generated content and metadata
 */
export async function generatePost(
  model: ModelConfig,
  prompt: string,
  existingContent?: string
): Promise<WriterResult> {
  const userPrompt = getWriterPrompt(prompt, existingContent);
  const content = await generate(model, WRITER_SYSTEM_PROMPT, userPrompt);

  return {
    modelId: model.modelId,
    friendlyName: model.friendlyName,
    content,
    generatedAt: new Date(),
  };
}

/**
 * Generate blog posts from multiple models in parallel.
 *
 * @param models - Array of model configurations to use
 * @param prompt - The writing prompt/topic
 * @param existingContent - Optional existing content to expand/improve
 * @param onProgress - Optional callback for progress updates
 * @returns Array of successful WriterResult objects
 */
export async function generatePostsFromModels(
  models: ModelConfig[],
  prompt: string,
  existingContent?: string,
  onProgress?: (model: string, status: 'start' | 'done' | 'error') => void
): Promise<WriterResult[]> {
  const generateWithProgress = async (
    model: ModelConfig
  ): Promise<WriterResult | null> => {
    onProgress?.(model.friendlyName, 'start');

    try {
      const result = await generatePost(model, prompt, existingContent);
      onProgress?.(model.friendlyName, 'done');
      return result;
    } catch (error) {
      console.error(`Error generating post with ${model.friendlyName}:`, error);
      onProgress?.(model.friendlyName, 'error');
      return null;
    }
  };

  const results = await Promise.all(models.map(generateWithProgress));

  // Filter out failed generations (nulls)
  return results.filter((result): result is WriterResult => result !== null);
}

/**
 * Generate blog posts from model strings in parallel.
 * Parses model strings to ModelConfig and delegates to generatePostsFromModels.
 *
 * @param modelStrings - Array of model strings (e.g., "openrouter:model-id")
 * @param prompt - The writing prompt/topic
 * @param existingContent - Optional existing content to expand/improve
 * @param onProgress - Optional callback for progress updates
 * @returns Array of successful WriterResult objects
 */
export async function generatePostsFromModelStrings(
  modelStrings: string[],
  prompt: string,
  existingContent?: string,
  onProgress?: (model: string, status: 'start' | 'done' | 'error') => void
): Promise<WriterResult[]> {
  const models = modelStrings.map(parseModelString);
  return generatePostsFromModels(models, prompt, existingContent, onProgress);
}
