/**
 * Minimal unified diff generator for CLI output.
 * Implements a Myers diff over lines and renders unified hunks.
 */

export interface UnifiedDiffOptions {
  fromFile?: string;
  toFile?: string;
  context?: number;
}

type Edit = { type: 'equal' | 'insert' | 'delete'; line: string };

function splitLines(text: string): string[] {
  // Preserve final empty line semantics: treat trailing newline as trailing empty line.
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return lines;
}

function myersDiff(a: string[], b: string[]): Edit[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const v = new Map<number, number>();
  v.set(1, 0);
  const trace: Array<Map<number, number>> = [];

  for (let d = 0; d <= max; d++) {
    const vCopy = new Map<number, number>(v);
    trace.push(vCopy);

    for (let k = -d; k <= d; k += 2) {
      const down = k === -d;
      const up = k === d;

      const kPlus = v.get(k + 1);
      const kMinus = v.get(k - 1);

      let x: number;
      if (down || (!up && (kMinus ?? -1) < (kPlus ?? -1))) {
        x = kPlus ?? 0;
      } else {
        x = (kMinus ?? 0) + 1;
      }

      let y = x - k;

      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }

      v.set(k, x);

      if (x >= n && y >= m) {
        return backtrack(trace, a, b);
      }
    }
  }

  return [];
}

function backtrack(trace: Array<Map<number, number>>, a: string[], b: string[]): Edit[] {
  const edits: Edit[] = [];
  let x = a.length;
  let y = b.length;

  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;

    const down = k === -d;
    const up = k === d;

    const kPlus = v.get(k + 1);
    const kMinus = v.get(k - 1);

    let prevK: number;
    if (down || (!up && (kMinus ?? -1) < (kPlus ?? -1))) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = v.get(prevK) ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      edits.push({ type: 'equal', line: a[x - 1] });
      x--;
      y--;
    }

    if (d === 0) break;

    if (x === prevX) {
      // insertion
      edits.push({ type: 'insert', line: b[y - 1] });
      y--;
    } else {
      // deletion
      edits.push({ type: 'delete', line: a[x - 1] });
      x--;
    }
  }

  edits.reverse();
  return edits;
}

function formatRange(startLine: number, length: number): string {
  if (length === 0) return `${startLine},0`;
  if (length === 1) return `${startLine}`;
  return `${startLine},${length}`;
}

export function unifiedDiff(oldText: string, newText: string, opts: UnifiedDiffOptions = {}): string {
  const fromFile = opts.fromFile ?? 'a';
  const toFile = opts.toFile ?? 'b';
  const context = opts.context ?? 3;

  const a = splitLines(oldText);
  const b = splitLines(newText);

  const edits = myersDiff(a, b);
  const hasChanges = edits.some((e) => e.type !== 'equal');
  if (!hasChanges) return '';

  // Build hunks.
  type HunkLine = { prefix: ' ' | '+' | '-'; line: string };
  type Hunk = {
    oldStart: number;
    oldLen: number;
    newStart: number;
    newLen: number;
    lines: HunkLine[];
  };

  const hunks: Hunk[] = [];

  let oldLine = 1;
  let newLine = 1;

  // Collect change indices.
  const changeIndices: number[] = [];
  for (let i = 0; i < edits.length; i++) {
    if (edits[i].type !== 'equal') changeIndices.push(i);
  }

  let idx = 0;
  while (idx < changeIndices.length) {
    const firstChange = changeIndices[idx];
    let lastChange = firstChange;

    // Expand contiguous changes (with small equal gaps inside) into one hunk.
    while (idx + 1 < changeIndices.length && changeIndices[idx + 1] <= lastChange + 1) {
      idx++;
      lastChange = changeIndices[idx];
    }

    const hunkStart = Math.max(0, firstChange - context);
    const hunkEnd = Math.min(edits.length - 1, lastChange + context);

    // Determine old/new start lines by replaying edits up to hunkStart.
    oldLine = 1;
    newLine = 1;
    for (let i = 0; i < hunkStart; i++) {
      const e = edits[i];
      if (e.type === 'equal' || e.type === 'delete') oldLine++;
      if (e.type === 'equal' || e.type === 'insert') newLine++;
    }

    const oldStart = oldLine;
    const newStart = newLine;

    const lines: HunkLine[] = [];
    let oldLen = 0;
    let newLen = 0;

    for (let i = hunkStart; i <= hunkEnd; i++) {
      const e = edits[i];
      if (e.type === 'equal') {
        lines.push({ prefix: ' ', line: e.line });
        oldLen++;
        newLen++;
      } else if (e.type === 'delete') {
        lines.push({ prefix: '-', line: e.line });
        oldLen++;
      } else {
        lines.push({ prefix: '+', line: e.line });
        newLen++;
      }
    }

    hunks.push({ oldStart, oldLen, newStart, newLen, lines });

    idx++;
  }

  // Render.
  let out = '';
  out += `--- ${fromFile}\n`;
  out += `+++ ${toFile}\n`;
  for (const hunk of hunks) {
    out += `@@ -${formatRange(hunk.oldStart, hunk.oldLen)} +${formatRange(hunk.newStart, hunk.newLen)} @@\n`;
    for (const l of hunk.lines) {
      out += `${l.prefix}${l.line}\n`;
    }
  }

  return out;
}
