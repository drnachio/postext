import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../../index';
import { renderToHtml } from '../../html-backend';
import { clearTextWidthCache, measureTextWidth } from '../../measure/canvas';
import { cjkMarkCuts } from '../../measure/cjkClasses';
import { graphemesOf } from '../../measure/graphemes';
import type { Dimension, PostextConfig, WritingMode } from '../../types';
import type { VDTDocument, VDTLine } from '../../vdt';

// A browser sets the first of two CJK marks that meet half width when it
// measures or paints them in one run (Chrome's `text-spacing-trim: normal`,
// fonts with `chws`): `本）》录` in Noto Serif SC at 21 px is 73.5 px as one
// run, 84 px character by character. The composer measures every character
// alone and sets the marks itself, so neither the layout nor what the
// canvas paints may depend on it. The stubs below trim like Chrome when
// `trimming` is on — the measuring context and the painting one — and every
// check compares a run with trimming against one without.

const EM = 16;
const SIZE_RE = /(\d*\.?\d+)px/;
/** The marks the stub browser trims when two meet. */
const MARKS = new Set([...'（）《》「」『』“”‘’，。、：；！？·・　']);
let trimming = false;

const charWidth = (ch: string, em: number): number => {
  const cp = ch.codePointAt(0)!;
  if (ch === ' ') return em / 4;
  return cp >= 0x2e80 || (cp >= 0x2010 && cp <= 0x2027) ? em : em / 2;
};
/** The pen after each grapheme of a run the stub browser sets. */
function pens(text: string, em: number, spacing: number): number[] {
  const gs = graphemesOf(text);
  const out: number[] = [];
  let pen = 0;
  gs.forEach((g, i) => {
    pen += charWidth(g, em) + spacing;
    if (trimming && MARKS.has(g) && MARKS.has(gs[i + 1] ?? '')) pen -= em / 2;
    out.push(pen);
  });
  return out;
}
const sizeOf = (font: unknown): number => Number(SIZE_RE.exec(String(font))?.[1] ?? EM);

class TrimmingCtx {
  font = `${EM}px Test`;
  letterSpacing = '0px';
  measureText(s: string): TextMetrics {
    const em = sizeOf(this.font);
    const w = pens(s, em, 0).at(-1) ?? 0;
    return { width: w, actualBoundingBoxAscent: em * 0.8, actualBoundingBoxDescent: em * 0.04, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w } as TextMetrics;
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): TrimmingCtx {
    return new TrimmingCtx();
  }
};

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

/** A glyph as the stub browser put it on the sheet. */
interface Glyph {
  ch: string;
  x: number;
  y: number;
}

/** A 2D context that follows the transform and turns every `fillText` into
 *  its glyphs, each where the stub browser sets it in the run (trimming
 *  when `trimming` is on). */
