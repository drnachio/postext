import type { PostextConfig } from 'postext';
import { stripConfigDefaults } from 'postext';
import type { AppliedPresetSnapshot } from '../presets/types';
import type { BookContent } from '../book/types';
import type { EpubLayout, PanelId } from '../types/props';
import { PROJECT_RECORD_VERSION, migrateConfig, normalizeBookContent, type MigrationDeps } from './projectMigration';

const CONFIG_KEY = 'postext-sandbox-config';
/** Shape of the saved configuration, numbered as project records are
 *  (`PROJECT_RECORD_VERSION`); a copy saved before the stamp existed is
 *  migrated as a version 2 record. */
const CONFIG_VERSION_KEY = 'postext-sandbox-config-version';
const MARKDOWN_KEY = 'postext-sandbox-markdown';
const BOOK_KEY = 'postext-sandbox-book';
const VIEWPORT_KEY = 'postext-sandbox-viewport';
const SIDEBAR_WIDTH_KEY = 'postext-sandbox-sidebar-width';
/** The Books panel's library/open-book divider (1.5.1), gone since the
 *  open book has a panel of its own: dropped on the next read. */
const LEGACY_BOOKS_SPLIT_KEY = 'postext-sandbox-books-split';
const PANEL_KEY = 'postext-sandbox-panel';
const PRESET_KEY = 'postext-sandbox-preset';
const PRESET_APPLIED_KEY = 'postext-sandbox-preset-applied';
const PROJECT_KEY = 'postext-sandbox-project';
const VIEWER_LOCALE_KEY = 'postext-sandbox-viewer-locale';
const SECTIONS_KEY = 'postext-sandbox-sections';
const COLOR_MODES_KEY = 'postext-sandbox-color-modes';
const CANVAS_VIEW_MODE_KEY = 'postext-sandbox-canvas-view-mode';
const CANVAS_FIT_MODE_KEY = 'postext-sandbox-canvas-fit-mode';
const CANVAS_ZOOM_KEY = 'postext-sandbox-canvas-zoom';
const HTML_FONT_SCALE_KEY = 'postext-sandbox-html-font-scale';
const HTML_COLUMN_MODE_KEY = 'postext-sandbox-html-column-mode';
const EPUB_LAYOUT_KEY = 'postext-sandbox-epub-layout';
const SETTINGS_GROUP_KEY = 'postext-sandbox-settings-group';
const SETTINGS_HELP_MODE_KEY = 'postext-sandbox-settings-help';
const HIDDEN_PRESETS_KEY = 'postext-sandbox-hidden-presets';
const TOOLBAR_PINNED_PREFIX = 'postext-sandbox-toolbar-pinned-';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveConfig(config: PostextConfig): void {
  const stripped = stripConfigDefaults(config);
  const storage = getStorage();
  storage?.setItem(CONFIG_KEY, JSON.stringify(stripped));
  storage?.setItem(CONFIG_VERSION_KEY, String(PROJECT_RECORD_VERSION));
}

/** The markdown of the saved working book (or of the legacy single
 *  document), or undefined when there is none or it cannot be read. */
function savedBookText(storage: Storage | null): string[] | undefined {
  const raw = storage?.getItem(BOOK_KEY);
  if (raw) {
    try {
      const book: unknown = JSON.parse(raw);
      const chapters = (book as { chapters?: unknown } | null)?.chapters;
      if (Array.isArray(chapters) && chapters.every((c) => typeof (c as { markdown?: unknown } | null)?.markdown === 'string')) {
        return chapters.map((c) => (c as { markdown: string }).markdown);
      }
    } catch { /* fall through to the legacy key */ }
  }
  const legacy = storage?.getItem(MARKDOWN_KEY);
  return typeof legacy === 'string' ? [legacy] : undefined;
}

