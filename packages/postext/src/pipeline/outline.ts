/**
 * The book's outline: what a `:::toc` lists. Two sources produce the same
 * shape — the parsed markdown (titles, numbers and parts known, page labels
 * not) and a laid-out document (page labels known) — so a chapter laid out
 * on its own can take the whole book's outline from its host while the
 * engine derives one from a single document by laying it out again.
 */

import type { ContentBlock, InlineSpan } from '../parse';
import { flattenTitleBreaks, TITLE_BREAK_RE } from '../parse/inlineFormatting';
import { computeHeadingNumbers, type HeadingTemplates } from '../numbering';
import type { HeadingCounters, OutlineEntry, PostextConfig } from '../types';
import type { ResolvedConfig, VDTDocument } from '../vdt';
import { resolveAllConfig } from './config';
import { headingIsListed, headingIsNumbered, headingStyleOf } from './headingStyles';
import { planParts } from './parts';

/** Whether the parsed content holds a `:::toc` directive. */
export function hasTocDirective(blocks: readonly ContentBlock[]): boolean {
  return blocks.some((b) => b.type === 'directive' && b.directiveName === 'toc');
}

function titleSpans(spans: readonly InlineSpan[]): OutlineEntry['spans'] {
  const out: NonNullable<OutlineEntry['spans']> = [];
  for (const s of spans) {
    if (s.math || s.ref) continue; // formulas and references do not carry into the contents
    const text = flattenTitleBreaks(s.text);
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

/**
 * The outline of parsed content: one entry per heading (every level — the
 * contents pick the levels they list) and per part, in document order,
 * without page labels. Numbers follow the level templates, else the
 * chapter ordinal for level 1, continuing from `before` (the counters and
 * chapter ordinal the preceding content left).
 */
export function computeOutline(
  blocks: readonly ContentBlock[],
  resolved: ResolvedConfig,
  before?: HeadingCounters,
): OutlineEntry[] {
  const isNumbered = (b: ContentBlock) => headingIsNumbered(b, resolved);
  const prefixes = computeHeadingNumbers(
    [...blocks],
    headingTemplatesOf(resolved),
    before ? [before.h1, before.h2, before.h3, before.h4, before.h5, before.h6] : undefined,
    isNumbered,
  );
  let ordinal = before?.h1 ?? 0;
  const parts = planParts(blocks);
  const out: OutlineEntry[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const part = parts.byStart.get(i);
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
    if (numbered && b.level === 1) ordinal++;
    const prefix = prefixes[i] ?? '';
    const number = numbered ? (prefix.length > 0 ? prefix : b.level === 1 ? String(ordinal) : '') : '';
    const style = headingStyleOf(b, resolved);
    out.push({
      kind: 'heading',
      level: b.level,
      title: flattenTitleBreaks(b.text).replace(/\s+/g, ' ').trim(),
      spans: titleSpans(b.spans),
      number,
      numbered,
      listed: headingIsListed(b, resolved),
      ...(style ? { styleId: style.id } : {}),
      ...(b.attrs ? { attrs: b.attrs } : {}),
    });
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
 * of the page it landed on. Parts come from the part pages, headings from
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
  const partPages: { pageLabel: string; pageIndex: number }[] = [];
  for (const page of doc.pages) if (page.partInfo) partPages.push({ pageLabel: page.pageLabel, pageIndex: offset + page.index });
  const headingIndices = [...headingPage.keys()].sort((a, b) => a - b);
  let h = 0;
  let p = 0;
  return parsedOutline.map((entry) => {
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

/** A stable fingerprint of an outline — what a contents page depends on. */
export function outlineKey(entries: readonly OutlineEntry[] | undefined): string {
  if (!entries) return '';
  return entries.map((e) => [
    e.kind, e.level, e.number, e.title, e.numbered ? 1 : 0, e.listed ? 1 : 0, e.styleId ?? '', e.pageLabel ?? '?', e.pageIndex ?? '?',
    e.attrs ? Object.entries(e.attrs).sort().map(([k, v]) => `${k}=${v}`).join(';') : '',
    e.palette ? Object.entries(e.palette).sort().map(([k, v]) => `${k}=${v}`).join(';') : '',
    e.spans ? e.spans.map((s) => `${s.bold ? 'b' : ''}${s.italic ? 'i' : ''}:${s.text}`).join(FIELD_SEP) : '',
  ].join('|')).join('\n');
}

export function sameOutline(a: readonly OutlineEntry[] | undefined, b: readonly OutlineEntry[] | undefined): boolean {
  return outlineKey(a) === outlineKey(b);
}
