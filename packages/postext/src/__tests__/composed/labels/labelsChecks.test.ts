import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { formatWarning } from '../../../pipeline/contentWarnings.js';
import { figureLabelBounds, overlappingLabels, polygonPenetration } from '../../../composed/labels.js';
import { contrastDocument, contrastPairs } from '../../../checks/contrast.js';
import { renderPageToCanvas } from '../../../index.js';
import { renderToHtmlIndexed } from '../../../html-backend/html-backend.js';
import { preflightDocument } from '../../../checks/preflight.js';
import type { ContentWarning, PostextConfig, Resource, VDTDocument } from '../../../index.js';

// #902: checks on the labels of a figure (overlap, overflow).

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
    const em = m ? Number(m[1]) : 10;
    return { width: [...s].length * em * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });
const px = (value: number) => ({ value, unit: 'px' as const });
const PAGE: PostextConfig = {
  page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  bodyText: { fontSize: px(20) } as never,
  labelStyles: [
    { id: 'small', fontSize: px(10) },
    { id: 'tight', fontSize: px(10), minScale: 0.5 },
  ],
};
const MAP: Resource = {
  id: 'mapa', typeId: 'figure', kind: 'bitmap', altText: 'A map', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'mapa.png', format: 'png', width: 400, height: 300 },
  anchors: [
    { id: 'a', x: 0.2, y: 0.5, style: 'small' },
    // 8 px right of a: the two words (60 px wide at 10 px) meet.
    { id: 'b', x: 0.22, y: 0.5, style: 'small' },
    { id: 'far', x: 0.8, y: 0.2, style: 'small' },
    { id: 'below', x: 0.2, y: 0.5 + 12 / 300, style: 'small' },
    { id: 'narrow', x: 0.6, y: 0.8, width: 0.04, style: 'tight' },
    { id: 'wide', x: 0.5, y: 0.9, width: 0.5, style: 'small' },
  ],
};
const figure = (...labels: string[]) => [':::figure{resource="mapa"}', ...labels, ':::', ''].join('\n');
const MAP_B: Resource = { ...MAP, id: 'mapb' };
const build = (markdown: string, config: PostextConfig = {}): VDTDocument =>
  buildDocument({ markdown, resources: [MAP, MAP_B] }, { ...PAGE, ...config }, createMeasurementCache());
const kinds = (doc: VDTDocument, ...wanted: string[]) => (doc.contentWarnings ?? []).filter((w) => wanted.includes(w.kind));

