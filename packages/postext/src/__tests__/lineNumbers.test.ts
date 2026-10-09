import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { continuationAfter } from '../pipeline/continuation';
import { renderToHtml } from '../html-backend';
import { collectConfigWarnings } from '../configWarnings';
import { DEFAULT_LINE_NUMBERS_CONFIG, resolveLineNumbersConfig, stripLineNumbersDefaults } from '../defaults/lineNumbers';
import { resolveBodyTextConfig } from '../defaults/bodyText';
import { stripConfigDefaults } from '../defaults';
import { collectFontUsage, configFontFamilies } from '../fonts/usage';
import { flowRectToPage, type VDTBlock, type VDTDocument, type VDTLine, type VDTPage } from '../vdt';
import type { LineNumbersConfig, PostextConfig } from '../types';

// #621: line numbers in the margin. The stub font: 7 px a character, a
// space 4 px.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    let w = 0;
    for (const c of s) w += c === ' ' ? 4 : 7;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
// 72 dpi, a 20 pt body on 30 pt leading, a 320 pt measure from x = 40.
const config = (lineNumbers: LineNumbersConfig | undefined, extra: PostextConfig = {}): PostextConfig => ({
  page: { dpi: 72, width: pt(400), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(40), right: pt(40) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  ...extra,
  bodyText: { fontSize: pt(20), lineHeight: { value: 1.5, unit: 'em' }, firstLineIndent: pt(0), hyphenation: { enabled: false }, ...extra.bodyText },
  ...(lineNumbers ? { lineNumbers } : {}),
});

const poem = (n: number, attrs = 'align=start', word = 'Line'): string =>
  [`:::verse{${attrs}}`, ...Array.from({ length: n }, (_, i) => `${word} ${i + 1} here`), ':::'].join('\n');

/** The printed numbers, page by page. */
const printed = (doc: VDTDocument): string[][] => doc.pages.map((p) => (p.lineNumberMarks ?? []).map((m) => m.label));
/** Every printed number with the line it labels. */
function numbered(doc: VDTDocument): { page: VDTPage; label: string; line: VDTLine; block: VDTBlock; x: number; width: number; baseline: number }[] {
  const out: ReturnType<typeof numbered> = [];
  for (const page of doc.pages) {
    (page.lineNumberMarks ?? []).forEach((m, i) => {
      const block = page.columns.flatMap((c) => c.blocks).find((b) => b.id === m.blockId)!;
      const text = page.lineNumbers!.blocks[i]!;
      if (text.kind !== 'text') throw new Error('not text');
      out.push({ page, label: m.label, line: block.lines[m.lineIndex]!, block, x: text.bbox.x, width: text.bbox.width, baseline: text.lines[0]!.baselineY });
    });
  }
  return out;
}

describe('lineNumbers: counting verse', () => {
  it('prints every fifth line of a 14-line poem on its baseline', () => {
    const doc = buildDocument({ markdown: `Before.\n\n${poem(14)}\n\nAfter.` }, config({ enabled: true }));
    expect(printed(doc)).toEqual([['5', '10']]);
    const marks = numbered(doc);
    expect(marks.map((m) => m.line.verseLine?.line)).toEqual([4, 9]);
    for (const m of marks) expect(m.baseline).toBe(m.line.baseline);
    expect(doc.lastLineNumber).toBe(14);
    // The prose around the poem is not counted.
    expect(marks.every((m) => m.block.lines.some((l) => l.verseLine))).toBe(true);
  });

  it('gives a turnover no number', () => {
    const long = 'This line of verse is far too long to fit on the measure of the page';
    const md = [':::verse{align=start}', 'One', 'Two', long, 'Four', 'Five', 'Six', ':::'].join('\n');
    const doc = buildDocument({ markdown: md }, config({ enabled: true }));
    const lines = doc.blocks.flatMap((b) => b.lines);
    expect(lines.some((l) => l.verseLine?.turnover)).toBe(true);
    const marks = numbered(doc);
    expect(marks.map((m) => m.label)).toEqual(['5']);
    expect(marks[0]!.line.text).toBe('Five');
  });

  it('restarts at each poem, starts at lineStart, skips numbered=false', () => {
    const md = [poem(6), '', 'Between.', '', poem(10, 'align=start lineStart=37'), '', poem(9, 'align=start numbered=false')].join('\n');
    const doc = buildDocument({ markdown: md }, config({ enabled: true }));
    expect(numbered(doc).map((m) => m.label)).toEqual(['5', '40', '45']);
  });

  it('takes a poem\'s own interval and numberFirst', () => {
    const md = [poem(6, 'align=start interval=2')].join('\n');
    const doc = buildDocument({ markdown: md }, config({ enabled: true, numberFirst: true }));
    expect(numbered(doc).map((m) => m.label)).toEqual(['1', '2', '4', '6']);
  });

  it(':::numbering{lines=1} restarts the count', () => {
    const md = [poem(7), '', ':::numbering{lines=1}', '', poem(6)].join('\n');
    const on = buildDocument({ markdown: md }, config({ enabled: true, restart: 'document' }));
    expect(numbered(on).map((m) => m.label)).toEqual(['5', '5']);
    const off = buildDocument({ markdown: [poem(7), '', poem(6)].join('\n') }, config({ enabled: true, restart: 'document' }));
    expect(numbered(off).map((m) => m.label)).toEqual(['5', '10']);
  });

  it('prints in the configured format', () => {
    const doc = buildDocument({ markdown: poem(10) }, config({ enabled: true, format: 'lower-roman' }));
    expect(numbered(doc).map((m) => m.label)).toEqual(['v', 'x']);
  });
});

describe('lineNumbers: counting every line', () => {
  const prose = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag} ${i} word word word word word word word word word word word word word word word.`).join(' ');

  it('counts body lines in reading order across two columns, skipping headings, notes and boxes', () => {
    const md = [
      '# Heading',
      '',
      `${prose(3, 'alpha')}[^n]`,
      '',
      ':::callout{type="note"}',
      'Inside the box, not counted at all.',
      ':::',
      '',
      prose(3, 'beta'),
      '',
      '[^n]: A note at the foot.',
    ].join('\n');
    const doc = buildDocument({ markdown: md }, config({ enabled: true, count: 'all', restart: 'document' }, { layout: { layoutType: 'double', gutterWidth: pt(20) } }));
    const counted = doc.pages[0]!.columns.flatMap((c) => c.blocks)
      .filter((b) => b.type === 'paragraph' && b.containerId === undefined && b.footnoteNote === undefined);
    const lines = counted.reduce((n, b) => n + b.lines.length, 0);
    expect(doc.pages.length).toBe(1);
    expect(doc.lastLineNumber).toBe(lines);
    const marks = numbered(doc);
    expect(marks.map((m) => Number(m.label))).toEqual(Array.from({ length: Math.floor(lines / 5) }, (_, i) => (i + 1) * 5));
    expect(marks.every((m) => m.block.type === 'paragraph' && m.block.containerId === undefined && m.block.footnoteNote === undefined)).toBe(true);
    // Both columns carry numbers, the first column's before the second's.
    const cols = doc.pages[0]!.lineNumberMarks!.map((m) => m.columnIndex);
    expect(cols).toEqual([...cols].sort((a, b) => a - b));
    expect(new Set(cols).size).toBe(2);
  });

  it('restarts on each page', () => {
    const doc = buildDocument({ markdown: prose(40, 'gamma') }, config({ enabled: true, count: 'all' }));
    expect(doc.pages.length).toBeGreaterThan(1);
    for (const labels of printed(doc).slice(0, -1)) expect(labels[0]).toBe('5');
  });

  it('a paragraph style can opt out, or in under count verse', () => {
    const md = [':::paragraphs{style="quiet"}', prose(3, 'delta'), ':::', '', ':::paragraphs{style="loud"}', prose(3, 'eps'), ':::'].join('\n');
    const styles = [{ id: 'quiet', lineNumbers: false }, { id: 'loud', lineNumbers: true }];
    const all = buildDocument({ markdown: md }, config({ enabled: true, count: 'all', numberFirst: true }, { paragraphStyles: styles }));
    const verse = buildDocument({ markdown: md }, config({ enabled: true, count: 'verse', numberFirst: true }, { paragraphStyles: styles }));
    for (const doc of [all, verse]) {
      const blocks = numbered(doc).map((m) => m.block.paragraphStyleId);
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks.every((s) => s === 'loud')).toBe(true);
    }
  });
});

describe('lineNumbers: where the numbers stand', () => {
  const twoPages = poem(30);

  it('outer: right of the text on a recto, left of it on a verso', () => {
    const doc = buildDocument({ markdown: twoPages }, config({ enabled: true, interval: 1 }, { page: { dpi: 72, width: pt(400), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(60), right: pt(30), mirror: true } } }));
    expect(doc.pages.length).toBe(2);
    for (const m of numbered(doc)) {
      const col = flowRectToPage(m.page, m.page.columns[0]!.bbox);
      if (m.page.index === 0) expect(m.x).toBeGreaterThanOrEqual(col.x + col.width);
      else expect(m.x + m.width).toBeLessThanOrEqual(col.x);
    }
    // 'inner' swaps them.
    const inner = buildDocument({ markdown: twoPages }, config({ enabled: true, interval: 1, position: 'inner' }));
    for (const m of numbered(inner)) {
      const col = m.page.columns[0]!.bbox;
      if (m.page.index === 0) expect(m.x + m.width).toBeLessThanOrEqual(col.x);
      else expect(m.x).toBeGreaterThanOrEqual(col.x + col.width);
    }
  });

  it('auto alignment sets the numbers flush toward the text, an em of their size away', () => {
    const doc = buildDocument({ markdown: poem(12) }, config({ enabled: true, position: 'left' }));
    const col = doc.pages[0]!.columns[0]!.bbox;
    // 16 px numbers (0.8 of 20 px): the gap is 16 px.
    for (const m of numbered(doc)) expect(m.x + m.width).toBeCloseTo(col.x - 16, 6);
    const right = buildDocument({ markdown: poem(12) }, config({ enabled: true, position: 'right', align: 'right' }));
    const marks = numbered(right);
    const ends = marks.map((m) => m.x + m.width);
    expect(new Set(ends).size).toBe(1);
    expect(marks[0]!.x).toBeGreaterThan(col.x + col.width + 16);
  });

  it('side: in the side column, flush with its edge next to the text', () => {
    const doc = buildDocument({ markdown: poem(10) }, config({ enabled: true, position: 'side' }, {
      layout: { layoutType: 'oneAndHalf', gutterWidth: pt(10), sideColumnPercent: 20, sideColumnRole: 'floats', sideColumnSide: 'right' },
    }));
    const page = doc.pages[0]!;
    const side = page.columns.find((c) => c.kind === 'side')!;
    expect(side).toBeDefined();
    for (const m of numbered(doc)) expect(m.x).toBeCloseTo(side.bbox.x, 6);
  });

  it('side: a number over a side box is reported', () => {
    const md = [':::callout{type="note" span="side"}', 'A side box.', ':::', '', poem(10)].join('\n');
    const doc = buildDocument({ markdown: md }, config({ enabled: true, position: 'side', interval: 1 }, {
      layout: { layoutType: 'oneAndHalf', gutterWidth: pt(10), sideColumnPercent: 30, sideColumnRole: 'floats', sideColumnSide: 'right' },
    }));
    expect((doc.contentWarnings ?? []).some((w) => w.kind === 'lineNumberOverlap')).toBe(true);
  });

  it('two columns: outer edges by default, the gutters on request', () => {
    const layout = { layoutType: 'double' as const, gutterWidth: pt(40) };
    const md = poem(60);
    const outer = buildDocument({ markdown: md }, config({ enabled: true, interval: 1 }, { layout }));
    const gutter = buildDocument({ markdown: md }, config({ enabled: true, interval: 1, multiColumn: 'gutter' }, { layout }));
    const [c0, c1] = outer.pages[0]!.columns.map((c) => c.bbox);
    for (const m of numbered(outer).filter((m) => m.page.index === 0)) {
      const col = m.page.lineNumberMarks!.find((k) => k.label === m.label)!.columnIndex;
      if (col === 0) expect(m.x + m.width).toBeLessThanOrEqual(c0!.x);
      else expect(m.x).toBeGreaterThanOrEqual(c1!.x + c1!.width);
    }
    const inGutter = numbered(gutter).filter((m) => m.page.index === 0);
    expect(inGutter.length).toBeGreaterThan(0);
    for (const m of inGutter) {
      expect(m.x).toBeGreaterThanOrEqual(c0!.x + c0!.width);
      expect(m.x + m.width).toBeLessThanOrEqual(c1!.x);
    }
  });

  it('start in a right-to-left document is the right', () => {
    const doc = buildDocument({ markdown: poem(10, 'align=start', 'سطر') }, config({ enabled: true, position: 'start' }, { direction: 'rtl', locale: 'ar' }));
    const page = doc.pages[0]!;
    expect(page.flow).toBeDefined();
    const col = flowRectToPage(page, page.columns[0]!.bbox);
    const marks = numbered(doc);
    expect(marks.length).toBe(2);
    for (const m of marks) expect(m.x).toBeGreaterThanOrEqual(col.x + col.width);
  });

  it('never moves a line', () => {
    const md = [`Before. ${'word '.repeat(60)}`, '', poem(25), '', `After. ${'word '.repeat(80)}`].join('\n');
    const snap = (doc: VDTDocument) => JSON.stringify(doc.blocks.map((b) => [b.pageIndex, b.columnIndex, b.bbox, b.lines.map((l) => [l.text, l.bbox, l.baseline])]));
    for (const ln of [{ enabled: true }, { enabled: true, count: 'all' as const, interval: 1 }]) {
      expect(snap(buildDocument({ markdown: md }, config(ln)))).toBe(snap(buildDocument({ markdown: md }, config(undefined))));
    }
  });

  it('sets nothing when off, and nothing in a vertical document', () => {
    expect(buildDocument({ markdown: poem(10) }, config({ enabled: false })).pages.every((p) => !p.lineNumbers)).toBe(true);
    const vertical = config({ enabled: true }, { layout: { layoutType: 'single', writingMode: 'vertical-rl' }, locale: 'ja' });
    expect(buildDocument({ markdown: poem(10, 'align=start', '行') }, vertical).pages.every((p) => !p.lineNumbers)).toBe(true);
    expect(collectConfigWarnings(vertical).map((w) => w.kind)).toContain('lineNumbersUnsupported');
  });
});

describe('lineNumbers: through a book', () => {
  it('a second chapter goes on from the first with restart document', () => {
    const cfg = config({ enabled: true, restart: 'document' });
    const one = { markdown: `# One\n\n${poem(7)}` };
    const first = buildDocument(one, cfg);
    expect(first.lastLineNumber).toBe(7);
    const after = continuationAfter(one, cfg);
    expect(after.lineNumber).toBe(7);
    const second = buildDocument({ markdown: `# Two\n\n${poem(6)}`, continuation: after }, cfg);
    expect(numbered(second).map((m) => m.label)).toEqual(['10']);
    expect(second.lastLineNumber).toBe(13);
    expect(second.lineNumberRestarted).toBeUndefined();
    // Per chapter, the count starts again.
    const chapters = config({ enabled: true, restart: 'chapter' });
    const restarted = buildDocument({ markdown: `# Two\n\n${poem(6)}`, continuation: continuationAfter(one, chapters) }, chapters);
    expect(numbered(restarted).map((m) => m.label)).toEqual(['5']);
    expect(restarted.lineNumberRestarted).toBe(true);
  });

  it('continuationAfter leaves a count of every line to the layout', () => {
    const cfg = config({ enabled: true, count: 'all', restart: 'document' });
    expect(continuationAfter({ markdown: poem(5) }, cfg, { lineNumber: 40 }).lineNumber).toBe(40);
    expect(continuationAfter({ markdown: poem(5) }, cfg).lineNumber).toBeUndefined();
  });
});

