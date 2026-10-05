import { describe, it, expect } from 'vitest';
import { buildDocument, columnClipRect, renderPageToCanvas } from '../../index';
import { measureRichBlock } from '../../measure/rich';
import { withMeasureWritingMode } from '../../measure/vertical';
import { cjkClassOf } from '../../measure/cjkClasses';
import { punctuationSide, type CjkComposition } from '../../measure/cjkPunctuation';
import { graphemesOf } from '../../measure/graphemes';
import { verticalRuns } from '../../writingMode';
import type { InlineSpan } from '../../parse';
import type { CjkRegion, Dimension, PostextConfig, WritingMode } from '../../types';
import type { VDTDocument, VDTLine, VDTLineSegment } from '../../vdt';
import { installSizedStub, stubCharWidth } from './stub';

// The punctuation model of #185–#187 fed through the cells of the vertical
// writing mode (#188): compression, line-edge trims, hanging and the
// Han–Latin space work along the line in either writing mode, and what the
// canvas paints agrees with what the composer measured for every
// character — Han, punctuation pairs, Latin, digits, upright signs — in
// both writing modes and all four regions.

installSizedStub();

const EM = 16;
const FONT = `${EM}px "Test Serif"`;
const stubWidth = (text: string, em: number): number => {
  let w = 0;
  for (const ch of text) w += stubCharWidth(ch, em);
  return w;
};
const REGIONS: CjkRegion[] = ['mainland', 'taiwan', 'hongkong', 'japan'];
const MODES: WritingMode[] = ['horizontal-tb', 'vertical-rl'];
const EPS = 1e-6;

/** Where a mark's glyph sits in its full box along the line, as the
 *  composer assumes it (`punctuationSide`): the half after its blank. */
function inkInterval(g: string, region: CjkRegion, vertical: boolean, start: number, full: number): [number, number] {
  const side = punctuationSide(g, cjkClassOf(g), region, vertical);
  const blank = Math.max(0, full - EM / 2);
  if (side === 'start') return [start + blank, start + full];
  if (side === 'end') return [start, start + full - blank];
  if (side === 'both') return [start + blank / 2, start + full - blank / 2];
  return [start, start + full];
}

/** The marks Latin text shares with Chinese, which horizontal Chinese text
 *  sets in a Chinese box when their glyphs are not an em wide. */
const SHARED_MARKS = new Set([...'“”‘’…⋯—―·‧']);
/** Where such a glyph starts in its one-em box. */
function sharedPlace(g: string, adv: number): number {
  const cls = cjkClassOf(g);
  return cls === 'opening' ? EM - adv : cls === 'closing' ? 0 : (EM - adv) / 2;
}

/**
 * What the painter walks through a segment — its full boxes, before any
 * blank the composition cut: in vertical text the runs of `verticalRuns`
 * (the painter's own classifier), sideways runs at their horizontal width
 * and cells at their length; horizontally the glyphs' advances. Tracking
 * after every grapheme, but inside a sideways run of a composed vertical
 * line, which carries none.
 */
function walk(seg: VDTLineSegment, region: CjkRegion, vertical: boolean): number {
  const t = seg.tracking ?? 0;
  if (!vertical) return stubWidth(seg.text, EM) + t * graphemesOf(seg.text).length;
  let w = 0;
  for (const run of verticalRuns(graphemesOf(seg.text), region)) {
    w += run.cell === undefined ? stubWidth(run.text, EM) + t * graphemesOf(run.text).length : run.cell * EM + t;
  }
  return w;
}

/**
 * The agreement of one measured line with the painter: each segment's
 * width is what the painter walks through it, less the blank its mark gave
 * up — which only a single full-width mark gives, on its own side (before
 * an opening bracket, after a closing one or a mainland pause or stop mark,
 * a quarter each side for a centred mark), never below half an em — and
 * the segments add up to the line's width. So the painted advances add up
 * to the measured line, and every glyph's ink stays inside its box.
 */
