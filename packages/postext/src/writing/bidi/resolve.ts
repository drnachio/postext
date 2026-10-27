// Rules X1–X10, W1–W7, N0–N2 and I1–I2: the embedding levels of a
// paragraph's classes, one isolating run sequence at a time.
import { isIsolateInitiator, LRE, LRO, RLE, RLO, PDF, LRI, RLI, FSI, PDI, L, R, AL, BN, B, MAX_DEPTH, TAIL, isRemoved, EN, AN, S, WS, ON, ES, ET, CS, NSM, bracketOpen, bracketTables, canonicalBracket, bracketClose } from './chars.js';

/**
 * The algorithm proper, on class codes. `text` (with `map` from class
 * positions to text positions, `-1` for a virtual control) gives the code
 * units the paired-bracket rule reads; without it no bracket pairs.
 * @internal Exported for the conformance tests (`BidiTest.txt` lists
 * classes, not characters).
 */
export function resolveClasses(
  cls: Uint8Array,
  baseLevel: number,
  text: string | null,
  map: Int32Array | null,
  /** {@link BidiOptions.arabicNumbers}. */
  arabicLead = false,
): { levels: Uint8Array; paragraphLevel: number } {
  const n = cls.length;
  const types = new Uint8Array(cls);
  const levels = new Uint8Array(n);

  // BD9: the PDI matching each isolate initiator, and the reverse.
  const matchPdi = new Int32Array(n).fill(-1);
  const matchInit = new Int32Array(n).fill(-1);
  {
    const stack = new Int32Array(n);
    let sp = 0;
    for (let i = 0; i < n; i++) {
      const c = cls[i]!;
      if (isIsolateInitiator(c)) stack[sp++] = i;
      else if (c === PDI && sp > 0) {
        const j = stack[--sp]!;
        matchPdi[j] = i;
        matchInit[i] = j;
      } else if (c === B) sp = 0;
    }
  }

  // P2–P3: the first strong letter outside isolates, from `from` to `to`.
  const firstStrong = (from: number, to: number): number => {
    for (let i = from; i < to; i++) {
      const c = cls[i]!;
      if (c === L) return 0;
      if (c === R || c === AL) return 1;
      if (isIsolateInitiator(c)) {
        if (matchPdi[i]! < 0) return -1;
        i = matchPdi[i]!;
      } else if (c === B) return -1;
    }
    return -1;
  };
  const paragraphLevel = baseLevel >= 0 ? baseLevel : firstStrong(0, n) === 1 ? 1 : 0;

  // X1–X8: explicit levels and directions.
  const stLevel = new Uint8Array(MAX_DEPTH + 2);
  const stOverride = new Uint8Array(MAX_DEPTH + 2); // 0 none, else L + 1 or R + 1
  const stIsolate = new Uint8Array(MAX_DEPTH + 2);
  let sp = 1;
  stLevel[0] = paragraphLevel;
  let overflowIsolates = 0;
  let overflowEmbeddings = 0;
  let validIsolates = 0;
  for (let i = 0; i < n; i++) {
    const c = cls[i]!;
    switch (c) {
      case RLE: case LRE: case RLO: case LRO: {
        const cur = stLevel[sp - 1]!;
        const next = c === RLE || c === RLO ? (cur + 1) | 1 : (cur + 2) & ~1;
        if (next <= MAX_DEPTH && overflowIsolates === 0 && overflowEmbeddings === 0) {
          stLevel[sp] = next;
          stOverride[sp] = c === LRO ? L + 1 : c === RLO ? R + 1 : 0;
          stIsolate[sp++] = 0;
        } else if (overflowIsolates === 0) overflowEmbeddings++;
        levels[i] = stLevel[sp - 1]!;
        break;
      }
      case RLI: case LRI: case FSI: {
        levels[i] = stLevel[sp - 1]!;
        if (stOverride[sp - 1]) types[i] = stOverride[sp - 1]! - 1;
        const rtl = c === RLI || (c === FSI && firstStrong(i + 1, matchPdi[i]! >= 0 ? matchPdi[i]! : n) === 1);
        const cur = stLevel[sp - 1]!;
        const next = rtl ? (cur + 1) | 1 : (cur + 2) & ~1;
        if (next <= MAX_DEPTH && overflowIsolates === 0 && overflowEmbeddings === 0) {
          validIsolates++;
          stLevel[sp] = next;
          stOverride[sp] = 0;
          stIsolate[sp++] = 1;
        } else overflowIsolates++;
        break;
      }
      case PDI:
        if (overflowIsolates > 0) overflowIsolates--;
        else if (validIsolates > 0) {
          overflowEmbeddings = 0;
          while (!stIsolate[sp - 1]) sp--;
          sp--;
          validIsolates--;
        }
        levels[i] = stLevel[sp - 1]!;
        if (stOverride[sp - 1]) types[i] = stOverride[sp - 1]! - 1;
        break;
      case PDF:
        if (overflowIsolates === 0) {
          if (overflowEmbeddings > 0) overflowEmbeddings--;
          else if (!stIsolate[sp - 1] && sp >= 2) sp--;
        }
        levels[i] = stLevel[sp - 1]!;
        break;
      case B:
        // X8: a paragraph separator ends every embedding.
        levels[i] = paragraphLevel;
        sp = 1;
        overflowIsolates = overflowEmbeddings = validIsolates = 0;
        break;
      case BN: case TAIL:
        levels[i] = stLevel[sp - 1]!;
        break;
      default:
        levels[i] = stLevel[sp - 1]!;
        if (stOverride[sp - 1]) types[i] = stOverride[sp - 1]! - 1;
    }
  }

  // The explicit levels, kept: the sequences below read their neighbours'
  // levels before the implicit rules change them.
  const explicit = levels.slice();

  // X9: the characters the rest of the algorithm sees.
  const kept = new Int32Array(n);
  let m = 0;
  for (let i = 0; i < n; i++) if (!isRemoved(cls[i]!)) kept[m++] = i;

  // X10: level runs, chained into isolating run sequences across isolates.
  const runStart: number[] = [];
  for (let k = 0; k < m; k++) if (k === 0 || explicit[kept[k]!] !== explicit[kept[k - 1]!]) runStart.push(k);
  const runCount = runStart.length;
  const runOfFirst = new Int32Array(n).fill(-1);
  for (let r = 0; r < runCount; r++) runOfFirst[kept[runStart[r]!]!] = r;
  const runEnd = (r: number): number => (r + 1 < runCount ? runStart[r + 1]! : m);

  const seq = new Int32Array(m);
  let brackets: BracketScratch | null = null;
  // Runs already chained into an earlier sequence (opened by a matched PDI).
  const chained = new Uint8Array(runCount);
  for (let r = 0; r < runCount; r++) {
    if (chained[r]) continue;
    let len = 0;
    let run = r;
    for (;;) {
      const end = runEnd(run);
      for (let k = runStart[run]!; k < end; k++) seq[len++] = kept[k]!;
      const last = kept[end - 1]!;
      if (!isIsolateInitiator(cls[last]!) || matchPdi[last]! < 0) break;
      const next = runOfFirst[matchPdi[last]!]!;
      if (next < 0) break;
      chained[next] = 1;
      run = next;
    }
    const level = explicit[seq[0]!]!;
    const firstK = keptIndexOf(kept, m, seq[0]!);
    const before = firstK > 0 ? explicit[kept[firstK - 1]!]! : paragraphLevel;
    const last = seq[len - 1]!;
    let after = paragraphLevel;
    if (!isIsolateInitiator(cls[last]!)) {
      const lastK = keptIndexOf(kept, m, last);
      if (lastK + 1 < m) after = explicit[kept[lastK + 1]!]!;
    }
    const sos = Math.max(before, level) & 1 ? R : L;
    const eos = Math.max(after, level) & 1 ? R : L;
    if (text !== null && !brackets) brackets = { open: new Int32Array(63), want: new Int32Array(63), pairs: [] };
    resolveSequence(seq, len, level, sos, eos, cls, types, levels, text, map, brackets, arabicLead);
  }

  // Removed characters take the level of the character before them.
  for (let i = 0; i < n; i++) if (isRemoved(cls[i]!)) levels[i] = i > 0 ? levels[i - 1]! : paragraphLevel;
  return { levels, paragraphLevel };
}

