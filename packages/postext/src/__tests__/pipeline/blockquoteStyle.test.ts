import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { resolveBodyTextConfig, stripBodyTextDefaults, DEFAULT_BLOCKQUOTE_CONFIG } from '../../defaults/bodyText';
import { dimensionToPx } from '../../units';
import { renderToHtml } from '../../html-backend';
import type { PostextConfig } from '../../types';
import type { VDTBlock, VDTDocument } from '../../vdt';

// EF-135: a Markdown blockquote ignored the configuration: always #666666
// grey, always italic, the body's first-line indent and no side indent.
// `bodyText.blockquote` sets its colour (palette-linked like any other),
// italics, side indent and first-line indent; unset, it looks as in 1.4.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: [...s].length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });
const DPI = 96;
const px = (value: number) => dimensionToPx(mm(value), DPI);

const VERSE = '> A line of verse that runs on long enough to take a few lines in this narrow column of text.\n>\n> And a second paragraph of it, which wraps as well, for good measure.';

function build(bodyText: PostextConfig['bodyText'] = {}, extra: PostextConfig = {}): VDTDocument {
  return buildDocument({ markdown: `Body text before the quote.\n\n${VERSE}` }, {
    page: { width: mm(80), height: mm(200), dpi: DPI, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
    layout: { layoutType: 'single' },
    ...extra,
    bodyText: { fontFamily: 'Spectral', color: { hex: '#241f26', model: 'hex' }, firstLineIndent: mm(4), ...bodyText },
    header: { elements: [] },
    footer: { elements: [] },
  });
}

const quotes = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'blockquote');

describe('blockquote style (EF-135)', () => {
  it('keeps the 1.4 look by default: grey, italic, the body’s first-line indent, no side indent', () => {
    const doc = build();
    const [q] = quotes(doc);
    expect(q).toBeDefined();
    expect(q!.color).toBe('#666666');
    expect(q!.fontString).toMatch(/^italic /);
    const colX = doc.pages[0]!.columns[0]!.bbox.x;
    expect(q!.bbox.x).toBeCloseTo(colX, 6);
    expect(q!.lines[0]!.bbox.x - colX).toBeCloseTo(px(4), 6);
    expect(q!.lines[1]!.bbox.x - colX).toBeCloseTo(0, 6);
  });

  it('takes its colour, italics and indents from bodyText.blockquote', () => {
    const doc = build({ blockquote: { color: { hex: '#241f26', model: 'hex' }, italic: false, indent: mm(6), firstLineIndent: mm(0) } });
    const colX = doc.pages[0]!.columns[0]!.bbox.x;
    const measure = doc.pages[0]!.columns[0]!.bbox.width;
    for (const q of quotes(doc)) {
      expect(q.color).toBe('#241f26');
      expect(q.fontString).not.toMatch(/italic/);
      // `*…*` sets italics again.
      expect(q.italicFontString).toMatch(/^italic /);
      for (const line of q.lines) {
        expect(line.bbox.x - colX).toBeCloseTo(px(6), 6);
        // A justified line fills the measure less the indent.
        if (line.justifiedSpaceRatio === undefined) continue;
        const segs = line.segments ?? [];
        const words = segs.filter((seg) => seg.kind !== 'space').reduce((sum, seg) => sum + seg.width, 0);
        const spaces = segs.filter((seg) => seg.kind === 'space').length;
        expect(words + spaces * line.justifiedSpaceRatio * 7).toBeCloseTo(measure - px(6), 6);
      }
    }
    // The body text is not moved.
    const body = doc.blocks.find((b) => b.type === 'paragraph')!;
    expect(body.lines[0]!.bbox.x - colX).toBeCloseTo(px(4), 6);
  });

  it('counts the first-line indent from the side indent', () => {
    const doc = build({ blockquote: { indent: mm(5), firstLineIndent: mm(3) } });
    const colX = doc.pages[0]!.columns[0]!.bbox.x;
    const [q] = quotes(doc);
    expect(q!.lines[0]!.bbox.x - colX).toBeCloseTo(px(8), 6);
    expect(q!.lines[1]!.bbox.x - colX).toBeCloseTo(px(5), 6);
  });

  it('follows the palette entry its colour is linked to', () => {
    const doc = build(
      { blockquote: { color: { hex: '#000000', model: 'hex', paletteId: 'quote' } } },
      { colorPalette: [{ id: 'quote', name: 'Quote', value: { hex: '#8a2b0e', model: 'hex' } }] },
    );
    for (const q of quotes(doc)) expect(q.color).toBe('#8a2b0e');
  });

  it('reaches the HTML output in its colour, upright', () => {
    const doc = build({ blockquote: { color: { hex: '#8a2b0e', model: 'hex' }, italic: false, indent: mm(6) } });
    const html = renderToHtml(doc).toLowerCase();
    expect(html).toContain('#8a2b0e');
    const [q] = quotes(doc);
    expect(q!.fontString).not.toMatch(/italic/);
    expect(renderToHtml(build()).toLowerCase()).toContain('#666666');
  });

  it('resolves and strips its defaults', () => {
    expect(resolveBodyTextConfig().blockquote).toEqual(DEFAULT_BLOCKQUOTE_CONFIG);
    expect(resolveBodyTextConfig({ blockquote: { italic: false } }).blockquote).toEqual({ ...DEFAULT_BLOCKQUOTE_CONFIG, italic: false });
    expect(stripBodyTextDefaults({ blockquote: { color: { hex: '#666666', model: 'hex' }, italic: true, indent: { value: 0, unit: 'em' } } })).toBeUndefined();
    expect(stripBodyTextDefaults({ blockquote: { italic: false, firstLineIndent: mm(0) } })).toEqual({ blockquote: { italic: false, firstLineIndent: mm(0) } });
  });
});
