import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { stripConfigDefaults } from '../../../defaults/index.js';
import { resolveCharacterStylesConfig, stripCharacterStylesDefaults } from '../../../defaults/text/characterStyles.js';
import { resolveMarkStylesConfig } from '../../../defaults/text/markStyles.js';
import { renderToHtml } from '../../../html-backend/html-backend.js';
import { bandOutline } from '../../../marks/markGeometry.js';
import { documentDisplayList } from '../../../paint/displayList/index.js';
import type { CharacterStyleConfig, MarkStyleConfig, PostextConfig, VDTBlock, VDTDocument, VDTLine, VDTLineMark, VDTLineSegment } from '../../../index.js';

// Deterministic measurement that scales with the font size: every glyph is
// half an em wide (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const m = /(\d*\.?\d+)px/.exec(this.font);
    return { width: s.length * (m ? Number(m[1]) : 16) * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const em = (value: number) => ({ value, unit: 'em' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

const base = (over: PostextConfig = {}): PostextConfig => ({
  page: { width: pt(300), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
  bodyText: { textAlign: 'left', hyphenation: { enabled: false } },
  ...over,
});

const markStyles: MarkStyleConfig[] = [
  { id: 'mark' },
  { id: 'marker', background: hex('#ffe14d'), opacity: 50, rough: 60 },
  { id: 'wave', backgroundEnabled: false, line: { style: 'wavy', color: hex('#cc0000') } },
  { id: 'cut', backgroundEnabled: false, line: { position: 'through', style: 'dashed' } },
];

const styles: CharacterStyleConfig[] = [
  { id: 'big', fontSize: em(1.5), color: hex('#aa0000'), letterSpacing: em(0.1) },
  { id: 'term', fontWeight: 700, mark: 'marker' },
  { id: 'caps', textTransform: 'uppercase' },
  { id: 'lost', mark: 'nowhere' },
];

const paragraph = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'paragraph')!;
const segs = (doc: VDTDocument): VDTLineSegment[] => paragraph(doc).lines.flatMap((l) => l.segments ?? []);
const marks = (doc: VDTDocument): VDTLineMark[] => paragraph(doc).lines.flatMap((l) => l.marks ?? []);
const build = (markdown: string, over: PostextConfig = {}) =>
  buildDocument({ markdown }, base({ characterStyles: styles, markStyles, ...over }));

describe('character styles', () => {
  it('sets the run in its face and tracking, its colour painted after layout', () => {
    const doc = build('Un :span[texto grande]{style="big"} aquí.');
    const styled = segs(doc).filter((s) => s.charStyle?.style === 'big' && s.kind === 'text');
    expect(styled.map((s) => s.text)).toEqual(['texto', 'grande']);
    const body = segs(doc).find((s) => s.text === 'Un')!;
    const bodySize = Number(/(\d*\.?\d+)px/.exec(paragraph(doc).fontString)![1]);
    for (const s of styled) {
      expect(Number(/(\d*\.?\d+)px/.exec(s.fontString!)![1])).toBeCloseTo(bodySize * 1.5, 5);
      expect(s.color).toBe('#aa0000');
      expect(s.tracking).toBeCloseTo(bodySize * 0.1, 5);
      expect(s.width).toBeCloseTo(s.text.length * (bodySize * 1.5 * 0.5 + bodySize * 0.1), 5);
    }
    expect(body.fontString).toBeUndefined();
  });

  it('changes no layout when only the colour changes', () => {
    const geometry = (d: VDTDocument) => paragraph(d).lines.map((l) => (l.segments ?? []).map((s) => [s.text, s.width]));
    const red = build('Un :span[texto grande]{style="big"} aquí.');
    const blue = build('Un :span[texto grande]{style="big"} aquí.', { characterStyles: [{ ...styles[0]!, color: hex('#0000aa') }] });
    expect(geometry(blue)).toEqual(geometry(red));
    expect(segs(blue).find((s) => s.text === 'texto')!.color).toBe('#0000aa');
  });

  it('takes the band of the highlight style it names, translucent and rough', () => {
    const md = 'Antes :span[una frase marcada que no cabe en una sola línea del todo]{style="term"} después.';
    const doc = build(md, { page: { width: pt(140), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } } });
    const lines = paragraph(doc).lines.filter((l) => l.segments?.some((s) => s.charStyle));
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.highlights).toHaveLength(1);
      const band = line.highlights![0]!;
      expect(band.color).toBe('#ffe14d');
      expect(band.opacity).toBeCloseTo(0.5, 5);
      expect(band.rough).toBeCloseTo(0.6, 5);
      expect(band.seed).toBeDefined();
    }
    for (const s of lines.flatMap((l) => l.segments!).filter((s) => s.charStyle && s.kind === 'text')) expect(s.fontString).toMatch(/700/);
  });

  it('ignores a highlight style that does not exist', () => {
    expect(resolveCharacterStylesConfig(styles, new Set(['marker'])).find((s) => s.id === 'lost')!.mark).toBeUndefined();
    const doc = build('Un :span[texto]{style="lost"}.');
    expect(paragraph(doc).lines.every((l) => !l.highlights)).toBe(true);
  });

  it('sets capitals in the document language and keeps the written text', () => {
    const tr = build('Bir :span[istanbul]{style="caps"} yazısı.', { locale: 'tr' });
    const word = segs(tr).find((s) => s.charStyle?.style === 'caps')!;
    expect(word.text).toBe('İSTANBUL');
    expect(word.sourceText).toBe('istanbul');
    const en = build('A :span[istanbul]{style="caps"} sign.', { locale: 'en' });
    expect(segs(en).find((s) => s.charStyle?.style === 'caps')!.text).toBe('ISTANBUL');
    // Greek capitals drop the accent (ΟΔΟΣ); the code points of another
    // language keep it.
    const el = build('Η :span[οδός]{style="caps"} εδώ.', { locale: 'el' });
    expect(segs(el).find((s) => s.charStyle?.style === 'caps')!.text).toBe('ΟΔΟΣ');
    expect(segs(el).find((s) => s.charStyle?.style === 'caps')!.sourceText).toBe('οδός');
  });

  it('sets an unknown style as plain text and reports it', () => {
    const doc = build('Un :span[texto]{style="nada"} aquí.');
    expect(marks(doc)).toHaveLength(0);
    expect(segs(doc).every((s) => s.fontString === undefined && s.color === undefined)).toBe(true);
    expect(doc.contentWarnings?.some((w) => w.kind === 'unknownCharacterStyle' && w.style === 'nada')).toBe(true);
  });

  it('decorates the words of a table cell and a caption', () => {
    const doc = buildDocument({
      markdown: 'Ver :ref{id="t1"}.\n\n::resource{id="t1"}',
      resources: [{
        id: 't1',
        typeId: 'table',
        kind: 'table',
        caption: 'Una :span[leyenda]{style="term"}',
        createdAt: 0,
        updatedAt: 0,
        table: { model: { headerRowCount: 1, rows: [[{ content: 'H', isHeader: true }], [{ content: 'Celda :span[marcada]{style="term"}' }]] } },
      }],
    }, base({ characterStyles: styles, markStyles }));
    const rb = doc.blocks.find((b) => b.resourceBlock)?.resourceBlock ?? doc.pages.flatMap((p) => p.floats ?? []).find((b) => b.resourceBlock)?.resourceBlock;
    expect(rb).toBeDefined();
    expect(rb!.table!.cells.flatMap((c) => c.lines.flatMap((l) => l.highlights ?? []))).toHaveLength(1);
    expect(rb!.captionLines.flatMap((l) => l.highlights ?? [])).toHaveLength(1);
  });
});