function checkLine(line: VDTLine, region: CjkRegion, vertical: boolean, justify: boolean, where: string): void {
  const segs = line.segments ?? [];
  let sum = 0;
  let painted = 0;
  for (const s of segs) if (!s.hangs) sum += s.width;
  expect(Math.abs(sum - line.bbox.width), `${where}: segments add up to the line`).toBeLessThan(EPS);
  const hung = segs.filter((s) => s.hangs);
  expect(hung.length, where).toBeLessThanOrEqual(1);
  if (hung.length === 1) expect(segs[segs.length - 1]!.hangs, where).toBe(true);
  let x = 0;
  for (const s of segs) {
    const at = `${where} ${JSON.stringify(s.text)}`;
    if (s.kind !== 'text') {
      if (!s.hangs) painted += s.width;
      x += s.width;
      continue;
    }
    const full = walk(s, region, vertical);
    if (s.inkOffset === undefined) {
      // Nothing cut: the painter walks exactly the width (a justified
      // Latin run in vertical text carries the gap after it as advance).
      if (justify && vertical && s.tracking === undefined) expect(full, at).toBeLessThanOrEqual(s.width + EPS);
      else expect(Math.abs(full - s.width), `${at}: painted ${full}, measured ${s.width}`).toBeLessThan(EPS);
    } else {
      const gs = graphemesOf(s.text);
      expect(gs.length, `${at}: a mark that gave up blank is a segment of its own`).toBe(1);
      const g = gs[0]!;
      const t = s.tracking ?? 0;
      // A mark Latin shares with Chinese whose glyph is not an em wide
      // (· here) is set in a one-em Chinese box in horizontal text (#185),
      // its glyph where a Chinese font puts it.
      const adv = stubWidth(g, EM);
      const shared = !vertical && SHARED_MARKS.has(g) && Math.abs(adv - EM) > EPS;
      if (shared) {
        expect(s.inkOffset, `${at}: glyph inside its box`).toBeGreaterThanOrEqual(-EPS);
        expect(s.inkOffset + adv, `${at}: glyph inside its box`).toBeLessThanOrEqual(s.width + EPS);
      }
      const box = shared ? EM : full - t;
      const side = punctuationSide(g, cjkClassOf(g), region, vertical);
      if (shared && side === 'none') {
        if (!s.hangs) painted += s.width;
        x += s.width;
        continue;
      }
      expect(side, `${at}: only an adjustable mark gives up blank`).not.toBe('none');
      const place = shared ? sharedPlace(g, adv) : 0;
      const cutStart = place - s.inkOffset;
      const cutEnd = box + t - s.width - cutStart;
      expect(cutStart, at).toBeGreaterThanOrEqual(-EPS);
      expect(cutEnd, at).toBeGreaterThanOrEqual(-EPS);
      expect(cutStart + cutEnd, `${at}: never below half an em`).toBeLessThanOrEqual(box - EM / 2 + EPS);
      if (side === 'start') expect(cutEnd, at).toBeLessThan(EPS);
      if (side === 'end') expect(cutStart, at).toBeLessThan(EPS);
      if (side === 'both') {
        expect(cutStart, at).toBeLessThanOrEqual((box - EM / 2) / 2 + EPS);
        expect(cutEnd, at).toBeLessThanOrEqual((box - EM / 2) / 2 + EPS);
      }
      // The glyph's ink, painted from `x + inkOffset` across its full box,
      // stays inside the segment.
      const [a, b] = shared ? [x + s.inkOffset, x + s.inkOffset + adv] : inkInterval(g, region, vertical, x + s.inkOffset, box);
      expect(a, at).toBeGreaterThanOrEqual(x - EPS);
      expect(b, at).toBeLessThanOrEqual(x + s.width + EPS);
    }
    if (!s.hangs) painted += s.width;
    x += s.width;
  }
  expect(Math.abs(painted - line.bbox.width), where).toBeLessThan(EPS);
}

// --- the property over random text ----------------------------------------------------------------

const POOL = [
  ...'此開卷第一回也作者自云因曾歷過番夢幻之後故將真事隱去而借通靈說撰石頭記书红楼梦',
  ...'，。、；：！？「」『』《》（）〈〉【】“”‘’·・‧～／',
  '——', '……', '」「', '。」', '，「', '》（', '）《', '·「', '」·',
  'iPhone', 'don’t', '15', '1999', '¥5,999', '50%', '3×4', '©2026', '25℃', '±5', '§3', 'l·l',
  ' ', ' ', '　',
];
let seed = 20260928;
const rnd = (n: number): number => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % n;
};
const WIDTHS = ['fullwidth', 'kaiming', 'lineEndHalf', 'halfwidth'] as const;
const HANGING = ['none', 'allow', 'force'] as const;
const SPACES: CjkComposition['latinSpacing'][] = [{ em: 0 }, { em: 0.25 }, { px: 3 }];

