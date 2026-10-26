/**
 * The Cookbook's data model: recipe metadata (`cookbook/<slug>/recipe.json`),
 * write-up frontmatter, the bilingual registries (`cookbook/_registry/*.json`),
 * the capture manifest the CLI writes (`public/cookbook/<slug>/capture.json`)
 * and the per-locale catalogue the gallery searches.
 *
 * Isomorphic: imported by the site, the tests and the Node CLI
 * (`scripts/cookbook`, run with Node's type stripping), so it holds only
 * erasable TypeScript: no enums, namespaces or parameter properties.
 */

/** Site locales: the write-ups, the registries and the gallery. */
import type { CaptureBuild, CaptureManifest } from './types/capture.ts';
import type { FeatureGroup } from './types/registry.ts';

export type { DocAnchor, Taxonomy, FeatureGroup, Feature, Question, Gap, WarningEntry, Gotcha, Collection, Registry } from './types/registry.ts';
export type { ComposedPen, CapturePage, CaptureFinding, CaptureVariant, CaptureBuild, CaptureManifest } from './types/capture.ts';

/**
 * The Cookbook's data model: recipe metadata (`cookbook/<slug>/recipe.json`),
 * write-up frontmatter, the bilingual registries (`cookbook/_registry/*.json`),
 * the capture manifest the CLI writes (`public/cookbook/<slug>/capture.json`)
 * and the per-locale catalogue the gallery searches.
 *
 * Isomorphic: imported by the site, the tests and the Node CLI
 * (`scripts/cookbook`, run with Node's type stripping), so it holds only
 * erasable TypeScript: no enums, namespaces or parameter properties.
 */

/** Site locales: the write-ups, the registries and the gallery. */
export type Locale = "en" | "es" | "ca" | "zh" | "ar" | "ja" | "pt" | "fr" | "de" | "it";
export const LOCALES: readonly Locale[] = ["en", "es", "ca", "zh", "ar", "ja", "pt", "fr", "de", "it"];
export type Localized<T = string> = Record<Locale, T>;

/** Languages a recipe's sample document (the pen, its content.<locale>.md,
 *  captures and bundles) can be written in: any site locale. Most recipes
 *  write English and Spanish samples; a comic re-lettered per language
 *  writes one per site locale. A page in a locale the sample lacks shows
 *  the Spanish edition for Catalan when there is one, else the first
 *  edition, as a Spanish page does for an English-only sample. */
export type SampleLocale = Locale;
export const SAMPLE_LOCALES: readonly SampleLocale[] = LOCALES;

/** The languages every recipe.json text is written in. */
export type RequiredLocale = "en" | "es";
export const REQUIRED_LOCALES: readonly RequiredLocale[] = ["en", "es"];

/** Text authored in recipe.json next to the sample: English and Spanish
 *  always, other site locales when someone adds them. */
export type RecipeLocalized<T = string> = Record<RequiredLocale, T> & Partial<Record<Locale, T>>;

/** A `RecipeLocalized` value in `locale`, else in English. */
export function localizedText<T>(value: RecipeLocalized<T>, locale: Locale): T {
  return value[locale] ?? value.en;
}

/** `^[a-z0-9]+(-[a-z0-9]+)*$`, 3–48 characters, not in RESERVED_SLUGS. */
export type Slug = string;
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const RESERVED_SLUGS = [
  "opengraph-image", "catalog", "catalog.json", "a-z", "chapter", "collections", "questions",
  "features", "warnings", "presets", "search-index", "index", "new", "feed",
] as const;

export type SemVer = `${number}.${number}.${number}`;
/** YYYY-MM-DD */
export type IsoDate = string;

// ─── Taxonomy ───────────────────────────────────────────────────────────────

export type PartId = "page" | "book" | "practice";
export type PartColor = "blue" | "gilt" | "vermilion";
export type ChapterId =
  | "page" | "type" | "headings"
  | "running-heads" | "structure" | "boxes" | "figures" | "tables"
  | "publications" | "output" | "comics" | "textbooks";
