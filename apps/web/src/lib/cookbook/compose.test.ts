import { describe, expect, it } from "vitest";
import { ComposeError, KIT_CLOSE, KIT_OPEN, composePen, contentLiteral, defineData, pageHtml, variantFor } from "./compose.ts";
import { getVisibleRecipes } from "./recipes.ts";
import { readKit, readRecipeSources } from "./sources.ts";
import type { KitBlock, RecipeMeta, RecipeSources } from "./types.ts";

/** Evaluates a JavaScript literal the way the pen does. */
const evaluate = (literal: string): string => new Function(`return ${literal};`)() as string;

const KIT: Record<KitBlock, string> = {
  core: "// ─── Kit · core\nfunction mm(v) { return v; }",
  fonts: "// ─── Kit · fonts\nfunction loadFonts() {}",
  viewer: "// ─── Kit · viewer\nfunction showPages() {}",
  pdf: "// ─── Kit · pdf\nfunction offerPdf() {}",
  images: "// ─── Kit · images\nfunction loadImage() {}",
  cjk: "// ─── Kit · cjk\nfunction loadCjkFonts() {}",
};

const SCRIPT = [
  "// ═══ banner",
  "const LANG = 'en'; // @lang: the language of the sample document",
  "const RECIPE = 'fixture-recipe';",
  "",
  "// #region answer: the technique",
  "const answer = 1;",
  "const more = 2;",
  "// #endregion",
  "",
  "const markdown = /* @content */ '';",
  "const intro = /* @content:intro */ '';",
  "",
  "// #region build: build and show",
  "showPages(markdown + intro);",
  "// #endregion",
  "",
  "// @kit core fonts viewer images",
].join("\n");

function sources(overrides: Partial<RecipeSources> = {}): RecipeSources {
  return {
    slug: "fixture-recipe",
    script: SCRIPT,
    html: "",
    css: "",
    pen: {},
    content: { en: "# One\n\nFirst line.\nSecond line.\n", es: "# Uno\n", "intro.en": "Intro `x`" },
    assets: [],
    ...overrides,
  };
}

const META: Pick<RecipeMeta, "sample" | "kit"> = { sample: { locales: ["en", "es"] }, kit: ["images", "viewer", "core", "fonts"] };

describe("contentLiteral", () => {
  const samples = [
    "Plain *Markdown* with a \\\\ title break and \\$5.",
    "Backticks `code` and a template ${placeholder}.",
    "A trailing backslash \\",
    "Mixed \\` escaped backtick, \\${ escaped, `real` and ${real}.",
    "Windows\r\nline endings\r\n",
    "Unicode: «Título», Ø, 🙂,   separators.",
    "",
  ];

  it("round-trips through a JavaScript evaluation", () => {
    for (const text of samples) expect(evaluate(contentLiteral(text))).toBe(text.replace(/\r\n?/g, "\n"));
  });

  it("uses String.raw when the text allows it", () => {
    expect(contentLiteral("A \\\\ break")).toBe("String.raw`A \\\\ break`");
    expect(contentLiteral("A `tick`").startsWith("`")).toBe(true);
    expect(contentLiteral("Ends with \\").startsWith("`")).toBe(true);
    expect(contentLiteral("Has ${x}").startsWith("`")).toBe(true);
    expect(contentLiteral("Embed with <script src=\"x.js\"></script>").startsWith("`")).toBe(true);
  });
});

