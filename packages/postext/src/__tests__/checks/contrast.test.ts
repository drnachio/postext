import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { readFileSync as readFile } from 'node:fs';
import { buildDocument } from '../../pipeline/index.js';
import {
  blendColors,
  contrastDocument,
  contrastMedia,
  contrastPairs,
  contrastRatio,
  contrastThreshold,
  isLargeText,
  printContrastRatio,
  printLuminance,
  relativeLuminance,
  type ContrastIssue,
} from '../../checks/contrast.js';
import { resolveContrastConfig, stripContrastDefaults } from '../../defaults/output/contrast.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import { outputTransform, parseIccProfile } from '../../color/index.js';
import type { PostextConfig } from '../../types.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const readFileSync = readFile as (path: URL) => Uint8Array;
const profile = (id: string) => outputTransform(parseIccProfile(readFileSync(new URL(`../../../icc/${id}.icc`, import.meta.url))));
const fogra39 = profile('fogra39');
const newsprint = profile('ifra26');

function config(extra: PostextConfig = {}): PostextConfig {
  return {
    page: { width: mm(150), height: mm(200), dpi: 300, margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    ...extra,
  };
}

const low = (issues: ContrastIssue[]) => issues.filter((i): i is Extract<ContrastIssue, { kind: 'lowContrast' }> => i.kind === 'lowContrast');
const reversed = (issues: ContrastIssue[]) => issues.filter((i): i is Extract<ContrastIssue, { kind: 'reversedText' }> => i.kind === 'reversedText');

describe('contrast measures', () => {
  it('gives the WCAG ratio of two colours', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5);
    // The grey at the AA boundary on white.
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5);
    // The ochre of the guide's Part II.
    expect(contrastRatio('#b7820f', '#ffffff')).toBeCloseTo(3.4, 1);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6);
  });

  it('sets the threshold by level, size and weight', () => {
    expect(isLargeText(18)).toBe(true);
    expect(isLargeText(17.9)).toBe(false);
    expect(isLargeText(14, 700)).toBe(true);
    expect(isLargeText(14, 600)).toBe(false);
    expect(contrastThreshold('AA', false)).toBe(4.5);
    expect(contrastThreshold('AA', true)).toBe(3);
    expect(contrastThreshold('AAA', false)).toBe(7);
    expect(contrastThreshold('AAA', true)).toBe(4.5);
  });

  it('blends a translucent colour with what is under it', () => {
    expect(blendColors('#00000080', '#ffffff')).toBe('#7f7f7f');
    expect(blendColors('#123456', '#ffffff')).toBe('#123456');
    expect(blendColors('transparent', '#abcdef')).toBe('#abcdef');
  });

  it('reads a lower contrast on newsprint than on coated paper', () => {
    const coated = printContrastRatio('#000000', '#ffffff', { transform: fogra39 });
    const news = printContrastRatio('#000000', '#ffffff', { transform: newsprint });
    expect(coated).toBeGreaterThan(7);
    expect(news).toBeLessThan(coated);
    expect(news).toBeLessThan(contrastRatio('#000000', '#ffffff'));
    // Paper is the white of the page; ink is not a perfect black, and on
    // newsprint it is a lighter one.
    expect(printLuminance('#ffffff', { transform: newsprint })).toBeCloseTo(1, 2);
    expect(printLuminance('#ffffff', { transform: fogra39 })).toBeCloseTo(1, 2);
    expect(printLuminance('#000000', { transform: fogra39 })).toBeGreaterThan(0.01);
    expect(printLuminance('#000000', { transform: newsprint })).toBeGreaterThan(printLuminance('#000000', { transform: fogra39 }));
    // Black text still reads at AA on newsprint, and at AAA on coated paper.
    expect(news).toBeGreaterThan(4.5);
    expect(news).toBeLessThan(7);
  });

  it('prints an authored CMYK as written', () => {
    const authored = new Map([['#808080', { c: 0, m: 0, y: 0, k: 100 }]]);
    expect(printLuminance('#808080', { transform: fogra39, authored })).toBeCloseTo(printLuminance('#000000', { transform: fogra39, authored: new Map([['#000000', { c: 0, m: 0, y: 0, k: 100 }]]) }), 6);
  });
});

