import { describe, expect, it } from "vitest";
import { PHRASE_TIER, findPhrase, foldQuery, phraseTier, rankByPhrase } from "./searchPhrase.ts";

const fields = (sectionTitle: string, body = "", docTitle = "Doc", breadcrumb = "") => ({
  sectionTitle,
  docTitle,
  breadcrumb,
  body,
});

describe("foldQuery", () => {
  it("lowercases, strips accents and collapses punctuation", () => {
    expect(foldQuery("  El Lazarillo,  de Tormés! ")).toBe("el lazarillo de tormes");
    expect(foldQuery("—")).toBe("");
  });
});

describe("findPhrase", () => {
  it("maps the match back to the original text", () => {
    const text = "Véase «La vida de Lazarillo de Tormes», 1554.";
    const range = findPhrase(text, foldQuery("lazarillo de tormes"))!;
    expect(text.slice(...range)).toBe("Lazarillo de Tormes");
  });

  it("matches across punctuation and repeated spaces", () => {
    const text = "Knuth–Plass  line breaking";
    expect(text.slice(...findPhrase(text, foldQuery("knuth plass line"))!)).toBe("Knuth–Plass  line");
  });

  it("requires the phrase to start a word, lets the last word be a prefix", () => {
    expect(findPhrase("the columns balance", foldQuery("olumns balance"))).toBeNull();
    const text = "Don Quijote de la Mancha";
    expect(text.slice(...findPhrase(text, foldQuery("don quij"))!)).toBe("Don Quij");
  });

  it("does not match the words in another order", () => {
    expect(findPhrase("Tormes, Lazarillo de", foldQuery("lazarillo de tormes"))).toBeNull();
  });
});

describe("phraseTier", () => {
  const q = foldQuery("column balancing");

  it("tiers exact title, title, body, none", () => {
    expect(phraseTier(fields("Column balancing"), q)).toBe(PHRASE_TIER.titleExact);
    expect(phraseTier(fields("Column balancing rules"), q)).toBe(PHRASE_TIER.title);
    expect(phraseTier(fields("Layout", "see column balancing below"), q)).toBe(PHRASE_TIER.text);
    expect(phraseTier(fields("Balancing", "every column"), q)).toBe(PHRASE_TIER.none);
  });

  it("gives a one-word query only the exact-title tier", () => {
    const one = foldQuery("Footnotes");
    expect(phraseTier(fields("Footnotes"), one)).toBe(PHRASE_TIER.titleExact);
    expect(phraseTier(fields("Footnotes and endnotes", "footnotes"), one)).toBe(PHRASE_TIER.none);
  });
});

describe("rankByPhrase", () => {
  it("puts literal matches above higher-scoring scattered ones", () => {
    const hits = [
      { id: "scattered", tier: 0, score: 40 },
      { id: "body", tier: 1, score: 5 },
      { id: "title", tier: 2, score: 3 },
      { id: "body-strong", tier: 1, score: 9 },
    ];
    expect(rankByPhrase(hits).map((h) => h.id)).toEqual(["title", "body-strong", "body", "scattered"]);
  });
});
