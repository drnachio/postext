// Myers' O(ND) difference (1986) between two strings, per UTF-16 code
// unit: the changed regions as hunks. A block with many changes falls back
// to words, then lines, so a rewritten chapter costs no more than a few
// thousand steps; the hunks of a coarse pass are refined per character
// when they are small.

/** A changed region: `a[a0, a1)` became `b[b0, b1)`. Outside the hunks the
 *  two strings are equal, character for character. */
export interface Hunk {
  a0: number;
  a1: number;
  b0: number;
  b1: number;
}

/** Edit distance a character pass may reach before the coarser fallback. */
const MAX_D = 1200;

/** Myers' greedy forward search over token ids; null past `maxD`. */
function myers(a: ArrayLike<number>, b: ArrayLike<number>, maxD: number): Hunk[] | null {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, maxD);
  const offset = max + 1;
  let v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    const next = v.slice();
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      next[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
    v = next;
    if (found >= 0) break;
  }
  if (found < 0) return null;
  // Walk back through the snapshots: each step is one insertion or deletion
  // after a (possibly empty) diagonal of equal tokens.
  const steps: { x: number; y: number; px: number; py: number }[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const snap = trace[d]!; // V before step d, indices k + d + 1
    const at = (k: number): number => snap[k + d + 1]!;
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const pk = down ? k + 1 : k - 1;
    const px = at(pk);
    const py = px - pk;
    steps.push({ x, y, px, py });
    x = px;
    y = py;
  }
  const hunks: Hunk[] = [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const { px, py, x: sx, y: sy } = steps[i]!;
    // The step itself is (px, py) → (px + 1, py) or (px, py + 1); the rest
    // up to (sx, sy) is the diagonal.
    const del = sx - sy > px - py;
    const ha0 = px;
    const hb0 = py;
    const ha1 = del ? px + 1 : px;
    const hb1 = del ? py : py + 1;
    const last = hunks[hunks.length - 1];
    if (last && last.a1 === ha0 && last.b1 === hb0) {
      last.a1 = ha1;
      last.b1 = hb1;
    } else hunks.push({ a0: ha0, a1: ha1, b0: hb0, b1: hb1 });
  }
  return hunks;
}

function codes(s: string): Uint16Array {
  const out = new Uint16Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Words, runs of spaces and single punctuation marks (or lines). */
function tokenize(s: string, lines: boolean): string[] {
  return lines ? s.match(/[^\n]*\n|[^\n]+$/g) ?? [] : s.match(/\s+|[\p{L}\p{N}\p{M}]+|[^\s\p{L}\p{N}\p{M}]/gu) ?? [];
}

function tokenDiff(a: string, b: string, lines: boolean, maxD: number): Hunk[] | null {
  const ta = tokenize(a, lines);
  const tb = tokenize(b, lines);
  const ids = new Map<string, number>();
  const id = (t: string): number => {
    let v = ids.get(t);
    if (v === undefined) ids.set(t, (v = ids.size));
    return v;
  };
  const hunks = myers(ta.map(id), tb.map(id), maxD);
  if (!hunks) return null;
  // Token indices → character offsets.
  const posA = [0];
  for (const t of ta) posA.push(posA[posA.length - 1]! + t.length);
  const posB = [0];
  for (const t of tb) posB.push(posB[posB.length - 1]! + t.length);
  const out: Hunk[] = [];
  for (const h of hunks) {
    const a0 = posA[h.a0]!, a1 = posA[h.a1]!, b0 = posB[h.b0]!, b1 = posB[h.b1]!;
    // Refine small hunks to characters (a corrected letter in a word).
    const fine = a1 - a0 + b1 - b0 <= 4 * MAX_D ? myers(codes(a.slice(a0, a1)), codes(b.slice(b0, b1)), MAX_D) : null;
    if (fine) for (const f of fine) out.push({ a0: a0 + f.a0, a1: a0 + f.a1, b0: b0 + f.b0, b1: b0 + f.b1 });
    else out.push({ a0, a1, b0, b1 });
  }
  return out;
}

/** The hunks that turn `a` into `b`, in order. Empty when equal. */
export function diffText(a: string, b: string): Hunk[] {
  if (a === b) return [];
  let pre = 0;
  const lim = Math.min(a.length, b.length);
  while (pre < lim && a.charCodeAt(pre) === b.charCodeAt(pre)) pre++;
  let suf = 0;
  while (suf < lim - pre && a.charCodeAt(a.length - 1 - suf) === b.charCodeAt(b.length - 1 - suf)) suf++;
  const ma = a.slice(pre, a.length - suf);
  const mb = b.slice(pre, b.length - suf);
  const inner =
    (!ma.length || !mb.length ? [{ a0: 0, a1: ma.length, b0: 0, b1: mb.length }] : null) ??
    myers(codes(ma), codes(mb), MAX_D) ??
    tokenDiff(ma, mb, false, MAX_D) ??
    tokenDiff(ma, mb, true, MAX_D) ?? [{ a0: 0, a1: ma.length, b0: 0, b1: mb.length }];
  return inner.map((h) => ({ a0: h.a0 + pre, a1: h.a1 + pre, b0: h.b0 + pre, b1: h.b1 + pre }));
}

/** The position in `b` of position `i` of `a` (a hunk maps to its start). */
export function mapThrough(hunks: readonly Hunk[], i: number): number {
  let delta = 0;
  for (const h of hunks) {
    if (h.a0 >= i && !(h.a0 === i && h.a1 === i)) break;
    if (i < h.a1) return h.b0;
    delta = h.b1 - h.a1;
  }
  return i + delta;
}

/** Apply hunks of `a → b` to `a` (tests and sanity checks). */
export function applyHunks(a: string, b: string, hunks: readonly Hunk[]): string {
  let out = '';
  let pos = 0;
  for (const h of hunks) {
    out += a.slice(pos, h.a0) + b.slice(h.b0, h.b1);
    pos = h.a1;
  }
  return out + a.slice(pos);
}
