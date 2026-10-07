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
import type { Locale, RecipeMeta, Registry } from "./types.ts";
import {
  CHAPTER_IDS,
  GENRE_IDS,
  KIT_ORDER,
  LOCALES,
  OUTPUT_IDS,
  REQUIRED_KIT,
  RESERVED_SLUGS,
  SAMPLE_LOCALES,
  REQUIRED_LOCALES,
  SECTION_ORDER,
  SLUG_PATTERN,
} from "./types.ts";

// ─── A small JSON Schema (draft-07 subset) ──────────────────────────────────

type JsonType = "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";

export interface JsonSchema {
  $schema?: string;
  $id?: string;
  $ref?: string;
  title?: string;
  description?: string;
  type?: JsonType | JsonType[];
  enum?: readonly (string | number | boolean | null)[];
  const?: string | number | boolean | null;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  items?: JsonSchema | JsonSchema[];
  additionalItems?: boolean | JsonSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  additionalProperties?: boolean | JsonSchema;
  propertyNames?: JsonSchema;
  anyOf?: JsonSchema[];
  definitions?: Record<string, JsonSchema>;
}

interface SchemaError {
  path: string;
  message: string;
}

function typeOf(value: unknown): JsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value as JsonType;
}

function typeMatches(value: unknown, type: JsonType): boolean {
  const actual = typeOf(value);
  return actual === type || (type === "number" && actual === "integer");
}

function joinPath(base: string, key: string | number): string {
  if (typeof key === "number") return `${base}[${key}]`;
  return base ? `${base}.${key}` : key;
}

function quoteList(values: readonly unknown[]): string {
  return values.map((v) => JSON.stringify(v)).join(", ");
}

function resolveRef(ref: string, root: JsonSchema): JsonSchema {
  const name = ref.replace(/^#\/definitions\//, "");
  const target = root.definitions?.[name];
  if (!target) throw new Error(`JSON Schema: unresolved $ref ${ref}`);
  return target;
}

/** Errors of `value` against `schema` (the draft-07 subset used here). */
export function schemaErrors(value: unknown, schema: JsonSchema, root: JsonSchema = schema, path = ""): SchemaError[] {
  if (schema.$ref) return schemaErrors(value, resolveRef(schema.$ref, root), root, path);
  const errors: SchemaError[] = [];
  const at = path || "(root)";
  if (schema.anyOf) {
    const branches = schema.anyOf.map((branch) => schemaErrors(value, branch, root, path));
    if (branches.every((branch) => branch.length > 0)) {
      // Report the branch whose type fits, else a summary.
      const fitting = branches.find((branch) => branch.every((e) => !e.message.startsWith("must be of type")));
      errors.push(...(fitting ?? [{ path: at, message: "does not match any allowed form" }]));
    }
    return errors;
  }
  if (schema.type) {
    const types = [schema.type].flat();
    if (!types.some((type) => typeMatches(value, type))) {
      return [{ path: at, message: `must be of type ${types.join(" or ")}` }];
    }
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push({ path: at, message: `must be ${JSON.stringify(schema.const)}` });
  }
  if (schema.enum && !schema.enum.includes(value as string)) {
    errors.push({ path: at, message: `must be one of ${quoteList(schema.enum)} (got ${JSON.stringify(value)})` });
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path: at, message: schema.minLength === 1 ? "must not be empty" : `must have at least ${schema.minLength} characters` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({ path: at, message: `must have at most ${schema.maxLength} characters` });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push({ path: at, message: `must match ${schema.pattern} (got ${JSON.stringify(value)})` });
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path: at, message: `must be ≥ ${schema.minimum}` });
    if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path: at, message: `must be ≤ ${schema.maximum}` });
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path: at, message: `must have at least ${schema.minItems} item${schema.minItems === 1 ? "" : "s"}` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({ path: at, message: `must have at most ${schema.maxItems} item${schema.maxItems === 1 ? "" : "s"}` });
    }
    if (schema.uniqueItems) {
      const seen = new Set<string>();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) errors.push({ path: at, message: `has a duplicate item ${key}` });
        seen.add(key);
      }
    }
    if (Array.isArray(schema.items)) {
      schema.items.forEach((itemSchema, i) => {
        if (i < value.length) errors.push(...schemaErrors(value[i], itemSchema, root, joinPath(path, i)));
      });
      if (schema.additionalItems === false && value.length > schema.items.length) {
        errors.push({ path: at, message: `must have at most ${schema.items.length} items` });
      }
    } else if (schema.items) {
      const itemSchema = schema.items;
      value.forEach((item, i) => errors.push(...schemaErrors(item, itemSchema, root, joinPath(path, i))));
    }
  }
  if (typeOf(value) === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (obj[key] === undefined) errors.push({ path: joinPath(path, key), message: "is required" });
    }
    for (const [key, item] of Object.entries(obj)) {
      if (schema.propertyNames) errors.push(...schemaErrors(key, schema.propertyNames, root, joinPath(path, key)));
      const propSchema = schema.properties?.[key];
      if (propSchema) errors.push(...schemaErrors(item, propSchema, root, joinPath(path, key)));
      else if (schema.additionalProperties === false) {
        errors.push({ path: joinPath(path, key), message: "is not a known property" });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        errors.push(...schemaErrors(item, schema.additionalProperties, root, joinPath(path, key)));
      }
    }
  }
  return errors;
}

