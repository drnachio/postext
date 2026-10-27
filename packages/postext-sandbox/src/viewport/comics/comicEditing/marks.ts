// The marks the comic editor paints: splitters, moving panels, balloons and
// tails, and the repaint of every page (#1276: split out of comicEditing.ts).
import { type VDTDocument, type VDTComicPage, pageComics, type VDTComicSplitter, type VDTComicBalloon, type VDTPoint } from 'postext';
import { comicBySource } from '../comicHit.js';
import { SPLITTER_HIT_MIN_SCREEN_PX, splitterBand, type SplitterPosition, movedPanels, letterboxedPanels, splitterLine } from '../comicDrag.js';
import { TAIL_HIT_SCREEN_PX, balloonGhost, type BalloonDropIssues, boxCentre, rotateAbout, ellipseExit } from '../balloonDrag.js';
import { samePath, ACCENT_BAND, ACCENT, WARN_FILL, ACCENT_CELL, WARN_STROKE, GHOST_FILL, ring } from './helpers.js';
import type { ComicMark, ComicEditOptions, ComicSurface } from './types.js';
import { type BalloonMove, moveDropIssues, type TailMove } from '../comicEdits.js';
import type { ComicEditorState } from './state.js';

/** What createComicMarks takes from the comic editor. */
export interface ComicMarksDeps {
  opts: ComicEditOptions;
  surface: ComicSurface;
  docRef: React.MutableRefObject<VDTDocument | null>;
  painted: Set<number>;
  state: ComicEditorState;
}

export function createComicMarks(deps: ComicMarksDeps) {
  const {
    opts, surface, docRef, painted, state
  } = deps;
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
  const dropIssues = (m: BalloonMove): BalloonDropIssues | null => moveDropIssues(m, surface.sheetPxPerCssPx(m.page));

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

  state.lastLetterboxed = [];

  const repaint = (): void => {
    const byPage = new Map<number, ComicMark[]>();
    const add = (page: number, marks: ComicMark[]) => byPage.set(page, [...(byPage.get(page) ?? []), ...marks]);
    state.lastLetterboxed = [];
    if (state.tdrag) {
      if (state.tdrag.moved) add(state.tdrag.page, movingTailMarks(state.tdrag));
      else add(state.tdrag.page, tailMarks(state.tdrag.page, state.tdrag.balloon.tailTip, true));
    } else if (state.tkey) {
      add(state.tkey.page, movingTailMarks(state.tkey));
    } else if (state.bdrag) {
      if (state.bdrag.moved) add(state.bdrag.page, movingBalloonMarks(state.bdrag));
      else add(state.bdrag.page, balloonMarks(state.bdrag.members, true));
    } else if (state.bkey) {
      add(state.bkey.page, movingBalloonMarks(state.bkey));
    } else if (state.drag) {
      const r = movingMarks(state.drag.page, state.drag.comic, state.drag.splitter, state.drag.pos);
      add(state.drag.page, r.marks);
      state.lastLetterboxed = r.letterboxed;
    } else if (state.key) {
      const comic = comicOf(state.key.page, state.key.comicStart);
      if (comic) {
        const r = movingMarks(state.key.page, comic, state.key.splitter, state.key.pos);
        add(state.key.page, r.marks);
        state.lastLetterboxed = r.letterboxed;
      }
    } else {
      if (state.focused) add(state.focused.page, splitterMarks(state.focused.page, state.focused.splitter, true));
      if (state.bfocused) add(state.bfocused.page, balloonMarks(state.bfocused.members, true));
      if (state.tfocused) add(state.tfocused.page, tailMarks(state.tfocused.page, state.tfocused.tip, true));
      if (state.pfocused) add(state.pfocused.page, [{ points: state.pfocused.panel.polygon, closed: true, fill: ACCENT_CELL, stroke: ACCENT, width: 2 }]);
      if (state.hover?.tail) add(state.hover.page, tailMarks(state.hover.page, state.hover.tail.tailTip, false));
      else if (state.hover?.balloons) add(state.hover.page, balloonMarks(state.hover.balloons, false));
      else if (state.hover?.splitter) add(state.hover.page, splitterMarks(state.hover.page, state.hover.splitter, false));
      else if (state.hover?.panel) add(state.hover.page, [{ points: state.hover.panel.polygon, closed: true, stroke: ACCENT, width: 1, dash: [6, 4] }]);
    }
    for (const page of painted) if (!byPage.has(page)) surface.paint(page, null);
    painted.clear();
    for (const [page, marks] of byPage) {
      surface.paint(page, marks);
      painted.add(page);
    }
  };
  return {
    comicsOf, comicOf, minBand, tipRadius, current, dropIssues, repaint
  };
}
