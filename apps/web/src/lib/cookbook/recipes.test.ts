import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { composePen, variantFor } from "./compose.ts";
import { docLinkExists } from "./docLinks.ts";
import { fontFamilies, penFonts } from "./detect.ts";
import { previewDraftsAllowed, readReleasedEngine } from "./lint.ts";
import { COOKBOOK_DIR } from "./paths.ts";
import { getAllRecipes, getRecipe, getVisibleRecipes, neighbours, neighboursIn, recipeHref, showDrafts, sortContents, writeupFor } from "./recipes.ts";
import { loadRegistry } from "./registry.ts";
import { sectionFor, splitSections, stepTitles } from "./sections.ts";
import { listRecipeSlugs, readKit, readRecipeMeta, readRecipeSources } from "./sources.ts";
import type { Locale, RecipeMeta, Registry, SectionId, Taxonomy } from "./types.ts";
import { LOCALES } from "./types.ts";
import {
  RECIPE_SCHEMA,
  compareSemVer,
  previewDraft,
  recipeSchemaJson,
  schemaErrors,
  unquotedFrontmatter,
  validateFrontmatter,
  validateRecipeMeta,
  validateRecipeSet,
  validateSlug,
} from "./validate.ts";
import { parseWriteup, readWriteup, writeupRefs } from "./writeup.ts";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const L = (en: string, es = `${en} (es)`, zh = `${en} (zh)`, ca = `${en} (ca)`, ar = `${en} (ar)`) => ({ en, es, ca, zh, ar });
const HEADINGS = {
  build: L("What you'll build", "Lo que vas a componer", "成品一览", "Què compondràs", "ما الذي ستنضده"),
  short: L("The short answer", "La respuesta corta", "简短回答", "La resposta curta", "الجواب المختصر"),
  ingredients: L("Ingredients", "Ingredientes", "用料", "Ingredients", "المكونات"),
  method: L("Method", "Elaboración", "做法", "Elaboració", "طريقة التحضير"),
  whole: L("The whole recipe", "La receta completa", "完整食谱", "La recepta completa", "الوصفة كاملة"),
  variations: L("Variations", "Variantes", "变化", "Variants", "تنويعات"),
  pitfalls: L("Pitfalls", "Errores frecuentes", "常见问题", "Errors freqüents", "أخطاء شائعة"),
  credits: L("Credits", "Créditos", "致谢", "Crèdits", "الحقوق"),
} satisfies Record<SectionId, Record<Locale, string>>;

/** Just the registry tables validateRecipeMeta reads. */
const REGISTRY = {
  taxonomy: { sections: HEADINGS },
  features: { "heading-styles": {}, "palette-links": {}, "bleed-anchor": {} },
  questions: { Q28: {}, Q29: {} },
  gaps: { footnotes: {} },
  gotchas: { "headings-drop-h1-break": {} },
  warnings: { headingSpanWithoutBreak: {}, calloutOverflow: {} },
} as unknown as Registry;

function fixtureMeta(): RecipeMeta {
  return {
    $schema: "../recipe.schema.json",
    schemaVersion: 1,
    number: 9,
    status: "published",
    chapter: "headings",
    order: 30,
    level: 2,
    genres: ["magazine"],
    outputs: ["canvas", "pdf"],
    features: { primary: ["heading-styles"], also: ["palette-links", "bleed-anchor"] },
    answers: ["Q29", "Q28"],
    gotchas: ["headings-drop-h1-break"],
    explainsWarnings: ["headingSpanWithoutBreak"],
    engine: { postext: "1.4.1", postextPdf: "1.4.1" },
    kit: ["core", "fonts", "viewer", "pdf", "images"],
    sample: { locales: ["en", "es"] },
    capture: { hero: [2, 3], card: "spread" },
    downloads: { pdf: true },
    credits: {
      authors: [{ name: "Ignacio Ferro", github: "drnachio" }],
      text: [{ what: L("Article text", "Texto del artículo"), who: "ESO", source: "https://www.eso.org/", license: "CC-BY-4.0" }],
      images: [{ what: L("Opener photo"), who: "ESO/VPHAS+", license: "CC-BY-4.0", file: "lagoon-2400.jpg" }],
      fonts: [{ family: "Newsreader", license: "OFL-1.1" }],
    },
    license: { code: "MIT", content: "CC-BY-4.0" },
    created: "2026-10-02",
    updated: "2026-10-02",
  };
}