/** The position of character `i` among the kept ones (binary search). */
function keptIndexOf(kept: Int32Array, m: number, i: number): number {
  let lo = 0;
  let hi = m - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = kept[mid]!;
    if (v < i) lo = mid + 1;
    else if (v > i) hi = mid - 1;
    else return mid;
  }
  return -1;
}

/** Scratch space of rule N0, reused across the sequences of a paragraph. */
interface BracketScratch {
  open: Int32Array;
  want: Int32Array;
  pairs: number[];
}

/** The direction a resolved type counts as in N0–N1: `EN` and `AN` as `R`;
 *  -1 for a neutral. */
function strongOf(t: number): number {
  if (t === L) return L;
  if (t === R || t === EN || t === AN) return R;
  return -1;
}

const isNeutralOrIsolate = (t: number): boolean =>
  t === B || t === S || t === WS || t === ON || t === LRI || t === RLI || t === FSI || t === PDI;

/** Rules W1–I2 on one isolating run sequence (`seq[0..len)`, text
 *  positions in order). */
function resolveSequence(
  seq: Int32Array,
  len: number,
  level: number,
  sos: number,
  eos: number,
  cls: Uint8Array,
  types: Uint8Array,
  levels: Uint8Array,
  text: string | null,
  map: Int32Array | null,
  brackets: BracketScratch | null,
  arabicLead = false,
): void {
  // W1: marks take the type of what they follow.
  for (let k = 0; k < len; k++) {
    const i = seq[k]!;
    if (types[i] !== NSM) continue;
    if (k === 0) types[i] = sos;
    else {
      const prev = types[seq[k - 1]!]!;
      types[i] = prev === LRI || prev === RLI || prev === FSI || prev === PDI ? ON : prev;
    }
  }
  // W2–W3: European digits after Arabic letters are Arabic; AL is R.
  let strong = sos;
  // In an Arabic-script document (`BidiOptions.arabicNumbers`, #665) the
  // digits that open a right-to-left sequence are read as the ones after
  // its letters: as if an Arabic letter came before them.
  if (arabicLead && sos === R) strong = AL;
  for (let k = 0; k < len; k++) {
    const i = seq[k]!;
    const t = types[i]!;
    if (t === L || t === R || t === AL) strong = t;
    else if (t === EN && strong === AL) types[i] = AN;
  }
  for (let k = 0; k < len; k++) if (types[seq[k]!] === AL) types[seq[k]!] = R;
  // W4: one separator between two numbers of a kind joins them.
  for (let k = 1; k + 1 < len; k++) {
    const i = seq[k]!;
    const t = types[i]!;
    if (t !== ES && t !== CS) continue;
    const prev = types[seq[k - 1]!]!;
    const next = types[seq[k + 1]!]!;
    if (prev === EN && next === EN) types[i] = EN;
    else if (t === CS && prev === AN && next === AN) types[i] = AN;
  }
  // W5: terminators next to European digits are digits.
  for (let k = 0; k < len; k++) {
    if (types[seq[k]!] !== ET) continue;
    let e = k;
    while (e < len && types[seq[e]!] === ET) e++;
    if ((k > 0 && types[seq[k - 1]!] === EN) || (e < len && types[seq[e]!] === EN)) {
      for (let j = k; j < e; j++) types[seq[j]!] = EN;
    }
    k = e - 1;
  }
  // W6: other separators and terminators are neutral.
  for (let k = 0; k < len; k++) {
    const t = types[seq[k]!]!;
    if (t === ES || t === ET || t === CS) types[seq[k]!] = ON;
  }
  // W7: European digits in left-to-right context are L.
  strong = sos;
  for (let k = 0; k < len; k++) {
    const i = seq[k]!;
    const t = types[i]!;
    if (t === L || t === R) strong = t;
    else if (t === EN && strong === L) types[i] = L;
  }

  const embedding = level & 1 ? R : L;

  // N0: paired brackets take the direction of what they enclose.
  if (text !== null && brackets) {
    if (!bracketOpen) bracketTables();
    const { open, want, pairs } = brackets;
    pairs.length = 0;
    let sp = 0;
    for (let k = 0; k < len; k++) {
      const i = seq[k]!;
      if (types[i] !== ON) continue;
      const at = map ? map[i]! : i;
      if (at < 0) continue;
      const cp = text.charCodeAt(at);
      const closing = bracketOpen!.get(cp);
      if (closing !== undefined) {
        if (sp === 63) break; // BD16: stack full, no more pairs.
        open[sp] = k;
        want[sp++] = canonicalBracket(closing);
        continue;
      }
      if (!bracketClose!.has(cp)) continue;
      const c = canonicalBracket(cp);
      for (let j = sp - 1; j >= 0; j--) {
        if (want[j] !== c) continue;
        pairs.push(open[j]!, k);
        sp = j;
        break;
      }
    }
    if (pairs.length > 0) {
      // In order of their opening brackets.
      const order: number[] = [];
      for (let p = 0; p < pairs.length; p += 2) order.push(p);
      order.sort((a, b) => pairs[a]! - pairs[b]!);
      for (const p of order) {
        const o = pairs[p]!;
        const c = pairs[p + 1]!;
        let found = -1;
        for (let k = o + 1; k < c; k++) {
          const s = strongOf(types[seq[k]!]!);
          if (s < 0) continue;
          if (s === embedding) { found = embedding; break; }
          found = s;
        }
        if (found < 0) continue;
        let dir = embedding;
        if (found !== embedding) {
          let context = sos;
          for (let k = o - 1; k >= 0; k--) {
            const s = strongOf(types[seq[k]!]!);
            if (s >= 0) { context = s; break; }
          }
          dir = context === found ? found : embedding;
        }
        types[seq[o]!] = dir;
        types[seq[c]!] = dir;
        // Marks on a bracket follow it.
        for (let k = o + 1; k < len && cls[seq[k]!] === NSM; k++) types[seq[k]!] = dir;
        for (let k = c + 1; k < len && cls[seq[k]!] === NSM; k++) types[seq[k]!] = dir;
      }
    }
  }

  // N1–N2: neutrals between two of a direction take it, else the
  // embedding direction.
  for (let k = 0; k < len; k++) {
    if (!isNeutralOrIsolate(types[seq[k]!]!)) continue;
    let e = k;
    while (e < len && isNeutralOrIsolate(types[seq[e]!]!)) e++;
    const lead = k === 0 ? sos : strongOf(types[seq[k - 1]!]!);
    const trail = e === len ? eos : strongOf(types[seq[e]!]!);
    const dir = lead === trail ? lead : embedding;
    for (let j = k; j < e; j++) types[seq[j]!] = dir;
    k = e - 1;
  }

  // I1–I2: implicit levels.
  for (let k = 0; k < len; k++) {
    const i = seq[k]!;
    const t = types[i]!;
    if (level & 1) {
      if (t === L || t === EN || t === AN) levels[i] = level + 1;
    } else if (t === R) levels[i] = level + 1;
    else if (t === AN || t === EN) levels[i] = level + 2;
  }
}
