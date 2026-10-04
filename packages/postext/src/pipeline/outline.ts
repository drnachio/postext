/**
 * The book's outline: what a `:::toc` lists. Two sources produce the same
 * shape — the parsed markdown (titles, numbers and parts known, page labels
 * not) and a laid-out document (page labels known) — so a chapter laid out
 * on its own can take the whole book's outline from its host while the
 * engine derives one from a single document by laying it out again.
 */

import type { ContentBlock, InlineSpan } from '../parse';
import { flattenTitleBreaks, flattenTitleBreakSpans, TITLE_BREAK_RE } from '../parse/inlineFormatting';
import { collapseTitleSpaces } from '../measure/spaces';
import { computeHeadingNumbering, type HeadingNumberingOptions, type HeadingTemplates } from '../numbering';
import type { HeadingCounters, OutlineEntry, PostextConfig } from '../types';
import type { ResolvedConfig, VDTDocument } from '../vdt';
import { documentNumerals, resolvedLocale, resolveAllConfig } from './config';
import { withDigits } from '../arabicNumerals';
import { headingIsListed, headingIsNumbered, headingMarksFor, headingStyleOf } from './headingStyles';
import { partMarkPages, planParts } from './parts';
import { withBookTitleBrackets } from './annotations';

/** Whether the parsed content holds a `:::toc` directive. */
export function hasTocDirective(blocks: readonly ContentBlock[]): boolean {
  return blocks.some((b) => b.type === 'directive' && b.directiveName === 'toc');
}

/** Whether the parsed content holds a `:::index` directive. */
export function hasIndexDirective(blocks: readonly ContentBlock[]): boolean {
  return blocks.some((b) => b.type === 'directive' && b.directiveName === 'index');
}

/** The outline entries of a block's index marks. */
function indexMarkEntries(b: ContentBlock): OutlineEntry[] {
  if (!b.indexMarks) return [];
  return b.indexMarks.map((m): OutlineEntry => ({
    kind: 'indexMark',
    level: 0,
    title: m.path.join('!'),
    number: '',
    numbered: false,
    listed: false,
    indexMark: {
      index: m.index,
      path: m.path,
      ...(m.sort !== undefined ? { sort: m.sort } : {}),
      ...(m.see !== undefined ? { see: m.see } : {}),
      ...(m.seeAlso !== undefined ? { seeAlso: m.seeAlso } : {}),
      ...(m.main ? { main: true } : {}),
      ...(m.range !== undefined ? { range: m.range } : {}),
      sourceStart: m.sourceStart,
    },
  }));
}

/** The outline entries of a block's anchors. */
function anchorEntries(b: ContentBlock): OutlineEntry[] {
  if (!b.anchorMarks) return [];
  return b.anchorMarks.map((m): OutlineEntry => ({
    kind: 'anchor',
    level: 0,
    title: m.text ?? '',
    number: '',
    numbered: false,
    listed: false,
    anchorId: m.anchorId,
    anchorSource: m.sourceStart,
  }));
}

/** The entries `:::toc` reads (headings and parts). */
export function tocOutline(entries: readonly OutlineEntry[]): OutlineEntry[] {
  return entries.filter((e) => e.kind === 'heading' || e.kind === 'part');
}

/** The entries a cross-reference may name (#262): headings with an id and
 *  anchors. */
export function anchorOutline(entries: readonly OutlineEntry[]): OutlineEntry[] {
  return entries.filter((e) => e.anchorId !== undefined);
}

/** The entries `:::index` reads (index marks). */
export function indexOutline(entries: readonly OutlineEntry[]): OutlineEntry[] {
  return entries.filter((e) => e.kind === 'indexMark');
}

function titleSpans(blockText: string, spans: readonly InlineSpan[]): OutlineEntry['spans'] {
  const out: NonNullable<OutlineEntry['spans']> = [];
  for (const s of flattenTitleBreakSpans(blockText, spans)) {
    if (s.math || s.ref) continue; // formulas and references do not carry into the contents
    const text = s.text;
    if (text.length === 0) continue;
    const last = out[out.length - 1];
    if (last && last.bold === s.bold && last.italic === s.italic) last.text += text;
    else out.push({ text, bold: s.bold, italic: s.italic });
  }
  return out;
}

/** The heading templates of the resolved config (level → template). */
export function headingTemplatesOf(resolved: ResolvedConfig): HeadingTemplates {
  const templates: HeadingTemplates = {};
  for (const lvl of resolved.headings.levels) {
    if (lvl.numberingTemplate && lvl.numberingTemplate.length > 0) {
      templates[lvl.level as 1 | 2 | 3 | 4 | 5 | 6] = lvl.numberingTemplate;
    }
  }
  return templates;
}

