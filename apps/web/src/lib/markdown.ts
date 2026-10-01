/**
 * Plain-Markdown renditions of the site's pages, for LLMs and agents
 * (`/<locale>/<page>.md`, `Accept: text/markdown`, `llms.txt`,
 * `llms-full.txt`). Everything is derived from the same sources the HTML
 * pages render — the MDX docs, the Cookbook's recipe folders and the message
 * files — so the two never drift.
 */
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import zh from "../../messages/zh.json";
import { routing } from "@/i18n/routing";
import { siteLocale } from "@/i18n/locales";
import { glossarySections } from "@/lib/glossary/glossary";
import { getAllDocs, getDocSource, type DocMeta } from "@/lib/docs";
import { SITE_NAME, SITE_URL, localizedUrl } from "@/lib/seo";
import { FEATURE_KEYS, featureDocPath } from "@/lib/featureDocs";
import { GUIDE_BUNDLE_FILE, GUIDE_BUNDLE_PATH } from "@/lib/guideBundle";
import { TRANSCRIPTS, type TranscriptVideo } from "@/components/landing/transcripts";
import { catalogRecipe } from "@/lib/cookbook/catalog";
import { docAnchorPath } from "@/lib/cookbook/docLinks";
import { captureVariantFor, pageImages, pdfDownload, sandboxLink } from "@/lib/cookbook/images";
import { getAllRecipes, getComposed, getRecipe, getVisibleRecipes, recipeHref, writeupFor } from "@/lib/cookbook/recipes";
import { loadRegistry } from "@/lib/cookbook/registry";
import { relatedRecipes } from "@/lib/cookbook/related";
import type { ComposedPen, Credit, DocAnchor, LicenseId, Locale, Recipe, Registry } from "@/lib/cookbook/types";
import { localizedText } from "@/lib/cookbook/types";

type Messages = typeof en;
const MESSAGES: Record<string, Messages> = { en, es: es as Messages, zh: zh as Messages };

const REPO_URL = "https://github.com/drnachio/postext";
const NPM_URL = "https://www.npmjs.com/package/postext";
const YOUTUBE_URL = "https://www.youtube.com/@Postext";

function messagesFor(locale: string): Messages {
  return MESSAGES[locale] ?? en;
}

