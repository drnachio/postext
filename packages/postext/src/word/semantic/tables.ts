// Table resources as Word tables (#1390): header rows repeated, column
// spans (`w:gridSpan`), row spans (`w:vMerge`), cell fills and alignment
// from the table model and the table style; each cell's text is a fragment
// mapped to the resource cell it came from. The table takes the whole
// width of the column or section it stands in, as a percentage (#1444),
// and its columns keep their proportions as percentages; a caption set
// below it stays with its last row.
//
// The table style is followed as the engine reads it (#1444): only the
// rules it asks for (table/rules.ts), the cells' faces and sizes in cell
// styles (table/styles.ts), its padding as cell margins (rows as tall as
// the engine's: a line and the padding above and below it), zebra rows,
// and columns no narrower than their longest word (table/widths.ts). A
// cell's picture (`TableCell.image`) is an inline picture above its text,
// as wide as the engine draws it.

import { tableHeaderRowCount } from '../../pipeline/resources/resourceLayout/tableSlices.js';
import type { Resource, ResourceKind, TableCell } from '../../types.js';
import type { WriterContext } from './context.js';
import { pictureRun } from './media/figures.js';
import { snippetRuns } from './snippet.js';
import { tableRules } from './table/rules.js';
import { cellStyles } from './table/styles.js';
import { columnFractions, type WordMeasure } from './table/widths.js';
import { hex, paragraph, px, type ParaProps } from './wml.js';

const JC: Record<string, ParaProps['jc']> = { left: 'left', start: 'left', center: 'center', right: 'right', end: 'right' };
const VALIGN: Record<string, string> = { top: 'top', middle: 'center', bottom: 'bottom' };
const PICTURE_KINDS: ReadonlySet<ResourceKind> = new Set(['bitmap', 'svg']);

/** The pictures the cells of the tables `ids` show (their files go into
 *  the package with the other pictures). */
export function tablePictureIds(resources: ReadonlyMap<string, Resource>, ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    const res = resources.get(id);
    if (res?.kind !== 'table' || !res.table) continue;
    for (const row of res.table.model.rows) {
      for (const cell of row) {
        const pic = cell.image ? resources.get(cell.image.resourceId) : undefined;
        if (pic && PICTURE_KINDS.has(pic.kind)) out.add(pic.id);
      }
    }
  }
  return out;
}