/** What heading numbering takes from the resolved config beside the level
 *  templates: the document language (spelled-out counters), its digits
 *  (decimal counters) and the heading styles' own templates. */
export function headingNumberingOptions(resolved: ResolvedConfig): HeadingNumberingOptions {
  const styled = resolved.headingStyles.some((s) => s.numberingTemplate !== undefined);
  return {
    locale: resolvedLocale(resolved),
    ...(resolved.numerals ? { numerals: resolved.numerals } : {}),
    ...(styled ? { templateFor: (b: ContentBlock) => headingStyleOf(b, resolved)?.numberingTemplate } : {}),
  };
}

/**
 * The outline of parsed content: one entry per heading (every level — the
 * contents pick the levels they list) and per part, in document order,
 * without page labels. Numbers follow the level templates (or a heading
 * style's own), else the chapter ordinal for level 1, continuing from
 * `before` (the counters and chapter ordinal the preceding content left).
 */
export function computeOutline(
  blocks: readonly ContentBlock[],
  resolved: ResolvedConfig,
  before?: HeadingCounters,
): OutlineEntry[] {
  // Headings whose marks the configuration leaves off list plain (EF-122).
  blocks = headingMarksFor(blocks as ContentBlock[], resolved);
  const isNumbered = (b: ContentBlock) => headingIsNumbered(b, resolved);
  const { prefixes, values } = computeHeadingNumbering(
    [...blocks],
    headingTemplatesOf(resolved),
    before ? [before.h1, before.h2, before.h3, before.h4, before.h5, before.h6] : undefined,
    isNumbered,
    headingNumberingOptions(resolved),
  );
  const parts = planParts(blocks);
  const out: OutlineEntry[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const part = parts.byStart.get(i);
    if (b.type !== 'heading' && b.indexMarks) out.push(...indexMarkEntries(b));
    if (b.type !== 'heading' && b.anchorMarks) out.push(...anchorEntries(b));
    if (part) {
      out.push({
        kind: 'part',
        level: 0,
        title: part.title.replace(TITLE_BREAK_RE, ' '),
        number: part.number,
        numbered: part.number.length > 0,
        listed: true,
        ...(Object.keys(part.palette).length > 0 ? { palette: part.palette } : {}),
      });
      continue;
    }
    if (b.type !== 'heading' || !b.level) continue;
    const numbered = isNumbered(b);
    const prefix = prefixes[i] ?? '';
    const style = headingStyleOf(b, resolved);
    // Without a template, a chapter lists its ordinal: the level-1 counter.
    // A style whose own template is empty prints no number at all.
    const ordinal = b.level === 1 && style?.numberingTemplate !== '';
    const number = numbered ? (prefix.length > 0 ? prefix : ordinal ? withDigits(String(values[i] ?? ''), documentNumerals(resolved)) : '') : '';
    // A book title's 《》 are text of the title where they are its mark.
    const titled = withBookTitleBrackets(b.text, b.spans, resolved.cjk);
    out.push({
      kind: 'heading',
      level: b.level,
      // No-break spaces stay: a running head or contents entry keeps them,
      // and so does the ideographic space between the halves of a Chinese
      // couplet title.
      title: collapseTitleSpaces(flattenTitleBreaks(titled.text)).trim(),
      spans: titleSpans(titled.text, titled.spans),
      number,
      ...(numbered && values[i] !== undefined ? { counter: values[i] } : {}),
      numbered,
      listed: headingIsListed(b, resolved),
      ...(style ? { styleId: style.id } : {}),
      ...(b.attrs ? { attrs: b.attrs } : {}),
      ...(b.attrs?.id ? { anchorId: b.attrs.id } : {}),
    });
    if (b.indexMarks) out.push(...indexMarkEntries(b));
    if (b.anchorMarks) out.push(...anchorEntries(b));
  }
  return out;
}

/** `computeOutline` over a parsed document with a raw config. */
export function computeOutlineFor(
  blocks: readonly ContentBlock[],
  config: PostextConfig | undefined,
  before?: HeadingCounters,
): OutlineEntry[] {
  return computeOutline(blocks, resolveAllConfig(config), before);
}

/**
 * The outline of a laid-out document: the entries `computeOutline` gives
 * for its content (`parsedOutline`, in the same order), each with the label
 * of the page it landed on. Parts come from the part pages (with
 * `parts.page: false`, the page their content starts on), headings from
 * the heading blocks; both in page order (a part page always precedes its
 * chapters).
 */
