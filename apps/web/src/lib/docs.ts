import fs from "fs";
import path from "path";

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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function extractToc(source: string): TocItem[] {
  const items: TocItem[] = [];
  const lines = source.split("\n");

  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (!match) continue;
    const level = match[1].length;
    const text = match[2].trim();
    const id = slugify(text);
    if (id) items.push({ id, text, level });
  }

  return items;
}

export function hasLocaleVersion(slug: string, locale: string): boolean {
  const filePath = path.join(DOCS_DIR, `${slug}-${locale}.mdx`);
  return fs.existsSync(filePath);
}
