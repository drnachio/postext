import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { stripConfigDefaults } from '../../../defaults/index.js';
import { resolveCharacterStylesConfig, stripCharacterStylesDefaults, DEFAULT_CHARACTER_STYLES } from '../../../defaults/text/characterStyles.js';
import { renderToHtml } from '../../../html-backend/html-backend.js';
import { bandOutline } from '../../../marks/markGeometry.js';
import type { CharacterStyleConfig, PostextConfig, VDTBlock, VDTDocument, VDTLineMark, VDTLineSegment } from '../../../index.js';

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

const styles: CharacterStyleConfig[] = [
  { id: 'marker', highlight: { enabled: true, color: hex('#ffe14d'), opacity: 50, bottom: em(-0.1), top: em(0.5) } },
  { id: 'big', fontSize: em(1.5), color: hex('#aa0000'), letterSpacing: em(0.1) },
  { id: 'under', underline: { enabled: true, style: 'dashed', color: hex('#0044aa') } },
  { id: 'strike', strike: { enabled: true, skipSpaces: true } },
];

const paragraph = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'paragraph')!;
const segs = (doc: VDTDocument): VDTLineSegment[] => paragraph(doc).lines.flatMap((l) => l.segments ?? []);
const marks = (doc: VDTDocument): VDTLineMark[] => paragraph(doc).lines.flatMap((l) => l.marks ?? []);

describe('character styles', () => {
  it('sets the run in its face, colour and tracking', () => {
    const doc = buildDocument({ markdown: 'Un [texto grande]|big| aquí.' }, base({ characterStyles: styles }));
    const styled = segs(doc).filter((s) => s.charStyle?.style === 'big' && s.kind === 'text');
    expect(styled.map((s) => s.text)).toEqual(['texto', 'grande']);
    const body = segs(doc).find((s) => s.text === 'Un')!;
    const bodySize = Number(/(\d*\.?\d+)px/.exec(paragraph(doc).fontString)![1]);
    for (const s of styled) {
      expect(Number(/(\d*\.?\d+)px/.exec(s.fontString!)![1])).toBeCloseTo(bodySize * 1.5, 5);
      expect(s.color).toBe('#aa0000');
      expect(s.tracking).toBeCloseTo(bodySize * 0.1, 5);
      // Half an em a glyph at the run's size, plus the tracking.
      expect(s.width).toBeCloseTo(s.text.length * (bodySize * 1.5 * 0.5 + bodySize * 0.1), 5);
    }
    expect(body.fontString).toBeUndefined();
  });

  it('breaks across lines like the text around it, decorating each line', () => {
    const md = 'Antes [una frase marcada que no cabe en una sola línea del todo]|marker| después.';
    const doc = buildDocument({ markdown: md }, base({ characterStyles: styles, page: { width: pt(140), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } } }));
    const p = paragraph(doc);
    const lines = p.lines.filter((l) => l.segments?.some((s) => s.charStyle));
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      const bands = (line.marks ?? []).filter((m) => m.kind === 'band');
      expect(bands).toHaveLength(1);
      const band = bands[0]!;
      expect(band.behind).toBe(true);
      expect(band.opacity).toBeCloseTo(0.5, 5);
      expect(band.color).toBe('#ffe14d');
      expect(band.y).toBeLessThan(0);
      expect(band.height).toBeGreaterThan(0);
    }
  });

  it('runs a line on under the spaces of the run, or leaves them out', () => {
    const doc = buildDocument({ markdown: 'A [dos palabras]|under| y [otras dos]|strike| z' }, base({ characterStyles: styles }));
    const m = marks(doc);
    const under = m.filter((x) => x.kind === 'dashed');
    expect(under).toHaveLength(1);
    expect(under[0]!.color).toBe('#0044aa');
    expect(under[0]!.y).toBeGreaterThan(0);
    // The strike-through: one per word, above the baseline.
    const strikes = m.filter((x) => x.kind === 'line');
    expect(strikes).toHaveLength(2);
    expect(strikes.every((x) => x.y < 0)).toBe(true);
  });

  it('decorates two runs side by side apart', () => {
    const doc = buildDocument({ markdown: '[uno]|marker|[dos]|marker|' }, base({ characterStyles: styles }));
    expect(marks(doc).filter((x) => x.kind === 'band')).toHaveLength(2);
  });

  it('sets an unknown style as plain text and reports it', () => {
    const doc = buildDocument({ markdown: 'Un [texto]|nada| aquí.' }, base({ characterStyles: styles }));
    expect(marks(doc)).toHaveLength(0);
    expect(segs(doc).every((s) => s.fontString === undefined && s.color === undefined)).toBe(true);
    expect(doc.contentWarnings?.some((w) => w.kind === 'unknownCharacterStyle' && w.style === 'nada')).toBe(true);
  });

  it('leaves a document that writes no character style as it was', () => {
    // Brackets and bars that make no `[…]|id|` stay text, and lay out as
    // they do with no character styles at all.
    const markdown = 'Un [1] y a|b|c, [nota] |x| y [vacío]|.';
    const plain = buildDocument({ markdown }, base());
    const styled = buildDocument({ markdown }, base({ characterStyles: styles }));
    const text = (d: VDTDocument) => d.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => (b.lines ?? []).map((l) => (l.segments ?? []).map((g) => g.text).join('')))));
    expect(text(styled)).toEqual(text(plain));
    expect(text(plain).join(' ')).toContain('[nota] |x|');
    expect(marks(styled)).toEqual([]);
  });

  it('sits its underline and strike-through where :underline[…] and ~~…~~ do, by default', () => {
    const d = resolveCharacterStylesConfig([{ id: 'u', underline: { enabled: true }, strike: { enabled: true } }])[0]!;
    expect(d.underline.offset).toEqual(em(0.12));
    expect(d.underline.thickness).toEqual(em(0.05));
    expect(d.strike.offset).toEqual(em(0.28));
    expect(d.strike.thickness).toEqual(em(0.05));
  });

  it('works out of the box with the built-in style', () => {
    const doc = buildDocument({ markdown: 'Un [texto]|marker| aquí.' }, base());
    const m = marks(doc);
    expect(m.some((x) => x.kind === 'band')).toBe(true);
    expect(doc.contentWarnings?.some((w) => w.kind === 'unknownCharacterStyle') ?? false).toBe(false);
  });

  it('decorates the words of a table cell and a caption', () => {
    const doc = buildDocument({
      markdown: 'Ver :ref{id="t1"}.\n\n::resource{id="t1"}',
      resources: [{
        id: 't1',
        typeId: 'table',
        kind: 'table',
        caption: 'Una [leyenda]|marker|',
        createdAt: 0,
        updatedAt: 0,
        table: { model: { headerRowCount: 1, rows: [[{ content: 'H', isHeader: true }], [{ content: 'Celda [marcada]|marker|' }]] } },
      }],
    }, base({ characterStyles: styles }));
    const rb = doc.blocks.find((b) => b.resourceBlock)?.resourceBlock ?? doc.pages.flatMap((p) => p.floats ?? []).find((b) => b.resourceBlock)?.resourceBlock;
    expect(rb).toBeDefined();
    const cellBands = rb!.table!.cells.flatMap((c) => c.lines.flatMap((l) => l.marks ?? [])).filter((m) => m.kind === 'band');
    expect(cellBands).toHaveLength(1);
    expect(rb!.captionLines.flatMap((l) => l.marks ?? []).filter((m) => m.kind === 'band')).toHaveLength(1);
  });

  it('paints the band under the text in the HTML', () => {
    const doc = buildDocument({ markdown: 'Un [texto]|marker| aquí.' }, base({ characterStyles: styles }));
    const html = renderToHtml(doc);
    const band = html.indexOf('fill="#ffe14d"');
    const word = html.indexOf('texto');
    expect(band).toBeGreaterThan(0);
    expect(band).toBeLessThan(word);
    expect(html).toContain('opacity:0.500');
  });

  it('draws a rough band the same way every time', () => {
    const mark: VDTLineMark = { kind: 'band', x: 0, y: -10, length: 80, height: 12, thickness: 0, rough: 0.6, seed: 42 };
    expect(bandOutline(mark)).toEqual(bandOutline(mark));
    expect(bandOutline({ ...mark, seed: 43 })).not.toEqual(bandOutline(mark));
    expect(bandOutline({ ...mark, rough: 0 }).filter((c) => c.op === 'Q')).toHaveLength(0);
  });
});

