import { describe, it, expect } from 'vitest';
import { directChipRuns, directRuns, designBaseDirection, firstStrongDirection } from '../../design/bidiText';
import { layoutDesignSlot, type ResolvedTextPrimitive } from '../../design/layout';
import { resolveDesignSlot } from '../../defaults/headerFooter';
import { layoutSlotToVdt } from '../../pipeline/headerFooter';
import { tocRowOrder } from '../../pipeline/toc';
import { buildDocument } from '../../pipeline';
import { chipToken } from '../../measure/rich';
import { flowToPage, pageIsMirrored, type VDTDesignTextBlock, type VDTDesignTextLine, type VDTDocument, type VDTPage } from '../../vdt';
import type { DesignPlaceholderContext } from '../../design/placeholders';
import type { DesignElement, DesignTextElement, PostextConfig } from '../../types';
import type { InlineSpan } from '../../parse/types';

// Issue #377: design text (running heads, openers, contents part rows,
// callout titles), chips and the contents rows in right-to-left documents.
// Fixtures mix Arabic with Latin marker words and digits so the order is
// checkable.

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

const DPI = 72;
const pt = (value: number) => ({ value, unit: 'pt' as const });
const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const placeholders: DesignPlaceholderContext = { kind: 'header', page: stubPage, allPages: [stubPage], metadata: {}, chapterTitleByPageIndex: [] };
const FONT = '10px serif';
const w = (t: string) => t.length * 7;
const run = (text: string, extra: Record<string, unknown> = {}) => ({ text, fontString: FONT, width: w(text), ...extra });

const AR1 = 'الفصل الأول';
const AR2 = 'الباب الثاني';

/** The runs' texts in paint order. */
const painted = (line: { runs?: { text: string }[]; order?: number[]; text: string }): string[] => {
  if (!line.runs) return [line.text];
  const order = line.order ?? line.runs.map((_, i) => i);
  return order.map((i) => line.runs![i]!.text);
};

describe('directRuns', () => {
  it('leaves a left-to-right line alone', () => {
    expect(directRuns([run('Chapter 3 Alpha')], 'ltr', false, (_, t) => w(t))).toBeUndefined();
    expect(directRuns([run('Chapter 3 Alpha')], 'ltr', true, (_, t) => w(t))).toBeUndefined();
  });

  it('orders a Latin phrase inside an Arabic line on the sheet and in a mirrored flow', () => {
    const text = `${AR1} Chapter 3`;
    const sheet = directRuns([run(text)], 'rtl', false, (_, t) => w(t))!;
    expect(sheet.runs.map((r) => [r.text, r.rtl ?? false])).toEqual([[`${AR1} `, true], ['Chapter 3', false]]);
    // On the sheet the Latin phrase stands at the left of the Arabic.
    expect(painted({ ...sheet, text })).toEqual(['Chapter 3', `${AR1} `]);
    // In a mirrored flow the runs advance from the sheet's right edge.
    const flow = directRuns([run(text)], 'rtl', true, (_, t) => w(t))!;
    expect(flow.order).toBeUndefined();
    expect(painted({ ...flow, text })).toEqual([`${AR1} `, 'Chapter 3']);
  });

  it('flags an Arabic phrase inside a Latin line without reordering it on the sheet', () => {
    const text = `Part ${AR2} two`;
    const d = directRuns([run(text)], 'ltr', false, (_, t) => w(t))!;
    expect(d.runs.map((r) => [r.text, r.rtl ?? false])).toEqual([['Part ', false], [AR2, true], [' two', false]]);
    expect(d.order).toBeUndefined();
    const mirrored = directRuns([run(text)], 'ltr', true, (_, t) => w(t))!;
    expect(mirrored.order).toEqual([2, 1, 0]);
  });

  it('puts a final full stop at the start side of an Arabic line', () => {
    const d = directRuns([run('Alpha 12.')], 'rtl', false, (_, t) => w(t))!;
    expect(d.runs.map((r) => [r.text, r.rtl ?? false])).toEqual([['Alpha 12', false], ['.', true]]);
    expect(painted({ ...d, text: '' })).toEqual(['.', 'Alpha 12']);
  });

  it('keeps the advance of a cut run, kerning included', () => {
    const d = directRuns([run(`${AR1} Beta`, { width: 150 })], 'rtl', false, (_, t) => w(t))!;
    expect(d.runs.reduce((s, r) => s + r.width, 0)).toBeCloseTo(150, 6);
  });

  it('cuts runs of inline marks at direction changes and keeps their fonts', () => {
    const bold = '700 10px serif';
    const d = directRuns([run(`${AR1} `), { text: `Gamma ${AR2}`, fontString: bold, width: w(`Gamma ${AR2}`) }], 'rtl', false, (_, t) => w(t))!;
    expect(d.runs.map((r) => [r.text, r.fontString])).toEqual([
      [`${AR1} `, FONT], ['Gamma', bold], [` ${AR2}`, bold],
    ]);
    // Visual order: the second Arabic phrase, Gamma, then the first one.
    expect(painted({ ...d, text: '' })).toEqual([` ${AR2}`, 'Gamma', `${AR1} `]);
  });

  it('never cuts a stacked script pair', () => {
    const d = directRuns([run(AR1), run('x2', { stacked: true, width: 0 }), run('y')], 'rtl', false, (_, t) => w(t))!;
    expect(d.runs.map((r) => r.text)).toEqual([AR1, 'x2', 'y']);
  });
});

