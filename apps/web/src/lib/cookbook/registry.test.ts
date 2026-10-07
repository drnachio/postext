import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { docAnchor, docAnchorPath, docLinkExists, resolveDocAnchor } from "./docLinks.ts";
import { REGISTRY_DIR, REPO_DIR } from "./paths.ts";
import { REGISTRY_FILES, loadRegistry } from "./registry.ts";
import { listRecipeSlugs, readRecipeMeta } from "./sources.ts";
import type { DocAnchor, Registry, SectionId } from "./types.ts";
import { CHAPTER_IDS, GENRE_IDS, LOCALES, OUTPUT_IDS, SECTION_ORDER } from "./types.ts";
import { validateRegistry } from "./validate.ts";

// ─── In-memory fixture ──────────────────────────────────────────────────────

const L = (en: string, es = `${en} (es)`, zh = `${en} (zh)`, ca = `${en} (ca)`, ar = `${en} (ar)`, ja = `${en} (ja)`) => ({ en, es, ca, zh, ar, ja });
const HEADINGS: Record<SectionId, [string, string, string, string, string, string]> = {
  build: ["What you'll build", "Lo que vas a componer", "成品一览", "Què compondràs", "ما الذي ستنضده", "できあがり"],
  short: ["The short answer", "La respuesta corta", "简短回答", "La resposta curta", "الجواب المختصر", "手短な答え"],
  ingredients: ["Ingredients", "Ingredientes", "用料", "Ingredients", "المكونات", "材料"],
  method: ["Method", "Elaboración", "做法", "Elaboració", "طريقة التحضير", "作り方"],
  whole: ["The whole recipe", "La receta completa", "完整食谱", "La recepta completa", "الوصفة كاملة", "レシピの全体"],
  variations: ["Variations", "Variantes", "变化", "Variants", "تنويعات", "アレンジ"],
  pitfalls: ["Pitfalls", "Errores frecuentes", "常见问题", "Errors freqüents", "أخطاء شائعة", "よくあるつまずき"],
  credits: ["Credits", "Créditos", "致谢", "Crèdits", "الحقوق", "クレジット"],
};
const ANCHOR: DocAnchor = { slug: "configuration", heading: { en: "Table style", es: "Estilo de tablas", ca: "Estil de taules", zh: "表格样式", ar: "نمط الجداول", ja: "表のスタイル" } };

function fixtureRegistry(): Registry {
  return {
    taxonomy: {
      parts: [
        { id: "page", number: "I", color: "blue", title: L("The page", "La página") },
        { id: "book", number: "II", color: "gilt", title: L("The book", "El libro") },
        { id: "practice", number: "III", color: "vermilion", title: L("In practice", "La práctica") },
      ],
      chapters: CHAPTER_IDS.map((id, i) => ({
        id,
        number: i + 1,
        part: i < 3 ? "page" : i < 8 ? "book" : "practice",
        title: L(id),
        intro: L(`About ${id}`),
      })),
      genres: GENRE_IDS.map((id) => ({ id, title: L(id) })),
      outputs: OUTPUT_IDS.map((id) => ({ id, title: L(id) })),
      levels: ([1, 2, 3] as const).map((id) => ({ id, title: L(`Level ${id}`), criteria: L("Criteria") })),
      sections: Object.fromEntries(SECTION_ORDER.map((id) => [id, L(...HEADINGS[id])])) as Registry["taxonomy"]["sections"],
    },
    features: {
      "heading-styles": { label: L("Heading styles"), definition: L("Openers."), group: "headings", docs: ANCHOR },
      "palette-links": { label: L("Palette links"), definition: L("Colours."), group: "colour", docs: ANCHOR, since: "1.2.0" },
    },
    apis: { buildDocument: ANCHOR },
    config: { headings: ANCHOR },
    questions: {
      Q01: { kind: "how", text: L("How do I lay out pages?"), index: L("Pages, laying out"), theme: "basics" },
      Q02: { kind: "why", text: L("Why no footnotes?"), index: L("Footnotes"), theme: "gaps", gap: "footnotes" },
    },
    gaps: {
      footnotes: {
        label: L("Footnotes", "Notas al pie", "脚注", "Notes a peu de pàgina"),
        aliases: { en: ["footnote"], es: ["nota al pie"], ca: ["nota a peu de pàgina"], zh: ["注脚"], ar: ["حاشية سفلية"], ja: ["脚注"] },
        explanation: L("Not parsed."),
      },
    },
    warnings: {
      calloutOverflow: { source: "engine", label: L("Callout overflow"), cause: L("Too tall."), fix: L("Split it.") },
    },
    gotchas: {
      "headings-drop-h1-break": { title: L("H1 break"), body: L("Restate it."), feature: "heading-styles" },
    },
    collections: { featured: { title: L("Featured"), summary: L("Picks."), recipes: [] } },
  };
}

