import { describe, expect, it } from "vitest";
import { CJK_SANS, CJK_SERIF, JA_SANS, JA_SERIF, cjkChars, cjkFamily } from "./og-fonts";
import { titleClusters } from "./og-image";

describe("social card faces", () => {
  it("subsets kana, ー and half-width katakana along with Han", () => {
    expect(cjkChars("ルビ・ふりがな ｶﾅ")).toBe([..."ルビ・ふりがなｶﾅ"].sort().join(""));
    expect(cjkChars("ショート、長音")).toBe([..."ショート、長音"].sort().join(""));
    expect(cjkChars("Running heads")).toBe("");
  });

  it("draws a text with kana in the Japanese faces, kanji alone in the Chinese ones", () => {
    expect(cjkFamily("振り仮名", "serif")).toBe(JA_SERIF);
    expect(cjkFamily("ｶﾅ", "sans")).toBe(JA_SANS);
    expect(cjkFamily("带书眉的图书页面", "serif")).toBe(CJK_SERIF);
    expect(cjkFamily("Cookbook · postext.dev", "sans")).toBe(CJK_SANS);
    expect(cjkFamily(undefined, "serif")).toBe(CJK_SERIF);
  });
});

describe("social card titles", () => {
  const words = (title: string) => titleClusters(title).map((cluster) => cluster.map((piece) => piece.word).join(""));

  it("wraps Japanese at any character but before small kana, ー and closing marks", () => {
    expect(words("ショートカット")).toEqual(["ショー", "ト", "カッ", "ト"]);
    expect(words("「ルビ」の位置")).toEqual(["「ル", "ビ」", "の", "位", "置"]);
    expect(words("人々")).toEqual(["人々"]);
  });

  it("keeps a closing mark with the letter before an <em> ends", () => {
    const clusters = titleClusters("振り仮名と<em>熟語ルビ</em>、ショート");
    const ruby = clusters.find((cluster) => cluster.some((piece) => piece.word === "、"))!;
    expect(ruby.map((piece) => [piece.word, piece.em])).toEqual([["ビ", true], ["、", false]]);
  });

  it("keeps Latin words whole and brackets on the letters they enclose", () => {
    expect(words("Furigana over kanji (振り仮名)")).toEqual(["Furigana", "over", "kanji", "(振", "り", "仮", "名)"]);
    expect(titleClusters("A <em>table</em>, split").flat().map((piece) => piece.word)).toEqual(["A", "table", ",", "split"]);
  });
});
