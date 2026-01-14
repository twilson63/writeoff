# Writeoff - LLM Writing Benchmark CLI

Writeoff is a CLI tool that benchmarks LLM writing capabilities by generating blog posts from multiple models and having LLM judges evaluate them.

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add your OPENROUTER_API_KEY to .env

# Run a writing competition
npm run dev -- generate "Write a blog post about [your topic]"
```

## How It Works

1. **Generate** - Multiple LLMs write blog posts from the same prompt in parallel
2. **Judge** - Each post is evaluated by multiple LLM judges on five weighted criteria
3. **Rank** - Scores are aggregated and a winner is declared with an ASCII summary

## Commands

### Generate (Main Command)

Run a full writing competition with generation and judging:

```bash
# Basic usage
npm run dev -- generate "Your prompt here"

# With input file + prompt (use file as starting draft)
npm run dev -- generate "Improve this post to be more narrative" --input ./existing-post.md

# Override models
npm run dev -- generate --writers "openrouter:openai/gpt-4.1,openrouter:google/gemini-3-flash-preview" "Your prompt"
```

### Judge (Standalone)

Judge an existing markdown file:

```bash
npm run dev -- judge ./my-post.md
```

### Refine (Flywheel)

Iteratively improve a post until it hits a score threshold:

```bash
npm run dev -- refine ./post.md --max-iterations 100 --threshold 90
```

## Judging Criteria

Posts are scored on five weighted criteria:

| Criterion | Weight | What It Measures |
|-----------|--------|------------------|
| **Narrative** | 30% | Flow, storytelling, engagement, emotional beats |
| **Structure** | 20% | Organization, headings, transitions, length |
| **Audience Fit** | 20% | Tone, jargon usage, knowledge level assumptions |
| **Accuracy** | 15% | Grounded, non-misleading claims; avoids invented specifics presented as fact |
| **AI Detection** | 15% | Penalizes robotic patterns, cliches, over-polish |

## Environment Configuration

Edit `.env` to configure:

```bash
# Required: OpenRouter API key
OPENROUTER_API_KEY=sk-or-v1-xxx

# Optional: Direct Anthropic access
ANTHROPIC_API_KEY=sk-ant-xxx

# Writer models (comma-separated)
WRITER_MODELS=openrouter:google/gemini-3-flash-preview,openrouter:moonshotai/kimi-k2,openrouter:openai/gpt-4.1

# Judge models (can be same or different)
JUDGE_MODELS=openrouter:google/gemini-3-flash-preview,openrouter:moonshotai/kimi-k2,openrouter:openai/gpt-4.1
```

### Model Format

Models are specified as `provider:model-id`:
- `openrouter:google/gemini-3-flash-preview`
- `openrouter:openai/gpt-4.1`
- `openrouter:moonshotai/kimi-k2`
- `openrouter:moonshotai/kimi-k2-thinking` (slower, deeper reasoning)
- `anthropic:claude-opus-4-0520` (requires ANTHROPIC_API_KEY)

## Output

Results are saved to `./results/{timestamp}/`:

```
results/20260106-123456/
├── prompt.md           # The original prompt
├── posts/
│   ├── gpt-4-1.md      # Each model's generated post
│   ├── gemini-3-flash-preview.md
│   └── kimi-k2.md
├── judgments/          # Raw judgment data
└── summary.json        # Full session data with scores
```

## Iteration Strategy for Higher Scores

Based on extensive testing, here's how to push scores from ~85 to 89+:

### What Improves Scores

1. **Add specific failures/mistakes** - Characters making embarrassing errors feels human
2. **Include real dialogue** - Actual quotes, not summarized conversations
3. **Use concrete numbers** - "47 messages at 2am" not "many messages late at night"
4. **Break rigid structures** - Avoid "Week 1, Week 2, Week 3" patterns
5. **Add character quirks** - Names, specific tools, coffee preferences
6. **Show emotional moments** - Doubt, frustration, breakthrough feelings

### What Hurts Scores (AI Detection)

1. **Aphorisms** - "Trust is built on reasons" screams AI
2. **Perfect parallel structures** - "First... Second... Third..."
3. **Over-polished prose** - Every sentence perfectly balanced
4. **Neat resolutions** - Real blog posts have rough edges
5. **Generic examples** - "a large company" vs "a $10B public company"

### Iteration Workflow

```bash
# 1. Generate initial posts
npm run dev -- generate "Your detailed prompt"

