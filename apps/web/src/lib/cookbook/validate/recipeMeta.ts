// Checks of one recipe.json and of the whole set: slugs, dates, licences,
// fields and cross references (#1276: split out of validate.ts).
import { SLUG_PATTERN, RESERVED_SLUGS, type Registry, REQUIRED_KIT, IMAGE_BUDGET, CARD_AIM_KB, type RecipeMeta } from '../types.ts';
import { schemaErrors } from './jsonSchema.ts';
import { RECIPE_SCHEMA } from './recipeSchema.ts';
import { compareSemVer, nextRelease } from './releases.ts';

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asStrings(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value when it is a plain object, else an empty one. */
function obj(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

/** NC and ND licences, however they are spelled. */
const NON_FREE_LICENSE = /(^|[^a-z])(nc|nd)([^a-z]|$)|noncommercial|non-commercial|noderiv/i;

/** Errors of a slug on its own (pattern, length, reserved words). */
export function validateSlug(slug: string): string[] {
  const errors: string[] = [];
  if (!SLUG_PATTERN.test(slug)) errors.push(`slug "${slug}" must be lowercase words joined by hyphens`);
  if (slug.length < 3 || slug.length > 48) errors.push(`slug "${slug}" must have 3–48 characters`);
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) errors.push(`slug "${slug}" is reserved`);
  return errors;
}

// ─── recipe.json ────────────────────────────────────────────────────────────

export interface RecipeValidationOptions {
  /** Every recipe folder (for related, replacedBy and formerSlugs); unchecked when omitted. */
  knownSlugs?: Iterable<string>;
  /** Released package versions (packages/*\/package.json); unchecked when omitted. */
  released?: { postext?: string; postextPdf?: string };
  /** Previewing on the workspace engine (`--engine local`): a draft may pin
   *  a version newer than the released one, up to the next major. */
  preview?: boolean;
}

/** Every problem with a recipe.json: the schema, then the semantic rules. */
export function validateRecipeMeta(
  meta: unknown,
  slug: string,
  registry: Registry,
  { knownSlugs, released, preview = false }: RecipeValidationOptions = {},
): string[] {
  const errors: string[] = validateSlug(slug).map((e) => `recipe folder: ${e}`);
  if (!isObject(meta)) return [...errors, "recipe.json must hold an object"];
  const known = knownSlugs ? new Set(knownSlugs) : null;

  // Licences first, so an NC/ND licence reads as such rather than as a bad enum.
  const nonFree = new Set<string>();
  const credits = obj(meta.credits);
  for (const group of ["text", "images"] as const) {
    asArray(credits[group]).forEach((credit, i) => {
      const license = isObject(credit) ? credit.license : undefined;
      const path = `credits.${group}[${i}].license`;
      if (typeof license === "string" && NON_FREE_LICENSE.test(license)) {
        nonFree.add(path);
        errors.push(`${path}: "${license}" is not allowed: NC and ND licences keep recipes from being reused and adapted`);
      } else if (group === "images" && license === "CC-BY-SA-4.0") {
        errors.push(`${path}: CC-BY-SA-4.0 is allowed for sample text only (credits.text)`);
      }
    });
  }
  for (const error of schemaErrors(meta, RECIPE_SCHEMA)) {
    if (!nonFree.has(error.path)) errors.push(`${error.path}: ${error.message}`);
  }

  const m = meta;
  const need = <K extends keyof Registry>(kind: K, ids: string[], path: string, label: string) => {
    const table = registry[kind] as Record<string, unknown> | undefined;
    for (const id of ids) {
      if (!table || !Object.prototype.hasOwnProperty.call(table, id)) {
        errors.push(`${path}: unknown ${label} "${id}" (not in cookbook/_registry/${kind}.json)`);
      }
    }
  };

  // Registry references.
  const features = obj(m.features);
  const primary = asStrings(features.primary);
  const also = asStrings(features.also);
  need("features", primary, "features.primary", "feature");
  need("features", also, "features.also", "feature");
  for (const id of primary) if (also.includes(id)) errors.push(`features.also: "${id}" is already primary`);
  const featureCount = new Set([...primary, ...also]).size;
  if (featureCount < 2 || featureCount > 20) {
    errors.push(`features: a recipe lists 2–20 features in all (has ${featureCount})`);
  }
  need("questions", asStrings(m.answers), "answers", "question");
  need("gaps", asStrings(m.gaps), "gaps", "gap");
  need("gotchas", asStrings(m.gotchas), "gotchas", "gotcha");
  need("warnings", asStrings(m.explainsWarnings), "explainsWarnings", "warning kind");
  const capture = obj(m.capture);
  const expect = obj(capture.expect);
  need("warnings", asStrings(expect.warnings), "capture.expect.warnings", "warning kind");

  // Other recipes.
  for (const other of asStrings(m.related)) {
    if (other === slug) errors.push(`related: a recipe cannot relate to itself`);
    else if (known && !known.has(other)) errors.push(`related: no recipe "${other}"`);
  }
  const replacedBy = typeof m.replacedBy === "string" ? m.replacedBy : "";
  if (m.status === "retired") {
    if (!replacedBy) errors.push(`replacedBy: required when status is "retired"`);
    else if (replacedBy === slug) errors.push(`replacedBy: a recipe cannot replace itself`);
    else if (known && !known.has(replacedBy)) errors.push(`replacedBy: no recipe "${replacedBy}"`);
  } else if (m.replacedBy !== undefined) {
    errors.push(`replacedBy: only for status "retired"`);
  }
  for (const former of asStrings(m.formerSlugs)) {
    if (former === slug) errors.push(`formerSlugs: "${former}" is the current slug`);
    else if (known?.has(former)) errors.push(`formerSlugs: "${former}" is an existing recipe folder`);
    for (const e of validateSlug(former)) errors.push(`formerSlugs: ${e}`);
  }

  // Outputs, engine and kit.
  const outputs = asStrings(m.outputs);
  const kit = asStrings(m.kit);
  const engine = obj(m.engine);
  const pdf = outputs.includes("pdf");
  if (pdf && !engine.postextPdf) errors.push(`engine.postextPdf: required when outputs include "pdf"`);
  if (!pdf && engine.postextPdf !== undefined) errors.push(`engine.postextPdf: only for recipes whose outputs include "pdf"`);
  if (pdf !== kit.includes("pdf")) {
    errors.push(pdf ? `kit: a "pdf" output needs the "pdf" kit block` : `kit: the "pdf" block is only for recipes with a "pdf" output`);
  }
  for (const block of REQUIRED_KIT) if (!kit.includes(block)) errors.push(`kit: must include "${block}"`);
  // Both blocks declare showBook: composed together, the module would not parse.
  if (kit.includes("book") && kit.includes("cjk")) errors.push(`kit: list "book" or "cjk", not both (the cjk block carries its own showBook)`);
  const downloads = obj(m.downloads);
  if (downloads.pdf && !pdf) errors.push(`downloads.pdf: needs a "pdf" output`);
  // A draft previewing the next release may pin it; a recipe is captured
  // from npm, so nothing else may be ahead of the release.
  const ahead = (key: "postext" | "postextPdf", name: string) => {
    const pinned = engine[key];
    const out = released?.[key];
    if (!out || typeof pinned !== "string" || compareSemVer(pinned, out) <= 0) return;
    if (preview && m.status === "draft") {
      if (compareSemVer(pinned, nextRelease(out)) > 0) {
        errors.push(`engine.${key}: ${pinned} is past the next release of ${name} (${out} is out; a draft previews at most ${nextRelease(out)})`);
      }
      return;
    }
    errors.push(`engine.${key}: ${pinned} is newer than the released ${name} ${out} (keep the recipe a draft and preview it with --engine local until the release)`);
  };
  ahead("postext", "postext");
  ahead("postextPdf", "postext-pdf");

  // Capture.
  const hero = capture.hero;
  const heroPages = Array.isArray(hero) ? hero.filter((n): n is number => typeof n === "number") : typeof hero === "number" ? [hero] : [];
  // Which page is a verso depends on the book page number (a continuation's
  // pageIndexOffset), known only to the capture: it checks the parity.
  if (Array.isArray(hero) && heroPages.length === 2) {
    const [verso, recto] = heroPages;
    if (recto !== verso + 1) {
      errors.push(`capture.hero: a spread is two facing pages, [verso, verso + 1]; got [${verso}, ${recto}]`);
    }
  }
  const card = capture.card;
  const focus = isObject(capture.focus) ? capture.focus : null;
  if ((card === "loupe" || card === "crop") && !focus) errors.push(`capture.focus: required for card "${card}"`);
  if (focus) {
    const { x, y, w, h } = focus as Record<string, number>;
    if (typeof w === "number" && typeof h === "number" && (w <= 0 || h <= 0)) errors.push(`capture.focus: w and h must be > 0`);
    if (typeof x === "number" && typeof w === "number" && x + w > 1.0001) errors.push(`capture.focus: x + w must be ≤ 1`);
    if (typeof y === "number" && typeof h === "number" && y + h > 1.0001) errors.push(`capture.focus: y + h must be ≤ 1`);
    if (card === "loupe" && typeof focus.page === "number" && !heroPages.includes(focus.page)) {
      errors.push(`capture.focus.page: a loupe magnifies the hero page (${heroPages.join(", ")})`);
    }
  }
  if (card !== "screenshot") {
    if (capture.selector !== undefined) errors.push(`capture.selector: only for card "screenshot"`);
    if (capture.viewport !== undefined) errors.push(`capture.viewport: only for card "screenshot"`);
  }
  if (Array.isArray(capture.pages)) {
    for (const n of heroPages) {
      if (!capture.pages.includes(n)) errors.push(`capture.pages: must include the hero page ${n}`);
    }
  }
  // `capture.sandbox` picks one of the builds a `capture.doc` list publishes.
  if (capture.sandbox !== undefined) {
    const builds = Array.isArray(capture.doc) ? capture.doc.length : 0;
    if (builds < 2) {
      errors.push(`capture.sandbox: chooses among the builds of a capture.doc list; capture.doc ${builds ? "lists one build" : "names one build"}`);
    } else if (typeof capture.sandbox === "number" && capture.sandbox >= builds) {
      errors.push(`capture.sandbox: no build ${capture.sandbox} in capture.doc, which lists ${builds} (0–${builds - 1})`);
    }
  }
  if (Array.isArray(expect.pages) && typeof expect.pages[0] === "number" && typeof expect.pages[1] === "number") {
    if (expect.pages[0] > expect.pages[1]) errors.push(`capture.expect.pages: [min, max] with min ≤ max`);
  }
  if (expect.raggedLines !== undefined && !(Number.isInteger(expect.raggedLines) && (expect.raggedLines as number) >= 0)) {
    errors.push(`capture.expect.raggedLines: a whole number of lines, 0 or more`);
  }
  if (typeof expect.systemFont === "string") {
    const listed = [...expect.systemFont];
    if (listed.some((ch) => /[\s\p{L}\p{Nd}]/u.test(ch))) errors.push(`capture.expect.systemFont: marks only (☐), never a letter, a digit or a space: a face of the recipe sets those`);
    if (new Set(listed).size !== listed.length) errors.push(`capture.expect.systemFont: each character once`);
  }
  if (typeof expect.imageMb === "number" && expect.imageMb <= IMAGE_BUDGET.warnMb) {
    errors.push(`capture.expect.imageMb: the default warning starts at ${IMAGE_BUDGET.warnMb} MB; state a figure above it or leave it out`);
  }
  if (isObject(expect.cardKb)) {
    for (const [key, aim] of [["card", CARD_AIM_KB.card], ["card480", CARD_AIM_KB.card480], ["og", CARD_AIM_KB.og]] as const) {
      const figure = (expect.cardKb as Record<string, unknown>)[key];
      if (typeof figure === "number" && figure <= aim) errors.push(`capture.expect.cardKb.${key}: the aim is already ${aim} KB; state a figure above it or leave it out`);
    }
    if (Object.keys(expect.cardKb).length === 0) errors.push(`capture.expect.cardKb: omit it rather than leave it empty`);
  }
  if (expect.defaultSkin !== undefined && asArray(expect.defaultSkin).length === 0) {
    errors.push(`capture.expect.defaultSkin: omit it rather than leave it empty`);
  }

  // Credits.
  const families = asArray(credits.fonts).map((font) => (isObject(font) ? font.family : undefined));
  const seenFamilies = new Set<unknown>();
  for (const family of families) {
    if (seenFamilies.has(family)) errors.push(`credits.fonts: "${String(family)}" is listed twice`);
    seenFamilies.add(family);
  }
  const files = asArray(credits.images).map((credit) => (isObject(credit) ? credit.file : undefined)).filter(Boolean);
  if (new Set(files).size !== files.length) errors.push(`credits.images: two credits cover the same file`);

  // Dates.
  if (m.created !== undefined && !isValidDate(m.created)) errors.push(`created: "${String(m.created)}" is not a calendar date`);
  if (m.updated !== undefined && !isValidDate(m.updated)) errors.push(`updated: "${String(m.updated)}" is not a calendar date`);
  if (isValidDate(m.created) && isValidDate(m.updated) && m.updated < m.created) {
    errors.push(`updated: ${m.updated} is before created (${m.created})`);
  }
  return [...new Set(errors)];
}

/** Rules across recipes: unique Nº, unique order per chapter, and
 *  redirects (formerSlugs) that collide with nothing. */
export function validateRecipeSet(recipes: readonly { slug: string; meta: RecipeMeta }[]): string[] {
  const errors: string[] = [];
  const byNumber = new Map<number, string>();
  const byOrder = new Map<string, string>();
  const slugs = new Set(recipes.map((r) => r.slug));
  const formers = new Map<string, string>();
  for (const { slug, meta } of recipes) {
    const numbered = byNumber.get(meta.number);
    if (numbered) errors.push(`${slug}: Nº ${meta.number} is already used by ${numbered}`);
    else byNumber.set(meta.number, slug);
    if (meta.status !== "retired") {
      const key = `${meta.chapter}:${meta.order}`;
      const ordered = byOrder.get(key);
      if (ordered) errors.push(`${slug}: order ${meta.order} in chapter "${meta.chapter}" is already used by ${ordered}`);
      else byOrder.set(key, slug);
    }
    for (const former of meta.formerSlugs ?? []) {
      if (slugs.has(former)) errors.push(`${slug}: former slug "${former}" is a recipe folder`);
      const owner = formers.get(former);
      if (owner) errors.push(`${slug}: former slug "${former}" is also claimed by ${owner}`);
      else formers.set(former, slug);
    }
  }
  return errors;
}
