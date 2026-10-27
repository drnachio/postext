// The comic editor's pointer side: ending drags, double clicks, hits,
// balloon text presses and hover (#1276: split out of comicEditing.ts).
import type { VDTDocument, VDTPoint, VDTComicPage, VDTComicSplitter, VDTComicBalloon } from 'postext';
import { DOUBLE_CLICK_MS, balloonKey, tailKey, GLYPH_SLOP_SCREEN_PX } from './helpers.js';
import type { ComicPointer, ComicEditOptions, ComicSurface } from './types.js';
import { type ComicHit, comicHitAt, type ComicPress, comicPressAt } from '../comicHit.js';
import { documentShapingLanguage } from '../../../controls/language/measureLanguage.js';
import { comicTextFrameAt, sheetToFlow } from '../../composed/frameHit.js';
import { registryArtOpacity } from '../artAlpha.js';
import type { SplitterPosition } from '../comicDrag.js';
import type { BalloonMove, TailMove } from '../comicEdits.js';
import type { ComicEditorState } from './state.js';

/** What createComicPointer takes from the comic editor. */
export interface ComicPointerDeps {
  opts: ComicEditOptions;
  surface: ComicSurface;
  docRef: React.MutableRefObject<VDTDocument | null>;
  enabled: () => boolean;
  textEnabled: () => boolean;
  comicsOf: (page: number) => VDTComicPage[];
  minBand: (page: number) => number;
  tipRadius: (page: number) => number;
  repaint: () => void;
  hideTip: () => void;
  hideBar: () => void;
  commitLine: (page: number, comicStart: number, s: VDTComicSplitter, pos: SplitterPosition) => void;
  commitBalloon: (m: BalloonMove) => void;
  commitTail: (m: TailMove) => void;
  untail: (page: number, comic: VDTComicPage, b: VDTComicBalloon) => boolean;
  unpinBalloon: (page: number, comic: VDTComicPage, b: VDTComicBalloon) => boolean;
  state: ComicEditorState;
}

export function createComicPointer(deps: ComicPointerDeps) {
  const {
    opts, surface, docRef, enabled, textEnabled, comicsOf, minBand, tipRadius, repaint, hideTip,
    hideBar, commitLine, commitBalloon, commitTail, untail, unpinBalloon, state
  } = deps;
  // ------------------------------------------------------------- pointer

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || (!state.drag && !state.bdrag && !state.tdrag)) return;
    ev.preventDefault();
    if (state.tdrag) endTailDrag(true);
    else if (state.bdrag) endBalloonDrag(true);
    else endDrag(true);
  };

  const endDrag = (cancel: boolean): void => {
    const d = state.drag;
    if (!d) return;
    state.drag = null;
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
    const near = (l: NonNullable<typeof state.lastTap>) => Math.hypot(l.x - grab.x, l.y - grab.y) < 8 * surface.sheetPxPerCssPx(page);
    if (state.lastTap && state.lastTap.key === tapKey && t - state.lastTap.time < DOUBLE_CLICK_MS && near(state.lastTap)) {
      state.lastTap = null;
      return true;
    }
    state.lastTap = { key: tapKey, time: t, x: grab.x, y: grab.y };
    return false;
  };

  /** A balloon drag ends: written when it moved (one edit), else it was a
   *  click, and the second of a double click unpins. Returns whether the
   *  press was the tools' (false: a plain click, the text's). */
  const endBalloonDrag = (cancel: boolean): boolean => {
    const d = state.bdrag;
    if (!d) return false;
    state.bdrag = null;
    window.removeEventListener('keydown', onKey, true);
    opts.onDragEnd?.(d.pointerId);
    hideTip();
    let consumed = d.moved || cancel;
    if (d.moved) state.hover = null;
    if (!cancel && d.moved) {
      state.lastTap = null;
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
    const d = state.tdrag;
    if (!d) return false;
    state.tdrag = null;
    window.removeEventListener('keydown', onKey, true);
    opts.onDragEnd?.(d.pointerId);
    hideTip();
    let consumed = d.moved || cancel;
    if (d.moved) state.hover = null;
    if (!cancel && d.moved) {
      state.lastTap = null;
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

  const textOptions = (page: number) => {
    // The words are measured in the language the lettering was measured
    // in and the page paints it in (#770).
    const lang = docRef.current ? documentShapingLanguage(docRef.current) : undefined;
    return {
      slop: GLYPH_SLOP_SCREEN_PX * surface.sheetPxPerCssPx(page),
      ...(opts.measure ? { measure: opts.measure } : {}),
      ...(lang !== undefined ? { lang } : {}),
    };
  };
  /** What a press under a point does (#594, #595): the hit refined to a
   *  balloon's words (`text`) or a panel's picture (`art`). */
  /** Whether a point lies on the words of a text panel (#885): one of the
   *  blocks its frame holds, past the frame's own box. */
  const onComicText = (at: ComicPointer): boolean => {
    const page = docRef.current?.pages[at.pageIndex];
    const frame = page ? comicTextFrameAt(page, at.x, at.y) : null;
    if (!page || !frame) return false;
    const ids = new Set(frame.blockIds.slice(1));
    // Its blocks are in the page's flow frame (#909).
    const p = sheetToFlow(page, at.x, at.y);
    return (page.floats ?? []).some((b) => ids.has(b.id) && p.x >= b.bbox.x && p.x <= b.bbox.x + b.bbox.width && p.y >= b.bbox.y && p.y <= b.bbox.y + b.bbox.height);
  };

  const pressAt = (at: ComicPointer | null): ComicPress | null => {
    if (!at || !textEnabled()) return null;
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
    if (!state.hover) return;
    state.hover = null;
    hideBar();
    repaint();
  };
  return {
    onKey, endDrag, endBalloonDrag, endTailDrag, hitAt, textOptions, onComicText, pressAt,
    clearHover
  };
}
