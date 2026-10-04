import { describe, it, expect } from 'vitest';
import { initMathEngine } from '../../math';
import { buildDocument } from '../../pipeline';
import { resolveAllConfig } from '../../pipeline/config';
import { stripConfigDefaults } from '../../defaults';
import { renderBlock } from '../../canvas-backend/blockRender';
import type { PostextConfig, Resource } from '../../types';
import type { VDTBlock, VDTDesignBlock, VDTDocument, VDTLine } from '../../vdt';

// #371: blocks set against their frame's direction (an English quotation,
// list or table in an Arabic book; an Arabic one in an English book) align
// and indent from their own start side, and the `start` / `end` keywords.

// 7 px a character, whatever the font.
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
const base = (direction: 'ltr' | 'rtl', extra: Partial<PostextConfig> = {}): PostextConfig => ({
  direction,
  page: { dpi: 72, width: pt(300), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { firstLineIndent: pt(14), textAlign: 'justify', indentAfterHeading: true },
  ...extra,
});
// Column: x 20, width 260 (flow coordinates; a right-to-left document's
// pages are mirrored onto the sheet, so its flow's right is the sheet's left).
const COL_X = 20;
const COL_W = 260;

const AR = 'قال AAA إن 2024 و١٤٤٥ (BBB) جميلة';
const EN = 'English words alpha beta gamma delta epsilon zeta eta theta iota kappa';

const blockWith = (doc: VDTDocument, text: string): VDTBlock =>
  doc.blocks.find((b) => b.lines.some((l) => l.text.includes(text)))!;
const lineWidth = (line: VDTLine): number => (line.segments ?? []).reduce((w, s) => w + s.width, 0);

describe('start / end keywords', () => {
  it('resolve to the flow sides they name and are saved as written', () => {
    const config: PostextConfig = {
      bodyText: { textAlign: 'end' },
      headings: { textAlign: 'start' },
      paragraphStyles: [{ id: 'sig', textAlign: 'end' }],
      captionStyle: { align: 'end', note: { align: 'start' } },
      footnotes: { textAlign: 'start' },
    };
    const r = resolveAllConfig(config);
    expect(r.bodyText.textAlign).toBe('right');
    expect(r.headings.textAlign).toBe('left');
    expect(r.paragraphStyles.find((s) => s.id === 'sig')!.textAlign).toBe('right');
    expect(r.captionStyle.align).toBe('right');
    expect(r.captionStyle.note.align).toBe('left');
    expect(r.footnotes.textAlign).toBe('left');
    const saved = stripConfigDefaults(config);
    expect(saved.bodyText?.textAlign).toBe('end');
    expect(saved.headings?.textAlign).toBe('start');
  });

  it('a float set at its end sits like one set right', () => {
    const fig = (align: 'end' | 'right'): Resource => ({
      id: 'fig', typeId: 'figure', kind: 'svg', caption: 'A figure', createdAt: 0, updatedAt: 0,
      svg: { fileId: 'f', width: 200, height: 100 },
      placement: { position: 'here', width: 0.5, align },
    });
    const x = (align: 'end' | 'right') => {
      const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="fig"}\n\nMore.', resources: [fig(align)] }, base('ltr'));
      return doc.blocks.find((b) => b.resourceBlock)!.resourceBlock!.bodyRect.x;
    };
    expect(x('end')).toBe(x('right'));
    expect(x('end')).toBeGreaterThan(COL_X + COL_W / 3);
  });
});

