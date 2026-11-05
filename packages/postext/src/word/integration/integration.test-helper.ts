// End-to-end kit of the Word round trip (#1390, #1392, #1395): a sample
// book exported by either writer, and edits to document.xml made the way
// Word writes them.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { expect } from 'vitest';
import type { Resource } from '../../types.js';
import type { WordChapterInput } from '../semantic/types.js';
import { applyDocxEdits, isExportedDocx, type DocxEditResult } from '../roundtrip/index.js';

export const DATE = '2026-11-04T00:00:00Z';

export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 100, 0, 0, 0, 50, 8, 2, 0, 0, 0, 0, 0, 0, 0]);

export const RESOURCES: Resource[] = [
  { id: 'fig1', typeId: 'figure', kind: 'bitmap', caption: 'A *red* dot on white.', altText: 'Dot', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f1', format: 'png', width: 300, height: 150 } },
  {
    id: 't1', typeId: 'table', kind: 'table', caption: 'Services and grades.', createdAt: 0, updatedAt: 0,
    table: { model: { headerRowCount: 1, rows: [[{ content: 'Item', isHeader: true }, { content: 'Grade', isHeader: true }], [{ content: 'Paper' }, { content: 'Good' }], [{ content: 'Ink' }, { content: 'Fair' }]] } },
  } as unknown as Resource,
];

export const resourceBytes = (id: string): Uint8Array | undefined => (id === 'f1' ? PNG : undefined);

/** Rewrite word/document.xml, or `part` (and optionally add parts). */
export function editDocx(bytes: Uint8Array, f: (xml: string) => string, extra: Record<string, string> = {}, part = 'word/document.xml'): Uint8Array {
  const files = unzipSync(bytes);
  const before = strFromU8(files[part]!);
  const after = f(before);
  expect(after, 'the edit changed nothing').not.toBe(before);
  files[part] = strToU8(after);
  for (const [k, v] of Object.entries(extra)) files[k] = strToU8(v);
  return zipSync(files);
}

export const documentXml = (bytes: Uint8Array): string => strFromU8(unzipSync(bytes)['word/document.xml']!);

/** Replace exactly one occurrence. */
export function once(xml: string, from: string | RegExp, to: string | ((m: string, ...g: string[]) => string)): string {
  const re = typeof from === 'string' ? new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : new RegExp(from.source, from.flags.includes('g') ? from.flags : `${from.flags}g`);
  const hits = xml.match(re)?.length ?? 0;
  expect(hits, `occurrences of ${String(from)}`).toBe(1);
  return xml.replace(re, to as string);
}

/** An unedited export reads back as the same book, with no edits. */
export function expectUnchanged(bytes: Uint8Array, chapters: WordChapterInput[], resources?: Resource[]): DocxEditResult {
  expect(isExportedDocx(bytes)).toBe(true);
  const r = applyDocxEdits(bytes, { chapters, ...(resources ? { resources } : {}) });
  expect(r.edits).toEqual([]);
  expect(r.changed).toBe(false);
  expect(r.chapters.map((c) => c.markdown)).toEqual(chapters.map((c) => c.markdown));
  return r;
}

export function apply(bytes: Uint8Array, chapters: WordChapterInput[], resources?: Resource[]): DocxEditResult {
  return applyDocxEdits(bytes, { chapters, ...(resources ? { resources } : {}) });
}
