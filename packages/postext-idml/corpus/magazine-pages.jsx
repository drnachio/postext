// magazine-pages: a free layout over four pages.
#include "lib.jsxinc"
var doc = newDoc("210mm", "280mm", 4, true);
var W = doc.documentPreferences.pageWidth, H = doc.documentPreferences.pageHeight;
margins(doc, 40, 40, 36, 36, 3, 12);
var sky, red, spot, grad;
step("swatches", function () {
  sky = doc.colors.add({ name: "Sky", model: ColorModel.PROCESS, space: ColorSpace.CMYK, colorValue: [70, 15, 0, 0] });
  red = doc.colors.add({ name: "Signal", model: ColorModel.PROCESS, space: ColorSpace.RGB, colorValue: [215, 40, 40] });
  spot = doc.colors.add({ name: "PANTONE 300 C", model: ColorModel.SPOT, space: ColorSpace.CMYK, colorValue: [100, 44, 0, 0] });
  grad = doc.gradients.add({ name: "Dawn", type: GradientType.LINEAR }); grad.gradientStops[0].stopColor = sky; grad.gradientStops[1].stopColor = doc.swatches.item("Paper");
});
var p1 = doc.pages[0], p2 = doc.pages[1], p3 = doc.pages[2], p4 = doc.pages[3];
var title, a1, a2, a3, pull, side;
step("title", function () {
  title = frame(p1, [40, 36, 120, W - 36], "The River That Changed Course");
  title.paragraphs[0].appliedFont = "Georgia"; title.paragraphs[0].fontStyle = "Bold"; title.paragraphs[0].pointSize = 34; title.paragraphs[0].leading = 38;
});
step("article", function () {
  a1 = p1.textFrames.add({ geometricBounds: [140, 36, H - 40, W - 36] }); a1.textFramePreferences.textColumnCount = 3; a1.textFramePreferences.textColumnGutter = 12;
  a2 = p2.textFrames.add({ geometricBounds: [40, 36, 300, W - 36] }); a2.textFramePreferences.textColumnCount = 3; a2.textFramePreferences.textColumnGutter = 12;
  a3 = p4.textFrames.add({ geometricBounds: [300, 36, H - 40, 330] }); a3.textFramePreferences.textColumnCount = 2; a3.textFramePreferences.textColumnGutter = 12;
  a1.nextTextFrame = a2; a2.nextTextFrame = a3;
  var t = ""; for (var i = 0; i < 14; i++) t += (i ? "\r" : "") + LOREM;
  a1.parentStory.contents = t;
  with (a1.parentStory.paragraphs.everyItem()) { appliedFont = "Georgia"; pointSize = 9.5; leading = 13; justification = Justification.LEFT_JUSTIFIED; firstLineIndent = 10; }
});
step("pull", function () {
  pull = frame(p1, [300, 210, 380, 400], "A pull quote sits over the columns.");
  pull.paragraphs[0].appliedFont = "Georgia"; pull.paragraphs[0].fontStyle = "Italic"; pull.paragraphs[0].pointSize = 18; pull.paragraphs[0].leading = 22; pull.paragraphs[0].fillColor = spot;
  pull.fillColor = "Paper"; pull.textFramePreferences.insetSpacing = [8, 8, 8, 8];
  pull.textWrapPreferences.textWrapMode = TextWrapModes.BOUNDING_BOX_TEXT_WRAP; pull.textWrapPreferences.textWrapOffset = [6, 6, 6, 6];
});
step("rotated", function () {
  var r = frame(p2, [330, 60, 370, 260], "Turned twelve degrees");
  r.paragraphs[0].appliedFont = "Arial"; r.paragraphs[0].fontStyle = "Bold"; r.paragraphs[0].pointSize = 16; r.fillColor = sky; r.textFramePreferences.insetSpacing = [6, 6, 6, 6]; r.rotationAngle = 12;
});
step("overlap", function () {
  var back = p2.rectangles.add({ geometricBounds: [420, 36, 600, 300], fillColor: grad });
  side = frame(p2, [440, 60, 580, 280], "Sidebar\rA box over a gradient ground, with a spot colour rule.");
  side.paragraphs.everyItem().appliedFont = "Arial"; side.paragraphs.everyItem().pointSize = 9; side.paragraphs[0].fontStyle = "Bold";
  p2.graphicLines.add({ geometricBounds: [610, 36, 610, 300], strokeWeight: 2, strokeColor: spot });
  var ov = p2.ovals.add({ geometricBounds: [420, 330, 520, 430], fillColor: red });
  var pg = p2.polygons.add({ geometricBounds: [420, 450, 520, 550], fillColor: sky, strokeWeight: 1.5, strokeColor: spot });
  step("group", function () { p2.groups.add([ov, pg], { name: "shapes" }); });
});
step("pictures", function () {
  var r = p3.rectangles.add({ geometricBounds: [40, 36, 260, W - 36] }); r.place(File(OUT + "/pictures/sea.png")); r.fit(FitOptions.FILL_PROPORTIONALLY);
  var c = frame(p3, [264, 36, 290, W - 36], "The estuary at low water."); c.paragraphs[0].appliedFont = "Georgia"; c.paragraphs[0].fontStyle = "Italic"; c.paragraphs[0].pointSize = 8.5;
  var s = frame(p3, [320, 36, H - 40, 300], LOREM + "\r" + LOREM); with (s.paragraphs.everyItem()) { appliedFont = "Georgia"; pointSize = 9.5; leading = 13; }
  var r2 = p3.rectangles.add({ geometricBounds: [320, 320, 480, W - 36], strokeWeight: 1, strokeColor: "Black" }); r2.place(File(OUT + "/pictures/lamp.png")); r2.fit(FitOptions.PROPORTIONALLY); r2.rotationAngle = -6;
  var jump = frame(p4, [270, 36, 295, 330], "The River, continued"); jump.paragraphs[0].appliedFont = "Georgia"; jump.paragraphs[0].fontStyle = "Bold"; jump.paragraphs[0].pointSize = 12;
});
step("meta", function () { doc.metadataPreferences.documentTitle = "Magazine"; });
finish(doc, "magazine-pages");
