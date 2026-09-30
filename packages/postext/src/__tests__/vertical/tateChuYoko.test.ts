import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas, renderToHtml } from '../../index';
import { parseInlineFormatting, stripInlineFormatting } from '../../parse/inlineFormatting';
import { verticalRuns, uprightDigitRuns, forcedVerticalRuns, segmentOrientation } from '../../writingMode';
import { graphemesOf } from '../../measure/graphemes';
import { atomicSpanToken } from '../../measure/rich';
import { withMeasureWritingMode } from '../../measure/vertical';
import type { CjkRegion, PostextConfig, Dimension, Resource } from '../../types';
import type { VDTDocument, VDTLine, VDTLineSegment } from '../../vdt';
import { installSizedStub, stubCharWidth } from './stub';

installSizedStub();

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const EM = 10;

const config = (locale: string, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(30), right: pt(30), bottom: pt(30), left: pt(30) } },
  bodyText: { fontFamily: 'Test Serif', fontSize: pt(EM), lineHeight: pt(16), textAlign: 'left', firstLineIndent: pt(0) },
  layout: { writingMode: 'vertical-rl', layoutType: 'single' },
  cjk: { punctuationWidth: 'fullwidth', compressAdjacent: false, trimLineStart: false, latinSpacing: { value: 0, unit: 'em' } },
  locale,
  ...extra,
});

function lines(doc: VDTDocument): VDTLine[] {
  const out: VDTLine[] = [];
  for (const page of doc.pages) for (const col of page.columns) for (const b of col.blocks) out.push(...(b.lines ?? []));
  return out;
}

function segments(doc: VDTDocument): VDTLineSegment[] {
  return lines(doc).flatMap((l) => l.segments ?? []);
}

const texts = (runs: ReturnType<typeof verticalRuns>) => runs.map((r) => [r.text, r.glyph.orient]);

describe('tate-chu-yoko: which numbers stand in one cell (#190)', () => {
  it('sets a run of at most N digits in one cell, whole or not at all', () => {
    const g = graphemesOf('2026年9月28日');
    expect(texts(verticalRuns(g, 'taiwan', 2))).toEqual([
      ['2026', 'sideways'], ['年', 'upright'], ['9', 'tcy'], ['月', 'upright'], ['28', 'tcy'], ['日', 'upright'],
    ]);
    expect(texts(verticalRuns(g, 'taiwan', 4))[0]).toEqual(['2026', 'tcy']);
    expect(texts(verticalRuns(graphemesOf('第120回'), 'taiwan', 3))[1]).toEqual(['120', 'tcy']);
    expect(texts(verticalRuns(graphemesOf('第120回'), 'taiwan', 2))[1]).toEqual(['120', 'sideways']);
    expect(verticalRuns(g, 'taiwan', 0).some((r) => r.glyph.orient === 'tcy')).toBe(false);
  });

  it('leaves grouped and decimal numbers, and numbers inside words, sideways', () => {
    for (const s of ['10,000人', '3.14倍', 'A4紙', 'mp3檔', '3D列印']) {
      expect(uprightDigitRuns(graphemesOf(s), 4).size, s).toBe(0);
    }
    // Next to an upright sign each number stands on its own.
    expect(texts(verticalRuns(graphemesOf('30×40'), 'mainland', 2))).toEqual([['30', 'tcy'], ['×', 'upright'], ['40', 'tcy']]);
  });
});

