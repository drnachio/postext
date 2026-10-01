/**
 * Citations (#267–#272): the data model the engine shares with a citation
 * processor. The processor itself — CSL formatting, through citeproc-js —
 * lives in the optional `postext-citeproc` package and is registered with
 * {@link registerCitationEngine}; the core parses the citations, collects the
 * references, places the bibliography and lays everything out.
 */

/** A name in a reference (CSL-JSON). */
export interface CslName {
  family?: string;
  given?: string;
  literal?: string;
  'non-dropping-particle'?: string;
  'dropping-particle'?: string;
  suffix?: string;
}

/** A date in a reference (CSL-JSON). */
export interface CslDate {
  'date-parts'?: (number | string)[][];
  literal?: string;
  raw?: string;
  circa?: boolean | string | number;
}

/** One reference: a CSL-JSON item (Pandoc's `references:` entries, Zotero's
 *  CSL-JSON export, or a BibTeX entry converted). `id` is the key a
 *  citation names (`[@id]`). */
export interface CslItem {
  id: string;
  type: string;
  title?: string;
  author?: CslName[];
  editor?: CslName[];
  translator?: CslName[];
  issued?: CslDate;
  accessed?: CslDate;
  language?: string;
  DOI?: string;
  URL?: string;
  [field: string]: unknown;
}

/** One work cited inside a citation (`[see @garcia2020, p. 33]`). */
export interface CitationItemInput {
  /** The reference key. */
  id: string;
  /** Text before the work ("see"). */
  prefix?: string;
  /** Text after the work, locator excluded ("emphasis added"). */
  suffix?: string;
  /** The locator's value ("33", "2–4"). */
  locator?: string;
  /** The locator's CSL label: `page`, `chapter`, `section`, `figure`,
   *  `volume`, `line`, `note`, `paragraph`… */
  label?: string;
  /** `[-@id]`: the author is left out (named in the sentence already). */
  suppressAuthor?: boolean;
}

/** A citation: one or more works cited together. */
export interface CitationClusterInput {
  items: CitationItemInput[];
  /** `'narrative'`: `@id` in the sentence ("García (2020) says"); else
   *  parenthetical (`[@id]`). */
  mode: 'parenthetical' | 'narrative';
  /** The note the citation sits in, for a note style (1-based; 0 in the
   *  text). Set by the engine. */
  noteIndex?: number;
}

/** A citation formatted by the processor, as HTML of the small set
 *  citeproc-js writes (`<i>`, `<b>`, `<sup>`, `<sub>`, small capitals,
 *  `<a href>`, entities). */
export type FormattedCitation = string;

/** One entry of a formatted bibliography. */
export interface BibliographyEntryOutput {
  id: string;
  /** The entry as HTML (see {@link FormattedCitation}), without its label. */
  html: string;
  /** The label of a numbered entry ("[1]", "1."), set apart from the text. */
  label?: string;
}

/** A formatted bibliography and the layout the style asks for. */
export interface BibliographyOutput {
  entries: BibliographyEntryOutput[];
  /** The style hangs the entries (author-date lists). */
  hangingIndent: boolean;
  /** The style sets each label in a column of its own (numeric lists). */
  labelColumn: boolean;
  /** Blank lines between entries the style asks for. */
  entrySpacing: number;
}

/** What a style is, as a picker lists it. */
export interface CitationStyleInfo {
  id: string;
  /** The style's name ("American Psychological Association 7th edition"). */
  title: string;
  /** Short name for menus ("APA 7"). */
  short: string;
  format: 'author-date' | 'numeric' | 'note' | 'author';
  /** Fields that use it ("psychology, education"). */
  fields?: string;
}

/** A processor for one book: its references, its style and language. */
export interface CitationProcessor {
  /** `'note'`: citations go in footnotes (Chicago notes, OSCOLA). */
  readonly kind: 'in-text' | 'note';
  /** `true` for a numbered style (IEEE, Vancouver, GB/T 7714 numeric). */
  readonly numeric: boolean;
  /** Format every citation of the book, in reading order: disambiguation,
   *  numbering and *ibid.* see all of them. */
  cite(clusters: readonly CitationClusterInput[]): FormattedCitation[];
  /** The bibliography of `ids` (all cited and `nocite`d works when
   *  omitted), in the style's order, after {@link cite}. */
  bibliography(ids?: readonly string[]): BibliographyOutput;
  /** The number a numbered style gives each cited work, after
   *  {@link cite}. */
  citationNumbers(): ReadonlyMap<string, number>;
}

/** Options a processor is created with. */
export interface CitationProcessorOptions {
  /** A bundled style id (`apa`, `ieee`…) or a whole CSL style (XML). */
  style: string;
  /** CSL locale (`en-US`, `es-ES`, `zh-CN`…). */
  locale: string;
  items: readonly CslItem[];
}

/** A citation engine: CSL styles, locales and a BibTeX reader. */
export interface CitationEngine {
  createProcessor(options: CitationProcessorOptions): CitationProcessor;
  /** The bundled styles. */
  styles(): readonly CitationStyleInfo[];
  /** References from BibTeX / BibLaTeX source. */
  parseBibtex?(source: string): CslItem[];
}
