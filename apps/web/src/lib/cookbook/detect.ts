/**
 * Static detection over a composed pen and its sample Markdown: imports and
 * the engine symbols used, the config factory's top-level keys, the fonts in
 * `FONTS`, resource kinds, and the directives and inline constructs of the
 * content. The capture also records the real config; this module stays
 * static so the site, the lint and the tests can run without a browser.
 *
 * Pure and isomorphic: no I/O.
 */
import type { ComposedPen, Level } from "./types.ts";

// ─── Engine vocabularies (checked against packages/postext by the tests) ────

/** Top-level keys of `PostextConfig` (packages/postext/src/types.ts). */
export const CONFIG_KEYS: readonly string[] = [
  "page", "layout", "bodyText", "headings", "tableStyle", "tableStyles", "captionStyle",
  "diagramStyle", "paragraphStyles", "calloutStyles", "chipStyles", "parts", "headingStyles", "toc",
  "index", "unorderedLists", "orderedLists", "math", "footnotes", "crossRefs", "citations", "cjk", "header", "footer", "locale", "direction", "numerals", "debug",
  "htmlViewer", "pdfGeneration", "folio", "colorPalette", "customFonts", "resourceTypes",
];

/** The parser's single-line directives and fenced containers
 *  (KNOWN_DIRECTIVES / KNOWN_CONTAINERS in packages/postext/src/parse). */
export const KNOWN_DIRECTIVES: readonly string[] = ["pagebreak", "numbering", "columnbreak", "space", "toc", "index", "bibliography", "references", "verse"];
export const KNOWN_CONTAINERS: readonly string[] = ["callout", "paragraphs", "part", "columns", "paper"];

/** The engine's fence line: `:::name` with an optional `{attrs}` block. */
const DIRECTIVE_LINE = /^:::\s*([a-z][a-z0-9-]*)\s*(?:\{([^}]*)\})?\s*$/;
/** The only form the parser accepts for an inline resource embed. */
export const RESOURCE_EMBED = /^::resource\s*\{id="([^"]+)"\}\s*$/;

export const POSTEXT_URL = "https://esm.sh/postext";
export const POSTEXT_BUNDLE_URL = "https://esm.sh/postext?bundle";
export const POSTEXT_PDF_URL = "https://esm.sh/postext-pdf";
/** The citation engine (CSL styles; postext >= 1.12). */
export const POSTEXT_CITEPROC_URL = "https://esm.sh/postext-citeproc";
/** The 3D book viewer (Folio recipes). */
export const POSTEXT_FOLIO_URL = "https://esm.sh/postext-folio";
/** The layout worker's client (worker recipes, `engine.worker`). */
export const POSTEXT_WORKER_URL = "https://esm.sh/postext/worker";

// ─── A small JavaScript scanner ─────────────────────────────────────────────

export interface JsLiteral {
  kind: "string" | "template" | "regex";
  /** Offsets of the whole literal, delimiters included. */
  start: number;
  end: number;
  /** The literal's text without delimiters; template expressions become "\u0000". */
  text: string;
}

export interface JsScan {
  /** The source with comments blanked (newlines kept, offsets unchanged). */
  code: string;
  /** Also with the insides of strings, templates and regexes blanked. */
  bare: string;
  literals: JsLiteral[];
  comments: { start: number; end: number; text: string }[];
}

const REGEX_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do",
  "else", "await", "yield",
]);

/** Splits JavaScript into code, comments and literals, well enough for
 *  pens: strings, nested template literals and regex literals (told apart
 *  from division by the previous token). */
