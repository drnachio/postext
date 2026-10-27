// One broken line turned into segments: notes folded in, the spread of a
// justified line, fitLine and composeLine (#1276: split out of cjkCompose.ts).
import { type VDTAnnotationRun, type VDTLine, type VDTLineSegment, createBoundingBox } from '../../../vdt.js';
import { type PendingSegment, tokenSegment, textWidth } from '../../rich.js';
import type { CjkLineBreakLevel } from '../cjkClasses.js';
import { lastGrapheme } from '../../graphemes.js';
import { ratiosOf } from '../../spaceRatios.js';
import { trimChipLineEdges } from '../../chipEdges.js';
import { fontEm } from '../../vertical.js';
import { splitNote, noteRowBaselines } from '../cjkAnnotate.js';
import { shrinkPunctuation, jlreqShrinkStep, shrinkStep, boxCut } from '../cjkPunctuation.js';
import { startProhibited, endProhibited, gapAfterStretches } from './breaks.js';
import type { LineFit, LineRange } from './breakUnits.js';
import { emOfFont } from './prepareUnits.js';
import { relayJisEdges, alignEdgeRubies, clampReadings } from './ruby.js';
import { type Fonts, type Unit, FIT_EPS } from './units.js';

/** A segment being built: its texts, joined once it is done. */
interface Piece {
  seg: PendingSegment;
  parts: string[];
  /** Consecutive text units of this style, link and tracking may join it. */
  key: string | undefined;
  /** The advance of each character of a piece others may join: only
   *  characters that advance alike share a segment, so the Sandbox's caret
   *  can spread a segment's width evenly over its characters. */
  cell?: number;
}

export interface ComposeContext {
  fonts: Fonts;
  textAlign: string;
  letterSpacingPx: number;
  em: number;
  cap: number;
  normalSpace: number;
  lineHeightPx: number;
  /** How far below its top a line has its baseline (`lineBaselineOffset`). */
  baselineOffset: number;
  indentOf: (line: number) => number;
  measureOf: (line: number) => number;
  /** Vertical text: a Western run keeps the gap after it in its width. */
  vertical?: boolean;
  /** The composition's line edges, push-in and hanging; undefined for a
   *  plain one. */
  fit?: LineFit;
  /** The line-break level (the rows of a warichu note split under it). */
  level: CjkLineBreakLevel;
}

/** Whether a note's unit may not open its lower row: a mark that may not
 *  start a line (the small kana and the rest of the Japanese classes under
 *  a Japanese level), or a word space (it ends the upper row instead). */
export function noteRowStartProhibited(u: Unit, level: CjkLineBreakLevel): boolean {
  return u.noteSpace === true || startProhibited(u, level);
}

/** Replace each run of a warichu note's characters on a line by the part
 *  folded into its two rows (see `cjkAnnotate.ts`). `us` is changed in
 *  place. */
function foldNotes(us: Unit[], level: CjkLineBreakLevel, em: number): void {
  const out: Unit[] = [];
  for (let j = 0; j < us.length;) {
    const u = us[j]!;
    if (!u.note) {
      out.push(u);
      j++;
      continue;
    }
    let e = j + 1;
    while (e < us.length && us[e]!.note === u.note) e++;
    out.push(noteFragment(us.slice(j, e), level, em));
    j = e;
  }
  us.splice(0, us.length, ...out);
}

/** A line's part of a warichu note: its characters split into an upper and
 *  a lower row, each painted in runs of one font; the part's advance is the
 *  wider row's. */
function noteFragment(part: readonly Unit[], level: CjkLineBreakLevel, em: number): Unit {
  const note = part[0]!.note!;
  const widths = part.map((u) => u.width);
  const at = splitNote(widths, part.map((u) => noteRowStartProhibited(u, level)), part.map((u) => endProhibited(u, level)));
  const noteFont = note.fontString ?? part[0]!.style.font;
  const rows = noteRowBaselines(em, fontEm(noteFont));
  const runs: VDTAnnotationRun[] = [];
  const row = (units: readonly Unit[], dy: number): { text: string; width: number } => {
    let dx = 0;
    let text = '';
    let run: VDTAnnotationRun | undefined;
    for (const u of units) {
      if (run && run.fontString === u.style.font) run.text += u.text;
      else {
        run = { text: u.text, dx, dy, fontString: u.style.font };
        runs.push(run);
      }
      dx += u.width;
      text += u.text;
    }
    return { text, width: dx };
  };
  const upper = row(part.slice(0, at), rows.upper);
  const lower = row(part.slice(at), rows.lower);
  const first = part[0]!;
  const last = part[part.length - 1]!;
  let graphemes = 0;
  for (const u of part) graphemes += u.graphemes;
  return {
    kind: 'text',
    text: upper.text + lower.text,
    width: Math.max(upper.width, lower.width),
    graphemes,
    first: first.first,
    last: last.last,
    firstCjk: first.firstCjk,
    lastCjk: last.lastCjk,
    style: first.style,
    at: first.at,
    warichu: {
      upper: upper.text,
      lower: lower.text,
      fontString: noteFont,
      upperDy: rows.upper,
      lowerDy: rows.lower,
      ...(note.color ? { color: note.color } : {}),
      runs,
    },
  };
}

