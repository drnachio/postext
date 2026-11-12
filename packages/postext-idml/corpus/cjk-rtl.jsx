// cjk-rtl: a Japanese story with ruby, tate-chu-yoko and kenten; an
// Arabic right-to-left story; a line of mixed direction. Text of other
// scripts is written as \uXXXX escapes so the file stays ASCII.
//@include "lib.jsxinc"
var doc = newDoc("148mm", "210mm", 2, false);
var W = doc.documentPreferences.pageWidth, H = doc.documentPreferences.pageHeight;
margins(doc, 48, 48, 42, 42, 1, 12);
var JT = "\u706f\u53f0\u5b88\u306e\u7269\u8a9e";
var JA = "\u7e26\u66f8\u304d\u306e\u7269\u8a9e\u3067\u3059\u300212\u6708\u306e\u671d\u3001\u706f\u53f0\u5b88\u306f\u6d77\u3092\u898b\u305f\u3002\u5927\u5207\u306a\u3053\u3068\u306f\u5149\u3092\u5b88\u308b\u3053\u3068\u3060\u3002";
var JB = "\u590f\u306e\u5915\u65b9\u3001\u6d77\u306f\u9759\u304b\u3060\u3063\u305f\u3002\u706f\u53f0\u5b88\u306f\u968e\u6bb5\u3092\u4e0a\u308a\u3001\u706f\u3092\u3068\u3082\u3057\u305f\u3002\u8239\u306f\u305d\u306e\u5149\u3092\u898b\u3066\u3001\u6e2f\u3078\u5e30\u3063\u305f\u3002";
var AT = "\u062d\u0627\u0631\u0633 \u0627\u0644\u0645\u0646\u0627\u0631\u0629";
var AR = "\u0645\u0631\u062d\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645. \u0647\u0630\u0627 \u0646\u0635 \u0639\u0631\u0628\u064a \u064a\u062c\u0631\u064a \u0645\u0646 \u0627\u0644\u064a\u0645\u064a\u0646 \u0625\u0644\u0649 \u0627\u0644\u064a\u0633\u0627\u0631 \u0648\u0641\u064a\u0647 \u0631\u0642\u0645 123 \u0648\u0643\u0644\u0645\u0629 Postext \u0628\u0627\u0644\u0644\u0627\u062a\u064a\u0646\u064a\u0629.";
var AB = "\u0641\u064a \u0627\u0644\u0645\u0633\u0627\u0621 \u064a\u0635\u0639\u062f \u0627\u0644\u062d\u0627\u0631\u0633 \u0625\u0644\u0649 \u0627\u0644\u0645\u0646\u0627\u0631\u0629 \u0648\u064a\u0634\u0639\u0644 \u0627\u0644\u0645\u0635\u0628\u0627\u062d\u060c \u0641\u062a\u0631\u0649 \u0627\u0644\u0633\u0641\u0646 \u0627\u0644\u0636\u0648\u0621 \u0648\u062a\u0639\u0648\u062f \u0625\u0644\u0649 \u0627\u0644\u0645\u064a\u0646\u0627\u0621.";
var MINCHO = "Hiragino Mincho ProN\tW3", MINCHO_BOLD = "Hiragino Mincho ProN\tW6", GEEZA = "Geeza Pro\tRegular", GEEZA_BOLD = "Geeza Pro\tBold";
// The composer that shapes Arabic and orders mixed directions.
var WORLD = "$ID/HL Composer Optyca";
function font(name) { return app.fonts.itemByName(name); }
// Every run of `text` that matches the GREP gets the face.
function faceRuns(text, grep, name) {
  app.findGrepPreferences = NothingEnum.NOTHING; app.changeGrepPreferences = NothingEnum.NOTHING;
  app.findGrepPreferences.findWhat = grep;
  var hits = text.findGrep(); for (var i = 0; i < hits.length; i++) hits[i].appliedFont = font(name);
  app.findGrepPreferences = NothingEnum.NOTHING;
}
var v, r, m;
// A face is named with its style: the family alone is not found.
step("japanese", function () {
  v = frame(doc.pages[0], [48, 42, 330, W - 42], JT + "\r" + JA + "\r" + JB + "\r" + JA + JB);
  with (v.paragraphs.everyItem()) { appliedFont = font(MINCHO); pointSize = 12; leading = 24; justification = Justification.LEFT_JUSTIFIED; }
  with (v.paragraphs[0]) { appliedFont = font(MINCHO_BOLD); pointSize = 20; leading = 30; spaceAfter = 12; }
});
// The Japanese composer draws ruby and kenten.
step("composer", function () { v.paragraphs.everyItem().composer = "$ID/HL Composer J"; });
// An InDesign without the Japanese feature set has no such property: the
// story then stays horizontal, with its ruby, tate-chu-yoko and kenten.
step("orientation", function () { v.parentStory.storyPreferences.storyOrientation = HorizontalOrVertical.VERTICAL; });
step("ruby", function () {
  var p = v.paragraphs[1];
  function ruby(base, reading, type) { var c = find(p, base); c.rubyFlag = true; c.rubyString = reading; c.rubyType = type; }
  ruby("\u7e26", "\u305f\u3066", RubyTypes.PER_CHARACTER_RUBY);
  ruby("\u66f8", "\u304c", RubyTypes.PER_CHARACTER_RUBY);
  ruby("\u7269\u8a9e", "\u3082\u306e\u304c\u305f\u308a", RubyTypes.GROUP_RUBY);
  ruby("\u706f\u53f0\u5b88", "\u3068\u3046\u3060\u3044\u3082\u308a", RubyTypes.GROUP_RUBY);
});
step("tcy", function () { find(v.paragraphs[1], "12").tatechuyoko = true; });
step("kenten", function () { find(v.paragraphs[1], "\u5927\u5207\u306a").kentenKind = KentenCharacter.KENTEN_SESAME_DOT; });
step("arabic", function () {
  r = frame(doc.pages[1], [48, 42, 300, W - 42], AT + "\r" + AR + "\r" + AB + "\r" + AR + " " + AB);
  r.parentStory.storyPreferences.storyDirection = StoryDirectionOptions.RIGHT_TO_LEFT_DIRECTION;
  with (r.paragraphs.everyItem()) { appliedFont = font(GEEZA); pointSize = 13; leading = 22; spaceAfter = 6; composer = WORLD; paragraphDirection = ParagraphDirectionOptions.RIGHT_TO_LEFT_DIRECTION; justification = Justification.RIGHT_ALIGN; }
  with (r.paragraphs[0]) { appliedFont = font(GEEZA_BOLD); pointSize = 20; leading = 30; spaceAfter = 12; }
  // The Arabic face has no Latin letters or European digits.
  faceRuns(r.parentStory, "[A-Za-z0-9]+", "Georgia\tRegular");
});
step("mixed", function () {
  m = frame(doc.pages[1], [330, 42, 400, W - 42], "An English paragraph that quotes \u0645\u0631\u062d\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645 and \u7e26\u66f8\u304d in its line.");
  with (m.paragraphs.everyItem()) { appliedFont = font("Georgia\tRegular"); pointSize = 10; leading = 16; composer = WORLD; }
  faceRuns(m.parentStory, "[\\x{0600}-\\x{06FF}]+", GEEZA);
  faceRuns(m.parentStory, "[\\x{3040}-\\x{30FF}\\x{4E00}-\\x{9FFF}]+", MINCHO);
});
finish(doc, "cjk-rtl");
