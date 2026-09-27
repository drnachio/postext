import { describe, it, expect } from 'vitest';
import { parseInlineFormatting, stripInlineFormatting } from '../../parse/inlineFormatting';
import { parseMarkdown } from '../../parse/blockParser';
import { measureRichBlock, SMALL_CAPS_SIZE_RATIO } from '../../measure/rich';
import { cachedMeasureRichBlock, createMeasurementCache } from '../../measure';
import { buildDocument } from '../../pipeline/build';
import { renderToHtml } from '../../html-backend';
import type { VDTBlock, VDTDocument, VDTLineSegment } from '../../vdt';
import type { PostextConfig } from '../../types';

// Deterministic text measurement stub (no DOM in the node test env): the
// width follows the font size, so a small-caps run measures narrower.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = parseFloat(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? '10');
    return { width: s.length * size * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

// EF-24: italic, weight and small caps on paragraph styles and callout
// bodies; inline `:smallcaps[…]`.

const FONTS = ['20px Serif', '700 20px Serif', 'italic 20px Serif', 'italic 700 20px Serif'] as const;
const texts = (segs: readonly VDTLineSegment[]): string[] => segs.filter((s) => s.kind !== 'space').map((s) => s.text);

describe('inline :smallcaps[…]', () => {
  it('parses into small-caps spans, marks inside and around it included', () => {
    const spans = parseInlineFormatting('Enter :smallcaps[Hamlet, **Prince**] and **:smallcaps[Ophelia]**.');
    expect(spans.map((s) => [s.text, !!s.smallCaps, s.bold])).toEqual([
      ['Enter ', false, false],
      ['Hamlet, ', true, false],
      ['Prince', true, true],
      [' and ', false, false],
      ['Ophelia', true, true],
      ['.', false, false],
    ]);
  });

  it('keeps an empty or unclosed marker literal and takes \\] for a bracket', () => {
    expect(parseInlineFormatting(':smallcaps[] x').map((s) => s.text).join('')).toBe(':smallcaps[] x');
    expect(parseInlineFormatting(':smallcaps[open').map((s) => s.text).join('')).toBe(':smallcaps[open');
    const spans = parseInlineFormatting(':smallcaps[a \\] b]');
    expect(spans.map((s) => [s.text, !!s.smallCaps])).toEqual([['a ] b', true]]);
  });

  it('stripInlineFormatting drops the markup (headings)', () => {
    expect(stripInlineFormatting('Act :smallcaps[One]')).toBe('Act One');
  });

  it('maps every plain character back to its source', () => {
    const md = 'The :smallcaps[act] ends.';
    const [block] = parseMarkdown(md);
    expect(block!.text).toBe('The act ends.');
    const at = (plain: number) => md[block!.sourceMap![plain]!];
    expect(block!.text.split('').map((_, i) => at(i)).join('')).toBe('The act ends.');
    // `a` of "act" maps inside the brackets, not to the `a` of "smallcaps".
    expect(block!.sourceMap![4]).toBe(md.indexOf('[act]') + 1);
  });

  it('sets lowercase letters as capitals at the small-caps size, capitals at full size', () => {
    const spans = parseInlineFormatting(':smallcaps[Hamlet] speaks');
    const { lines } = measureRichBlock(spans, ...FONTS, 2000, 24);
    const segs = lines[0]!.segments!;
    expect(texts(segs)).toEqual(['H', 'AMLET', 'speaks']);
    const [cap, small] = segs;
    expect(cap!.fontString).toBeUndefined();
    expect(small!.fontString).toBe(`${20 * SMALL_CAPS_SIZE_RATIO}px Serif`);
    expect(small!.width).toBeCloseTo(5 * 20 * SMALL_CAPS_SIZE_RATIO * 0.5, 6);
    expect(lines[0]!.text).toBe('HAMLET speaks');
    // The word is narrower than "HAMLET" set in full capitals.
    expect(cap!.width + small!.width).toBeLessThan(6 * 20 * 0.5);
  });

  it('keeps the bold and italic of the run', () => {
    const { lines } = measureRichBlock(parseInlineFormatting('***:smallcaps[Word]***'), ...FONTS, 2000, 24);
    const segs = lines[0]!.segments!;
    expect(texts(segs)).toEqual(['W', 'ORD']);
    expect(segs.every((s) => s.bold && s.italic)).toBe(true);
    expect(segs[1]!.fontString).toBe(`italic 700 ${20 * SMALL_CAPS_SIZE_RATIO}px Serif`);
  });

  it('hyphenates a small-caps word and keeps each line within the measure', () => {
    const spans = parseInlineFormatting(':smallcaps[typesetting typesetting typesetting]');
    for (const optimal of [false, true]) {
      const { lines } = measureRichBlock(spans, ...FONTS, 60, 24, { hyphenate: true, textAlign: 'justify', optimal });
      expect(lines.some((l) => l.hyphenated && l.text.endsWith('-'))).toBe(true);
      for (const line of lines) {
        expect(line.text).toBe(line.text.toUpperCase());
        const width = (line.segments ?? []).reduce((w, s) => w + s.width, 0);
        expect(width).toBeCloseTo(line.bbox.width, 6);
      }
    }
  });

  it('is part of the measurement cache key', () => {
    const cache = createMeasurementCache();
    const plain = cachedMeasureRichBlock(parseInlineFormatting('Hamlet **x**'), ...FONTS, 2000, 24, undefined, cache);
    const sc = cachedMeasureRichBlock(parseInlineFormatting(':smallcaps[Hamlet] **x**'), ...FONTS, 2000, 24, undefined, cache);
    expect(plain.lines[0]!.text).toBe('Hamlet x');
    expect(sc.lines[0]!.text).toBe('HAMLET x');
  });
});

describe(':smallcaps[…] in captions and table cells', () => {
  it('sets small capitals in a cell and in a caption, and around chips and refs', () => {
    const doc = buildDocument({
      markdown: 'See :smallcaps[the :ref{id="t1"}] and :smallcaps[:chip[key]].\n\n::resource{id="t1"}',
      resources: [{
        id: 't1', typeId: 'table', kind: 'table', caption: ':smallcaps[Cast] of the play', createdAt: 0, updatedAt: 0,
        table: { model: { headerRowCount: 0, rows: [[{ content: ':smallcaps[Hamlet]' }, { content: 'Prince' }]] } },
      }],
    }, { headings: { balancing: { enabled: false } } }, createMeasurementCache());
    const all = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])];
    const table = all.find((b) => b.type === 'resource')!.resourceBlock!;
    const cellText = table.table!.cells.map((c) => c.lines.map((l) => l.text).join(' '));
    expect(cellText).toContain('HAMLET');
    expect(cellText).toContain('Prince');
    expect(table.captionLines.map((l) => l.text).join(' ')).toContain('CAST of the play');
    const para = doc.blocks.find((b) => b.type === 'paragraph')!;
    const segs = para.lines.flatMap((l) => l.segments ?? []);
    // The reference label is set in small capitals too (…"ABLE 1"), and so
    // are the chip's words.
    expect(segs.some((s) => s.refResourceId === 't1' && s.fontString !== undefined)).toBe(true);
    const chip = segs.find((s) => s.chip)!.chip!;
    expect(chip.runs.map((r) => r.text).join('')).toBe('KEY');
  });

  it('keeps a reference set in small capitals one reference: one link, one plain char', () => {
    const md = 'See :smallcaps[the :ref{id="t1"}] now.';
    const doc = buildDocument({
      markdown: `${md}\n\n::resource{id="t1"}`,
      resources: [{
        id: 't1', typeId: 'table', kind: 'table', caption: 'Also :smallcaps[in :ref{id="t1"}] here', createdAt: 0, updatedAt: 0,
        table: { model: { headerRowCount: 0, rows: [[{ content: 'Cell' }]] } },
      }],
    }, { headings: { balancing: { enabled: false } } }, createMeasurementCache());
    const para = doc.blocks.find((b) => b.type === 'paragraph')!;
    expect(para.lines).toHaveLength(1);
    const line = para.lines[0]!;
    // The label is painted as several case runs: the first carries the
    // reference, the others continue it.
    const refs = line.segments!.filter((s) => s.refResourceId === 't1');
    expect(refs.length).toBeGreaterThan(1);
    expect(refs[0]!.refContinues).toBeUndefined();
    expect(refs.slice(1).every((s) => s.refContinues === true)).toBe(true);
    // The whole reference is one placeholder char of the plain text
    // ("See the ␣ now."), so the line still ends where the paragraph's
    // source does.
    expect(line.plainEnd).toBe('See the '.length + 1 + ' now.'.length);
    expect(line.sourceEnd).toBe(md.length);
    // HTML: one anchor per reference, in the body and in the caption.
    const html = renderToHtml(doc);
    expect(html.match(/<a href="#pt-res-t1"/g) ?? []).toHaveLength(2);
    const all = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])];
    const caption = all.find((b) => b.type === 'resource')!.resourceBlock!.captionLines;
    const capRefs = caption.flatMap((l) => l.segments ?? []).filter((s) => s.refResourceId === 't1');
    expect(capRefs.length).toBeGreaterThan(1);
    expect(capRefs.filter((s) => !s.refContinues)).toHaveLength(1);
  });
});