describe('highlight style lines', () => {
  it('draws a wavy line under a mark with no band, in its own colour', () => {
    const doc = build('A :mark[dos palabras]{style="wave"} z');
    const lines = marks(doc).filter((m) => m.markLine);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.kind).toBe('wavy');
    expect(lines[0]!.color).toBe('#cc0000');
    expect(lines[0]!.y).toBeGreaterThan(0);
    expect(paragraph(doc).lines.every((l) => !l.highlights)).toBe(true);
  });

  it('draws a dashed line through the words, over the baseline', () => {
    const doc = build('A :mark[dos palabras]{style="cut"} z');
    const [line] = marks(doc).filter((m) => m.markLine);
    expect(line!.kind).toBe('dashed');
    expect(line!.y).toBeLessThan(0);
    expect(line!.size).toBeGreaterThan(0);
  });

  it('puts the line beside the characters down a vertical page', () => {
    const doc = build('縦の:mark[文章です]{style="wave"}。', { layout: { layoutType: 'single', writingMode: 'vertical-rl' }, locale: 'ja' });
    const [line] = marks(doc).filter((m) => m.markLine);
    expect(line).toBeDefined();
    // On the right of the characters: up from the central axis in the
    // line's turned frame, as `:underline[…]` sets its side line.
    expect(line!.y).toBeLessThan(0);
    // Painted in the HTML's turned flow and in the display list.
    const html = renderToHtml(doc);
    expect(html).toContain('stroke="#cc0000"');
    const items = documentDisplayList(doc).flatMap((p) => p.items);
    expect(items.some((i) => i.kind === 'path' && i.stroke?.color === '#cc0000')).toBe(true);
  });

  it('paints the bands of a vertical page in the HTML too', () => {
    const doc = build('縦の:mark[文章です]{style="marker"}。', { layout: { layoutType: 'single', writingMode: 'vertical-rl' }, locale: 'ja' });
    expect(paragraph(doc).lines.some((l) => l.highlights?.length)).toBe(true);
    expect(renderToHtml(doc)).toContain('fill="#ffe14d"');
  });

  it('gives the display list the colour a band prints over white', () => {
    const doc = build('Un :mark[texto]{style="marker"} aquí.');
    const items = documentDisplayList(doc).flatMap((p) => p.items);
    const band = items.find((i) => i.kind === 'path' && i.fill !== undefined);
    // #ffe14d at 50 % over white.
    expect(band && band.kind === 'path' ? band.fill : undefined).toBe('#fff0a6');
  });

  it('draws a rough band the same way every time', () => {
    const band = { x: 0, y: -10, width: 80, height: 12, radiusLeft: 0, radiusRight: 0, rough: 0.6, seed: 42 };
    expect(bandOutline(band)).toEqual(bandOutline(band));
    expect(bandOutline({ ...band, seed: 43 })).not.toEqual(bandOutline(band));
    expect(bandOutline({ ...band, rough: 0 }).filter((c) => c.op === 'Q')).toHaveLength(0);
  });
});

