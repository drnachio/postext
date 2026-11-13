// Stories: a frame's (or a chain's) text items as paragraphs under
// paragraph styles, with the indents, tab stops and spacing the engine
// set them with.

import type { VDTFrame } from 'postext/writer';
import { resolveBodyStyle, resolveParagraphStyle, type BlockStyle } from 'postext/writer';
import { deriveCalloutResolvedConfig } from 'postext/writer';
import { resolvedLocale } from 'postext/writer';
import { resolveTabSettings } from 'postext/writer';
import { linesRuns, type LineStop, paragraphJustification, paragraphRuns, sameProps, textScale, type TextRun } from './paragraphs.js';
import { keptParagraphs, rangeXml } from './keptLines.js';
import { paragraphStyle } from './styles.js';
import {
  attr,
  DOM_VERSION,
  NO_FORMAT,
  paragraphFormatAttrs,
  PKG_NS,
  tabListXml,
  XML_HEAD,
  type ParagraphFormat,
  type ParagraphStyleDef,
  type TabStopDef,
  type TextProps,
} from './parts.js';
import { isVertical, unkerned, VERTICAL_REFLOW } from './vertical.js';
import { frameName, keepsLines, type StoryItem, type TextItem, type Writer } from './writer.js';

const STYLE_NAMES: Record<string, string> = { body: 'Body', heading: 'Heading', list: 'List', quote: 'Quote', caption: 'Caption', footnote: 'Footnote', header: 'Header', footer: 'Footer', design: 'Design' };

function paragraphStyleName(w: Writer, item: TextItem, frame: VDTFrame | undefined): string {
  // A halo's copy of a text is stroked: a style of its own.
  if (w.halo) return `${paragraphStyleName({ ...w, halo: undefined }, item, frame)} (halo)`;
  const names = { ...STYLE_NAMES, ...w.opts.styleNames };
  if (item.role === 'heading') return `${names.heading ?? 'Heading'} ${item.level ?? 1}`;
  if (frame) return frame.styleId ?? frameName(frame.name);
  // A paragraph the author set in a paragraph style takes its name; one in
  // a box of the flow, the box's (its title, the box's and "title"), as a
  // composed frame's paragraphs do (#1555). Under the role's name they
  // would share a style with paragraphs of another look.
  if (item.role === 'body' && item.paragraphStyle) return item.paragraphStyle;
  const box = calloutOf(w, item);
  if (box && item.role === 'body') return box;
  if (box && item.role === 'callout') return `${box} title`;
  return names[item.role] ?? item.role;
}

/** The callout style of the flow box a text item stands in. */
const calloutOf = (w: Writer, item: TextItem): string | undefined => (item.source?.blockKey ? w.callouts?.get(item.source.blockKey) : undefined);

/** The block style the engine set a body paragraph in (its frame's callout
 *  style's body, or its paragraph style in that body), for what its lines
 *  do not show: its tab stops and the space after it. Undefined for other
 *  text (headings, list items, notes). */
function engineStyle(w: Writer, item: TextItem, frame: VDTFrame | undefined): BlockStyle | undefined {
  if (item.role !== 'body') return undefined;
  const key = `${frame?.styleId ?? calloutOf(w, item) ?? ''}\u0000${item.paragraphStyle ?? ''}`;
  let style = w.blockStyles.get(key);
  if (!style) {
    const config = w.doc.config;
    // (A box of the flow sets its paragraphs in its own body, #1555.)
    const boxId = frame?.styleId ?? calloutOf(w, item);
    const callout = boxId ? config.calloutStyles.find((s) => s.id === boxId) : undefined;
    const resolved = callout ? deriveCalloutResolvedConfig(config, callout) : config;
    const para = item.paragraphStyle ? resolved.paragraphStyles.find((s) => s.id === item.paragraphStyle) : undefined;
    style = para ? resolveParagraphStyle(para, resolved) : resolveBodyStyle(resolved);
    w.blockStyles.set(key, style);
  }
  return style;
}

const TAB_ALIGN: Record<string, TabStopDef['alignment']> = { start: 'LeftAlign', end: 'RightAlign', center: 'CenterAlign', decimal: 'CharacterAlign' };

/** A block style's tab stops (#622) as InDesign's. Postext measures a stop
 *  from the start of the paragraph's measure (after a paragraph style's
 *  indent), InDesign from the frame's text edge; `measurePx` is the frame's
 *  text width on the sheet. A default interval becomes stops up to the
 *  measure's end, a rule leader underscores. */