describe('overlapping labels (#902)', () => {
  it('measures how far two convex shapes run into each other', () => {
    const square = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
    expect(polygonPenetration(square(0, 0, 10), square(8, 0, 10))).toBeCloseTo(2, 6);
    expect(polygonPenetration(square(0, 0, 10), square(10, 0, 10))).toBe(0);
    expect(polygonPenetration(square(0, 0, 10), square(30, 30, 4))).toBe(0);
    // A diamond (a square turned 45°) against a square.
    const diamond: [number, number][] = [[13, 5], [18, 10], [13, 15], [8, 10]];
    expect(polygonPenetration(square(0, 0, 10), diamond)).toBeGreaterThan(0);
  });

  it('reports the later of two labels whose words meet, with the earlier one it meets', () => {
    const md = figure('::label[Madrid]{at="a"}', '::label[Toledo]{at="b"}', '::label[Oslo]{at="far"}');
    const doc = build(md, { locale: 'es' } as PostextConfig);
    const found = kinds(doc, 'labelOverlap') as Extract<ContentWarning, { kind: 'labelOverlap' }>[];
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ resourceId: 'mapa', text: 'Toledo', anchor: 'b', with: 'Madrid', withAnchor: 'a', count: 1, locale: 'es', pageIndex: 0 });
    expect(md.slice(found[0]!.sourceStart, found[0]!.sourceEnd)).toBe('Toledo');
    expect(formatWarning(found[0]!)).toContain('runs into "Madrid"');
  });

  it('counts every earlier label a label meets', () => {
    const doc = build(figure('::label[Madrid]{at="a"}', '::label[Toledo]{at="b"}', '::label[Avila]{at="a"}'));
    const found = kinds(doc, 'labelOverlap') as Extract<ContentWarning, { kind: 'labelOverlap' }>[];
    expect(found.map((w) => [w.text, w.count])).toEqual([['Toledo', 1], ['Avila', 2]]);
  });

  it('is quiet for labels apart, touching, or on lines that leave each other free', () => {
    expect(kinds(build(figure('::label[Madrid]{at="a"}', '::label[Oslo]{at="far"}')), 'labelOverlap')).toEqual([]);
    // 12 px below: the next line box starts where the first ends (11.5 px).
    expect(kinds(build(figure('::label[Madrid]{at="a"}', '::label[Toledo]{at="below"}')), 'labelOverlap')).toEqual([]);
  });

  it('lets two names stand one under the other at a leading tighter than the label’s own pitch', () => {
    // `below` is 12 px under `a`: the 11.5 px line boxes touch; 9 px apart they overlap by
    // 2.5 px of box, which is margin, not ink.
    const tight: Resource = { ...MAP, id: 'mapa', anchors: [{ id: 'los', x: 0.2, y: 0.5, style: 'small' }, { id: 'angeles', x: 0.2, y: 0.5 + 9 / 300, style: 'small' }] };
    const doc = buildDocument({ markdown: figure('::label[Los]{at="los"}', '::label[Angeles]{at="angeles"}'), resources: [tight, MAP_B] }, PAGE, createMeasurementCache());
    expect(kinds(doc, 'labelOverlap')).toEqual([]);
    // Four px apart they really run into each other.
    const close: Resource = { ...tight, anchors: [tight.anchors![0]!, { id: 'angeles', x: 0.2, y: 0.5 + 4 / 300, style: 'small' }] };
    const doc2 = buildDocument({ markdown: figure('::label[Los]{at="los"}', '::label[Angeles]{at="angeles"}'), resources: [close, MAP_B] }, PAGE, createMeasurementCache());
    expect(kinds(doc2, 'labelOverlap')).toHaveLength(1);
  });

  it('is checked in each edition: longer words in one language meet where the short ones do not', () => {
    const short = build(figure('::label[M]{at="a"}', '::label[T]{at="b"}'));
    const long = build(figure('::label[Madrid]{at="a"}', '::label[Toledo]{at="b"}'));
    expect(kinds(short, 'labelOverlap')).toEqual([]);
    expect(kinds(long, 'labelOverlap')).toHaveLength(1);
  });

  it('works on the labels of a layout directly', () => {
    const doc = build(figure('::label[Madrid]{at="a"}', '::label[Toledo]{at="b"}'));
    const block = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].find((b) => b.resourceBlock?.resource.id === 'mapa')!;
    expect([...overlappingLabels(block.resourceBlock!.labels!)]).toEqual([[1, [0]]]);
  });
});

describe('overlap the source prints that way (#977)', () => {
  const withAnchors = (anchors: NonNullable<Resource['anchors']>, labelStyles?: PostextConfig['labelStyles']) => {
    const dense: Resource = { ...MAP, anchors };
    return buildDocument(
      { markdown: figure('::label[Madrid]{at="a"}', '::label[Toledo]{at="b"}', '::label[Oslo]{at="far"}'), resources: [dense, MAP_B] },
      labelStyles ? { ...PAGE, labelStyles } : PAGE,
      createMeasurementCache(),
    );
  };
  const A = { id: 'a', x: 0.2, y: 0.5, style: 'small' };
  const B = { id: 'b', x: 0.22, y: 0.5, style: 'small' };
  const FAR = { id: 'far', x: 0.8, y: 0.2, style: 'small' };

  it('reports the pair by default', () => {
    expect(kinds(withAnchors([A, B, FAR]), 'labelOverlap')).toHaveLength(1);
  });

  it('leaves a pair alone when the later anchor says overlap: "allow"', () => {
    expect(kinds(withAnchors([A, { ...B, overlap: 'allow' }, FAR]), 'labelOverlap')).toEqual([]);
  });

  it('leaves it alone when the earlier anchor allows it too, since the overlap is that label’s as much as the other’s', () => {
    expect(kinds(withAnchors([{ ...A, overlap: 'allow' }, B, FAR]), 'labelOverlap')).toEqual([]);
  });

  it('keeps reporting the pairs of labels that do not allow it', () => {
    const doc = buildDocument(
      { markdown: figure('::label[Madrid]{at="a"}', '::label[Toledo]{at="b"}', '::label[Avila]{at="c"}'), resources: [{ ...MAP, anchors: [A, { ...B, overlap: 'allow' }, { id: 'c', x: 0.21, y: 0.5, style: 'small' }] }, MAP_B] },
      PAGE,
      createMeasurementCache(),
    );
    const found = kinds(doc, 'labelOverlap') as Extract<ContentWarning, { kind: 'labelOverlap' }>[];
    // Avila meets Madrid (allowed by neither), not only Toledo.
    expect(found.map((w) => w.text)).toEqual(['Avila']);
    expect(found[0]!.with).toBe('Madrid');
    expect(found[0]!.count).toBe(1);
  });

  it('reads the choice from the label style too, for every label set in it', () => {
    const styles = [{ id: 'small', fontSize: px(10), overlap: 'allow' as const }, { id: 'tight', fontSize: px(10), minScale: 0.5 }];
    expect(kinds(withAnchors([A, B, FAR], styles), 'labelOverlap')).toEqual([]);
  });

  it('lets a label that names its own style win over its anchor’s', () => {
    const styles = [{ id: 'small', fontSize: px(10) }, { id: 'tight', fontSize: px(10), overlap: 'allow' as const }];
    const doc = buildDocument(
      { markdown: figure('::label[Madrid]{at="a"}', '::label[Toledo]{at="b" style="tight"}'), resources: [{ ...MAP, anchors: [A, B] }, MAP_B] },
      { ...PAGE, labelStyles: styles },
      createMeasurementCache(),
    );
    expect(kinds(doc, 'labelOverlap')).toEqual([]);
  });

  it('rejects an overlap value it does not know in the configuration check', () => {
    const doc = withAnchors([A, B, FAR], [{ id: 'small', fontSize: px(10), overlap: 'permit' as never }]);
    const found = (doc.configWarnings ?? []).filter((w) => w.path.endsWith('/overlap'));
    expect(found).toHaveLength(1);
  });
});

