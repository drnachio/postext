// Table resources as Word tables (#1390): header rows repeated, column
// spans (`w:gridSpan`), row spans (`w:vMerge`), cell fills and alignment
// from the table model and the table style; each cell's text is a fragment
// mapped to the resource cell it came from.

import type { Resource, TableCell } from '../../types.js';
import type { WriterContext } from './context.js';
import { snippetRuns } from './snippet.js';
import { STYLE } from './styles.js';
import { eighths, halfPoints, hex, paragraph, rPr, type ParaProps } from './wml.js';

const JC: Record<string, ParaProps['jc']> = { left: 'left', start: 'left', center: 'center', right: 'right', end: 'right' };
const VALIGN: Record<string, string> = { top: 'top', middle: 'center', bottom: 'bottom' };

export function renderTable(ctx: WriterContext, res: Resource, widthTwips = ctx.textTwips): string {
  const model = res.table!.model;
  const style = (res.table?.styleId && ctx.resolved.tableStyles.find((s) => s.id === res.table!.styleId)) || ctx.resolved.tableStyle;
  const u = ctx.units;
  const rows = model.rows;
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const weights = model.columnWidths?.length === cols && model.columnWidths.every((w) => w > 0) ? model.columnWidths : new Array<number>(cols).fill(1);
  const total = weights.reduce((a, b) => a + b, 0);
  const width = Math.max(cols * 20, Math.round(widthTwips));
  const grid = weights.map((w) => Math.max(1, Math.round((width * w) / total)));
  const headerRows = Math.min(rows.length, model.headerRowCount ?? 0);

  const color = hex(style.borderColor) ?? '000000';
  const line = (sz: number): string => `w:val="single" w:sz="${Math.max(2, Math.min(96, Math.round(sz)))}" w:space="0" w:color="${color}"`;
  const bw = eighths(u, style.borderWidth);
  const heavy = eighths(u, style.heavyRuleWidth);
  const borders = style.borders
    ? `<w:top ${line(bw)}/><w:left ${line(bw)}/><w:bottom ${line(bw)}/><w:right ${line(bw)}/><w:insideH ${line(bw)}/><w:insideV ${line(bw)}/>`
    : `<w:top ${line(heavy)}/><w:left w:val="nil"/><w:bottom ${line(heavy)}/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/>`;

  let trs = '';
  rows.forEach((row, r) => {
    const header = r < headerRows;
    let tcs = '';
    for (let c = 0; c < cols; c++) {
      const cell: TableCell | undefined = row[c];
      const hidden = cell?.hiddenBy;
      if (hidden && hidden.row === r) continue;
      const primary = hidden ? rows[hidden.row]?.[hidden.col] : cell;
      const span = Math.max(1, Math.min(cols - c, primary?.colSpan ?? 1));
      const cellWidth = grid.slice(c, c + span).reduce((a, b) => a + b, 0);
      const continues = !!hidden;
      const restarts = !hidden && (cell?.rowSpan ?? 1) > 1;
      const isHeader = header || !!cell?.isHeader;
      const fill = hex(cell?.background) ?? (isHeader ? (style.headerBackgroundEnabled ? hex(style.headerBackground) : undefined) : style.bodyBackgroundEnabled ? hex(style.bodyBackground) : undefined);
      let tcPr = `<w:tcW w:w="${cellWidth}" w:type="dxa"/>`;
      if (span > 1) tcPr += `<w:gridSpan w:val="${span}"/>`;
      if (continues) tcPr += '<w:vMerge/>';
      else if (restarts) tcPr += '<w:vMerge w:val="restart"/>';
      if (fill) tcPr += `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`;
      const va = primary?.verticalAlign ? VALIGN[primary.verticalAlign] : undefined;
      if (va) tcPr += `<w:vAlign w:val="${va}"/>`;
      let content = '';
      if (!continues && cell) {
        const runs = snippetRuns(ctx, cell.content, cell.content, 0, { kind: 'resource', resourceId: res.id, field: 'cell', row: r, col: c }, 'cell');
        const props: ParaProps = { style: isHeader ? ctx.styles.tableHeader(!!style.headerBold, !!style.headerItalic) : STYLE.normal, before: 0, after: 0, ind: { firstLine: 0 }, jc: JC[cell.align ?? 'left'] ?? 'left' };
        const runProps = isHeader
          ? rPr({ color: hex(style.headerColor), sz: halfPoints(u, style.headerFontSize) })
          : rPr({ color: hex(style.bodyColor), sz: halfPoints(u, style.bodyFontSize) });
        props.markRPr = runProps;
        content = paragraph(props, injectRunProps(runs, runProps));
      } else content = '<w:p/>';
      tcs += `<w:tc><w:tcPr>${tcPr}</w:tcPr>${content}</w:tc>`;
      c += span - 1;
    }
    const trPr = header ? '<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>';
    trs += `<w:tr>${trPr}${tcs}</w:tr>`;
  });
  return (
    '<w:tbl><w:tblPr>' +
    `<w:tblW w:w="${width}" w:type="dxa"/><w:jc w:val="center"/>` +
    `<w:tblBorders>${borders}</w:tblBorders>` +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>' +
    '</w:tblPr>' +
    `<w:tblGrid>${grid.map((g) => `<w:gridCol w:w="${g}"/>`).join('')}</w:tblGrid>` +
    trs +
    '</w:tbl>'
  );
}

/** Lay the cell's run properties under each run's own (a run's `w:rPr`
 *  wins element by element: the cell's go first when the run has none). */
function injectRunProps(runs: string, props: string): string {
  if (!props) return runs;
  const inner = props.slice('<w:rPr>'.length, -'</w:rPr>'.length);
  return runs.replace(/<w:r>(<w:rPr>([\s\S]*?)<\/w:rPr>)?/g, (_m, _whole: string | undefined, own: string | undefined) => {
    if (own === undefined) return `<w:r>${props}`;
    // Keep the run's style first (CT_RPr order) and add the cell's colour
    // and size only when the run sets none.
    let extra = '';
    if (!/<w:color /.test(own)) extra += /<w:color [^>]*\/>/.exec(inner)?.[0] ?? '';
    if (!/<w:sz /.test(own)) extra += (/<w:sz [^>]*\/>/.exec(inner)?.[0] ?? '') + (/<w:szCs [^>]*\/>/.exec(inner)?.[0] ?? '');
    return `<w:r><w:rPr>${insertOrdered(own, extra)}</w:rPr>`;
  });
}

/** Insert colour/size elements into run properties at their schema place
 *  (before `w:highlight`, `w:u`, `w:shd`, `w:vertAlign`… and after the
 *  toggles). */
function insertOrdered(own: string, extra: string): string {
  if (!extra) return own;
  const after = /<w:(highlight|u|effect|bdr|shd|fitText|vertAlign|rtl|cs|em|lang)\b/.exec(own);
  if (!after) return own + extra;
  return own.slice(0, after.index) + extra + own.slice(after.index);
}
