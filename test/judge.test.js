import test from 'node:test';
import assert from 'node:assert/strict';

import { parseJudgmentResponse, computeOverallFromScores } from '../dist/core/judge.js';

const judgeModel = { provider: 'openrouter', modelId: 'openai/gpt-x', friendlyName: 'Judge' };

test('parseJudgmentResponse validates and computes overallScoreComputed', () => {
  const response = JSON.stringify({
    scores: [
      { criterion: 'narrative', score: 80, feedback: 'ok' },
      { criterion: 'structure', score: 70, feedback: 'ok' },
      { criterion: 'audienceFit', score: 60, feedback: 'ok' },
      { criterion: 'accuracy', score: 90, feedback: 'ok' },
      { criterion: 'aiDetection', score: 50, feedback: 'ok' },
    ],
    overallScore: 70,
  });

  const judgment = parseJudgmentResponse(response, judgeModel, 'post-1');

  assert.equal(judgment.postModelId, 'post-1');
  assert.equal(judgment.scores.length, 5);

  const computed = computeOverallFromScores(judgment.scores);
  assert.ok(Math.abs(judgment.overallScoreComputed - computed) < 1e-9);
});

test('parseJudgmentResponse rejects missing criteria', () => {
  const response = JSON.stringify({
    scores: [
      { criterion: 'narrative', score: 80, feedback: 'ok' },
      { criterion: 'structure', score: 70, feedback: 'ok' },
      { criterion: 'audienceFit', score: 60, feedback: 'ok' },
      { criterion: 'aiDetection', score: 50, feedback: 'ok' },
    ],
    overallScore: 70,
  });

  assert.throws(() => parseJudgmentResponse(response, judgeModel, 'post-1'), /missing criterion/i);
});
