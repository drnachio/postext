// links-notes: hyperlinks of every kind, cross-references, notes,
// bookmarks, text variables, conditions, tracked changes.
#include "lib.jsxinc"
var doc = newDoc("170mm", "240mm", 3, false);
var W = doc.documentPreferences.pageWidth, H = doc.documentPreferences.pageHeight;
margins(doc, 54, 54, 48, 48, 1, 12);
var f1 = frame(doc.pages[0], [54, 48, H - 54, W - 48]);
var f2 = doc.pages[1].textFrames.add({ geometricBounds: [54, 48, H - 54, W - 48] }); f1.nextTextFrame = f2;
var s = f1.parentStory;
s.contents = "Links and notes\rVisit the site, write to us, jump to the target, go to page three or open the other file.\rThe target paragraph stands here with an anchor.\rSee the cross-reference: .\rA footnote here and an endnote there.\rShown text, hidden conditional text, teacher text.\rModified on  by file .\rText typed with [^1] brackets, [a link](https://example.org), :chip[x]{y}, *stars*, _under_, $math$, `code`, \\ backslash and @key.\rInserted words and deleted words are tracked.\r" + LOREM;
step("type", function () { with (s.paragraphs.everyItem()) { appliedFont = "Georgia"; pointSize = 10; leading = 14; spaceAfter = 7; } s.paragraphs[0].pointSize = 20; s.paragraphs[0].fontStyle = "Bold"; s.paragraphs[0].leading = 24; });
var P = s.paragraphs;
step("links", function () {
  doc.hyperlinks.add(doc.hyperlinkTextSources.add(P[1].words.itemByRange(0, 2)), doc.hyperlinkURLDestinations.add("https://postext.dev/docs?a=1&b=(2)"), { name: "site" });
  doc.hyperlinks.add(doc.hyperlinkTextSources.add(P[1].words.itemByRange(3, 5)), doc.hyperlinkURLDestinations.add("mailto:hello@example.org"), { name: "mail" });
  var dest = doc.hyperlinkTextDestinations.add(P[2].insertionPoints[0], { name: "target" });
  doc.hyperlinks.add(doc.hyperlinkTextSources.add(P[1].words.itemByRange(6, 9)), dest, { name: "to target" });
  doc.hyperlinks.add(doc.hyperlinkTextSources.add(P[1].words.itemByRange(10, 13)), doc.hyperlinkPageDestinations.add(doc.pages[2]), { name: "to page" });
  step("external", function () { doc.hyperlinks.add(doc.hyperlinkTextSources.add(P[1].words.itemByRange(15, 18)), doc.hyperlinkURLDestinations.add("file:///Volumes/Work/corpus/other.indd"), { name: "file" }); });
});
step("xref", function () {
  var d = doc.paragraphDestinations.add(P[2].insertionPoints[0]);
  var x = doc.crossReferenceSources.add(P[3].insertionPoints[-3], doc.crossReferenceFormats.item(0));
  doc.hyperlinks.add(x, d);
});
step("notes", function () {
  var fn = P[4].insertionPoints[15].footnotes.add(); fn.insertionPoints[-1].contents = "The footnote's text, with *stars*.";
  step("endnote", function () { var en = P[4].insertionPoints[-2].createEndnote(); en.insertionPoints[-1].contents = "The endnote's text."; });
  step("editorial", function () { var n = P[4].insertionPoints[2].notes.add(); n.texts[0].contents = "An editorial note."; });
  doc.footnoteOptions.footnoteNumberingStyle = FootnoteNumberingStyle.LOWER_LETTERS;
  doc.footnoteOptions.restartNumbering = FootnoteRestarting.PAGE_RESTART;
});
step("conditions", function () {
  var hid = doc.conditions.add({ name: "Print only", visible: false }); var on = doc.conditions.add({ name: "Teacher", visible: true });
  P[5].words.itemByRange(2, 5).applyConditions(hid); P[5].words.itemByRange(6, 7).applyConditions(on);
});
step("variables", function () {
  P[6].insertionPoints[12].textVariableInstances.add({ associatedTextVariable: doc.textVariables.item("Modification Date") });
  P[6].insertionPoints[-2].textVariableInstances.add({ associatedTextVariable: doc.textVariables.item("File Name") });
});
step("changes", function () {
  s.trackChanges = true;
  P[8].insertionPoints[0].contents = "New ";
  P[8].words[4].remove();
});
step("bookmarks", function () {
  doc.bookmarks.add(doc.hyperlinkPageDestinations.add(doc.pages[0]), { name: "Start" });
  doc.bookmarks.add(doc.hyperlinkPageDestinations.add(doc.pages[2]), { name: "Page three" });
});
step("p3", function () { var t = frame(doc.pages[2], [54, 48, 200, W - 48], "Page three\rThe page a link points at."); with (t.paragraphs.everyItem()) { appliedFont = "Georgia"; pointSize = 10; leading = 14; } t.paragraphs[0].pointSize = 20; t.paragraphs[0].fontStyle = "Bold"; t.paragraphs[0].leading = 24; });
finish(doc, "links-notes");
