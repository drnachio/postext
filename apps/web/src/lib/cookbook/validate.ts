/**
 * Validation of recipe metadata, write-up frontmatter and the registries.
 *
 * `RECIPE_SCHEMA` is the JSON Schema of recipe.json (`pnpm cookbook schema`
 * writes it to cookbook/recipe.schema.json for editors). The validator
 * interprets that same literal, then adds the rules a schema cannot say:
 * registry ids, cross-field rules, licences and dates. Every function
 * returns a list of human-readable errors; an empty list means valid.
 *
 * Pure and isomorphic: no I/O.
 */
import { LOCALES, type Registry, CHAPTER_IDS, GENRE_IDS, OUTPUT_IDS, SECTION_ORDER, SLUG_PATTERN } from './types.ts';
import { quoteList } from './validate/jsonSchema.ts';
import { isObject, asArray } from './validate/recipeMeta.ts';

export { schemaErrors } from './validate/jsonSchema.ts';
export type { JsonSchema } from './validate/jsonSchema.ts';
export { RECIPE_SCHEMA, recipeSchemaJson } from './validate/recipeSchema.ts';
export { compareSemVer, previewDraft, gotchaRetired, shownGotchas, fixedNotes, fixedGaps } from './validate/releases.ts';
export type { FixedNote, FixedGap } from './validate/releases.ts';
export { validateSlug, validateRecipeMeta, validateRecipeSet } from './validate/recipeMeta.ts';
export type { RecipeValidationOptions } from './validate/recipeMeta.ts';
export { validateFrontmatter, frontmatterBlock, unquotedFrontmatter } from './validate/frontmatter.ts';

// ─── Registries ─────────────────────────────────────────────────────────────

export interface RegistryValidationOptions {
  /** Every recipe folder; collections may list only these. Unchecked when omitted. */
  knownSlugs?: Iterable<string>;
  /** Require 1–4 `featured` entries (once a recipe is published). */
  requireFeatured?: boolean;
}

const FEATURE_GROUPS = [
  "page", "text", "fonts", "languages", "headings", "furniture", "boxes", "figures", "tables", "math",
  "structure", "colour", "pdf", "html", "integration", "comics", "exercises",
];
const SEMVER = /^\d+\.\d+\.\d+$/;

/** Every object with a locale key (`en`, `es`, `ca`, `zh`, `ar`) must carry non-empty
 *  text (or a list of non-empty strings) in each. */
function localizedErrors(value: unknown, path: string, errors: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => localizedErrors(item, `${path}[${i}]`, errors));
    return;
  }
  if (!isObject(value)) return;
  if (LOCALES.some((locale) => locale in value)) {
    for (const locale of LOCALES) {
      const text = value[locale];
      const ok =
        (typeof text === "string" && text.trim() !== "") ||
        (Array.isArray(text) && text.every((item) => typeof item === "string" && item.trim() !== ""));
      if (!ok) errors.push(`${path}.${locale}: must be non-empty text`);
    }
    return;
  }
  for (const [key, item] of Object.entries(value)) localizedErrors(item, path ? `${path}.${key}` : key, errors);
}

function anchorErrors(anchor: unknown, path: string, errors: string[]): void {
  if (!isObject(anchor) || typeof anchor.slug !== "string" || !anchor.slug || !isObject(anchor.heading)) {
    errors.push(`${path}: must be { slug, heading: { en, es, ca, zh, ar } }`);
  }
}

/** Problems with the registries: localisation, taxonomy consistency and
 *  references between registries and to recipes. Doc anchors are resolved
 *  by the tests (docLinks.ts), not here. */