/** Share `amount` among `caps` equally, none past its cap: what each
 *  takes. */
function spread(amount: number, caps: readonly number[]): number[] {
  const takes = caps.map(() => 0);
  const order = caps.map((_, i) => i).sort((a, b) => caps[a]! - caps[b]!);
  let rest = amount;
  for (let o = 0; o < order.length && rest > 1e-12; o++) {
    const i = order[o]!;
    const take = Math.min(caps[i]!, rest / (order.length - o));
    takes[i] = take;
    rest -= take;
  }
  return takes;
}

/**
 * A line's units as its edges and its measure set them (see
 * `cjkPunctuation.ts`): the first mark gives up its lead and the last its
 * tail, each taking back the blank it gave to a mark on the other side of
 * the break (the two no longer meet); a mark that hangs is taken out and
 * returned apart; and a line wider than its measure (it took one more
 * character that may not open a line, clreq §6.2.2.3) gives up
 * blank in clreq's order — word spaces to a quarter em, interpuncts,
 * brackets, pause marks, Han–Latin spaces to an eighth of an em, stop marks
 * last — each step shared equally, until it fits. Japanese full-width text
 * takes JLReq §3.8.3's order instead (`jlreqShrinkStep`): word spaces, the
 * half em after the line's last mark and then a middle dot's quarter (each
 * all or nothing: what it gives beyond the need is spread back when the
 * line is justified), the middle dots' quarters inside the line, the half
 * ems of brackets and 、， inside it, Han–Latin spaces; never the half em
 * after a 。 inside the line. A mark that hangs keeps its glyph alone. `us`
 * holds the line's units and is changed in place; a unit that changes is
 * replaced by a copy, since the paragraph's units serve every attempt at
 * breaking it.
 */
function fitLine(us: Unit[], units: readonly Unit[], range: LineRange, lastK: number, isLast: boolean, measure: number, fit: LineFit): Unit | undefined {
  const copy = (j: number): Unit => {
    const u = us[j]!;
    const c: Unit = { ...u, ...(u.punct ? { punct: { ...u.punct } } : {}) };
    us[j] = c;
    return c;
  };
  let hang: Unit | undefined;
  if (us.length > 1) {
    const unitAt = (k: number): Unit => (k === range.start && range.first ? range.first : units[k]!);
    const forced = fit.hanging === 'force' && !isLast && !range.head && fit.hangs(units, lastK, unitAt);
    if (range.hang || forced) {
      hang = copy(us.length - 1);
      us.pop();
      hang.width -= fit.edge(hang, false, true);
      // ぶら下げ: the hung mark is its glyph, past the measure.
      if (fit.jlreq && hang.punct) hang.width -= shrinkPunctuation(hang.punct, hang.punct.blank, true);
      while (us.length > 0 && us[us.length - 1]!.kind === 'space') us.pop();
    }
  }
  if (us.length === 0) return hang;
  // The marks at the edges: what they gave to a mark across the break
  // comes back, then the edge trims.
  if (fit.lead(us[0]!) !== 0) {
    const c = copy(0);
    c.width -= fit.edge(c, true, false);
  }
  if (fit.tail(us[us.length - 1]!) !== 0) {
    const c = copy(us.length - 1);
    c.width -= fit.edge(c, false, true);
  }
  let over = -measure;
  for (const u of us) over += u.width;
  if (over <= FIT_EPS) return hang;
  // Steps of the reduction order: word spaces (1), interpuncts (2),
  // brackets (3), pause marks (4), Han–Latin spaces (5), stop marks (6);
  // in JLReq spacing, word spaces (1), the line end (2, 3), middle dots
  // (4), brackets and 、， (5), Han–Latin spaces (6).
  const last = us.length - 1;
  const atEnd = (j: number): boolean => fit.jlreq && j === last;
  const stepOf = (u: Unit, j: number): number => {
    if (u.kind === 'space') return u.aki ? 0 : u.auto ? (fit.jlreq ? 6 : 5) : 1;
    if (!u.punct) return 0;
    return fit.jlreq ? jlreqShrinkStep(u.punct, atEnd(j)) : shrinkStep(u.punct);
  };
  for (let step = 1; step <= 6 && over > FIT_EPS; step++) {
    const members: number[] = [];
    const caps: number[] = [];
    for (let j = 0; j < us.length; j++) {
      const u = us[j]!;
      if (stepOf(u, j) !== step) continue;
      // The marks at the edges already gave up their lead and tail.
      const cap = fit.give(u, false, atEnd(j));
      if (cap <= 0) continue;
      members.push(j);
      caps.push(cap);
    }
    if (members.length === 0) continue;
    // The blank at a JLReq line end goes whole or not at all (§3.1.9).
    const takes = fit.jlreq && (step === 2 || step === 3) ? caps : spread(over, caps);
    for (let m = 0; m < members.length; m++) {
      const take = takes[m]!;
      if (take <= 0) continue;
      const j = members[m]!;
      const c = copy(j);
      const given = c.punct ? shrinkPunctuation(c.punct, take, atEnd(j)) : take;
      c.width -= given;
      over -= given;
    }
  }
  return hang;
}

