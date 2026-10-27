/**
 * Page-scoped relayout of composed pages (#857, DESIGN §6): the layout of
 * a composed page is kept by what it reads — the resolved template, the
 * page's Markdown and blocks, the styles and fonts, the locale (in the
 * configuration), the page's side and geometry, and what the pass knows
 * of those blocks (heading numbers, part and section, the pictures they
 * show) — so a build that meets the same page again (the next pass, the
 * next keystroke elsewhere in the chapter, the same chapter paginated in
 * the background) reuses it instead of setting it again. An edit inside a
 * page, or a change of a property it reads, sets that page alone.
 *
 * The kept layout is position-free: on reuse its source offsets, content
 * indices, container ids and page index are moved to where the page now
 * stands. A page whose layout reads what this key does not hold (a
 * footnote, a cross-reference, a citation, a contents or index listing, a
 * comic strip), that leaves notes for the pass (a drop cap's warning, a
 * joining script's tracking) or whose content goes on on pages it adds
 * (#859) is always laid out afresh.
 */
import type { ContentBlock, InlineSpan } from '../parse/types.js';
import type { VDTPage } from '../vdt.js';
import { measurementGeneration } from '../measure/canvas.js';
import { layoutComposedPage, type ComposedPageInput, type ComposedPageLayout } from '../pipeline/composedPages/composedLayout.js';

/** What the memo reads of the pass that lays the page out. */
export interface ComposedMemoContext {
  /** The chapter's Markdown body, and the offset of the body in the file. */
  markdown: string;
  bodyOffset: number;
  /** A key of the pass's resolved configuration (styles, typography,
   *  locale, page): see {@link configKeyOf}. Read once a page is met. */
  configKey(): string;
  /** What else the pass knows of content blocks `from`…`to` that their
   *  layout reads, or undefined when the page must be laid out afresh. */
  contextKey(from: number, to: number): string | undefined;
  /** Whether laying out blocks `from`…`to` left notes for the pass. */
  sideEffectsIn(from: number, to: number): boolean;
}

interface MemoEntry {
  /** The layout as JSON (the VDT is plain data): parsed afresh on reuse,
   *  so the documents that took it never share an object. */
  layout: string;
  laid: string[];
  /** Absolute source offset and content index the kept layout was set at. */
  sourceBase: number;
  indexBase: number;
  /** The container ids of the page's blocks, in order of first appearance. */
  containerIds: number[];
}

const MEMO_SLOTS = 96;
const memo = new Map<string, MemoEntry>();
const stats = { hits: 0, misses: 0, skipped: 0 };
let enabled = true;

/** Drop every kept page (tests; a host that wants a cold build). */
export function clearComposedPageMemo(): void {
  memo.clear();
  stats.hits = 0;
  stats.misses = 0;
  stats.skipped = 0;
}

/** Turn the memo off (every composed page laid out afresh) or on again. */
export function setComposedPageMemo(on: boolean): void {
  enabled = on;
  if (!on) memo.clear();
}

/** Pages reused, laid out and kept, and laid out without keeping. */
export function composedPageMemoStats(): { hits: number; misses: number; skipped: number; size: number } {
  return { ...stats, size: memo.size };
}

const configKeys = new WeakMap<object, string>();

/** A 64-bit digest of `parts` (two 32-bit FNV-style lanes, mixed) and
 *  their total length: the memo's keys stay short whatever a page holds. */
