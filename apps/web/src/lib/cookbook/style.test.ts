import { describe, expect, it } from "vitest";
import { proseOf, styleFindings, styleMessages } from "./style";

const phrases = (text: string, locale: "en" | "es", options?: { emDashLimit?: number }) =>
  styleFindings(text, locale, options).map((f) => `${f.severity}:${f.phrase}`);

describe("style: machine-written phrasing", () => {
  it("fails the stock phrases in English and Spanish", () => {
    expect(phrases("Let's dive into the world of openers, a testament to careful design.", "en")).toEqual(
      expect.arrayContaining(["fail:Let's dive", "fail:a testament to"]),
    );
    expect(phrases("Sumérgete en el arte de la maquetación: la columna juega un papel crucial.", "es")).toEqual(
      expect.arrayContaining(["fail:Sumérgete", "fail:juega un papel crucial", "warn:el arte de"]),
    );
    expect(phrases("It’s not just a margin; it seamlessly carries the notes.", "en")).toEqual(
      expect.arrayContaining(["fail:It’s not just", "fail:seamlessly"]),
    );
  });

  it("only warns on words that can be fine in context", () => {
    const found = styleFindings("A bustling market, then a long journey north.", "en");
    expect(found.every((f) => f.severity === "warn")).toBe(true);
    expect(found.map((f) => f.phrase)).toEqual(expect.arrayContaining(["bustling", "journey"]));
  });

  it("leaves plain technical prose alone", () => {
    const plain = [
      "The band is a box element anchored to the bleed. The title sits level with the number,",
      "and the text starts on the same grid line in every chapter. Rotated tables take a landscape page.",
    ].join(" ");
    expect(styleFindings(plain, "en")).toEqual([]);
    expect(styleFindings("El título queda al nivel del número y el texto empieza en la misma línea.", "es")).toEqual([]);
  });

  it("ignores code, excerpts, tags and maths", () => {
    const mdx = [
      "```js\n// a seamless testament to delve\nconst x = 1;\n```",
      "Set `seamless: true` and <Excerpt region=\"answer\" />.",
      "{/* delve */}",
      "$$\\text{crucial}$$",
    ].join("\n\n");
    expect(proseOf(mdx)).not.toMatch(/seamless|delve|crucial/);
    expect(styleFindings(mdx, "en")).toEqual([]);
  });

  it("warns about em-dash-heavy prose, but not when counting is off", () => {
    const dashy = "One — two — three — four — five words and a few more words here.";
    expect(phrases(dashy, "en")).toEqual(expect.arrayContaining([expect.stringMatching(/^warn:\d+ em dashes/)]));
    expect(phrases(dashy, "en", { emDashLimit: 0 })).toEqual([]);
  });

  it("formats one message per phrase and file", () => {
    const { fails, warns } = styleMessages("en.mdx", "We delve here. We delve again. A vibrant page.", "en");
    expect(fails).toHaveLength(1);
    expect(fails[0]).toMatch(/^en\.mdx: reads machine-written \("delve"/);
    expect(warns).toHaveLength(1);
  });
});
