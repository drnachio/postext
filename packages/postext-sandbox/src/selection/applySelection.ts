/**
 * Carrying a page selection out on the editors (#865): the Markdown
 * editor selects the element's source, the Design panel opens where its
 * form is edited, the Resources panel opens on its picture, the
 * page-template editor picks its frame.
 *
 * Which of the two a selection leads to is the Sandbox's mode (#864), but
 * the caller may ask for the other one: Alt on a breadcrumb item opens the
 * element's form without leaving Content mode (`mode` below).
 */

import type { Dispatch } from 'react';
import type { VDTDocument, VDTFrame } from 'postext';
import type { SandboxAction } from '../context/SandboxContext.js';
import type { Chapter, ComposedBook } from '../book/types.js';
import type { PanelId } from '../types/index.js';
import { toChapterFocus } from '../viewport/canvas/CanvasPreview/chapterFocus.js';
import { editModeNow, selectFrame, type EditMode } from '../editing/editMode.js';
import { requestSettingsSection, type SettingsFocus } from '../context/settingsNavigation.js';
import { saveSectionState, saveSettingsGroup } from '../storage/persistence.js';
import { showPageTemplatesSection } from '../templates/showSection.js';
import { templateEditor } from '../templates/editorStore.js';
import { headingInChapters, selectionTarget, type SelectionTarget } from './selectionTargets.js';
import type { PageSelection } from './pageSelection.js';
import { selectionChapters, selectionTemplates, type SelectionApply } from './selectionStore.js';

export interface SelectionApplyDeps {
  dispatch: () => Dispatch<SandboxAction>;
  activePanel: () => PanelId | null;
  /** The book a page's offsets belong to. */
  sourceOfPage: (pageIndex: number) => ComposedBook | null;
  /** The chapters of the book: a contents entry finds its heading there. */
  chapters?: () => readonly Chapter[];
  /** A frame with nothing in it yet, in Content mode: the caret goes to
   *  its slot (written first when missing, #864). */
  openFrameSlot?: (pageIndex: number, frame: VDTFrame) => boolean;
}

/** Open a panel unless it is open. */
function openPanel(deps: SelectionApplyDeps, panel: PanelId): void {
  if (deps.activePanel() !== panel) deps.dispatch()({ type: 'SET_PANEL', payload: panel });
}

/** Carry `target` out (from `sel` on `doc`), in `mode` (the mode of the
 *  moment when it is left out). True when it led somewhere. */
export function applyTarget(target: SelectionTarget, sel: PageSelection, doc: VDTDocument, deps: SelectionApplyDeps, mode: EditMode = editModeNow()): boolean {
  const dispatch = deps.dispatch();
  switch (target.kind) {
    case 'caret':
    case 'markdown': {
      const [anchor, head] = target.kind === 'caret' ? [target.offset, target.offset] : [target.start, target.end];
      // Text a story carried in from another chapter (#943): its offsets
      // are that chapter's file's, whatever page it is laid on.
      if (target.chapter !== undefined) {
        const owner = (deps.chapters?.() ?? selectionChapters())[target.chapter];
        if (!owner) return false;
        openPanel(deps, 'markdown');
        dispatch({ type: 'SET_PENDING_EDITOR_FOCUS', payload: { chapterId: owner.id, anchor, head, selectWord: false, fromViewer: true } });
        return true;
      }
      const book = deps.sourceOfPage(sel.pageIndex);
      openPanel(deps, 'markdown');
      dispatch({ type: 'SET_PENDING_EDITOR_FOCUS', payload: { ...toChapterFocus(book, anchor, head, false), fromViewer: true } });
      return true;
    }
    case 'heading': {
      const chapters = deps.chapters?.() ?? [];
      const hit = headingInChapters(chapters, target.bodyOffset, target.title);
      if (!hit) return false;
      openPanel(deps, 'markdown');
      dispatch({ type: 'SET_PENDING_EDITOR_FOCUS', payload: { chapterId: hit.chapterId, anchor: hit.start, head: hit.end, selectWord: false, fromViewer: true } });
      return true;
    }
    case 'resource':
      openPanel(deps, 'resources');
      dispatch({ type: 'SET_ACTIVE_RESOURCE', payload: target.resourceId });
      return true;
    case 'frame': {
      if (mode === 'design') {
        // The template editor (#863) follows the frame picked.
        selectFrame({ pageIndex: sel.pageIndex, frameId: target.frame.id, name: target.frame.name, template: target.template, configPath: target.frame.configPath });
        if (deps.activePanel() !== 'config') dispatch({ type: 'SET_PANEL', payload: 'config' });
        showPageTemplatesSection(target.frame.name);
        return true;
      }
      return deps.openFrameSlot?.(sel.pageIndex, target.frame) ?? false;
    }
    case 'settings':
      if (target.template) {
        // A group or the template: the template editor opens on it.
        templateEditor.select({ templateId: target.template.id, scope: 'base', frame: null, group: target.template.group ?? null, pageIndex: sel.pageIndex });
        if (deps.activePanel() !== 'config') dispatch({ type: 'SET_PANEL', payload: 'config' });
        showPageTemplatesSection();
        return true;
      }
      openSettings(deps, target.group, target.section, focusOf(target), sel.pageIndex);
      return true;
    case 'none':
      return false;
  }
}

const TEMPLATE_POINTER = /^\/pageTemplates\/(\d+)(?:\/variants\/(recto|verso))?\//;

/** The entry of the section a settings target names (#899): a design
 *  element by its pointer, a style by its id. */
function focusOf(target: Extract<SelectionTarget, { kind: 'settings' }>): SettingsFocus | undefined {
  if (target.styleId) return { styleId: target.styleId };
  if (target.path) return { path: target.path };
  return undefined;
}

/** Open the Design panel on a group, bringing a section (and the entry
 *  `focus` names) into view. */
function openSettings(deps: SelectionApplyDeps, group: Parameters<typeof requestSettingsSection>[0]['group'], section: string | null, focus?: SettingsFocus, pageIndex: number | null = null): void {
  const open = deps.activePanel() === 'config';
  // The section opens unfolded (a top-level section's state is kept under
  // `page:<id>`, see CollapsibleSection).
  if (section) saveSectionState(`page:${section}`, true);
  // A template's decoration: the template editor shows that template (the
  // one the element is set in, maybe one the page's template extends).
  const m = focus?.path ? TEMPLATE_POINTER.exec(focus.path) : null;
  const template = m ? selectionTemplates()[Number(m[1])] : undefined;
  if (template) {
    templateEditor.select({ templateId: template.id, scope: (m![2] as 'recto' | 'verso' | undefined) ?? 'base', frame: null, group: null, pageIndex });
  }
  requestSettingsSection({ group, section, ...(focus ? { focus } : {}) });
  if (!open) {
    saveSettingsGroup(group);
    deps.dispatch()({ type: 'SET_PANEL', payload: 'config' });
  }
}

/** What carries a viewer's page selections out, in the mode of the
 *  moment. */
export function createSelectionApply(deps: SelectionApplyDeps): SelectionApply {
  return (sel, doc, mode = editModeNow()) => {
    applyTarget(selectionTarget(doc, sel, mode), sel, doc, deps, mode);
  };
}