export function digest(parts: readonly string[]): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  let len = 0;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      const c = p.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    // A separator, so ["ab", "c"] and ["a", "bc"] differ.
    h1 = Math.imul(h1 ^ 0x1f, 2654435761);
    h2 = Math.imul(h2 ^ 0x1f, 1597334677);
    len += p.length + 1;
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h1 >>> 0).toString(36)}.${(h2 >>> 0).toString(36)}.${len}`;
}

/** A key of a resolved configuration (or any plain object the layout
 *  does not change, a resolved template), computed once per object. */
export function configKeyOf(resolved: object): string {
  const known = configKeys.get(resolved);
  if (known !== undefined) return known;
  const key = digest([JSON.stringify(resolved)]);
  configKeys.set(resolved, key);
  return key;
}

/** Spans the memo cannot key: what prints something set elsewhere. */
export function spansReadOutside(spans: readonly InlineSpan[] | undefined): boolean {
  for (const s of spans ?? []) {
    if (s.ref || s.footnote || s.citation) return true;
    if (s.chip && spansReadOutside(s.chip.spans)) return true;
  }
  return false;
}

/** Whether content block `b` lays out from what it holds and the key's
 *  context alone. */
export function blockMemoisable(b: ContentBlock): boolean {
  if (spansReadOutside(b.spans)) return false;
  if (b.type === 'directive' && (b.directiveName === 'toc' || b.directiveName === 'index' || b.directiveName === 'strip' || b.comic)) return false;
  if (b.toc || b.footnoteDef !== undefined) return false;
  return true;
}

/** The ids of the containers `blocks` name, in order of first appearance. */
function containerIdsOf(blocks: readonly ContentBlock[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const b of blocks) {
    if (b.containerId !== undefined && !seen.has(b.containerId)) {
      seen.add(b.containerId);
      out.push(b.containerId);
    }
  }
  return out;
}

const SOURCE_KEYS = new Set(['sourceStart', 'sourceEnd', 'textStart', 'textEnd']);

/** The page's blocks as a key: source offsets counted from `base`,
 *  container ids by their order. */
function blocksKey(blocks: readonly ContentBlock[], base: number, ids: readonly number[]): string {
  const ordinal = new Map(ids.map((id, i) => [id, i]));
  return JSON.stringify(blocks, function (this: unknown, key: string, value: unknown) {
    if (typeof value === 'number') {
      if (SOURCE_KEYS.has(key)) return value - base;
      if (key === 'containerId') return `#${ordinal.get(value) ?? value}`;
    }
    // A block's character map follows from the page's Markdown, which the
    // key holds whole.
    if (key === 'sourceMap') return undefined;
    if (key === 'attrSources' && value && typeof value === 'object') {
      // A heading's `{ start, end }` per attribute (the `{ sourceStart,
      // sourceEnd }` of the others are read as any source offset).
      return Object.fromEntries(Object.entries(value as Record<string, Record<string, number>>).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([f, n]) => [f, f === 'start' || f === 'end' ? n - base : n]))]));
    }
    return value;
  });
}

/** Move a kept layout to where the page now stands (in place). */
function moveLayout(value: unknown, delta: number, indexDelta: number, ids: ReadonlyMap<number, number>, pageIndex: number, parentKey = ''): void {
  if (Array.isArray(value)) {
    if (parentKey === 'sourceMap') {
      for (let i = 0; i < value.length; i++) if (typeof value[i] === 'number') value[i] += delta;
      return;
    }
    if (parentKey === 'calloutPath') {
      for (let i = 0; i < value.length; i++) if (typeof value[i] === 'number') value[i] = ids.get(value[i] as number) ?? value[i];
      return;
    }
    for (const v of value) moveLayout(v, delta, indexDelta, ids, pageIndex);
    return;
  }
  if (value instanceof Set || value === null || typeof value !== 'object') return;
  const o = value as Record<string, unknown>;
  for (const key of Object.keys(o)) {
    const v = o[key];
    if (typeof v === 'number') {
      if (key === 'sourceStart' || key === 'sourceEnd') o[key] = v + delta;
      else if ((key === 'start' || key === 'end') && parentKey === 'attr') o[key] = v + delta;
      else if (key === 'contentIndex') o[key] = v + indexDelta;
      else if (key === 'containerId') o[key] = ids.get(v) ?? v;
      else if (key === 'pageIndex') o[key] = pageIndex;
    } else if (v && typeof v === 'object') {
      // `attrSources` of a block hold `{ start, end }` per attribute.
      if (key === 'attrSources') {
        for (const r of Object.values(v as Record<string, unknown>)) moveLayout(r, delta, indexDelta, ids, pageIndex, 'attr');
      } else {
        moveLayout(v, delta, indexDelta, ids, pageIndex, key);
      }
    }
  }
}

/** Whether every container id and content index of `layout` falls in the
 *  page (so moving it is complete). */
function selfContained(layout: ComposedPageLayout, ids: ReadonlySet<number>, from: number, to: number): boolean {
  let ok = true;
  const visit = (value: unknown, parentKey: string): void => {
    if (!ok) return;
    if (Array.isArray(value)) {
      if (parentKey === 'calloutPath') { for (const v of value) if (typeof v === 'number' && !ids.has(v)) ok = false; return; }
      for (const v of value) visit(v, '');
      return;
    }
    if (value === null || typeof value !== 'object' || value instanceof Set) return;
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'number') {
        if (key === 'containerId' && !ids.has(v)) ok = false;
        else if (key === 'contentIndex' && (v < from || v > to)) ok = false;
      } else if (v && typeof v === 'object') visit(v, key);
    }
  };
  visit(layout.blocks, '');
  return ok;
}


/** `v` with every number rounded to a millionth. */
const rounded = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (_k, x: unknown) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x)));

