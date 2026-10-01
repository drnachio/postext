import { describe, expect, it } from "vitest";
import { proseOf, styleFindings, styleMessages, textLength } from "./style";

const phrases = (text: string, locale: "en" | "es" | "zh", options?: { emDashLimit?: number }) =>
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

  it("reads Chinese: its dashes are not em-dash tells, its characters count as words", () => {
    // The 破折号 (——) and em dashes set against Han are Chinese punctuation.
    const zh = "他说——不，他没有说——只是看着我。又过了一会儿——大约一刻钟——他才走。";
    expect(styleFindings(zh, "en")).toEqual([]);
    const mixed = `The dash stays whole: ${zh} It is one mark of two ems — set as the font sets the pair.`;
    expect(phrases(mixed, "en")).toEqual([]);
    expect(textLength("此開卷第一回也。作者自云：因曾歷過一番夢幻之後")).toEqual({ words: 0, cjk: 21, total: 12 });
    expect(textLength("用iPhone拍照 and three words")).toEqual({ words: 4, cjk: 3, total: 6 });
    // Fullwidth letters and digits are words; Korean spaces its words.
    expect(textLength("ＡＢＣ１２３ 和 ＮＡＳＡ")).toEqual({ words: 2, cjk: 1, total: 3 });
    expect(textLength("第３版用ＩＳＯ纸")).toEqual({ words: 2, cjk: 4, total: 4 });
    expect(textLength("안녕하세요 세계 여러분")).toEqual({ words: 3, cjk: 0, total: 3 });
    expect(textLength("かな漢字")).toEqual({ words: 0, cjk: 4, total: 2 });
    expect(textLength("コーヒーを飲む")).toEqual({ words: 0, cjk: 7, total: 4 });
  });

  it("fails the stock phrases of Chinese prose, in both scripts", () => {
    expect(phrases("值得一提的是，这一版的行距更宽。众所周知，宋体用于正文。", "en")).toEqual(
      expect.arrayContaining(["fail:值得一提的是", "fail:众所周知"]),
    );
    expect(phrases("總而言之，眾所周知。", "es")).toEqual(expect.arrayContaining(["fail:總而言之", "fail:眾所周知"]));
    expect(phrases("在当今数字化时代，排版至关重要。", "en")).toEqual(
      expect.arrayContaining(["fail:在当今数字化时代", "warn:至关重要"]),
    );
    // Classical prose is left alone.
    expect(styleFindings("此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去。", "en")).toEqual([]);
    const { fails } = styleMessages("en.mdx", "值得一提的是，这一版更好。第二句。", "en");
    expect(fails[0]).toContain("“值得一提的是，这一版更好。”");
  });

  it("does not read a stock phrase across two Chinese words", () => {
    // 天赋 + 能力, the idiom 天衣无缝, 毫无 + 缝隙, 借助 + 力量, 辅助 + 力.
    for (const text of ["他的天赋能力很强。", "天衣无缝。", "字与字之间毫无缝隙。", "借助力量推开门。", "稟賦能力。", "辅助力臂。"]) {
      expect(styleFindings(text, "en")).toEqual([]);
    }
    expect(phrases("用人工智能赋能排版，无缝衔接，助力出版。", "en")).toEqual(
      expect.arrayContaining(["fail:赋能", "fail:无缝衔接", "warn:助力"]),
    );
    expect(phrases("無縫對接，賦能。", "es")).toEqual(expect.arrayContaining(["fail:無縫對接", "fail:賦能"]));
  });

  it("checks a Chinese write-up (zh.mdx) with the Chinese lists", () => {
    expect(phrases("值得注意的是，这是一站式方案，让我们深入探讨如何完美地实现它。", "zh")).toEqual(
      expect.arrayContaining(["fail:值得注意的是", "fail:一站式", "fail:让我们深入", "fail:深入探讨", "fail:完美地实现"]),
    );
    expect(phrases("它不仅能排版，更能导出 PDF。开启排版之旅。", "zh")).toEqual(
      expect.arrayContaining(["warn:不仅能排版，更", "fail:开启排版之旅"]),
    );
    // Plain technical Chinese, with its full-width punctuation and code, passes.
    const plain = [
      "每个元素锚定在物理页面上，并按奇偶页筛选，所以页码总在外侧边缘。",
      "`pages: 'body'` 让它们避开章首页——章首页改由页脚放一个页码。",
      "把 `main-color` 指向强调色，配置没有重新声明的默认值就都跟着它走。",
    ].join("");
    expect(styleFindings(plain, "zh")).toEqual([]);
  });

  it("formats one message per phrase and file", () => {
    const { fails, warns } = styleMessages("en.mdx", "We delve here. We delve again. A vibrant page.", "en");
    expect(fails).toHaveLength(1);
    expect(fails[0]).toMatch(/^en\.mdx: reads machine-written \("delve"/);
    expect(warns).toHaveLength(1);
  });
});
