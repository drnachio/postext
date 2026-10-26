import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { renderToHtml } from '../../html-backend/html-backend.js';
import { parseMarkdown } from '../../parse/index.js';
import { readExercises, readOperation } from '../../exercises/model.js';
import { gridBox } from '../../exercises/grids.js';
import { CENTRAL } from '../../measure/cjk/cjkAnnotate.js';
import { areaElements } from '../../exercises/designs.js';
import { exerciseSettingsOf } from '../../defaults/boxes/exercises.js';
import { expandExercises } from '../../exercises/expand.js';
import type { VDTBlock, VDTChip, VDTDocument } from '../../vdt.js';
import type { DesignPathElement, DesignTextElement, PostextConfig } from '../../types.js';

// What the exercises programme left (#1244).

/** `html` with every `<tag …>…</tag>` element taken out (any letter case). */
function withoutElements(html: string, tag: string): string {
  const lower = html.toLowerCase();
  let out = '';
  let at = 0;
  for (let open = lower.indexOf(`<${tag}`, at); open >= 0; open = lower.indexOf(`<${tag}`, at)) {
    const close = lower.indexOf(`</${tag}>`, open);
    if (close < 0) break;
    out += html.slice(at, open);
    at = close + tag.length + 3;
  }
  return out + html.slice(at);
}

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const config = (extra: PostextConfig = {}): PostextConfig => ({
  headings: { balancing: { enabled: false } },
  page: { width: mm(148), height: mm(210), margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
  layout: { layoutType: 'single' },
  ...extra,
});
const build = (md: string, cfg: PostextConfig = config()): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());
const chips = (doc: VDTDocument): VDTChip[] => doc.blocks.flatMap((b) => b.lines.flatMap((l) => (l.segments ?? []).flatMap((s) => (s.chip ? [s.chip] : []))));
const textOf = (b: VDTBlock): string => b.lines.map((l) => (l.segments ?? []).map((s) => (s.chip ? `[${s.chip.blank ? '_' : s.chip.runs.map((r) => r.text).join('')}]` : s.text)).join('')).join(' / ');

describe('a reading over a blank', () => {
  const md = ':::exercise\n看拼音写词语。\n\n[[{春天|chūn tiān}]]\n:::\n';

  it('paints the pinyin over the blank in both editions, apart and centred over the box', () => {
    for (const edition of ['student', 'teacher'] as const) {
      const blank = chips(build(md, config({ locale: 'zh-Hans', exercises: { edition } }))).find((c) => c.styleId.includes('blank'))!;
      expect(!!blank.blank).toBe(edition === 'student');
      const readings = blank.readings!;
      expect(readings.map((r) => r.text)).toEqual(['chūn', 'tiān']);
      // Over the line, at half the text's size, the two a gap apart.
      expect(readings[0]!.dy).toBeLessThan(0);
      expect(readings[0]!.fontString).toMatch(/16\.6+\d*px/);
      expect(readings[1]!.dx).toBeGreaterThan(readings[0]!.dx + 4 * 7);
      // Centred in the box.
      const left = readings[0]!.dx;
      const right = blank.boxWidth - (readings[1]!.dx + 4 * 7);
      expect(Math.abs(left - right)).toBeLessThan(0.01);
    }
  });

  it('sets the reading beside a boxed blank, clear of its padding, on a vertical page too', () => {
    const vmd = ':::exercise\n□に漢字を書きましょう。\n\n[[{春|はる}]]\n:::\n';
    for (const writingMode of ['horizontal-tb', 'vertical-rl'] as const) {
      const doc = build(vmd, config({ locale: 'ja', layout: { layoutType: 'single', writingMode }, exerciseStyles: [{ id: 'k', blank: { look: 'box', width: 'answer' } }] }));
      const blank = chips(doc).find((c) => c.styleId.includes('blank'))!;
      const r = blank.readings![0]!;
      const rtEm = Number(/([\d.]+)px/.exec(r.fontString)![1]);
      // The reading's em box (its axis ± half its em) lies past the box's
      // top, right of a vertical line.
      const axis = r.dy - CENTRAL * rtEm;
      expect(axis + rtEm / 2).toBeLessThanOrEqual(-blank.ascent);
      expect(axis + rtEm / 2).toBeGreaterThan(-blank.ascent - rtEm / 2);
    }
  });

  it('writes the reading in the HTML page, the blank still unanswered', () => {
    const html = withoutElements(renderToHtml(build(md, config({ locale: 'zh-Hans' }))), 'script');
    expect(html).toContain('>chūn</span>');
    expect(html).toContain('>tiān</span>');
    expect(html).not.toContain('>春<');
  });
});

