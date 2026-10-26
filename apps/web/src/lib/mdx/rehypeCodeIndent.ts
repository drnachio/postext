/**
 * rehype plugin (after rehype-pretty-code): gives every highlighted code line
 * (`<span data-line>`) its leading indent as `--indent`, in columns, so the
 * docs' CSS can hang a wrapped line two columns in from where the line's own
 * text starts. A tab counts as two columns, as the docs write them.
 */

interface Node {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
}

function text(node: Node): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(text).join("");
}

/** The leading indent of a line, in columns. */
export function indentOf(line: string): number {
  const lead = /^[ \t]*/.exec(line)![0];
  return [...lead].reduce((n, c) => n + (c === "\t" ? 2 : 1), 0);
}

function isLine(node: Node): boolean {
  const p = node.properties ?? {};
  return node.type === "element" && node.tagName === "span" && ("dataLine" in p || "data-line" in p);
}

export function indentCodeLines(tree: Node): void {
  const walk = (node: Node, inCode: boolean) => {
    for (const child of node.children ?? []) {
      if (inCode && isLine(child)) {
        const indent = indentOf(text(child));
        if (indent > 0) {
          const style = child.properties!.style;
          child.properties!.style = `${typeof style === "string" && style ? `${style};` : ""}--indent:${indent}`;
        }
        continue;
      }
      if (child.type === "element") walk(child, inCode || (child.tagName === "code" && node.tagName === "pre"));
    }
  };
  walk(tree, false);
}

/** The unified attacher. */
export default function rehypeCodeIndent() {
  return (tree: Node) => indentCodeLines(tree);
}