describe('orientation marks in the parser (#190)', () => {
  it('keeps the text and flags the span', () => {
    const spans = parseInlineFormatting('第:tcy[12]回，:upright[GDP]與:sideways[34]。');
    expect(spans.map((s) => s.text).join('')).toBe('第12回，GDP與34。');
    expect(spans.find((s) => s.text === '12')?.combineUpright).toBe(true);
    expect(spans.find((s) => s.text === 'GDP')?.orientation).toBe('upright');
    expect(spans.find((s) => s.text === '34')?.orientation).toBe('sideways');
    expect(stripInlineFormatting('第:tcy[12]回')).toBe('第12回');
  });

  it('reads a mark inside another one, the innermost winning, and a link inside a mark', () => {
    const nested = parseInlineFormatting(':tcy[:upright[AB]]');
    expect(nested).toEqual([{ text: 'AB', bold: false, italic: false, orientation: 'upright' }]);
    const around = parseInlineFormatting('第:tcy[x:upright[AB]y]回');
    expect(around.map((s) => [s.text, s.combineUpright, s.orientation])).toEqual([
      ['第', undefined, undefined], ['x', true, undefined], ['AB', undefined, 'upright'], ['y', true, undefined], ['回', undefined, undefined],
    ]);
    expect(stripInlineFormatting(':tcy[:upright[AB]]')).toBe('AB');
    const link = parseInlineFormatting('用:sideways[[iPhone](https://example.com)]拍');
    const phone = link.find((s) => s.text === 'iPhone')!;
    expect(phone.orientation).toBe('sideways');
    expect(phone.links?.[0]?.href).toBe('https://example.com');
    // Brackets that never balance close at the first one, as before.
    expect(parseInlineFormatting(':tcy[a[b]').map((s) => [s.text, s.combineUpright])).toEqual([['a[b', true]]);
  });

  it('maps the text of a nested mark to its source', () => {
    const md = '第:tcy[:upright[AB]]回';
    const doc = buildDocument({ markdown: md }, config('zh-Hant'));
    const block = doc.pages[0]!.columns[0]!.blocks[0]!;
    expect(block.sourceMap?.[1]).toBe(md.indexOf('AB'));
    expect(block.sourceMap?.[2]).toBe(md.indexOf('AB') + 1);
    expect(block.sourceMap?.[3]).toBe(md.indexOf('回'));
  });

  it('keeps emphasis inside a mark', () => {
    const spans = parseInlineFormatting(':tcy[**12**]');
    expect(spans).toEqual([{ text: '12', bold: true, italic: false, combineUpright: true }]);
  });
});