describe('the number of an exercise', () => {
  it('stands upright under an italic instruction', () => {
    const doc = build(':::exercise\nComplete the text.\n\nThe [[sun]] shines.\n:::\n', config({ exerciseStyles: [{ id: 'a', instruction: { italic: true }, number: { shape: 'disc' } }] }));
    const number = chips(doc).find((c) => c.styleId.endsWith('-number'))!;
    expect(number.runs[0]!.fontString).not.toMatch(/italic/);
    const words = doc.blocks.flatMap((b) => b.lines.flatMap((l) => l.segments ?? [])).find((s) => s.text === 'Com');
    expect(words).toBeDefined();
  });
});

describe('true or false before the statement', () => {
  it('puts the bracket or the boxes before the statement', () => {
    const md = ':::exercise{type=truefalse}\nV ou F.\n\n- [x] O Sol é uma estrela.\n:::\n';
    const bracket = build(md, config({ locale: 'pt-BR', exerciseStyles: [{ id: 'a', trueFalse: { look: 'bracket', place: 'start' } }] }));
    expect(bracket.blocks.map(textOf).join('\n')).toContain('1.\t([_]) O Sol é uma estrela.');
    const boxes = build(md, config({ locale: 'pt-BR', exerciseStyles: [{ id: 'a', trueFalse: { place: 'start' } }] }));
    expect(boxes.blocks.map(textOf).join('\n')).toMatch(/1\.\tV \[ \] F \[ \] O Sol/);
    // At the end by default.
    const end = build(md, config({ locale: 'pt-BR', exerciseStyles: [{ id: 'a', trueFalse: { look: 'bracket' } }] }));
    expect(end.blocks.map(textOf).join('\n')).toContain('O Sol é uma estrela.\t([_])');
  });
});

describe('squares sized to N cells', () => {
  const area = (cells?: number[]) => areaElements({ kind: 'tianzige', lines: 1, spacingPt: 20, widthPt: 200, color: { hex: '#888888', model: 'hex' }, weightPt: 0.5, ...(cells ? { cells } : {}) });
  const width = (els: ReturnType<typeof area>['elements']): number => (els[0] as DesignPathElement).viewBox![0];

  it('takes N cells, or groups a square apart that wrap at the measure', () => {
    expect(width(area().elements)).toBe(200);
    expect(width(area([4]).elements)).toBe(80);
    // 2 + 1 + 2 + 1 + 3 = 9 cells of 10: one row.
    const row = area([2, 2, 3]);
    expect(width(row.elements)).toBe(180);
    expect(row.heightPt).toBe(20);
    // A fourth group of 3 wraps, half a square under the first row.
    const two = area([2, 2, 3, 3]);
    expect(two.heightPt).toBe(50);
    const d = (two.elements[0] as DesignPathElement).d;
    expect(d).toContain('M0 30H60');
  });

  it('writes a model answer a character to a square, group after group', () => {
    const { elements } = areaElements({ kind: 'tianzige', lines: 1, spacingPt: 20, widthPt: 200, color: { hex: '#888888', model: 'hex' }, weightPt: 0.5, cells: [2, 2], answers: ['春天 夏天'], answerColor: { hex: '#d6246e', model: 'hex' } });
    const texts = elements.filter((e): e is DesignTextElement => e.kind === 'text');
    expect(texts.map((t) => [t.content, t.placement.offset?.x?.value])).toEqual([['春', 0], ['天', 20], ['夏', 60], ['天', 80]]);
  });

  it('reads `cells` on an open exercise, squares when the style rules lines', () => {
    const blocks = parseMarkdown(':::exercise{type=open cells="2 2"}\n写词语。\n:::\n');
    const settings = exerciseSettingsOf(undefined, 'zh-Hans');
    const box = expandExercises(blocks, { settings, bodySizePt: 10, lineHeightPt: 14, measurePt: 200, boxIds: new Set() }).boxes.find((b) => b.id.includes('-area-'))!;
    const grid = box.design!.slot!.elements[0] as DesignPathElement;
    // Two groups of two squares of 1.2 lines, a square apart: 5 squares.
    expect(grid.viewBox![0]).toBeCloseTo(5 * 14 * 1.2);
  });
});