const pt = (value: number) => ({ value, unit: 'pt' as const });
const BASE: PostextConfig = {
  headings: { balancing: { enabled: false } },
  page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Body', textAlign: 'left', firstLineIndent: pt(0) },
};
const build = (md: string, config: PostextConfig): VDTDocument => buildDocument({ markdown: md }, config, createMeasurementCache());
const blockWith = (doc: VDTDocument, text: string): VDTBlock => {
  const b = doc.blocks.find((x) => x.type !== 'callout' && x.lines.some((l) => l.text.includes(text)));
  if (!b) throw new Error(`no block with ${text}`);
  return b;
};

describe('paragraph styles: italic, weight, small caps', () => {
  const config: PostextConfig = {
    ...BASE,
    paragraphStyles: [
      { id: 'dir', italic: true },
      { id: 'head', fontWeight: 600, boldFontWeight: 900 },
      { id: 'names', smallCaps: true },
    ],
  };
  const md = [
    'Plain words.',
    '',
    ':::paragraphs{style="dir"}',
    'Enter the *ghost* now.',
    ':::',
    '',
    ':::paragraphs{style="head"}',
    'Headword **bold** here.',
    ':::',
    '',
    ':::paragraphs{style="names"}',
    'Hamlet meets Horatio.',
    ':::',
  ].join('\n');
  const doc = build(md, config);

  it('sets an italic style in italics, emphasis back upright', () => {
    const plain = blockWith(doc, 'Plain words.');
    const dir = blockWith(doc, 'Enter');
    expect(plain.fontString.startsWith('italic')).toBe(false);
    expect(dir.fontString.startsWith('italic ')).toBe(true);
    expect(dir.italicFontString!.startsWith('italic')).toBe(false);
    const ghost = dir.lines[0]!.segments!.find((s) => s.text === 'ghost')!;
    expect(ghost.italic).toBe(true);
  });

  it('sets the style weights for regular and bold runs', () => {
    const head = blockWith(doc, 'Headword');
    expect(head.fontString.startsWith('600 ')).toBe(true);
    expect(head.boldFontString!.startsWith('900 ')).toBe(true);
  });

  it('sets a small-caps style in small capitals', () => {
    const names = blockWith(doc, 'AMLET');
    expect(names.lines[0]!.text).toBe('HAMLET MEETS HORATIO.');
    expect(texts(names.lines[0]!.segments!)).toEqual(['H', 'AMLET', 'MEETS', 'H', 'ORATIO', '.']);
  });

  it('leaves documents without the new fields unchanged', () => {
    const without = build('Plain words.', BASE);
    const withStyles = build('Plain words.', config);
    expect(blockWith(withStyles, 'Plain').fontString).toBe(blockWith(without, 'Plain').fontString);
    expect(blockWith(without, 'Plain').lines[0]!.segments?.some((s) => s.fontString)).toBeFalsy();
  });
});

