/**
 * Regenerates the doc pages of the GitHub wiki from the English MDX docs.
 *
 *   git clone https://github.com/drnachio/postext.wiki.git ../postext.wiki
 *   cd apps/web && pnpm wiki ../../../postext.wiki
 *
 * Each doc goes through the same MDX → Markdown conversion as the site's
 * `.md` renditions (`src/lib/markdown.ts`); links to other docs and anchors
 * are rewritten to wiki pages, and every other site link points at
 * postext.dev. One docs page is one wiki page (DOC_PAGES); a docs page that
 * is in neither DOC_PAGES nor a hand-written exception stops the run. The
 * pages of the Configuration reference (CONFIGURATION_PAGES) keep the wiki's
 * own titles and link to each other at the foot. Hand-written pages (Home,
 * sidebar, Getting Started, Packages…) are left alone.
 */
import fs from "node:fs";
import path from "node:path";
import GithubSlugger from "github-slugger";
import { mdxToMarkdown } from "@/lib/markdown";
import { getAllDocs, getDocSource } from "@/lib/docs";

const SITE = "https://postext.dev";
const REPO = "https://github.com/drnachio/postext";

/** Docs slug → wiki page. The pages of the Configuration reference keep the
 *  names they had while the wiki alone split it, so wiki links did not move. */
const DOC_PAGES: Record<string, string> = {
  introduction: "Introduction",
  architecture: "Architecture",
  configuration: "Configuration",
  "configuration-page-layout": "Configuration-Page-and-Layout",
  "configuration-text": "Configuration-Text",
  "configuration-notes-references": "Configuration-Notes-and-References",
  "configuration-east-asian": "Configuration-East-Asian-Typography",
  "configuration-resources": "Configuration-Resources",
  "configuration-styles": "Configuration-Styles",
  "configuration-comics": "Configuration-Comics",
  "configuration-fonts-colors-viewers": "Configuration-Fonts-Colors-and-Viewers",
  "configuration-programmatic-usage": "Programmatic-Usage",
  justification: "Hyphenation-and-Justification",
  "document-format": "Document-Format",
  "chinese-layout": "Chinese-Layout",
  "arabic-layout": "Arabic-Layout",
  "japanese-layout": "Japanese-Layout",
  comics: "Comics",
  contributing: "Contributing",
  sandbox: "Sandbox",
  skill: "Agent-Skill",
  "command-line": "Command-Line",
};

/** The Configuration reference in reading order: the entry page, then the
 *  docs page of each group of sections (#655), with the title its wiki page
 *  carries. */
const CONFIGURATION_PAGES: { slug: string; title: string }[] = [
  { slug: "configuration", title: "Configuration" },
  { slug: "configuration-page-layout", title: "Configuration: page, layout, headers and footers" },
  { slug: "configuration-text", title: "Configuration: body text, headings, lists and maths" },
  {
    slug: "configuration-notes-references",
    title: "Configuration: notes, line numbers, references, contents and index",
  },
  { slug: "configuration-east-asian", title: "Configuration: East Asian typography" },
  { slug: "configuration-resources", title: "Configuration: resources, tables, captions, diagrams and videos" },
  {
    slug: "configuration-styles",
    title: "Configuration: paragraph, chip, code, callout and heading styles, parts",
  },
  { slug: "configuration-comics", title: "Configuration: comics" },
  {
    slug: "configuration-fonts-colors-viewers",
    title: "Configuration: units, fonts, colours, viewers and debugging",
  },
  {
    slug: "configuration-programmatic-usage",
    title: "Programmatic usage: workers, HTML, PDF, Folio, EPUB and bundles",
  },
];

interface Heading {
  level: number;
  text: string;
  line: number;
}

/** Heading text as the reader sees it, which is what both sites slug. */
function headingText(raw: string): string {
  return raw
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .trim();
}

