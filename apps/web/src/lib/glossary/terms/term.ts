// The helper every term list is written with, and the language a category's
// native names are written in.
import type { GlossaryCategory, GlossaryTerm } from "../terms";

/** The language a category's native names are written in. */
const NATIVE_LANG: Record<GlossaryCategory, string> = {
  type: "en",
  cjk: "zh-Hans",
  japanese: "ja",
  arabic: "ar",
  web: "en",
};

type Text = GlossaryTerm["text"];
export const term = (id: string, category: GlossaryCategory, text: Text, native?: string, nativeLang = NATIVE_LANG[category]): GlossaryTerm => ({
  id,
  category,
  text,
  ...(native ? { native, nativeLang } : {}),
});
