import type { DesignSlot, ResolvedDesignSlot } from './designElements.js';
import type { ColorValue, Dimension } from './page.js';

// ---------------------------------------------------------------------------
// Table of contents — what `:::toc` prints.
// ---------------------------------------------------------------------------

/** The face of a contents leader (#1121): the dots set in a colour, face,
 *  size and weight of their own, as a source's contents set small coloured
 *  dots in a face apart from the page numbers. Each field unset keeps what
 *  the leader is set in without it: the page number's on an entry row, the
 *  text element's own in a part row (`{leader}`). */
export interface TocLeaderFaceConfig {
  color?: ColorValue;
  fontFamily?: string;
  /** `em` is the size the leader would have without it. */
  fontSize?: Dimension;
  fontWeight?: number;
}

/** Typography of one kind of contents entry. Every field inherits the body
 *  text (or the `toc`-wide value) when unset. */
export interface TocEntryStyleConfig {
  fontFamily?: string;
  fontSize?: Dimension;
  /** Leading of the entry's lines (title and subtitle alike). Defaults to
   *  the body line height so the contents sit on the baseline grid. */
  lineHeight?: Dimension;
  fontWeight?: number;
  italic?: boolean;
  color?: ColorValue;
  /** Left indent of the whole entry. Default `0`. */
  indent?: Dimension;
  /** Width of the number column: the title starts after it plus
   *  `numberGap`; numbers are right-aligned in it, on the baseline of the
   *  title's first line whatever their face and size. A number wider than
   *  this (`الفصل الحادي عشر`, `Chapter 12`) widens the column of its
   *  level in that contents to the widest number. Default `2em`. */
  numberWidth?: Dimension;
  /** Gap between the number column and the title. Default `0.5em`. */
  numberGap?: Dimension;
  numberFontFamily?: string;
  numberFontSize?: Dimension;
  numberFontWeight?: number;
  numberColor?: ColorValue;
  /** Space above / below the entry (subtitle included). Default `0`. */
  marginTop?: Dimension;
  marginBottom?: Dimension;
}

export interface TocLevelConfig extends TocEntryStyleConfig {
  /** Heading level (1–6). */
  level: number;
}

export interface TocConfig {
  /** Heading levels listed, each with its entry typography. Default: level
   *  1 only. */
  levels?: TocLevelConfig[];
  /** Entry typography of headings whose style has `numbered: false`
   *  (a preface). They print no number and start flush at the level's
   *  `indent`. Inherits the level's style. */
  unnumbered?: TocEntryStyleConfig;
  /** The page number at the right edge of an entry. */
  pageNumber?: {
    fontFamily?: string;
    fontSize?: Dimension;
    fontWeight?: number;
    italic?: boolean;
    color?: ColorValue;
    /** Width reserved for the number at the right edge. Default `2em`. */
    width?: Dimension;
  };
  /** Leader between the title and the page number. Its face fields
   *  (`color`, `fontFamily`, `fontSize`, `fontWeight`, #1121) set the dots
   *  of the entry rows and, unless `parts.leader` sets its own, of the part
   *  rows' `{leader}`. */
  leader?: TocLeaderFaceConfig & {
    /** Default `true`. */
    enabled?: boolean;
    /** Repeated across the gap, right-aligned so dots line up. Default `'.'`;
     *  `'. '` spaces them out. The run holds as many as fit when measured
     *  whole, so a face that kerns the character against itself gets fewer. */
    char?: string;
    /** Minimum gap between the title and the leader / page number. Default
     *  `0.5em`. */
    gap?: Dimension;
  };
  /** A second line under the entry taken from a heading attribute — the
   *  chapter authors (`{author="…"}`). Absent when unset. */
  subtitle?: {
    /** Attribute name, e.g. `'author'`. Default `'author'`. */
    attr?: string;
    /** Default `false`. */
    enabled?: boolean;
    fontFamily?: string;
    fontSize?: Dimension;
    fontWeight?: number;
    italic?: boolean;
    color?: ColorValue;
    /** Extra indent beyond the title's. Default `0`. */
    indent?: Dimension;
  };
  /** Part dividers get a row of their own. */
  parts?: {
    /** Default `true`. */
    enabled?: boolean;
    /** Open a fresh page before every part row but the first, so each
     *  part's chapters are listed on a page of their own. Default `false`. */
    breakBefore?: boolean;
    /** Row design; its container is the row (column width × `height`).
     *  Placeholders: `{number}`, `{numberRoman}`…, `{titleText}` and
     *  `{pageNumber}` (the part page's label). Palette-linked colours take
     *  the part's own palette. When empty, `{number} {titleText}` (joined
     *  with the H1's `numberSeparator`) and the page number are set in the
     *  level-1 entry typography. */
    design?: DesignSlot;
    /** The face of the part rows' `{leader}` (#1121), field by field over
     *  `toc.leader`'s; unset fields keep the text element's own. */
    leader?: TocLeaderFaceConfig;
    /** Row height; `em` is the body text size. Default `2em`, twice the
     *  body size (a row one or two body lines tall, depending on the
     *  leading). */
    height?: Dimension;
    marginTop?: Dimension;
    marginBottom?: Dimension;
  };
  /** The blocks of the contents (#850): a head row (a part row, or an
   *  entry of a heading level) and every entry under it, down to the next
   *  head of the same or a higher rank, kept on one column and page. A
   *  `:::toc{keep="…"}` overrides it for one contents. */
  groups?: TocGroupsConfig;
}

