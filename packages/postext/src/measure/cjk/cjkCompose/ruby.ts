// Ruby and kunten: ruby bases, JIS ruby words and their overhang, the
// sizing of rubies and kunten, and rubies aligned and clamped at a line's
// edges (#1276: split out of cjkCompose.ts).
import type { InlineSpan, InlineRuby, InlineKunten } from '../../../parse/index.js';
import type { VDTLineSegment } from '../../../vdt.js';
import { textWidth } from '../../rich.js';
import { isCjkGrapheme, cjkClassOf } from '../cjkClasses.js';
import { graphemesOf } from '../../graphemes.js';
import { cellAdvance, flowTextWidth, fontEm } from '../../vertical.js';
import { isZhuyin, readingAdvance, withFontSize, readingBaseline, type RubyGeometry, ZHUYIN_SIZE_RATIO, rubyGeometry, kuntenGeometry } from '../cjkAnnotate.js';
import { type JisRubyAlign, type JisRubyAllow, type JisRubyBase, type JisRubyBox, layoutJukugo, layoutJisRuby, fullSizeKana, boxesWidth } from '../rubyJis.js';
import { blankEnd, blankStart } from '../cjkPunctuation.js';
import { emOfFont } from './prepareUnits.js';
import { type Fonts, type Unit, styleOf } from './units.js';

/** The unit of a ruby base (#194): its characters as one box, measured as
 *  the composer measures them (cells down a vertical line), the reading
 *  laid out later (`sizeRubies`). Where the reading goes: `pos`, else
 *  zhuyin right of each character and anything else over; in vertical text
 *  `right` is the over side. */
export function rubyBaseUnit(span: InlineSpan, fonts: Fonts, letterSpacingPx: number, vertical: boolean): Unit {
  const ruby = span.ruby!;
  const style = styleOf(span, fonts, vertical);
  const graphemes = graphemesOf(span.text);
  let width = 0;
  for (const g of graphemes) {
    width += isCjkGrapheme(g) ? cellAdvance(g, style.font, vertical, cjkClassOf(g)) : textWidth(g, style.font, style.smallCaps);
  }
  width += letterSpacingPx * graphemes.length;
  const firstG = graphemes[0] ?? '';
  const lastG = graphemes[graphemes.length - 1] ?? '';
  let position: 'over' | 'under' | 'right' = ruby.position ?? (isZhuyin(ruby.text) ? 'right' : 'over');
  if (vertical && position === 'right') position = 'over';
  const jis = isJisRuby(ruby, position);
  return {
    kind: 'text',
    text: span.text,
    width,
    graphemes: graphemes.length,
    first: cjkClassOf(firstG),
    last: cjkClassOf(lastG),
    firstCjk: isCjkGrapheme(firstG),
    lastCjk: isCjkGrapheme(lastG),
    style,
    at: 0,
    ruby: { span: ruby, position, ...(jis ? { base: width } : {}) },
  };
}

/** Whether a ruby is set by the Japanese rules (#422, `rubyJis.ts`): one
 *  over or under its base, not zhuyin, that has an alignment, an overhang
 *  rule, a jukugo word, a `mode=mono` or full-size kana (in Japan every
 *  reading has the first two). Others keep the clreq geometry. */
function isJisRuby(ruby: InlineRuby, position: 'over' | 'under' | 'right'): boolean {
  if (position === 'right' || isZhuyin(ruby.text)) return false;
  return !!(ruby.align || ruby.overhang || ruby.jukugo || ruby.mono || ruby.fullKana);
}

/** How a Japanese ruby is laid out (#422): as a jukugo word (several
 *  bases) or one base, what the neighbours outside let the reading pass
 *  onto, and the alignment. The units of one word share the object. */
export interface JisRubyWord {
  jukugo: boolean;
  align: JisRubyAlign;
  rubyEm: number;
  allow: JisRubyAllow;
}

/** Hiragana, katakana (small kana, half-width forms and ー too): what a
 *  reading may pass onto under `cjk.ruby.overhang: 'kana'`. */
const KANA_RE = /^[\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u31F0-\u31FF\uFF66-\uFF9F]/u;

/** How far a Japanese reading may pass its base (or its jukugo word)
 *  onto the unit `v` beside it (`before`: `v` precedes it), px (JLReq
 *  §3.3.8, see `CjkRubyOverhang`); 0 at the paragraph's edge. `prev` is
 *  the unit before `v`, whose reading may already run onto it. */
