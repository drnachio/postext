import { describe, it, expect } from 'vitest';
import type { DisplayLine, DisplayRun } from '../../paint/displayList/types.js';
import { createDocxPackage } from '../ooxml/package.js';
import { xmlProblems } from '../ooxml/wellFormed.js';
import { WORDML_NAMESPACES } from '../ooxml/constants.js';
import { baselineOffset, faceMetricsOf, MetricsCache } from './metrics.js';
import { planChunks, planLines } from './paragraphs.js';
import { imageRun, sniffPicture, srcRect, svgWithInk, svgWithWordFonts } from './pictures.js';
import { condensedReading, readingEms, rubyXml } from './eastAsian.js';
import type { WordFontPlan } from '../fonts/types.js';
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

  it('reads Windows metrics and sets the baseline 4/5 down the line (#1444)', () => {
    const head = new Uint8Array(54);
    head[18] = 0x03; head[19] = 0xe8; // 1000 units
    const os2 = new Uint8Array(96);
    os2[74] = 0x03; os2[75] = 0x84; // win ascent 900
    os2[76] = 0x01; os2[77] = 0x2c; // win descent 300
    const m = faceMetricsOf({ flavor: 0x00010000, tables: new Map([['head', head], ['OS/2', os2]]) })!;
    expect(m).toEqual({ unitsPerEm: 1000, ascent: 900, descent: 300 });
    expect(baselineOffset(14)).toBeCloseTo(11.2, 6);
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
    for (const x of [rule, box!, path]) {
      expect(xmlProblems(wrap(x))).toEqual([]);
      // A plain shape, not an empty text box: Word hands the text of the
      // boxes on later pages to the wrong boxes otherwise (#1444).
      expect(x).toContain('<wps:cNvSpPr/>');
      expect(x).not.toContain('<wps:txbx>');
      expect(x).toMatch(/<\/wps:spPr><wps:bodyPr [^>]*lIns="0"[^>]*><a:noAutofit\/><\/wps:bodyPr><\/wps:wsp>/);
      // Behind the text layer, where LibreOffice keeps it under the text.
      expect(x).toContain('behindDoc="1"');
    }
    // Over something already in front (a picture's border): in front.
    ctx.front = [{ x: 0, y: 0, width: 40, height: 20 }];
    const [over] = rectRuns(ctx, { kind: 'rect', rect: { x: 0, y: 0, width: 40, height: 20 }, stroke: '#000', strokeWidthPx: 1 });
    expect(over).toContain('behindDoc="0"');
  });

  it('paints an SVG\'s currentColor in the ink of its text (#1444)', () => {
    // Word draws a currentColor stroke as nothing: a score lost its staves.
    const staff = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 5L10 5" stroke="currentColor"/><g fill="currentColor"/></svg>';
    expect(svgWithInk(staff, '#15171c')).toBe(staff.replace(/currentColor/g, '#15171c'));
    expect(svgWithInk(staff)).not.toContain('currentColor');
    // The SVG's own colour wins.
    const own = staff.replace('viewBox', 'color="#aa0000" viewBox');
    expect(svgWithInk(own, '#15171c')).toContain('stroke="#aa0000"');
    const plain = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" stroke="#000"/></svg>';
    expect(svgWithInk(plain, '#fff')).toBe(plain);
  });

  it('names the embedded fonts in an SVG\'s text (#1406)', async () => {
    const plan: WordFontPlan = {
      faces: [], warnings: [], altNames: new Map(),
      map: new Map([
        ['Geist|400|normal', { family: 'Geist PTX', bold: false, italic: false }],
        ['Geist|700|normal', { family: 'Geist PTX', bold: true, italic: false }],
        ['Geist|600|normal', { family: 'Geist SemiBold PTX', bold: false, italic: false }],
        ['Lora|400|italic', { family: 'Lora PTX', bold: false, italic: true }],
      ]),
    };
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.a { font-family: Lora, serif; font-style: italic }</style>' +
      `<text font-family="Geist, -apple-system, 'Segoe UI', sans-serif" font-weight="600">A</text>` +
      '<text font-family="Geist" font-weight="bold">B</text>' +
      `<text style="font-family: 'Geist'; font-size: 3px">C</text>` +
      `<text font-family="'Noto Serif SC', serif">中</text></svg>`;
    const out = svgWithWordFonts(svg, plan);
    expect(out).toContain(`.a { font-family: "Lora PTX", Lora, serif; font-style: italic }`);
    expect(out).toContain(`<text font-family="'Geist SemiBold PTX', Geist, -apple-system, 'Segoe UI', sans-serif" font-weight="400">A</text>`);
    expect(out).toContain(`<text font-family="'Geist PTX', Geist" font-weight="700">B</text>`);
    expect(out).toContain(`<text style="font-family: 'Geist PTX', 'Geist'; font-size: 3px">C</text>`);
    expect(out).toContain(`<text font-family="'Noto Serif SC', serif">`);
    expect(svgWithWordFonts(svg, undefined)).toBe(svg);
    // The embedded SVG carries the names, the fallback is drawn from the original.
    const rastered: string[] = [];
    const ctx = context({ plan, resourceBytes: () => new TextEncoder().encode(svg), rasterizeSvg: async (s) => { rastered.push(s); return PNG; } });
    await imageRun(ctx, { kind: 'image', rect: { x: 0, y: 0, width: 10, height: 10 }, fileId: 'f.svg' });
    expect(rastered).toEqual([svg]);
  });

  it('leaves @font-face alone and reads the weight across sources and the font shorthand (#1406)', () => {
    const plan: WordFontPlan = {
      faces: [], warnings: [], altNames: new Map(),
      map: new Map([
        ['Geist|400|normal', { family: 'Geist PTX', bold: false, italic: false }],
        ['Geist|700|normal', { family: 'Geist PTX', bold: true, italic: false }],
        ['Geist|600|normal', { family: 'Geist SemiBold PTX', bold: false, italic: false }],
      ]),
    };
    const face = `@font-face { font-family: "Geist"; font-weight: 600; src: url(data:font/woff2;base64,AAAA) }`;
    const out = svgWithWordFonts(`<svg><style>${face} text { font-family: Geist }</style></svg>`, plan);
    expect(out).toContain(face);
    expect(out).toContain(`text { font-family: "Geist PTX", Geist }`);
    expect(svgWithWordFonts(`<text style="font-family: Geist" font-weight="600">A</text>`, plan)).toBe(`<text style="font-family: 'Geist SemiBold PTX', Geist" font-weight="400">A</text>`);
    expect(svgWithWordFonts(`<text font-family="Geist" style="font-weight: 600">A</text>`, plan)).toBe(`<text font-family="'Geist SemiBold PTX', Geist" style="font-weight: 400">A</text>`);
    expect(svgWithWordFonts(`<text style="font: 600 12px Geist, sans-serif">A</text>`, plan)).toBe(`<text style="font: 400 12px 'Geist SemiBold PTX', Geist, sans-serif">A</text>`);
    expect(svgWithWordFonts(`<text font-family="Geist" font-weight="700">B</text>`, plan)).toBe(`<text font-family="'Geist PTX', Geist" font-weight="700">B</text>`);
  });

  it('sets the readings of one jukugo word at one size (#1406)', () => {
    const ctx = context({ lang: 'ja-JP' });
    const rtPr = '<w:rPr><w:sz w:val="12"/><w:szCs w:val="12"/></w:rPr>';
    const base = { x: 0, width: 12, fontString: '12px "X"', color: '#000', textStart: 0 };
    const to: DisplayRun = { ...base, text: '東', ruby: { text: 'とう', fontString: '6px "X"', position: 'over', id: 1 } };
    const kyo: DisplayRun = { ...base, x: 12, text: '京', ruby: { text: 'きょう', fontString: '6px "X"', position: 'over', id: 1 } };
    const line = { runs: [to, kyo] } as unknown as DisplayLine;
    const sz = (xml: string): string => /<w:hps w:val="(\d+)"\/>/.exec(xml)![1]!;
    const a = rubyXml(ctx, to, '東', '<w:rPr/>', rtPr, { base: 24, rt: 12 }, line);
    const b = rubyXml(ctx, kyo, '京', '<w:rPr/>', rtPr, { base: 24, rt: 12 }, line);
    expect(sz(a)).toBe('8');
    expect(sz(b)).toBe('8');
    expect(sz(rubyXml(ctx, to, '東', '<w:rPr/>', rtPr, { base: 24, rt: 12 }))).toBe('12');
  });

  it('sets a ruby reading longer than its base smaller (#1406)', () => {
    const ctx = context({ lang: 'ja-JP' });
    expect(readingEms('とうきょう')).toBe(5);
    expect(readingEms('dōng jīng')).toBeCloseTo(4.25, 6);
    const rtPr = '<w:rPr><w:rFonts w:ascii="X"/><w:color w:val="000000"/><w:kern w:val="1"/><w:sz w:val="12"/><w:szCs w:val="12"/></w:rPr>';
    // Five kana at 6 pt over a 12 pt base: 30 pt into 12 pt, set at 2.4 pt.
    expect(condensedReading(ctx, rtPr, 5, 12, 12)).toEqual({ sz: 4, rtPr: rtPr.replace(/w:val="12"/g, 'w:val="4"') });
    expect(condensedReading(ctx, rtPr.replace('<w:kern', '<w:w w:val="50"/><w:kern'), 4, 12, 12)).toBeUndefined();
    expect(condensedReading(ctx, rtPr, 2, 12, 12)).toBeUndefined();
    const run: DisplayRun = { text: '東', x: 0, width: 12, fontString: '12px "X"', color: '#000', textStart: 0, ruby: { text: 'とうきょう', fontString: '6px "X"', position: 'over' } };
    const xml = rubyXml(ctx, run, '東', '<w:rPr/>', rtPr, { base: 24, rt: 12 });
    expect(xml).toContain('<w:rubyAlign w:val="center"/><w:hps w:val="4"/>');
    expect(xml).toContain('<w:rt><w:r><w:rPr><w:rFonts w:ascii="X"/><w:color w:val="000000"/><w:kern w:val="1"/><w:sz w:val="4"/>');
    expect(ctx.warnings).toEqual(['ruby-overhang']);
    const short = rubyXml(ctx, { ...run, ruby: { ...run.ruby!, text: 'ひがし', group: true } }, '東', '<w:rPr/>', rtPr, { base: 24, rt: 12 });
    expect(short).toContain('<w:rubyAlign w:val="distributeSpace"/><w:hps w:val="8"/>');
    expect(rubyXml(ctx, { ...run, ruby: { ...run.ruby!, text: 'ね' } }, '東', '<w:rPr/>', rtPr, { base: 24, rt: 12 })).toContain('<w:hps w:val="12"/>');
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