/** The saved configuration in today's terms (see `migrateConfig`), or null
 *  when none was saved. An older copy is migrated against the saved
 *  working book, whose maths (or lack of any) decides the maths pin, whose
 *  inline figures (or lack of any) the inline-gap pin and, inside boxes,
 *  the box-gap pin, whose headings' marks the heading-marks pin, whose
 *  lists introduced by a colon (or lack of any) the colon-list pin,
 *  whose boxes (or lack of any) the box-cut pin, whose dashes set closed
 *  between words (or lack of any) the dash-break pin, whose headings (or
 *  lack of any) the heading-split pin, whose compounds (or lack of any)
 *  the compound-break pin, and whose `:::paragraphs` containers (or lack
 *  of any) the container-space pin. */
export function loadConfig(): PostextConfig | null {
  return loadStoredConfig()?.config ?? null;
}

/** The saved configuration both as it was stored (`stored`) and in today's
 *  terms (`config`, see {@link loadConfig}); the same object twice when the
 *  migration changed nothing. Null when none was saved. The applied
 *  preset's snapshot hashed the stored copy, so a caller that compares it
 *  with the migrated one re-keys it first (see `rekeyMigratedConfig`). */
export function loadStoredConfig(): { stored: PostextConfig; config: PostextConfig } | null {
  const storage = getStorage();
  const raw = storage?.getItem(CONFIG_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const stored = parsed as PostextConfig;
    const stamp = Number(storage?.getItem(CONFIG_VERSION_KEY));
    const version = Number.isFinite(stamp) && stamp > 0 ? stamp : 2;
    const config = migrateConfig(stored, version, version < PROJECT_RECORD_VERSION ? savedBookText(storage) : undefined);
    return { stored, config };
  } catch {
    return null;
  }
}

/** The working book (every chapter and the active one).
 *  Replaces the legacy single-markdown key, which is removed once a book has
 *  been written. A quota error is swallowed: the active project record in
 *  IndexedDB still holds the truth. */
export function saveBook(book: BookContent): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(BOOK_KEY, JSON.stringify({ version: 2, ...book }));
    storage.removeItem(MARKDOWN_KEY);
  } catch (err) {
    console.warn('[postext-sandbox] could not persist the working book', err);
  }
}

/** The saved working book, or (legacy) the saved single document as a
 *  one-chapter book, or null when nothing was ever saved. */
export function loadBook(migration: MigrationDeps): BookContent | null {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(BOOK_KEY);
  if (raw) {
    try {
      const book = normalizeBookContent(JSON.parse(raw), migration);
      if (book) return book;
    } catch { /* fall through to the legacy key */ }
  }
  const legacy = storage.getItem(MARKDOWN_KEY);
  if (legacy === null) return null;
  return normalizeBookContent({ markdown: legacy }, migration);
}

/** @deprecated Legacy single-document key; read by `loadBook` only. */
export function loadMarkdown(): string | null {
  return getStorage()?.getItem(MARKDOWN_KEY) ?? null;
}

export function saveViewport(viewport: string): void {
  getStorage()?.setItem(VIEWPORT_KEY, viewport);
}

export function loadViewport(): string | null {
  return getStorage()?.getItem(VIEWPORT_KEY) ?? null;
}

export function savePanel(panel: string | null): void {
  getStorage()?.setItem(PANEL_KEY, panel ?? '__closed__');
}

const PANEL_IDS: readonly PanelId[] = ['projects', 'chapters', 'markdown', 'resources', 'fonts', 'config', 'warnings'];

/** The side panel left open: a panel id, null when the sidebar was closed,
 *  undefined when nothing (or nothing known) is stored. */
export function loadPanel(): PanelId | null | undefined {
  const storage = getStorage();
  try {
    storage?.removeItem(LEGACY_BOOKS_SPLIT_KEY);
  } catch {
    // Nothing to clean up in a blocked storage.
  }
  const raw = storage?.getItem(PANEL_KEY);
  if (raw == null) return undefined;
  if (raw === '__closed__') return null;
  // The Presets panel became the Projects panel.
  if (raw === 'presets') return 'projects';
  return (PANEL_IDS as readonly string[]).includes(raw) ? (raw as PanelId) : undefined;
}

/** Remember which preset the current document came from, so Reset restores
 *  that preset (not the built-in sample) on the next visit. */
export function savePresetId(id: string): void {
  getStorage()?.setItem(PRESET_KEY, id);
}

export function loadPresetId(): string | null {
  return getStorage()?.getItem(PRESET_KEY) ?? null;
}

