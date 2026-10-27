'use client';

// The sandbox's state and the actions that change it: the editor and
// resource selections, the pending focus requests and the whole
// `SandboxState` (#1276: split out of SandboxContext.tsx).
import type { PostextConfig, Resource } from 'postext';
import type { EpubLayout, ScormVersion, PanelId, ViewportTab, SandboxLabels } from '../../types/index.js';
import type { ProjectSummary } from '../../storage/projects.js';
import type { PresetDraftSummary } from '../../storage/presetDrafts.js';
import type { Chapter, LayoutScope, BookStart, ChapterLayout, BookContent } from '../../book/types.js';
import type { TextChange } from '../../book/textChanges.js';
import type { ConfigHistoryMeta } from '../../history/sandboxHistory.js';
import type { ConfigLayers, ConfigScope } from '../../editions/configLayers.js';
import type { PresetSummary, AppliedPresetSnapshot } from '../../presets/index.js';

export interface EditorSelection {
  from: number;
  to: number;
  head: number;
}

export interface PendingEditorFocus {
  chapterId?: string;
  anchor: number;
  head: number;
  selectWord: boolean;
  /** Set when the request comes from a click or a selection on a page of
   *  the preview: a chapter switch it causes keeps the viewer where it is
   *  (the reader is already looking at the chapter). */
  fromViewer?: boolean;
}

/** Which editable run of a resource a preview click / panel selection refers
 *  to: a table cell, the caption, the note, or (SVG figures) a text node in
 *  the SVG source. */
export type ResourceFocusTarget =
  | { kind: 'cell'; row: number; col: number }
  | { kind: 'caption' }
  | { kind: 'note' }
  | { kind: 'svgText' };

/** A request, raised by a preview click, to focus a resource's editor in the
 *  Resources panel with the given selection (offsets in the run's own text —
 *  the cell / caption / note string, or the SVG source). Consumed and cleared
 *  by the panel, like `pendingEditorFocus` for the Markdown editor. */
export interface PendingResourceFocus {
  resourceId: string;
  target: ResourceFocusTarget;
  anchor: number;
  head: number;
  selectWord: boolean;
}

/** The live selection inside a resource's editor, mirrored back onto the
 *  previews as a highlight. `null` when no resource field has focus. */
export interface ResourceSelection {
  resourceId: string;
  target: ResourceFocusTarget;
  from: number;
  to: number;
  head: number;
}

export function sameResourceTarget(a: ResourceFocusTarget, b: ResourceFocusTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'cell' && b.kind === 'cell') return a.row === b.row && a.col === b.col;
  return true;
}

