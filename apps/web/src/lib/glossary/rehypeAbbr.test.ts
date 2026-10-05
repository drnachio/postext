import { describe, expect, it } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileDocsMdx } from "@/lib/mdx";
import { ABBREVIATIONS, abbreviationPattern, abbreviationsFor } from "./abbreviations";
import { wrapAbbreviations } from "./rehypeAbbr";

async function html(source: string, locale = "en", abbrSeen?: Set<string>, components = {}) {
  const { content } = await compileDocsMdx(source, components, { locale, abbrSeen });
  return renderToStaticMarkup(content);
}

const abbrs = (markup: string) => [...markup.matchAll(/<abbr title="([^"]*)">([^<]*)<\/abbr>/g)].map((m) => m[2]);

describe("abbreviation dictionary", () => {
  it("has unique ids and an expansion in every locale", () => {
    const ids = ABBREVIATIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ABBREVIATIONS) {
      for (const l of ["en", "es", "zh", "ca", "ar", "ja"] as const) expect(a.expansion[l], `${a.id} ${l}`).toBeTruthy();
    }
  });

  it("matches whole words only, longest form first", () => {
    const find = (text: string, locale = "en") => [...text.matchAll(abbreviationPattern(locale))].map((m) => m[0]);
    expect(find("Export PDF/UA and PDFs as HTML5 or postext-pdf, file.pdf")).toEqual(["PDF/UA", "PDFs"]);
    expect(find("生成PDF文件和SVG图")).toEqual(["PDF", "SVG"]);
    expect(find("e.g. a 10.5 pt size, i.e. 3.7 mm")).toEqual(["e.g.", "pt", "i.e.", "mm"]);
    expect(find("según el RGPD", "es")).toEqual(["RGPD"]);
    expect(abbreviationsFor("es").get("RGPD")?.title).toMatch(/Reglamento General/);
  });
});

describe("rehypeAbbr through the docs pipeline", () => {
  it("wraps the first occurrence of each abbreviation only", async () => {
    const out = await html("Postext writes PDF and HTML.\n\nAnother PDF, another HTML.");
    expect(abbrs(out)).toEqual(["PDF", "HTML"]);
    expect(out).toContain('<abbr title="Portable Document Format">PDF</abbr>');
  });

  it("uses the locale's expansion", async () => {
    expect(await html("Exporta a PDF.", "es")).toContain('title="Portable Document Format, formato de documento portátil"');
    expect(await html("导出为PDF。", "zh")).toContain('<abbr title="便携式文档格式">PDF</abbr>');
    expect(await html("PDFを書き出します。", "ja")).toContain('<abbr title="Portable Document Format（ポータブル・ドキュメント・フォーマット）">PDF</abbr>');
  });

  it("never wraps inside code, headings, links or an existing abbr", async () => {
    const out = await html(
      [
        "## PDF output",
        "",
        "Run `postext --pdf PDF` and see [the PDF guide](/en/docs/x).",
        "",
        '<abbr title="Mine">CSS</abbr> styles, then CSS again.',
        "",
        "```ts",
        "const SVG = 1;",
        "```",
        "",
        "Finally a PDF and an SVG.",
      ].join("\n"),
    );
    expect(abbrs(out)).toEqual(["CSS", "PDF", "SVG"]);
    expect(out).toContain('<abbr title="Mine">CSS</abbr>');
    expect(out).not.toContain('<abbr title="Cascading');
    expect(out).toMatch(/<h2[^>]*>PDF output<\/h2>/);
    expect(out).toMatch(/Finally a <abbr title="Portable Document Format">PDF<\/abbr> and an <abbr/);
  });

  it("skips inline components and enters a Note", async () => {
    const Feature = ({ children }: { children?: ReactNode }) => createElement("span", { "data-feature": "" }, children);
    const Note = ({ children }: { children?: ReactNode }) => createElement("aside", null, children);
    const out = await html("See <Feature id=\"x\">the PDF path</Feature>.\n\n<Note>\nA note on SVG.\n</Note>", "en", undefined, { Feature, Note });
    expect(out).toContain('<span data-feature="">the PDF path</span>');
    expect(abbrs(out)).toEqual(["SVG"]);
  });

  it("shares what it expanded between fragments of one page", async () => {
    const seen = new Set<string>();
    expect(abbrs(await html("A PDF.", "en", seen))).toEqual(["PDF"]);
    expect(abbrs(await html("A PDF and a CSS file.", "en", seen))).toEqual(["CSS"]);
  });

  it("leaves the text alone without a locale", async () => {
    const { content } = await compileDocsMdx("A PDF.");
    expect(renderToStaticMarkup(content)).not.toContain("<abbr");
  });
});

describe("wrapAbbreviations on a bare tree", () => {
  it("splits a text node around the abbreviation", () => {
    const tree = { type: "root", children: [{ type: "element", tagName: "p", children: [{ type: "text", value: "To PDF now" }] }] };
    wrapAbbreviations(tree, { locale: "en" });
    expect(tree.children[0]!.children).toEqual([
      { type: "text", value: "To " },
      { type: "element", tagName: "abbr", properties: { title: "Portable Document Format" }, children: [{ type: "text", value: "PDF" }] },
      { type: "text", value: " now" },
    ]);
  });
});
