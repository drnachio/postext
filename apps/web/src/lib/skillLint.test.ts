import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** The postext-port skill's lint on a small Chinese project. Python 3 runs the
 *  script; the glyph-coverage check also needs fontTools (and brotli for the
 *  woff2 files), and is skipped where they are not installed. */
const REPO = path.join(__dirname, "../../../..");
const LINT = path.join(REPO, "plugins/postext/skills/postext-port/scripts/lint_project.py");
const FONT = path.join(REPO, "apps/web/public/presets/hongloumeng/fonts/NotoSerifTC-Regular.woff2");

const python = spawnSync("python3", ["--version"]).status === 0;
const fontTools = python && existsSync(FONT) && spawnSync("python3", ["-c", "import fontTools, brotli"]).status === 0;

const CHAPTER = [
  "# 第一回　甄士隱夢幻識通靈",
  "",
  "此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去，而借「通靈」之說，撰此《石頭記》一書也。",
  "",
].join("\n");

function project(config: object, text = CHAPTER, withFont = false): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "postext-lint-"));
  mkdirSync(path.join(dir, "chapters/zh-Hant"), { recursive: true });
  writeFileSync(path.join(dir, "chapters/zh-Hant/01-hui.md"), text);
  const fonts = [];
  if (withFont) {
    mkdirSync(path.join(dir, "fonts"));
    cpSync(FONT, path.join(dir, "fonts/NotoSerifTC-Regular.woff2"));
    fonts.push({ name: "Noto Serif TC", variants: [{ weight: 400, style: "normal", file: "fonts/NotoSerifTC-Regular.woff2" }] });
  }
  const manifest = {
    version: 2, configVersion: 9, id: "t", name: "T", locale: "zh-Hant",
    chapters: { "zh-Hant": [{ title: "第一回", file: "chapters/zh-Hant/01-hui.md" }] },
    config: { header: { elements: [] }, layout: { layoutType: "single" }, ...config },
    resources: [], fonts,
  };
  writeFileSync(path.join(dir, "preset.json"), JSON.stringify(manifest));
  return dir;
}

function lint(dir: string): { out: string; status: number | null } {
  const r = spawnSync("python3", [LINT, dir, "--quiet"], { encoding: "utf8" });
  return { out: r.stdout + r.stderr, status: r.status };
}

describe.skipIf(!python)("postext-port lint on Chinese text", () => {
  it("flags Chinese set in the default Latin body face", () => {
    const { out, status } = lint(project({ locale: "zh-Hant-TW" }));
    expect(out).toMatch(/ERROR fonts \(zh-Hant\): \d+ CJK characters .* set in EB Garamond, which has none/);
    expect(status).toBe(1);
  });

  it("asks for the script in the locale and ASCII markup", () => {
    const text = CHAPTER + "\n：：：callout\n";
    const { out } = lint(project({ locale: "zh", bodyText: { fontFamily: "Noto Serif TC" }, headings: { fontFamily: "Noto Serif TC", levels: [{ level: 1, breakBefore: { enabled: true } }] } }, text));
    expect(out).toContain("config.locale 'zh' names no script");
    expect(out).toContain("：：： typed with an input method prints as text (fullwidthMarkup): type :::");
  });

  it("knows the Japanese numbering formats and their tokens", () => {
    const fence = (format: string) => `${CHAPTER}\n:::numbering{format=${format}}\n`;
    for (const format of ["japanese-informal", "japanese-formal", "hiragana", "katakana", "hiragana-iroha", "katakana-iroha", "あ", "イ", "壱"]) {
      expect(lint(project({ locale: "zh-Hant" }, fence(format))).out, format).not.toContain("numbering format");
    }
    expect(lint(project({ locale: "zh-Hant" }, fence("japanese"))).out).toContain("numbering format 'japanese' is invalid");
  });

  it("counts Chinese in the family that sets it: paragraph and heading styles, not heading attributes", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "postext-lint-"));
    mkdirSync(path.join(dir, "chapters"));
    const chapter = (extra: string) => [
      '# The Stone {zh="石頭記" subtitle="甄士隱夢幻識通靈"}',
      "",
      "An English paragraph.",
      "",
      ':::paragraphs{style="zh"}',
      "滿紙荒唐言，一把辛酸淚。",
      ":::",
      "",
      '## 回目{style="cn"}',
      "",
      extra,
    ].join("\n");
    const manifest = {
      version: 2, configVersion: 9, id: "t", name: "T", locale: "en",
      chapters: { en: [{ title: "One", file: "chapters/01.md" }] },
      config: {
        locale: "en", header: { elements: [] }, layout: { layoutType: "single" },
        bodyText: { fontFamily: "EB Garamond" },
        headings: { fontFamily: "EB Garamond", levels: [{ level: 1, breakBefore: { enabled: true } }] },
        paragraphStyles: [{ id: "zh", name: "Chinese", fontFamily: "Noto Serif TC" }],
        headingStyles: [{ id: "cn", fontFamily: "Noto Serif TC" }],
      },
      resources: [], fonts: [],
    };
    writeFileSync(path.join(dir, "preset.json"), JSON.stringify(manifest));

    writeFileSync(path.join(dir, "chapters/01.md"), chapter("More English."));
    const clean = lint(dir);
    expect(clean.out).not.toContain("EB Garamond");
    expect(clean.out).not.toContain("does not parse as attributes");
    expect(clean.out).toMatch(/Noto Serif TC sets 14 CJK characters but is not bundled/);
    expect(clean.status).toBe(0);

    writeFileSync(path.join(dir, "chapters/01.md"), chapter("The title page reads 紅樓夢."));
    const stray = lint(dir);
    expect(stray.out).toMatch(/ERROR fonts \(en\): 3 CJK characters \(夢樓紅…\) are set in EB Garamond, which has none: set bodyText\.fontFamily/);
    expect(stray.status).toBe(1);
  });

  it.skipIf(!fontTools)("flags the characters a bundled face has no glyph for, and passes when it has them", () => {
    const config = {
      locale: "zh-Hant-TW",
      bodyText: { fontFamily: "Noto Serif TC", boldColor: { hex: "#000000", model: "hex" } },
      headings: { fontFamily: "Noto Serif TC", levels: [{ level: 1, breakBefore: { enabled: true, parity: "odd" } }] },
    };
    const bad = lint(project(config, CHAPTER + "\n한국어 𪚥\n", true));
    expect(bad.out).toMatch(/ERROR fonts \(zh-Hant\): Noto Serif TC 400 .* has no glyph for 4 of the \d+ CJK characters it sets: 국어한𪚥/);
    expect(bad.status).toBe(1);
    const good = lint(project(config, CHAPTER, true));
    expect(good.out).toContain("0 error(s), 0 warning(s)");
    expect(good.status).toBe(0);
  });
});