function rubyOverhangOnto(v: Unit | undefined, before: boolean, prev: Unit | undefined, mode: InlineRuby['overhang'], rubyEm: number): number {
  if (!v || mode === 'none') return 0;
  if (mode === undefined) {
    // clreq: a quarter of the ruby em onto a neighbour without a reading,
    // as the other rubies of the paragraph (`sizeRubies`).
    if (v.kind !== 'text' || v.note) return 0;
    if (!v.ruby) return rubyEm / 4;
    const theirs = v.ruby.geometry?.rtWidth ?? readingAdvance(v.ruby.span.text, v.ruby.span.fontString ?? v.style.font, v.ruby.position);
    return Math.max(0, Math.min(rubyEm / 4, (v.width - theirs) / 2 - rubyEm / 4));
  }
  if (v.kind === 'atomic' || v.note || v.warichu) return 0;
  // A space: its width; never the space between Japanese and Latin text,
  // whose other side is a Western letter.
  if (v.kind === 'space') return v.auto ? 0 : Math.min(mode === 'any' ? rubyEm / 2 : rubyEm, v.width);
  if (v.ruby) {
    // Another base: only its reading's free room, and none in kana mode.
    if (mode !== 'any') return 0;
    const theirs = v.ruby.chars ? v.ruby.chars.reduce((w, c) => w + c.width, 0) : readingAdvance(v.ruby.span.text, v.ruby.span.fontString ?? v.style.font, v.ruby.position);
    return Math.max(0, Math.min(rubyEm / 2, (v.width - theirs) / 2));
  }
  if (mode === 'any') return rubyEm / 2;
  // `kana`: two readings never share a kana from both sides; the later
  // one keeps to its base (JLReq §3.3.8 note).
  if (before && prev?.ruby?.geometry && prev.ruby.jis) {
    const g = prev.ruby.geometry;
    const reach = g.runs.reduce((hi, r) => Math.max(hi, r.dx + flowTextWidth(r.text, r.fontString)), -Infinity);
    if (reach > g.width + 1e-6) return 0;
  }
  const box = v.punct;
  const cls = before ? v.last : v.first;
  if (box) {
    // A mark: its blank on the reading's side, never its glyph; at most
    // half a ruby character onto an opening bracket. …… and ―― take a
    // ruby character.
    if (box.cls === 'opening') return rubyEm / 2;
    if (box.cls === 'dash' || box.cls === 'ellipsis') return rubyEm;
    return Math.min(rubyEm, before ? blankEnd(box) : blankStart(box));
  }
  if (cls === 'opening') return rubyEm / 2;
  if (cls === 'ideoSpace' || cls === 'dash' || cls === 'ellipsis') return rubyEm;
  // Kana, ー; never kanji, nor a Western run.
  return !v.run && v.graphemes === 1 && KANA_RE.test(v.text) ? rubyEm : 0;
}

/** The bases of a Japanese ruby's units (see {@link JisRubyBase}). */
function jisBases(us: readonly Unit[]): JisRubyBase[] {
  return us.map((u) => ({ width: u.ruby!.base!, graphemes: u.graphemes, reading: u.ruby!.chars! }));
}

/** Lay out the bases of one Japanese ruby word (or one base). */
function layoutJisWord(word: JisRubyWord, bases: readonly JisRubyBase[], allow: JisRubyAllow): JisRubyBox[] {
  return word.jukugo ? layoutJukugo(bases, word.align, word.rubyEm, allow) : [layoutJisRuby(bases[0]!, word.align, word.rubyEm, allow)];
}

/** `u` with the box `box` of its Japanese ruby: its geometry and width. */
function withJisBox(u: Unit, box: JisRubyBox, word: JisRubyWord): Unit {
  const ruby = u.ruby!;
  const font = ruby.span.fontString ?? withFontSize(u.style.font, emOfFont(u.style.font) / 2);
  const dy = readingBaseline(ruby.span.text, font, ruby.position === 'under' ? 'under' : 'over', emOfFont(u.style.font));
  const geometry: RubyGeometry = {
    width: box.width,
    inset: box.inset,
    rtWidth: ruby.chars!.reduce((w, c) => w + c.width, 0),
    runs: box.pieces.map((p) => ({ text: p.text, dx: p.dx, dy, fontString: font })),
    allowLeft: word.allow.start,
    allowRight: word.allow.end,
    ...(box.tracking > 0 ? { tracking: box.tracking } : {}),
  };
  return { ...u, width: box.width, ruby: { ...ruby, geometry } };
}

