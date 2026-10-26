// Pages and what sits on them: comic panels and balloons, reflow events,
// composed-page frames, column rules and line number marks
// (#1276: split out of vdt.ts).
import type { PageRole, FolioPaperConfig } from '../types.js';
import type { NumeralStyle } from '../numerals/numbering.js';
import type { VDTBlock, VDTColumn, VDTFootnoteArea } from './blocks.js';
import type { VDTDesignTextBlock, VDTDesignRuleBlock, VDTDesignSlot } from './design.js';
import type { BoundingBox } from './document.js';
import type { VDTFlowFrame } from './flowFrames.js';

// ---------------------------------------------------------------------------
// Comic pages (`:::page`, #555–#563)
// ---------------------------------------------------------------------------

/** A point on the sheet (px). */
export interface VDTPoint {
  x: number;
  y: number;
}

/** The picture of a comic panel (or its pop-out cut-out): the whole picture
 *  is drawn at `box` (page px, uncropped, as `uncroppedPictureBox` gives)
 *  and clipped to the panel's polygon, so only `source` shows. */
export interface VDTComicArt {
  resourceId: string;
  kind: 'bitmap' | 'svg';
  /** The file the renderers draw (`registerResourceImage`). */
  fileId: string;
  /** The bitmap's format, for a bitmap. */
  format?: string;
  /** An SVG's vector print master (`Resource.svg.pdfFileId`): the PDF
   *  embeds its first page in place of the SVG. */
  pdfFileId?: string;
  /** Where the whole picture lands on the sheet (px). Larger than the cell
   *  on the axis a crop cuts; inside it on the axis a letterbox leaves. */
  box: BoundingBox;
  /** The part of the picture that shows, in fractions of the picture as
   *  stored (not flipped, even when `mirrored`). */
  source: BoundingBox;
  /** The picture is drawn flipped left to right inside `box` (a book read
   *  in the other direction than its art, `comics.mirrorArt`). */
  mirrored: boolean;
  /** The picture does not fill the cell: the bands it leaves show the
   *  panel background (`fit: 'contain'`, or a cell whose shape cannot hold
   *  the safe area under a cover crop). */
  letterbox: boolean;
}

/** One panel of a comic page, in reading order. Sheet coordinates (never a
 *  flow frame): a comic page is laid out on the sheet whatever the
 *  document's writing mode or direction. */
export interface VDTComicPanel {
  /** Position in reading order (0-based). */
  index: number;
  /** The panel's `#id`, when it has one. */
  id?: string;
  /** Id of the frame the split generated for the panel (#885,
   *  `VDTComicPage.frames`): `cm<fence>:<name>`, the same in every locale
   *  and across relayouts. */
  frameId?: string;
  /** The panel's source: from its `::panel` line to the end of its last
   *  script line. */
  sourceStart: number;
  sourceEnd: number;
  /** The panel's outline (a convex polygon, clockwise on the sheet), the
   *  gutters already taken off; a bleeding side runs to the bleed box. */
  polygon: VDTPoint[];
  bbox: BoundingBox;
  /** Corner radius (px); 0 for a panel cut by a slanted line. */
  radius: number;
  border: { width: number; color: string; style: 'solid' | 'none' | 'rough' };
  /** Fill under the picture (hex), absent when transparent. */
  background?: string;
  art?: VDTComicArt;
  /** A transparent cut-out drawn over the border (broken-border art), with
   *  the same crop as `art`. */
  pop?: VDTComicArt;
  /** Text alternative of the picture: the panel's `alt`, else the
   *  resource's `altText`. */
  altText?: string;
}

/** A split line of a comic page (a gutter between two cells), as the
 *  Sandbox drags it: dragging moves the line and writes the new
 *  percentage into the `split` attribute (`moveComicSplitLine`). */
export interface VDTComicSplitter {
  /** Tree path of the list the line splits (indices of the items walked
   *  down from the top list; `[]` is the top list). */
  path: number[];
  /** The line between children `boundary` and `boundary + 1`. */
  boundary: number;
  /** `'rows'`: a line across the page (between tiers); `'columns'`: a line
   *  down it. */
  axis: 'rows' | 'columns';
  /** The line's centre, from its start end to its far end (page px). */
  a: VDTPoint;
  b: VDTPoint;
  /** The gutter the line sits in (px). */
  gutter: number;
  /** Bounding box of the cell the list splits: a drag of `d` px along the
   *  axis is `d / parent.height` (rows) or `d / parent.width` (columns) of
   *  it. */
  parent: BoundingBox;
  /** The line's position (cumulative percent of the parent) at its start
   *  end and at its far end; equal for a straight line. */
  startPercent: number;
  endPercent: number;
  /** The range `startPercent` may be moved in (the slant kept) so every
   *  cell keeps at least 5 %. */
  min: number;
  max: number;
  /** The range of the `split` attribute's value in the source. */
  sourceStart: number;
  sourceEnd: number;
}