describe("postext-port command lines", () => {
  it("gives every documented fonts.py subset command the --out it requires", () => {
    const skill = path.join(REPO, "plugins/postext/skills/postext-port");
    const files = ["SKILL.md", ...readdirSync(path.join(skill, "references")).map((f) => `references/${f}`)];
    let seen = 0;
    for (const file of files) {
      // A code span may wrap onto the next line in these files.
      const text = readFileSync(path.join(skill, file), "utf8").replace(/\n\s*/g, " ");
      for (const m of text.matchAll(/`fonts\.py subset ([^`]+)`/g)) {
        seen++;
        expect(m[1], `${file}: ${m[0]}`).toMatch(/(^| )--out /);
      }
    }
    expect(seen).toBeGreaterThan(1);
  });
});

describe.skipIf(!python)("postext-port lint on the Folio settings", () => {
  const fonts = { bodyText: { fontFamily: "Noto Serif TC" }, headings: { fontFamily: "Noto Serif TC", levels: [{ level: 1, breakBefore: { enabled: true } }] } };

  it("checks keys, values, ranges and colours of config.folio", () => {
    const { out } = lint(project({
      ...fonts,
      folio: {
        tilt: 80,
        camera: 1,
        paper: { type: "glossy", shade: "#fff" },
        binding: { type: "saddleStitch", spineImage: "spine" },
        lighting: { shadows: "yes" },
      },
    }));
    expect(out).toContain("config.folio.paper.type: 'glossy' is not one of");
    expect(out).toContain('config.folio.paper.shade: a colour is {"hex": "#rrggbb", "model": "hex"}');
    expect(out).toContain("config.folio.lighting.shadows: must be true or false");
    expect(out).toContain("config.folio.tilt: 80 is clamped to 0–70");
    expect(out).toContain("config.folio.camera: unknown key (ignored)");
    expect(out).toContain("config.folio.binding.spineImage: ignored: a saddle-stitched book has no flat spine");
  });

  it("asks for the spine image to be a resource", () => {
    const { out } = lint(project({ ...fonts, folio: { binding: { type: "hardcover", spineImage: "spine" } } }));
    expect(out).toContain("config.folio.binding.spineImage: 'spine' is not a resource id");
  });

  it("passes a well-formed folio", () => {
    const { out } = lint(project({
      ...fonts,
      folio: { paper: { type: "bible", grammage: 40, shade: { hex: "#f2e9d4", model: "hex" } }, binding: { type: "sewn", cover: "pages" }, surface: { type: "walnut" } },
    }));
    expect(out).not.toContain("config.folio");
  });
});

describe.skipIf(!python)("postext-port lint on line numbers", () => {
  const fonts = { bodyText: { fontFamily: "Noto Serif TC" }, headings: { fontFamily: "Noto Serif TC", levels: [{ level: 1, breakBefore: { enabled: true } }] } };
  const poem = CHAPTER + "\n:::verse{lineStart=x interval=0}\n滿紙荒唐言，\n一把辛酸淚！\n:::\n\n:::numbering{lines=-1}\n";

  it("checks lineNumbers values, the vertical case and the per-block attributes", () => {
    const { out } = lint(project({
      ...fonts,
      layout: { layoutType: "single", writingMode: "vertical-rl" },
      lineNumbers: { enabled: true, count: "prose", interval: 0, every: 5 },
      paragraphStyles: [{ id: "verse", lineNumbers: "yes" }],
    }, poem));
    expect(out).toContain("lineNumbers.count 'prose' is not one of ['all', 'verse']");
    expect(out).toContain("lineNumbers.interval 0 is not a whole number >= 1");
    expect(out).toContain("lineNumbers.every is not a lineNumbers key (ignored)");
    expect(out).toContain("lineNumbers.enabled: vertical documents get no line numbers (lineNumbersUnsupported)");
    expect(out).toContain("paragraphStyles[0].lineNumbers must be true or false");
    expect(out).toContain("verse lineStart 'x' is not a whole number >= 0");
    expect(out).toContain("verse interval '0' is not a whole number >= 1");
    expect(out).toContain("numbering lines '-1' is not a whole number >= 0");
  });

  it("passes well-formed line numbers", () => {
    const text = CHAPTER + "\n:::verse{lineStart=37 interval=5}\n滿紙荒唐言，\n一把辛酸淚！\n:::\n\n:::numbering{lines=1}\n";
    const { out } = lint(project({ ...fonts, lineNumbers: { enabled: true, count: "all", restart: "page", multiColumn: "gutter" } }, text));
    expect(out).not.toMatch(/lineNumbers|verse lineStart|verse interval|numbering lines/);
  });
});

describe.skipIf(!python)("postext-port lint on tab stops", () => {
  const fonts = { bodyText: { fontFamily: "Noto Serif TC" }, headings: { fontFamily: "Noto Serif TC", levels: [{ level: 1, breakBefore: { enabled: true } }] } };
  const mm = (value: number) => ({ value, unit: "mm" });

  it("checks the stops, the :tab attributes and tab characters no style sets", () => {
    const text = CHAPTER + "\n湯 :tab{at=wide align=right size=2} 八元\n\n茶\t三元\n";
    const { out } = lint(project({
      ...fonts,
      paragraphStyles: [{ id: "menu", tabStops: [{ position: "far", align: "right", leaders: "." }, "end"], tabInterval: mm(0) }],
      calloutStyles: [{ id: "box", body: { tabStops: { position: "end" } } }],
    }, text));
    expect(out).toContain("paragraphStyles[0].tabStops[0].position 'far' is no length, 'end' or percentage: the stop is left out");
    expect(out).toContain("paragraphStyles[0].tabStops[0].align 'right' is not one of ['center', 'decimal', 'end', 'start']: read as 'start'");
    expect(out).toContain("paragraphStyles[0].tabStops[0].leaders is not a tab stop key (leader?) (ignored)");
    expect(out).toContain("paragraphStyles[0].tabStops[1] must be an object");
    expect(out).toContain("paragraphStyles[0].tabInterval must be a length above 0");
    expect(out).toContain("calloutStyles[0].body.tabStops must be a list of stops");
    expect(out).toContain(":tab{size=…} is not read");
    expect(out).toContain(":tab{at=wide} is no length, 'end' or percentage");
    expect(out).toContain(":tab{align=right} is not one of");
    expect(lint(project(fonts, text)).out).toContain("a tab character inside a line is a word space unless the paragraph's style sets tabStops");
  });

  it("warns that a :tab in vertical text is a word space", () => {
    const { out } = lint(project({ ...fonts, layout: { layoutType: "single", writingMode: "vertical-rl" } }, CHAPTER + "\n湯 :tab 八元\n"));
    expect(out).toContain(":tab in vertical text is set as a word space (tabInVerticalText)");
  });

  it("passes well-formed stops and leaves 3:table alone", () => {
    const text = CHAPTER + "\n湯 :tab 八元\n\n茶\t三元 :tab{at=120mm align=end leader=\". \" gap=2pt}\n\n3:table\n";
    const { out } = lint(project({
      ...fonts,
      bodyText: { ...fonts.bodyText, tabInterval: mm(12.5) },
      paragraphStyles: [{ id: "menu", tabStops: [{ position: mm(40) }, { position: "end", align: "end", leader: "rule", leaderGap: mm(1) }, { position: "75%", align: "decimal", decimalChar: "," }] }],
    }, text));
    expect(out).not.toMatch(/tabStops|tabInterval|:tab|tab character/);
  });
});

/** An Arabic chapter with a Latin marker word, in a one-locale project. */
function arabicProject(config: object, text?: string, fonts: object[] = []): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "postext-lint-ar-"));
  mkdirSync(path.join(dir, "chapters/ar"), { recursive: true });
  writeFileSync(path.join(dir, "chapters/ar/01.md"), text ?? [
    "# الفصل الأول",
    "",
    "كان في قديم الزمان ملك من ملوك ساسان، وكان له ولدان. قرأ الكتاب CHECK سنة ١٨٣٥ في بولاق.",
    "",
  ].join("\n"));
  const manifest = {
    version: 2, configVersion: 9, id: "t", name: "T", locale: "ar",
    chapters: { ar: [{ title: "الفصل الأول", file: "chapters/ar/01.md" }] },
    config: { header: { elements: [] }, layout: { layoutType: "single" }, ...config },
    resources: [], fonts,
  };
  writeFileSync(path.join(dir, "preset.json"), JSON.stringify(manifest));
  return dir;
}

describe.skipIf(!python)("postext-port lint on Arabic text", () => {
  const faces = { bodyText: { fontFamily: "Amiri" }, headings: { fontFamily: "Amiri" } };

  it("asks for an Arabic locale on a mostly Arabic book", () => {
    const { out, status } = lint(arabicProject({ locale: "en", ...faces }));
    expect(out).toMatch(/ERROR config \(ar\): the chapters are mostly Arabic \(\d+ letters\) but config.locale is 'en'/);
    expect(status).toBe(1);
    expect(lint(arabicProject({ locale: "ar-EG", ...faces })).out).not.toContain("mostly Arabic");
  });

  it("flags Arabic set in the default Latin faces, by the setting that sets it", () => {
    const { out } = lint(arabicProject({ locale: "ar" }));
    expect(out).toMatch(/ERROR fonts \(ar\): \d+ Arabic characters .* set in EB Garamond, which has none: set bodyText.fontFamily to an Arabic face/);
    expect(out).toMatch(/set in Open Sans, which has none: set headings.fontFamily/);
  });

  it("warns on a left-to-right direction, forced hyphenation, italic emphasis and tracked styles", () => {
    const { out } = lint(arabicProject({
      locale: "ar", direction: "ltr",
      bodyText: { fontFamily: "Amiri", emphasis: "italic", hyphenation: { enabled: true } },
      headings: { fontFamily: "Amiri", levels: [{ level: 1, letterSpacing: { value: 0.1, unit: "em" } }] },
    }));
    expect(out).toContain("config.direction 'ltr' in an Arabic-script book");
    expect(out).toContain("bodyText.hyphenation.enabled is on in an Arabic book");
    expect(out).toContain("bodyText.emphasis 'italic': Arabic letters are never slanted");
    expect(out).toContain("letterSpacing on headings.levels[1]");
  });

  it("leaves a Latin book quoting Arabic, with Latin hyphenation, alone", () => {
    const text = "# Notes\n\nThe word كتاب means book, and the Nights call it ألف ليلة وليلة in a longer English paragraph about it.\n";
    const { out } = lint(arabicProject({ locale: "en", ...faces, bodyText: { fontFamily: "Amiri", hyphenation: { enabled: true, locale: "en-us" } } }, text));
    expect(out).not.toContain("mostly Arabic");
    expect(out).not.toContain("hyphenation.enabled is on");
  });

  it("knows the :::verse block and the {dir} attribute", () => {
    const text = [
      "# الفصل الأول",
      "",
      "فأنشد يقول:",
      "",
      ":::verse{gap=2em}",
      "يا حرقة الدهر كفي || إن لم تكفي فعفي",
      ":::",
      "",
      ":::paragraphs{dir=ltr}",
      "An English quotation, set left to right.",
      ":::",
      "",
    ].join("\n");
    const { out } = lint(arabicProject({ locale: "ar", ...faces }, text));
    expect(out).not.toMatch(/unknown directive|unknownDirective|verse/i);
  });
});

/** A Japanese chapter (kana and kanji, Latin marker word) in a one-locale project. */
const JA_CHAPTER = [
  "# 上　先生と私",
  "",
  "私はその人を常に先生と呼んでいた。だからここでもただ先生と書くだけで本名は打ち明けない。MARK これは世間を憚かる遠慮というよりも、その方が私にとって自然だからである。",
  "",
].join("\n");

function japaneseProject(config: object, text = JA_CHAPTER): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "postext-lint-ja-"));
  mkdirSync(path.join(dir, "chapters/ja"), { recursive: true });
  writeFileSync(path.join(dir, "chapters/ja/01.md"), text);
  const manifest = {
    version: 2, configVersion: 9, id: "t", name: "T",
    chapters: { ja: [{ title: "上", file: "chapters/ja/01.md" }] },
    config: { header: { elements: [] }, layout: { layoutType: "single" }, ...config },
    resources: [], fonts: [],
  };
  writeFileSync(path.join(dir, "preset.json"), JSON.stringify(manifest));
  return dir;
}

describe.skipIf(!python)("postext-port lint on Japanese text", () => {
  const faces = { bodyText: { fontFamily: "Noto Serif JP" }, headings: { fontFamily: "Noto Sans JP", levels: [{ level: 1, breakBefore: { enabled: true } }] } };

  it("calls a kana text tagged Chinese an error and asks for ja", () => {
    for (const locale of ["zh-Hans", "zh-Hant-TW", "zh"]) {
      const { out, status } = lint(japaneseProject({ locale, ...faces }));
      expect(out, locale).toMatch(/ERROR config \(ja\): the chapters hold \d+ kana, so they are Japanese, but config.locale is 'zh[^']*': .*set 'ja'/);
      expect(status, locale).toBe(1);
    }
  });

  it("suggests ja for untagged kana and refuses the country code jp", () => {
    const untagged = lint(japaneseProject({ ...faces })).out;
    expect(untagged).toMatch(/WARN  config \(ja\): the chapters hold \d+ kana, so they are Japanese, but config.locale is not set: set 'ja'/);
    expect(untagged).not.toContain("'zh-Hans' or 'zh-Hant'");
    expect(lint(japaneseProject({ locale: "jp", ...faces })).out).toContain("'jp' is Japan's country code, not a language; Japanese is 'ja'");
    expect(lint(japaneseProject({ locale: "en", ...faces })).out).toMatch(/the chapters are mostly Japanese \(\d+ kana, \d+ kanji\) but config.locale is 'en'/);
    for (const locale of ["ja", "ja-JP"]) {
      expect(lint(japaneseProject({ locale, ...faces })).out, locale).not.toMatch(/config.locale|kana, so they are Japanese/);
    }
  });

  it("keeps the Chinese advice for a Chinese text quoting a little kana", () => {
    const text = CHAPTER + "\n日本人稱之為ひらがな，又有カタカナ。\n";
    const zh = lint(project({ locale: "zh-Hant-TW", bodyText: { fontFamily: "Noto Serif TC" }, headings: { fontFamily: "Noto Serif TC" } }, text)).out;
    expect(zh).not.toMatch(/Japanese|'ja'/);
    expect(lint(project({}, text)).out).toContain("set 'zh-Hans' or 'zh-Hant'");
  });

  it("points kana set in a Latin face to Japanese faces, and warns on a Chinese build", () => {
    const latin = lint(japaneseProject({ locale: "ja" })).out;
    expect(latin).toMatch(/ERROR fonts \(ja\): \d+ CJK characters .* set in EB Garamond, which has none: set bodyText.fontFamily to a Japanese face \(Noto Serif JP/);
    const chinese = lint(japaneseProject({ locale: "ja", bodyText: { fontFamily: "Noto Serif SC" }, headings: { fontFamily: "Noto Sans JP" } })).out;
    expect(chinese).toContain("Noto Serif SC sets kana (Japanese text): a Chinese build draws its kanji in Chinese forms");
    expect(chinese).not.toContain("Noto Sans JP sets kana");
  });

  it("flags Aozora Bunko notation left in a chapter", () => {
    const text = [
      "# 一",
      "",
      "私《わたくし》は｜麦藁帽《むぎわらぼう》を被った。いよ／＼です。",
      "",
      "自然だからである。［＃「自然」に傍点］※［＃「てへん＋劣」、第3水準1-84-77］",
      "",
      "《石頭記》と{私|わたくし}は書名と読みです。",
      "",
    ].join("\n");
    const { out, status } = lint(japaneseProject({ locale: "ja", ...faces }, text));
    expect(out).toContain("ERROR chapters/ja/01.md:3: Aozora reading 《わたくし》 prints as text: write it as {base|reading}");
    expect(out).toContain("ERROR chapters/ja/01.md:3: Aozora reading ｜麦藁帽《むぎわらぼう》 prints as text");
    expect(out).toContain("WARN  chapters/ja/01.md:3: ／＼ after kana is Aozora's くの字点: write 〳〵");
    expect(out).toContain("ERROR chapters/ja/01.md:5: Aozora note ［＃「自然」に傍点］ prints as text");
    expect(out).toContain("ERROR chapters/ja/01.md:5: Aozora note ※［＃「てへん＋劣」、第3水準1-84-");
    expect(out).not.toContain("01.md:7");
    expect(status).toBe(1);
  });

  it("asks a Japanese index for readings", () => {
    const text = JA_CHAPTER + [
      "",
      "先生は:index[鎌倉]にいた。:index[{東京|とう|きょう}]から来た。:index[海]{yomi=\"うみ\"}と:index[漱石]{reading=\"そうせき\"}。",
      "",
      ":index{term=\"作家!鷗外\" yomi=\"おうがい\"}:index[ことば]",
      "",
      "# 索引",
      "",
      ":::index",
      "",
    ].join("\n");
    const ja = lint(japaneseProject({ locale: "ja", ...faces }, text)).out;
    expect(ja).toMatch(/WARN  chapters\/ja\/01\.md:5: 2 entries of the main index hold kanji and have no reading \((鎌倉、作家|作家、鎌倉)\)/);
    expect(ja).toContain("(indexReadingMissing)");
    expect(lint(japaneseProject({ locale: "zh-Hans", ...faces }, text)).out).not.toContain("indexReadingMissing");
  });

  it("warns on Chinese settings in a Japanese book", () => {
    const { out } = lint(japaneseProject({
      locale: "ja", ...faces,
      layout: { layoutType: "single", writingMode: "vertical-rl" }, page: { binding: "left" },
      cjk: { region: "mainland", lineBreak: "gb", emphasis: "italic" },
    }));
    expect(out).toContain("cjk.region 'mainland' sets this Japanese book with that Chinese region's rules");
    expect(out).toContain("cjk.lineBreak 'gb' is a Chinese level");
    expect(out).toContain("cjk.emphasis 'italic' slants kana and kanji");
    expect(out).toContain("page.binding 'left' in a vertical Japanese book");
    const clean = lint(japaneseProject({ locale: "ja", ...faces, cjk: { lineBreak: "ja-strict", region: "japan" } })).out;
    expect(clean).not.toMatch(/cjk\.|page\.binding/);
  });

  // fonts.py needs fontTools to import.
  it.skipIf(spawnSync("python3", ["-c", "import fontTools"]).status !== 0)("subsets kana with the kana range", () => {
    const r = spawnSync("python3", ["-c", [
      "import sys; sys.path.insert(0, sys.argv[1]); import fonts",
      "cps = {c for lo, hi in fonts.RANGES['kana'] for c in range(lo, hi + 1)}",
      "print(all(ord(c) in cps for c in 'あっゃアッヵヶㇰｶﾞー・〳〵〝〟―…'))",
    ].join("\n"), path.dirname(LINT)], { encoding: "utf8" });
    expect(r.stdout.trim() || r.stderr).toBe("True");
  });
});

/** A comic project: one chapter per language, picture resources with
 *  anchors (no files: the lint only reports them missing when `file` is set). */
function comicProject(config: object, chapters: Record<string, string>, resources?: object[], fonts: object[] = []): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "postext-lint-comic-"));
  const specs: Record<string, object[]> = {};
  for (const [lang, text] of Object.entries(chapters)) {
    mkdirSync(path.join(dir, "chapters", lang), { recursive: true });
    writeFileSync(path.join(dir, "chapters", lang, "01.md"), text);
    specs[lang] = [{ title: "One", file: `chapters/${lang}/01.md` }];
  }
  const pictures = resources ?? ["p1", "p2", "p3"].map((id) => ({
    id, typeId: "figure", kind: "bitmap", altText: id,
    safeArea: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    anchors: [{ id: "ana", x: 0.3, y: 0.5, face: { x: 0.2, y: 0.3, width: 0.2, height: 0.2 } }, { id: "ben", x: 0.7, y: 0.5 }],
  }));
  const manifest = {
    version: 2, configVersion: 9, id: "t", name: "T", locale: Object.keys(chapters)[0],
    chapters: specs,
    config: { header: { elements: [] }, layout: { layoutType: "single" }, locale: "en", ...config },
    resources: pictures, fonts,
  };
  writeFileSync(path.join(dir, "preset.json"), JSON.stringify(manifest));
  return dir;
}

const COMIC = [
  ':::page{split="30 [55 | *] / *"}',
  "::panel{art=p1}",
  "caption: Porthcove, the night of the storm.",
  "ana: Did you hear that?",
  "ben{whisper}: It's nothing.",
  "  Go back to sleep.",
  "::panel{art=p2 focus=\"30% 40%\"}",
  'sfx{at="62% 40%" rotate=-8}: KRAK',
  "::panel{art=p3 bleed=\"bottom end\"}",
  "ana{thought at=top-start}: Nothing, he says…\\",
  "  Nothing.",
  ":::",
  "",
].join("\n");

function lintAll(dir: string): { out: string; status: number | null } {
  const r = spawnSync("python3", [LINT, dir], { encoding: "utf8" });
  return { out: r.stdout + r.stderr, status: r.status };
}

describe.skipIf(!python)("postext-port lint on comics", () => {
  const letters = { comics: { lettering: { fontSize: { value: 9, unit: "pt" } } } };

  it("reads a well-formed comic page without errors", () => {
    const { out, status } = lint(comicProject(letters, { en: COMIC }));
    expect(out).not.toMatch(/is not a Postext container|comicSplit|comicPanelCount|comicStray|comicUnknown|panel attribute/);
    expect(out).toContain("'Comic Neue', the lettering face (comics.lettering.fontFamily), is not bundled");
    expect(out).toContain("'Bangers', the sound-effect face");
    expect(status).toBe(0);
  });

  it("checks the split grammar and the panel count", () => {
    const mixed = lint(comicProject(letters, { en: COMIC.replace('split="30 [55 | *] / *"', 'split="30 / 20 | *"') }));
    expect(mixed.out).toMatch(/ERROR chapters\/en\/01\.md:1: split="30 \/ 20 \| \*" cannot be read as written: a list mixes "\/" and "\|"/);
    expect(mixed.status).toBe(1);
    const sameAxis = lint(comicProject(letters, { en: COMIC.replace('split="30 [55 | *] / *"', 'split="30 [10 / 20] / *"') })).out;
    expect(sameAxis).toContain("a bracketed list splits its cell on the other axis");
    const over = lint(comicProject(letters, { en: COMIC.replace('split="30 [55 | *] / *"', 'split="70 [55 | 60] / *"') })).out;
    expect(over).toContain("the sizes add up to 115 %, scaled down to fit (comicSplitOverflow)");
    const count = lint(comicProject(letters, { en: COMIC.replace('split="30 [55 | *] / *"', 'split="30 / 30 / 20 / *"') })).out;
    expect(count).toContain("3 panels for 4 cells of the split: the last 1 cells stay empty (comicPanelCount)");
    const slant = lint(comicProject(letters, { en: COMIC.replace('split="30 [55 | *] / *"', 'split="* [40~55 | *] / 35"') })).out;
    expect(slant).not.toMatch(/split=.*cannot be read/);
  });

  it("checks panels, script lines and styles", () => {
    const text = [
      ':::page{split="* / *" style=clean spread=yes}',
      "stray words before any panel",
      "::panel{art=nope zoom=2}",
      "ana{yell}: Hey!",
      'ben{at="left" mode=sideways}: Here.',
      "sfx{vertical size=2}: ドン",
      "::panel{art=p1 inset=\"10 10\" bg=pink}",
      "no key here",
      ":::",
      "",
      "::panel{art=p2}",
      "",
    ].join("\n");
    const { out, status } = lint(comicProject(letters, { en: text }));
    expect(out).toContain("panel style 'clean' is not in comics.panelStyles");
    expect(out).toContain("text before the first ::panel is lettered as a caption of panel 1 (comicStrayText)");
    expect(out).toContain("art='nope' is not a resource: the panel is set empty (comicUnknownArt)");
    expect(out).toContain("::panel attribute 'zoom' is ignored");
    expect(out).toContain("{yell} names no balloon style (comicUnknownBalloonStyle)");
    expect(out).toContain("at='left' is neither");
    expect(out).toContain("mode='sideways' is ignored (vertical, horizontal)");
    expect(out).not.toContain("{vertical} names no balloon style");
    expect(out).toContain("inset='10 10' is not");
    expect(out).toContain("bg='pink' is neither #hex");
    expect(out).toContain("not a script line (key: text)");
    expect(out).toContain("::panel outside a :::page or :::strip block prints as text");
    expect(status).toBe(1);
  });

  it("knows strips and their attributes, and flags an unclosed block", () => {
    const strip = [':::strip{span=page placement=top aspect=4/1 height=40mm}', "::panel{art=p1}", "ana: Morning!", "::panel{art=p2}", ":::", ""].join("\n");
    expect(lint(comicProject(letters, { en: strip })).out).not.toMatch(/strip attribute|not a Postext/);
    const bad = lint(comicProject(letters, { en: strip.replace("span=page", "span=wide spread") })).out;
    expect(bad).toContain("span='wide' is read as column");
    expect(bad).toContain(":::strip attribute 'spread' is ignored (spreads are pages: :::page{spread})");
    const open = lint(comicProject(letters, { en: COMIC.replace(/:::\n$/, "") }));
    expect(open.out).toContain(":::page is never closed");
  });

  it("knows a strip's width, alignment and caption (#590)", () => {
    const strip = (attrs: string) => [`:::strip{${attrs}}`, "::panel{art=p1}", "::panel{art=p2}", ":::", ""].join("\n");
    const good = lint(comicProject(letters, { en: strip('width=60% align=end caption="A day." type=figure id=day') + 'See :ref{id="day"}.\n' })).out;
    expect(good).not.toMatch(/strip attribute|width=|align=|type=|caption|:ref to unknown/);
    expect(lint(comicProject(letters, { en: strip("width=12cm align=start") })).out).not.toMatch(/width=|align=/);
    const bad = lint(comicProject(letters, { en: strip('width=wide align=middle type=plate caption=""') })).out;
    expect(bad).toContain("width='wide' is not a share of the measure");
    expect(bad).toContain("align='middle' is read as center");
    expect(bad).toContain("caption is empty");
    expect(bad).toContain("type='plate' is not in resourceTypes");
    expect(lint(comicProject(letters, { en: strip("type=figure") })).out).toContain("type without caption: the strip is not counted");
    expect(lintAll(comicProject(letters, { en: strip("align=end") })).out).toContain("align without width");
    expect(lintAll(comicProject(letters, { en: strip('id=s1 caption="Plain."') })).out).toContain("a :ref names a strip only when it is numbered");
  });

  it("checks the comics config", () => {
    const { out, status } = lint(comicProject({
      comics: {
        readingDirection: "backwards", zoom: 1,
        lettering: { fontSize: { value: 1, unit: "em" }, writingMode: "vertical", leading: 1 },
        gutter: { horizontal: { value: 1, unit: "em" } },
        balloonStyles: [{ id: "writing", shape: "star" }, { shape: "oval" }, { id: "dream", tail: "bubles" }],
        cast: [{ id: "ana", balloonStyle: "growl" }],
      },
    }, { en: COMIC }));
    expect(out).toContain("config.comics.readingDirection: 'backwards' is not one of");
    expect(out).toContain("config.comics.zoom: unknown key (ignored)");
    expect(out).toContain("config.comics.lettering.fontSize: in em throws");
    expect(out).toContain("config.comics.gutter.horizontal: in em throws");
    expect(out).toContain("config.comics.lettering.leading: unknown key (ignored)");
    expect(out).toContain("config.comics.balloonStyles[0].shape: 'star' is not one of");
    expect(out).toContain("config.comics.balloonStyles[2].tail: 'bubles' is not one of");
    expect(out).toContain("(did you mean 'bubbles'?): the default is used (unknownConfigValue)");
    expect(out).toContain("config.comics.balloonStyles[1]: a balloon style without an id is dropped");
    expect(out).toContain("config.comics.cast[0].balloonStyle: 'growl' is not a balloon style");
    expect(status).toBe(1);
  });

  it("checks anchors, faces and safe areas, and speakers no picture marks", () => {
    const pictures = [
      { id: "p1", typeId: "figure", kind: "bitmap", safeArea: { x: 0.5, y: 0, width: 0.5, height: 1 },
        anchors: [{ id: "ana", x: 0.2, y: 0.5 }, { id: "ana", x: 0.6, y: 0.5, face: { x: 0.9, y: 0.1, width: 0.3, height: 0.2 } }] },
      { id: "p2", typeId: "figure", kind: "bitmap", avoid: [{ x: 0.1, y: 0.1, width: 0, height: 0.2 }] },
      { id: "p3", typeId: "figure", kind: "bitmap", anchors: [{ id: "caption", x: 0.5, y: 0.5 }] },
    ];
    const { out } = lintAll(comicProject({ ...letters, comics: { ...letters.comics, cast: [{ id: "ben" }] } },
      { en: COMIC + "\n" + COMIC.replace("ben{whisper}", "carl") }, pictures));
    expect(out).toContain("the mouth of 'ana' lies outside the safe area");
    expect(out).toContain("anchor 'ana' is marked twice in this picture");
    expect(out).toContain("anchors[1]: face runs outside the picture");
    expect(out).toContain("avoid[0]: has no area");
    expect(out).toContain("id 'caption' is a reserved script key");
    expect(out).toMatch(/INFO  chapters\/en\/01\.md:\d+: speaker 'carl' has no anchor in any picture and no cast entry/);
    expect(out).not.toContain("speaker 'ben'");
    expect(out).not.toMatch(/resource p\d: never cited/);
  });

  it("compares the editions' geometry and counts comic text in the lettering face", () => {
    const es = COMIC.replace("ana: Did you hear that?", "ana: ¿Has oído eso?").replace('split="30 [55 | *] / *"', 'split="35 [55 | *] / *"');
    const { out } = lint(comicProject(letters, { en: COMIC, es }));
    expect(out).toMatch(/chapters\/es\/01\.md:1: :::page\{split="35 \[55 \| \*\] \/ \*"\} differs from en/);
    const ja = [
      ':::page{split="* / *"}', "::panel{art=p1}", "ana: これは日本語の吹き出しです。ひらがなとカタカナ。", "::panel{art=p2}", "ben: そうですね。", ":::", "",
    ].join("\n");
    const jaOut = lint(comicProject({
      locale: "ja", bodyText: { fontFamily: "Noto Serif JP" }, headings: { fontFamily: "Noto Sans JP", levels: [{ level: 1, breakBefore: { enabled: true } }] },
      comics: { lettering: { fontFamily: "Comic Neue", fontSize: { value: 9, unit: "pt" } } },
    }, { ja })).out;
    expect(jaOut).toMatch(/CJK characters .* are set in Comic Neue, which has none: set comics\.lettering\.fontFamily/);
    expect(jaOut).toContain("'Dela Gothic One', the sound-effect face");
  });
});

const PANELS = path.join(REPO, "plugins/postext/skills/postext-port/scripts/comic_panels.py");
const imaging = python && spawnSync("python3", ["-c", "import numpy, PIL"]).status === 0;

describe.skipIf(!imaging)("postext-port comic_panels.py", () => {
  it("measures a page into a split expression, left to right and right to left", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "postext-panels-"));
    // A 1200x1700 page: a 30 % tier, a tier cut by a gutter slanting from
    // 40 % to 55 %, and a tier of three panels (30 % | 20 % | rest).
    const draw = [
      "import sys",
      "from PIL import Image, ImageDraw",
      "W, H, m, g = 1200, 1700, 60, 24",
      "im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im)",
      "fx0, fy0, fx1, fy1 = m, m, W - m, H - m; fw, fh = fx1 - fx0, fy1 - fy0",
      "ys = [fy0, fy0 + 0.3 * fh, fy0 + 0.65 * fh, fy1]",
      "d.rectangle((fx0, ys[0], fx1, ys[1] - g / 2), fill=(70, 110, 150))",
      "a, b = ys[1] + g / 2, ys[2] - g / 2; xt, xb = fx0 + 0.40 * fw, fx0 + 0.55 * fw",
      "d.polygon([(fx0, a), (xt - g / 2, a), (xb - g / 2, b), (fx0, b)], fill=(150, 90, 60))",
      "d.polygon([(xt + g / 2, a), (fx1, a), (fx1, b), (xb + g / 2, b)], fill=(90, 150, 60))",
      "xs = [fx0, fx0 + 0.3 * fw, fx0 + 0.5 * fw, fx1]",
      "for i in range(3): d.rectangle((xs[i] + (g / 2 if i else 0), ys[2] + g / 2, xs[i + 1] - (g / 2 if i < 2 else 0), fy1), fill=(60 + 40 * i, 60, 120))",
      "im.save(sys.argv[1])",
    ].join("\n");
    const page = path.join(dir, "page.png");
    expect(spawnSync("python3", ["-c", draw, page]).status).toBe(0);
    const run = (...extra: string[]) => spawnSync("python3", [PANELS, "detect", page, "--out", path.join(dir, "out"), "--dpi", "150", ...extra], { encoding: "utf8" });
    const ltr = run();
    expect(ltr.status, ltr.stderr).toBe(0);
    // Numbers within half a percent (antialiased edges), the shape exactly.
    const near = (out: string, want: string) => {
      const got = /split="([^"]+)"/.exec(out)?.[1] ?? "";
      expect(got.replace(/[\d.]+/g, "N")).toBe(want.replace(/[\d.]+/g, "N"));
      const a = got.match(/[\d.]+/g)!.map(Number);
      want.match(/[\d.]+/g)!.map(Number).forEach((v, i) => expect(Math.abs(a[i] - v), got).toBeLessThan(0.6));
    };
    near(ltr.stdout, "30 / 35 [40~55 | *] / * [30 | 20 | *]");
    expect(ltr.stdout).toMatch(/gutter="(3\.[5-9]|4(\.[0-3])?)mm (3\.[5-9]|4(\.[0-3])?)mm"/);
    expect(ltr.stdout).toContain("::panel{art=page-6}");
    expect(existsSync(path.join(dir, "out", "page-3.jpg"))).toBe(true);
    expect(existsSync(path.join(dir, "out", "page-sheet.jpg"))).toBe(true);
    const json = JSON.parse(readFileSync(path.join(dir, "out", "panels.json"), "utf8"));
    expect(json.pages[0].panels).toHaveLength(6);
    expect(Math.abs(json.frameMm.top - 10.16)).toBeLessThan(0.6);
    const rtl = run("--direction", "rtl", "--no-cuts");
    near(rtl.stdout, "30 / 35 [60~45 | *] / * [50 | 20 | *]");
    expect(rtl.stdout).toContain("direction=rtl");
  });
});
