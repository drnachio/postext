// The splitter's keyboard handle and the sync that keeps every handle in
// step with the pages shown (#1276: split out of comicEditing.ts).
import type { VDTDocument, VDTComicPage, VDTComicSplitter, VDTComicBalloon, VDTPoint, VDTComicPanel } from 'postext';
import { splitterCursor, type SplitterPosition, nudgeSplitter, splitterLine } from '../comicDrag.js';
import { splitterKey, percentText } from './helpers.js';
import { shared } from './shared.js';
import { balloonGroup } from '../balloonDrag.js';
import { canSplitPanel, canMergeNext } from '../comicSource.js';
import type { ComicEditOptions, ComicSurface } from './types.js';
import type { SandboxLabels } from '../../../types/labels.js';
import type { ComicEditorState } from './state.js';

/** What createHandleSync takes from the comic editor. */
export interface HandleSyncDeps {
  opts: ComicEditOptions;
  surface: ComicSurface;
  docRef: React.MutableRefObject<VDTDocument | null>;
  enabled: () => boolean;
  label: (key: keyof SandboxLabels) => string;
  comicsOf: (page: number) => VDTComicPage[];
  comicOf: (page: number, start: number) => VDTComicPage | null;
  current: (page: number, comicStart: number, s: Pick<VDTComicSplitter, "path" | "boundary">) => VDTComicSplitter | null;
  repaint: () => void;
  showTip: (page: number, at: VDTPoint, pos: SplitterPosition, s: VDTComicSplitter) => void;
  hideTip: () => void;
  commitLine: (page: number, comicStart: number, s: VDTComicSplitter, pos: SplitterPosition) => void;
  tailHandlePoint: (page: number, comic: VDTComicPage, b: VDTComicBalloon) => VDTPoint | undefined;
  handles: HTMLDivElement;
  hintId: string;
  hint: HTMLSpanElement;
  balloonHint: HTMLSpanElement;
  tailHint: HTMLSpanElement;
  panelHint: HTMLSpanElement;
  makeHandle: (page: number, at: VDTPoint, role: string) => { h: HTMLElement; place: () => void; };
  balloonHandleFor: (page: number, comic: VDTComicPage, members: VDTComicBalloon[], i: number, total: number, tailed: VDTComicBalloon | undefined) => HTMLElement;
  tailHandleFor: (page: number, comic: VDTComicPage, b: VDTComicBalloon, tip: VDTPoint, members: VDTComicBalloon[], i: number, total: number) => HTMLElement;
  panelHandleFor: (page: number, comic: VDTComicPage, panel: VDTComicPanel, i: number, total: number, canMerge: boolean) => HTMLElement;
  state: ComicEditorState;
}

export function createHandleSync(deps: HandleSyncDeps) {
  const {
    opts, surface, docRef, enabled, label, comicsOf, comicOf, current, repaint, showTip, hideTip,
    commitLine, tailHandlePoint, handles, hintId, hint, balloonHint, tailHint, panelHint, makeHandle,
    balloonHandleFor, tailHandleFor, panelHandleFor, state
  } = deps;
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
      state.focused = { page, splitter: live };
      repaint();
    });
    h.addEventListener('blur', () => {
      if (state.focused?.splitter && splitterKey(comic, state.focused.splitter) === h.dataset.comicSplitter) state.focused = null;
      state.key = null;
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
      const from = state.key?.pos ?? { start: live.startPercent, end: live.endPercent };
      if (delta !== 0 || ev.key === 'Home' || ev.key === 'End') {
        ev.preventDefault();
        ev.stopPropagation();
        const step = ev.shiftKey ? 5 : 1;
        const d = ev.key === 'Home' ? -100 : ev.key === 'End' ? 100 : delta * step;
        const pos = nudgeSplitter(pageComic, live, from, d);
        state.key = { page, comicStart, splitter: live, pos };
        setValue(pos);
        repaint();
        showTip(page, splitterLine(pageComic, live, pos).a, pos, live);
        return;
      }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        if (!state.key) return;
        shared.refocus = { key: h.dataset.comicSplitter!, until: Date.now() + 8000 };
        const pos = state.key.pos;
        state.key = null;
        hideTip();
        commitLine(page, comicStart, live, pos);
        repaint();
        return;
      }
      if (ev.key === 'Escape' && state.key) {
        ev.preventDefault();
        ev.stopPropagation();
        state.key = null;
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
    if (state.disposed) return;
    const doc = docRef.current;
    const pages = doc ? surface.pages().filter((p) => doc.pages[p] && comicsOf(p).length > 0) : [];
    const books = new Map(pages.map((p) => [p, opts.sourceOfPage(p)] as const));
    const sig = pages.map((p) => `${p}~${books.get(p)?.markdown.length ?? -1}` + comicsOf(p).map((c) =>
      `@${c.sourceStart}:${c.splitters.map((s) => `${s.path.join('.')}/${s.boundary}=${s.startPercent},${s.endPercent},${s.a.x.toFixed(1)},${s.a.y.toFixed(1)}`).join(';')}`
      + `#${c.panels.map((q) => `${q.sourceStart}/${q.bbox.x.toFixed(1)},${q.bbox.y.toFixed(1)},${q.bbox.width.toFixed(1)}`).join(';')}`
      + `#${c.balloons.map((b) => `${b.sourceStart}/${b.group}=${b.bbox.x.toFixed(1)},${b.bbox.y.toFixed(1)}${b.tailTip ? `>${b.tailTip.x.toFixed(1)},${b.tailTip.y.toFixed(1)}` : ''}`).join(';')}`).join('&')).join('|');
    if (sig === state.handlesKey) return;
    state.handlesKey = sig;
    // Marks of balloons laid out before are stale: the outline under the
    // pointer comes back with its next move, a focused group is read again.
    let stale = false;
    if (state.hover?.balloons || state.hover?.tail || state.hover?.panel) {
      state.hover = null;
      stale = true;
    }
    if (state.bfocused) {
      const first = state.bfocused.members[0];
      const hit = first ? comicsOf(state.bfocused.page).flatMap((c) => c.balloons.filter((o) => o.sourceStart === first.sourceStart).map((b) => ({ c, b })))[0] : undefined;
      state.bfocused = hit ? { page: state.bfocused.page, members: balloonGroup(hit.c, hit.b) } : null;
      stale = true;
    }
    if (state.tfocused || state.pfocused) {
      // Read again when their handles take the focus back below.
      state.tfocused = null;
      state.pfocused = null;
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
    const want = hadFocus ?? (shared.refocus && shared.refocus.until > Date.now() ? shared.refocus.key : undefined);
    const append = (h: HTMLElement): void => {
      handles.appendChild(h);
      if (want && handleKey(h) === want && (idle || hadFocus)) {
        shared.refocus = null;
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
  return {
    sync
  };
}
