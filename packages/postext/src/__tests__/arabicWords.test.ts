import { describe, it, expect, vi } from 'vitest';
import { measureBlock } from '../measure/plain';
import { measureRichBlock, emergencySplit } from '../measure/rich';
import { hyphenateText } from '../hyphenate';
import { joinsWithNext } from '../bidi';
import { insideJoiningWord, joiningScriptIn, mostlyJoiningScript, wordLetterSpacing } from '../measure/joining';
import { resolveBodyTextConfig } from '../defaults/bodyText';
import { buildDocument } from '../pipeline';
import { formatWarning } from '../pipeline/contentWarnings';
import { renderBlock } from '../canvas-backend/blockRender';
import { paintWordRuns } from '../canvas-backend/wordRuns';
import { beginMirroredFlow } from '../canvas-backend/mirrorFrame';
import type { InlineSpan } from '../parse';
import type { PostextConfig } from '../types';
import type { VDTBlock, VDTLine } from '../vdt';

// #368: an Arabic word is an atomic unit. It is never hyphenated, never cut
// between its letters, never measured in pieces and never tracked.

/** Width of a text in the stub font: 7 px a character, marks nothing, and
 *  2 px less for every pair of letters that join, as a cursive face sets
 *  them tighter. A piece of an Arabic word measured alone is therefore
 *  wider than its share of the whole word, as in a real Arabic face. */
function stubWidth(s: string): number {
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    if (!/\p{M}/u.test(s[i]!)) w += 7;
    if (joinsWithNext(s, i)) w -= 2;
  }
  return w;
}
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: stubWidth(s) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const FONT = '16px Test';
const BOLD = 'bold 16px Test';
const span = (text: string, bold = false): InlineSpan => ({ text, bold, italic: false });
const textSegs = (line: VDTLine) => line.segments!.filter((s) => s.kind === 'text');

describe('joining predicates', () => {
  it('finds a joining-script letter, and nothing past it in Latin, CJK or Hebrew text', () => {
    expect(joiningScriptIn('كتاب')).toBe(true);
    expect(joiningScriptIn('quoted كتاب here')).toBe(true);
    expect(joiningScriptIn('English text, café')).toBe(false);
    expect(joiningScriptIn('中文 עברית ١٢٣')).toBe(false);
  });

  it('cuts inside a word only between its letters, never next to Latin or digits', () => {
    expect(insideJoiningWord('كتاب', 2)).toBe(true);
    // ا and ر do not connect, yet the word is still one word.
    expect(insideJoiningWord('دار', 1)).toBe(true);
    // Before a vowel sign.
    expect(insideJoiningWord('كَتب', 1)).toBe(true);
    expect(insideJoiningWord('ABCكتاب', 3)).toBe(false);
    expect(insideJoiningWord('و2020', 1)).toBe(false);
    expect(insideJoiningWord('hello', 2)).toBe(false);
  });

  it('reads a paragraph as Arabic when most of its letters are', () => {
    expect(mostlyJoiningScript('قال الرجل إن الكتاب جميل')).toBe(true);
    expect(mostlyJoiningScript('He said كتاب, meaning a book that he liked')).toBe(false);
    expect(mostlyJoiningScript('No Arabic here')).toBe(false);
  });

  it('gives a word of a joining script no letter-spacing', () => {
    expect(wordLetterSpacing('كتاب', 1.5)).toBe(0);
    expect(wordLetterSpacing('book', 1.5)).toBe(1.5);
  });
});