describe('operations with decimals and partial products', () => {
  it('works out decimals in the mark written', () => {
    expect(readOperation('12,5 + 3,75', 0)).toMatchObject({ result: '16,25' });
    expect(readOperation('4.2 - 1.75', 0)).toMatchObject({ result: '2.45' });
    expect(readOperation('2,5 × 1,3', 0)).toMatchObject({ result: '3,25' });
    expect(readOperation('7,5 : 2', 0)).toMatchObject({ result: '3,75', sign: ':' });
    expect(readOperation('10 ÷ 3', 0)).toMatchObject({ result: '3', remainder: '1' });
    expect(readOperation('1,5 : 0,5', 0)).toBeUndefined();
    expect(readOperation('١٢٫٥ + ٣', 0)).toMatchObject({ result: '١٥٫٥' });
  });

  const lay = (md: string, extra: PostextConfig = {}) => {
    const blocks = parseMarkdown(md);
    const ex = readExercises(blocks).exercises[0]!;
    const style = exerciseSettingsOf(extra, extra.locale).styles[0]!;
    return gridBox({ kind: 'arithmetic', id: 'g', style, exercise: ex, blocks, bodySizePt: 10, lineHeightPt: 12, measurePt: 400 });
  };
  const cellsOf = (box: ReturnType<typeof lay>) => box.slots!.map((s) => [s.key, s.cell]);

  it('lines up the decimal marks of an addition', () => {
    const box = lay(':::exercise{type=arithmetic}\nWork out.\n\n- 12,5 + 3,75\n:::\n');
    const texts = (box.design!.slot!.elements ?? []).filter((e): e is DesignTextElement => e.kind === 'text');
    const marks = texts.filter((t) => t.content === ',').map((t) => (t.placement.offset!.x as { value: number }).value);
    expect(marks).toHaveLength(2);
    expect(marks[0]).toBe(marks[1]);
    // The answer's mark is a cell of its own, in the same column.
    const resultMark = box.slots!.find((s) => s.accept?.[0] === ',')!;
    expect(resultMark.cell![1]).toBe(Math.round(marks[0]! / box.info!.cellPt));
  });

  it('prints a row for each partial product of a two-digit multiplier', () => {
    const box = lay(':::exercise{type=arithmetic}\nWork out.\n\n- 23 × 45\n:::\n');
    const keys = box.slots!.map((s) => s.key);
    expect(keys.filter((k) => k.startsWith('a1_p1_'))).toHaveLength(3);
    expect(keys.filter((k) => k.startsWith('a1_p2_'))).toHaveLength(2);
    const p1 = box.slots!.filter((s) => s.key.startsWith('a1_p1_')).map((s) => s.accept![0]).join('');
    const p2 = box.slots!.filter((s) => s.key.startsWith('a1_p2_')).map((s) => s.accept![0]).join('');
    expect([p1, p2]).toEqual(['115', '92']);
    // The second a place further left, the result under both.
    const end = (prefix: string) => Math.max(...box.slots!.filter((s) => s.key.startsWith(prefix)).map((s) => s.cell![1]));
    expect(end('a1_p2_')).toBe(end('a1_p1_') - 1);
    expect(cellsOf(box).filter(([k]) => /^a1_\d+$/.test(String(k)))).toHaveLength(4);
    const off = lay(':::exercise{type=arithmetic}\nWork out.\n\n- 23 × 45\n:::\n', { exerciseStyles: [{ id: 'a', arithmetic: { partialProducts: false } }] });
    expect(off.slots!.some((s) => s.key.includes('_p'))).toBe(false);
  });

  it('keeps a working row a step, or two, for a long division', () => {
    const md = ':::exercise{type=arithmetic}\nWork out.\n\n- 864 : 4\n- 812 : 4\n:::\n';
    const rows = (extra: PostextConfig) => lay(md, extra).info!.rows;
    // Spanish: what is left only, one row a step.
    const es = rows({ locale: 'es' });
    const fr = rows({ locale: 'fr' });
    expect(es).toBeLessThan(fr);
    const products = rows({ locale: 'es', exerciseStyles: [{ id: 'a', arithmetic: { working: 'products' } }] });
    expect(products).toBe(fr);
  });
});

