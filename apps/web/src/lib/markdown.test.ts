import { describe, expect, it } from "vitest";
import { llmsTxt, markdownPaths, mdxToMarkdown, pageMarkdown } from "./markdown";

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
    const src = ["```tsx", "export const a = <div style={{ a: 1 }} />;", "<table>", "```"].join("\n");
    expect(mdxToMarkdown(src, "en", PAGE)).toBe(src);
  });
});

describe("page renditions", () => {
  it("renders every advertised path", () => {
    for (const locale of ["en", "es"]) {
      for (const path of markdownPaths(locale)) {
        const md = pageMarkdown(locale, path);
        expect(md, `${locale}${path}`).toMatch(/^# /);
        expect(md).not.toMatch(/export const metadata|<Illustration|<CodePenExample/);
      }
    }
  });

  it("rejects unknown pages and locales", () => {
    expect(pageMarkdown("en", "/sandbox")).toBeNull();
    expect(pageMarkdown("fr", "")).toBeNull();
    expect(pageMarkdown("en", "/docs/nope")).toBeNull();
  });

  it("llms.txt follows the llmstxt.org shape", () => {
    const txt = llmsTxt("en");
    expect(txt).toMatch(/^# Postext\n\n> /);
    expect(txt).toContain("## Documentation");
    expect(txt).toContain("## Optional");
    expect(txt).toContain("https://postext.dev/en/docs/introduction.md");
  });
});
