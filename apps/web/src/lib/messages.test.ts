import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import ca from "../../messages/ca.json";
import ar from "../../messages/ar.json";
import zh from "../../messages/zh.json";

/** Namespaces that must say the same things in both languages. Keys that
 *  start with "_" are notes for translators, not UI strings. */
const NAMESPACES = ["Cookbook", "CookbookRecipe", "Navbar", "Footer", "DocsSearch"] as const;

type Tree = { [key: string]: string | Tree };

/** Dotted paths of every leaf string, skipping "_" keys at any depth. */
function leafKeys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    if (key.startsWith("_")) return [];
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : leafKeys(value, path);
  });
}

const TRANSLATIONS = { es, ca, zh, ar } as const;

describe("messages", () => {
  for (const [locale, messages] of Object.entries(TRANSLATIONS)) {
    for (const ns of NAMESPACES) {
      it(`${ns} has the same keys in en and ${locale}`, () => {
        const a = (en as unknown as Record<string, Tree>)[ns];
        const b = (messages as unknown as Record<string, Tree>)[ns];
        expect(a, `en.${ns}`).toBeDefined();
        expect(b, `${locale}.${ns}`).toBeDefined();
        const enKeys = leafKeys(a!).sort();
        const otherKeys = leafKeys(b!).sort();
        expect(otherKeys.filter((k) => !enKeys.includes(k)), `only in ${locale}.${ns}`).toEqual([]);
        expect(enKeys.filter((k) => !otherKeys.includes(k)), `only in en.${ns}`).toEqual([]);
      });
    }
  }

  // ca.json, zh.json and ar.json are translated whole: every string has a
  // Catalan, a Chinese and an Arabic counterpart, so a missing key is a
  // translation that never landed.
  for (const [locale, messages] of Object.entries({ ca, zh, ar })) {
    it(`${locale} has every key of en`, () => {
      const enKeys = leafKeys(en as unknown as Tree);
      const keys = new Set(leafKeys(messages as unknown as Tree));
      expect(enKeys.filter((k) => !keys.has(k))).toEqual([]);
    });
  }
});

/** Keys whose messages next-intl cannot parse: a `{` or `}` that is not an
 *  ICU argument must be quoted as `'{'` / `'}'`, or the UI shows the key. */
function malformed(messages: Tree, locale: string): string[] {
  const bad: string[] = [];
  const t = createTranslator({
    locale,
    messages,
    onError: (error) => bad.push(error.message),
    getMessageFallback: ({ key }) => key,
  });
  // A message with arguments reports the missing values (FORMATTING_ERROR);
  // only a message that does not parse is INVALID_MESSAGE.
  for (const key of leafKeys(messages)) t(key as never);
  return bad.filter((m) => m.includes("INVALID_MESSAGE"));
}

describe("messages parse as ICU", () => {
  it("en", () => expect(malformed(en as unknown as Tree, "en")).toEqual([]));
  it("es", () => expect(malformed(es as unknown as Tree, "es")).toEqual([]));
  it("ca", () => expect(malformed(ca as unknown as Tree, "ca")).toEqual([]));
  it("zh", () => expect(malformed(zh as unknown as Tree, "zh")).toEqual([]));
  it("ar", () => expect(malformed(ar as unknown as Tree, "ar")).toEqual([]));
});
