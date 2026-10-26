/**
 * Japanese ruby geometry (furigana, #422), after JIS X 4051 §12 and JLReq
 * §3.3: where a reading sits on its base, how far a longer one may run
 * past the base before the base is spread, and how the readings of a
 * jukugo ruby (熟語ルビ) share a word.
 *
 * Pure arithmetic along the line, in px of the flow frame: the composer
 * (`cjkCompose.ts`) gives each base's advance and its reading's
 * characters, and how far the reading may pass the base on each side
 * (`allow`: what the neighbour outside takes, 0 at a line edge, where
 * the reading is set flush with the edge and the base moves in); it gets
 * back each base's box (its advance on the line), where the base's first
 * glyph starts in the box (`inset`), the spacing after each base
 * character (`tracking`) and the reading's pieces, placed from the box's
 * start.
 *
 * - A reading no longer than its base (JLReq §3.3.6 a) leaves the box as
 *   the base: `center` centres it, `start` sets it from the base's start,
 *   `jis` spreads it 1:2:1 (half a unit before the first character and
 *   after the last, a unit between characters), or, when that half unit
 *   would be more than a ruby character, from one end of the base to the
 *   other (space-between). One character is centred by either.
 * - A longer reading (§3.3.6 b) runs past the base as far as each side
 *   allows, evenly while both sides can take it; what is left spreads the
 *   base: 1:2:1 under `jis` (half a unit before the first character and
 *   after the last, a unit between), centred in its box otherwise. The
 *   reading is set solid.
 * - A jukugo ruby (§3.3.7) is set as mono ruby while every reading fits
 *   its base. When one does not, each reading stays by its own base and
 *   may run onto the next or the previous base of the word by up to one
 *   ruby character, the readings never overlapping, the first and the
 *   last passing the word by what the neighbours outside allow. When even
 *   that does not hold them, the word takes its readings as one, a group
 *   ruby over the whole word.
 */

/** A ruby base and its reading. */
export interface JisRubyBase {
  /** The base's advance (its characters at their own spacing), px. */
  width: number;
  /** How many characters (graphemes) the base holds. */
  graphemes: number;
  /** The reading's characters as painted, with their advances (px). */
  reading: readonly { text: string; width: number }[];
}

/** Where a reading sits (see `CjkRubyAlign`). */
export type JisRubyAlign = 'center' | 'jis' | 'start';

/** How far a reading may pass its base, or a jukugo word, on each side, px. */
export interface JisRubyAllow {
  start: number;
  end: number;
}

/** A piece of a reading: its text, its advance and where it starts, px
 *  from the start of its base's box (negative: before the box). */
export interface JisRubyPiece {
  text: string;
  dx: number;
  width: number;
}

/** How a ruby base is set (see the module comment). */
export interface JisRubyBox {
  /** The box's advance on the line, px. */
  width: number;
  /** Where the base's first glyph starts in the box, px. */
  inset: number;
  /** Space after each base character (a spread base of two or more), px;
   *  counted in `width`. */
  tracking: number;
  pieces: JisRubyPiece[];
}

const EPS = 1e-9;

/** The sum of the advances. */
function advance(reading: readonly { width: number }[]): number {
  let w = 0;
  for (const r of reading) w += r.width;
  return w;
}

/** Where each character of a reading starts when the first starts at `x`
 *  with `gap` after each but the last. */
function charStarts(reading: readonly { width: number }[], x: number, gap: number): number[] {
  const out: number[] = [];
  let at = x;
  for (const r of reading) {
    out.push(at);
    at += r.width + gap;
  }
  return out;
}

/** A reading's characters at `xs` as pieces: characters set solid share a
 *  piece. */
function piecesAt(reading: readonly { text: string; width: number }[], xs: readonly number[]): JisRubyPiece[] {
  const out: JisRubyPiece[] = [];
  reading.forEach((r, i) => {
    const x = xs[i]!;
    const last = out[out.length - 1];
    if (last && Math.abs(last.dx + last.width - x) < EPS) {
      last.text += r.text;
      last.width += r.width;
    } else out.push({ text: r.text, dx: x, width: r.width });
  });
  return out;
}