describe('grids on a right-to-left page', () => {
  it('records grids mirrored, an operation\'s cells counted from the right as painted', () => {
    const md = ':::exercise{type=arithmetic}\nاحسب.\n\n- ١٢ + ٣٤\n- ٥ + ٦\n:::\n\n:::exercise{type=crossword}\nحلّ.\n\n- شمس: نجم\n- سماء: فوق\n:::\n';
    const doc = build(md, config({ locale: 'ar', direction: 'rtl' } as PostextConfig));
    const [ops, cross] = doc.exercises!;
    expect(ops!.grids![0]).toMatchObject({ kind: 'arithmetic', rtl: true });
    expect(cross!.grids![0]).toMatchObject({ kind: 'crossword', rtl: true });
    // The first operation stands on the right: its units digit in column 0.
    const units = ops!.slots.find((s) => s.key === 'a1_1')!;
    expect(units.cell![1]).toBe(0);
    const tens = ops!.slots.find((s) => s.key === 'a1_0')!;
    expect(tens.cell![1]).toBe(1);
    // The second operation, to its left.
    expect(ops!.slots.find((s) => s.key === 'a2_1')!.cell![1]).toBeGreaterThan(2);
    const ltr = build(md.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))).exercises![0]!;
    expect(ltr.grids![0]!.rtl).toBeUndefined();
  });
});

describe('items, numbers and icons', () => {
  it('numbers items ① ② on a vertical page, where a Latin full stop would stand in the column', () => {
    const md = ':::exercise{type=truefalse}\n正しいものに○。\n\n- [x] 雲は水です。\n- [ ] 月は星です。\n:::\n';
    const vertical = build(md, config({ locale: 'ja', layout: { layoutType: 'single', writingMode: 'vertical-rl' } }));
    const all = vertical.blocks.map(textOf).join('\n');
    expect(all).toMatch(/①\s雲は水です。/);
    expect(all).toMatch(/②\s月は星です。/);
    expect(all).not.toMatch(/\d\.\s雲/);
    expect(build(md, config({ locale: 'ja' })).blocks.map(textOf).join('\n')).toContain('1.\t雲は水です。');
  });

  it('sets the item numbers regular when the exercise number is', () => {
    const md = ':::exercise\nChoose.\n\n1. Which is a root?\n   - [x] Carrot\n   - [ ] Leaf\n:::\n';
    const boldOf = (doc: VDTDocument) => doc.blocks.flatMap((b) => b.lines.flatMap((l) => l.segments ?? [])).find((s) => s.text === '1.')?.bold;
    expect(boldOf(build(md))).toBe(true);
    expect(boldOf(build(md, config({ exerciseStyles: [{ id: 'a', number: { fontWeight: 400 } }] })))).toBeFalsy();
  });

  it('reads an open question\'s first paragraph as its instruction, the rest as its text', () => {
    const blocks = parseMarkdown(':::exercise{type=open area=tianzige}\n看拼音，写词语。\n\nchūn tiān　xià tiān\n:::\n');
    const ex = readExercises(blocks).exercises[0]!;
    expect(ex.instruction).toHaveLength(1);
    expect(blocks[ex.body[0]!]!.text).toContain('chūn tiān');
    const doc = build(':::exercise{type=open area=tianzige}\n看拼音，写词语。\n\nchūn tiān\n:::\n', config({ locale: 'zh-Hans' }));
    const pinyin = doc.blocks.flatMap((b) => b.lines.flatMap((l) => l.segments ?? [])).find((s) => s.text.includes('chūn'));
    expect(pinyin?.bold).toBeFalsy();
  });
});
