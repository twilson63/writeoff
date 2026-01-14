import test from 'node:test';
import assert from 'node:assert/strict';

import { unifiedDiff } from '../dist/utils/diff.js';

test('unifiedDiff returns empty string when no changes', () => {
  assert.equal(unifiedDiff('a\n', 'a\n'), '');
});

test('unifiedDiff produces a unified patch for changes', () => {
  const patch = unifiedDiff('a\nb\n', 'a\nc\n', { fromFile: 'old', toFile: 'new', context: 1 });
  assert.ok(patch.includes('--- old'));
  assert.ok(patch.includes('+++ new'));
  assert.ok(patch.includes('-b'));
  assert.ok(patch.includes('+c'));
});