describe('punctuation widths along either axis: painted = measured (property)', () => {
  for (const mode of MODES) {
    for (const region of REGIONS) {
      it(`${mode}, ${region}: every segment paints its measured width, marks cut on their own side only`, () => {
        const vertical = mode === 'vertical-rl';
        for (let iter = 0; iter < 250; iter++) {
          let text = '';
          const len = 4 + rnd(70);
          for (let i = 0; i < len; i++) text += POOL[rnd(POOL.length)];
          const composition: CjkComposition = {
            region,
            punctuationWidth: WIDTHS[rnd(4)]!,
            compressAdjacent: rnd(2) === 0,
            trimLineStart: rnd(2) === 0,
            hangingPunctuation: HANGING[rnd(3)]!,
            latinSpacing: SPACES[rnd(3)]!,
          };
          const justify = rnd(2) === 0;
          const width = 5 * EM + rnd(20 * EM);
          const cut = rnd(text.length);
          const spans: InlineSpan[] = [{ text: text.slice(0, cut), bold: false, italic: false }, { text: text.slice(cut), bold: false, italic: false }];
          const block = withMeasureWritingMode(mode, () => measureRichBlock(spans, FONT, `bold ${FONT}`, `italic ${FONT}`, `bold italic ${FONT}`, width, 24, {
            textAlign: justify ? 'justify' : 'left',
            cjkLineBreak: 'gb',
            cjkComposition: composition,
          }), region);
          block.lines.forEach((line, li) => checkLine(line, region, vertical, justify, `#${iter} ${JSON.stringify(text)} ${JSON.stringify(composition)} line ${li}`));
        }
      });
    }
  }
});

// --- vertical punctuation widths, one by one ---------------------------------------------------------

