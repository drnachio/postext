// links-notes: hyperlinks of every kind, a cross-reference, notes,
// bookmarks, text variables, conditions, tracked changes. Page 1 holds
// the story, page 2 is the page a link points at; InDesign adds the page
// of endnotes itself.
#include "lib.jsxinc"
var doc = newDoc("170mm", "240mm", 2, false);
var W = doc.documentPreferences.pageWidth, H = doc.documentPreferences.pageHeight;
margins(doc, 54, 54, 48, 48, 1, 12);
function face(text) { with (text.paragraphs.everyItem()) { appliedFont = "Georgia"; fontStyle = "Regular"; pointSize = 10; leading = 14; spaceAfter = 7; } with (text.paragraphs[0]) { pointSize = 20; fontStyle = "Bold"; leading = 24; } }
var f1 = frame(doc.pages[0], [54, 48, H - 54, W - 48]);
var s = f1.parentStory, at;
step("text", function () {
  at = setParagraphs(s, [
    ["Links and notes"],
    ["Visit the site, write to us, jump to the target, go to page two or open the other file.", null, "links"],
    ["The target paragraph stands here with an anchor.", null, "target"],
    ["See the cross-reference: .", null, "xref"],
    ["A footnote here and an endnote there.", null, "notes"],
    ["Shown text, hidden conditional text, teacher text.", null, "conditions"],
    ["Modified on , edition , in  pages.", null, "variables"],
    ["Text typed with [^1] brackets, [a link](https://example.org), :chip[x]{y}, *stars*, _under_, $math$, `code`, \\ backslash and @key."],
    ["Inserted words and deleted words are tracked.", null, "changes"],
    [LOREM]
  ]);
  face(s);
});
var P = s.paragraphs;
// Tracked changes come first: the later steps then find their words in
// paragraphs no edit has moved.
step("changes", function () {
  s.trackChanges = true;
  P[at.changes].insertionPoints[0].contents = "New ";
  find(P[at.changes], "deleted ").remove();
  s.trackChanges = false;
});
step("links", function () {
  var p = P[at.links];
  function link(words, dest, name) { doc.hyperlinks.add(doc.hyperlinkTextSources.add(find(p, words)), dest, { name: name }); }
  link("Visit the site", doc.hyperlinkURLDestinations.add("https://postext.dev/docs?a=1&b=(2)"), "site");
  link("write to us", doc.hyperlinkURLDestinations.add("mailto:hello@example.org"), "mail");
  link("jump to the target", doc.hyperlinkTextDestinations.add(P[at.target].insertionPoints[0], { name: "target" }), "to target");
  link("go to page two", doc.hyperlinkPageDestinations.add(doc.pages[1]), "to page");
  step("external", function () { link("open the other file", doc.hyperlinkURLDestinations.add("file:///Volumes/Work/corpus/other.indd"), "file"); });
});
// The built-in cross-reference formats are named and worded in the
// application's language: the document gets its own.
step("xref", function () {
  var fmt = doc.crossReferenceFormats.add({ name: "Quoted paragraph and page" });
  fmt.buildingBlocks.add(BuildingBlockTypes.CUSTOM_STRING_BUILDING_BLOCK, undefined, "\u201c");
  fmt.buildingBlocks.add(BuildingBlockTypes.FULL_PARAGRAPH_BUILDING_BLOCK);
  fmt.buildingBlocks.add(BuildingBlockTypes.CUSTOM_STRING_BUILDING_BLOCK, undefined, "\u201d on page ");
  fmt.buildingBlocks.add(BuildingBlockTypes.PAGE_NUMBER_BUILDING_BLOCK);
  var d = doc.paragraphDestinations.add(P[at.target].insertionPoints[0]);
  var x = doc.crossReferenceSources.add(P[at.xref].insertionPoints[-3], fmt);
  doc.hyperlinks.add(x, d, { name: "xref" });
});
step("notes", function () {
  var ns = doc.paragraphStyles.add({ name: "Note text", appliedFont: "Georgia", fontStyle: "Regular", pointSize: 8.5, leading: 11 });
  var nt = doc.paragraphStyles.add({ name: "Notes title", appliedFont: "Georgia", fontStyle: "Bold", pointSize: 20, leading: 24, spaceAfter: 7 });
  doc.footnoteOptions.footnoteTextStyle = ns;
  doc.footnoteOptions.footnoteNumberingStyle = FootnoteNumberingStyle.LOWER_LETTERS;
  doc.footnoteOptions.restartNumbering = FootnoteRestarting.PAGE_RESTART;
  var p = P[at.notes];
  step("endnote", function () { doc.endnoteOptions.endnoteTitle = "Endnotes"; doc.endnoteOptions.endnoteTitleStyle = nt; doc.endnoteOptions.endnoteTextStyle = ns; var en = p.insertionPoints[-2].createEndnote(); en.insertionPoints[-1].contents = "The endnote's text."; });
  var fn = p.insertionPoints[15].footnotes.add(); fn.insertionPoints[-1].contents = "The footnote's text, with *stars*.";
  step("editorial", function () { var n = p.insertionPoints[2].notes.add(); n.texts[0].contents = "An editorial note."; });
});
step("conditions", function () {
  var hid = doc.conditions.add({ name: "Print only" }); var on = doc.conditions.add({ name: "Teacher" });
  find(P[at.conditions], "hidden conditional text, ").appliedConditions = [hid];
  find(P[at.conditions], "teacher text").appliedConditions = [on];
  on.indicatorMethod = ConditionIndicatorMethod.USE_UNDERLINE; on.underlineIndicatorAppearance = ConditionUnderlineIndicatorAppearance.WAVY;
  doc.conditionalTextPreferences.showConditionIndicators = ConditionIndicatorMode.HIDE_INDICATORS;
  hid.visible = false;
});
// The built-in variables are named in the application's language, and a
// file name would be that of an unsaved document: the document gets its
// own date, custom text and page count.
step("variables", function () {
  var date = doc.textVariables.add({ name: "Corpus date", variableType: VariableTypes.MODIFICATION_DATE_TYPE }); date.variableOptions.format = "yyyy-MM-dd";
  var ed = doc.textVariables.add({ name: "Corpus edition", variableType: VariableTypes.CUSTOM_TEXT_TYPE }); ed.variableOptions.contents = "first";
  var last = doc.textVariables.add({ name: "Corpus pages", variableType: VariableTypes.LAST_PAGE_NUMBER_TYPE });
  var p = P[at.variables], t = String(p.contents);
  p.insertionPoints[t.indexOf(" pages.")].textVariableInstances.add({ associatedTextVariable: last });
  p.insertionPoints[t.indexOf(", in ")].textVariableInstances.add({ associatedTextVariable: ed });
  p.insertionPoints[t.indexOf(", edition")].textVariableInstances.add({ associatedTextVariable: date });
});
step("p2", function () { var t = frame(doc.pages[1], [54, 48, 200, W - 48], "Page two\rThe page a link and a bookmark point at."); face(t); });
step("bookmarks", function () {
  doc.bookmarks.add(doc.hyperlinkPageDestinations.add(doc.pages[0]), { name: "Start" });
  doc.bookmarks.add(doc.hyperlinkPageDestinations.add(doc.pages[1]), { name: "Page two" });
});
finish(doc, "links-notes");
