// Lines kept as Postext broke them: a paragraph's lines each end in a
// forced line break and stand on the baseline Postext gave them (their
// leading is the distance from the line before), so InDesign, which sets
// the text again with its own composer, has nothing left to decide. A
// justified line that ends in a forced break is spread to the measure, as
// Postext spread it; the paragraph's last line stays ragged.
//
// A paragraph becomes several when its lines cannot share one paragraph's
// format: lines that start or end at different places (text beside a drop
// cap, round a picture), which are written a line a paragraph, and a line
// the author broke (`\`) in justified text, which InDesign would spread:
// the paragraph ends there and the next one goes on without an indent.

import type { DisplayLine } from 'postext';
import { escapeXml } from '../xml/write.js';
import { overrides, type LineStop, type TextRun } from './paragraphs.js';
import { attr, num, type ParagraphFormat, type ParagraphStyleDef, type TextProps } from './parts.js';
import { characterStyle, runCharacterStyle } from './styles.js';
import type { StoryPara } from './story.js';
import { unkerned, VERTICAL_KEPT, VERTICAL_KEPT_PROPS, VERTICAL_RANGE } from './vertical.js';
import { lineJoin } from './thread.js';
import type { StoryItem, Writer } from './writer.js';

/** Characters InDesign shows as a missing glyph when the face lacks them
 *  and that set nothing: the word joiner and the zero-width no-break
 *  space. (A soft hyphen stays: InDesign reads it as a discretionary
 *  hyphen.) */
const NO_GLYPH = /[\u2060\uFEFF]/g;

/** A leading as IDML writes one: a property, not an attribute. */
export const leadingXml = (pt: number): string => `<Leading type="unit">${num(pt)}</Leading>`;

/** One run as a character range: what it sets beyond its paragraph style,
 *  its font when it is another family's, its words, and its line's
 *  leading when that is its own. */
export function rangeXml(r: TextRun, style: TextProps, leading?: number, noBreak = false, w?: Writer): string {
  if (r.link && w) {
    const source = w.next();
    w.links.push({ source, ...(r.link.url !== undefined ? { url: r.link.url } : { page: w.pageBase + r.link.page! }) });
    return `<HyperlinkTextSource${attr('Self', source)}${attr('Name', `Link ${w.links.length}`)} Hidden="false" AppliedCharacterStyle="n">${rangeXml({ text: r.text, props: r.props, ...(r.extra ? { extra: r.extra } : {}), ...(r.named ? { named: r.named } : {}) }, style, leading, noBreak, w)}</HyperlinkTextSource>`;
  }
  // A run a named style set, or in a face or size the paragraph style has
  // not, takes a character style (#1555); the range then sets only what
  // differs from the paragraph style with the character style over it.
  const csName = w && !r.object ? runCharacterStyle(r.named, r.props, style) : undefined;
  const cs = csName && w ? characterStyle(w, csName, r.props) : undefined;
  const base: TextProps = cs ? { ...style, ...cs.props } : style;
  const o = overrides(r.props, base) + (r.extra ?? '') + (noBreak ? ' NoBreak="true"' : '');
  const props = (r.props.font !== base.font ? `<AppliedFont type="string">${escapeXml(r.props.font)}</AppliedFont>` : '') + (leading !== undefined ? leadingXml(leading) : '');
  const font = props ? `<Properties>${props}</Properties>` : '';
  const content = r.object ?? r.text.replace(NO_GLYPH, '').split(' ').map((t) => (t ? `<Content>${escapeXml(t)}</Content>` : '')).join('<Content> </Content>');
  return `<CharacterStyleRange${attr('AppliedCharacterStyle', cs?.self ?? 'CharacterStyle/$ID/[No character style]')}${o}>${font}${content}</CharacterStyleRange>`;
}

export const FORCED_LINE_BREAK = '\u2028';

export interface KeptContext {
  style: ParagraphStyleDef;
  /** The frame's text edges, sheet px. */
  edge: { left: number; right: number };
  /** The item's format as one paragraph (a list item's hang included). */
  format: ParagraphFormat;
  hang: boolean;
  /** Leading of the item's first line, pt. */
  firstLeading: number;
  spaceBefore: number | undefined;
  /** Tab stops the lines need beside the style's (leaders of a contents
   *  row), by line. */
  stops?: LineStop[][];
  /** In a thread (`w.joins`), what the paragraph end before the item
   *  was: told with the item's first paragraph. */
  join?: string;
  /** Ranges that open the item's first paragraph (anchored frames). */
  lead?: string;
}

const spread = (v: number[]): number => (v.length ? Math.max(...v) - Math.min(...v) : 0);

