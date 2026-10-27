/**
 * JSX string expressions (`{'{partTitle}'}`, `{"{ enabled: true }"}`, a
 * template literal without `${}`) in a docs or Cookbook MDX source, as
 * literal text.
 *
 * The pages compile with next-mdx-remote's `blockJS`, which drops every
 * JavaScript expression: `<code>{'{h1}'}</code>` printed an empty code box.
 * The Markdown renditions already read them as their text (markdown.ts), so
 * the page does the same before compiling: each expression becomes its
 * string, with the characters MDX would read as syntax (braces, tags,
 * emphasis, links, entities) written as character references. Fenced code
 * and backtick spans keep them as written, and so does an attribute value
 * (`name={'…'}`). The text of a JSX `<code>` keeps its Markdown marks
 * (`*`, `_`, `~`, `^`, brackets) literal too.
 */

/** Characters MDX reads as syntax inside JSX text. */
const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "{": "&#123;",
  "}": "&#125;",
  "*": "&#42;",
  _: "&#95;",
  "`": "&#96;",
  "[": "&#91;",
  "]": "&#93;",
  "~": "&#126;",
  "\\": "&#92;",
};

/** A string literal's text (its JS escapes read), escaped for JSX text. */
function literal(raw: string): string {
  return raw.replace(/\\(.)/g, "$1").replace(/[&<>{}*_`[\]~\\]/g, (c) => ESCAPES[c]!);
}

/** The end (index past the closing brace) of a string expression opening
 *  at `at` (`{'…'}`, `{"…"}`, or a template literal with no `${`), and its
 *  raw text; null when there is none. */
function expressionAt(text: string, at: number): { end: number; raw: string } | null {
  const quote = text[at + 1];
  if (text[at] !== "{" || (quote !== "'" && quote !== '"' && quote !== "`")) return null;
  for (let i = at + 2; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (quote === "`" && c === "$" && text[i + 1] === "{") return null;
    if (c === quote) return text[i + 1] === "}" ? { end: i + 2, raw: text.slice(at + 2, i) } : null;
  }
  return null;
}

/** One line outside fenced code: its string expressions, left to right,
 *  outside backtick spans and attribute values. */
function line(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === "`") {
      // A backtick span runs to the next run of as many backticks.
      const run = /^`+/.exec(text.slice(i))![0];
      const close = text.indexOf(run, i + run.length);
      const end = close === -1 ? i + run.length : close + run.length;
      out += text.slice(i, end);
      i = end;
      continue;
    }
    const expr = c === "{" && text[i - 1] !== "=" ? expressionAt(text, i) : null;
    if (expr) {
      out += literal(expr.raw);
      i = expr.end;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Characters Markdown reads as emphasis, marks or links. */
const MARKS: Record<string, string> = { "*": "&#42;", _: "&#95;", "~": "&#126;", "^": "&#94;", "[": "&#91;", "]": "&#93;" };

/** The text of a JSX `<code>` (no tags inside) with its Markdown marks as
 *  character references: MDX reads Markdown inside JSX, so
 *  `<code>**bold**</code>` printed a bold "bold" and `<code>^x^</code>` a
 *  superscript. */
function literalCode(text: string): string {
  return text.replace(/<code>([^<]*)<\/code>/g, (_, inner: string) => `<code>${inner.replace(/[*_~^[\]]/g, (c) => MARKS[c]!)}</code>`);
}

export function literalStringExpressions(source: string): string {
  let fence: { mark: string; size: number } | null = null;
  return source
    .split("\n")
    .map((text) => {
      const m = text.match(/^\s*(`{3,}|~{3,})(.*)$/);
      if (m) {
        if (fence === null) fence = { mark: m[1]![0]!, size: m[1]!.length };
        else if (m[1]![0] === fence.mark && m[1]!.length >= fence.size && m[2]!.trim() === "") fence = null;
        return text;
      }
      return fence === null ? literalCode(line(text)) : text;
    })
    .join("\n");
}
