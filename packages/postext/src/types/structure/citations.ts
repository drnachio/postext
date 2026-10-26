import type { Dimension } from '../page.js';

/** Footnotes: `[^id]` in the text cites the note `[^id]: text` defined in a
 *  paragraph of its own anywhere in the chapter. The marker prints as a
 *  superscript number (or inline, see `markerPosition`); the note prints at the foot of the column (see
 *  {@link FootnotePlacement}), in citation order. */
/** Citations and the bibliography (#267–#272): the CSL style they are
 *  formatted in and how they look. The style decides the content (names,
 *  dates, order, punctuation); these settings decide the presentation. */
export interface CitationsConfig {
  /** A bundled style id (`apa`, `chicago-author-date`, `ieee`,
   *  `elsevier-vancouver`, `modern-language-association`,
   *  `chicago-notes-bibliography`, `oscola`,
   *  `china-national-standard-gb-t-7714-2015-numeric`…), or `'custom'` for
   *  {@link customStyle}. Default `'apa'`. */
  style?: string;
  /** A whole CSL style (the XML of a `.csl` file), used when `style` is
   *  `'custom'` (#273). */
  customStyle?: string;
  /** The CSL locale citations are written in (`en-US`, `es-ES`, `zh-CN`…).
   *  Unset: the document language. */
  locale?: string;
  /** A citation links to its entry in the bibliography. Default true. */
  link?: boolean;
  /** How a numbered style marks a citation in the text: as the style does
   *  (`'style'`, default), `[1]`, `(1)`, a superscript `¹`, or in Chinese
   *  corner brackets `〔1〕`, which stand upright in vertical text. */
  marker?: 'style' | 'brackets' | 'parentheses' | 'superscript' | 'corner';
  /** With a {@link marker} other than `'style'`: consecutive numbers are
   *  joined into a range (`[1–3]`) rather than listed (`[1, 2, 3]`).
   *  Default true. */
  collapseRanges?: boolean;
  /** How a note style (Chicago notes, OSCOLA, GB/T 7714 note) sets its
   *  citations: as footnotes (`'footnote'`, default, placed as `footnotes`
   *  says) or, in Chinese text, as an inline two-row note (`'warichu'`,
   *  夹注). */
  notes?: 'footnote' | 'warichu';
  /** How far the citations run together (#537): through the book
   *  (`'book'`, default), or each chapter on its own (`'chapter'`, a new
   *  one at each document and each level-1 heading): a numbered style
   *  numbers each chapter's citations from 1 and a work cited in two
   *  chapters takes each chapter's number; a note style writes a work in
   *  full at its first citation in each chapter. Meant for chapter lists
   *  (`bibliography.scope: 'chapter'`): the proceedings, the bulletin, the
   *  edited volume. */
  numbering?: 'book' | 'chapter';
  /** Let the dictionary divide the names of the authors the document cites.
   *  Default `true`. `false` (#699): the family names and the `literal`
   *  names of every work of the references are never divided where they
   *  start with a capital, in a citation, in the running text and in the
   *  bibliography, so no line ends on `(Lup-`. Each name is read run of
   *  letters by run of letters (`García-Márquez` gives two), and an author
   *  called Baker does not keep `baker` whole. A bibliography cannot be
   *  typed into `bodyText.hyphenation.exceptions`, and a German book cannot
   *  use `hyphenation.capitalized: false`. */
  hyphenateNames?: boolean;
  /** The list of works cited. */
  bibliography?: {
    /** Title printed above the list (a bold paragraph). Unset: the
     *  document language's word ("References", "Referencias", "参考文献");
     *  `''`: none. */
    title?: string;
    /** `'book'` (default): one list of every work the book cites, where
     *  `:::bibliography` stands (else after the last chapter).
     *  `'chapter'`: each document lists the works it cites. */
    scope?: 'book' | 'chapter';
    /** Set the list after the text when no `:::bibliography` places it.
     *  Default true. */
    auto?: boolean;
    /** Size of the entries; em is the body size. Default 0.9 em. */
    fontSize?: Dimension;
    /** Leading of the entries; em is their size. Unset: the body's. */
    lineHeight?: Dimension;
    /** Indent of an entry's turnover lines (author-date lists). Default 2 em. */
    hangingIndent?: Dimension;
    /** Space between two entries. Default 0.3 em. */
    entrySpacing?: Dimension;
    /** Width of the label column of a numbered list (`[12]`): every
     *  entry's text starts this far in, on its first line as on its
     *  turnover lines, whatever its label's width (#290). Unset: as wide as
     *  the longest label. */
    labelWidth?: Dimension;
    /** How a label sits in its column: against its left edge (`'left'`,
     *  default) or against the text (`'right'`, so `9.` and `10.` end
     *  together). */
    labelAlign?: 'left' | 'right';
    /** DOIs and URLs: links (`'link'`, default), plain text, or left out. */
    doi?: 'link' | 'text' | 'hide';
    /** List the works of the references that no citation names (Pandoc's
     *  `nocite: '@*'`). Default false. */
    includeUncited?: boolean;
    /** Set the works in Chinese, Japanese and Korean before the others
     *  (common in mixed Chinese bibliographies, #277). Default false. */
    groupByLanguage?: boolean;
  };
}