describe("composePen", () => {
  it("replaces the markers and inlines the kit in its fixed order", () => {
    const pen = composePen(sources(), META, "es", { kit: KIT });
    expect(pen.js).toContain("const LANG = 'es'; // @lang: the language of the sample document");
    expect(pen.js).toContain("const markdown = String.raw`# Uno\n`;");
    // The slot has no Spanish file: the first sample language's file is used.
    expect(pen.js).toContain("const intro = `Intro \\`x\\``;");
    const order = ["core", "fonts", "viewer", "images"].map((block) => pen.js.indexOf(`// ─── Kit · ${block}`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(pen.js).not.toContain("Kit · pdf");
    expect(pen.js.trimEnd().endsWith(KIT_CLOSE)).toBe(true);
    expect(pen.js).not.toContain("@kit");
  });

  it("reports the line ranges of content, kit and regions", () => {
    const pen = composePen(sources(), META, "en", { kit: KIT });
    const lines = pen.js.split("\n");
    const at = ([a, b]: [number, number]) => lines.slice(a - 1, b).join("\n");
    expect(pen.ranges.content).toHaveLength(2);
    expect(at(pen.ranges.content[0])).toBe("const markdown = String.raw`# One\n\nFirst line.\nSecond line.\n`;");
    expect(evaluate(at(pen.ranges.content[1]).replace(/^const intro = |;$/g, ""))).toBe("Intro `x`");
    expect(lines[pen.ranges.kit![0] - 1]).toBe(KIT_OPEN);
    expect(lines[pen.ranges.kit![1] - 1]).toBe(KIT_CLOSE);
    expect(pen.ranges.regions.answer).toEqual({ lines: [6, 7], title: "the technique" });
    expect(at(pen.ranges.regions.build.lines)).toBe("showPages(markdown + intro);");
    // Banner, LANG, RECIPE, 2 region markers × 2, 2 answer lines, the build line (content and kit excluded).
    expect(pen.ownLines).toBe(10);
  });

  it("requires the markers", () => {
    const fail = (script: string, meta = META) => () => composePen(sources({ script }), meta, "en", { kit: KIT });
    expect(fail(SCRIPT.replace("// @lang", "// lang"))).toThrow(ComposeError);
    expect(fail(SCRIPT + "\nconsole.log(1);")).toThrow("`// @kit` must be the last line of script.js");
    expect(fail(SCRIPT.replace("// @kit core fonts viewer images", ""))).toThrow("recipe.json lists kit blocks");
    expect(fail(SCRIPT.replace("// #endregion\n\nconst markdown", "\nconst markdown"))).toThrow("opens inside");
    expect(() =>
      composePen(sources({ content: { en: "x" } }), { sample: { locales: ["en"] }, kit: [] }, "en", { kit: KIT }),
    ).toThrow("missing content.intro.en.md");
    expect(variantFor({ sample: { locales: ["es"] } }, "en")).toBe("es");
  });

  it("ignores marker lines inside the sample text", () => {
    const listing = "A listing:\n\n// #region demo: Demo\nconst x = 1;\n// #endregion\n// @kit core\n";
    const pen = composePen(sources({ content: { en: listing, es: "# Uno\n", "intro.en": "Intro" } }), META, "en", { kit: KIT });
    expect(Object.keys(pen.ranges.regions)).toEqual(["answer", "build"]);
    expect(pen.js).toContain("// @kit core\n`;");
    expect(pen.ranges.kit).not.toBeNull();
    expect(pen.js).toContain(KIT_OPEN);
  });

  it("composes against the real kit", () => {
    const kit = readKit();
    expect(Object.keys(kit).sort()).toEqual(["cjk", "core", "fonts", "images", "pdf", "viewer"]);
    const pen = composePen(sources(), { sample: { locales: ["en"] }, kit: ["core", "fonts", "viewer", "pdf", "images", "cjk"] }, "en", { kit });
    expect(pen.js).toContain("function buildWithFonts(");
    expect(pen.js).toContain("function offerPdf(");
    expect(pen.js).toContain("async function loadCjkFonts(");
    expect(pen.js).toContain("async function cjkPdfProvider(");
    // The cjk block comes last, after the pdf block it leans on.
    expect(pen.js.indexOf("// ─── Kit · cjk")).toBeGreaterThan(pen.js.indexOf("// ─── Kit · images"));
  });
});

describe("defineData and pageHtml", () => {
  it("builds valid prefill JSON within CodePen's limit", () => {
    const pen = composePen(sources({ pen: { tags: ["magazine"] } }), META, "en", { kit: readKit() });
    const data = defineData(pen, { title: "Fixture · Postext Cookbook", description: "Summary.", tags: ["headings"] });
    expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(96 * 1024);
    const parsed = JSON.parse(data);
    expect(parsed).toMatchObject({ js_module: true, editors: "001", js: pen.js });
    expect(parsed.tags).toEqual(["magazine", "headings", "postext", "postext-cookbook"]);
  });

  it("escapes </script in the inlined module", () => {
    const pen = composePen(sources({ content: { en: "</script> in text", "intro.en": "" } }), META, "en", { kit: KIT });
    const html = pageHtml(pen, { title: "A <b> title" });
    expect(html).toContain("<title>A &lt;b&gt; title</title>");
    expect(html).not.toContain("</script> in text");
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it("keeps the sample text of the .html download identical to the pen's", () => {
    const text = 'Embed with <script src="x.js"></script> in your page.';
    const pen = composePen(sources({ content: { en: text, "intro.en": "" } }), META, "en", { kit: KIT });
    const html = pageHtml(pen, { title: "T" });
    const literal = html.split("\n").find((line) => line.startsWith("const markdown = "))!;
    expect(evaluate(literal.replace(/^const markdown = /, "").replace(/;$/, ""))).toBe(text);
  });

  it("keeps every recipe's prefill within 96 KB", () => {
    const kit = readKit();
    const heavy = getVisibleRecipes().flatMap((recipe) =>
      recipe.meta.sample.locales.flatMap((variant) => {
        const pen = composePen(readRecipeSources(recipe.slug), recipe.meta, variant, { kit });
        const size = new TextEncoder().encode(defineData(pen, { title: recipe.slug, description: "x".repeat(300) })).length;
        return size > 96 * 1024 ? [`${recipe.slug} (${variant}): ${Math.round(size / 1024)} KB`] : [];
      }),
    );
    expect(heavy).toEqual([]);
  });
});
