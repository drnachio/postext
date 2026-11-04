import { describe, it, expect } from 'vitest';
import { strFromU8, strToU8, zipSync } from 'fflate';
import type { DisplayItem, DisplayLine, DisplayRun } from '../../paint/displayList/types.js';
import { decodeExportMap, encodeExportMap, xmlPartText } from '../anchors/exportMap.js';
import { EXPORT_MAP_ROOT } from '../anchors/types.js';
import { writeCmap } from '../fonts/cmap.js';
import { ByteWriter } from '../fonts/sfnt.js';
import type { WordFontPlan } from '../fonts/types.js';
import { createDocxPackage } from '../ooxml/package.js';
import { applyDocxEdits } from '../roundtrip/index.js';
import { faceAdvancesOf, MetricsCache, naturalEms, type FaceAdvances } from './metrics.js';
import { chunkBox, emitGroups, lineDescent, planChunks, planLines, runGaps } from './paragraphs.js';
import { HOLDER, LEGACY_HOLDER, emitRun, resolveFont, runProps } from './runs.js';
import { formattedDocx } from './index.js';
import { build, config, documentXml, unzip } from './formatted.test-helper.js';
import type { WriterContext } from './types.js';

// A face of 1000 units: letters 500, spaces 250, CJK 1000.
const FACE: FaceAdvances = (() => {
  const cmap = new Map<number, number>();
  const advances = [0];
  const add = (cp: number, adv: number): void => {
    cmap.set(cp, advances.length);
    advances.push(adv);
  };
  for (let c = 0x21; c < 0x7f; c++) add(c, 500);
  add(0x20, 250);
  add(0xa0, 250);
  for (const c of '漢字、。') add(c.codePointAt(0)!, 1000);
  return { unitsPerEm: 1000, cmap, advances };
})();

class FakeMetrics extends MetricsCache {
  constructor() {
    super(undefined);
  }
  override faceAdvances(): FaceAdvances | undefined {
    return FACE;
  }
}

function plan(map: [string, string][] = []): WordFontPlan {
  return { faces: [], map: new Map(map.map(([k, family]) => [k, { family, bold: false, italic: false }])), warnings: [], altNames: new Map() };
}

function context(over: Partial<WriterContext> = {}): WriterContext {
  return {
    pkg: createDocxPackage(), dpi: 72, plan: plan(), lang: 'en', metrics: new FakeMetrics(), chapters: [{ id: 'a', markdown: '' }],
    docIndex: 0, fragments: [], nextFragment: 0, parts: new Map(), referenced: new Set(), z: 0,
    warn: () => undefined, resourceBytes: undefined, rasterizeSvg: undefined, media: new Map(), ...over,
  };
}

const F = '12px "Lora"'; // 12 pt at 72 dpi: sz 24, an em is 240 twips
const run = (text: string, x: number, width: number, over: Partial<DisplayRun> = {}): DisplayRun => ({ text, x, width, fontString: F, color: '#000', textStart: 0, ...over });
function lineOf(runs: DisplayRun[], over: Partial<DisplayLine> = {}): DisplayLine {
  let at = 0;
  for (const r of runs) {
    r.textStart = at;
    at += r.text.length;
  }
  const text = runs.map((r) => r.text).join('');
  const x = runs[0]!.x;
  const end = Math.max(...runs.map((r) => r.x + r.width));
  return { text, x, width: end - x, baseline: 20, lineHeight: 14, align: 'left', runs, map: text.split('').map((_, i) => i), ...over };
}
const spacingOf = (rPr: string): number => Number(/<w:spacing w:val="(-?\d+)"/.exec(rPr)?.[1] ?? 0);

/** Twips a written run takes: natural advances plus spacing after each character. */
function writtenTwips(pieces: { rPr: string; text: string }[]): number {
  let tw = 0;
  for (const p of pieces) tw += naturalEms(FACE, p.text)! * 240 + spacingOf(p.rPr) * Array.from(p.text).length;
  return tw;
}