// ─── recipe.json schema ─────────────────────────────────────────────────────

const LICENSES = [
  "original", "PD", "CC0-1.0", "CC-BY", "CC-BY-3.0", "CC-BY-4.0", "CC-BY-SA-4.0", "OFL-1.1", "Apache-2.0", "MIT",
  "reproduction-authorised",
] as const;

const ref = (name: string): JsonSchema => ({ $ref: `#/definitions/${name}` });
const idList = (description: string): JsonSchema => ({
  type: "array",
  items: ref("id"),
  uniqueItems: true,
  description,
});

/** JSON Schema of recipe.json (types.ts `RecipeMeta`). */
export const RECIPE_SCHEMA: JsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://postext.dev/cookbook/recipe.schema.json",
  title: "Postext Cookbook recipe",
  description:
    "cookbook/<slug>/recipe.json. Generated from apps/web/src/lib/cookbook/validate.ts by `pnpm cookbook schema`; do not edit.",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "number", "status", "chapter", "order", "level", "genres", "outputs", "features",
    "answers", "engine", "kit", "sample", "capture", "credits", "license", "created", "updated",
  ],
  properties: {
    $schema: { type: "string" },
    schemaVersion: { const: 1 },
    number: { type: "integer", minimum: 1, description: "Permanent catalogue number (Nº); never reused." },
    status: { enum: ["draft", "published", "retired"] },
    replacedBy: { ...ref("slug"), description: "Required when status is \"retired\"." },
    formerSlugs: { type: "array", items: ref("slug"), uniqueItems: true },
    chapter: { enum: [...CHAPTER_IDS] },
    order: { type: "integer", minimum: 1, description: "Sparse order within the chapter (10, 20, …)." },
    level: { enum: [1, 2, 3] },
    genres: { type: "array", items: { enum: [...GENRE_IDS] }, minItems: 1, maxItems: 3, uniqueItems: true },
    outputs: { type: "array", items: { enum: [...OUTPUT_IDS] }, minItems: 1, maxItems: 4, uniqueItems: true },
    features: {
      type: "object",
      additionalProperties: false,
      required: ["primary", "also"],
      properties: {
        primary: { ...idList("What the recipe teaches (1–3)."), minItems: 1, maxItems: 3 },
        also: { ...idList("Other notable features it uses (0–17)."), maxItems: 17 },
      },
    },
    answers: { ...idList("Question ids; answers[0] is the primary question."), minItems: 1 },
    gaps: idList("Unsupported features this recipe works around."),
    gotchas: idList("Shared pitfalls (cookbook/_registry/gotchas.json)."),
    explainsWarnings: idList("Warning kinds the recipe explains."),
    related: { type: "array", items: ref("slug"), maxItems: 4, uniqueItems: true },
    workarounds: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["package", "note"],
        properties: {
          issue: { type: "integer", minimum: 1 },
          followup: { type: "string", minLength: 1 },
          package: { enum: ["postext", "postext-pdf"] },
          note: { type: "string", minLength: 1 },
        },
      },
    },
    engine: {
      type: "object",
      additionalProperties: false,
      required: ["postext"],
      properties: {
        postext: ref("semver"),
        postextPdf: ref("semver"),
        math: { type: "boolean" },
        worker: { type: "boolean" },
      },
    },
    kit: { type: "array", items: { enum: [...KIT_ORDER] }, minItems: REQUIRED_KIT.length, uniqueItems: true },
    sample: {
      type: "object",
      additionalProperties: false,
      required: ["locales"],
      properties: {
        locales: { type: "array", items: { enum: [...SAMPLE_LOCALES] }, minItems: 1, maxItems: SAMPLE_LOCALES.length, uniqueItems: true },
      },
    },
    capture: {
      type: "object",
      additionalProperties: false,
      required: ["hero", "card"],
      properties: {
        hero: {
          anyOf: [
            ref("page"),
            { type: "array", items: [ref("page"), ref("page")], minItems: 2, additionalItems: false },
          ],
        },
        card: { enum: ["spread", "page", "loupe", "crop", "screenshot"] },
        focus: {
          type: "object",
          additionalProperties: false,
          required: ["page", "x", "y", "w", "h"],
          properties: {
            page: ref("page"),
            x: ref("fraction"),
            y: ref("fraction"),
            w: ref("fraction"),
            h: ref("fraction"),
          },
        },
        pages: {
          anyOf: [{ const: "all" }, { type: "array", items: ref("page"), minItems: 1, maxItems: 12, uniqueItems: true }],
        },
        doc: {
          anyOf: [
            { enum: ["last", "first"] },
            { type: "integer", minimum: 0 },
            {
              type: "array",
              items: { anyOf: [{ enum: ["last", "first"] }, { type: "integer", minimum: 0 }] },
              minItems: 1,
              maxItems: 4,
              uniqueItems: true,
            },
          ],
        },
        selector: { type: "string", minLength: 1 },
        viewport: {
          type: "object",
          additionalProperties: false,
          required: ["width", "height"],
          properties: {
            width: { type: "integer", minimum: 320, maximum: 2560 },
            height: { type: "integer", minimum: 240, maximum: 2560 },
          },
        },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 300000 },
        expect: {
          type: "object",
          additionalProperties: false,
          properties: {
            pages: { type: "array", items: [ref("page"), ref("page")], minItems: 2, additionalItems: false },
            warnings: idList("Engine warnings demonstrated on purpose."),
            nearEmptyPages: { type: "array", items: ref("page"), uniqueItems: true },
            console: { type: "array", items: { type: "string", minLength: 1 } },
            defaultSkin: {
              type: "array",
              items: { enum: ["tables", "callouts", "lists", "headings"] },
              uniqueItems: true,
            },
          },
        },
      },
    },
    downloads: {
      type: "object",
      additionalProperties: false,
      properties: { pdf: { type: "boolean" } },
    },
    folio: {
      description: "How the Sandbox's Folio view presents the publication in 3D (config.folio in the .postext bundle).",
      type: "object",
      additionalProperties: false,
      properties: {
        tilt: { type: "number", minimum: 0, maximum: 70 },
        yaw: { type: "number", minimum: -180, maximum: 180 },
        paper: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { enum: ["uncoated", "bookWove", "coatedMatte", "coatedSilk", "coatedGloss", "bible", "newsprint", "cardStock", "board"] },
            grammage: { type: "number", minimum: 20, maximum: 2500 },
            bulk: { type: "number", minimum: 0.5, maximum: 3 },
            finish: { enum: ["uncoated", "matte", "silk", "gloss"] },
            texture: { enum: ["smooth", "vellum", "wove", "laid", "linen", "felt"] },
            textureStrength: { type: "number", minimum: 0, maximum: 2 },
            shade: ref("hex"),
            showThrough: { type: "boolean" },
          },
        },
        binding: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { enum: ["hardcover", "paperback", "sewn", "layflat", "saddleStitch", "folded"] },
            cover: { enum: ["case", "pages"] },
            coverMaterial: { enum: ["cloth", "paper", "leather"] },
            coverColor: ref("hex"),
          },
        },
        surface: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { enum: ["oak", "walnut", "linen", "felt", "leather", "marble", "plain", "none"] },
            color: ref("hex"),
          },
        },
        lighting: {
          type: "object",
          additionalProperties: false,
          properties: {
            environment: { enum: ["studio", "daylight", "lamp", "overcast", "night"] },
            intensity: { type: "number", minimum: 0.25, maximum: 2 },
            shadows: { type: "boolean" },
          },
        },
      },
    },
    credits: {
      type: "object",
      additionalProperties: false,
      required: ["authors", "text", "images", "fonts"],
      properties: {
        authors: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name"],
            properties: {
              name: { type: "string", minLength: 1 },
              github: { type: "string", pattern: "^[A-Za-z0-9-]+$" },
              url: ref("url"),
            },
          },
        },
        text: { type: "array", items: ref("credit") },
        images: { type: "array", items: ref("credit") },
        fonts: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["family", "license"],
            properties: {
              family: { type: "string", minLength: 1 },
              license: { enum: ["OFL-1.1", "Apache-2.0"] },
            },
          },
        },
      },
    },
    license: {
      type: "object",
      additionalProperties: false,
      required: ["code", "content"],
      properties: {
        code: { const: "MIT" },
        content: { enum: ["MIT", "CC-BY-4.0"] },
      },
    },
    created: ref("date"),
    updated: ref("date"),
  },
  definitions: {
    id: { type: "string", minLength: 1 },
    slug: { type: "string", pattern: SLUG_PATTERN.source, minLength: 3, maxLength: 48 },
    semver: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    url: { type: "string", pattern: "^https?://" },
    hex: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
    page: { type: "integer", minimum: 1 },
    fraction: { type: "number", minimum: 0, maximum: 1 },
    // recipe.json text (credits): English and Spanish are required, other
    // site locales optional (a page falls back to English; `localizedText`).
    localized: {
      type: "object",
      additionalProperties: false,
      required: [...REQUIRED_LOCALES],
      properties: Object.fromEntries(LOCALES.map((locale) => [locale, { type: "string", minLength: 1 } as JsonSchema])),
    },
    credit: {
      type: "object",
      additionalProperties: false,
      required: ["what", "who", "license"],
      properties: {
        what: ref("localized"),
        who: { type: "string", minLength: 1 },
        source: ref("url"),
        license: { enum: [...LICENSES] },
        file: { type: "string", pattern: "^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$" },
      },
    },
  },
};

