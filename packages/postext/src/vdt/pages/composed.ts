// Composed pages: a template's frames poured with slots, and the reflow
// events that record what happened to each frame.
import type { VDTBlock } from '../blocks.js';
import type { VDTDesignRuleBlock, VDTDesignSlot } from '../design.js';
import type { VDTPoint } from './comic.js';

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
