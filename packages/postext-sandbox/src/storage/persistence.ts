import { type PostextConfig, stripConfigDefaults } from 'postext';
import type { AppliedPresetSnapshot } from '../presets/types.js';
import type { BookContent } from '../book/types.js';
import type { PanelId } from '../types/props.js';
import { PROJECT_RECORD_VERSION, migrateConfig, type MigrationDeps, normalizeBookContent } from './projectMigration.js';
import { getStorage, CONFIG_KEY, CONFIG_VERSION_KEY, BOOK_KEY, MARKDOWN_KEY, VIEWPORT_KEY, PANEL_KEY, LEGACY_BOOKS_SPLIT_KEY, PRESET_KEY, VIEWER_LOCALE_KEY, PROJECT_KEY, PRESET_APPLIED_KEY, SIDEBAR_WIDTH_KEY, SECTIONS_KEY, COLOR_MODES_KEY, CANVAS_VIEW_MODE_KEY, FOLIO_INTERACTION_KEY, CANVAS_FIT_MODE_KEY, CANVAS_ZOOM_KEY, HTML_FONT_SCALE_KEY, HTML_COLUMN_MODE_KEY, EPUB_LAYOUT_KEY, SCORM_LAYOUT_KEY, SCORM_VERSION_KEY, SETTINGS_GROUP_KEY, SETTINGS_HELP_MODE_KEY, HIDDEN_PRESETS_KEY, PRESET_GENERAL_PREFIX, WORKING_LAYERS_KEY } from './persistence/storage.js';

export { saveSidebarPercent, loadSidebarPercent, saveSectionState, loadSectionState, saveHiddenPresetIds, loadHiddenPresetIds, saveSettingsGroup, loadSettingsGroup, saveSettingsHelpMode, loadSettingsHelpMode, saveColorMode, loadColorMode, saveCanvasViewMode, loadCanvasViewMode, saveCanvasFitMode, loadCanvasFitMode, saveCanvasZoom, loadCanvasZoom, saveHtmlFontScale, loadHtmlFontScale, saveHtmlColumnMode, loadHtmlColumnMode, saveEpubLayout, loadEpubLayout, saveScormLayout, loadScormLayout, saveScormVersion, loadScormVersion, saveScormLeftOut, loadScormLeftOut, saveToolbarPinned, loadToolbarPinned } from './persistence/viewState.js';
export { downloadBytes, readFileBytes, exportConfigToJson, configFromExport, importConfigFromJson, exportMarkdownFile, importMarkdownFile } from './persistence/files.js';
export type { ConfigExport } from './persistence/files.js';

/** The working configuration. As `saveBook`, a quota error is swallowed: the
 *  active project record in IndexedDB still holds the truth. The version
 *  stamp is written only after the configuration, so a write that fails never
 *  stamps an older copy as current. */
export function saveConfig(config: PostextConfig): void {
  const stripped = stripConfigDefaults(config);
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(CONFIG_KEY, JSON.stringify(stripped));
    storage.setItem(CONFIG_VERSION_KEY, String(PROJECT_RECORD_VERSION));
  } catch (err) {
    console.warn('[postext-sandbox] could not persist the working configuration', err);
  }
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
  storage?.removeItem(SCORM_LAYOUT_KEY);
  storage?.removeItem(SCORM_VERSION_KEY);
  storage?.removeItem(SETTINGS_GROUP_KEY);
  storage?.removeItem(SETTINGS_HELP_MODE_KEY);
  storage?.removeItem(HIDDEN_PRESETS_KEY);
}

/** The general settings the reader gave a preset in several languages
 *  (#1209), by preset id: every edition of it opens on them, keeping what
 *  it sets of its own. Null while the preset's own are in force. */
export function loadPresetGeneral(presetId: string): PostextConfig | null {
  try {
    const raw = getStorage()?.getItem(PRESET_GENERAL_PREFIX + presetId);
    return raw ? (JSON.parse(raw) as PostextConfig) : null;
  } catch {
    return null;
  }
}

export function savePresetGeneral(presetId: string, shared: PostextConfig | null): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (shared) storage.setItem(PRESET_GENERAL_PREFIX + presetId, JSON.stringify(shared));
    else storage.removeItem(PRESET_GENERAL_PREFIX + presetId);
  } catch (err) {
    console.warn('[postext-sandbox] could not persist the general settings', err);
  }
}

/** The general settings of the preset on screen, beside the working
 *  configuration, so the next visit resumes it with them (#1209). */
export function saveWorkingLayers(presetId: string | null, shared: PostextConfig | null): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (presetId && shared) storage.setItem(WORKING_LAYERS_KEY, JSON.stringify({ presetId, shared }));
    else storage.removeItem(WORKING_LAYERS_KEY);
  } catch {
    // The preset opened again brings them back.
  }
}

export function loadWorkingLayers(presetId: string): PostextConfig | null {
  try {
    const raw = getStorage()?.getItem(WORKING_LAYERS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { presetId?: string; shared?: PostextConfig };
    return parsed.presetId === presetId && parsed.shared ? parsed.shared : null;
  } catch {
    return null;
  }
}
