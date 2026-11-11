// tables: every kind of cell on one page. Cells are addressed by name,
// "column:row", which stays true after a merge.
#include "lib.jsxinc"
var doc = newDoc("210mm", "297mm", 1, false);
var W = doc.documentPreferences.pageWidth, H = doc.documentPreferences.pageHeight;
margins(doc, 54, 54, 54, 54, 1, 12);
var tint;
step("swatch", function () { tint = ink(doc, "Band", [10, 0, 30, 0]); });
var f = frame(doc.pages[0], [54, 54, H - 54, W - 54]);
var s = f.parentStory, at;
step("text", function () {
  at = setParagraphs(s, [["Tables"], ["A ledger with a header row, a footer row and cells of every kind."], ["", null, "t1"], ["After the first table. " + LOREM2], ["", null, "t2"], ["After the second table. " + LOREM3]]);
  with (s.paragraphs.everyItem()) { appliedFont = "Arial"; fontStyle = "Regular"; pointSize = 10; leading = 14; spaceAfter = 10; }
  s.paragraphs[0].pointSize = 20; s.paragraphs[0].fontStyle = "Bold"; s.paragraphs[0].leading = 24;
});
function cellAt(t, col, row) { return t.cells.itemByName(col + ":" + row); }
step("t1", function () {
  var t = s.paragraphs[at.t1].insertionPoints[0].tables.add({ bodyRowCount: 4, columnCount: 4, headerRowCount: 1, footerRowCount: 1 });
  t.width = 420;
  fillRow(t.rows[0], ["Item", "Qty", "Price", "Note"]);
  fillRow(t.rows[1], ["Rope", "2", "12.50", ""]);
  fillRow(t.rows[5], ["Total", "", "25.00", ""]);
  step("across", function () { cellAt(t, 0, 2).merge(cellAt(t, 1, 2)); cellAt(t, 0, 2).contents = "merged across"; cellAt(t, 2, 2).contents = "12.50"; cellAt(t, 3, 2).contents = "plain"; });
  step("down", function () { cellAt(t, 0, 3).merge(cellAt(t, 0, 4)); cellAt(t, 0, 3).contents = "merged down"; });
  step("fill", function () { cellAt(t, 1, 3).fillColor = tint; cellAt(t, 1, 3).contents = "filled"; });
  step("bottom", function () { cellAt(t, 2, 3).verticalJustification = VerticalJustification.BOTTOM_ALIGN; cellAt(t, 2, 3).contents = "bottom"; });
  step("turned", function () { cellAt(t, 3, 3).rotationAngle = 90; cellAt(t, 3, 3).contents = "turned"; });
  step("diagonal", function () { var c = cellAt(t, 1, 4); c.topLeftDiagonalLine = true; c.diagonalLineStrokeWeight = 0.5; });
  step("right", function () { var c = cellAt(t, 2, 4); c.contents = "a | b * c [^1] :chip[x]{y}"; c.paragraphs[0].justification = Justification.RIGHT_ALIGN; });
  step("middle", function () { var c = cellAt(t, 3, 4); c.contents = "centre"; c.verticalJustification = VerticalJustification.CENTER_ALIGN; c.paragraphs[0].justification = Justification.CENTER_ALIGN; });
  step("sizes", function () { t.columns[0].width = 150; t.columns[1].width = 80; t.columns[2].width = 110; t.columns[3].width = 80; t.rows[3].height = 44; t.rows[4].height = 30; });
  step("type", function () { with (t.cells.everyItem().paragraphs.everyItem()) { appliedFont = "Arial"; fontStyle = "Regular"; pointSize = 9; leading = 12; spaceAfter = 0; } t.rows[0].cells.everyItem().paragraphs.everyItem().fontStyle = "Bold"; t.rows[5].cells.everyItem().paragraphs.everyItem().fontStyle = "Bold"; });
  step("styles", function () { var ts = doc.tableStyles.add({ name: "Ledger" }); var cs = doc.cellStyles.add({ name: "Money" }); cs.fillColor = tint; t.appliedTableStyle = ts; cellAt(t, 2, 1).appliedCellStyle = cs; cellAt(t, 2, 5).appliedCellStyle = cs; });
  step("graphic", function () { var g = cellAt(t, 3, 1); g.convertCellType(CellTypeEnum.GRAPHIC_TYPE_CELL); t.rows[1].height = 40; var r = g.rectangles[0]; r.place(File(OUT + "/pictures/lamp.png")); r.fit(FitOptions.PROPORTIONALLY); r.fit(FitOptions.CENTER_CONTENT); });
});
step("t2", function () {
  doc.footnoteOptions.footnoteTextStyle = doc.paragraphStyles.add({ name: "Footnote", appliedFont: "Arial", fontStyle: "Regular", pointSize: 8, leading: 10 });
  var t = s.paragraphs[at.t2].insertionPoints[0].tables.add({ bodyRowCount: 2, columnCount: 2 });
  t.width = 360;
  cellAt(t, 0, 0).contents = "outer";
  cellAt(t, 0, 1).contents = "First line\rSecond paragraph";
  cellAt(t, 1, 1).contents = "A cell with a note";
  with (t.cells.everyItem().paragraphs.everyItem()) { appliedFont = "Arial"; fontStyle = "Regular"; pointSize = 9; leading = 12; spaceAfter = 0; }
  step("nested", function () {
    var n = cellAt(t, 1, 0).insertionPoints[0].tables.add({ bodyRowCount: 2, columnCount: 2 });
    fillRow(n.rows[0], ["n1", "n2"]); fillRow(n.rows[1], ["n3", "n4"]);
    with (n.cells.everyItem().paragraphs.everyItem()) { appliedFont = "Arial"; fontStyle = "Regular"; pointSize = 9; leading = 12; spaceAfter = 0; }
  });
  step("note", function () { var fn = cellAt(t, 1, 1).insertionPoints[-1].footnotes.add(); fn.insertionPoints[-1].contents = "A note in a cell."; });
});
finish(doc, "tables");