/** {@link CitationsConfig} with every value resolved. */
export interface ResolvedCitationsConfig {
  style: string;
  customStyle?: string;
  locale?: string;
  link: boolean;
  marker: 'style' | 'brackets' | 'parentheses' | 'superscript' | 'corner';
  collapseRanges: boolean;
  notes: 'footnote' | 'warichu';
  numbering: 'book' | 'chapter';
  hyphenateNames: boolean;
  bibliography: {
    title?: string;
    scope: 'book' | 'chapter';
    auto: boolean;
    fontSize: Dimension;
    lineHeight?: Dimension;
    hangingIndent: Dimension;
    entrySpacing: Dimension;
    labelWidth?: Dimension;
    labelAlign: 'left' | 'right';
    doi: 'link' | 'text' | 'hide';
    includeUncited: boolean;
    groupByLanguage: boolean;
  };
}

/** How a cross-reference to an anchor prints (#266): the words around a
 *  number or a page label, and the style a `:ref` without `style=` takes.
 *  Each template holds `{n}` where the number goes; one without it gets
 *  the number after a no-break space. Unset templates follow the document
 *  language ("section {n}", "sección {n}", "第{n}节"). */
export interface CrossRefsConfig {
  /** A level-1 heading: "chapter {n}". */
  chapter?: string;
  /** Any other heading: "section {n}". */
  section?: string;
  /** A page: "p. {n}". */
  page?: string;
  /** The style of a `:ref` to an anchor that sets none. Default
   *  `'default'`: a numbered heading by its label and number, an
   *  unnumbered one by its title, an anchor by its text. */
  defaultStyle?: 'default' | 'number' | 'title' | 'page';
  /** Let a line break at the spaces of a reference whose label is words
   *  (#702): the text of a `[words]{#id}` anchor, the title of a heading or
   *  a box, a `text="…"` override. The label's spaces then take part in
   *  justification like the others of the line, and the reference stays
   *  one link. A label with a number or a page (`section 3.2`, `p. 112`,
   *  `Fig. 1.7`, `Theorem 2`) never breaks, whatever space its template
   *  holds. Default `true`. `false`: every label is one unbreakable word,
   *  as up to postext 1.27; configurations stored before `configVersion`
   *  12 read with it (see `pinLegacyRefLabelBreaks` in `postext/bundle`). */
  breakLabels?: boolean;
}

/** {@link CrossRefsConfig} with every value resolved. */
export interface ResolvedCrossRefsConfig {
  chapter: string;
  section: string;
  page: string;
  defaultStyle: 'default' | 'number' | 'title' | 'page';
  breakLabels: boolean;
}