/** The paragraphs of one text item with its lines kept. */
export function keptParagraphs(w: Writer, item: StoryItem, perLine: TextRun[][], c: KeptContext): StoryPara[] {
  const lines = item.lines;
  const { style, edge, format } = c;
  const start = (l: DisplayLine) => l.x - edge.left;
  const room = (l: DisplayLine) => edge.right - l.x - l.width;
  const pt = (px: number) => (Math.abs(px) < 0.01 ? 0 : px * w.k);
  const justified = lines.some((l) => l.align === 'justify');
  // Lines after the first that do not share a start, or lines that do not
  // share an end: no one paragraph format sets them.
  // Lines with stops of their own: a paragraph's stops serve all its lines.
  const ownStops = lines.length > 1 && !!c.stops?.some((s) => s?.length);
  // (Right-to-left lines share their start at the right and may end apart
  // at the left by a first-line indent.)
  const rtlItem = lines.some((l) => l.rtl);
  const irregular =
    !c.hang && lines.length > 1 && (ownStops || (rtlItem ? spread(lines.slice(1).map(room)) > 0.75 || spread(lines.map(start)) > 0.75 : spread(lines.slice(1).map(start)) > 0.75 || spread(lines.map(room)) > 0.75));
  const cuts: number[] = [];
  lines.forEach((_, i) => {
    // A line that ends a paragraph inside the item (a table cell's
    // paragraphs), or one the author broke in justified text.
    if (i === 0 || irregular || lines[i - 1]!.last || (justified && lines[i - 1]!.hardBreak)) cuts.push(i);
  });
  const out: StoryPara[] = [];
  // In a thread, what each break and paragraph end written was
  // (`thread.ts`): the one before the group, then one per line break.
  const codes = w.joins;
  cuts.forEach((a, g) => {
    const before = g === 0 ? c.join : lines[a - 1]!.last ? 'p' : lineJoin(lines[a - 1]!, lines[a]);
    const b = (cuts[g + 1] ?? lines.length) - 1;
    const group = lines.slice(a, b + 1);
    const tail = group[group.length - 1]!;
    // Lines that run right to left start at the right: the first-line
    // indent is told from there, and the paragraph is a right-to-left one,
    // set by the composer that shapes Arabic and Hebrew.
    const rtl = group.some((l) => l.rtl);
    let fmt: ParagraphFormat;
    if (rtl && !c.hang) {
      const right = Math.max(0, group.length > 1 ? Math.min(...group.slice(1).map(room)) : room(group[0]!));
      fmt = {
        leftIndent: pt(Math.max(0, Math.min(...group.map(start)))),
        firstLineIndent: pt(room(group[0]!) - right),
        rightIndent: pt(right),
        spaceAfter: g === cuts.length - 1 ? format.spaceAfter : 0,
        tabs: format.tabs,
      };
    } else if (cuts.length === 1) fmt = format;
    else if (c.hang) fmt = g === 0 ? { ...format, spaceAfter: 0 } : { ...format, firstLineIndent: 0, spaceAfter: g === cuts.length - 1 ? format.spaceAfter : 0, tabs: [] };
    else {
      const left = Math.max(0, group.length > 1 ? Math.min(...group.slice(1).map(start)) : start(group[0]!));
      fmt = {
        leftIndent: pt(left),
        firstLineIndent: pt(start(group[0]!) - left),
        rightIndent: pt(Math.max(0, Math.min(...group.map(room)))),
        spaceAfter: g === cuts.length - 1 ? format.spaceAfter : 0,
        tabs: format.tabs,
      };
    }
    const lineStops = group.flatMap((_, k) => c.stops?.[a + k] ?? []);
    if (lineStops.length) {
      fmt = { ...fmt, tabs: lineStops.map((s) => ({ position: pt(s.x - edge.left), alignment: 'LeftAlign' as const, ...(s.leader ? { leader: s.leader } : {}) })).sort((x, y) => x.position - y.position) };
    }
    // A group that ends on a justified line goes on (in the next group, or
    // in the next column or page): its last line is spread too.
    const justification = group.some((l) => l.align === 'justify')
      ? tail.align === 'justify'
        ? 'FullyJustified'
        : rtl
          ? 'RightJustified'
          : 'LeftJustified'
      : group[0]!.align === 'center'
        ? 'CenterAlign'
        : group[0]!.align === 'right'
          ? 'RightAlign'
          : 'LeftAlign';
    const lead = (i: number) => (i === 0 ? c.firstLeading : Math.max(0.1, (lines[i]!.baseline - lines[i - 1]!.baseline) * w.k));
    let attrs = '';
    if (style.justification !== justification) attrs += attr('Justification', justification);
    if (rtl) attrs += ' ParagraphDirection="RightToLeftDirection" Composer="$ID/HL Single Optyca"';
    // Lines that run down the page: the Japanese composer, with nothing
    // left for it to space or break.
    const vertical = group.some((l) => l.vertical);
    if (vertical) attrs += VERTICAL_KEPT;
    let ranges = out.length === 0 && c.lead ? c.lead : '';
    const breaks: string[] = [];
    for (let i = a; i <= b; i++) {
      // Leading is a character's: every range of the line says it.
      const extra = Math.abs(lead(i) - style.leading) >= 0.01 ? lead(i) : undefined;
      const runs = perLine[i] ?? [];
      const last = i < b;
      // A line cannot break but where Postext broke it: InDesign's
      // composer, left a choice, ends a tightly set line a word early.
      for (const r of runs) ranges += rangeXml(vertical ? unkerned(r) : r, style.props, extra, true, w);
      // The break is a range of its own (it must stay a place to break),
      // at its line's leading and size: an empty line still takes its room.
      if (last) {
        breaks.push(lineJoin(lines[i]!, lines[i + 1]));
        const tail = runs[runs.length - 1];
        ranges += rangeXml({ text: FORCED_LINE_BREAK, props: tail?.props ?? style.props, ...(tail?.named ? { named: tail.named } : {}), ...(vertical ? { extra: VERTICAL_RANGE } : {}) }, style.props, extra, false, w);
      }
    }
    if (!ranges) return;
    if (codes) {
      // (The item's first paragraph told after the paragraph before it,
      // a later one after the group before.)
      if (before !== undefined && (g === 0 || out.length)) codes.push(before);
      codes.push(...breaks);
    }
    out.push({ style, attrs, format: fmt, ranges, ...(vertical ? { properties: VERTICAL_KEPT_PROPS } : {}), ...(g === 0 && c.spaceBefore !== undefined ? { spaceBefore: c.spaceBefore } : {}) });
  });
  return out;
}
