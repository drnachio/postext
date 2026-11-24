/**
 * The state the page-template editor shares between the Design panel and
 * the pages on the canvas (#863): whether the canvas is in Design mode
 * (frames are drawn, moved and resized there instead of the text being
 * selected), the template and frame being edited, and the scope.
 *
 * A small external store, so the canvas's DOM controllers read it without
 * React and the panel subscribes with `useSyncExternalStore`. The mode is
 * the Sandbox's Content / Design mode (#864, `editing/editMode.ts`), and a
 * frame picked there (`selectFrame`) is picked here too.
 */

import { useSyncExternalStore, type Dispatch } from 'react';
import type { SandboxAction, SandboxState } from '../context/SandboxContext.js';
import type { TemplateScope } from './templateEdits.js';
import type { ConnectorPickPhase } from './connectorEdits.js';
import { editModeNow, onEditModeChange, selectedFrameNow, setEditMode } from '../editing/editMode.js';
import { selectionTemplates } from '../selection/selectionStore.js';
import { templateFrameOf } from './instanceNames.js';

export interface TemplateEditorSelection {
  templateId: string;
  scope: TemplateScope;
  /** The frame (or group, `kind: 'group'`) open in the properties. */
  frame: string | null;
  group: string | null;
  /** The page the frame was picked on, when it was picked on a page. */
  pageIndex: number | null;
}

/** The connector of a template's decoration whose ends the canvas shows
 *  as handles (#1063), and, while it is being picked, which end a click
 *  on a frame sets. */
export interface ConnectorFocus {
  templateId: string;
  scope: TemplateScope;
  elementId: string;
  /** null: shown, not picked. */
  phase: ConnectorPickPhase | null;
}

export interface TemplateEditorState {
  designMode: boolean;
  selection: TemplateEditorSelection | null;
  connector: ConnectorFocus | null;
}

let state: TemplateEditorState = { designMode: false, selection: null, connector: null };
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of [...listeners]) l();
}

const SCOPE_RE = /^\/pageTemplates\/\d+\/variants\/(recto|verso)\//;

/** The Content / Design mode and the frame picked in it, read into the
 *  editor's state. */
function syncFromEditMode(): void {
  const designMode = editModeNow() === 'design';
  const picked = selectedFrameNow();
  let selection = state.selection;
  // A grid's instance or a module's frame (#1065) is edited as the frame
  // of the template that draws it.
  const at = picked ? templateFrameOf(picked, host?.getState().config.pageTemplates ?? selectionTemplates()) : null;
  if (picked && at && (selection?.templateId !== at.templateId || selection.frame !== at.frame || selection.pageIndex !== picked.pageIndex)) {
    const scope = (SCOPE_RE.exec(picked.configPath)?.[1] as TemplateScope | undefined) ?? 'base';
    selection = { templateId: at.templateId, scope, frame: at.frame, group: null, pageIndex: picked.pageIndex };
  }
  if (designMode === state.designMode && selection === state.selection) return;
  state = { ...state, designMode, selection };
  emit();
}

let linked = false;
function link(): void {
  if (linked) return;
  linked = true;
  state = { ...state, designMode: editModeNow() === 'design' };
  onEditModeChange(syncFromEditMode);
}

export const templateEditor = {
  getSnapshot: (): TemplateEditorState => {
    link();
    return state;
  },
  subscribe(listener: () => void): () => void {
    link();
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** The Sandbox's mode: Design (`on`) or Content. */
  setDesignMode(on: boolean): void {
    link();
    setEditMode(on ? 'design' : 'content');
  },
  select(selection: TemplateEditorSelection | null): void {
    const a = state.selection;
    if (a && selection && a.templateId === selection.templateId && a.scope === selection.scope && a.frame === selection.frame && a.group === selection.group && a.pageIndex === selection.pageIndex) return;
    state = { ...state, selection };
    emit();
  },
  /** The selection with some fields changed (no selection: nothing). */
  update(patch: Partial<TemplateEditorSelection>): void {
    if (!state.selection) return;
    templateEditor.select({ ...state.selection, ...patch });
  },
  /** The connector shown on the canvas, and the end being picked
   *  (#1063). Picking turns the Design mode on: frames are picked there. */
  focusConnector(connector: ConnectorFocus | null): void {
    const a = state.connector;
    if (a === connector || (a && connector && a.templateId === connector.templateId && a.scope === connector.scope && a.elementId === connector.elementId && a.phase === connector.phase)) return;
    state = { ...state, connector };
    if (connector?.phase && !state.designMode) templateEditor.setDesignMode(true);
    emit();
  },
  /** Back to the start (tests). */
  reset(): void {
    state = { designMode: editModeNow() === 'design', selection: null, connector: null };
    emit();
  },
};

export function useTemplateEditor(): TemplateEditorState {
  return useSyncExternalStore(templateEditor.subscribe, templateEditor.getSnapshot, templateEditor.getSnapshot);
}

/** What the canvas's frame editors read the book from and write it with:
 *  set by the canvas while it is mounted. */
export interface TemplateEditorHost {
  getState: () => SandboxState;
  dispatch: Dispatch<SandboxAction>;
  /** The dispatch of a change to the design made on the page: in a book
   *  in several languages it writes where the Design panel's scope says
   *  (#1700). Without one, `dispatch`. */
  writeDesign?: Dispatch<SandboxAction>;
}

let host: TemplateEditorHost | null = null;

export function setTemplateEditorHost(next: TemplateEditorHost | null): void {
  host = next;
}

export function templateEditorHost(): TemplateEditorHost | null {
  return host;
}
