import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../../index';
import { renderToHtml } from '../../html-backend';
import { sesamePath } from '../../canvas-backend/annotations';
import type { PostextConfig, Resource } from '../../types';
import type { ResolvedResourceBlock, VDTDocument, VDTLine, VDTLineSegment } from '../../vdt';
import { installSizedStub, stubCharWidth } from '../vertical/stub';

// Ruby, emphasis marks, side lines and warichu notes in table cells,
// captions and notes (#429): measured, marked and painted as in the body.
// The stub measures kana and kanji 1 em, Latin letters ½ em.
installSizedStub();

interface Call { op: string; args: unknown[]; font?: string; fill?: string }

function recordingCanvas(): { canvas: HTMLCanvasElement; calls: Call[] } {
  const calls: Call[] = [];
  const target: Record<string | symbol, unknown> = { letterSpacing: '0px', font: '10px Test', fillStyle: '#000', textAlign: 'left', textBaseline: 'alphabetic' };
  const stack: Record<string | symbol, unknown>[] = [];
  const ctx = new Proxy(target, {
    get(t, key) {
      if (key === 'save') return () => { stack.push({ ...t }); };
      if (key === 'restore') return () => { Object.assign(t, stack.pop() ?? {}); };
      if (key === 'measureText') {
        return (s: string) => {
          const em = Number(/(\d*\.?\d+)px/.exec(String(t.font))?.[1] ?? 10);
          let w = 0;
          for (const ch of s) w += stubCharWidth(ch, em);
          return { width: w };
        };
      }
      if (key in t) return t[key];
      return (...args: unknown[]) => { calls.push({ op: String(key), args, font: String(t.font), fill: String(t.fillStyle) }); };
    },
    set(t, key, value) { t[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

const pt = (value: number) => ({ value, unit: 'pt' as const });
/** 72 dpi, 20 px text; the table and the caption are set at the body size
 *  and pitch. */
const config = (extra: Partial<PostextConfig> = {}, lineHeight = 40): PostextConfig => ({
  locale: 'ja',
  page: { width: pt(440), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(20), lineHeight: pt(lineHeight), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  captionStyle: { fontSize: pt(20), note: { fontSize: pt(20) } },
  tableStyle: { bodyFontSize: pt(20), headerFontSize: pt(20) },
  ...extra,
});
const vertical = (extra: Partial<PostextConfig> = {}) => config({ layout: { layoutType: 'single', writingMode: 'vertical-rl' }, ...extra });

/** A table of readings with furigana, kenten (sesame), a side line and a
 *  warichu note in its cells, its caption and its note. */
const TABLE: Resource = {
  id: 'tab', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
  caption: '{振|ふ}り仮名と:dots[傍点]',
  note: ':sideline[注意]して読む',
  table: {
    model: {
      headerRowCount: 1,
      rows: [
        [{ content: '語' }, { content: '例' }],
        [{ content: '{漢字|かん|じ}' }, { content: ':dots[大切]なこと' }],
        [{ content: '{東京|とう|きょう}' }, { content: '本:warichu[割注]{open="（" close="）"}文' }],
      ],
    },
  },
};
const MD = '表を見よ :ref{id="tab"}。';

const build = (cfg: PostextConfig, resources: Resource[] = [TABLE]): VDTDocument => buildDocument({ markdown: MD, resources }, cfg);
const resourceOf = (doc: VDTDocument): ResolvedResourceBlock =>
  [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].find((b) => b.resourceBlock)!.resourceBlock!;
const cellLines = (rb: ResolvedResourceBlock, text: string): VDTLine[] => rb.table!.cells.find((c) => c.lines.some((l) => l.text.includes(text)))!.lines;
const segs = (lines: VDTLine[]): VDTLineSegment[] => lines.flatMap((l) => l.segments ?? []);

describe('annotations in resource blocks (#429)', () => {
  it('cells keep their readings, marks, side lines and notes', () => {
    const rb = resourceOf(build(config()));
    expect(segs(cellLines(rb, '漢字')).filter((s) => s.ruby).map((s) => [s.text, s.ruby!.text])).toEqual([['漢', 'かん'], ['字', 'じ']]);
    // The reading at half the cell's size, over the base.
    const reading = segs(cellLines(rb, '漢字')).find((s) => s.ruby)!.ruby!;
    expect(reading.fontString).toContain('10px');
    expect(reading.runs[0]!.dy).toBeLessThan(0);
    // 傍点: the Japanese sesame over each marked character, nothing on な.
    const marked = cellLines(rb, '大切')[0]!;
    expect(marked.marks!.map((m) => [m.kind, m.x])).toEqual([['sesame', 10], ['sesame', 30]]);
    for (const m of marked.marks!) expect(m.y).toBeLessThan(-20 * 0.38);
    // The warichu note: its two rows between its brackets, its text never
    // set whole.
    const note = segs(cellLines(rb, '本')).find((s) => s.warichu)!.warichu!;
    expect([note.upper, note.lower]).toEqual(['割', '注']);
    expect(cellLines(rb, '本')[0]!.text).toBe('本（割注）文');
    // Caption and note.
    expect(segs(rb.captionLines).filter((s) => s.ruby).map((s) => s.ruby!.text)).toEqual(['ふ']);
    expect(rb.captionLines[0]!.marks!.filter((m) => m.kind === 'sesame')).toHaveLength(2);
    expect(rb.noteLines[0]!.marks!.map((m) => [m.kind, m.x, m.length])).toEqual([['line', 0, 40]]);
    // The line's text is the base text.
    expect(cellLines(rb, '漢字')[0]!.text).toBe('漢字');
  });

  it('a table without annotations is measured as before (no marks, no readings)', () => {
    const plain: Resource = { ...TABLE, caption: '仮名の表', note: '注', table: { model: { rows: [[{ content: '漢字' }, { content: '大切' }]] } } };
    const rb = resourceOf(build(config(), [plain]));
    const lines = [...rb.table!.cells.flatMap((c) => c.lines), ...rb.captionLines, ...rb.noteLines];
    expect(lines.some((l) => l.marks)).toBe(false);
    expect(segs(lines).some((s) => s.ruby || s.cjkMarks || s.warichu)).toBe(false);
  });

  it('*…* in a cell takes the region’s mark, a caption set in italics by its style takes none', () => {
    const t: Resource = { ...TABLE, caption: '仮名の表', note: undefined, table: { model: { rows: [[{ content: '*大切*' }]] } } };
    const doc = build(config({ captionStyle: { fontSize: pt(20), descriptionItalic: true } }), [t]);
    const rb = resourceOf(doc);
    expect(rb.table!.cells[0]!.lines[0]!.marks!.map((m) => m.kind)).toEqual(['sesame', 'sesame']);
    expect(rb.captionLines.some((l) => l.marks)).toBe(false);
  });

  it('book titles in cells: brackets in Japan, the wavy line in Taiwan', () => {
    const t: Resource = { ...TABLE, caption: undefined, note: undefined, table: { model: { rows: [[{ content: ':book[門]' }]] } } };
    const ja = resourceOf(build(config(), [t])).table!.cells[0]!.lines[0]!;
    expect(ja.text).toBe('『門』');
    expect(ja.marks).toBeUndefined();
    const tw = resourceOf(build(config({ locale: 'zh-Hant-TW' }), [t])).table!.cells[0]!.lines[0]!;
    expect(tw.text).toBe('門');
    expect(tw.marks!.map((m) => m.kind)).toEqual(['wavy']);
  });

  it('reports a cell or a caption whose leading is too tight for its readings or marks', () => {
    const warnings = (doc: VDTDocument) => (doc.contentWarnings ?? []).filter((w) => w.kind === 'rubyExceedsLeading' || w.kind === 'cjkMarksExceedLeading');
    // A pitch of 24 px for 20 px text: a gap of 0.2 em.
    const tight = warnings(build(config({}, 24)));
    // Marks: the sesames of a cell and of the caption, the note's side
    // line; readings: two cells and the caption.
    expect(tight.map((w) => [w.kind, w.text.replace(/\u00a0/g, ' ')]).sort()).toEqual([
      ['cjkMarksExceedLeading', '大切なこと'],
      ['cjkMarksExceedLeading', '注意して読む'],
      ['cjkMarksExceedLeading', '表 1. 振り仮名と傍点'],
      ['rubyExceedsLeading', '東京'],
      ['rubyExceedsLeading', '漢字'],
      ['rubyExceedsLeading', '表 1. 振り仮名と傍点'],
    ]);
    const ruby = tight.find((w) => w.kind === 'rubyExceedsLeading' && w.text === '漢字') as { gapEm: number; neededEm: number; pageIndex?: number };
    expect(ruby.gapEm).toBeCloseTo(0.2, 3);
    expect(ruby.neededEm).toBeCloseTo(0.5, 3);
    expect(ruby.pageIndex).toBe(0);
    // Half an em of leading is enough.
    expect(warnings(build(config({}, 30)))).toEqual([]);
  });

  it('on a vertical page the block stands upright: its text and marks are horizontal', () => {
    const doc = build(vertical());
    const rb = resourceOf(doc);
    expect(rb.rotation?.direction).toBe('ccw');
    const reading = segs(cellLines(rb, '漢字')).find((s) => s.ruby)!.ruby!;
    expect(reading.position).not.toBe('right');
    expect(reading.runs[0]!.upright).toBeUndefined();
    expect(cellLines(rb, '大切')[0]!.marks!.map((m) => [m.kind, m.x])).toEqual([['sesame', 10], ['sesame', 30]]);
  });
});

/** The canvas calls of the page that holds the table. */
const paint = (doc: VDTDocument): Call[] => {
  const { canvas, calls } = recordingCanvas();
  const page = doc.pages.find((p) => (p.floats ?? []).some((b) => b.resourceBlock))!;
  renderPageToCanvas(page, doc, canvas);
  return calls;
};

/** The lens of each sesame the canvas draws, as offsets from its first
 *  point (a `moveTo` then two `quadraticCurveTo`). */
function lenses(calls: Call[]): { x: number; y: number }[][] {
  const out: { x: number; y: number }[][] = [];
  calls.forEach((c, i) => {
    if (c.op !== 'quadraticCurveTo' || calls[i - 1]?.op !== 'moveTo') return;
    const [mx, my] = calls[i - 1]!.args as number[];
    const [ax, ay, bx, by] = c.args as number[];
    out.push([{ x: ax! - mx!, y: ay! - my! }, { x: bx! - mx!, y: by! - my! }]);
  });
  return out;
}

describe('annotations of resource blocks on the canvas', () => {
  for (const [name, cfg] of [['horizontal', config()], ['vertical', vertical()]] as const) {
    it(`paints the readings, the sesames, the side line and the note rows (${name})`, () => {
      const calls = paint(build(cfg));
      const texts = calls.filter((c) => c.op === 'fillText');
      for (const reading of ['かん', 'じ', 'とう', 'きょう', 'ふ']) {
        expect(texts.find((c) => c.args[0] === reading)?.font).toContain('10px');
      }
      // Four sesames (two in a cell, two in the caption), each drawn as
      // the lens stands in horizontal text: the block is upright.
      const drawn = lenses(calls);
      expect(drawn).toHaveLength(4);
      const [a] = sesamePath(6, false);
      for (const lens of drawn) {
        expect(lens[0]!.x).toBeCloseTo(a![1]!.x - a![0]!.x, 6);
        expect(lens[0]!.y).toBeCloseTo(a![1]!.y - a![0]!.y, 6);
        expect(lens[1]!.x).toBeCloseTo(a![2]!.x - a![0]!.x, 6);
        expect(lens[1]!.y).toBeCloseTo(a![2]!.y - a![0]!.y, 6);
      }
      // The side line of the note as a thin rectangle 40 px long.
      expect(calls.some((c) => c.op === 'fillRect' && c.args[2] === 40)).toBe(true);
      // The note's rows at its size, never its text whole at the cell's.
      expect(texts.filter((c) => c.font!.includes('10px') && /^[割注]$/.test(String(c.args[0]))).map((c) => c.args[0])).toEqual(['割', '注']);
      expect(texts.some((c) => String(c.args[0]).includes('割注') && c.font!.includes('20px'))).toBe(false);
    });
  }
});

describe('annotations of resource blocks in HTML', () => {
  for (const [name, cfg] of [['horizontal', config()], ['vertical', vertical()]] as const) {
    it(`writes the readings, the sesames, the side line and the note (${name})`, () => {
      const html = renderToHtml(build(cfg));
      for (const reading of ['かん', 'じ', 'とう', 'きょう', 'ふ']) {
        // The reading sits in the base's <rt> (#428), placed above the cell's line.
        expect(html).toMatch(new RegExp(`<rt style="all:inherit;display:contents;"><span style="position:absolute;left:[\\d.]+px;top:-[\\d.]+px;white-space:pre;"><span style="font:[^";]*10px[^";]*;line-height:0;[^"]*">${reading}<`));
      }
      // Four sesame paths, the lens as in horizontal text.
      const [a] = sesamePath(6, false);
      const first = `M${(a![0]!.x + 6).toFixed(3)} ${(a![0]!.y + 6).toFixed(3)}`;
      expect(html.match(/<svg aria-hidden="true" width="12.000" height="12.000"[^>]*><path d="M/g)).toHaveLength(4);
      expect(html.split(`<path d="${first}`).length - 1).toBe(4);
      // The marked text is emphasis.
      expect(html).toContain('<em style="font-style:inherit;">大切</em>');
      // The side line as a rule box 40 px long.
      expect(html).toMatch(/aria-hidden="true" style="position:absolute;left:0\.000px;top:[\d.]+px;width:40\.000px;height:[\d.]+px;background:/);
      // The note reads once.
      expect(html).toContain('role="note" aria-label="割注"');
    });
  }
});
