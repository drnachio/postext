import type { HighlightedLine, HighlightToken } from "@/lib/cookbook/highlight";
import { cn } from "@/lib/utils";

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (text: string) => escapeHtml(text).replace(/"/g, "&quot;");

function tokenHtml(token: HighlightToken): string {
  const text = escapeHtml(token.content);
  if (token.className) return `<span class="${token.className}">${text}</span>`;
  if (token.style) {
    const style = Object.entries(token.style).map(([key, value]) => `${key}:${value}`).join(";");
    return `<span style="${escapeAttr(style)}">${text}</span>`;
  }
  return text;
}

/** Lines `from`–`to` (1-based, inclusive) of a highlighted file, as a
 *  `<code>` grid with line numbers. The numbers are CSS content, so they
 *  never end up in a copied selection; with `anchors` each line carries
 *  the `L<n>` id the rest of the page links to, otherwise the numbers link
 *  there. Server component. The lines are one HTML string rather than an
 *  element per token, so the page's RSC payload repeats a string, not a
 *  tree of thousands of spans. */
export function CodeLines({
  lines,
  from,
  to,
  anchors = false,
  linkNumbers = true,
  highlight,
  className,
}: {
  lines: HighlightedLine[];
  from: number;
  to: number;
  anchors?: boolean;
  /** Line numbers link to `#L<n>` (the whole recipe). */
  linkNumbers?: boolean;
  /** 1-based line numbers to mark. */
  highlight?: ReadonlySet<number>;
  className?: string;
}) {
  let html = "";
  for (let n = from; n <= to && n <= lines.length; n++) {
    const id = anchors ? ` id="L${n}"` : "";
    const marked = highlight?.has(n) ? ' data-highlighted=""' : "";
    const number = linkNumbers
      ? `<a class="cb-ln" href="#L${n}" data-n="${n}" aria-hidden="true" tabindex="-1"></a>`
      : `<span class="cb-ln" data-n="${n}" aria-hidden="true"></span>`;
    html += `<span${id} class="cb-line"${marked}>${number}<span class="cb-lc">${(lines[n - 1] ?? []).map(tokenHtml).join("")}</span></span>\n`;
  }
  return <code className={cn("cb-code-lines", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** The plain text of lines `from`–`to` (for Copy). */
export function linesText(code: string, from: number, to: number): string {
  return code.split("\n").slice(from - 1, to).join("\n");
}

/** Parses "4-7" or "2,4-5" into 1-based line numbers relative to `start`
 *  (1 = the excerpt's first line). */
export function parseHighlight(spec: string | undefined, start: number): Set<number> {
  const out = new Set<number>();
  if (!spec) return out;
  for (const part of spec.split(",")) {
    const m = /^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/.exec(part);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(start + i - 1);
  }
  return out;
}
