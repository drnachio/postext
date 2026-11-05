// Writes one sample formatted .docx for visual checks in Word or
// LibreOffice: `DOCX_DUMP=1 npx vitest run src/word/formatted/dump.test.ts`
// (DOCX_DUMP_PATH=<file>, default ./formatted-sample.docx). Skipped otherwise.
import { describe, it, expect } from 'vitest';
import type { PostextConfig, Resource, TableCell } from '../../index.js';
import { formattedDocx } from './index.js';
import { build, config, LOREM } from './formatted.test-helper.js';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const DEFAULT_PATH = 'formatted-sample.docx';

describe.skipIf(env.DOCX_DUMP !== '1')('formatted sample dump', () => {
  it('writes the sample', async () => {
    const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });
    const resources = [
      { id: 'f1', typeId: 'figure', kind: 'bitmap', caption: 'A *small* plate of type.', altText: 'Type', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f1.png', format: 'png', width: 300, height: 200 } },
      { id: 't1', typeId: 'table', kind: 'table', caption: 'Services and benefits.', createdAt: 0, updatedAt: 0, table: { model: { headerRowCount: 1, rows: [[cell('Item', { isHeader: true }), cell('Grade', { isHeader: true })], [cell('First'), cell('Yes')], [cell('Second'), cell('No')]] } } },
    ] as unknown as Resource[];
    const md = `# The sample\n\nA paragraph with **bold**, *italic* and a note[^a]. See :ref{id="f1"} and :ref{id="t1"}.\n\n${LOREM}\n\n${LOREM}\n\n${LOREM}\n\n[^a]: The note says something.\n`;
    const doc = build(md, config({ layout: { layoutType: 'double' } } as Partial<PostextConfig>), resources);
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    const bytes = await formattedDocx({ docs: [doc], chapters: [{ id: 'sample', markdown: md }], resources, resourceBytes: () => png, date: '2026-11-04T00:00:00Z' });
    // Node only (the test is skipped elsewhere); untyped so the package
    // needs no Node types.
    const mod = 'node:fs';
    const fs = (await import(/* @vite-ignore */ mod)) as { mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, b: Uint8Array): void };
    const path = env.DOCX_DUMP_PATH ?? DEFAULT_PATH;
    if (path.includes('/')) fs.mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    fs.writeFileSync(path, bytes);
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
