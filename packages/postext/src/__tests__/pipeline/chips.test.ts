import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { layoutResourceBlock } from '../../pipeline/resourceLayout';
import { resolveAllConfig } from '../../pipeline/config';
import { resolveChipSpans, chipContextOf } from '../../pipeline/chips';
import { defaultResourceTypes } from '../../defaults/resourceTypes';
import { resolveChipStylesConfig, stripChipStylesDefaults, pickChipStyle } from '../../defaults/chipStyles';
import { stripConfigDefaults } from '../../defaults';
import { parseMarkdownWithIssues } from '../../parse';
import { parseInlineSnippetSpans } from '../../parse/inlineSnippet';
import { CHIP_PLACEHOLDER } from '../../parse/inlineFormatting';
import { measureRichBlock, cachedMeasureRichBlock, createMeasurementCache } from '../../measure';
import { renderToHtml } from '../../html-backend';
import type { PostextConfig, Resource, VDTBlock, VDTDocument, VDTLineSegment } from '../../index';

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
const px = (value: number) => ({ value, unit: 'px' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

/** One narrow column, no balancing, ragged text: one pass, predictable lines. */
const base = (over: PostextConfig = {}): PostextConfig => ({
  page: { width: pt(300), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
  bodyText: { textAlign: 'left', hyphenation: { enabled: false } },
  ...over,
});

const chipSegs = (doc: VDTDocument): VDTLineSegment[] =>
  doc.blocks.flatMap((b) => b.lines.flatMap((l) => (l.segments ?? []).filter((s) => s.kind === 'chip')));

const firstParagraph = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'paragraph')!;

describe('chip parsing', () => {
  it('turns `:chip[…]{style=…}` into an atomic span with its own inline marks', () => {
    const spans = parseInlineSnippetSpans('Word bank: :chip[pila] :chip[**cable** rojo]{style="key"} and :chip[a \\] b].');
    const chips = spans.filter((s) => s.chip);
    expect(chips).toHaveLength(3);
    expect(chips.every((s) => s.text === CHIP_PLACEHOLDER)).toBe(true);
    expect(chips[0]!.chip!.style).toBeUndefined();
    expect(chips[0]!.chip!.spans.map((s) => s.text).join('')).toBe('pila');
    expect(chips[1]!.chip!.style).toBe('key');
    expect(chips[1]!.chip!.spans).toEqual([
      { text: 'cable', bold: true, italic: false },
      { text: ' rojo', bold: false, italic: false },
    ]);
    expect(chips[2]!.chip!.spans.map((s) => s.text).join('')).toBe('a ] b');
    // An empty chip is not a chip.
    expect(parseInlineSnippetSpans('no :chip[] here').some((s) => s.chip)).toBe(false);
  });

  it('carries the ambient emphasis and maps the placeholder to the directive', () => {
    const md = 'Pick **:chip[one]** or :chip[two]{style="x"} now.';
    const { blocks } = parseMarkdownWithIssues(md);
    const p = blocks[0]!;
    const chips = p.spans.filter((s) => s.chip);
    expect(chips[0]!.bold).toBe(true);
    expect(chips[1]!.bold).toBe(false);
    const i1 = p.text.indexOf(CHIP_PLACEHOLDER);
    const i2 = p.text.indexOf(CHIP_PLACEHOLDER, i1 + 1);
    expect(md.slice(p.sourceMap[i1]!)).toMatch(/^:chip\[one\]/);
    expect(md.slice(p.sourceMap[i2]!)).toMatch(/^:chip\[two\]/);
    // The text after the second chip stays aligned with the source.
    expect(md[p.sourceMap[i2 + 2]!]).toBe('n');
  });

  it('parses chips in list items and blockquotes', () => {
    const { blocks } = parseMarkdownWithIssues('- item :chip[a]\n\n> quote :chip[b]');
    expect(blocks.filter((b) => b.spans.some((s) => s.chip)).map((b) => b.type)).toEqual(['listItem', 'blockquote']);
  });
});

describe('chip styles', () => {
  it('defaults to one `chip` style and strips back to nothing', () => {
    const styles = resolveChipStylesConfig(undefined);
    expect(styles.map((s) => s.id)).toEqual(['chip']);
    expect(stripChipStylesDefaults([{ id: 'chip', name: 'Chip' }])).toBeUndefined();
    expect(stripChipStylesDefaults([{ id: 'key', paddingX: { value: 0.3, unit: 'em' }, bold: true }])).toEqual([{ id: 'key', bold: true }]);
    const cfg = stripConfigDefaults({ chipStyles: [{ id: 'chip' }] });
    expect(cfg.chipStyles).toBeUndefined();
  });

  it('falls back to the first style for a missing or unknown id', () => {
    const styles = resolveChipStylesConfig([{ id: 'a' }, { id: 'b' }]);
    expect(pickChipStyle(styles, undefined)!.id).toBe('a');
    expect(pickChipStyle(styles, 'nope')!.id).toBe('a');
    expect(pickChipStyle(styles, 'b')!.id).toBe('b');
  });

  it('reads palette colours and em lengths against the chip size', () => {
    const resolved = resolveAllConfig(base({
      colorPalette: [{ id: 'ink', name: 'Ink', value: hex('#112233') }],
      chipStyles: [{ id: 'k', fontSize: { value: 0.5, unit: 'em' }, paddingX: { value: 1, unit: 'em' }, borderColor: { hex: '#000000', model: 'hex', paletteId: 'ink' } }],
    }));
    const [span] = resolveChipSpans(parseInlineSnippetSpans(':chip[x]'), chipContextOf(resolved), 20);
    expect(span!.chip!.box).toMatchObject({ styleId: 'k', fontSizePx: 10, paddingXPx: 10, borderColor: '#112233' });
  });
});

describe('chip layout', () => {
  const chipsMd = ':chip[pila] :chip[cable] :chip[interruptor]';

  it('wraps chip by chip in a narrow column, never inside one', () => {
    const doc = buildDocument({ markdown: chipsMd }, base({ page: { width: pt(110), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } } }));
    const p = firstParagraph(doc);
    const words = p.lines.map((l) => l.segments!.filter((s) => s.kind !== 'space').map((s) => {
      expect(s.kind).toBe('chip');
      return s.chip!.runs.map((r) => r.text).join('');
    }));
    expect(words).toEqual([['pila', 'cable'], ['interruptor']]);
    for (const line of p.lines) expect(line.hyphenated).toBe(false);
  });

  it('sizes the box as text + padding + border and keeps the line height', () => {
    const cfg = base({ chipStyles: [{ id: 'c', paddingX: px(4), paddingY: px(3), borderWidth: px(1), borderRadius: px(100), gap: px(0) }] });
    const doc = buildDocument({ markdown: `A ${chipsMd} Z` }, cfg);
    const plain = buildDocument({ markdown: 'A pila cable interruptor Z' }, cfg);
    const p = firstParagraph(doc);
    const fontPx = Number(/(\d*\.?\d+)px/.exec(p.fontString)![1]);
    const [pila] = chipSegs(doc);
    const c = pila!.chip!;
    const textW = 4 * fontPx * 0.5;
    expect(c.runs[0]!.width).toBeCloseTo(textW, 6);
    expect(c.boxWidth).toBeCloseTo(textW + 2 * (4 + 1), 6);
    expect(pila!.width).toBeCloseTo(c.boxWidth, 6);
    expect(c.ascent).toBeCloseTo(fontPx * 0.8 + 3 + 1, 6);
    expect(c.descent).toBeCloseTo(fontPx * 0.25 + 3 + 1, 6);
    // The radius is clamped to half the box height.
    expect(c.borderRadius).toBeCloseTo((c.ascent + c.descent) / 2, 6);
    expect(c.background).toBe('#e8eef7');
    // Vertical padding does not change the leading.
    const plainLine = firstParagraph(plain).lines[0]!;
    expect(p.lines[0]!.baseline).toBe(plainLine.baseline);
    for (const line of p.lines) expect(line.bbox.height).toBe(plainLine.bbox.height);
  });

  it('widens a narrow space to the gap, shared between two chips, and not at a line edge', () => {
    const cfg = base({ chipStyles: [{ id: 'c', gap: px(20) }] });
    const doc = buildDocument({ markdown: `word :chip[a] :chip[b], end` }, cfg);
    const segs = firstParagraph(doc).lines[0]!.segments!;
    const space = segs.find((s) => s.kind === 'space')!.width;
    const [a, b] = segs.filter((s) => s.chip).map((s) => s.chip!);
    // word ␣ [a] ␣ [b] , ␣ end
    expect(a!.marginLeft).toBeCloseTo(20 - space, 6);
    expect(a!.marginRight + b!.marginLeft).toBeCloseTo(20 - space, 6);
    expect(a!.marginRight).toBeCloseTo(b!.marginLeft, 6);
    // Glued punctuation gets no margin.
    expect(b!.marginRight).toBe(0);
    // At the start of a line the margin goes.
    const edge = buildDocument({ markdown: ':chip[a] word' }, cfg);
    expect(chipSegs(edge)[0]!.chip!.marginLeft).toBe(0);
  });

  it('keeps chips unstretched on a justified line', () => {
    const cfg = base({ bodyText: { textAlign: 'justify', hyphenation: { enabled: false } } });
    const md = Array.from({ length: 12 }, (_, i) => `word${i} :chip[chip${i}]`).join(' ');
    const doc = buildDocument({ markdown: md }, cfg);
    const p = firstParagraph(doc);
    expect(p.lines.length).toBeGreaterThan(1);
    for (const seg of chipSegs(doc)) {
      const c = seg.chip!;
      expect(seg.width).toBeCloseTo(c.marginLeft + c.boxWidth + c.marginRight, 6);
      expect(c.boxWidth).toBeCloseTo(c.runs.reduce((s, r) => s + r.width, 0) + 2 * (c.paddingX + c.borderWidth), 6);
    }
  });

  it('sets chips in callouts, table cells, captions and notes', () => {
    const table: Resource = {
      id: 't',
      typeId: 'table',
      kind: 'table',
      caption: 'Bank :chip[uno]',
      note: 'Key :chip[dos]{style="small"}',
      createdAt: 0,
      updatedAt: 0,
      table: { model: { headerRowCount: 1, rows: [[{ content: 'H', isHeader: true }], [{ content: ':chip[tres] :chip[cuatro]' }]] } },
    };
    const cfg = base({ chipStyles: [{ id: 'chip' }, { id: 'small', fontSize: { value: 0.5, unit: 'em' } }] });
    const resolved = resolveAllConfig(cfg);
    const { block } = layoutResourceBlock({
      resource: table,
      resourceType: defaultResourceTypes('en').find((t) => t.id === 'table'),
      number: '1',
      columnWidth: 300,
      resolved,
      resourceNumbering: {},
      resourceTypes: defaultResourceTypes('en'),
      resources: [table],
    });
    const chipsOf = (lines: { segments?: VDTLineSegment[] }[]) => lines.flatMap((l) => (l.segments ?? []).filter((s) => s.chip));
    expect(chipsOf(block.captionLines)).toHaveLength(1);
    const [note] = chipsOf(block.noteLines);
    const noteFontPx = Number(/(\d*\.?\d+)px/.exec(block.noteFontString)![1]);
    expect(note!.chip!.runs[0]!.fontString).toContain(`${noteFontPx * 0.5}px`);
    expect(chipsOf(block.table!.cells.flatMap((c) => c.lines))).toHaveLength(2);

    const callout = buildDocument({ markdown: ':::callout\nInside :chip[box] text.\n:::' }, cfg);
    expect(chipSegs(callout)).toHaveLength(1);
  });

  it('measures a chip without a resolved box as bare text', () => {
    const spans = parseInlineSnippetSpans('a :chip[bc] d');
    const m = measureRichBlock(spans, '10px Serif', 'bold 10px Serif', 'italic 10px Serif', 'italic bold 10px Serif', 500, 12);
    const chip = m.lines[0]!.segments!.find((s) => s.chip)!;
    expect(chip.width).toBeCloseTo(10, 6);
    expect(chip.chip!.background).toBeUndefined();
  });

  it('leaves documents without chips unchanged when chip styles are configured', () => {
    const md = 'Plain text **bold** and *italic* that wraps across a few lines of the narrow column.';
    const a = buildDocument({ markdown: md }, base());
    const b = buildDocument({ markdown: md }, base({ chipStyles: [{ id: 'x', gap: px(30) }] }));
    expect(JSON.stringify(b.blocks.map((x) => x.lines))).toBe(JSON.stringify(a.blocks.map((x) => x.lines)));
  });
});

describe('chip HTML', () => {
  it('paints the box and keeps the words as text', () => {
    const doc = buildDocument({ markdown: 'Bank :chip[pila] :chip[cable]' }, base());
    const html = renderToHtml(doc);
    expect(html).toContain('>pila<');
    expect(html).toContain('>cable<');
    expect(html).toMatch(/background:#e8eef7;border:[\d.]+px solid #295AA3;border-radius:[\d.]+px;/i);
  });
});

describe('chip measurement cache', () => {
  it('keys a chip by its words and box, not its placeholder', () => {
    const cache = createMeasurementCache();
    const measure = (md: string) => cachedMeasureRichBlock(parseInlineSnippetSpans(md), '10px Serif', 'bold 10px Serif', 'italic 10px Serif', 'italic bold 10px Serif', 500, 12, undefined, cache);
    const short = measure('a :chip[bc] d');
    const long = measure('a :chip[bcdefgh] d');
    const w = (m: typeof short) => m.lines[0]!.segments!.find((s) => s.chip)!.width;
    expect(w(long)).toBeGreaterThan(w(short));
  });
});