const validate = (meta: unknown, slug = "magazine-photo-opener", knownSlugs = ["magazine-photo-opener", "other-recipe"]) =>
  validateRecipeMeta(meta, slug, REGISTRY, { knownSlugs, released: { postext: "1.4.1", postextPdf: "1.4.1" } });

// ─── recipe.json validation ─────────────────────────────────────────────────

describe("validateRecipeMeta (fixture)", () => {
  it("accepts the spec's worked example", () => {
    expect(validate(fixtureMeta())).toEqual([]);
    expect(schemaErrors(fixtureMeta(), RECIPE_SCHEMA)).toEqual([]);
  });

  it("reports schema errors with their paths", () => {
    const meta = { ...fixtureMeta(), level: 4, genres: [], extra: true } as unknown;
    const errors = validate(meta);
    expect(errors).toContain("level: must be one of 1, 2, 3 (got 4)");
    expect(errors).toContain("genres: must have at least 1 item");
    expect(errors).toContain("extra: is not a known property");
  });

  it("rejects NC and ND licences, and CC BY-SA outside text", () => {
    const meta = fixtureMeta();
    meta.credits.text[0].license = "CC-BY-NC-4.0" as never;
    meta.credits.images[0].license = "CC-BY-SA-4.0";
    const errors = validate(meta);
    expect(errors.some((e) => e.startsWith('credits.text[0].license: "CC-BY-NC-4.0" is not allowed'))).toBe(true);
    expect(errors.some((e) => e.startsWith("credits.text[0].license: must be one of"))).toBe(false);
    expect(errors).toContain("credits.images[0].license: CC-BY-SA-4.0 is allowed for sample text only (credits.text)");
    const sa = fixtureMeta();
    sa.credits.text[0].license = "CC-BY-SA-4.0";
    expect(validate(sa)).toEqual([]);
  });

  it("takes one recorded build or several for capture.doc", () => {
    for (const doc of ["first", "last", 2, ["first", "last"], [0, 1, 3]] as const) {
      const meta = fixtureMeta();
      meta.capture.doc = doc as RecipeMeta["capture"]["doc"];
      expect(validate(meta), JSON.stringify(doc)).toEqual([]);
    }
    for (const doc of [[], ["first", "first"], ["middle"], [-1]]) {
      const meta = fixtureMeta() as unknown as { capture: { doc: unknown } };
      meta.capture.doc = doc;
      expect(validate(meta).some((e) => e.startsWith("capture.doc")), JSON.stringify(doc)).toBe(true);
    }
  });

  it("checks slugs", () => {
    expect(validateSlug("a-z")).toEqual(['slug "a-z" is reserved']);
    expect(validateSlug("ab")).toEqual(['slug "ab" must have 3–48 characters']);
    expect(validateSlug("Bad_Slug")).toContain('slug "Bad_Slug" must be lowercase words joined by hyphens');
    expect(validate(fixtureMeta(), "catalog")).toContain('recipe folder: slug "catalog" is reserved');
  });

  it("checks registry ids and other recipes", () => {
    const meta = fixtureMeta();
    meta.features.also.push("nope", "heading-styles");
    meta.answers = ["Q99"];
    meta.related = ["missing-recipe", "magazine-photo-opener"];
    const errors = validate(meta);
    expect(errors).toContain('features.also: unknown feature "nope" (not in cookbook/_registry/features.json)');
    expect(errors).toContain('features.also: "heading-styles" is already primary');
    expect(errors).toContain('answers: unknown question "Q99" (not in cookbook/_registry/questions.json)');
    expect(errors).toContain('related: no recipe "missing-recipe"');
    expect(errors).toContain("related: a recipe cannot relate to itself");
  });

  it("ties the pdf output to postextPdf and the pdf kit block", () => {
    const meta = fixtureMeta();
    delete meta.engine.postextPdf;
    meta.kit = ["core", "fonts", "viewer"];
    const errors = validate(meta);
    expect(errors).toContain('engine.postextPdf: required when outputs include "pdf"');
    expect(errors).toContain('kit: a "pdf" output needs the "pdf" kit block');
    const noPdf = fixtureMeta();
    noPdf.outputs = ["canvas"];
    expect(validate(noPdf)).toEqual(
      expect.arrayContaining([
        'engine.postextPdf: only for recipes whose outputs include "pdf"',
        'kit: the "pdf" block is only for recipes with a "pdf" output',
        'downloads.pdf: needs a "pdf" output',
      ]),
    );
  });

  it("takes the book block or the cjk block, which both declare showBook", () => {
    const meta = fixtureMeta();
    meta.kit = ["core", "fonts", "viewer", "pdf", "arabic", "book"];
    expect(validate(meta).filter((e) => e.startsWith("kit:"))).toEqual([]);
    meta.kit = ["core", "fonts", "viewer", "pdf", "cjk", "arabic", "book"];
    expect(validate(meta)).toContain('kit: list "book" or "cjk", not both (the cjk block carries its own showBook)');
  });

  it("keeps unreleased engines out", () => {
    const meta = fixtureMeta();
    meta.engine.postext = "1.5.0";
    expect(validate(meta)[0]).toMatch(/^engine\.postext: 1\.5\.0 is newer than the released postext 1\.4\.1/);
  });

  it("lets a draft preview the next release on the local engine", () => {
    const released = { postext: "1.8.4", postextPdf: "1.8.4" };
    const draft = { ...fixtureMeta(), status: "draft" as const, engine: { postext: "1.9.0" as const, postextPdf: "1.9.0" as const } };
    const check = (meta: RecipeMeta, preview: boolean) =>
      validateRecipeMeta(meta, "magazine-photo-opener", REGISTRY, { knownSlugs: ["magazine-photo-opener"], released, preview });
    expect(check(draft, true)).toEqual([]);
    expect(check(draft, false)).toEqual([
      "engine.postext: 1.9.0 is newer than the released postext 1.8.4 (keep the recipe a draft and preview it with --engine local until the release)",
      "engine.postextPdf: 1.9.0 is newer than the released postext-pdf 1.8.4 (keep the recipe a draft and preview it with --engine local until the release)",
    ]);
    // A published recipe is captured from npm: never ahead of the release.
    expect(check({ ...draft, status: "published" }, true)[0]).toMatch(/^engine\.postext: 1\.9\.0 is newer than the released postext 1\.8\.4/);
    // The next release, not any version: 2.0.0 is the furthest a preview reaches.
    expect(check({ ...draft, engine: { postext: "2.0.0", postextPdf: "1.9.0" } }, true)).toEqual([]);
    expect(check({ ...draft, engine: { postext: "2.1.0", postextPdf: "1.9.0" } }, true)[0]).toMatch(/^engine\.postext: 2\.1\.0 is past the next release/);
    expect(previewDraft(draft, released)).toBe(true);
    expect(previewDraft({ ...draft, engine: { postext: "1.8.4", postextPdf: "1.8.4" } }, released)).toBe(false);
    expect(previewDraft({ ...draft, status: "published" }, released)).toBe(false);
    // The repository tests take such a draft only on request: in develop a
    // draft pins a released engine and has its capture (#201).
    expect(previewDraftsAllowed({})).toBe(false);
    expect(previewDraftsAllowed({ COOKBOOK_PREVIEW: "true" })).toBe(false);
    expect(previewDraftsAllowed({ COOKBOOK_PREVIEW: "1" })).toBe(true);
  });

  it("checks the capture settings", () => {
    const meta = fixtureMeta();
    meta.capture = { hero: [3, 5], card: "loupe", pages: [1, 2], selector: "#pages" };
    const errors = validate(meta);
    expect(errors).toContain("capture.hero: a spread is two facing pages, [verso, verso + 1]; got [3, 5]");
    expect(errors).toContain('capture.focus: required for card "loupe"');
    expect(errors).toContain('capture.selector: only for card "screenshot"');
    expect(errors).toContain("capture.pages: must include the hero page 3");
    // Parity needs the book page number, which only the capture knows.
    const offset = fixtureMeta();
    offset.capture = { hero: [1, 2], card: "spread" };
    expect(validate(offset).filter((e) => e.startsWith("capture.hero"))).toEqual([]);
    const crop = fixtureMeta();
    crop.capture = { hero: 1, card: "crop", focus: { page: 1, x: 0.6, y: 0, w: 0.5, h: 0.5 } };
    expect(validate(crop)).toEqual(["capture.focus: x + w must be ≤ 1"]);
  });

  it("checks status, redirects and dates", () => {
    const meta = fixtureMeta();
    meta.status = "retired";
    meta.formerSlugs = ["other-recipe"];
    meta.updated = "2026-10-01";
    const errors = validate(meta);
    expect(errors).toContain('replacedBy: required when status is "retired"');
    expect(errors).toContain('formerSlugs: "other-recipe" is an existing recipe folder');
    expect(errors).toContain("updated: 2026-10-01 is before created (2026-10-02)");
    const bad = fixtureMeta();
    bad.created = "2026-02-30";
    expect(validate(bad)).toContain('created: "2026-02-30" is not a calendar date');
  });

  it("checks rules across recipes", () => {
    const a = fixtureMeta();
    const b = { ...fixtureMeta(), formerSlugs: ["alpha-recipe"] };
    expect(validateRecipeSet([{ slug: "alpha-recipe", meta: a }, { slug: "beta-recipe", meta: b }])).toEqual([
      "beta-recipe: Nº 9 is already used by alpha-recipe",
      'beta-recipe: order 30 in chapter "headings" is already used by alpha-recipe',
      'beta-recipe: former slug "alpha-recipe" is a recipe folder',
    ]);
  });

  it("compares versions", () => {
    expect(compareSemVer("1.4.1", "1.4.1")).toBe(0);
    expect(compareSemVer("1.10.0", "1.9.9")).toBe(1);
    expect(compareSemVer("1.3.9", "1.4.0")).toBe(-1);
  });
});

