import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas, renderToHtml } from '../../index';
import {
  CORNER_OFFSET_EM,
  SMALL_KANA_OFFSET_EM,
  forcedVerticalRuns,
  holdsVerticalCell,
  isUprightMarkPair,
  verticalOrientation,
  verticalRuns,
} from '../../writingMode';
import { registerVerticalAlternates, unregisterVerticalAlternates, VERTICAL_ALTERNATE_SAMPLE } from '../../canvas-backend/verticalText';
import { graphemesOf } from '../../measure/graphemes';
import type { CjkRegion, Dimension, PostextConfig } from '../../types';
import type { VDTDocument, VDTLineSegment } from '../../vdt';
import { installSizedStub, stubCharWidth } from './stub';

installSizedStub();

// Japanese vertical orientation (#419): small kana take their vertical
// form (up and right of the horizontal one) or move there; ！？ stand
// centred; ：； turn; ・ keeps a whole cell; “ ” are set as 〝 〟; and a pair
// of exclamation and question marks stands in one cell (JLReq §3.1.10).
// Chinese text keeps every one of these as it was.

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const EM = 10;

const config = (locale: string): PostextConfig => ({
  page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(30), right: pt(30), bottom: pt(30), left: pt(30) } },
  bodyText: { fontFamily: 'Test Serif', fontSize: pt(EM), lineHeight: pt(16), textAlign: 'left', firstLineIndent: pt(0) },
  layout: { writingMode: 'vertical-rl', layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  cjk: { punctuationWidth: 'fullwidth', compressAdjacent: false, trimLineStart: false, latinSpacing: { value: 0, unit: 'em' } },
  locale,
});

function segments(doc: VDTDocument): VDTLineSegment[] {
  return doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => (b.lines ?? []).flatMap((l) => l.segments ?? []))));
}

const o = (ch: string, region: CjkRegion = 'japan') => verticalOrientation(ch, region);
const cells = (s: string, region: CjkRegion = 'japan') => verticalRuns(graphemesOf(s), region, 2).filter((r) => r.glyph.orient === 'tcy').map((r) => [r.text, r.glyph.paintAs]);

