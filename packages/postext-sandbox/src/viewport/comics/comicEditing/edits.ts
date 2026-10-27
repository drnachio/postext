// The source edits the comic editor commits: splitter, balloon and tail
// moves, untail, unpin and the panel actions, with the toolbar's keys
// (#1276: split out of comicEditing.ts).
import type { VDTComicPage, VDTComicSplitter, VDTComicBalloon, VDTPoint, VDTComicPanel } from 'postext';
import type { TextChange } from '../../../book/textChanges.js';
import { chapterEditOf, splitterMoveChanges, type BalloonMove, balloonMoveOf, balloonMoveChanges, tailHandlePointOf, type TailMove, tailMoveOf, tailMoveChanges, untailChanges, unpinGroupChanges, panelEditChanges } from '../comicEdits.js';
import { applyViewerEdit } from '../../../editor/viewerEdits.js';
import type { SplitterPosition } from '../comicDrag.js';
import { shared } from './shared.js';
import { panelKey } from './helpers.js';
import { panelKeyAction } from '../comicHit.js';
import type { ComicEditOptions } from './types.js';
import type { SandboxAction } from '../../../context/SandboxContext/state.js';
import type { ComicEditorState, ComicEditorLate } from './state.js';

/** What createComicEdits takes from the comic editor. */
export interface ComicEditsDeps {
  opts: ComicEditOptions;
  dispatchRef: React.MutableRefObject<React.Dispatch<SandboxAction>>;
  comicOf: (page: number, start: number) => VDTComicPage | null;
  repaint: () => void;
  bar: HTMLDivElement;
  splitRowsBtn: HTMLButtonElement;
  splitColumnsBtn: HTMLButtonElement;
  mergeBtn: HTMLButtonElement;
  hideBar: () => void;
  state: ComicEditorState;
  late: ComicEditorLate;
}

export function createComicEdits(deps: ComicEditsDeps) {
  const {
    opts, dispatchRef, comicOf, repaint, bar, splitRowsBtn, splitColumnsBtn, mergeBtn, hideBar,
    state, late
  } = deps;
  // --------------------------------------------------------------- commit

  /** Hand a source edit of a page to the chapter it belongs to. */
  const commit = (page: number, comic: VDTComicPage, changes: TextChange[] | null): void => {
    if (!changes || changes.length === 0) return;
    const edit = chapterEditOf(opts.sourceOfPage(page), comic, changes);
    if (edit) applyViewerEdit(dispatchRef.current, edit.chapterId, edit.changes, edit.baseLength);
  };

  const commitLine = (page: number, comicStart: number, s: VDTComicSplitter, pos: SplitterPosition): void => {
    const comic = comicOf(page, comicStart);
    const book = opts.sourceOfPage(page);
    if (!comic || !book) return;
    commit(page, comic, splitterMoveChanges(book.markdown, comic, s, pos));
  };

  /** A group to move: its members, its panel and the centre the move
   *  carries; null when its line cannot be found in the source. */
  const balloonMove = (page: number, comic: VDTComicPage, b: VDTComicBalloon): BalloonMove | null => {
    const book = opts.sourceOfPage(page);
    return book ? balloonMoveOf(book.markdown, opts.resourcesRef?.current, page, comic, b) : null;
  };

  /** Write where a group was moved (or how far it was turned). */
  const commitBalloon = (m: BalloonMove): void => {
    const comic = comicOf(m.page, m.comic.sourceStart);
    const book = opts.sourceOfPage(m.page);
    if (!comic || !book) return;
    commit(m.page, comic, balloonMoveChanges(book.markdown, comic, m));
  };

  /** Where a balloon's tail handle goes: its tip, else (a target the
   *  lettering drew no tail to, too close to the body) its written `to`;
   *  undefined for a balloon with neither. */
  const tailHandlePoint = (page: number, comic: VDTComicPage, b: VDTComicBalloon): VDTPoint | undefined =>
    tailHandlePointOf(opts.sourceOfPage(page)?.markdown ?? null, comic, b);

  /** A tail to move: the balloon that carries it, its panel and where it
   *  aims now (its `to`, else its speaker's mouth, else its tip). */
  const tailMove = (page: number, comic: VDTComicPage, b: VDTComicBalloon): TailMove | null => {
    const book = opts.sourceOfPage(page);
    return book ? tailMoveOf(book.markdown, opts.resourcesRef?.current, page, comic, b) : null;
  };

  /** Write where a tail aims. */
  const commitTail = (m: TailMove): void => {
    const comic = comicOf(m.page, m.comic.sourceStart);
    const book = opts.sourceOfPage(m.page);
    if (!comic || !book) return;
    commit(m.page, comic, tailMoveChanges(book.markdown, comic, m));
  };

  /** Point a tail back at its speaker (`to` taken off); false when its
   *  line has none. */
  const untail = (page: number, comic: VDTComicPage, b: VDTComicBalloon): boolean => {
    const book = opts.sourceOfPage(page);
    const changes = book ? untailChanges(book.markdown, comic, b) : null;
    if (!changes) return false;
    commit(page, comic, changes);
    return true;
  };

  /** Take a group's pin off; false when its line has none. */
  const unpinBalloon = (page: number, comic: VDTComicPage, b: VDTComicBalloon): boolean => {
    const book = opts.sourceOfPage(page);
    const changes = book ? unpinGroupChanges(book.markdown, comic, b) : null;
    if (!changes) return false;
    commit(page, comic, changes);
    return true;
  };

  /** Split or merge a panel; with `focusAfter`, its handle takes the focus
   *  back once the pages are drawn again. */
  const panelEdit = (target: { page: number; panel: VDTComicPanel; comic: VDTComicPage }, kind: 'rows' | 'columns' | 'merge', focusAfter = false): void => {
    const book = opts.sourceOfPage(target.page);
    if (!book) return;
    const changes = panelEditChanges(book.markdown, target.comic, target.panel.index, kind);
    if (focusAfter && changes && changes.length > 0) shared.refocus = { key: panelKey(target.comic, target.panel), until: Date.now() + 8000 };
    commit(target.page, target.comic, changes);
  };

  const panelAction = (kind: 'rows' | 'columns' | 'merge', fromKeyboard = false): void => {
    const target = state.barPanel;
    hideBar();
    if (!target) return;
    panelEdit(target, kind, fromKeyboard || state.barFromHandle);
    state.hover = null;
    repaint();
  };
  splitRowsBtn.addEventListener('click', (ev) => panelAction('rows', ev.detail === 0));
  splitColumnsBtn.addEventListener('click', (ev) => panelAction('columns', ev.detail === 0));
  mergeBtn.addEventListener('click', (ev) => panelAction('merge', ev.detail === 0));
  /** The toolbar was opened from a panel's handle (Enter): Escape goes
   *  back to it. */
  state.barFromHandle = false;
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
      const target = state.barPanel;
      hideBar();
      if (target) {
        const h = late.handles.querySelector<HTMLElement>(`[data-comic-panel="${panelKey(target.comic, target.panel)}"]`);
        h?.focus({ preventScroll: true });
      }
    }
  });
  bar.addEventListener('focusout', (ev) => {
    if (!bar.contains(ev.relatedTarget as Node | null)) state.barFromHandle = false;
  });
  return {
    commitLine, balloonMove, commitBalloon, tailHandlePoint, tailMove, commitTail, untail,
    unpinBalloon, panelEdit
  };
}