describe('vertical text takes the punctuation widths of its region', () => {
  const vlines = (text: string, region: CjkRegion, composition: Partial<CjkComposition>, width = 40 * EM, textAlign: 'left' | 'justify' = 'left') =>
    withMeasureWritingMode('vertical-rl', () => measureRichBlock([{ text, bold: false, italic: false }], FONT, FONT, FONT, FONT, width, 24, {
      textAlign,
      cjkLineBreak: 'gb',
      cjkComposition: {
        region,
        punctuationWidth: 'fullwidth',
        compressAdjacent: false,
        trimLineStart: false,
        hangingPunctuation: 'none',
        latinSpacing: { em: 0 },
        ...composition,
      },
    }), region).lines;
  /** The `nth` occurrence of `text` as the composer set it: its own
   *  segment when it gave up blank, else its share of the segment it sits
   *  in (characters share a segment only when they advance alike). */
  const segOf = (lines: VDTLine[], text: string, nth = 0): { width: number; inkOffset?: number } => {
    let n = 0;
    for (const seg of lines.flatMap((l) => l.segments ?? [])) {
      const gs = graphemesOf(seg.text);
      for (const g of gs) {
        if (g !== text) continue;
        if (n++ < nth) continue;
        return gs.length === 1 ? seg : { width: seg.width / gs.length, ...(seg.inkOffset !== undefined ? { inkOffset: seg.inkOffset } : {}) };
      }
    }
    throw new Error(`${text} #${nth} not found`);
  };

  it('sets mainland Kaiming marks in half a cell down the line, ：；？！ in a whole one', () => {
    const lines = vlines('他说：“你来了吗？”她答，好。甲；乙！', 'mainland', { punctuationWidth: 'kaiming', compressAdjacent: true });
    expect(segOf(lines, '：').width).toBeCloseTo(EM);
    expect(segOf(lines, '？').width).toBeCloseTo(EM);
    expect(segOf(lines, '；').width).toBeCloseTo(EM);
    expect(segOf(lines, '！').width).toBeCloseTo(EM);
    // ，、 and the quotes half a cell; 。 one em inside the line.
    expect(segOf(lines, '，').width).toBeCloseTo(EM / 2);
    expect(segOf(lines, '“').width).toBeCloseTo(EM / 2);
    expect(segOf(lines, '”').width).toBeCloseTo(EM / 2);
    expect(segOf(lines, '。').width).toBeCloseTo(EM);
    // The opening quote gave up the blank above its glyph: painted half a
    // cell up the line.
    expect(segOf(lines, '“').inkOffset).toBeCloseTo(-EM / 2);
    expect(segOf(lines, '，').inkOffset).toBe(0);
    // Horizontally ：； are pause marks: half an em under Kaiming.
    const h = measureRichBlock([{ text: '他说：好；', bold: false, italic: false }], FONT, FONT, FONT, FONT, 40 * EM, 24, {
      cjkComposition: { region: 'mainland', punctuationWidth: 'kaiming', compressAdjacent: true, trimLineStart: false, hangingPunctuation: 'none', latinSpacing: { em: 0 } },
    }).lines;
    expect(segOf(h, '：').width).toBeCloseTo(EM / 2);
    expect(segOf(h, '；').width).toBeCloseTo(EM / 2);
  });

  it('compresses adjacent marks down the line: 。」「 and 》（ take 1.5 and 1 em', () => {
    const lines = vlines('他说「好。」「是」《红楼梦》（曹雪芹著）', 'taiwan', { compressAdjacent: true });
    const w = (t: string, nth = 0) => segOf(lines, t, nth).width;
    // Taiwan centres 。: a quarter em each side. 。」 give up the closing
    // bracket's half-em blank before the full stop's: 1.5 em together.
    expect(w('。') + w('」')).toBeCloseTo(1.5 * EM);
    // 」「: the blank between them goes, 1.5 em.
    expect(w('」') + w('「', 1)).toBeCloseTo(1.5 * EM);
    // Without compression, two whole cells each.
    const plain = vlines('他说「好。」「是」', 'taiwan', {});
    expect(segOf(plain, '。').width + segOf(plain, '」').width).toBeCloseTo(2 * EM);
  });

  it('trims an opening bracket at the head of a vertical line and a closing one at its foot', () => {
    // 6 cells to a line: 「通靈」之說 then 「石頭記」.
    const lines = vlines('「通靈」之說「石頭記」', 'taiwan', { trimLineStart: true }, 6 * EM);
    expect(lines[0]!.text.startsWith('「')).toBe(true);
    const open = lines[0]!.segments![0]!;
    expect(open.width).toBeCloseTo(EM / 2);
    expect(open.inkOffset).toBeCloseTo(-EM / 2);
    const last = lines[lines.length - 1]!;
    const close = last.segments![last.segments!.length - 1]!;
    expect(close.text).toBe('」');
    expect(close.width).toBeCloseTo(EM / 2);
  });

  it('puts the Han–Latin space down the line, a quarter em each side of a sideways word', () => {
    const lines = vlines('用iPhone拍照', 'mainland', { latinSpacing: { em: 0.25 } });
    const segs = lines[0]!.segments!;
    expect(segs.map((s) => [s.kind, s.autospace ?? false])).toEqual([
      ['text', false], ['space', true], ['text', false], ['space', true], ['text', false],
    ]);
    expect(segs[1]!.width).toBeCloseTo(EM / 4);
    expect(segs[3]!.width).toBeCloseTo(EM / 4);
  });

  it('keeps the mainland interpunct half a cell under every width; the Taiwan one is a centred mark', () => {
    for (const punctuationWidth of WIDTHS) {
      const hans = vlines('約翰·史密斯', 'mainland', { punctuationWidth, compressAdjacent: true });
      const dot = segOf(hans, '·');
      expect(dot.width, punctuationWidth).toBeCloseTo(EM / 2);
      expect(dot.inkOffset, punctuationWidth).toBeUndefined();
    }
    // Taiwan: one em full width, half (a quarter each side) under Kaiming.
    expect(segOf(vlines('約翰·史密斯', 'taiwan', {}), '·').width).toBeCloseTo(EM);
    const kaiming = segOf(vlines('約翰·史密斯', 'taiwan', { punctuationWidth: 'kaiming' }), '·');
    expect(kaiming.width).toBeCloseTo(EM / 2);
    expect(kaiming.inkOffset).toBeCloseTo(-EM / 4);
    // And a quarter em goes between it and a bracket (compressAdjacent).
    const pair = vlines('「約翰」·「史密斯」', 'taiwan', { compressAdjacent: true });
    expect(segOf(pair, '」').width + segOf(pair, '·').width).toBeCloseTo(1.75 * EM);
  });

  it('sets a full-width mainland interpunct in half an em horizontally too, centred, as its vertical half cell', () => {
    for (const punctuationWidth of WIDTHS) {
      const composition: CjkComposition = { region: 'mainland', punctuationWidth, compressAdjacent: true, trimLineStart: true, hangingPunctuation: 'none', latinSpacing: { em: 0 } };
      const h = measureRichBlock([{ text: '約翰・史密斯', bold: false, italic: false }], FONT, FONT, FONT, FONT, 40 * EM, 24, { cjkComposition: composition }).lines;
      const dot = segOf(h, '・');
      expect(dot.width, punctuationWidth).toBeCloseTo(EM / 2);
      // The full-width glyph, centred: a quarter em before its box.
      expect(dot.inkOffset, punctuationWidth).toBeCloseTo(-EM / 4);
      expect(segOf(vlines('約翰・史密斯', 'mainland', { punctuationWidth }), '・').width, punctuationWidth).toBeCloseTo(EM / 2);
    }
  });

  it('hangs a mainland full stop past the foot of a vertical line under force', () => {
    // 5 cells to a line: 此開卷第一 回也。 — the 。 that would open the
    // second line hangs past the first.
    const lines = vlines('此開卷第一。回也', 'mainland', { punctuationWidth: 'kaiming', hangingPunctuation: 'force' }, 5 * EM);
    const first = lines[0]!;
    const last = first.segments![first.segments!.length - 1]!;
    expect(last.text).toBe('。');
    expect(last.hangs).toBe(true);
    expect(first.bbox.width).toBeCloseTo(5 * EM);
  });
});