export interface SandboxState {
  /** The ACTIVE chapter's text — a mirror of `chapters[active].markdown`
   *  kept in sync by the reducer so the editor and single-document
   *  consumers keep a plain string. Edit through `SET_MARKDOWN`. */
  markdown: string;
  /** Every chapter of the book, in order. Always at least one. */
  chapters: Chapter[];
  activeChapterId: string;
  /** What the PDF viewer renders: the whole book or the active chapter.
   *  Not persisted: a proof is rendered on request. */
  pdfScope: LayoutScope;
  /** What the canvas lays out: the whole book (every chapter, laid out one
   *  after the other and shown as one continuous document) or the active
   *  chapter continued after the ones before it. Kept with the book (the
   *  working copy and the project record); a preset's `view` seeds it. The
   *  HTML preview always lays out the active chapter. */
  canvasScope: LayoutScope;
  /** Where the book starts, when it holds part of a longer one (#695: a
   *  bundle's `start`): what its first chapter is laid out after. Kept
   *  with the book (the working copy, the project record, the draft of a
   *  preset) and written back on export; no panel edits it. */
  bookStart?: BookStart;
  /** The EPUB 3 rendition the EPUB tab builds: the printed pages as a
   *  fixed layout, or a reflowable book (the EPUB default, and the
   *  Sandbox's). The tab always takes the whole book, so it has no scope;
   *  this choice stands in its place in the bar. A view preference, kept
   *  in `localStorage` like the tab itself. */
  epubLayout: EpubLayout;
  /** The SCORM tab's content (#1266): the printed pages, or reflowable
   *  text, as the EPUB tab's renditions; and the SCORM data model of its
   *  package. View preferences, kept in `localStorage`. */
  scormLayout: EpubLayout;
  scormVersion: ScormVersion;
  /** What the last layout of each chapter on its own recorded (page count
   *  and how its numbering ends), keyed by chapter id. Chapters are laid out
   *  one at a time; the layouts of the chapters before the active one give
   *  it its first page number (see `book/pagination.ts`). */
  chapterLayouts: Record<string, ChapterLayout>;
  /** Preset ids the user hid from the Projects panel (never the built-in). */
  hiddenPresetIds: string[];
  /** The configuration of the edition on screen: what it lays out with. */
  config: PostextConfig;
  /** A book in several languages (#1209): its general settings, which
   *  every edition reads unless it sets a field of its own, and whether
   *  the Design panel writes to them or to the edition on screen alone.
   *  Null for a book in one language. */
  configLayers: ConfigLayers | null;
  /** User-managed resources (images, SVGs, tables). Loaded asynchronously on
   *  init from IndexedDB (NOT localStorage) and persisted via an effect. */
  resources: Resource[];
  /** True once the mount-time load from IndexedDB (resources, presets,
   *  projects) has landed and any initial preset seeding is done. Until then
   *  `resources` is the empty placeholder, so a build would render every
   *  `:ref` as unresolved; viewports that do not rebuild on their own (PDF)
   *  wait for it. */
  storeReady: boolean;
  /** The page was opened on a link to another book than the one stored as
   *  open (`#preset=…`, `#project=…`, a host bundle key): the stored book is
   *  not shown at all — the sandbox shows its loading state until the
   *  linked book is on screen (cleared with `storeReady`). */
  booting: boolean;
  /** Another book is being opened (a row click, a link): the viewport
   *  shows a loading state instead of the book that is being left. */
  bookLoading: boolean;
  /** Presets with a saved draft (their edited copy), per content locale. */
  presetDrafts: PresetDraftSummary[];
  /** Covers taken from the first page of presets that ship none, as data
   *  URLs by preset id and content locale (`presetCoverKey`). */
  presetCovers: Record<string, string>;
  activePanel: PanelId | null;
  sidebarPercent: number;
  sidebarDragging: boolean;
  activeViewport: ViewportTab;
  labels: SandboxLabels;
  locale: string;
  selection: EditorSelection;
  /** The editor selection was placed from the preview (a click or a drag on
   *  a page), not by the reader in the editor: the previews show it where
   *  it is and do not scroll to follow it. Set by a viewer focus request and
   *  kept through the selections the editor reports while it is in flight;
   *  the next selection made in the editor clears it. */
  selectionFromViewer: boolean;
  editorFocused: boolean;
  /** A request to place the editor caret. `chapterId` (when set) switches
   *  the active chapter first; offsets are chapter-local. */
  pendingEditorFocus: PendingEditorFocus | null;
  /** Resource open in the Resources panel's detail view (null = list view).
   *  Lives in shared state so a preview click can open it and so the choice
   *  survives switching panels. */
  activeResourceId: string | null;
  /** Focus request for a resource editor raised by a preview click. */
  pendingResourceFocus: PendingResourceFocus | null;
  /** Selection inside the focused resource editor, for the preview highlight. */
  resourceSelection: ResourceSelection | null;
  /** Incremented whenever a viewport publishes a new built VDTDocument to
   *  `docRef`. Consumers (e.g. WarningsPanel) listen to this counter to
   *  recompute derived data. */
  docVersion: number;
  /** Incremented whenever the whole book is replaced (a preset applied, a
   *  project opened, a bundle imported) — as opposed to edited chapter by
   *  chapter. The fragment syncs treat such a book as a new document. */
  bookVersion: number;
  /** Id of the preset the current document came from (`BUILTIN_PRESET_ID`
   *  until a preset is loaded). Reset actions restore this preset. */
  activePresetId: string;
  presetStatus: 'idle' | 'loading' | 'error';
  presetError?: string;
  /** Config as last applied from the active preset, when known. Used to tell
   *  whether the current config has overrides worth resetting. */
  presetConfig?: PostextConfig;
  /** Every preset the sandbox knows about, in display order. */
  presetSummaries: PresetSummary[];
  /** Fingerprint and content hashes recorded when the active preset was last
   *  applied (null until then). Persisted so the next visit can tell an
   *  untouched document from an edited one. */
  presetApplied: AppliedPresetSnapshot | null;
  /** The active preset changed on its source while the document has local
   *  edits: they are kept and the Presets panel offers a reload. */
  presetStale: boolean;
  /** Set (to a timestamp) right after the active preset was re-applied
   *  automatically because its bundle changed; cleared a few seconds later.
   *  Drives the brief "updated from disk" notice in the Presets panel. */
  presetUpdatedAt: number | null;
  /** Local project the working document is mirrored into; null while a
   *  read-only preset is active (edits then live only in the working state). */
  activeProjectId: string | null;
  /** Every stored project, oldest first. */
  projects: ProjectSummary[];
  projectStatus: 'idle' | 'busy' | 'error';
  projectError?: string;
  /** Transient message from the last project operation (export warnings). */
  projectNotice: string | null;
  /** A link names a book the reader has their own version of — a host
   *  bundle (`#recipe=…`) imported before, or a homepage preset link
   *  (`restore=ask`) whose preset holds a draft: the question whether to
   *  keep their version or replace it with the published one (see
   *  `answerBundleReplace`). */
  bundleReplacePrompt: { kind: 'bundle' | 'preset'; id: string; name: string } | null;
}