/** Strings only the Markdown renditions use (agents read them, the UI never does). */
const LABELS = {
  en: {
    docs: "Documentation",
    optional: "Optional",
    lastUpdated: "Last updated",
    readingTime: "Reading time",
    canonical: "HTML version",
    otherLanguages: "Other languages",
    figure: "Figure",
    example: "Runnable example",
    exampleSource: "source",
    home: "Home",
    sandbox: "Sandbox",
    sandboxDesc: "Interactive in-browser editor: write markdown, tune the configuration and export print-ready PDF.",
    fullText: "Full text of every documentation page in one file",
    install: "Install",
    fullDocs: "Full documentation",
    links: "Links",
    localeDocs: "English documentation",
    cookbook: "Cookbook",
    cookbookTitle: "Postext Cookbook",
    cookbookDesc: "Postext examples to copy, from a chapter opener to a whole book, each with the pages it sets and its full code.",
    cookbookIntro:
      "Each recipe is a pen: one JavaScript module (with an HTML page and CSS when it needs them) that imports postext from esm.sh and builds its own page. Every link below is a recipe's Markdown rendition, which holds the write-up and the whole code.",
    allRecipes: "All recipes, by chapter",
    noRecipes: "No recipes yet.",
    part: "Part",
    chapter: "Chapter",
    recipe: "Recipe",
    numberSign: "Nº",
    level: "Level",
    outputs: "Outputs",
    genres: "Genres",
    draft: "Draft",
    requires: "Requires",
    testedWith: "tested with",
    testedOn: "on",
    pages: "Pages",
    pdf: "PDF",
    openInSandbox: "Open in Sandbox",
    answers: "This recipe answers",
    teaches: "Teaches",
    alsoUses: "Also uses",
    configAtAGlance: "Config at a glance",
    apis: "APIs",
    typefaces: "Typefaces",
    lines: "lines",
    wholeRecipe:
      "The files below are composed from the recipe's folder, with the sample text and the Cookbook's shared kit inlined. To run them as one page, put the HTML in `<body>`, the CSS in a `<style>` element and the script in a `<script type=\"module\">`; or paste each into the matching panel of a new CodePen (JS as a module). The script imports postext from esm.sh, so there is nothing to install or build.",
    wholeRecipeScript:
      "One file, composed from the recipe's folder with the sample text and the Cookbook's shared kit inlined; it builds its own page. To run it, put it in a `<script type=\"module\">` on an empty page, or paste it into the JS panel of a new CodePen (as a module). It imports postext from esm.sh, so there is nothing to install or build.",
    externals: "Loaded by the page",
    sourceFolder: "Source folder",
    notComposed: "The code of this recipe could not be composed",
    pitfall: "Pitfall",
    warning: "Layout warning",
    fix: "Fix",
    fixedIn: "fixed in",
    recipeBy: "Recipe",
    creditText: "Text",
    creditImages: "Images",
    creditType: "Type",
    creditCode: "Code",
    creditContent: "Sample content",
    source: "source",
    related: "Related",
    licenseOriginal: "original",
    licensePD: "public domain",
    licenseAuthorised: "reproduced with permission",
  },
  es: {
    docs: "Documentación",
    optional: "Optional",
    lastUpdated: "Última actualización",
    readingTime: "Tiempo de lectura",
    canonical: "Versión HTML",
    otherLanguages: "Otros idiomas",
    figure: "Figura",
    example: "Ejemplo ejecutable",
    exampleSource: "código",
    home: "Inicio",
    sandbox: "Sandbox",
    sandboxDesc: "Editor interactivo en el navegador: escribe markdown, ajusta la configuración y exporta PDF listo para imprenta.",
    fullText: "Texto completo de todas las páginas de documentación en un solo archivo",
    install: "Instalación",
    fullDocs: "Documentación completa",
    links: "Enlaces",
    localeDocs: "Documentación en español",
    cookbook: "Recetario",
    cookbookTitle: "Recetario de Postext",
    cookbookDesc: "Ejemplos de Postext para copiar, desde una apertura de capítulo hasta un libro entero, cada uno con las páginas que compone y su código completo.",
    cookbookIntro:
      "Cada receta es un pen: un módulo JavaScript (con una página HTML y su CSS cuando los necesita) que importa postext desde esm.sh y compone su propia página. Cada enlace de abajo es la versión Markdown de una receta, con la explicación y el código completo.",
    allRecipes: "Todas las recetas, por capítulos",
    noRecipes: "Todavía no hay recetas.",
    part: "Parte",
    chapter: "Capítulo",
    recipe: "Receta",
    numberSign: "N.º",
    level: "Nivel",
    outputs: "Salidas",
    genres: "Géneros",
    draft: "Borrador",
    requires: "Requiere",
    testedWith: "probada con",
    testedOn: "el",
    pages: "Páginas",
    pdf: "PDF",
    openInSandbox: "Abrir en el Sandbox",
    answers: "Esta receta responde a",
    teaches: "Enseña",
    alsoUses: "También usa",
    configAtAGlance: "La configuración de un vistazo",
    apis: "API",
    typefaces: "Tipografías",
    lines: "líneas",
    wholeRecipe:
      "Los archivos de abajo se componen a partir de la carpeta de la receta, con el texto de ejemplo y el kit común del Recetario ya incluidos. Para ejecutarlos como una sola página, pon el HTML en `<body>`, el CSS en un elemento `<style>` y el script en un `<script type=\"module\">`; o pega cada uno en el panel correspondiente de un pen nuevo de CodePen (el JS como módulo). El script importa postext desde esm.sh, así que no hay nada que instalar ni compilar.",
    wholeRecipeScript:
      "Un solo archivo, compuesto a partir de la carpeta de la receta con el texto de ejemplo y el kit común del Recetario ya incluidos; construye su propia página. Para ejecutarlo, ponlo en un `<script type=\"module\">` de una página vacía o pégalo en el panel JS de un pen nuevo de CodePen (como módulo). Importa postext desde esm.sh, así que no hay nada que instalar ni compilar.",
    externals: "Recursos que carga la página",
    sourceFolder: "Carpeta de la receta",
    notComposed: "No se ha podido componer el código de esta receta",
    pitfall: "Error frecuente",
    warning: "Aviso de maquetación",
    fix: "Solución",
    fixedIn: "resuelto en",
    recipeBy: "Receta",
    creditText: "Texto",
    creditImages: "Imágenes",
    creditType: "Tipografías",
    creditCode: "Código",
    creditContent: "Contenido de ejemplo",
    source: "fuente",
    related: "Relacionadas",
    licenseOriginal: "original",
    licensePD: "dominio público",
    licenseAuthorised: "reproducido con permiso",
  },
  zh: {
    docs: "文档",
    optional: "Optional",
    lastUpdated: "最后更新",
    readingTime: "阅读时间",
    canonical: "HTML版本",
    otherLanguages: "其他语言",
    figure: "图",
    example: "可运行的示例",
    exampleSource: "源代码",
    home: "首页",
    sandbox: "沙盒",
    sandboxDesc: "在浏览器中运行的交互式编辑器：编写Markdown，调整配置，导出可直接付印的PDF。",
    fullText: "全部文档页面合为一个文件的完整文本",
    install: "安装",
    fullDocs: "完整文档",
    links: "链接",
    localeDocs: "简体中文文档",
    cookbook: "排版食谱",
    cookbookTitle: "Postext排版食谱",
    cookbookDesc: "可直接复制的Postext示例，从一张章首页到一整本书，每个都附有排出的页面和完整代码。",
    cookbookIntro:
      "每份食谱都是一个pen：一个JavaScript模块（需要时再加一个HTML页面和CSS），从esm.sh导入postext，自己排出页面。下面每个链接都是一份食谱的Markdown版本，包含讲解和全部代码。",
    allRecipes: "全部食谱，按章排列",
    noRecipes: "还没有食谱。",
    part: "篇",
    chapter: "章",
    recipe: "食谱",
    numberSign: "No.",
    level: "难度",
    outputs: "输出",
    genres: "体裁",
    draft: "草稿",
    requires: "需要",
    testedWith: "已用",
    testedOn: "测试，日期",
    pages: "页面",
    pdf: "PDF",
    openInSandbox: "在沙盒中打开",
    answers: "这份食谱回答的问题",
    teaches: "讲解",
    alsoUses: "还用到",
    configAtAGlance: "配置一览",
    apis: "API",
    typefaces: "字体",
    lines: "行",
    wholeRecipe:
      "下面的文件由食谱文件夹合成，示例文本和排版食谱的公共工具包都已内联。要把它们作为一个页面运行，把HTML放进`<body>`，CSS放进`<style>`元素，脚本放进`<script type=\"module\">`；也可以把它们分别粘贴到新建CodePen的对应面板里（JS设为模块）。脚本从esm.sh导入postext，不需要安装或构建。",
    wholeRecipeScript:
      "一个文件，由食谱文件夹合成，示例文本和排版食谱的公共工具包都已内联；它自己排出页面。要运行它，把它放进空白页面的`<script type=\"module\">`，或粘贴到新建CodePen的JS面板里（设为模块）。它从esm.sh导入postext，不需要安装或构建。",
    externals: "页面加载的资源",
    sourceFolder: "食谱文件夹",
    notComposed: "无法合成这份食谱的代码",
    pitfall: "常见问题",
    warning: "排版警告",
    fix: "解决办法",
    fixedIn: "已修复于",
    recipeBy: "食谱",
    creditText: "文字",
    creditImages: "图片",
    creditType: "字体",
    creditCode: "代码",
    creditContent: "示例内容",
    source: "来源",
    related: "相关食谱",
    licenseOriginal: "原创",
    licensePD: "公有领域",
    licenseAuthorised: "经许可转载",
  },
} as const;

function labelsFor(locale: string) {
  return LABELS[siteLocale(locale)];
}

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

