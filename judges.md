# How Writeoff Judges Work

## Judging Criteria & Weights

Each post is evaluated on **5 criteria** with weighted scores:

| Criterion | Weight | What It Measures |
|-----------|--------|------------------|
| **Narrative** | 30% | Flow, storytelling, engagement, transitions, reader interest |
| **Structure** | 20% | Organization, intro/body/conclusion, appropriate length |
| **Audience Fit** | 20% | Tone consistency, entertainment + education balance |
| **Accuracy** | 15% | Grounded, non-misleading claims; avoids invented specifics presented as fact |
| **AI Detection** | 15% | Natural/human feel, penalizes repetitive patterns, generic phrasing, lack of personality |

## Judge System Prompt

From `src/prompts/judge.ts`:

```
You are an expert blog post evaluator. Your job is to critically 
assess blog posts against specific quality criteria.

Be rigorous and honest in your evaluation. A score of 70+ indicates 
good quality, 80+ is excellent, and 90+ is exceptional. Most posts 
should score between 60-80.
```

## Evaluation Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    For Each Post                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│   │ Judge 1  │    │ Judge 2  │    │ Judge 3  │  ...        │
│   │(Gemini)  │    │(Kimi K2) │    │(Claude)  │             │
│   └────┬─────┘    └────┬─────┘    └────┬─────┘             │
│        │               │               │                    │
│        ▼               ▼               ▼                    │
│   ┌─────────────────────────────────────────┐              │
│   │  JSON Response per Judge:               │              │
│   │  {                                      │              │
│   │    scores: [                            │              │
│   │      {criterion: "narrative",           │              │
│   │       score: 88, feedback: "..."},      │              │
│   │      {criterion: "structure", ...},     │              │
│   │      {criterion: "audienceFit", ...},   │              │
│   │      {criterion: "accuracy", ...},      │              │
│   │      {criterion: "aiDetection", ...}    │              │
│   │    ],                                   │              │
│   │    overallScore: 85                     │              │
│   │  }                                      │              │
│   └─────────────────────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Aggregation                              │
├─────────────────────────────────────────────────────────────┤
│  For each criterion:                                        │
│    averageScore = sum(all judge scores) / num_judges        │
│                                                             │
│  Overall weighted average:                                  │
│    = (narrative × 0.30) + (structure × 0.20)               │
│      + (audienceFit × 0.20) + (accuracy × 0.15)            │
│      + (aiDetection × 0.15)                                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Winner Selection                         │
│         Post with highest overallAverage wins               │
└─────────────────────────────────────────────────────────────┘
```

## Key Implementation Details

- **Parallel execution**: All judge×post combinations run concurrently (`src/core/judge.ts:159-187`)
- **JSON parsing**: Handles both raw JSON and markdown code blocks (`src/core/judge.ts:33-83`)
- **Cross-evaluation**: Each judge evaluates ALL posts (prevents self-bias)
- **No self-judging filter**: Currently a model can judge its own output (potential improvement area)

## Example Judgment Output

From iteration 3 of the "Morning Everything Changed" writeoff, Claude Opus 4 received these averaged scores:

| Criterion | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| Narrative | 88/100 | ×0.30 | 26.40 |
| Structure | 87/100 | ×0.20 | 17.40 |
| Audience Fit | 88/100 | ×0.20 | 17.60 |
| Accuracy | 86/100 | ×0.15 | 12.90 |
| AI Detection | 84/100 | ×0.15 | 12.60 |
| **Total** | | | **86.90%** |

## Source Files

- `src/core/judge.ts` - Main judging logic and aggregation
- `src/prompts/judge.ts` - System prompt and user prompt templates
- `src/types/index.ts` - Type definitions and criteria weights
