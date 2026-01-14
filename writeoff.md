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

# Use a file as the *prompt* (backwards compatible behavior)
npm run dev -- generate --input ./prompt.md

# Use a file as a *starting draft* (file content) + provide improvement prompt as CLI arg
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
# Basic
npm run dev -- refine ./post.md --max-iterations 100 --threshold 90

# Keep the best iteration (even if later iterations regress), stop on plateaus, and write diffs
npm run dev -- refine ./post.md --threshold 90 --patience 3 --min-improvement 0.5 --diff
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

## Scoring & Output Rules

- **Computed scoring is authoritative**: Writeoff computes `overallScoreComputed` locally from the five criterion scores + weights and uses that for ranking and flywheel thresholds.
- **Judge-reported overall is diagnostic**: judges still return `overallScore`, but it’s treated as advisory and Writeoff records a warning if it differs materially from the computed value.
- **Strict JSON validation + auto-repair**: if a judge returns malformed JSON or missing criteria, Writeoff retries once with a repair prompt.
- **Partial results are kept**: if some judge calls fail, the run continues and failures are written to `judge-failures.json`.

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

# Reliability knobs
WRITEOFF_MAX_CONCURRENCY=5
WRITEOFF_MAX_RETRIES=2
WRITEOFF_RETRY_BASE_MS=500
WRITEOFF_RETRY_MAX_MS=8000
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
├── prompt.md              # The original prompt
├── posts/
│   ├── gpt-4-1.md         # Each model's generated post
│   ├── gemini-3-flash-preview.md
│   └── kimi-k2.md
├── judgments/             # Raw judgment data (grouped by judge)
├── judge-failures.json    # Optional: any judge errors (partial results still saved)
└── summary.json           # Full session data with scores
```

Refine sessions are saved to `./results/{timestamp}-refine/` and include `iterations/` plus optional `diffs/*.patch` when `--diff` is enabled.

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
# (Provide the improvement prompt as the CLI arg, and pass the draft via --input)
npm run dev -- generate "
Score: 85. Target: 89+

Keep: [what's working]
Improve: [specific changes needed]
" --input ./results/*/posts/winner.md

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
2. **Use `--input` correctly for iterations** - Pass the draft via `--input`, and put improvement instructions in the CLI prompt string
3. **Check `AI Detection` and `Accuracy`** - These are common bottlenecks for “human reader” quality
4. **Add grounded specifics** - timestamps, tools, real constraints, and clearly-labeled hypotheticals
5. **Don’t over-iterate** - use `--patience` / `--min-improvement` to stop when you plateau
6. **Tune reliability** - increase `WRITEOFF_MAX_CONCURRENCY` cautiously; retries help but can increase cost

## Troubleshooting

### "User not found" API errors
Your OpenRouter API key is invalid or expired. Get a new one from openrouter.ai.

### Slow generation
Thinking models (kimi-k2-thinking, gpt-5.2-pro) take longer. Use standard models for faster iteration.

### Low AI Detection scores
Add more human imperfections: typos, sentence fragments, tangents, self-deprecating humor, specific timestamps.

### Parsing errors during judging
Sometimes judges return malformed JSON. Writeoff will retry once with a repair prompt and will record any remaining judge failures in the output artifacts.
