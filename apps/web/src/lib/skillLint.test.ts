import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