describe('run widths of the formatted Word export (#1406)', () => {
  it('spaces a word out to the engine width, floored, the first characters a twip wider', () => {
    const ctx = context();
    // "abc": 1.5 em = 360 twips natural; the engine set it at 18.5 px = 370.
    const out = emitRun(ctx, run('abc', 0, 18.5), lineOf([run('abc', 0, 18.5)]));
    expect(out.pieces!.map((p) => [p.text, spacingOf(p.rPr)])).toEqual([['a', 4], ['bc', 3]]);
    expect(writtenTwips(out.pieces!)).toBe(370);
    // Narrower than natural (kerned, squeezed): negative, rounded down.
    const tight = emitRun(ctx, run('abcd', 0, 23.9), lineOf([run('abcd', 0, 23.9)]));
    const pieces = tight.pieces ?? [tight];
    expect(writtenTwips(pieces)).toBeLessThanOrEqual(478);
    expect(writtenTwips(pieces)).toBeGreaterThan(477);
  });

  it('shrinks a justified space below its natural advance, in the face of the word beside it', () => {
    const ctx = context();
    const word = run('ab', 0, 12, { fontString: 'italic 12px "Lora"', italic: true });
    const space = run(' ', 12, 2, { fontString: '700 18px "Archivo"', space: true });
    const next = run('cd', 14, 12, { fontString: 'italic 12px "Lora"', italic: true });
    const l = lineOf([word, space, next], { align: 'justify' });
    const out = emitRun(ctx, space, l);
    // 2 px = 40 twips against a 60-twip space of Lora 12 pt: squeezed by
    // w:w (LibreOffice drops spacing on blanks of a justified line).
    expect(out.rPr).toContain('<w:w w:val="66"/>');
    expect(spacingOf(out.rPr)).toBe(0);
    // A space set wider than natural is spaced out.
    expect(spacingOf(emitRun(ctx, { ...space, width: 5 }, l).rPr)).toBe(40);
    expect(out.rPr).toContain('w:ascii="Lora"');
    expect(out.rPr).toContain('<w:sz w:val="24"/>');
    // Its own emphasis stays its own: the importer reads no change.
    expect(out.rPr).not.toContain('<w:i/>');
    // A line starting with a space takes the face after it.
    expect(emitRun(ctx, space, lineOf([space, next])).rPr).toContain('w:ascii="Lora"');
  });

  it('keeps compressed CJK punctuation apart from full-width runs', () => {
    const ctx = context();
    const l = lineOf([run('漢字', 0, 24), run('、', 24, 6), run('漢', 30, 12)], { align: 'justify' });
    const items: Extract<DisplayItem, { kind: 'text' }> = { kind: 'text', role: 'body', lines: [l] } as Extract<DisplayItem, { kind: 'text' }>;
    const plans = planLines(ctx, [l]);
    const [chunk] = planChunks([l], plans);
    const out = emitGroups(ctx, items, chunk!.groups, 0, 100, { offsets: [0] });
    const runs = [...out.xml.matchAll(/<w:r>(<w:rPr>.*?<\/w:rPr>)<w:t xml:space="preserve">(.*?)<\/w:t><\/w:r>/g)].map((m) => [m[2], spacingOf(m[1]!)]);
    // 、 set at half an em: −120 twips; the full-width runs merge (spacing 0).
    expect(runs).toEqual([['漢字', 0], ['、', -120], ['漢', 0]]);
    expect(out.text).toBe('漢字、漢\n'); // a justified line ends in a break
  });

  it('narrows compressed punctuation of vertical text by w:w', () => {
    const ctx = context();
    const comma = run('、', 24, 6);
    const out = emitRun(ctx, comma, lineOf([run('漢字', 0, 24), comma], { vertical: true }));
    // LibreOffice drops negative spacing on upright CJK: half width by scale.
    expect(out.rPr).toContain('<w:w w:val="50"/>');
    expect(spacingOf(out.rPr)).toBe(0);
  });

  it('takes a box out to punctuation hung past the line end', () => {
    const ctx = context();
    const hung = lineOf([run('漢字', 0, 24), run('、', 24, 6)], { width: 24, align: 'justify' });
    const plans = planLines(ctx, [hung]);
    const [chunk] = planChunks([hung], plans);
    expect(chunkBox(ctx, [hung], chunk!, plans).width).toBeCloseTo(30 + 2, 6);
    expect(chunk!.groups[0]!.firstR).toBeCloseTo(30, 6);
  });

  it('holds embedded content with no-break spaces spaced to its width', () => {
    const ctx = context();
    const math = run('x', 30, 30, { inline: { kind: 'math', svg: '<svg/>', widthPx: 30, heightPx: 10, ascentPx: 8 } });
    const out = emitRun(ctx, math, lineOf([math]));
    expect(out.text).toBe(HOLDER);
    // 600 twips less the no-break space's own 60.
    expect(spacingOf(out.rPr)).toBe(540);
    // A narrow holder spaces in (negative).
    const swatch = run('x', 0, 1, { inline: { kind: 'swatch', widthPx: 1, heightPx: 1 } });
    expect(spacingOf(emitRun(ctx, swatch, lineOf([swatch])).rPr)).toBe(-40);
    // A verse hemistich gap (tabs) too.
    const tab = run('\t', 0, 40);
    expect(emitRun(ctx, tab, lineOf([tab])).text).toBe(HOLDER);
  });

  it('keeps a run set apart where the engine put it (a number flush right)', () => {
    const ctx = context();
    const title = run('Intro', 0, 30);
    const num = run('12', 200, 12);
    const l = lineOf([title, num]);
    expect(runGaps(l)).toEqual([170, 0]);
    const out = emitRun(ctx, title, l, 170);
    // The last character carries the gap: 170 px = 3400 twips.
    expect(out.pieces!.map((p) => [p.text, spacingOf(p.rPr)])).toEqual([['Intr', 0], ['o', 3400]]);
    expect(out.text).toBe('Intro');
    // Right to left: the next run sits to the left.
    const rtl = lineOf([run('ab', 100, 12, { rtl: true }), run('cd', 50, 12, { rtl: true })], { rtl: true });
    expect(runGaps(rtl)).toEqual([38, 0]);
    // Touching runs: no gap.
    expect(runGaps(lineOf([run('ab', 0, 12), run('cd', 12.2, 12)]))).toEqual([0, 0]);
  });

  it('measures nothing without the face (spaces of a justified line a hair tighter)', () => {
    const ctx = context({ plan: undefined, metrics: new MetricsCache(undefined) });
    const space = run(' ', 0, 2, { space: true });
    expect(spacingOf(emitRun(ctx, space, lineOf([run('a', 0, 6), space], { align: 'justify' })).rPr)).toBe(-2);
    expect(emitRun(ctx, run('abc', 0, 18.5), lineOf([run('abc', 0, 18.5)])).rPr).not.toContain('w:spacing');
  });

  it('leaves blank runs out of the line descent', () => {
    const ctx = context({ plan: undefined, metrics: new MetricsCache(undefined) });
    const l = lineOf([run('ab', 0, 12), run(' ', 12, 4, { fontString: '40px "Big"' }), run('cd', 16, 12)]);
    expect(lineDescent(ctx, l)).toBeCloseTo(12 * 0.2, 6);
    // A tab is written in its own face: it counts.
    const tab = lineOf([run('ab', 0, 12), run('\t', 12, 4, { fontString: '40px "Big"' }), run('cd', 16, 12)]);
    expect(lineDescent(ctx, tab)).toBeCloseTo(40 * 0.2, 6);
  });

  it('never splits a ligature between pieces of a run', () => {
    const ctx = context();
    // "ofi": 360 twips natural, set at 18.1 px = 362: two characters a twip
    // wider, a block that would end between f and i at the start.
    const out = emitRun(ctx, run('ofi', 0, 18.1), lineOf([run('ofi', 0, 18.1)]));
    expect(out.pieces!.map((p) => [p.text, spacingOf(p.rPr)])).toEqual([['o', 0], ['fi', 1]]);
    expect(writtenTwips(out.pieces!)).toBe(362);
  });

  it('joins the pieces of a hyphenated word into one run spaced as a whole', () => {
    const ctx = context();
    const parts = [run('sig', 0, 18.2), run('nif', 18.2, 17.6), run('i', 35.8, 6.1), run('cant', 41.9, 23.9)];
    const l = lineOf(parts);
    const items = { kind: 'text', role: 'body', lines: [l] } as Extract<DisplayItem, { kind: 'text' }>;
    const [chunk] = planChunks([l], planLines(ctx, [l]));
    const out = emitGroups(ctx, items, chunk!.groups, 0, 100, { offsets: [0] });
    const runs = [...out.xml.matchAll(/<w:r>(<w:rPr>.*?<\/w:rPr>)<w:t xml:space="preserve">(.*?)<\/w:t><\/w:r>/g)].map((m) => ({ rPr: m[1]!, text: m[2]! }));
    expect(runs.map((r) => r.text).join('')).toBe('significant');
    expect(runs.some((r, i) => i > 0 && runs[i - 1]!.text.endsWith('f'))).toBe(false);
    expect(writtenTwips(runs)).toBe(1316);
    expect(out.text).toBe('significant');
    // A run of another style keeps its own run.
    const bold = lineOf([run('ab', 0, 12), run('cd', 12, 12, { color: '#f00' })]);
    const boldItems = { kind: 'text', role: 'body', lines: [bold] } as Extract<DisplayItem, { kind: 'text' }>;
    const [bc] = planChunks([bold], planLines(ctx, [bold]));
    expect(emitGroups(ctx, boldItems, bc!.groups, 0, 100, { offsets: [0] }).xml).toContain('FF0000');
  });

  it('writes a feature family in its base face with its figures', () => {
    const ctx = context({ plan: plan([['EB Garamond|400|normal', 'EB Garamond PTX']]) });
    expect(resolveFont(ctx, '16px "EB Garamond@onum"').family).toBe('EB Garamond PTX');
    const old = runProps(ctx, run('1', 0, 8, { fontString: '16px "EB Garamond@onum"' }), {});
    expect(old).toContain('w:ascii="EB Garamond PTX"');
    expect(old).toMatch(/<w14:ligatures [^>]*\/><w14:numForm w14:val="oldStyle"\/><\/w:rPr>$/);
    const tab = runProps(ctx, run('1', 0, 8, { fontString: '16px "EB Garamond@lnum+tnum"' }), {});
    expect(tab).toMatch(/<w14:numForm w14:val="lining"\/><w14:numSpacing w14:val="tabular"\/><\/w:rPr>$/);
    expect(runProps(ctx, run('1', 0, 8, { fontString: '16px "EB Garamond"' }), {})).not.toContain('numForm');
  });

  it('reads advances from a face\'s cmap and hmtx', () => {
    const head = new Uint8Array(54);
    head[18] = 0x03; head[19] = 0xe8; // 1000 units
    const hhea = new Uint8Array(36);
    hhea[35] = 2; // two long metrics
    const maxp = new Uint8Array(6);
    maxp[5] = 3; // three glyphs
    const hmtx = new ByteWriter().u16(0).i16(0).u16(600).i16(0).i16(0).finish();
    const cmap = writeCmap(new Map([[0x41, 1], [0x42, 2]]));
    const face = faceAdvancesOf({ flavor: 0x00010000, tables: new Map([['head', head], ['hhea', hhea], ['maxp', maxp], ['hmtx', hmtx], ['cmap', cmap]]) })!;
    expect(face.advances).toEqual([0, 600, 600]);
    expect(naturalEms(face, 'AB')).toBeCloseTo(1.2, 6);
    expect(naturalEms(face, 'AC')).toBeUndefined();
  });
});