/**
 * Lay out the Japanese rubies of a paragraph (#422, `rubyJis.ts`): each
 * jukugo word, or each base, with what its neighbours let its reading pass
 * onto, in order (a reading that runs onto a kana keeps the next one off
 * it). Each base also learns how much wider it gets at a line edge
 * (`rubyGrow`), for the breaker. Units are replaced in place.
 */
function sizeJisRubies(units: Unit[]): void {
  const n = units.length;
  for (let k = 0; k < n; k++) {
    const u = units[k]!;
    if (!u.ruby || u.ruby.base === undefined || u.ruby.geometry) continue;
    const span = u.ruby.span;
    let e = k;
    if (span.jukugo) {
      while (e + 1 < n) {
        const v = units[e + 1]!.ruby;
        if (!v || v.base === undefined || !v.span.jukugo || v.span.id !== span.id || v.position !== u.ruby.position) break;
        e++;
      }
    }
    const font = span.fontString ?? withFontSize(u.style.font, emOfFont(u.style.font) / 2);
    const rubyEm = fontEm(font);
    for (let q = k; q <= e; q++) {
      const r = units[q]!.ruby!;
      const painted = r.span.fullKana ? fullSizeKana(r.span.text) : r.span.text;
      r.chars = graphemesOf(painted).map((g) => ({ text: g, width: flowTextWidth(g, font) }));
    }
    const word: JisRubyWord = {
      jukugo: e > k,
      align: span.align ?? 'center',
      rubyEm,
      allow: {
        start: rubyOverhangOnto(units[k - 1], true, units[k - 2], span.overhang, rubyEm),
        end: rubyOverhangOnto(units[e + 1], false, undefined, span.overhang, rubyEm),
      },
    };
    const members = units.slice(k, e + 1);
    const bases = jisBases(members);
    const boxes = layoutJisWord(word, bases, word.allow);
    for (let q = k; q <= e; q++) {
      units[q] = withJisBox(units[q]!, boxes[q - k]!, word);
      units[q]!.ruby!.jis = word;
    }
    // What the line gains when the word (or the base) opens it from that
    // unit on, or closes it with that unit: the reading flush with the
    // edge, the part of a word laid out alone.
    for (let i = 0; i < boxes.length; i++) {
      const head = boxesWidth(boxes.slice(0, i + 1));
      const tail = boxesWidth(boxes.slice(i));
      units[k + i]!.rubyGrow = {
        start: boxesWidth(layoutJisWord(word, bases.slice(i), { start: 0, end: word.allow.end })) - tail,
        end: boxesWidth(layoutJisWord(word, bases.slice(0, i + 1), { start: word.allow.start, end: 0 })) - head,
      };
    }
    k = e;
  }
}

/**
 * A line's Japanese rubies at its edges (#422, JLReq §3.3.8): a word or
 * base that opens or closes the line is laid out again with nothing to
 * pass onto on that side, so a longer reading is set flush with the edge
 * and its base moves in; a jukugo word the line breaks inside is laid
 * out again with the characters the line holds, each keeping its reading.
 * The breaker counted what this adds (`rubyGrow`). Units that change are
 * replaced by copies in `us`.
 */
export function relayJisEdges(us: Unit[]): void {
  for (let j = 0; j < us.length; j++) {
    const word = us[j]!.ruby?.jis;
    if (!word) continue;
    let e = j;
    while (e + 1 < us.length && us[e + 1]!.ruby?.jis === word) e++;
    // A word with kanbun marks (#430) keeps its layout: the marks were set
    // against its readings (`sizeKunten`).
    if (us.slice(j, e + 1).some((u) => u.kunten?.vdt)) {
      j = e;
      continue;
    }
    const atStart = j === 0;
    const atEnd = e === us.length - 1;
    if (atStart || atEnd) {
      const allow = { start: atStart ? 0 : word.allow.start, end: atEnd ? 0 : word.allow.end };
      const boxes = layoutJisWord(word, jisBases(us.slice(j, e + 1)), allow);
      for (let q = j; q <= e; q++) us[q] = withJisBox(us[q]!, boxes[q - j]!, word);
    }
    j = e;
  }
}