/** A balloon, caption or sound effect of a comic page, in reading order and
 *  paint order. */
export interface VDTComicBalloon {
  id: string;
  /** Stable id (#885): `cm<fence>:<frame>:b<order>`, the same in every
   *  locale and across relayouts (`id` counts panels of the layout). */
  elementId?: string;
  panelIndex: number;
  order: number;
  /** What the script line is: a speaker's balloon, a caption, a sound
   *  effect or an editor's note (from its key: `caption`, `sfx`, `note`,
   *  else a speaker). Renderers and tagging go by it, not by the style id
   *  (a book may name a sound-effect style anything). */
  kind: 'balloon' | 'caption' | 'sfx' | 'note';
  /** The balloon style id (`speech`, `thought`…). */
  style: string;
  speaker?: string;
  /** The script line(s) it was set from. */
  sourceStart: number;
  sourceEnd: number;
  /** Balloons of one join group share one outline. */
  group: number;
  /** Body and tail(s) as one SVG path (page px), absent for a sound effect
   *  or a style with no outline. */
  shape?: {
    d: string;
    fill?: string;
    stroke?: string;
    strokeWidth: number;
    /** Dash pattern of the outline (a whisper), px. Painted over a solid
     *  stroke in the fill colour 3 × `strokeWidth` wide, so that the gaps
     *  between the dashes read as the balloon's ground, not the art. */
    dash?: number[];
    double?: { gap: number };
  };
  /** The lettering's lines (vertical or bidi text as design text); a ruby
   *  reading is a block of its own after its base's (marked `artifact`). */
  text: VDTDesignTextBlock[];
  bbox: BoundingBox;
  tailTip?: VDTPoint;
  /** Rotation in degrees about the bbox centre (sound effects). */
  rotate?: number;
  /** Lean of the letters in degrees about the bbox centre, applied before
   *  `rotate` (positive: the tops forward, as italic). Painters apply
   *  `translate(c) · rotate(rotate) · [1 −tan(skew); 0 1] · translate(−c)`
   *  (`comicBalloonMatrix`). */
  skew?: number;
  halo?: { width: number; color: string };
}

// ---------------------------------------------------------------------------
// Composed pages (#846, DESIGN §4): a template's frames poured with slots
// ---------------------------------------------------------------------------

/** What happened to a frame while its page was composed (DESIGN §5.5),
 *  against the box its template declares (`VDTFrame.declaredRect`):
 *  `grew` / `resized` (smaller) and `moved` from groups and anchors (#856),
 *  `overflow` (#855); the reflow ladder (#858) adds the rest.
 *  `connectorDropped` (#1056, information): a connector of the decoration
 *  (`cause`, its id) left out its end on `frame`, a box the page does not
 *  show (collapsed, empty and optional, or missing). */
export type ReflowEventKind =
  | 'grew'
  | 'moved'
  | 'resized'
  | 'imageScaled'
  | 'textScaled'
  | 'continued'
  | 'overflow'
  | 'covered'
  | 'outside'
  | 'connectorDropped';

export interface ReflowEvent {
  /** The frame's name in its template. */
  frame: string;
  kind: ReflowEventKind;
  /** `grew` / `resized`: the frame's height (`axis: 'x'`: width) before
   *  and after, mm. `moved`: its top (`axis: 'x'`: its left edge) from
   *  the sheet's top (left) edge, before and after, mm. `overflow`: `toMm`
   *  is how much did not fit. */
  fromMm?: number;
  toMm?: number;
  /** `'x'`: a width or a move across. Absent: a height or a move down or
   *  up. */
  axis?: 'x' | 'y';
  scale?: number;
  /** The frame whose change caused this event; `'gutter'` when the spine
   *  band of a spread template kept the frame off it (#861). */
  cause?: string;
  /** `continued` (#859): the page (`VDTPage.index`) the frame's content
   *  goes on on, and the frame there (`VDTFrame.id`, `cp<n>:<slot>~<k>`). */
  toPage?: number;
  toFrame?: string;
  /** `continued` to a page of a later chapter (#943): that chapter's
   *  position in the book. `toPage` and `toFrame` are there once the host
   *  has both chapters. */
  toChapter?: number;
  /** `covered` (#1053): how much of the frame's ink lies under `cause`, the
   *  frame painted over it, in mm². */
  areaMm2?: number;
  /** `outside` (#1053): what the frame runs past, `toMm` being by how much
   *  (its largest side): the trim, the bleed, or the frame or group it is
   *  anchored inside (`'#name'`). */
  past?: 'trim' | 'bleed' | `#${string}`;
}