describe('contrast config', () => {
  it('resolves to AA, auto, reversed text at 8 and 12 pt', () => {
    expect(resolveContrastConfig()).toEqual({
      enabled: true, level: 'AA', mode: 'auto',
      reversedText: { enabled: true, minSize: pt(8), minFineSize: pt(12), lightWeight: 300 },
      allow: [],
    });
    expect(resolveContrastConfig({ level: 'AAA', mode: 'both' }).level).toBe('AAA');
    expect(stripContrastDefaults({ level: 'AA', mode: 'auto', reversedText: { minSize: pt(8) } })).toBeUndefined();
    expect(stripContrastDefaults({ level: 'AAA', reversedText: { minSize: pt(9) } })).toEqual({ level: 'AAA', reversedText: { minSize: pt(9) } });
  });

  it('reports a level or a mode it does not know, and reads the default', () => {
    const bad = { contrast: { level: 'A', mode: 'paper' } } as unknown as PostextConfig;
    expect(collectConfigWarnings(bad)).toEqual([
      { kind: 'unknownConfigValue', path: 'contrast.level', value: 'A', used: 'AA' },
      { kind: 'unknownConfigValue', path: 'contrast.mode', value: 'paper', used: 'auto' },
    ]);
    expect(resolveContrastConfig(bad.contrast)).toMatchObject({ level: 'AA', mode: 'auto' });
  });

  it('is carried by the document only when set', () => {
    expect(resolveAllConfig(config()).contrast).toBeUndefined();
    expect(resolveAllConfig(config({ contrast: { level: 'AAA' } })).contrast?.level).toBe('AAA');
  });

  it('checks print for a book set up for print', () => {
    expect(contrastMedia(resolveAllConfig(config()))).toEqual(['screen']);
    expect(contrastMedia(resolveAllConfig(config({ print: { standard: 'pdfx4' } })))).toEqual(['screen', 'print']);
    expect(contrastMedia(resolveAllConfig(config({ pdfGeneration: { forceColorSpace: true, colorSpace: 'cmyk' } })))).toEqual(['screen', 'print']);
    expect(contrastMedia(resolveAllConfig(config({ contrast: { mode: 'print' } })))).toEqual(['print']);
    expect(contrastMedia(resolveAllConfig(config({ print: { standard: 'pdfx4' }, contrast: { mode: 'screen' } })))).toEqual(['screen']);
  });
});

