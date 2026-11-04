import { describe, it, expect } from 'vitest';
import type { DisplayLine, DisplayRun } from '../../paint/displayList/types.js';
import { createDocxPackage } from '../ooxml/package.js';
import { xmlProblems } from '../ooxml/wellFormed.js';
import { WORDML_NAMESPACES } from '../ooxml/constants.js';
import { baselineOffset, faceMetricsOf, MetricsCache } from './metrics.js';
import { planChunks, planLines } from './paragraphs.js';
import { imageRun, sniffPicture, srcRect } from './pictures.js';
import { HOLDER, emitRun } from './runs.js';
import { pathRun, rectRuns, ruleRun } from './shapes.js';
import { wordColor } from './units.js';
import type { WriterContext } from './types.js';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

function context(over: Partial<WriterContext> = {}): WriterContext & { warnings: string[] } {
  const warnings: string[] = [];
  return {
    pkg: createDocxPackage(), dpi: 72, plan: undefined, lang: 'en', metrics: new MetricsCache(undefined), chapters: [{ id: 'a', markdown: '' }],
    docIndex: 0, fragments: [], nextFragment: 0, parts: new Map(), referenced: new Set(), z: 0,
    warn: (code) => void warnings.push(code), resourceBytes: undefined, rasterizeSvg: undefined, media: new Map(), warnings, ...over,
  };
}

const wrap = (inner: string): string => `<w:document ${WORDML_NAMESPACES}><w:body><w:p>${inner}</w:p></w:body></w:document>`;

function line(text: string, over: Partial<DisplayLine> = {}): DisplayLine {
  const run: DisplayRun = { text, x: 10, width: 100, fontString: '12px "Lora"', color: '#000', textStart: 0 };
  return { text, x: 10, width: 100, baseline: 20, lineHeight: 14, align: 'justify', runs: [run], map: text.split('').map((_, i) => i), ...over };
}

