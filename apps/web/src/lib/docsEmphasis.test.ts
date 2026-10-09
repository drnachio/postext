import { describe, expect, it } from "vitest";
import { serialize } from "next-mdx-remote/serialize";
import { getAllDocs, getDocSource } from "./docs";

interface Node {
  type: string;
  value?: string;
  children?: Node[];
  position?: { start: { line: number } };
}

/** The `**` runs that did not become bold on a page, as the site's MDX
 *  parser reads it: asterisks left in the text, and bold nested in bold
 *  (a closer that cannot close becomes an opener and pairs with the next
 *  run). CommonMark closes `**` only when it is right-flanking, so
 *  `**粗体。**中文` (punctuation before, a letter after) stays literal; the
 *  docs move the punctuation out (`**粗体**。中文`) or write `<strong>`. */
async function strayEmphasis(source: string): Promise<string[]> {
  const found: string[] = [];
  const inspect = () => (tree: Node) => {
    const walk = (node: Node, inStrong: boolean) => {
      const line = node.position?.start.line;
      if (node.type === "strong" && inStrong) found.push(`${line}: bold inside bold`);
      // `(** †† ‡‡…)` is the doubled footnote symbol, written as such.
      if (node.type === "text" && node.value!.replace(/\*\* ††/g, "").includes("**")) {
        found.push(`${line}: ${node.value!.trim().slice(0, 60)}`);
      }
      for (const child of node.children ?? []) walk(child, inStrong || node.type === "strong");
    };
    walk(tree, false);
  };
  await serialize(source, { mdxOptions: { remarkPlugins: [inspect] } });
  return found;
}

describe("docs emphasis", () => {
  it("leaves no literal ** on any page, CJK text included", async () => {
    const stray: string[] = [];
    for (const doc of getAllDocs()) {
      for (const locale of Object.keys(doc.locales)) {
        const page = getDocSource(doc.slug, locale)!;
        for (const hit of await strayEmphasis(page.source)) stray.push(`${doc.slug}-${locale}.mdx:${hit}`);
      }
    }
    expect(stray).toEqual([]);
    // Every page of every language goes through the MDX compiler: about
    // half a minute for the ninety-odd pages, more on a busy machine.
  }, 120_000);
});
