// Running heads and folios of the semantic .docx (#1444), from the book's
// header and footer designs (or a styled section's own, `false` for none).
// Each Word section gets the headers and footers its pages print in the
// engine: the body pages' (odd and even ones when the design tells them
// apart, with `w:evenAndOddHeaders`), and the opener's on a section that
// opens with a heading breaking the page (`w:titlePg`). An element's
// `{pageNumber}` is a PAGE field, `{totalPages}` a NUMPAGES field, the
// book's metadata and the chapter's title, number, part and attributes the
// values in force where the section starts. Headers and footers are not
// part of the export map: the importer never reads them.

import type { ContentBlock } from '../../../parse/types.js';
import { extractFrontmatter, normalizeMetadata } from '../../../parse/frontmatter.js';
import { flattenTitleBreaks } from '../../../parse/inlineFormatting.js';
import { resolveDesignText, type DesignPlaceholderContext } from '../../../design/placeholders.js';
import { resolvedLocale } from '../../../pipeline/config.js';
import { headingStyleOf } from '../../../pipeline/sections/headingStyles.js';
import type { ResolvedDesignElement, ResolvedDesignSlot, ResolvedDesignTextElement, ResolvedHeadingStyleConfig } from '../../../types.js';
import type { ResolvedConfig, VDTPage } from '../../../vdt.js';
import type { WriterContext } from '../context.js';
import { designPlaceholders, headingLevelOf } from '../design/values.js';
import type { PageGeometry, SectionStart } from '../sections.js';
import { furnitureParagraph, PAGE_MARK, PAGES_MARK, TITLE_MARK, type Item, type Rule } from './paragraph.js';
import { placeElement, type PageBox, type Target } from './place.js';

type Role = 'opener' | 'body' | 'part';
type Parity = 'odd' | 'even';

/** What a section's furniture is worked out from: its chapter, the first
 *  block written in it, and how it starts. */
export interface SectionFurnitureInput {
  chapter: number;
  first?: ContentBlock;
  /** `first` is the first thing written in the section (else something
   *  without a block, a box or a list, comes before it). */
  leads?: boolean;
  start: SectionStart;
  /** Read `{chapterTitle}` with a STYLEREF field to this style. */
  titleStyle?: string;
}

const slotsMemo = new WeakMap<ResolvedConfig, { any: boolean; parity: boolean }>();

/** Every header and footer slot of the book: the document's and the
 *  styled sections'. */
function allSlots(r: ResolvedConfig): ResolvedDesignSlot[] {
  const out = [r.header, r.footer];
  for (const s of r.headingStyles) {
    if (s.header) out.push(s.header);
    if (s.footer) out.push(s.footer);
  }
  return out;
}

function bookSlots(r: ResolvedConfig): { any: boolean; parity: boolean } {
  let hit = slotsMemo.get(r);
  if (!hit) {
    const els = allSlots(r).flatMap((s) => s.elements);
    const texts = els.filter((e) => e.kind === 'text' && !e.when);
    hit = { any: texts.length > 0, parity: texts.some((e) => e.parity !== 'all') };
    slotsMemo.set(r, hit);
  }
  return hit;
}

/** Whether the book's running heads tell odd and even pages apart (Word's
 *  `w:evenAndOddHeaders`, a setting of the whole document). */
export const usesEvenAndOdd = (r: ResolvedConfig): boolean => bookSlots(r).parity;

/** Where block `b` stands in chapter `chapter`, -1 when it is not there. */
const blockIndex = (ctx: WriterContext, chapter: number, b: ContentBlock | undefined): number => (b ? (ctx.book[chapter]?.blocks.indexOf(b) ?? -1) : -1);

/** The styled section in force at block `at` of chapter `chapter` (as the
 *  engine counts it page by page, here from the chapter's start). */
function sectionStyle(ctx: WriterContext, chapter: number, at: number): ResolvedHeadingStyleConfig | undefined {
  const blocks = ctx.book[chapter]?.blocks ?? [];
  let current: { style: ResolvedHeadingStyleConfig; level: number } | undefined;
  for (let i = 0; i <= at && i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type !== 'heading') continue;
    const level = b.level ?? 1;
    const style = headingStyleOf(b, ctx.resolved);
    if (style) current = { style, level };
    else if (current && (level <= current.level || current.style.sectionEnd === 'heading')) current = undefined;
  }
  return current?.style;
}

/** The styled section in force where a section of chapter `chapter`
 *  starts with block `first`. */
export function sectionStyleAt(ctx: WriterContext, chapter: number, first: ContentBlock | undefined): ResolvedHeadingStyleConfig | undefined {
  const at = blockIndex(ctx, chapter, first);
  return at >= 0 ? sectionStyle(ctx, chapter, at) : undefined;
}