describe('callout bodies: italic, weight, small caps', () => {
  const config: PostextConfig = {
    ...BASE,
    calloutStyles: [
      { id: 'dir', body: { italic: true, fontWeight: 300, boldFontWeight: 600 } },
      { id: 'sc', body: { smallCaps: true } },
    ],
  };
  const md = [
    ':::callout{type="dir"}',
    'He *exits* slowly.',
    '',
    '- A listed cue.',
    ':::',
    '',
    ':::callout{type="sc"}',
    'Dramatis personae.',
    '',
    '- Gertrude',
    ':::',
    '',
    'After the boxes.',
  ].join('\n');
  const doc = build(md, config);

  it('sets the paragraphs and list items of the box in its face', () => {
    const para = blockWith(doc, 'He ');
    const item = blockWith(doc, 'A listed cue.');
    for (const b of [para, item]) {
      expect(b.fontString.startsWith('italic 300 ')).toBe(true);
      expect(b.boldFontString!.startsWith('italic 600 ')).toBe(true);
      expect(b.italicFontString!.startsWith('300 ')).toBe(true);
    }
    const after = blockWith(doc, 'After the boxes.');
    expect(after.fontString.startsWith('italic')).toBe(false);
  });

  it('sets a small-caps body in small capitals, list items included', () => {
    expect(blockWith(doc, 'RAMATIS').lines[0]!.text).toBe('DRAMATIS PERSONAE.');
    expect(blockWith(doc, 'ERTRUDE').lines[0]!.text).toBe('GERTRUDE');
    expect(blockWith(doc, 'After the boxes.').lines[0]!.text).toBe('After the boxes.');
  });
});