describe('labels against the symbols of a picture (#969)', () => {
  // `avoid` zones are the symbols' boxes, in fractions of the picture (400 × 300 px at 1:1 in these tests).
  const withZones = (avoid: { x: number; y: number; width: number; height: number }[], anchors = MAP.anchors, markdown = figure('::label[Madrid]{at="a"}')) =>
    buildDocument({ markdown, resources: [{ ...MAP, anchors, avoid }, MAP_B] }, PAGE, createMeasurementCache());
  const symbols = (doc: VDTDocument) => (doc.contentWarnings ?? []).filter((w) => w.kind === 'labelOverlap' && w.withSymbol !== undefined) as Extract<ContentWarning, { kind: 'labelOverlap' }>[];

  it('reports a label that runs onto a symbol, naming the symbol', () => {
    // The word at a (80, 150 px) is about 35 px wide and 12 px high: this zone sits under it.
    const doc = withZones([{ x: 0.2, y: 0.5, width: 0.03, height: 0.04 }]);
    const found = symbols(doc);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ resourceId: 'mapa', text: 'Madrid', anchor: 'a', withSymbol: 1, count: 1, pageIndex: 0 });
    expect(formatWarning(found[0]!)).toContain('symbol 1');
  });

  it('is quiet for a symbol beside the label, and when the picture marks none', () => {
    expect(symbols(withZones([{ x: 0.8, y: 0.8, width: 0.03, height: 0.04 }]))).toEqual([]);
    expect(symbols(withZones([]))).toEqual([]);
  });

  it('counts the symbols a label meets, and leaves out a label that allows overlap', () => {
    const zones = [{ x: 0.2, y: 0.5, width: 0.03, height: 0.04 }, { x: 0.22, y: 0.5, width: 0.03, height: 0.04 }];
    expect(symbols(withZones(zones))[0]).toMatchObject({ withSymbol: 1, count: 2 });
    const allowed = withZones(zones, [{ id: 'a', x: 0.2, y: 0.5, style: 'small', overlap: 'allow' }]);
    expect(symbols(allowed)).toEqual([]);
  });

  it('follows the picture through a crop, as the labels do', () => {
    const doc = withZones([{ x: 0.2, y: 0.5, width: 0.03, height: 0.04 }]);
    const block = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].find((b) => b.resourceBlock?.resource.id === 'mapa')!;
    expect(block.resourceBlock!.resource.avoid).toHaveLength(1);
    expect(symbols(doc)).toHaveLength(1);
  });
});

