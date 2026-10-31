/**
 * Static detection over a composed pen and its sample Markdown: imports and
 * the engine symbols used, the config factory's top-level keys, the fonts in
 * `FONTS`, resource kinds, and the directives and inline constructs of the
 * content. The capture also records the real config; this module stays
 * static so the site, the lint and the tests can run without a browser.
 *
 * Pure and isomorphic: no I/O.
 */
import type { Level, ComposedPen } from "./types.ts";
import { type JsScan, scanJs, lineAt, matchBracket } from "./detect/scan.ts";

export { scanJs, matchBracket, lineAt, lineLookup } from "./detect/scan.ts";
export type { JsLiteral, JsScan } from "./detect/scan.ts";

// ─── Engine vocabularies (checked against packages/postext by the tests) ────

/** Top-level keys of `PostextConfig` (packages/postext/src/types.ts). */
export const CONFIG_KEYS: readonly string[] = [
  "page", "layout", "bodyText", "headings", "tableStyle", "tableStyles", "captionStyle",
  "diagramStyle", "scoreStyle", "scoreStyles", "videoStyle", "paragraphStyles", "calloutStyles", "chipStyles", "markStyles", "parts", "headingStyles", "toc",
  "index", "unorderedLists", "orderedLists", "math", "footnotes", "crossRefs", "citations", "links", "cjk", "header", "footer", "locale", "direction", "numerals", "debug",
  "htmlViewer", "canvasViewer", "pdfGeneration", "folio", "colorPalette", "customFonts", "resourceTypes", "comics", "print", "lineNumbers", "codeStyle", "contrast", "checks",
  "pageTemplates", "labelStyles", "frameLooks", "composedViewerLeaf", "exerciseStyles", "exercises",
];

/** The parser's single-line directives and fenced containers
 *  (KNOWN_DIRECTIVES / KNOWN_CONTAINERS in packages/postext/src/parse). */
export const KNOWN_DIRECTIVES: readonly string[] = ["pagebreak", "numbering", "columnbreak", "space", "toc", "index", "bibliography", "references", "verse", "page", "strip", "figure", "solutions"];
export const KNOWN_CONTAINERS: readonly string[] = ["callout", "paragraphs", "part", "columns", "paper", "frame", "module", "exercise", "solution", "hint"];

/** The engine's fence line: `:::name` with an optional `{attrs}` block. */
const DIRECTIVE_LINE = /^:::\s*([a-z][a-z0-9-]*)(?:\s*\{([^}]*)\})?\s*$/;
/** The only form the parser accepts for an inline resource embed. */
export const RESOURCE_EMBED = /^::resource\s*\{id="([^"]+)"\}\s*$/;
/** The embed sent to a slot of a composed page (#854): `id` and `slot`
 *  only, in either order. */
export const RESOURCE_SLOT_EMBED = /^::resource\s*\{\s*(?:id="[^"]+"\s+slot=(?:"[^"]*"|'[^']*'|[\w-]+)|slot=(?:"[^"]*"|'[^']*'|[\w-]+)\s+id="[^"]+")\s*\}\s*$/;
/** A composed page's fences (#854): `::::page{template=…}` and the bare
 *  fence of four colons or more that closes it. */
const COMPOSED_PAGE_LINE = /^:{4,}\s*page\s*(?:\{[^}]*\})?\s*$/;

export const POSTEXT_URL = "https://esm.sh/postext";
/** esm.sh's single-file build, which maths recipes needed up to postext 1.4
 *  (EF-15). Since 1.5 the plain URL loads MathJax too; a maths recipe may
 *  still import from this one, and no other recipe may. */
export const POSTEXT_BUNDLE_URL = "https://esm.sh/postext?bundle";
export const POSTEXT_PDF_URL = "https://esm.sh/postext-pdf";
/** The citation engine (CSL styles; postext >= 1.12). */
export const POSTEXT_CITEPROC_URL = "https://esm.sh/postext-citeproc";
/** The 3D book viewer (Folio recipes). */
export const POSTEXT_FOLIO_URL = "https://esm.sh/postext-folio";
/** The EPUB 3 writer (EPUB recipes). */
export const POSTEXT_EPUB_URL = "https://esm.sh/postext-epub";
/** The EPUB writer on a worker (`createEpubWorker`). */
export const POSTEXT_EPUB_WORKER_URL = "https://esm.sh/postext-epub/worker";
/** The layout worker's client (worker recipes, `engine.worker`). */
export const POSTEXT_WORKER_URL = "https://esm.sh/postext/worker";

