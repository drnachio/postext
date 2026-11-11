// book-flow: a facing-pages book. The main story runs through one frame
// per page, threaded in page order; the master carries the running head
// and the folio.
#include "lib.jsxinc"
var doc = newDoc("148mm", "210mm", 16, true);
var W = doc.documentPreferences.pageWidth, H = doc.documentPreferences.pageHeight;
margins(doc, 54, 60, 54, 42, 1, 12);
var body, first, note, h1, h2, quote, bullets, numbers, figure, caption, cell, runhead, titleS, em, strong;
step("styles", function () {
  body = doc.paragraphStyles.add({ name: "Body", appliedFont: "Georgia", fontStyle: "Regular", pointSize: 10.5, leading: 14, justification: Justification.LEFT_JUSTIFIED, firstLineIndent: 12, hyphenation: true });
  first = doc.paragraphStyles.add({ name: "Body first", basedOn: body, firstLineIndent: 0 });
  note = doc.paragraphStyles.add({ name: "Footnote", basedOn: body, pointSize: 8.5, leading: 11, firstLineIndent: 0 });
  h1 = doc.paragraphStyles.add({ name: "Chapter title", basedOn: body, pointSize: 22, leading: 26, fontStyle: "Bold", firstLineIndent: 0, spaceAfter: 28, justification: Justification.LEFT_ALIGN, startParagraph: StartParagraph.NEXT_PAGE, hyphenation: false });
  h2 = doc.paragraphStyles.add({ name: "H2", basedOn: body, pointSize: 13, leading: 14, fontStyle: "Bold", firstLineIndent: 0, spaceBefore: 14, spaceAfter: 14, justification: Justification.LEFT_ALIGN, keepWithNext: 2, hyphenation: false });
  quote = doc.paragraphStyles.add({ name: "Quote", basedOn: body, fontStyle: "Italic", leftIndent: 18, rightIndent: 18, firstLineIndent: 0, spaceBefore: 7, spaceAfter: 7 });
  bullets = doc.paragraphStyles.add({ name: "Bullets", basedOn: body, bulletsAndNumberingListType: ListType.BULLET_LIST, leftIndent: 14, firstLineIndent: -14 });
  numbers = doc.paragraphStyles.add({ name: "Numbers", basedOn: body, bulletsAndNumberingListType: ListType.NUMBERED_LIST, leftIndent: 14, firstLineIndent: -14, numberingExpression: "^#.^t" });
  figure = doc.paragraphStyles.add({ name: "Figure", basedOn: body, firstLineIndent: 0, leading: Leading.AUTO, spaceBefore: 14, justification: Justification.CENTER_ALIGN, keepWithNext: 1 });
  caption = doc.paragraphStyles.add({ name: "Caption", basedOn: body, pointSize: 8.5, leading: 11, fontStyle: "Italic", firstLineIndent: 0, spaceBefore: 4, spaceAfter: 14, justification: Justification.CENTER_ALIGN });
  cell = doc.paragraphStyles.add({ name: "Cell", basedOn: body, pointSize: 9, leading: 12, firstLineIndent: 0, justification: Justification.LEFT_ALIGN, hyphenation: false });
  runhead = doc.paragraphStyles.add({ name: "Running head", basedOn: body, pointSize: 8.5, leading: 11, firstLineIndent: 0, justification: Justification.CENTER_ALIGN, hyphenation: false });
  titleS = doc.paragraphStyles.add({ name: "Title", basedOn: body, pointSize: 26, leading: 30, firstLineIndent: 0, spaceAfter: 14, justification: Justification.CENTER_ALIGN, hyphenation: false });
  em = doc.characterStyles.add({ name: "Emphasis", fontStyle: "Italic" });
  strong = doc.characterStyles.add({ name: "Strong", fontStyle: "Bold" });
});
// The master: a running head and an automatic page number on both pages.
step("master", function () {
  var m = doc.masterSpreads[0];
  for (var i = 0; i < m.pages.length; i++) {
    var p = m.pages[i], a = typeArea(p);
    var rh = frame(p, [28, a[1], 42, a[3]], "The Lighthouse Keeper"); rh.paragraphs[0].appliedParagraphStyle = runhead;
    var fo = frame(p, [H - 44, a[1], H - 30, a[3]]); fo.contents = SpecialCharacters.AUTO_PAGE_NUMBER; fo.paragraphs[0].appliedParagraphStyle = runhead;
  }
});
// The title page and the dedication stand alone, without the master.
step("front", function () {
  var p1 = doc.pages[0], p2 = doc.pages[1], a = typeArea(p1), b = typeArea(p2);
  p1.appliedMaster = NothingEnum.NOTHING; p2.appliedMaster = NothingEnum.NOTHING;
  var t = frame(p1, [150, a[1], 300, a[3]], "The Lighthouse Keeper\rA short book");
  t.paragraphs[0].appliedParagraphStyle = titleS; t.paragraphs[1].appliedParagraphStyle = runhead;
  var d = frame(p2, [400, b[1], 460, b[3]], "For those who keep the light.");
  d.paragraphs[0].appliedParagraphStyle = quote; d.paragraphs[0].justification = Justification.CENTER_ALIGN;
});
// One frame on every later page, threaded in page order.
var frames = [];
function addFrame(page) { var f = page.textFrames.add({ geometricBounds: typeArea(page) }); if (frames.length) frames[frames.length - 1].nextTextFrame = f; frames.push(f); return f; }
step("thread", function () { for (var i = 2; i < doc.pages.length; i++) addFrame(doc.pages[i]); });
var s, at;
step("text", function () {
  s = frames[0].parentStory;
  at = setParagraphs(s, [["Preface", h1]].concat(
    lorem(13, first, body, "preface"),
    [["The Tower", h1, "ch1"]],
    lorem(3, first, body, "tower"),
    [["", figure, "fig1"], ["Figure 1. The sea at dusk.", caption]],
    lorem(4, body, body),
    [["The Lamp", h2]],
    lorem(2, first, body, "lamp"),
    [["A keeper trims the wick before dusk.", quote]],
    lorem(2, body, body, "wick"),
    [["Oil", bullets], ["Wick", bullets], ["Glass", bullets]],
    lorem(2, body, body),
    [["Climb the stairs", numbers], ["Trim the wick", numbers], ["Light the lamp", numbers]],
    lorem(6, body, body),
    [["The Storm", h1, "ch2"]],
    lorem(7, first, body, "storm"),
    [["The Night", h2]],
    lorem(4, first, body),
    [["The watches of the night are kept as follows.", body], ["", cell, "table"]],
    lorem(9, body, body),
    [["The Morning", h1, "ch3"]],
    lorem(3, first, body, "morning"),
    [["", figure, "fig2"], ["Figure 2. The lamp at rest.", caption]],
    lorem(13, body, body)
  ));
});
var P;
step("character", function () { P = s.paragraphs; P[at.tower].words[4].appliedCharacterStyle = em; P[at.tower].words[9].appliedCharacterStyle = strong; });
step("footnotes", function () {
  doc.footnoteOptions.footnoteTextStyle = note; doc.footnoteOptions.spacer = 6; doc.footnoteOptions.spaceBetween = 2;
  var a = P[at.tower].insertionPoints[122].footnotes.add(); a.insertionPoints[-1].contents = "The tower was built in 1861.";
  var b = P[at.storm].insertionPoints[26].footnotes.add(); b.insertionPoints[-1].contents = "A storm of [^1] brackets and *stars*.";
  var c = P[at.morning].insertionPoints[55].footnotes.add(); c.insertionPoints[-1].contents = "The lamp is put out at sunrise.";
});
// Each picture is anchored in a paragraph of its own; its caption is the
// paragraph after it.
step("pictures", function () {
  var a = P[at.fig1].insertionPoints[0].rectangles.add({ geometricBounds: [0, 0, 110, 180], strokeWeight: 0 });
  a.place(File(OUT + "/pictures/sea.png")); a.fit(FitOptions.FILL_PROPORTIONALLY); a.fit(FitOptions.CENTER_CONTENT);
  var b = P[at.fig2].insertionPoints[0].rectangles.add({ geometricBounds: [0, 0, 120, 100], strokeWeight: 0 });
  b.anchoredObjectSettings.anchoredPosition = AnchorPosition.ABOVE_LINE; b.anchoredObjectSettings.horizontalAlignment = HorizontalAlignment.CENTER_ALIGN; b.anchoredObjectSettings.anchorSpaceAbove = 4;
  b.place(File(OUT + "/pictures/lamp.png")); b.fit(FitOptions.FILL_PROPORTIONALLY); b.fit(FitOptions.CENTER_CONTENT);
  P[at.fig2].leading = 4; P[at.fig2].pointSize = 4;
});
step("table", function () {
  var t = P[at.table].insertionPoints[0].tables.add({ bodyRowCount: 3, columnCount: 3, headerRowCount: 1 });
  fillRow(t.rows[0], ["Watch", "From", "To"]);
  fillRow(t.rows[1], ["First", "18:00", "22:00"]);
  fillRow(t.rows[2], ["Middle", "22:00", "02:00"]);
  fillRow(t.rows[3], ["Morning", "02:00", "06:00"]);
  t.cells.everyItem().paragraphs.everyItem().appliedParagraphStyle = cell;
  t.rows[0].cells.everyItem().paragraphs.everyItem().fontStyle = "Bold";
  t.width = 240;
  P[at.table].spaceBefore = 7; P[at.table].spaceAfter = 10;
});
// Page-reference marks in the text; the index itself is generated once
// the page count is known.
var idx;
step("marks", function () {
  idx = doc.indexes.length ? doc.indexes[0] : doc.indexes.add();
  var lamp = idx.topics.add("Lamp"); lamp.pageReferences.add(P[at.lamp].insertionPoints[10], PageReferenceType.CURRENT_PAGE);
  lamp.pageReferences.add(P[at.morning].insertionPoints[30], PageReferenceType.CURRENT_PAGE);
  var wick = lamp.topics.add("wick"); wick.pageReferences.add(P[at.wick].insertionPoints[10], PageReferenceType.CURRENT_PAGE);
  var storm = idx.topics.add("Storm"); storm.pageReferences.add(P[at.storm].insertionPoints[5], PageReferenceType.CURRENT_PAGE);
  var tower = idx.topics.add("Tower"); tower.pageReferences.add(P[at.tower].insertionPoints[40], PageReferenceType.CURRENT_PAGE);
  var gale = idx.topics.add("Gale"); gale.crossReferences.add(storm, CrossReferenceType.CUSTOM_CROSS_REFERENCE, "See");
});
// As many pages as the story needs: more while it is overset, fewer while
// its last frame is empty. The index then takes one page more.
step("fit", function () {
  var guard = 0;
  s.recompose();
  while (s.overflows && guard++ < 12) { addFrame(doc.pages.add(LocationOptions.AT_END)); s.recompose(); }
  while (frames.length > 1 && frames[frames.length - 1].characters.length === 0) { frames.pop().parentPage.remove(); s.recompose(); }
});
// The front matter (title, dedication, preface) is numbered in roman; the
// first chapter opens a section that starts again at 1.
step("sections", function () {
  doc.sections[0].pageNumberStyle = PageNumberStyle.LOWER_ROMAN;
  var sec = doc.sections.add(P[at.ch1].parentTextFrames[0].parentPage); sec.continueNumbering = false; sec.pageNumberStart = 1; sec.pageNumberStyle = PageNumberStyle.ARABIC;
});
step("index", function () {
  var last = doc.pages.add(LocationOptions.AT_END), a = typeArea(last);
  doc.indexGenerationOptions.title = "Index";
  var made = idx.generate(last, [a[1], a[0]]);
  var f = made[0].textContainers[0]; f.geometricBounds = a;
  made[0].paragraphs.everyItem().appliedFont = app.fonts.itemByName("Georgia\tRegular");
  made[0].paragraphs[0].appliedFont = app.fonts.itemByName("Georgia\tBold");
});
step("meta", function () { doc.metadataPreferences.documentTitle = "The Lighthouse Keeper"; doc.metadataPreferences.author = "Corpus"; });
finish(doc, "book-flow");