/** What heads a block of the contents (`toc.groups.head`): a part row, or
 *  the entry of a heading level. */
export type TocGroupHead = 'part' | 1 | 2 | 3 | 4 | 5 | 6;

/** `toc.groups` (#850). */
export interface TocGroupsConfig {
  /** Keep each block whole: one that does not fit in the room left moves
   *  to the next column or page, its head row with it. A block taller than
   *  a full column is cut, and the column it goes on in opens with its head
   *  row again. Default `false`. */
  keepTogether?: boolean;
  /** What heads a block. Default `'part'`. */
  head?: TocGroupHead;
  /** The fewest entries a cut block keeps under its head row: the head
   *  moves on rather than stand with fewer. Default `2`. */
  minEntriesAfterHead?: number;
  /** The head row repeated at the top of the column a cut block goes on
   *  in. */
  continuation?: {
    /** Default `true`. */
    enabled?: boolean;
    /** Set after the repeated title. Default: the document language's
     *  continued-table suffix ("(cont.)", "(suite)", "（续）"…). */
    mark?: string;
  };
}

export interface ResolvedTocGroupsConfig {
  keepTogether: boolean;
  head: TocGroupHead;
  minEntriesAfterHead: number;
  continuation: { enabled: boolean; mark: string };
}

export interface ResolvedTocEntryStyleConfig {
  fontFamily: string;
  fontSize: Dimension;
  lineHeight: Dimension;
  fontWeight: number;
  italic: boolean;
  color: ColorValue;
  indent: Dimension;
  numberWidth: Dimension;
  numberGap: Dimension;
  numberFontFamily: string;
  numberFontSize: Dimension;
  numberFontWeight: number;
  numberColor: ColorValue;
  marginTop: Dimension;
  marginBottom: Dimension;
}

export interface ResolvedTocLevelConfig extends ResolvedTocEntryStyleConfig {
  level: number;
}

export interface ResolvedTocConfig {
  levels: ResolvedTocLevelConfig[];
  /** Overrides applied on top of the level's entry style for unnumbered headings. */
  unnumbered: Partial<ResolvedTocEntryStyleConfig>;
  pageNumber: {
    fontFamily: string;
    fontSize: Dimension;
    fontWeight: number;
    italic: boolean;
    color: ColorValue;
    width: Dimension;
  };
  /** The face fields are present only when set (#1121). */
  leader: TocLeaderFaceConfig & { enabled: boolean; char: string; gap: Dimension };
  subtitle: {
    enabled: boolean;
    attr: string;
    fontFamily: string;
    fontSize: Dimension;
    fontWeight: number;
    italic: boolean;
    color: ColorValue;
    indent: Dimension;
  };
  parts: {
    enabled: boolean;
    breakBefore: boolean;
    design: ResolvedDesignSlot;
    /** Present only when set (#1121). */
    leader?: TocLeaderFaceConfig;
    height: Dimension;
    marginTop: Dimension;
    marginBottom: Dimension;
  };
  groups: ResolvedTocGroupsConfig;
}
