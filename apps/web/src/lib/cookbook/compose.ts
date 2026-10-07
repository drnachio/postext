/**
 * Pen composition. A recipe's `script.js` is a source with markers:
 *
 *   const LANG = 'en'; // @lang           → the edition's language
 *   /* @content *\/ ''                    → a literal of content.<lang>.md
 *   /* @content:<slot> *\/ ''             → a literal of content.<slot>.<lang>.md
 *   /* @content@<lang> *\/ ''             → content.<lang>.md of that edition, in every
 *                                          edition (a manga's original beside each lettering)
 *   // @kit …                             → the kit blocks in `recipe.kit` (last line)
 *
 * The composed file is self-sufficient: CodePen, Copy, the .html download,
 * the capture and the Markdown rendition all use it, so they are identical
 * by construction.
 *
 * Pure and isomorphic: no I/O (sources.ts reads the files).
 */
import type { ComposedPen, KitBlock, Locale, PenJson, RecipeMeta, RecipeSources, SampleLocale } from "./types.ts";
import { KIT_ORDER } from "./types.ts";

/** Bump when composition output changes: it invalidates every capture. */
export const COMPOSE_VERSION = 1;

const LANG_MARKER = /^(\s*const LANG = )'([a-z]{2})'(;\s*\/\/ @lang\b.*)$/m;
const CONTENT_MARKER = /\/\* @content(?::([a-z0-9-]+))?(?:@([a-z]{2}))? \*\/ ''/g;
const KIT_MARKER = /^\/\/ @kit\b.*$/gm;
const REGION_START = /^\s*\/\/ #region ([a-z0-9-]+)(?::\s*(.*))?$/;
const REGION_END = /^\s*\/\/ #endregion\b/;

export const KIT_OPEN =
  "// ─── Kit ── helpers shared by every Cookbook recipe · postext.dev/cookbook ─────";
export const KIT_CLOSE =
  "// ─── /Kit ───────────────────────────────────────────────────────────────────────";

export class ComposeError extends Error {
  constructor(slug: string, message: string) {
    super(`${slug}: ${message}`);
    this.name = "ComposeError";
  }
}

/** The sample edition a site locale shows: its own when the recipe has one,
 *  the Spanish one for Catalan when there is one, otherwise the first sample
 *  language. */
export function variantFor(meta: Pick<RecipeMeta, "sample">, locale: Locale): SampleLocale {
  const has = (l: Locale) => meta.sample.locales.includes(l);
  if (has(locale)) return locale;
  if (locale === "ca" && has("es")) return "es";
  return meta.sample.locales[0];
}

/** A JavaScript literal holding `text` exactly. `String.raw` keeps the
 *  Markdown readable (Postext's `\\` line breaks and `\$` survive as typed);
 *  text it cannot hold falls back to an escaped template literal. So does
 *  text with `</script`: the .html download escapes it as `<\/script`, which
 *  a raw literal would keep, backslash and all. */
export function contentLiteral(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  const rawSafe = !normalized.includes("`") && !normalized.includes("${") && !/\\$/.test(normalized)
    && !/<\/script/i.test(normalized);
  if (rawSafe) return "String.raw`" + normalized + "`";
  return (
    "`" +
    normalized.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") +
    "`"
  );
}

