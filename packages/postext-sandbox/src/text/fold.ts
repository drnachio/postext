// Accent and case folding for find and replace (book/find) and the
// settings search (sidebar/search/normalize.ts), at two strictnesses.
//
// Strict (find and replace, the default), for editing text:
// - Latin, Greek and Cyrillic letters lose their accents: é → e, ά → α.
//   Ñ, ç, й and ё are letters of their own (Spanish, Catalan, Portuguese,
//   Russian) and stay apart from n, c, и and е.
// - Arabic and Hebrew lose their pointing (harakat, shadda, sukun; niqqud):
//   كَتَبَ → كتب. Hamza and madda are part of the letter and stay.
// - Kana keep their voicing marks: が is not か, ぱ not は.
// - Case folding lowercases, and reads final sigma as sigma.
//
// Loose (`loose: true`, the settings search): every mark of every script
// goes, ñ → n, ç → c, й → и, ё → е included, and case folding is a plain
// lowercase. People type setting names without accents; "tamano" has to
// find "tamaño". Kana keep their voicing marks here too.
//
// Text written decomposed (NFD: e + U+0301) folds as its composed form:
// `foldWithMap` takes a letter and the marks after it as one cluster.

export interface FoldOptions {
  /** Strip accents and pointing. */
  accents: boolean;
  /** Lowercase. */
  caseFold: boolean;
  /** Fold every mark away, ñ, ç, й and ё included (the settings search).
   *  Off: the strict rules above (find and replace). */
  loose?: boolean;
}

const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const DECOMPOSED_SCRIPT = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u;
const KEEP = new Set(['ñ', 'Ñ', 'ç', 'Ç', 'й', 'Й', 'ё', 'Ё']);
/** Arabic harakat, shadda, sukun, superscript alef and Quranic signs;
 *  Hebrew cantillation and niqqud. */
const POINTING = /[֑-ׇֽֿׁׂׅׄؐ-ًؚ-ْٖ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/u;
const MARK = /\p{M}/u;
/** A mark at a given index (sticky). */
const MARK_AT = /\p{M}/uy;
/** Combining accents standing alone (their letter folded already). */
const COMBINING_ACCENT = /^[\u0300-\u036f]$/;

const caches = Array.from({ length: 8 }, () => new Map<string, string>());

/** The loose rules: marks stripped after NFD in any script, then lowercase. */
function foldLoose(ch: string, options: FoldOptions): string {
  if (KANA.test(ch)) return ch;
  let out = options.accents ? ch.normalize('NFD').replace(/\p{M}/gu, '') : ch;
  if (options.caseFold) out = out.toLowerCase();
  return out;
}

/** One code point (composed), folded. May be empty (a lone pointing
 *  mark) or longer than the input (İ lowercased keeps its dot until the
 *  accents go). */
export function foldCodePoint(ch: string, options: FoldOptions): string {
  const cache = caches[(options.accents ? 1 : 0) + (options.caseFold ? 2 : 0) + (options.loose ? 4 : 0)]!;
  const hit = cache.get(ch);
  if (hit !== undefined) return hit;
  if (options.loose) {
    const loose = foldLoose(ch, options);
    cache.set(ch, loose);
    return loose;
  }
  let out = ch;
  if (options.caseFold && !KANA.test(ch)) {
    out = out.toLowerCase();
    if (out === 'ς') out = 'σ';
  }
  if (options.accents) {
    if (POINTING.test(ch) || COMBINING_ACCENT.test(ch)) out = '';
    else if (!KEEP.has(out) && DECOMPOSED_SCRIPT.test(out)) {
      const base = out.normalize('NFD').replace(/\p{M}/gu, '');
      if (base.length > 0) out = base;
    }
  }
  cache.set(ch, out);
  return out;
}

/** A text folded, with where each of its units comes from: unit `k` of
 *  `text` stands for `[starts[k], ends[k])` of the original, a whole
 *  cluster (a letter and its marks). Null maps: unit for unit. */
export interface FoldedText {
  text: string;
  starts: Int32Array | null;
  ends: Int32Array | null;
}

function cpLength(s: string, i: number): number {
  return s.codePointAt(i)! > 0xffff ? 2 : 1;
}

/** The folded form of one cluster: a code point and the marks after it. */
function foldCluster(cluster: string, options: FoldOptions): string {
  const nfc = cluster.normalize('NFC');
  const first = cpLength(nfc, 0);
  if (first === nfc.length) return foldCodePoint(nfc, options);
  const base = nfc.slice(0, first);
  if (KANA.test(base)) return nfc;
  let out = foldCodePoint(base, options);
  // The marks left over after composing: dropped with the accents of a
  // Latin, Greek or Cyrillic letter, or as pointing; otherwise kept.
  const decomposes = options.accents && DECOMPOSED_SCRIPT.test(base) && !KEEP.has(base);
  for (let i = first; i < nfc.length; i += cpLength(nfc, i)) {
    const mark = nfc.slice(i, i + cpLength(nfc, i));
    if (decomposes && MARK.test(mark)) continue;
    out += foldCodePoint(mark, options);
  }
  return out;
}

const ASCII = /^[\x00-\x7f]*$/;

/** `s` folded, with the map back to it (see {@link FoldedText}). */
export function foldWithMap(s: string, options: FoldOptions): FoldedText {
  if (ASCII.test(s)) return { text: options.caseFold ? s.toLowerCase() : s, starts: null, ends: null };
  const parts: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  let i = 0;
  while (i < s.length) {
    let j = i + cpLength(s, i);
    for (;;) {
      MARK_AT.lastIndex = j;
      if (j >= s.length || !MARK_AT.test(s)) break;
      j += cpLength(s, j);
    }
    const cluster = s.slice(i, j);
    const out = j - i === 1 || (j - i === 2 && cpLength(s, i) === 2) ? foldCodePoint(cluster, options) : foldCluster(cluster, options);
    parts.push(out);
    for (let k = 0; k < out.length; k++) {
      starts.push(i);
      ends.push(j);
    }
    i = j;
  }
  return { text: parts.join(''), starts: Int32Array.from(starts), ends: Int32Array.from(ends) };
}

/** `s` folded unit for unit, the same length as `s`, for labels written
 *  composed: a unit that folds to nothing becomes a space, one that folds
 *  to more keeps the first unit. */
export function foldUnits(s: string, options: FoldOptions): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const f = foldCodePoint(s[i]!, options);
    out += f.length === 0 ? ' ' : f[0];
  }
  return out;
}