function recordingCanvas(): { canvas: HTMLCanvasElement; glyphs: Glyph[]; runs: string[] } {
  const glyphs: Glyph[] = [];
  const runs: string[] = [];
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const state: Record<string, unknown> = { font: `${EM}px Test`, letterSpacing: '0px', textBaseline: 'alphabetic', textAlign: 'start' };
  const saved: Record<string, unknown>[] = [];
  const api: Record<string, unknown> = {
    save: () => { stack.push(m); saved.push({ ...state }); },
    restore: () => { m = stack.pop() ?? m; Object.assign(state, saved.pop() ?? {}); },
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => { m = mul(m, [a, b, c, d, e, f]); },
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => { m = [a, b, c, d, e, f]; },
    translate: (x: number, y: number) => { m = mul(m, [1, 0, 0, 1, x, y]); },
    scale: (x: number, y: number) => { m = mul(m, [x, 0, 0, y, 0, 0]); },
    rotate: (t: number) => { m = mul(m, [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]); },
    fillText: (text: string, x: number, y: number) => {
      runs.push(text);
      const spacing = parseFloat(String(state.letterSpacing)) || 0;
      const at = pens(text, sizeOf(state.font), spacing);
      graphemesOf(text).forEach((ch, i) => {
        const lx = x + (i === 0 ? 0 : at[i - 1]!);
        glyphs.push({ ch, x: m[0] * lx + m[2] * y + m[4], y: m[1] * lx + m[3] * y + m[5] });
      });
    },
    measureText: (s: string) => {
      const em = sizeOf(state.font);
      const w = pens(s, em, parseFloat(String(state.letterSpacing)) || 0).at(-1) ?? 0;
      return { width: w, actualBoundingBoxAscent: 0.8 * em, actualBoundingBoxDescent: 0.04 * em, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w };
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
  return { canvas, glyphs, runs };
}

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
function config(locale: string, mode: WritingMode, textAlign: 'left' | 'justify', cjk: PostextConfig['cjk'] = {}): PostextConfig {
  return {
    locale,
    page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(30), right: pt(30), bottom: pt(30), left: pt(30) } },
    bodyText: { fontFamily: 'Test Serif', fontSize: pt(EM), lineHeight: pt(26), textAlign, firstLineIndent: pt(2 * EM), hyphenation: { enabled: false } },
    layout: { writingMode: mode, layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    cjk,
  };
}

// 红楼梦, chapter 1, with the pairs of the report: 本）》录, ”“, 》。, 。《.
const HANT = '「此開卷第一回也。」作者自云：因曾歷過一番夢幻之後，故將真事隱去，而借「通靈」之說，撰此《石頭記》一書也。脂硯齋評本）》錄於此。“你來了。”“是。”他說《紅樓夢》。《石頭記》又名《情僧錄》，「『風月寶鑑』」是也。';
const HANS = '作者自云：因曾历过一番梦幻之后，故将真事隐去，而借“通灵”之说，撰此《石头记》一书也。脂砚斋评本）》录于此。“你来了。”“是。”他说《红楼梦》。《石头记》又名《情僧录》，“‘风月宝鉴’”是也。';

/** Lay out and paint `markdown` with the stub browser trimming or not. */
function run(markdown: string, cfg: PostextConfig, trim: boolean): { doc: VDTDocument; glyphs: Glyph[]; runs: string[] } {
  trimming = trim;
  clearTextWidthCache();
  try {
    const doc = buildDocument({ markdown }, cfg);
    const glyphs: Glyph[] = [];
    const runs: string[] = [];
    for (const page of doc.pages) {
      const rec = recordingCanvas();
      renderPageToCanvas(page, doc, rec.canvas);
      glyphs.push(...rec.glyphs);
      runs.push(...rec.runs);
    }
    return { doc, glyphs, runs };
  } finally {
    trimming = false;
    clearTextWidthCache();
  }
}

/** Every character of a horizontal CJK line where the composer set it: a
 *  segment from where the ones before it end, its glyph `inkOffset` before
 *  that, each of its characters one advance after the other. */
function composerGlyphs(lines: readonly VDTLine[]): { ch: string; x: number }[] {
  const out: { ch: string; x: number }[] = [];
  for (const line of lines) {
    let x = line.bbox.x;
    for (const s of line.segments ?? []) {
      if (s.kind === 'text') {
        let p = x + (s.inkOffset ?? 0);
        for (const ch of graphemesOf(s.text)) {
          out.push({ ch, x: p });
          p += charWidth(ch, EM) + (s.tracking ?? 0);
        }
      }
      x += s.width;
    }
  }
  return out;
}

const hasPair = (text: string): boolean => {
  const gs = graphemesOf(text);
  return gs.some((g, i) => MARKS.has(g) && MARKS.has(gs[i + 1] ?? ''));
};

describe('two CJK marks that meet: measured and painted apart', () => {
  it('cuts text between marks that meet, the shared ones only in Chinese text', () => {
    expect(cjkMarkCuts('本）》录', false)).toEqual([2]);
    expect(cjkMarkCuts('他说。《红楼梦》。', false)).toEqual([3, 8]);
    expect(cjkMarkCuts('「『風月』」', false)).toEqual([1, 5]);
    // “ ” ‘ ’ · are Latin marks too: cut only when the text is Chinese.
    expect(cjkMarkCuts('”“', true)).toEqual([1]);
    expect(cjkMarkCuts('”“', false)).toEqual([]);
    expect(cjkMarkCuts('“He said ‘hi’”', false)).toEqual([]);
    // ASCII marks never.
    expect(cjkMarkCuts('(a),', true)).toEqual([]);
    expect(cjkMarkCuts('本）录', true)).toEqual([]);
  });

  it('measures a run as the sum of its pieces, whatever the browser trims', () => {
    trimming = true;
    clearTextWidthCache();
    try {
      const font = `${EM}px Test`;
      expect(measureTextWidth('本）》录', font)).toBe(4 * EM);
      expect(measureTextWidth('》。', font)).toBe(2 * EM);
      expect(measureTextWidth('他说：”“好', font)).toBe(6 * EM);
      // Latin quotes that meet in Latin text are left to the browser.
      expect(measureTextWidth('‘hi’”', font)).toBe(pens('‘hi’”', EM, 0).at(-1));
    } finally {
      trimming = false;
      clearTextWidthCache();
    }
  });

  const cases: Array<[string, string, PostextConfig]> = [
    ['Taiwan, full width, ragged (lines painted in one run)', HANT, config('zh-Hant', 'horizontal-tb', 'left')],
    ['Taiwan, full width, justified', HANT, config('zh-Hant', 'horizontal-tb', 'justify')],
    ['mainland, Kaiming, justified', HANS, config('zh-Hans', 'horizontal-tb', 'justify')],
    ['mainland, full width uncompressed, ragged', HANS, config('zh-Hans', 'horizontal-tb', 'left', { punctuationWidth: 'fullwidth', compressAdjacent: false, trimLineStart: false })],
    ['Taiwan, vertical', HANT, config('zh-Hant', 'vertical-rl', 'justify')],
    ['mainland, vertical, full width uncompressed', HANS, config('zh-Hans', 'vertical-rl', 'left', { punctuationWidth: 'fullwidth', compressAdjacent: false })],
  ];
  for (const [name, text, cfg] of cases) {
    it(`lays out and paints alike with and without the browser's trimming (${name})`, () => {
      const plain = run(text, cfg, false);
      const trimmed = run(text, cfg, true);
      expect(JSON.stringify(trimmed.doc.pages)).toBe(JSON.stringify(plain.doc.pages));
      expect(trimmed.glyphs.map((g) => g.ch).join('')).toBe(plain.glyphs.map((g) => g.ch).join(''));
      const off: string[] = [];
      plain.glyphs.forEach((g, i) => {
        const t = trimmed.glyphs[i]!;
        if (Math.abs(t.x - g.x) > 1e-6 || Math.abs(t.y - g.y) > 1e-6) off.push(`${i} ${g.ch}: ${t.x},${t.y} for ${g.x},${g.y}`);
      });
      expect(off).toEqual([]);
      // No run handed to the canvas holds two marks that meet.
      expect(trimmed.runs.filter(hasPair)).toEqual([]);
      if (cfg.layout?.writingMode === 'vertical-rl') return;
      // Horizontally each character is where the composer set it.
      const lines = trimmed.doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines ?? [])));
      expect(lines.some((l) => hasPair(l.text))).toBe(true);
      const want = composerGlyphs(lines);
      expect(trimmed.glyphs.map((g) => g.ch).join('')).toBe(want.map((g) => g.ch).join(''));
      const moved = want.flatMap((w, i) => (Math.abs(trimmed.glyphs[i]!.x - w.x) > 1e-6 ? [`${i} ${w.ch}: painted ${trimmed.glyphs[i]!.x}, set ${w.x}`] : []));
      expect(moved).toEqual([]);
    });
  }

  it('turns the browser’s punctuation trimming off on HTML lines of CJK text only', () => {
    const doc = buildDocument({ markdown: `${HANT}\n\nA Latin line, “quoted”.` }, config('zh-Hant', 'horizontal-tb', 'left'));
    const html = renderToHtml(doc);
    const lines = html.split('<div class="pt-line"').slice(1);
    const cjk = lines.filter((l) => /[一-鿿]/.test(l));
    const latin = lines.filter((l) => l.includes('Latin'));
    expect(cjk.length).toBeGreaterThan(1);
    for (const l of cjk) expect(l).toContain("text-spacing-trim:space-all;text-autospace:no-autospace;font-feature-settings:'chws' 0,'halt' 0,'vchw' 0;");
    expect(latin.length).toBe(1);
    expect(latin[0]).not.toContain('text-spacing-trim');
    // A document without CJK text is untouched.
    const en = renderToHtml(buildDocument({ markdown: 'A Latin line, “quoted”’s.' }, config('en', 'horizontal-tb', 'left')));
    expect(en).not.toContain('text-spacing-trim');
    expect(en).not.toContain('chws');
  });
});
