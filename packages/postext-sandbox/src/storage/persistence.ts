import type { PostextConfig } from 'postext';
import { stripConfigDefaults } from 'postext';

const CONFIG_KEY = 'postext-sandbox-config';
const MARKDOWN_KEY = 'postext-sandbox-markdown';
const VIEWPORT_KEY = 'postext-sandbox-viewport';
const SIDEBAR_WIDTH_KEY = 'postext-sandbox-sidebar-width';
const PANEL_KEY = 'postext-sandbox-panel';
const SECTIONS_KEY = 'postext-sandbox-sections';
const COLOR_MODES_KEY = 'postext-sandbox-color-modes';
const CANVAS_VIEW_MODE_KEY = 'postext-sandbox-canvas-view-mode';
const CANVAS_FIT_MODE_KEY = 'postext-sandbox-canvas-fit-mode';

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
  getStorage()?.setItem(CONFIG_KEY, JSON.stringify(stripped));
}

export function loadConfig(): PostextConfig | null {
  const raw = getStorage()?.getItem(CONFIG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PostextConfig;
  } catch {
    return null;
  }
}

export function saveMarkdown(markdown: string): void {
  getStorage()?.setItem(MARKDOWN_KEY, markdown);
}

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

export function loadPanel(): string | null | undefined {
  const raw = getStorage()?.getItem(PANEL_KEY);
  if (raw == null) return undefined;
  if (raw === '__closed__') return null;
  return raw;
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

export function clearStorage(): void {
  const storage = getStorage();
  storage?.removeItem(CONFIG_KEY);
  storage?.removeItem(MARKDOWN_KEY);
  storage?.removeItem(VIEWPORT_KEY);
  storage?.removeItem(SIDEBAR_WIDTH_KEY);
  storage?.removeItem(PANEL_KEY);
  storage?.removeItem(SECTIONS_KEY);
  storage?.removeItem(COLOR_MODES_KEY);
  storage?.removeItem(CANVAS_VIEW_MODE_KEY);
  storage?.removeItem(CANVAS_FIT_MODE_KEY);
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
  downloadJson({ type: 'postext-config', version: 1, config: stripped }, 'postext-config.json');
}

export function importConfigFromJson(file: File): Promise<ConfigExport> {
  return readJsonFile(file, isConfigExport);
}

// Markdown export/import

export interface MarkdownExport {
  type: 'postext-markdown';
  version: 1;
  markdown: string;
}

function isMarkdownExport(data: unknown): data is MarkdownExport {
  return typeof data === 'object' && data !== null
    && (data as MarkdownExport).type === 'postext-markdown'
    && (data as MarkdownExport).version === 1
    && typeof (data as MarkdownExport).markdown === 'string';
}

export function exportMarkdownToJson(markdown: string): void {
  downloadJson({ type: 'postext-markdown', version: 1, markdown }, 'postext-markdown.json');
}

export function importMarkdownFromJson(file: File): Promise<MarkdownExport> {
  return readJsonFile(file, isMarkdownExport);
}