export function outlineFromDoc(doc: VDTDocument, parsedOutline: readonly OutlineEntry[]): OutlineEntry[] {
  const offset = doc.pageIndexOffset ?? 0;
  // Page (label and book index) per heading content index (first fragment
  // of a split heading).
  const headingPage = new Map<number, { pageLabel: string; pageIndex: number }>();
  for (const b of doc.blocks) {
    if (b.type !== 'heading' || b.contentIndex === undefined || b.pageIndex < 0) continue;
    if (headingPage.has(b.contentIndex)) continue;
    headingPage.set(b.contentIndex, { pageLabel: doc.pages[b.pageIndex]?.pageLabel ?? '', pageIndex: offset + b.pageIndex });
  }
  const partPages: ({ pageLabel: string; pageIndex: number } | undefined)[] = [];
  for (const page of doc.pages) if (page.partInfo) partPages.push({ pageLabel: page.pageLabel, pageIndex: offset + page.index });
  // Parts set without a divider page (`parts.page: false`) point at the
  // page their content starts on — the one their running heads switch on.
  if (doc.partMarks && doc.partMarks.length > 0) {
    for (const index of partMarkPages(doc)) {
      const page = index !== undefined ? doc.pages[index] : undefined;
      partPages.push(page ? { pageLabel: page.pageLabel, pageIndex: offset + page.index } : undefined);
    }
  }
  const headingIndices = [...headingPage.keys()].sort((a, b) => a - b);
  // Index marks: the page the build found for each (`doc.indexMarks`).
  const markPage = new Map<number, number>();
  for (const m of doc.indexMarks ?? []) markPage.set(m.sourceStart, m.pageIndex);
  // Anchors: the page the build found for each (`doc.anchors`).
  const anchorPage = new Map<number, number>();
  for (const a of doc.anchors ?? []) if (a.sourceStart !== undefined) anchorPage.set(a.sourceStart, a.pageIndex);
  let h = 0;
  let p = 0;
  return parsedOutline.map((entry) => {
    if (entry.kind === 'indexMark') {
      const local = entry.indexMark ? markPage.get(entry.indexMark.sourceStart) : undefined;
      const page = local !== undefined ? doc.pages[local] : undefined;
      return page
        ? { ...entry, pageLabel: page.pageLabel, pageIndex: offset + page.index, pageFormat: page.pageNumberFormat }
        : { ...entry };
    }
    if (entry.kind === 'anchor') {
      const local = entry.anchorSource !== undefined ? anchorPage.get(entry.anchorSource) : undefined;
      const page = local !== undefined ? doc.pages[local] : undefined;
      return page ? { ...entry, pageLabel: page.pageLabel, pageIndex: offset + page.index } : { ...entry };
    }
    if (entry.kind === 'part') {
      const page = partPages[p++];
      return page !== undefined ? { ...entry, ...page } : { ...entry };
    }
    const idx = headingIndices[h++];
    const page = idx !== undefined ? headingPage.get(idx) : undefined;
    return page !== undefined ? { ...entry, ...page } : { ...entry };
  });
}

const FIELD_SEP = '';

function indexMarkKey(m: NonNullable<OutlineEntry['indexMark']>): string {
  return [m.index, m.path.join(FIELD_SEP), m.sort ?? '', m.see ?? '', m.seeAlso ?? '', m.main ? 1 : 0, m.range ?? '', m.sourceStart].join(FIELD_SEP);
}

/** A stable fingerprint of an outline — what a contents page depends on. */
export function outlineKey(entries: readonly OutlineEntry[] | undefined): string {
  if (!entries) return '';
  return entries.map((e) => [
    e.kind, e.level, e.number, e.title, e.numbered ? 1 : 0, e.listed ? 1 : 0, e.styleId ?? '', e.pageLabel ?? '?', e.pageIndex ?? '?',
    e.attrs ? Object.entries(e.attrs).sort().map(([k, v]) => `${k}=${v}`).join(';') : '',
    e.palette ? Object.entries(e.palette).sort().map(([k, v]) => `${k}=${v}`).join(';') : '',
    e.spans ? e.spans.map((s) => `${s.bold ? 'b' : ''}${s.italic ? 'i' : ''}:${s.text}`).join(FIELD_SEP) : '',
    e.pageFormat ?? '',
    e.indexMark ? indexMarkKey(e.indexMark) : '',
    e.anchorId ?? '',
    e.anchorSource ?? '',
  ].join('|')).join('\n');
}

export function sameOutline(a: readonly OutlineEntry[] | undefined, b: readonly OutlineEntry[] | undefined): boolean {
  return outlineKey(a) === outlineKey(b);
}
