// A rendition's `.md` URL and MDX → Markdown: entities, inline HTML and
// tables, illustrations, CodePen examples and the Cookbook's components
// (#1276: split out of markdown.ts).
import { localizedUrl, SITE_URL } from '@/lib/seo';
import { labelsFor, REPO_URL, messagesFor } from './labels';
import { transcriptMarkdown } from './pages';

/** URL of a page's Markdown rendition: the HTML URL with `.md` appended. */
export function markdownUrl(locale: string, path: string = ""): string {
  return `${localizedUrl(locale, path)}.md`;
}

// ---------------------------------------------------------------------------
// MDX → Markdown
// ---------------------------------------------------------------------------

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** `{'text'}` / `{"text"}` JSX string expressions → their literal text. */
function unwrapJsxStrings(text: string): string {
  return text.replace(/\{'((?:[^'\\]|\\.)*)'\}|\{"((?:[^"\\]|\\.)*)"\}/g, (_, a, b) =>
    (a ?? b).replace(/\\(.)/g, "$1")
  );
}

/** Site paths with a Markdown rendition (proxy.ts negotiates the same ones). */
const RENDITION_PATH =
  /^\/(en|es|ca|zh|ja|ar|pt|fr|de|it)(\/(docs(\/[a-z0-9-]+)?|cookbook(\/[a-z0-9-]+)?|license|privacy-policy|cookie-policy|accessibility|glossary|sandbox))?$/;

/**
 * A link of a rendition as an agent can follow it out of the page (in
 * llms-full.txt, or pasted into a prompt): a site path becomes absolute and
 * leads to its Markdown rendition, an `#anchor` to the rendition's heading.
 * A query (`?cat=`) keeps the HTML page, the one that reads it.
 */
