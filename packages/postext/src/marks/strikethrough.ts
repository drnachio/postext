/**
 * Struck-through text (`~~text~~`): a line through the words, as a price
 * list strikes the old price beside the new one. The parser keeps the text
 * as ordinary text (its range rides on `InlineSpan.links`, so the layout is
 * the one without the line) and the measurer stamps it on the segments of
 * its words (`VDTLineSegment.strike`). Once the document is laid out, each
 * line holding struck words gets a `VDTLine.marks` line through each run of
 * them, placed where the renderers paint the segments
 * ({@link segmentPositions}: alignment, justified word spaces and the
 * line's paint order included), which every renderer draws as it draws the
 * Chinese marks: the canvas, the PDF, the HTML and SVG outputs, on
 * horizontal and vertical pages alike.
 *
 * A run is the struck words of one `~~…~~` that follow each other along
 * the line, with the spaces between them; a run broken over two lines gets
 * a line on each, and two runs side by side keep two lines. The line goes
 * through the struck characters only: a full stop glued to the run stays
 * out. It sits where the face puts its strikeout and is as thick as the
 * face says (OS/2 `yStrikeoutPosition` and `yStrikeoutSize`, read from the
 * face's files, `fonts/strikeout.ts`), each face of the run on its own: a
 * run that changes face (a bold word, another family, another size) is
 * drawn in pieces that meet. A face whose file the engine has not read
 * takes 0.28 em over the baseline (about the middle of the lowercase
 * letters) and 0.05 em. In Chinese and Japanese text and on a vertical page
 * the line runs on the central axis of the em box. A superscript or
 * subscript inside the run does not move it. It is at least half a pixel
 * thick, in the colour the run's text is painted in.
 *
 * Underlined text (`++text++`, `VDTLineSegment.underline`) is drawn the
 * same way, under the words: where the face puts its underline (`post`
 * `underlinePosition` and `underlineThickness`), else 0.12 em under the
 * baseline and 0.05 em thick. In Chinese and Japanese text and on a
 * vertical page it is drawn as a solid side line (傍線, `:sideline[…]`)
 * in its default place: under the em box in horizontal text, on its right
 * (over) on a vertical page, as JLReq sets 傍線. Where it runs under a link and
 * the document underlines its links (`links.style`), the piece under the
 * link is marked `underLink`: an output that draws the link's own line
 * leaves it out, so the two lines do not sit one on the other.
 */

import type { VDTBlock, VDTDocument, VDTLine, VDTLineMark, VDTLineSegment } from '../vdt.js';
import { segmentFont, segmentPositions } from './cjkMarks.js';
import { textLineGroups } from './highlightMarks.js';
import { CENTRAL } from '../measure/cjk/cjkAnnotate.js';
import { hasCJK } from '../measure/cjk/cjk.js';
import { measureTextWidth } from '../measure/canvas.js';
import { fontEm } from '../measure/vertical.js';

import { STRIKE_AT, STRIKE_STROKE, UNDERLINE_AT, UNDERLINE_STROKE } from './strikeGeometry.js';
import { strikeoutOf, underlineOf } from '../fonts/strikeout.js';
import { styledLinkOf } from './linkUnderline.js';
import { LINE_AT, STROKE } from './cjkMarks/geometry.js';

/** Which line: through struck-through text or under underlined text. */
export type Rule = 'strike' | 'underline';

export type BlockLike = Parameters<typeof segmentPositions>[1] & Partial<Pick<VDTBlock, 'boldColor' | 'italicColor'>>;

/** Where the struck characters of a segment start and end, px from its
 *  start: all of it, or the part `from`–`to` of a left-to-right text
 *  segment. */
function struckExtent(seg: VDTLineSegment, width: number, font: string, rule: Rule = 'strike'): [number, number] {
  const s = seg[rule]!;
  if (s.from === undefined || s.to === undefined || seg.rtl || seg.kind !== 'text') return [0, width];
  const whole = measureTextWidth(seg.text, font);
  if (!(whole > 0)) return [0, width];
  const k = width / whole;
  return [measureTextWidth(seg.text.slice(0, s.from), font) * k, measureTextWidth(seg.text.slice(0, s.to), font) * k];
}