export function scanJs(src: string): JsScan {
  const code = src.split("");
  const bare = src.split("");
  const literals: JsLiteral[] = [];
  const comments: JsScan["comments"] = [];
  const n = src.length;
  // The previous significant token: "" at the start, "id:<word>", "num", "lit" or a punctuator.
  let prev = "";

  const blank = (chars: string[], from: number, to: number) => {
    for (let k = from; k < to; k++) if (chars[k] !== "\n") chars[k] = " ";
  };

  const regexAllowed = () => {
    if (prev === "") return true;
    if (prev.startsWith("id:")) return REGEX_KEYWORDS.has(prev.slice(3));
    return !(prev === "num" || prev === "lit" || prev === ")" || prev === "]" || prev === "}");
  };

  function scanString(start: number): number {
    const quote = src[start];
    let i = start + 1;
    let text = "";
    while (i < n && src[i] !== quote && src[i] !== "\n") {
      if (src[i] === "\\" && i + 1 < n) {
        text += src[i + 1];
        i += 2;
      } else text += src[i++];
    }
    const end = Math.min(i + 1, n);
    blank(bare, start + 1, end - 1);
    literals.push({ kind: "string", start, end, text });
    prev = "lit";
    return end;
  }

  function scanTemplate(start: number): number {
    let i = start + 1;
    let text = "";
    let quasiStart = i;
    while (i < n && src[i] !== "`") {
      if (src[i] === "\\" && i + 1 < n) {
        text += src.slice(i, i + 2);
        i += 2;
      } else if (src[i] === "$" && src[i + 1] === "{") {
        blank(bare, quasiStart, i);
        text += "\u0000";
        i = scanCode(i + 2, true);
        quasiStart = i;
      } else text += src[i++];
    }
    blank(bare, quasiStart, i);
    const end = Math.min(i + 1, n);
    literals.push({ kind: "template", start, end, text });
    prev = "lit";
    return end;
  }

  function scanRegex(start: number): number {
    let i = start + 1;
    let inClass = false;
    while (i < n && src[i] !== "\n") {
      const c = src[i];
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) break;
      i++;
    }
    const body = src.slice(start + 1, i);
    blank(bare, start + 1, i);
    i++;
    while (i < n && /[a-z]/i.test(src[i])) i++;
    literals.push({ kind: "regex", start, end: i, text: body });
    prev = "lit";
    return i;
  }

  /** Scans code from `i`; with `untilBrace`, stops after the `}` that closes
   *  a template expression and returns the offset after it. */
  function scanCode(start: number, untilBrace: boolean): number {
    let i = start;
    let depth = 0;
    while (i < n) {
      const c = src[i];
      const next = src[i + 1];
      if (c === "/" && next === "/") {
        let j = i;
        while (j < n && src[j] !== "\n") j++;
        comments.push({ start: i, end: j, text: src.slice(i, j) });
        blank(code, i, j);
        blank(bare, i, j);
        i = j;
      } else if (c === "/" && next === "*") {
        const close = src.indexOf("*/", i + 2);
        const j = close === -1 ? n : close + 2;
        comments.push({ start: i, end: j, text: src.slice(i, j) });
        blank(code, i, j);
        blank(bare, i, j);
        i = j;
      } else if (c === "'" || c === '"') {
        i = scanString(i);
      } else if (c === "`") {
        i = scanTemplate(i);
      } else if (c === "/" && regexAllowed()) {
        i = scanRegex(i);
      } else if (/[A-Za-z_$]/.test(c)) {
        let j = i + 1;
        while (j < n && /[\w$]/.test(src[j])) j++;
        prev = `id:${src.slice(i, j)}`;
        i = j;
      } else if (/[0-9]/.test(c)) {
        let j = i + 1;
        while (j < n && /[\w.]/.test(src[j])) j++;
        prev = "num";
        i = j;
      } else if (/\s/.test(c)) {
        i++;
      } else {
        if (c === "{") depth++;
        else if (c === "}") {
          if (untilBrace && depth === 0) {
            prev = "}";
            return i + 1;
          }
          depth--;
        }
        prev = c;
        i++;
      }
    }
    return i;
  }

  scanCode(0, false);
  return { code: code.join(""), bare: bare.join(""), literals, comments };
}

/** The offset of the bracket that closes the one at `open`, counting
 *  brackets in `bare` (comments and literal contents blanked); -1 if none. */
export function matchBracket(bare: string, open: number): number {
  let depth = 0;
  for (let i = open; i < bare.length; i++) {
    const c = bare[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 1-based line of an offset. */
export function lineAt(src: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}

/** A fast `lineAt` for many lookups in the same source. */
export function lineLookup(src: string): (offset: number) => number {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

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
  return /^https:\/\/esm\.sh\/postext(-pdf|-citeproc|-folio)?(@[^/?]*)?(\/worker)?(\?.*)?$/.test(url);
}

/** True when `name` appears in `code` as an identifier of its own: not part
 *  of a longer name and not a property access (`x.name`), though a spread
 *  (`...name`) counts. */
export function referencesIdentifier(code: string, name: string): boolean {
  const escaped = name.replace(/[$]/g, "\\$");
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

const CONFIG_FACTORY = /\bconst\s+config\s*=\s*\(\s*\)\s*=>\s*\(\s*\{/;

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
    if (i === keys.length - 1) return /^(['"`])([^'"`\n]*)\1/.exec(scan.code.slice(at, at + 200))?.[2];
    if (scan.bare[at] !== "{") return undefined;
    open = at;
  }
  return undefined;
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
  /** `:ref`, `:chip`, `:swatch`, `$…$`, `^…^`, `~…~`, `{attrs}` (heading attributes), `\\` (title break). */
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
      if (KNOWN_DIRECTIVES.includes(name) || KNOWN_CONTAINERS.includes(name)) directives.add(`:::${name}`);
      else unknown.add(name);
      continue;
    }
    if (line.startsWith("::resource")) {
      directives.add("::resource");
      continue;
    }
    if (/^\$\$/.test(line)) directives.add("$$");
    if (/:ref\{/.test(line)) inline.add(":ref");
    if (/:chip\[/.test(line)) inline.add(":chip");
    if (/:swatch\{/.test(line)) inline.add(":swatch");
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
 *  exactly `::resource{id="…"}` with double quotes). */
export function malformedResourceEmbeds(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("::resource") && !RESOURCE_EMBED.test(line));
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
    /\blayoutType\s*:\s*['"]oneAndHalf['"]/.test(code) ||
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
