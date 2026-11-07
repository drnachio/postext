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
  const bodyLinePx = bodyPx * ratio;
  const headerLinePx = headerPx * ratio;
  const key = styleId ?? '';
  const label = styleId ? `: ${styleId}` : '';
  const bodyId = reg.define(`table:${key}`, 'PostextTableBody', styleId || 'Default', () => ({
    type: 'paragraph',
    name: `Postext Table${label}`,
    custom: true,
    basedOn: STYLE.normal,
    pPr: {
      // Narrow cells are not hyphenated (the engine sets a cell's words
      // whole).
      suppressAutoHyphens: true,
      before: 0,
      after: 0,
      line: { twips: Math.round((bodyLinePx * 1440) / u.dpi), rule: 'atLeast' },
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
    pPr: { line: { twips: Math.round((headerLinePx * 1440) / u.dpi), rule: 'atLeast' } },
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
  return { body: bodyId, header: headerId, bodyPx, headerPx };
}
