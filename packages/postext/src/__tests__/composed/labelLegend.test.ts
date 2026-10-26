import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { renderToHtmlIndexed } from '../../html-backend/html-backend.js';
import { renderPageToCanvas } from '../../index.js';
import { parseMarkdown } from '../../parse/index.js';
import { parseInlineSnippetSpans } from '../../parse/inlineSnippet.js';
import { BREAK_PLACEHOLDER, SWATCH_PLACEHOLDER } from '../../parse/inlineFormatting.js';
import { figureLabelReading, labelLayoutOnSheet, resolveLabelLook } from '../../composed/labels.js';
import { altWithLabels } from '../../composed/labelText.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import { validatePageTemplates } from '../../composed/validate.js';
import { ICON_CAP_EM } from '../../measure/inlineIcon.js';
import { collectFontUsage, configFontFamilies } from '../../fonts/usage.js';
import type { PostextConfig, Resource, VDTBlock, VDTDocument, VDTFigureLabel, VDTLine, VDTLineSegment } from '../../index.js';
import { legendMapFixture, type LegendMapLocale } from './fixtures/legendMap.js';

// #1058: a map's key and a scale bar's numbers set as labels: inline
// symbols, lines kept as written, legend rows, plates with an outline.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    // Half an em a character, from the font's size.
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
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const PAGE: PostextConfig = {
  page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  bodyText: { fontSize: px(20) } as never,
  labelStyles: [
    { id: 'key', kind: 'legend', fontSize: px(10), background: hex('#ffffff'), border: { color: hex('#333333'), width: px(1) }, radius: px(3), padding: px(4) },
    { id: 'name', fontSize: px(10), align: 'end' },
    { id: 'scale', fontSize: px(8) },
  ],
};
const MAP: Resource = {
  id: 'mapa', typeId: 'figure', kind: 'bitmap', altText: 'A political map', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'mapa.png', format: 'png', width: 400, height: 300 },
  anchors: [
    { id: 'key', x: 0.05, y: 0.95, align: 'start', verticalAlign: 'bottom', style: 'key' },
    { id: 'capital', x: 0.5, y: 0.4, style: 'name' },
    { id: 's0', x: 0.6, y: 0.97, style: 'scale' },
    { id: 's100', x: 0.75, y: 0.97, style: 'scale' },
  ],
};
const DOT: Resource = {
  id: 'dot', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'dot.png', format: 'png', width: 20, height: 10 },
};

const figure = (...labels: string[]) => [':::figure{resource="mapa"}', ...labels, ':::', ''].join('\n');
const build = (markdown: string, config: PostextConfig = {}): VDTDocument =>
  buildDocument({ markdown, resources: [MAP, DOT] }, { ...PAGE, ...config }, createMeasurementCache());
const allBlocks = (doc: VDTDocument): VDTBlock[] => [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])];
const labels = (doc: VDTDocument): VDTFigureLabel[] => allBlocks(doc).find((b) => b.resourceBlock?.resource.id === 'mapa')!.resourceBlock!.labels!;
const icons = (line: VDTLine): VDTLineSegment[] => (line.segments ?? []).filter((s) => s.swatch?.icon);

const LEGEND = [
  ':::label{at="key"}',
  ':icon[Capital]{glyph="⊙"} Capital',
  ':icon[Border]{line="dashed"} International border',
  ':icon[Town]{resource="dot" size="0.5"} Town',
  ':::',
];

