/**
 * Recipe write-ups (`cookbook/<slug>/en.mdx`, `es.mdx`, `ca.mdx`, `zh.mdx`): YAML
 * frontmatter read with gray-matter, the body split into template sections,
 * and the references the body makes (excerpt regions, gotchas, features,
 * recipes, docs links) for the tests and the lint.
 *
 * Isomorphic Node (site server, tests, CLI): relative `.ts` imports only.
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { recipeDir } from "./paths.ts";
import { linesOutsideFences, splitSections } from "./sections.ts";
import type { Locale, Localized, RecipeFrontmatter, RecipeWriteup, SectionId } from "./types.ts";
import { unquotedFrontmatter, validateFrontmatter } from "./validate.ts";

export interface ParsedWriteup extends RecipeWriteup {
  /** Frontmatter, quoting and template problems, prefixed with the file name. */
  issues: string[];
}

export function writeupPath(slug: string, locale: Locale): string {
  return path.join(recipeDir(slug), `${locale}.mdx`);
}

function toFrontmatter(data: Record<string, unknown>): RecipeFrontmatter {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : undefined);
  const fm: RecipeFrontmatter = { title: text(data.title) ?? "", summary: text(data.summary) ?? "" };
  const plain = text(data.plain);
  const description = text(data.description);
  const question = text(data.question);
  if (plain) fm.plain = plain;
  if (description) fm.description = description;
  if (question) fm.question = question;
  if (Array.isArray(data.aliases)) {
    fm.aliases = data.aliases.filter((a): a is string => typeof a === "string" && a.trim() !== "").map((a) => a.trim());
  }
  if (data.pageNotes && typeof data.pageNotes === "object" && !Array.isArray(data.pageNotes)) {
    fm.pageNotes = Object.fromEntries(
      Object.entries(data.pageNotes as Record<string, unknown>)
        .filter(([, note]) => typeof note === "string")
        .map(([page, note]) => [String(page), String(note)]),
    );
  }
  return fm;
}

/** Parses a write-up's source. `headings` are taxonomy.json's localised
 *  section headings. */
export function parseWriteup(source: string, locale: Locale, headings: Record<SectionId, Localized>): ParsedWriteup {
  const file = `${locale}.mdx`;
  const issues: string[] = [];
  let data: Record<string, unknown> = {};
  let body = source;
  try {
    // Passing options bypasses gray-matter's cache, which shares parsed objects between callers.
    const parsed = matter(source, {});
    data = parsed.data as Record<string, unknown>;
    body = parsed.content;
  } catch (error) {
    issues.push(`${file}: the frontmatter is not valid YAML (${(error as Error).message.split("\n")[0]})`);
  }
  issues.push(...validateFrontmatter(data, locale), ...unquotedFrontmatter(source, file));
  const split = splitSections(body, headings, locale);
  issues.push(...split.issues.map((issue) => `${file}: ${issue}`));
  return {
    locale,
    frontmatter: toFrontmatter(data),
    body: body.replace(/^\s*\n/, ""),
    sections: split.sections,
    issues,
  };
}

/** Reads and parses a write-up, or null when the file does not exist. */
export function readWriteup(slug: string, locale: Locale, headings: Record<SectionId, Localized>): ParsedWriteup | null {
  const file = writeupPath(slug, locale);
  if (!fs.existsSync(file)) return null;
  return parseWriteup(fs.readFileSync(file, "utf-8"), locale, headings);
}

// ─── References ─────────────────────────────────────────────────────────────

export interface WriteupRefs {
  /** `<Excerpt region="…">` ids, in order. */
  excerpts: string[];
  /** `<Gotcha id="…">` ids. */
  gotchas: string[];
  /** `<Feature id="…">` ids. */
  features: string[];
  /** `<RecipeLink slug="…">` slugs. */
  recipes: string[];
  /** `<PageRef page={n}>` and `<PageShot page={n}>` pages. */
  pages: number[];
  /** Site-internal Markdown links (`](/en/docs/x#y)`, `](/es/cookbook/z)`). */
  links: string[];
}

function attrValues(lines: string, tag: string, attr: string): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*?\\b${attr}=(?:"([^"]*)"|'([^']*)'|\\{\\s*(\\d+)\\s*\\})`, "g");
  return [...lines.matchAll(pattern)].map((m) => m[1] ?? m[2] ?? m[3]);
}

/** The components and internal links a write-up body uses (outside code fences). */
export function writeupRefs(body: string): WriteupRefs {
  const text = linesOutsideFences(body)
    .map((l) => l.text)
    .join("\n");
  return {
    excerpts: attrValues(text, "Excerpt", "region"),
    gotchas: attrValues(text, "Gotcha", "id"),
    features: attrValues(text, "Feature", "id"),
    recipes: attrValues(text, "RecipeLink", "slug"),
    pages: [...attrValues(text, "PageRef", "page"), ...attrValues(text, "PageShot", "page")].map(Number),
    links: [...text.matchAll(/\]\((\/(?:en|es|ca|zh)\/[^)\s]*)\)/g)].map((m) => m[1]),
  };
}