/** Where a unit's glyph (its `grapheme`th) is painted from its segment's
 *  start, px (`VDTLineSegment.inkOffset`): a shared mark's place in its
 *  box, less the blank its box gave up before it. Undefined for a unit
 *  painted at its own advances. */
function inkOffsetOf(u: Unit, grapheme = 0): number | undefined {
  const cutStart = u.punct?.cutStart ?? 0;
  if (u.place) return u.place[grapheme]! - cutStart;
  if (u.punct && boxCut(u.punct) > 0) return cutStart > 0 ? -cutStart : 0;
  return undefined;
}

/** The segments, text and flags of one line (see the module comment for
 *  the spreading). */
export function composeLine(units: readonly Unit[], range: LineRange, li: number, isLast: boolean, ctx: ComposeContext): VDTLine {
  const us: Unit[] = [];
  for (let k = range.start; k < range.end; k++) us.push(k === range.start && range.first ? range.first : units[k]!);
  if (range.head) us.push(range.head);
  let lastK = range.end - 1;
  while (us.length > 0 && us[us.length - 1]!.kind === 'space') {
    us.pop();
    lastK--;
  }

  const measure = ctx.measureOf(li);
  // A warichu note's characters fold into their two rows (#195).
  if (us.some((u) => u.note)) foldNotes(us, ctx.level, ctx.em);
  // A ruby base at either edge aligns to it with its reading (#194); a
  // Japanese one is laid out again there (#422).
  if (us.some((u) => u.ruby?.jis)) relayJisEdges(us);
  alignEdgeRubies(us);
  const hang = ctx.fit ? fitLine(us, units, range, lastK, isLast, measure, ctx.fit) : undefined;
  const justify = ctx.textAlign === 'justify' && !isLast;
  let spaceWidth: number | undefined;
  let tracking = 0;
  let loose = false;
  let spaceRatio: number | undefined;
  // The same spacing as the breaker bounds it, when the line's own spaces
  // are not regular ones (#704, `justifiedSpaceRatios`).
  let spaceLimitRatio: number | undefined;
  let ragged = false;
  const stretches: boolean[] = [];
  if (justify) {
    let content = 0;
    let spaces = 0;
    let natural = 0;
    let widest = 0;
    let gaps = 0;
    // Han–Latin spaces (`cjk.latinSpacing`): they flex apart from word
    // spaces, and the renderers leave them as set.
    const autos: number[] = [];
    const jlreq = ctx.fit?.jlreq === true;
    for (let j = 0; j < us.length; j++) {
      const u = us[j]!;
      content += u.width;
      // The space after ？！ keeps its em (JLReq §3.1.6).
      if (u.kind === 'space' && u.aki) {
        stretches.push(false);
        continue;
      }
      if (u.kind === 'space' && u.auto) autos.push(j);
      else if (u.kind === 'space') {
        spaces++;
        natural += u.width;
        widest = Math.max(widest, u.width);
      }
      const s = j < us.length - 1 && gapAfterStretches(us, j, jlreq);
      stretches.push(s);
      if (s) gaps++;
    }
    let slack = measure - content;
    if (slack > FIT_EPS) {
      if (gaps > 0 || autos.length > 0) {
        if (spaces > 0) {
          // Word spaces first, up to half an em each, all set alike.
          spaceWidth = Math.max(widest, Math.min((natural + slack) / spaces, Math.max(ctx.em / 2, widest)));
          slack -= spaceWidth * spaces - natural;
          ({ justifiedSpaceRatio: spaceRatio, justifiedSpaceLimitRatio: spaceLimitRatio } = ratiosOf(spaceWidth * spaces, natural, spaces, ctx.normalSpace));
        }
        if (autos.length > 0 && slack > FIT_EPS) {
          // Then the Han–Latin spaces, up to half an em each (clreq
          // §6.2.2.4).
          const caps = autos.map((j) => Math.max(0, emOfFont(us[j]!.style.font) / 2 - us[j]!.width));
          const takes = spread(slack, caps);
          autos.forEach((j, m) => {
            if (takes[m]! <= 0) return;
            us[j] = { ...us[j]!, width: us[j]!.width + takes[m]! };
            slack -= takes[m]!;
          });
        }
        if (slack > FIT_EPS) {
          // Then every gap between characters, the Han–Latin spaces too.
          tracking = slack / (gaps + autos.length);
          if (tracking > ctx.cap + 1e-9) {
            tracking = ctx.cap;
            loose = true;
          }
          for (const j of autos) us[j] = { ...us[j]!, width: us[j]!.width + tracking };
        }
      } else if (spaces > 0 && us.some((u) => u.kind === 'text' && (u.firstCjk || u.lastCjk))) {
        // CJK characters with no gap between them that may spread (phrases
        // glued by word joiners, marks JLReq never spreads next to), and
        // word spaces (#463): the spaces take it all and the line ends on
        // the measure. Their final width is the segments', as every gap of
        // a composed line is; a Latin word space's stretch limit
        // (`justifiedSpaceRatio`, which sets a looser line ragged) is not
        // the rule of a CJK line, so the line reports none.
        spaceWidth = (natural + slack) / spaces;
      } else if (spaces > 0) {
        // Latin words only (an English sentence in a CJK paragraph): the
        // spaces take it all, as in a Latin line (the renderers stretch
        // them, and a line past the ratio is set ragged).
        ({ justifiedSpaceRatio: spaceRatio, justifiedSpaceLimitRatio: spaceLimitRatio } = ratiosOf(natural + slack, natural, spaces, ctx.normalSpace));
      } else if (us.some((u) => u.kind === 'text' && (u.firstCjk || u.lastCjk))) {
        // A CJK character with nothing to spread against.
        loose = true;
      } else {
        // Western text only (the head of a web address, a divided word): set
        // ragged, as a Latin line of one word is, and not reported.
        ragged = true;
      }
    }
  }

  const pieces: Piece[] = [];
  const addText = (u: Unit, text: string, width: number, t: number | undefined): void => {
    // Single characters (not Western runs, which keep a segment each) of
    // one style, link and spacing that advance alike share a segment.
    // A mark that gave up blank is a segment of its own: its glyph may be
    // painted before its box (`inkOffset`), and the caret spreads a
    // segment's width evenly over its characters.
    const cut = u.punct ? boxCut(u.punct) : 0;
    // Upright letters (`:upright[…]`) share a segment with each other only.
    const key = u.stacked || u.run || u.graphemes !== 1 || cut > 0 || u.place || u.orient === 'tcy' ? undefined : `${u.style.key}|${u.link ?? ''}|${t ?? ''}${u.orient ? `|${u.orient}` : ''}`;
    const last = pieces[pieces.length - 1];
    if (key !== undefined && last && last.key === key && last.cell !== undefined && Math.abs(last.cell - width) < 1e-3) {
      last.parts.push(text);
      last.seg.width += width;
      return;
    }
    pieces.push({ seg: segmentOf(u, width, t), parts: [text], key, ...(key !== undefined ? { cell: width } : {}) });
  };
  const segmentOf = (u: Unit, width: number, t: number | undefined, grapheme = 0): PendingSegment => {
    const s = u.style;
    const ink = inkOffsetOf(u, grapheme);
    return {
      kind: 'text',
      text: '',
      width,
      bold: s.bold || undefined,
      italic: s.italic || undefined,
      ...(s.captionLabel ? { captionLabel: true } : {}),
      ...(s.script ? { script: s.script, fontString: s.scriptFont, baselineShift: s.baselineShift } : {}),
      ...(u.stacked === 'first' ? { stacked: true } : {}),
      ...(s.smallCaps ? { smallCaps: true } : {}),
      ...(s.marks ? { cjkMarks: s.marks } : {}),
      ...(s.inserted ? { inserted: true } : {}),
      ...(s.color ? { color: s.color } : {}),
      ...(s.lang !== undefined ? { lang: s.lang } : {}),
      ...(t !== undefined ? { tracking: t } : {}),
      // Every mark that gave up blank carries its ink offset (0 when only
      // the blank after its glyph went), and so does a shared mark set in
      // a Chinese box, so no renderer paints its line in one run at the
      // glyphs' own advances.
      ...(ink !== undefined ? { inkOffset: ink } : {}),
      ...(u.orient === 'tcy' ? { tcy: true as const } : u.orient ? { orientation: u.orient } : {}),
      ...(u.scale !== undefined ? { inkScale: u.scale } : {}),
      ...(u.shift !== undefined ? { baselineShift: u.shift } : {}),
    };
  };
  /** The segment of a ruby base `width` px wide, `t` its tracking. */
  const rubySegment = (u: Unit, width: number, t: number | undefined): PendingSegment => {
    const ruby = u.ruby!;
    const g = ruby.geometry!;
    // The box less the advance kanbun marks add after it (#430).
    const box = u.width - (u.kunten?.extra ?? 0);
    // A Japanese ruby (#422) names its annotation (`id`), so renderers
    // can set one `<ruby>` for a word.
    const jis = ruby.jis !== undefined;
    return {
      ...segmentOf(u, width, t),
      text: u.text,
      ...(g.inset > 1e-9 ? { inkOffset: g.inset } : {}),
      // A base spread 1:2:1 under a longer Japanese reading.
      ...(g.tracking ? { tracking: g.tracking } : {}),
      ruby: {
        text: ruby.span.text,
        fontString: ruby.span.fontString ?? g.runs[0]?.fontString ?? u.style.font,
        baseWidth: ruby.base ?? box - g.inset * 2 - (ruby.position === 'right' ? g.rtWidth : 0),
        rtWidth: g.rtWidth,
        position: ruby.position,
        ...(ruby.span.group ? { group: true } : {}),
        ...(ruby.span.color ? { color: ruby.span.color } : {}),
        ...(jis ? { id: ruby.span.id } : {}),
        ...(jis && ruby.span.jukugo ? { jukugo: true as const } : {}),
        runs: g.runs,
      },
    };
  };
  for (let j = 0; j < us.length; j++) {
    const u = us[j]!;
    if (u.kind === 'space' && (u.auto || u.aki)) {
      pieces.push({ seg: { kind: 'space', text: u.text, width: u.width, autospace: true }, parts: [u.text], key: undefined });
      continue;
    }
    if (u.kind === 'space') {
      // A space inside a reference label (#702) is of the reference.
      const ref = u.token?.refResourceId !== undefined
        ? { refResourceId: u.token.refResourceId, ...(u.token.refAnchor ? { refAnchor: true as const } : {}), ...(u.token.refPageIndex !== undefined ? { refPageIndex: u.token.refPageIndex } : {}), refContinues: true }
        : {};
      pieces.push({ seg: { kind: 'space', text: u.text, width: spaceWidth ?? u.width, ...ref }, parts: [u.text], key: undefined });
      continue;
    }
    if (u.kind === 'atomic') {
      const seg = tokenSegment(u.token!);
      // A side marker carries the gap after the character it marks.
      if (seg.sideMarker && tracking > 0 && stretches[j]) seg.width += tracking;
      pieces.push({ seg, parts: [seg.text], key: undefined });
      continue;
    }
    const gap = tracking > 0 && stretches[j] ? tracking : 0;
    if (u.warichu) {
      // A warichu note's part: the rows are painted, not the text.
      pieces.push({ seg: { kind: 'text', text: u.text, width: u.width + gap, warichu: u.warichu }, parts: [u.text], key: undefined });
      continue;
    }
    if (u.kunten?.vdt) {
      // A character with kanbun marks (#430): a segment of its own, the
      // marks painted from its start; the room they take after it (inline
      // 返り点, a 竪点, 送り仮名 that run past it) and the gap follow as a
      // space of their own, so the character is painted at its natural
      // spacing (a ruby base in it centred under its reading).
      const extra = u.kunten.extra ?? 0;
      const own = u.width - extra;
      const seg: PendingSegment = u.ruby?.geometry ? rubySegment(u, own, undefined) : { ...segmentOf(u, own, undefined), text: u.text };
      seg.kunten = u.kunten.vdt;
      pieces.push({ seg, parts: [u.text], key: undefined });
      if (extra + gap > 0) pieces.push({ seg: { kind: 'space', text: '', width: extra + gap, autospace: true }, parts: [''], key: undefined });
      continue;
    }
    if (u.ruby?.geometry) {
      // A ruby base: centred in its box, its reading placed from the box's
      // start (#194). One character takes the gap after it as tracking; a
      // base of several keeps its natural spacing, centred under its
      // reading, and the gap follows the box as a space of its own (its
      // width final, as a Han–Latin space's is): tracking would be added
      // after each of its characters.
      const gapAfter = gap > 0 && u.graphemes > 1;
      const seg = rubySegment(u, gapAfter ? u.width : u.width + gap, gap > 0 && !gapAfter ? gap : undefined);
      pieces.push({ seg, parts: [u.text], key: undefined });
      if (gapAfter) pieces.push({ seg: { kind: 'space', text: '', width: gap, autospace: true }, parts: [''], key: undefined });
      continue;
    }
    if (u.place && u.graphemes === 2) {
      // A pair (—— ……) set in Chinese boxes: one segment per grapheme,
      // each glyph placed in its own em.
      const cell = u.width / 2;
      pieces.push({ seg: { ...segmentOf(u, cell, undefined, 0), text: u.text[0]! }, parts: [u.text[0]!], key: undefined });
      pieces.push({ seg: { ...segmentOf(u, cell + gap, gap > 0 ? gap : undefined, 1), text: u.text[1]! }, parts: [u.text[1]!], key: undefined });
    } else if (gap === 0) {
      addText(u, u.text, u.width, undefined);
    } else if (ctx.vertical && u.run) {
      // In vertical text a run is painted whole, its cells and sideways
      // letters as it was measured: the gap after it is advance only, and
      // cutting its last letter off would lose the neighbour an apostrophe
      // or an interpunct inside it is read with (`verticalRuns`).
      addText(u, u.text, u.width + gap, undefined);
    } else if (u.graphemes <= 1) {
      addText(u, u.text, u.width + gap, gap);
    } else {
      // A run the gap follows: its last grapheme carries the gap, the rest
      // keeps its natural spacing.
      const lastG = lastGrapheme(u.text);
      const head = u.text.slice(0, u.text.length - lastG.length);
      const headWidth = textWidth(head, u.style.font, u.style.smallCaps) + (ctx.letterSpacingPx === 0 ? 0 : ctx.letterSpacingPx * (u.graphemes - 1));
      addText(u, head, headWidth, undefined);
      addText(u, lastG, u.width - headWidth + gap, gap);
    }
  }
  const segments: VDTLineSegment[] = [];
  for (const p of pieces) {
    if (p.parts.length > 1 || p.seg.text === '') p.seg.text = p.parts.join('');
    segments.push(p.seg);
  }
  const trimmed = trimChipLineEdges(segments);
  clampReadings(trimmed);
  let width = 0;
  for (const s of trimmed) width += s.width;
  if (hang) {
    // The hung mark follows the line, outside its measure and its width.
    trimmed.push({ ...segmentOf(hang, hang.width, undefined), text: hang.text, hangs: true });
  }
  const text = trimmed.map((s) => s.text).join('');
  const y = li * ctx.lineHeightPx;
  return {
    text,
    bbox: createBoundingBox(ctx.indentOf(li), y, width, ctx.lineHeightPx),
    baseline: y + ctx.baselineOffset,
    hyphenated: range.hyphenated,
    ...(range.hyphenated && range.hardHyphen ? { hardHyphen: true } : {}),
    segments: trimmed,
    isLastLine: isLast,
    ...(spaceRatio !== undefined && !loose ? { justifiedSpaceRatio: spaceRatio, ...(spaceLimitRatio !== undefined ? { justifiedSpaceLimitRatio: spaceLimitRatio } : {}) } : {}),
    ...(loose ? { ragged: true, cjkLoose: true } : ragged ? { ragged: true } : {}),
    cjkComposed: true,
  };
}