describe('labelOverflow (#902)', () => {
  it('reports a label still too wide for its measure at the smallest scale its style allows', () => {
    // 0.04 × 400 = 16 px for "Gibraltar" (45 px at 10 px): 0.5 is not enough.
    const md = figure('::label[Gibraltar]{at="narrow"}');
    const doc = build(md, { locale: 'en' } as PostextConfig);
    const found = kinds(doc, 'labelOverflow') as Extract<ContentWarning, { kind: 'labelOverflow' }>[];
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ resourceId: 'mapa', text: 'Gibraltar', anchor: 'narrow', widthPct: 4, scale: 0.5, locale: 'en', pageIndex: 0 });
    expect(md.slice(found[0]!.sourceStart, found[0]!.sourceEnd)).toBe('Gibraltar');
    expect(formatWarning(found[0]!)).toContain('minScale');
  });

  it('is quiet when the label fits, or fits once set smaller', () => {
    expect(kinds(build(figure('::label[Madrid]{at="wide"}')), 'labelOverflow')).toEqual([]);
  });
});

describe('part palettes recolour label styles (#902)', () => {
  const link = (id: string, hex: string) => ({ hex, model: 'hex' as const, paletteId: id });
  const palette = [
    { id: 'accent', name: 'Accent', value: { hex: '#00aa00', model: 'hex' as const } },
    { id: 'paper', name: 'Paper', value: { hex: '#ffeecc', model: 'hex' as const } },
    { id: 'ink', name: 'Ink', value: { hex: '#222222', model: 'hex' as const } },
  ];
  const config: PostextConfig = {
    colorPalette: palette,
    headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] } as never,
    labelStyles: [
      { id: 'plate', fontSize: px(10), color: link('accent', '#00aa00'), halo: { color: link('paper', '#ffeecc'), width: px(1) }, background: link('paper', '#ffeecc'), padding: px(2) },
      { id: 'plain', fontSize: px(10) },
    ],
  };
  /** The labels of the first (`which` 0) or last figure of the book. */
  const labelsOf = (doc: VDTDocument, which: number) => {
    const found = doc.pages.flatMap((p) => [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? [])]).filter((b) => b.resourceBlock?.labels?.length);
    return (which === 0 ? found[0]! : found[found.length - 1]!).resourceBlock!.labels!;
  };

  it('gives a part’s pages the label colours its palette overrides', () => {
    const map = (id: string, res = 'mapa') => [`:::figure{resource="${res}"}`, `::label[Madrid]{at="${id}" style="plate"}`, ':::'].join('\n');
    const markdown = ['# Zero', '', map('a'), '', ':::part{number="II" title="Two" palette="accent=#f6c297,paper=#112233"}', ':::', '', '# One', '', map('a', 'mapb')].join('\n');
    const doc = build(markdown, config);
    const first = labelsOf(doc, 0)[0]!.layout!;
    const last = labelsOf(doc, 1)[0]!.layout!;
    expect(first.color).toBe('#00aa00');
    expect(first.background!.color).toBe('#ffeecc');
    expect(first.halo!.color).toBe('#ffeecc');
    expect(last.color.toLowerCase()).toBe('#f6c297');
    expect(last.background!.color!.toLowerCase()).toBe('#112233');
    expect(last.halo!.color.toLowerCase()).toBe('#112233');
  });

  it('leaves a label that sets no colour of its own on the text colour', () => {
    const markdown = ['# Zero', '', ':::figure{resource="mapa"}', '::label[Madrid]{at="a" style="plain"}', ':::', '', ':::part{number="II" title="Two" palette="accent=#f6c297"}', ':::', '', '# One', '', ':::figure{resource="mapb"}', '::label[Madrid]{at="a" style="plain"}', ':::'].join('\n');
    const doc = build(markdown, { ...config, bodyText: { color: link('ink', '#222222') } as never });
    expect(labelsOf(doc, 1)[0]!.layout!.color.toLowerCase()).toBe('#222222');
  });
});