/** The `#`–`######` headings outside fenced code. */
function headings(lines: string[]): Heading[] {
  const out: Heading[] = [];
  let fence: string | null = null;
  lines.forEach((line, i) => {
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      if (fence === null) fence = f[1]!;
      else if (line.trim().startsWith(fence) && line.trim().replace(/[`~]/g, "") === "") fence = null;
      return;
    }
    if (fence !== null) return;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) out.push({ level: m[1]!.length, text: headingText(m[2]!), line: i });
  });
  return out;
}

interface Built {
  slug: string;
  /** The wiki page of the doc. */
  page: string;
  lines: string[];
  /** The site's anchor of every heading → its anchor in the wiki page. */
  anchors: Map<string, string>;
  title: string;
  description: string;
  lastUpdated: string;
  plainSummary?: string;
}

function build(slug: string): Built {
  const doc = getDocSource(slug, "en");
  if (!doc) throw new Error(`No English doc for "${slug}"`);
  const pageUrl = `${SITE}/en/docs/${slug}`;
  const markdown = mdxToMarkdown(doc.source, "en", pageUrl).replace(/^# .+\n+/, "");
  const lines = markdown.split("\n");

  // Both sites slug a page's headings in order. The site counts the page
  // title among them and the wiki page does not carry it, which changes
  // nothing while no heading repeats the title.
  const site = new GithubSlugger();
  const wiki = new GithubSlugger();
  const anchors = new Map<string, string>();
  for (const h of headings(lines)) anchors.set(site.slug(h.text), wiki.slug(h.text));

  return {
    slug,
    page: DOC_PAGES[slug]!,
    lines,
    anchors,
    title: doc.meta.title,
    description: doc.meta.description,
    lastUpdated: doc.meta.lastUpdated ?? "",
    plainSummary: doc.meta.plainSummary,
  };
}

const warnings: string[] = [];

/** Rewrites the links of one wiki page. */
function relink(text: string, from: Built, docs: Map<string, Built>): string {
  const page = from.page;
  const target = (slug: string, anchor: string | undefined, raw: string): string => {
    const doc = docs.get(slug);
    if (!doc) return `${SITE}${raw}`;
    if (!anchor) return slug === from.slug ? "#" : doc.page;
    const wikiAnchor = doc.anchors.get(anchor);
    if (!wikiAnchor) {
      warnings.push(`${page}: no heading for ${raw}`);
      return `${doc.page}#${anchor}`;
    }
    return doc.page === page ? `#${wikiAnchor}` : `${doc.page}#${wikiAnchor}`;
  };

  // Outside fenced code only.
  let fence: string | null = null;
  return text
    .split("\n")
    .map((line) => {
      const f = line.match(/^\s*(`{3,}|~{3,})/);
      if (f) {
        if (fence === null) fence = f[1]!;
        else if (line.trim().startsWith(fence) && line.trim().replace(/[`~]/g, "") === "") fence = null;
        return line;
      }
      if (fence !== null) return line;
      return line
        // Inline `<a href>` (in table cells, mostly) as Markdown links, so they are rewritten too.
        .replace(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, "[$2]($1)")
        .replace(/\]\(((?:https:\/\/postext\.dev)?\/[^)\s]*|#[^)\s]*)\)/g, (_, href: string) => {
        if (href.startsWith("#")) return `](${target(from.slug, href.slice(1), `/en/docs/${from.slug}${href}`)})`;
        const local = href.replace(/^https:\/\/postext\.dev/, "");
        // Links in table cells come out of the conversion pointing at the `.md` rendition.
        const m = local.match(/^\/en\/docs\/([a-z-]+)(?:\.md)?(?:#(.+))?$/);
        if (m && docs.has(m[1]!)) return `](${target(m[1]!, m[2], local)})`;
        return `](${SITE}${local})`;
      });
    })
    .join("\n");
}

function header(doc: Built, title: string, part: boolean): string {
  const source = `[\`docs/${doc.slug}-en.mdx\`](${REPO}/blob/develop/docs/${doc.slug}-en.mdx)`;
  const lines = [`# ${title}`, ""];
  if (part) lines.push(`Part of the [Configuration](Configuration) reference.`, "");
  else lines.push(`> ${doc.description}`, "");
  lines.push(
    `*Generated from ${source}${doc.lastUpdated ? ` (updated ${doc.lastUpdated})` : ""}. ` +
      `Read it on [postext.dev](${SITE}/en/docs/${doc.slug}), where it is also available in Spanish, Catalan, Chinese, Arabic, Japanese and Portuguese. ` +
      `To change this page, edit the MDX and run \`pnpm wiki\` in \`apps/web\`.*`,
    ""
  );
  if (!part && doc.plainSummary) lines.push("## In short", "", doc.plainSummary, "");
  return lines.join("\n");
}

function main() {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(path.join(dir, "Home.md"))) {
    console.error("Usage: pnpm wiki <path to a clone of postext.wiki>");
    process.exit(1);
  }
  const unknown = getAllDocs()
    .filter((d) => d.locales.en && !DOC_PAGES[d.slug])
    .map((d) => d.slug);
  if (unknown.length > 0) {
    throw new Error(`Docs pages with no wiki page (add them to DOC_PAGES): ${unknown.join(", ")}`);
  }
  const docs = new Map<string, Built>();
  for (const slug of Object.keys(DOC_PAGES)) docs.set(slug, build(slug));

  for (const doc of docs.values()) {
    const i = CONFIGURATION_PAGES.findIndex((p) => p.slug === doc.slug);
    const part = i > 0;
    let text = header(doc, part ? CONFIGURATION_PAGES[i]!.title : doc.title, part);
    text += "\n" + relink(doc.lines.join("\n"), doc, docs).trim() + "\n";
    if (i >= 0) {
      const prev = CONFIGURATION_PAGES[i - 1];
      const next = CONFIGURATION_PAGES[i + 1];
      const nav = [
        prev && `← [${prev.title}](${DOC_PAGES[prev.slug]})`,
        next && `[${next.title}](${DOC_PAGES[next.slug]}) →`,
      ].filter(Boolean);
      if (nav.length) text += `\n---\n\n${nav.join(" · ")}\n`;
    }
    fs.writeFileSync(path.join(dir, `${doc.page}.md`), text);
    console.log(`${doc.page}.md  ${(text.length / 1024).toFixed(0)} KB`);
  }
  for (const w of warnings) console.warn(`warning: ${w}`);
}

main();
