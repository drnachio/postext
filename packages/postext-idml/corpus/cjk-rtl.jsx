// cjk-rtl: a vertical Japanese story with ruby, tate-chu-yoko and
// kenten; an Arabic right-to-left story; mixed direction. Text of other
// scripts is written as \uXXXX escapes so the file stays ASCII.
#include "lib.jsxinc"
var doc = newDoc("148mm", "210mm", 2, false);
var W = doc.documentPreferences.pageWidth, H = doc.documentPreferences.pageHeight;
margins(doc, 48, 48, 42, 42, 1, 12);
var JA = "\u7e26\u66f8\u304d\u306e\u7269\u8a9e\u3067\u3059\u300212\u6708\u306e\u671d\u3001\u706f\u53f0\u5b88\u306f\u6d77\u3092\u898b\u305f\u3002\u5927\u5207\u306a\u3053\u3068\u306f\u5149\u3092\u5b88\u308b\u3053\u3068\u3060\u3002";
var AR = "\u0645\u0631\u062d\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645. \u0647\u0630\u0627 \u0646\u0635 \u0639\u0631\u0628\u064a \u064a\u062c\u0631\u064a \u0645\u0646 \u0627\u0644\u064a\u0645\u064a\u0646 \u0625\u0644\u0649 \u0627\u0644\u064a\u0633\u0627\u0631 \u0648\u0641\u064a\u0647 \u0631\u0642\u0645 123 \u0648\u0643\u0644\u0645\u0629 Postext \u0628\u0627\u0644\u0644\u0627\u062a\u064a\u0646\u064a\u0629.";
var v, r, m;
step("vertical", function () {
  v = frame(doc.pages[0], [48, 42, H - 48, W - 42], JA + "\r" + JA);
  with (v.paragraphs.everyItem()) { appliedFont = "Hiragino Mincho ProN"; pointSize = 12; leading = 20; }
  v.parentStory.storyPreferences.storyOrientation = HorizontalOrVertical.VERTICAL;
});
step("ruby", function () { var st = v.parentStory; st.characters[0].rubyFlag = true; st.characters[0].rubyString = "\u305f\u3066"; st.characters.itemByRange(1, 2).rubyFlag = true; st.characters.itemByRange(1, 2).rubyString = "\u304c"; st.characters.itemByRange(1, 2).rubyType = RubyTypes.GROUP_RUBY; });
step("tcy", function () { v.parentStory.characters.itemByRange(9, 10).tatechuyoko = true; });
step("kenten", function () { v.parentStory.characters.itemByRange(24, 26).kentenKind = KentenCharacter.KENTEN_SESAME_DOT; });
step("arabic", function () {
  r = frame(doc.pages[1], [48, 42, 260, W - 42], AR + "\r" + AR);
  with (r.paragraphs.everyItem()) { appliedFont = "Geeza Pro"; pointSize = 13; leading = 22; }
  r.parentStory.storyPreferences.storyDirection = StoryDirectionOptions.RIGHT_TO_LEFT_DIRECTION;
  with (r.paragraphs.everyItem()) { paragraphDirection = ParagraphDirectionOptions.RIGHT_TO_LEFT_DIRECTION; justification = Justification.RIGHT_ALIGN; composer = "$ID/HL Composer"; }
});
step("mixed", function () {
  m = frame(doc.pages[1], [290, 42, 420, W - 42], "An English paragraph that quotes \u0645\u0631\u062d\u0628\u0627 and \u7e26\u66f8\u304d in its line.");
  with (m.paragraphs.everyItem()) { appliedFont = "Arial"; pointSize = 10; leading = 14; }
});
finish(doc, "cjk-rtl");