export const CHAPTER_IDS: readonly ChapterId[] = [
  "page", "type", "headings", "running-heads", "structure", "boxes", "figures", "tables",
  "publications", "output", "comics", "textbooks",
];
export type GenreId =
  | "novel" | "poetry" | "textbook" | "workbook" | "manual" | "paper" | "report"
  | "magazine" | "newsletter" | "catalogue" | "photobook" | "comic" | "ephemera" | "any";
export const GENRE_IDS: readonly GenreId[] = [
  "novel", "poetry", "textbook", "workbook", "manual", "paper", "report", "magazine",
  "newsletter", "catalogue", "photobook", "comic", "ephemera", "any",
];
export type OutputId = "canvas" | "html" | "pdf" | "epub" | "bundle" | "live";
export const OUTPUT_IDS: readonly OutputId[] = ["canvas", "html", "pdf", "epub", "bundle", "live"];
export type Level = 1 | 2 | 3;

/** Write-up sections in their fixed order. Authored ones come from MDX H2
 *  chunks; generated ones are built from the recipe files. */
export type SectionId =
  | "build" | "short" | "ingredients" | "method" | "whole" | "variations" | "pitfalls" | "credits";
export const SECTION_ORDER: readonly SectionId[] = [
  "build", "short", "ingredients", "method", "whole", "variations", "pitfalls", "credits",
];
export const AUTHORED_SECTIONS: readonly SectionId[] = ["build", "method", "variations", "pitfalls"];
export const REQUIRED_AUTHORED_SECTIONS: readonly SectionId[] = ["build", "method"];

// ─── Pens ───────────────────────────────────────────────────────────────────

/** Kit blocks, inlined by composition in this order. `cjk` (Chinese,
 *  Japanese and Korean faces by unicode-range slices) and `arabic` (the
 *  arabic files of Arabic-script faces) are listed only by the recipes that
 *  set such text; `book` (`showBook`, spreads of a book bound on either
 *  edge) by the right-bound books. The cjk block carries its own copy of
 *  `showBook`, so a recipe lists `book` or `cjk`, never both. `comics`
 *  (the comic lettering faces in every weight a balloon style asks for,
 *  panel pictures from an art manifest, a PDF provider for every script)
 *  by the comic recipes, after the blocks it calls (`images` for
 *  `comicPanel`, `pdf` for `comicPdfProvider`, and `cjk` or `arabic` for
 *  the faces of those scripts). */
export type KitBlock = "core" | "fonts" | "viewer" | "pdf" | "images" | "cjk" | "arabic" | "book" | "comics";
export const KIT_ORDER: readonly KitBlock[] = ["core", "fonts", "viewer", "pdf", "images", "cjk", "arabic", "book", "comics"];

/** What check C20 holds the files of an edition to (MB and KB): the warning
 *  starts at `warnMb` (or 0.1 MB for each published page past nine), the
 *  failure at `failMb`; a card file warns past its aim. A recipe whose pages
 *  are paintings states its own figures in `capture.expect.imageMb` and
 *  `capture.expect.cardKb`. */
export const IMAGE_BUDGET = { warnMb: 0.9, perPageMb: 0.1, failMb: 1.4, maxStatedMb: 2 } as const;
export const CARD_AIM_KB = { card: 90, card480: 35, og: 90 } as const;
export const REQUIRED_KIT: readonly KitBlock[] = ["core", "fonts", "viewer"];

export type CardMode = "spread" | "page" | "loupe" | "crop" | "screenshot";

/** Optional `pen.json`: extra CodePen prefill options. Fonts never go here
 *  (the kit loads them from Fontsource). */
export interface PenJson {
  stylesheets?: string[];
  scripts?: string[];
  tags?: string[];
}

// ─── Licensing and credits ──────────────────────────────────────────────────

export type LicenseId =
  | "original" | "PD" | "CC0-1.0" | "CC-BY" | "CC-BY-3.0" | "CC-BY-4.0" | "CC-BY-SA-4.0"
  | "OFL-1.1" | "Apache-2.0" | "MIT" | "reproduction-authorised";
// NC and ND licences are deliberately not in the union: the validator rejects them.

export interface Credit {
  what: RecipeLocalized;
  who: string;
  source?: string;
  /** CC-BY-SA-4.0 is allowed in `credits.text` only. */
  license: LicenseId;
  /** `assets/<file>` this credit covers. */
  file?: string;
}

