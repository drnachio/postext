// Types of registry.json: doc anchors, the taxonomy, features, questions,
// gaps, warnings, gotchas and collections (#1276: split out of types.ts).
import type { Localized, PartId, PartColor, ChapterId, GenreId, OutputId, Level, SectionId, SemVer, GapId, FeatureId, Slug, Locale, QuestionId, WarningKind, GotchaId, CollectionId } from '../types.ts';

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
  | "tables" | "math" | "structure" | "colour" | "pdf" | "html" | "integration" | "comics" | "exercises";

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
   *  registry so the questions and the older-pinned recipes that name it
   *  still resolve, but it is no longer offered as a gap and gives no
   *  Workaround badge; a recipe pinned at it or later drops the id
   *  (`fixedGaps`). */
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
  /** The engine version that made this pitfall obsolete. A recipe pinned
   *  below it still lists the pitfall, as fixed; one pinned at it or later
   *  no longer shows it (`shownGotchas`). */
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
