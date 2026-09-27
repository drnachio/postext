/**
 * The write-up's fixed template: an MDX body split at its H2 boundaries into
 * section chunks, matched against the localised headings of
 * `taxonomy.json` `sections`. Authors write only the authored sections; the
 * page interleaves the generated ones, so the order cannot drift.
 *
 * Pure and isomorphic: no I/O.
 */
import type { Locale, Localized, SectionId } from "./types.ts";
import { AUTHORED_SECTIONS, REQUIRED_AUTHORED_SECTIONS, SECTION_ORDER } from "./types.ts";

export interface MarkdownLine {
  text: string;
  /** 1-based line number in the body. */
  line: number;
}

/** The body's lines outside fenced code blocks (``` and ~~~). */
export function linesOutsideFences(body: string): MarkdownLine[] {
  const out: MarkdownLine[] = [];
  let fence: string | null = null;
  body.split(/\r?\n/).forEach((text, i) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(text);
    if (marker) {
      if (fence === null) fence = marker[1][0];
      else if (fence === marker[1][0]) fence = null;
      return;
    }
    if (fence === null) out.push({ text, line: i + 1 });
  });
  return out;
}

/** ATX headings of one level, outside code fences, trimmed. */
export function markdownHeadings(body: string, level: number): string[] {
  const pattern = new RegExp(`^#{${level}}\\s+(.+?)\\s*#*\\s*$`);
  return linesOutsideFences(body)
    .map(({ text }) => pattern.exec(text)?.[1])
    .filter((heading): heading is string => Boolean(heading));
}

/** H3 step titles without their "1 · " / "2." numbering. */
export function stepTitles(body: string): string[] {
  return markdownHeadings(body, 3).map((title) => title.replace(/^\d+\s*(?:[·.:)–-]\s*)?/, "").trim());
}

function normalizeHeading(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** The section a localised H2 names, or null. */
export function sectionFor(heading: string, headings: Record<SectionId, Localized>, locale: Locale): SectionId | null {
  const wanted = normalizeHeading(heading);
  return SECTION_ORDER.find((id) => normalizeHeading(headings[id]?.[locale] ?? "") === wanted) ?? null;
}

export interface SplitSections {
  /** Authored chunks by section, without their H2 line, trimmed. */
  sections: Partial<Record<SectionId, string>>;
  /** The recognised H2s in the order written. */
  order: SectionId[];
  /** Text before the first H2 (ignored by the page). */
  preamble: string;
  /** Template problems: preamble, unknown or generated headings, duplicates, order, missing sections. */
  issues: string[];
}

/** Splits an MDX body (frontmatter already stripped) at its H2 lines. */
export function splitSections(body: string, headings: Record<SectionId, Localized>, locale: Locale): SplitSections {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const outside = new Set(linesOutsideFences(body).map((l) => l.line));
  const sections: Partial<Record<SectionId, string>> = {};
  const order: SectionId[] = [];
  const issues: string[] = [];
  const preamble: string[] = [];
  let current: SectionId | null = null;
  let skipping = false;
  let buffer: string[] = [];

  const flush = () => {
    if (current && !skipping) sections[current] = buffer.join("\n").trim();
    buffer = [];
  };

  lines.forEach((text, i) => {
    const h2 = outside.has(i + 1) ? /^##\s+(.+?)\s*#*\s*$/.exec(text) : null;
    if (!h2) {
      if (current === null && !skipping) preamble.push(text);
      else buffer.push(text);
      return;
    }
    flush();
    const id = sectionFor(h2[1], headings, locale);
    skipping = true;
    current = null;
    if (!id) {
      const expected = AUTHORED_SECTIONS.map((s) => `"${headings[s]?.[locale]}"`).join(", ");
      issues.push(`line ${i + 1}: "## ${h2[1]}" is not a section of the template (${expected})`);
    } else if (!AUTHORED_SECTIONS.includes(id)) {
      issues.push(`line ${i + 1}: "## ${h2[1]}" is generated from the recipe files; do not write it`);
    } else if (order.includes(id)) {
      issues.push(`line ${i + 1}: "## ${h2[1]}" appears twice`);
    } else {
      const last = order[order.length - 1];
      if (last && SECTION_ORDER.indexOf(id) < SECTION_ORDER.indexOf(last)) {
        issues.push(`line ${i + 1}: "## ${h2[1]}" must come before "${headings[last]?.[locale]}"`);
      }
      order.push(id);
      current = id;
      skipping = false;
    }
  });
  flush();

  const before = preamble.join("\n").trim();
  if (before) issues.push("text before the first H2 is ignored; move it into a section");
  for (const id of REQUIRED_AUTHORED_SECTIONS) {
    if (!order.includes(id)) issues.push(`missing the required section "## ${headings[id]?.[locale]}"`);
    else if (!sections[id]) issues.push(`the section "## ${headings[id]?.[locale]}" is empty`);
  }
  return { sections, order, preamble: before, issues };
}
