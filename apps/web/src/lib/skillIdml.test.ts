import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseMarkdown } from "postext";

/** The postext-port skill's IDML extractor on East Asian character
 *  attributes: a run may carry several marks (ruby inside a warichu note,
 *  kenten on a ruby base, bold on a marked run), and they must nest. */
const REPO = path.join(__dirname, "../../../..");
const EXTRACT = path.join(REPO, "plugins/postext/skills/postext-port/scripts/idml_extract.py");
const python = spawnSync("python3", ["--version"]).status === 0;

const range = (attrs: string, text: string) => `<CharacterStyleRange ${attrs}><Content>${text}</Content></CharacterStyleRange>`;
const STORY = [
  '<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/H1">', range("", "第一回"), "</ParagraphStyleRange>",
  '<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Body">',
  range("", "寶玉"),
  range('Warichu="true"', "甲戌側批："),
  range('Warichu="true" RubyFlag="true" RubyString="tōng líng" RubyType="PerCharacterRuby"', "通靈"),
  range('Warichu="true"', "之說，"),
  range('Warichu="true" KentenKind="KentenSesameDot"', "要緊"),
  range('Warichu="true"', "。"),
  range("", "道："),
  range('FontStyle="Bold" RubyFlag="true" RubyString="hóng lóu mèng" RubyType="PerCharacterRuby"', "紅樓"),
  range('RubyFlag="true" RubyString="hóng lóu mèng" RubyType="PerCharacterRuby" KentenKind="KentenWhiteSesameDot"', "夢"),
  range("", "，"),
  range('FontStyle="Bold" KentenKind="KentenWhiteCircle"', "不可"),
  range("", "輕忽。"),
  "</ParagraphStyleRange>",
].join("");

/** A minimal IDML package holding one story, zipped by Python. */
function idml(dir: string): string {
  const file = path.join(dir, "book.idml");
  const files = {
    "designmap.xml": '<?xml version="1.0"?><Document/>',
    "Resources/Styles.xml":
      '<?xml version="1.0"?><idPkg:Styles xmlns:idPkg="x"><RootParagraphStyleGroup>' +
      '<ParagraphStyle Self="ParagraphStyle/Body" Name="Body" PointSize="10.5"/>' +
      '<ParagraphStyle Self="ParagraphStyle/H1" Name="H1" PointSize="16"/>' +
      "</RootParagraphStyleGroup><RootCharacterStyleGroup/></idPkg:Styles>",
    "Stories/Story_u1.xml": `<?xml version="1.0"?><idPkg:Story xmlns:idPkg="x"><Story Self="u1">${STORY}</Story></idPkg:Story>`,
  };
  const script = "import json, sys, zipfile\nz = zipfile.ZipFile(sys.argv[1], 'w')\n" +
    "for k, v in json.load(sys.stdin).items(): z.writestr(k, v)\nz.close()\n";
  const r = spawnSync("python3", ["-c", script, file], { input: JSON.stringify(files), encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  return file;
}

describe.skipIf(!python)("postext-port IDML extraction of East Asian marks", () => {
  it("nests ruby and kenten inside a warichu note and keeps bold inside the marks", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "postext-idml-"));
    const book = idml(dir);
    writeFileSync(path.join(dir, "map.json"), JSON.stringify({ idml: book, styles: { H1: "h1", Body: "body" } }));
    const out = path.join(dir, "out");
    const r = spawnSync("python3", [EXTRACT, "markdown", book, "--map", path.join(dir, "map.json"), "--out", out,
      "--lang", "zh-Hant", "--stories", "u1"], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const chapters = path.join(out, "chapters/zh-Hant");
    const md = readFileSync(path.join(chapters, readdirSync(chapters)[0]!), "utf8");

    // One note, the ruby and the dots inside it.
    expect(md).toContain(
      '寶玉:warichu[甲戌側批：:ruby[通靈]{rt="tōng líng"}之說，:dots[要緊]{style="sesame"}。]道：',
    );
    // An open sesame dot keeps its fill, and a white circle is the open default.
    expect(md).toContain(':ruby[**紅樓**:dots[夢]{style="sesame" fill="open"}]{rt="hóng lóu mèng"}');
    expect(md).toContain(':dots[**不可**]{style="circle"}');

    const spans = parseMarkdown(md).flatMap((b) => ("spans" in b && b.spans ? b.spans : []));
    const span = (text: string) => spans.find((s) => s.text === text)!;
    const note = spans.filter((s) => s.warichu);
    expect(note.map((s) => s.text).join("")).toBe("甲戌側批：通靈之說，要緊。");
    expect(new Set(note.map((s) => s.warichu)).size).toBe(1);
    expect(span("通").ruby).toBeDefined();
    expect(span("要緊").emphasisMark).toEqual({ style: "sesame" });
    expect(span("紅")).toMatchObject({ bold: true });
    expect(span("夢").emphasisMark).toEqual({ style: "sesame", fill: "open" });
    expect(span("不可")).toMatchObject({ bold: true, emphasisMark: { style: "circle" } });
  });
});