// ─── Write-ups ──────────────────────────────────────────────────────────────

const WRITEUP = [
  "---",
  'title: "Magazine opener on a full-bleed photo"',
  'summary: "A heading style whose opener is a bleed photo plus kicker, headline and standfirst from attributes."',
  'aliases: ["article opener", "standfirst"]',
  "pageNotes:",
  '  "3": "The standfirst sits over the photo."',
  "---",
  "",
  "## What you'll build",
  "",
  "A magazine opener. See [heading styles](/en/docs/configuration#table-style).",
  "",
  "## Method",
  "",
  "### 1 · The photo is a page element",
  '<Excerpt region="photo" />',
  "",
  "```js",
  "## Not a heading",
  "```",
  "",
  "### 2 · Attributes carry the text",
  '<Excerpt region="answer" /> <Gotcha id="headings-drop-h1-break" /> <PageRef page={3}>the opener</PageRef>',
  "",
  "## Pitfalls",
  "",
  '<RecipeLink slug="other-recipe">Another</RecipeLink>',
  "",
].join("\n");

describe("write-ups", () => {
  it("parses frontmatter and splits the template", () => {
    const writeup = parseWriteup(WRITEUP, "en", HEADINGS);
    expect(writeup.issues).toEqual([]);
    expect(writeup.frontmatter).toEqual({
      title: "Magazine opener on a full-bleed photo",
      summary: "A heading style whose opener is a bleed photo plus kicker, headline and standfirst from attributes.",
      aliases: ["article opener", "standfirst"],
      pageNotes: { "3": "The standfirst sits over the photo." },
    });
    expect(Object.keys(writeup.sections)).toEqual(["build", "method", "pitfalls"]);
    expect(writeup.sections.method).toContain("## Not a heading");
    expect(stepTitles(writeup.body)).toEqual(["The photo is a page element", "Attributes carry the text"]);
  });

  it("collects component references and links", () => {
    expect(writeupRefs(parseWriteup(WRITEUP, "en", HEADINGS).body)).toEqual({
      excerpts: ["photo", "answer"],
      gotchas: ["headings-drop-h1-break"],
      features: [],
      recipes: ["other-recipe"],
      pages: [3],
      links: ["/en/docs/configuration#table-style"],
    });
  });

  it("flags template drift", () => {
    const body = [
      "Stray intro.",
      "## Method",
      "Steps.",
      "## What you'll build",
      "Text.",
      "## The short answer",
      "## Extras",
      "## Method",
    ].join("\n");
    const { issues, order } = splitSections(body, HEADINGS, "en");
    expect(order).toEqual(["method", "build"]);
    expect(issues).toEqual([
      'line 4: "## What you\'ll build" must come before "Method"',
      'line 6: "## The short answer" is generated from the recipe files; do not write it',
      'line 7: "## Extras" is not a section of the template ("What you\'ll build", "Method", "Variations", "Pitfalls")',
      'line 8: "## Method" appears twice',
      "text before the first H2 is ignored; move it into a section",
    ]);
    expect(splitSections("## Variations\nx", HEADINGS, "es").issues).toContain(
      'line 1: "## Variations" is not a section of the template ("Lo que vas a componer", "Elaboración", "Variantes", "Errores frecuentes")',
    );
    expect(sectionFor("Elaboración", HEADINGS, "es")).toBe("method");
  });

  it("validates frontmatter values and quoting", () => {
    expect(validateFrontmatter({ title: "x".repeat(61), summary: "Too short.", color: "red" }, "es")).toEqual([
      'es.mdx: frontmatter "title" must have at most 60 characters (has 61)',
      'es.mdx: frontmatter "summary" must have 60–160 characters (has 10)',
      'es.mdx: unknown frontmatter key "color"',
    ]);
    const source = ["---", "title: Bare: value", 'aliases: ["a", b]', "pageNotes:", "  3: bare", 'summary: "ok"', "---", ""].join("\n");
    expect(unquotedFrontmatter(source, "en.mdx")).toEqual([
      'en.mdx: frontmatter line 2: quote the value ("…")',
      'en.mdx: frontmatter line 3: quote every list item ("…")',
      'en.mdx: frontmatter line 5: quote the value ("…")',
    ]);
  });

  it("reads a Chinese write-up against the Chinese headings and bounds", () => {
    const source = [
      "---",
      'title: "整页出血照片上的杂志开篇"',
      'summary: "一种标题样式：开篇是一张出血照片，眉题、主标题和导语都取自属性。"',
      "---",
      "",
      "## 成品一览",
      "",
      "一个杂志开篇，见[标题样式](/zh/docs/configuration#table-style)。",
      "",
      "## 做法",
      "",
      "### 1、照片是页面元素",
      '<Excerpt region="photo" />',
      "",
      "## 常见问题",
      "",
    ].join("\n");
    const writeup = parseWriteup(source, "zh", HEADINGS);
    expect(writeup.issues).toEqual([]);
    expect(Object.keys(writeup.sections)).toEqual(["build", "method", "pitfalls"]);
    expect(stepTitles(writeup.body)).toEqual(["照片是页面元素"]);
    expect(writeupRefs(writeup.body).links).toEqual(["/zh/docs/configuration#table-style"]);
    expect(sectionFor("做法", HEADINGS, "zh")).toBe("method");
    expect(splitSections("## Method\nx", HEADINGS, "zh").issues[0]).toBe(
      'line 1: "## Method" is not a section of the template ("成品一览", "做法", "变化", "常见问题")',
    );
    // A Chinese character carries two or three Latin letters' worth: half the bounds.
    expect(validateFrontmatter({ title: "字".repeat(31), summary: "字".repeat(19) }, "zh")).toEqual([
      'zh.mdx: frontmatter "title" must have at most 30 characters (has 31)',
      'zh.mdx: frontmatter "summary" must have 20–90 characters (has 19)',
    ]);
    expect(validateFrontmatter({ title: "标题", summary: "字".repeat(40), description: "字".repeat(60) }, "zh")).toEqual([]);
  });
});