// --- the canvas painter ------------------------------------------------------------------------------

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

/** One character as the canvas put it, along the line (the flow's x):
 *  a cell's centre, or the origin of a glyph of a sideways or horizontal
 *  run. */
interface PaintedChar {
  ch: string;
  at: number;
  cell: boolean;
}

/** A 2D context that follows the transform and turns every `fillText` into
 *  the characters it painted, positioned along the line in the flow frame
 *  of a vertical page (the page's frame is `transform(0, 1, -1, 0, W, 0)`:
 *  flow x is the sheet's y). */
function recordingCanvas(pageWidth: number, vertical: boolean): { canvas: HTMLCanvasElement; chars: PaintedChar[] } {
  const chars: PaintedChar[] = [];
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const state: Record<string, unknown> = { font: FONT, letterSpacing: '0px', textBaseline: 'alphabetic', textAlign: 'start' };
  const saved: Record<string, unknown>[] = [];
  const size = () => Number(/(\d*\.?\d+)px/.exec(String(state.font))?.[1] ?? EM);
  // Sheet → flow x.
  const flowX = (sx: number, sy: number): number => (vertical ? sy : sx);
  const api: Record<string, unknown> = {
    save: () => { stack.push(m); saved.push({ ...state }); },
    restore: () => { m = stack.pop() ?? m; Object.assign(state, saved.pop() ?? {}); },
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => { m = mul(m, [a, b, c, d, e, f]); },
    translate: (x: number, y: number) => { m = mul(m, [1, 0, 0, 1, x, y]); },
    scale: (x: number, y: number) => { m = mul(m, [x, 0, 0, y, 0, 0]); },
    rotate: (t: number) => { m = mul(m, [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]); },
    fillText: (text: string, x: number, y: number) => {
      // The frame alone (a sideways run, or any horizontal text) leaves the
      // origin of the frame where it was: the text starts at x along the
      // line. A cell is painted about a translated centre.
      const originFlow = flowX(m[4], m[5]);
      const translated = vertical && (Math.abs(m[5]) > 1e-9 || Math.abs(m[4] - pageWidth) > 1e-9);
      if (translated) {
        chars.push({ ch: text, at: originFlow, cell: true });
        return;
      }
      const spacing = parseFloat(String(state.letterSpacing)) || 0;
      let pos = vertical ? x : m[0] * x + m[2] * y + m[4];
      for (const ch of graphemesOf(text)) {
        chars.push({ ch, at: pos, cell: false });
        pos += stubWidth(ch, size()) + spacing;
      }
    },
    measureText: (s: string) => {
      const w = stubWidth(s, size());
      return { width: w, actualBoundingBoxAscent: 0.8 * size(), actualBoundingBoxDescent: 0.04 * size(), actualBoundingBoxLeft: 0, actualBoundingBoxRight: w };
    },
  };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (typeof key === 'string' && key in api) return api[key];
      if (key in target) return target[key as string];
      return () => undefined;
    },
    set(target, key, value) { target[key as string] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, chars };
}

