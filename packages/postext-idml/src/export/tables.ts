// Tables as InDesign tables: a text frame on the table's box holding one
// table whose columns and rows have the widths and heights Postext laid
// them out with, each cell its fill, its edges and its text (with the
// lines kept, as any text). Pictures in cells are page items over the
// table, where Postext drew them.

import type { DisplayItem, DisplayRect } from 'postext';
import { swatch } from './colours.js';
import { boxGeometry } from './geometry.js';
import { imageXml } from './images.js';
import { attr } from './parts.js';
import { paragraphsXml, storyPartXml } from './story.js';
import type { Writer } from './writer.js';

type TableItem = Extract<DisplayItem, { kind: 'table' }>;
type Cell = TableItem['cells'][number];

const EDGES = ['Top', 'Left', 'Bottom', 'Right'] as const;

/** The strokes of a cell's four edges: the table's border on the edges
 *  its `rules` draw, nothing on the others (InDesign strokes every edge
 *  of a cell unless told not to). */
function edgeAttrs(w: Writer, t: TableItem, c: Cell): string {
  const stroke = t.borderWidthPx && t.rules !== 'none' ? swatch(w, t.borderColor) : undefined;
  const weight = stroke ? t.borderWidthPx! * w.k : 0;
  const cols = t.columnEdges.length - 1;
  const rows = t.rowEdges.length - 1;
  const outer = { Top: c.row === 0, Left: c.col === 0, Bottom: c.row + c.rowSpan >= rows, Right: c.col + c.colSpan >= cols };
  const rules = t.rules ?? 'grid';
  let out = '';
  for (const e of EDGES) {
    const on = !!stroke && (rules === 'grid' || (rules === 'horizontal' && (e === 'Top' || e === 'Bottom')) || (rules === 'outer' && outer[e]));
    out += `${attr(`${e}EdgeStrokeWeight`, on ? weight : 0)}${attr(`${e}EdgeStrokeColor`, on ? stroke!.ref : 'Swatch/None')} ${e}EdgeStrokeType="StrokeStyle/$ID/Solid" ${e}EdgeStrokeTint="100"${on && stroke!.overprint ? ` ${e}EdgeStrokeOverprint="true"` : ''}`;
  }
  return out;
}

function cellXml(w: Writer, t: TableItem, self: string, c: Cell): string {
  const fill = swatch(w, c.background);
  const item = c.item && c.item.lines.length ? c.item : undefined;
  // InDesign 2026 writes a cell's insets as `Text…Inset` and reads them
  // from `…Inset`: with the first alone it keeps its default 4 pt, and the
  // text of a row of fixed height is overset. Both are written.
  const insetAttrs = (left: number, right: number): string =>
    ` TextTopInset="0"${attr('TextLeftInset', left)} TextBottomInset="0"${attr('TextRightInset', right)} TopInset="0"${attr('LeftInset', left)} BottomInset="0"${attr('RightInset', right)}`;
  let insets = insetAttrs(0, 0);
  let baseline = '';
  let body = '<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle"><CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"/></ParagraphStyleRange>';
  if (item) {
    const r: DisplayRect = c.rect;
    const left = Math.max(0, (item.bbox.x - r.x) * w.k);
    const right = Math.max(0, (r.x + r.width - (item.bbox.x + item.bbox.width)) * w.k);
    insets = insetAttrs(left, right);
    baseline = ` FirstBaselineOffset="FixedHeight"${attr('MinimumFirstBaselineOffset', Math.max(0, (item.lines[0]!.baseline - r.y) * w.k))}`;
    // A cell's story is horizontal (`tableXml`): its lines as such.
    body = paragraphsXml(w, [{ ...item, frame: undefined, lines: item.lines.map(({ vertical: _, ...l }) => l) }], undefined) || body;
  }
  return (
    `<Cell${attr('Self', `${self}i${c.col}_${c.row}`)}${attr('Name', `${c.col}:${c.row}`)}${attr('RowSpan', c.rowSpan)}${attr('ColumnSpan', c.colSpan)} AppliedCellStyle="CellStyle/$ID/[None]" AppliedCellStylePriority="0"` +
    `${insets} VerticalJustification="TopAlign"${baseline} ClipContentToTextCell="false"${attr('FillColor', fill?.ref ?? 'Swatch/None')}${fill && fill.opacity < 1 ? attr('FillTint', fill.opacity * 100) : ''}${fill?.overprint ? ' OverprintFill="true"' : ''}${edgeAttrs(w, t, c)}>` +
    `${body}</Cell>`
  );
}

