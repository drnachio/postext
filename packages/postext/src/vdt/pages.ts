// Pages and what sits on them: comic panels and balloons, reflow events,
// composed-page frames, column rules and line number marks
// (#1276: split out of vdt.ts).
import type { PageRole, FolioPaperConfig } from '../types.js';
import type { NumeralStyle } from '../numerals/numbering.js';
import type { VDTColumn, VDTBlock, VDTFootnoteArea } from './blocks.js';
import type { VDTDesignSlot } from './design.js';
import type { BoundingBox } from './document.js';
import type { VDTFlowFrame } from './flowFrames.js';
import type { VDTComicPage } from './pages/comic.js';
import type { VDTComposedPage } from './pages/composed.js';

export type { VDTPoint, VDTComicArt, VDTComicPanel, VDTComicSplitter, VDTComicBalloon, VDTComicPage } from './pages/comic.js';
export type { ReflowEventKind, ReflowEvent, VDTFrame, VDTComposedPage } from './pages/composed.js';

/** A column rule resolved to px and hex (see `VDTPage.columnRule`). */
export interface VDTColumnRule {
  enabled: boolean;
  color: string;
  lineWidthPx: number;
}

export interface VDTPage {
  index: number;
  /** The sheet's width and height (px), physical on every page. */
  width: number;
  height: number;
  /** The page's own content area (px, page coordinates): the trim box inset
   *  by the margins, mirrored on even pages when `margins.mirror` is on.
   *  Columns, float bands, header/footer containers and opener bands all
   *  derive from it — renderers read it instead of inferring the area from
   *  the column bboxes. On a vertical or right-to-left page it is in flow coordinates (see
   *  {@link flow}); `flowRectToPage(page, page.contentArea)` is the
   *  physical area. */
  contentArea: BoundingBox;
  /** Present on a page whose flow is set vertically (`layout.writingMode:
   *  'vertical-rl'`): the frame the flow was laid out in. On such a page
   *  `contentArea`, the columns, blocks, lines, floats, margin notes,
   *  footnote areas, the opener band and the design overlays of blocks are
   *  in FLOW coordinates, mapped onto the sheet by `flow.rotation` (see
   *  {@link flowToPage}, {@link flowRectToPage}); `width`, `height`, the
   *  header and the footer are physical, as are crop marks and the page
   *  background. Text painted in the flow is set vertically: upright CJK
   *  characters, Latin turned sideways; resource blocks carry a `'ccw'`
   *  rotation that composes with the frame to stand upright. Also present
   *  on every page of a right-to-left document ({@link VDTMirroredFlowFrame}):
   *  the same elements are then in flow coordinates mirrored onto the sheet
   *  (`x` → `page.width − x`), the header, the footer, crop marks and the
   *  background staying physical. Absent on left-to-right horizontal
   *  pages. */
  flow?: VDTFlowFrame;
  /** Page classification (see `PageRole`), stamped after placement by
   *  `classifyPages`. Drives the per-element `pages` filter of design
   *  slots. Absent until headers/footers are built. */
  role?: PageRole;
  /** The page's own paper colour (`#rrggbb`), when a part's or a styled
   *  section's palette overrides the entry `page.backgroundColor` links to:
   *  the salmon pages of a newspaper's business section. Absent on a page
   *  that paints the document's colour. The renderers paint it in place of
   *  `page.backgroundColor` (#506). */
  background?: string;
  /** Present on part-divider pages: the part number and title. Marks the
   *  page as `role: 'part'`. */
  partInfo?: {
    number: string;
    title: string;
    /** Palette entries the part's fence overrides (id → hex), applied to
     *  the design slots of every page of the part. */
    palette?: Record<string, string>;
    titleSourceStart?: number;
    titleSourceEnd?: number;
  };
  columns: VDTColumn[];
  /** The column rule of a page laid out with a heading style's own
   *  `layout` (a styled section's pages) when it differs from the
   *  document's `layout.columnRule`: whether it is drawn, its colour and its
   *  width. Absent on every other page, which takes the document's rule. */
  columnRule?: VDTColumnRule;
  header?: VDTDesignSlot;
  footer?: VDTDesignSlot;
  /** Optional full-width opener band above the column flow, used for
   *  heading-level `span: 'page'` chapter openers. */
  openerBand?: VDTDesignSlot;
  /** Blocks positioned outside the column flow: floated resource blocks
   *  (figures / tables) reserved into a band of a column or of the page, and
   *  `placement: 'fixed'` callouts (frame + children) pinned to page
   *  coordinates. Their zones shrink the columns' usable height; they are
   *  rendered after the columns, clipped to the content area rather than to
   *  a single column so a `span: 'page'` float can cross the gutter. */
  floats?: VDTBlock[];
  marginNotes: VDTBlock[];
  /** Footnote areas at the foot of the page's columns (one per column that
   *  holds notes). */
  footnoteAreas?: VDTFootnoteArea[];
  /** Numeric counter for this page from the active page-numbering sequence.
   *  Always set after placement — defaults to `index + 1` when no explicit
   *  numbering config applies. */
  pageNumberValue: number;
  /** Rendered label for `pageNumberValue` using `pageNumberFormat`
   *  (e.g. `'iv'`, `'1'`, `'A'`). */
  pageLabel: string;
  /** Format active at this page. */
  pageNumberFormat: NumeralStyle;
  /** Marks pages inserted purely to satisfy a parity constraint
   *  (`:::pagebreak{parity=...}` or heading `breakBefore.parity`).
   *  They render empty body content but still consume a page number. */
  blankForParity?: boolean;
  /** Marks the mandatory leading blank page inserted by an `always-odd`
   *  or `always-even` parity mode. Unlike `blankForParity`, a
   *  `blankForForce` page belongs to the *previous* chapter — it serves
   *  as a separator, not as parity padding for the upcoming one. */
  blankForForce?: boolean;
  /** Present on the pages laid out with content from inside a
   *  `:::paper{…}` container: the stock they are printed on, as the fence
   *  wrote it (nested fences merged, the inner one's fields winning), not
   *  resolved — unset fields follow `config.folio.paper`. Only the Folio
   *  viewer reads it; canvas, PDF and HTML ignore it. Absent on every other
   *  page. */
  paper?: FolioPaperConfig;
  /** Present on a comic page (`:::page`, `role: 'comic'`): its panels,
   *  split lines and lettering, in sheet coordinates. The page's columns
   *  are empty: nothing flows on it. */
  comic?: VDTComicPage;
  /** Present on a composed page (`::::page{template}`, `role:
   *  'composed'`): the template's frames, in sheet coordinates. The
   *  frames' boxes and content are in `floats`; the page's one column is
   *  empty. */
  composed?: VDTComposedPage;
  /** The line numbers printed on the page (`lineNumbers`, #621): one text
   *  block per number, physical like the header and footer, each flagged
   *  `artifact` (a tagged PDF marks it so, the HTML hides it from
   *  assistive technology and from selection). Absent on a page with
   *  none. */
  lineNumbers?: VDTDesignSlot;
  /** The line each block of {@link lineNumbers} labels, in the same order:
   *  for overlays and references. */
  lineNumberMarks?: VDTLineNumberMark[];
}

/** The line a printed line number labels (#621). */
export interface VDTLineNumberMark {
  /** The line's number in the count. */
  number: number;
  /** The number as printed (in `lineNumbers.format`). */
  label: string;
  /** The column the line sits in (`VDTColumn.index`). */
  columnIndex: number;
  /** The line's block (`VDTBlock.id`) and its index in the block's
   *  `lines`. */
  blockId: string;
  lineIndex: number;
}