describe('base direction', () => {
  it('reads the first strong letter', () => {
    expect(firstStrongDirection('12 Alpha')).toBe('ltr');
    expect(firstStrongDirection(`(١٢) ${AR1}`)).toBe('rtl');
    expect(firstStrongDirection('12 — 34')).toBeUndefined();
  });

  it('takes the element direction, auto, or the document direction', () => {
    expect(designBaseDirection(undefined, 'Alpha', 'rtl')).toBe('rtl');
    expect(designBaseDirection('ltr', AR1, 'rtl')).toBe('ltr');
    expect(designBaseDirection('auto', 'Alpha', 'rtl')).toBe('ltr');
    expect(designBaseDirection('auto', '123', 'rtl')).toBe('rtl');
    expect(designBaseDirection('auto', AR1, 'ltr')).toBe('rtl');
  });
});

/** A one-element slot laid out to a VDT text block. */
const slotText = (
  content: string,
  extra: Partial<DesignTextElement> = {},
  ctx: { direction?: 'ltr' | 'rtl'; mirrored?: boolean } = { direction: 'rtl' },
  widthPt = 200,
): VDTDesignTextBlock => {
  const el = {
    kind: 'text', id: 't', content, fontSize: pt(10), overflow: 'wrap', align: 'start',
    placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(widthPt) } },
    ...extra,
  } as DesignElement;
  const slot = layoutSlotToVdt(resolveDesignSlot({ elements: [el] }), { x: 0, y: 0, width: 400, height: 100 }, 0, placeholders, DPI, ctx);
  return slot!.blocks[0] as VDTDesignTextBlock;
};

const primitive = (content: string, extra: Partial<DesignTextElement> = {}, ctx: { direction?: 'ltr' | 'rtl'; mirrored?: boolean } = { direction: 'rtl' }, widthPt = 200): ResolvedTextPrimitive => {
  const el = {
    kind: 'text', id: 't', content, fontSize: pt(10), overflow: 'wrap',
    placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(widthPt) } },
    ...extra,
  } as DesignElement;
  return layoutDesignSlot(resolveDesignSlot({ elements: [el] }), { container: { x: 0, y: 0, width: 400, height: 100 }, dpi: DPI, placeholders, ...ctx }, 0)
    .primitives[0] as ResolvedTextPrimitive;
};