/** One frame of a composed page, in sheet coordinates. Its box and its
 *  content are ordinary callout blocks in `page.floats` (and
 *  `doc.blocks`), listed by `blockIds`: every backend paints, tags and
 *  selects them as it does a fixed callout. What the frame adds is what
 *  only the template knows: its name and config path, its layer, its
 *  turn, and how much of its content did not fit. */
export interface VDTFrame {
  /** `cp<fenceIndex>:<name>`: the same in every locale and across
   *  relayouts. On the n-th page added by continuation (#859) a frame is
   *  `cp<fenceIndex>:<name>~<n>`, and the frame that takes content from
   *  the page before is named by the frame of the fence's own page that
   *  first sent it on (`cp0:dinero~1`). */
  id: string;
  /** The frame's name in its template (the slot it receives); for an
   *  instance of a frame a grid repeats (#1061), `<frame>[n]`. */
  name: string;
  /** An instance of a frame a grid repeats (#1061): the template's frame
   *  (`configPath` is its entry) and the item, 1-based. */
  repeat?: { frame: string; item: number };
  /** The frame's box, label tab included, before any turn. */
  rect: { x: number; y: number; width: number; height: number };
  /** The box the template declares for the frame (its fixed size, or its
   *  `minHeight` where its height follows its content), before groups and
   *  anchors make room for what it holds (#856); absent when it is `rect`.
   *  Decoration with `pin` anchors here. */
  declaredRect?: { x: number; y: number; width: number; height: number };
  /** Degrees, clockwise, about the centre of `rect`: the box and its
   *  content turn together. 0 = upright. */
  rotate: number;
  /** Paint order: lower first; the template's decoration paints at 0. */
  layer: number;
  /** The callout style the frame is drawn with; absent = frameless. */
  styleId?: string;
  /** The look its story's `:::frame` piece names (`look="…"`, #1089) when
   *  `frameLooks` has no entry of that id (#1095): the frame is drawn with
   *  its style alone, and the Sandbox marks it. */
  lookUnknown?: string;
  /** Text scale the reflow ladder applied (1 = none; #858): the frame's
   *  content is laid out `1 / scale` times as wide and tall as `rect` and
   *  painted scaled by `scale` about the top-left of `rect`, so its font
   *  sizes, leading and spacing shrink together. Its blocks' coordinates
   *  are in that laid-out frame: {@link frameMatrix} (`composed/paint.ts`)
   *  puts them on the sheet. */
  scale: number;
  /** Scale the reflow ladder set the pictures of the frame's content at
   *  (#858), below 1; absent when they keep their size. */
  imageScale?: number;
  /** Height of content that did not fit in the frame, px (0 = it fits).
   *  Past the frame's foot it is clipped on paged output. */
  overflowPx: number;
  /** The frame whose content this one goes on with (`next`, or on a page
   *  added by continuation, #859, the frame of the page before), and the
   *  one this frame's content goes on in (on this page, or on a page added
   *  after it). */
  continuedFrom?: string;
  continuesTo?: string;
  /** The rest goes on in a page of a later chapter (#943): that chapter's
   *  position in the book; `continuesTo` is then the frame's id there,
   *  once the host has both chapters (`resolveJumpMarks`). */
  continuesToChapter?: number;
  /** The content comes from a page of an earlier chapter (#943): its
   *  position in the book; `continuedFrom` is the frame's id on its pages. */
  continuedFromChapter?: number;
  /** The frame holds text carried in from another chapter (#943): that
   *  chapter's position; `sourceStart` and `sourceEnd` are offsets in its
   *  file. */
  sourceChapter?: number;
  /** Where a tagged PDF reads a frame that holds carried text (#943) among
   *  the content of its chapter: just after the page it stands on (the
   *  content index of the page fence's closing marker, plus a half),
   *  instead of after the whole chapter. */
  readIndex?: number;
  /** The frame takes no room on this page (#912): on a page added by
   *  continuation that lays its template again for what goes on, a frame
   *  that receives nothing; on the page content goes on from, an empty
   *  frame that follows the frame cut in its stack (an answer space) and
   *  goes with the rest to the added page. Decoration anchored to it is
   *  not drawn. */
  collapsed?: true;
  /** Ids of the blocks set in this frame (its box first), in
   *  `page.floats` and `doc.blocks`. */
  blockIds: string[];
  /** JSON pointer of the template entry that sets the frame
   *  (`/pageTemplates/3/frames/2`). */
  configPath: string;
  /** Source range of the content poured into the frame (absolute
   *  offsets), when it holds any. */
  sourceStart?: number;
  sourceEnd?: number;
  /** Other frames' text wraps round this frame's box (`exclude: 'push'`). */
  push?: true;
  /** The frame's outline when it is not `rect` (#885): a comic panel cut
   *  by a slanted split line, a convex polygon, clockwise, sheet px. Its
   *  content is clipped to it and a point hits the frame inside it. */
  polygon?: VDTPoint[];
  /** Set on a frame a comic page's split generated (#885): the index of
   *  the panel it holds in `VDTComicPage.panels`. Such a frame comes from
   *  the Markdown (its `configPath` is empty); the template editor leaves
   *  it alone. */
  panel?: number;
  /** On a page of a spread (#861), a frame crossing the spine that is
   *  read on the facing page (the one holding its centre): this page
   *  shows its half. The blocks are copies of the facing page's, moved
   *  onto this sheet (ids ending in `-facing`); they are in no
   *  `page.floats` and no `doc.blocks`, so text is read and selected once:
   *  backends paint them clipped to `VDTComposedPage.sheetClip`, a tagged
   *  PDF as an artifact, the HTML hidden from assistive technology.
   *  `blockIds` is empty on such a frame. */
  facingBlocks?: VDTBlock[];
  /** The ruled lines (`FrameConfig.rules`, #914) of a frame that holds no
   *  box (no content, no style), in the page's flow coordinates: the
   *  template's decoration paints them. A frame with a box carries them on
   *  the box's `designOverlay`. */
  rules?: VDTDesignRuleBlock[];
  /** Set on a frame set in a writing mode other than its page's flow
   *  (`FrameConfig.writingMode`, #944): a vertical box on a horizontal
   *  page, a horizontal card on a vertical one. Its content is laid out in
   *  that mode in `rect`, the box the page gives it turned a quarter turn
   *  (its width and height swapped about the same centre), and `rotate`
   *  holds that quarter turn (90 for a vertical frame, −90 for a
   *  horizontal one on a vertical page) on top of the frame's own; so
   *  {@link frameMatrix} puts it on the page, and backends paint its text
   *  as a page of that mode is painted. `framePageRect` gives the box on
   *  the page. */
  writingMode?: 'horizontal-tb' | 'vertical-rl';
  /** Set on a vertical frame of a right-to-left page (#960): the page's
   *  mirror (`VDTMirroredFlowFrame.mirror.originX`), which the frame's
   *  content is turned back through. The page's flow is painted mirrored,
   *  which would set a vertical frame's lines from left to right; the
   *  frame is laid out as on a left-to-right page, {@link frameMatrix}
   *  puts it where the page shows it (the mirror included) and the
   *  backends paint its text without the flow's counter-flip, as the
   *  sheet reads it. */
  unmirrorX?: number;
  /** For a `'vertical-rl'` frame: what its vertical lines need, as a
   *  vertical page's flow has it (`VDTVerticalFlowFrame`). */
  centralBaselines?: Record<string, number>;
  dashAdvances?: Record<string, Record<string, number>>;
}