describe('hyphenation', () => {
  it('is off by default in Arabic, Persian and Hebrew documents, as in CJK ones', () => {
    for (const tag of ['ar', 'ar-EG', 'fa', 'he', 'zh', 'ja']) {
      expect(resolveBodyTextConfig({}, tag).hyphenation.enabled).toBe(false);
    }
    expect(resolveBodyTextConfig({}, 'en').hyphenation.enabled).toBe(true);
  });

  it('stays off when switched on with an Arabic locale, and says so once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resolveBodyTextConfig({ hyphenation: { enabled: true } }, 'ar-SA').hyphenation.enabled).toBe(false);
    resolveBodyTextConfig({ hyphenation: { enabled: true } }, 'ar-SA');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('runs for the Latin words of an Arabic book when a pattern language is named', () => {
    expect(resolveBodyTextConfig({ hyphenation: { enabled: true, locale: 'en-us' } }, 'ar').hyphenation.enabled).toBe(true);
  });

  it('leaves every word of a joining script whole, in any document', () => {
    const out = hyphenateText('internationalization المستشفيات', 'en-us');
    const [latin, arabic] = out.split(' ');
    expect(latin).toContain('­');
    expect(arabic).toBe('المستشفيات');
  });

  it('never breaks an Arabic word at a soft hyphen typed in it (both paths)', () => {
    const text = 'AAA المست­شفيات BBB';
    for (const measured of [
      measureBlock(text, FONT, 60, 20, { hyphenate: true }),
      measureRichBlock([span(text)], FONT, FONT, FONT, FONT, 60, 20, { hyphenate: true }),
    ]) {
      const texts = measured.lines.map((l) => l.text);
      expect(texts).toContain('المستشفيات');
      expect(measured.lines.every((l) => !l.hyphenated)).toBe(true);
    }
  });
});

describe('a word wider than its line', () => {
  const WORD = 'المستشفيات';
  const whole = stubWidth(WORD);

  for (const [path, measure] of [
    ['plain', () => measureBlock(`AAA ${WORD} BBB`, FONT, 40, 20, { textAlign: 'justify', optimal: true })],
    ['rich', () => measureRichBlock([span('AAA '), span(WORD, true), span(' BBB')], FONT, BOLD, FONT, FONT, 40, 20, { textAlign: 'justify', optimal: true })],
    ['rich, ragged', () => measureRichBlock([span(`AAA ${WORD} BBB`)], FONT, FONT, FONT, FONT, 40, 20, { hyphenate: true })],
  ] as const) {
    it(`${path}: runs past the measure whole, with no hyphen, and the line says so`, () => {
      const lines = measure().lines;
      const line = lines.find((l) => l.text.includes('ستش'))!;
      expect(line.text).toBe(WORD);
      expect(line.hyphenated).toBe(false);
      expect(line.wordOverflow).toBe(true);
      expect(textSegs(line)[0]!.width).toBe(whole);
      expect(lines.filter((l) => l.wordOverflow)).toHaveLength(1);
    });
  }

  it('a Latin word stays divided as before, and no line is flagged', () => {
    const lines = measureRichBlock([span('AAA internationalization BBB')], FONT, FONT, FONT, FONT, 40, 20).lines;
    expect(lines.some((l) => l.hyphenated)).toBe(true);
    expect(lines.some((l) => l.wordOverflow)).toBe(false);
  });

  it('the emergency cut parts a glued Latin–Arabic run where the scripts meet, with no hyphen', () => {
    const token = { text: 'ABCDEFGHكتاب', bold: false, italic: false, kind: 'text' as const, width: stubWidth('ABCDEFGHكتاب') };
    const split = emergencySplit(token, FONT, 0, 60)!;
    expect(split.head.text).toBe('ABCDEFGH');
    expect(split.tail.text).toBe('كتاب');
    expect(emergencySplit({ ...token, text: WORD, width: whole }, FONT, 0, 30)).toBeNull();
  });
});

describe('tracking', () => {
  it('a style\'s letter-spacing reaches the Latin words and the spaces, never an Arabic word', () => {
    const [line] = measureRichBlock([span('book كتاب')], FONT, FONT, FONT, FONT, 400, 20, { letterSpacingPx: 1 }).lines;
    const [latin, arabic] = textSegs(line!);
    expect(latin!.width).toBe(28 + 4);
    expect(arabic!.width).toBe(stubWidth('كتاب'));
  });

  it('justification tracking counts no Arabic letter (both paths)', () => {
    const text = 'كتاب جميل جدا كبير';
    const opts = { textAlign: 'justify' as const, optimal: true, maxStretchRatio: 1.2, minShrinkRatio: 0.9, justifyTrackingPx: 1 };
    for (const measured of [
      measureBlock(text, FONT, 75, 20, opts),
      measureRichBlock([span(text)], FONT, FONT, FONT, FONT, 75, 20, opts),
    ]) {
      for (const line of measured.lines) {
        expect(line.letterSpacing).toBeUndefined();
        for (const seg of textSegs(line)) expect(seg.width).toBe(stubWidth(seg.text));
      }
    }
  });

  it('a mixed line tracks its Latin words only', () => {
    // 72 px: "aaaaa كتاب" is 66 px with one space that stretches 1.4 px;
    // the five Latin letters take the other 4.6 px (0.92 px each).
    const opts = { textAlign: 'justify' as const, optimal: true, maxStretchRatio: 1.2, minShrinkRatio: 0.9, justifyTrackingPx: 1 };
    const measured = measureRichBlock([span('aaaaa كتاب bbbbbbbbb')], FONT, FONT, FONT, FONT, 72, 20, opts);
    const first = measured.lines[0]!;
    expect(first.letterSpacing).toBeCloseTo(0.92, 6);
    const arabic = textSegs(first).find((s) => joiningScriptIn(s.text))!;
    expect(arabic.width).toBe(stubWidth('كتاب'));
    const latin = textSegs(first).find((s) => s.text === 'aaaaa')!;
    expect(latin.width).toBeCloseTo(35 + 5 * first.letterSpacing!, 6);
  });
});

describe('a style change inside an Arabic word', () => {
  it('keeps the word one segment, measured whole, with its styled runs', () => {
    const [line] = measureRichBlock([span('AAA كتا'), span('ب', true), span(' BBB')], FONT, BOLD, FONT, FONT, 400, 20).lines;
    const segs = textSegs(line!);
    expect(segs.map((s) => s.text)).toEqual(['AAA', 'كتاب', 'BBB']);
    const word = segs[1]!;
    expect(word.width).toBe(stubWidth('كتاب'));
    expect(word.bold).toBeUndefined();
    expect(word.runs).toEqual([{ text: 'كتا' }, { text: 'ب', bold: true }]);
  });

  it('joins a coloured vowel sign to its word, and leaves runs that do not join apart', () => {
    const [joined] = measureRichBlock([span('كَ', true), span('تب')], FONT, BOLD, FONT, FONT, 400, 20).lines;
    expect(textSegs(joined!).map((s) => s.text)).toEqual(['كَتب']);
    // A Latin word set in two styles stays two runs, as before.
    const [latin] = measureRichBlock([span('wor'), span('d', true)], FONT, BOLD, FONT, FONT, 400, 20).lines;
    expect(textSegs(latin!).map((s) => s.text)).toEqual(['wor', 'd']);
    expect(textSegs(latin!).some((s) => s.runs)).toBe(false);
  });

  it('keeps a word whole around a styled vowel sign between two letters (ب**َ**يت)', () => {
    for (const direction of [undefined, 'rtl'] as const) {
      const [line] = measureRichBlock([span('ب'), span('َ', true), span('يت جميل')], FONT, BOLD, FONT, FONT, 400, 20, direction ? { direction } : {}).lines;
      const segs = textSegs(line!);
      expect(segs.map((s) => s.text)).toEqual(['بَيت', 'جميل']);
      expect(segs[0]!.runs).toEqual([{ text: 'ب' }, { text: 'َ', bold: true }, { text: 'يت' }]);
      expect(segs[0]!.width).toBe(stubWidth('بَيت'));
    }
  });

  it('keeps a word whole across several style changes, marks and letters', () => {
    const [line] = measureRichBlock([span('ك'), span('ِ', true), span('ت'), span('َ', true), span('اب')], FONT, BOLD, FONT, FONT, 400, 20).lines;
    const segs = textSegs(line!);
    expect(segs.map((s) => s.text)).toEqual(['كِتَاب']);
    expect(segs[0]!.runs!.map((r) => r.text)).toEqual(['ك', 'ِ', 'ت', 'َ', 'اب']);
  });

  it('a styled mark before a space or a Latin word joins only its own word', () => {
    const [line] = measureRichBlock([span('بي'), span('ِ', true), span(' AAA')], FONT, BOLD, FONT, FONT, 400, 20).lines;
    expect(textSegs(line!).map((s) => s.text)).toEqual(['بيِ', 'AAA']);
  });
});

describe('the canvas', () => {
  /** A context that records each `fillText` with its letter-spacing and
   *  whether a clip is in force. */
  function recordingCtx(): { ctx: CanvasRenderingContext2D; calls: { text: string; spacing: string; clipped: boolean; font: string }[] } {
    const calls: { text: string; spacing: string; clipped: boolean; font: string }[] = [];
    const state = { font: '', fillStyle: '', letterSpacing: '0px', textBaseline: 'alphabetic', direction: 'ltr', textAlign: 'start' };
    const stack: { s: typeof state; clip: boolean }[] = [];
    let clip = false;
    const ctx = {
      ...state,
      measureText: (s: string) => ({ width: stubWidth(s) }),
      fillText(text: string) { calls.push({ text, spacing: this.letterSpacing, clipped: clip, font: this.font }); },
      save() { stack.push({ s: { ...state, font: this.font, fillStyle: this.fillStyle, letterSpacing: this.letterSpacing }, clip }); },
      restore() { const top = stack.pop()!; Object.assign(this, top.s); clip = top.clip; },
      beginPath() {}, rect() {}, clip() { clip = true; }, translate() {}, scale() {},
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  }

  const block = (lines: VDTLine[], extra: Partial<VDTBlock> = {}): VDTBlock => ({
    id: 'b', type: 'paragraph', bbox: { x: 0, y: 0, width: 400, height: 20 }, lines,
    fontString: FONT, boldFontString: BOLD, color: '#000', textAlign: 'left', pageIndex: 0, columnIndex: 0,
    ...extra,
  } as VDTBlock);

  it('paints an Arabic word untracked on a tracked line', () => {
    const { ctx, calls } = recordingCtx();
    const lines = measureRichBlock([span('book كتاب')], FONT, FONT, FONT, FONT, 400, 20, { letterSpacingPx: 1 }).lines;
    renderBlock(ctx, block(lines, { letterSpacing: 1 }), 400, 0);
    expect(calls.find((c) => c.text === 'book')!.spacing).toBe('1px');
    expect(calls.find((c) => c.text === 'كتاب')!.spacing).toBe('0px');
  });

  it('paints a word in two styles whole, then its other run clipped', () => {
    const { ctx, calls } = recordingCtx();
    const lines = measureRichBlock([span('كتا'), span('ب', true)], FONT, BOLD, FONT, FONT, 400, 20).lines;
    renderBlock(ctx, block(lines), 400, 0);
    const painted = calls.filter((c) => c.text === 'كتاب');
    expect(painted).toHaveLength(2);
    expect(painted[0]).toMatchObject({ clipped: false, font: FONT });
    expect(painted[1]).toMatchObject({ clipped: true, font: BOLD });
  });

  it('turns a run\'s clip over with the word on a mirrored page', () => {
    const rects: number[][] = [];
    const ctx = {
      font: FONT, fillStyle: '', direction: 'ltr', textAlign: 'start',
      measureText: (t: string) => ({ width: stubWidth(t) }),
      fillText() {}, save() {}, restore() {}, beginPath() {}, clip() {}, translate() {}, scale() {}, transform() {},
      rect(x: number, _y: number, w: number) { rects.push([x, x + w]); },
    } as unknown as CanvasRenderingContext2D;
    const seg = { kind: 'text' as const, text: 'كتاب', width: stubWidth('كتاب'), rtl: true as const, runs: [{ text: 'كتا' }, { text: 'ب', bold: true }] };
    const style = () => ({ font: BOLD, fill: '#f00' });
    const paint = (t: string, x: number, y: number) => ctx.fillText(t, x, y);
    paintWordRuns(ctx, seg, 100, 50, paint, style);
    const end = beginMirroredFlow(ctx, 400);
    paintWordRuns(ctx, seg, 100, 50, paint, style);
    end();
    const [plain, mirrored] = rects;
    // The last letter of a right-to-left word is at its left end, and at
    // its right end once the word is turned back on a mirrored page.
    const w = seg.width;
    expect(plain![0]).toBeCloseTo(100, 6);
    expect(mirrored![0]).toBeCloseTo(2 * 100 + w - plain![1]!, 6);
    expect(mirrored![1]).toBeCloseTo(100 + w, 6);
  });
});

describe('warnings', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const config = (extra: PostextConfig = {}): PostextConfig => ({
    page: { dpi: 72, width: pt(200), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    ...extra,
  });

  it('reports an Arabic word wider than its column', () => {
    const doc = buildDocument({ markdown: `AAA ${'المستشفيات'.repeat(4)} BBB` }, config());
    const w = doc.contentWarnings?.find((x) => x.kind === 'unbreakableWordOverflow');
    expect(w).toBeDefined();
    expect(w!.pageIndex).toBe(0);
    expect(formatWarning(w!)).toContain('never divided');
  });

  it('reports a heading style whose letter-spacing Arabic words do not take', () => {
    const doc = buildDocument({ markdown: '# الفصل الأول\n\nنص.' }, config({ headings: { levels: [{ level: 1, letterSpacing: pt(2), breakBefore: { enabled: false } }] } }));
    const w = doc.contentWarnings?.filter((x) => x.kind === 'joiningScriptLetterSpacing') ?? [];
    expect(w).toHaveLength(1);
    expect(formatWarning(w[0]!)).toContain('letter-spacing');
    // A Latin heading with the same style raises none.
    const latin = buildDocument({ markdown: '# Chapter One\n\nText.' }, config({ headings: { levels: [{ level: 1, letterSpacing: pt(2), breakBefore: { enabled: false } }] } }));
    expect(latin.contentWarnings?.some((x) => x.kind === 'joiningScriptLetterSpacing') ?? false).toBe(false);
  });

  it('raises neither on a document without Arabic', () => {
    const doc = buildDocument({ markdown: 'Some plain text with a supercalifragilisticexpialidocious word.' }, config());
    expect(doc.contentWarnings?.some((x) => x.kind === 'unbreakableWordOverflow' || x.kind === 'joiningScriptLetterSpacing') ?? false).toBe(false);
  });
});
