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
    version: 2, configVersion: 8, id: "t", name: "T", locale: "zh-Hant",
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
      version: 2, configVersion: 8, id: "t", name: "T", locale: "en",
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
    version: 2, configVersion: 8, id: "t", name: "T", locale: "ar",
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
