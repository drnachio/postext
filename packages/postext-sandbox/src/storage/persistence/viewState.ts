// The reader's view settings kept between visits: sidebar width, open
// sections, hidden presets, settings group and help mode, colour modes,
// canvas, HTML, EPUB and SCORM view options and pinned toolbars (#1276:
// split out of persistence.ts).
import type { EpubLayout, ScormVersion } from '../../types/props.js';
import { getStorage, SIDEBAR_WIDTH_KEY, SECTIONS_KEY, HIDDEN_PRESETS_KEY, SETTINGS_GROUP_KEY, SETTINGS_HELP_MODE_KEY, COLOR_MODES_KEY, CANVAS_VIEW_MODE_KEY, CANVAS_FIT_MODE_KEY, CANVAS_ZOOM_KEY, HTML_FONT_SCALE_KEY, HTML_COLUMN_MODE_KEY, EPUB_LAYOUT_KEY, SCORM_LAYOUT_KEY, SCORM_VERSION_KEY, SCORM_PICK_PREFIX, TOOLBAR_PINNED_PREFIX } from './storage.js';

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

/** The SCORM tab's content form and data model (#1266). */
export function saveScormLayout(layout: EpubLayout): void {
  getStorage()?.setItem(SCORM_LAYOUT_KEY, layout);
}

export function loadScormLayout(): EpubLayout | null {
  const raw = getStorage()?.getItem(SCORM_LAYOUT_KEY);
  return raw === 'fixed' || raw === 'reflowable' ? raw : null;
}

export function saveScormVersion(version: ScormVersion): void {
  getStorage()?.setItem(SCORM_VERSION_KEY, version);
}

export function loadScormVersion(): ScormVersion | null {
  const raw = getStorage()?.getItem(SCORM_VERSION_KEY);
  return raw === '1.2' || raw === '2004' ? raw : null;
}

/** The parts of a book the SCORM tab left out (#1266), by the book's key:
 *  the ids of the tree's leaves not picked, so a chapter added later is
 *  picked. */
export function saveScormLeftOut(book: string, ids: readonly string[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (ids.length === 0) storage.removeItem(SCORM_PICK_PREFIX + book);
    else storage.setItem(SCORM_PICK_PREFIX + book, JSON.stringify(ids));
  } catch { /* full or blocked: the pick lasts the visit */ }
}

export function loadScormLeftOut(book: string): string[] {
  try {
    const raw = getStorage()?.getItem(SCORM_PICK_PREFIX + book);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
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