describe('inline symbols (#1058)', () => {
  it('reads :icon in a label as one placeholder with its kind, and leaves other text alone', () => {
    const blocks = parseMarkdown(figure('::label[:icon[Capital]{glyph="⊙" font="Noto Sans Symbols" color="#c00"} Paris]{at="capital"}'));
    const label = blocks[0]!.figure!.labels[0]!;
    expect(label.text).toBe(`${SWATCH_PLACEHOLDER} Paris`);
    expect(label.spans[0]!.swatch).toEqual({ color: '#c00', icon: { alt: 'Capital', glyph: '⊙', font: 'Noto Sans Symbols' } });
    // The placeholder maps to the directive's colon, the name to its letters.
    const src = figure('::label[:icon[Capital]{glyph="⊙" font="Noto Sans Symbols" color="#c00"} Paris]{at="capital"}');
    expect(src[label.sourceMap[0]!]).toBe(':');
    expect(src.slice(label.sourceMap[2]!, label.sourceMap[2]! + 5)).toBe('Paris');
    // No kind, no symbol.
    const plain = parseMarkdown(figure('::label[:icon[x]{size="2"} y]{at="capital"}'))[0]!.figure!.labels[0]!;
    expect(plain.text).toBe(':icon[x]{size="2"} y');
  });

  it('is read in captions and table cells, and not in the body text in this round', () => {
    const spans = parseInlineSnippetSpans('Key: :icon[]{line="dotted" color="accent"} trails');
    expect(spans.find((s) => s.swatch)?.swatch).toEqual({ color: 'accent', icon: { alt: '', line: 'dotted' } });
    const body = parseMarkdown('See :icon[x]{glyph="*"} here.')[0]!;
    expect(body.text).toContain(':icon[x]');
  });

  it('asks the hosts for the faces its glyphs are set in', () => {
    const md = figure('::label[:icon[Capital]{glyph="⊙" font="Noto Sans Math"} Corvel]{at="capital"}', '::label[:icon[]{line="solid" font="Unused"}]{at="capital"}');
    expect(configFontFamilies({}, md)).toContain('Noto Sans Math');
    expect(configFontFamilies({}, md)).not.toContain('Unused');
    expect(collectFontUsage({}, { markdown: md }).get('Noto Sans Math')).toEqual([{ weight: 400, style: 'normal' }]);
  });

  it('sizes a glyph, a line sample and a picture to the capital height, or to size= ems', () => {
    const doc = build(figure(...LEGEND));
    const line = labels(doc)[0]!.layout!.lines;
    const [glyph] = icons(line[0]!);
    const [stroke] = icons(line[1]!);
    const [picture] = icons(line[2]!);
    const em = 10;
    expect(glyph!.swatch!.icon).toMatchObject({ kind: 'glyph', alt: 'Capital', glyph: '⊙', heightPx: ICON_CAP_EM * em });
    // The glyph is set at the size whose capitals are that high: 1 em.
    expect(glyph!.swatch!.icon!.fontString).toContain('10px');
    expect(stroke!.swatch!.icon).toMatchObject({ kind: 'line', line: 'dashed', heightPx: ICON_CAP_EM * em, widthPx: 2 * ICON_CAP_EM * em });
    // A picture keeps its proportions (20 × 10) at half an em high.
    expect(picture!.swatch!.icon).toMatchObject({ kind: 'resource', fileId: 'dot.png', svg: false, heightPx: 5, widthPx: 10 });
  });
});

describe('labels over several lines (#1058)', () => {
  it('keeps each line of a :::label as a line, and \\\\ still breaks inside one', () => {
    const doc = build(figure(':::label{at="capital" style="scale"}', 'North', 'Island \\\\ group', ':::'));
    const label = labels(doc)[0]!;
    expect(label.text).toBe(`North${BREAK_PLACEHOLDER}Island \\\\ group`);
    expect(label.layout!.lines.map((l) => l.text.trim())).toEqual(['North', 'Island', 'group']);
  });

  it('drops a hard break mark at a line end and skips blank lines', () => {
    const blocks = parseMarkdown(figure(':::label{at="capital"}', 'One\\', '', 'Two  ', ':::'));
    expect(blocks[0]!.figure!.labels[0]!.text).toBe(`One${BREAK_PLACEHOLDER}Two`);
    expect(blocks).toHaveLength(1);
  });

  it('maps every character of a multi-line label to its source', () => {
    const src = figure(':::label{at="capital"}', 'Ab', 'Cd', ':::');
    const label = parseMarkdown(src)[0]!.figure!.labels[0]!;
    expect(label.sourceMap.map((o, i) => (label.text[i] === BREAK_PLACEHOLDER ? '\n' : src[o]))).toEqual(['A', 'b', '\n', 'C', 'd']);
  });
});

