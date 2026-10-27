// RECIPE_SCHEMA: the schema of recipe.json, and its JSON text (#1276:
// split out of validate.ts).
import { CHAPTER_IDS, GENRE_IDS, OUTPUT_IDS, KIT_ORDER, REQUIRED_KIT, SAMPLE_LOCALES, IMAGE_BUDGET, SLUG_PATTERN, REQUIRED_LOCALES, LOCALES } from '../types.ts';
import type { JsonSchema } from './jsonSchema.ts';

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
        sandbox: { anyOf: [{ enum: ["last", "first"] }, { type: "integer", minimum: 0 }] },
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
            raggedLines: { type: "integer", minimum: 0, description: "Justified lines the edition may set ragged (check C34)." },
            systemFont: { type: "string", minLength: 1, maxLength: 8, description: "Characters the pages take from a font of the system, named in the write-up (check C36)." },
            imageMb: { type: "number", minimum: IMAGE_BUDGET.warnMb, maximum: IMAGE_BUDGET.maxStatedMb, description: "Megabytes of page images the edition means to publish (check C20)." },
            cardKb: {
              type: "object",
              additionalProperties: false,
              properties: {
                card: { type: "integer", minimum: 1, maximum: 250 },
                card480: { type: "integer", minimum: 1, maximum: 100 },
                og: { type: "integer", minimum: 1, maximum: 250 },
              },
              description: "Kilobytes a card file means to weigh where it passes its aim (check C20).",
            },
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
