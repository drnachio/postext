// The localStorage keys the sandbox writes and the guarded accessor every
// read and write goes through (#1276: split out of persistence.ts).


export const CONFIG_KEY = 'postext-sandbox-config';
/** Shape of the saved configuration, numbered as project records are
 *  (`PROJECT_RECORD_VERSION`); a copy saved before the stamp existed is
 *  migrated as a version 2 record. */
export const CONFIG_VERSION_KEY = 'postext-sandbox-config-version';
export const MARKDOWN_KEY = 'postext-sandbox-markdown';
export const BOOK_KEY = 'postext-sandbox-book';
export const VIEWPORT_KEY = 'postext-sandbox-viewport';
export const SIDEBAR_WIDTH_KEY = 'postext-sandbox-sidebar-width';
/** The Books panel's library/open-book divider (1.5.1), gone since the
 *  open book has a panel of its own: dropped on the next read. */
export const LEGACY_BOOKS_SPLIT_KEY = 'postext-sandbox-books-split';
export const PANEL_KEY = 'postext-sandbox-panel';
export const PRESET_KEY = 'postext-sandbox-preset';
export const PRESET_APPLIED_KEY = 'postext-sandbox-preset-applied';
export const PROJECT_KEY = 'postext-sandbox-project';
export const VIEWER_LOCALE_KEY = 'postext-sandbox-viewer-locale';
export const SECTIONS_KEY = 'postext-sandbox-sections';
export const COLOR_MODES_KEY = 'postext-sandbox-color-modes';
export const CANVAS_VIEW_MODE_KEY = 'postext-sandbox-canvas-view-mode';
export const CANVAS_FIT_MODE_KEY = 'postext-sandbox-canvas-fit-mode';
export const CANVAS_ZOOM_KEY = 'postext-sandbox-canvas-zoom';
export const HTML_FONT_SCALE_KEY = 'postext-sandbox-html-font-scale';
export const HTML_COLUMN_MODE_KEY = 'postext-sandbox-html-column-mode';
export const EPUB_LAYOUT_KEY = 'postext-sandbox-epub-layout';
export const SCORM_LAYOUT_KEY = 'postext-sandbox-scorm-layout';
export const SCORM_VERSION_KEY = 'postext-sandbox-scorm-version';
export const SCORM_PICK_PREFIX = 'postext-sandbox-scorm-pick:';
export const SETTINGS_GROUP_KEY = 'postext-sandbox-settings-group';
export const SETTINGS_HELP_MODE_KEY = 'postext-sandbox-settings-help';
export const HIDDEN_PRESETS_KEY = 'postext-sandbox-hidden-presets';
export const TOOLBAR_PINNED_PREFIX = 'postext-sandbox-toolbar-pinned-';

export function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// No longer written: Folio opens with the hand tool on every visit (#587).
// Kept so a reset clears what older versions stored.
export const FOLIO_INTERACTION_KEY = 'postext-sandbox-folio-interaction';

export const PRESET_GENERAL_PREFIX = 'postext-sandbox-preset-general:';

export const WORKING_LAYERS_KEY = 'postext-sandbox-working-layers';
