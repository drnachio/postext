/**
 * A collection's catalogue on a cover (#1673): the titles of the series a
 * book belongs to (`production.collection.catalogue`), set on its
 * endpapers or its back cover. The text is `::catalogue` in the cover's
 * Markdown, a line per title in the cover's catalogue styles; the
 * pictures are a `catalogue` element of the design, a grid of them in its
 * box. The book's own title (`collection.volume`) is marked in both.
 */

import type { ProductionCollection } from '../types/output/production.js';
import type { CoverElement, CoverSheetDesign } from '../types/output/cover.js';
import { counterStyleOf, formatCounter } from '../numerals/numbering/counters.js';
import { markdownLiteral } from './coverSource.js';
import { finite } from './svgSafe.js';

type Entry = NonNullable<ProductionCollection['catalogue']>[number];

/** The titles from place `first` to place `last` (counting from 1, both
 *  kept inside the catalogue), each with its place. */
export function catalogueRange(collection: ProductionCollection | undefined, first?: number, last?: number): { entry: Entry; place: number }[] {
  const all = collection?.catalogue ?? [];
  const from = Math.max(1, Math.floor(finite(first, 1)));
  const to = Math.min(all.length, Math.floor(finite(last, all.length)));
  const out: { entry: Entry; place: number }[] = [];
  for (let place = from; place <= to; place++) out.push({ entry: all[place - 1]!, place });
  return out;
}

/**
 * A design with each `catalogue` element turned into the pictures it
 * holds: a grid of `columns` (default all the titles in one row) with
 * `gap` mm between them, each picture covering its cell, the book's own
 * outlined by the element's `stroke`. A title without a picture leaves its
 * cell empty; a catalogue with no titles draws nothing.
 */
export function withCatalogue(design: CoverSheetDesign | undefined, collection: ProductionCollection | undefined): CoverSheetDesign | undefined {
  if (!design) return design;
  const expand = (items: CoverElement[] | undefined) => items?.flatMap((el) => (el.kind === 'catalogue' ? catalogueGrid(el, collection) : [el]));
  const has = (items: CoverElement[] | undefined) => items?.some((el) => el.kind === 'catalogue');
  if (!has(design.elements) && !has(design.effects)) return design;
  return { ...design, ...(design.elements ? { elements: expand(design.elements) } : {}), ...(design.effects ? { effects: expand(design.effects) } : {}) };
}

function catalogueGrid(el: CoverElement, collection: ProductionCollection | undefined): CoverElement[] {
  const titles = catalogueRange(collection, el.first, el.last);
  if (titles.length === 0) return [];
  const columns = Math.max(1, Math.min(titles.length, Math.floor(finite(el.columns, titles.length))));
  const rows = Math.ceil(titles.length / columns);
  const gap = Math.max(0, finite(el.gap, 3));
  const w = (finite(el.width) - gap * (columns - 1)) / columns;
  const h = (finite(el.height) - gap * (rows - 1)) / rows;
  if (!(w > 0 && h > 0)) return [];
  // A cell scales with the zone as the element does: its share of the
  // element's basis.
  const basis = el.basis ? { width: el.basis.width, height: el.basis.height } : undefined;
  const out: CoverElement[] = [];
  titles.forEach(({ entry }, i) => {
    const cell = {
      zone: el.zone,
      x: finite(el.x) + (i % columns) * (w + gap),
      y: finite(el.y) + Math.floor(i / columns) * (h + gap),
      width: w,
      height: h,
      ...(basis ? { basis } : {}),
      ...(el.bleed ? { bleed: el.bleed } : {}),
    };
    if (entry.resource) {
      out.push({ ...cell, id: `${el.id}-${i + 1}`, kind: 'image', resourceId: entry.resource, fit: el.fit ?? 'cover', ...(el.opacity !== undefined ? { opacity: el.opacity } : {}) });
    }
    if (el.stroke && collection?.volume !== undefined && entry.id === collection.volume) {
      out.push({ ...cell, id: `${el.id}-${i + 1}-mark`, kind: 'box', stroke: el.stroke, ...(el.radius !== undefined ? { radius: el.radius } : {}) });
    }
  });
  return out;
}

const CATALOGUE_LINE = /^([ \t]{0,3})::catalogue(?:[ \t]*\{([^}\n]*)\})?[ \t]*$/gm;
const ATTR = /([A-Za-z]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+))/g;

/** The cover's paragraph styles of the catalogue's lines: a title, and
 *  the book's own. */
export const CATALOGUE_STYLE = 'cover-catalogue';
export const CATALOGUE_CURRENT_STYLE = 'cover-catalogue-current';

/**
 * The cover's Markdown with each `::catalogue` line set as the
 * collection's titles, a paragraph each: its place in the counter style
 * `numbers` names (`1`, `I`, `upper-roman`…; `none` for no number; default
 * arabic), a tab, and the title, in `cover-catalogue`, the book's own in
 * `cover-catalogue-current`. `first` and `last` take a part of the list (to
 * share it between two pages). A book without a catalogue gets nothing.
 */
export function expandCatalogueText(markdown: string, collection: ProductionCollection | undefined, locale?: string): string {
  if (!markdown.includes('::catalogue')) return markdown;
  return markdown.replace(CATALOGUE_LINE, (_line, indent: string, attrs: string | undefined) => {
    const a: Record<string, string> = {};
    for (const m of (attrs ?? '').matchAll(ATTR)) a[m[1]!] = m[2] ?? m[3] ?? m[4] ?? '';
    const numbers = a.numbers?.trim() || '1';
    const style = numbers === 'none' ? undefined : counterStyleOf(numbers, locale);
    const lines = catalogueRange(collection, a.first ? Number(a.first) : undefined, a.last ? Number(a.last) : undefined).map(({ entry, place }) => {
      const own = collection?.volume !== undefined && entry.id === collection.volume;
      // The en space after the number is kept out of markdownLiteral, which
      // would fold it into a plain space.
      const number = style ? `${markdownLiteral(formatCounter(place, style, locale))}\u2002` : '';
      return `${indent}:::paragraphs{style="${own ? CATALOGUE_CURRENT_STYLE : CATALOGUE_STYLE}"}\n${indent}${number}${markdownLiteral(entry.title)}\n${indent}:::`;
    });
    return lines.join('\n\n');
  });
}
