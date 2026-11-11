// tables: every kind of cell.
#include "lib.jsxinc"
var doc = newDoc("210mm", "297mm", 2, false);
var W = doc.documentPreferences.pageWidth, H = doc.documentPreferences.pageHeight;
margins(doc, 54, 54, 54, 54, 1, 12);
var tint;
step("swatch", function () { tint = doc.colors.add({ name: "Band", model: ColorModel.PROCESS, space: ColorSpace.CMYK, colorValue: [10, 0, 30, 0] }); });
var f = frame(doc.pages[0], [54, 54, H - 54, W - 54], "Tables\r\rAfter the first table.\r\rAfter the second table.");
var s = f.parentStory;
step("type", function () { with (s.paragraphs.everyItem()) { appliedFont = "Arial"; pointSize = 10; leading = 14; } s.paragraphs[0].pointSize = 20; s.paragraphs[0].fontStyle = "Bold"; s.paragraphs[0].leading = 24; });
step("t1", function () {
  var t = s.paragraphs[1].insertionPoints[0].tables.add({ bodyRowCount: 4, columnCount: 4, headerRowCount: 1, footerRowCount: 1 });
  t.rows[0].cells.everyItem().contents = ["Item", "Qty", "Price", "Note"];
  t.rows[1].cells.everyItem().contents = ["Rope", "2", "12.50", "plain"];
  t.rows[2].cells[0].contents = "merged across"; t.rows[2].cells[0].merge(t.rows[2].cells[1]);
  t.rows[3].cells[0].contents = "merged down"; t.rows[3].cells[0].merge(t.rows[4].cells[0]);
  t.rows[3].cells[1].fillColor = tint; t.rows[3].cells[1].contents = "filled";
  t.rows[3].cells[2].verticalJustification = VerticalJustification.BOTTOM_ALIGN; t.rows[3].cells[2].contents = "bottom";
  t.rows[3].cells[3].rotationAngle = 90; t.rows[3].cells[3].contents = "turned";
  t.rows[4].cells[1].topLeftDiagonalLine = true; t.rows[4].cells[1].contents = "diagonal";
  t.rows[4].cells[2].contents = "a | b * c [^1] :chip[x]{y}";
  t.rows[4].cells[2].paragraphs[0].justification = Justification.RIGHT_ALIGN;
  t.rows[-1].cells.everyItem().contents = ["Total", "", "25.00", ""];
  t.columns[0].width = 150; t.rows[3].height = 40;
  step("styles", function () { var ts = doc.tableStyles.add({ name: "Ledger" }); var cs = doc.cellStyles.add({ name: "Money" }); cs.fillColor = tint; t.appliedTableStyle = ts; t.rows[1].cells[2].appliedCellStyle = cs; });
  step("graphic", function () { var g = t.rows[1].cells[3]; g.convertCellType(CellTypeEnum.GRAPHIC_TYPE_CELL); g.rectangles[0].place(File(OUT + "/pictures/lamp.png")); });
});
step("t2", function () {
  var t = s.paragraphs[3].insertionPoints[0].tables.add({ bodyRowCount: 2, columnCount: 2 });
  t.rows[0].cells[0].contents = "outer";
  step("nested", function () { var n = t.rows[0].cells[1].insertionPoints[0].tables.add({ bodyRowCount: 2, columnCount: 2 }); n.rows[0].cells.everyItem().contents = ["n1", "n2"]; n.rows[1].cells.everyItem().contents = ["n3", "n4"]; });
  t.rows[1].cells[0].contents = "First line\rSecond paragraph";
  step("note", function () { var fn = t.rows[1].cells[1].insertionPoints[0].footnotes.add(); fn.insertionPoints[-1].contents = "A note in a cell."; });
});
finish(doc, "tables");
