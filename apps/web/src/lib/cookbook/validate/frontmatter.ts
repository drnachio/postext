// Checks of a write-up's front matter: known keys, lengths and unquoted
// values (#1276: split out of validate.ts).
import type { Locale } from '../types.ts';
import { isObject } from './recipeMeta.ts';

// ─── Write-up frontmatter ───────────────────────────────────────────────────

const FRONTMATTER_KEYS = ["title", "summary", "plain", "description", "question", "aliases", "pageNotes"];

/** [min, max] characters of each frontmatter text. A Chinese character
 *  carries about what two to three Latin letters do, and search snippets
 *  cut Chinese at about half the Latin length, so zh gets its own bounds.
 *  Japanese mixes kanji with kana, which carry less each, so ja's bounds
 *  sit a little above zh's. */
const FRONTMATTER_LENGTHS: Record<"latin" | "zh" | "ja", Record<"title" | "summary" | "plain" | "description" | "question", [number, number]>> = {
  latin: { title: [1, 60], summary: [60, 160], plain: [40, 240], description: [120, 160], question: [1, 110] },
  zh: { title: [1, 30], summary: [20, 90], plain: [15, 120], description: [40, 90], question: [1, 55] },
  ja: { title: [1, 36], summary: [25, 110], plain: [20, 140], description: [50, 110], question: [1, 65] },
};

/** Problems with a write-up's parsed frontmatter (types.ts `RecipeFrontmatter`). */
export function validateFrontmatter(fm: unknown, locale: Locale): string[] {
  const file = `${locale}.mdx`;
  if (!isObject(fm)) return [`${file}: the frontmatter must be a YAML mapping`];
  const errors: string[] = [];
  const text = (key: string, min: number, max: number, required: boolean) => {
    const value = fm[key];
    if (value === undefined) {
      if (required) errors.push(`${file}: frontmatter "${key}" is required`);
      return;
    }
    if (typeof value !== "string") {
      errors.push(`${file}: frontmatter "${key}" must be a string`);
      return;
    }
    const length = value.trim().length;
    if (length < min || length > max) {
      errors.push(`${file}: frontmatter "${key}" must have ${min > 1 ? `${min}–` : "at most "}${max} characters (has ${length})`);
    }
  };
  const lengths = FRONTMATTER_LENGTHS[locale === "zh" || locale === "ja" ? locale : "latin"];
  text("title", ...lengths.title, true);
  text("summary", ...lengths.summary, true);
  text("plain", ...lengths.plain, false);
  text("description", ...lengths.description, false);
  text("question", ...lengths.question, false);
  if (fm.aliases !== undefined) {
    if (!Array.isArray(fm.aliases) || fm.aliases.some((a) => typeof a !== "string" || !a.trim())) {
      errors.push(`${file}: frontmatter "aliases" must be a list of non-empty strings`);
    }
  }
  if (fm.pageNotes !== undefined) {
    if (!isObject(fm.pageNotes)) errors.push(`${file}: frontmatter "pageNotes" must map page numbers to text`);
    else {
      for (const [page, note] of Object.entries(fm.pageNotes)) {
        if (!/^[1-9]\d*$/.test(page)) errors.push(`${file}: pageNotes key "${page}" must be a page number`);
        if (typeof note !== "string" || !note.trim()) errors.push(`${file}: pageNotes "${page}" must be text`);
      }
    }
  }
  for (const key of Object.keys(fm)) {
    if (!FRONTMATTER_KEYS.includes(key)) errors.push(`${file}: unknown frontmatter key "${key}"`);
  }
  return errors;
}

/** The raw YAML between the leading `---` fences, or null. */
export function frontmatterBlock(source: string): string | null {
  const m = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(source);
  return m ? m[1] : null;
}

const QUOTED = /^("([^"\\]|\\.)*"|'([^']|'')*')$/;

/** Frontmatter values that are not quoted (CR G1: an unquoted `: ` or `#`
 *  silently changes the value). Nested mapping keys (pageNotes) may be bare;
 *  flow lists must hold quoted strings. `name` prefixes the messages. */
export function unquotedFrontmatter(source: string, name: string): string[] {
  const block = frontmatterBlock(source);
  if (block === null) return [];
  const errors: string[] = [];
  block.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || /^\s*#/.test(line)) return;
    const item = /^\s*-\s+(.*)$/.exec(line);
    const entry = /^\s*("[^"]*"|'[^']*'|[^:#]+?)\s*:(?:\s+(.*))?$/.exec(line);
    const value = (item ? item[1] : entry ? (entry[2] ?? "") : line).trim();
    if (!value) return; // a mapping or list follows
    if (value.startsWith("[")) {
      // Only quoted strings, commas and spaces may sit between the brackets.
      const shape = value.replace(/"([^"\\]|\\.)*"|'([^']|'')*'/g, "Q");
      if (!/^\[\s*(Q\s*(,\s*Q\s*)*)?\]$/.test(shape)) {
        errors.push(`${name}: frontmatter line ${i + 2}: quote every list item ("…")`);
      }
    } else if (value.startsWith("{")) {
      // A flow mapping (pageNotes: { "3": "…" }): keys may be bare, values are quoted.
      const shape = value
        .replace(/"([^"\\]|\\.)*"|'([^']|'')*'/g, "Q")
        .replace(/[\w-]+(?=\s*:)/g, "Q");
      if (!/^\{\s*(Q\s*:\s*Q\s*(,\s*Q\s*:\s*Q\s*)*)?\}$/.test(shape)) {
        errors.push(`${name}: frontmatter line ${i + 2}: quote every value ("…")`);
      }
    } else if (!QUOTED.test(value)) {
      errors.push(`${name}: frontmatter line ${i + 2}: quote the value ("…")`);
    }
  });
  return errors;
}
