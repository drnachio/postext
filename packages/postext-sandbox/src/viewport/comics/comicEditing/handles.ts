// The comic editor's keyboard handles: the layer and hints they use and the
// handle of a balloon group (#1276: split out of comicEditing.ts).
import { shared } from './shared.js';
import type { VDTPoint, VDTComicPage, VDTComicBalloon } from 'postext';
import { FOCUS_RING, balloonText, balloonKey, tailKey } from './helpers.js';
import { boxCentre, balloonGroup, nudgeDelta, BALLOON_NUDGE_SHIFT_PERCENT, BALLOON_NUDGE_PERCENT, dragBalloon } from '../balloonDrag.js';
import type { ComicSurface } from './types.js';
import type { SandboxLabels } from '../../../types/labels.js';
import type { BalloonMove } from '../comicEdits.js';
import type { ComicEditorState } from './state.js';

/** What createComicHandles takes from the comic editor. */
export interface ComicHandlesDeps {
  surface: ComicSurface;
  host: HTMLElement;
  enabled: () => boolean;
  label: (key: keyof SandboxLabels) => string;
  comicOf: (page: number, start: number) => VDTComicPage | null;
  repaint: () => void;
  hideTip: () => void;
  showBalloonTip: (m: BalloonMove, at: VDTPoint) => void;
  balloonMove: (page: number, comic: VDTComicPage, b: VDTComicBalloon) => BalloonMove | null;
  commitBalloon: (m: BalloonMove) => void;
  unpinBalloon: (page: number, comic: VDTComicPage, b: VDTComicBalloon) => boolean;
  state: ComicEditorState;
}

export function createComicHandles(deps: ComicHandlesDeps) {
  const {
    surface, host, enabled, label, comicOf, repaint, hideTip, showBalloonTip, balloonMove,
    commitBalloon, unpinBalloon, state
  } = deps;
  // ------------------------------------------------------- keyboard handles

  const handles = document.createElement('div');
  handles.dataset.comicHandles = '';
  Object.assign(handles.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' } satisfies Partial<CSSStyleDeclaration>);
  host.appendChild(handles);
  const hintId = `pt-comic-hint-${++shared.hintCount}`;
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
  state.handlesKey = '';

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
      state.bfocused = { page, members: balloonGroup(l.comic, l.b) };
      repaint();
    });
    h.addEventListener('blur', () => {
      if (state.bfocused && state.bfocused.members[0]?.sourceStart === first.sourceStart) state.bfocused = null;
      state.bkey = null;
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
        const m = state.bkey ?? balloonMove(page, l.comic, l.b);
        if (!m) return;
        const step = nudgeDelta(m.panel, dir, ev.shiftKey ? BALLOON_NUDGE_SHIFT_PERCENT : BALLOON_NUDGE_PERCENT);
        const want = { x: m.centre.x + m.delta.x + step.x, y: m.centre.y + m.delta.y + step.y };
        state.bkey = { ...m, delta: dragBalloon(m.centre, m.centre, want, m.panel.bbox, { box: m.box }) };
        repaint();
        showBalloonTip(state.bkey, { x: state.bkey.centre.x + state.bkey.delta.x, y: state.bkey.centre.y + state.bkey.delta.y });
        return;
      }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        if (!state.bkey) return;
        shared.refocus = { key: id, until: Date.now() + 8000 };
        const m = state.bkey;
        state.bkey = null;
        hideTip();
        commitBalloon(m);
        repaint();
        return;
      }
      if (ev.key === 'Escape' && state.bkey) {
        ev.preventDefault();
        ev.stopPropagation();
        state.bkey = null;
        hideTip();
        repaint();
        return;
      }
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        ev.stopPropagation();
        state.bkey = null;
        hideTip();
        shared.refocus = { key: id, until: Date.now() + 8000 };
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
  return {
    handles, hintId, hint, balloonHint, tailHintId, tailHint, panelHintId, panelHint, makeHandle,
    focusHandle, isKeyT, arrowOf, balloonHandleFor
  };
}