/** Remember the interface language of this visit: the next visit tells an
 *  untouched guide that was the interface's own (it follows the new
 *  interface) from one opened on purpose (it stays). */
export function saveViewerLocale(locale: string): void {
  getStorage()?.setItem(VIEWER_LOCALE_KEY, locale);
}

export function loadViewerLocale(): string | null {
  return getStorage()?.getItem(VIEWER_LOCALE_KEY) ?? null;
}

/** Remember the active local project (null when a read-only preset is
 *  active, i.e. the working document is not mirrored anywhere). */
export function saveProjectId(id: string | null): void {
  const storage = getStorage();
  if (!storage) return;
  if (id === null) storage.removeItem(PROJECT_KEY);
  else storage.setItem(PROJECT_KEY, id);
}

export function loadProjectId(): string | null {
  return getStorage()?.getItem(PROJECT_KEY) ?? null;
}

function isAppliedPresetSnapshot(data: unknown): data is AppliedPresetSnapshot {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.presetId === 'string'
    && (d.locale === undefined || typeof d.locale === 'string')
    && (d.fingerprint === null || typeof d.fingerprint === 'string')
    && typeof d.markdownHash === 'string'
    && typeof d.configHash === 'string'
    && typeof d.resourcesHash === 'string';
}

/** Remember what the last applied preset looked like (bundle fingerprint and
 *  content hashes), so the next visit can tell an untouched document from an
 *  edited one and follow bundle changes on disk. */
export function savePresetApplied(snapshot: AppliedPresetSnapshot): void {
  getStorage()?.setItem(PRESET_APPLIED_KEY, JSON.stringify(snapshot));
}

export function clearPresetApplied(): void {
  getStorage()?.removeItem(PRESET_APPLIED_KEY);
}

export function loadPresetApplied(): AppliedPresetSnapshot | null {
  const raw = getStorage()?.getItem(PRESET_APPLIED_KEY);
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    return isAppliedPresetSnapshot(data) ? data : null;
  } catch {
    return null;
  }
}

export function saveSidebarPercent(percent: number): void {
  getStorage()?.setItem(SIDEBAR_WIDTH_KEY, String(percent));
}

