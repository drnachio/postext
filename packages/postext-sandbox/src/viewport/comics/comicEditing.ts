/**
 * The comic page tools of the previews (#568): in the canvas, the HTML
 * pages and the Folio's select mode, a splitter (the gutter between two
 * panels) shows a resize cursor under the pointer and drags to a new
 * position, written into the page's `split` on release; a panel under the
 * pointer shows a small toolbar to split it in two or merge it with the
 * next one. Every splitter is also a focusable separator: arrow keys move
 * it, Enter writes it.
 *
 * Balloons (#571): a balloon under the pointer shows the move cursor and
 * drags (a ghost of its outline follows the pointer); on release its line
 * is pinned there (`at="x% y%"`, fractions of the panel's picture). Shift
 * keeps the drag to one axis, Escape cancels, a double click unpins, Alt
 * turns a sound effect (`rotate=`). A joined group moves whole: its first
 * line is pinned. Each group is also a focusable handle: arrow keys move
 * it, Enter pins it, Delete unpins it. While it moves, a ghost that would
 * cover a face or a zone the picture keeps clear, or run out of the panel,
 * turns orange and the tooltip says why (#580). A press on a balloon's
 * words is not a grab: it selects them in the Markdown editor, as on the
 * body text (#595; `balloonText.ts`); the balloon drags from its body
 * round them.
 *
 * A click on a panel's picture (or on the visible part of its pop-out
 * cut-out) opens that picture in the Resources panel (#594).
 *
 * Tails (#580): a balloon's tail tip shows the crosshair; dragging it
 * points the tail at the spot it is dropped on (`to="x% y%"`, fractions
 * of the picture), a double click on it points the tail back at its
 * speaker (`to` taken off). From a balloon's handle, `T` goes to its
 * tail's handle (arrow keys, Enter, Escape, Delete as for the balloon).
 *
 * Panels (#580): each panel that fills a cell is a focusable handle too:
 * `H` splits it with a horizontal line, `V` with a vertical one, `M`
 * merges it with the next; Enter opens its toolbar.
 *
 * Everything works on the strips a page holds (`:::strip`, in a column or
 * floated, #566) as on a comic page: `pageComics` puts them on the sheet,
 * and their edits go to their own fence.
 *
 * The controller is DOM-only and viewer-neutral: a `ComicSurface` says
 * where its floating parts go and paints its marks (an SVG layer over a
 * page slot, or the Folio's page decorations). The geometry is in
 * `comicDrag.ts`, the source edits in `comicSource.ts`.
 */

import type { Dispatch, MutableRefObject } from 'react';
import { pageComics, type BoundingBox, type Resource, type VDTComicBalloon, type VDTComicPage, type VDTComicPanel, type VDTComicSplitter, type VDTDocument, type VDTPoint } from 'postext';
import type { SandboxAction } from '../../context/SandboxContext';
import type { ComposedBook } from '../../book/types';
import type { SandboxLabels } from '../../types/labels';
import { segmentAtOffset } from '../../book/compose';
import { shiftTextChanges, type TextChange } from '../../book/textChanges';
import { applyViewerEdit } from '../../editor/viewerEdits';
import {
  SPLITTER_HIT_MIN_SCREEN_PX,
  dragSplitter,
  letterboxedPanels,
  movedPanels,
  nudgeSplitter,
  splitterBand,
  splitterCursor,
  splitterLine,
  type SplitterPosition,
} from './comicDrag';
import { canMergeNext, canSplitPanel, mergePanelChanges, moveSplitterChanges, splitPanelChanges } from './comicSource';
import { comicBySource, comicHitAt, comicPressAt, panelKeyAction, type ArtOpacity, type ComicHit, type ComicPress } from './comicHit';
import { balloonTextNearest, type TextMeasure } from './balloonText';
import { registryArtOpacity } from './artAlpha';
import {
  BALLOON_NUDGE_PERCENT,
  BALLOON_NUDGE_SHIFT_PERCENT,
  TAIL_HIT_SCREEN_PX,
  balloonDropIssues,
  balloonEm,
  balloonGhost,
  balloonGrabCentre,
  balloonGroup,
  balloonKeepOut,
  balloonPanel,
  boxCentre,
  dragBalloon,
  ellipseExit,
  groupBox,
  nudgeDelta,
  pageToTailTarget,
  pinAfterMove,
  pinToPage,
  rotateAbout,
  tailTargetNow,
  turnAngle,
  type BalloonDropIssues,
} from './balloonDrag';
import { comicBalloonItem, pinLineChanges, rotateLineChanges, tailLineChanges, unpinLineChanges, untailLineChanges } from './balloonSource';

/** A shape the tools draw over a page (sheet px; `width` and `dash` in
 *  CSS px, whatever the zoom). */
export interface ComicMark {
  points: VDTPoint[];
  closed?: boolean;
  fill?: string;
  stroke?: string;
  width?: number;
  dash?: number[];
}

/** Where the tools of one viewer draw and float. */
export interface ComicSurface {
  /** The element the toolbar, the tooltip and the splitter handles go in
   *  (positioned). */
  host: HTMLElement;
  /** The pages whose splitters get keyboard handles now. */
  pages(): number[];
  /** Draw a page's marks (null: take them off). */
  paint(pageIndex: number, marks: ComicMark[] | null): void;
  /** Put a floating element (absolutely positioned in `host`) at a sheet
   *  point of a page; false when the point is not on screen. `counter`
   *  undoes a zoom applied to the host so the element keeps its size. */
  place(el: HTMLElement, pageIndex: number, x: number, y: number): boolean;
  /** Sheet px per CSS px on a page (hit bands and line widths). */
  sheetPxPerCssPx(pageIndex: number): number;
}

export interface ComicEditOptions {
  surface: ComicSurface;
  docRef: MutableRefObject<VDTDocument | null>;
  /** The composed book a page's offsets belong to. */
  sourceOfPage: (pageIndex: number) => ComposedBook | null;
  dispatchRef: MutableRefObject<Dispatch<SandboxAction>>;
  resourcesRef?: MutableRefObject<Resource[] | null>;
  labelsRef: MutableRefObject<SandboxLabels>;
  /** Whether the tools are on now (the Folio: its select mode). */
  enabled: () => boolean;
  /** A drag ended (released, cancelled, Escape): the caller lets the
   *  pointer go. */
  onDragEnd?: (pointerId: number) => void;
  /** Whether a pop-out cut-out shows ink at a point (its opaque pixels
   *  open it); the image registry's pictures when left out. */
  artOpacity?: ArtOpacity;
  /** How the balloon words are measured; a canvas 2D context when left
   *  out. */
  measure?: TextMeasure;
}

/** The words of a balloon pressed at a point (#595): the caret's source
 *  offset there, and where a selection dragged from it ends at another
 *  point (held to the same balloon's words). */
export interface BalloonTextPress {
  offset: number;
  head(at: ComicPointer | null): number | null;
}

/** A page point under the pointer. */
export interface ComicPointer {
  pageIndex: number;
  x: number;
  y: number;
}

export interface ComicEditor {
  /** A press: true when it grabbed a splitter, a balloon or a tail tip
   *  (the caller captures the pointer and leaves the text alone). */
  pointerDown(ev: PointerEvent, at: ComicPointer | null): boolean;
  /** A move while nothing is pressed: the resize cursor over a splitter,
   *  `move` over a balloon (`text` over its words), `crosshair` over a
   *  tail tip, `pointer` over a panel's picture (null elsewhere), the
   *  panel toolbar over a panel. */
  hover(ev: PointerEvent, at: ComicPointer | null): string | null;
  /** A move while a splitter, a balloon or a tail tip is held. */
  dragMove(ev: PointerEvent, at: ComicPointer | null): void;
  /** The press ends: the line is written (or not, `cancel`). False when
   *  the press was a plain click on a balloon (it never moved): the click
   *  is then the text's (the caret goes to the balloon's line). A second
   *  click on a pinned balloon right after the first unpins it (the page
   *  gets no `dblclick`: the press's default is prevented). */
  pointerUp(ev: PointerEvent, cancel?: boolean): boolean;
  /** The source offset of the balloon (or tail tip) under a point, for a
   *  click to put the caret there: the character's on its words (#595),
   *  else its script line's; null off them. */
  balloonSourceAt(at: ComicPointer | null): number | null;
  /** The words of a balloon under a point (#595): a press there selects
   *  text instead of dragging the balloon. Null off its glyphs (its body
   *  round them, its tail), or where its words do not map back. */
  balloonText(at: ComicPointer | null): BalloonTextPress | null;
  /** The resource of the panel picture under a point (#594): its art, or
   *  its pop-out cut-out where that shows; null on a balloon, a split
   *  line, a gutter or a panel with no picture. */
  panelArtAt(at: ComicPointer | null): string | null;
  dragging(): boolean;
  /** Whether a splitter lies under a point. */
  onSplitter(at: ComicPointer | null): boolean;
  /** The pointer left the pages. */
  leave(): void;
  /** Rebuild the keyboard handles from the current document. */
  sync(): void;
}

const ACCENT = 'rgba(37, 99, 235, 0.95)';
const ACCENT_BAND = 'rgba(37, 99, 235, 0.16)';
const ACCENT_CELL = 'rgba(37, 99, 235, 0.07)';
const WARN_FILL = 'rgba(234, 88, 12, 0.26)';
const WARN_STROKE = 'rgba(194, 65, 12, 0.95)';
const GHOST_FILL = 'rgba(37, 99, 235, 0.10)';
const TIP_BG = 'rgba(15, 23, 42, 0.92)';
const TIP_WARN_BG = 'rgba(154, 52, 18, 0.95)';
/** The ring a focused keyboard handle shows (whatever the browser's own
 *  focus ring does on an invisible element). */
