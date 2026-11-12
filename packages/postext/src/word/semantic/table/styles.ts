// Paragraph styles of table cells (#1444): one body and one header style
// per table style, carrying the cells' own faces, sizes, colours and
// leading (`tableStyle.bodyFontFamily`, `headerFontFamily`…), so a cell is
// not set in the body text's Normal. Header bold and italic live in the
// style, never on the runs: the importer reads run bold as emphasis the
// user added.

import type { ResolvedTableStyleConfig } from '../../../types.js';
import type { WriterContext } from '../context.js';
import { STYLE } from '../styles.js';
import { halfPoints, hex, px, twips } from '../wml.js';

/** The two cell styles of a table style, and their sizes in px. */
export interface CellStyles {
  body: string;
  header: string;
  /** Font size of body and header cells, px. */
  bodyPx: number;
  headerPx: number;
  /** A cell paragraph's leading, twips (exact in the styles). */
  bodyLine: number;
  headerLine: number;
}

/** The cell styles of `style` (named `styleId`, or the document's). */
export function cellStyles(ctx: WriterContext, style: ResolvedTableStyleConfig, styleId: string | undefined): CellStyles {
  const u = ctx.units;
  const reg = ctx.styles;
  const body = ctx.resolved.bodyText;
  const bodyTextPx = px(u, body.fontSize) || u.basePx;
  // Cells keep the body's leading, scaled to their own size, as the engine
  // sets them.
  const ratio = (px(u, body.lineHeight, bodyTextPx) || bodyTextPx * 1.2) / bodyTextPx;
  const bodyPx = px(u, style.bodyFontSize) || bodyTextPx;
  const headerPx = px(u, style.headerFontSize) || bodyTextPx;
  const bodyLine = Math.round((bodyPx * ratio * 1440) / u.dpi);
  const headerLine = Math.round((headerPx * ratio * 1440) / u.dpi);
  const key = styleId ?? '';
  const label = styleId ? `: ${styleId}` : '';
  const bodyId = reg.define(`table:${key}`, 'PostextTableBody', styleId || 'Default', () => ({
    type: 'paragraph',
    name: `Postext Table${label}`,
    custom: true,
    basedOn: STYLE.normal,
    pPr: {
      // Narrow cells are not hyphenated (the engine sets a cell's words
      // whole) unless the table style hyphenates them (`hyphenation`).
      suppressAutoHyphens: !style.hyphenation || undefined,
      before: 0,
      after: 0,
      // Exactly the engine's leading: a face with tall metrics would
      // otherwise open every row up (#1444). A cell holding a picture or
      // an equation is set at least that tall instead (tables.ts).
      line: { twips: bodyLine, rule: 'exact' },
      ind: { firstLine: 0 },
    },
    rPr: { ...reg.font(style.bodyFontFamily, body.fontWeight), color: hex(style.bodyColor), sz: halfPoints(u, style.bodyFontSize) },
  }));
  const weight = style.headerBold ? body.boldFontWeight : body.fontWeight;
  const headerId = reg.define(`tableHeader:${key}`, 'PostextTableHeader', styleId || 'Default', () => ({
    type: 'paragraph',
    name: `Postext Table Header${label}`,
    custom: true,
    basedOn: bodyId,
    pPr: { line: { twips: headerLine, rule: 'exact' } },
    rPr: {
      ...reg.font(style.headerFontFamily, weight, style.headerItalic),
      b: style.headerBold,
      i: style.headerItalic,
      caps: style.headerTextTransform === 'uppercase' || undefined,
      color: hex(style.headerColor),
      spacing: twips(u, style.headerLetterSpacing, headerPx) || undefined,
      sz: halfPoints(u, style.headerFontSize),
    },
  }));
  return { body: bodyId, header: headerId, bodyPx, headerPx, bodyLine, headerLine };
}
