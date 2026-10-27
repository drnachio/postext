// The comic editor's tooltip and panel toolbar: where they show and what
// they say (#1276: split out of comicEditing.ts).
import type { VDTPoint, VDTComicSplitter, VDTComicPanel, VDTComicPage } from 'postext';
import type { SplitterPosition } from '../comicDrag.js';
import { percentText, TIP_WARN_BG, TIP_BG, isolate, icon } from './helpers.js';
import type { BalloonMove, TailMove } from '../comicEdits.js';
import { pinAfterMove, pageToTailTarget, type BalloonDropIssues } from '../balloonDrag.js';
import { canSplitPanel, canMergeNext } from '../comicSource.js';
import type { ComicEditOptions, ComicSurface } from './types.js';
import type { SandboxLabels } from '../../../types/labels.js';
import type { ComicEditorState } from './state.js';

/** What createComicToolbar takes from the comic editor. */
export interface ComicToolbarDeps {
  opts: ComicEditOptions;
  surface: ComicSurface;
  host: HTMLElement;
  label: (key: keyof SandboxLabels) => string;
  dropIssues: (m: BalloonMove) => BalloonDropIssues | null;
  state: ComicEditorState;
}

export function createComicToolbar(deps: ComicToolbarDeps) {
  const {
    opts, surface, host, label, dropIssues, state
  } = deps;
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
    for (const index of state.lastLetterboxed) lines.push(label('comicLetterboxHint').replace('__n__', String(index + 1)));
    tip.textContent = lines.join('\n');
    tip.style.whiteSpace = 'pre-line';
    tip.style.background = state.lastLetterboxed.length > 0 ? TIP_WARN_BG : TIP_BG;
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
  state.barPanel = null;

  const hideBar = () => {
    bar.style.display = 'none';
    state.barPanel = null;
  };

  const showBar = (page: number, comic: VDTComicPage, panel: VDTComicPanel): void => {
    if (state.barPanel && state.barPanel.page === page && state.barPanel.panel === panel && bar.style.display !== 'none') return;
    const book = opts.sourceOfPage(page);
    if (!book || !canSplitPanel(book.markdown, comic, panel.index)) {
      hideBar();
      return;
    }
    state.barPanel = { page, panel, comic };
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
  return {
    tip, showTip, hideTip, showBalloonTip, showTailTip, bar, splitRowsBtn, splitColumnsBtn, mergeBtn,
    hideBar, showBar
  };
}