function absoluteHref(href: string, pageUrl: string): string {
  if (href.startsWith("#")) return `${pageUrl}.md${href}`;
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const [, path, rest] = href.match(/^([^?#]*)(.*)$/)!;
  const clean = path!.replace(/(.)\/$/, "$1");
  if (!rest!.startsWith("?") && RENDITION_PATH.test(clean)) return `${SITE_URL}${clean}.md${rest}`;
  return `${SITE_URL}${href}`;
}

/**
 * Inline HTML in a line of prose → inline Markdown (`<code>`, `<em>`,
 * `<strong>`, `<a href>`), and every site link made absolute. Backtick code
 * spans are left as they are: `<a download>` there is the text of a sample.
 */
function inlineMarkdown(
  line: string,
  pageUrl: string,
  finish: { text?: (s: string) => string; code?: (s: string) => string } = {}
): string {
  const text = finish.text ?? ((s: string) => s);
  const code = finish.code ?? ((s: string) => s);
  const spans: string[] = [];
  const hold = (s: string) => `\u0000${spans.push(s) - 1}\u0000`;
  const out = line
    .replace(/(`+)[\s\S]*?\1/g, (s) => hold(text(s)))
    .replace(/<code>([\s\S]*?)<\/code>/g, (_, c: string) => {
      const s = code(c);
      const tick = s.includes("`") ? "``" : "`";
      return hold(`${tick}${s}${tick}`);
    })
    .replace(/<strong>([\s\S]*?)<\/strong>/g, "**$1**")
    .replace(/<em>([\s\S]*?)<\/em>/g, "*$1*")
    .replace(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_, href: string, label: string) => `[${label}](${href})`)
    .replace(/\]\(([/#][^)\s]*)\)/g, (_, href: string) => `](${absoluteHref(href, pageUrl)})`);
  return out
    .split(/(\u0000\d+\u0000)/)
    .map((part, i) => (i % 2 ? spans[Number(part.slice(1, -1))]! : text(part)))
    .join("");
}

/** Inline HTML inside a table cell → inline Markdown on one line. */
function inlineHtmlToMarkdown(html: string, pageUrl: string): string {
  const flat = unwrapJsxStrings(html.replace(/\s*\n\s*/g, " ").trim());
  // Code and prose each decode and escape their own pipes, so the GFM row
  // stays intact. Prose escapes its backslashes first (a literal `\` before
  // a pipe would otherwise eat the pipe's escape); a code span shows
  // backslashes as written, and the table extension only unescapes `\|`.
  return inlineMarkdown(flat, pageUrl, {
    code: (s) => decodeEntities(s).replace(/\|/g, "\\|"),
    text: (s) =>
      decodeEntities(s.replace(/<br\s*\/?>/g, " ").replace(/<\/?(?:span|bdi|p|div|small|sup|sub)\b[^>]*>/g, ""))
        .replace(/\\/g, "\\\\")
        .replace(/\|/g, "\\|"),
  });
}

function htmlTableToMarkdown(table: string, pageUrl: string): string {
  const rows: string[][] = [];
  let headerRows = 0;
  const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;
  const theadEnd = table.indexOf("</thead>");
  while ((m = rowRe.exec(table))) {
    const cells: string[] = [];
    const cellRe = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/g;
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(m[1]!))) {
      cells.push(inlineHtmlToMarkdown(c[3]!, pageUrl));
      const span = c[2]!.match(/colSpan=\{?"?(\d+)/);
      for (let i = 1; i < (span ? parseInt(span[1]!, 10) : 1); i++) cells.push("");
    }
    if (theadEnd >= 0 && m.index < theadEnd) headerRows++;
    rows.push(cells);
  }
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
  const line = (r: string[]) => `| ${pad(r).join(" | ")} |`;
  const header = headerRows > 0 ? rows[0]! : Array(width).fill("");
  const body = headerRows > 0 ? rows.slice(1) : rows;
  return [line(header), line(Array(width).fill("---")), ...body.map(line)].join("\n");
}

function illustrationToMarkdown(tag: string, figureLabel: string): string {
  const data = tag.match(/data='([\s\S]*?)'\s*\/>/);
  if (!data) return "";
  try {
    const parsed = JSON.parse(decodeEntities(data[1]!)) as Record<string, unknown>;
    const title = typeof parsed.title === "string" ? parsed.title : "";
    const desc = typeof parsed.desc === "string" ? parsed.desc : "";
    const caption = typeof parsed.caption === "string" ? parsed.caption : "";
    const lines = [`> **${figureLabel}: ${title}**`];
    if (desc) lines.push(`> ${desc}`);
    if (caption && caption !== title) lines.push(`>`, `> *${caption}*`);
    return lines.join("\n");
  } catch {
    return "";
  }
}

function codePenToMarkdown(tag: string, labels: ReturnType<typeof labelsFor>): string {
  const attr = (k: string) => tag.match(new RegExp(`${k}="([^"]*)"`))?.[1] ?? "";
  const name = attr("name");
  if (!name) return "";
  const title = attr("title") || name;
  const description = attr("description");
  const src = `${REPO_URL}/tree/main/docs/examples/${name}`;
  return `> **${labels.example}: ${title}**${description ? ` — ${description}` : ""} ([${labels.exampleSource}](${src}))`;
}

/** JSX attributes of a tag: `a="x"`, `a='x'`, `a={3}`, `a={"x"}`. */
function jsxAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z][\w-]*)=(?:"([^"]*)"|'([^']*)'|\{\s*(?:"([^"]*)"|'([^']*)'|([^}]*?))\s*\})/g;
  for (const m of tag.matchAll(re)) attrs[m[1]!] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? "");
  return attrs;
}

/** Block components that stand alone on their lines (`<Excerpt … />`). */
const BLOCK_TAGS = ["Illustration", "CodePenExample", "TutorialVideo", "Screenshot", "Excerpt", "PageShot", "Gotcha"] as const;
type CookbookBlockTag = "Excerpt" | "PageShot" | "Gotcha";
/** Inline components (`<Feature id="x">text</Feature>`, or self-closing). */
const INLINE_TAGS = ["Feature", "RecipeLink", "PageRef"] as const;
type CookbookInlineTag = (typeof INLINE_TAGS)[number];

