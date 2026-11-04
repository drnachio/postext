// Review fixes of the formatted Word export (#1392): text Word cannot hold
// as written, runs that do not spell their line, Word's size and pitch
// limits, box room, table grids and the version stamp.

import { describe, it, expect } from 'vitest';
import { strFromU8 } from 'fflate';
import type { DisplayItem, DisplayLine, DisplayRun } from '../../paint/displayList/types.js';
import { CONFIG_VERSION } from '../../bundle/configVersion/rules.js';
import { readExportMap } from '../anchors/exportMap.js';
import { createDocxPackage } from '../ooxml/package.js';
import { validateDocxPackage } from '../ooxml/validate.js';
import { formattedDocx, FORMATTED_ENGINE } from './index.js';
import { MetricsCache } from './metrics.js';
import { BOTTOM_ROOM, MAX_PITCH, chunkBox, emitGroups, planChunks, planLines } from './paragraphs.js';
import { MAX_SZ, resolveFont, wordText } from './runs.js';
import { edgeTwips } from './tables.js';
import type { WriterContext } from './types.js';
import { bookmarkTexts, build, config, documentXml, unzip } from './formatted.test-helper.js';

type TextItem = Extract<DisplayItem, { kind: 'text' }>;
const DATE = '2026-11-04T00:00:00Z';

function context(): WriterContext & { warnings: string[] } {
  const warnings: string[] = [];
  return {
    pkg: createDocxPackage(), dpi: 72, plan: undefined, lang: 'en', metrics: new MetricsCache(undefined), chapters: [{ id: 'a', markdown: '' }],
    docIndex: 0, fragments: [], nextFragment: 0, parts: new Map(), referenced: new Set(), z: 0,
    warn: (code) => void warnings.push(code), resourceBytes: undefined, rasterizeSvg: undefined, media: new Map(), warnings,
  };
}

function line(text: string, over: Partial<DisplayLine> = {}, runs?: DisplayRun[]): DisplayLine {
  const run: DisplayRun = { text, x: 10, width: 100, fontString: '12px "Lora"', color: '#000', textStart: 0 };
  return { text, x: 10, width: 100, baseline: 20, lineHeight: 14, align: 'left', runs: runs ?? [run], map: text.split('').map((_, i) => i), ...over };
}

/** `w:t` text and `w:br` of written paragraphs, as a bookmark reads them. */
function written(xml: string): string {
  return [...xml.matchAll(/<w:t xml:space="preserve">([^<]*)<\/w:t>|<w:br\/>|<\/w:p><w:p>/g)].map((m) => (m[1] !== undefined ? m[1] : '\n')).join('');
}

