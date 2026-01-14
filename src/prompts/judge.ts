export const JUDGE_SYSTEM_PROMPT = `You are an expert blog post evaluator. Your job is to critically assess blog posts against specific quality criteria.

Be rigorous and honest in your evaluation. A score of 70+ indicates good quality, 80+ is excellent, and 90+ is exceptional. Most posts should score between 60-80.

Evaluate each criterion independently and provide specific, actionable feedback.`;

export const JUDGE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          criterion: {
            type: "string",
            enum: ["narrative", "structure", "audienceFit", "accuracy", "aiDetection"],
          },
          score: {
            type: "number",
            minimum: 1,
            maximum: 100,
          },
          feedback: {
            type: "string",
          },
        },
        required: ["criterion", "score", "feedback"],
      },
      minItems: 5,
      maxItems: 5,
    },
    overallScore: {
      type: "number",
      minimum: 1,
      maximum: 100,
      description: "Weighted average of all criterion scores",
    },
  },
  required: ["scores", "overallScore"],
} as const;

export interface JudgeScore {
  criterion: "narrative" | "structure" | "audienceFit" | "accuracy" | "aiDetection";
  score: number;
  feedback: string;
}

export interface JudgeOutput {
  scores: JudgeScore[];
  overallScore: number;
}

export function getJudgePrompt(postContent: string): string {
  return `Evaluate the following blog post against these criteria:

1. **Narrative Flow (weight: 30%)**: Does the post tell a compelling story? Are transitions smooth? Does it maintain reader interest throughout?

2. **Structure (weight: 20%)**: Is the post well-organized? Does it have a clear introduction, body, and conclusion? Is the length appropriate?

3. **Audience Fit (weight: 20%)**: Is the content appropriate for the target audience? Is the tone consistent? Is it both entertaining and educational?

4. **Accuracy (weight: 15%)**: Are claims grounded and non-misleading? Penalize exaggeration and invented specifics presented as fact. If the post uses an invented or exaggerated example, it must clearly label it as hypothetical (e.g., "Hypothetical:" / "Imagine...") and keep it realistic.

5. **AI Detection (weight: 15%)**: Does the writing feel natural and human? Score LOWER if you detect these common AI writing patterns.

   The most obvious tell is **excessive em dashes**. LLMs lean on em dashes for parenthetical asides because they're trained on heavily edited prose. Human writers use them occasionally, but AI scatters them everywhere. One or two in a post is fine; five or more is a red flag. Commas, semicolons, or even parentheses are what most people actually reach for.

   Watch also for **sweeping generalizations that claim universal experience**. Phrases like "Every founder knows..." or "We've all been there" or "Anyone who's worked in sales understands..." are attempts to build rapport without earning it. Real writers either get specific about their own experience or acknowledge that not everyone shares it. This false universality is a shortcut LLMs take because they can't draw on actual lived experience.

   **Phrase-turning and clever reversals** are another giveaway. Things like "It's not X, it's Y" or chiasmus constructions ("Work to live, don't live to work") or mirror phrases that flip concepts for rhetorical effect. LLMs overuse these because they pattern-match to "clever" writing, but real people don't talk in fortune cookies.

   Then there are the **section opener clichés** that feel like throat-clearing: "Here's the bottom line," "Let me put it to you straight," "Here's the thing," "The truth is...," "Here's where it gets interesting," "Let's break down..." These are filler phrases that signal the writer (or model) doesn't know how to transition naturally between ideas.

   Beyond specific phrases, **structural uniformity** is suspicious. Perfectly symmetrical lists (exactly 6 steps, then 6 risks, then 6 tips), formulaic problem-then-solution-then-implementation arcs, every section following the same internal pattern. Real blog posts are messier because real thinking is messier.

   A related smell is **terseness without transitions**. AI-generated content often moves from point to point without any connective tissue, just boom-boom-boom through a checklist. Human writers meander a bit, circle back, use phrases like "which reminds me" or "but here's the weird part." The absence of those organic transitions makes content feel like it was assembled rather than written.

   Finally, watch for **generic motivational closings**, confident statistics without any source context, and a suspicious absence of personal anecdotes or admitted mistakes.

   **Signs of authentic human writing (score HIGHER):**
   - Admitted mistakes or lessons learned with real specifics
   - Numbers with measurement context ("from our Loom analytics over 3 months")
   - Idiosyncratic opinions or contrarian takes that might alienate some readers
   - Personal anecdotes with concrete details (names, places, specific moments)
   - Asymmetric structure that serves the content rather than a template
   - Organic transitions and occasional tangents that get reined back in

---

POST TO EVALUATE:

${postContent}

---

Provide your evaluation as a JSON object with:
- "scores": an array of 5 objects, each with "criterion" (one of: "narrative", "structure", "audienceFit", "accuracy", "aiDetection"), "score" (1-100), and "feedback" (specific, actionable feedback)
- "overallScore": the weighted average based on the weights above

Return JSON only:
- No code fences
- No Markdown
- No additional commentary outside the JSON object

Be specific in your feedback. Point to exact passages when possible.`;
}
