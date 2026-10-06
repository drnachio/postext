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
export type Locale = "en" | "es" | "ca" | "zh" | "ar" | "ja";
export const LOCALES: readonly Locale[] = ["en", "es", "ca", "zh", "ar", "ja"];
export type Localized<T = string> = Record<Locale, T>;

/** Languages a recipe's sample document (the pen, its content.<locale>.md,
 *  captures and bundles) can be written in: narrower than the site's. A
 *  page in a locale the sample lacks shows its first edition, as a Spanish
 *  page does for an English-only sample. */
export type SampleLocale = "en" | "es";
export const SAMPLE_LOCALES: readonly SampleLocale[] = ["en", "es"];

/** Text authored in recipe.json next to the sample: English and Spanish
 *  always, other site locales when someone adds them. */
export type RecipeLocalized<T = string> = Record<SampleLocale, T> & Partial<Record<Locale, T>>;

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
  | "publications" | "output";
export const CHAPTER_IDS: readonly ChapterId[] = [
  "page", "type", "headings", "running-heads", "structure", "boxes", "figures", "tables",
  "publications", "output",
];
export type GenreId =
  | "novel" | "poetry" | "textbook" | "workbook" | "manual" | "paper" | "report"
  | "magazine" | "newsletter" | "catalogue" | "photobook" | "ephemera" | "any";
