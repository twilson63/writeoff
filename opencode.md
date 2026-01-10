# Using Writeoff with OpenCode

A guide to iteratively refining a blog post using OpenCode and Writeoff until reaching an 88% score.

## Prerequisites

- OpenCode installed and configured
- Writeoff built (`npm install && npm run build`)
- API keys set in `.env` (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)

## The Loop

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ OpenCode │────▶│ writeoff │────▶│ Analyze  │────▶│ OpenCode │──┐
│  writes  │     │  judge   │     │ feedback │     │ improves │  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘  │
     ▲                                                           │
     └───────────────────────────────────────────────────────────┘
```

## Step 1: Generate Draft

Ask OpenCode to write your initial post:

```
Write a blog post about "The Future of AI Coding Assistants" - make it 
narrative-driven, under 8 minutes to read. Save it to ./my-post.md
```

## Step 2: Judge & Analyze

Run the judge command:

```bash
writeoff judge ./my-post.md
```

Output shows scores for each criterion:

```json
{
  "scores": [
    { "criterion": "narrative", "score": 68, "feedback": "Opening lacks hook..." },
    { "criterion": "structure", "score": 75, "feedback": "Sections are uniform..." },
    { "criterion": "audienceFit", "score": 72, "feedback": "Tone is appropriate..." },
    { "criterion": "aiDetection", "score": 65, "feedback": "Multiple em-dashes detected..." }
  ],
  "overallScore": 70
}
```

**Criteria weights:** Narrative (40%), Structure (25%), Audience Fit (20%), AI Detection (15%)

## Step 3: Improve with OpenCode

Share feedback with OpenCode and ask for targeted fixes:

- "Judges scored aiDetection at 65. Remove all em-dashes, use commas instead."
- "Narrative is 68. Rewrite the opening with a concrete story about a real debugging session."
- "Structure too uniform. Vary paragraph lengths, make sections asymmetric."
- "Add a personal anecdote with specific details - names, dates, what actually happened."

## Step 4: Iterate

Re-run `writeoff judge ./my-post.md`, compare scores, repeat until 88%.

## Example Session

| Iteration | Score | Key Changes |
|-----------|-------|-------------|
| 1 | 71% | Initial draft - weak narrative, 7 em-dashes |
| 2 | 79% | Removed em-dashes, stronger opening hook |
| 3 | 85% | Added debugging anecdote, varied section lengths |
| 4 | 88% | Broke structural patterns, added contrarian take |

## Tips

**Avoid (lowers AI detection score):**
- Em-dashes everywhere
- "Every developer knows..." generalizations
- Perfectly symmetric lists
- "Here's the thing..." openers

**Add (raises scores):**
- Personal anecdotes with specifics
- Asymmetric structure
- Admitted mistakes or lessons learned
- Contrarian opinions