/** A composed page (`::::page{template}`, #846): the template it was set
 *  with and its frames. The page's columns are empty (one empty column,
 *  as on a comic page): nothing flows on it. */
export interface VDTComposedPage {
  /** The template's id, and the variant applied on this side. */
  template: string;
  variant?: 'recto' | 'verso';
  /** The side of a spread template's sheet this page is (#861): its
   *  physical side of the open book. */
  spread?: 'left' | 'right';
  /** On a page of a spread: the index (in `doc.pages`) of the facing page
   *  that holds the other half. */
  facingPage?: number;
  /** On a page of a spread: what the page shows of the sheet of two
   *  pages, its bleed box (page px, in the frame the frames are in; the
   *  trim at the spine when the book has no bleed). The frames and the
   *  decoration are painted clipped to it, so a frame or a band crossing
   *  the spine shows its own half on each page. */
  sheetClip?: { x: number; y: number; width: number; height: number };
  /** The page fence's ordinal in its chapter (stable across locales). */
  fenceIndex: number;
  /** On a page added by continuation (#859): the index (`VDTPage.index`)
   *  of the fence's own page, whose frames' content goes on here. */
  continuationOf?: number;
  /** The role the template reports to design slots (`role`, default
   *  `'composed'`). `page.role` is `'composed'` whatever this says. */
  role: string;
  /** The page fence's attributes (`{attr.x}` in decoration and running
   *  heads), with their source ranges (absolute offsets). */
  attrs: Record<string, string>;
  attrSources: Record<string, { sourceStart: number; sourceEnd: number }>;
  /** In template order. */
  frames: VDTFrame[];
  /** The template's decoration, laid with the frames' final boxes
   *  (`buildHeadersAndFooters`); painted at layer 0, its path and text
   *  blocks marked `over` after every frame (#1076, #1189). */
  decoration?: VDTDesignSlot;
  /** What the layout changed (DESIGN §5.5). */
  log: ReflowEvent[];
  /** JSON pointer of the template (`/pageTemplates/3`). */
  configPath: string;
  /** The modules the page lays in its modules group (#1062), in order:
   *  the instance name its frames are scoped by (`<name>.<frame>`), the
   *  module template and its pointer, and the module's box (page px, in
   *  the frame the frames are in) when it was laid here (one that went on
   *  whole has none). `resolvePageTemplate(config, template, { modules })`
   *  gives the template the page was laid with. `attrs` (#1189): the
   *  attributes its `:::module` fence writes besides `template` and
   *  `name`, which `{attr.x}` in the module's decoration reads before the
   *  page fence's, with each value's source range (absolute offsets). */
  modules?: {
    name: string;
    template: string;
    configPath: string;
    rect?: { x: number; y: number; width: number; height: number };
    attrs?: Record<string, string>;
    attrSources?: Record<string, { sourceStart: number; sourceEnd: number }>;
  }[];
  /** The page fence, opening line to closing fence (absolute offsets). */
  sourceStart: number;
  sourceEnd: number;
  /** A digest of everything the page's frames were laid out from (#857):
   *  template, Markdown and blocks, styles, fonts, locale, side and
   *  geometry. Two pages with the same key hold the same frames (their
   *  source offsets aside), so a host may keep the pixels it painted for
   *  one (with the same running heads and decoration). Absent when the
   *  page reads what the key does not hold (a footnote, a reference). */
  layoutKey?: string;
}