export const GENRE_IDS: readonly GenreId[] = [
  "novel", "poetry", "textbook", "workbook", "manual", "paper", "report", "magazine",
  "newsletter", "catalogue", "photobook", "ephemera", "any",
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
 *  `showBook`, so a recipe lists `book` or `cjk`, never both. */
export type KitBlock = "core" | "fonts" | "viewer" | "pdf" | "images" | "cjk" | "arabic" | "book";
export const KIT_ORDER: readonly KitBlock[] = ["core", "fonts", "viewer", "pdf", "images", "cjk", "arabic", "book"];
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
  | "original" | "PD" | "CC0-1.0" | "CC-BY-4.0" | "CC-BY-SA-4.0"
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
  /** Unsupported features this recipe works around (Workaround badge). */
  gaps?: GapId[];
  gotchas?: GotchaId[];
  explainsWarnings?: WarningKind[];
  /** ≤ 4 hand-picked related recipes; the rest are computed. */
  related?: Slug[];
  /** Engine bugs the recipe routes around; revisited when they are fixed. */
  workarounds?: { issue?: number; followup?: string; package: "postext" | "postext-pdf"; note: string }[];

  engine: {
    /** Minimum published postext. */
    postext: SemVer;
    /** Required when outputs has "pdf". */
    postextPdf?: SemVer;
    /** Every postext symbol from esm.sh/postext?bundle + initMathEngine(). */
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
     *  checks, the detected features and the Sandbox bundle read the first
     *  build's source. */
    doc?: CaptureBuild | CaptureBuild[];
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

// ─── Registries (cookbook/_registry/*.json) ─────────────────────────────────

/** A docs section: resolved to `/{locale}/docs/<slug>#<id>` through the
 *  docs' own heading slugger; the tests fail when the heading is renamed. */
export interface DocAnchor {
  slug: string;
  heading: Localized;
}

export interface Taxonomy {
  parts: { id: PartId; number: "I" | "II" | "III"; color: PartColor; title: Localized }[];
  chapters: { id: ChapterId; number: number; part: PartId; title: Localized; intro: Localized }[];
  genres: { id: GenreId; title: Localized }[];
  outputs: { id: OutputId; title: Localized }[];
  levels: { id: Level; title: Localized; criteria: Localized }[];
  /** Localised H2 headings of the write-up template. */
  sections: Record<SectionId, Localized>;
}

export type FeatureGroup =
  | "page" | "text" | "fonts" | "languages" | "headings" | "furniture" | "boxes" | "figures"
  | "tables" | "math" | "structure" | "colour" | "pdf" | "html" | "integration";

export interface Feature {
  label: Localized;
  definition: Localized;
  aliases?: Localized<string[]>;
  group: FeatureGroup;
  docs: DocAnchor;
  since?: SemVer;
  /** Research catalogue ids this feature covers (e.g. "LY-6"). */
  research?: string[];
  /** Optional detection rules, checked against the capture (WARN only). */
  detect?: { config?: string[]; markdown?: string[]; api?: string[] };
}

export interface Question {
  kind: "how" | "why";
  text: Localized;
  /** Back-of-book index form ("Footnotes, workarounds for"). */
  index: Localized;
  theme: string;
  gap?: GapId;
}

export interface Gap {
  label: Localized;
  aliases: Localized<string[]>;
  explanation: Localized;
  docs?: DocAnchor;
  /** The engine version that closed this gap. A fixed gap stays in the
   *  registry so the recipes and questions that name it still resolve, but
   *  it is no longer offered as a gap and gives no Workaround badge. */
  fixedIn?: SemVer;
}

export interface WarningEntry {
  /** engine: doc.warnings · parse: parseMarkdownWithIssues · sandbox: Sandbox Checks only. */
  source: "engine" | "parse" | "sandbox";
  label: Localized;
  cause: Localized;
  fix: Localized;
  docs?: DocAnchor;
}

export interface Gotcha {
  title: Localized;
  body: Localized;
  feature?: FeatureId;
  /** The engine follow-up whose fix would retire this pitfall ("EF-05"). */
  followup?: string;
  /** The engine version that made this pitfall obsolete. */
  fixedIn?: SemVer;
}

export interface Collection {
  title: Localized;
  summary: Localized;
  recipes: Slug[];
  /** "featured" only: the frontispiece per site language, a book
   *  representative of that language; `recipes[0]` stands in for a
   *  language it leaves out. */
  frontispiece?: Partial<Record<Locale, Slug>>;
}

export interface Registry {
  taxonomy: Taxonomy;
  features: Record<FeatureId, Feature>;
  /** Exported symbol → docs section. */
  apis: Record<string, DocAnchor>;
  /** Top-level config key → docs section ("Config at a glance"). */
  config: Record<string, DocAnchor>;
  questions: Record<QuestionId, Question>;
  gaps: Record<GapId, Gap>;
  warnings: Record<WarningKind, WarningEntry>;
  gotchas: Record<GotchaId, Gotcha>;
  /** "featured" is ordered: [0] is the frontispiece, [1..3] the editor's picks. */
  collections: Record<CollectionId, Collection>;
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

/** A pen ready to run: what CodePen, Copy, the .html download, the capture
 *  and the Markdown rendition all use. */
export interface ComposedPen {
  slug: Slug;
  variant: SampleLocale;
  js: string;
  html: string;
  css: string;
  pen: PenJson;
  ranges: {
    /** 1-based inclusive line ranges of each content literal (folded in the code view). */
    content: [number, number][];
    /** Lines of the inlined kit, or null when the script has no kit marker. */
    kit: [number, number] | null;
    /** `// #region <id>` … `// #endregion`, contents only (markers excluded). */
    regions: Record<string, { lines: [number, number]; title: string }>;
  };
  /** Non-blank lines outside content literals and the kit. */
  ownLines: number;
}

// ─── capture.json (generated by `pnpm cookbook capture`) ───────────────────

export interface CapturePage {
  /** 1-based from the build's first page (a document continued at
   *  pageIndexOffset 40 still has pages 1–4); the `#page-N` anchors and the
   *  pNN files use it. Versos and rectos follow the book page number. */
  n: number;
  /** Printed folio ("iii", "7"), or "" when the page has none. */
  label: string;
  role: "body" | "opener" | "part" | "blank";
  /** Pixel size of the 1000-wide image. */
  w: number;
  h: number;
  /** Files relative to `public/cookbook/<slug>/<variant>/`. */
  file: string;
  strip: string;
  bytes: number;
  /** Generated from the VDT, in the sample's language. */
  alt: string;
}

export interface CaptureFinding {
  check: string;
  severity: "warn" | "info";
  detail: string;
}

export interface CaptureVariant {
  /** Cache-buster for `?v=`. */
  hash8: string;
  /** sha1 of pages → blocks → lines (text + rounded bbox): OS-independent. */
  vdtHash: string;
  timings: { importMs: number; fontsMs: number; buildMs: number; totalMs: number; builds: number };
  specimen: {
    trimMm: [number, number];
    dpi: number;
    layoutType: string;
    /** `multiple` layouts: the body's column count, as the engine cuts it. */
    columnCount?: number;
    gutterMm?: number;
    mirror: boolean;
    body: { family: string; sizePt: number; leadingPt: number };
    families: string[];
    pages: number;
    ownLines: number;
  };
  pages: CapturePage[];
  /** Indexes into `pages`: [verso, recto] (page 1 alone), in reading order
   *  whichever edge the book is bound on. */
  spreads: [number | null, number | null][];
  /** `"right"` for a book bound on its right edge (the document's
   *  `binding`: `page.binding` or vertical text): the light table, the
   *  card and the contact sheet lay each pair out mirrored, the recto on
   *  the left, and turn pages leftward. Absent for a left-bound book. */
  binding?: "right";
  card: { file: string; file480: string; w: number; h: number; mode: CardMode };
  og: { file: string; w: number; h: number };
  pdf?: { file: string; bytes: number; pages: number };
  /** The document as a `.postext` bundle, which the Sandbox opens
   *  (`/<locale>/sandbox#recipe=<slug>&lang=<variant>`). */
  sandbox?: { file: string; bytes: number; /** folioHash of recipe.json `folio` the bundle carries. */ folio?: string };
  detected: {
    apis: string[];
    configKeys: string[];
    configSections: string[];
    configLeaves: number;
    designElements: number;
    directives: string[];
    inline: string[];
    resources: { svg: number; bitmap: number; table: number };
    fonts: { family: string; weight: number; style: "normal" | "italic" }[];
    features: FeatureId[];
    suggestedLevel: Level;
  };
  diagnostics: {
    converged: boolean;
    iterationCount: number;
    looseLines: { count: number; share: number; worst: number };
    /** Justified Chinese, Japanese or Korean lines: `count` set short past
     *  the tracking cap (`cjkLoose`), `worst` the widest space between
     *  characters, in em. Absent when the pages have no such line. */
    cjkLooseLines?: { count: number; share: number; worst: number };
    findings: CaptureFinding[];
  };
}

/** A recorded build of the pen (`capture.doc`): the first, the last, or
 *  its index in build order from 0. */
export type CaptureBuild = "last" | "first" | number;

export interface CaptureManifest {
  schemaVersion: 1;
  slug: Slug;
  /** sha256 over the recipe's inputs; see lib/cookbook/hash.ts. */
  sourceHash: string;
  engine: { postext: SemVer; postextPdf?: SemVer; source: "npm" | "local" };
  chrome: string;
  capturedAt: string;
  variants: Partial<Record<SampleLocale, CaptureVariant>>;
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
