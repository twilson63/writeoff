# Writeoff

A CLI tool that benchmarks LLM writing capabilities by generating blog posts from multiple models and having LLM judges evaluate them.

## Overview

Writeoff pits multiple LLMs against each other in a writing competition. Given a prompt, it:

1. **Generates** blog posts from multiple writer models in parallel
2. **Judges** each post using multiple judge models
3. **Aggregates** scores across judges and declares a winner

This creates a "writeoff" where you can compare how different models handle creative writing tasks and see which produces the most compelling content.

## Installation

```bash
npm install
npm run build
```

## Configuration

Create a `.env` file with your API keys:

```bash
# Required: At least one of these
OPENROUTER_API_KEY=your-openrouter-key
ANTHROPIC_API_KEY=your-anthropic-key

# Optional: Override default models
WRITER_MODELS=openrouter:openai/gpt-5.2,openrouter:anthropic/claude-opus-4.5
JUDGE_MODELS=openrouter:openai/gpt-5.2,openrouter:moonshotai/kimi-k2-thinking

# Optional: Reliability knobs
WRITEOFF_MAX_CONCURRENCY=5
WRITEOFF_MAX_RETRIES=2
```

## Usage

### Generate and Judge Posts

```bash
# From a prompt
writeoff generate "Write a blog post about the future of remote work"

# From a markdown file (treat file as the prompt)
writeoff generate --input ./prompt.md

# With a starting draft (treat file as existing content)
writeoff generate "Improve this draft to be more narrative" --input ./draft.md

# With custom models
writeoff generate "Your prompt" \
  --writers "openrouter:openai/gpt-5.2,openrouter:anthropic/claude-opus-4.5" \
  --judges "openrouter:google/gemini-3-flash-preview"

# Specify output directory
writeoff generate "Your prompt" --output ./my-results
```

### Judge an Existing Post

```bash
writeoff judge ./path/to/post.md
```

### Refine a Post

```bash
writeoff refine ./path/to/post.md
```

## Judging Criteria

Posts are evaluated on five criteria with weighted scoring:

| Criterion | Weight | Description |
|-----------|--------|-------------|
| **Narrative Flow** | 30% | Compelling story, smooth transitions, maintains reader interest |
| **Structure** | 20% | Clear organization, proper introduction/body/conclusion |
| **Audience Fit** | 20% | Appropriate tone, educational yet entertaining |
| **Accuracy** | 15% | Grounded, non-misleading claims; avoid invented specifics presented as fact |
| **AI Detection** | 15% | Natural, human-like writing without AI patterns |

### AI Detection Signals

The judge specifically looks for common AI writing patterns:

- Excessive em dashes
- Sweeping generalizations ("Every founder knows...")
- Phrase-turning and clever reversals
- Section opener cliches ("Here's the thing...")
- Structural uniformity (perfectly symmetrical lists)
- Terseness without transitions
- Generic motivational closings

And rewards human writing signals:

- Admitted mistakes with real specifics
- Numbers with measurement context
- Contrarian takes
- Personal anecdotes with concrete details
- Asymmetric structure
- Organic transitions

## Output

Results are saved to `./results/<session-id>/`:

```
results/
  20260108-205910/
    prompt.md           # Original prompt
    posts/
      gpt-5-2.md        # Generated posts
      claude-opus-4-5.md
    judgments/
      gpt-5-2.json      # Judgments by each judge
      kimi-k2-thinking.json
    summary.json        # Aggregated results and winner
```

## Supported Providers

- **OpenRouter** - Access to multiple models via single API
- **Anthropic** - Direct Claude API access

## Model Format

Models are specified as `provider:model-id`:

```
openrouter:openai/gpt-5.2
openrouter:anthropic/claude-opus-4.5
openrouter:google/gemini-3-flash-preview
openrouter:moonshotai/kimi-k2-thinking
anthropic:claude-opus-4-0520
```

## License

MIT