export type SandboxAction =
  | { type: 'SET_MARKDOWN'; payload: string }
  /** Text changes on one chapter made outside the editor (a splitter
   *  dragged on a comic page, #568). Refused unless the chapter is still
   *  `baseLength` long and every change finds the text it expects, so a
   *  change computed on a layout older than the text never lands. */
  | { type: 'EDIT_CHAPTER_MARKDOWN'; payload: { chapterId: string; changes: TextChange[]; baseLength?: number } }
  /** `history` says how the write enters the undo history (#899):
   *  `false` not at all (a book opened), `{ merge: false }` as a step of
   *  its own (a frame dropped, a tool call). */
  | { type: 'SET_CONFIG'; payload: PostextConfig; history?: ConfigHistoryMeta;
      /** The general settings that go with it (a write the Design panel
       *  made for every language, or its undo). */
      shared?: PostextConfig }
  /** The general settings of the book on screen (null: one language). */
  | { type: 'SET_CONFIG_LAYERS'; payload: ConfigLayers | null }
  /** Where the Design panel writes (#1209). */
  | { type: 'SET_CONFIG_SCOPE'; payload: ConfigScope }
  | { type: 'UPDATE_CONFIG'; payload: Partial<PostextConfig>; history?: ConfigHistoryMeta }
  | { type: 'TOGGLE_PANEL'; payload: PanelId }
  | { type: 'SET_PANEL'; payload: PanelId | null }
  | { type: 'SET_SIDEBAR_PERCENT'; payload: number }
  | { type: 'SET_SIDEBAR_DRAGGING'; payload: boolean }
  | { type: 'SET_VIEWPORT'; payload: ViewportTab }
  | { type: 'SET_SELECTION'; payload: EditorSelection }
  | { type: 'SET_EDITOR_FOCUSED'; payload: boolean }
  | { type: 'SET_PENDING_EDITOR_FOCUS'; payload: PendingEditorFocus | null }
  | { type: 'SET_BOOK'; payload: BookContent }
  | { type: 'ADD_CHAPTER'; payload: { chapter: Chapter; index?: number; activate?: boolean } }
  | { type: 'REMOVE_CHAPTER'; payload: string }
  | { type: 'RENAME_CHAPTER'; payload: { id: string; title: string } }
  | { type: 'MOVE_CHAPTER'; payload: { id: string; to: number } }
  | { type: 'SET_ACTIVE_CHAPTER'; payload: string }
  | { type: 'SET_PDF_SCOPE'; payload: LayoutScope }
  | { type: 'SET_CANVAS_SCOPE'; payload: LayoutScope }
  | { type: 'SET_EPUB_LAYOUT'; payload: EpubLayout }
  | { type: 'SET_SCORM_LAYOUT'; payload: EpubLayout }
  | { type: 'SET_SCORM_VERSION'; payload: ScormVersion }
  | { type: 'SPLIT_CHAPTER'; payload: { id: string; at: number; newId: string } }
  | { type: 'SPLIT_CHAPTER_AT_HEADINGS'; payload: { id: string; newIds: string[] } }
  | { type: 'MERGE_CHAPTER_WITH_PREVIOUS'; payload: string }
  | { type: 'SET_CHAPTER_LAYOUT'; payload: ChapterLayout }
  /** Stored records (storage, a bundle) for chapters that have none in memory yet. */
  | { type: 'SET_CHAPTER_LAYOUTS'; payload: Record<string, ChapterLayout> }
  | { type: 'DROP_CHAPTER_LAYOUTS_WITHOUT_FACES' }
  | { type: 'HIDE_PRESET'; payload: string }
  | { type: 'UNHIDE_PRESET'; payload: string }
  | { type: 'SET_ACTIVE_RESOURCE'; payload: string | null }
  | { type: 'SET_PENDING_RESOURCE_FOCUS'; payload: PendingResourceFocus | null }
  | { type: 'SET_RESOURCE_SELECTION'; payload: ResourceSelection | null }
  | { type: 'BUMP_DOC_VERSION' }
  | { type: 'SET_PRESET_COVERS'; payload: Record<string, string> }
  | { type: 'ADD_PRESET_COVER'; payload: { key: string; url: string } }
  | { type: 'SET_RESOURCES'; payload: Resource[] }
  | { type: 'SET_STORE_READY' }
  | { type: 'SET_BOOK_LOADING'; payload: boolean }
  | { type: 'SET_PRESET_DRAFTS'; payload: PresetDraftSummary[] }
  | { type: 'UPSERT_PRESET_DRAFT'; payload: PresetDraftSummary }
  | { type: 'REMOVE_PRESET_DRAFT'; payload: string }
  /** `history` makes the change a step of the undo history (#866): the
   *  marks of a picture (its anchors, safe area, lettering zones). Without
   *  it a resource change is no step (an upload, a rename). */
  | { type: 'UPSERT_RESOURCE'; payload: Resource; history?: ConfigHistoryMeta }
  | { type: 'DELETE_RESOURCE'; payload: string }
  /** `config`, when the key is present (even undefined), replaces the
   *  preset's baseline configuration; without the key it is kept. */
  | { type: 'SET_PRESET'; payload: { id: string; config?: PostextConfig } }
  | { type: 'SET_PRESET_STATUS'; payload: { status: 'idle' | 'loading' | 'error'; error?: string } }
  | { type: 'SET_PRESET_LIST'; payload: PresetSummary[] }
  | { type: 'SET_PRESET_APPLIED'; payload: AppliedPresetSnapshot | null }
  | { type: 'SET_PRESET_STALE'; payload: boolean }
  | { type: 'SET_PRESET_UPDATED_AT'; payload: number | null }
  | { type: 'SET_ACTIVE_PROJECT'; payload: { id: string | null; sourcePresetId?: string } }
  | { type: 'SET_PROJECT_LIST'; payload: ProjectSummary[] }
  | { type: 'UPSERT_PROJECT_SUMMARY'; payload: ProjectSummary }
  | { type: 'REMOVE_PROJECT_SUMMARY'; payload: string }
  | { type: 'SET_PROJECT_STATUS'; payload: { status: SandboxState['projectStatus']; error?: string } }
  | { type: 'SET_PROJECT_NOTICE'; payload: string | null }
  | { type: 'SET_BUNDLE_REPLACE_PROMPT'; payload: SandboxState['bundleReplacePrompt'] };
