import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { compileDocsMdx } from "@/lib/mdx/mdx";
import { literalStringExpressions } from "./mdxStrings";

async function html(source: string) {
  const { content } = await compileDocsMdx(literalStringExpressions(source), {});
  return renderToStaticMarkup(content);
}

describe("literalStringExpressions", () => {
  it("prints the text of a string expression the compile would drop", async () => {
    expect(await html("Use <code>{'{partTitle}'}</code> in the template.")).toContain("<code>{partTitle}</code>");
    expect(await html(`<code>{"{ enabled: true, char: '.' }"}</code>`)).toContain("<code>{ enabled: true, char: &#x27;.&#x27; }</code>");
    expect(await html("<code>:::callout{'{'}type{'}'}</code>")).toContain("<code>:::callout{type}</code>");
  });

  it("keeps Markdown and tags in the string literal", async () => {
    const out = await html("<code>{'*a* _b_ <i> [c](d) & \\\\'}</code>");
    expect(out).toContain("<code>*a* _b_ &lt;i&gt; [c](d) &amp; \\</code>");
  });

  it("keeps Markdown marks literal inside a JSX code span", async () => {
    const out = await html("<code>**bold**</code>, <code>*…*</code>, <code>[^id]</code>, <code>~s~</code> and <code>Na^+^</code>");
    expect(out).toContain("<code>**bold**</code>, <code>*…*</code>, <code>[^id]</code>, <code>~s~</code> and <code>Na^+^</code>");
  });

  it("leaves code, backtick spans and attribute values as written", () => {
    const fenced = "```ts\nconst a = {'x'};\n```";
    expect(literalStringExpressions(fenced)).toBe(fenced);
    expect(literalStringExpressions("`{'x'}` and {'y'}")).toBe("`{'x'}` and y");
    expect(literalStringExpressions("<Thing label={'x'} />")).toBe("<Thing label={'x'} />");
  });
});

describe("the docs pages", () => {
  it("hold no code span whose text the compile would drop", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "../../docs");
    const dropped: string[] = [];
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"))) {
      const source = literalStringExpressions(fs.readFileSync(path.join(dir, f), "utf8"));
      // A bare expression (`<code>{chapterTitle}</code>`) prints nothing:
      // write the braces as &#123; &#125; (or \{ \}), or the text as {'…'}.
      for (const m of source.matchAll(/<code>[^<]*(?<!\\)\{(?!\/\*)[^}]*\}[^<]*<\/code>/g)) dropped.push(`${f}: ${m[0]}`);
    }
    expect(dropped).toEqual([]);
  });
});