describe("writeupFor", () => {
  const writeup = (locale: Locale) => ({ locale, frontmatter: { title: locale, summary: "" }, body: "", sections: {} });

  it("falls back to English while a translation is missing", () => {
    expect(writeupFor({ writeups: { en: writeup("en"), es: writeup("es") } }, "zh")?.locale).toBe("en");
    expect(writeupFor({ writeups: { en: writeup("en"), es: writeup("es"), zh: writeup("zh") } }, "zh")?.locale).toBe("zh");
    expect(writeupFor({ writeups: { es: writeup("es") } }, "zh")?.locale).toBe("es");
    expect(writeupFor({ writeups: {} }, "zh")).toBeNull();
  });
});

// ─── The loader ─────────────────────────────────────────────────────────────

describe("loader helpers", () => {
  const taxonomy = {
    parts: [{ id: "page" }, { id: "book" }, { id: "practice" }],
    chapters: [
      { id: "page", number: 1, part: "page" },
      { id: "headings", number: 3, part: "page" },
      { id: "tables", number: 8, part: "book" },
    ],
  } as unknown as Taxonomy;
  const r = (slug: string, chapter: RecipeMeta["chapter"], order: number) => ({ slug, meta: { chapter, order } });

  it("sorts in contents order and finds neighbours", () => {
    const list = sortContents([r("t-10", "tables", 10), r("h-20", "headings", 20), r("h-10", "headings", 10), r("p-50", "page", 50)], taxonomy);
    expect(list.map((x) => x.slug)).toEqual(["p-50", "h-10", "h-20", "t-10"]);
    expect(neighboursIn(list, "h-10")).toEqual({ prev: list[0], next: list[2] });
    expect(neighboursIn(list, "p-50").prev).toBeNull();
    expect(neighboursIn(list, "nope")).toEqual({ prev: null, next: null });
  });

  it("builds hrefs and follows the drafts rule", () => {
    expect(recipeHref("magazine-photo-opener")).toBe("/cookbook/magazine-photo-opener");
    expect(recipeHref("magazine-photo-opener", "es")).toBe("/es/cookbook/magazine-photo-opener");
    expect(showDrafts()).toBe(true); // vitest runs with NODE_ENV=test
  });

  it("loads the recipes on disk (or none)", () => {
    const visible = getVisibleRecipes();
    expect(getAllRecipes({ includeDrafts: true })).toEqual(visible);
    expect(visible.every((recipe) => recipe.meta.status !== "retired")).toBe(true);
    for (const recipe of visible) {
      expect(getRecipe(recipe.slug)).toBe(recipe);
      const { prev, next } = neighbours(recipe.slug);
      if (prev) expect(neighbours(prev.slug).next).toBe(recipe);
      if (next) expect(neighbours(next.slug).prev).toBe(recipe);
    }
    expect(getRecipe("no-such-recipe")).toBeNull();
  });
});