function styleTabs(w: Writer, style: BlockStyle | undefined, measurePx: number, sc: number): TabStopDef[] {
  if (!style) return [];
  const tabs = resolveTabSettings(style.tabStops, style.tabInterval, w.doc.config.page.dpi, style.fontSizePx, resolvedLocale(w.doc.config));
  if (!tabs) return [];
  const indent = style.indentPx ?? 0;
  const measure = Math.max(0, measurePx / sc - indent - (style.endIndentPx ?? 0));
  const pt = (px: number) => (indent + px) * sc * w.k;
  const out: TabStopDef[] = [];
  let last = 0;
  for (const s of tabs.stops) {
    const px = s.at === 'end' ? measure : typeof s.at === 'number' ? s.at : (s.at.percent / 100) * measure;
    last = Math.max(last, px);
    out.push({ position: pt(px), alignment: TAB_ALIGN[s.align] ?? 'LeftAlign', ...(s.align === 'decimal' ? { character: s.decimalChar } : {}), ...(s.leader ? { leader: s.leader === 'rule' ? '_' : s.leader } : {}) });
  }
  const step = tabs.intervalPx;
  if (step) for (let px = (Math.floor(last / step) + 1) * step; px <= measure + 0.01 && out.length < 64; px += step) out.push({ position: pt(px), alignment: 'LeftAlign' });
  return out.sort((a, b) => a.position - b.position);
}

/** The text edges (sheet px) of each frame a story's items stand in, as
 *  the text frame's insets put them: the union of its items' boxes. */
function textEdges(items: readonly TextItem[]): Map<string, { left: number; right: number }> {
  const out = new Map<string, { left: number; right: number }>();
  for (const it of items) {
    if (!it.lines.length) continue;
    const key = it.frame ?? '';
    const e = out.get(key);
    const right = it.bbox.x + it.bbox.width;
    out.set(key, e ? { left: Math.min(e.left, it.bbox.x), right: Math.max(e.right, right) } : { left: it.bbox.x, right });
  }
  return out;
}

/** A paragraph's indents (pt) from where the engine set its lines against
 *  its frame's text edges: the turnover lines' start is the left indent,
 *  the first line's start past it the first-line indent, the room every
 *  line leaves before the right edge the right indent. A paragraph of one
 *  line takes `basePx` (where its style starts a turnover line) as its
 *  left indent, when known. Lines of right-to-left text are not read; a
 *  vertical item's lines are read in the frame of lines (`vertical.ts`),
 *  where the left indent is the one at a line's head. */
function lineIndents(w: Writer, item: TextItem, edge: { left: number; right: number }, basePx: number | undefined): { left: number; first: number; right: number } {
  const lines = item.lines.filter((l) => !l.rtl);
  if (!lines.length) return { left: 0, first: 0, right: 0 };
  const starts = lines.map((l) => l.x - edge.left);
  const left = Math.max(0, lines.length > 1 ? Math.min(...starts.slice(1)) : (basePx ?? starts[0]!));
  const first = Math.max(-left, starts[0]! - left);
  const right = Math.max(0, Math.min(...lines.map((l) => edge.right - l.x - l.width)));
  const pt = (px: number) => (Math.abs(px) < 0.01 ? 0 : px * w.k);
  return { left: pt(left), first: pt(first), right: pt(right) };
}

/** A paragraph of a story, written once the next one has said how far
 *  apart they stand. */
export interface StoryPara {
  style: ParagraphStyleDef;
  /** Leading, alignment, hyphenation the paragraph sets itself. */
  attrs: string;
  format: ParagraphFormat;
  spaceBefore?: number;
  ranges: string;
  /** The rest of the paragraph before it (a paragraph a frame break split). */
  joins?: boolean;
  /** The text after it starts in the next frame of the chain. */
  frameBreak?: boolean;
  /** Properties the paragraph sets beside its tab stops (a vertical
   *  paragraph's line-breaking and spacing sets). */
  properties?: string;
}

/** A paragraph's range: its style, what it sets beyond it, its text, and
 *  a paragraph return unless the story ends there or the next range is the
 *  rest of the paragraph (`end`). */
function paraXml(p: StoryPara, end: boolean): string {
  const s = p.style.format;
  const own = (a: number, b: number) => (Math.abs(a - b) >= 0.01 ? a : undefined);
  const local = paragraphFormatAttrs({
    leftIndent: own(p.format.leftIndent, s.leftIndent),
    firstLineIndent: own(p.format.firstLineIndent, s.firstLineIndent),
    rightIndent: own(p.format.rightIndent, s.rightIndent),
    spaceAfter: own(p.format.spaceAfter, s.spaceAfter),
  });
  const tabs = tabListXml(p.format.tabs);
  const set = (p.properties ?? '') + (tabs !== tabListXml(s.tabs) ? tabs : '');
  const props = set ? `<Properties>${set}</Properties>` : '';
  const ranges = end
    ? p.ranges
    : p.frameBreak
      ? `${p.ranges}<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]" ParagraphBreakType="NextFrame"><Br/></CharacterStyleRange>`
      : p.ranges.endsWith('</CharacterStyleRange>')
        ? p.ranges.replace(/<\/CharacterStyleRange>$/, '<Br/></CharacterStyleRange>')
        : `${p.ranges}<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Br/></CharacterStyleRange>`;
  return `<ParagraphStyleRange${attr('AppliedParagraphStyle', p.style.self)}${p.attrs}${local}${attr('SpaceBefore', p.spaceBefore)}>${props}${ranges}</ParagraphStyleRange>`;
}