# 2. Check the winner and scores
cat results/*/summary.json | jq '.results[0]'

# 3. Iterate with the winning post as input
npm run dev -- generate --input ./results/*/posts/winner.md "
Score: 85. Target: 89+

Keep: [what's working]
Improve: [specific changes needed]
"

# 4. Repeat until scores plateau (usually around 88-90)
```

### Practical Score Ceiling

- **85-87**: Achievable with good prompts
- **88-89**: Requires 2-3 iterations with specific feedback
- **89.7**: Our highest achieved score
- **90+**: Extremely difficult for pure LLM output; may require human editing

The main blocker is always **AI Detection**. LLMs struggle to write content that doesn't feel like LLM content, even when explicitly prompted to add imperfections.

## Example Prompts That Work Well

### Narrative-Driven (Best for High Scores)

```
Write a blog post about [topic].

Follow [character name]'s journey from [starting state] to [ending state].
Include:
- A specific inciting incident with dialogue
- At least one embarrassing failure
- Concrete numbers and tool names
- Emotional moments of doubt and breakthrough

Make it feel like a real person wrote this at 10pm sharing their genuine experience.
```

### Hot Take Style

```
Write a blog post based on this hot take: "[provocative statement]"

Context: [background information]

Cover:
1. [Theme 1]
2. [Theme 2]
3. [Theme 3]

Tone: Direct, honest about risks, but ultimately optimistic and actionable.
```

## Publishing to ZenBin

After generating a winning post, publish it:

```bash
# Create styled HTML (see existing publish-*.html files for templates)
# Then publish:
cat my-post.html | base64 | tr -d '\n' > post_b64.txt
curl -X POST https://zenbin.onrender.com/v1/pages/my-post-slug \
  -H "Content-Type: application/json" \
  -d "{\"encoding\": \"base64\", \"html\": \"$(cat post_b64.txt)\", \"title\": \"My Post Title\"}"
```

## Project Structure

```
src/
├── index.ts                 # CLI entry point
├── config/
│   ├── env.ts              # Environment loading
│   └── models.ts           # Model ID mappings
├── core/
│   ├── writer.ts           # Post generation (parallel)
│   ├── judge.ts            # Post evaluation (parallel)
│   └── flywheel.ts         # Iterative refinement
├── providers/
│   └── ai.ts               # Vercel AI SDK setup
├── cli/
│   ├── commands/
│   │   ├── generate.ts     # Main command
│   │   ├── judge.ts        # Judge-only
│   │   └── refine.ts       # Flywheel
│   ├── progress.ts         # Progress bars
│   └── summary.ts          # ASCII output
├── prompts/
│   ├── writer.ts           # Writer system prompt
│   └── judge.ts            # Judge system prompt
└── types/
    └── index.ts            # TypeScript interfaces
```

## Tips for Agents

1. **Start with a detailed prompt** - More context = better posts
2. **Use --input for iterations** - Feed the winning post back in with improvement instructions
3. **Check AI Detection score** - This is usually the bottleneck
4. **Add specifics in iteration prompts** - "Add a timestamp like 'at 2:47 PM'" works better than "add more details"
5. **Don't over-iterate** - Scores plateau around 88-90; diminishing returns after 3-4 iterations
6. **Save good posts** - The results folder has all generated content

## Troubleshooting

### "User not found" API errors
Your OpenRouter API key is invalid or expired. Get a new one from openrouter.ai.

### Slow generation
Thinking models (kimi-k2-thinking, gpt-5.2-pro) take longer. Use standard models for faster iteration.

### Low AI Detection scores
Add more human imperfections: typos, sentence fragments, tangents, self-deprecating humor, specific timestamps.

### Parsing errors during judging
Sometimes judges return malformed JSON. Writeoff will retry once with a repair prompt and will record any remaining judge failures in the output artifacts.
