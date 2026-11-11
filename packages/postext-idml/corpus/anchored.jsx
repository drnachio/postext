// anchored: inline, above-line and custom anchored frames, nested
// groups, a table inside an anchored frame.
#include "lib.jsxinc"
var doc = newDoc("170mm", "240mm", 2, false);
var W = doc.documentPreferences.pageWidth, H = doc.documentPreferences.pageHeight;
margins(doc, 54, 54, 120, 42, 1, 12);
var key;
step("swatch", function () { key = doc.colors.add({ name: "Key", model: ColorModel.PROCESS, space: ColorSpace.RGB, colorValue: [30, 120, 200] }); });
var f = frame(doc.pages[0], [54, 120, H - 54, W - 42]);
var s = f.parentStory;
s.contents = "Anchored objects\r" + LOREM + "\r" + LOREM + "\r" + LOREM + "\r" + LOREM + "\r" + LOREM;
step("type", function () { with (s.paragraphs.everyItem()) { appliedFont = "Georgia"; pointSize = 10; leading = 14; spaceAfter = 7; } s.paragraphs[0].pointSize = 20; s.paragraphs[0].fontStyle = "Bold"; s.paragraphs[0].leading = 24; });
var P = s.paragraphs;
step("inline", function () { P[1].insertionPoints[30].rectangles.add({ geometricBounds: [0, 0, 9, 9], fillColor: key }); });
step("inlinePicture", function () { var r = P[1].insertionPoints[90].rectangles.add({ geometricBounds: [0, 0, 24, 36] }); r.place(File(OUT + "/pictures/lamp.png")); r.fit(FitOptions.PROPORTIONALLY); });
step("above", function () { var r = P[2].insertionPoints[0].rectangles.add({ geometricBounds: [0, 0, 80, 200] }); r.anchoredObjectSettings.anchoredPosition = AnchorPosition.ABOVE_LINE; r.place(File(OUT + "/pictures/sea.png")); r.fit(FitOptions.FILL_PROPORTIONALLY); });
step("custom", function () {
  var b = P[3].insertionPoints[0].textFrames.add({ geometricBounds: [0, 0, 70, 66] }); b.contents = "A margin note anchored to its paragraph.";
  b.paragraphs[0].appliedFont = "Arial"; b.paragraphs[0].pointSize = 8; b.paragraphs[0].leading = 10;
  b.anchoredObjectSettings.anchoredPosition = AnchorPosition.ANCHORED; b.anchoredObjectSettings.anchorPoint = AnchorPoint.TOP_RIGHT_ANCHOR; b.anchoredObjectSettings.horizontalReferencePoint = AnchoredRelativeTo.TEXT_FRAME; b.anchoredObjectSettings.horizontalAlignment = HorizontalAlignment.LEFT_ALIGN; b.anchoredObjectSettings.anchorXoffset = 10;
});
step("box", function () {
  var b = P[4].insertionPoints[0].textFrames.add({ geometricBounds: [0, 0, 110, 300] });
  b.anchoredObjectSettings.anchoredPosition = AnchorPosition.ABOVE_LINE; b.fillColor = key; b.fillTint = 15; b.strokeWeight = 0.75; b.strokeColor = key; b.textFramePreferences.insetSpacing = [8, 8, 8, 8];
  b.contents = "A sidebar\rWith a table inside:\r";
  with (b.paragraphs.everyItem()) { appliedFont = "Arial"; pointSize = 9; leading = 12; } b.paragraphs[0].fontStyle = "Bold";
  step("table", function () { var t = b.parentStory.insertionPoints[-1].tables.add({ bodyRowCount: 2, columnCount: 2 }); t.rows[0].cells.everyItem().contents = ["a", "b"]; t.rows[1].cells.everyItem().contents = ["c", "d"]; });
});
step("group", function () {
  var p2 = doc.pages[1];
  var a = p2.rectangles.add({ geometricBounds: [60, 120, 120, 200], fillColor: key });
  var b = p2.ovals.add({ geometricBounds: [60, 210, 120, 290], fillColor: "Black" });
  var g1 = p2.groups.add([a, b]);
  var c = frame(p2, [130, 120, 160, 290], "Text in a nested group"); c.paragraphs[0].appliedFont = "Arial"; c.paragraphs[0].pointSize = 9;
  p2.groups.add([g1, c], { name: "nested" });
});
finish(doc, "anchored");