export function validateRegistry(registry: Registry, { knownSlugs, requireFeatured }: RegistryValidationOptions = {}): string[] {
  const errors: string[] = [];
  localizedErrors(registry, "", errors);
  const known = knownSlugs ? new Set(knownSlugs) : null;
  const { taxonomy } = registry;

  // Taxonomy.
  if (!isObject(taxonomy)) return [...errors, "taxonomy: missing"];
  const parts = asArray(taxonomy.parts) as Registry["taxonomy"]["parts"];
  const partIds = parts.map((p) => p.id);
  if (partIds.join() !== "page,book,practice") errors.push(`taxonomy.parts: must be page, book, practice (in order)`);
  const colors = parts.map((p) => p.color);
  if (new Set(colors).size !== colors.length) errors.push(`taxonomy.parts: every part needs its own colour`);
  const chapters = asArray(taxonomy.chapters) as Registry["taxonomy"]["chapters"];
  if (chapters.length > 12) errors.push(`taxonomy.chapters: at most 12 chapters (has ${chapters.length})`);
  const chapterIds = new Set<string>();
  const numbers = new Set<number>();
  for (const chapter of chapters) {
    const at = `taxonomy.chapters.${chapter.id}`;
    if (!(CHAPTER_IDS as readonly string[]).includes(chapter.id)) errors.push(`${at}: unknown chapter id (types.ts ChapterId)`);
    if (chapterIds.has(chapter.id)) errors.push(`${at}: listed twice`);
    chapterIds.add(chapter.id);
    if (!Number.isInteger(chapter.number) || chapter.number < 1) errors.push(`${at}.number: must be a positive integer`);
    if (numbers.has(chapter.number)) errors.push(`${at}.number: ${chapter.number} is used twice`);
    numbers.add(chapter.number);
    if (!partIds.includes(chapter.part)) errors.push(`${at}.part: unknown part "${chapter.part}"`);
  }
  for (const id of CHAPTER_IDS) if (!chapterIds.has(id)) errors.push(`taxonomy.chapters: "${id}" is missing`);
  // Chapter numbers follow the parts: a later part never holds a lower number.
  const sorted = [...chapters].sort((a, b) => a.number - b.number);
  for (let i = 1; i < sorted.length; i++) {
    if (partIds.indexOf(sorted[i].part) < partIds.indexOf(sorted[i - 1].part)) {
      errors.push(`taxonomy.chapters: chapter ${sorted[i].number} (${sorted[i].id}) is numbered out of its part's order`);
    }
  }
  const sameSet = (name: string, actual: unknown[], expected: readonly unknown[]) => {
    const got = new Set(actual);
    if (got.size !== actual.length || expected.some((id) => !got.has(id)) || actual.some((id) => !expected.includes(id))) {
      errors.push(`taxonomy.${name}: must list exactly ${quoteList(expected)}`);
    }
  };
  sameSet("genres", asArray(taxonomy.genres).map((g) => (g as { id: unknown }).id), GENRE_IDS);
  sameSet("outputs", asArray(taxonomy.outputs).map((o) => (o as { id: unknown }).id), OUTPUT_IDS);
  sameSet("levels", asArray(taxonomy.levels).map((l) => (l as { id: unknown }).id), [1, 2, 3]);
  const sections = isObject(taxonomy.sections) ? taxonomy.sections : {};
  sameSet("sections", Object.keys(sections), SECTION_ORDER);
  for (const locale of LOCALES) {
    const headings = Object.values(sections).map((h) => (isObject(h) ? h[locale] : undefined));
    if (new Set(headings).size !== headings.length) errors.push(`taxonomy.sections: two sections share a ${locale} heading`);
  }

  // Features, APIs, config keys.
  for (const [id, feature] of Object.entries(registry.features ?? {})) {
    const at = `features.${id}`;
    if (!FEATURE_GROUPS.includes(feature.group)) errors.push(`${at}.group: unknown group "${feature.group}"`);
    anchorErrors(feature.docs, `${at}.docs`, errors);
    if (feature.since !== undefined && !SEMVER.test(feature.since)) errors.push(`${at}.since: must be a version`);
    if (feature.aliases !== undefined && !isObject(feature.aliases)) errors.push(`${at}.aliases: must be { en: [], es: [], ca: [], zh: [], ar: [], ja: [] }`);
    if (feature.detect !== undefined) {
      for (const [key, list] of Object.entries(feature.detect)) {
        if (!["config", "markdown", "api"].includes(key) || !Array.isArray(list)) errors.push(`${at}.detect.${key}: unknown rule`);
      }
    }
  }
  for (const [name, anchor] of Object.entries(registry.apis ?? {})) anchorErrors(anchor, `apis.${name}`, errors);
  for (const [name, anchor] of Object.entries(registry.config ?? {})) anchorErrors(anchor, `config.${name}`, errors);

  // Questions, gaps, warnings, gotchas.
  for (const [id, question] of Object.entries(registry.questions ?? {})) {
    const at = `questions.${id}`;
    if (question.kind !== "how" && question.kind !== "why") errors.push(`${at}.kind: must be "how" or "why"`);
    if (typeof question.theme !== "string" || !question.theme) errors.push(`${at}.theme: required`);
    if (question.gap !== undefined && !registry.gaps?.[question.gap]) errors.push(`${at}.gap: unknown gap "${question.gap}"`);
  }
  for (const [id, gap] of Object.entries(registry.gaps ?? {})) {
    if (!isObject(gap.aliases)) errors.push(`gaps.${id}.aliases: must be { en: [], es: [], ca: [], zh: [], ar: [], ja: [] }`);
    if (gap.docs !== undefined) anchorErrors(gap.docs, `gaps.${id}.docs`, errors);
    if (gap.fixedIn !== undefined && !SEMVER.test(gap.fixedIn)) errors.push(`gaps.${id}.fixedIn: must be a version`);
  }
  for (const [kind, warning] of Object.entries(registry.warnings ?? {})) {
    if (!["engine", "parse", "sandbox"].includes(warning.source)) errors.push(`warnings.${kind}.source: must be engine, parse or sandbox`);
    if (warning.docs !== undefined) anchorErrors(warning.docs, `warnings.${kind}.docs`, errors);
  }
  for (const [id, gotcha] of Object.entries(registry.gotchas ?? {})) {
    if (gotcha.feature !== undefined && !registry.features?.[gotcha.feature]) {
      errors.push(`gotchas.${id}.feature: unknown feature "${gotcha.feature}"`);
    }
    if (gotcha.fixedIn !== undefined && !SEMVER.test(gotcha.fixedIn)) errors.push(`gotchas.${id}.fixedIn: must be a version`);
  }

  // Collections.
  for (const [id, collection] of Object.entries(registry.collections ?? {})) {
    const at = `collections.${id}`;
    const recipes = asArray(collection.recipes);
    if (!Array.isArray(collection.recipes)) errors.push(`${at}.recipes: must be a list of slugs`);
    if (new Set(recipes).size !== recipes.length) errors.push(`${at}.recipes: lists a recipe twice`);
    for (const slug of recipes) {
      if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) errors.push(`${at}.recipes: "${String(slug)}" is not a slug`);
      else if (known && !known.has(slug)) errors.push(`${at}.recipes: no recipe folder "${slug}"`);
    }
  }
  const featured = registry.collections?.featured;
  if (featured) {
    const count = asArray(featured.recipes).length;
    if (count > 4) errors.push(`collections.featured: at most 4 recipes (the frontispiece and 3 editor's picks)`);
    if (requireFeatured && count < 1) errors.push(`collections.featured: needs the frontispiece recipe`);
    for (const [loc, slug] of Object.entries(featured.frontispiece ?? {})) {
      const at = `collections.featured.frontispiece.${loc}`;
      if (!(LOCALES as readonly string[]).includes(loc)) errors.push(`${at}: unknown locale`);
      if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) errors.push(`${at}: "${String(slug)}" is not a slug`);
      else if (known && !known.has(slug)) errors.push(`${at}: no recipe folder "${slug}"`);
    }
  } else if (requireFeatured) {
    errors.push(`collections.featured: missing`);
  }
  return errors;
}