/** The table as a text frame with its story, and the page items of the
 *  pictures its cells hold. */
export function tableXml(w: Writer, t: TableItem, pageIndex: number): string {
  const cols = t.columnEdges.length - 1;
  const rows = t.rowEdges.length - 1;
  if (cols < 1 || rows < 1) return '';
  const self = w.next();
  const storyId = w.next();
  const widths = t.columnEdges.slice(1).map((e, i) => Math.max(0.5, (e - t.columnEdges[i]!) * w.k));
  const heights = t.rowEdges.slice(1).map((e, i) => Math.max(0.5, (e - t.rowEdges[i]!) * w.k));
  // Every slot of the grid a cell does not cover holds an empty cell.
  const covered = new Set<string>();
  for (const c of t.cells) for (let r = c.row; r < c.row + c.rowSpan; r++) for (let k = c.col; k < c.col + c.colSpan; k++) covered.add(`${k}:${r}`);
  const cells = [...t.cells];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      if (covered.has(`${k}:${r}`)) continue;
      cells.push({ row: r, col: k, rowSpan: 1, colSpan: 1, rect: { x: t.columnEdges[k]!, y: t.rowEdges[r]!, width: t.columnEdges[k + 1]! - t.columnEdges[k]!, height: t.rowEdges[r + 1]! - t.rowEdges[r]! }, item: null });
    }
  }
  cells.sort((a, b) => a.row - b.row || a.col - b.col);
  if (t.cells.some((c) => c.item?.lines.some((l) => l.vertical))) w.warn('text.vertical.table', `Page ${pageIndex + 1}: a table set vertically is written turned, its cells horizontal stories`);
  if (t.frameRadii?.some((r) => r > 0)) w.warn('table.radius', `Page ${pageIndex + 1}: a table's rounded frame is written square (InDesign tables have no corner radius)`);
  const table =
    `<Table${attr('Self', self)} HeaderRowCount="0" FooterRowCount="0"${attr('BodyRowCount', rows)}${attr('ColumnCount', cols)} AppliedTableStyle="TableStyle/$ID/[No table style]" TableDirection="LeftToRightDirection" SpaceBefore="0" SpaceAfter="0"` +
    ' TopBorderStrokeWeight="0" LeftBorderStrokeWeight="0" BottomBorderStrokeWeight="0" RightBorderStrokeWeight="0">' +
    heights.map((h, i) => `<Row${attr('Self', `${self}Row${i}`)}${attr('Name', String(i))}${attr('SingleRowHeight', h)}${attr('MinimumHeight', h)}${attr('MaximumHeight', h)} AutoGrow="false"/>`).join('') +
    widths.map((cw, i) => `<Column${attr('Self', `${self}Column${i}`)}${attr('Name', String(i))}${attr('SingleColumnWidth', cw)}/>`).join('') +
    cells.map((c) => cellXml(w, t, self, c)).join('') +
    '</Table>';
  w.stories.push({
    id: storyId,
    xml: storyPartXml(storyId, `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle" SpaceBefore="0" SpaceAfter="0" LeftIndent="0" FirstLineIndent="0"><CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]">${table}</CharacterStyleRange></ParagraphStyleRange>`),
  });
  // Room under the table for the line that holds it.
  const box = { ...t.rect, height: t.rect.height + 14 / w.k, width: t.rect.width + 1 / w.k };
  const g = boxGeometry(w, t.rotate ? t.rect : box, t.rotate);
  const frame =
    `<TextFrame${attr('Self', w.next())}${attr('ParentStory', storyId)} PreviousTextFrame="n" NextTextFrame="n" ContentType="TextType" ItemLayer="ulayer"${attr('ItemTransform', g.transform)} AppliedObjectStyle="ObjectStyle/$ID/[None]" FillColor="Swatch/None" StrokeColor="Swatch/None" StrokeWeight="0" Name="Table">` +
    g.geometry +
    `<TextFramePreference TextColumnCount="1" FirstBaselineOffset="AscentOffset" VerticalJustification="TopAlign"${attr('InsetSpacing', '0 0 0 0')} AutoSizingType="Off" IgnoreWrap="true"/>` +
    '</TextFrame>';
  const pictures = t.cells.map((c) => (c.image ? imageXml(w, c.image, pageIndex) : '')).join('');
  return frame + pictures;
}