function countLines(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

function contentFor(
  sources: RecipeSources,
  key: string | undefined,
  variant: SampleLocale,
  fallback: SampleLocale,
): string {
  const prefix = key ? `${key}.` : "";
  const text = sources.content[`${prefix}${variant}`] ?? sources.content[`${prefix}${fallback}`];
  if (text === undefined) {
    const file = key ? `content.${key}.${variant}.md` : `content.${variant}.md`;
    throw new ComposeError(sources.slug, `missing ${file} (and no ${fallback} fallback)`);
  }
  return text;
}

export interface ComposeOptions {
  /** Kit block sources, keyed by block (from cookbook/_kit/<block>.js). */
  kit: Partial<Record<KitBlock, string>>;
}

/** Composes one edition of a recipe. */
export function composePen(
  sources: RecipeSources,
  meta: Pick<RecipeMeta, "sample" | "kit">,
  variant: SampleLocale,
  { kit }: ComposeOptions,
): ComposedPen {
  const { slug } = sources;
  const fallback = meta.sample.locales[0];
  const script = sources.script.replace(/\r\n?/g, "\n");

  if (!LANG_MARKER.test(script)) {
    throw new ComposeError(slug, "script.js needs `const LANG = 'en'; // @lang`");
  }
  let js = script.replace(LANG_MARKER, `$1'${variant}'$3`);

  // Content literals, tracking the lines each one spans in the output.
  const contentRanges: [number, number][] = [];
  let out = "";
  let last = 0;
  for (const match of js.matchAll(CONTENT_MARKER)) {
    const index = match.index ?? 0;
    out += js.slice(last, index);
    // `@<lang>` pins the edition: every edition inlines that one's file.
    const pinned = match[2] as SampleLocale | undefined;
    const literal = contentLiteral(contentFor(sources, match[1], pinned ?? variant, pinned ?? fallback));
    const start = countLines(out) + 1;
    out += literal;
    contentRanges.push([start, start + countLines(literal)]);
    last = index + match[0].length;
  }
  js = out + js.slice(last);
  // Marker lines inside the sample text (a recipe about code listings) are
  // content, not markers.
  const inContent = (line: number) => contentRanges.some(([a, b]) => line >= a && line <= b);

  // The kit replaces the `// @kit` line, which must be the last one.
  let kitRange: [number, number] | null = null;
  const kitMatch = [...js.matchAll(KIT_MARKER)].find((m) => !inContent(countLines(js.slice(0, m.index)) + 1));
  const blocks = KIT_ORDER.filter((block) => meta.kit.includes(block));
  if (kitMatch) {
    if (js.slice(kitMatch.index + kitMatch[0].length).trim() !== "") {
      throw new ComposeError(slug, "`// @kit` must be the last line of script.js");
    }
    const parts = blocks.map((block) => {
      const code = kit[block];
      if (code === undefined) throw new ComposeError(slug, `unknown kit block "${block}"`);
      return code.replace(/\r\n?/g, "\n").trimEnd();
    });
    const kitText = [KIT_OPEN, ...parts, KIT_CLOSE].join("\n\n");
    const before = js.slice(0, kitMatch.index);
    const start = countLines(before) + 1;
    js = before + kitText + "\n";
    kitRange = [start, start + countLines(kitText)];
  } else if (blocks.length > 0) {
    throw new ComposeError(slug, "recipe.json lists kit blocks but script.js has no `// @kit` line");
  } else {
    js = js.trimEnd() + "\n";
  }

  // Regions (#region id: title … #endregion), contents only.
  const regions: ComposedPen["ranges"]["regions"] = {};
  const lines = js.split("\n");
  let open: { id: string; title: string; start: number } | null = null;
  lines.forEach((line, i) => {
    if (inContent(i + 1)) return;
    const startMatch = REGION_START.exec(line);
    if (startMatch) {
      if (open) throw new ComposeError(slug, `#region ${startMatch[1]} opens inside #region ${open.id}`);
      if (regions[startMatch[1]]) throw new ComposeError(slug, `#region ${startMatch[1]} appears twice`);
      open = { id: startMatch[1], title: (startMatch[2] ?? "").trim(), start: i + 2 };
    } else if (REGION_END.test(line)) {
      if (!open) throw new ComposeError(slug, `#endregion on line ${i + 1} closes nothing`);
      regions[open.id] = { lines: [open.start, i], title: open.title };
      open = null;
    }
  });
  if (open) throw new ComposeError(slug, `#region ${(open as { id: string }).id} is never closed`);

  const folded = (n: number) => inContent(n) || (kitRange !== null && n >= kitRange[0] && n <= kitRange[1]);
  // Generated artwork (`#region art…`) draws the sample's pictures; it is
  // not the technique, so it does not count as the recipe's own code.
  const art = Object.entries(regions)
    .filter(([id]) => /^art(-|$)/.test(id))
    .map(([, region]) => region.lines);
  const isArt = (n: number) => art.some(([a, b]) => n >= a - 1 && n <= b + 1);
  let ownLines = 0;
  lines.forEach((line, i) => {
    if (line.trim() !== "" && !folded(i + 1) && !isArt(i + 1)) ownLines++;
  });

  return {
    slug,
    variant,
    js,
    html: sources.html.replace(/\r\n?/g, "\n").trim(),
    css: sources.css.replace(/\r\n?/g, "\n").trim(),
    pen: sources.pen,
    ranges: { content: contentRanges, kit: kitRange, regions },
    ownLines,
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface PageHtmlOptions {
  title: string;
  /** Extra markup at the end of <head> (the capture's import map). */
  head?: string;
  /** "inline" (default) embeds the script; a URL loads it as a module;
   *  "none" leaves it out (the caller injects its own loader). */
  script?: "inline" | "none" | { src: string };
}

/** A standalone HTML page running the pen: the `.html` download, the dev
 *  server and the capture page are all this. */
export function pageHtml(pen: ComposedPen, { title, head = "", script = "inline" }: PageHtmlOptions): string {
  const links = (pen.pen.stylesheets ?? []).map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`);
  const scripts = (pen.pen.scripts ?? []).map((src) => `<script src="${escapeHtml(src)}"></script>`);
  const body =
    script === "inline"
      ? `<script type="module">\n${pen.js.replace(/<\/script/gi, "<\\/script")}</script>`
      : script === "none"
        ? ""
        : `<script type="module" src="${escapeHtml(script.src)}"></script>`;
  return [
    "<!doctype html>",
    `<html lang="${pen.variant}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    ...links,
    ...scripts,
    pen.css ? `<style>\n${pen.css}\n</style>` : "",
    head,
    "</head>",
    "<body>",
    pen.html,
    body,
    "</body>",
    "</html>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** The JSON for CodePen's "POST to prefill editors" API
 *  (https://blog.codepen.io/documentation/prefill/). */
export function defineData(
  pen: ComposedPen,
  meta: { title: string; description?: string; tags?: string[] },
): string {
  const tags = [...new Set([...(pen.pen.tags ?? []), ...(meta.tags ?? []), "postext", "postext-cookbook"])];
  return JSON.stringify({
    title: meta.title,
    description: meta.description,
    tags,
    html: pen.html,
    css: pen.css,
    js: pen.js,
    // `js_module` lets the JS panel use `import` statements (ES modules).
    js_module: true,
    css_external: (pen.pen.stylesheets ?? []).join(";"),
    js_external: (pen.pen.scripts ?? []).join(";"),
    // HTML and CSS collapsed, JS open: the script is the recipe.
    editors: "001",
  });
}

/** The PenJson shape with defaults, for callers that build one by hand. */
export function penJson(value: unknown): PenJson {
  const obj = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const list = (key: string) =>
    Array.isArray(obj[key]) ? (obj[key] as unknown[]).filter((v): v is string => typeof v === "string") : undefined;
  return { stylesheets: list("stylesheets"), scripts: list("scripts"), tags: list("tags") };
}
