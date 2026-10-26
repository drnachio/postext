// Files in and out of the sandbox: downloads, reading a picked file, and
// the configuration and Markdown exports and imports (#1276: split out of
// persistence.ts).
import { type PostextConfig, stripConfigDefaults } from 'postext';
import { PROJECT_RECORD_VERSION, migrateConfig } from '../projectMigration.js';

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