describe('tate-chu-yoko in vertical lines (#190)', () => {
  it('measures 2026年9月28日: 2026 sideways, 9 and 28 one cell each', () => {
    const doc = buildDocument({ markdown: '今天是2026年9月28日。' }, config('zh-Hant'));
    const line = lines(doc)[0]!;
    // 今天是 + 2026 sideways (4 half ems) + 年 9 月 28 日 。 = 3 + 2 + 6 ems.
    expect(line.bbox.width).toBeCloseTo(11 * EM, 6);
    const all = line.segments!.map((s) => s.text).join('');
    expect(all).toBe('今天是2026年9月28日。');
  });

  it('sets a three-digit number in one cell under uprightDigits 3 and none under 0', () => {
    const three = buildDocument({ markdown: '第120回' }, config('zh-Hant', { cjk: { uprightDigits: 3, latinSpacing: { value: 0, unit: 'em' } } }));
    expect(lines(three)[0]!.bbox.width).toBeCloseTo(3 * EM, 6);
    const off = buildDocument({ markdown: '第28回' }, config('zh-Hant', { cjk: { uprightDigits: 0, latinSpacing: { value: 0, unit: 'em' } } }));
    expect(lines(off)[0]!.bbox.width).toBeCloseTo(3 * EM, 6); // 28 sideways: two half ems
    const two = buildDocument({ markdown: '第28回' }, config('zh-Hant'));
    expect(lines(two)[0]!.bbox.width).toBeCloseTo(3 * EM, 6); // 28 in one cell
    const wide = buildDocument({ markdown: '第2026回' }, config('zh-Hant', { cjk: { uprightDigits: 4, latinSpacing: { value: 0, unit: 'em' } } }));
    expect(lines(wide)[0]!.bbox.width).toBeCloseTo(3 * EM, 6);
  });

  it('takes no Han–Latin space around a number set in one cell', () => {
    const spaced = config('zh-Hant', { cjk: { latinSpacing: { value: 0.25, unit: 'em' }, punctuationWidth: 'fullwidth' } });
    const doc = buildDocument({ markdown: '第28回用iPhone拍' }, spaced);
    const segs = lines(doc)[0]!.segments!;
    const autos = segs.filter((s) => s.autospace);
    // Around iPhone only: 回 iPhone 拍.
    expect(autos).toHaveLength(2);
  });

  it('sets :tcy[3.0] as one cell of one em, compressed', () => {
    const doc = buildDocument({ markdown: '版本:tcy[3.0]發布' }, config('zh-Hans'));
    const seg = segments(doc).find((s) => s.tcy);
    expect(seg).toBeDefined();
    expect(seg!.text).toBe('3.0');
    expect(seg!.width).toBeCloseTo(EM, 6);
  });

  it('sets :upright[GDP] as three cells and keeps :sideways[12] turned', () => {
    const doc = buildDocument({ markdown: '中國:upright[GDP]增長:sideways[12]倍' }, config('zh-Hans'));
    const up = segments(doc).find((s) => s.orientation === 'upright');
    expect(up?.text).toBe('GDP');
    expect(up!.width).toBeCloseTo(3 * EM, 6);
    const side = segments(doc).find((s) => s.orientation === 'sideways');
    expect(side?.text).toBe('12');
    expect(side!.width).toBeCloseTo(stubCharWidth('1', EM) * 2, 6);
  });

  it('never breaks inside an upright run', () => {
    // A column of 4 ems: GDP must go down whole.
    const narrow = config('zh-Hans', { page: { width: pt(300), height: pt(4 * EM + 60), dpi: 72, margins: { top: pt(30), right: pt(30), bottom: pt(30), left: pt(30) } } });
    const doc = buildDocument({ markdown: '中國的:upright[GDP]' }, narrow);
    const ls = lines(doc);
    expect(ls.map((l) => l.text)).toEqual(['中國的', 'GDP']);
  });

  it('changes nothing in horizontal text', () => {
    const horizontal = (md: string) => buildDocument({ markdown: md }, config('zh-Hant', { layout: { writingMode: 'horizontal-tb', layoutType: 'single' } }));
    const a = horizontal('第:tcy[12]回，:upright[GDP]與:sideways[34]。');
    const b = horizontal('第12回，GDP與34。');
    const strip = (d: VDTDocument) => lines(d).map((l) => ({ text: l.text, w: l.bbox.width, segs: l.segments?.map((s) => [s.text, s.width, s.tcy, s.orientation]) }));
    expect(strip(a)).toEqual(strip(b));
  });

  it('maps a click on the cell to its digits', () => {
    const md = '第:tcy[12]回';
    const doc = buildDocument({ markdown: md }, config('zh-Hant'));
    const block = doc.pages[0]!.columns[0]!.blocks[0]!;
    // The plain text's second and third characters, 1 and 2, map to the
    // digits in the source, past the mark's opener.
    expect(block.sourceMap?.[1]).toBe(md.indexOf('12'));
    expect(block.sourceMap?.[2]).toBe(md.indexOf('12') + 1);
    expect(block.sourceMap?.[3]).toBe(md.indexOf('回'));
  });

  it('maps a mark written in inline code as the text it prints', () => {
    const md = 'Write `:tcy[12]` for one cell.';
    const doc = buildDocument({ markdown: md }, config('zh-Hant'));
    const block = doc.pages[0]!.columns[0]!.blocks[0]!;
    const plain = block.lines.map((l) => l.text).join(' ');
    expect(plain).toContain(':tcy[12]');
    // Every character of the code maps to itself in the source.
    const at = plain.indexOf(':tcy[12]');
    for (let i = 0; i < ':tcy[12]'.length; i++) expect(block.sourceMap?.[at + i]).toBe(md.indexOf(':tcy[12]') + i);
    expect(block.sourceMap?.[plain.indexOf('for')]).toBe(md.indexOf('for'));
  });
});

