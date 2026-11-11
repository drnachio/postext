// styles: deep based-on chains, style groups, nested, GREP and line
// styles, local overrides on top.
#include "lib.jsxinc"
var doc = newDoc("170mm", "240mm", 2, false);
var W = doc.documentPreferences.pageWidth, H = doc.documentPreferences.pageHeight;
margins(doc, 54, 54, 48, 48, 1, 12);
var accent;
step("swatch", function () { accent = doc.colors.add({ name: "Accent", model: ColorModel.PROCESS, space: ColorSpace.CMYK, colorValue: [0, 80, 90, 0] }); });
var base, text, body, lead, note, heads, h1, h2, h3, strong, em, caps;
step("styles", function () {
  base = doc.paragraphStyles.add({ name: "Base", appliedFont: "EB Garamond", fontStyle: "Regular", pointSize: 10, leading: 13, hyphenation: true });
  text = doc.paragraphStyles.add({ name: "Text", basedOn: base, justification: Justification.LEFT_JUSTIFIED });
  body = doc.paragraphStyles.add({ name: "Body", basedOn: text, firstLineIndent: 12 });
  lead = doc.paragraphStyles.add({ name: "Lead-in", basedOn: body, firstLineIndent: 0, spaceBefore: 6 });
  note = doc.paragraphStyles.add({ name: "Note", basedOn: lead, pointSize: 8.5, leading: 11, leftIndent: 18, fillColor: accent });
  heads = doc.paragraphStyleGroups.add({ name: "Heads" });
  h1 = heads.paragraphStyles.add({ name: "H1", basedOn: base, pointSize: 22, leading: 26, fontStyle: "Bold", spaceAfter: 13, hyphenation: false });
  h2 = heads.paragraphStyles.add({ name: "H2", basedOn: h1, pointSize: 14, leading: 13, spaceBefore: 13, spaceAfter: 13 });
  h3 = heads.paragraphStyles.add({ name: "H3", basedOn: h2, pointSize: 10, fontStyle: "Bold Italic", spaceAfter: 0 });
  strong = doc.characterStyles.add({ name: "Strong", fontStyle: "Bold" });
  em = doc.characterStyles.add({ name: "Emphasis", fontStyle: "Italic" });
  caps = doc.characterStyles.add({ name: "Small caps", capitalization: Capitalization.SMALL_CAPS });
  doc.characterStyles.add({ name: "Accent", basedOn: strong, fillColor: accent });
});
step("nested", function () { var ns = lead.nestedStyles.add(); ns.appliedCharacterStyle = strong; ns.delimiter = ":"; ns.inclusive = true; ns.repetition = 1; });
step("grep", function () { var gs = body.nestedGrepStyles.add(); gs.appliedCharacterStyle = doc.characterStyles.item("Accent"); gs.grepExpression = "\\d+"; });
step("line", function () { var ls = note.nestedLineStyles.add(); ls.appliedCharacterStyle = caps; ls.lineCount = 1; });
var f = frame(doc.pages[0], [54, 48, H - 54, W - 48]);
var s = f.parentStory;
s.contents = "Styles\rA section\rA subsection\rWarning: a lead-in up to the colon is bold by a nested style. " + LOREM + "\rThe body has 123 numbers a GREP style colours. " + LOREM + "\rA note whose first line a line style sets in small capitals. " + LOREM + "\rA body paragraph overridden by hand: centred, larger, tracked.\r" + LOREM;
var P = s.paragraphs;
step("apply", function () { P.everyItem().appliedParagraphStyle = body; P[0].appliedParagraphStyle = h1; P[1].appliedParagraphStyle = h2; P[2].appliedParagraphStyle = h3; P[3].appliedParagraphStyle = lead; P[5].appliedParagraphStyle = note; });
step("overrides", function () { P[6].justification = Justification.CENTER_ALIGN; P[6].pointSize = 12; P[6].tracking = 40; P[6].firstLineIndent = 0; });
step("character", function () { P[7].words[2].appliedCharacterStyle = em; P[7].words[4].appliedCharacterStyle = strong; P[7].words[6].appliedCharacterStyle = caps; P[7].words[8].appliedCharacterStyle = doc.characterStyles.item("Accent"); P[7].words[10].underline = true; P[7].words[12].strikeThru = true; P[7].words[14].position = Position.SUPERSCRIPT; P[7].words[16].capitalization = Capitalization.ALL_CAPS; });
finish(doc, "styles");