describe('documents with no character style', () => {
  it('lay out as before: brackets and bars stay text', () => {
    const markdown = 'Un [1] y a|b|c, [nota]|x| y :mark[esto] [vacío]|.';
    const plain = buildDocument({ markdown }, base());
    const styled = buildDocument({ markdown }, base({ characterStyles: styles }));
    const text = (d: VDTDocument) => paragraph(d).lines.map((l: VDTLine) => (l.segments ?? []).map((g) => [g.text, g.width]));
    expect(text(styled)).toEqual(text(plain));
    expect(paragraph(plain).lines.map((l) => (l.segments ?? []).map((g) => g.text).join('')).join(' ')).toContain('[nota]|x|');
  });
});

describe('style config', () => {
  it('has no character style by default and strips back to nothing', () => {
    expect(resolveCharacterStylesConfig(undefined)).toEqual([]);
    expect(stripCharacterStylesDefaults([])).toBeUndefined();
    expect(stripCharacterStylesDefaults([{ id: 'x', name: 'x', italic: false }])).toEqual([{ id: 'x' }]);
    expect(stripConfigDefaults({ characterStyles: styles }).characterStyles).toEqual(styles);
  });

  it('drops values that are no colour, length, weight or case', () => {
    const [s] = resolveCharacterStylesConfig([{
      id: 's',
      fontWeight: 1234,
      color: { hex: 'red;}body{x' } as never,
      letterSpacing: { value: 1, unit: 'furlong' } as never,
      textTransform: 'constructor' as never,
    }]);
    expect(s!.fontWeight).toBe(900);
    expect(s!.color).toBeUndefined();
    expect(s!.letterSpacing).toBeUndefined();
    expect(s!.textTransform).toBe('none');
  });

  it('checks the highlight styles too', () => {
    const [m] = resolveMarkStylesConfig([{
      id: 'm',
      opacity: 300,
      rough: -5,
      background: { hex: '#abc' } as never,
      line: { style: 'toString' as never, position: '__proto__' as never, color: { hex: 'url(x)' } as never },
    }]);
    expect(m!.opacity).toBe(100);
    expect(m!.rough).toBe(0);
    expect(m!.background.hex).toBe('#aabbcc');
    expect(m!.line).toEqual({ position: 'under', style: 'solid' });
  });
});
