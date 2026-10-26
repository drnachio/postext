import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { compileDocsMdx } from "@/lib/mdx/mdx";
import { indentOf } from "./rehypeCodeIndent";

async function html(source: string) {
  const { content } = await compileDocsMdx(source, {});
  return renderToStaticMarkup(content);
}

const TABLE = `<table>
  <thead>
    <tr>
      <th>Property</th>
      <th>Type</th>
      <th>Default</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>marker</code></td>
      <td><code>&#123; kind, glyph, resourceId, fontFamily &#125;</code></td>
      <td><code>8 pt</code></td>
      <td>The marker column, see <code>calloutStyles.marker.position</code>.</td>
    </tr>
    <tr>
      <td colSpan="4">A note across the row.</td>
    </tr>
  </tbody>
</table>`;

describe("rehypeDocsTables", () => {
  it("labels every body cell with its column header", async () => {
    const out = await html(TABLE);
    expect(out).toMatch(/<table[^>]*class="docs-table"/);
    expect(out).toContain('data-cols="4"');
    expect(out).toContain('data-prose-last=""');
    expect(out).toContain('<td role="cell" data-label="Type">');
    expect(out).toContain('<td role="cell" data-label="Description">The marker column');
  });

  it("gives the table parts their roles, so a stacked table stays a table", async () => {
    const out = await html(TABLE);
    for (const role of ["table", "rowgroup", "row", "columnheader", "cell"]) expect(out).toContain(`role="${role}"`);
  });

  it("leaves a cell that spans columns unlabelled", async () => {
    const out = await html(TABLE);
    expect(out).toMatch(/<td colSpan="4" role="cell" data-span="">A note across the row\.<\/td>/);
  });

  it("lets long code wrap (after a dot that no space follows) and keeps short code whole", async () => {
    const out = await html(TABLE);
    expect(out).toContain('<code data-wrap="">{ kind, glyph, resourceId, fontFamily }</code>');
    expect(out).toContain('<code data-wrap="">calloutStyles.<wbr/>marker.<wbr/>position</code>');
    expect(out).toContain("<code>8 pt</code>");
  });

  it("keeps the description label when the last column is not a description", async () => {
    const out = await html(`<table>
  <thead>
    <tr>
      <th>Warning</th>
      <th>Cause</th>
      <th>Fix</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>a</td>
      <td>b</td>
      <td>c</td>
    </tr>
  </tbody>
</table>`);
    expect(out).not.toContain("data-prose-last");
    expect(out).toContain('<td role="cell" data-label="Fix">c</td>');
  });
});

describe("rehypeCodeIndent", () => {
  it("counts a line's indent in columns, a tab as two", () => {
    expect(indentOf("    return x;")).toBe(4);
    expect(indentOf("\t\tx")).toBe(4);
    expect(indentOf("x")).toBe(0);
  });

  it("gives each indented highlighted line its indent", async () => {
    const out = await html("```ts\nfunction f() {\n    return 1;\n}\n```");
    expect(out).toContain('style="--indent:4"');
    expect(out.match(/--indent/g)).toHaveLength(1);
  });
});