/** A comic page (`:::page`): its panels, the split lines between them and
 *  the lettering, on the sheet. Also the comic of a strip
 *  (`VDTBlock.comic`, relative to the block's box on the sheet) and each
 *  page of a two-page spread (`spread`: that page's panels clipped to its
 *  side of the spine, its split lines, its balloons, on its own sheet). */
export interface VDTComicPage {
  /** The `:::page` block in the source. */
  sourceStart: number;
  sourceEnd: number;
  /** The box the panels are cut from (the content area, or
   *  `comics.frame.margins`), page px. On a page of a spread, the part of
   *  the spread's frame on this page (from its outer edge to the spine); on
   *  a strip, the block's box (`x = y = 0`). */
  frame: BoundingBox;
  /** The reading direction the page was laid out in. */
  direction: 'ltr' | 'rtl';
  /** The side of a two-page spread (`:::page{spread}`, #567) this page
   *  holds, physical: the left page or the right one of the open book. */
  spread?: 'left' | 'right';
  /** Where the leaf the page was laid out on lies on the page, when it is
   *  not the page itself (`comics.viewerLeaf`: a host whose page is a
   *  screen, such as the Sandbox's HTML viewer, lays comic pages out on a
   *  print leaf scaled to fit it). Absent on paper. */
  leaf?: BoundingBox;
  /** Panels in reading order. */
  panels: VDTComicPanel[];
  splitters: VDTComicSplitter[];
  /** Reading order, paint order. */
  balloons: VDTComicBalloon[];
  /** Stable id of the comic (#885): `cm<n>`, `n` the comic fence's ordinal
   *  in its chapter (`:::page` and `:::strip` counted together). */
  id?: string;
  /** The frames the split generates (#885, DESIGN §7): one per panel, in
   *  panel order, each the panel's box (and `polygon` when slanted), with
   *  the panel's id and source. A text panel's frame (`::panel{text}`)
   *  lists the blocks its Markdown was set in (`blockIds`, in
   *  `page.floats`), which backends paint over the panels, under the
   *  lettering. */
  frames?: VDTFrame[];
}

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