describe('formatted Word export review fixes (#1392)', () => {
  it('keeps text Word cannot hold one character for one, so bookmarks match the map', async () => {
    expect(wordText('a\u000bb\tc\nd￿e')).toBe('a�b c d�e');
    expect(wordText('x😀y')).toBe('x😀y');
    expect(wordText('x\uD83Dy\uDE00')).toBe('x�y�');
    const md = 'A\u000bB vertical tab and an emoji 😀 here.';
    const bytes = await formattedDocx({ docs: [build(md, config())], chapters: [{ id: 'c', markdown: md }], date: DATE });
    const files = unzip(bytes);
    expect(validateDocxPackage(files)).toEqual([]);
    const map = readExportMap(files)!;
    const marks = bookmarkTexts(documentXml(files));
    expect(map.fragments.length).toBeGreaterThan(0);
    for (const f of map.fragments) {
      expect(marks.get(`_ptx_${f.id}`)).toBe(f.text);
      expect(f.map.length).toBe(f.text.length);
    }
    expect(map.fragments[0]!.text).toContain('A�B');
  });

  it('writes a line whose runs do not spell it whole, as the fragment records it', () => {
    const ctx = context();
    const runs: DisplayRun[] = [{ text: 'Hel', x: 10, width: 20, fontString: 'italic 12px "Lora"', color: '#000', textStart: 0, italic: true }];
    const lines = [line('Hello', {}, runs), line('world', { baseline: 34 })];
    const item: TextItem = { kind: 'text', role: 'body', bbox: { x: 10, y: 0, width: 100, height: 40 }, lines };
    const plans = planLines(ctx, lines);
    const [chunk] = planChunks(lines, plans);
    const out = emitGroups(ctx, item, chunk!.groups, 10, 112, { offsets: [0, 5] });
    expect(out.text).toBe('Hello\nworld');
    expect(written(out.xml)).toBe(out.text);
    expect(out.map.length).toBe(out.text.length);
    // The partial run's formats are not recorded against the whole line.
    expect(out.formats).toEqual([]);
    expect(ctx.warnings).toContain('line-runs');
  });

  it('keeps font sizes within Word\'s range', () => {
    const ctx = context();
    expect(resolveFont(ctx, '3000px "Lora"').sz).toBe(MAX_SZ);
    expect(resolveFont(ctx, '0.2px "Lora"').sz).toBe(2);
    expect(ctx.warnings.filter((w) => w === 'font-size-rounded').length).toBe(2);
  });

  it('scales a size between half points back to the engine\'s widths', () => {
    const ctx = context();
    // 8.8 pt at the context's dpi: Word sets 9 pt at 97% wide (floored,
    // never wider than the engine; spacing makes up the rest), no warning.
    const f = resolveFont(ctx, `${(8.8 * ctx.dpi) / 72}px "Lora"`);
    expect(f.sz).toBe(18);
    expect(f.scale).toBe(97);
    expect(resolveFont(ctx, `${(9 * ctx.dpi) / 72}px "Lora"`).scale).toBeUndefined();
    expect(ctx.warnings).not.toContain('font-size-rounded');
  });

  it('starts a new box where a line pitch passes Word\'s exact maximum', () => {
    const ctx = context();
    const lines = [line('one', { baseline: 20 }), line('two', { baseline: 34 }), line('far', { baseline: 34 + 1700 }), line('next', { baseline: 1748 })];
    const plans = planLines(ctx, lines);
    const chunks = planChunks(lines, plans);
    expect(chunks.map((c) => [c.from, c.to])).toEqual([[0, 1], [2, 3]]);
    for (const p of plans) expect(p.h).toBeLessThanOrEqual(MAX_PITCH);
    // A table cell keeps one chunk and clamps the pitch instead.
    const cellPlans = planLines(ctx, lines);
    expect(planChunks(lines, cellPlans, false).length).toBe(1);
    expect(Math.max(...cellPlans.map((p) => p.h))).toBe(MAX_PITCH);
  });

  it('leaves room under a box\'s last line, less than half a line', () => {
    const ctx = context();
    const lines = [line('one', { baseline: 20 }), line('two', { baseline: 34 }), line('three', { baseline: 48 })];
    const plans = planLines(ctx, lines);
    const [chunk] = planChunks(lines, plans);
    const box = chunkBox(ctx, lines, chunk!, plans);
    const sum = plans.reduce((n, p) => n + p.h, 0);
    const room = Math.round((box.height * 1440) / 72) - sum;
    expect(room).toBe(Math.min(BOTTOM_ROOM, Math.floor(280 / 2) - 1));
    expect(room).toBeLessThan(140);
  });

  it('merges table edges that round to the same twip', () => {
    expect(edgeTwips([0, 50, 50.00000001, 49.99999, 100], 72, 100)).toEqual([0, 1000, 2000]);
    expect(edgeTwips([30, 10], 72, 40)).toEqual([0, 200, 600]);
    expect(edgeTwips([], 72, 40)).toEqual([0, 800]);
  });

  it('stamps the writer and config version', async () => {
    expect(FORMATTED_ENGINE).toBe(`postext-word-formatted/1 config/${CONFIG_VERSION}`);
    const md = 'Short text.';
    const files = unzip(await formattedDocx({ docs: [build(md, config())], chapters: [{ id: 'c', markdown: md }], date: DATE }));
    expect(readExportMap(files)!.engine).toBe(FORMATTED_ENGINE);
    expect(strFromU8(files['docProps/custom.xml']!)).toContain(`config/${CONFIG_VERSION}`);
  });
});

describe('formatted Word export page limits (#1392)', () => {
  it('warns about a page larger than Word allows', async () => {
    const md = 'Poster text.';
    const cfg = config({ page: { dpi: 72, width: { value: 700, unit: 'mm' }, height: { value: 1000, unit: 'mm' }, margins: { top: { value: 10, unit: 'mm' }, bottom: { value: 10, unit: 'mm' }, left: { value: 10, unit: 'mm' }, right: { value: 10, unit: 'mm' } } } } as never);
    const warnings: string[] = [];
    await formattedDocx({ docs: [build(md, cfg)], chapters: [{ id: 'c', markdown: md }], date: DATE, onWarning: (w) => warnings.push(w.code) });
    expect(warnings).toContain('page-too-large');
    const small: string[] = [];
    await formattedDocx({ docs: [build(md, config())], chapters: [{ id: 'c', markdown: md }], date: DATE, onWarning: (w) => small.push(w.code) });
    expect(small).not.toContain('page-too-large');
  });
});

describe('formatted Word export right-to-left sections (#1392)', () => {
  it('keeps a right-to-left page\'s section left-to-right, its paragraphs bidi', async () => {
    const md = 'هذا نص عربي قصير لتجربة الصفحة من اليمين إلى اليسار في المحرك مع كلمات كثيرة تملأ عدة أسطر.';
    const doc = build(md, config({ locale: 'ar', direction: 'rtl' } as never));
    const xml = documentXml(unzip(await formattedDocx({ docs: [doc], chapters: [{ id: 'c', markdown: md }], date: DATE })));
    for (const s of xml.match(/<w:sectPr>.*?<\/w:sectPr>/g) ?? []) expect(s).not.toContain('<w:bidi/>');
    expect(xml).toMatch(/<w:pPr>(?:(?!<\/w:pPr>).)*<w:bidi\/>/);
  });
});