describe('an Arabic block in an English book', () => {
  it('a list hangs its text from the left and its marker on the right', () => {
    const doc = buildDocument({ markdown: `Intro.\n\n:::paragraphs{dir=rtl}\n1. ${AR} ${AR}\n2. ${AR}\n:::\n\n- English item` }, base('ltr'));
    const item = blockWith(doc, 'قال');
    expect(item.type).toBe('listItem');
    expect(item.direction).toBe('rtl');
    // Every line runs from the column's left edge; the marker column is on
    // the right.
    for (const line of item.lines) expect(line.bbox.x).toBe(COL_X);
    const markerW = 7 * item.bulletText!.length;
    expect(item.bulletOffsetX! + markerW).toBeLessThanOrEqual(COL_X + COL_W + 1e-9);
    expect(item.bulletOffsetX!).toBeGreaterThan(item.lines[0]!.measure!.x + item.lines[0]!.measure!.width);
    // The English list after it keeps its marker on the left.
    const english = blockWith(doc, 'English item');
    expect(english.bulletOffsetX).toBe(COL_X);
    expect(english.lines[0]!.bbox.x).toBeGreaterThan(COL_X);
    expect(english.lines[0]!.measure).toBeUndefined();
  });

  it('a styled prefix and separator turn round with the number', () => {
    const config = base('ltr', { orderedLists: { prefix: '(', separator: ')', separatorColor: { hex: '#ff0000', model: 'hex' } } });
    const doc = buildDocument({ markdown: `:::paragraphs{dir=rtl}\n1. ${AR}\n:::\n\n1. ${EN}` }, config);
    const item = blockWith(doc, 'قال');
    const english = blockWith(doc, 'English');
    // English: ( 1 ) left to right from the column's left edge.
    expect(english.prefixX!).toBeLessThan(english.bulletOffsetX!);
    expect(english.separatorX!).toBeGreaterThan(english.bulletOffsetX!);
    // Arabic: the same runs mirrored in the column, the number between
    // them, the prefix on its right (read first), all right of the text.
    expect(item.prefixX!).toBeGreaterThan(item.bulletOffsetX!);
    expect(item.separatorX!).toBeLessThan(item.bulletOffsetX!);
    expect(item.prefixX! + 7).toBeCloseTo(COL_X + COL_W - (english.prefixX! - COL_X), 6);
    expect(item.separatorX!).toBeGreaterThan(item.lines[0]!.measure!.x + item.lines[0]!.measure!.width);
  });

  it('a paragraph style\'s indent goes to the right', () => {
    const config = base('ltr', { paragraphStyles: [{ id: 'quote', indent: pt(20) }] });
    const doc = buildDocument({ markdown: `Intro.\n\n:::paragraphs{style=quote dir=rtl}\n${AR} ${AR} ${AR}\n:::\n\n:::paragraphs{style=quote}\n${EN} ${EN}\n:::` }, config);
    const english = blockWith(doc, 'English');
    expect(english.lines[1]!.bbox.x).toBe(COL_X + 20);
    const turnover = blockWith(doc, 'قال').lines[1]!;
    expect(turnover.bbox.x).toBe(COL_X);
    expect(turnover.measure!.width).toBeCloseTo(COL_W - 20, 6);
  });

  it('a footnote written in Arabic is set from the right at the foot', () => {
    const doc = buildDocument({ markdown: `English text with a note[^a].\n\n:::paragraphs{dir=rtl}\n[^a]: ${AR} ${AR} ${AR}\n:::\n` }, base('ltr'));
    const note = doc.blocks.find((b) => b.footnoteNote === 'a')!;
    expect(note.direction).toBe('rtl');
    expect(note.lines.length).toBeGreaterThan(1);
    for (const line of note.lines) {
      expect(line.measure).toBeDefined();
      expect(line.bbox.x).toBe(line.measure!.x);
      expect(line.measure!.x + line.measure!.width).toBeCloseTo(note.bbox.x + note.bbox.width, 6);
    }
  });

  it('a heading of its own direction is set from the right', () => {
    const doc = buildDocument({ markdown: `# ${AR} {dir=rtl}\n\nText.` }, base('ltr'));
    const heading = blockWith(doc, 'قال');
    expect(heading.direction).toBe('rtl');
    expect(heading.lines[0]!.measure).toEqual({ x: COL_X, width: COL_W });
  });

  it('a callout reads start and end in its own direction, left and right in the flow', () => {
    const config = (side: 'start' | 'left') => base('ltr', {
      calloutStyles: [{ id: 'note', stripe: { enabled: true, side, width: pt(6) }, padding: { left: pt(4), right: pt(4), top: pt(4), bottom: pt(4) } }],
    } as Partial<PostextConfig>);
    const md = `:::callout{type="note" dir=rtl}\n${AR}\n:::`;
    const stripeOf = (doc: VDTDocument) => {
      const frame = doc.blocks.find((b) => b.type === 'callout')!;
      return frame.designOverlay!.blocks.find((b: VDTDesignBlock) => b.kind === 'box' && Math.abs(b.bbox.width - 6) < 1e-6)!;
    };
    const frame = (doc: VDTDocument) => doc.blocks.find((b) => b.type === 'callout')!;
    const start = buildDocument({ markdown: md }, config('start'));
    const left = buildDocument({ markdown: md }, config('left'));
    // `start` of an Arabic box is its right; `left` stays the flow's left.
    expect(stripeOf(start).bbox.x).toBeCloseTo(frame(start).bbox.x + frame(start).bbox.width - 6, 6);
    expect(stripeOf(left).bbox.x).toBeCloseTo(frame(left).bbox.x, 6);
    // In an English box, `start` is the left.
    const english = buildDocument({ markdown: `:::callout{type="note"}\n${EN}\n:::` }, config('start'));
    expect(stripeOf(english).bbox.x).toBeCloseTo(frame(english).bbox.x, 6);
  });

  it('an Arabic table runs from the right: first column right, cells read and aligned from the right', () => {
    const table = (direction?: 'rtl'): Resource => ({
      id: 'tab', typeId: 'table', kind: 'table', caption: 'A table', createdAt: 0, updatedAt: 0,
      table: {
        model: { headerRowCount: 1, columnWidths: [1, 3], rows: [[{ content: 'أ' }, { content: 'ب' }], [{ content: 'جميلة' }, { content: 'AAA', align: 'end' }]] },
        ...(direction ? { direction } : {}),
      },
      placement: { position: 'here' },
    });
    const layout = (direction?: 'rtl') => {
      const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="tab"}\n\nMore.', resources: [table(direction)] }, base('ltr'));
      return doc.blocks.find((b) => b.resourceBlock)!.resourceBlock!.table!;
    };
    const plain = layout();
    const turned = layout('rtl');
    const cell = (t: typeof plain, row: number, col: number) => t.cells.find((c) => c.row === row && c.col === col)!;
    // Column 0 (a quarter of the width) on the left of an English table,
    // on the right of an Arabic one.
    expect(cell(plain, 0, 0).rect.x).toBeLessThan(cell(plain, 0, 1).rect.x);
    expect(cell(turned, 0, 0).rect.x).toBeGreaterThan(cell(turned, 0, 1).rect.x);
    expect(cell(turned, 0, 0).rect.width).toBeCloseTo(cell(plain, 0, 0).rect.width, 6);
    expect(turned.columnEdges).toEqual([...turned.columnEdges].sort((a, b) => a - b));
    // Cell text: the default (`left`, the start) aligns right; `end` left.
    const c10 = cell(turned, 1, 0);
    const line = c10.lines[0]!;
    expect(c10.align).toBe('right');
    expect(line.bbox.x + lineWidth(line)).toBeGreaterThan(c10.rect.x + c10.rect.width - 10);
    const c11 = cell(turned, 1, 1);
    expect(c11.align).toBe('left');
    expect(c11.lines[0]!.bbox.x).toBeLessThan(c11.rect.x + 10);
    // An Arabic word measured right to left.
    expect(c10.lines[0]!.segments!.some((s) => s.rtl)).toBe(true);
  });
});