const FOCUS_RING = '0 0 0 2px #fff, 0 0 0 4px rgba(37, 99, 235, 0.95)';
/** Screen px a press on a balloon travels before it is a drag (less is a
 *  click: the caret goes to its line). */
const BALLOON_DRAG_THRESHOLD_PX = 3;
/** The longest pause between the two clicks of a double click (ms). */
const DOUBLE_CLICK_MS = 450;
/** Screen px past the ends of a line of balloon words that still count as
 *  its glyphs (#595). */
const GLYPH_SLOP_SCREEN_PX = 2;

interface DragState {
  page: number;
  comic: VDTComicPage;
  splitter: VDTComicSplitter;
  grab: VDTPoint;
  pointerId: number;
  pos: SplitterPosition;
  moved: boolean;
}

interface KeyState {
  page: number;
  /** The fence of the comic the line belongs to (a page, a strip). */
  comicStart: number;
  splitter: VDTComicSplitter;
  pos: SplitterPosition;
}

/** A balloon group held by the pointer, or moved from the keyboard. */
interface BalloonMove {
  page: number;
  comic: VDTComicPage;
  /** The group, its first balloon (whose line is pinned) first. */
  members: VDTComicBalloon[];
  panel: VDTComicPanel;
  /** The centre the move carries (the written pin, else the first
   *  balloon's box centre). */
  centre: VDTPoint;
  /** The box round the group (kept inside the panel). */
  box: BoundingBox;
  /** Sheet travel so far. */
  delta: VDTPoint;
  /** A sound effect's rotation now, and as laid out (degrees). */
  rotate: number;
  rotate0: number;
  /** What the panel's picture keeps clear (faces, avoid zones). */
  keepOut: { faces: BoundingBox[]; avoid: BoundingBox[] };
  /** The line is written with `break`: it may cross the border. */
  breakBorder: boolean;
}

interface BalloonDrag extends BalloonMove {
  grab: VDTPoint;
  pointerId: number;
  moved: boolean;
  /** Alt on a sound effect: the drag turns it. */
  turning: boolean;
}

/** A tail on the move: the balloon that carries it, its panel, and the
 *  point it would aim at (sheet px). */
interface TailMove {
  page: number;
  comic: VDTComicPage;
  balloon: VDTComicBalloon;
  panel: VDTComicPanel;
  /** Where it aims as laid out, and where it would aim now. */
  from: VDTPoint;
  target: VDTPoint;
}

interface TailDrag extends TailMove {
  grab: VDTPoint;
  pointerId: number;
  moved: boolean;
}

/** A balloon group's identity across relayouts: its page's comic and its
 *  first line (an edit of that line leaves its start where it was). */
function balloonKey(comic: VDTComicPage, first: Pick<VDTComicBalloon, 'sourceStart'>): string {
  return `b${comic.sourceStart}:${first.sourceStart}`;
}

/** A tail's handle: its balloon's line. */
const tailKey = (comic: VDTComicPage, b: Pick<VDTComicBalloon, 'sourceStart'>): string => `t${comic.sourceStart}:${b.sourceStart}`;

/** A panel's handle: its comic and its place in reading order. */
const panelKey = (comic: VDTComicPage, panel: Pick<VDTComicPanel, 'index'>): string => `p${comic.sourceStart}:${panel.index}`;

/** A circle as a polygon (sheet px). */
function ring(c: VDTPoint, r: number, n = 20): VDTPoint[] {
  return Array.from({ length: n }, (_, i) => ({ x: c.x + r * Math.cos((2 * Math.PI * i) / n), y: c.y + r * Math.sin((2 * Math.PI * i) / n) }));
}

const isSoundEffect = (b: VDTComicBalloon) => (b.kind ?? (b.style === 'sfx' ? 'sfx' : 'balloon')) === 'sfx';

/** A balloon's text, for its handle's name. */
function balloonText(members: readonly VDTComicBalloon[]): string {
  const text = members.flatMap((b) => b.text.flatMap((t) => t.lines.map((l) => l.text))).join(' ').replace(/\s+/g, ' ').trim();
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}

/** A splitter's identity across relayouts: its page's comic and its place
 *  in the split tree. */
function splitterKey(comic: VDTComicPage, s: Pick<VDTComicSplitter, 'path' | 'boundary'>): string {
  return `${comic.sourceStart}:${s.path.join('.')}:${s.boundary}`;
}

/** The splitter a commit from the keyboard came from: its handle takes the
 *  focus back once the pages are drawn again. */
let refocus: { key: string; until: number } | null = null;
/** Ids of the keyboard hints, one per viewer surface. */
let hintCount = 0;
/** The tools of the page slots on show, brought up to date by
 *  `syncComicEditors` when the previews show a new layout. */
const liveEditors = new Set<{ host: HTMLElement; sync: () => void }>();
/** The tools wired on each host: a host wired again (the HTML preview
 *  rebuilds a page's inside in place) retires the earlier ones. */
const editorOfHost = new WeakMap<HTMLElement, { dispose: () => void }>();

/** Bring the splitter handles of every page on show up to date with the
 *  document their viewer shows now (after a relayout; a page slot whose
 *  layout keeps its shape is not rebuilt). */
export function syncComicEditors(): void {
  for (const e of [...liveEditors]) {
    if (!e.host.isConnected) liveEditors.delete(e);
    else e.sync();
  }
}

const samePath = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