/**
 * Lay out each ruby base's reading (see `cjkAnnotate.ts`): its box grows
 * to the reading less what the reading may pass it by — a quarter of the
 * ruby em onto a neighbour without ruby, and it keeps as much from a
 * neighbour's reading on the same side (two zhuyin readings: a quarter of
 * the symbols' em). Run once the units are final.
 */
export function sizeRubies(units: Unit[]): void {
  // Japanese rubies first (#422): the others read their geometry.
  if (units.some((u) => u.ruby?.base !== undefined)) sizeJisRubies(units);
  for (let k = 0; k < units.length; k++) {
    const u = units[k]!;
    if (!u.ruby || u.ruby.geometry) continue;
    const fontOf = (v: Unit): string => v.ruby!.span.fontString ?? withFontSize(v.style.font, emOfFont(v.style.font) / 2);
    const font = fontOf(u);
    const q = fontEm(font) / 4;
    const zhuyin = isZhuyin(u.ruby.span.text);
    // How far the reading may pass its box towards a neighbour: a quarter
    // of the ruby em onto one without a reading; next to a reading on the
    // same side, what keeps the two a quarter em apart (the neighbour's
    // box is at least its base). Zhuyin is set at 60 % of the ruby size,
    // so two zhuyin readings keep a quarter of that em apart: three
    // symbols beside each of two characters stay in their cells (clreq
    // §5.5.3 centres each column on its own character).
    const allow = (v: Unit | undefined): number => {
      if (!v || v.kind !== 'text' || v.note) return 0;
      if (!v.ruby) return q;
      if (v.ruby.position !== u.ruby!.position || v.ruby.position === 'right') return q;
      const theirs = v.ruby.geometry?.rtWidth ?? readingAdvance(v.ruby.span.text, fontOf(v), v.ruby.position);
      const gap = zhuyin && isZhuyin(v.ruby.span.text) ? (fontEm(font) * ZHUYIN_SIZE_RATIO) / 4 : q;
      return Math.min(q, (v.width - theirs) / 2 - gap);
    };
    const geometry = rubyGeometry({
      reading: u.ruby.span.text,
      fontString: font,
      position: u.ruby.position,
      baseWidth: u.width,
      em: emOfFont(u.style.font),
      allowLeft: allow(units[k - 1]),
      allowRight: allow(units[k + 1]),
    });
    u.ruby.geometry = geometry;
    u.width = geometry.width;
  }
}

/** Give each kanbun mark (#430) to the last unit its spans made (a space
 *  aside): the marks go with the base's last character. `starts[i]` is
 *  where span `i`'s units start. */
export function attachKunten(spans: readonly InlineSpan[], starts: readonly number[], units: Unit[]): void {
  const last = new Map<InlineKunten, number>();
  spans.forEach((span, i) => {
    if (!span.kunten) return;
    const end = i + 1 < starts.length ? starts[i + 1]! : units.length;
    for (let k = end - 1; k >= starts[i]!; k--) {
      if (units[k]!.kind === 'space') continue;
      last.set(span.kunten, k);
      break;
    }
  });
  for (const [mark, k] of last) units[k]!.kunten = { mark };
}

/**
 * Lay out the kanbun marks of each unit that carries some (see
 * `kuntenGeometry`): their runs, and the advance they add after the
 * character, which joins the unit's width. Run once the units are final
 * and the ruby readings sized (a 送り仮名 follows a reading on its side).
 * A character inside a warichu note keeps no marks.
 */