// ─── cookbook/<slug>/ ───────────────────────────────────────────────────────

describe("recipe folders", () => {
  const slugs = listRecipeSlugs();
  const released = readReleasedEngine();
  const metas = slugs.map((slug) => ({ slug, meta: readRecipeMeta(slug) }));
  let registry: Registry;
  beforeAll(() => {
    if (slugs.length) registry = loadRegistry();
  });

  it("have valid recipe.json files", () => {
    const errors = metas.flatMap(({ slug, meta }) =>
      // Only with COOKBOOK_PREVIEW=1 may a draft preview the next release.
      validateRecipeMeta(meta, slug, registry, { knownSlugs: slugs, released, preview: previewDraftsAllowed() }).map((e) => `${slug}: ${e}`),
    );
    expect([...errors, ...validateRecipeSet(metas)]).toEqual([]);
  });

  it("match the generated recipe.schema.json", () => {
    const file = path.join(COOKBOOK_DIR, "recipe.schema.json");
    if (!slugs.length && !fs.existsSync(file)) return;
    expect(fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "missing: run `pnpm cookbook schema`").toBe(recipeSchemaJson());
  });

  it("have every write-up, following the template", () => {
    const problems: string[] = [];
    for (const { slug, meta } of metas) {
      const excerpts: Partial<Record<Locale, string>> = {};
      for (const locale of LOCALES) {
        const writeup = readWriteup(slug, locale, registry.taxonomy.sections);
        if (!writeup) {
          problems.push(`${slug}: ${locale}.mdx is missing`);
          continue;
        }
        problems.push(...writeup.issues.map((issue) => `${slug}: ${issue}`));
        const refs = writeupRefs(writeup.body);
        excerpts[locale] = refs.excerpts.join(", ");
        const pen = composePen(readRecipeSources(slug), meta, variantFor(meta, locale), { kit: readKit() });
        for (const region of refs.excerpts) if (!pen.ranges.regions[region]) problems.push(`${slug}: ${locale}.mdx: no #region ${region}`);
        for (const id of refs.gotchas) if (!registry.gotchas[id]) problems.push(`${slug}: ${locale}.mdx: unknown gotcha ${id}`);
        for (const id of refs.features) if (!registry.features[id]) problems.push(`${slug}: ${locale}.mdx: unknown feature ${id}`);
        for (const other of refs.recipes) if (!slugs.includes(other)) problems.push(`${slug}: ${locale}.mdx: no recipe ${other}`);
        for (const link of refs.links) {
          if (!link.startsWith(`/${locale}/`)) problems.push(`${slug}: ${locale}.mdx: ${link} has the wrong locale`);
          else if (link.includes("/docs/") && !docLinkExists(link)) problems.push(`${slug}: ${locale}.mdx: ${link} does not resolve`);
        }
      }
      for (const locale of LOCALES) {
        if (excerpts.en !== undefined && excerpts[locale] !== undefined && excerpts[locale] !== excerpts.en) {
          problems.push(`${slug}: <Excerpt> regions differ (en: ${excerpts.en} · ${locale}: ${excerpts[locale]})`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("credit every font family in FONTS, and only those", () => {
    const problems = metas.flatMap(({ slug, meta }) => {
      const families = fontFamilies(penFonts(readRecipeSources(slug).script)).sort();
      const credited = meta.credits.fonts.map((f) => f.family).sort();
      return families.join() === credited.join() ? [] : [`${slug}: FONTS has ${families.join(", ")}; credits.fonts has ${credited.join(", ")}`];
    });
    expect(problems).toEqual([]);
  });
});
