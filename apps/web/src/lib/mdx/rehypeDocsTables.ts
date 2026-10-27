/**
 * rehype plugin: prepares the docs' reference tables to fit the column.
 *
 * - `<table>` gets the class `docs-table` and `data-cols` (its column count);
 *   `data-prose-last` when the last column is the description, whose label a
 *   stacked row leaves out.
 * - Every body cell gets `data-label`, the text of its column's header, which
 *   a row shown as a stacked card prints before the value.
 * - Table parts get their ARIA roles, so the table keeps its semantics when a
 *   narrow column lays it out as blocks.
 * - A long `<code>` in a cell (a type such as `{ kind, glyph, … }` or a dotted
 *   path) gets `data-wrap` and a `<wbr>` after each `.`, `,` and `|`, so it can
 *   wrap; short values stay on one line.
 *
 * Works on plain hast plus the MDX node types (`mdxJsxFlowElement`,
 * `mdxJsxTextElement`): the docs write their tables as JSX.
 */

interface Attribute {
  type: string;
  name?: string;
  value?: unknown;
}

interface Node {
  type: string;
  tagName?: string;
  name?: string | null;
  value?: string;
  properties?: Record<string, unknown>;
  attributes?: Attribute[];
  children?: Node[];
}

/** The header of a description column, in every docs language. */
const DESCRIPTION = new Set(["Description", "Descripción", "Descripció", "Descrição", "Beschreibung", "Descrizione", "説明", "说明", "الوصف"]);

/** Code longer than this may wrap inside a cell. */
const LONG_CODE = 24;

const ROLES: Record<string, string> = {
  table: "table",
  thead: "rowgroup",
  tbody: "rowgroup",
  tr: "row",
  th: "columnheader",
  td: "cell",
};

function tag(node: Node): string | null {
  if (node.type === "element") return node.tagName ?? null;
  if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") return node.name ?? null;
  return null;
}

function getAttr(node: Node, name: string): unknown {
  if (node.type === "element") {
    const key = name === "colSpan" ? "colSpan" : name;
    return node.properties?.[key];
  }
  const attr = node.attributes?.find((a) => a.type === "mdxJsxAttribute" && a.name === name);
  if (!attr) return undefined;
  const value = attr.value;
  // `colSpan={4}` is an expression attribute.
  if (value && typeof value === "object" && "value" in value) return (value as { value: string }).value;
  return value;
}

function setAttr(node: Node, name: string, value: string): void {
  if (node.type === "element") {
    node.properties ??= {};
    if (name === "className") {
      const prev = node.properties.className;
      node.properties.className = [...(Array.isArray(prev) ? prev : prev ? [String(prev)] : []), value];
    } else {
      node.properties[name] = value;
    }
    return;
  }
  node.attributes ??= [];
  const existing = node.attributes.find((a) => a.type === "mdxJsxAttribute" && a.name === name);
  if (existing && name === "className" && typeof existing.value === "string") {
    existing.value = `${existing.value} ${value}`;
  } else if (existing) {
    existing.value = value;
  } else {
    node.attributes.push({ type: "mdxJsxAttribute", name, value });
  }
}

/** The plain text of a node. */
function text(node: Node): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(text).join("");
}

/** The descendants with a tag, not entering nested tables. */
function find(node: Node, name: string, out: Node[] = []): Node[] {
  for (const child of node.children ?? []) {
    const t = tag(child);
    if (t === name) out.push(child);
    if (t !== "table") find(child, name, out);
  }
  return out;
}

/** The rows of a table section (`thead`/`tbody`), or of the table itself. */
function rows(node: Node): Node[] {
  return find(node, "tr");
}

function cells(row: Node): Node[] {
  return (row.children ?? []).filter((c) => tag(c) === "td" || tag(c) === "th");
}

function span(cell: Node): number {
  const n = Number(getAttr(cell, "colSpan") ?? getAttr(cell, "colspan") ?? 1);
  return Number.isFinite(n) && n > 1 ? n : 1;
}

/** A `<wbr>` after each `.`, `,` and `|` of a long code's text. */
function breakable(code: Node): void {
  const jsx = code.type !== "element";
  const wbr = (): Node =>
    jsx ? { type: "mdxJsxTextElement", name: "wbr", attributes: [], children: [] } : { type: "element", tagName: "wbr", properties: {}, children: [] };
  code.children = (code.children ?? []).flatMap((child) => {
    if (child.type !== "text" || !child.value) return [child];
    const parts = child.value.split(/(?<=[.,|])(?=\S)/);
    return parts.flatMap((value, i) => (i === 0 ? [{ type: "text", value }] : [wbr(), { type: "text", value }]));
  });
}

function markCode(cell: Node): void {
  for (const code of find(cell, "code")) {
    if (text(code).length <= LONG_CODE) continue;
    setAttr(code, "data-wrap", "");
    breakable(code);
  }
}

function prepare(table: Node): void {
  const head = find(table, "thead")[0];
  const headRow = head ? rows(head)[0] : undefined;
  const labels: string[] = [];
  for (const th of headRow ? cells(headRow) : []) {
    const label = text(th).replace(/\s+/g, " ").trim();
    for (let i = 0; i < span(th); i++) labels.push(label);
  }
  setAttr(table, "className", "docs-table");
  setAttr(table, "data-cols", String(Math.max(labels.length, 1)));
  if (labels.length >= 2 && DESCRIPTION.has(labels[labels.length - 1]!)) setAttr(table, "data-prose-last", "");

  for (const [name, role] of Object.entries(ROLES)) {
    const nodes = name === "table" ? [table] : find(table, name);
    for (const node of nodes) setAttr(node, "role", role);
  }

  const body = find(table, "tbody")[0] ?? table;
  for (const row of rows(body)) {
    if (head && row === headRow) continue;
    let col = 0;
    for (const cell of cells(row)) {
      const width = span(cell);
      const label = labels[col];
      if (width === 1 && label) setAttr(cell, "data-label", label);
      if (width > 1) setAttr(cell, "data-span", "");
      markCode(cell);
      col += width;
    }
  }
}

/** Prepares every table of a hast tree. */
export function prepareDocsTables(tree: Node): void {
  const walk = (node: Node) => {
    for (const child of node.children ?? []) {
      if (tag(child) === "table") prepare(child);
      walk(child);
    }
  };
  walk(tree);
}

/** The unified attacher. */
export default function rehypeDocsTables() {
  return (tree: Node) => prepareDocsTables(tree);
}
