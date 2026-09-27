import { describe, expect, it } from "vitest";
import { cookbookMarkdown, llmsTxt, markdownPaths, mdxToMarkdown, pageMarkdown } from "./markdown";
import { getVisibleRecipes } from "./cookbook/recipes";

const PAGE = "https://postext.dev/en/docs/x";

describe("mdxToMarkdown", () => {
  it("drops the metadata export, MDX comments and imports", () => {
    const src = [
      "{/* docs/x-en.mdx */}",
      "",
      "export const metadata = {",
      "  title: 'X',",
      "};",
      "",
      "# X",
      "",
      "Body.",
    ].join("\n");
    expect(mdxToMarkdown(src, "en", PAGE)).toBe("# X\n\nBody.");
  });

  it("turns an HTML table into a GFM table", () => {
    const src = [
      "<table>",
      "  <thead>",
      "    <tr>",
      "      <th style={{ width: '180px' }}>Field</th>",
      "      <th>Meaning</th>",
      "    </tr>",
      "  </thead>",
      "  <tbody>",
      "    <tr>",
      "      <td><code>a | b</code></td>",
      "      <td>See <a href=\"#more\">more</a>, <strong>bold</strong> {'{attr.<key>}'} x|y</td>",
      "    </tr>",
      "    <tr>",
      "      <td colSpan={2}>Spanning note</td>",
      "    </tr>",
      "  </tbody>",
      "</table>",
    ].join("\n");
    expect(mdxToMarkdown(src, "en", PAGE)).toBe(
      [
        "| Field | Meaning |",
        "| --- | --- |",
        `| \`a \\| b\` | See [more](${PAGE}#more), **bold** {attr.<key>} x\\|y |`,
        "| Spanning note |  |",
      ].join("\n")
    );
  });

  it("describes illustrations and CodePen examples in words", () => {
    const src = [
      `<Illustration name="A" data='{"title": "Flow", "desc": "Text &amp; figures.", "caption": "Cap"}' />`,
      "",
      `<CodePenExample name="render-html" title="Render" description="To HTML." height={600} />`,
    ].join("\n");
    const md = mdxToMarkdown(src, "en", PAGE);
    expect(md).toContain("> **Figure: Flow**\n> Text & figures.\n>\n> *Cap*");
    expect(md).toContain(
      "> **Runnable example: Render** — To HTML. ([source](https://github.com/drnachio/postext/tree/main/docs/examples/render-html))"
    );
  });

  it("leaves fenced code untouched", () => {
    const src = ["```tsx", "export const a = <div style={{ a: 1 }} />;", "<table>", "", "", "", "b", "```"].join("\n");
    expect(mdxToMarkdown(src, "en", PAGE)).toBe(src);
  });

  it("strips YAML frontmatter", () => {
    const src = ["---", 'title: "X"', "aliases: [\"a\"]", "---", "", "## What you'll build", "", "Body."].join("\n");
    expect(mdxToMarkdown(src, "en", PAGE)).toBe("## What you'll build\n\nBody.");
  });

  it("renders the Cookbook's components through the recipe's renderers", () => {
    const src = [
      '<Excerpt region="fonts" highlight="2-3" />',
      "",
      'Load <Feature id="font-loading">every face</Feature> first; see <RecipeLink slug="x" /> and <PageRef page={2}>the opener</PageRef>.',
      "",
      '<PageShot page={1} crop="0,0,1,.5" caption="The band." />',
      "",
      '<Gotcha id="fonts-first" />',
      "",
      "<Note>",
      "An aside,",
      "on two lines.",
      "</Note>",
    ].join("\n");
    const md = mdxToMarkdown(src, "en", PAGE, {
      block: {
        Excerpt: ({ region, highlight }) => `[excerpt ${region} ${highlight}]`,
        PageShot: ({ page, caption }) => `[shot ${page}: ${caption}]`,
        Gotcha: ({ id }) => `> **Pitfall:** ${id}`,
      },
      inline: {
        Feature: ({ id }, children) => `[${children}](/docs/${id}.md)`,
        RecipeLink: ({ slug }, children) => `[${children || slug}](/cookbook/${slug}.md)`,
        PageRef: ({ page }, children) => `[${children}](p0${page}.webp)`,
      },
    });
    expect(md).toBe(
      [
        "[excerpt fonts 2-3]",
        "",
        "Load [every face](/docs/font-loading.md) first; see [x](/cookbook/x.md) and [the opener](p02.webp).",
        "",
        "[shot 1: The band.]",
        "",
        "> **Pitfall:** fonts-first",
        "",
        "> An aside,\n> on two lines.",
      ].join("\n")
    );
  });

  it("never leaks the Cookbook's components without renderers", () => {
    const src = [
      '<Excerpt region="a" />',
      "",
      'A <Feature id="f">link</Feature>, <RecipeLink slug="s">another</RecipeLink> and <PageRef page={1}>a page</PageRef>.',
      "",
      '<PageShot page={1} caption="Cap." />',
      "",
      '<Gotcha id="g" />',
      "",
      "<Note>Aside.</Note>",
    ].join("\n");
    expect(mdxToMarkdown(src, "en", PAGE)).toBe("A link, another and a page.\n\n*Cap.*\n\n> Aside.");
  });
});