export function sizeKunten(units: Unit[], letterSpacingPx: number): void {
  for (const u of units) {
    if (!u.kunten || u.kunten.vdt || u.note || u.kind !== 'text') continue;
    const mark = u.kunten.mark;
    if (!mark.kaeri && !mark.okuri && !mark.tate) continue;
    const em = emOfFont(u.style.font);
    const g = u.ruby?.geometry;
    // Where the character ends: the base inside a ruby box (a Japanese
    // one, #422, spread by `tracking` after each character but its last),
    // else the unit less the tracking after its last character.
    const baseEnd = !g ? u.width - letterSpacingPx
      : u.ruby!.base !== undefined ? g.inset + u.ruby!.base + (g.tracking ?? 0) * (u.graphemes - 1)
        : u.ruby!.position === 'right' ? u.width - g.rtWidth : u.width - g.inset;
    let readingEnd: number | undefined;
    if (g && u.ruby!.position !== 'right') {
      for (const r of g.runs) readingEnd = Math.max(readingEnd ?? -Infinity, r.dx + flowTextWidth(r.text, r.fontString));
    }
    const over = u.ruby && u.ruby.position !== 'under';
    const { extra, kunten } = kuntenGeometry({
      ...(mark.kaeri ? { kaeri: mark.kaeri } : {}),
      ...(mark.okuri ? { okuri: mark.okuri } : {}),
      ...(mark.tate ? { tate: true } : {}),
      fontString: mark.fontString ?? withFontSize(u.style.font, em / 2),
      ...(mark.color ? { color: mark.color } : {}),
      placement: mark.placement ?? 'inline',
      em,
      baseEnd,
      width: u.width,
      ...(readingEnd !== undefined && over ? { readingOverEnd: readingEnd } : {}),
      ...(readingEnd !== undefined && !over ? { readingUnderEnd: readingEnd } : {}),
    });
    u.kunten = { mark, extra, vdt: kunten };
    u.width += extra;
    // Its Japanese ruby word is not laid out again at a line edge
    // (`relayJisEdges`), so it widens no line there.
    const word = u.ruby?.jis;
    if (word) for (const v of units) if (v.ruby?.jis === word) delete v.rubyGrow;
  }
}

/**
 * A ruby base that opens or closes a line (clreq §5.5.4): base and reading
 * align to that edge. The base gives up its inset on that side, and the
 * box keeps only what the reading needs past its other side (less what it
 * may pass the box by there), never more than it was, so the line the
 * breaker set never grows. A base alone on its line stays centred.
 * Units that change are replaced by copies in `us`.
 */
export function alignEdgeRubies(us: Unit[]): void {
  if (us.length < 2) return;
  const align = (j: number, start: boolean): void => {
    const u = us[j]!;
    const g = u.ruby?.geometry;
    // A base with kanbun marks keeps its reading where the marks were set
    // against it (#430).
    if (!g || u.ruby!.position === 'right' || u.ruby!.jis || g.runs.length === 0 || u.kunten) return;
    const base = u.width - 2 * g.inset;
    const rt = g.rtWidth;
    const wide = rt > base;
    // How far the reading reaches from the edge: its advance, or to the
    // far side of the base it is centred on.
    const reach = wide ? rt : (base + rt) / 2;
    const width = Math.min(u.width, Math.max(base, reach - (start ? g.allowRight : g.allowLeft)));
    const inset = start ? 0 : width - base;
    const readingAt = wide ? (start ? 0 : width - rt) : inset + (base - rt) / 2;
    const shift = readingAt - g.runs[0]!.dx;
    if (Math.abs(width - u.width) < 1e-9 && Math.abs(inset - g.inset) < 1e-9 && Math.abs(shift) < 1e-9) return;
    us[j] = {
      ...u,
      width,
      ruby: { ...u.ruby!, geometry: { ...g, width, inset, runs: g.runs.map((r) => ({ ...r, dx: r.dx + shift })) } },
    };
  };
  align(0, true);
  align(us.length - 1, false);
}

/** Keep the readings of a line's ruby bases inside the line: a reading
 *  that would pass the line's start or end is moved back to it (clreq
 *  §5.5.4: at a line edge base and ruby align to the edge). */
export function clampReadings(segments: readonly VDTLineSegment[]): void {
  if (!segments.some((s) => s.ruby)) return;
  let lineWidth = 0;
  for (const s of segments) if (!s.hangs) lineWidth += s.width;
  let x = 0;
  for (const s of segments) {
    const ruby = s.ruby;
    // A Japanese reading (`id`) was set inside the line already (#422).
    if (ruby && ruby.position !== 'right' && ruby.id === undefined && ruby.runs.length > 0) {
      const lo = ruby.runs[0]!.dx;
      const hi = lo + ruby.rtWidth;
      let shift = 0;
      if (x + lo < 0) shift = -(x + lo);
      else if (x + hi > lineWidth + 1e-6) shift = lineWidth - (x + hi);
      if (shift !== 0) ruby.runs = ruby.runs.map((r) => ({ ...r, dx: r.dx + shift }));
    }
    x += s.width;
  }
}