describe('label colours in the contrast check and the preflight (#902)', () => {
  const hex = (h: string) => ({ hex: h, model: 'hex' as const });
  const config: PostextConfig = {
    labelStyles: [
      // Pale text on a pale plate.
      { id: 'weak', fontSize: px(10), color: hex('#cfd8dc'), background: hex('#eceff1') },
      // Dark text on a white plate.
      { id: 'fine', fontSize: px(10), color: hex('#102a43'), background: hex('#ffffff') },
      // Pale text inside a dark halo: no plate.
      { id: 'halo', fontSize: px(10), color: hex('#ffffff'), halo: { color: hex('#102a43'), width: px(1) } },
      // Pale text on the picture, nothing under it we can read.
      { id: 'bare', fontSize: px(10), color: hex('#eeeeee') },
      // Small type in a process colour.
      { id: 'process', fontSize: px(4), color: hex('#336699') },
    ],
  };
  const MAP2: Resource = {
    ...MAP,
    anchors: [
      { id: 'w', x: 0.2, y: 0.2, style: 'weak' }, { id: 'f', x: 0.5, y: 0.2, style: 'fine' },
      { id: 'h', x: 0.2, y: 0.5, style: 'halo' }, { id: 'b', x: 0.5, y: 0.5, style: 'bare' },
      { id: 'p', x: 0.2, y: 0.8, style: 'process' },
    ],
  };
  const md = figure('::label[Weak]{at="w"}', '::label[Fine]{at="f"}', '::label[Halo]{at="h"}', '::label[Bare]{at="b"}', '::label[Process]{at="p"}');
  const doc = buildDocument({ markdown: md, resources: [MAP2] }, { ...PAGE, ...config }, createMeasurementCache());

  it('reads a label on its plate, or inside its halo, and skips one bare on the picture', () => {
    const pairs = contrastPairs(doc).filter((p) => p.role === 'label');
    expect(pairs.map((p) => p.text).sort()).toEqual(['Fine', 'Halo', 'Weak']);
    expect(pairs.find((p) => p.text === 'Weak')).toMatchObject({ color: '#cfd8dc', background: '#eceff1' });
    expect(pairs.find((p) => p.text === 'Halo')).toMatchObject({ color: '#ffffff', background: '#102a43' });
  });

  it('flags the pale label on a pale plate, with its source range', () => {
    const issues = contrastDocument(doc).filter((i) => i.role === 'label');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: 'lowContrast', text: 'Weak', color: '#cfd8dc', background: '#eceff1' });
    expect(md.slice(issues[0]!.sourceStart, issues[0]!.sourceEnd)).toBe('Weak');
  });

  it('counts a small label in a process colour as small multi-ink text', () => {
    const found = preflightDocument(doc).filter((i) => i.kind === 'smallProcessText');
    expect(found.some((i) => i.kind === 'smallProcessText' && i.color === '#336699')).toBe(true);
  });
});

