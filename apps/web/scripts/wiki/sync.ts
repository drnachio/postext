/**
 * Regenerates the doc pages of the GitHub wiki from the English MDX docs.
 *
 *   git clone https://github.com/drnachio/postext.wiki.git ../postext.wiki
 *   cd apps/web && pnpm wiki ../../../postext.wiki
 *
 * Each doc goes through the same MDX → Markdown conversion as the site's
 * `.md` renditions (`src/lib/markdown.ts`); links to other docs and anchors
 * are rewritten to wiki pages, and every other site link points at
 * postext.dev. Configuration is too long for one wiki page, so it is split
 * into the pages of CONFIGURATION_PAGES by its `##` sections; a section that
 * is in no page stops the run. Hand-written pages (Home, sidebar, Getting
 * Started, Packages…) are left alone.
 */
import fs from "node:fs";
import path from "node:path";
import GithubSlugger from "github-slugger";
import { mdxToMarkdown } from "@/lib/markdown";
import { getDocSource } from "@/lib/docs";

const SITE = "https://postext.dev";
const REPO = "https://github.com/drnachio/postext";

/** Docs slug → wiki page. */
const DOC_PAGES: Record<string, string> = {
  introduction: "Introduction",
  architecture: "Architecture",
  configuration: "Configuration",
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

/** The Configuration reference, split by its `##` sections. The text before
 *  the first section and the Index stay on the `Configuration` page. */
const CONFIGURATION_PAGES: { page: string; title: string; sections: string[] }[] = [
  { page: "Configuration", title: "Configuration", sections: ["Index"] },
  {
    page: "Configuration-Page-and-Layout",
    title: "Configuration: page, layout, headers and footers",
    sections: ["Page", "Layout", "Headers & footers"],
  },
  {
    page: "Configuration-Text",
    title: "Configuration: body text, headings, lists and maths",
    sections: ["Body text", "Headings", "Unordered Lists", "Ordered Lists", "Math"],
  },
  {
    page: "Configuration-Notes-and-References",
    title: "Configuration: notes, line numbers, references, contents and index",
    sections: ["Footnotes", "Line numbers", "Cross-references", "Citations", "Table of contents", "Back-of-book index"],
  },
  {
    page: "Configuration-East-Asian-Typography",
    title: "Configuration: East Asian typography",
    sections: ["East Asian typography"],
  },
  {
    page: "Configuration-Resources",
    title: "Configuration: resources, tables, captions, diagrams and videos",
    sections: ["Resource types", "Table style", "Caption style", "Diagram style", "Video style"],
  },
  {
    page: "Configuration-Styles",
    title: "Configuration: paragraph, chip, callout and heading styles, parts",
    sections: ["Paragraph styles", "Chip styles", "Callout styles", "Parts", "Heading styles"],
  },
  {
    page: "Configuration-Comics",
    title: "Configuration: comics",
    sections: ["Comics"],
  },
  {
    page: "Configuration-Fonts-Colors-and-Viewers",
    title: "Configuration: units, fonts, colours, viewers and debugging",
    sections: [
      "Units and colors",
      "Custom fonts",
      "Color Palette",
      "HTML Viewer",
      "PDF generation (config)",
      "Print production (config)",
      "Folio viewer (config)",
      "Debug",
    ],
  },
  {
    page: "Programmatic-Usage",
    title: "Programmatic usage: workers, HTML, PDF, Folio, EPUB and bundles",
    sections: [
      "Programmatic Usage",
      "Running layout in a Web Worker",
      "Integrating the HTML viewer",
      "Generating PDFs",
      "A 3D book (`postext-folio`)",
      "EPUB books (`postext-epub`)",
      "Bundles (`.postext` files)",
    ],
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

interface Target {
  page: string;
  anchor: string;
}

interface Built {
  slug: string;
  /** Wiki page → its lines. */
  pages: Map<string, string[]>;
  /** The site's anchor of every heading → where it lives in the wiki. */
  anchors: Map<string, Target>;
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
  const all = headings(lines);

  // Which wiki page each line goes to.
  const pages = new Map<string, string[]>();
  const pageOf: string[] = new Array(lines.length);
  if (slug === "configuration") {
    const sectionPage = new Map<string, string>();
    for (const p of CONFIGURATION_PAGES) for (const s of p.sections) sectionPage.set(s, p.page);
    let current = "Configuration";
    const h2 = new Map(all.filter((h) => h.level === 2).map((h) => [h.line, h]));
    const unknown: string[] = [];
    lines.forEach((line, i) => {
      const h = h2.get(i);
      if (h) {
        const page = sectionPage.get(h.text) ?? sectionPage.get(line.replace(/^##\s+/, "").trim());
        if (!page) unknown.push(h.text);
        else current = page;
      }
      pageOf[i] = current;
    });
    if (unknown.length > 0) {
      throw new Error(
        `Configuration sections in no wiki page (add them to CONFIGURATION_PAGES): ${unknown.join(", ")}`
      );
    }
  } else {
    pageOf.fill(DOC_PAGES[slug]!);
  }
  lines.forEach((line, i) => {
    const page = pageOf[i]!;
    if (!pages.has(page)) pages.set(page, []);
    pages.get(page)!.push(line);
  });

  // The site slugs the whole doc at once; the wiki slugs each page.
  const site = new GithubSlugger();
  const wiki = new Map<string, GithubSlugger>();
  const anchors = new Map<string, Target>();
  for (const h of all) {
    const page = pageOf[h.line]!;
    if (!wiki.has(page)) wiki.set(page, new GithubSlugger());
    anchors.set(site.slug(h.text), { page, anchor: wiki.get(page)!.slug(h.text) });
  }

  return {
    slug,
    pages,
    anchors,
    title: doc.meta.title,
    description: doc.meta.description,
    lastUpdated: doc.meta.lastUpdated ?? "",
    plainSummary: doc.meta.plainSummary,
  };
}

const warnings: string[] = [];

/** Rewrites the links of one wiki page. */
function relink(text: string, from: Built, page: string, docs: Map<string, Built>): string {
  const target = (slug: string, anchor: string | undefined, raw: string): string => {
    const doc = docs.get(slug);
    if (!doc) return `${SITE}${raw}`;
    if (!anchor) return slug === from.slug && page === DOC_PAGES[slug] ? "#" : DOC_PAGES[slug]!;
    const t = doc.anchors.get(anchor);
    if (!t) {
      warnings.push(`${page}: no heading for ${raw}`);
      return `${DOC_PAGES[slug]}#${anchor}`;
    }
    return t.page === page ? `#${t.anchor}` : `${t.page}#${t.anchor}`;
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
        const m = local.match(/^\/en\/docs\/([a-z-]+)(?:#(.+))?$/);
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
      `Read it on [postext.dev](${SITE}/en/docs/${doc.slug}), where it is also available in Spanish, Catalan, Chinese, Arabic and Japanese. ` +
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
  const docs = new Map<string, Built>();
  for (const slug of Object.keys(DOC_PAGES)) docs.set(slug, build(slug));

  for (const doc of docs.values()) {
    const split = doc.slug === "configuration";
    const order = split ? CONFIGURATION_PAGES : [{ page: DOC_PAGES[doc.slug]!, title: doc.title }];
    order.forEach((entry, i) => {
      const body = doc.pages.get(entry.page);
      if (!body) return;
      const part = split && entry.page !== "Configuration";
      let text = header(doc, part ? entry.title : doc.title, part);
      if (split && !part) {
        text += "\n## Pages of this reference\n\n";
        text += CONFIGURATION_PAGES.slice(1)
          .map((p) => `- [${p.title.replace(/^Configuration: /, "").replace(/^./, (c) => c.toUpperCase())}](${p.page}) — ${p.sections.map((s) => s.replace(/`/g, "")).join(", ")}`)
          .join("\n");
        text += "\n";
      }
      text += "\n" + relink(body.join("\n"), doc, entry.page, docs).trim() + "\n";
      if (split) {
        const prev = order[i - 1];
        const next = order[i + 1];
        const nav = [
          prev && `← [${prev.title}](${prev.page})`,
          next && `[${next.title}](${next.page}) →`,
        ].filter(Boolean);
        if (nav.length) text += `\n---\n\n${nav.join(" · ")}\n`;
      }
      fs.writeFileSync(path.join(dir, `${entry.page}.md`), text);
      console.log(`${entry.page}.md  ${(text.length / 1024).toFixed(0)} KB`);
    });
  }
  for (const w of warnings) console.warn(`warning: ${w}`);
}

main();