describe('Japanese vertical orientation (#419)', () => {
  it('gives small kana their vertical form, moved up and right without one', () => {
    for (const ch of ['ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'っ', 'ゃ', 'ゅ', 'ょ', 'ゎ', 'ゕ', 'ゖ', 'ァ', 'ッ', 'ャ', 'ュ', 'ョ', 'ヮ', 'ヵ', 'ヶ', 'ㇰ', 'ㇿ']) {
      expect(o(ch), ch).toEqual({ orient: 'alternate', fallback: 'corner', offset: SMALL_KANA_OFFSET_EM });
    }
    // Up and to the right, a little: well inside the cell, unlike 、。.
    expect(SMALL_KANA_OFFSET_EM.x).toBeGreaterThan(0.05);
    expect(SMALL_KANA_OFFSET_EM.x).toBeLessThan(0.25);
    expect(SMALL_KANA_OFFSET_EM.y).toBeLessThan(-0.05);
    expect(SMALL_KANA_OFFSET_EM.y).toBeGreaterThan(-0.25);
    // Full-size kana and the iteration marks stand as they are.
    for (const ch of ['あ', 'つ', 'や', 'ア', 'ツ', 'ゝ', 'ヽ', '々']) expect(o(ch), ch).toEqual({ orient: 'upright' });
  });

  it('gives the other `Tu` characters their vertical form, centred without one', () => {
    for (const ch of ['㍻', '㌀', '゛']) expect(o(ch), ch).toEqual({ orient: 'alternate', fallback: 'corner', offset: { x: 0, y: 0 } });
  });

  it('turns ー, the brackets and ：；, stands ！？ and ・ upright', () => {
    for (const ch of ['ー', '「', '』', '（', '〔', '：', '；']) expect(o(ch), ch).toEqual({ orient: 'alternate', fallback: 'rotate' });
    for (const ch of ['！', '？', '・']) expect(o(ch), ch).toEqual({ orient: 'upright' });
    expect(verticalRuns(graphemesOf('三・一'), 'japan').map((r) => r.cell)).toEqual([1, 1, 1]);
    // 、。 in the corner, by the offset measured on Noto Serif SC: Noto
    // Serif JP and Shippori Mincho move them within 0.05 em of it.
    expect(o('。')).toEqual({ orient: 'alternate', fallback: 'corner' });
    expect(CORNER_OFFSET_EM).toEqual({ x: 0.6, y: -0.62 });
  });

  it('sets “ ” as 〝 〟 and leaves ‘ ’ to the font', () => {
    expect(o('“')).toEqual({ orient: 'alternate', fallback: 'rotate', paintAs: '〝' });
    expect(o('”')).toEqual({ orient: 'alternate', fallback: 'rotate', paintAs: '〟' });
    for (const ch of ['‘', '’']) expect(o(ch), ch).toEqual({ orient: 'alternate', fallback: 'rotate' });
  });

  it('changes nothing in Chinese text', () => {
    for (const region of ['mainland', 'taiwan', 'hongkong'] as const) {
      for (const ch of ['っ', 'ャ', 'ㄧ', '㍻']) expect(o(ch, region), `${ch} ${region}`).toEqual({ orient: 'upright' });
      for (const ch of ['“', '”', '‘', '’']) expect(o(ch, region).paintAs, `${ch} ${region}`).toBeUndefined();
    }
    expect(o('：', 'mainland')).toEqual({ orient: 'alternate', fallback: 'corner', offset: { x: 0.52, y: -0.22 } });
    expect(o('：', 'taiwan')).toEqual({ orient: 'upright' });
  });

  it('loads the twin face for kana, ー, the wave dash and 〝〟 too', () => {
    for (const ch of ['ー', 'っ', 'ゃ', 'ッ', 'ㇰ', '〜', '‥', '〝', '〟', '「', '。']) expect(VERTICAL_ALTERNATE_SAMPLE, ch).toContain(ch);
  });
});

describe('a pair of exclamation and question marks in one cell (JLReq §3.1.10)', () => {
  it('sets !! !? ?! ?? and ！！ ！？ ？！ ？？ side by side, the full-width ones painted half-width', () => {
    expect(cells('すごい!!')).toEqual([['!!', undefined]]);
    expect(cells('本当!?」')).toEqual([['!?', undefined]]);
    expect(cells('え?!と')).toEqual([['?!', undefined]]);
    expect(cells('なに??')).toEqual([['??', undefined]]);
    expect(cells('えっ！？と')).toEqual([['！？', '!?']]);
    expect(cells('まさか！！')).toEqual([['！！', '!!']]);
    expect(cells('なぜ？？')).toEqual([['？？', '??']]);
    // A space after the pair is no Latin neighbour.
    expect(cells('なに!? それ')).toEqual([['!?', undefined]]);
  });

  it('leaves one mark, three marks, mixed widths and marks of a Latin run as they are', () => {
    for (const s of ['すごい!', 'すごい！', 'すごい!!!', 'すごい！！！', 'え!！', 'Wow!!', '(!?)', 'Yes!? no', '12!!', 'すごい‼']) {
      expect(cells(s), s).toEqual(s === '12!!' ? [['12', undefined]] : []);
    }
    expect(isUprightMarkPair(graphemesOf('!!'), 0, 'japan')).toBe(true);
    expect(isUprightMarkPair(graphemesOf('!!'), 0, 'mainland')).toBe(false);
  });

  it('pairs nothing in Chinese text', () => {
    for (const region of ['mainland', 'taiwan', 'hongkong'] as const) {
      expect(cells('真的!!？？', region), region).toEqual([]);
      expect(forcedVerticalRuns(graphemesOf('！？'), 'tcy', region)[0]!.glyph).toEqual({ orient: 'tcy' });
    }
    expect(holdsVerticalCell('!!', 0, 'mainland')).toBe(false);
    expect(holdsVerticalCell('!!', 0, 'japan')).toBe(true);
    expect(holdsVerticalCell('Wow!!', 0, 'japan')).toBe(false);
  });

  it('paints an author’s :tcy[！？] half-width in Japanese text', () => {
    expect(forcedVerticalRuns(graphemesOf('！？'), 'tcy', 'japan')[0]!.glyph).toEqual({ orient: 'tcy', paintAs: '!?' });
    expect(forcedVerticalRuns(graphemesOf('!?'), 'tcy', 'japan')[0]!.glyph).toEqual({ orient: 'tcy' });
  });

  it('composes the pair as one cell of one em, its own segment, in Japanese vertical text only', () => {
    const doc = buildDocument({ markdown: 'すごい!!と思った。えっ！？と言った。Wow!!も。' }, config('ja'));
    const tcy = segments(doc).filter((s) => s.tcy);
    expect(tcy.map((s) => s.text)).toEqual(['!!', '！？']);
    for (const s of tcy) expect(s.width).toBeCloseTo(EM, 6);
    // `Wow!!` runs sideways whole.
    expect(segments(doc).some((s) => s.text === 'Wow!!' && !s.tcy)).toBe(true);
    for (const locale of ['zh-Hans', 'zh-Hant']) {
      const zh = buildDocument({ markdown: '真的!!他說。真的！？他說。' }, config(locale));
      expect(segments(zh).some((s) => s.tcy), locale).toBe(false);
    }
    // Horizontal Japanese text keeps the marks as they are.
    const horizontal = buildDocument({ markdown: 'すごい!!と思った。' }, { ...config('ja'), layout: { layoutType: 'single' } });
    expect(segments(horizontal).some((s) => s.tcy)).toBe(false);
  });

  it('never starts a line with the pair', () => {
    // Nine characters fill the line before the pair: the pair goes down
    // with the character before it.
    const doc = buildDocument({ markdown: 'あいうえおかきくけこ！？さしすせそ' }, { ...config('ja'), page: { ...config('ja').page!, height: pt(160) } });
    const lines = doc.pages[0]!.columns[0]!.blocks[0]!.lines!;
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines.slice(1)) expect(line.segments![0]!.tcy, line.text).toBeFalsy();
  });

  it('measures a Latin paragraph’s pair as the painters set it', () => {
    const doc = buildDocument({ markdown: 'Hello !! there' }, config('ja'));
    const words = segments(doc);
    const width = words.reduce((a, s) => a + s.width, 0);
    // Two words, two spaces and one cell.
    expect(width).toBeCloseTo((5 + 5) * (EM / 2) + 2 * (EM / 4) + EM, 3);
  });
});