describe('design text in a right-to-left document', () => {
  it('sets an Arabic running head right to left, flush with the right edge', () => {
    const block = slotText(`${AR1} Alpha`);
    expect(block.direction).toBe('rtl');
    const line = block.lines[0]!;
    expect(painted(line)).toEqual(['Alpha', `${AR1} `]);
    expect(line.runs!.find((r) => r.text.startsWith(AR1.slice(0, 3)))!.rtl).toBe(true);
    // `start` is the right of a right-to-left text on the sheet.
    expect(line.xOffset + line.width).toBeCloseTo(200, 6);
  });

  it('sets `start` at the flow left of a mirrored opener (the sheet right)', () => {
    const line = slotText(`${AR1} Alpha`, {}, { direction: 'rtl', mirrored: true }).lines[0]!;
    expect(line.xOffset).toBeCloseTo(0, 6);
    expect(painted(line)).toEqual([`${AR1} `, 'Alpha']);
    // `end` is the other side.
    const end = slotText(`${AR1} Alpha`, { align: 'end' }, { direction: 'rtl', mirrored: true }).lines[0]!;
    expect(end.xOffset + end.width).toBeCloseTo(200, 6);
  });

  it('keeps physical left and right', () => {
    expect(slotText(AR1, { align: 'left' }).lines[0]!.xOffset).toBeCloseTo(0, 6);
    expect(slotText('Alpha', { align: 'right' }, { direction: 'ltr' }).lines[0]!.xOffset).toBeCloseTo(200 - w('Alpha'), 6);
  });

  it('honours the element direction', () => {
    const ltr = slotText(`Alpha ${AR1}`, { direction: 'ltr' });
    expect(ltr.direction).toBeUndefined();
    expect(ltr.lines[0]!.xOffset).toBeCloseTo(0, 6);
    expect(painted(ltr.lines[0]!)).toEqual(['Alpha ', AR1]);
    const auto = slotText(`${AR1} Alpha`, { direction: 'auto' }, { direction: 'ltr' });
    expect(auto.direction).toBe('rtl');
  });

  it('leaves a Latin document byte-identical', () => {
    const block = slotText('Chapter 3 Alpha', {}, {});
    expect(block.direction).toBeUndefined();
    expect(block.lines[0]!.runs).toBeUndefined();
    expect(block.lines[0]!.order).toBeUndefined();
    expect(block.lines[0]!.xOffset).toBeCloseTo(0, 6);
  });

  it('justifies an Arabic paragraph and sets its last line flush right', () => {
    const block = slotText(`${AR1} ${AR2} ${AR1} ${AR2} ${AR1}`, { align: 'justify' }, { direction: 'rtl' }, 100);
    expect(block.lines.length).toBeGreaterThan(1);
    const first = block.lines[0]!;
    expect(first.runs!.reduce((s, r) => s + r.width, 0)).toBeCloseTo(100, 4);
    expect(first.runs!.every((r) => r.rtl)).toBe(true);
    const last = block.lines[block.lines.length - 1]!;
    expect(last.xOffset + last.width).toBeCloseTo(100, 4);
  });

  it('never tracks Arabic text', () => {
    expect(primitive(AR1, { letterSpacing: pt(2) }).letterSpacingPx).toBe(0);
    expect(primitive('Alpha', { letterSpacing: pt(2) }, {}).letterSpacingPx).toBe(2);
  });

  it('never cuts an Arabic word while wrapping', () => {
    const long = 'استخراجاتهم';
    const p = primitive(`${long} Alpha`, {}, { direction: 'rtl' }, 30);
    expect(p.lines.map((l) => l.text)).toContain(long);
    // A Latin word is still cut by character to fit.
    expect(primitive('Supercalifragilistic', {}, {}, 30).lines.length).toBeGreaterThan(1);
  });

  it('flags an Arabic word that runs past a wrapping line', () => {
    const long = 'استخراجاتهم';
    const p = primitive(`${long} Alpha`, {}, { direction: 'rtl' }, 30);
    expect(p.lines.find((l) => l.text === long)!.wordOverflow).toBe(true);
    expect(p.lines.find((l) => l.text === 'Alpha')?.wordOverflow).toBeUndefined();
    expect(slotText(long, {}, { direction: 'rtl' }, 30).lines[0]!.wordOverflow).toBe(true);
    // Truncated text never overflows.
    expect(primitive(long, { overflow: 'ellipsis-end' }, { direction: 'rtl' }, 30).lines[0]!.wordOverflow).toBeUndefined();
  });

  it('reports the overflow of a running head once', () => {
    const long = 'استخراجاتهمواستخراجاتهم';
    const doc = buildDocument({ markdown: `# ${long}\n\nنص.\n\n:::pagebreak\n:::\n\nنص آخر.` }, {
      direction: 'rtl', locale: 'ar',
      header: { elements: [{ kind: 'text', id: 'rh', content: '{chapterTitle}', fontSize: pt(10), overflow: 'wrap', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(10) } } }] },
    } as PostextConfig);
    const ws = (doc.contentWarnings ?? []).flatMap((w) => (w.kind === 'unbreakableWordOverflow' && w.text === long ? [w] : []));
    expect(ws.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ws.map((w) => w.text)).size).toBe(ws.length);
  });

  it('truncates at Arabic word boundaries, whatever is lost', () => {
    const text = `${AR1} ${AR2}`;
    // Room for "الفصل الأول الب…": the cut goes back before the word.
    const end = primitive(text, { overflow: 'ellipsis-end' }, { direction: 'rtl' }, 15 * 7);
    expect(end.lines[0]!.text).toBe(`${AR1}…`);
    const start = primitive(text, { overflow: 'ellipsis-start' }, { direction: 'rtl' }, 15 * 7);
    expect(start.lines[0]!.text).toBe(`…${AR2}`);
    // One Arabic word too long for the room: only the ellipsis.
    expect(primitive('استخراجاتهم', { overflow: 'ellipsis-end' }, { direction: 'rtl' }, 6 * 7).lines[0]!.text).toBe('…');
    const middle = primitive(`${AR1} ${AR2} ${AR1}`, { overflow: 'ellipsis-middle' }, { direction: 'rtl' }, 20 * 7);
    for (const part of middle.lines[0]!.text.split('…')) expect([AR1, AR2, '', ...`${AR1} ${AR2} ${AR1}`.split(' ')]).toContain(part.trim());
  });

  it('ends a truncated Arabic line with the ellipsis on its left', () => {
    const block = slotText(`${AR1} ${AR2}`, { overflow: 'ellipsis-end' }, { direction: 'rtl' }, 15);
    expect(painted(block.lines[0]!)[0]).toBe('…');
  });

  it('sets no drop cap on a letter joined to the next', () => {
    // Kaf joins the letter after it.
    const joined = primitive(`كتاب ${AR2} ${AR1} ${AR2}`, { dropCap: { lines: 2 } });
    const layout = layoutDesignSlot(resolveDesignSlot({ elements: [{
      kind: 'text', id: 't', content: `كتاب ${AR2} ${AR1} ${AR2}`, fontSize: pt(10), overflow: 'wrap', dropCap: { lines: 2 },
      placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(60) } },
    } as DesignElement] }), { container: { x: 0, y: 0, width: 400, height: 100 }, dpi: DPI, placeholders, direction: 'rtl' }, 0);
    expect(joined.dropCap).toBeUndefined();
    expect(layout.primitives.some((p) => (p as ResolvedTextPrimitive).dropCap)).toBe(false);
    // Alef joins nothing after it: it may stand apart.
    const alef = layoutDesignSlot(resolveDesignSlot({ elements: [{
      kind: 'text', id: 't', content: 'ارض واسعة جدا في الشرق', fontSize: pt(10), overflow: 'wrap', dropCap: { lines: 2 },
      placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(60) } },
    } as DesignElement] }), { container: { x: 0, y: 0, width: 400, height: 100 }, dpi: DPI, placeholders, direction: 'rtl' }, 0);
    expect(alef.primitives.some((p) => (p as ResolvedTextPrimitive).dropCap)).toBe(true);
  });
});

