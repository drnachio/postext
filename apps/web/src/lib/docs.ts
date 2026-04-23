import fs from "fs";
import path from "path";
import GithubSlugger from "github-slugger";

export interface DocMeta {
  slug: string;
  title: string;
  sidebarTitle: string;
  description: string;
  lang: string;
  lastUpdated: string;
  readingTime: string;
  order: number;
}

export interface DocEntry {
  slug: string;
  locales: Record<string, DocMeta>;
}

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

const DOCS_DIR = path.join(process.cwd(), "../../docs");

function extractMetadataFromSource(source: string): Omit<DocMeta, "slug"> {
  const metaMatch = source.match(
    /export\s+const\s+metadata\s*=\s*\{([\s\S]+?)\}/
  );
  if (!metaMatch) {
    return {
      title: "Untitled",
      sidebarTitle: "Untitled",
      description: "",
      lang: "en",
      lastUpdated: "",
      readingTime: "",
      order: 99,
    };
  }
  const block = metaMatch[1];
  const get = (key: string) => {
    const m = block.match(new RegExp(`${key}:\\s*['"]([^'"]+)['"]`));
    return m ? m[1] : "";
  };
  const getNum = (key: string) => {
    const m = block.match(new RegExp(`${key}:\\s*(\\d+)`));
    return m ? parseInt(m[1], 10) : 99;
  };
  const title = get("title");
  return {
    title,
    sidebarTitle: get("sidebarTitle") || title,
    description: get("description"),
    lang: get("lang"),
    lastUpdated: get("lastUpdated"),
    readingTime: get("readingTime"),
    order: getNum("order"),
  };
}

export function getAllDocs(): DocEntry[] {
  if (!fs.existsSync(DOCS_DIR)) return [];

  const files = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith(".mdx"));
  const grouped: Record<string, DocEntry> = {};

  for (const file of files) {
    const match = file.match(/^(.+)-(en|es)\.mdx$/);
    if (!match) continue;

    const [, slug, locale] = match;
    const source = fs.readFileSync(path.join(DOCS_DIR, file), "utf-8");
    const meta = extractMetadataFromSource(source);

    if (!grouped[slug]) {
      grouped[slug] = { slug, locales: {} };
    }
    grouped[slug].locales[locale] = { slug, ...meta };
  }

  return Object.values(grouped).sort((a, b) => {
    const orderA = Math.min(...Object.values(a.locales).map((m) => m.order));
    const orderB = Math.min(...Object.values(b.locales).map((m) => m.order));
    return orderA - orderB;
  });
}

export function getDocSlugsForLocale(locale: string): string[] {
  const docs = getAllDocs();
  return docs.filter((d) => d.locales[locale]).map((d) => d.slug);
}

export function getDocSource(
  slug: string,
  locale: string
): { source: string; meta: DocMeta } | null {
  const filePath = path.join(DOCS_DIR, `${slug}-${locale}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const source = fs.readFileSync(filePath, "utf-8");
  const meta = { slug, ...extractMetadataFromSource(source) };
  return { source, meta };
}

function createSlugger() {
  const slugger = new GithubSlugger();
  return (text: string): string => slugger.slug(text);
}

export function extractToc(source: string): TocItem[] {
  const items: TocItem[] = [];
  const lines = source.split("\n");
  const slugger = createSlugger();

  let fence: string | null = null;
  for (const line of lines) {
    const fenceMatch = line.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (!match) continue;
    const level = match[1].length;
    const text = match[2].trim();
    const id = slugger(text);
    if (id) items.push({ id, text, level });
  }

  return items;
}

export function hasLocaleVersion(slug: string, locale: string): boolean {
  const filePath = path.join(DOCS_DIR, `${slug}-${locale}.mdx`);
  return fs.existsSync(filePath);
}

export interface SearchSection {
  id: string;
  slug: string;
  docTitle: string;
  anchor: string;
  sectionTitle: string;
  breadcrumb: string;
  level: number;
  body: string;
}

function stripMdxForSearch(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~]+/g, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractSearchSections(slug: string, source: string, docTitle: string): SearchSection[] {
  const sections: SearchSection[] = [];
  const lines = source.split("\n");
  const slugger = createSlugger();

  const stack: { title: string; level: number }[] = [];
  let current: { anchor: string; title: string; level: number; breadcrumb: string; buffer: string[] } = {
    anchor: "",
    title: docTitle,
    level: 0,
    breadcrumb: "",
    buffer: [],
  };

  let fence: string | null = null;
  let inMetaBlock = false;
  let counter = 0;

  const flush = () => {
    const body = stripMdxForSearch(current.buffer.join("\n"));
    if (body || current.title) {
      sections.push({
        id: `${slug}::${counter++}`,
        slug,
        docTitle,
        anchor: current.anchor,
        sectionTitle: current.title,
        breadcrumb: current.breadcrumb,
        level: current.level,
        body,
      });
    }
  };

  for (const line of lines) {
    if (!fence && /^export\s+const\s+metadata\s*=\s*\{/.test(line)) {
      inMetaBlock = true;
      continue;
    }
    if (inMetaBlock) {
      if (/^\};?\s*$/.test(line)) inMetaBlock = false;
      continue;
    }

    const fenceMatch = line.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      current.buffer.push(line);
      continue;
    }

    if (fence === null) {
      const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        flush();
        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();
        while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
        const breadcrumb = stack.map((s) => s.title).join(" › ");
        stack.push({ title, level });
        current = {
          anchor: slugger(title),
          title,
          level,
          breadcrumb,
          buffer: [],
        };
        continue;
      }
    }

    current.buffer.push(line);
  }

  flush();
  return sections;
}

export function buildSearchIndex(locale: string): SearchSection[] {
  const docs = getAllDocs();
  const out: SearchSection[] = [];
  for (const doc of docs) {
    const meta = doc.locales[locale];
    if (!meta) continue;
    const source = getDocSource(doc.slug, locale);
    if (!source) continue;
    out.push(...extractSearchSections(doc.slug, source.source, meta.title));
  }
  return out;
}
