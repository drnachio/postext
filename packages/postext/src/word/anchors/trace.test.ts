// The trace of an export in the file's custom properties (#1458): what
// stays when an editor drops the export map.

import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync } from 'fflate';
import { semanticDocx, semanticExportMap } from '../semantic/index.js';
import { hashText } from './hash.js';
import { exportTrace, readExportTrace, traceId, traceProps, type ExportTrace } from './trace.js';
import type { ExportMap } from './types.js';

const chapters = [
  { id: 'chapters/01.md', markdown: '# One\n\nFirst text.\n' },
  { id: 'chapters/02.md', markdown: '# Two\n\nSecond text.\n\nMore of it.\n' },
];
const options = { chapters, config: {}, date: '2026-11-10T00:00:00Z' };

describe('the trace of an export', () => {
  it('travels in custom properties, each under 255 characters', async () => {
    const files = unzipSync(await semanticDocx({ ...options, design: 'plain' }));
    const xml = strFromU8(files['docProps/custom.xml']!);
    for (const m of xml.matchAll(/<vt:lpwstr>([^<]*)<\/vt:lpwstr>/g)) expect(m[1]!.length).toBeLessThan(255);
    const trace = readExportTrace(files)!;
    expect(trace).toMatchObject({ variant: 'semantic', design: 'plain', fragments: 5 });
    expect(trace.chapters).toEqual([
      { id: traceId('chapters/01.md'), text: hashText(chapters[0]!.markdown).slice(0, 8), first: 0 },
      { id: traceId('chapters/02.md'), text: hashText(chapters[1]!.markdown).slice(0, 8), first: 2 },
    ]);
    expect(trace.text).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is the same for the same book and tells what changed', async () => {
    const a = (await semanticExportMap(options)).trace;
    const b = (await semanticExportMap(options)).trace;
    expect({ ...b, exportId: a.exportId }).toEqual(a);
    const text = (await semanticExportMap({ ...options, chapters: [chapters[0]!, { ...chapters[1]!, markdown: '# Two\n\nSecond text, changed.\n' }] })).trace;
    expect(text.text).not.toBe(a.text);
    expect(text.chapters![0]).toEqual(a.chapters![0]);
    expect(text.chapters![1]!.text).not.toBe(a.chapters![1]!.text);
    const config = (await semanticExportMap({ ...options, config: { locale: 'es' } })).trace;
    expect(config.config).not.toBe(a.config);
    expect(config.text).toBe(a.text);
  });

  it('does not depend on the order of the keys of a setting or on when a resource was saved', () => {
    const map = { version: 1, exportId: 'x', variant: 'semantic', engine: 'e', createdAt: '', chapters: [], fragments: [], snapshot: { chapters: [] } } as ExportMap;
    const about = (config: unknown, updatedAt: number) => ({ config, resources: { r: { id: 'r', caption: 'c', updatedAt } }, media: 0, firstFragments: [] });
    const a = exportTrace(map, about({ a: 1, b: { c: 2, d: 3 } }, 1));
    const b = exportTrace(map, about({ b: { d: 3, c: 2 }, a: 1 }, 2));
    expect(b).toEqual(a);
  });

  it('lists a long book over several properties and reads them back', () => {
    const trace: ExportTrace = {
      exportId: 'ptx-1',
      variant: 'semantic',
      engine: 'postext-word-semantic/1 config/22',
      design: 'book',
      text: '0123456789abcdef',
      resources: 'fedcba9876543210',
      config: '00112233445566aa',
      fragments: 9000,
      chapters: Array.from({ length: 60 }, (_, k) => ({ id: traceId(`chapters/${k}.md`), text: hashText(`text ${k}`).slice(0, 8), first: k * 150 })),
    };
    const props = traceProps(trace);
    expect(Object.keys(props).filter((k) => k.startsWith('postext.chapters.')).length).toBeGreaterThan(3);
    for (const v of Object.values(props)) expect(v.length).toBeLessThan(255);
    const custom =
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      Object.entries({ 'postext.exportId': 'ptx-1', 'postext.variant': 'semantic', 'postext.version': trace.engine!, ...props })
        .map(([name, value], i) => `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${i + 2}" name="${name}"><vt:lpwstr>${value}</vt:lpwstr></property>`)
        .join('') +
      '</Properties>';
    expect(readExportTrace({ 'docProps/custom.xml': strToU8(custom) })).toEqual(trace);
  });

  it('reads a file written before the trace by the three properties it has', () => {
    const custom = '<Properties><property name="postext.exportId"><vt:lpwstr>ptx-9</vt:lpwstr></property><property name="postext.variant"><vt:lpwstr>semantic</vt:lpwstr></property></Properties>';
    expect(readExportTrace({ 'docProps/custom.xml': strToU8(custom) })).toEqual({ exportId: 'ptx-9', variant: 'semantic' });
    expect(readExportTrace({})).toBeUndefined();
  });
});