describe('holders in a round trip (#1406)', () => {
  const MD = 'Key :swatch{color="#ff0000"} red here.\n';

  async function exported(): Promise<Uint8Array> {
    return formattedDocx({ docs: [build(MD, config())], chapters: [{ id: 'c', markdown: MD }], date: '2026-11-04T00:00:00Z', exportId: 'holders' });
  }

  it('reads a no-break space holder back as its swatch', async () => {
    const bytes = await exported();
    expect(documentXml(unzip(bytes))).toContain(`>${HOLDER}<`);
    const r = applyDocxEdits(bytes, { chapters: [{ id: 'c', markdown: MD }] });
    expect(r.edits).toEqual([]);
    expect(r.chapters[0]!.markdown).toBe(MD);
    const edited = unzip(bytes);
    edited['word/document.xml'] = strToU8(documentXml(edited).replace('here.', 'there.'));
    expect(applyDocxEdits(zipSync(edited), { chapters: [{ id: 'c', markdown: MD }] }).chapters[0]!.markdown).toBe(MD.replace('here', 'there'));
  });

  it('still reads a file written with the zero-width holder', async () => {
    const files = unzip(await exported());
    files['word/document.xml'] = strToU8(documentXml(files).replaceAll(`>${HOLDER}<`, `>${LEGACY_HOLDER}<`));
    for (const path of Object.keys(files)) {
      if (!/^customXml\/item\d+\.xml$/.test(path)) continue;
      const text = xmlPartText(files[path]!);
      if (!text.includes(EXPORT_MAP_ROOT)) continue;
      const map = decodeExportMap(text);
      for (const f of map.fragments) f.text = f.text.replaceAll(HOLDER, LEGACY_HOLDER);
      files[path] = strToU8(encodeExportMap(map));
    }
    expect(strFromU8(files['word/document.xml']!)).toContain(LEGACY_HOLDER);
    const r = applyDocxEdits(zipSync(files), { chapters: [{ id: 'c', markdown: MD }] });
    expect(r.edits).toEqual([]);
    expect(r.chapters[0]!.markdown).toBe(MD);
  });
});