// ─── Imports and API ────────────────────────────────────────────────────────

export interface PenImport {
  url: string;
  /** Imported names (`a as b` → "a"). */
  names: string[];
  /** Local bindings of those names (`a as b` → "b"). */
  locals: string[];
  default?: string;
  namespace?: string;
  dynamic: boolean;
  line: number;
  start: number;
  end: number;
}

const STATIC_IMPORT =
  /\bimport\s*(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\}|\*\s*as\s+([A-Za-z_$][\w$]*))?\s*(?:from\s*)?(['"])([^'"\n]+)\4\s*;?/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(['"`])([^'"`\n]+)\1\s*\)/g;

/** Static and dynamic imports with a literal URL. */
export function parseImports(js: string, scan: JsScan = scanJs(js)): PenImport[] {
  const out: PenImport[] = [];
  for (const m of scan.code.matchAll(STATIC_IMPORT)) {
    const start = m.index ?? 0;
    if (scan.bare[start] !== "i") continue; // inside a literal
    const specifiers = (m[2] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [name, local] = s.split(/\s+as\s+/);
        return { name: name.trim(), local: (local ?? name).trim() };
      });
    out.push({
      url: m[5],
      names: specifiers.map((s) => s.name),
      locals: specifiers.map((s) => s.local),
      default: m[1],
      namespace: m[3],
      dynamic: false,
      line: lineAt(js, start),
      start,
      end: start + m[0].length,
    });
  }
  for (const m of scan.code.matchAll(DYNAMIC_IMPORT)) {
    const start = m.index ?? 0;
    if (scan.bare[start] !== "i") continue;
    out.push({ url: m[2], names: [], locals: [], dynamic: true, line: lineAt(js, start), start, end: start + m[0].length });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** True for the engine's module URLs (any version or query: the lint
 *  decides which forms are allowed). */
export function isEngineUrl(url: string): boolean {
  return /^https:\/\/esm\.sh\/postext(-pdf|-citeproc|-folio|-epub)?(@[^/?]*)?(\/worker)?(\?.*)?$/.test(url);
}