describe('vertical labels (#902)', () => {
  const V: Resource = {
    ...MAP,
    id: 'tate',
    anchors: [
      { id: 'v', x: 0.5, y: 0.3, writingMode: 'vertical-rl', style: 'small' },
      { id: 'vs', x: 0.2, y: 0.3, writingMode: 'vertical-rl', align: 'start', verticalAlign: 'top', style: 'small' },
      { id: 'vw', x: 0.8, y: 0.1, writingMode: 'vertical-rl', width: 0.1, style: 'tight' },
      { id: 'vn', x: 0.9, y: 0.1, writingMode: 'vertical-rl', width: 0.04, style: 'tight' },
      { id: 'h', x: 0.5, y: 0.8 },
      { id: 'styled', x: 0.1, y: 0.9, style: 'cols' },
    ],
  };
  const cfg: PostextConfig = { ...PAGE, labelStyles: [...PAGE.labelStyles!, { id: 'cols', fontSize: px(10), writingMode: 'vertical-rl' }] };
  const run = (markdown: string): VDTDocument => buildDocument({ markdown, resources: [V] }, cfg, createMeasurementCache());
  const fig = (...l: string[]) => [':::figure{resource="tate"}', ...l, ':::', ''].join('\n');
  const labelsOf = (doc: VDTDocument) => [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].find((b) => b.resourceBlock?.resource.id === 'tate')!.resourceBlock!.labels!;

  it('sets the label in a frame turned a quarter turn, its columns running down', () => {
    const [v, h] = labelsOf(run(fig('::label[東京都]{at="v"}', '::label[Tokyo]{at="h"}')));
    expect(v!.layout!.rotate).toBe(90);
    expect(v!.layout!.vertical).toMatchObject({ region: 'mainland', uprightDigits: 2 });
    expect(Object.keys(v!.layout!.vertical!.centralBaselines).length).toBeGreaterThan(0);
    // Three characters, a cell each, down the column: 3 × 10 px long (the
    // stub measures half an em a character, the cell is a whole one).
    expect(v!.layout!.box.width).toBeCloseTo(30, 3);
    expect(h!.layout!.rotate).toBeUndefined();
    expect(h!.layout!.vertical).toBeUndefined();
  });

  it('turns by the anchor’s rotate on top of the quarter turn', () => {
    const doc = run(fig('::label[東京]{at="v"}'));
    const label = labelsOf(doc)[0]!;
    expect(label.layout!.rotate).toBe(90);
    const rb = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].find((b) => b.resourceBlock?.resource.id === 'tate')!.resourceBlock!;
    // The label box on the body: 10 px wide (one column) and 20 px tall.
    const r = figureLabelBounds(label.layout!, 0, 0);
    expect(r.height).toBeCloseTo(20, 3);
    expect(r.width).toBeCloseTo(label.layout!.box.height, 3);
    expect(rb.labels).toHaveLength(1);
  });

  it('takes the writing mode from the label style, the anchor’s winning', () => {
    const [styled] = labelsOf(run(fig('::label[東京]{at="styled"}')));
    expect(styled!.layout!.vertical).toBeDefined();
    expect(styled!.layout!.rotate).toBe(90);
  });

  it('puts the start of the column at the anchor point', () => {
    const [start] = labelsOf(run(fig('::label[東京都]{at="vs"}')));
    const x = start!.layout!.x;
    const y = start!.layout!.y;
    const r = figureLabelBounds(start!.layout!, 0, 0);
    // `align: start` is the top of the column, `verticalAlign: top` its first
    // (rightmost) column: the box hangs down and to the left of the point.
    expect(r.y).toBeCloseTo(y, 3);
    expect(r.x + r.width).toBeCloseTo(x, 3);
  });

  it('measures a vertical label’s width along the picture’s height: CJK wraps into columns, a long sideways word overflows', () => {
    // 0.1 × 300 px = 30 px of column: three cells of 10 px. Eight characters
    // go into three columns, going leftward.
    const wrapped = labelsOf(run(fig('::label[東京都大阪府京都]{at="vw"}')))[0]!.layout!;
    expect(wrapped.lines).toHaveLength(3);
    expect(wrapped.overflow).toBeUndefined();
    expect(wrapped.box.width).toBeLessThanOrEqual(30 + 1e-6);
    // A Latin word set sideways keeps its horizontal width (45 px at 10 px):
    // 12 px of column is too little even at half the size.
    const word = run(fig('::label[Gibraltar]{at="vn"}'));
    expect(labelsOf(word)[0]!.layout!.overflow).toBe(true);
    expect(labelsOf(word)[0]!.layout!.scale).toBe(0.5);
    expect(kinds(word, 'labelOverflow')).toHaveLength(1);
  });

  it('paints the characters of a vertical label one by one, upright, and writes it down the column in the HTML', () => {
    const doc = run(fig('::label[東京]{at="v"}', '::label[大阪]{at="vs"}', '::label[Oslo]{at="h"}'));
    const ops: { op: string; text?: string }[] = [];
    const ctx: Record<string | symbol, unknown> = new Proxy({}, {
      get(target: Record<string | symbol, unknown>, key) {
        if (key === 'measureText') return (t: string) => ({ width: t.length * 5 });
        if (key === 'fillText') return (t: string) => { ops.push({ op: 'fillText', text: t }); };
        if (key in target) return target[key];
        return () => undefined;
      },
      set(target, key, value) { target[key] = value; return true; },
    });
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    const shown = ops.map((o) => o.text);
    // Horizontal text is one show; a vertical label's cells are shown apart.
    expect(shown).toContain('Oslo');
    expect(shown).toContain('東');
    expect(shown).toContain('京');
    expect(shown).not.toContain('東京');
    const html = renderToHtmlIndexed(doc, { resourceImageUrl: (id) => `https://example.org/${id}` }).pages[0]!.innerHtml;
    // The label’s frame is turned a quarter turn; its line is set vertically.
    expect(html).toMatch(/class="pt-figure-label"[^>]*transform:matrix\(0,1,-1,0,/);
    expect(html).toContain('東');
  });
});

describe('the source of a label’s place (#931)', () => {
  it('gives the range of the at value, the quotes left out, for a label placed by percentages', () => {
    const md = figure('::label[Mar Negro]{at="62% 48%" style="small"}', '::label[Madrid]{at="a"}');
    const doc = build(md);
    const block = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].find((b) => b.resourceBlock?.resource.id === 'mapa')!;
    const [pct, named] = block.resourceBlock!.labels!;
    expect(md.slice(pct!.atSource!.start, pct!.atSource!.end)).toBe('62% 48%');
    expect(md.slice(named!.atSource!.start, named!.atSource!.end)).toBe('a');
  });
});