/** How far a longer reading passes its base on each side: evenly while
 *  both sides take it, then the side that takes more (`start` alignment:
 *  only after the base). */
export function overhangs(need: number, allow: JisRubyAllow, align: JisRubyAlign): { start: number; end: number } {
  const a = Math.max(0, allow.start);
  const b = Math.max(0, allow.end);
  if (align === 'start') return { start: 0, end: Math.min(b, need) };
  let start = Math.min(a, need / 2);
  let end = Math.min(b, need / 2);
  const left = need - start - end;
  if (left > EPS) {
    const more = Math.min(a - start, left);
    start += more;
    end += Math.min(b - end, left - more);
  }
  return { start, end };
}

/** {@link layoutJisRuby} with the reading's characters' starts (`xs`)
 *  instead of its pieces. */
function placeReading(base: JisRubyBase, align: JisRubyAlign, rubyEm: number, allow: JisRubyAllow): { width: number; inset: number; tracking: number; xs: number[] } {
  const reading = base.reading;
  const r = advance(reading);
  const b = base.width;
  if (r <= b + EPS) {
    const slack = Math.max(0, b - r);
    const n = reading.length;
    let x = slack / 2;
    let gap = 0;
    if (align === 'start') x = 0;
    else if (align === 'jis' && n > 1) {
      // 1:2:1 (space-around); flush with both ends (space-between) when
      // the half unit at each end would be more than a ruby character.
      const unit = slack / n;
      if (unit / 2 > rubyEm + EPS) {
        x = 0;
        gap = slack / (n - 1);
      } else {
        x = unit / 2;
        gap = unit;
      }
    }
    return { width: b, inset: 0, tracking: 0, xs: charStarts(reading, x, gap) };
  }
  const over = overhangs(r - b, allow, align);
  const spread = Math.max(0, r - b - over.start - over.end);
  const m = Math.max(1, base.graphemes);
  let inset = spread / 2;
  let tracking = 0;
  if (align === 'start') inset = 0;
  else if (align === 'jis' && m > 1) {
    // The base spread 1:2:1: half a unit before its first character and
    // after its last, a unit between.
    tracking = spread / m;
    inset = tracking / 2;
  }
  return { width: b + spread, inset, tracking, xs: charStarts(reading, 0 - over.start, 0) };
}

/**
 * One base and its reading: a mono ruby's character, or a group ruby's
 * base (see the module comment). `rubyEm` is the reading's em, for the
 * limit of the 1:2:1 spread.
 */
export function layoutJisRuby(base: JisRubyBase, align: JisRubyAlign, rubyEm: number, allow: JisRubyAllow): JisRubyBox {
  const { xs, ...box } = placeReading(base, align, rubyEm, allow);
  return { ...box, pieces: piecesAt(base.reading, xs) };
}

/**
 * A jukugo ruby's characters (a word, or the part of it on a line): one
 * box per base (see the module comment). `allow` is what the word's
 * neighbours outside it take.
 */