/** A story: one paragraph per text item. A list item's marker joins its
 *  item's paragraph (marker, tab, text, hanging indent). The items are as
 *  painted (`asPainted`); what the engine's style gives (stops, the turnover
 *  indent, the space after) follows the frame's text scale
 *  (`fit.shrinkText`). Indents come from where the lines stand, tab stops
 *  and the space after from the style the engine set the paragraph in; the
 *  paragraph style takes those of its first paragraph, a paragraph sets
 *  what differs.
 *
 *  With lines kept (the default) every line ends in a forced line break
 *  on its own baseline (`keptLines.ts`), and the text of each frame of a
 *  chain ends in a frame break, so nothing moves from where Postext set
 *  it. Left to InDesign's composer (`lineBreaks: 'reflow'`), the rest of a
 *  paragraph a frame break split joins its paragraph and the story runs
 *  through the chain as InDesign breaks it. */
export function storyXml(w: Writer, id: string, items: StoryItem[], frame: VDTFrame | undefined): string {
  // A story whose lines run right to left is a right-to-left story.
  const rtl = items.some((i) => i.lines.some((l) => l.rtl));
  // One whose lines run down the page is a vertical story (`vertical.ts`).
  return storyPartXml(id, paragraphsXml(w, items, frame), rtl, items.some(isVertical));
}

/** A story part around its paragraphs. */
export function storyPartXml(id: string, paragraphs: string, rtl = false, vertical = false): string {
  return (
    `${XML_HEAD}<idPkg:Story xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">` +
    `<Story${attr('Self', id)} AppliedTOCStyle="n" TrackChanges="false" StoryTitle="$ID/" AppliedNamedGrid="n">` +
    `<StoryPreference OpticalMarginAlignment="false" OpticalMarginSize="12" FrameType="TextFrameType" StoryOrientation="${vertical ? 'Vertical' : 'Horizontal'}" StoryDirection="${rtl ? 'RightToLeftDirection' : 'LeftToRightDirection'}"/>` +
    '<InCopyExportOption IncludeGraphicProxies="true" IncludeAllResources="false"/>' +
    paragraphs +
    '</Story></idPkg:Story>'
  );
}

