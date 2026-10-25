// The Sandbox's store over the real reducer and planner, and the engine
// itself in place of the layout worker: what the tool tests run on.

import { buildDocument } from 'postext';
import { sandboxReducer, type SandboxAction, type SandboxState, type SandboxStore } from '../../context/SandboxContext.js';
import { createBookPlanner } from '../../book/pagination.js';
import { createSandboxHistory, setActiveHistory } from '../../history/sandboxHistory.js';
import { DEFAULT_LABELS } from '../../types/index.js';
import type { SandboxToolHost } from '../host.js';
import { runTool, type WebMcpTool } from '../modelContext.js';
import { createSandboxTools } from './index.js';

// The engine measures text on a canvas: every glyph the same width here.
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext() {
    return { font: '', measureText: (s: string) => ({ width: s.length * 7 }) };
  }
};

const PARAGRAPH = 'Print typography spent five centuries learning how to set a page, and a browser learned how to lay out an interface in a few decades. ';

export function chapter(id: string, title: string, markdown: string): SandboxState['chapters'][number] {
  return { id, title, markdown, createdAt: 1, updatedAt: 1 };
}

export function state(): SandboxState {
  const chapters = [
    chapter('a', 'Opening', `# Opening\n\n${PARAGRAPH.repeat(40)}\n\nThe last words of the opening.\n`),
    chapter('b', 'Second', `# Second\n\n${PARAGRAPH.repeat(4)}\n`),
  ];
  return {
    markdown: chapters[0]!.markdown,
    chapters,
    activeChapterId: 'a',
    pdfScope: 'chapter',
    canvasScope: 'chapter',
    epubLayout: 'reflowable',
    scormLayout: 'fixed',
    scormVersion: '1.2',
    chapterLayouts: {},
    hiddenPresetIds: [],
    config: { page: { width: { value: 120, unit: 'mm' }, height: { value: 180, unit: 'mm' } } },
    configLayers: null,
    resources: [],
    storeReady: true,
    booting: false,
    bookLoading: false,
    presetDrafts: [],
    presetCovers: {},
    activePanel: null,
    sidebarPercent: 25,
    sidebarDragging: false,
    activeViewport: 'canvas',
    labels: DEFAULT_LABELS,
    locale: 'en',
    selection: { from: 0, to: 0, head: 0 },
    selectionFromViewer: false,
    editorFocused: false,
    pendingEditorFocus: null,
    activeResourceId: null,
    pendingResourceFocus: null,
    resourceSelection: null,
    docVersion: 0,
    bookVersion: 0,
    activePresetId: 'guide',
    presetStatus: 'idle',
    presetSummaries: [{ id: 'guide', name: 'Guide', source: 'builtin', available: true }],
    presetApplied: null,
    presetStale: false,
    presetUpdatedAt: null,
    activeProjectId: null,
    projects: [],
    projectStatus: 'idle',
    projectNotice: null,
    bundleReplacePrompt: null,
  };
}

/** Nothing paginates in the background here, so the tools are told not
 *  to wait for it. `initial` replaces parts of the state the book opens
 *  with, `storeExtras` the store members a test needs beyond the state
 *  (project actions, warnings). */
export function harness(initial: Partial<SandboxState> = {}, storeExtras: Partial<SandboxStore> = {}) {
  let current: SandboxState = { ...state(), ...initial };
  const listeners = new Set<() => void>();
  const planner = createBookPlanner();
  const reduce = (action: SandboxAction) => {
    const next = sandboxReducer(current, action);
    if (next === current) return;
    current = next;
    queueMicrotask(() => { for (const l of [...listeners]) l(); });
  };
  // The provider's one history of text and design (#899), over the
  // chapters' saved editor states (no editor is open here).
  const editorStates = new Map<string, unknown>();
  const history = createSandboxHistory({ dispatch: reduce, getState: () => current, editorStates: () => editorStates });
  setActiveHistory(history);
  const store = {
    getSnapshot: () => current,
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    dispatch: history.dispatch,
    history,
    editorStatesRef: { current: editorStates },
    getPlan: (s: SandboxState) => planner.plan(s.chapters, s.config, s.resources, s.chapterLayouts, s.bookStart),
    getWarnings: () => [],
    ...storeExtras,
  } as unknown as SandboxStore;
  const host: SandboxToolHost = {
    store,
    layout: {
      build: async (request) => buildDocument(request.content, request.config),
      cancel: () => undefined,
      dispose: () => undefined,
      disposed: false,
    },
    largeTargets: { get: () => false, set: () => undefined },
    settleTimeoutMs: 0,
  };
  const list = createSandboxTools(host);
  const tools = new Map<string, WebMcpTool>(list.map((t) => [t.name, t]));
  const call = (name: string, args: Record<string, unknown> = {}) => runTool(tools.get(name)!, args) as Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { call, tools, list, host, get: () => current };
}

