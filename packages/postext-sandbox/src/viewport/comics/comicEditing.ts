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
 * it, Enter pins it, Delete unpins it.
 *
 * The controller is DOM-only and viewer-neutral: a `ComicSurface` says
 * where its floating parts go and paints its marks (an SVG layer over a
 * page slot, or the Folio's page decorations). The geometry is in
 * `comicDrag.ts`, the source edits in `comicSource.ts`.
 */

import type { Dispatch, MutableRefObject } from 'react';
import type { BoundingBox, Resource, VDTComicBalloon, VDTComicPage, VDTComicPanel, VDTComicSplitter, VDTDocument, VDTPoint } from 'postext';
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
  panelAt,
  splitterAt,
  splitterBand,
  splitterCursor,
  splitterLine,
  type SplitterPosition,
} from './comicDrag';
import { canMergeNext, canSplitPanel, mergePanelChanges, moveSplitterChanges, splitPanelChanges } from './comicSource';
import {
  BALLOON_NUDGE_PERCENT,
  BALLOON_NUDGE_SHIFT_PERCENT,
  balloonAt,
  balloonGhost,
  balloonGrabCentre,
  balloonGroup,
  balloonPanel,
  boxCentre,
  dragBalloon,
  groupBox,
  nudgeDelta,
  pinAfterMove,
  rotateAbout,
  turnAngle,
} from './balloonDrag';
import { comicBalloonItem, pinLineChanges, rotateLineChanges, unpinLineChanges } from './balloonSource';

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
}

/** A page point under the pointer. */
export interface ComicPointer {
  pageIndex: number;
  x: number;
  y: number;
}

export interface ComicEditor {
  /** A press: true when it grabbed a splitter or a balloon (the caller
   *  captures the pointer and leaves the text alone). */
  pointerDown(ev: PointerEvent, at: ComicPointer | null): boolean;
  /** A move while nothing is pressed: the resize cursor over a splitter,
   *  `move` over a balloon (null elsewhere), the panel toolbar over a
   *  panel. */
  hover(ev: PointerEvent, at: ComicPointer | null): string | null;
  /** A move while a splitter or a balloon is held. */
  dragMove(ev: PointerEvent, at: ComicPointer | null): void;
  /** The press ends: the line is written (or not, `cancel`). False when
   *  the press was a plain click on a balloon (it never moved): the click
   *  is then the text's (the caret goes to the balloon's line). A second
   *  click on a pinned balloon right after the first unpins it (the page
   *  gets no `dblclick`: the press's default is prevented). */
  pointerUp(ev: PointerEvent, cancel?: boolean): boolean;
  /** The source offset of the balloon under a point (its script line), for
   *  a click to put the caret there; null off the balloons. */
  balloonSourceAt(at: ComicPointer | null): number | null;
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
/** Screen px a press on a balloon travels before it is a drag (less is a
 *  click: the caret goes to its line). */
const BALLOON_DRAG_THRESHOLD_PX = 3;
/** The longest pause between the two clicks of a double click (ms). */
const DOUBLE_CLICK_MS = 450;

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
}

interface BalloonDrag extends BalloonMove {
  grab: VDTPoint;
  pointerId: number;
  moved: boolean;
  /** Alt on a sound effect: the drag turns it. */
  turning: boolean;
}

/** A balloon group's identity across relayouts: its page's comic and its
 *  first line (an edit of that line leaves its start where it was). */
