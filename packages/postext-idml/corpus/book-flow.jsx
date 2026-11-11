// book-flow: a 14-page facing-pages book in one threaded story.
#include "lib.jsxinc"
var doc = newDoc("148mm", "210mm", 14, true);
var W = doc.documentPreferences.pageWidth, H = doc.documentPreferences.pageHeight;
margins(doc, 54, 60, 54, 42, 1, 12);
var body, h1, h2, quote, bullets, numbers, caption, runhead, em;
step("styles", function () {
  body = doc.paragraphStyles.add({ name: "Body", appliedFont: "EB Garamond", fontStyle: "Regular", pointSize: 10.5, leading: 14, justification: Justification.LEFT_JUSTIFIED, firstLineIndent: 12, hyphenation: true });
  h1 = doc.paragraphStyles.add({ name: "Chapter title", basedOn: body, pointSize: 22, leading: 26, fontStyle: "Bold", firstLineIndent: 0, spaceAfter: 28, justification: Justification.LEFT_ALIGN, startParagraph: StartParagraph.NEXT_PAGE, hyphenation: false });
  h2 = doc.paragraphStyles.add({ name: "H2", basedOn: body, pointSize: 13, leading: 14, fontStyle: "Bold", firstLineIndent: 0, spaceBefore: 14, spaceAfter: 14, justification: Justification.LEFT_ALIGN, keepWithNext: 2 });
  quote = doc.paragraphStyles.add({ name: "Quote", basedOn: body, fontStyle: "Italic", leftIndent: 18, rightIndent: 18, firstLineIndent: 0, spaceBefore: 7, spaceAfter: 7 });
  bullets = doc.paragraphStyles.add({ name: "Bullets", basedOn: body, bulletsAndNumberingListType: ListType.BULLET_LIST, leftIndent: 14, firstLineIndent: -14 });
  numbers = doc.paragraphStyles.add({ name: "Numbers", basedOn: body, bulletsAndNumberingListType: ListType.NUMBERED_LIST, leftIndent: 14, firstLineIndent: -14, numberingExpression: "^#.^t" });
  caption = doc.paragraphStyles.add({ name: "Caption", basedOn: body, pointSize: 8.5, leading: 11, fontStyle: "Italic", firstLineIndent: 0, justification: Justification.LEFT_ALIGN });
  runhead = doc.paragraphStyles.add({ name: "Running head", basedOn: body, pointSize: 8.5, leading: 11, firstLineIndent: 0, justification: Justification.CENTER_ALIGN });
  em = doc.characterStyles.add({ name: "Emphasis", fontStyle: "Italic" });
});
step("master", function () {
  var m = doc.masterSpreads.item(0);
  for (var i = 0; i < m.pages.length; i++) {
    var p = m.pages[i]; var left = (i === 0);
    var x0 = left ? 42 : 54, x1 = left ? W - 54 : W - 42;
    var rh = p.textFrames.add({ geometricBounds: [28, x0, 42, x1] }); rh.contents = "The Lighthouse Keeper"; rh.paragraphs[0].appliedParagraphStyle = runhead;
    var fo = p.textFrames.add({ geometricBounds: [H - 44, x0, H - 30, x1] }); fo.contents = SpecialCharacters.AUTO_PAGE_NUMBER; fo.paragraphs[0].appliedParagraphStyle = runhead;
  }
});
var frames = [];
step("front", function () {
  var t = frame(doc.pages[0], [150, 54, 300, W - 42], "The Lighthouse Keeper\rA short book");
  t.paragraphs.everyItem().appliedParagraphStyle = body; t.paragraphs.everyItem().justification = Justification.CENTER_ALIGN; t.paragraphs.everyItem().firstLineIndent = 0;
  t.paragraphs[0].pointSize = 26; t.paragraphs[0].leading = 30;
  var d = frame(doc.pages[1], [400, 42, 460, W - 54], "For those who keep the light.");
  d.paragraphs[0].appliedParagraphStyle = quote;
});
step("thread", function () {
  for (var i = 2; i < 13; i++) {
    var p = doc.pages[i]; var left = p.side == PageSideOptions.LEFT_HAND;
    var f = p.textFrames.add({ geometricBounds: [54, left ? 42 : 54, H - 60, left ? W - 54 : W - 42] });
    if (frames.length) frames[frames.length - 1].nextTextFrame = f;
    frames.push(f);
  }
});
var s;
step("text", function () {
  s = frames[0].parentStory;
  var t = "The Tower\r" + LOREM + "\r" + LOREM + "\rThe Lamp\r" + LOREM + "\r" + "A keeper trims the wick before dusk.\r" + LOREM + "\rOil\rWick\rGlass\r" + LOREM + "\rClimb the stairs\rTrim the wick\rLight the lamp\r" + LOREM + "\r" + LOREM + "\r";
  t += "The Storm\r" + LOREM + "\r" + LOREM + "\rThe Night\r" + LOREM + "\r" + LOREM + "\r" + LOREM + "\r" + LOREM + "\r";
  t += "The Morning\r" + LOREM + "\r" + LOREM + "\r" + LOREM;
  s.contents = t;
  s.paragraphs.everyItem().appliedParagraphStyle = body;
  var P = s.paragraphs;
  P[0].appliedParagraphStyle = h1; P[3].appliedParagraphStyle = h2; P[5].appliedParagraphStyle = quote;
  P[7].appliedParagraphStyle = bullets; P[8].appliedParagraphStyle = bullets; P[9].appliedParagraphStyle = bullets;
  P[11].appliedParagraphStyle = numbers; P[12].appliedParagraphStyle = numbers; P[13].appliedParagraphStyle = numbers;
  P[16].appliedParagraphStyle = h1; P[19].appliedParagraphStyle = h2; P[24].appliedParagraphStyle = h1;
  P[1].words[4].appliedCharacterStyle = em; P[1].words[9].fontStyle = "Bold";
});
step("footnotes", function () {
  var a = s.paragraphs[1].insertionPoints[60].footnotes.add(); a.insertionPoints[-1].contents = "The tower was built in 1861.";
  var b = s.paragraphs[17].insertionPoints[40].footnotes.add(); b.insertionPoints[-1].contents = "A storm of [^1] brackets and *stars*.";
});
step("pictures", function () {
  var a = s.paragraphs[2].insertionPoints[-2].rectangles.add({ geometricBounds: [0, 0, 110, 180] });
  a.anchoredObjectSettings.anchoredPosition = AnchorPosition.ABOVE_LINE; a.place(File(OUT + "/pictures/sea.png")); a.fit(FitOptions.FILL_PROPORTIONALLY);
  s.paragraphs[2].insertionPoints[-1].contents = "\rFigure 1. The sea at dusk."; s.paragraphs[3].appliedParagraphStyle = caption;
  var n = s.paragraphs.length;
  var b = s.paragraphs[n - 2].insertionPoints[-2].rectangles.add({ geometricBounds: [0, 0, 90, 150] });
  b.anchoredObjectSettings.anchoredPosition = AnchorPosition.ABOVE_LINE; b.place(File(OUT + "/pictures/lamp.png")); b.fit(FitOptions.FILL_PROPORTIONALLY);
  s.paragraphs[n - 2].insertionPoints[-1].contents = "\rFigures of speech are no label."; s.paragraphs[n - 1].appliedParagraphStyle = caption;
});
step("table", function () {
  var p = s.paragraphs[22]; p.insertionPoints[-1].contents = "\r";
  var t = s.paragraphs[23].insertionPoints[0].tables.add({ bodyRowCount: 3, columnCount: 3, headerRowCount: 1 });
  t.rows[0].cells.everyItem().contents = ["Watch", "From", "To"];
  t.rows[1].cells.everyItem().contents = ["First", "18:00", "22:00"];
  t.rows[2].cells.everyItem().contents = ["Middle", "22:00", "02:00"];
  t.rows[3].cells.everyItem().contents = ["Morning", "02:00", "06:00"];
  t.width = 240;
});
step("index", function () {
  var idx = doc.indexes.length ? doc.indexes[0] : doc.indexes.add();
  var lamp = idx.topics.add("Lamp"); lamp.pageReferences.add(s.paragraphs[4].insertionPoints[10], PageReferenceType.CURRENT_PAGE);
  var wick = lamp.topics.add("wick"); wick.pageReferences.add(s.paragraphs[6].insertionPoints[10], PageReferenceType.CURRENT_PAGE);
  var storm = idx.topics.add("Storm"); storm.pageReferences.add(s.paragraphs[17].insertionPoints[5], PageReferenceType.CURRENT_PAGE);
  var gale = idx.topics.add("Gale"); gale.crossReferences.add(storm, CrossReferenceType.SEE);
  var f = frame(doc.pages[13], [54, 42, H - 60, W - 54]);
  step("generate", function () { idx.generate(doc.pages[13], [54, 42]); });
});
step("sections", function () {
  doc.sections[0].pageNumberStyle = PageNumberStyle.LOWER_ROMAN;
  var sec = doc.sections.add(doc.pages[2]); sec.continueNumbering = false; sec.pageNumberStart = 1; sec.pageNumberStyle = PageNumberStyle.ARABIC;
});
step("meta", function () { doc.metadataPreferences.documentTitle = "The Lighthouse Keeper"; doc.metadataPreferences.author = "Corpus"; });
finish(doc, "book-flow");