describe('legends (#1058)', () => {
  it('hangs the symbol of each row in one column as wide as the widest', () => {
    const layout = labels(build(figure(...LEGEND)))[0]!.layout!;
    expect(layout.legend).toBe(true);
    // The words of every row start at one edge.
    const textStart = (line: VDTLine): number => {
      let x = line.bbox.x;
      for (const s of line.segments!) {
        if (s.kind === 'text' && !s.swatch) return x;
        x += s.width;
      }
      return x;
    };
    const starts = layout.lines.map(textStart);
    for (const s of starts) expect(s).toBeCloseTo(starts[0]!, 6);
    // The widest symbol (the line sample, 15 px) sets the column; a narrower
    // one is centred in it.
    const glyph = icons(layout.lines[0]!)[0]!;
    expect(glyph.width).toBeCloseTo(15, 6);
    expect(glyph.swatch!.icon!.insetPx).toBeCloseTo((15 - glyph.swatch!.icon!.widthPx) / 2, 6);
    // Rows at their start, the box's left edge.
    for (const line of layout.lines) expect(line.bbox.x).toBeCloseTo(layout.box.x, 6);
  });

  it('draws a plate with an outline and round corners', () => {
    const layout = labels(build(figure(...LEGEND)))[0]!.layout!;
    expect(layout.background).toMatchObject({ color: '#ffffff', border: { color: '#333333', widthPx: 1 }, radiusPx: 3 });
    expect(layout.background!.rect.width).toBeCloseTo(layout.box.width + 8, 6);
  });

  it('reads the rows with each symbol’s name in brackets', () => {
    const label = labels(build(figure(...LEGEND)))[0]!;
    expect(figureLabelReading(label)).toBe('[Capital] Capital; [Border] International border; [Town] Town');
    // Undrawn (no layout), the alternative text names them too; an empty
    // name is no word.
    expect(altWithLabels('A map', [{ text: label.text, ...(label.icons ? { icons: label.icons } : {}) }])).toBe('A map ([Capital] Capital [Border] International border [Town] Town)');
    const unnamed = labels(build(figure('::label[:icon[]{line="solid"} Road]{at="capital"}')))[0]!;
    expect(figureLabelReading(unnamed)).toBe('Road');
  });

  it('lines up the lines of a label inside its box with the style’s align', () => {
    const layout = labels(build(figure(':::label{at="capital" style="name"}', 'Saint-Pierre', 'Bay', ':::')))[0]!.layout!;
    const [long, short] = layout.lines;
    expect(short!.bbox.x + short!.bbox.width).toBeCloseTo(long!.bbox.x + long!.bbox.width, 6);
    expect(resolveLabelLook('name', resolveAllConfig(PAGE)).align).toBe('end');
  });

  it('sets a scale bar’s numbers as labels on anchors along the bar', () => {
    const [zero, hundred] = labels(build(figure('::label[0]{at="s0"}', '::label[100 km]{at="s100"}')));
    expect(zero!.layout!.y).toBeCloseTo(hundred!.layout!.y, 6);
    expect(hundred!.layout!.x).toBeGreaterThan(zero!.layout!.x);
  });
});