/**
 * {@link layoutComposedPage}, kept by what it reads: the same page met
 * again is taken from the memo and moved to where it now stands.
 */
export function layoutComposedPageMemo(input: ComposedPageInput, ctx: ComposedMemoContext): ComposedPageLayout {
  if (!enabled) return layoutComposedPage(input);
  const blocks = input.pass.contentBlocks;
  const from = input.startIdx;
  const to = input.endIdx;
  const range = blocks.slice(from, to + 1);
  const context = range.every(blockMemoisable) ? ctx.contextKey(from, to) : undefined;
  if (context === undefined) {
    stats.skipped++;
    return layoutComposedPage(input);
  }
  const first = range[0]!;
  const last = range[range.length - 1]!;
  const ids = containerIdsOf(range);
  const key = digest([
    '1',
    ctx.configKey(),
    String(measurementGeneration()),
    configKeyOf(input.template),
    String(input.fence.fenceIndex),
    ctx.markdown.slice(first.sourceStart, last.sourceEnd),
    blocksKey(range, first.sourceStart, ids),
    // Geometry to a millionth of a pixel: a verso and a recto of the same
    // margins differ in the last digits only.
    JSON.stringify(rounded([input.areas, input.dpi, input.emPx, input.mirrored, input.pushGapPx, input.page.width, input.page.height, input.page.contentArea])),
    [...input.stories.keys()].join('\u0000'),
    context,
  ]);
  const sourceBase = first.sourceStart + ctx.bodyOffset;
  const hit = memo.get(key);
  if (hit) {
    memo.delete(key);
    memo.set(key, hit);
    const layout = { ...(JSON.parse(hit.layout) as Omit<ComposedPageLayout, 'laid'>), laid: new Set(hit.laid) };
    const idMap = new Map(hit.containerIds.map((id, i) => [id, ids[i] ?? id]));
    moveLayout(layout.blocks, sourceBase - hit.sourceBase, from - hit.indexBase, idMap, input.page.index);
    moveLayout(layout.composed, sourceBase - hit.sourceBase, from - hit.indexBase, idMap, input.page.index);
    moveLayout(layout.warnings, sourceBase - hit.sourceBase, from - hit.indexBase, idMap, input.page.index);
    layout.composed.layoutKey = key;
    stats.hits++;
    return layout;
  }
  const layout = layoutComposedPage(input);
  // A page whose content goes on on pages it adds (#859) is laid out
  // afresh with them: the added pages read where it cut its frames.
  if (layout.continuations || ctx.sideEffectsIn(from, to) || !selfContained(layout, new Set(ids), from, to)) {
    stats.skipped++;
    return layout;
  }
  layout.composed.layoutKey = key;
  memo.set(key, { layout: JSON.stringify({ composed: layout.composed, blocks: layout.blocks, warnings: layout.warnings }), laid: [...layout.laid], sourceBase, indexBase: from, containerIds: ids });
  if (memo.size > MEMO_SLOTS) {
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }
  stats.misses++;
  return layout;
}

/** Fields of the VDT that say where things come from, not what they look
 *  like. */
const PAINT_FREE_KEYS = new Set(['sourceStart', 'sourceEnd', 'sourceMap', 'contentIndex', 'containerId', 'pageIndex', 'attrSources', 'titleSourceStart', 'titleSourceEnd']);

/**
 * What a composed page paints, as a key (#857): its frames' layout key
 * with what is laid round them (running heads, decoration, page number,
 * paper, the floats and notes no frame holds). Two pages with the same
 * key paint the same pixels with the same paint options, so a host can
 * keep a page's bitmap across a relayout. Undefined for a page without a
 * layout key (not a composed page, or one laid out afresh every time).
 */
export function composedPagePaintKey(page: VDTPage): string | undefined {
  const composed = page.composed;
  if (!composed?.layoutKey) return undefined;
  const inFrames = new Set(composed.frames.flatMap((f) => f.blockIds));
  const loose = (page.floats ?? []).filter((b) => !inFrames.has(b.id));
  return digest([
    composed.layoutKey,
    JSON.stringify([
      page.width, page.height, page.pageLabel, page.background ?? null, page.paper ?? null,
      page.header ?? null, page.footer ?? null, composed.decoration ?? null, page.lineNumbers ?? null,
      loose, page.marginNotes ?? null, page.footnoteAreas ?? null,
      // Where the text is written does not change the pixels: an edit on
      // an earlier page moves every offset after it.
    ], (key, value: unknown) => (PAINT_FREE_KEYS.has(key) ? undefined : value)),
  ]);
}