describe('character style config', () => {
  it('resolves the defaults and strips them again', () => {
    const builtIn = resolveCharacterStylesConfig(undefined);
    expect(builtIn.map((s) => s.id)).toEqual(['marker']);
    expect(builtIn[0]!.highlight.enabled).toBe(true);
    expect(stripCharacterStylesDefaults(DEFAULT_CHARACTER_STYLES)).toBeUndefined();
    expect(stripCharacterStylesDefaults([])).toEqual([]);
    expect(stripCharacterStylesDefaults([{ id: 'x', name: 'x', italic: false, underline: { enabled: false, opacity: 100 } }])).toEqual([{ id: 'x' }]);
    // The marker's yellow is the default band colour: dropped.
    const stripped = stripConfigDefaults({ characterStyles: styles }).characterStyles!;
    expect(stripped[0]).toEqual({ id: 'marker', highlight: { enabled: true, opacity: 50, bottom: em(-0.1), top: em(0.5) } });
    expect(stripped.slice(1)).toEqual(styles.slice(1));
  });

  it('clamps the weight, opacity and roughness', () => {
    const [s] = resolveCharacterStylesConfig([{ id: 's', fontWeight: 1234, highlight: { opacity: 300, rough: -5 } }]);
    expect(s!.fontWeight).toBe(900);
    expect(s!.highlight.opacity).toBe(100);
    expect(s!.highlight.rough).toBe(0);
  });
});