export interface FontCredit {
  family: string;
  license: "OFL-1.1" | "Apache-2.0";
}

/** A rectangle on a captured page, in fractions (0–1) of the page box. */
export interface FocusRect {
  /** 1-based physical page. */
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── recipe.json ────────────────────────────────────────────────────────────

export type FeatureId = string;
export type QuestionId = string;
export type GapId = string;
export type GotchaId = string;
export type WarningKind = string;
export type CollectionId = string;

/** `config.folio` (postext `FolioConfig`) as recipe.json writes it. */
export interface RecipeFolio {
  tilt?: number;
  paper?: {
    type?: "uncoated" | "bookWove" | "coatedMatte" | "coatedSilk" | "coatedGloss" | "bible" | "newsprint" | "cardStock" | "board";
    grammage?: number;
    bulk?: number;
    finish?: "uncoated" | "matte" | "silk" | "gloss";
    texture?: "smooth" | "vellum" | "wove" | "laid" | "linen" | "felt";
    textureStrength?: number;
    shade?: string;
    showThrough?: boolean;
  };
  binding?: {
    type?: "hardcover" | "paperback" | "sewn" | "layflat" | "saddleStitch" | "folded";
    cover?: "case" | "pages";
    coverMaterial?: "cloth" | "paper" | "leather";
    coverColor?: string;
  };
  surface?: { type?: "oak" | "walnut" | "linen" | "felt" | "leather" | "marble" | "plain" | "none"; color?: string };
  lighting?: { environment?: "studio" | "daylight" | "lamp" | "overcast" | "night"; intensity?: number; shadows?: boolean };
}

export interface RecipeMeta {
  $schema?: string;
  schemaVersion: 1;
  /** Permanent catalogue number (Nº); unique; never reused. */
  number: number;
  status: "draft" | "published" | "retired";
  /** Required when status is "retired": the page redirects there. */
  replacedBy?: Slug;
  /** Old slugs that redirect permanently to this recipe. */
  formerSlugs?: Slug[];

  chapter: ChapterId;
  /** Sparse integer order within the chapter (10, 20, …). */
  order: number;
  level: Level;
  /** 1–3 genres. */
  genres: GenreId[];
  /** 1–4 outputs; "pdf" ⇔ the pdf kit block and a postext-pdf import;
   *  "epub" ⇔ a postext-epub import. */
  outputs: OutputId[];
  features: {
    /** 1–3: what the recipe teaches. */
    primary: FeatureId[];
    /** 0–17: other notable features it uses. */
    also: FeatureId[];
  };
  /** ≥ 1; answers[0] is the primary question shown in the band. */
  answers: QuestionId[];
  /** Unsupported features this recipe works around (Workaround badge). One
   *  the engine closed at or before the recipe's pin leaves the list
   *  (`fixedGaps`). */
  gaps?: GapId[];
  gotchas?: GotchaId[];
  explainsWarnings?: WarningKind[];
  /** ≤ 4 hand-picked related recipes; the rest are computed. */
  related?: Slug[];
  /** Notes on code a reader would not expect. With a `followup`: an engine
   *  bug the recipe routes around, deleted when it is fixed (`fixedNotes`).
   *  Without one: a design note, kept with the code. */
  workarounds?: { issue?: number; followup?: string; package: "postext" | "postext-pdf"; note: string }[];

  engine: {
    /** Minimum published postext. */
    postext: SemVer;
    /** Required when outputs has "pdf". */
    postextPdf?: SemVer;
    /** A maths recipe: `await initMathEngine()` before the first build (and
     *  the plain import, or `?bundle` as the recipes written for 1.4 have). */
    math?: boolean;
    /** Blob-wrapped layout worker (captured against npm only). */
    worker?: boolean;
  };
  /** Kit blocks composition inlines; must include core, fonts and viewer. */
  kit: KitBlock[];

  /** Languages of the sample document: content.<locale>.md exists for each.
   *  [0] is the fallback edition for a site locale without its own sample. */
  sample: { locales: SampleLocale[] };