function balloonKey(comic: VDTComicPage, first: Pick<VDTComicBalloon, 'sourceStart'>): string {
  return `b${comic.sourceStart}:${first.sourceStart}`;
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

  let hover: { page: number; splitter?: VDTComicSplitter; panel?: VDTComicPanel; balloons?: VDTComicBalloon[] } | null = null;
  let drag: DragState | null = null;
  let key: KeyState | null = null;
  let focused: { page: number; splitter: VDTComicSplitter } | null = null;
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

  const comicOf = (page: number): VDTComicPage | null => docRef.current?.pages[page]?.comic ?? null;
  const minBand = (page: number) => SPLITTER_HIT_MIN_SCREEN_PX * surface.sheetPxPerCssPx(page);
  /** The splitter of the current document at the same place in the tree. */
  const current = (page: number, s: Pick<VDTComicSplitter, 'path' | 'boundary'>): VDTComicSplitter | null =>
    comicOf(page)?.splitters.find((o) => o.boundary === s.boundary && samePath(o.path, s.path)) ?? null;

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

  /** A group on the move: where it was, dashed, and its ghost where it
   *  would go (turned, for a sound effect). */
  const movingBalloonMarks = (m: BalloonMove): ComicMark[] => {
    const marks: ComicMark[] = balloonGhost(m.members, { x: 0, y: 0 }).map((points) => ({ points, closed: true, stroke: ACCENT, width: 1, dash: [4, 4] }));
    const turn = m.rotate - m.rotate0;
    const pivot = boxCentre(m.members[0]!.bbox);
    const at = { x: pivot.x + m.delta.x, y: pivot.y + m.delta.y };
    for (const poly of balloonGhost(m.members, m.delta)) {
      marks.push({ points: turn ? poly.map((p) => rotateAbout(p, at, turn)) : poly, closed: true, fill: GHOST_FILL, stroke: ACCENT, width: 2 });
    }
    const c = { x: m.centre.x + m.delta.x, y: m.centre.y + m.delta.y };
    const r = 4 * surface.sheetPxPerCssPx(m.page);
    marks.push({ points: [{ x: c.x - r, y: c.y }, { x: c.x + r, y: c.y }], stroke: ACCENT, width: 1.5 });
    marks.push({ points: [{ x: c.x, y: c.y - r }, { x: c.x, y: c.y + r }], stroke: ACCENT, width: 1.5 });
    return marks;
  };

  let lastLetterboxed: number[] = [];

  const repaint = (): void => {
    const byPage = new Map<number, ComicMark[]>();
    const add = (page: number, marks: ComicMark[]) => byPage.set(page, [...(byPage.get(page) ?? []), ...marks]);
    lastLetterboxed = [];
    if (bdrag) {
      if (bdrag.moved) add(bdrag.page, movingBalloonMarks(bdrag));
      else add(bdrag.page, balloonMarks(bdrag.members, true));
    } else if (bkey) {
      add(bkey.page, movingBalloonMarks(bkey));
    } else if (drag) {
      const r = movingMarks(drag.page, drag.comic, drag.splitter, drag.pos);
      add(drag.page, r.marks);
      lastLetterboxed = r.letterboxed;
    } else if (key) {
      const comic = comicOf(key.page);
      if (comic) {
        const r = movingMarks(key.page, comic, key.splitter, key.pos);
        add(key.page, r.marks);
        lastLetterboxed = r.letterboxed;
      }
    } else {
      if (focused) add(focused.page, splitterMarks(focused.page, focused.splitter, true));
      if (bfocused) add(bfocused.page, balloonMarks(bfocused.members, true));
      if (hover?.balloons) add(hover.page, balloonMarks(hover.balloons, false));
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
    tip.style.background = lastLetterboxed.length > 0 ? 'rgba(154, 52, 18, 0.95)' : 'rgba(15, 23, 42, 0.92)';
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

  const showBalloonTip = (m: BalloonMove, at: VDTPoint): void => {
    tip.textContent = balloonTipText(m);
    tip.style.whiteSpace = 'pre-line';
    tip.style.background = 'rgba(15, 23, 42, 0.92)';
    tip.style.display = '';
    if (!surface.place(tip, m.page, at.x, at.y)) tip.style.display = 'none';
    tip.style.transform = `${tip.style.transform} translate(14px, 14px)`;
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
    for (const [b, k] of [[splitRowsBtn, 'comicSplitHorizontal'], [splitColumnsBtn, 'comicSplitVertical'], [mergeBtn, 'comicMergeNext']] as const) {
      b.setAttribute('aria-label', label(k));
      b.title = label(k);
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

  const commitLine = (page: number, s: VDTComicSplitter, pos: SplitterPosition): void => {
    const comic = comicOf(page);
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
    return { page, comic, members, panel, centre: balloonGrabCentre(panel, first, line.item.at), box: groupBox(members), delta: { x: 0, y: 0 }, rotate, rotate0: rotate };
  };

  /** Write where a group was moved (or how far it was turned). */
  const commitBalloon = (m: BalloonMove): void => {
    const comic = comicOf(m.page);
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

  /** Take a group's pin off; false when its line has none. */
  const unpinBalloon = (page: number, comic: VDTComicPage, b: VDTComicBalloon): boolean => {
    const first = balloonGroup(comic, b)[0] ?? b;
    const line = balloonLine(page, comic, first);
    const changes = line ? unpinLineChanges(line.book.markdown, line.item) : null;
    if (!changes) return false;
    commit(page, comic, changes);
    return true;
  };

  const panelAction = (kind: 'rows' | 'columns' | 'merge'): void => {
    const target = barPanel;
    hideBar();
    if (!target) return;
    const book = opts.sourceOfPage(target.page);
    if (!book) return;
    const changes = kind === 'merge'
      ? mergePanelChanges(book.markdown, target.comic, target.panel.index)
      : splitPanelChanges(book.markdown, target.comic, target.panel.index, kind);
    commit(target.page, target.comic, changes);
    hover = null;
    repaint();
  };
  splitRowsBtn.addEventListener('click', () => panelAction('rows'));
  splitColumnsBtn.addEventListener('click', () => panelAction('columns'));
  mergeBtn.addEventListener('click', () => panelAction('merge'));

  // ------------------------------------------------------- keyboard handles

  const handles = document.createElement('div');
  handles.dataset.comicHandles = '';
  Object.assign(handles.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' } satisfies Partial<CSSStyleDeclaration>);
  host.appendChild(handles);
  const hintId = `pt-comic-hint-${++hintCount}`;
  const hint = document.createElement('span');
  hint.id = hintId;
  hint.hidden = true;
  handles.appendChild(hint);
  const balloonHintId = `${hintId}-balloon`;
  const balloonHint = document.createElement('span');
  balloonHint.id = balloonHintId;
  balloonHint.hidden = true;
  handles.appendChild(balloonHint);
  let handlesKey = '';

  /** The handle of a balloon group: Tab reaches it, the arrow keys move
   *  the group (1 % of the picture, Shift 5 %), Enter pins it there,
   *  Escape puts it back, Delete unpins it. */
  const balloonHandleFor = (page: number, comic: VDTComicPage, members: VDTComicBalloon[], i: number, total: number): HTMLElement => {
    const first = members[0]!;
    const h = document.createElement('div');
    h.tabIndex = 0;
    h.setAttribute('role', 'button');
    h.setAttribute('aria-label', label('comicBalloonLabel').replace('__n__', String(i + 1)).replace('__total__', String(total)).replace('__text__', balloonText(members)));
    h.setAttribute('aria-describedby', balloonHintId);
    const id = balloonKey(comic, first);
    h.dataset.comicBalloon = id;
    h.dataset.page = String(page);
    Object.assign(h.style, {
      position: 'absolute',
      width: '24px',
      height: '24px',
      borderRadius: '12px',
      pointerEvents: 'none',
      transformOrigin: '0 0',
    } satisfies Partial<CSSStyleDeclaration>);
    const mid = boxCentre(first.bbox);
    const place = () => {
      if (surface.place(h, page, mid.x, mid.y)) h.style.transform = `${h.style.transform} translate(-50%, -50%)`;
    };
    place();
    /** The group as the current document lays it out. */
    const live = (): { comic: VDTComicPage; b: VDTComicBalloon } | null => {
      const c = comicOf(page);
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
      const dir = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }[ev.key];
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
      }
    });
    return h;
  };

  const handleFor = (page: number, comic: VDTComicPage, s: VDTComicSplitter, i: number, total: number): HTMLElement => {
    const h = document.createElement('div');
    h.tabIndex = 0;
    h.setAttribute('role', 'separator');
    h.setAttribute('aria-orientation', splitterCursor(s) === 'row-resize' ? 'horizontal' : 'vertical');
    h.setAttribute('aria-label', label('comicSplitterLabel').replace('__n__', String(i + 1)).replace('__total__', String(total)));
    h.setAttribute('aria-describedby', hintId);
    h.dataset.comicSplitter = splitterKey(comic, s);
    h.dataset.page = String(page);
    const setValue = (pos: SplitterPosition) => {
      h.setAttribute('aria-valuenow', String(Math.round(pos.start * 10) / 10));
      h.setAttribute('aria-valuetext', pos.end !== pos.start ? `${percentText(pos.start)} – ${percentText(pos.end)}` : percentText(pos.start));
    };
    h.setAttribute('aria-valuemin', String(Math.round(s.min * 10) / 10));
    h.setAttribute('aria-valuemax', String(Math.round(s.max * 10) / 10));
    setValue({ start: s.startPercent, end: s.endPercent });
    Object.assign(h.style, {
      position: 'absolute',
      width: '24px',
      height: '24px',
      borderRadius: '12px',
      pointerEvents: 'none',
      transformOrigin: '0 0',
    } satisfies Partial<CSSStyleDeclaration>);
    const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
    const place = () => {
      if (surface.place(h, page, mid.x, mid.y)) h.style.transform = `${h.style.transform} translate(-50%, -50%)`;
    };
    place();
    h.addEventListener('focus', () => {
      place();
      const live = current(page, s);
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
      const live = current(page, s);
      const pageComic = comicOf(page);
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
        key = { page, splitter: live, pos };
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
        commitLine(page, live, pos);
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

  const sync = (): void => {
    if (disposed) return;
    const doc = docRef.current;
    const pages = doc ? surface.pages().filter((p) => doc.pages[p]?.comic) : [];
    const sig = pages.map((p) => {
      const c = doc!.pages[p]!.comic!;
      return `${p}@${c.sourceStart}:${c.splitters.map((s) => `${s.path.join('.')}/${s.boundary}=${s.startPercent},${s.endPercent},${s.a.x.toFixed(1)},${s.a.y.toFixed(1)}`).join(';')}`
        + `#${c.balloons.map((b) => `${b.sourceStart}/${b.group}=${b.bbox.x.toFixed(1)},${b.bbox.y.toFixed(1)}`).join(';')}`;
    }).join('|');
    if (sig === handlesKey) return;
    handlesKey = sig;
    // Marks of balloons laid out before are stale: the outline under the
    // pointer comes back with its next move, a focused group is read again.
    let stale = false;
    if (hover?.balloons) {
      hover = null;
      stale = true;
    }
    if (bfocused) {
      const first = bfocused.members[0];
      const c = comicOf(bfocused.page);
      const b = first && c ? c.balloons.find((o) => o.sourceStart === first.sourceStart) : undefined;
      bfocused = b && c ? { page: bfocused.page, members: balloonGroup(c, b) } : null;
      stale = true;
    }
    // The HTML pages live in a shadow root: its own active element.
    const root = handles.getRootNode() as Document | ShadowRoot;
    const active = root.activeElement ?? null;
    const hadFocus = active && handles.contains(active) ? ((active as HTMLElement).dataset.comicSplitter ?? (active as HTMLElement).dataset.comicBalloon) : undefined;
    const idle = document.activeElement === null || document.activeElement === document.body;
    for (const el of [...handles.querySelectorAll('[data-comic-splitter], [data-comic-balloon]')]) el.remove();
    hint.textContent = label('comicSplitterHint');
    balloonHint.textContent = label('comicBalloonHint');
    const want = hadFocus ?? (refocus && refocus.until > Date.now() ? refocus.key : undefined);
    for (const p of pages) {
      const comic = doc!.pages[p]!.comic!;
      comic.splitters.forEach((s, i) => {
        const h = handleFor(p, comic, s, i, comic.splitters.length);
        handles.appendChild(h);
        if (want && h.dataset.comicSplitter === want && (idle || hadFocus)) {
          refocus = null;
          h.focus({ preventScroll: true });
        }
      });
      // One handle per join group, in reading order.
      const groups: VDTComicBalloon[][] = [];
      for (const b of comic.balloons) {
        const g = balloonGroup(comic, b);
        if (g[0] === b) groups.push(g);
      }
      groups.forEach((g, i) => {
        const h = balloonHandleFor(p, comic, g, i, groups.length);
        handles.appendChild(h);
        if (want && h.dataset.comicBalloon === want && (idle || hadFocus)) {
          refocus = null;
          h.focus({ preventScroll: true });
        }
      });
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
    if (ev.key !== 'Escape' || (!drag && !bdrag)) return;
    ev.preventDefault();
    if (bdrag) endBalloonDrag(true);
    else endDrag(true);
  };

  const endDrag = (cancel: boolean): void => {
    const d = drag;
    if (!d) return;
    drag = null;
    window.removeEventListener('keydown', onKey, true);
    opts.onDragEnd?.(d.pointerId);
    hideTip();
    if (!cancel && d.moved) commitLine(d.page, d.splitter, d.pos);
    repaint();
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
    } else if (!cancel) {
      const tapKey = balloonKey(d.comic, d.members[0]!);
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const near = (t: NonNullable<typeof lastTap>) => Math.hypot(t.x - d.grab.x, t.y - d.grab.y) < 8 * surface.sheetPxPerCssPx(d.page);
      if (lastTap && lastTap.key === tapKey && now - lastTap.time < DOUBLE_CLICK_MS && near(lastTap)) {
        lastTap = null;
        consumed = unpinBalloon(d.page, d.comic, d.members[0]!);
      } else {
        lastTap = { key: tapKey, time: now, x: d.grab.x, y: d.grab.y };
      }
    }
    repaint();
    return consumed;
  };

  /** The balloon under a point, when the tools are on. */
  const balloonUnder = (at: ComicPointer | null): { comic: VDTComicPage; b: VDTComicBalloon } | null => {
    if (!at || !enabled()) return null;
    const comic = comicOf(at.pageIndex);
    const b = comic ? balloonAt(comic, at.x, at.y) : null;
    return comic && b ? { comic, b } : null;
  };

  return {
    pointerDown(ev, at) {
      if (!enabled() || !at) return false;
      const comic = comicOf(at.pageIndex);
      if (!comic) return false;
      // Balloons lie over the borders and gutters: they are grabbed first.
      const b = balloonAt(comic, at.x, at.y);
      if (b) {
        const m = balloonMove(at.pageIndex, comic, b);
        if (!m) return false;
        hideBar();
        sync();
        bdrag = { ...m, grab: { x: at.x, y: at.y }, pointerId: ev.pointerId, moved: false, turning: false };
        window.addEventListener('keydown', onKey, true);
        repaint();
        return true;
      }
      const s = splitterAt(comic, at.x, at.y, minBand(at.pageIndex));
      if (!s) return false;
      hideBar();
      sync();
      drag = { page: at.pageIndex, comic, splitter: s, grab: { x: at.x, y: at.y }, pointerId: ev.pointerId, pos: { start: s.startPercent, end: s.endPercent }, moved: false };
      window.addEventListener('keydown', onKey, true);
      repaint();
      return true;
    },
    hover(ev, at) {
      if (!enabled() || !at) {
        if (hover) {
          hover = null;
          hideBar();
          repaint();
        }
        return null;
      }
      const comic = comicOf(at.pageIndex);
      if (!comic) {
        if (hover) {
          hover = null;
          hideBar();
          repaint();
        }
        return null;
      }
      // Over the toolbar: keep it as it is.
      if (bar.contains(ev.target as Node)) return 'default';
      const b = balloonAt(comic, at.x, at.y);
      if (b) {
        const members = balloonGroup(comic, b);
        const changed = hover?.page !== at.pageIndex || hover?.balloons?.[0] !== members[0];
        hover = { page: at.pageIndex, balloons: members };
        hideBar();
        if (changed) repaint();
        return 'move';
      }
      const s = splitterAt(comic, at.x, at.y, minBand(at.pageIndex));
      const panel = s ? null : panelAt(comic, at.x, at.y);
      const changed = hover?.page !== at.pageIndex || hover?.balloons !== undefined || hover?.splitter !== (s ?? undefined) || hover?.panel !== (panel ?? undefined);
      hover = s ? { page: at.pageIndex, splitter: s } : panel ? { page: at.pageIndex, panel } : null;
      if (s) hideBar();
      else if (panel) showBar(at.pageIndex, comic, panel);
      else hideBar();
      if (changed) repaint();
      return s ? splitterCursor(s) : null;
    },
    dragMove(ev, at) {
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
      if (bdrag) {
        if (ev.pointerId !== bdrag.pointerId) return true;
        return endBalloonDrag(cancel);
      }
      if (!drag || ev.pointerId !== drag.pointerId) return true;
      endDrag(cancel);
      return true;
    },
    balloonSourceAt(at) {
      return balloonUnder(at)?.b.sourceStart ?? null;
    },
    dragging: () => drag !== null || bdrag !== null,
    onSplitter(at) {
      if (!at || !enabled()) return false;
      const comic = comicOf(at.pageIndex);
      return comic !== null && splitterAt(comic, at.x, at.y, minBand(at.pageIndex)) !== null;
    },
    leave() {
      if (drag || bdrag) return;
      hover = null;
      hideBar();
      if (!key && !bkey) hideTip();
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