export function loadSidebarPercent(): number | null {
  const raw = getStorage()?.getItem(SIDEBAR_WIDTH_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 5 && n <= 90 ? n : null;
}

export function saveSectionState(sectionId: string, open: boolean): void {
  const storage = getStorage();
  if (!storage) return;
  const raw = storage.getItem(SECTIONS_KEY);
  let sections: Record<string, boolean> = {};
  if (raw) {
    try { sections = JSON.parse(raw); } catch { /* ignore */ }
  }
  sections[sectionId] = open;
  storage.setItem(SECTIONS_KEY, JSON.stringify(sections));
}

export function loadSectionState(sectionId: string): boolean | null {
  const raw = getStorage()?.getItem(SECTIONS_KEY);
  if (!raw) return null;
  try {
    const sections = JSON.parse(raw) as Record<string, boolean>;
    return sectionId in sections ? sections[sectionId] : null;
  } catch {
    return null;
  }
}

/** Ids of presets hidden from the Projects panel. */
export function saveHiddenPresetIds(ids: readonly string[]): void {
  getStorage()?.setItem(HIDDEN_PRESETS_KEY, JSON.stringify(ids));
}

export function loadHiddenPresetIds(): string[] {
  const raw = getStorage()?.getItem(HIDDEN_PRESETS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Settings group open in the Design panel (a group id, or null for the
 *  overview). */
export function saveSettingsGroup(group: string | null): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (group === null) storage.removeItem(SETTINGS_GROUP_KEY);
    else storage.setItem(SETTINGS_GROUP_KEY, group);
  } catch { /* storage full or blocked */ }
}

export function loadSettingsGroup(): string | null {
  try {
    return getStorage()?.getItem(SETTINGS_GROUP_KEY) ?? null;
  } catch {
    return null;
  }
}

/** "Show explanations" switch of the Design panel. */
export function saveSettingsHelpMode(on: boolean): void {
  try {
    getStorage()?.setItem(SETTINGS_HELP_MODE_KEY, on ? '1' : '0');
  } catch { /* storage full or blocked */ }
}

export function loadSettingsHelpMode(): boolean {
  try {
    return getStorage()?.getItem(SETTINGS_HELP_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveColorMode(fieldId: string, mode: string): void {
  const storage = getStorage();
  if (!storage) return;
  const raw = storage.getItem(COLOR_MODES_KEY);
  let modes: Record<string, string> = {};
  if (raw) {
    try { modes = JSON.parse(raw); } catch { /* ignore */ }
  }
  modes[fieldId] = mode;
  storage.setItem(COLOR_MODES_KEY, JSON.stringify(modes));
}

export function loadColorMode(fieldId: string): string | null {
  const raw = getStorage()?.getItem(COLOR_MODES_KEY);
  if (!raw) return null;
  try {
    const modes = JSON.parse(raw) as Record<string, string>;
    return fieldId in modes ? modes[fieldId] : null;
  } catch {
    return null;
  }
}

const FOLIO_INTERACTION_KEY = 'postext-sandbox-folio-interaction';

export function saveFolioInteraction(mode: string): void {
  getStorage()?.setItem(FOLIO_INTERACTION_KEY, mode);
}

export function loadFolioInteraction(): string | null {
  return getStorage()?.getItem(FOLIO_INTERACTION_KEY) ?? null;
}

export function saveCanvasViewMode(mode: string): void {
  getStorage()?.setItem(CANVAS_VIEW_MODE_KEY, mode);
}

export function loadCanvasViewMode(): string | null {
  return getStorage()?.getItem(CANVAS_VIEW_MODE_KEY) ?? null;
}

export function saveCanvasFitMode(mode: string): void {
  getStorage()?.setItem(CANVAS_FIT_MODE_KEY, mode);
}

export function loadCanvasFitMode(): string | null {
  return getStorage()?.getItem(CANVAS_FIT_MODE_KEY) ?? null;
}

export function saveCanvasZoom(zoom: number): void {
  getStorage()?.setItem(CANVAS_ZOOM_KEY, String(zoom));
}

export function loadCanvasZoom(): number | null {
  const raw = getStorage()?.getItem(CANVAS_ZOOM_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function saveHtmlFontScale(scale: number): void {
  getStorage()?.setItem(HTML_FONT_SCALE_KEY, String(scale));
}

export function loadHtmlFontScale(): number | null {
  const raw = getStorage()?.getItem(HTML_FONT_SCALE_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function saveHtmlColumnMode(mode: string): void {
  getStorage()?.setItem(HTML_COLUMN_MODE_KEY, mode);
}

export function loadHtmlColumnMode(): string | null {
  return getStorage()?.getItem(HTML_COLUMN_MODE_KEY) ?? null;
}

/** The EPUB tab's rendition: a fixed layout or a reflowable book. */
export function saveEpubLayout(layout: EpubLayout): void {
  getStorage()?.setItem(EPUB_LAYOUT_KEY, layout);
}

/** The EPUB rendition last picked, or null when none (or nothing known) is
 *  stored. */
export function loadEpubLayout(): EpubLayout | null {
  const raw = getStorage()?.getItem(EPUB_LAYOUT_KEY);
  return raw === 'fixed' || raw === 'reflowable' ? raw : null;
}

export function saveToolbarPinned(id: string, pinned: boolean): void {
  getStorage()?.setItem(TOOLBAR_PINNED_PREFIX + id, pinned ? 'true' : 'false');
}

export function loadToolbarPinned(id: string): boolean | null {
  const raw = getStorage()?.getItem(TOOLBAR_PINNED_PREFIX + id);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

export function clearStorage(): void {
  const storage = getStorage();
  storage?.removeItem(CONFIG_KEY);
  storage?.removeItem(CONFIG_VERSION_KEY);
  storage?.removeItem(MARKDOWN_KEY);
  storage?.removeItem(BOOK_KEY);
  storage?.removeItem(VIEWPORT_KEY);
  storage?.removeItem(SIDEBAR_WIDTH_KEY);
  storage?.removeItem(PANEL_KEY);
  storage?.removeItem(PRESET_KEY);
  storage?.removeItem(PRESET_APPLIED_KEY);
  storage?.removeItem(PROJECT_KEY);
  storage?.removeItem(VIEWER_LOCALE_KEY);
  storage?.removeItem(SECTIONS_KEY);
  storage?.removeItem(COLOR_MODES_KEY);
  storage?.removeItem(CANVAS_VIEW_MODE_KEY);
  storage?.removeItem(FOLIO_INTERACTION_KEY);
  storage?.removeItem(CANVAS_FIT_MODE_KEY);
  storage?.removeItem(CANVAS_ZOOM_KEY);
  storage?.removeItem(HTML_FONT_SCALE_KEY);
  storage?.removeItem(HTML_COLUMN_MODE_KEY);
  storage?.removeItem(EPUB_LAYOUT_KEY);
  storage?.removeItem(SETTINGS_GROUP_KEY);
  storage?.removeItem(SETTINGS_HELP_MODE_KEY);
  storage?.removeItem(HIDDEN_PRESETS_KEY);
}

/** Trigger a browser download of `data` under `filename`. */
export function downloadBytes(data: Uint8Array | string, filename: string, mime: string): void {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJson(data: unknown, filename: string): void {
  downloadBytes(JSON.stringify(data, null, 2), filename, 'application/json');
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function readJsonFile<T>(file: File, validate: (data: unknown) => data is T): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!validate(data)) {
          reject(new Error('Invalid file format'));
          return;
        }
        resolve(data);
      } catch {
        reject(new Error('Failed to parse JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// Config export/import

export interface ConfigExport {
  type: 'postext-config';
  version: 1;
  /** The configuration rules `config` is written for, numbered as project
   *  records are (`PROJECT_RECORD_VERSION`). Absent in a file exported by
   *  postext 1.4 or earlier. */
  configVersion?: number;
  config: PostextConfig;
}

function isConfigExport(data: unknown): data is ConfigExport {
  return typeof data === 'object' && data !== null
    && (data as ConfigExport).type === 'postext-config'
    && (data as ConfigExport).version === 1
    && typeof (data as ConfigExport).config === 'object';
}

export function exportConfigToJson(config: PostextConfig): void {
  const stripped = stripConfigDefaults(config);
  downloadJson({ type: 'postext-config', version: 1, configVersion: PROJECT_RECORD_VERSION, config: stripped }, 'postext-config.json');
}

/** An exported configuration in today's terms: one exported by postext
 *  1.4 or earlier (no `configVersion`) keeps the heading breaks, the maths
 *  size, the space around inline figures (in the text and inside boxes),
 *  the heading marks, the drop-cap sizes, the room under a colon line that
 *  introduces a list, the box cuts, the breaks at dashes, the breaking of
 *  ragged text, the split under a heading, the breaks at compounds'
 *  hyphens and the space under `:::paragraphs` containers it laid out
 *  (see `migrateConfig`); the file carries no chapters, so its maths size
 *  is pinned whenever maths is on, its ragged breaking whenever it sets
 *  running text ragged, its space under containers whenever it declares
 *  a paragraph style, and its gaps, heading marks, colon-list room, box
 *  cut, dash breaks, split under a heading and compound breaks always.
 *  One stamped 3 to 7
 *  (a 1.5 prerelease) gets only the pins of the rules after it. */
export function configFromExport(data: ConfigExport): PostextConfig {
  return migrateConfig(data.config, data.configVersion);
}

/** Read a `postext-config.json`; its `config` comes back in today's terms
 *  (see {@link configFromExport}). */
export async function importConfigFromJson(file: File): Promise<ConfigExport> {
  const data = await readJsonFile(file, isConfigExport);
  return { ...data, config: configFromExport(data) };
}

// Markdown export/import (plain .md files)

/** Download the document as a plain markdown file. */
export function exportMarkdownFile(markdown: string, filename = 'document.md'): void {
  downloadBytes(markdown, filename, 'text/markdown;charset=utf-8');
}

/** Read a markdown file as text. Rejects when the file cannot be read. */
export function importMarkdownFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