function percentText(value: number): string {
  try {
    const lang = typeof document !== 'undefined' ? document.documentElement.lang || undefined : undefined;
    return new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 1 }).format(value / 100);
  } catch {
    return `${Math.round(value * 10) / 10} %`;
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A 20 px toolbar icon: a panel and the line a button draws in it. */
function icon(kind: 'rows' | 'columns' | 'merge'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  const path = document.createElementNS(SVG_NS, 'path');
  const d = {
    rows: 'M3 3h14v14H3z M3 10h14',
    columns: 'M3 3h14v14H3z M10 3v14',
    merge: 'M3 3h14v14H3z M10 3v4 M10 13v4 M7 10h6 M11 8l2 2-2 2',
  }[kind];
  path.setAttribute('d', d);
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

/** Stop the page's own pointer and click handling (caret, text drag) at a
 *  floating control. */
function isolate(el: HTMLElement): void {
  for (const type of ['pointerdown', 'pointerup', 'click', 'dblclick', 'mousedown']) {
    el.addEventListener(type, (ev) => ev.stopPropagation());
  }
}

/**
 * Wire the comic tools on a viewer. The caller forwards the pointer events
 * it gets on the pages (`attachPageInteraction`).
 */
export function createComicEditor(opts: ComicEditOptions): ComicEditor {
  const { surface, docRef, dispatchRef, labelsRef } = opts;
  const host = surface.host;
  editorOfHost.get(host)?.dispose();
  let disposed = false;
  const enabled = () => !disposed && opts.enabled();
  const label = (key: keyof SandboxLabels) => labelsRef.current[key];

  let hover: { page: number; splitter?: VDTComicSplitter; panel?: VDTComicPanel; balloons?: VDTComicBalloon[]; tail?: VDTComicBalloon } | null = null;
  let drag: DragState | null = null;
  let key: KeyState | null = null;
  let focused: { page: number; splitter: VDTComicSplitter } | null = null;
  /** A tail tip held by the pointer. */
  let tdrag: TailDrag | null = null;
  /** A tail moved with the arrow keys, not written yet. */
  let tkey: TailMove | null = null;
  /** The tail whose handle has the focus. */
  let tfocused: { page: number; comic: VDTComicPage; balloon: VDTComicBalloon; tip: VDTPoint } | null = null;
  /** The panel whose handle has the focus. */
  let pfocused: { page: number; panel: VDTComicPanel } | null = null;
  /** A balloon group held by the pointer. */
  let bdrag: BalloonDrag | null = null;
  /** A balloon group moved with the arrow keys, not written yet. */
  let bkey: BalloonMove | null = null;
  /** The balloon group whose handle has the focus. */
  let bfocused: { page: number; members: VDTComicBalloon[] } | null = null;
  /** The last plain click on a balloon group (a second one soon after on
   *  the same group is a double click). */
  let lastTap: { key: string; time: number; x: number; y: number } | null = null;
  /** Pages painted last, to clear when they have nothing to show. */
  const painted = new Set<number>();

  /** Every comic a page shows, on its sheet: its comic page (or half of a
   *  spread) and the strips its columns and bands hold. */
  const comicsOf = (page: number): VDTComicPage[] => {
    const p = docRef.current?.pages[page];
    return p ? pageComics(p) : [];
  };
  /** The comic of a page set from the fence at `start`, as laid out now. */
  const comicOf = (page: number, start: number): VDTComicPage | null => comicBySource(comicsOf(page), start);
  const minBand = (page: number) => SPLITTER_HIT_MIN_SCREEN_PX * surface.sheetPxPerCssPx(page);
  const tipRadius = (page: number) => TAIL_HIT_SCREEN_PX * surface.sheetPxPerCssPx(page);
  /** The splitter of the current document at the same place in the tree. */
  const current = (page: number, comicStart: number, s: Pick<VDTComicSplitter, 'path' | 'boundary'>): VDTComicSplitter | null =>
    comicOf(page, comicStart)?.splitters.find((o) => o.boundary === s.boundary && samePath(o.path, s.path)) ?? null;
  const resourceOf = (id: string | undefined): Resource | undefined => (id ? opts.resourcesRef?.current?.find((r) => r.id === id) : undefined);

  // ---------------------------------------------------------------- marks

  const splitterMarks = (page: number, s: VDTComicSplitter, strong: boolean): ComicMark[] => [
    { points: splitterBand(s, minBand(page)), closed: true, fill: ACCENT_BAND },
    { points: [s.a, s.b], stroke: ACCENT, width: strong ? 2.5 : 1.5 },
  ];

  /** The marks of a line held at `pos`: the panels either side as they
   *  would be (tinted where the art would letterbox), the old line dashed,
   *  the new one drawn. */
  const movingMarks = (page: number, comic: VDTComicPage, s: VDTComicSplitter, pos: SplitterPosition): { marks: ComicMark[]; letterboxed: number[] } => {
    const moved = movedPanels(comic, s, pos);
    const letterboxed = letterboxedPanels(comic, moved, opts.resourcesRef?.current ?? null);
    const marks: ComicMark[] = [];
    for (const [index, poly] of moved) {
      const warn = letterboxed.includes(index);
      marks.push({ points: poly, closed: true, fill: warn ? WARN_FILL : ACCENT_CELL, stroke: warn ? WARN_STROKE : ACCENT, width: warn ? 1.5 : 1 });
    }
    const line = splitterLine(comic, s, pos);
    marks.push({ points: [s.a, s.b], stroke: ACCENT, width: 1, dash: [4, 4] });
    marks.push({ points: splitterBand({ ...line, gutter: s.gutter }, minBand(page)), closed: true, fill: ACCENT_BAND });
    marks.push({ points: [line.a, line.b], stroke: ACCENT, width: 2.5 });
    return { marks, letterboxed };
  };

  /** The outline of a balloon group (dashed: under the pointer; solid:
   *  its handle has the focus). */
  const balloonMarks = (members: readonly VDTComicBalloon[], strong: boolean): ComicMark[] =>
    balloonGhost(members, { x: 0, y: 0 }).map((points) => ({ points, closed: true, stroke: ACCENT, width: strong ? 2 : 1.5, ...(strong ? {} : { dash: [5, 3] }) }));

  /** What is wrong where a group on the move would land (nothing while it
   *  only turns). */
  const dropIssues = (m: BalloonMove): BalloonDropIssues | null => {
    if (m.rotate !== m.rotate0) return null;
    const issues = balloonDropIssues(m.members, m.delta, m.panel, m.keepOut, { breakBorder: m.breakBorder, slack: surface.sheetPxPerCssPx(m.page) });
    return issues.face || issues.avoid || issues.outside ? issues : null;
  };

  /** A group on the move: where it was, dashed, and its ghost where it
   *  would go (turned, for a sound effect; orange where it would cover a
   *  face or a zone kept clear, or leave the panel). */
  const movingBalloonMarks = (m: BalloonMove): ComicMark[] => {
    const marks: ComicMark[] = balloonGhost(m.members, { x: 0, y: 0 }).map((points) => ({ points, closed: true, stroke: ACCENT, width: 1, dash: [4, 4] }));
    const turn = m.rotate - m.rotate0;
    const pivot = boxCentre(m.members[0]!.bbox);
    const at = { x: pivot.x + m.delta.x, y: pivot.y + m.delta.y };
    const warn = dropIssues(m) !== null;
    if (warn) {
      // The zones kept clear, cut to the panel (a crop leaves part of the
      // picture out of it).
      const cell = m.panel.bbox;
      for (const z of [...m.keepOut.faces, ...m.keepOut.avoid]) {
        const x0 = Math.max(z.x, cell.x);
        const y0 = Math.max(z.y, cell.y);
        const x1 = Math.min(z.x + z.width, cell.x + cell.width);
        const y1 = Math.min(z.y + z.height, cell.y + cell.height);
        if (x1 <= x0 || y1 <= y0) continue;
        marks.push({ points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true, stroke: WARN_STROKE, width: 1, dash: [3, 3] });
      }
    }
    for (const poly of balloonGhost(m.members, m.delta)) {
      marks.push({ points: turn ? poly.map((p) => rotateAbout(p, at, turn)) : poly, closed: true, fill: warn ? WARN_FILL : GHOST_FILL, stroke: warn ? WARN_STROKE : ACCENT, width: 2 });
    }
    const c = { x: m.centre.x + m.delta.x, y: m.centre.y + m.delta.y };
    const r = 4 * surface.sheetPxPerCssPx(m.page);
    marks.push({ points: [{ x: c.x - r, y: c.y }, { x: c.x + r, y: c.y }], stroke: ACCENT, width: 1.5 });
    marks.push({ points: [{ x: c.x, y: c.y - r }, { x: c.x, y: c.y + r }], stroke: ACCENT, width: 1.5 });
    return marks;
  };

  /** A tail tip: a ring round it (dashed under the pointer). */
  const tailMarks = (page: number, tip: VDTPoint | undefined, strong: boolean): ComicMark[] =>
    tip ? [{ points: ring(tip, 6 * surface.sheetPxPerCssPx(page)), closed: true, fill: ACCENT_BAND, stroke: ACCENT, width: strong ? 2 : 1.5, ...(strong ? {} : { dash: [3, 2] }) }] : [];

  /** A tail on the move: its tip as laid out, dashed; a line from the
   *  balloon's edge to where it would aim, and a cross there. */
  const movingTailMarks = (m: TailMove): ComicMark[] => {
    const k = surface.sheetPxPerCssPx(m.page);
    const marks: ComicMark[] = m.balloon.tailTip ? [{ points: ring(m.balloon.tailTip, 6 * k), closed: true, stroke: ACCENT, width: 1, dash: [3, 3] }] : [];
    const edge = ellipseExit(m.balloon.bbox, m.target);
    marks.push({ points: [edge, m.target], stroke: ACCENT, width: 2, dash: [6, 3] });
    const r = 6 * k;
    const c = m.target;
    marks.push({ points: [{ x: c.x - r, y: c.y }, { x: c.x + r, y: c.y }], stroke: ACCENT, width: 2 });
    marks.push({ points: [{ x: c.x, y: c.y - r }, { x: c.x, y: c.y + r }], stroke: ACCENT, width: 2 });
    marks.push({ points: ring(c, 3 * k), closed: true, fill: ACCENT, stroke: ACCENT, width: 1 });
    return marks;
  };

  let lastLetterboxed: number[] = [];

  const repaint = (): void => {
    const byPage = new Map<number, ComicMark[]>();
    const add = (page: number, marks: ComicMark[]) => byPage.set(page, [...(byPage.get(page) ?? []), ...marks]);
    lastLetterboxed = [];
    if (tdrag) {
      if (tdrag.moved) add(tdrag.page, movingTailMarks(tdrag));
      else add(tdrag.page, tailMarks(tdrag.page, tdrag.balloon.tailTip, true));
    } else if (tkey) {
      add(tkey.page, movingTailMarks(tkey));
    } else if (bdrag) {
      if (bdrag.moved) add(bdrag.page, movingBalloonMarks(bdrag));
      else add(bdrag.page, balloonMarks(bdrag.members, true));
    } else if (bkey) {
      add(bkey.page, movingBalloonMarks(bkey));
    } else if (drag) {
      const r = movingMarks(drag.page, drag.comic, drag.splitter, drag.pos);
      add(drag.page, r.marks);
      lastLetterboxed = r.letterboxed;
    } else if (key) {
      const comic = comicOf(key.page, key.comicStart);
      if (comic) {
        const r = movingMarks(key.page, comic, key.splitter, key.pos);
        add(key.page, r.marks);
        lastLetterboxed = r.letterboxed;
      }
    } else {
      if (focused) add(focused.page, splitterMarks(focused.page, focused.splitter, true));
      if (bfocused) add(bfocused.page, balloonMarks(bfocused.members, true));
      if (tfocused) add(tfocused.page, tailMarks(tfocused.page, tfocused.tip, true));
      if (pfocused) add(pfocused.page, [{ points: pfocused.panel.polygon, closed: true, fill: ACCENT_CELL, stroke: ACCENT, width: 2 }]);
      if (hover?.tail) add(hover.page, tailMarks(hover.page, hover.tail.tailTip, false));
      else if (hover?.balloons) add(hover.page, balloonMarks(hover.balloons, false));
      else if (hover?.splitter) add(hover.page, splitterMarks(hover.page, hover.splitter, false));
      else if (hover?.panel) add(hover.page, [{ points: hover.panel.polygon, closed: true, stroke: ACCENT, width: 1, dash: [6, 4] }]);
    }
    for (const page of painted) if (!byPage.has(page)) surface.paint(page, null);
    painted.clear();
    for (const [page, marks] of byPage) {
      surface.paint(page, marks);
      painted.add(page);
    }
  };

  // -------------------------------------------------------------- tooltip

  const tip = document.createElement('div');
  tip.setAttribute('role', 'status');
  tip.dataset.comicTip = '';
  Object.assign(tip.style, {
    position: 'absolute',
    zIndex: '6',
    pointerEvents: 'none',
    display: 'none',
    // Its own width (up to 260 px), not what is left of the page beside it.
    width: 'max-content',
    maxWidth: '260px',
    padding: '4px 8px',
    borderRadius: '6px',
    font: '12px/1.4 system-ui, sans-serif',
    background: 'rgba(15, 23, 42, 0.92)',
    color: '#fff',
    whiteSpace: 'normal',
    transformOrigin: '0 0',
  } satisfies Partial<CSSStyleDeclaration>);
  host.appendChild(tip);

  const showTip = (page: number, at: VDTPoint, pos: SplitterPosition, s: VDTComicSplitter): void => {
    const lines = [s.endPercent !== s.startPercent || pos.end !== pos.start ? `${percentText(pos.start)} – ${percentText(pos.end)}` : percentText(pos.start)];
    for (const index of lastLetterboxed) lines.push(label('comicLetterboxHint').replace('__n__', String(index + 1)));
    tip.textContent = lines.join('\n');
    tip.style.whiteSpace = 'pre-line';
    tip.style.background = lastLetterboxed.length > 0 ? TIP_WARN_BG : TIP_BG;
    tip.style.display = '';
    if (!surface.place(tip, page, at.x, at.y)) tip.style.display = 'none';
    tip.style.transform = `${tip.style.transform} translate(14px, 14px)`;
  };
  const hideTip = () => {
    tip.style.display = 'none';
  };

  /** Where a group on the move would be pinned (or how far it turns). */
  const balloonTipText = (m: BalloonMove): string => {
    if (m.rotate !== m.rotate0) return `${Math.round(m.rotate * 10) / 10}°`;
    const at = pinAfterMove(m.panel, m.centre, m.delta);
    return label('comicBalloonPin').replace('__x__', percentText(at.x * 100)).replace('__y__', percentText(at.y * 100));
  };

  const placeTip = (page: number, at: VDTPoint, lines: string[], warn: boolean): void => {
    tip.textContent = lines.join('\n');
    tip.style.whiteSpace = 'pre-line';
    tip.style.background = warn ? TIP_WARN_BG : TIP_BG;
    tip.dataset.warn = warn ? 'true' : 'false';
    tip.style.display = '';
    if (!surface.place(tip, page, at.x, at.y)) tip.style.display = 'none';
    tip.style.transform = `${tip.style.transform} translate(14px, 14px)`;
  };

  /** A group on the move: where it would be pinned, and what it would
   *  cover or leave there. */
  const showBalloonTip = (m: BalloonMove, at: VDTPoint): void => {
    const issues = dropIssues(m);
    const lines = [balloonTipText(m)];
    if (issues?.face) lines.push(label('comicBalloonCoversFace'));
    if (issues?.avoid) lines.push(label('comicBalloonCoversAvoid'));
    if (issues?.outside) lines.push(label('comicBalloonOutsidePanel'));
    placeTip(m.page, at, lines, issues !== null);
  };

  /** A tail on the move: where it would aim. */
  const showTailTip = (m: TailMove, at: VDTPoint): void => {
    const to = pageToTailTarget(m.panel, m.target);
    placeTip(m.page, at, [label('comicTailTo').replace('__x__', percentText(to.x * 100)).replace('__y__', percentText(to.y * 100))], false);
  };

  // -------------------------------------------------------------- toolbar

  const bar = document.createElement('div');
  bar.setAttribute('role', 'toolbar');
  bar.dataset.comicToolbar = '';
  Object.assign(bar.style, {
    position: 'absolute',
    zIndex: '7',
    display: 'none',
    gap: '2px',
    padding: '2px',
    borderRadius: '8px',
    background: 'var(--background, #fff)',
    color: 'var(--foreground, #0f172a)',
    border: '1px solid var(--pt-control-border, #94a3b8)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.18)',
    transformOrigin: '0 0',
  } satisfies Partial<CSSStyleDeclaration>);
  isolate(bar);
  const button = (kind: 'rows' | 'columns' | 'merge'): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.comicAction = kind;
    Object.assign(b.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '28px',
      height: '28px',
      padding: '0',
      border: 'none',
      borderRadius: '6px',
      background: 'transparent',
      color: 'inherit',
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);
    b.appendChild(icon(kind));
    b.addEventListener('pointerenter', () => { b.style.background = 'rgba(37, 99, 235, 0.12)'; });
    b.addEventListener('pointerleave', () => { b.style.background = 'transparent'; });
    bar.appendChild(b);
    return b;
  };
  const splitRowsBtn = button('rows');
  const splitColumnsBtn = button('columns');
  const mergeBtn = button('merge');
  host.appendChild(bar);
  let barPanel: { page: number; panel: VDTComicPanel; comic: VDTComicPage } | null = null;

  const hideBar = () => {
    bar.style.display = 'none';
    barPanel = null;
  };

  const showBar = (page: number, comic: VDTComicPage, panel: VDTComicPanel): void => {
    if (barPanel && barPanel.page === page && barPanel.panel === panel && bar.style.display !== 'none') return;
    const book = opts.sourceOfPage(page);
    if (!book || !canSplitPanel(book.markdown, comic, panel.index)) {
      hideBar();
      return;
    }
    barPanel = { page, panel, comic };
    const n = String(panel.index + 1);
    bar.setAttribute('aria-label', label('comicPanelToolbar').replace('__n__', n));
    for (const [b, k, shortcut] of [[splitRowsBtn, 'comicSplitHorizontal', 'H'], [splitColumnsBtn, 'comicSplitVertical', 'V'], [mergeBtn, 'comicMergeNext', 'M']] as const) {
      b.setAttribute('aria-label', label(k));
      b.setAttribute('aria-keyshortcuts', shortcut);
      b.title = `${label(k)} (${shortcut})`;
    }
    mergeBtn.style.display = canMergeNext(book.markdown, comic, panel.index) ? 'inline-flex' : 'none';
    bar.style.display = 'flex';
    const rtl = comic.direction === 'rtl';
    const corner = { x: rtl ? panel.bbox.x : panel.bbox.x + panel.bbox.width, y: panel.bbox.y };
    if (!surface.place(bar, page, corner.x, corner.y)) {
      hideBar();
      return;
    }
    bar.style.transform = `${bar.style.transform} translate(${rtl ? '4px' : 'calc(-100% - 4px)'}, 4px)`;
  };

  // --------------------------------------------------------------- commit

  /** Hand a source edit of a page to the chapter it belongs to. */
  const commit = (page: number, comic: VDTComicPage, changes: TextChange[] | null): void => {
    if (!changes || changes.length === 0) return;
    const book = opts.sourceOfPage(page);
    if (!book || book.segments.length === 0) return;
    const seg = segmentAtOffset(book, comic.sourceStart);
    if (changes.some((c) => c.from < seg.start || c.to > seg.end)) return;
    applyViewerEdit(dispatchRef.current, seg.chapterId, shiftTextChanges(changes, -seg.start), seg.end - seg.start);
  };

  const commitLine = (page: number, comicStart: number, s: VDTComicSplitter, pos: SplitterPosition): void => {
    const comic = comicOf(page, comicStart);
    const book = opts.sourceOfPage(page);
    if (!comic || !book) return;
    if (Math.abs(pos.start - s.startPercent) < 0.05 && Math.abs(pos.end - s.endPercent) < 0.05) return;
    const slanted = Math.abs(pos.end - pos.start) > 0.05 || Math.abs(s.endPercent - s.startPercent) > 0.05;
    commit(page, comic, moveSplitterChanges(book.markdown, comic, s, pos.start, slanted ? pos.end : undefined));
  };

  /** The script line of a group's first balloon in its page's source. */
  const balloonLine = (page: number, comic: VDTComicPage, first: VDTComicBalloon) => {
    const book = opts.sourceOfPage(page);
    if (!book) return null;
    const item = comicBalloonItem(book.markdown, comic, first.sourceStart);
    return item ? { book, item } : null;
  };

  /** A group to move: its members, its panel and the centre the move
   *  carries; null when its line cannot be found in the source. */
  const balloonMove = (page: number, comic: VDTComicPage, b: VDTComicBalloon): BalloonMove | null => {
    const members = balloonGroup(comic, b);
    const first = members[0];
    const panel = first ? balloonPanel(comic, first) : null;
    if (!first || !panel) return null;
    const line = balloonLine(page, comic, first);
    if (!line) return null;
    const rotate = first.rotate ?? 0;
    const keepOut = balloonKeepOut(panel, resourceOf(panel.art?.resourceId), balloonEm(first));
    return {
      page, comic, members, panel,
      centre: balloonGrabCentre(panel, first, line.item.at),
      box: groupBox(members),
      delta: { x: 0, y: 0 },
      rotate,
      rotate0: rotate,
      keepOut,
      breakBorder: line.item.break === true,
    };
  };

  /** Write where a group was moved (or how far it was turned). */
  const commitBalloon = (m: BalloonMove): void => {
    const comic = comicOf(m.page, m.comic.sourceStart);
    if (!comic) return;
    const line = balloonLine(m.page, comic, m.members[0]!);
    if (!line) return;
    if (Math.abs(m.rotate - m.rotate0) >= 0.05) {
      commit(m.page, comic, rotateLineChanges(line.book.markdown, line.item, m.rotate));
      return;
    }
    if (Math.hypot(m.delta.x, m.delta.y) < 1e-6) return;
    commit(m.page, comic, pinLineChanges(line.book.markdown, line.item, pinAfterMove(m.panel, m.centre, m.delta)));
  };

  /** Where a balloon's tail handle goes: its tip, else (a target the
   *  lettering drew no tail to, too close to the body) its written `to`;
   *  undefined for a balloon with neither. */
  const tailHandlePoint = (page: number, comic: VDTComicPage, b: VDTComicBalloon): VDTPoint | undefined => {
    if (b.tailTip) return b.tailTip;
    const panel = balloonPanel(comic, b);
    const to = panel ? balloonLine(page, comic, b)?.item.to : undefined;
    return panel && to ? pinToPage(panel, to) : undefined;
  };

  /** A tail to move: the balloon that carries it, its panel and where it
   *  aims now (its `to`, else its speaker's mouth, else its tip). */
  const tailMove = (page: number, comic: VDTComicPage, b: VDTComicBalloon): TailMove | null => {
    const panel = balloonPanel(comic, b);
    const line = panel ? balloonLine(page, comic, b) : null;
    if (!panel || !line) return null;
    const tip = b.tailTip ?? (line.item.to ? pinToPage(panel, line.item.to) : undefined);
    if (!tip) return null;
    const anchor = line.item.speaker ? resourceOf(panel.art?.resourceId)?.anchors?.find((a) => a.id === line.item.speaker) : undefined;
    const from = tailTargetNow(panel, tip, line.item.to, anchor ? { x: anchor.x, y: anchor.y } : undefined);
    return { page, comic, balloon: b, panel, from, target: from };
  };

  /** Where a tail would aim at a sheet point: on its panel's picture (or
   *  cell), as written. */
  const tailTargetAt = (panel: VDTComicPanel, p: VDTPoint): VDTPoint => pinToPage(panel, pageToTailTarget(panel, p));

  /** Write where a tail aims. */
  const commitTail = (m: TailMove): void => {
    const comic = comicOf(m.page, m.comic.sourceStart);
    if (!comic) return;
    if (Math.hypot(m.target.x - m.from.x, m.target.y - m.from.y) < 1e-6) return;
    const line = balloonLine(m.page, comic, m.balloon);
    if (!line) return;
    commit(m.page, comic, tailLineChanges(line.book.markdown, line.item, pageToTailTarget(m.panel, m.target)));
  };

  /** Point a tail back at its speaker (`to` taken off); false when its
   *  line has none. */
  const untail = (page: number, comic: VDTComicPage, b: VDTComicBalloon): boolean => {
    const line = balloonLine(page, comic, b);
    const changes = line ? untailLineChanges(line.book.markdown, line.item) : null;
    if (!changes) return false;
    commit(page, comic, changes);
    return true;
  };

  /** Take a group's pin off; false when its line has none. */
  const unpinBalloon = (page: number, comic: VDTComicPage, b: VDTComicBalloon): boolean => {
    const first = balloonGroup(comic, b)[0] ?? b;
    const line = balloonLine(page, comic, first);
    const changes = line ? unpinLineChanges(line.book.markdown, line.item) : null;
    if (!changes) return false;
    commit(page, comic, changes);
    return true;
  };

  /** Split or merge a panel; with `focusAfter`, its handle takes the focus
   *  back once the pages are drawn again. */
  const panelEdit = (target: { page: number; panel: VDTComicPanel; comic: VDTComicPage }, kind: 'rows' | 'columns' | 'merge', focusAfter = false): void => {
    const book = opts.sourceOfPage(target.page);
    if (!book) return;
    if (kind === 'merge' && !canMergeNext(book.markdown, target.comic, target.panel.index)) return;
    const changes = kind === 'merge'
      ? mergePanelChanges(book.markdown, target.comic, target.panel.index)
      : splitPanelChanges(book.markdown, target.comic, target.panel.index, kind);
    if (focusAfter && changes && changes.length > 0) refocus = { key: panelKey(target.comic, target.panel), until: Date.now() + 8000 };
    commit(target.page, target.comic, changes);
  };

  const panelAction = (kind: 'rows' | 'columns' | 'merge', fromKeyboard = false): void => {
    const target = barPanel;
    hideBar();
    if (!target) return;
    panelEdit(target, kind, fromKeyboard || barFromHandle);
    hover = null;
    repaint();
  };
  splitRowsBtn.addEventListener('click', (ev) => panelAction('rows', ev.detail === 0));
  splitColumnsBtn.addEventListener('click', (ev) => panelAction('columns', ev.detail === 0));
  mergeBtn.addEventListener('click', (ev) => panelAction('merge', ev.detail === 0));
  /** The toolbar was opened from a panel's handle (Enter): Escape goes
   *  back to it. */
  let barFromHandle = false;
  bar.addEventListener('keydown', (ev) => {
    const action = panelKeyAction(ev);
    if (action) {
      if (action === 'merge' && mergeBtn.style.display === 'none') return;
      ev.preventDefault();
      ev.stopPropagation();
      panelAction(action, true);
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      const target = barPanel;
      hideBar();
      if (target) {
        const h = handles.querySelector<HTMLElement>(`[data-comic-panel="${panelKey(target.comic, target.panel)}"]`);
        h?.focus({ preventScroll: true });
      }
    }
  });
  bar.addEventListener('focusout', (ev) => {
    if (!bar.contains(ev.relatedTarget as Node | null)) barFromHandle = false;
  });

  // ------------------------------------------------------- keyboard handles

  const handles = document.createElement('div');
  handles.dataset.comicHandles = '';
  Object.assign(handles.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' } satisfies Partial<CSSStyleDeclaration>);
  host.appendChild(handles);
  const hintId = `pt-comic-hint-${++hintCount}`;
  const hiddenHint = (id: string): HTMLSpanElement => {
    const el = document.createElement('span');
    el.id = id;
    el.hidden = true;
    handles.appendChild(el);
    return el;
  };
  const hint = hiddenHint(hintId);
  const balloonHintId = `${hintId}-balloon`;
  const balloonHint = hiddenHint(balloonHintId);
  const tailHintId = `${hintId}-tail`;
  const tailHint = hiddenHint(tailHintId);
  const panelHintId = `${hintId}-panel`;
  const panelHint = hiddenHint(panelHintId);
  let handlesKey = '';

  /** A 24 px focusable handle at a sheet point, with a ring while it has
   *  the focus (the handles are invisible otherwise). */
  const makeHandle = (page: number, at: VDTPoint, role: string): { h: HTMLElement; place: () => void } => {
    const h = document.createElement('div');
    h.setAttribute('role', role);
    h.dataset.page = String(page);
    Object.assign(h.style, {
      position: 'absolute',
      width: '24px',
      height: '24px',
      borderRadius: '12px',
      pointerEvents: 'none',
      transformOrigin: '0 0',
      outline: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    const place = () => {
      if (surface.place(h, page, at.x, at.y)) h.style.transform = `${h.style.transform} translate(-50%, -50%)`;
    };
    place();
    h.addEventListener('focus', () => {
      h.style.boxShadow = FOCUS_RING;
    });
    h.addEventListener('blur', () => {
      h.style.boxShadow = '';
    });
    return { h, place };
  };

  /** Focus the balloon or tail handle whose key is `value`. */
  const focusHandle = (attr: 'comicBalloon' | 'comicTail', value: string): boolean => {
    const el = [...handles.querySelectorAll<HTMLElement>('[data-comic-balloon], [data-comic-tail]')].find((e) => e.dataset[attr] === value);
    if (!el) return false;
    el.focus({ preventScroll: true });
    return true;
  };

  const isKeyT = (ev: KeyboardEvent) => !ev.ctrlKey && !ev.metaKey && !ev.altKey && (ev.key.toLowerCase() === 't' || ev.code === 'KeyT');
  const arrowOf = (ev: KeyboardEvent): VDTPoint | undefined =>
    ({ ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } } as Record<string, VDTPoint>)[ev.key];

  /** The handle of a balloon group: Tab reaches it, the arrow keys move
   *  the group (1 % of the picture, Shift 5 %), Enter pins it there,
   *  Escape puts it back, Delete unpins it, `T` goes to its tail. */
  const balloonHandleFor = (page: number, comic: VDTComicPage, members: VDTComicBalloon[], i: number, total: number, tailed: VDTComicBalloon | undefined): HTMLElement => {
    const first = members[0]!;
    const comicStart = comic.sourceStart;
    const { h, place } = makeHandle(page, boxCentre(first.bbox), 'button');
    h.tabIndex = 0;
    h.setAttribute('aria-label', label('comicBalloonLabel').replace('__n__', String(i + 1)).replace('__total__', String(total)).replace('__text__', balloonText(members)));
    h.setAttribute('aria-describedby', balloonHintId);
    h.setAttribute('aria-keyshortcuts', `ArrowLeft ArrowRight ArrowUp ArrowDown Enter Escape Delete${tailed ? ' T' : ''}`);
    const id = balloonKey(comic, first);
    h.dataset.comicBalloon = id;
    /** The group as the current document lays it out. */
    const live = (): { comic: VDTComicPage; b: VDTComicBalloon } | null => {
      const c = comicOf(page, comicStart);
      const b = c?.balloons.find((o) => o.sourceStart === first.sourceStart);
      return c && b ? { comic: c, b } : null;
    };
    h.addEventListener('focus', () => {
      place();
      const l = live();
      if (!l) return;
      bfocused = { page, members: balloonGroup(l.comic, l.b) };
      repaint();
    });
    h.addEventListener('blur', () => {
      if (bfocused && bfocused.members[0]?.sourceStart === first.sourceStart) bfocused = null;
      bkey = null;
      hideTip();
      repaint();
    });
    h.addEventListener('keydown', (ev) => {
      const l = live();
      if (!l || !enabled()) return;
      const dir = arrowOf(ev);
      if (dir) {
        ev.preventDefault();
        ev.stopPropagation();
        const m = bkey ?? balloonMove(page, l.comic, l.b);
        if (!m) return;
        const step = nudgeDelta(m.panel, dir, ev.shiftKey ? BALLOON_NUDGE_SHIFT_PERCENT : BALLOON_NUDGE_PERCENT);
        const want = { x: m.centre.x + m.delta.x + step.x, y: m.centre.y + m.delta.y + step.y };
        bkey = { ...m, delta: dragBalloon(m.centre, m.centre, want, m.panel.bbox, { box: m.box }) };
        repaint();
        showBalloonTip(bkey, { x: bkey.centre.x + bkey.delta.x, y: bkey.centre.y + bkey.delta.y });
        return;
      }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        if (!bkey) return;
        refocus = { key: id, until: Date.now() + 8000 };
        const m = bkey;
        bkey = null;
        hideTip();
        commitBalloon(m);
        repaint();
        return;
      }
      if (ev.key === 'Escape' && bkey) {
        ev.preventDefault();
        ev.stopPropagation();
        bkey = null;
        hideTip();
        repaint();
        return;
      }
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        ev.stopPropagation();
        bkey = null;
        hideTip();
        refocus = { key: id, until: Date.now() + 8000 };
        unpinBalloon(page, l.comic, l.b);
        repaint();
        return;
      }
      if (tailed && isKeyT(ev)) {
        ev.preventDefault();
        ev.stopPropagation();
        focusHandle('comicTail', tailKey(comic, tailed));
      }
    });
    return h;
  };

  /** The handle of a balloon's tail (reached with `T` from the balloon's
   *  handle, not by Tab): the arrow keys move where it aims (1 % of the
   *  picture, Shift 5 %), Enter writes `to`, Escape puts it back (then
   *  goes back to the balloon), Delete takes `to` off, `T` goes back to
   *  the balloon. */
  const tailHandleFor = (page: number, comic: VDTComicPage, b: VDTComicBalloon, tip: VDTPoint, members: VDTComicBalloon[], i: number, total: number): HTMLElement => {
    const comicStart = comic.sourceStart;
    const { h, place } = makeHandle(page, tip, 'button');
    h.tabIndex = -1;
    h.setAttribute('aria-label', label('comicTailLabel').replace('__n__', String(i + 1)).replace('__total__', String(total)).replace('__text__', balloonText(members)));
    h.setAttribute('aria-describedby', tailHintId);
    h.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Enter Escape Delete T');
    const id = tailKey(comic, b);
    h.dataset.comicTail = id;
    const back = () => focusHandle('comicBalloon', balloonKey(comic, members[0]!));
    const live = (): { comic: VDTComicPage; b: VDTComicBalloon } | null => {
      const c = comicOf(page, comicStart);
      const o = c?.balloons.find((x) => x.sourceStart === b.sourceStart);
      return c && o ? { comic: c, b: o } : null;
    };
    h.addEventListener('focus', () => {
      place();
      const l = live();
      if (!l) return;
      tfocused = { page, comic: l.comic, balloon: l.b, tip: tailHandlePoint(page, l.comic, l.b) ?? tip };
      repaint();
    });
    h.addEventListener('blur', () => {
      if (tfocused?.balloon.sourceStart === b.sourceStart) tfocused = null;
      tkey = null;
      hideTip();
      repaint();
    });
    h.addEventListener('keydown', (ev) => {
      const l = live();
      if (!l || !enabled()) return;
      const dir = arrowOf(ev);
      if (dir) {
        ev.preventDefault();
        ev.stopPropagation();
        const m = tkey ?? tailMove(page, l.comic, l.b);
        if (!m) return;
        const step = nudgeDelta(m.panel, dir, ev.shiftKey ? BALLOON_NUDGE_SHIFT_PERCENT : BALLOON_NUDGE_PERCENT);
        tkey = { ...m, target: tailTargetAt(m.panel, { x: m.target.x + step.x, y: m.target.y + step.y }) };
        repaint();
        showTailTip(tkey, tkey.target);
        return;
      }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        if (!tkey) return;
        refocus = { key: id, until: Date.now() + 8000 };
        const m = tkey;
        tkey = null;
        hideTip();
        commitTail(m);
        repaint();
        return;
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        if (tkey) {
          tkey = null;
          hideTip();
          repaint();
        } else back();
        return;
      }
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        ev.stopPropagation();
        tkey = null;
        hideTip();
        refocus = { key: id, until: Date.now() + 8000 };
        untail(page, l.comic, l.b);
        repaint();
        return;
      }
      if (isKeyT(ev)) {
        ev.preventDefault();
        ev.stopPropagation();
        back();
      }
    });
    return h;
  };

  /** The handle of a panel that fills a cell: `H` splits it with a
   *  horizontal line, `V` with a vertical one, `M` merges it with the next
   *  panel; Enter opens its toolbar. Its outline and toolbar show while it
   *  has the focus. */
  const panelHandleFor = (page: number, comic: VDTComicPage, panel: VDTComicPanel, i: number, total: number, canMerge: boolean): HTMLElement => {
    const comicStart = comic.sourceStart;
    const rtl = comic.direction === 'rtl';
    // Near the panel's first corner, clear of its border.
    const inset = Math.min(18 * surface.sheetPxPerCssPx(page), panel.bbox.width / 2, panel.bbox.height / 2);
    const corner = { x: rtl ? panel.bbox.x + panel.bbox.width - inset : panel.bbox.x + inset, y: panel.bbox.y + inset };
    const { h, place } = makeHandle(page, corner, 'button');
    h.tabIndex = 0;
    h.setAttribute('aria-label', label('comicPanelLabel').replace('__n__', String(i + 1)).replace('__total__', String(total)));
    h.setAttribute('aria-describedby', panelHintId);
    h.setAttribute('aria-keyshortcuts', canMerge ? 'H V M Enter' : 'H V Enter');
    h.setAttribute('aria-haspopup', 'true');
    const id = panelKey(comic, panel);
    h.dataset.comicPanel = id;
    const live = (): { comic: VDTComicPage; panel: VDTComicPanel } | null => {
      const c = comicOf(page, comicStart);
      const p = c?.panels.find((o) => o.index === panel.index);
      return c && p ? { comic: c, panel: p } : null;
    };
    h.addEventListener('focus', () => {
      place();
      const l = live();
      if (!l) return;
      pfocused = { page, panel: l.panel };
      showBar(page, l.comic, l.panel);
      repaint();
    });
    h.addEventListener('blur', (ev) => {
      if (pfocused?.panel.index === panel.index) pfocused = null;
      if (!bar.contains(ev.relatedTarget as Node | null)) hideBar();
      repaint();
    });
    h.addEventListener('keydown', (ev) => {
      const l = live();
      if (!l || !enabled()) return;
      const action = panelKeyAction(ev);
      if (action) {
        ev.preventDefault();
        ev.stopPropagation();
        panelEdit({ page, comic: l.comic, panel: l.panel }, action, true);
        return;
      }
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        ev.stopPropagation();
        showBar(page, l.comic, l.panel);
        if (bar.style.display !== 'none') {
          barFromHandle = true;
          splitRowsBtn.focus({ preventScroll: true });
        }
      }
    });
    return h;
  };

  const handleFor = (page: number, comic: VDTComicPage, s: VDTComicSplitter, i: number, total: number): HTMLElement => {
    const comicStart = comic.sourceStart;
    const { h, place } = makeHandle(page, { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }, 'separator');
    h.tabIndex = 0;
    h.setAttribute('aria-orientation', splitterCursor(s) === 'row-resize' ? 'horizontal' : 'vertical');
    h.setAttribute('aria-label', label('comicSplitterLabel').replace('__n__', String(i + 1)).replace('__total__', String(total)));
    h.setAttribute('aria-describedby', hintId);
    h.dataset.comicSplitter = splitterKey(comic, s);
    const setValue = (pos: SplitterPosition) => {
      h.setAttribute('aria-valuenow', String(Math.round(pos.start * 10) / 10));
      h.setAttribute('aria-valuetext', pos.end !== pos.start ? `${percentText(pos.start)} – ${percentText(pos.end)}` : percentText(pos.start));
    };
    h.setAttribute('aria-valuemin', String(Math.round(s.min * 10) / 10));
    h.setAttribute('aria-valuemax', String(Math.round(s.max * 10) / 10));
    setValue({ start: s.startPercent, end: s.endPercent });
    h.addEventListener('focus', () => {
      place();
      const live = current(page, comicStart, s);
      if (!live) return;
      focused = { page, splitter: live };
      repaint();
    });
    h.addEventListener('blur', () => {
      if (focused?.splitter && splitterKey(comic, focused.splitter) === h.dataset.comicSplitter) focused = null;
      key = null;
      hideTip();
      repaint();
    });
    h.addEventListener('keydown', (ev) => {
      const live = current(page, comicStart, s);
      const pageComic = comicOf(page, comicStart);
      if (!live || !pageComic || !enabled()) return;
      const rows = live.axis === 'rows';
      const rtl = pageComic.direction === 'rtl';
      let delta = 0;
      if (rows && ev.key === 'ArrowUp') delta = -1;
      else if (rows && ev.key === 'ArrowDown') delta = 1;
      else if (!rows && ev.key === 'ArrowLeft') delta = rtl ? 1 : -1;
      else if (!rows && ev.key === 'ArrowRight') delta = rtl ? -1 : 1;
      const from = key?.pos ?? { start: live.startPercent, end: live.endPercent };
      if (delta !== 0 || ev.key === 'Home' || ev.key === 'End') {
        ev.preventDefault();
        ev.stopPropagation();
        const step = ev.shiftKey ? 5 : 1;
        const d = ev.key === 'Home' ? -100 : ev.key === 'End' ? 100 : delta * step;
        const pos = nudgeSplitter(pageComic, live, from, d);
        key = { page, comicStart, splitter: live, pos };
        setValue(pos);
        repaint();
        showTip(page, splitterLine(pageComic, live, pos).a, pos, live);
        return;
      }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        if (!key) return;
        refocus = { key: h.dataset.comicSplitter!, until: Date.now() + 8000 };
        const pos = key.pos;
        key = null;
        hideTip();
        commitLine(page, comicStart, live, pos);
        repaint();
        return;
      }
      if (ev.key === 'Escape' && key) {
        ev.preventDefault();
        ev.stopPropagation();
        key = null;
        setValue({ start: live.startPercent, end: live.endPercent });
        hideTip();
        repaint();
      }
    });
    return h;
  };

  /** A handle's key, whichever kind it is. */
  const handleKey = (el: HTMLElement): string | undefined => el.dataset.comicSplitter ?? el.dataset.comicBalloon ?? el.dataset.comicTail ?? el.dataset.comicPanel;

  const sync = (): void => {
    if (disposed) return;
    const doc = docRef.current;
    const pages = doc ? surface.pages().filter((p) => doc.pages[p] && comicsOf(p).length > 0) : [];
    const books = new Map(pages.map((p) => [p, opts.sourceOfPage(p)] as const));
    const sig = pages.map((p) => `${p}~${books.get(p)?.markdown.length ?? -1}` + comicsOf(p).map((c) =>
      `@${c.sourceStart}:${c.splitters.map((s) => `${s.path.join('.')}/${s.boundary}=${s.startPercent},${s.endPercent},${s.a.x.toFixed(1)},${s.a.y.toFixed(1)}`).join(';')}`
      + `#${c.panels.map((q) => `${q.sourceStart}/${q.bbox.x.toFixed(1)},${q.bbox.y.toFixed(1)},${q.bbox.width.toFixed(1)}`).join(';')}`
      + `#${c.balloons.map((b) => `${b.sourceStart}/${b.group}=${b.bbox.x.toFixed(1)},${b.bbox.y.toFixed(1)}${b.tailTip ? `>${b.tailTip.x.toFixed(1)},${b.tailTip.y.toFixed(1)}` : ''}`).join(';')}`).join('&')).join('|');
    if (sig === handlesKey) return;
    handlesKey = sig;
    // Marks of balloons laid out before are stale: the outline under the
    // pointer comes back with its next move, a focused group is read again.
    let stale = false;
    if (hover?.balloons || hover?.tail || hover?.panel) {
      hover = null;
      stale = true;
    }
    if (bfocused) {
      const first = bfocused.members[0];
      const hit = first ? comicsOf(bfocused.page).flatMap((c) => c.balloons.filter((o) => o.sourceStart === first.sourceStart).map((b) => ({ c, b })))[0] : undefined;
      bfocused = hit ? { page: bfocused.page, members: balloonGroup(hit.c, hit.b) } : null;
      stale = true;
    }
    if (tfocused || pfocused) {
      // Read again when their handles take the focus back below.
      tfocused = null;
      pfocused = null;
      stale = true;
    }
    // The HTML pages live in a shadow root: its own active element.
    const root = handles.getRootNode() as Document | ShadowRoot;
    const active = root.activeElement ?? null;
    const hadFocus = active && handles.contains(active) ? handleKey(active as HTMLElement) : undefined;
    const idle = document.activeElement === null || document.activeElement === document.body;
    for (const el of [...handles.querySelectorAll('[data-comic-splitter], [data-comic-balloon], [data-comic-tail], [data-comic-panel]')]) el.remove();
    hint.textContent = label('comicSplitterHint');
    balloonHint.textContent = label('comicBalloonHint');
    tailHint.textContent = label('comicTailHint');
    panelHint.textContent = label('comicPanelHint');
    const want = hadFocus ?? (refocus && refocus.until > Date.now() ? refocus.key : undefined);
    const append = (h: HTMLElement): void => {
      handles.appendChild(h);
      if (want && handleKey(h) === want && (idle || hadFocus)) {
        refocus = null;
        h.focus({ preventScroll: true });
      }
    };
    for (const p of pages) {
      const book = books.get(p);
      for (const comic of comicsOf(p)) {
        // In reading order: the split lines, the panels, the balloons (each
        // followed by its tail, which `T` reaches).
        comic.splitters.forEach((s, i) => append(handleFor(p, comic, s, i, comic.splitters.length)));
        if (book) {
          const editable = comic.panels.filter((q) => canSplitPanel(book.markdown, comic, q.index));
          editable.forEach((q, i) => append(panelHandleFor(p, comic, q, i, editable.length, canMergeNext(book.markdown, comic, q.index))));
        }
        // One handle per join group, in reading order.
        const groups: VDTComicBalloon[][] = [];
        for (const b of comic.balloons) {
          const g = balloonGroup(comic, b);
          if (g[0] === b) groups.push(g);
        }
        groups.forEach((g, i) => {
          // The tail: the balloon that carries it, else the first one when
          // its line names a target the lettering drew no tail to.
          const tailed = g.find((b) => b.tailTip) ?? g[0]!;
          const tip = tailHandlePoint(p, comic, tailed);
          append(balloonHandleFor(p, comic, g, i, groups.length, tip ? tailed : undefined));
          if (tip) append(tailHandleFor(p, comic, tailed, tip, g, i, groups.length));
        });
      }
    }
    if (stale) repaint();
  };
  if (typeof queueMicrotask === 'function') queueMicrotask(sync);
  const entry = { host, sync };
  liveEditors.add(entry);
  editorOfHost.set(host, {
    dispose: () => {
      disposed = true;
      liveEditors.delete(entry);
      for (const el of [tip, bar, handles]) el.remove();
    },
  });
  host.addEventListener('pointerenter', sync);
  host.addEventListener('focusin', (ev) => {
    if (!handles.contains(ev.target as Node)) sync();
  });

  // ------------------------------------------------------------- pointer

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || (!drag && !bdrag && !tdrag)) return;
    ev.preventDefault();
    if (tdrag) endTailDrag(true);
    else if (bdrag) endBalloonDrag(true);
    else endDrag(true);
  };

  const endDrag = (cancel: boolean): void => {
    const d = drag;
    if (!d) return;
    drag = null;
    window.removeEventListener('keydown', onKey, true);
    opts.onDragEnd?.(d.pointerId);
    hideTip();
    if (!cancel && d.moved) commitLine(d.page, d.comic.sourceStart, d.splitter, d.pos);
    repaint();
  };

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  /** A plain click on a balloon or a tail: true when it is the second of a
   *  double click on the same thing (the first is remembered). */
  const secondClick = (tapKey: string, page: number, grab: VDTPoint): boolean => {
    const t = now();
    const near = (l: NonNullable<typeof lastTap>) => Math.hypot(l.x - grab.x, l.y - grab.y) < 8 * surface.sheetPxPerCssPx(page);
    if (lastTap && lastTap.key === tapKey && t - lastTap.time < DOUBLE_CLICK_MS && near(lastTap)) {
      lastTap = null;
      return true;
    }
    lastTap = { key: tapKey, time: t, x: grab.x, y: grab.y };
    return false;
  };

  /** A balloon drag ends: written when it moved (one edit), else it was a
   *  click, and the second of a double click unpins. Returns whether the
   *  press was the tools' (false: a plain click, the text's). */
  const endBalloonDrag = (cancel: boolean): boolean => {
    const d = bdrag;
    if (!d) return false;
    bdrag = null;
    window.removeEventListener('keydown', onKey, true);
    opts.onDragEnd?.(d.pointerId);
    hideTip();
    let consumed = d.moved || cancel;
    if (d.moved) hover = null;
    if (!cancel && d.moved) {
      lastTap = null;
      commitBalloon(d);
    } else if (!cancel && secondClick(balloonKey(d.comic, d.members[0]!), d.page, d.grab)) {
      consumed = unpinBalloon(d.page, d.comic, d.members[0]!);
    }
    repaint();
    return consumed;
  };

  /** A tail drag ends: `to` written when it moved, else a click, and the
   *  second of a double click takes `to` off. */
  const endTailDrag = (cancel: boolean): boolean => {
    const d = tdrag;
    if (!d) return false;
    tdrag = null;
    window.removeEventListener('keydown', onKey, true);
    opts.onDragEnd?.(d.pointerId);
    hideTip();
    let consumed = d.moved || cancel;
    if (d.moved) hover = null;
    if (!cancel && d.moved) {
      lastTap = null;
      commitTail(d);
    } else if (!cancel && secondClick(tailKey(d.comic, d.balloon), d.page, d.grab)) {
      consumed = untail(d.page, d.comic, d.balloon);
    }
    repaint();
    return consumed;
  };

  /** What lies under a point, when the tools are on. */
  const hitAt = (at: ComicPointer | null): ComicHit | null => {
    if (!at || !enabled()) return null;
    const comics = comicsOf(at.pageIndex);
    if (comics.length === 0) return null;
    return comicHitAt(comics, at.x, at.y, { band: minBand(at.pageIndex), tipRadius: tipRadius(at.pageIndex) });
  };

  const textOptions = (page: number) => ({
    slop: GLYPH_SLOP_SCREEN_PX * surface.sheetPxPerCssPx(page),
    ...(opts.measure ? { measure: opts.measure } : {}),
  });
  /** What a press under a point does (#594, #595): the hit refined to a
   *  balloon's words (`text`) or a panel's picture (`art`). */
  const pressAt = (at: ComicPointer | null): ComicPress | null => {
    if (!at || !enabled()) return null;
    const comics = comicsOf(at.pageIndex);
    if (comics.length === 0) return null;
    return comicPressAt(comics, at.x, at.y, {
      band: minBand(at.pageIndex),
      tipRadius: tipRadius(at.pageIndex),
      text: textOptions(at.pageIndex),
      opaque: opts.artOpacity ?? registryArtOpacity,
    });
  };

  const clearHover = (): void => {
    if (!hover) return;
    hover = null;
    hideBar();
    repaint();
  };

  return {
    pointerDown(ev, at) {
      const hit = hitAt(at);
      if (!hit || !at) return false;
      const page = at.pageIndex;
      const grab = { x: at.x, y: at.y };
      if (hit.kind === 'tail') {
        const m = tailMove(page, hit.comic, hit.balloon);
        if (!m) return false;
        hideBar();
        sync();
        tdrag = { ...m, grab, pointerId: ev.pointerId, moved: false };
        window.addEventListener('keydown', onKey, true);
        repaint();
        return true;
      }
      // Balloons lie over the borders and gutters: they are grabbed before
      // the split lines.
      if (hit.kind === 'balloon') {
        // On its words, the press selects text (#595); round them, it
        // grabs the balloon.
        if (pressAt(at)?.kind === 'text') return false;
        const m = balloonMove(page, hit.comic, hit.balloon);
        if (!m) return false;
        hideBar();
        sync();
        bdrag = { ...m, grab, pointerId: ev.pointerId, moved: false, turning: false };
        window.addEventListener('keydown', onKey, true);
        repaint();
        return true;
      }
      if (hit.kind !== 'splitter') return false;
      const s = hit.splitter;
      hideBar();
      sync();
      drag = { page, comic: hit.comic, splitter: s, grab, pointerId: ev.pointerId, pos: { start: s.startPercent, end: s.endPercent }, moved: false };
      window.addEventListener('keydown', onKey, true);
      repaint();
      return true;
    },
    hover(ev, at) {
      if (!enabled() || !at) {
        clearHover();
        return null;
      }
      // Over the toolbar: keep it as it is.
      if (bar.contains(ev.target as Node)) return 'default';
      const hit = hitAt(at);
      const page = at.pageIndex;
      if (!hit) {
        clearHover();
        // A cut-out breaking a panel's border opens its picture.
        return pressAt(at)?.kind === 'art' ? 'pointer' : null;
      }
      if (hit.kind === 'tail') {
        const changed = hover?.page !== page || hover?.tail !== hit.balloon;
        hover = { page, tail: hit.balloon };
        hideBar();
        if (changed) repaint();
        return 'crosshair';
      }
      if (hit.kind === 'balloon') {
        const members = balloonGroup(hit.comic, hit.balloon);
        const changed = hover?.page !== page || hover?.balloons?.[0] !== members[0];
        hover = { page, balloons: members };
        hideBar();
        if (changed) repaint();
        // Its words select text; the rest of it drags.
        return pressAt(at)?.kind === 'text' ? 'text' : 'move';
      }
      const s = hit.kind === 'splitter' ? hit.splitter : null;
      const panel = hit.kind === 'panel' ? hit.panel : null;
      const changed = hover?.page !== page || hover?.balloons !== undefined || hover?.tail !== undefined || hover?.splitter !== (s ?? undefined) || hover?.panel !== (panel ?? undefined);
      hover = s ? { page, splitter: s } : panel ? { page, panel } : null;
      if (s) hideBar();
      else if (panel) showBar(page, hit.comic, panel);
      if (changed) repaint();
      // A panel's picture opens in the Resources panel on a click (#594).
      return s ? splitterCursor(s) : pressAt(at)?.kind === 'art' ? 'pointer' : null;
    },
    dragMove(ev, at) {
      const td = tdrag;
      if (td) {
        if (ev.pointerId !== td.pointerId || !at || at.pageIndex !== td.page) return;
        ev.preventDefault();
        const pointer = { x: at.x, y: at.y };
        if (!td.moved && Math.hypot(pointer.x - td.grab.x, pointer.y - td.grab.y) < BALLOON_DRAG_THRESHOLD_PX * surface.sheetPxPerCssPx(td.page)) return;
        td.moved = true;
        td.target = tailTargetAt(td.panel, pointer);
        repaint();
        showTailTip(td, pointer);
        return;
      }
      const bd = bdrag;
      if (bd) {
        if (ev.pointerId !== bd.pointerId || !at || at.pageIndex !== bd.page) return;
        ev.preventDefault();
        const pointer = { x: at.x, y: at.y };
        if (!bd.moved && Math.hypot(pointer.x - bd.grab.x, pointer.y - bd.grab.y) < BALLOON_DRAG_THRESHOLD_PX * surface.sheetPxPerCssPx(bd.page)) return;
        bd.moved = true;
        // Alt turns a sound effect about its centre instead of moving it.
        bd.turning = ev.altKey && bd.members.length === 1 && isSoundEffect(bd.members[0]!);
        if (bd.turning) {
          bd.delta = { x: 0, y: 0 };
          bd.rotate = turnAngle(boxCentre(bd.members[0]!.bbox), bd.grab, pointer, bd.rotate0, ev.shiftKey);
        } else {
          bd.rotate = bd.rotate0;
          bd.delta = dragBalloon(bd.centre, bd.grab, pointer, bd.panel.bbox, { axisLock: ev.shiftKey, box: bd.box });
        }
        repaint();
        showBalloonTip(bd, pointer);
        return;
      }
      const d = drag;
      if (!d || ev.pointerId !== d.pointerId || !at || at.pageIndex !== d.page) return;
      ev.preventDefault();
      const pos = dragSplitter(d.comic, d.splitter, d.grab, { x: at.x, y: at.y }, { snap: ev.shiftKey, oneEnd: ev.altKey });
      d.moved = d.moved || Math.abs(pos.start - d.splitter.startPercent) >= 0.05 || Math.abs(pos.end - d.splitter.endPercent) >= 0.05;
      d.pos = pos;
      repaint();
      if (d.moved) showTip(d.page, { x: at.x, y: at.y }, pos, d.splitter);
    },
    pointerUp(ev, cancel = false) {
      if (tdrag) {
        if (ev.pointerId !== tdrag.pointerId) return true;
        return endTailDrag(cancel);
      }
      if (bdrag) {
        if (ev.pointerId !== bdrag.pointerId) return true;
        return endBalloonDrag(cancel);
      }
      if (!drag || ev.pointerId !== drag.pointerId) return true;
      endDrag(cancel);
      return true;
    },
    balloonSourceAt(at) {
      const press = pressAt(at);
      if (press?.kind === 'text') return press.offset;
      return press?.kind === 'balloon' || press?.kind === 'tail' ? press.balloon.sourceStart : null;
    },
    balloonText(at) {
      const press = pressAt(at);
      if (!at || press?.kind !== 'text') return null;
      const { balloon } = press;
      const page = at.pageIndex;
      return {
        offset: press.offset,
        // The head stays in the words pressed: past them, their nearest
        // line and end.
        head: (p) => (p && p.pageIndex === page ? balloonTextNearest(balloon, p.x, p.y, textOptions(page)) : null),
      };
    },
    panelArtAt(at) {
      const press = pressAt(at);
      return press?.kind === 'art' ? press.art.resourceId : null;
    },
    dragging: () => drag !== null || bdrag !== null || tdrag !== null,
    onSplitter(at) {
      return hitAt(at)?.kind === 'splitter';
    },
    leave() {
      if (drag || bdrag || tdrag) return;
      hover = null;
      // A panel whose handle has the focus keeps its toolbar.
      if (!pfocused) hideBar();
      if (!key && !bkey && !tkey) hideTip();
      repaint();
    },
    sync,
  };
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

