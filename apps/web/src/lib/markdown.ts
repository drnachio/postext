/**
 * Plain-Markdown renditions of the site's pages, for LLMs and agents
 * (`/<locale>/<page>.md`, `Accept: text/markdown`, `llms.txt`,
 * `llms-full.txt`). Everything is derived from the same sources the HTML
 * pages render — the MDX docs and the message files — so the two never drift.
 */
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { routing } from "@/i18n/routing";
import { getAllDocs, getDocSource, type DocMeta } from "@/lib/docs";
import { SITE_NAME, SITE_URL, localizedUrl } from "@/lib/seo";

type Messages = typeof en;
const MESSAGES: Record<string, Messages> = { en, es: es as Messages };

const REPO_URL = "https://github.com/drnachio/postext";
const NPM_URL = "https://www.npmjs.com/package/postext";

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
    otherLocaleDocs: "Documentación en español",
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
    otherLocaleDocs: "English documentation",
  },
} as const;

function labelsFor(locale: string) {
  return locale === "es" ? LABELS.es : LABELS.en;
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

/**
 * Turns a doc's MDX source into plain Markdown: drops the metadata export
 * and MDX comments, rewrites `<Illustration>` / `<CodePenExample>` into
 * descriptive blockquotes, HTML tables into GFM tables, and decodes the
 * entities MDX needs. Fenced code blocks pass through untouched.
 */
export function mdxToMarkdown(source: string, locale: string, pageUrl: string): string {
  const labels = labelsFor(locale);
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  let buffer: string[] | null = null; // multi-line JSX element being collected
  type BufferKind = "table" | "meta" | "comment" | "tag";
  let bufferKind: BufferKind | null = null;

  const flushBuffer = () => {
    const text = buffer!.join("\n");
    if (bufferKind === "table") out.push(htmlTableToMarkdown(text, pageUrl));
    else if (bufferKind === "tag") {
      if (/^<Illustration\b/.test(text.trim())) out.push(illustrationToMarkdown(text, labels.figure));
      else if (/^<CodePenExample\b/.test(text.trim())) out.push(codePenToMarkdown(text, labels));
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
        (bufferKind === "tag" && /\/>\s*$/.test(line));
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
    else if (/^<(Illustration|CodePenExample)\b/.test(trimmed)) kind = "tag";
    else if (/^(import|export)\s/.test(trimmed)) continue;

    if (kind) {
      buffer = [line];
      bufferKind = kind;
      const closesNow =
        (kind === "table" && /<\/table>/.test(line)) ||
        (kind === "meta" && /\}\s*;?\s*$/.test(trimmed) && trimmed.includes("{") && !trimmed.endsWith("{")) ||
        (kind === "comment" && /\*\/\}/.test(line)) ||
        (kind === "tag" && /\/>\s*$/.test(line));
      if (closesNow) flushBuffer();
      continue;
    }

    out.push(decodeEntities(unwrapJsxStrings(line.replace(/\\([{}])/g, "$1"))));
  }
  if (buffer) flushBuffer();

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
}): string {
  const labels = labelsFor(opts.locale);
  const lines = [`# ${opts.title}`, ""];
  if (opts.description) lines.push(`> ${opts.description}`, "");
  const facts: string[] = [`- ${labels.canonical}: ${localizedUrl(opts.locale, opts.path)}`];
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
  })}\n${body}\n`;
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

const FEATURE_KEYS = ["justification", "resources", "tables", "singleInk", "math", "output"] as const;

function stripTags(text: string): string {
  return text.replace(/<code>(.*?)<\/code>/g, "`$1`").replace(/<[^>]+>/g, "");
}

export function homeMarkdown(locale: string): string {
  const m = messagesFor(locale);
  const labels = labelsFor(locale);
  const f = m.Features as Record<string, string>;
  return [
    header({ title: m.Metadata.title, description: m.Metadata.description, locale, path: "" }),
    `## ${m.Hero.title}`,
    "",
    m.Hero.subtitle,
    "",
    `## ${m.About.titleLine1} ${m.About.titleLine2}`,
    "",
    m.About.paragraph1,
    "",
    `${m.About.paragraph2prefix}[${m.About.pretextLink}](https://github.com/chenglou/pretext)${m.About.paragraph2suffix}`,
    "",
    `## ${m.Features.title}`,
    "",
    ...FEATURE_KEYS.flatMap((k) => [`### ${f[`${k}Title`]}`, "", f[`${k}Description`]!, ""]),
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
  if ((LEGAL_PAGES as readonly string[]).includes(clean)) return legalMarkdown(clean as LegalPage, locale);
  return null;
}

/** Every path with a Markdown rendition, per locale (for static generation). */
export function markdownPaths(locale: string): string[] {
  const docs = getAllDocs()
    .filter((d) => d.locales[locale])
    .map((d) => `/docs/${d.slug}`);
  return ["", "/docs", ...docs, ...LEGAL_PAGES.map((p) => `/${p}`)];
}

// ---------------------------------------------------------------------------
// llms.txt
// ---------------------------------------------------------------------------

/** The `llms.txt` index (https://llmstxt.org) for one locale. */
export function llmsTxt(locale: string): string {
  const m = messagesFor(locale);
  const labels = labelsFor(locale);
  const other = routing.locales.find((l) => l !== locale);
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
    `## ${labels.links}`,
    "",
    `- [GitHub](${REPO_URL}): source code, issues and examples`,
    `- [npm](${NPM_URL}): the \`postext\` package`,
    `- [${labels.sandbox}](${localizedUrl(locale, "/sandbox")}): ${labels.sandboxDesc}`,
    "",
    `## ${labels.optional}`,
    "",
    `- [${m.Footer.mitLicense}](${markdownUrl(locale, "/license")})`,
    `- [${m.Footer.privacyPolicy}](${markdownUrl(locale, "/privacy-policy")})`,
    `- [${m.Footer.cookiePolicy}](${markdownUrl(locale, "/cookie-policy")})`,
  ];
  if (other) {
    lines.push(`- [${labels.otherLocaleDocs}](${SITE_URL}/${other}/llms.txt)`);
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