describe('a political map’s key and scale bar in three languages (#1058)', () => {
  /** The labels of the fixture's map, each layout as it stands on the
   *  sheet (the Arabic book's pages are mirrored: their flow holds the
   *  reflection). */
  const fixtureLabels = (locale: LegendMapLocale): VDTFigureLabel[] => {
    const { markdown, config, resources } = legendMapFixture(locale);
    const doc = buildDocument({ markdown, resources }, config, createMeasurementCache());
    const rb = allBlocks(doc).find((b) => b.resourceBlock?.resource.id === 'lirandia')!.resourceBlock!;
    return rb.labels!.map((l) => (locale === 'ar' && l.layout ? { ...l, layout: labelLayoutOnSheet(l.layout, rb.bodyRect.width) } : l));
  };

  it.each(['en', 'es', 'ar'] as const)('sets the key as rows of symbol and words, the numbers on the bar (%s)', (locale) => {
    const [key, country, capital, ...scale] = fixtureLabels(locale);
    const layout = key!.layout!;
    expect(layout.legend).toBe(true);
    expect(layout.lines).toHaveLength(4);
    expect(layout.lines.map((l) => icons(l)[0]!.swatch!.icon!.kind)).toEqual(['glyph', 'glyph', 'resource', 'line']);
    // The country's symbol takes the palette's colour, the border's too.
    expect(icons(layout.lines[0]!)[0]!.swatch!.icon!.color).toBe('#d9a92f');
    expect(icons(layout.lines[3]!)[0]!.swatch!.icon!.color).toBe('#8a3b52');
    expect(layout.background?.border?.widthPx).toBeGreaterThan(0);
    // The box grows into the picture from its anchor near the left edge.
    expect(layout.box.x).toBeGreaterThanOrEqual(0);
    expect(country!.layout).toBeDefined();
    expect(icons(capital!.layout!.lines[0]!)[0]!.swatch!.icon!.glyph).toBe('⊙');
    // The scale's numbers stand on one line, left to right along the bar.
    const ys = scale.map((l) => l.layout!.y);
    expect(new Set(ys.map((y) => y.toFixed(6))).size).toBe(1);
    const xs = scale.map((l) => l.layout!.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it('hangs the symbols on the right of the rows in Arabic', () => {
    const layout = fixtureLabels('ar')[0]!.layout!;
    expect(layout.direction).toBe('rtl');
    for (const line of layout.lines) {
      // On the sheet the symbol is the last segment from left to right.
      const order = line.order ?? line.segments!.map((_, i) => i);
      const last = line.segments![order[order.length - 1]!]!;
      expect(last.swatch?.icon).toBeDefined();
      expect(line.bbox.x + line.bbox.width).toBeCloseTo(layout.box.x + layout.box.width, 6);
    }
  });

  it('reads the key row by row in each language', () => {
    expect(figureLabelReading(fixtureLabels('en')[0]!)).toBe('[Lirandia] Lirandia; [Capital] Capital; [Town] Town; [International border] International border');
    expect(figureLabelReading(fixtureLabels('es')[0]!)).toBe('[Lirandia] Lirandia; [Capital] Capital; [Ciudad] Ciudad; [Frontera internacional] Frontera internacional');
    expect(figureLabelReading(fixtureLabels('ar')[0]!)).toContain('[العاصمة] العاصمة');
  });
});

describe('validation (#1058)', () => {
  it('knows the new keys of a label style and checks their values', () => {
    const ok = validatePageTemplates({ labelStyles: [{ id: 'a', kind: 'legend', align: 'center', border: { color: hex('#000000'), width: px(1) }, radius: px(2) }] });
    expect(ok).toEqual([]);
    const bad = validatePageTemplates({ labelStyles: [{ id: 'a', kind: 'key', align: 'middle', border: { colour: hex('#000000') } } as never] });
    expect(bad.map((w) => w.path).sort()).toEqual(['/labelStyles/0/align', '/labelStyles/0/border/colour', '/labelStyles/0/kind']);
  });
});

describe('outputs (#1058)', () => {
  it('paints the symbols and the plate on the canvas', () => {
    const doc = build(figure(...LEGEND));
    const calls: { op: string; args: unknown[] }[] = [];
    const ctx: Record<string | symbol, unknown> = new Proxy({}, {
      get(target: Record<string | symbol, unknown>, key) {
        if (key === 'measureText') return (s: string) => ({ width: s.length * 5 });
        if (typeof key === 'string' && ['fillText', 'setLineDash', 'arcTo', 'drawImage', 'lineTo'].includes(key)) return (...args: unknown[]) => { calls.push({ op: key, args }); };
        if (key in target) return target[key];
        return () => undefined;
      },
      set(target, key, value) { target[key] = value; return true; },
    });
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    expect(calls.some((c) => c.op === 'fillText' && c.args[0] === '⊙')).toBe(true);
    expect(calls.some((c) => c.op === 'setLineDash' && (c.args[0] as number[]).length === 2)).toBe(true);
    expect(calls.some((c) => c.op === 'arcTo')).toBe(true);
  });

  it('writes the symbols in the HTML, named by their alternative text', () => {
    const doc = build(figure(...LEGEND));
    const html = renderToHtmlIndexed(doc, { resourceImageUrl: (id: string) => `img/${id}` }).pages.map((p) => p.innerHtml).join('');
    expect(html).toContain('aria-label="Capital"');
    expect(html).toContain('>⊙</text>');
    expect(html).toContain('stroke-dasharray=');
    expect(html).toContain('src="img/dot.png"');
    expect(html).toContain('border-radius:3px');
  });
});
