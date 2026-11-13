import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { appendToSections } from "@/lib/docs";
import { compileDocsMdx } from "@/lib/mdx/mdx";
import type { DocExampleCard } from "@/lib/cookbook/docExamples";
import { CookbookExamples, CookbookStrip, HeadingText } from "./CookbookExamples";

const card = (n: number): DocExampleCard => ({
  slug: `recipe-${n}`,
  number: n,
  title: `Recipe ${n}`,
  href: `/es/cookbook/recipe-${n}`,
  card480: n === 3 ? "" : `/cookbook/recipe-${n}/en/card.480.webp?v=abc`,
});

describe("CookbookStrip", () => {
  const html = renderToStaticMarkup(
    createElement(CookbookStrip, { recipes: [card(1), card(3)], label: "En el Recetario", section: "Recetas para Acabados", numberPrefix: "N.º" }),
  );

  it("is a named landmark of links, one per recipe, in the reader's locale", () => {
    expect(html).toMatch(/^<aside class="docs-cb-strip not-prose" aria-label="Recetas para Acabados">/);
    expect(html).toContain('<p class="docs-cb-kicker">En el Recetario</p>');
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).toContain('href="/es/cookbook/recipe-1"');
    expect(html).toContain("N.º 001");
    expect(html).toContain("Recipe 1");
  });

  it("loads the thumbnail lazily in a box sized before it arrives", () => {
    expect(html).toContain('src="/cookbook/recipe-1/en/card.480.webp?v=abc"');
    expect(html).toMatch(/<img[^>]*alt=""[^>]*width="480"[^>]*height="360"[^>]*loading="lazy"/);
    // A recipe not captured yet keeps the empty box and no image.
    expect(html.match(/<img /g)).toHaveLength(1);
  });

  it("renders nothing without recipes", () => {
    expect(renderToStaticMarkup(createElement(CookbookStrip, { recipes: [], label: "", section: "", numberPrefix: "" }))).toBe("");
  });
});

describe("CookbookExamples", () => {
  const recipes = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`recipe-${n}`, card(n)]));
  const html = renderToStaticMarkup(
    createElement(CookbookExamples, {
      id: "cookbook-examples",
      locale: "es",
      recipes,
      groups: [
        { id: "acabados", text: "Acabados", recipes: ["recipe-1"], more: 0 },
        { id: "el-contenedor-part", text: "El contenedor `:::part`", recipes: Object.keys(recipes).slice(1), more: 1, feature: { id: "part-dividers", label: "Portadillas" } },
      ],
      labels: {
        heading: "Ejemplos en el Recetario",
        headingLink: "Enlace a Ejemplos en el Recetario",
        lead: "Recetas.",
        numberPrefix: "N.º",
        more: (count, feature) => `${count} más con ${feature}`,
      },
    }),
  );

  it("heads a section the table of contents can link", () => {
    expect(html).toContain('<section aria-labelledby="cookbook-examples"');
    expect(html).toMatch(/<h2 id="cookbook-examples"[^>]*>.*Ejemplos en el Recetario<\/h2>/);
  });

  it("groups recipes under links to their sections, at most six each", () => {
    expect(html).toContain('<a href="#acabados">Acabados</a>');
    expect(html).toContain('<a href="#el-contenedor-part">El contenedor <code>:::part</code></a>');
    expect(html.match(/class="docs-cb-card"/g)).toHaveLength(1 + 6);
  });

  it("sends the rest to the Cookbook filtered by the section's feature", () => {
    expect(html).toContain('href="/es/cookbook?feat=part-dividers"');
    expect(html).toContain("1 más con Portadillas");
  });
});

describe("strips in a docs page", () => {
  it("renders where appendToSections puts them", async () => {
    const source = appendToSections("## Finishes\n\nText.\n\n## Die-cuts\n\nMore.\n", { finishes: '<CookbookStrip n="0" />' });
    const Strip = ({ n }: { n: string }) =>
      createElement(CookbookStrip, { recipes: [card(Number(n) + 1)], label: "In the Cookbook", section: "Cookbook recipes for Finishes", numberPrefix: "Nº" });
    const { content } = await compileDocsMdx(source, { CookbookStrip: Strip });
    const html = renderToStaticMarkup(content);
    expect(html.indexOf("docs-cb-strip")).toBeGreaterThan(html.indexOf("Text."));
    expect(html.indexOf("docs-cb-strip")).toBeLessThan(html.indexOf('id="die-cuts"'));
  });

  it("sets a heading's code spans as code", () => {
    expect(renderToStaticMarkup(createElement(HeadingText, { text: "The `snake_case` **key**" }))).toBe("The <code>snake_case</code> key");
  });
});
