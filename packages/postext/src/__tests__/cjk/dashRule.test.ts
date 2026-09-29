import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../../index';
import { renderToHtml } from '../../html-backend';
import { measureRichBlock } from '../../measure/rich';
import type { CjkComposition } from '../../measure/cjkPunctuation';
import type { Dimension, PostextConfig } from '../../types';
import type { VDTLine, VDTLineSegment } from '../../vdt';

// A 破折号 (——) prints as one unbroken rule over its two ems, on the
// characters' centre line. The stub is Noto Serif SC's: its em dash is a
// proportional Latin stroke, 0.89 em wide with ink from 0.043 to 0.846 em,
// 0.242 to 0.293 em above the baseline; 國 has ink from 0.079 em below to
// 0.822 em above it (the centre of the em box 0.3715 em up).

const EM = 20;
const SIZE_RE = /(\d*\.?\d+)px/;
interface Glyph { advance: number; left: number; right: number; top: number; bottom: number }
const GLYPHS: Record<string, Glyph> = {
  '—': { advance: 0.89, left: 0.043, right: 0.846, top: 0.293, bottom: 0.242 },
  '…': { advance: 1, left: 0.111, right: 0.889, top: 0.436, bottom: 0.324 },
};
const HAN: Glyph = { advance: 1, left: 0.098, right: 0.946, top: 0.822, bottom: -0.079 };
const LATIN: Glyph = { advance: 0.5, left: 0.05, right: 0.45, top: 0.7, bottom: 0 };
const glyph = (ch: string): Glyph => GLYPHS[ch] ?? (ch === ' ' ? { ...LATIN, advance: 0.25, right: 0, left: 0 } : ch.codePointAt(0)! >= 0x2e80 ? HAN : LATIN);
class StubCtx {
  font = `${EM}px Test`;
  letterSpacing = '0px';
  measureText(s: string): TextMetrics {
    const em = Number(SIZE_RE.exec(this.font)?.[1] ?? EM);
    let x = 0;
    let left = Infinity;
    let right = -Infinity;
    let top = -Infinity;
    let bottom = Infinity;
    for (const ch of s) {
      const g = glyph(ch);
      if (g.right > g.left) {
        left = Math.min(left, x + g.left);
        right = Math.max(right, x + g.right);
        top = Math.max(top, g.top);
        bottom = Math.min(bottom, g.bottom);
      }
      x += g.advance;
    }
    if (left === Infinity) return { width: x * em, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 } as TextMetrics;
    return {
      width: x * em,
      actualBoundingBoxLeft: -left * em,
      actualBoundingBoxRight: right * em,
      actualBoundingBoxAscent: top * em,
      actualBoundingBoxDescent: -bottom * em,
    } as TextMetrics;
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const FONT = `${EM}px "Test Serif"`;
const composition = (c: Partial<CjkComposition> = {}): CjkComposition => ({
  region: 'mainland',
  punctuationWidth: 'kaiming',
  compressAdjacent: true,
  trimLineStart: false,
  hangingPunctuation: 'none',
  latinSpacing: { em: 0 },
  ...c,
});
const lines = (text: string, measure = 40 * EM, extra: { looseness?: number } = {}): VDTLine[] =>
  measureRichBlock([{ text, bold: false, italic: false }], FONT, FONT, FONT, FONT, measure, 30, { textAlign: 'justify', cjkLineBreak: 'gb', cjkComposition: composition(), ...extra }).lines;
const segs = (ls: VDTLine[], text: string): VDTLineSegment[] => ls.flatMap((l) => l.segments ?? []).filter((s) => s.text === text);
/** Where a segment's ink runs along its line, px from the line's start. */
function inkSpan(line: VDTLine, target: VDTLineSegment): [number, number] {
  let x = 0;
  for (const s of line.segments ?? []) {
    if (s === target) {
      const g = glyph(s.text);
      const scale = s.inkScale ?? 1;
      const origin = x + (s.inkOffset ?? 0);
      return [origin + g.left * EM * scale, origin + g.right * EM * scale];
    }
    x += s.width;
  }
  throw new Error('segment not on the line');
}

describe('a 破折号 in Chinese text is one rule two ems long', () => {
  it('stretches each dash over its em, the two overlapping at the join', () => {
    const [line] = lines('忽念及当日所有之女子——一一细考较去');
    const [a, b] = segs([line!], '—');
    expect(a!.width).toBeCloseTo(EM);
    expect(b!.width).toBeCloseTo(EM);
    const [a0, a1] = inkSpan(line!, a!);
    const [b0, b1] = inkSpan(line!, b!);
    // The rule starts and ends the face's own side bearing inside the two
    // ems (0.043 em) …
    const start = 10 * EM;
    expect(a0 - start).toBeCloseTo(0.043 * EM);
    expect(start + 2 * EM - b1).toBeCloseTo(0.043 * EM);
    // … and the strokes overlap by 0.04 em, so no seam shows.
    expect(a1 - b0).toBeCloseTo(0.04 * EM);
    expect(a!.inkScale).toBeCloseTo((1 - 0.043 + 0.02) / (0.846 - 0.043));
    expect(b!.inkScale).toBeCloseTo(a!.inkScale!);
  });

  it('raises the dashes to the centre of the characters', () => {
    const [a, b] = segs(lines('女子——一一细考'), '—');
    // Ink centre 0.2675 em up, the em box's centre 0.371 em up (read from
    // 國 to the thousandth of an em).
    expect(a!.baselineShift).toBeCloseTo(-0.1035 * EM);
    expect(b!.baselineShift).toBeCloseTo(-0.1035 * EM);
  });

  it('keeps the rule whole on a justified line spread between its characters', () => {
    const [line] = lines('忽念及当日所有之女子——一一细考较去', 21 * EM);
    const [a, b] = segs([line!], '—');
    expect(a!.tracking).toBeUndefined();
    const [, a1] = inkSpan(line!, a!);
    const [b0] = inkSpan(line!, b!);
    expect(a1).toBeGreaterThan(b0);
  });

  it('leaves the ellipsis, a single dash and a dash between Latin words as they were', () => {
    const ls = lines('他说……好的。北京—上海');
    for (const s of [...segs(ls, '…'), ...segs(ls, '—')]) {
      expect(s.inkScale).toBeUndefined();
      expect(s.baselineShift).toBeUndefined();
    }
    const latin = measureRichBlock([{ text: 'He said——yes and no', bold: false, italic: false }], FONT, FONT, FONT, FONT, 40 * EM, 30, { textAlign: 'left' }).lines;
    expect(latin.flatMap((l) => l.segments ?? []).some((s) => s.inkScale !== undefined)).toBe(false);
  });
});

describe('column balancing never loosens a Chinese paragraph into a single-character last line', () => {
  // 28 characters on a 10-em measure: 10, 10 and 8. Broken an eighth of an
  // em short, each line holds 9 and the fourth line one character: the
  // lever takes the first setting past that, 8 a line and 4 on the last.
  const text = '甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥天地玄黄宇宙';
  it('sets the paragraph one line longer with more than one character on its last line', () => {
    const natural = lines(text, 10 * EM);
    expect(natural.map((l) => l.text.length)).toEqual([10, 10, 8]);
    const loose = lines(text, 10 * EM, { looseness: 1 });
    expect(loose).toHaveLength(4);
    expect(loose[3]!.text.length).toBeGreaterThan(1);
    expect(loose.map((l) => l.text).join('')).toBe(text);
  });

  it('counts a character followed by its full stop as a single character', () => {
    const loose = lines(`${text.slice(0, 27)}。`, 10 * EM, { looseness: 1 });
    expect(loose).toHaveLength(4);
    expect(loose[3]!.text.replace(/。$/, '').length).toBeGreaterThan(1);
  });
});

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const config = (): PostextConfig => ({
  locale: 'zh-Hans',
  page: { sizePreset: 'custom', width: { value: 400, unit: 'px' }, height: { value: 600, unit: 'px' }, dpi: 72, margins: { top: pt(20), right: pt(20), bottom: pt(20), left: pt(20) } },
  bodyText: { fontFamily: 'Test Serif', fontSize: { value: EM, unit: 'px' }, lineHeight: { value: 30, unit: 'px' }, textAlign: 'justify' },
  cjk: { lineBreak: 'gb', punctuationWidth: 'fullwidth', latinSpacing: { value: 0, unit: 'em' } },
});

describe('renderers paint a stretched dash', () => {
  it('canvas scales the glyph from its ink offset; HTML scales it with the face’s own form off', () => {
    const doc = buildDocument({ markdown: '忽念及当日所有之女子——一一细考较去。' }, config());
    const block = doc.blocks.find((b) => b.type === 'paragraph')!;
    const dashes = block.lines.flatMap((l) => l.segments ?? []).filter((s) => s.text === '—');
    expect(dashes).toHaveLength(2);
    const calls: string[] = [];
    const target: Record<string | symbol, unknown> = { letterSpacing: '0px', font: FONT };
    const ctx = new Proxy(target, {
      get(t, key) {
        if (key === 'fillText') return (text: string, x: number, y: number) => { calls.push(`fillText ${text} ${x} ${y}`); };
        if (key === 'translate') return (x: number, y: number) => { calls.push(`translate ${x.toFixed(3)} ${y.toFixed(3)}`); };
        if (key === 'scale') return (x: number, y: number) => { calls.push(`scale ${x.toFixed(4)} ${y}`); };
        if (key === 'measureText') return (s: string) => new StubCtx().measureText(s);
        if (key in t) return t[key];
        return () => undefined;
      },
      set(t, key, value) { t[key] = value; return true; },
    });
    renderPageToCanvas(doc.pages[0]!, doc, { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement);
    const line = block.lines[0]!;
    let x = line.bbox.x;
    for (const s of line.segments ?? []) {
      if (s.text === '—') {
        const i = calls.indexOf(`translate ${(x + s.inkOffset!).toFixed(3)} ${(line.baseline + s.baselineShift!).toFixed(3)}`);
        expect(i, `${x}`).toBeGreaterThanOrEqual(0);
        expect(calls[i + 1]).toBe(`scale ${s.inkScale!.toFixed(4)} 1`);
        expect(calls[i + 2]).toBe('fillText — 0 0');
      }
      x += s.width;
    }
    const html = renderToHtml(doc);
    expect(html.match(/transform:scaleX\(/g)).toHaveLength(2);
    expect(html).toContain("'locl' 0");
  });

  it('stretches nothing down a vertical line, where each dash takes its vertical form (#191)', () => {
    const doc = buildDocument({ markdown: '忽念及当日所有之女子——一一细考较去。' }, { ...config(), layout: { writingMode: 'vertical-rl' } });
    const segs = doc.blocks.find((b) => b.type === 'paragraph')!.lines.flatMap((l) => l.segments ?? []);
    expect(segs.some((s) => s.text.includes('—'))).toBe(true);
    expect(segs.some((s) => s.inkScale !== undefined)).toBe(false);
    expect(renderToHtml(doc)).not.toContain('transform:scaleX(');
  });
});