/**
 * How the Cookbook's MDX components read as Markdown in one recipe (the
 * rendition knows its composed script, pages and registries). Without it,
 * blocks that need that context are dropped and inline ones keep their text.
 */
export interface MdxComponentRenderers {
  block?: Partial<Record<CookbookBlockTag, (attrs: Record<string, string>) => string>>;
  inline?: Partial<Record<CookbookInlineTag, (attrs: Record<string, string>, children: string) => string>>;
}

/** Rewrites the inline components of one prose line. */
function inlineComponents(line: string, renderers?: MdxComponentRenderers): string {
  let out = line;
  for (const tag of INLINE_TAGS) {
    if (!out.includes(`<${tag}`)) continue;
    const render = renderers?.inline?.[tag] ?? ((_: Record<string, string>, children: string) => children);
    // Self-closing first, so a paired match cannot start at one.
    out = out
      .replace(new RegExp(`<${tag}\\b([^>]*?)/>`, "g"), (_, attrs: string) => render(jsxAttrs(attrs), ""))
      .replace(new RegExp(`<${tag}\\b([^>]*?)>([\\s\\S]*?)</${tag}>`, "g"), (_, attrs: string, children: string) =>
        render(jsxAttrs(attrs), children)
      );
  }
  return out;
}

/** Drops a leading YAML frontmatter block (`---` … `---`). */
function stripFrontmatter(source: string): string {
  return source.replace(/^\uFEFF?---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/, "");
}

/**
 * Turns a doc's MDX source into plain Markdown: drops YAML frontmatter, the
 * metadata export and MDX comments, rewrites `<Illustration>` /
 * `<CodePenExample>` into descriptive blockquotes, the Cookbook's components
 * through `renderers` (`<Note>` into a blockquote), HTML tables into GFM
 * tables, and decodes the entities MDX needs. Fenced code blocks pass
 * through untouched.
 */
