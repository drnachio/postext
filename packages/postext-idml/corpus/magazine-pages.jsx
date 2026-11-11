// magazine-pages: a free layout over four facing pages. The article runs
// through three threaded frames: page 1, the top of page 2, and the jump
// on page 4.
#include "lib.jsxinc"
var doc = newDoc("210mm", "280mm", 4, true);
var W = doc.documentPreferences.pageWidth, H = doc.documentPreferences.pageHeight;
margins(doc, 40, 40, 36, 36, 3, 12);
var L = 36, R = W - 36;
var sky, red, spot, grad, white, black;
step("swatches", function () {
  white = ink(doc, "White", [0, 0, 0, 0]); black = ink(doc, "Ink", [0, 0, 0, 100]);
  sky = ink(doc, "Sky", [70, 15, 0, 0]);
  red = doc.colors.add({ name: "Signal", model: ColorModel.PROCESS, space: ColorSpace.RGB, colorValue: [215, 40, 40] });
  spot = doc.colors.add({ name: "PANTONE 300 C", model: ColorModel.SPOT, space: ColorSpace.CMYK, colorValue: [100, 44, 0, 0] });
  grad = doc.gradients.add({ name: "Dawn", type: GradientType.LINEAR }); grad.gradientStops[0].stopColor = sky; grad.gradientStops[1].stopColor = white;
});
var p1 = doc.pages[0], p2 = doc.pages[1], p3 = doc.pages[2], p4 = doc.pages[3];
var title, a1, a2, a3, pull, side;
function face(text, font, style, size, lead) { with (text.paragraphs.everyItem()) { appliedFont = font; fontStyle = style; pointSize = size; leading = lead; } }
step("title", function () {
  title = frame(p1, [40, L, 124, R], "The River That Changed Course");
  face(title, "Georgia", "Bold", 34, 38); title.paragraphs[0].hyphenation = false;
});
// The pull quote goes in first, so the article composes around its wrap.
step("pull", function () {
  pull = frame(p1, [330, 214, 420, 381], "A pull quote sits over the columns.");
  face(pull, "Georgia", "Italic", 18, 22); pull.paragraphs[0].fillColor = spot; pull.paragraphs[0].hyphenation = false;
  pull.fillColor = white; pull.textFramePreferences.insetSpacing = [8, 8, 8, 8];
  pull.textWrapPreferences.textWrapMode = TextWrapModes.BOUNDING_BOX_TEXT_WRAP; pull.textWrapPreferences.textWrapOffset = [6, 6, 6, 6];
});
step("article", function () {
  a1 = p1.textFrames.add({ geometricBounds: [140, L, H - 40, R] });
  a2 = p2.textFrames.add({ geometricBounds: [40, L, 300, R] });
  a3 = p4.textFrames.add({ geometricBounds: [74, L, 330, R] });
  var all = [a1, a2, a3];
  for (var i = 0; i < 3; i++) { all[i].textFramePreferences.textColumnCount = 3; all[i].textFramePreferences.textColumnGutter = 12; }
  a1.nextTextFrame = a2; a2.nextTextFrame = a3; a3.textFramePreferences.verticalBalanceColumns = true;
  setParagraphs(a1.parentStory, lorem(31, null, null));
  with (a1.parentStory.paragraphs.everyItem()) { appliedFont = "Georgia"; fontStyle = "Regular"; pointSize = 9.5; leading = 13; justification = Justification.LEFT_JUSTIFIED; firstLineIndent = 10; }
  a1.parentStory.paragraphs[0].firstLineIndent = 0;
});
step("rotated", function () {
  var r = frame(p2, [330, 60, 370, 260], "Turned twelve degrees");
  face(r, "Arial", "Bold", 16, 20); r.fillColor = sky; r.textFramePreferences.insetSpacing = [6, 6, 6, 6]; r.textFramePreferences.verticalJustification = VerticalJustification.CENTER_ALIGN; r.rotationAngle = 12;
});
step("overlap", function () {
  p2.rectangles.add({ geometricBounds: [420, L, 600, 300], fillColor: grad, strokeWeight: 0 });
  side = frame(p2, [440, 60, 580, 280], "Sidebar\rA box over a gradient ground, with a spot colour rule.");
  face(side, "Arial", "Regular", 9, 12); side.paragraphs[0].fontStyle = "Bold";
  side.fillColor = white; side.textFramePreferences.insetSpacing = [8, 8, 8, 8];
  p2.graphicLines.add({ geometricBounds: [612, L, 612, 300], strokeWeight: 2, strokeColor: spot });
  var ov = p2.ovals.add({ geometricBounds: [420, 330, 520, 430], fillColor: red, strokeWeight: 0 });
  var pg = p2.polygons.add({ geometricBounds: [420, 450, 520, 550], fillColor: sky, strokeWeight: 1.5, strokeColor: spot });
  step("group", function () { p2.groups.add([ov, pg], { name: "shapes" }); });
});
step("pictures", function () {
  var r = p3.rectangles.add({ geometricBounds: [40, L, 260, R], strokeWeight: 0 }); r.place(File(OUT + "/pictures/sea.png")); r.fit(FitOptions.FILL_PROPORTIONALLY); r.fit(FitOptions.CENTER_CONTENT);
  var c = frame(p3, [264, L, 280, R], "The estuary at low water."); face(c, "Georgia", "Italic", 8.5, 11);
  var s = frame(p3, [310, L, 440, 300]); setParagraphs(s.parentStory, lorem(2, null, null)); face(s, "Georgia", "Regular", 9.5, 13);
  var r2 = p3.rectangles.add({ geometricBounds: [320, 350, 500, 500], strokeWeight: 1, strokeColor: black }); r2.place(File(OUT + "/pictures/lamp.png")); r2.fit(FitOptions.PROPORTIONALLY); r2.fit(FitOptions.CENTER_CONTENT); r2.rotationAngle = -6;
  var c2 = frame(p3, [520, 350, 536, 500], "The lamp, turned six degrees."); face(c2, "Georgia", "Italic", 8.5, 11);
});
step("jump", function () { var jump = frame(p4, [40, L, 62, R], "The River, continued"); face(jump, "Georgia", "Bold", 12, 15); });
step("meta", function () { doc.metadataPreferences.documentTitle = "Magazine"; });
finish(doc, "magazine-pages");