/** The paragraphs of a story, or of a table cell: `storyXml`'s rules. */
export function paragraphsXml(w: Writer, items: StoryItem[], frame: VDTFrame | undefined): string {
  const keep = keepsLines(w);
  const paras: StoryPara[] = [];
  let prev: StoryItem | undefined;
  const sc = textScale(frame);
  const edges = textEdges(items);
  let marker: { runs: TextRun[]; x: number } | undefined;
  items.forEach((item) => {
    if (item.role === 'marker') {
      marker = { runs: paragraphRuns(w, item), x: item.lines[0]?.runs[0]?.x ?? item.bbox.x };
      return;
    }
    const edge = edges.get(item.frame ?? '') ?? { left: item.bbox.x, right: item.bbox.x + item.bbox.width };
    // The style the engine set a body paragraph in (not a list item, which
    // hangs on its own): its tab stops carry their leaders.
    const engine = marker ? undefined : engineStyle(w, item, frame);
    const tabs = styleTabs(w, engine, edge.right - edge.left, sc);
    const stops: LineStop[][] = [];
    const perLine = keep ? linesRuns(w, item, tabs.length > 0, stops) : undefined;
    let runs = perLine ? perLine.flat() : paragraphRuns(w, item, tabs.length > 0);
    let hang: { left: number; first: number } | undefined;
    if (marker) {
      const lead = marker.runs.map((r) => ({ ...r, text: `${r.text}\t` }));
      runs = [...lead, ...runs];
      if (perLine) perLine[0] = [...lead, ...(perLine[0] ?? [])];
      // The item's text starts where its lines do (the block's box takes in the marker).
      const textX = Math.min(...item.lines.map((l) => l.runs[0]?.x ?? item.bbox.x));
      hang = { left: (textX - edge.left) * w.k, first: (marker.x - textX) * w.k };
      marker = undefined;
    }
    if (!runs.length) return;
    const last = paras[paras.length - 1];
    const joins = !keep && item.joinsPrevious && !!last;
    if (joins) {
      // No paragraph return between the two parts (`paraXml`); the word
      // space the frame break swallowed comes back unless a hyphen split a
      // word.
      const before = prev?.lines[prev.lines.length - 1];
      if (before && !before.addedHyphen && !/\s$/.test(before.text) && !/^\s/.test(runs[0]!.text)) runs[0] = { ...runs[0]!, text: ` ${runs[0]!.text}` };
    }
    const lines = item.lines;
    const leading = (lines[0]?.lineHeight ?? 0) * w.k;
    const justification = paragraphJustification(lines);
    // What the style would carry: the paragraph's own indents and stops,
    // or, for a list item, none. A paragraph of one line shows no turnover
    // line: its style says where one would start.
    const turnover = engine ? ((engine.indentPx ?? 0) + (engine.hangingIndent ? (engine.hangingIndentPx ?? engine.firstLineIndentPx) : 0)) * sc : undefined;
    const indents = lineIndents(w, item, edge, turnover);
    const base: ParagraphFormat = hang
      ? { ...NO_FORMAT, rightIndent: indents.right }
      : { leftIndent: indents.left, firstLineIndent: indents.first, rightIndent: indents.right, spaceAfter: engine ? engine.marginBottomPx * sc * w.k : 0, tabs };
    // The tab after a list marker stops at the text's indent, not at
    // InDesign's default stops.
    const format: ParagraphFormat = joins
      ? { ...last.format }
      : hang
        ? { ...base, leftIndent: hang.left, firstLineIndent: hang.first, tabs: [{ position: hang.left, alignment: 'LeftAlign' }] }
        : base;
    // The style takes the look most of the paragraph's text has (a bold
    // lead-in does not make the style bold).
    const weight = new Map<TextProps, number>();
    for (const r of runs) {
      const same = [...weight.keys()].find((p) => sameProps(p, r.props)) ?? r.props;
      weight.set(same, (weight.get(same) ?? 0) + r.text.trim().length);
    }
    const dominant = [...weight].sort((a, b) => b[1] - a[1])[0]![0];
    // The style is settled over all the paragraphs of its look
    // (`styles.ts`): it is counted with the format the paragraph has.
    const chars = runs.reduce((n, r) => n + r.text.trim().length, 0);
    const style = paragraphStyle(w, paragraphStyleName(w, item, frame), dominant, leading, justification ?? 'LeftAlign', format, chars);
    let spaceBefore: number | undefined;
    // With lines kept, the first line's own leading when it stands closer
    // to the line before than its leading says.
    let firstLeading = leading;
    const prevLast = prev?.lines[prev.lines.length - 1];
    if (!joins && last && prevLast && lines[0] && prev?.frame === item.frame) {
      // Baseline to baseline = leading + the space after the paragraph
      // before + the space before this one (InDesign). A gap narrower than
      // the space after takes that space after down.
      const gap = (lines[0].baseline - prevLast.baseline) * w.k - leading;
      const before = gap - last.format.spaceAfter;
      if (before > 0.05) spaceBefore = before;
      else if (before < -0.05) {
        last.format = { ...last.format, spaceAfter: Math.max(0, gap) };
        if (keep && gap < -0.05) firstLeading = Math.max(0.1, leading + gap);
      }
    }
    if (keep && last && prev && prev.frame !== item.frame) last.frameBreak = true;
    prev = item;
    if (keep) {
      paras.push(...keptParagraphs(w, item, perLine!, { style, edge, format, hang: !!hang, firstLeading, spaceBefore, stops }));
      return;
    }
    let local = '';
    if (justification && style.justification !== justification) local += attr('Justification', justification);
    // Leading is a character's: every range says the paragraph's own.
    const ownLeading = Math.abs(style.leading - leading) >= 0.01 ? leading : undefined;
    const ranges = runs.map((r) => rangeXml(isVertical(item) ? unkerned(r) : r, style.props, ownLeading, false, w));
    // Styles do not hyphenate (InDesign does by default); a paragraph the
    // composer hyphenated does.
    if (lines.some((l) => l.addedHyphen)) local += ' Hyphenation="true"';
    if (isVertical(item)) {
      local += VERTICAL_REFLOW;
      w.warn('text.vertical.kinsoku', "Vertical text left to InDesign's composer takes the document's line-breaking (kinsoku) and spacing (mojikumi) sets: choose them in InDesign");
    }
    paras.push({ style, attrs: local, format, ranges: ranges.join(''), ...(joins ? { joins } : {}), ...(spaceBefore !== undefined ? { spaceBefore } : {}) });
  });
  return paras.map((p, i) => paraXml(p, i === paras.length - 1 || !!paras[i + 1]!.joins)).join('');
}