describe('orientation marks leave references, notes and objects as they are (#190 review)', () => {
  const flagsOf = (doc: VDTDocument) => segments(doc).map((s) => ({
    kind: s.kind,
    text: s.text,
    width: Math.round(s.width * 1000) / 1000,
    tcy: s.tcy,
    orientation: s.orientation,
    footnoteId: s.footnoteId,
    refResourceId: s.refResourceId,
    chip: s.chip !== undefined,
    math: s.mathRender !== undefined,
  }));

  it('keeps a formula inside :tcy, :upright and :sideways a formula', () => {
    for (const [marked, plain] of [
      ['正:tcy[$x^2$]文', '正$x^2$文'],
      ['正文:sideways[$x$]', '正文$x$'],
    ] as const) {
      expect(flagsOf(buildDocument({ markdown: marked }, config('zh-Hant'))), marked).toEqual(flagsOf(buildDocument({ markdown: plain }, config('zh-Hant'))));
    }
    // The letters around the formula keep their mark.
    const doc = buildDocument({ markdown: '正:upright[A$x$B]文' }, config('zh-Hant'));
    const segs = segments(doc);
    expect(segs.filter((s) => s.orientation === 'upright').map((s) => s.text)).toEqual(['A', 'B']);
    expect(segs.some((s) => s.text.includes('\uFFFC') && (s.tcy || s.orientation))).toBe(false);
  });

  it('keeps a note marker inside :sideways a note marker', () => {
    const marked = flagsOf(buildDocument({ markdown: '正文:sideways[iPhone[^a]]。\n\n[^a]: 注。' }, config('zh-Hant')));
    const plain = flagsOf(buildDocument({ markdown: '正文iPhone[^a]。\n\n[^a]: 注。' }, config('zh-Hant')));
    const note = marked.find((s) => s.footnoteId === 'a');
    expect(note).toBeDefined();
    expect(note!.orientation).toBeUndefined();
    expect(note).toEqual(plain.find((s) => s.footnoteId === 'a'));
    expect(marked.find((s) => s.text === 'iPhone')?.orientation).toBe('sideways');
  });

  it('keeps a reference inside :tcy a reference', () => {
    const table: Resource = {
      id: 't1', typeId: 'table', kind: 'table', caption: '人物', createdAt: 0, updatedAt: 0,
      table: { model: { rows: [[{ content: '名' }], [{ content: '字' }]] } },
    };
    const doc = buildDocument({ markdown: '見表:tcy[:ref{id="t1"}]。', resources: [table] }, config('zh-Hant'));
    const ref = segments(doc).find((s) => s.refResourceId === 't1');
    expect(ref).toBeDefined();
    expect(ref!.tcy).toBeUndefined();
  });

  it('measures a flagged note marker as a note marker, whatever the parser left on it', () => {
    const F = '10px "Test Serif"';
    const token = withMeasureWritingMode('vertical-rl', () => atomicSpanToken(
      { text: '1', bold: false, italic: false, footnote: { id: 'a' }, orientation: 'sideways', combineUpright: true },
      F, F, F, F, 0,
    ));
    expect(token?.footnoteId).toBe('a');
    expect(token?.tcy).toBeUndefined();
    expect(token?.orientation).toBeUndefined();
  });

  it('keeps a chip inside :tcy a chip', () => {
    const doc = buildDocument({ markdown: '正:tcy[:chip[新]]文' }, config('zh-Hant'));
    const chip = segments(doc).find((s) => s.chip !== undefined);
    expect(chip).toBeDefined();
    expect(chip!.tcy).toBeUndefined();
    expect(segments(doc).some((s) => s.tcy)).toBe(false);
  });
});