describe("validateRegistry (fixture)", () => {
  it("accepts a consistent registry", () => {
    expect(validateRegistry(fixtureRegistry(), { knownSlugs: [] })).toEqual([]);
  });

  it("requires every language everywhere", () => {
    const registry = fixtureRegistry();
    registry.features["heading-styles"].label.es = " ";
    registry.gaps.footnotes.aliases.es = [""];
    delete (registry.questions.Q01.text as Partial<typeof registry.questions.Q01.text>).zh;
    expect(validateRegistry(registry)).toEqual([
      "features.heading-styles.label.es: must be non-empty text",
      "questions.Q01.text.zh: must be non-empty text",
      "gaps.footnotes.aliases.es: must be non-empty text",
    ]);
  });

  it("checks the taxonomy", () => {
    const registry = fixtureRegistry();
    registry.taxonomy.chapters[0].part = "nowhere" as never;
    registry.taxonomy.chapters[1].number = 1;
    registry.taxonomy.genres.pop();
    const errors = validateRegistry(registry);
    expect(errors).toContain('taxonomy.chapters.page.part: unknown part "nowhere"');
    expect(errors).toContain("taxonomy.chapters.type.number: 1 is used twice");
    expect(errors.some((e) => e.startsWith("taxonomy.genres: must list exactly"))).toBe(true);
  });

  it("checks references between registries and to recipes", () => {
    const registry = fixtureRegistry();
    registry.questions.Q02.gap = "tables-in-markdown";
    registry.gotchas["headings-drop-h1-break"].feature = "nope";
    registry.collections.featured.recipes = ["a-recipe", "b-recipe", "c-recipe", "d-recipe", "e-recipe"];
    const errors = validateRegistry(registry, { knownSlugs: ["a-recipe"] });
    expect(errors).toContain('questions.Q02.gap: unknown gap "tables-in-markdown"');
    expect(errors).toContain('gotchas.headings-drop-h1-break.feature: unknown feature "nope"');
    expect(errors).toContain('collections.featured.recipes: no recipe folder "b-recipe"');
    expect(errors).toContain("collections.featured: at most 4 recipes (the frontispiece and 3 editor's picks)");
  });

  it("checks the per-language frontispieces", () => {
    const registry = fixtureRegistry();
    registry.collections.featured.frontispiece = { es: "a-recipe", zh: "b-recipe" };
    (registry.collections.featured.frontispiece as Record<string, string>).fr = "a-recipe";
    const errors = validateRegistry(registry, { knownSlugs: ["a-recipe"] });
    expect(errors).toContain('collections.featured.frontispiece.zh: no recipe folder "b-recipe"');
    expect(errors).toContain("collections.featured.frontispiece.fr: unknown locale");
    expect(errors.filter((e) => e.includes("frontispiece.es"))).toEqual([]);
  });

  it("requires a frontispiece once a recipe is published", () => {
    expect(validateRegistry(fixtureRegistry(), { requireFeatured: true })).toEqual([
      "collections.featured: needs the frontispiece recipe",
    ]);
  });
});