describe('an English block in an Arabic book', () => {
  it('a {dir=ltr} list in a mirrored flow: text from the flow left, marker on the flow right (the sheet left)', () => {
    const doc = buildDocument({ markdown: `${AR}\n\n:::paragraphs{dir=ltr}\n- ${EN} ${EN}\n:::` }, base('rtl'));
    const page = doc.pages[0]!;
    expect(page.flow?.writingMode).toBe('horizontal-tb');
    const item = blockWith(doc, 'English');
    expect(item.direction).toBe('ltr');
    for (const line of item.lines) expect(line.bbox.x).toBe(COL_X);
    expect(item.bulletOffsetX!).toBeGreaterThan(item.lines[0]!.measure!.x + item.lines[0]!.measure!.width);
    // The English words read left to right on the sheet: their flow order
    // is reversed by the mirror.
    expect(item.lines[0]!.order).toBeDefined();
  });

  it('an English table runs from the sheet left: first column on the flow right', () => {
    const table: Resource = {
      id: 'tab', typeId: 'table', kind: 'table', caption: 'جدول', createdAt: 0, updatedAt: 0,
      table: {
        model: { headerRowCount: 1, rows: [[{ content: 'Name' }, { content: 'Value' }], [{ content: 'alpha.' }, { content: '12' }]] },
        direction: 'ltr',
      },
      placement: { position: 'here' },
    };
    const doc = buildDocument({ markdown: `${AR}\n\n::resource{id="tab"}\n\n${AR}`, resources: [table] }, base('rtl'));
    const t = doc.blocks.find((b) => b.resourceBlock)!.resourceBlock!.table!;
    const at = (row: number, col: number) => t.cells.find((c) => c.row === row && c.col === col)!;
    expect(at(0, 0).rect.x).toBeGreaterThan(at(0, 1).rect.x);
    // Measured left to right: the full stop stays with its word, no run is
    // right to left.
    const seg = at(1, 0).lines[0]!.segments!;
    expect(seg.some((s) => s.rtl)).toBe(false);
    expect(seg.map((s) => s.text).join('')).toBe('alpha.');
    // Aligned at its start: the flow right of the cell (the sheet left).
    const line = at(1, 0).lines[0]!;
    expect(line.bbox.x + lineWidth(line)).toBeGreaterThan(at(1, 0).rect.x + at(1, 0).rect.width - 10);
    expect(at(1, 0).align).toBe('right');
  });

  it('display maths stays one left-to-right box', async () => {
    await initMathEngine();
    const doc = buildDocument({ markdown: `${AR}\n\n$$x^2 + y^2 = z^2$$\n\n${AR}` }, base('rtl'));
    const math = doc.blocks.find((b) => b.mathRender)!;
    expect(math).toBeDefined();
    for (const line of math.lines) {
      expect(line.measure).toBeUndefined();
      expect((line.segments ?? []).some((s) => s.rtl)).toBe(false);
    }
  });

  it('a document with no opposite block is untouched', () => {
    const doc = buildDocument({ markdown: `- ${EN}\n\n> ${EN}` }, base('ltr'));
    for (const b of doc.blocks) {
      expect(b.direction).toBeUndefined();
      expect(b.lines.some((l) => l.measure)).toBe(false);
    }
  });
});