  capture: {
    /** 1-based physical page(s) shown on the card and first in the light table. */
    hero: number | [number, number];
    card: CardMode;
    /** Required for "loupe" and "crop". */
    focus?: FocusRect;
    /** Published pages (1-based); default: all when ≤ 8, else hero + first 6; cap 12. */
    pages?: number[] | "all";
    /** Which recorded build is the result (default "last"), or several, in
     *  the order the light table shows them: a pen that builds two editions
     *  publishes the pages of both. Their pages are numbered on from one
     *  build to the next (`hero`, `pages`, `focus` and `expect.pages` count
     *  them so), each build's first page opens a spread of its own, and the
     *  checks and the detected features read the first build's source.
     *  Builds chained with `continuation` (articles of one publication)
     *  make one: the PDF may hold all their pages (C14), and the Sandbox
     *  bundle is a book with a chapter per build (#540) of one
     *  configuration (`sandbox`). */
    doc?: CaptureBuild | CaptureBuild[];
    /** Of the builds a `doc` list publishes, the one the Sandbox bundle is
     *  made from (#690): `first` (the default), `last`, or an index from 0
     *  into that list. A bundle carries one configuration, so it holds that
     *  build and the others of the list laid out with the same one; builds
     *  that differ and that this field does not settle are a capture
     *  warning. Not part of the source hash: changing it needs
     *  `pnpm cookbook capture <slug> --sandbox-only`, not a recapture. */
    sandbox?: CaptureBuild;
    /** "screenshot" mode: element to clip (default "#pages"). */
    selector?: string;
    /** "screenshot" mode viewport (default 1280×900 at DPR 2). */
    viewport?: { width: number; height: number };
    /** Default 60 000. */
    timeoutMs?: number;
    expect?: {
      /** Page-count range (regression guard). */
      pages?: [number, number];
      /** Engine layout warnings the recipe demonstrates on purpose. */
      warnings?: WarningKind[];
      /** Deliberately sparse pages (dedication, half title), 1-based. */
      nearEmptyPages?: number[];
      /** Justified lines the edition may set ragged (their word spaces
       *  would stretch past 3×; check C34). Default 0. */
      raggedLines?: number;
      /** Characters the pages take from a font of the system and the
       *  recipe's write-up says so (check C36): the engine's own task box
       *  ☐, which no text face holds. Each is written once. */
      systemFont?: string;
      /** The megabytes of page images the edition means to publish (check
       *  C20). A book of painted pages weighs more than the default budget
       *  (warning at 0.9 MB for nine pages and 0.1 MB for each past that,
       *  failure at 1.4 MB) however the assets are cut, because the pages
       *  are the rendered webp. With the figure stated there is no warning
       *  up to it and a failure past it. Above 0.9 and at most 2. */
      imageMb?: number;
      /** The kilobytes a card file means to weigh where it passes its aim
       *  (card.webp 90, card.480.webp 35, og.jpg 90): a map spread painted
       *  edge to edge. The warning moves to the figure; a figure at or
       *  under the aim is refused. */
      cardKb?: { card?: number; card480?: number; og?: number };
      /** Accepted console-error substrings (e.g. the `?bundle` noise). */
      console?: string[];
      /** Only for a recipe about the defaults themselves. */
      defaultSkin?: ("tables" | "callouts" | "lists" | "headings")[];
    };
  };
  /** Keep and serve the PDF the pen produced. */
  downloads?: { pdf?: boolean };
  /** How the Sandbox's Folio view presents the publication in 3D: written
   *  into the `.postext` bundle as `config.folio` (over the pen's own), with
   *  colours as `#rrggbb`. It never changes the pages, so it stays out of
   *  the source hash. */
  folio?: RecipeFolio;