/** `text` as a literal inside a regular expression (backslash included). */
function escapeRegExp(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

/** True when `name` appears in `code` as an identifier of its own: not part
 *  of a longer name and not a property access (`x.name`), though a spread
 *  (`...name`) counts. */
export function referencesIdentifier(code: string, name: string): boolean {
  const escaped = escapeRegExp(name);
  return new RegExp(`(^|[^\\w$.]|\\.\\.\\.)${escaped}(?![\\w$])`).test(code);
}

/** Engine symbols the pen imports and actually references. */
export function usedApis(js: string, scan: JsScan = scanJs(js), imports = parseImports(js, scan)): string[] {
  const chars = scan.bare.split("");
  for (const imp of imports) for (let k = imp.start; k < imp.end; k++) if (chars[k] !== "\n") chars[k] = " ";
  const rest = chars.join("");
  const used = new Set<string>();
  for (const imp of imports) {
    if (!isEngineUrl(imp.url)) continue;
    imp.names.forEach((name, i) => {
      if (referencesIdentifier(rest, imp.locals[i])) used.add(name);
    });
  }
  return [...used].sort();
}

// ─── Config ─────────────────────────────────────────────────────────────────

// A factory (`const config = () => ({`) or, since postext 1.25 checks a
// config changed in place (#629), one object (`const config = {`).
const CONFIG_FACTORY = /\bconst\s+config\s*=\s*(?:\(\s*\)\s*=>\s*\(\s*)?\{/;

/** Offsets of the config factory's object literal braces, or null. */
export function configObjectRange(scan: JsScan): [number, number] | null {
  const m = CONFIG_FACTORY.exec(scan.code);
  if (!m) return null;
  const open = (m.index ?? 0) + m[0].length - 1;
  const close = matchBracket(scan.bare, open);
  return close === -1 ? null : [open, close];
}

/** Keys of the object literal whose `{` is at `open` (shorthand and quoted
 *  keys included; spreads and computed keys skipped), in source order. */
export function objectKeys(scan: JsScan, open: number): string[] {
  const keys: string[] = [];
  const { code, bare } = scan;
  let depth = 0;
  let expectKey = true;
  for (let k = open + 1; k < bare.length; k++) {
    const c = bare[k];
    if (depth === 0 && expectKey && !/\s/.test(c)) {
      expectKey = false;
      const m = /^(?:([A-Za-z_$][\w$]*)|(['"])((?:\\.|[^\\])*?)\2)\s*([:,}(])/.exec(code.slice(k, k + 200));
      if (m) keys.push(m[1] ?? m[3]);
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) break;
      depth--;
    } else if (c === "," && depth === 0) expectKey = true;
  }
  return keys;
}

/** The offset where `key`'s value starts at the top level of the object
 *  literal whose `{` is at `open` (the first such key), or -1. */
export function objectValueAt(scan: JsScan, open: number, key: string): number {
  const { code, bare } = scan;
  let depth = 0;
  let expectKey = true;
  for (let k = open + 1; k < bare.length; k++) {
    const c = bare[k];
    if (depth === 0 && expectKey && !/\s/.test(c)) {
      expectKey = false;
      const m = /^(?:([A-Za-z_$][\w$]*)|(['"])((?:\\.|[^\\])*?)\2)\s*:\s*/.exec(code.slice(k, k + 200));
      if (m && (m[1] ?? m[3]) === key) return k + m[0].length;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) break;
      depth--;
    } else if (c === "," && depth === 0) expectKey = true;
  }
  return -1;
}

/** The string a config path holds in `const config = () => ({ … })`
 *  (`configString(scan, "page.binding")` → "right"), through nested object
 *  literals only; undefined when it is not a plain string there. */
export function configString(scan: JsScan, dotted: string): string | undefined {
  const range = configObjectRange(scan);
  if (!range) return undefined;
  let open = range[0];
  const keys = dotted.split(".");
  for (const [i, key] of keys.entries()) {
    const at = objectValueAt(scan, open, key);
    if (at === -1) return undefined;
    if (i === keys.length - 1) {
      return stringAt(scan.code, at, 1);
    }
    if (scan.bare[at] !== "{") return undefined;
    open = at;
  }
  return undefined;
}

/** The string at `at`: a literal, a `t({ … })` per edition, or a top-level
 *  `const` holding one (`locale: LOCALE` with `const LOCALE = t({ … })`),
 *  followed `depth` times. */
function stringAt(code: string, at: number, depth: number): string | undefined {
  const head = code.slice(at, at + 400);
  const literal = /^(['"`])([^'"`\n]*)\1/.exec(head)?.[2];
  if (literal !== undefined) return literal;
  const edition = editionString(code, head);
  if (edition !== undefined || depth <= 0) return edition;
  const name = /^([A-Za-z_$][\w$]*)\s*[,}\n]/.exec(head)?.[1];
  const decl = name ? new RegExp(`^const ${escapeRegExp(name)}\\s*=\\s*`, "m").exec(code) : null;
  return decl ? stringAt(code, decl.index + decl[0].length, depth - 1) : undefined;
}

/** A value written per edition, `t({ en: 'en', ja: 'ja', zh: 'zh-Hans' })`,
 *  read for the edition the composed pen sets (`const LANG = 'ja';`), else
 *  its first entry, as the kit's `t` does. */
function editionString(code: string, head: string): string | undefined {
  const call = /^t\(\s*\{([^}]*)\}\s*\)/.exec(head)?.[1];
  if (call === undefined) return undefined;
  const entries = [...call.matchAll(/([A-Za-z-]+|'[^']*'|"[^"]*")\s*:\s*(['"`])([^'"`\n]*)\2/g)]
    .map((m) => [m[1]!.replace(/^['"]|['"]$/g, ""), m[3]!] as const);
  const lang = /^const LANG = (['"])([a-z]+)\1/m.exec(code)?.[2];
  return entries.find(([key]) => key === lang)?.[1] ?? entries[0]?.[1];
}

/** Top-level keys of `const config = () => ({ … })`, unique, in source order. */
export function configKeys(js: string, scan: JsScan = scanJs(js)): string[] {
  const range = configObjectRange(scan);
  return range ? [...new Set(objectKeys(scan, range[0]))] : [];
}

// ─── Fonts ──────────────────────────────────────────────────────────────────

export interface FontFaceSpec {
  family: string;
  weight: number;
  style: "normal" | "italic";
}

/** The faces of `const FONTS = { Family: ['400', '400i', '700'] }`. */
export function penFonts(js: string, scan: JsScan = scanJs(js)): FontFaceSpec[] {
  const m = /\bconst\s+FONTS\s*=\s*\{/.exec(scan.code);
  if (!m) return [];
  const open = (m.index ?? 0) + m[0].length - 1;
  const close = matchBracket(scan.bare, open);
  if (close === -1) return [];
  const body = scan.code.slice(open + 1, close);
  const faces: FontFaceSpec[] = [];
  const entry = /(?:([A-Za-z_$][\w$]*)|(['"])(.*?)\2)\s*:\s*\[([^\]]*)\]/g;
  for (const e of body.matchAll(entry)) {
    const family = e[1] ?? e[3];
    for (const spec of e[4].matchAll(/['"]?(\d{3})(i?)['"]?/g)) {
      faces.push({ family, weight: Number(spec[1]), style: spec[2] ? "italic" : "normal" });
    }
  }
  return faces;
}

export function fontFamilies(faces: readonly FontFaceSpec[]): string[] {
  return [...new Set(faces.map((face) => face.family))];
}

// ─── Markdown ───────────────────────────────────────────────────────────────

export interface MarkdownConstructs {
  /** `:::name` directives and containers, `::resource`, `$$` display math. */
  directives: string[];
  /** `:ref`, `:chip`, `:swatch`, `:tab`, `$…$`, `^…^`, `~…~`, `{attrs}` (heading attributes), `\\` (title break). */
  inline: string[];
  /** `:::name` lines whose name the parser does not know (printed as text). */
  unknown: string[];
}

/** The Postext constructs a sample document uses, in first-use order. */
export function markdownConstructs(markdown: string): MarkdownConstructs {
  const directives = new Set<string>();
  const inline = new Set<string>();
  const unknown = new Set<string>();
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let start = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
    if (end > 0) start = end + 1;
  }
  for (const raw of lines.slice(start)) {
    const line = raw.trim();
    const fence = DIRECTIVE_LINE.exec(line);
    if (fence) {
      const name = fence[1];
      // `:::label` is a figure's label written line by line (#1058), read inside a `:::figure`.
      if (KNOWN_DIRECTIVES.includes(name) || KNOWN_CONTAINERS.includes(name) || name === "label") directives.add(`:::${name}`);
      else unknown.add(name);
      continue;
    }
    if (line.startsWith("::resource")) {
      directives.add("::resource");
      continue;
    }
    if (COMPOSED_PAGE_LINE.test(line)) {
      directives.add("::::page");
      continue;
    }
    if (/^:{4,}\s*$/.test(line)) continue;
    if (/^\$\$/.test(line)) directives.add("$$");
    if (/:ref\{/.test(line)) inline.add(":ref");
    if (/:chip\[/.test(line)) inline.add(":chip");
    if (/:swatch\{/.test(line)) inline.add(":swatch");
    // A bare `:tab` followed by a letter is text (`3:table`), as the parser reads it.
    if (/:tab(?:\{|(?!\p{L}))/u.test(line)) inline.add(":tab");
    const withoutDisplay = line.replace(/\$\$[\s\S]*?\$\$/g, "").replace(/\\\$/g, "");
    if (/\$[^$\s][^$]*\$/.test(withoutDisplay)) inline.add("$…$");
    if (/\^[^\s^]([^^]*[^\s^])?\^/.test(line)) inline.add("^…^");
    if (/(^|[^~])~[^\s~]([^~]*[^\s~])?~(?!~)/.test(line)) inline.add("~…~");
    if (/^#{1,6}\s/.test(line)) {
      if (/\s\{[^{}]*=[^{}]*\}\s*$/.test(line)) inline.add("{attrs}");
      if (line.includes("\\\\")) inline.add("\\\\");
    }
  }
  return { directives: [...directives], inline: [...inline], unknown: [...unknown] };
}

/** Lines starting `::resource` that the parser would not accept (it wants
 *  exactly `::resource{id="…"}` with double quotes, or, on a composed page,
 *  `::resource{id="…" slot="…"}`). */
export function malformedResourceEmbeds(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("::resource") && !RESOURCE_EMBED.test(line) && !RESOURCE_SLOT_EMBED.test(line));
}

// ─── Resources ──────────────────────────────────────────────────────────────

/** Resource objects by kind (`kind: 'bitmap' | 'svg' | 'table'`). */
export function resourceKinds(scan: JsScan): { svg: number; bitmap: number; table: number } {
  const counts = { svg: 0, bitmap: 0, table: 0 };
  for (const m of scan.code.matchAll(/\bkind\s*:\s*['"](svg|bitmap|table)['"]/g)) {
    counts[m[1] as keyof typeof counts]++;
  }
  return counts;
}

// ─── Level ──────────────────────────────────────────────────────────────────

/** The level rubric (spec §2.3) from static signals only. The capture
 *  refines it with the resolved config (leaf and design-element counts). */
export function staticLevel(js: string, detected: Pick<DetectedPen, "apis" | "configKeys">): Level {
  const { apis, configKeys: keys } = detected;
  const code = scanJs(js).code;
  const advanced =
    apis.some((api) => ["buildBundle", "createBundle", "initMathEngine"].includes(api)) ||
    keys.includes("parts") ||
    /\bnew\s+Worker\s*\(/.test(code) ||
    /\brotate\s*:\s*['"](ccw|cw)['"]/.test(code) ||
    /\blayoutType\s*:\s*['"](oneAndHalf|multiple)['"]/.test(code) ||
    /\baddEventListener\s*\(\s*['"](input|change)['"]/.test(code);
  if (advanced) return 3;
  const intermediate =
    apis.includes("renderToPdf") ||
    keys.some((key) => ["headingStyles", "calloutStyles", "tableStyles", "chipStyles", "paragraphStyles"].includes(key)) ||
    /\badvancedDesign\s*:/.test(code) ||
    /\bplacement\s*:/.test(code) ||
    /\belements\s*:\s*\[\s*\{/.test(code);
  return intermediate ? 2 : 1;
}

// ─── Everything ─────────────────────────────────────────────────────────────

export interface DetectedPen {
  imports: PenImport[];
  /** Engine symbols imported and referenced (postext and postext-pdf). */
  apis: string[];
  /** Top-level keys of the config factory. */
  configKeys: string[];
  directives: string[];
  inline: string[];
  unknownDirectives: string[];
  fonts: FontFaceSpec[];
  families: string[];
  resources: { svg: number; bitmap: number; table: number };
  suggestedLevel: Level;
}

/** Everything detect.ts knows about a pen. `markdown` is the sample (or all
 *  of its slots); by default the composed pen's own content is not parsed
 *  back out of the literal, so pass the content files. */
export function detectPen(pen: Pick<ComposedPen, "js">, markdown: string | readonly string[] = []): DetectedPen {
  const scan = scanJs(pen.js);
  const imports = parseImports(pen.js, scan);
  const apis = usedApis(pen.js, scan, imports);
  const keys = configKeys(pen.js, scan);
  const directives = new Set<string>();
  const inline = new Set<string>();
  const unknown = new Set<string>();
  for (const md of [markdown].flat()) {
    const found = markdownConstructs(md);
    found.directives.forEach((d) => directives.add(d));
    found.inline.forEach((d) => inline.add(d));
    found.unknown.forEach((d) => unknown.add(d));
  }
  const fonts = penFonts(pen.js, scan);
  return {
    imports,
    apis,
    configKeys: keys,
    directives: [...directives],
    inline: [...inline],
    unknownDirectives: [...unknown],
    fonts,
    families: fontFamilies(fonts),
    resources: resourceKinds(scan),
    suggestedLevel: staticLevel(pen.js, { apis, configKeys: keys }),
  };
}
