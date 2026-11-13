// The page of the book: size, margins, columns, binding, bleed and page
// numbering (the running heads the masters draw: `fidelity/masters`).

import type { PageNumberingConfig, PostextConfig } from 'postext';
import type { IdmlPage, IdmlSection, IdmlSpread } from '../model/document.js';
import { pageSize } from '../resolve/geometry.js';
import type { Context } from './context.js';
import { mm } from './values.js';

export const allPages = (ctx: Context): IdmlPage[] => ctx.doc.spreads.flatMap((s) => s.pages);

/** The master most pages apply: the body pages' master. */
export function mainMaster(ctx: Context): IdmlSpread | undefined {
  const uses = new Map<string, number>();
  for (const p of allPages(ctx)) if (p.appliedMaster) uses.set(p.appliedMaster, (uses.get(p.appliedMaster) ?? 0) + 1);
  const top = [...uses.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return ctx.doc.masterSpreads.find((m) => m.self === top);
}

/** The pages whose margins and columns are the book's: those of the main
 *  master, else all. */
export function bodyPages(ctx: Context): IdmlPage[] {
  const main = mainMaster(ctx);
  const pages = allPages(ctx);
  const own = main ? pages.filter((p) => p.appliedMaster === main.self) : [];
  return own.length ? own : pages;
}

const FORMATS: Record<string, PageNumberingConfig['format']> = {
  Arabic: 'decimal',
  UpperRoman: 'upper-roman',
  LowerRoman: 'lower-roman',
  UpperLetters: 'upper-alpha',
  LowerLetters: 'lower-alpha',
};

/** A section's numbering as Postext names it. */
export function numberingOf(ctx: Context, s: IdmlSection): { format: NonNullable<PageNumberingConfig['format']>; known: boolean } {
  const format = FORMATS[s.pageNumberStyle];
  if (!format) ctx.rep.add('pageNumberStyle', 'warning', 'A page number style Postext does not have (padded, Kanji, Arabic letters) is set in decimal', s.pageNumberStyle);
  return { format: format ?? 'decimal', known: !!format };
}

/** The `:::numbering` line that opens a section after the first. */
export function numberingDirective(ctx: Context, s: IdmlSection, first: number): string {
  const { format } = numberingOf(ctx, s);
  const start = s.continueNumbering ? undefined : (s.pageNumberStart ?? 1);
  if (s.prefix && s.includePrefix) ctx.rep.add('sectionPrefix', 'warning', 'A section prefix printed with the page number is not carried', s.prefix);
  void first;
  return `:::numbering{format="${format}"${start !== undefined ? ` startAt=${start}` : ''}}`;
}

export function pageConfig(ctx: Context, layout: 'pages' | 'flow' = 'flow'): Pick<PostextConfig, 'page' | 'layout' | 'direction'> {
  const doc = ctx.doc;
  const prefs = doc.preferences;
  const pages = allPages(ctx);
  const body = bodyPages(ctx);
  // The margins most body pages have.
  const sig = (p: IdmlPage): string => [p.margins.top, p.margins.bottom, p.margins.left, p.margins.right, p.margins.columnCount].map((n) => Math.round(n)).join('/');
  const tally = new Map<string, number>();
  for (const p of body) tally.set(sig(p), (tally.get(sig(p)) ?? 0) + 1);
  const common = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const first = body.find((p) => sig(p) === common) ?? pages[0];
  const size = first ? pageSize(first) : { width: prefs.pageWidth, height: prefs.pageHeight };
  const odd = pages.filter((p) => Math.abs(pageSize(p).width - size.width) > 0.5 || Math.abs(pageSize(p).height - size.height) > 0.5);
  if (odd.length) ctx.rep.add('mixedPageSizes', 'loss', 'Pages of another size than the body pages are set on the book\'s page size: a Postext book has one page size', odd.map((p) => p.name).join(', '), odd.length);
  const m = first?.margins ?? prefs.margins;
  const out: ReturnType<typeof pageConfig> = {};
  out.page = {
    sizePreset: 'custom',
    width: mm(size.width),
    height: mm(size.height),
    binding: prefs.rightToLeft ? 'right' : 'left',
  };
  if (m) {
    out.page.margins = { top: mm(m.top), bottom: mm(m.bottom), left: mm(m.left), right: mm(m.right), mirror: prefs.facingPages };
    const cols = Math.max(1, m.columnCount);
    out.layout = cols === 1 ? { layoutType: 'single' } : cols === 2 ? { layoutType: 'double', gutterWidth: mm(m.columnGutter) } : { layoutType: 'multiple', columnCount: cols, gutterWidth: mm(m.columnGutter) };
    const half = first ? oneAndHalf(first, prefs.facingPages) : undefined;
    if (half) out.layout = half;
    const different = body.filter((p) => Math.abs(p.margins.top - m.top) + Math.abs(p.margins.bottom - m.bottom) + Math.abs(p.margins.left - m.left) + Math.abs(p.margins.right - m.right) > 1 || p.margins.columnCount !== m.columnCount);
    // Composed pages keep every frame where it stands, whatever the
    // book's margins say: a page's own margins move nothing (#1555).
    if (different.length && layout === 'pages') ctx.rep.add('mixedMarginsComposed', 'info', 'Pages with margins or columns of their own keep their frames where they stand: the book\'s margins are those most body pages have, and no composed page follows them', different.map((p) => p.name).slice(0, 8).join(', '), different.length);
    else if (different.length) ctx.rep.add('mixedMargins', 'warning', 'Body pages with margins or columns of their own take the margins most body pages have', different.map((p) => p.name).slice(0, 8).join(', '), different.length);
  }
  const bleed = Math.max(prefs.bleed.top, prefs.bleed.bottom, prefs.bleed.inside, prefs.bleed.outside);
  if (bleed > 0) {
    out.page.cutLines = { enabled: false, bleed: mm(bleed) };
    ctx.rep.add('bleed', 'info', 'The document bleed is written to page.cutLines.bleed with the crop marks switched off; switch page.cutLines.enabled on to print with bleed', `${mm(bleed).value} mm`);
  }
  if (prefs.slug.top + prefs.slug.bottom + prefs.slug.inside + prefs.slug.outside > 0) ctx.rep.add('slug', 'info', 'The slug area is not carried', undefined);
  const s0 = doc.sections[0];
  if (s0) {
    const { format } = numberingOf(ctx, s0);
    const startAt = s0.pageNumberStart ?? prefs.startPageNumber ?? 1;
    out.page.pageNumbering = { format, startAt };
    if (s0.prefix && s0.includePrefix) ctx.rep.add('sectionPrefix', 'warning', 'A section prefix printed with the page number is not carried', s0.prefix);
  }
  const grid = prefs.baselineGrid;
  if (grid.division > 0) ctx.rep.add('baselineGrid', 'info', 'Postext\'s baseline grid is one body line from the top of the type area; the document\'s grid (its start and increment) is not carried', `${grid.division} pt from ${grid.start} pt`);
  return out;
}

/** The side a master page stands for, as a parity of the book's pages. */
export function parityOf(ctx: Context, page: IdmlPage): 'odd' | 'even' | undefined {
  if (page.side === 'single') return undefined;
  // Left-bound: the right page is the recto (odd). Right-bound: the left.
  const recto = ctx.doc.preferences.rightToLeft ? 'left' : 'right';
  return page.side === recto ? 'odd' : 'even';
}

/** A page of two columns of their own widths (the guides give each
 *  column's edges) is a column-and-a-half page: a main column and, the
 *  narrower, a side column for figures and boxes, on the side it stands
 *  (outer or inner of a facing page). The text a Postext export threads
 *  runs in the main column only. */
function oneAndHalf(page: IdmlPage, facing: boolean): PostextConfig['layout'] | undefined {
  const m = page.margins;
  const p = m.columnsPositions;
  if (m.columnCount !== 2 || p.length !== 4) return undefined;
  const a = p[1]! - p[0]!;
  const b = p[3]! - p[2]!;
  if (Math.abs(a - b) < 6) return undefined;
  const area = p[3]! - p[0]!;
  if (area <= 0) return undefined;
  const right = b < a;
  const side = !facing || page.side === 'single' ? (right ? 'right' : 'left') : (page.side === 'right') === right ? 'outer' : 'inner';
  return {
    layoutType: 'oneAndHalf',
    gutterWidth: mm(p[2]! - p[1]!),
    sideColumnPercent: Math.round((Math.min(a, b) / area) * 1000) / 10,
    sideColumnRole: 'floats',
    sideColumnSide: side,
  } as PostextConfig['layout'];
}