describe('contrastDocument', () => {
  const body = (color: string, extra: PostextConfig = {}) => config({ bodyText: { color: hex(color), fontSize: pt(10), lineHeight: pt(14) }, ...extra });

  it('passes black text on white paper', () => {
    expect(contrastDocument(buildDocument({ markdown: 'Plain text on paper.' }, body('#000000')))).toEqual([]);
  });

  it('reports the ochre of the guide on white, with its ratio and threshold', () => {
    const doc = buildDocument({ markdown: 'A standfirst set in ochre.\n\nAnd a second paragraph in it.' }, body('#b7820f'));
    const issues = low(contrastDocument(doc));
    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue).toMatchObject({ color: '#b7820f', background: '#ffffff', required: 4.5, level: 'AA', large: false, failing: ['screen'], role: 'body', pageIndex: 0, sizePt: 10, weight: 400 });
    expect(issue.screen).toBeCloseTo(3.4, 1);
    expect(issue.print).toBeUndefined();
    // One finding for the pair, counting every line set so.
    expect(issue.count).toBeGreaterThanOrEqual(2);
    expect(issue.text).toBe('A standfirst set in ochre.');
    expect(issue.sourceStart).toBe(0);
  });

  it('asks less of large text, and more at AAA', () => {
    // 3.4:1 passes AA at 18 pt and fails AAA there.
    const large = config({ bodyText: { color: hex('#b7820f'), fontSize: pt(18), lineHeight: pt(24) } });
    expect(contrastDocument(buildDocument({ markdown: 'Large ochre.' }, large))).toEqual([]);
    const aaa = low(contrastDocument(buildDocument({ markdown: 'Large ochre.' }, { ...large, contrast: { level: 'AAA' } })));
    expect(aaa).toHaveLength(1);
    expect(aaa[0]).toMatchObject({ required: 4.5, level: 'AAA', large: true });
    // A grey that passes AA (4.54:1) fails AAA as body text.
    const grey = low(contrastDocument(buildDocument({ markdown: 'Grey.' }, body('#767676', { contrast: { level: 'AAA' } }))));
    expect(grey[0]).toMatchObject({ required: 7 });
    expect(contrastDocument(buildDocument({ markdown: 'Grey.' }, body('#767676')))).toEqual([]);
  });

  it('counts bold from 14 pt as large', () => {
    const cfg = config({
      bodyText: { color: hex('#000000'), fontSize: pt(10), lineHeight: pt(14) },
      headings: { levels: [{ level: 1, fontSize: pt(14), fontWeight: 700, color: hex('#b7820f') }, { level: 2, fontSize: pt(14), fontWeight: 400, color: hex('#b7820f') }] },
    });
    const issues = low(contrastDocument(buildDocument({ markdown: '# Bold title\n\nText.\n\n## Regular title\n\nText.' }, cfg)));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ role: 'heading', weight: 400, text: 'Regular title' });
  });

  it('reads the page colour as the ground', () => {
    const cfg = body('#ffffff', { page: { width: mm(150), height: mm(200), dpi: 300, backgroundColor: hex('#1a1a1a'), margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } } });
    expect(contrastDocument(buildDocument({ markdown: 'White on near black.' }, cfg))).toEqual([]);
    const dark = body('#333333', { page: { width: mm(150), height: mm(200), dpi: 300, backgroundColor: hex('#1a1a1a'), margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } } });
    expect(low(contrastDocument(buildDocument({ markdown: 'Dark on near black.' }, dark)))[0]).toMatchObject({ background: '#1a1a1a' });
  });

  it('reads a box as the ground of the text inside it', () => {
    const cfg = body('#000000', {
      calloutStyles: [{ id: 'note', name: 'Note', backgroundEnabled: true, background: hex('#102a43'), body: { color: hex('#243b53') } }],
    });
    const doc = buildDocument({ markdown: 'Before the box.\n\n:::callout{type="note"}\nInside the dark box.\n:::\n\nAfter it.' }, cfg);
    const issues = low(contrastDocument(doc));
    expect(issues.some((i) => i.background === '#102a43' && i.color === '#243b53')).toBe(true);
    // The text outside it stays on the paper.
    const pairs = contrastPairs(doc);
    expect(pairs.some((p) => p.color === '#000000' && p.background === '#ffffff')).toBe(true);
    expect(pairs.some((p) => p.color === '#000000' && p.background === '#102a43')).toBe(false);
  });

  it('reads inline colours: bold, italic and their own', () => {
    const cfg = config({ bodyText: { color: hex('#000000'), boldColor: hex('#dddddd'), fontSize: pt(10), lineHeight: pt(14) } });
    const issues = low(contrastDocument(buildDocument({ markdown: 'Plain and **pale bold** text.' }, cfg)));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ color: '#dddddd', weight: 700 });
  });

  it('blends a translucent text colour with its ground', () => {
    const issues = low(contrastDocument(buildDocument({ markdown: 'Half black.' }, body('#00000080'))));
    expect(issues[0]).toMatchObject({ color: '#7f7f7f', background: '#ffffff' });
  });

  it('reads the text of running heads', () => {
    const cfg = body('#000000', {
      header: { elements: [{ id: 'head', kind: 'text', content: 'Running head', color: hex('#cccccc'), fontSize: pt(8), placement: { anchor: { to: 'container', edge: 'top-left' } } }] },
    } as unknown as PostextConfig);
    const issues = low(contrastDocument(buildDocument({ markdown: 'Text.' }, cfg)));
    expect(issues.some((i) => i.role === 'runningHead' && i.color === '#cccccc')).toBe(true);
  });

  it('reads a design text on the box painted under it, wherever it stands on the page', () => {
    // A band across the foot of the page with a white folio on it: the
    // lines of a design text carry page baselines, not offsets in its box.
    const cfg = body('#000000', {
      footer: { elements: [
        { id: 'band', kind: 'box', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(300), height: pt(20) } }, style: { backgroundColor: hex('#102a43') } },
        { id: 'folio', kind: 'text', content: 'Page {pageNumber}', color: hex('#ffffff'), fontSize: pt(8), placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: pt(4), y: pt(4) } } },
      ] },
      header: { elements: [{ id: 'head', kind: 'text', content: 'Running head', color: hex('#333333'), fontSize: pt(8), placement: { anchor: { to: 'container', edge: 'top-left' } } }] },
    } as unknown as PostextConfig);
    const doc = buildDocument({ markdown: 'Text.' }, cfg);
    const pairs = contrastPairs(doc);
    expect(pairs.find((p) => p.color === '#ffffff')).toMatchObject({ background: '#102a43', groundColor: '#102a43', role: 'runningHead' });
    // The running head at the top stays on the paper.
    expect(pairs.find((p) => p.color === '#333333')).toMatchObject({ background: '#ffffff' });
    expect(contrastDocument(doc)).toEqual([]);
  });

  it('gives every pair with its ratio, passing or not, whatever `enabled` says', () => {
    const doc = buildDocument({ markdown: 'Ochre.' }, body('#b7820f', { contrast: { enabled: false } }));
    expect(contrastDocument(doc)).toEqual([]);
    const pairs = contrastPairs(doc);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ color: '#b7820f', textColor: '#b7820f', background: '#ffffff', groundColor: '#ffffff', required: 4.5 });
    expect(pairs[0]!.print).toBeUndefined();
    expect(contrastPairs(doc, { transform: fogra39 })[0]!.print).toBeGreaterThan(1);
  });

  it('checks print only for a print job, on the paper of its profile', () => {
    // 5.3:1 on screen; on newsprint the same grey falls under 4.5:1.
    const grey = '#6b6b6b';
    expect(contrastRatio(grey, '#ffffff')).toBeGreaterThan(4.5);
    const screenOnly = buildDocument({ markdown: 'Grey text.' }, body(grey));
    expect(contrastDocument(screenOnly, { transform: newsprint })).toEqual([]);
    const job = buildDocument({ markdown: 'Grey text.' }, body(grey, { print: { standard: 'pdfx4', outputProfile: 'ifra26' } }));
    const issues = low(contrastDocument(job, { transform: newsprint }));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.failing).toEqual(['print']);
    expect(issues[0]!.screen).toBeGreaterThan(4.5);
    expect(issues[0]!.print).toBeLessThan(4.5);
    // Without the profile's transform the print ratio is not known.
    expect(low(contrastDocument(job))).toEqual([]);
  });

  it('reports reversed text that is small, italic or light, whatever its ratio', () => {
    const ground = { page: { width: mm(150), height: mm(200), dpi: 300, backgroundColor: hex('#1b3a6b'), margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } }, print: { standard: 'pdfx4' as const } };
    const small = buildDocument({ markdown: 'Small white text and *an italic* in it.' }, config({ bodyText: { color: hex('#ffffff'), italicColor: hex('#ffffff'), fontSize: pt(7), lineHeight: pt(10) }, ...ground }));
    const found = reversed(contrastDocument(small, { transform: fogra39 }));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ color: '#ffffff', background: '#1b3a6b', sizePt: 7 });
    expect(found[0]!.reasons).toEqual(expect.arrayContaining(['small', 'italic']));
    expect(found[0]!.inks).toBeGreaterThan(1);
    expect(low(contrastDocument(small, { transform: fogra39 }))).toEqual([]);
    // At 10 pt the upright text passes; the italic is still under 12 pt.
    const ten = buildDocument({ markdown: 'White text and *an italic* in it.' }, config({ bodyText: { color: hex('#ffffff'), italicColor: hex('#ffffff'), fontSize: pt(10), lineHeight: pt(14) }, ...ground }));
    expect(reversed(contrastDocument(ten, { transform: fogra39 }))[0]).toMatchObject({ reasons: ['italic'], minimumPt: 12, italic: true });
    // A light weight counts like an italic.
    const light = buildDocument({ markdown: 'Light white text.' }, config({ bodyText: { color: hex('#ffffff'), fontSize: pt(10), lineHeight: pt(14), fontWeight: 300 }, ...ground }));
    expect(reversed(contrastDocument(light, { transform: fogra39 }))[0]).toMatchObject({ reasons: ['light'] });
    // At 12 pt nothing is reported, nor on screen, nor with the check off.
    const twelve = buildDocument({ markdown: 'White text and *an italic* in it.' }, config({ bodyText: { color: hex('#ffffff'), italicColor: hex('#ffffff'), fontSize: pt(12), lineHeight: pt(16) }, ...ground }));
    expect(contrastDocument(twelve, { transform: fogra39 })).toEqual([]);
    expect(reversed(contrastDocument(small, { transform: fogra39, media: ['screen'] }))).toEqual([]);
    const off = buildDocument({ markdown: 'Small white text.' }, config({ bodyText: { color: hex('#ffffff'), fontSize: pt(7), lineHeight: pt(10) }, ...ground, contrast: { reversedText: { enabled: false } } }));
    expect(contrastDocument(off, { transform: fogra39 })).toEqual([]);
    // Dark text on paper is not reversed.
    const dark = buildDocument({ markdown: 'Small dark text.' }, config({ bodyText: { color: hex('#000000'), fontSize: pt(6), lineHeight: pt(9) }, print: { standard: 'pdfx4' } }));
    expect(contrastDocument(dark, { transform: fogra39 })).toEqual([]);
  });
});
