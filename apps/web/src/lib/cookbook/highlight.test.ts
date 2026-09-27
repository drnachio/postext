import { describe, expect, it } from "vitest";
import { highlightCss, highlightLines } from "./highlight.ts";

describe("highlightLines", () => {
  it("returns one token list per line, with both themes as palette classes", async () => {
    const code = "// a comment\nconst answer = 'x';\n\nconfig();";
    const lines = await highlightLines(code, "js");
    expect(lines).toHaveLength(4);
    expect(lines.map((line) => line.map((t) => t.content).join(""))).toEqual(code.split("\n"));
    const keyword = lines[1].find((t) => t.content.startsWith("const"));
    expect(keyword?.className).toMatch(/^hl\d+ hd\d+$/);
    // Every class has its rule.
    const css = await highlightCss();
    for (const name of keyword!.className!.split(" ")) expect(css).toContain(`.${name}{color:#`);
    expect(await highlightLines(code, "js")).toBe(lines);
  });

  it("merges whitespace into its neighbour", async () => {
    const [line] = await highlightLines("a  +  b", "js");
    expect(line.some((t) => /^\s+$/.test(t.content))).toBe(false);
  });

  it("highlights diffs and Markdown", async () => {
    expect(await highlightLines("- old\n+ new", "diff")).toHaveLength(2);
    const [title] = await highlightLines("# Title\n\n:::callout", "markdown");
    expect(title[0].className ?? title[0].style).toBeDefined();
  });
});