  credits: {
    authors: { name: string; github?: string; url?: string }[];
    /** Empty when the sample prose is original. */
    text: Credit[];
    /** Every assets/ image and every non-generated picture. */
    images: Credit[];
    /** Every family in FONTS. */
    fonts: FontCredit[];
  };
  license: { code: "MIT"; content: "MIT" | "CC-BY-4.0" };
  created: IsoDate;
  /** ≥ created; bump on any user-visible change. */
  updated: IsoDate;
}

// ─── Write-up (en.mdx / es.mdx / zh.mdx) ────────────────────────────────────

/** YAML frontmatter; every value is quoted. The lengths are for English and
 *  Spanish; Chinese has about half of each (validate.ts FRONTMATTER_LENGTHS). */
export interface RecipeFrontmatter {
  /** ≤ 60 characters: an outcome noun phrase. */
  title: string;
  /** 60–160 characters: the answer in one sentence, naming the mechanism. */
  summary: string;
  /** 40–240 characters (Chinese 15–120): the summary again in plain words
   *  for a reader who does not know the jargon (WCAG 3.1.5), shown above
   *  the write-up as "In short". */
  plain?: string;
  /** 120–160 characters: meta description (defaults to summary). */
  description?: string;
  /** ≤ 110 characters: rephrases answers[0] for this page. */
  question?: string;
  /** Search-only synonyms. */
  aliases?: string[];
  /** 1-based page number (as a string key) → extra alt text. */
  pageNotes?: Record<string, string>;
}

export interface RecipeWriteup {
  locale: Locale;
  frontmatter: RecipeFrontmatter;
  /** The MDX body without its frontmatter. */
  body: string;
  /** The body split at H2 boundaries, keyed by section id. Text before the
   *  first H2 is ignored (and flagged by the tests). */
  sections: Partial<Record<SectionId, string>>;
}

// ─── Composition ────────────────────────────────────────────────────────────

/** The raw files of a recipe folder. */
export interface RecipeSources {
  slug: Slug;
  script: string;
  html: string;
  css: string;
  pen: PenJson;
  /** content.<locale>.md → key "<locale>"; content.<slot>.<locale>.md → key "<slot>.<locale>". */
  content: Record<string, string>;
  /** Paths (relative to the recipe folder) of everything under assets/. */
  assets: string[];
}

// ─── Loaded recipe (server) ─────────────────────────────────────────────────

export interface Recipe {
  slug: Slug;
  meta: RecipeMeta;
  writeups: Partial<Record<Locale, RecipeWriteup>>;
  capture: CaptureManifest | null;
}

// ─── catalog.json (per locale; the gallery's search and facets) ────────────

export interface CatalogRecipe {
  slug: Slug;
  number: number;
  chapter: ChapterId;
  order: number;
  level: Level;
  genres: GenreId[];
  outputs: OutputId[];
  features: FeatureId[];
  primary: FeatureId[];
  warnings: WarningKind[];
  collections: CollectionId[];
  gap: boolean;
  /** Present (true) only on drafts, which are listed in development only. */
  draft?: true;
  created: IsoDate;
  updated: IsoDate;
  pages: number;
  title: string;
  summary: string;
  question: string;
  /** Locale-less: "/cookbook/<slug>". */
  href: string;
  /** With `?v=`. */
  card: { src: string; src480: string };
  search: {
    questions: string[];
    aliases: string[];
    featureLabels: string[];
    apis: string[];
    configKeys: string[];
    directives: string[];
    fonts: string[];
    headings: string[];
    gotchas: string[];
    otherTitle: string;
  };
}

export interface Catalog {
  locale: Locale;
  /** The minimum captured postext version across published recipes. */
  testedWith: string;
  facets: {
    chapters: { id: ChapterId; number: number; part: PartId; color: PartColor; title: string; count: number }[];
    genres: { id: GenreId; title: string }[];
    outputs: { id: OutputId; title: string }[];
    levels: { id: Level; title: string }[];
    /** `aliases` in the locale: search expands a recipe's feature ids with
     *  them (lib/cookbook/wire.ts). */
    features: { id: FeatureId; label: string; group: FeatureGroup; aliases?: string[] }[];
    warnings: { kind: WarningKind; label: string }[];
    collections: { id: CollectionId; title: string }[];
  };
  recipes: CatalogRecipe[];
  /** Unsupported features, so a query for one ("footnotes") can explain the
   *  gap and pin the recipes that work around it (`recipes`, contents order). */
  gaps?: { id: GapId; label: string; aliases: string[]; explanation: string; recipes: Slug[] }[];
}