/** A recording 2D context whose twin face (`postext-vert`) has vertical
 *  forms only for the characters of `forms`: their ink differs. */
function recordingCanvas(forms: string): { canvas: HTMLCanvasElement; painted: { text: string; x: number; y: number; font: string }[] } {
  type M = [number, number, number, number, number, number];
  const mul = (m: M, n: M): M => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  const painted: { text: string; x: number; y: number; font: string }[] = [];
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const state: Record<string, unknown> = { font: '10px Test', letterSpacing: '0px', textBaseline: 'alphabetic', textAlign: 'start' };
  const saved: Record<string, unknown>[] = [];
  const size = () => Number(/(\d*\.?\d+)px/.exec(String(state.font))?.[1] ?? 10);
  const api: Record<string, unknown> = {
    save: () => { stack.push(m); saved.push({ ...state }); },
    restore: () => { m = stack.pop() ?? m; Object.assign(state, saved.pop() ?? {}); },
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => { m = mul(m, [a, b, c, d, e, f]); },
    translate: (x: number, y: number) => { m = mul(m, [1, 0, 0, 1, x, y]); },
    scale: (x: number, y: number) => { m = mul(m, [x, 0, 0, y, 0, 0]); },
    rotate: (t: number) => { m = mul(m, [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]); },
    fillText: (text: string, x: number, y: number) => {
      painted.push({ text, x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5], font: String(state.font) });
    },
    measureText: (s: string) => {
      let w = 0;
      for (const ch of s) w += stubCharWidth(ch, size());
      const twin = String(state.font).includes('postext-vert') && [...s].some((ch) => forms.includes(ch));
      return { width: w, actualBoundingBoxAscent: twin ? 1 : 0, actualBoundingBoxDescent: 0, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w };
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
  return { canvas: { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement, painted };
}

describe('the canvas paints Japanese vertical forms (#419)', () => {
  const paint = (markdown: string, forms = '') => {
    const doc = buildDocument({ markdown }, config('ja'));
    const rec = recordingCanvas(forms);
    renderPageToCanvas(doc.pages[0]!, doc, rec.canvas);
    return rec.painted;
  };

  it('moves a small kana up and right of its cell without a twin, and of 0.13 em', () => {
    const p = paint('あっあ');
    const [a, small, b] = [p[0]!, p[1]!, p[2]!];
    expect(p.map((x) => x.text)).toEqual(['あ', 'っ', 'あ']);
    // The cell below あ, moved right (x) and up (y) on the sheet.
    expect(small.x - a.x).toBeCloseTo(SMALL_KANA_OFFSET_EM.x * EM, 3);
    expect(small.y - a.y).toBeCloseTo(EM + SMALL_KANA_OFFSET_EM.y * EM, 3);
    expect(b.y - a.y).toBeCloseTo(2 * EM, 3);
  });

  it('paints a small kana with the twin face where it has a vertical form, else moves it', () => {
    registerVerticalAlternates('Test Serif', 'Test Serif postext-vert');
    try {
      const withForm = paint('あっあ', 'っ');
      expect(withForm[1]!.font).toContain('postext-vert');
      expect(withForm[1]!.x).toBeCloseTo(withForm[0]!.x, 3);
      // (The painter remembers what it found per character and face.)
      const without = paint('あゃあ', 'っ');
      expect(without[1]!.font).not.toContain('postext-vert');
      expect(without[1]!.x - without[0]!.x).toBeCloseTo(SMALL_KANA_OFFSET_EM.x * EM, 3);
    } finally {
      unregisterVerticalAlternates('Test Serif');
    }
  });

  it('paints “ ” as 〝 〟, with the twin or turned', () => {
    expect(paint('彼は“はい”と').map((x) => x.text).join('')).toBe('彼は〝はい〟と');
    registerVerticalAlternates('Test Serif', 'Test Serif postext-vert');
    try {
      const p = paint('彼は“はい”と', '〝〟');
      expect(p.filter((x) => x.font.includes('postext-vert')).map((x) => x.text)).toEqual(['〝', '〟']);
    } finally {
      unregisterVerticalAlternates('Test Serif');
    }
  });

  it('paints a full-width pair as the half-width marks in one cell', () => {
    const p = paint('えっ！？と');
    expect(p.map((x) => x.text)).toEqual(['え', 'っ', '!?', 'と']);
    // One cell for the pair: と is three ems below え.
    expect(p[3]!.y - p[0]!.y).toBeCloseTo(3 * EM, 3);
  });
});

describe('the HTML sets Japanese vertical forms (#419)', () => {
  it('writes 〝 〟 for “ ” and combines a pair upright, in Japanese text only', () => {
    const ja = renderToHtml(buildDocument({ markdown: '彼は“はい”と言った!!' }, config('ja')));
    expect(ja).toContain('〝はい〟');
    expect(ja).toContain('<span style="text-combine-upright:all;">!!</span>');
    const zh = renderToHtml(buildDocument({ markdown: '他說“好”!!' }, config('zh-Hant')));
    expect(zh).toContain('“好”');
    expect(zh).not.toContain('text-combine-upright:all;">!!');
  });
});