/** The text `pnpm cookbook schema` writes to cookbook/recipe.schema.json. */
export function recipeSchemaJson(): string {
  return JSON.stringify(RECIPE_SCHEMA, null, 2) + "\n";
}

// ─── Small helpers ──────────────────────────────────────────────────────────

/** Compares "1.4.1"-style versions; missing parts count as 0. */
export function compareSemVer(a: string, b: string): number {
  const pa = a.split(".").map((part) => parseInt(part, 10) || 0);
  const pb = b.split(".").map((part) => parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

/** The furthest version a draft may preview: the next major release
 *  (1.8.4 → 2.0.0), which covers the next minor and patch too. */
function nextRelease(released: string): string {
  const major = parseInt(released.split(".")[0] ?? "0", 10) || 0;
  return `${major + 1}.0.0`;
}

/** A draft that pins a postext newer than the released one: it previews
 *  the next release on the workspace engine (`--engine local`) and is
 *  captured from npm once that release is out. */
export function previewDraft(
  meta: Pick<RecipeMeta, "status" | "engine">,
  released: { postext?: string; postextPdf?: string },
): boolean {
  if (meta.status !== "draft" || !released.postext || typeof meta.engine?.postext !== "string") return false;
  return compareSemVer(meta.engine.postext, released.postext) > 0;
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStrings(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

function isObject(value: unknown): value is Record<string, unknown> {
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
  if (Array.isArray(expect.pages) && typeof expect.pages[0] === "number" && typeof expect.pages[1] === "number") {
    if (expect.pages[0] > expect.pages[1]) errors.push(`capture.expect.pages: [min, max] with min ≤ max`);
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

// ─── Registries ─────────────────────────────────────────────────────────────

export interface RegistryValidationOptions {
  /** Every recipe folder; collections may list only these. Unchecked when omitted. */
  knownSlugs?: Iterable<string>;
  /** Require 1–4 `featured` entries (once a recipe is published). */
  requireFeatured?: boolean;
}

const FEATURE_GROUPS = [
  "page", "text", "fonts", "languages", "headings", "furniture", "boxes", "figures", "tables", "math",
  "structure", "colour", "pdf", "html", "integration", "comics",
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