describe('canvas alignment of a line with a measure', () => {
  function recordingCtx() {
    const calls: { text: string; x: number }[] = [];
    const ctx = {
      font: '', fillStyle: '', letterSpacing: '0px', textBaseline: 'alphabetic', direction: 'ltr', textAlign: 'start',
      measureText: (s: string) => ({ width: s.length * 7 }),
      fillText(text: string, x: number) { calls.push({ text, x }); },
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, translate() {}, scale() {},
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  }
  const paint = (textAlign: 'left' | 'right' | 'center' | 'justify') => {
    const doc = buildDocument({ markdown: `:::paragraphs{dir=rtl}\n${AR}\n:::` }, base('ltr', { bodyText: { textAlign, firstLineIndent: pt(0) } }));
    const block = blockWith(doc, 'قال');
    const line = block.lines[0]!;
    const { ctx, calls } = recordingCtx();
    renderBlock(ctx, block, block.bbox.width, block.bbox.x);
    const left = Math.min(...calls.map((c) => c.x));
    return { left, width: lineWidth(line), measure: line.measure! };
  };
  it('left and justify (a last line) end flush right, right flush left, centre in the middle', () => {
    for (const align of ['left', 'justify'] as const) {
      const p = paint(align);
      expect(p.left).toBeCloseTo(p.measure.x + p.measure.width - p.width, 6);
    }
    const r = paint('right');
    expect(r.left).toBeCloseTo(r.measure.x, 6);
    const c = paint('center');
    expect(c.left).toBeCloseTo(c.measure.x + (c.measure.width - c.width) / 2, 6);
  });
});