describe('chips', () => {
  const chip = (spans: InlineSpan[]) => chipToken(
    { text: '', bold: false, italic: false, chip: { style: 'k', spans, box: { styleId: 'k', paddingXPx: 2, fontSizePx: 10 } } } as unknown as InlineSpan,
    FONT, '700 10px serif', 'italic 10px serif', 'italic 700 10px serif', 0,
  ).chip!;

  it('orders an Arabic chip with a Latin word', () => {
    const c = chip([{ text: `${AR1} `, bold: false, italic: false }, { text: 'API 2', bold: true, italic: false }]);
    expect(c.runs.map((r) => [r.text, r.rtl ?? false])).toEqual([[`${AR1} `, true], ['API 2', false]]);
    expect(c.order).toEqual([1, 0]);
    expect(c.runs.reduce((s, r) => s + r.width, 0)).toBeCloseTo(w(`${AR1} API 2`), 6);
  });

  it('leaves a Latin chip as it was', () => {
    const c = chip([{ text: 'Alpha ', bold: false, italic: false }, { text: 'Beta', bold: true, italic: false }]);
    expect(c.order).toBeUndefined();
    expect(c.runs.every((r) => r.rtl === undefined)).toBe(true);
  });

  it('turns a chip order for a mirrored page', () => {
    const md = `مرحبا :chip[Alpha **Beta** ${AR1}]{style=k} بالعالم`;
    const doc = buildDocument({ markdown: md }, {
      direction: 'rtl', locale: 'ar',
      chipStyles: [{ id: 'k', name: 'K', paddingX: pt(2) }],
    } as PostextConfig);
    const seg = doc.blocks.flatMap((b) => b.lines).flatMap((l) => l.segments ?? []).find((s) => s.chip)!;
    expect(pageIsMirrored(doc.pages[0]!)).toBe(true);
    const runs = seg.chip!.runs;
    const order = seg.chip!.order ?? runs.map((_, i) => i);
    // The flow order is the visual order reversed: the flow's x runs from
    // the sheet's right edge.
    const visual = directChipRuns(runs.map((r) => ({ ...r, rtl: undefined })), (t) => w(t)).order ?? runs.map((_, i) => i);
    expect(order).toEqual([...visual].reverse());
  });
});