describe('formatted Word graphics and helpers (#1392)', () => {
  it('reads CSS colours as Word hex and alpha', () => {
    expect(wordColor('#abc')).toEqual({ hex: 'AABBCC', alpha: 1 });
    expect(wordColor('#11223380')!.alpha).toBeCloseTo(0x80 / 255, 6);
    expect(wordColor('rgba(255, 0, 0, 0.5)')).toEqual({ hex: 'FF0000', alpha: 0.5 });
    expect(wordColor('transparent')).toBeUndefined();
  });

  it('crops a picture by its safe area and sniffs formats', () => {
    expect(srcRect({ x: 0.1, y: 0.2, width: 0.5, height: 0.6 })).toBe('<a:srcRect l="10000" t="20000" r="40000" b="20000"/>');
    expect(srcRect({ x: 0, y: 0, width: 1, height: 1 })).toBe('');
    expect(sniffPicture(PNG)).toBe('png');
    expect(sniffPicture(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('svg');
    expect(sniffPicture(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeUndefined();
  });

  it('places the baseline by the face descent', () => {
    const head = new Uint8Array(54);
    head[18] = 0x03; head[19] = 0xe8; // 1000 units
    const os2 = new Uint8Array(96);
    os2[74] = 0x03; os2[75] = 0x84; // win ascent 900
    os2[76] = 0x01; os2[77] = 0x2c; // win descent 300
    const m = faceMetricsOf({ flavor: 0x00010000, tables: new Map([['head', head], ['OS/2', os2]]) })!;
    expect(m).toEqual({ unitsPerEm: 1000, ascent: 900, descent: 300 });
    expect(baselineOffset(14, 12 * 0.3)).toBeCloseTo(10.4, 6);
    expect(new MetricsCache(undefined).descentPx('16px "X"')).toBeCloseTo(3.2, 6);
  });

  it('draws rules, rounded boxes and paths as shapes', () => {
    const ctx = context();
    const rule = ruleRun(ctx, { kind: 'rule', x1: 0, y1: 10, x2: 10, y2: 0, color: '#000', widthPx: 1, dash: [3, 2] });
    expect(rule).toContain('prst="line"');
    expect(rule).toContain('flipV="1"');
    expect(rule).toContain('<a:custDash><a:ds d="300000" sp="200000"/></a:custDash>');
    const [box] = rectRuns(ctx, { kind: 'rect', rect: { x: 0, y: 0, width: 40, height: 20 }, fill: '#ff000080', stroke: '#00f', strokeWidthPx: 2, radius: 5 });
    expect(box).toContain('prst="roundRect"');
    expect(box).toContain('<a:gd name="adj" fmla="val 25000"/>');
    expect(box).toContain('<a:alpha val="50196"/>');
    const path = pathRun(ctx, { kind: 'path', bbox: { x: 10, y: 10, width: 20, height: 20 }, subpaths: [[{ op: 'M', x: 10, y: 10 }, { op: 'C', x1: 15, y1: 10, x2: 30, y2: 15, x: 30, y: 30 }, { op: 'Q', x1: 20, y1: 30, x: 10, y: 20 }, { op: 'Z' }]], fill: '#0f0' });
    expect(path).toContain('<a:moveTo><a:pt x="0" y="0"/></a:moveTo>');
    expect(path).toContain('<a:cubicBezTo>');
    expect(path).toContain('<a:quadBezTo>');
    expect(path).toContain('stroke="0"');
    for (const x of [rule, box!, path]) expect(xmlProblems(wrap(x))).toEqual([]);
  });

  it('embeds an SVG with a rasterised PNG fallback, and leaves out a missing file', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
    const asked: number[][] = [];
    const ctx = context({
      resourceBytes: (id) => (id === 'a.svg' ? new TextEncoder().encode(svg) : undefined),
      rasterizeSvg: async (_s, w, h) => { asked.push([w, h]); return PNG; },
    });
    const run = await imageRun(ctx, { kind: 'image', rect: { x: 0, y: 0, width: 72, height: 36 }, fileId: 'a.svg', imageKind: 'svg', rotate: 90, alt: 'A' });
    expect(run).toContain('<asvg:svgBlip r:embed=');
    expect(run).toContain('rot="5400000"');
    expect(asked).toEqual([[600, 300]]);
    expect(xmlProblems(wrap(run))).toEqual([]);
    expect(await imageRun(ctx, { kind: 'image', rect: { x: 0, y: 0, width: 1, height: 1 }, fileId: 'gone.png' })).toBe('');
    expect(ctx.warnings).toContain('picture-missing');
  });

  it('keeps embedded content\'s width with spaced holders', () => {
    const ctx = context();
    const l = line('x');
    const run: DisplayRun = { text: 'x', x: 30, width: 20, fontString: '12px "Lora"', color: '#000', textStart: 0, inline: { kind: 'math', svg: '<svg/>', widthPx: 20, heightPx: 10, ascentPx: 8 } };
    const out = emitRun(ctx, run, l);
    expect(out.text).toBe(HOLDER);
    // 20 px = 400 twips, less the holder's own advance (a quarter em of an
    // unknown face: 3 pt).
    expect(out.rPr).toContain('<w:spacing w:val="340"/>');
    expect(out.drawing!.rect).toEqual({ x: 30, y: 12, width: 20, height: 10 });
    const space = emitRun(ctx, { text: ' ', x: 0, width: 4, fontString: '12px "Lora"', color: '#000', textStart: 0, space: true }, l);
    expect(space.rPr).toContain('<w:spacing w:val="-2"/>');
  });

  it('cuts lines into paragraphs and boxes', () => {
    const ctx = context();
    // A paragraph whose first two lines are indented (a drop cap), a
    // hard-broken ragged line, then justified lines and the last.
    const lines = [
      line('one', { x: 30, width: 80, baseline: 20 }),
      line('two', { x: 30, width: 80, baseline: 34 }),
      line('three', { baseline: 48 }),
      line('four', { baseline: 62, align: 'left', hardBreak: true }),
      line('five', { baseline: 76 }),
      line('six', { baseline: 90, align: 'left', last: true }),
    ];
    const plans = planLines(ctx, lines);
    expect(plans.slice(1).every((p) => p.h === 280)).toBe(true);
    const chunks = planChunks(lines, plans);
    // Justified groups ending in a break start a new box.
    expect(chunks.map((c) => [c.from, c.to])).toEqual([[0, 1], [2, 5]]);
    expect(chunks[1]!.groups.map((g) => [g.from, g.to, g.jc])).toEqual([[2, 3, 'both'], [4, 5, 'both']]);
    expect(chunks[0]!.groups[0]!.endsWithBreak).toBe(true);
    expect(chunks[1]!.groups[1]!.endsWithBreak).toBe(false);
  });
});