/** The last level-1 heading at or before block `at` of chapter `chapter`,
 *  looking back through the chapters before it. */
function chapterHeading(ctx: WriterContext, chapter: number, at: number): ContentBlock | undefined {
  for (let c = chapter; c >= 0; c--) {
    const blocks = ctx.book[c]?.blocks ?? [];
    for (let i = c === chapter ? Math.min(at, blocks.length - 1) : blocks.length - 1; i >= 0; i--) {
      const b = blocks[i]!;
      if (b.type === 'heading' && (b.level ?? 1) === 1) return b;
    }
  }
  return undefined;
}

/** The role of the first page of a section that starts with block `b`
 *  (the engine's page roles): a part page for a `:::part`, an opener for
 *  a heading that breaks the page or spans it, else none of its own. */
function firstPageRole(ctx: WriterContext, b: ContentBlock | undefined): Role | undefined {
  if (b?.type === 'containerStart') return b.containerName === 'part' ? 'part' : undefined;
  if (b?.type !== 'heading') return undefined;
  const level = headingLevelOf(ctx.resolved, b);
  return level && (level.span === 'page' || level.breakBefore.enabled) ? 'opener' : undefined;
}

/** Chapter `i`'s front matter (the book holds the parsed chapters). */
function frontMatter(ctx: WriterContext, i: number): Record<string, unknown> {
  const ch = ctx.book[i] as { input?: { markdown: string } } | undefined;
  return ch?.input ? (extractFrontmatter(ch.input.markdown).metadata as Record<string, unknown>) : {};
}

const metaMemo = new WeakMap<object, Map<number, Record<string, unknown>>>();

/** The metadata a chapter's running heads read: the book's (its first
 *  chapter's front matter) under the chapter's own, dates in the book's
 *  language. */
function chapterMetadata(ctx: WriterContext, chapter: number, base: Record<string, unknown>): Record<string, unknown> {
  let byChapter = metaMemo.get(ctx.book);
  if (!byChapter) metaMemo.set(ctx.book, (byChapter = new Map()));
  let meta = byChapter.get(chapter);
  if (!meta) {
    const own = frontMatter(ctx, chapter);
    meta = normalizeMetadata({ ...base, ...own }, resolvedLocale(ctx.resolved)) as Record<string, unknown>;
    byChapter.set(chapter, meta);
  }
  return meta;
}

/** The placeholder values of a section's running heads. */
function sectionValues(ctx: WriterContext, input: SectionFurnitureInput): DesignPlaceholderContext {
  const at = Math.max(0, blockIndex(ctx, input.chapter, input.first));
  const h1 = chapterHeading(ctx, input.chapter, at);
  const page = { index: 0, pageLabel: PAGE_MARK } as unknown as VDTPage;
  const base = h1 ? designPlaceholders(ctx, h1) : undefined;
  const firstMeta = frontMatter(ctx, 0);
  // A forced break in a title reads as a space in a running head.
  const title = [flattenTitleBreaks(base?.chapterTitleByPageIndex[0] ?? '')];
  const number = base?.chapterNumberByPageIndex ?? [''];
  return {
    kind: 'header',
    page,
    allPages: [],
    metadata: chapterMetadata(ctx, input.chapter, firstMeta),
    chapterTitleByPageIndex: title,
    chapterTitleAtTopByPageIndex: title,
    chapterNumberByPageIndex: number,
    chapterNumberAtTopByPageIndex: number,
    chapterAttrsByPageIndex: [h1?.attrs ?? {}],
    partTitleByPageIndex: base?.partTitleByPageIndex ?? [''],
    partNumberByPageIndex: base?.partNumberByPageIndex ?? [''],
    numerals: ctx.resolved.numerals,
  };
}

/** A template with its page-count placeholders written as marks (the
 *  resolver would print the export's page count, which it does not know),
 *  and the chapter title too when a field reads it. */
const withFieldMarks = (template: string, title: boolean): string => {
  const out = template.replace(/\{(?:totalPages|bookTotalPages)\}/g, PAGES_MARK);
  return title ? out.replace(/\{chapterTitle\}/g, TITLE_MARK) : out;
};

/** Whether an element prints on a page of this role and side. */
function prints(el: ResolvedDesignElement, role: Role, parity: Parity | undefined): boolean {
  const pages = 'pages' in el ? el.pages : undefined;
  if (pages && pages !== 'all' && pages !== role) return false;
  if (parity && el.parity !== 'all' && el.parity !== parity) return false;
  if (!parity && el.parity === 'even') return false;
  return !('when' in el && el.when);
}

/** A section's page: its box, its text width (twips), and the style a
 *  STYLEREF field reads the chapter title from (with the title in force
 *  where the section starts, as the field's result). */
type SectionPage = PageBox & { textTwips: number; title?: { style: string; text: string } };