/** Append the marks to an SVG group whose units are sheet px. */
export function drawMarksSvg(group: SVGGElement, marks: readonly ComicMark[], cssToSheet: number): void {
  while (group.firstChild) group.removeChild(group.firstChild);
  for (const m of marks) {
    const el = document.createElementNS(SVG_NS, m.closed ? 'polygon' : 'polyline');
    el.setAttribute('points', m.points.map((p) => `${p.x},${p.y}`).join(' '));
    el.setAttribute('fill', m.closed && m.fill ? m.fill : 'none');
    if (m.stroke) {
      el.setAttribute('stroke', m.stroke);
      el.setAttribute('stroke-width', String((m.width ?? 1) * cssToSheet));
      if (m.dash) el.setAttribute('stroke-dasharray', m.dash.map((d) => d * cssToSheet).join(' '));
      el.setAttribute('stroke-linejoin', 'round');
    }
    group.appendChild(el);
  }
}

/** Draw the marks on a 2D context whose units are sheet px. */
export function drawMarksCanvas(ctx: CanvasRenderingContext2D, marks: readonly ComicMark[], cssToSheet: number): void {
  for (const m of marks) {
    if (m.points.length === 0) continue;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(m.points[0]!.x, m.points[0]!.y);
    for (const p of m.points.slice(1)) ctx.lineTo(p.x, p.y);
    if (m.closed) ctx.closePath();
    if (m.closed && m.fill) {
      ctx.fillStyle = m.fill;
      ctx.fill();
    }
    if (m.stroke) {
      ctx.strokeStyle = m.stroke;
      ctx.lineWidth = (m.width ?? 1) * cssToSheet;
      ctx.setLineDash(m.dash ? m.dash.map((d) => d * cssToSheet) : []);
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * The surface of one page slot of the canvas or the HTML preview: an SVG
 * layer over the page (sheet px) for the marks, the slot itself for the
 * floating parts, placed in percent of the page so a zoom keeps them on
 * their points.
 */
export function slotComicSurface(slot: HTMLElement, pageIndex: number, pageWidthPx: number, pageHeightPx: number): ComicSurface {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${pageWidthPx} ${pageHeightPx}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.role = 'comicMarks';
  Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '5' } satisfies Partial<CSSStyleDeclaration>);
  const group = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(group);
  let attached = false;
  const cssToSheet = () => {
    const w = slot.getBoundingClientRect().width;
    return w > 0 ? pageWidthPx / w : 1;
  };
  return {
    host: slot,
    pages: () => [pageIndex],
    paint(page, marks) {
      if (page !== pageIndex) return;
      if (!marks || marks.length === 0) {
        while (group.firstChild) group.removeChild(group.firstChild);
        return;
      }
      if (!attached || svg.parentNode !== slot) {
        slot.appendChild(svg);
        attached = true;
      }
      drawMarksSvg(group, marks, cssToSheet());
    },
    place(el, page, x, y) {
      if (page !== pageIndex) return false;
      el.style.left = `${(x / pageWidthPx) * 100}%`;
      el.style.top = `${(y / pageHeightPx) * 100}%`;
      // The HTML pages are zoomed with a transform: undo it on the floating
      // part so it keeps its size.
      const rect = slot.getBoundingClientRect();
      const k = slot.offsetWidth > 0 && rect.width > 0 ? rect.width / slot.offsetWidth : 1;
      el.style.transform = Math.abs(k - 1) > 0.01 ? `scale(${1 / k})` : '';
      return true;
    },
    sheetPxPerCssPx: () => cssToSheet(),
  };
}