export function renderTable(ctx: WriterContext, res: Resource, widthTwips = ctx.textTwips): string {
  const model = res.table!.model;
  const styleId = res.table?.styleId && ctx.resolved.tableStyles.some((s) => s.id === res.table!.styleId) ? res.table.styleId : undefined;
  const style = (styleId && ctx.resolved.tableStyles.find((s) => s.id === styleId)) || ctx.resolved.tableStyle;
  const u = ctx.units;
  const rows = model.rows;
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const width = Math.max(cols * 20, Math.round(widthTwips));
  const widthPx = (width * u.dpi) / 1440;
  const headerRows = tableHeaderRowCount(model);
  const isHeaderCell = (cell: TableCell | undefined, r: number): boolean => cell?.isHeader ?? r < headerRows;
  const cs = cellStyles(ctx, style, styleId);
  const padPx = Math.max(0, px(u, style.cellPadding, cs.bodyPx));
  const padTw = Math.round((padPx * 1440) / u.dpi);
  const measure = (cell: TableCell, r: number): WordMeasure => {
    const header = isHeaderCell(cell, r);
    const bold = (header && style.headerBold) || /\*\*/.test(cell.content);
    const caps = header && style.headerTextTransform === 'uppercase';
    return { charEm: caps ? 0.75 : bold ? 0.66 : 0.6, fontPx: header ? cs.headerPx : cs.bodyPx };
  };
  const fractions = columnFractions(model, cols, widthPx, padPx, measure);
  const grid = fractions.map((f) => Math.max(1, Math.round(width * f)));
  // Fiftieths of a percent of the table's width, per grid column.
  const pct = fractions.map((f) => Math.max(1, Math.round(5000 * f)));
  const keepWithCaption = ctx.resolved.captionStyle.position !== 'above' && !!res.caption;
  const rules = tableRules(u, style, cs.bodyPx);
  const zebra = style.bodyAlternateBackgroundEnabled ? hex(style.bodyAlternateBackground) : undefined;
  const fillOf = (cell: TableCell | undefined, r: number): string | undefined => {
    const own = hex(cell?.background);
    if (own) return own;
    if (isHeaderCell(cell, r)) return style.headerBackgroundEnabled ? hex(style.headerBackground) : undefined;
    if (zebra && (r - headerRows) % 2 === 1) return zebra;
    return style.bodyBackgroundEnabled ? hex(style.bodyBackground) : undefined;
  };

  let trs = '';
  rows.forEach((row, r) => {
    const header = r < headerRows;
    const lastHeader = r === headerRows - 1 && headerRows < rows.length;
    const visible = row.filter((c) => !c.hiddenBy);
    const groupRow = !header && r > headerRows && visible.length > 0 && ((visible.length === 1 && (visible[0]!.colSpan ?? 1) >= cols && cols > 1) || visible.every((c) => c.isHeader));
    let tcs = '';
    for (let c = 0; c < cols; c++) {
      const cell: TableCell | undefined = row[c];
      const hidden = cell?.hiddenBy;
      if (hidden && hidden.row === r) continue;
      const primary = hidden ? rows[hidden.row]?.[hidden.col] : cell;
      const span = Math.max(1, Math.min(cols - c, primary?.colSpan ?? 1));
      const cellWidth = pct.slice(c, c + span).reduce((a, b) => a + b, 0);
      const continues = !!hidden;
      const restarts = !hidden && (cell?.rowSpan ?? 1) > 1;
      const isHeader = continues ? isHeaderCell(primary, hidden.row) : isHeaderCell(cell, r);
      const fill = continues ? fillOf(primary, hidden.row) : fillOf(cell, r);
      let tcPr = `<w:tcW w:w="${cellWidth}" w:type="pct"/>`;
      if (span > 1) tcPr += `<w:gridSpan w:val="${span}"/>`;
      if (continues) tcPr += '<w:vMerge/>';
      else if (restarts) tcPr += '<w:vMerge w:val="restart"/>';
      // A booktabs table's own rules: above a group row, under the header
      // and under a spanning header cell above its last row.
      const top = groupRow ? (rules.groupRule ?? '') : '';
      const bottom = lastHeader ? (rules.headerRule ?? '') : header && r < headerRows - 1 && span > 1 ? (rules.spanRule ?? '') : '';
      if (top || bottom) tcPr += `<w:tcBorders>${top}${bottom}</w:tcBorders>`;
      if (fill) tcPr += `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`;
      const va = primary?.verticalAlign ? VALIGN[primary.verticalAlign] : undefined;
      if (va) tcPr += `<w:vAlign w:val="${va}"/>`;
      const last = keepWithCaption && r === rows.length - 1;
      const props: ParaProps = {
        style: isHeader ? cs.header : cs.body,
        keepNext: last || undefined,
        jc: JC[(continues ? primary : cell)?.align ?? 'left'] ?? 'left',
      };
      let content: string;
      if (!continues && cell) {
        const runs = snippetRuns(ctx, cell.content, cell.content, 0, { kind: 'resource', resourceId: res.id, field: 'cell', row: r, col: c }, 'cell');
        const picture = cellPicture(ctx, cell, (widthPx * cellWidth) / 5000 - 2 * padPx);
        if (picture && runs) content = paragraph({ ...props, keepNext: undefined }, picture) + paragraph({ ...props, before: padTw }, runs);
        else content = paragraph(props, picture + runs);
      } else content = paragraph(props, '');
      tcs += `<w:tc><w:tcPr>${tcPr}</w:tcPr>${content}</w:tc>`;
      c += span - 1;
    }
    // A row is a line (the cell style's leading, also kept by an empty
    // cell: the writing lines of an exam paper) and the padding above and
    // below it, as the engine sets it. No w:trHeight: LibreOffice adds the
    // cell margins on top of it.
    const trPr = header ? '<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>';
    trs += `<w:tr>${trPr}${tcs}</w:tr>`;
  });
  const mar = `<w:top w:w="${padTw}" w:type="dxa"/><w:left w:w="${padTw}" w:type="dxa"/><w:bottom w:w="${padTw}" w:type="dxa"/><w:right w:w="${padTw}" w:type="dxa"/>`;
  return (
    '<w:tbl><w:tblPr>' +
    '<w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/>' +
    `<w:tblBorders>${rules.table}</w:tblBorders>` +
    '<w:tblLayout w:type="autofit"/>' +
    `<w:tblCellMar>${mar}</w:tblCellMar>` +
    '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>' +
    '</w:tblPr>' +
    `<w:tblGrid>${grid.map((g) => `<w:gridCol w:w="${g}"/>`).join('')}</w:tblGrid>` +
    trs +
    '</w:tbl>'
  );
}

/** A cell's picture as an inline drawing, `innerPx` the cell's width
 *  inside its padding: the fraction `image.width` of it, a bitmap never
 *  enlarged past its own size (as the engine fits it). The picture holds
 *  no text, so the importer reads nothing from it. */
function cellPicture(ctx: WriterContext, cell: TableCell, innerPx: number): string {
  const id = cell.image?.resourceId;
  const res = id ? ctx.resources.get(id) : undefined;
  const pic = res ? ctx.media.get(res.id) : undefined;
  if (!res || !pic || !PICTURE_KINDS.has(res.kind)) return '';
  ctx.usedResources.add(res.id);
  const f = cell.image!.width;
  const target = Math.max(1, innerPx * (f !== undefined && Number.isFinite(f) && f > 0 ? Math.min(1, f) : 1));
  // A vector picture fills its target; the prepared size is the column's,
  // which is never narrower than a cell.
  const scaled = res.kind === 'svg' && pic.widthPx < target ? { ...pic, widthPx: target, heightPx: (pic.heightPx * target) / pic.widthPx } : pic;
  return pictureRun(ctx, scaled, res.id, res.altText ?? '', target);
}
