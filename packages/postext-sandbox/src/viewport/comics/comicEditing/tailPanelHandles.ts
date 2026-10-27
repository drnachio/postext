// The keyboard handles of a balloon's tail and of a panel (#1276: split out
// of comicEditing.ts).
import type { VDTComicPage, VDTComicBalloon, VDTPoint, VDTComicPanel } from 'postext';
import { balloonText, tailKey, balloonKey, panelKey } from './helpers.js';
import { nudgeDelta, BALLOON_NUDGE_SHIFT_PERCENT, BALLOON_NUDGE_PERCENT } from '../balloonDrag.js';
import { tailTargetAt, type TailMove } from '../comicEdits.js';
import { shared } from './shared.js';
import { panelKeyAction } from '../comicHit.js';
import type { ComicSurface } from './types.js';
import type { SandboxLabels } from '../../../types/labels.js';
import type { ComicEditorState } from './state.js';

/** What createTailPanelHandles takes from the comic editor. */
export interface TailPanelHandlesDeps {
  surface: ComicSurface;
  enabled: () => boolean;
  label: (key: keyof SandboxLabels) => string;
  comicOf: (page: number, start: number) => VDTComicPage | null;
  repaint: () => void;
  hideTip: () => void;
  showTailTip: (m: TailMove, at: VDTPoint) => void;
  bar: HTMLDivElement;
  splitRowsBtn: HTMLButtonElement;
  hideBar: () => void;
  showBar: (page: number, comic: VDTComicPage, panel: VDTComicPanel) => void;
  tailHandlePoint: (page: number, comic: VDTComicPage, b: VDTComicBalloon) => VDTPoint | undefined;
  tailMove: (page: number, comic: VDTComicPage, b: VDTComicBalloon) => TailMove | null;
  commitTail: (m: TailMove) => void;
  untail: (page: number, comic: VDTComicPage, b: VDTComicBalloon) => boolean;
  panelEdit: (target: { page: number; panel: VDTComicPanel; comic: VDTComicPage; }, kind: "rows" | "columns" | "merge", focusAfter?: boolean) => void;
  tailHintId: string;
  panelHintId: string;
  makeHandle: (page: number, at: VDTPoint, role: string) => { h: HTMLElement; place: () => void; };
  focusHandle: (attr: "comicBalloon" | "comicTail", value: string) => boolean;
  isKeyT: (ev: KeyboardEvent) => boolean;
  arrowOf: (ev: KeyboardEvent) => VDTPoint | undefined;
  state: ComicEditorState;
}

export function createTailPanelHandles(deps: TailPanelHandlesDeps) {
  const {
    surface, enabled, label, comicOf, repaint, hideTip, showTailTip, bar, splitRowsBtn, hideBar,
    showBar, tailHandlePoint, tailMove, commitTail, untail, panelEdit, tailHintId, panelHintId,
    makeHandle, focusHandle, isKeyT, arrowOf, state
  } = deps;
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
      state.tfocused = { page, comic: l.comic, balloon: l.b, tip: tailHandlePoint(page, l.comic, l.b) ?? tip };
      repaint();
    });
    h.addEventListener('blur', () => {
      if (state.tfocused?.balloon.sourceStart === b.sourceStart) state.tfocused = null;
      state.tkey = null;
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
        const m = state.tkey ?? tailMove(page, l.comic, l.b);
        if (!m) return;
        const step = nudgeDelta(m.panel, dir, ev.shiftKey ? BALLOON_NUDGE_SHIFT_PERCENT : BALLOON_NUDGE_PERCENT);
        state.tkey = { ...m, target: tailTargetAt(m.panel, { x: m.target.x + step.x, y: m.target.y + step.y }) };
        repaint();
        showTailTip(state.tkey, state.tkey.target);
        return;
      }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        if (!state.tkey) return;
        shared.refocus = { key: id, until: Date.now() + 8000 };
        const m = state.tkey;
        state.tkey = null;
        hideTip();
        commitTail(m);
        repaint();
        return;
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        if (state.tkey) {
          state.tkey = null;
          hideTip();
          repaint();
        } else back();
        return;
      }
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        ev.stopPropagation();
        state.tkey = null;
        hideTip();
        shared.refocus = { key: id, until: Date.now() + 8000 };
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
      state.pfocused = { page, panel: l.panel };
      showBar(page, l.comic, l.panel);
      repaint();
    });
    h.addEventListener('blur', (ev) => {
      if (state.pfocused?.panel.index === panel.index) state.pfocused = null;
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
          state.barFromHandle = true;
          splitRowsBtn.focus({ preventScroll: true });
        }
      }
    });
    return h;
  };
  return {
    tailHandleFor, panelHandleFor
  };
}