/** The header and footer paragraphs one kind of page prints. */
function variant(ctx: WriterContext, slots: { header: ResolvedDesignSlot; footer: ResolvedDesignSlot }, values: DesignPlaceholderContext, page: SectionPage, role: Role, parity: Parity | undefined): Record<Target, string> & { empty: boolean } {
  const items: Record<Target, Item[]> = { header: [], footer: [] };
  const rules: Record<Target, Rule[]> = { header: [], footer: [] };
  for (const own of ['header', 'footer'] as const) {
    const all = slots[own].elements;
    for (const el of all) {
      if (!prints(el, role, parity)) continue;
      const placed = placeElement(el, all, page, ctx.units);
      const target = placed.target ?? own;
      if (el.kind === 'rule') {
        if (el.direction === 'horizontal') rules[target].push({ el });
        continue;
      }
      if (el.kind !== 'text') continue;
      const text = resolveDesignText(withFieldMarks(el.content ?? '', !!page.title), { ...values, kind: own }).trim();
      if (!text || !/[\p{L}\p{N}\uE0F1-\uE0F3]/u.test(text)) continue;
      items[target].push({ el: el as ResolvedDesignTextElement, text, zone: placed.zone, x: placed.x, ...(page.title ? { title: page.title } : {}) });
    }
  }
  return {
    empty: !items.header.length && !items.footer.length,
    header: furnitureParagraph(ctx, 'header', items.header, rules.header, page.rtl, page.textTwips),
    footer: furnitureParagraph(ctx, 'footer', items.footer, rules.footer, page.rtl, page.textTwips),
  };
}

const partIds = new WeakMap<WriterContext, Map<string, string>>();

/** The id a header or footer part is registered under: one part per
 *  distinct content. */
function partId(ctx: WriterContext, kind: Target, xml: string): string {
  let ids = partIds.get(ctx);
  if (!ids) partIds.set(ctx, (ids = new Map()));
  const key = `${kind}\u0000${xml}`;
  let id = ids.get(key);
  if (!id) {
    id = `${kind === 'header' ? 'h' : 'f'}${ids.size + 1}`;
    ids.set(key, id);
    (kind === 'header' ? ctx.headers : ctx.footers)[id] = xml;
  }
  return id;
}

/**
 * The header and footer references of a section (`w:headerReference`,
 * `w:footerReference`) and whether its first page takes its own
 * (`w:titlePg`). Nothing in a book whose design has no running heads.
 */
export function sectionFurniture(ctx: WriterContext, geo: PageGeometry, input: SectionFurnitureInput): { refs: string; titlePg: boolean } {
  const r = ctx.resolved;
  if (!bookSlots(r).any) return { refs: '', titlePg: false };
  const style = sectionStyleAt(ctx, input.chapter, input.first);
  const slots = { header: style?.header ?? r.header, footer: style?.footer ?? r.footer };
  const values = sectionValues(ctx, input);
  const parity = usesEvenAndOdd(r);
  const toPx = (tw: number): number => (tw * ctx.units.dpi) / 1440;
  const title = input.titleStyle ? { style: input.titleStyle, text: values.chapterTitleByPageIndex[0] ?? '' } : undefined;
  const box = (recto: boolean): SectionPage => ({
    textTwips: geo.textTwips,
    ...(title ? { title } : {}),
    width: toPx(geo.widthTw),
    margins: { left: toPx(geo.margins.left), right: toPx(geo.margins.right) },
    rtl: r.direction === 'rtl',
    recto,
    rightBound: r.page.binding === 'right',
  });
  type Kind = 'default' | 'even' | 'first';
  const kinds: [Kind, Record<Target, string>][] = [['default', variant(ctx, slots, values, box(true), 'body', parity ? 'odd' : undefined)]];
  if (parity) kinds.push(['even', variant(ctx, slots, values, box(false), 'body', 'even')]);
  const role = input.start !== 'continuous' && input.leads ? firstPageRole(ctx, input.first) : undefined;
  const titlePg = role !== undefined;
  if (role) {
    // Word's first-page header serves either side: the opener's elements
    // for a right-hand page, or for a left-hand one when the design draws
    // nothing on a right-hand opener.
    const odd = variant(ctx, slots, values, box(true), role, parity ? 'odd' : undefined);
    kinds.push(['first', parity && odd.empty ? variant(ctx, slots, values, box(false), role, 'even') : odd]);
  }
  let refs = '';
  for (const kind of ['header', 'footer'] as const) {
    for (const [type, xml] of kinds) {
      const id = partId(ctx, kind, xml[kind]);
      refs += kind === 'header' ? `<w:headerReference w:type="${type}" r:id="${ctx.pkg.headerRel(id)}"/>` : `<w:footerReference w:type="${type}" r:id="${ctx.pkg.footerRel(id)}"/>`;
    }
  }
  return { refs, titlePg };
}
