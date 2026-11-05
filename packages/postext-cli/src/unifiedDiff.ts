// A unified diff of two texts, line by line (`postext import-docx
// --dry-run` prints what it would write). The lines both texts share at
// the start and the end are set aside first; what is left is compared by
// longest common subsequence, or, past a size where that costs too much,
// shown as one replaced block.

const CONTEXT = 3;
/** Cells of the LCS table past which the middle is one replaced block. */
const MAX_CELLS = 4_000_000;

type Op = { kind: ' ' | '-' | '+'; line: string; a: number; b: number };

/** Marks a last line with no newline after it: it then differs from the
 *  same line with one, and is printed with diff's note. */
const NO_EOL = '\u0000';

function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  else lines[lines.length - 1] += NO_EOL;
  return lines;
}

function lineOps(a: string[], b: string[]): Op[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const ops: Op[] = [];
  for (let i = 0; i < start; i++) ops.push({ kind: ' ', line: a[i]!, a: i, b: i });
  const n = endA - start;
  const m = endB - start;
  if (n * m > MAX_CELLS) {
    for (let i = start; i < endA; i++) ops.push({ kind: '-', line: a[i]!, a: i, b: start });
    for (let j = start; j < endB; j++) ops.push({ kind: '+', line: b[j]!, a: endA, b: j });
  } else {
    // lcs[i][j]: common lines of a[start+i..endA) and b[start+j..endB).
    const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i]![j] = a[start + i] === b[start + j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[start + i] === b[start + j]) {
        ops.push({ kind: ' ', line: a[start + i]!, a: start + i, b: start + j });
        i++;
        j++;
      } else if (i < n && (j === m || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
        ops.push({ kind: '-', line: a[start + i]!, a: start + i, b: start + j });
        i++;
      } else {
        ops.push({ kind: '+', line: b[start + j]!, a: start + i, b: start + j });
        j++;
      }
    }
  }
  for (let k = 0; k < a.length - endA; k++) ops.push({ kind: ' ', line: a[endA + k]!, a: endA + k, b: endB + k });
  return ops;
}

/** `before` → `after` as a unified diff under `path` (empty when they are
 *  the same). */
export function unifiedDiff(path: string, before: string, after: string): string {
  if (before === after) return '';
  const ops = lineOps(splitLines(before), splitLines(after));
  const out = [`--- a/${path}`, `+++ b/${path}`];
  let k = 0;
  while (k < ops.length) {
    while (k < ops.length && ops[k]!.kind === ' ') k++;
    if (k >= ops.length) break;
    // A hunk: the changes from here, joined while fewer than twice the
    // context lines stand between them, with the context around.
    const first = Math.max(0, k - CONTEXT);
    let last = k;
    let gap = 0;
    for (let x = k; x < ops.length; x++) {
      if (ops[x]!.kind === ' ') {
        if (++gap > 2 * CONTEXT) break;
      } else {
        gap = 0;
        last = x;
      }
    }
    const end = Math.min(ops.length, last + CONTEXT + 1);
    const slice = ops.slice(first, end);
    const aLen = slice.filter((o) => o.kind !== '+').length;
    const bLen = slice.filter((o) => o.kind !== '-').length;
    const aStart = slice[0]!.a + (aLen ? 1 : 0);
    const bStart = slice[0]!.b + (bLen ? 1 : 0);
    out.push(`@@ -${aStart},${aLen} +${bStart},${bLen} @@`);
    for (const o of slice) {
      if (o.line.endsWith(NO_EOL)) out.push(`${o.kind}${o.line.slice(0, -1)}`, '\\ No newline at end of file');
      else out.push(`${o.kind}${o.line}`);
    }
    k = end;
  }
  return out.join('\n') + '\n';
}
