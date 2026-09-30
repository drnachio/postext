import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
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

const TRANSLATIONS = { es, zh } as const;

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

  // zh.json is translated from en.json whole: every string has a Chinese
  // counterpart, so a key missing from zh is a translation that never landed.
  it("zh has every key of en", () => {
    const enKeys = leafKeys(en as unknown as Tree);
    const zhKeys = new Set(leafKeys(zh as unknown as Tree));
    expect(enKeys.filter((k) => !zhKeys.has(k))).toEqual([]);
  });
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
  it("zh", () => expect(malformed(zh as unknown as Tree, "zh")).toEqual([]));
});