/** Where the line through a segment goes across the line (px from the
 *  baseline, negative up) and how thick it is: from its face's strikeout
 *  (OS/2, `fonts/strikeout.ts`) when a file of the face was read, else
 *  {@link STRIKE_AT} and {@link STRIKE_STROKE}. Chinese and Japanese text
 *  and a vertical page put it on the central axis of the em box. */
export function strikeGeometry(seg: VDTLineSegment, font: string, vertical: boolean, rule: Rule = 'strike'): { y: number; thickness: number } {
  const em = fontEm(font);
  const under = rule === 'underline';
  const face = under ? underlineOf(font) : strikeoutOf(font);
  const central = vertical || (seg.kind === 'text' && hasCJK(seg.text));
  // As a side line in its default place (`marks/cjkMarks/lineMarks.ts`):
  // under the em box, or on its right on a vertical page.
  if (central && under) {
    const side = vertical ? -1 : 1;
    return { y: -CENTRAL * em + side * (0.5 + LINE_AT) * em + (seg.baselineShift ?? 0), thickness: Math.max(0.5, STROKE * em) };
  }
  const position = central ? CENTRAL : face?.position ?? (under ? UNDERLINE_AT : STRIKE_AT);
  return { y: -position * em + (seg.baselineShift ?? 0), thickness: Math.max(0.5, (face?.size ?? (under ? UNDERLINE_STROKE : STRIKE_STROKE)) * em) };
}

/** The colour a segment's text is painted in, when it is not the block's. */
export function colorOf(seg: VDTLineSegment, block: BlockLike): string | undefined {
  if (seg.color) return seg.color;
  if (seg.bold && block.boldColor) return block.boldColor;
  if (seg.italic && block.italicColor) return block.italicColor;
  return undefined;
}

/** The strikethrough lines of a line, relative to it; empty when it holds
 *  no struck word. `vertical`: the line is set on a vertical page. `rule`
 *  `underline`: the lines under its underlined words instead. `links`:
 *  the document underlines its links, and an underline's piece under a
 *  link is marked `underLink`. */