describe('lineNumbers: outputs and settings', () => {
  it('HTML: hidden from assistive technology and from a selection', () => {
    const doc = buildDocument({ markdown: poem(10) }, config({ enabled: true }));
    const html = renderToHtml(doc);
    const at = html.indexOf('class="pt-line-numbers"');
    expect(at).toBeGreaterThan(0);
    const slot = html.slice(at, html.indexOf('</div></div>', at));
    expect(slot).toContain('user-select:none');
    expect(slot).toContain('aria-hidden="true"');
    expect(slot).toContain('>5<');
    // The numbers are artifacts.
    expect(doc.pages[0]!.lineNumbers!.blocks.every((b) => b.kind === 'text' && b.artifact)).toBe(true);
  });

  it('resolves and strips its defaults', () => {
    const body = resolveBodyTextConfig(undefined);
    const r = resolveLineNumbersConfig({ enabled: true, count: 'all' }, body);
    expect(r).toMatchObject({ ...DEFAULT_LINE_NUMBERS_CONFIG, enabled: true, count: 'all', restart: 'page', fontFamily: body.fontFamily, fontWeight: body.fontWeight });
    expect(resolveLineNumbersConfig({ interval: 0, position: 'top' as never }, body)).toMatchObject({ interval: 5, position: 'outer', restart: 'poem' });
    expect(stripLineNumbersDefaults({ enabled: false, interval: 5, restart: 'poem' })).toBeUndefined();
    expect(stripLineNumbersDefaults({ enabled: true, count: 'all', restart: 'page', format: 'decimal' })).toEqual({ enabled: true, count: 'all' });
    expect(stripConfigDefaults({ lineNumbers: { enabled: true, interval: 10 } }).lineNumbers).toEqual({ enabled: true, interval: 10 });
    // A document without the section resolves as before.
    expect('lineNumbers' in buildDocument({ markdown: 'x' }, config(undefined)).config).toBe(false);
  });

  it('asks for the face it is set in', () => {
    expect(configFontFamilies({ lineNumbers: { enabled: true, fontFamily: 'Lato' } })).toContain('Lato');
    expect(collectFontUsage({ lineNumbers: { enabled: true, fontFamily: 'Lato', fontWeight: 300, italic: true } }).get('Lato')).toEqual([{ weight: 300, style: 'italic' }]);
    expect(collectFontUsage({ bodyText: { fontFamily: 'Inter', emphasis: 'bold' }, lineNumbers: { enabled: true, italic: true } }).get('Inter')).toContainEqual({ weight: 400, style: 'italic' });
  });

  it('reports unknown keys, words and formats', () => {
    const warnings = collectConfigWarnings({ lineNumbers: { enabled: true, intervall: 5, position: 'outter', format: 'klingon' } as unknown as LineNumbersConfig });
    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'unknownConfigKey', path: 'lineNumbers.intervall', suggestion: 'interval' }),
      expect.objectContaining({ kind: 'unknownConfigValue', path: 'lineNumbers.position', value: 'outter', used: 'outer', suggestion: 'outer' }),
      expect.objectContaining({ kind: 'unknownNumberFormat', path: 'lineNumbers.format', value: 'klingon', used: 'decimal' }),
    ]));
  });
});