/** A canvas that records each `fillText` with the matrix it lands under. */
interface Call { op: string; text?: string; m: number[] }
function record(): { canvas: HTMLCanvasElement; calls: Call[] } {
  const calls: Call[] = [];
  type M = [number, number, number, number, number, number];
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const state: Record<string, unknown> = { font: '10px Test', letterSpacing: '0px', textBaseline: 'alphabetic', textAlign: 'start' };
  const size = () => Number(/(\d*\.?\d+)px/.exec(String(state.font))?.[1] ?? 10);
  const api: Record<string, unknown> = {
    save: () => stack.push(m),
    restore: () => { m = stack.pop() ?? m; },
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => { m = mul(m, [a, b, c, d, e, f]); },
    translate: (x: number, y: number) => { m = mul(m, [1, 0, 0, 1, x, y]); },
    scale: (x: number, y: number) => { m = mul(m, [x, 0, 0, y, 0, 0]); },
    rotate: (t: number) => { m = mul(m, [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]); },
    fillText: (text: string, x: number, y: number) => calls.push({ op: 'fillText', text, m: [...mul(m, [1, 0, 0, 1, x, y])].map((v) => Math.round(v * 1000) / 1000) }),
    measureText: (s: string) => {
      let w = 0;
      for (const ch of s) w += stubCharWidth(ch, size());
      return { width: w };
    },
  };
  const ctx = new Proxy(state, {
    get: (t, k) => (typeof k === 'string' && k in api ? api[k] : k in t ? t[k as string] : () => undefined),
    set: (t, k, v) => { t[k as string] = v; return true; },
  });
  return { canvas: { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement, calls };
}

describe('the canvas paints what was measured (#190)', () => {
  it('paints 28 upright in one cell and a wide :tcy squeezed to the em', () => {
    const doc = buildDocument({ markdown: '第28回:tcy[12345]' }, config('zh-Hant'));
    const { canvas, calls } = record();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    const n = calls.find((c) => c.text === '28')!;
    // Upright: the text's x axis runs along the sheet's x.
    expect(n.m[0]).toBeCloseTo(1, 6);
    expect(n.m[1]).toBeCloseTo(0, 6);
    const wide = calls.find((c) => c.text === '12345')!;
    // Squeezed: five half ems into one em.
    expect(wide.m[0]).toBeCloseTo(EM / (5 * EM / 2), 6);
    expect(wide.m[1]).toBeCloseTo(0, 6);
  });
});

// A number inside a Latin sentence set sideways follows the sentence: the
// sentence turns, and a number standing upright in it reads wrong (#222).
// The rule reads a number's nearest neighbours past any spaces: Latin on
// both sides (a letter, or a punctuation mark of a sideways run) and it
// runs sideways; a Chinese character, an upright sign or the end of the
// text on either side and it stands.
describe('tate-chu-yoko: a number in a Latin sentence runs sideways (#222)', () => {
  const cells = (s: string, digits = 2, region: CjkRegion = 'taiwan') => verticalRuns(graphemesOf(s), region, digits).filter((r) => r.glyph.orient === 'tcy').map((r) => r.text);

  it('reads the nearest neighbours past the spaces', () => {
    expect(cells('printed in 49 and 32 copies')).toEqual([]);
    expect(cells('chapters 49, 32 and (7) of the 12th')).toEqual([]);
    expect(cells('Han Feizi, chapters 49 and 32, Chinese Wikisource')).toEqual([]);
    // Chinese text with a date, spaced or not.
    expect(cells('今天是2026年9月28日。')).toEqual(['9', '28']);
    expect(cells('第 3 回　第 12 回')).toEqual(['3', '12']);
    // Between a Chinese character and a Latin word the number stands.
    expect(cells('第3 copies')).toEqual(['3']);
    expect(cells('用iPhone 15拍攝')).toEqual(['15']);
    expect(cells('printed in 12。')).toEqual(['12']);
    // An upright sign is no Latin neighbour; nor is the end of the text.
    expect(cells('a 30×40 print')).toEqual(['30', '40']);
    expect(cells('49 copies')).toEqual(['49']);
    expect(cells('Part 12')).toEqual(['12']);
  });

  // An ASCII mark is Latin to a number only when a word lies past it: in
  // Chinese text the colons of a time, the hyphens of a range or a date and
  // the brackets or quotes around a number lead to a Chinese character or
  // to the end of the text, and every number stands (#222 review).
  it('stands a number whose marks lead to Chinese text, not to a word', () => {
    for (const region of ['mainland', 'taiwan'] as const) {
      const at = (s: string, digits = 2) => cells(s, digits, region);
      expect(at('上午12:30:45开会'), region).toEqual(['12', '30', '45']);
      expect(at('比分为3:2:1'), region).toEqual(['3', '2', '1']);
      expect(at('第3-5-7章'), region).toEqual(['3', '5', '7']);
      expect(at('于2026-09-30发布', 4), region).toEqual(['2026', '09', '30']);
      expect(at('于2026/9/28发布', 4), region).toEqual(['2026', '9', '28']);
      expect(at('见图(3)所示'), region).toEqual(['3']);
      expect(at('他住在"12"号楼'), region).toEqual(['12']);
      expect(at("第'3'条"), region).toEqual(['3']);
      expect(at('他说“12”次'), region).toEqual(['12']);
    }
    // The same marks between the words of a Latin sentence.
    expect(cells('met at 12:30 pm, chapters (7) and "12" of it')).toEqual([]);
  });

  it('reads a range, curly quotes and a run of numbers inside a Latin sentence', () => {
    // The en and em dashes are turned in cells of their own, and the curly
    // quotes too, but a word lies past them.
    expect(cells('The years 1998–2001 and pages 3–5 of vol. 2', 4)).toEqual(['2']);
    expect(cells('chapter 3—the last—and the “49” copies')).toEqual([]);
    expect(cells('pages 3 4 5 of it')).toEqual([]);
    // In Chinese text they lead to Chinese characters.
    expect(cells('第3–5章，1998—2001年', 4)).toEqual(['3', '5', '1998', '2001']);
  });

  const cfg = (digits: 2 | 3 = 3, locale = 'zh-Hant') => config(locale, { cjk: { uprightDigits: digits, latinSpacing: { value: 0, unit: 'em' } } });
  /** Each number of the text lines: its text, forced orientation, width. */
  const numbers = (doc: VDTDocument) => segments(doc).filter((s) => /[0-9]/.test(s.text)).map((s) => [s.text, s.tcy ? 'tcy' : s.orientation ?? '', Math.round(s.width * 100) / 100]);
  /** What the painters advance through a segment: the runs they cut it into
   *  (the forced orientation first), as the canvas paints them. */
  const painted = (seg: VDTLineSegment, digits: number): number => {
    const orient = segmentOrientation(seg);
    const runs = orient ? forcedVerticalRuns(graphemesOf(seg.text), orient) : verticalRuns(graphemesOf(seg.text), 'taiwan', digits);
    return runs.reduce((w, r) => w + (r.cell === undefined ? [...r.text].reduce((a, ch) => a + stubCharWidth(ch, EM), 0) : r.cell * EM), 0);
  };

  it('measures and paints the numbers of a Latin paragraph of a vertical book sideways', () => {
    const doc = buildDocument({ markdown: 'This book was printed in 490 and 320 copies, of which 12 are bound in silk.' }, cfg());
    // Three digits at half an em each (the stub): sideways, a half em more
    // than a cell.
    expect(numbers(doc)).toEqual([['490', 'sideways', 15], ['320', 'sideways', 15], ['12', 'sideways', 10]]);
    for (const seg of segments(doc)) if (seg.kind === 'text') expect(painted(seg, 3), seg.text).toBeCloseTo(seg.width, 6);
  });

  it('keeps a number that meets a Chinese character upright, beside a quoted English sentence', () => {
    const doc = buildDocument({ markdown: '書中寫道 printed in 490 and 320 copies 等語，第120回於2026年9月28日，用iPhone 15拍攝。' }, cfg());
    expect(numbers(doc)).toEqual([
      ['490', 'sideways', 15], ['320', 'sideways', 15],
      ['120', '', 10], ['2026', '', 20], ['9', '', 10], ['28', '', 10], ['15', '', 10],
    ]);
    for (const seg of segments(doc)) if (seg.kind === 'text') expect(painted(seg, 3), seg.text).toBeCloseTo(seg.width, 6);
  });

  it('reads the words past a note marker', () => {
    const doc = buildDocument({ markdown: 'This book was printed in 49[^1] copies and 32 more.\n\n[^1]: Of which 12 are lost.' }, cfg(2));
    const body = segments(doc).filter((s) => /[0-9]/.test(s.text) && s.footnoteId === undefined);
    expect(body.map((s) => [s.text, s.orientation])).toEqual([['49', 'sideways'], ['32', 'sideways']]);
    for (const seg of segments(doc)) if (seg.kind === 'text' && seg.footnoteId === undefined) expect(painted(seg, 2), seg.text).toBeCloseTo(seg.width, 6);
  });

  it('turns a number in brackets or quotes with its sentence, and keeps it whole in any column', () => {
    const text = 'He said (49) and "12", then 7; ok.';
    for (const height of [25, 30, 40, 60, 80, 200]) {
      const column = config('zh-Hant', { cjk: { uprightDigits: 2, latinSpacing: { value: 0, unit: 'em' } }, page: { width: pt(600), height: pt(height + 60), dpi: 72, margins: { top: pt(30), right: pt(30), bottom: pt(30), left: pt(30) } } });
      const doc = buildDocument({ markdown: text }, column);
      expect(numbers(doc).map(([t, o]) => [t, o]), String(height)).toEqual([['49', 'sideways'], ['12', 'sideways'], ['7', 'sideways']]);
      for (const seg of segments(doc)) if (seg.kind === 'text') expect(painted(seg, 2), `${height}: ${seg.text}`).toBeCloseTo(seg.width, 6);
      // No line opens on a closing bracket or a comma, or ends on an
      // opening bracket.
      for (const line of lines(doc)) {
        expect(line.text.trimStart(), String(height)).not.toMatch(/^[),;]/);
        expect(line.text.trimEnd(), String(height)).not.toMatch(/\($/);
      }
    }
  });

  // A piece of a line cut out of such a text once read the marks as Latin
  // and was painted wider than measured (`2:1` of `3:2:1`).
  it('measures and paints a score, a time and a date in Chinese text alike in any column', () => {
    const text = '比分为3:2:1，上午12:30:45开会，见图(3)，于2026/9/28发布。';
    for (const height of [25, 30, 35, 40, 60, 100]) {
      const column = config('zh-Hant', { cjk: { uprightDigits: 2, latinSpacing: { value: 0, unit: 'em' } }, page: { width: pt(600), height: pt(height + 60), dpi: 72, margins: { top: pt(30), right: pt(30), bottom: pt(30), left: pt(30) } } });
      const doc = buildDocument({ markdown: text }, column);
      expect(segments(doc).filter((s) => s.orientation === 'sideways'), String(height)).toEqual([]);
      for (const seg of segments(doc)) if (seg.kind === 'text') expect(painted(seg, 2), `${height}: ${seg.text}`).toBeCloseTo(seg.width, 6);
      const tcy = segments(doc).flatMap((s) => verticalRuns(graphemesOf(s.text), 'taiwan', 2)).filter((r) => r.glyph.orient === 'tcy').map((r) => r.text);
      expect(tcy, String(height)).toEqual(['3', '2', '1', '12', '30', '45', '3', '9', '28']);
    }
  });

  it('reads the words past a line break, a style change and a link', () => {
    // A column of eight ems: the lines break around the numbers.
    const narrow = config('zh-Hant', { cjk: { uprightDigits: 2, latinSpacing: { value: 0, unit: 'em' } }, page: { width: pt(300), height: pt(8 * EM + 60), dpi: 72, margins: { top: pt(30), right: pt(30), bottom: pt(30), left: pt(30) } } });
    const doc = buildDocument({ markdown: 'printed in **49** and [32](https://example.com) copies, of which 12 are bound.' }, narrow);
    expect(lines(doc).length).toBeGreaterThan(3);
    expect(numbers(doc).map(([t, o]) => [t, o])).toEqual([['49', 'sideways'], ['32', 'sideways'], ['12', 'sideways']]);
    for (const seg of segments(doc)) if (seg.kind === 'text') expect(painted(seg, 2), seg.text).toBeCloseTo(seg.width, 6);
    const link = segments(doc).find((s) => s.text === '32')!;
    expect(link.href).toBe('https://example.com');
  });

  // Nº 080's colophon turned its chapter numbers by hand; the rule now
  // gives the same page without the marks, however the lines break.
  it('sets a colophon without :sideways as the marks set it', () => {
    const marked = 'Set in Iansui, LXGW WenKai TC, Noto Serif TC and Noto Sans TC (SIL OFL). Text: Han Feizi, chapters :sideways[49] and :sideways[32], Chinese Wikisource, revisions 2642850 and 2327662 (CC BY-SA 4.0).';
    const plain = marked.replace(/:sideways\[(\d+)\]/g, '$1');
    const strip = (d: VDTDocument) => lines(d).map((l) => ({ text: l.text, width: l.bbox.width, segs: l.segments?.map((s) => [s.text, s.width, s.orientation]) }));
    for (const height of [80, 120, 200, 400]) {
      const column = config('zh-Hant', { bodyText: { fontFamily: 'Test Serif', fontSize: pt(EM), lineHeight: pt(16), textAlign: 'justify', firstLineIndent: pt(0) }, page: { width: pt(300), height: pt(height + 60), dpi: 72, margins: { top: pt(30), right: pt(30), bottom: pt(30), left: pt(30) } } });
      const a = buildDocument({ markdown: marked }, column);
      const b = buildDocument({ markdown: plain }, column);
      expect(strip(b), String(height)).toEqual(strip(a));
      expect(renderToHtml(b), String(height)).toBe(renderToHtml(a));
    }
  });

  it('turns the number with the sentence on the canvas and in the HTML', () => {
    const doc = buildDocument({ markdown: '書中寫道 printed in 49 copies 等語，第28回。' }, cfg(2));
    const { canvas, calls } = record();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    const sideways = calls.find((c) => c.text === '49')!;
    // Sideways: the text's x axis runs down the sheet (the flow's frame).
    expect(sideways.m[0]).toBeCloseTo(0, 6);
    expect(sideways.m[1]).toBeCloseTo(1, 6);
    const upright = calls.find((c) => c.text === '28')!;
    expect(upright.m[0]).toBeCloseTo(1, 6);
    const html = renderToHtml(doc);
    expect(html).toContain('text-orientation:sideways;">49<');
    expect(html).toContain('text-combine-upright:all;">28<');
  });
});