export function lineStrikes(line: VDTLine, block: BlockLike, vertical = false, rule: Rule = 'strike', links = false): VDTLineMark[] {
  const segments = line.segments;
  if (!segments || !segments.some((s) => s[rule])) return [];
  const { xs, widths } = segmentPositions(line, block);
  const order = line.order && line.order.length === segments.length ? line.order : segments.map((_, i) => i);
  // Each segment's x in the line's paint order.
  const at = xs.slice();
  let x = xs[0] ?? line.bbox.x;
  for (const i of order) {
    at[i] = x;
    x += widths[i]!;
  }
  const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  const out: VDTLineMark[] = [];
  // A piece of a run: one face's line (where it sits across the line and
  // how thick it is), from `from` to `to`.
  type Run = { id: number; from: number; to: number; y: number; thickness: number; color?: string; underLink?: boolean };
  const linked = (seg: VDTLineSegment): boolean => links && rule === 'underline' && styledLinkOf(seg) !== undefined;
  let run: Run | undefined;
  // The run's words go on after a space: a piece that starts there in
  // another face takes the space into the piece before it.
  let bridged = false;
  const flush = (): void => {
    const r = run;
    run = undefined;
    if (!r || !(r.to > r.from)) return;
    out.push({
      kind: 'line',
      x: r.from - line.bbox.x,
      y: r.y,
      length: r.to - r.from,
      thickness: r.thickness,
      ...(r.color !== undefined ? { color: r.color } : {}),
      ...(r.underLink ? { underLink: true as const } : {}),
    });
  };
  for (let k = 0; k < order.length; k++) {
    const i = order[k]!;
    const seg = segments[i]!;
    const strike = seg[rule];
    if (!strike) {
      // A space between two words of one run carries the line on.
      if (run && seg.kind === 'space') {
        let j = k + 1;
        while (j < order.length && segments[order[j]!]!.kind === 'space' && !segments[order[j]!]![rule]) j++;
        const next = j < order.length ? segments[order[j]!] : undefined;
        if (next?.[rule]?.id === run.id) {
          bridged = true;
          continue;
        }
      }
      flush();
      bridged = false;
      continue;
    }
    const font = segmentFont(seg, block);
    const [from, to] = struckExtent(seg, widths[i]!, font, rule);
    // The tracking after the last letter is no part of the word.
    const trail = seg.kind === 'text' && (strike.to === undefined || strike.to >= seg.text.length) ? tracking + (seg.tracking ?? 0) : 0;
    const left = at[i]! + from;
    const right = at[i]! + Math.max(from, to - trail);
    const color = colorOf(seg, block);
    const sameRun = run !== undefined && run.id === strike.id;
    const underLink = linked(seg);
    const continues = sameRun && run!.color === color && !!run!.underLink === underLink;
    // A superscript or a subscript does not move the line: the run's text
    // around it decides where it goes.
    if (continues && seg.script) {
      run!.to = Math.max(run!.to, right);
      bridged = false;
      continue;
    }
    const { y, thickness } = strikeGeometry(seg, font, vertical, rule);
    if (continues && Math.abs(run!.y - y) < 1e-6 && Math.abs(run!.thickness - thickness) < 1e-6) {
      run!.from = Math.min(run!.from, left);
      run!.to = Math.max(run!.to, right);
      bridged = false;
      continue;
    }
    // Another face (another cut, family or size) or colour of the same
    // run: its own piece, the one before it reaching up to where this one
    // starts.
    // Out of a link, the piece after it reaches back instead: the link's
    // own line ends with its last word.
    const meets = sameRun && (bridged || Math.abs(run!.to - left) < 0.5);
    const start = meets && run!.underLink && !underLink ? run!.to : left;
    if (meets && start === left) run!.to = Math.max(run!.to, left);
    flush();
    bridged = false;
    run = { id: strike.id, from: start, to: right, y, thickness, ...(color !== undefined ? { color } : {}), ...(underLink ? { underLink } : {}) };
  }
  flush();
  return out;
}

/** The lines each line was given by the last pass: a line object shared
 *  by two builds (a cached measurement) gets its strikes again, once. */
const given = new WeakMap<VDTLine, VDTLineMark[]>();

/** Draw the strikethrough and underline lines of every line of the
 *  document that holds struck-through or underlined text (see the module comment): paragraphs, headings,
 *  list items, notes and the texts of resource blocks (table cells,
 *  captions), which are set horizontally on every page. */
export function strikeDocument(doc: VDTDocument): void {
  // As `underlineDocumentLinks` decides whether links get their own line.
  const style = doc.config?.links?.style;
  const links = !!style && style.underline !== 'none' && doc.config.layout.writingMode !== 'vertical-rl';
  for (const { lines, like } of textLineGroups(doc)) {
    // A flow block on a vertical page is set vertically; a resource
    // block's text never is.
    const block = 'lines' in like ? (like as VDTBlock) : undefined;
    const vertical = block !== undefined && doc.pages[block.pageIndex]?.flow?.writingMode === 'vertical-rl';
    for (const line of lines) {
      const before = given.get(line);
      if (!before && !line.segments?.some((s) => s.strike || s.underline)) continue;
      const kept = before ? (line.marks ?? []).filter((m) => !before.includes(m)) : line.marks ?? [];
      const marks = [...lineStrikes(line, like, vertical), ...lineStrikes(line, like, vertical, 'underline', links)];
      given.set(line, marks);
      if (kept.length + marks.length > 0) line.marks = [...kept, ...marks];
      else delete line.marks;
    }
  }
}