describe('contents rows', () => {
  it('puts the label after the title in a left-to-right row', () => {
    expect(tocRowOrder(undefined, 3, 7, false)).toBeUndefined();
    expect(tocRowOrder([2, 1, 0], 3, 5, false)).toEqual([2, 1, 0, 3, 4]);
  });

  it('puts the label at the left of a right-to-left row, whatever its title', () => {
    expect(tocRowOrder(undefined, 1, 5, true)).toEqual([4, 3, 2, 1, 0]);
    expect(tocRowOrder([2, 1, 0], 3, 5, true)).toEqual([4, 3, 2, 1, 0]);
    expect(tocRowOrder([0, 1, 2], 3, 5, true)).toEqual([4, 3, 0, 1, 2]);
  });

  const physicalXs = (doc: VDTDocument, page: VDTPage, line: VDTDesignTextLine | import('../../vdt').VDTLine) => {
    const l = line as import('../../vdt').VDTLine;
    const segs = l.segments!;
    const order = l.order ?? segs.map((_, i) => i);
    let x = l.bbox.x;
    const at = new Map<number, number>();
    for (const i of order) { at.set(i, flowToPage(page, x, 0).x); x += segs[i]!.width; }
    return { at, segs };
  };

  it('sets the page number of a Latin title on the left in an Arabic book', () => {
    const md = [':::toc', ':::', '', '# Introduction', '', 'نص عربي قصير.', '', `# ${AR1}`, '', 'نص عربي آخر.'].join('\n');
    const doc = buildDocument({ markdown: md }, {
      direction: 'rtl', locale: 'ar',
      headings: { levels: [{ level: 1, breakBefore: { enabled: true } }] },
    } as PostextConfig);
    const page = doc.pages[0]!;
    const rows = page.columns.flatMap((c) => c.blocks).filter((b) => b.tocEntry);
    expect(rows.length).toBe(2);
    for (const row of rows) {
      const line = row.lines[row.lines.length - 1]!;
      const { at, segs } = physicalXs(doc, page, line);
      const label = segs.length - 1;
      const title = 0;
      // The label is the leftmost thing on the sheet, the title the rightmost.
      expect(at.get(label)!).toBeLessThan(at.get(title)!);
    }
  });
});
