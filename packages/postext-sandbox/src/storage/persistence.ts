import type { PostextConfig } from 'postext';

const CONFIG_KEY = 'postext-sandbox-config';
const MARKDOWN_KEY = 'postext-sandbox-markdown';
const VIEWPORT_KEY = 'postext-sandbox-viewport';
const SIDEBAR_WIDTH_KEY = 'postext-sandbox-sidebar-width';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveConfig(config: PostextConfig): void {
  getStorage()?.setItem(CONFIG_KEY, JSON.stringify(config));
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

export function saveSidebarPercent(percent: number): void {
  getStorage()?.setItem(SIDEBAR_WIDTH_KEY, String(percent));
}

export function loadSidebarPercent(): number | null {
  const raw = getStorage()?.getItem(SIDEBAR_WIDTH_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 5 && n <= 90 ? n : null;
}

export function clearStorage(): void {
  const storage = getStorage();
  storage?.removeItem(CONFIG_KEY);
  storage?.removeItem(MARKDOWN_KEY);
  storage?.removeItem(VIEWPORT_KEY);
  storage?.removeItem(SIDEBAR_WIDTH_KEY);
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
  downloadJson({ type: 'postext-config', version: 1, config }, 'postext-config.json');
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