export function layoutJukugo(bases: readonly JisRubyBase[], align: JisRubyAlign, rubyEm: number, allow: JisRubyAllow): JisRubyBox[] {
  if (bases.length === 1) return [layoutJisRuby(bases[0]!, align, rubyEm, allow)];
  // Every reading fits its base: mono ruby.
  if (bases.every((b) => advance(b.reading) <= b.width + EPS)) {
    return bases.map((b) => layoutJisRuby(b, align, rubyEm, { start: 0, end: 0 }));
  }
  // Each reading by its own base, running onto the bases next to it by up
  // to a ruby character, never onto another reading: from the centred
  // places, pushed after the reading before, then pulled back inside
  // their limits.
  const n = bases.length;
  const starts: number[] = [];
  let total = 0;
  for (const b of bases) {
    starts.push(total);
    total += b.width;
  }
  const w = bases.map((b) => advance(b.reading));
  const lo = bases.map((_, i) => starts[i]! - (i === 0 ? Math.max(0, allow.start) : rubyEm));
  const hi = bases.map((b, i) => starts[i]! + b.width + (i === n - 1 ? Math.max(0, allow.end) : rubyEm));
  const x = bases.map((b, i) => (align === 'start' ? starts[i]! : starts[i]! + (b.width - w[i]!) / 2));
  for (let i = 0; i < n; i++) x[i] = Math.max(x[i]!, lo[i]!, i > 0 ? x[i - 1]! + w[i - 1]! : -Infinity);
  for (let i = n - 1; i >= 0; i--) x[i] = Math.min(x[i]!, hi[i]! - w[i]!, i < n - 1 ? x[i + 1]! - w[i]! : Infinity);
  const fits = x.every((xi, i) => xi >= lo[i]! - EPS && xi + w[i]! <= hi[i]! + EPS && (i === 0 || xi >= x[i - 1]! + w[i - 1]! - EPS));
  if (fits) {
    return bases.map((b, i) => ({
      width: b.width,
      inset: 0,
      tracking: 0,
      pieces: piecesAt(b.reading, charStarts(b.reading, x[i]! - starts[i]!, 0)),
    }));
  }
  // The word shares its reading: a group ruby over it. Each base keeps a
  // box of its own (its share of the word's spread) and its own
  // characters of the reading, so the parts of a word broken across lines
  // and the HTML `<ruby>` still pair each base with its reading.
  const graphemes = bases.reduce((g, b) => g + Math.max(1, b.graphemes), 0);
  const flat = bases.flatMap((b) => b.reading);
  const word = placeReading({ width: total, graphemes, reading: flat }, align, rubyEm, allow);
  const spread = word.width - total;
  const boxes: JisRubyBox[] = [];
  let boxAt = 0;
  let ci = 0;
  bases.forEach((b, i) => {
    const m = Math.max(1, b.graphemes);
    let width = b.width;
    let inset = 0;
    let tracking = 0;
    if (spread > EPS) {
      if (word.tracking > 0) {
        // The word spread 1:2:1 over its characters: each base takes its
        // characters' units, half of one before its first.
        const unit = word.tracking;
        width += unit * m;
        inset = unit / 2;
        tracking = m > 1 ? unit : 0;
      } else if (align === 'start') {
        if (i === n - 1) width += spread;
      } else {
        // Centred: the spread before the first base and after the last.
        if (i === 0) {
          width += word.inset;
          inset = word.inset;
        }
        if (i === n - 1) width += spread - word.inset;
      }
    }
    const xs = b.reading.map(() => word.xs[ci++]! - boxAt);
    boxes.push({ width, inset, tracking, pieces: piecesAt(b.reading, xs) });
    boxAt += width;
  });
  return boxes;
}

/** The total advance of boxes. */
export function boxesWidth(boxes: readonly JisRubyBox[]): number {
  let w = 0;
  for (const b of boxes) w += b.width;
  return w;
}

/** Small kana and their full-size forms (`cjk.ruby.smallKana: 'full'`). */
const FULL_KANA: Record<string, string> = {
  'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ', 'ゕ': 'か', 'ゖ': 'け',
  'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ', 'ッ': 'ツ', 'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ヮ': 'ワ', 'ヵ': 'カ', 'ヶ': 'ケ',
  'ㇰ': 'ク', 'ㇱ': 'シ', 'ㇲ': 'ス', 'ㇳ': 'ト', 'ㇴ': 'ヌ', 'ㇵ': 'ハ', 'ㇶ': 'ヒ', 'ㇷ': 'フ', 'ㇸ': 'ヘ', 'ㇹ': 'ホ', 'ㇺ': 'ム', 'ㇻ': 'ラ', 'ㇼ': 'リ', 'ㇽ': 'ル', 'ㇾ': 'レ', 'ㇿ': 'ロ',
  'ｧ': 'ｱ', 'ｨ': 'ｲ', 'ｩ': 'ｳ', 'ｪ': 'ｴ', 'ｫ': 'ｵ', 'ｬ': 'ﾔ', 'ｭ': 'ﾕ', 'ｮ': 'ﾖ', 'ｯ': 'ﾂ',
};
const SMALL_KANA_RE = /[ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰ-ㇿｧ-ｯ]/g;

/** A reading with its small kana full size (がっこう → がつこう). */
export function fullSizeKana(reading: string): string {
  return reading.replace(SMALL_KANA_RE, (c) => FULL_KANA[c] ?? c);
}
