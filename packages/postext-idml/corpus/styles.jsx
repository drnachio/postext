// styles: deep based-on chains, style groups, nested, GREP and line
// styles, local overrides on top.
//@include "lib.jsxinc"
var doc = newDoc("170mm", "240mm", 1, false);
var W = doc.documentPreferences.pageWidth, H = doc.documentPreferences.pageHeight;
margins(doc, 54, 54, 48, 48, 1, 12);
var accent;
step("swatch", function () { accent = ink(doc, "Accent", [0, 80, 90, 0]); });
var base, text, body, lead, note, heads, h1, h2, h3, strong, em, caps, hot;
step("styles", function () {
  base = doc.paragraphStyles.add({ name: "Base", appliedFont: "Georgia", fontStyle: "Regular", pointSize: 10, leading: 13, hyphenation: true });
  text = doc.paragraphStyles.add({ name: "Text", basedOn: base, justification: Justification.LEFT_JUSTIFIED });
  body = doc.paragraphStyles.add({ name: "Body", basedOn: text, firstLineIndent: 12 });
  lead = doc.paragraphStyles.add({ name: "Lead-in", basedOn: body, firstLineIndent: 0, spaceBefore: 6 });
  note = doc.paragraphStyles.add({ name: "Note", basedOn: lead, pointSize: 8.5, leading: 11, leftIndent: 18, spaceAfter: 6, fillColor: accent });
  heads = doc.paragraphStyleGroups.add({ name: "Heads" });
  h1 = heads.paragraphStyles.add({ name: "H1", basedOn: base, pointSize: 22, leading: 26, fontStyle: "Bold", spaceAfter: 13, hyphenation: false });
  h2 = heads.paragraphStyles.add({ name: "H2", basedOn: h1, pointSize: 14, leading: 13, spaceBefore: 13, spaceAfter: 13 });
  h3 = heads.paragraphStyles.add({ name: "H3", basedOn: h2, pointSize: 10, fontStyle: "Bold Italic", spaceBefore: 0, spaceAfter: 0 });
  strong = doc.characterStyles.add({ name: "Strong", fontStyle: "Bold" });
  em = doc.characterStyles.add({ name: "Emphasis", fontStyle: "Italic" });
  caps = doc.characterStyles.add({ name: "Small caps", capitalization: Capitalization.SMALL_CAPS });
  hot = doc.characterStyleGroups.add({ name: "Colour" }).characterStyles.add({ name: "Accent", basedOn: strong, fillColor: accent });
});
step("nested", function () { var ns = lead.nestedStyles.add(); ns.appliedCharacterStyle = strong; ns.delimiter = ":"; ns.inclusive = true; ns.repetition = 1; });
step("grep", function () { var gs = body.nestedGrepStyles.add(); gs.appliedCharacterStyle = hot; gs.grepExpression = "\\d+"; });
step("line", function () { var ls = note.nestedLineStyles.add(); ls.appliedCharacterStyle = caps; ls.lineCount = 1; });
var f = frame(doc.pages[0], [54, 48, H - 54, W - 48]);
var s = f.parentStory, at, P = s.paragraphs;
step("text", function () {
  at = setParagraphs(s, [
    ["Styles", h1], ["A section", h2], ["A subsection", h3],
    ["Warning: a lead-in up to the colon is bold by a nested style. " + LOREM2, lead],
    ["The body has 123 numbers a GREP style colours, and 45 more. " + LOREM3, body],
    ["Note: the first line of a note is set in small capitals by a line style. " + LOREM, note],
    ["A body paragraph overridden by hand: centred, larger, tracked.", body, "over"],
    ["Words in italic, in bold, in small caps and in the accent colour; one underlined, one struck, one raised and one in capitals.", body, "chars"],
    ["Another section", h2],
    ["Summary: " + LOREM, lead], [LOREM2, body], [LOREM3, body]
  ]);
});
step("overrides", function () { var p = P[at.over]; p.justification = Justification.CENTER_ALIGN; p.pointSize = 12; p.leading = 16; p.tracking = 40; p.firstLineIndent = 0; p.spaceBefore = 6; p.spaceAfter = 6; });
step("character", function () {
  var p = P[at.chars];
  find(p, "italic").appliedCharacterStyle = em; find(p, "bold").appliedCharacterStyle = strong; find(p, "small caps").appliedCharacterStyle = caps; find(p, "accent colour").appliedCharacterStyle = hot;
  find(p, "underlined").underline = true; find(p, "struck").strikeThru = true; find(p, "raised").position = Position.SUPERSCRIPT; find(p, "capitals").capitalization = Capitalization.ALL_CAPS;
});
finish(doc, "styles");