export function mdxToMarkdown(
  source: string,
  locale: string,
  pageUrl: string,
  renderers?: MdxComponentRenderers
): string {
  const labels = labelsFor(locale);
  const lines = stripFrontmatter(source.replace(/\r\n/g, "\n")).split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  let buffer: string[] | null = null; // multi-line JSX element being collected
  type BufferKind = "table" | "meta" | "comment" | "tag" | "note";
  let bufferKind: BufferKind | null = null;

  // An authored `<abbr title="…">PDF</abbr>` keeps its text only, and so
  // does a language span or isolate around a sample (`<span lang="ja"
  // className="font-body">縦書き</span>`, `<bdi dir="ltr">`).
  const prose = (line: string) =>
    decodeEntities(
      inlineMarkdown(
        unwrapJsxStrings(
          inlineComponents(line, renderers)
            .replace(/<abbr\b[^>]*>(.*?)<\/abbr>/g, "$1")
            .replace(/<\/?(?:span|bdi)\b[^>]*>/g, "")
            .replace(/\\([{}])/g, "$1")
        ),
        pageUrl
      )
    );

  const flushBuffer = () => {
    const text = buffer!.join("\n");
    const trimmed = text.trim();
    if (bufferKind === "table") out.push(htmlTableToMarkdown(text, pageUrl));
    else if (bufferKind === "tag") {
      const name = /^<([A-Za-z]+)/.exec(trimmed)?.[1];
      if (name === "Illustration") out.push(illustrationToMarkdown(text, labels.figure));
      else if (name === "CodePenExample") out.push(codePenToMarkdown(text, labels));
      // the player has no Markdown form: name the video (the page links it)
      else if (name === "TutorialVideo") {
        out.push(`> *${messagesFor(locale).Tutorial.title}* · ${messagesFor(locale).Tutorial.watch}`, "", transcriptMarkdown("tutorial", locale));
      }
      // a capture of the Sandbox: the picture at its address on the site, then its caption
      else if (name === "Screenshot") {
        const attrs = jsxAttrs(trimmed);
        if (attrs.src && attrs.alt) {
          const image = `![${attrs.alt.replace(/[[\]]/g, "")}](${new URL(attrs.src, SITE_URL).href})`;
          out.push(attrs.caption ? `${image}\n\n*${attrs.caption}*` : image);
        }
      }
      else if (name === "Excerpt" || name === "PageShot" || name === "Gotcha") {
        const attrs = jsxAttrs(trimmed);
        const render = renderers?.block?.[name];
        if (render) out.push(render(attrs));
        else if (name === "PageShot" && attrs.caption) out.push(`*${attrs.caption}*`);
      }
    } else if (bufferKind === "note") {
      // `<Note>` … `</Note>`: an aside, as a blockquote.
      const inner = trimmed.replace(/^<Note\b[^>]*>/, "").replace(/<\/Note>$/, "").trim();
      out.push(
        inner
          .split("\n")
          .map((l) => prose(l.trim()))
          .map((l) => (l ? `> ${l}` : ">"))
          .join("\n")
      );
    }
    buffer = null;
    bufferKind = null;
  };

  for (const line of lines) {
    if (buffer) {
      buffer.push(line);
      const done =
        (bufferKind === "table" && /<\/table>/.test(line)) ||
        (bufferKind === "meta" && /^\};?\s*$/.test(line)) ||
        (bufferKind === "comment" && /\*\/\}/.test(line)) ||
        (bufferKind === "tag" && /\/>\s*$/.test(line)) ||
        (bufferKind === "note" && /<\/Note>/.test(line));
      if (done) flushBuffer();
      continue;
    }

    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === null) fence = marker;
      else if (line.trim().startsWith(fence) && line.trim().replace(/[`~]/g, "") === "") fence = null;
      out.push(line);
      continue;
    }
    if (fence !== null) {
      out.push(line);
      continue;
    }

    const trimmed = line.trim();
    let kind: BufferKind | null = null;
    if (/^export\s+const\s+metadata\s*=/.test(trimmed)) kind = "meta";
    else if (trimmed.startsWith("{/*")) kind = "comment";
    else if (trimmed.startsWith("<table")) kind = "table";
    else if (new RegExp(`^<(${BLOCK_TAGS.join("|")})\\b`).test(trimmed)) kind = "tag";
    else if (/^<Note\b/.test(trimmed)) kind = "note";
    else if (/^(import|export)\s/.test(trimmed)) continue;

    if (kind) {
      buffer = [line];
      bufferKind = kind;
      const closesNow =
        (kind === "table" && /<\/table>/.test(line)) ||
        (kind === "meta" && /\}\s*;?\s*$/.test(trimmed) && trimmed.includes("{") && !trimmed.endsWith("{")) ||
        (kind === "comment" && /\*\/\}/.test(line)) ||
        (kind === "tag" && /\/>\s*$/.test(line)) ||
        (kind === "note" && /<\/Note>/.test(line));
      if (closesNow) flushBuffer();
      continue;
    }

    out.push(prose(line));
  }
  if (buffer) flushBuffer();

  return collapseBlankLines(out.join("\n")).trim();
}

/** Squeezes runs of blank lines to one, outside fenced code. */
export function collapseBlankLines(markdown: string): string {
  let fence: string | null = null;
  let blank = false;
  const out: string[] = [];
  for (const line of markdown.split("\n")) {
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      if (fence === null) fence = f[1]!;
      else if (line.trim().startsWith(fence) && line.trim().replace(/[`~]/g, "") === "") fence = null;
    } else if (fence === null && line.trim() === "") {
      if (blank) continue;
      blank = true;
      out.push(line.trim());
      continue;
    }
    blank = false;
    out.push(line);
  }
  return out.join("\n");
}