// Rendering every page and recipe in both locales reads the docs, the
// recipes, their captures and composed scripts: well under a second when
// warm, several seconds on a loaded machine (vitest's default is 5 s).
const RENDITIONS_TIMEOUT_MS = 30_000;

describe("page renditions", () => {
  it("renders every advertised path", () => {
    for (const locale of ["en", "es"]) {
      for (const path of markdownPaths(locale)) {
        const md = pageMarkdown(locale, path);
        expect(md, `${locale}${path}`).toMatch(/^# /);
        expect(md).not.toMatch(
          /export const metadata|<Illustration|<CodePenExample|<Excerpt|<PageRef|<PageShot|<Gotcha|<Feature\b|<RecipeLink|<Note\b/
        );
      }
    }
  }, RENDITIONS_TIMEOUT_MS);

  it("rejects unknown pages and locales", () => {
    expect(pageMarkdown("en", "/sandbox")).toBeNull();
    expect(pageMarkdown("fr", "")).toBeNull();
    expect(pageMarkdown("en", "/docs/nope")).toBeNull();
    expect(pageMarkdown("en", "/cookbook/nope")).toBeNull();
    expect(pageMarkdown("fr", "/cookbook")).toBeNull();
  });

  it("renders every visible recipe with its fixed sections and the whole code", () => {
    const recipes = getVisibleRecipes();
    expect(recipes.length).toBeGreaterThan(0);
    for (const locale of ["en", "es"]) {
      const index = cookbookMarkdown(locale);
      for (const recipe of recipes) {
        const md = pageMarkdown(locale, `/cookbook/${recipe.slug}`)!;
        expect(md, `${locale} ${recipe.slug}`).toMatch(/^# /);
        expect(md).toContain(`https://github.com/drnachio/postext/tree/main/cookbook/${recipe.slug}`);
        expect(md).toMatch(/^### script\.js\n\n```+js\n/m);
        // Every excerpt became a fence that names its lines.
        expect(md).toMatch(/^\/\/ script\.js, (lines|líneas) \d+–\d+$/m);
        expect(index).toContain(`/${locale}/cookbook/${recipe.slug}.md`);
      }
    }
  }, RENDITIONS_TIMEOUT_MS);

  it("llms.txt follows the llmstxt.org shape", () => {
    const txt = llmsTxt("en");
    expect(txt).toMatch(/^# Postext\n\n> /);
    expect(txt).toContain("## Documentation");
    expect(txt).toContain("## Optional");
    expect(txt).toContain("https://postext.dev/en/docs/introduction.md");
    expect(txt).toContain("## Cookbook");
    expect(txt).toMatch(/\(https:\/\/postext\.dev\/en\/cookbook\/[a-z0-9-]+\.md\)/);
    expect(txt).toContain("(https://postext.dev/en/cookbook.md)");
    expect(txt.indexOf("## Cookbook")).toBeGreaterThan(txt.indexOf("## Documentation"));
  });
});