/** The characters the composer measured, each where its box says the
 *  painter puts it: a segment from where the ones before it end, its glyph
 *  `inkOffset` before that; in vertical text each cell's centre (the Taiwan
 *  and mainland quotes read as the painter reads them) and each glyph of a
 *  sideways run from its origin. */
function expectedChars(doc: VDTDocument, region: CjkRegion, vertical: boolean): Array<PaintedChar & { line: VDTLine; hangs: boolean }> {
  const out: Array<PaintedChar & { line: VDTLine; hangs: boolean }> = [];
  for (const page of doc.pages) {
    for (const col of page.columns) {
      for (const block of col.blocks) {
        for (const line of block.lines ?? []) {
          let x = line.bbox.x;
          for (const s of line.segments ?? [{ kind: 'text', text: line.text, width: line.bbox.width } as VDTLineSegment]) {
            if (s.kind !== 'text') {
              x += s.width;
              continue;
            }
            const t = s.tracking ?? 0;
            let p = x + (s.inkOffset ?? 0);
            const hangs = !!s.hangs;
            const runs = vertical ? verticalRuns(graphemesOf(s.text), region) : [];
            if (runs.length === 1 && runs[0]!.cell !== undefined) {
              // One cell: centred in the box the composer measured — its
              // width, or a full-width mark's em when it gave up blank.
              const full = s.inkOffset !== undefined ? EM : s.width - t;
              out.push({ ch: runs[0]!.glyph.substitute ?? runs[0]!.text, at: p + full / 2, cell: true, line, hangs });
            } else if (vertical) {
              for (const run of runs) {
                if (run.cell === undefined) {
                  for (const ch of graphemesOf(run.text)) {
                    out.push({ ch, at: p, cell: false, line, hangs });
                    p += stubWidth(ch, EM);
                  }
                } else {
                  // Without a vertical twin face the painter draws the
                  // mainland's quotes as corner brackets.
                  out.push({ ch: run.glyph.substitute ?? run.text, at: p + (run.cell * EM) / 2, cell: true, line, hangs });
                  p += run.cell * EM + t;
                }
              }
            } else {
              for (const ch of graphemesOf(s.text)) {
                out.push({ ch, at: p, cell: false, line, hangs });
                p += stubWidth(ch, EM) + t;
              }
            }
            x += s.width;
          }
        }
      }
    }
  }
  return out;
}

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const PASSAGE = [
  '此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去，而借「通靈」之說，撰此《石頭記》一書也。',
  '故曰「甄士隱」云云。但書中所記何事何人？自又云：「今風塵碌碌，一事無成。」忽念及當日所有之女子——一一細考較去……',
  '他用iPhone拍了30×40的照片，1999年©2026，氣溫25℃±5，約翰·史密斯說“yes”與don’t。《紅樓夢》（曹雪芹著）。',
].join('\n\n');

