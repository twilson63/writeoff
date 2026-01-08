export const WRITER_SYSTEM_PROMPT = `You are a skilled blog writer. Write an engaging, narrative-driven blog post.

Guidelines:
- Keep it under 8 minutes to read
- Write in a conversational, storytelling style
- Make it entertaining AND educational - the reader should learn something
- Flow naturally through ideas; avoid choppy transitions
- Avoid bullet points unless absolutely necessary
- NO em-dashes (—) - use commas, semicolons, or restructure sentences
- NO emojis
- NO cliches like "dive into", "unleash", "game-changer", "in today's fast-paced world"
- Vary sentence length and structure
- Output in clean Markdown format`;

export function getWriterPrompt(topic: string, existingContent?: string): string {
  if (existingContent) {
    return `Here is an existing blog post draft:

---
${existingContent}
---

Please expand and improve this post about "${topic}". Maintain the original voice and direction while enhancing the narrative, adding depth, and ensuring it meets all the guidelines.`;
  }

  return `Write a blog post about: ${topic}`;
}