/** Inline HTML inside a table cell → inline Markdown on one line. */
function inlineHtmlToMarkdown(html: string, pageUrl: string): string {
  const flat = unwrapJsxStrings(html.replace(/\s*\n\s*/g, " ").trim());
  // Code spans and prose alternate; only prose gets tags rewritten, and each
  // side escapes its own pipes so the GFM row stays intact.
  return flat
    .split(/(<code>[\s\S]*?<\/code>)/g)
    .map((part) => {
      const code = part.match(/^<code>([\s\S]*?)<\/code>$/);
      if (code) {
        const text = decodeEntities(code[1]!).replace(/\|/g, "\\|");
        const tick = text.includes("`") ? "``" : "`";
        return `${tick}${text}${tick}`;
      }
      let out = part
        .replace(/<strong>([\s\S]*?)<\/strong>/g, "**$1**")
        .replace(/<em>([\s\S]*?)<\/em>/g, "*$1*")
        .replace(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_, href: string, label: string) =>
          `[${label}](${href.startsWith("#") ? pageUrl + href : href})`
        )
        .replace(/<br\s*\/?>/g, " ")
        .replace(/<\/?(?:span|p|div|small|sup|sub)\b[^>]*>/g, "");
      out = decodeEntities(out).replace(/\|/g, "\\|");
      return out;
    })
    .join("");
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
const BLOCK_TAGS = ["Illustration", "CodePenExample", "TutorialVideo", "Excerpt", "PageShot", "Gotcha"] as const;
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

  // An authored `<abbr title="…">PDF</abbr>` keeps its text only.
  const prose = (line: string) =>
    decodeEntities(
      unwrapJsxStrings(
        inlineComponents(line, renderers)
          .replace(/<abbr\b[^>]*>(.*?)<\/abbr>/g, "$1")
          .replace(/\\([{}])/g, "$1")
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
function collapseBlankLines(markdown: string): string {
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

// ---------------------------------------------------------------------------
// Page renditions
// ---------------------------------------------------------------------------

function header(opts: {
  title: string;
  description?: string;
  locale: string;
  path: string;
  availableLocales?: readonly string[];
  meta?: Pick<DocMeta, "lastUpdated" | "readingTime">;
  /** Extra facts, listed after the HTML version (without the "- "). */
  facts?: string[];
}): string {
  const labels = labelsFor(opts.locale);
  const lines = [`# ${opts.title}`, ""];
  if (opts.description) lines.push(`> ${opts.description}`, "");
  const facts: string[] = [`- ${labels.canonical}: ${localizedUrl(opts.locale, opts.path)}`];
  for (const fact of opts.facts ?? []) facts.push(`- ${fact}`);
  if (opts.meta?.lastUpdated) facts.push(`- ${labels.lastUpdated}: ${opts.meta.lastUpdated}`);
  if (opts.meta?.readingTime) facts.push(`- ${labels.readingTime}: ${opts.meta.readingTime}`);
  const others = (opts.availableLocales ?? routing.locales).filter((l) => l !== opts.locale);
  if (others.length > 0) {
    facts.push(
      `- ${labels.otherLanguages}: ${others.map((l) => `[${l}](${markdownUrl(l, opts.path)})`).join(", ")}`
    );
  }
  lines.push(...facts, "");
  return lines.join("\n");
}

/** A narrated video's transcript (what is shown and what is said), as the
 *  page's disclosure under the player lists it. */
function transcriptMarkdown(video: TranscriptVideo, locale: string): string {
  const t = messagesFor(locale).Transcript;
  const lang = siteLocale(locale);
  const blocks = TRANSCRIPTS[video][lang] ?? TRANSCRIPTS[video].en;
  return [
    `**${t.summary}.** ${t.note}`,
    "",
    ...blocks.map((b) =>
      [`- ${b.time}`, b.scene && `*${t.onScreen}:* ${b.scene}`, b.narration && `*${t.narration}:* ${b.narration}`]
        .filter(Boolean)
        .join(" · ")
    ),
    "",
  ].join("\n");
}

/** The "In short" block of a rendition: the page in plain words (WCAG 3.1.5). */
function plainSummary(locale: string, text: string | undefined): string {
  if (!text) return "";
  return `## ${messagesFor(locale).PlainLanguage.heading}\n\n${text}\n`;
}

/** Removes the MDX doc's own leading `# Title` so the rendition's header owns it. */
function dropLeadingH1(markdown: string): string {
  return markdown.replace(/^# .+\n+/, "");
}

export function docMarkdown(slug: string, locale: string): string | null {
  const doc = getDocSource(slug, locale);
  if (!doc) return null;
  const path = `/docs/${slug}`;
  const entry = getAllDocs().find((d) => d.slug === slug);
  const availableLocales = routing.locales.filter((l) => entry?.locales[l]);
  const body = dropLeadingH1(mdxToMarkdown(doc.source, locale, localizedUrl(locale, path)));
  return `${header({
    title: doc.meta.title,
    description: doc.meta.description,
    locale,
    path,
    availableLocales,
    meta: doc.meta,
  })}\n${doc.meta.plainSummary ? `${plainSummary(locale, doc.meta.plainSummary)}\n` : ""}${body}\n`;
}

function docsList(locale: string, withMarkdownLinks = true): string[] {
  return getAllDocs()
    .map((d) => d.locales[locale])
    .filter((m): m is DocMeta => Boolean(m))
    .map((m) => {
      const url = withMarkdownLinks
        ? markdownUrl(locale, `/docs/${m.slug}`)
        : localizedUrl(locale, `/docs/${m.slug}`);
      return `- [${m.title}](${url})${m.description ? `: ${m.description}` : ""}`;
    });
}

const QUICK_START = `import { buildDocument, renderToHtml } from "postext";

const doc = buildDocument({
  markdown: "# Hello World\\n\\nYour content here.",
});

const html = renderToHtml(doc);`;

const API_PREVIEW = `import { buildDocument, renderToHtml } from "postext";

const doc = buildDocument(
  { markdown },
  {
    layout: { layoutType: "double" },
    bodyText: {
      textAlign: "justify",
      hyphenation: { enabled: true, locale: "en-us" },
    },
  }
);

const html = renderToHtml(doc);`;

const BUNDLE_PARTS = ["config", "chapters", "fonts", "resources", "images"] as const;

function stripTags(text: string): string {
  return text.replace(/<code>(.*?)<\/code>/g, "`$1`").replace(/<[^>]+>/g, "");
}

export function homeMarkdown(locale: string): string {
  const m = messagesFor(locale);
  const labels = labelsFor(locale);
  const f = m.Features as Record<string, string>;
  const b = m.Bundle as Record<string, string>;
  return [
    header({ title: m.Metadata.title, description: m.Metadata.description, locale, path: "" }),
    plainSummary(locale, m.PlainLanguage.home),
    `## ${m.Hero.title}`,
    "",
    m.Hero.subtitle,
    "",
    `## ${m.Showreel.title}`,
    "",
    transcriptMarkdown("showreel", locale),
    `## ${m.About.titleLine1} ${m.About.titleLine2}`,
    "",
    m.About.paragraph1,
    "",
    `${m.About.paragraph2prefix}[${m.About.pretextLink}](https://github.com/chenglou/pretext)${m.About.paragraph2suffix}`,
    "",
    `## ${m.Features.title}`,
    "",
    ...FEATURE_KEYS.flatMap((k) => [
      `### ${f[`${k}Title`]}`,
      "",
      f[`${k}Description`]!,
      "",
      `[${f.docsLink}](${localizedUrl(locale, featureDocPath(k, locale))})`,
      "",
    ]),
    `## ${m.ApiPreview.title}`,
    "",
    stripTags(m.ApiPreview.description),
    "",
    "```ts",
    API_PREVIEW,
    "```",
    "",
    `## ${m.HowItWorks.title}`,
    "",
    `1. **${m.HowItWorks.step1Title}.** ${m.HowItWorks.step1Description}`,
    `2. **${m.HowItWorks.step2Title}.** ${m.HowItWorks.step2Description}`,
    `3. **${m.HowItWorks.step3Title}.** ${m.HowItWorks.step3Description}`,
    "",
    `## ${m.Bundle.title}`,
    "",
    m.Bundle.lead,
    "",
    m.Bundle.paragraph1,
    "",
    stripTags(m.Bundle.paragraph2),
    "",
    ...BUNDLE_PARTS.map((k) => `- **${b[`${k}Title`]}**`),
    "",
    `### ${m.Bundle.demoTitle}`,
    "",
    m.Bundle.demoDescription,
    "",
    `- [${GUIDE_BUNDLE_FILE}](${SITE_URL}${GUIDE_BUNDLE_PATH})`,
    "",
    `## ${m.Install.title}`,
    "",
    "```bash",
    "pnpm add postext",
    "```",
    "",
    "```ts",
    QUICK_START,
    "```",
    "",
    `## ${labels.docs}`,
    "",
    ...docsList(locale),
    "",
    `## ${labels.links}`,
    "",
    `- [GitHub](${REPO_URL})`,
    `- [npm](${NPM_URL})`,
    `- [YouTube](${YOUTUBE_URL})`,
    `- [${labels.cookbook}](${markdownUrl(locale, COOKBOOK_PATH)}): ${labels.cookbookDesc}`,
    `- [${labels.sandbox}](${localizedUrl(locale, "/sandbox")}): ${labels.sandboxDesc}`,
    `- [${m.Footer.mitLicense}](${markdownUrl(locale, "/license")})`,
    "",
  ].join("\n");
}

export const LEGAL_PAGES = ["license", "privacy-policy", "cookie-policy"] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

function linkify(text: string, tag: string, url: string): string {
  return text.replace(new RegExp(`<${tag}>(.*?)</${tag}>`), `[$1](${url})`);
}

export function legalMarkdown(page: LegalPage, locale: string): string {
  const m = messagesFor(locale);
  const path = `/${page}`;
  if (page === "license") {
    const t = m.License;
    return [
      header({ title: t.title, description: t.metaDescription, locale, path }),
      plainSummary(locale, m.PlainLanguage.license),
      t.copyright,
      "",
      t.grant,
      "",
      t.condition,
      "",
      t.disclaimer,
      "",
      linkify(t.sourceText, "repoLink", REPO_URL),
      "",
    ].join("\n");
  }
  if (page === "privacy-policy") {
    const t = m.PrivacyPolicy;
    return [
      header({ title: t.title, description: t.metaDescription, locale, path }),
      plainSummary(locale, m.PlainLanguage.privacy),
      `*${t.lastUpdated}*`,
      "",
      `## ${t.controllerTitle}`, "", t.controllerText, "",
      `## ${t.dataCollectedTitle}`, "", t.dataCollectedText, "",
      `## ${t.legalBasisTitle}`, "", t.legalBasisText, "",
      `## ${t.cookiesTitle}`, "", linkify(t.cookiesText, "cookieLink", markdownUrl(locale, "/cookie-policy")), "",
      `## ${t.rightsTitle}`, "", t.rightsText, "",
      ...[t.rightAccess, t.rightRectification, t.rightErasure, t.rightPortability, t.rightObjection, t.rightWithdraw].map((r) => `- ${r}`),
      "",
      `## ${t.childrenTitle}`, "", t.childrenText, "",
      `## ${t.contactTitle}`, "", t.contactText, "",
    ].join("\n");
  }
  const t = m.CookiePolicy;
  return [
    header({ title: t.title, description: t.metaDescription, locale, path }),
    plainSummary(locale, m.PlainLanguage.cookies),
    `*${t.lastUpdated}*`,
    "",
    `## ${t.whatAreCookiesTitle}`, "", t.whatAreCookiesText, "",
    `## ${t.cookiesWeUseTitle}`, "", t.cookiesWeUseText, "",
    `| ${t.tableName} | ${t.tableCategory} | ${t.tableDuration} | ${t.tablePurpose} |`,
    "| --- | --- | --- | --- |",
    `| \`postext_consent\` | ${t.categoryNecessary} | ${t.duration365} | ${t.purposeConsent} |`,
    "",
    `## ${t.categoriesTitle}`, "",
    `- **${t.categoryNecessaryLabel}:** ${t.categoryNecessaryDesc}`,
    `- **${t.categoryAnalyticsLabel}:** ${t.categoryAnalyticsDesc}`,
    `- **${t.categoryMarketingLabel}:** ${t.categoryMarketingDesc}`,
    "",
    `## ${t.manageCookiesTitle}`, "", t.manageCookiesText, "",
    `## ${t.moreInfoTitle}`, "", linkify(t.moreInfoText, "privacyLink", markdownUrl(locale, "/privacy-policy")), "",
  ].join("\n");
}

/** The accessibility statement (app/[locale]/accessibility/page.tsx). */
export function accessibilityMarkdown(locale: string): string {
  const t = messagesFor(locale).AccessibilityStatement;
  const list = (items: string[]) => items.map((i) => `- ${i}`);
  return [
    header({ title: t.title, description: t.metaDescription, locale, path: "/accessibility" }),
    `*${t.lastUpdated}*`,
    "",
    `## ${t.targetTitle}`, "", t.targetText, "",
    `## ${t.prefsTitle}`, "", t.prefsText, "",
    ...list([t.prefsTheme, t.prefsAlign, t.prefsSpacing, t.prefsWidth, t.prefsColors, t.prefsZoom]),
    "",
    t.sandboxTargets,
    "",
    `## ${t.keyboardTitle}`, "",
    ...list([t.keyboardTab, t.keyboardSkip, t.keyboardActivate, t.keyboardEscape, t.keyboardSearch]),
    "",
    `## ${t.limitationsTitle}`, "", t.limitationsIntro, "",
    ...list(t.limitations),
    "",
    `## ${t.reportTitle}`, "", linkify(t.reportText, "issuesLink", `${REPO_URL}/issues`), "",
  ].join("\n");
}

export const GLOSSARY_PATH = "/glossary";

/** The glossary: every term under its category, then the abbreviations. */
export function glossaryMarkdown(locale: string): string {
  const t = messagesFor(locale).Glossary;
  const { categories, abbreviations } = glossarySections(siteLocale(locale));
  const title = { type: t.categoryType, cjk: t.categoryCjk, web: t.categoryWeb } as const;
  const out = [header({ title: t.title, description: t.metaDescription, locale, path: GLOSSARY_PATH }), t.lead, ""];
  for (const c of categories) {
    out.push(`## ${title[c.category]}`, "");
    for (const term of c.terms) {
      out.push(`- **${term.term}**${term.native ? ` (${term.native})` : ""}: ${term.definition}`);
    }
    out.push("");
  }
  out.push(`## ${t.abbreviations}`, "", t.abbreviationsLead, "");
  for (const a of abbreviations) out.push(`- **${a.abbr}**: ${a.title}`);
  out.push("");
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Cookbook
// ---------------------------------------------------------------------------

const COOKBOOK_PATH = "/cookbook";
const COOKBOOK_SOURCE_URL = `${REPO_URL}/tree/main/cookbook`;

function cookbookLocale(locale: string): Locale {
  return siteLocale(locale);
}

/** "Nº 012" / "N.º 012" */
function recipeNumber(n: number, locale: string): string {
  return `${labelsFor(locale).numberSign} ${String(n).padStart(3, "0")}`;
}

function recipeMarkdownUrl(slug: string, locale: string): string {
  return markdownUrl(locale, recipeHref(slug));
}

/** A docs section as a link into its doc's Markdown rendition, or null
 *  when the heading no longer exists. */
function docMarkdownUrl(anchor: DocAnchor, locale: Locale): string | null {
  const path = docAnchorPath(anchor, locale);
  if (!path) return null;
  const [page, hash] = path.split("#");
  return `${markdownUrl(locale, page)}${hash ? `#${hash}` : ""}`;
}

function link(text: string, url: string | null | undefined): string {
  return url ? `[${text}](${url})` : text;
}

/** A fence one backtick longer than any run of backticks in `code`. */
function fenced(code: string, lang: string): string {
  const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${lang}\n${code.replace(/\n+$/, "")}\n${fence}`;
}

/** Lines `a`–`b` (1-based, inclusive) of the composed script, fenced, with
 *  a comment naming them so a reader can find them in the whole file. */
function scriptExcerpt(pen: ComposedPen, [a, b]: [number, number], locale: string): string {
  const code = pen.js.split("\n").slice(a - 1, b).join("\n");
  return fenced(`// script.js, ${labelsFor(locale).lines} ${a}–${b}\n${code}`, "js");
}

/** A title as a sentence: a plain lowercase first word capitalised (never
 *  an identifier such as `fontFamily`), and a closing full stop. */
function sentence(text: string): string {
  const t = text.trim();
  if (!t) return "";
  const capitalised = /^[a-z]+(?=[\s,.:;!?]|$)/.test(t) ? t[0]!.toUpperCase() + t.slice(1) : t;
  return capitalised + (/[.!?…]$/.test(t) ? "" : ".");
}

function licenseName(license: LicenseId, locale: string): string {
  const labels = labelsFor(locale);
  if (license === "original") return labels.licenseOriginal;
  if (license === "PD") return labels.licensePD;
  if (license === "reproduction-authorised") return labels.licenseAuthorised;
  return license;
}

/** "Level 2 (Intermediate)" */
function levelText(level: number, registry: Registry, locale: Locale): string {
  const title = registry.taxonomy.levels.find((l) => l.id === level)?.title[locale];
  return `${labelsFor(locale).level} ${level}${title ? ` (${title})` : ""}`;
}

function genreText(recipe: Recipe, registry: Registry, locale: Locale): string {
  return recipe.meta.genres
    .map((id) => registry.taxonomy.genres.find((g) => g.id === id)?.title[locale] ?? id)
    .join(", ");
}

/** One line of a recipe list: `[Nº 012 · Title](….md): summary · level · genres`. */
function recipeListLine(recipe: Recipe, registry: Registry, locale: Locale): string {
  const fm = writeupFor(recipe, locale)?.frontmatter;
  const title = `${recipeNumber(recipe.meta.number, locale)} · ${fm?.title ?? recipe.slug}`;
  const facts = [fm?.summary, levelText(recipe.meta.level, registry, locale), genreText(recipe, registry, locale)];
  if (recipe.meta.status === "draft") facts.push(labelsFor(locale).draft);
  return `- [${title}](${recipeMarkdownUrl(recipe.slug, locale)}): ${facts.filter(Boolean).join(" · ")}`;
}

/** The Cookbook's contents (`/{locale}/cookbook.md`): every visible recipe,
 *  grouped by part and chapter, each linking to its own rendition. */
export function cookbookMarkdown(locale: string): string {
  const lang = cookbookLocale(locale);
  const labels = labelsFor(locale);
  const recipes = getVisibleRecipes();
  const lines = [
    header({ title: labels.cookbookTitle, description: labels.cookbookDesc, locale, path: COOKBOOK_PATH }),
    labels.cookbookIntro,
    "",
  ];
  if (recipes.length === 0) return [...lines, labels.noRecipes, ""].join("\n");
  const registry = loadRegistry();
  const { parts, chapters } = registry.taxonomy;
  for (const part of parts) {
    const shelves = chapters
      .filter((c) => c.part === part.id)
      .sort((a, b) => a.number - b.number)
      .map((chapter) => ({ chapter, recipes: recipes.filter((r) => r.meta.chapter === chapter.id) }))
      .filter((shelf) => shelf.recipes.length > 0);
    if (shelves.length === 0) continue;
    lines.push(`## ${labels.part} ${part.number} · ${part.title[lang]}`, "");
    for (const { chapter, recipes: shelf } of shelves) {
      lines.push(`### ${labels.chapter} ${chapter.number} · ${chapter.title[lang]}`, "", chapter.intro[lang], "");
      lines.push(...shelf.map((recipe) => recipeListLine(recipe, registry, lang)), "");
    }
  }
  return lines.join("\n");
}

/** How the write-up's components read in this recipe's rendition. */
function recipeRenderers(
  recipe: Recipe,
  pen: ComposedPen | null,
  registry: Registry,
  locale: Locale
): MdxComponentRenderers {
  const labels = labelsFor(locale);
  const pages = pageImages(recipe, locale);
  const pageUrl = (n: string | undefined) => {
    const page = pages.find((p) => String(p.n) === n);
    return page ? `${SITE_URL}${page.src}` : null;
  };
  return {
    block: {
      Excerpt: ({ region }) => {
        const found = region ? pen?.ranges.regions[region] : undefined;
        return found && pen ? scriptExcerpt(pen, found.lines, locale) : "";
      },
      PageShot: ({ page, caption }) => {
        const url = pageUrl(page);
        const alt = pages.find((p) => String(p.n) === page)?.alt ?? caption ?? "";
        const image = url ? `![${alt.replace(/[[\]]/g, "")}](${url})` : "";
        return [image, caption ? `*${caption}*` : ""].filter(Boolean).join("\n\n");
      },
      Gotcha: ({ id }) => {
        const gotcha = id ? registry.gotchas[id] : undefined;
        return gotcha ? `> **${labels.pitfall}:** ${sentence(gotcha.title[locale])} ${gotcha.body[locale]}` : "";
      },
    },
    inline: {
      Feature: ({ id }, children) => {
        const feature = id ? registry.features[id] : undefined;
        const text = children || feature?.label[locale] || id || "";
        return feature ? link(text, docMarkdownUrl(feature.docs, locale)) : text;
      },
      RecipeLink: ({ slug }, children) => {
        const target = slug ? getRecipe(slug) : null;
        const text = children || (target && writeupFor(target, locale)?.frontmatter.title) || slug || "";
        return target ? link(text, recipeMarkdownUrl(target.slug, locale)) : text;
      },
      PageRef: ({ page }, children) => link(children || `${labels.pages} ${page}`, pageUrl(page)),
    },
  };
}

/** The Ingredients section: features, config, APIs and type, linked to the
 *  docs' Markdown renditions. */
function ingredientsMarkdown(recipe: Recipe, registry: Registry, locale: Locale): string[] {
  const labels = labelsFor(locale);
  const { primary, also } = recipe.meta.features;
  const search = catalogRecipe(recipe, locale, registry, []).search;
  const captured = captureVariantFor(recipe, locale)?.data.detected;
  // Features the capture found in the code that recipe.json does not declare.
  const undeclared = (captured?.features ?? []).filter((id) => !primary.includes(id) && !also.includes(id));
  const featureLink = (id: string) => {
    const feature = registry.features[id];
    return feature ? link(feature.label[locale], docMarkdownUrl(feature.docs, locale)) : id;
  };
  const out: string[] = [`**${labels.teaches}**`, ""];
  for (const id of primary) {
    const feature = registry.features[id];
    out.push(`- ${featureLink(id)}${feature ? `: ${feature.definition[locale]}` : ""}`);
  }
  out.push("");
  const alsoUses = [...also, ...undeclared];
  if (alsoUses.length > 0) out.push(`**${labels.alsoUses}**`, "", ...alsoUses.map((id) => `- ${featureLink(id)}`), "");
  const configKeys = search.configKeys.filter((key) => /^[A-Za-z]+$/.test(key));
  if (configKeys.length > 0) {
    const items = configKeys.map((key) => {
      const anchor = registry.config[key];
      return link(`\`${key}\``, anchor ? docMarkdownUrl(anchor, locale) : null);
    });
    out.push(`**${labels.configAtAGlance}**`, "", `- ${items.join(", ")}`, "");
  }
  if (search.apis.length > 0) {
    const items = search.apis.map((api) => {
      const anchor = registry.apis[api];
      return link(`\`${api}\``, anchor ? docMarkdownUrl(anchor, locale) : null);
    });
    out.push(`**${labels.apis}**`, "", `- ${items.join(", ")}`, "");
  }
  const fonts = recipe.meta.credits.fonts;
  if (fonts.length > 0) {
    out.push(`**${labels.typefaces}**`, "", `- ${fonts.map((f) => `${f.family} (${f.license})`).join(", ")}`, "");
  }
  return out;
}

function creditLine(credit: Credit, locale: Locale): string {
  const labels = labelsFor(locale);
  const source = credit.source
    ? /^https?:\/\//.test(credit.source)
      ? ` ([${labels.source}](${credit.source}))`
      : ` (${credit.source})`
    : "";
  return `${localizedText(credit.what, locale)}: ${credit.who}${source}, ${licenseName(credit.license, locale)}`;
}

/** A recipe's rendition (`/{locale}/cookbook/<slug>.md`): the write-up with
 *  its generated sections, every excerpt expanded and the whole code. */
export function recipeMarkdown(slug: string, locale: string): string | null {
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) return null;
  const recipe = getRecipe(slug);
  if (!recipe) return null;
  const lang = cookbookLocale(locale);
  const labels = labelsFor(locale);
  const writeup = writeupFor(recipe, lang);
  if (!writeup) return null;
  const registry = loadRegistry();
  const { meta } = recipe;
  const { sections: headings } = registry.taxonomy;
  const path = recipeHref(slug);
  const pageUrl = localizedUrl(locale, path);

  let pen: ComposedPen | null = null;
  let composeError = "";
  try {
    pen = getComposed(slug, lang);
  } catch (error) {
    // Development only: a production build fails on the recipe page first.
    composeError = (error as Error).message;
  }
  const renderers = recipeRenderers(recipe, pen, registry, lang);
  const authored = (id: keyof typeof headings) => {
    const chunk = writeup.sections[id];
    return chunk ? mdxToMarkdown(chunk, locale, pageUrl, renderers) : "";
  };

  // Header facts.
  const chapter = registry.taxonomy.chapters.find((c) => c.id === meta.chapter);
  const outputs = meta.outputs.map((id) => registry.taxonomy.outputs.find((o) => o.id === id)?.title[lang] ?? id);
  const capture = recipe.capture;
  const requires = [`postext ≥ ${meta.engine.postext}`];
  if (meta.engine.postextPdf) requires.push(`postext-pdf ≥ ${meta.engine.postextPdf}`);
  let tested = "";
  if (capture) {
    const versions = [capture.engine.postext, capture.engine.postextPdf && `postext-pdf ${capture.engine.postextPdf}`];
    tested = ` · ${labels.testedWith} ${versions.filter(Boolean).join(", ")} ${labels.testedOn} ${capture.capturedAt.slice(0, 10)}`;
  }
  const pages = pageImages(recipe, lang);
  const pdf = pdfDownload(recipe, lang);
  const facts = [
    [
      `${labels.recipe} ${recipeNumber(meta.number, lang)}`,
      chapter?.title[lang],
      levelText(meta.level, registry, lang),
      `${labels.outputs}: ${outputs.join(", ")}`,
      meta.status === "draft" ? labels.draft : "",
    ]
      .filter(Boolean)
      .join(" · "),
    `${labels.genres}: ${genreText(recipe, registry, lang)}`,
    `${labels.requires} ${requires.join(", ")}${tested}`,
  ];
  if (pages.length > 0) {
    facts.push(`${labels.pages}: ${pages.map((p) => `[${p.label || p.n}](${SITE_URL}${p.src})`).join(", ")}`);
  }
  if (pdf) facts.push(`${labels.pdf}: ${SITE_URL}${pdf.href}`);
  const sandbox = sandboxLink(recipe, lang);
  if (sandbox) {
    const hash = `#recipe=${slug}&lang=${sandbox.variant}`;
    facts.push(`${labels.openInSandbox}: ${localizedUrl(locale, "/sandbox")}${hash} (.postext: ${SITE_URL}${sandbox.bundle})`);
  }
  facts.push(`${labels.lastUpdated}: ${meta.updated}`);

  const out: string[] = [
    header({ title: writeup.frontmatter.title, description: writeup.frontmatter.summary, locale, path, facts }),
  ];
  if (writeup.frontmatter.plain) out.push(plainSummary(locale, writeup.frontmatter.plain));

  // What you'll build, then the questions it answers.
  const questions = meta.answers
    .map((id, i) => (i === 0 && writeup.frontmatter.question) || registry.questions[id]?.text[lang])
    .filter((q): q is string => Boolean(q));
  out.push(`## ${headings.build[lang]}`, "", authored("build"), "");
  if (questions.length > 0) out.push(`**${labels.answers}:**`, "", ...questions.map((q) => `- ${q}`), "");

  // The short answer: the `answer` region.
  const answer = pen?.ranges.regions.answer;
  if (pen && answer) {
    out.push(`## ${headings.short[lang]}`, "");
    // Region titles are code comments, written in English (as on the page).
    if (answer.title && lang === "en") out.push(sentence(answer.title), "");
    out.push(scriptExcerpt(pen, answer.lines, lang), "");
  }

  out.push(`## ${headings.ingredients[lang]}`, "", ...ingredientsMarkdown(recipe, registry, lang));
  out.push(`## ${headings.method[lang]}`, "", authored("method"), "");

  // The whole recipe: every composed file.
  out.push(`## ${headings.whole[lang]}`, "");
  if (pen) {
    const scriptOnly = !pen.html && !pen.css;
    out.push(scriptOnly ? labels.wholeRecipeScript : labels.wholeRecipe, "");
    out.push(`- ${labels.sourceFolder}: ${COOKBOOK_SOURCE_URL}/${slug}`);
    const externals = [...(pen.pen.stylesheets ?? []), ...(pen.pen.scripts ?? [])];
    if (externals.length > 0) out.push(`- ${labels.externals}: ${externals.join(", ")}`);
    out.push("");
    if (pen.html) out.push("### index.html", "", fenced(pen.html, "html"), "");
    if (pen.css) out.push("### style.css", "", fenced(pen.css, "css"), "");
    out.push("### script.js", "", fenced(pen.js, "js"), "");
  } else {
    out.push(`${labels.notComposed}: ${composeError}`, "", `- ${labels.sourceFolder}: ${COOKBOOK_SOURCE_URL}/${slug}`, "");
  }

  const variations = authored("variations");
  if (variations) out.push(`## ${headings.variations[lang]}`, "", variations, "");

  // Pitfalls: the shared gotchas, the warnings the recipe explains, then its own lines.
  const pitfalls: string[] = [];
  for (const id of meta.gotchas ?? []) {
    const gotcha = registry.gotchas[id];
    if (!gotcha) continue;
    const fixed = gotcha.fixedIn ? ` (${labels.fixedIn} postext ${gotcha.fixedIn})` : "";
    pitfalls.push(`- **${sentence(gotcha.title[lang])}**${fixed} ${gotcha.body[lang]}`);
  }
  for (const kind of meta.explainsWarnings ?? []) {
    const warning = registry.warnings[kind];
    if (!warning) continue;
    const docs = warning.docs ? docMarkdownUrl(warning.docs, lang) : null;
    pitfalls.push(
      `- **${labels.warning}: ${warning.label[lang]}** (\`${kind}\`). ${warning.cause[lang]} ${labels.fix}: ${warning.fix[lang]}${
        docs ? ` ([${labels.docs}](${docs}))` : ""
      }`
    );
  }
  const ownPitfalls = authored("pitfalls");
  if (pitfalls.length > 0 || ownPitfalls) {
    out.push(`## ${headings.pitfalls[lang]}`, "", ...pitfalls);
    if (ownPitfalls) out.push(...(pitfalls.length > 0 ? [""] : []), ownPitfalls);
    out.push("");
  }

  // Credits.
  const { credits, license } = meta;
  const authors = credits.authors.map((a) =>
    a.github ? `${a.name} ([@${a.github}](https://github.com/${a.github}))` : a.url ? `[${a.name}](${a.url})` : a.name
  );
  out.push(`## ${headings.credits[lang]}`, "", `- ${labels.recipeBy}: ${authors.join(", ")}`);
  for (const credit of credits.text) out.push(`- ${labels.creditText}: ${creditLine(credit, lang)}`);
  for (const credit of credits.images) out.push(`- ${labels.creditImages}: ${creditLine(credit, lang)}`);
  if (credits.fonts.length > 0) {
    out.push(`- ${labels.creditType}: ${credits.fonts.map((f) => `${f.family} (${f.license})`).join(", ")}`);
  }
  out.push(`- ${labels.creditCode}: ${license.code} · ${labels.creditContent}: ${license.content}`, "");

  const related = relatedRecipes(slug);
  if (related.length > 0) {
    out.push(`## ${labels.related}`, "", ...related.map((r) => recipeListLine(r, registry, lang)), "");
  }

  return collapseBlankLines(out.join("\n")).trimEnd() + "\n";
}

/**
 * Markdown for a localized path (`""`, `/docs/<slug>`, `/license`, …), or
 * `null` when the path has no rendition.
 */
export function pageMarkdown(locale: string, path: string): string | null {
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) return null;
  const clean = path.replace(/^\/+|\/+$/g, "");
  if (clean === "") return homeMarkdown(locale);
  if (clean === "docs") {
    const first = getAllDocs().find((d) => d.locales[locale]);
    return first ? docMarkdown(first.slug, locale) : null;
  }
  const doc = clean.match(/^docs\/([a-z0-9-]+)$/);
  if (doc) return docMarkdown(doc[1]!, locale);
  if (clean === "cookbook") return cookbookMarkdown(locale);
  const recipe = clean.match(/^cookbook\/([a-z0-9-]+)$/);
  if (recipe) return recipeMarkdown(recipe[1]!, locale);
  if ((LEGAL_PAGES as readonly string[]).includes(clean)) return legalMarkdown(clean as LegalPage, locale);
  if (clean === "accessibility") return accessibilityMarkdown(locale);
  if (`/${clean}` === GLOSSARY_PATH) return glossaryMarkdown(locale);
  return null;
}

/** Every path with a Markdown rendition, per locale (for static generation). */
export function markdownPaths(locale: string): string[] {
  const docs = getAllDocs()
    .filter((d) => d.locales[locale])
    .map((d) => `/docs/${d.slug}`);
  const recipes = getVisibleRecipes().map((r) => recipeHref(r.slug));
  return ["", "/docs", ...docs, COOKBOOK_PATH, ...recipes, ...LEGAL_PAGES.map((p) => `/${p}`), "/accessibility", GLOSSARY_PATH];
}

// ---------------------------------------------------------------------------
// llms.txt
// ---------------------------------------------------------------------------

/** llms.txt's Cookbook section: one line per published recipe (drafts are
 *  noindex even when shown), each linking to its rendition (which holds the
 *  whole code), then the contents. Empty while there are no recipes. */
function cookbookList(locale: string): string[] {
  const recipes = getAllRecipes();
  if (recipes.length === 0) return [];
  const lang = cookbookLocale(locale);
  const labels = labelsFor(locale);
  return [
    `## ${labels.cookbook}`,
    "",
    ...recipes.map((recipe) => {
      const fm = writeupFor(recipe, lang)?.frontmatter;
      return `- [${fm?.title ?? recipe.slug}](${recipeMarkdownUrl(recipe.slug, locale)})${fm?.summary ? `: ${fm.summary}` : ""}`;
    }),
    `- [${labels.allRecipes}](${markdownUrl(locale, COOKBOOK_PATH)})`,
    "",
  ];
}

/** The `llms.txt` index (https://llmstxt.org) for one locale. */
export function llmsTxt(locale: string): string {
  const m = messagesFor(locale);
  const labels = labelsFor(locale);
  const lines = [
    `# ${SITE_NAME}`,
    "",
    `> ${m.Metadata.description}`,
    "",
    m.Hero.subtitle,
    "",
    `- ${labels.install}: \`pnpm add postext\` (PDF backend: \`pnpm add postext-pdf\`)`,
    `- ${labels.home}: [${markdownUrl(locale)}](${markdownUrl(locale)})`,
    `- ${labels.fullDocs}: [${labels.fullText}](${SITE_URL}${locale === routing.defaultLocale ? "" : `/${locale}`}/llms-full.txt)`,
    "",
    `## ${labels.docs}`,
    "",
    ...docsList(locale),
    "",
    ...cookbookList(locale),
    `## ${labels.links}`,
    "",
    `- [GitHub](${REPO_URL}): source code, issues and examples`,
    `- [npm](${NPM_URL}): the \`postext\` package`,
    `- [YouTube](${YOUTUBE_URL}): video walkthroughs`,
    `- [${labels.sandbox}](${localizedUrl(locale, "/sandbox")}): ${labels.sandboxDesc}`,
    "",
    `## ${labels.optional}`,
    "",
    `- [${m.Glossary.title}](${markdownUrl(locale, GLOSSARY_PATH)}): ${m.Glossary.metaDescription}`,
    `- [${m.Footer.mitLicense}](${markdownUrl(locale, "/license")})`,
    `- [${m.Footer.privacyPolicy}](${markdownUrl(locale, "/privacy-policy")})`,
    `- [${m.Footer.cookiePolicy}](${markdownUrl(locale, "/cookie-policy")})`,
    `- [${m.Footer.accessibility}](${markdownUrl(locale, "/accessibility")})`,
  ];
  for (const other of routing.locales.filter((l) => l !== locale)) {
    lines.push(`- [${labelsFor(other).localeDocs}](${SITE_URL}/${other}/llms.txt)`);
  }
  return lines.join("\n") + "\n";
}

/** Pushes every ATX heading outside fenced code one level down. */
function demoteHeadings(markdown: string): string {
  let fence: string | null = null;
  return markdown
    .split("\n")
    .map((line) => {
      const f = line.match(/^\s*(`{3,}|~{3,})/);
      if (f) {
        if (fence === null) fence = f[1]!;
        else if (line.trim().replace(/[`~]/g, "") === "") fence = null;
        return line;
      }
      return fence === null ? line.replace(/^(#{1,5}) /, "#$1 ") : line;
    })
    .join("\n");
}

/** Every documentation page of one locale concatenated (`llms-full.txt`). */
export function llmsFullTxt(locale: string): string {
  const m = messagesFor(locale);
  const docs = getAllDocs()
    .filter((d) => d.locales[locale])
    .map((d) => docMarkdown(d.slug, locale))
    .filter((s): s is string => Boolean(s))
    // Demote each page one level so the file has a single H1.
    .map(demoteHeadings);
  return [`# ${SITE_NAME}`, "", `> ${m.Metadata.description}`, "", ...docs].join("\n\n") + "\n";
}