describe('the canvas paints every character where the composer measured it', () => {
  const locales: Record<CjkRegion, string> = { mainland: 'zh-Hans', taiwan: 'zh-Hant', hongkong: 'zh-HK', japan: 'ja' };
  for (const mode of MODES) {
    for (const region of REGIONS) {
      for (const textAlign of ['left', 'justify'] as const) {
        it(`${mode}, ${region}, ${textAlign}: compressed, trimmed and hung marks included`, () => {
          const vertical = mode === 'vertical-rl';
          const config: PostextConfig = {
            page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(30), right: pt(30), bottom: pt(30), left: pt(30) } },
            bodyText: { fontFamily: 'Test Serif', fontSize: pt(EM), lineHeight: pt(26), textAlign, firstLineIndent: pt(2 * EM) },
            layout: { writingMode: mode, layoutType: 'single' },
            header: { elements: [] },
            footer: { elements: [] },
            locale: locales[region],
            // Short numbers stay sideways here: tate-chu-yoko has its own
            // tests (tateChuYoko.test.ts).
            cjk: { compressAdjacent: true, trimLineStart: true, hangingPunctuation: region === 'mainland' ? 'force' : 'allow', uprightDigits: 0 },
          };
          const doc = buildDocument({ markdown: PASSAGE }, config);
          const want = expectedChars(doc, region, vertical);
          const got: PaintedChar[] = [];
          for (const page of doc.pages) {
            const rec = recordingCanvas(page.width, !!page.flow);
            renderPageToCanvas(page, doc, rec.canvas);
            got.push(...rec.chars);
          }
          expect(got.map((c) => c.ch).join('')).toBe(want.map((c) => c.ch).join(''));
          const off: string[] = [];
          want.forEach((w, i) => {
            const g = got[i]!;
            if (g.cell !== w.cell || Math.abs(g.at - w.at) > 1e-6) off.push(`${i} ${w.ch}: painted ${g.at.toFixed(3)}${g.cell ? ' (cell)' : ''}, measured ${w.at.toFixed(3)}${w.cell ? ' (cell)' : ''}`);
          });
          expect(off).toEqual([]);
          // Nothing but a hung mark is painted past the end of its line.
          for (const w of want) {
            const end = w.line.bbox.x + w.line.bbox.width;
            if (w.hangs) expect(w.at).toBeGreaterThanOrEqual(end - EPS);
            else if (w.cell) expect(w.at).toBeLessThanOrEqual(end + EPS);
          }
          // Compressed marks were painted (the defaults of the region plus
          // compression): some mark gave up blank.
          const marks = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => (b.lines ?? []).flatMap((l) => l.segments ?? []))));
          expect(marks.some((s) => s.inkOffset !== undefined)).toBe(true);
          if (vertical) expect(doc.pages.every((p) => p.flow)).toBe(true);
        });
      }
    }
  }
});

describe('a mark hung past the foot of a vertical line', () => {
  it('is painted below the line, in the column the clip widens for it', () => {
    const config: PostextConfig = {
      page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(30), right: pt(30), bottom: pt(30), left: pt(30) } },
      bodyText: { fontFamily: 'Test Serif', fontSize: pt(EM), lineHeight: pt(26), textAlign: 'justify', firstLineIndent: pt(0) },
      layout: { writingMode: 'vertical-rl', layoutType: 'single' },
      header: { elements: [] },
      footer: { elements: [] },
      locale: 'zh-Hans',
      cjk: { hangingPunctuation: 'force' },
    };
    // A line holds 22.5 ems (360 pt): 22 characters, then 。 does not fit.
    const han = '此開卷第一回也作者自云因曾歷過一番夢幻之後故';
    const doc = buildDocument({ markdown: `${han}。真事隱去` }, config);
    const page = doc.pages[0]!;
    const line = page.columns[0]!.blocks[0]!.lines[0]!;
    const hung = line.segments![line.segments!.length - 1]!;
    expect(hung.text).toBe('。');
    expect(hung.hangs).toBe(true);
    // Kaiming's line-end 。 is half an em: it takes the half cell under the
    // line's foot.
    expect(hung.width).toBeCloseTo(EM / 2);
    const end = line.bbox.x + line.bbox.width;
    const rec = recordingCanvas(page.width, true);
    renderPageToCanvas(page, doc, rec.canvas);
    const stop = rec.chars.find((c) => c.ch === '。')!;
    expect(stop.cell).toBe(true);
    expect(stop.at).toBeCloseTo(end + EM / 2);
    // The column's clip reaches down past the measure to take it in.
    const clip = columnClipRect(page.columns[0]!, 72);
    expect(clip.x + clip.width).toBeGreaterThanOrEqual(end + hung.width - EPS);
  });
});

