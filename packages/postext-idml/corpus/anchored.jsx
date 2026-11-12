// anchored: inline, above-line and custom anchored frames, an anchored
// box that holds a table, and nested groups. The story runs from page 1
// into a frame under the groups of page 2.
//@include "lib.jsxinc"
var doc = newDoc("170mm", "240mm", 2, false);
var W = doc.documentPreferences.pageWidth, H = doc.documentPreferences.pageHeight;
margins(doc, 54, 54, 120, 42, 1, 12);
var key, black;
step("swatch", function () { key = doc.colors.add({ name: "Key", model: ColorModel.PROCESS, space: ColorSpace.RGB, colorValue: [30, 120, 200] }); black = ink(doc, "Ink", [0, 0, 0, 100]); });
var f = frame(doc.pages[0], [54, 120, H - 54, W - 42]);
var f2 = frame(doc.pages[1], [190, 120, H - 54, W - 42]); f.nextTextFrame = f2;
var s = f.parentStory, at, P = s.paragraphs;
step("text", function () {
  at = setParagraphs(s, [["Anchored objects"], [LOREM, null, "inline"], [LOREM2], [LOREM, null, "above"], [LOREM3, null, "custom"], [LOREM2], [LOREM, null, "box"], [LOREM3], [LOREM], [LOREM2], [LOREM3]]);
  with (P.everyItem()) { appliedFont = "Georgia"; fontStyle = "Regular"; pointSize = 10; leading = 14; spaceAfter = 7; }
  with (P[0]) { pointSize = 20; fontStyle = "Bold"; leading = 24; }
});
// Inline: a swatch and a small picture that sit on the baseline.
step("inline", function () { P[at.inline].insertionPoints[28].rectangles.add({ geometricBounds: [0, 0, 9, 9], fillColor: key, strokeWeight: 0 }); });
step("inlinePicture", function () { var r = P[at.inline].insertionPoints[90].rectangles.add({ geometricBounds: [0, 0, 12, 10], strokeWeight: 0 }); r.place(File(OUT + "/pictures/lamp.png")); r.fit(FitOptions.PROPORTIONALLY); r.fit(FitOptions.CENTER_CONTENT); });
// Above the line: a picture over the first line of its paragraph.
step("above", function () {
  var r = P[at.above].insertionPoints[0].rectangles.add({ geometricBounds: [0, 0, 80, 200], strokeWeight: 0 });
  var a = r.anchoredObjectSettings; a.anchoredPosition = AnchorPosition.ABOVE_LINE; a.horizontalAlignment = HorizontalAlignment.LEFT_ALIGN; a.anchorSpaceAbove = 4; a.anchorYoffset = 6;
  r.place(File(OUT + "/pictures/sea.png")); r.fit(FitOptions.FILL_PROPORTIONALLY); r.fit(FitOptions.CENTER_CONTENT);
});
// Custom: a note in the margin, level with the first line of its paragraph.
step("custom", function () {
  var b = P[at.custom].insertionPoints[0].textFrames.add({ geometricBounds: [0, 0, 60, 66] }); b.contents = "A margin note anchored to its paragraph.";
  with (b.paragraphs[0]) { appliedFont = "Arial"; fontStyle = "Regular"; pointSize = 8; leading = 10; hyphenation = false; }
  var a = b.anchoredObjectSettings; a.anchoredPosition = AnchorPosition.ANCHORED; a.anchorPoint = AnchorPoint.TOP_RIGHT_ANCHOR;
  a.horizontalReferencePoint = AnchoredRelativeTo.TEXT_FRAME; a.horizontalAlignment = HorizontalAlignment.LEFT_ALIGN; a.anchorXoffset = 10;
  a.verticalReferencePoint = VerticallyRelativeTo.LINE_XHEIGHT; a.verticalAlignment = VerticalAlignment.TOP_ALIGN; a.anchorYoffset = 0;
});
step("box", function () {
  var b = P[at.box].insertionPoints[0].textFrames.add({ geometricBounds: [0, 0, 84, 300] });
  var a = b.anchoredObjectSettings; a.anchoredPosition = AnchorPosition.ABOVE_LINE; a.horizontalAlignment = HorizontalAlignment.LEFT_ALIGN; a.anchorSpaceAbove = 4; a.anchorYoffset = 8;
  b.fillColor = key; b.fillTint = 15; b.strokeWeight = 0.75; b.strokeColor = key; b.textFramePreferences.insetSpacing = [8, 8, 8, 8];
  b.contents = "A sidebar\rWith a table inside:\r";
  with (b.paragraphs.everyItem()) { appliedFont = "Arial"; fontStyle = "Regular"; pointSize = 9; leading = 12; } b.paragraphs[0].fontStyle = "Bold";
  step("table", function () {
    var t = b.parentStory.insertionPoints[-1].tables.add({ bodyRowCount: 2, columnCount: 2 }); fillRow(t.rows[0], ["a", "b"]); fillRow(t.rows[1], ["c", "d"]);
    with (t.cells.everyItem().paragraphs.everyItem()) { appliedFont = "Arial"; fontStyle = "Regular"; pointSize = 9; leading = 12; }
  });
});
step("group", function () {
  var p2 = doc.pages[1];
  var a = p2.rectangles.add({ geometricBounds: [54, 120, 114, 200], fillColor: key, strokeWeight: 0 });
  var b = p2.ovals.add({ geometricBounds: [54, 210, 114, 290], fillColor: black, strokeWeight: 0 });
  var g1 = p2.groups.add([a, b], { name: "shapes" });
  var c = frame(p2, [124, 120, 140, 290], "Text in a nested group"); with (c.paragraphs[0]) { appliedFont = "Arial"; fontStyle = "Regular"; pointSize = 9; leading = 12; }
  p2.groups.add([g1, c], { name: "nested" });
});
finish(doc, "anchored");