describe("docLinks", () => {
  it("resolves an anchor with the doc page's slugger", () => {
    expect(docAnchor(ANCHOR, "en")).toBe("/en/docs/configuration#table-style");
    expect(docAnchorPath(ANCHOR, "es")).toBe("/docs/configuration#estilo-de-tablas");
    expect(docAnchorPath(ANCHOR, "ca")).toBe("/docs/configuration#estil-de-taules");
    expect(docAnchorPath(ANCHOR, "ar")).toBe("/docs/configuration#نمط-الجداول");
    expect(resolveDocAnchor({ slug: "configuration", heading: L("No such heading") }, "en")).toBeNull();
    expect(resolveDocAnchor({ slug: "no-such-doc", heading: ANCHOR.heading }, "en")).toBeNull();
  });

  it("checks internal docs links", () => {
    expect(docLinkExists("/en/docs/configuration#table-style")).toBe(true);
    expect(docLinkExists("/es/docs/configuration")).toBe(true);
    expect(docLinkExists("/zh/docs/configuration")).toBe(true);
    expect(docLinkExists("/fr/docs/configuration")).toBe(false);
    expect(docLinkExists("/en/docs/configuration#nope")).toBe(false);
    expect(docLinkExists("/en/docs/nope")).toBe(false);
  });
});

// ─── cookbook/_registry ─────────────────────────────────────────────────────

const missing = REGISTRY_FILES.filter((name) => !fs.existsSync(path.join(REGISTRY_DIR, `${name}.json`)));

describe("cookbook/_registry", () => {
  it("has every registry file", () => {
    expect(missing.map((name) => `cookbook/_registry/${name}.json`)).toEqual([]);
  });

  describe.skipIf(missing.length > 0)("contents", () => {
    const registry = missing.length ? null : loadRegistry();
    const slugs = listRecipeSlugs();

    it("validates", () => {
      const published = slugs.some((slug) => {
        try {
          return readRecipeMeta(slug).status === "published";
        } catch {
          return false;
        }
      });
      expect(validateRegistry(registry!, { knownSlugs: slugs, requireFeatured: published })).toEqual([]);
    });

    it("resolves every docs anchor in both languages", () => {
      const anchors: [string, DocAnchor][] = [
        ...Object.entries(registry!.features).map(([id, f]): [string, DocAnchor] => [`features.${id}`, f.docs]),
        ...Object.entries(registry!.apis).map(([id, a]): [string, DocAnchor] => [`apis.${id}`, a]),
        ...Object.entries(registry!.config).map(([id, a]): [string, DocAnchor] => [`config.${id}`, a]),
        ...Object.entries(registry!.warnings)
          .filter(([, w]) => w.docs)
          .map(([id, w]): [string, DocAnchor] => [`warnings.${id}`, w.docs!]),
        ...Object.entries(registry!.gaps)
          .filter(([, g]) => g.docs)
          .map(([id, g]): [string, DocAnchor] => [`gaps.${id}`, g.docs!]),
      ];
      // A docs page announced before it is written (the comic features
      // point at docs/comics, issue #572): its anchors are checked from the
      // day docs/<slug>-en.mdx exists.
      const UPCOMING_DOCS = ["comics"];
      const written = (slug: string) =>
        !UPCOMING_DOCS.includes(slug) || fs.existsSync(path.join(REPO_DIR, "docs", `${slug}-en.mdx`));
      const dead = anchors.filter(([, anchor]) => written(anchor.slug)).flatMap(([where, anchor]) =>
        LOCALES.filter((locale) => !resolveDocAnchor(anchor, locale)).map(
          (locale) => `${where}: no "${anchor.heading?.[locale]}" heading in docs/${anchor.slug}-${locale}.mdx`,
        ),
      );
      expect(dead).toEqual([]);
    });

    it("explains every Sandbox warning kind", () => {
      const source = fs.readFileSync(path.join(REPO_DIR, "packages/postext-sandbox/src/warnings/types.ts"), "utf-8");
      const union = /export type WarningKind =([\s\S]*?);/.exec(source)?.[1] ?? "";
      const kinds = [...union.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
      expect(kinds.length).toBeGreaterThan(20);
      expect(kinds.filter((kind) => !registry!.warnings[kind])).toEqual([]);
    });
  });
});
