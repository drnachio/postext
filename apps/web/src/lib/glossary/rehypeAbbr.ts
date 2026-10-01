/**
 * rehype plugin: wraps the first occurrence of each known abbreviation in
 * `<abbr title="…">` with its expansion in the page's locale (WCAG 3.1.4).
 *
 * Text inside code, preformatted blocks, headings, links, existing `<abbr>`,
 * SVG and maths stays as written, and so does the text of inline MDX
 * components (`<RecipeLink>`, `<Feature>`, …), which render their children
 * their own way. Block MDX components are entered only when listed in
 * `ENTERED_COMPONENTS`.
 *
 * Works on plain hast plus the MDX node types (`mdxJsxFlowElement`,
 * `mdxJsxTextElement`); no dependencies.
 */
import { abbreviationPattern, abbreviationsFor } from "./abbreviations";

export interface RehypeAbbrOptions {
  locale: string;
  /** Abbreviations already expanded earlier on the page (by their id). The
   *  plugin adds the ones it wraps, so several compiled fragments of one
   *  page (a recipe's sections) expand each abbreviation once. */
  seen?: Set<string>;
}

interface Node {
  type: string;
  tagName?: string;
  name?: string | null;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
}

/** Elements (and lowercase JSX tags) whose text is never wrapped. */
const SKIPPED = new Set([
  "a", "abbr", "acronym", "button", "code", "kbd", "pre", "samp", "var", "script", "style",
  "svg", "math", "title", "textarea", "select", "option", "h1", "h2", "h3", "h4", "h5", "h6",
]);

/** Block MDX components whose children are prose. */
const ENTERED_COMPONENTS = new Set(["Note"]);

function skipped(node: Node): boolean {
  if (node.type === "element") return SKIPPED.has(node.tagName ?? "");
  if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
    const name = node.name ?? "";
    // A fragment (`<>`) or an HTML tag written as JSX.
    if (name === "" || /^[a-z]/.test(name)) return SKIPPED.has(name);
    return !(node.type === "mdxJsxFlowElement" && ENTERED_COMPONENTS.has(name));
  }
  return node.type !== "root";
}

/** Wraps first occurrences in a hast tree, in reading order. */
export function wrapAbbreviations(tree: Node, options: RehypeAbbrOptions): void {
  const entries = abbreviationsFor(options.locale);
  const pattern = abbreviationPattern(options.locale);
  const seen = options.seen ?? new Set<string>();

  const splitText = (value: string): Node[] | null => {
    let out: Node[] | null = null;
    let last = 0;
    pattern.lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
      const entry = entries.get(match[0]);
      if (!entry || seen.has(entry.id)) continue;
      seen.add(entry.id);
      out ??= [];
      if (match.index > last) out.push({ type: "text", value: value.slice(last, match.index) });
      out.push({
        type: "element",
        tagName: "abbr",
        properties: { title: entry.title },
        children: [{ type: "text", value: match[0] }],
      });
      last = match.index + match[0].length;
    }
    if (out && last < value.length) out.push({ type: "text", value: value.slice(last) });
    return out;
  };

  // An abbreviation the author already wrapped somewhere is not repeated.
  const authored = (node: Node) => {
    const isAbbr =
      (node.type === "element" && node.tagName === "abbr") ||
      (node.type.startsWith("mdxJsx") && node.name === "abbr");
    if (isAbbr) {
      const text = (node.children ?? []).map((c) => c.value ?? "").join("").trim();
      const entry = entries.get(text);
      if (entry) seen.add(entry.id);
      return;
    }
    node.children?.forEach(authored);
  };
  authored(tree);

  const walk = (node: Node) => {
    const children = node.children;
    if (!children) return;
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      if (child.type === "text") {
        const parts = child.value ? splitText(child.value) : null;
        if (parts) {
          children.splice(i, 1, ...parts);
          i += parts.length - 1;
        }
      } else if (child.children && !skipped(child)) {
        walk(child);
      }
    }
  };
  walk(tree);
}

/** The unified attacher: `[rehypeAbbr, { locale }]`. */
export default function rehypeAbbr(options: RehypeAbbrOptions) {
  return (tree: Node) => wrapAbbreviations(tree, options);
}
