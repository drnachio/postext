import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

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

describe("messages", () => {
  for (const ns of NAMESPACES) {
    it(`${ns} has the same keys in en and es`, () => {
      const a = (en as unknown as Record<string, Tree>)[ns];
      const b = (es as unknown as Record<string, Tree>)[ns];
      expect(a, `en.${ns}`).toBeDefined();
      expect(b, `es.${ns}`).toBeDefined();
      const enKeys = leafKeys(a!).sort();
      const esKeys = leafKeys(b!).sort();
      expect(esKeys.filter((k) => !enKeys.includes(k)), `only in es.${ns}`).toEqual([]);
      expect(enKeys.filter((k) => !esKeys.includes(k)), `only in en.${ns}`).toEqual([]);
    });
  }
});
