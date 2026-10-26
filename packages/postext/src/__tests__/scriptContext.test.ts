import { describe, it, expect, beforeEach } from 'vitest';
import { renderPageToCanvas } from '../canvas-backend/index.js';
import { beginMirroredFlow } from '../canvas-backend/mirrorFrame.js';
import { fillScriptWord } from '../canvas-backend/scriptText.js';
import { renderToHtml } from '../html-backend/html-backend.js';
import { buildDocument } from '../pipeline/index.js';
import { clearMeasurementCache } from '../measure/index.js';
import { measureBlock } from '../measure/plain.js';
import { measureRichBlock } from '../measure/rich.js';
import { cutDoubledMarks, faceReadsScript, hanMarksOfLocale, isDoubledMark, isLetterless, pieceScriptContext, resolveScriptContext, scriptAt, scriptMark, scriptTextWidth, setMeasureScriptContext, withScriptMark, wordPieceScript } from '../measure/script.js';
import { measureTextWidth } from '../measure/canvas.js';
import { spanIsolates } from '../writing/bidi.js';
import { parseInlineFormatting } from '../parse/inlineFormatting.js';
import type { PostextConfig } from '../types.js';
import type { VDTBlock, VDTDocument, VDTLineSegment } from '../vdt.js';
import { setSlashBreaks } from '../measure/breakRules.js';

// #725: a word with no letter (`46.`, `1367)`) has no script of its own. A
// face may draw its punctuation by script (Amiri: a Latin full stop and
// brackets under `latn`, Arabic ones otherwise, of other widths), and each
// shaper handed such a word alone picks one by a rule of its own. Chrome
// 131's canvas took the font's default forms, Chrome 154's the Latin ones,
// so a document broke its lines otherwise from one to the other. The
// layout now gives the word the script of the text around it and every
// stage shapes it in that script.

const NBSP = '\u00A0';
const ELLIPSIS = '\u2026';
const EM_DASH = '\u2014';
const HAN_MARK = '\u4E00';
const BEH = '\u0628';
const VERSE_SIGN = '\u060E';

/** How each character is drawn: by its own script, or by the script of
 *  the run it stands in when it has none. */
type Script = 'Latn' | 'Arab' | 'Grek' | 'Cyrl' | 'Hebr' | 'Hani';
function ownScript(ch: string): Script | undefined {
  if (/\p{Script=Han}/u.test(ch)) return 'Hani';
  if (/\p{Script=Latin}/u.test(ch)) return 'Latn';
  if (/\p{Script=Arabic}/u.test(ch)) return 'Arab';
  if (/\p{Script=Greek}/u.test(ch)) return 'Grek';
  if (/\p{Script=Cyrillic}/u.test(ch)) return 'Cyrl';
  if (/\p{Script=Hebrew}/u.test(ch)) return 'Hebr';
  return undefined;
}
/** Advances in a face like Amiri, in ems: the Latin forms of the full
 *  stop, the brackets and the guillemets are another width than the
 *  default ones. A face named `Plain` draws them one way. */
function advance(ch: string, script: Script | 'DFLT', sensitive: boolean, hebrewUnkerned = false, song = false): number {
  const latin = !sensitive || script === 'Latn';
  if (ch === ' ' || ch === NBSP) return 0.25;
  // A face like Noto Serif SC (`Song`): its digits are proportional and
  // its ellipsis three dots on the baseline under a Western script, half
  // an em and a full em of centred dots otherwise (measured: 0.55 against
  // 0.47 em, 0.9 against 1 em).
  if (song) {
    const western = script === 'Latn' || script === 'Grek' || script === 'Cyrl';
    if (isDigit(ch)) return western ? 0.55 : 0.47;
    if (ch === ELLIPSIS) return western ? 0.9 : 1;
    if (ch === EM_DASH || ownScript(ch) === 'Hani') return 1;
    if (ch === '.' || ch === '/' || ch === ':' || ch === '-') return 0.3;
    return 0.5;
  }
  // A kerned Latin face: a shaper applies no kerning in a Hebrew run of a
  // face with no Hebrew positioning, so its marks come out wider there.
  if (hebrewUnkerned && script === 'Hebr' && ch === ',') return 0.23;
  if (ch === '.') return latin ? 0.2 : 0.3;
  if (ch === '(' || ch === ')' || ch === '[' || ch === ']') return latin ? 0.25 : 0.45;
  if (ch === '\u00AB' || ch === '\u00BB') return latin ? 0.47 : 0.41;
  if (ch === ',') return 0.2;
  return 0.5;
}
const isRtlLetter = (ch: string): boolean => /[\u0590-\u08FF]/.test(ch) && /\p{L}/u.test(ch);
const isLtrLetter = (ch: string): boolean => /\p{L}/u.test(ch) && !isRtlLetter(ch);
const isDigit = (ch: string): boolean => /[0-9]/.test(ch);

/** The browser whose canvas is measured and painted on: 131 reads the
 *  script of a word from all of it and sets a word with no letter in the
 *  font's default forms; 154 reads each bidi run alone and sets one with
 *  no letter in Latin forms. Both shape the words of a text one by one. */
let chrome: 131 | 154 = 154;

function shapedWidth(text: string, font: string, direction: string): number {
  const size = parseFloat(/(\d*\.?\d+)px/.exec(font)?.[1] ?? '10');
  const sensitive = !font.includes('Plain');
  let width = 0;
  for (const word of text.split(/( )/)) {
    if (word === '') continue;
    const chars = [...word];
    // The runs a version itemises on its own.
    const units: string[][] = [];
    if (chrome === 131) units.push(chars);
    else {
      const rtl = direction === 'rtl';
      const side = (ch: string): string => (rtl ? (isLtrLetter(ch) || isDigit(ch) ? 'l' : 'r') : isRtlLetter(ch) ? 'r' : 'l');
      for (const ch of chars) {
        const last = units[units.length - 1];
        if (last && side(last[0]!) === side(ch)) last.push(ch);
        else units.push([ch]);
      }
    }
    for (const unit of units) {
      // A face like Markazi Text kerns a stop to the guillemet after it
      // in a run set right to left (measured: 4.9 thousandths of the em).
      if (font.includes('Markazi') && unitIsRtl(unit, direction)) width -= stopGuillemetPairs(unit) * 0.049 * size;
      const first = unit.map(ownScript).find((s) => s !== undefined);
      let script: Script | 'DFLT' = first ?? (chrome === 131 ? 'DFLT' : 'Latn');
      for (const ch of unit) {
        script = ownScript(ch) ?? script;
        // A current Chrome gives a run with no letter Latin forms, but
        // leaves an ellipsis in it as the face draws it by default.
        const drawn = first === undefined && chrome === 154 && ch === ELLIPSIS ? 'DFLT' : script;
        width += advance(ch, drawn, sensitive, font.includes('Kerned'), font.includes('Song')) * size;
      }
    }
  }
  return width;
}

/** Whether a run the browser itemised is set right to left: on a current
 *  Chrome by the side its characters fell on, on Chrome 131 (a word is one
 *  run there) when it holds a right-to-left letter or its context is one. */
function unitIsRtl(unit: string[], direction: string): boolean {
  if (chrome === 131) return direction === 'rtl' || unit.some(isRtlLetter);
  const ch = unit[0]!;
  return direction === 'rtl' ? !(isLtrLetter(ch) || isDigit(ch)) : isRtlLetter(ch);
}
function stopGuillemetPairs(unit: string[]): number {
  let pairs = 0;
  for (let i = 0; i + 1 < unit.length; i++) if (unit[i] === '.' && unit[i + 1] === '\u00BB') pairs++;
  return pairs;
}

class BrowserCtx {
  font = '10px Body';
  direction = 'ltr';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    return { width: shapedWidth(s, this.font, this.direction) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): BrowserCtx {
    return new BrowserCtx();
  }
};
function on(version: 131 | 154): void {
  chrome = version;
  clearMeasurementCache();
}
beforeEach(() => {
  on(154);
  setMeasureScriptContext({ enabled: true, script: 'Latn' });
});

const AMIRI = '10px Amiri';
const PLAIN = '10px Plain';

describe('a word with no letter (#725)', () => {
  it('is one of digits, punctuation or symbols alone', () => {
    for (const word of ['46.', '1367)', '\u00BB.', '(', '2016).', '3.14', '\u2014', '12\u00A0000']) expect(isLetterless(word)).toBe(true);
    for (const word of ['a.', '(d.', '\u0661', BEH, 'n\u00BA', '']) expect(isLetterless(word)).toBe(false);
  });

  it('alone, it is measured otherwise by each browser in a face that draws punctuation by script', () => {
    on(131);
    expect(measureTextWidth('46.', AMIRI)).toBeCloseTo(13, 6);
    expect(measureTextWidth('46.', PLAIN)).toBeCloseTo(12, 6);
    on(154);
    expect(measureTextWidth('46.', AMIRI)).toBeCloseTo(12, 6);
  });

  it('beside its mark it is measured the same by both, in each script and direction', () => {
    for (const version of [131, 154] as const) {
      on(version);
      expect(faceReadsScript(AMIRI)).toBe(true);
      expect(faceReadsScript(PLAIN)).toBe(false);
      expect(scriptTextWidth('46.', AMIRI, 'Latn', false)).toBeCloseTo(12, 6);
      expect(scriptTextWidth('1367)', AMIRI, 'Latn', false)).toBeCloseTo(22.5, 6);
      // Arabic forms, painted left to right (a number in an Arabic sentence)…
      expect(scriptTextWidth('3.14', AMIRI, 'Arab', false)).toBeCloseTo(18, 6);
      // …and right to left (its brackets).
      expect(scriptTextWidth('(', AMIRI, 'Arab', true)).toBeCloseTo(4.5, 6);
      expect(scriptTextWidth(').', AMIRI, 'Arab', true)).toBeCloseTo(7.5, 6);
      // A script the face has no forms for takes its default ones.
      expect(scriptTextWidth('46.', AMIRI, 'Grek', false)).toBeCloseTo(13, 6);
      expect(scriptTextWidth('46.', AMIRI, 'Hebr', false)).toBeCloseTo(13, 6);
      expect(scriptTextWidth(')', AMIRI, 'Hebr', true)).toBeCloseTo(4.5, 6);
    }
  });

  it('a letter after a left-to-right word would not do on a current browser: the mark is a sign of the script with no direction', () => {
    expect(scriptMark('Latn', false)).toEqual({ lead: '', trail: `${NBSP}n` });
    expect(scriptMark('Arab', false)).toEqual({ lead: '', trail: `${NBSP}${VERSE_SIGN}` });
    expect(scriptMark('Arab', true)).toEqual({ lead: `${BEH}${NBSP}`, trail: '' });
    expect(scriptMark('Hebr', true)).toEqual({ lead: `\u05D0${NBSP}`, trail: '' });
    expect(withScriptMark('46.', 'Latn', false)).toBe(`46.${NBSP}n`);
    // An Arabic letter opens a right-to-left run, which Chrome 154 shapes
    // apart from the number before it.
    on(154);
    const ctx = new BrowserCtx();
    ctx.font = AMIRI;
    expect(ctx.measureText(`3.14${BEH}`).width - ctx.measureText(BEH).width).toBeCloseTo(17, 6);
    expect(ctx.measureText(`3.14${NBSP}${VERSE_SIGN}`).width - ctx.measureText(`${NBSP}${VERSE_SIGN}`).width).toBeCloseTo(18, 6);
  });
});

describe('the script of a word with no letter (#725)', () => {
  type Fallback = Parameters<typeof resolveScriptContext>[5];
  const at = (text: string, word: string, odd = false, isolates: Parameters<typeof resolveScriptContext>[4] = [], ...fallback: [Fallback?]) => {
    const start = text.indexOf(word);
    return resolveScriptContext(text, start, start + word.length, odd, isolates, fallback.length > 0 ? fallback[0] : 'Latn');
  };

  it('the recipes: a Latin note set in an Arabic face', () => {
    expect(at('in bayts 12, 16 and 46. The', '46.')).toBe('Latn');
    expect(at('a mark between \u00AB \u00BB. The', '\u00BB.')).toBe('Latn');
    expect(at('a mark between \u00AB \u00BB. The', '\u00AB')).toBe('Latn');
    expect(at('al-Maqrizi (d. 1367) wrote', '1367)')).toBe('Latn');
    expect(at('W3C, Layout Requirements (W3C, 2016).', '2016).')).toBe('Latn');
  });

  it('an Arabic sentence: the number and its brackets in Arabic forms', () => {
    const text = '\u062A\u0648\u0641\u064A (1367) \u0647\u0646\u0627';
    expect(at(text, '1367')).toBe('Arab');
    expect(at(text, '(', true)).toBe('Arab');
    expect(at(text, ')', true)).toBe('Arab');
  });

  it('a word that opens its text takes the script of the letter after it', () => {
    expect(at('1367) was the year', '1367)')).toBe('Latn');
    expect(at(`(1) ${BEH}${BEH}`, '(1)')).toBe('Arab');
  });

  it('a word in an isolate reads the isolate, not the text around it', () => {
    // An English title set as a left-to-right isolate in an Arabic sentence.
    const text = `${BEH}${BEH} Moby Dick (1851) ${BEH}${BEH}`;
    const iso = [{ start: 3, end: 19, direction: 'ltr' as const }];
    expect(text.slice(3, 19)).toBe('Moby Dick (1851)');
    expect(at(text, '(1851)', false, iso)).toBe('Latn');
    // The same number with nothing but itself in its isolate: the
    // document's language decides.
    const alone = `${BEH}${BEH} (1851) ${BEH}${BEH}`;
    expect(at(alone, '(1851)', false, [{ start: 3, end: 9, direction: 'ltr' }], 'Arab')).toBe('Arab');
    expect(at(alone, '(1851)', false, [{ start: 3, end: 9, direction: 'ltr' }], 'Latn')).toBe('Latn');
    // And the isolates of real spans.
    const spans = parseInlineFormatting(`${BEH}${BEH} :ltr[Moby Dick (1851)] ${BEH}`);
    const joined = spans.map((s) => s.text).join('');
    const ranges = spanIsolates(spans);
    expect(ranges).toHaveLength(1);
    expect(resolveScriptContext(joined, joined.indexOf('(1851)'), joined.indexOf('(1851)') + 6, false, ranges, 'Arab')).toBe('Latn');
  });

  it('a word that ends a Latin phrase in a right-to-left paragraph: its number Latin, its stop Arabic', () => {
    // The stop takes the paragraph's direction (level 1): the layout cuts
    // the word there, and each piece is asked on its own.
    const text = `${BEH}${BEH} see 46.`;
    expect(at(text, '46')).toBe('Latn');
    expect(resolveScriptContext(text, text.length - 1, text.length, true, [], 'Arab')).toBe('Arab');
  });

  it('a word painted right to left takes a right-to-left script only', () => {
    expect(at('abc ( def', '(', true, [], 'Latn')).toBeUndefined();
    expect(at('abc ( def', '(', true, [], 'Arab')).toBe('Arab');
    expect(at(`abc ( \u05D0\u05D1`, '(', true)).toBe('Hebr');
  });

  it('a paragraph with no letter takes the script of the document\'s language, or none', () => {
    expect(at('1367)', '1367)', false, [], 'Latn')).toBe('Latn');
    expect(at('1367)', '1367)', false, [], 'Arab')).toBe('Arab');
    expect(at('1367)', '1367)', false, [], undefined)).toBeUndefined();
  });

  it('beside a script the engine does not act on, the word is left alone', () => {
    expect(at('\u7EA2\u697C 1367) \u68A6', '1367)')).toBeUndefined();
    expect(at('\u0E01\u0E02 46.', '46.')).toBeUndefined();
  });
});

const pt = (value: number) => ({ value, unit: 'pt' as const });
// 72 dpi: 1 pt = 1 px.
const config = (family: string, extra: PostextConfig = {}): PostextConfig => ({
  page: { width: pt(190), height: pt(600), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  ...extra,
  bodyText: { fontFamily: family, fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), textAlign: 'left', hyphenation: { enabled: false }, ...extra.bodyText },
});
const NOTE = 'In bayts 12, 16 and 46. The mark stands between \u00AB \u00BB. He died (d. 1367) and the work (W3C, 2016). So it ends.';
const paragraph = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'paragraph')!;
const segmentsOf = (doc: VDTDocument): VDTLineSegment[] => paragraph(doc).lines.flatMap((l) => l.segments ?? []);
const layout = (doc: VDTDocument): unknown => JSON.parse(JSON.stringify(paragraph(doc).lines.map((l) => ({ text: l.text, width: l.bbox.width, segments: l.segments }))));
const build = (markdown: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown }, cfg);

describe('a Latin note set in a face that draws punctuation by script (#725)', () => {
  it('breaks its lines the same on Chrome 131 and on a current Chrome', () => {
    on(131);
    const old = build(NOTE, config('Amiri'));
    on(154);
    const current = build(NOTE, config('Amiri'));
    expect(layout(current)).toEqual(layout(old));
    expect(paragraph(current).lines.length).toBeGreaterThan(2);
    // Each word with no letter in its Latin forms, at their width.
    const words = Object.fromEntries(segmentsOf(current).filter((s) => s.scriptContext).map((s) => [s.text, [s.scriptContext, +s.width.toFixed(4)]]));
    expect(words).toEqual({
      '12,': ['Latn', 12],
      '16': ['Latn', 10],
      '46.': ['Latn', 12],
      '\u00AB': ['Latn', 4.7],
      '\u00BB.': ['Latn', 6.7],
      '1367)': ['Latn', 22.5],
      '2016).': ['Latn', 24.5],
    });
    // No other segment says anything.
    expect(segmentsOf(current).filter((s) => !s.scriptContext && s.kind === 'text').every((s) => /\p{L}/u.test(s.text))).toBe(true);
  });

  it('with the rule off, each browser measures them its own way and the lines differ', () => {
    const off = config('Amiri', { bodyText: { scriptContext: false } });
    on(131);
    const old = build(NOTE, off);
    on(154);
    const current = build(NOTE, off);
    expect(segmentsOf(old).some((s) => s.scriptContext)).toBe(false);
    expect(segmentsOf(current).some((s) => s.scriptContext)).toBe(false);
    const width = (doc: VDTDocument, text: string): number => segmentsOf(doc).find((s) => s.text === text)!.width;
    expect(width(old, '46.')).toBeCloseTo(13, 6);
    expect(width(current, '46.')).toBeCloseTo(12, 6);
    expect(width(old, '1367)')).toBeCloseTo(24.5, 6);
    expect(width(current, '1367)')).toBeCloseTo(22.5, 6);
    expect(layout(current)).not.toEqual(layout(old));
    // On a current Chrome the rule gives what that browser gave alone.
    const bare = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (key, v: unknown) => (key === 'scriptContext' ? undefined : v)));
    expect(bare(layout(build(NOTE, config('Amiri'))))).toEqual(layout(current));
  });

  it('a face that draws them one way under every script is laid out as before, with no field', () => {
    for (const version of [131, 154] as const) {
      on(version);
      const doc = build(NOTE, config('Plain'));
      expect(segmentsOf(doc).some((s) => 'scriptContext' in s)).toBe(false);
      expect(layout(doc)).toEqual(layout(build(NOTE, config('Plain', { bodyText: { scriptContext: false } }))));
    }
  });

  it('a kerned Latin face, wider in a Hebrew run alone, is not taken for one that draws marks by script', () => {
    const KERNED = '10px Plain Kerned';
    const ctx = new BrowserCtx();
    ctx.font = KERNED;
    // Beside the Hebrew mark the comma is 0.3 px wider (the marks are as
    // wide as each other here)…
    expect(ctx.measureText(`12,${NBSP}\uFB29`).width - ctx.measureText(`12,${NBSP}n`).width).toBeCloseTo(0.3, 6);
    // …and the face is still left alone.
    expect(faceReadsScript(KERNED)).toBe(false);
    const doc = build(NOTE, config('Plain Kerned'));
    expect(segmentsOf(doc).some((s) => 'scriptContext' in s)).toBe(false);
  });

  it('a paragraph with no formatting goes to the word-by-word breaker only when it holds such a word in such a face', () => {
    const opts = { textAlign: 'left' as const };
    // Pretext's lines carry no segments in this path; the breaker's do.
    const withWord = measureBlock('It ends in 46. Then.', AMIRI, 400, 14, opts);
    expect(withWord.lines[0]!.segments?.find((s) => s.text === '46.')?.scriptContext).toBe('Latn');
    const none = measureBlock('It ends in forty. Then.', AMIRI, 400, 14, opts);
    expect((none.lines[0]!.segments ?? []).some((s) => s.scriptContext)).toBe(false);
    const plain = measureBlock('It ends in 46. Then.', PLAIN, 400, 14, opts);
    expect((plain.lines[0]!.segments ?? []).some((s) => s.scriptContext)).toBe(false);
    setMeasureScriptContext({ enabled: false });
    const off = measureBlock('It ends in 46. Then.', AMIRI, 400, 14, opts);
    expect((off.lines[0]!.segments ?? []).some((s) => s.scriptContext)).toBe(false);
  });
});

const AR = '\u062A\u0648\u0641\u064A';
const RTL = (extra: PostextConfig = {}): PostextConfig => config('Amiri', { direction: 'rtl', locale: 'ar', ...extra });

describe('an Arabic sentence (#725)', () => {
  it('(1367) keeps its Arabic brackets: three pieces, each in the Arabic script', () => {
    for (const version of [131, 154] as const) {
      on(version);
      const doc = build(`${AR} (1367) ${AR}`, RTL());
      const pieces = segmentsOf(doc).filter((s) => s.scriptContext);
      expect(pieces.map((s) => [s.text, s.scriptContext, s.rtl ?? false, +s.width.toFixed(4)])).toEqual([
        ['(', 'Arab', true, 4.5],
        ['1367', 'Arab', false, 20],
        [')', 'Arab', true, 4.5],
      ]);
    }
  });

  it('a Latin phrase that ends the paragraph: its number Latin, its stop Arabic, the same on both browsers', () => {
    on(131);
    const old = build(`${AR} see 46.`, RTL());
    on(154);
    const current = build(`${AR} see 46.`, RTL());
    expect(layout(current)).toEqual(layout(old));
    expect(segmentsOf(current).filter((s) => s.scriptContext).map((s) => [s.text, s.scriptContext, s.rtl ?? false, +s.width.toFixed(4)])).toEqual([
      ['46', 'Latn', false, 10],
      ['.', 'Arab', true, 3],
    ]);
  });

  it('a paragraph with no letter takes the script of the document\'s language', () => {
    const arabic = build('1367).', RTL());
    expect(segmentsOf(arabic).filter((s) => s.kind === 'text').every((s) => s.scriptContext === 'Arab')).toBe(true);
    const english = build('1367).', config('Amiri'));
    expect(segmentsOf(english).map((s) => [s.text, s.scriptContext])).toEqual([['1367).', 'Latn']]);
  });
});

/** A context that records what is painted, and where its clip stands. */
type Painted = { text: string; x: number; y: number; direction: string; align: string; spacing: number; clip?: [number, number]; flip: number };
function paintingCtx(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; seen: Painted[] } {
  const seen: Painted[] = [];
  const measure = new BrowserCtx();
  const state: Record<string, unknown> = { font: '10px Body', textAlign: 'left', direction: 'ltr', textBaseline: 'alphabetic', letterSpacing: '0px', fillStyle: '' };
  // The transform as far as a mirror goes: x' = a·x + e.
  let a = 1;
  let e = 0;
  let clip: [number, number] | undefined;
  let pending: [number, number] | undefined;
  const stack: { a: number; e: number; clip: typeof clip; state: Record<string, unknown> }[] = [];
  const api: Record<string, unknown> = {
    save() { stack.push({ a, e, clip, state: { ...state } }); },
    restore() {
      const top = stack.pop();
      if (!top) return;
      ({ a, e, clip } = top);
      Object.assign(state, top.state);
    },
    transform(ta: number, _b: number, _c: number, _d: number, te: number) { e += a * te; a *= ta; },
    translate(x: number) { e += a * x; },
    scale(x: number) { a *= x; },
    beginPath() { pending = undefined; },
    rect(x: number, _y: number, w: number) { pending = [x, x + w]; },
    clip() {
      if (!pending) return;
      const [x0, x1] = [a * pending[0] + e, a * pending[1] + e];
      clip = [Math.min(x0, x1), Math.max(x0, x1)];
    },
    measureText(s: string) {
      measure.font = state.font as string;
      measure.direction = state.direction as string;
      return measure.measureText(s);
    },
    fillText(text: string, x: number, y: number) {
      seen.push({ text, x: a * x + e, y, direction: state.direction as string, align: state.textAlign as string, spacing: parseFloat(state.letterSpacing as string) || 0, ...(clip ? { clip } : {}), flip: a });
    },
  };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (typeof key === 'string' && key in api) return api[key];
      if (typeof key === 'string' && key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) {
      if (typeof key === 'string' && key in api) api[key] = value;
      else target[key as string] = value;
      return true;
    },
    has(target, key) { return typeof key === 'string' && (key in api || key in target); },
    deleteProperty() { return true; },
    getOwnPropertyDescriptor() { return undefined; },
  }) as unknown as CanvasRenderingContext2D;
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, ctx, seen };
}
/** The mirror a right-to-left page paints its flow through. */
const mirrorOf = (doc: VDTDocument): unknown => (doc.pages[0]!.flow as { mirror?: unknown } | undefined)?.mirror;
function painted(doc: VDTDocument): Painted[] {
  const { canvas, seen } = paintingCtx();
  renderPageToCanvas(doc.pages[0]!, doc, canvas);
  return seen;
}

describe('a word with no letter on canvas (#725)', () => {
  it('is painted beside its mark, the mark clipped away at the word\'s advance', () => {
    const { ctx, seen } = paintingCtx();
    ctx.font = AMIRI;
    fillScriptWord(ctx, '46.', 'Latn', false, 40, 50, (text, x, y) => ctx.fillText(text, x, y));
    expect(seen).toHaveLength(1);
    const [p] = seen as [Painted];
    expect(p.text).toBe(`46.${NBSP}n`);
    expect([p.x, p.y, p.direction]).toEqual([40, 50, 'ltr']);
    // The word is 12 px wide; the clip ends half a space past it, before
    // the mark's letter (a space further on).
    expect(p.clip![1]).toBeCloseTo(40 + 12 + 1.25, 6);
    expect(p.clip![0]).toBeLessThan(0);
  });

  it('a right-to-left word has its mark before it, which stands on its right', () => {
    const { ctx, seen } = paintingCtx();
    ctx.font = AMIRI;
    ctx.direction = 'rtl';
    fillScriptWord(ctx, ').', 'Arab', true, 40, 50, (text, x, y) => ctx.fillText(text, x, y));
    const [p] = seen as [Painted];
    expect(p.text).toBe(`${BEH}${NBSP}).`);
    expect([p.x, p.direction, p.align]).toEqual([40, 'rtl', 'left']);
    expect(p.clip![1]).toBeCloseTo(40 + 7.5 + 1.25, 6);
  });

  it('inside a mirrored frame the word is turned about its own box, not the box of the word and its mark', () => {
    const { ctx, seen } = paintingCtx();
    ctx.font = AMIRI;
    const end = beginMirroredFlow(ctx, 200);
    // A word with a letter beside it, turned by the frame as always.
    ctx.fillText('and', 20, 50);
    fillScriptWord(ctx, '46.', 'Latn', false, 40, 50, (text, x, y) => ctx.fillText(text, x, y));
    end();
    const [and, word] = seen as [Painted, Painted];
    // "and" is 15 px wide: its box [20, 35] of the flow is [165, 180] on the sheet.
    expect(and.x).toBeCloseTo(165, 6);
    // "46." is 12 px wide: its box [40, 52] is [148, 160] on the sheet, and
    // the text starts there, unmirrored.
    expect(word.text).toBe(`46.${NBSP}n`);
    expect(word.x).toBeCloseTo(148, 6);
    expect(word.flip).toBe(1);
    expect(word.clip![1]).toBeCloseTo(160 + 1.25, 6);
    // Turned about the box of the two it would start a mark's width off.
    expect(word.x).not.toBeCloseTo(200 - 40 - (12 + 7.5), 3);
  });

  it('a page paints each such word in its script, on both browsers', () => {
    for (const version of [131, 154] as const) {
      on(version);
      const doc = build(NOTE, config('Amiri'));
      const texts = painted(doc).map((p) => p.text);
      for (const word of ['12,', '16', '46.', '\u00AB', '\u00BB.', '1367)', '2016).']) {
        expect(texts).toContain(`${word}${NBSP}n`);
        expect(texts).not.toContain(word);
      }
      // Every marked text is clipped half a space past its word.
      const widths: Record<string, number> = { '12,': 12, '16': 10, '46.': 12, '\u00AB': 4.7, '\u00BB.': 6.7, '1367)': 22.5, '2016).': 24.5 };
      for (const p of painted(doc).filter((q) => q.text.endsWith(`${NBSP}n`))) {
        expect(p.clip![1] - p.x).toBeCloseTo(widths[p.text.slice(0, -2)]! + 1.25, 6);
      }
    }
  });

  it('a right-to-left page: the pieces of (1367) where the layout put them, each in the Arabic script', () => {
    const doc = build(`${AR} (1367) ${AR}`, RTL());
    expect(mirrorOf(doc)).toBeDefined();
    const seen = painted(doc);
    const open = seen.find((p) => p.text === `${BEH}${NBSP}(`)!;
    const close = seen.find((p) => p.text === `${BEH}${NBSP})`)!;
    const number = seen.find((p) => p.text === `1367${NBSP}${VERSE_SIGN}`)!;
    expect([open.direction, close.direction, number.direction]).toEqual(['rtl', 'rtl', 'ltr']);
    expect(seen.every((p) => p.flip === 1)).toBe(true);
    // On the sheet the sentence reads from the right: the opening bracket
    // right of the number, the closing one left of it, each 4.5 px wide
    // and the number 20.
    expect(open.x).toBeCloseTo(number.x + 20, 6);
    expect(close.x).toBeCloseTo(number.x - 4.5, 6);
    // And the Arabic words on either side, clear of them by a space.
    const words = seen.filter((p) => p.text === AR).sort((p, q) => p.x - q.x);
    expect(words).toHaveLength(2);
    expect(words[1]!.x).toBeCloseTo(open.x + 4.5 + 2.5, 6);
    expect(close.x).toBeCloseTo(words[0]!.x + 20 + 2.5, 6);
  });

  it('a left-to-right block of a right-to-left page, and a right-to-left one of a left-to-right page', () => {
    // The same Latin note: on a left-to-right page, and as a `dir=ltr`
    // block of a mirrored one. Each word stands the same distance from
    // the start of its line, the line running from the sheet's left.
    const plain = build('It ends in 46. Then.', config('Amiri'));
    const mirrored = build(':::paragraphs{dir=ltr}\nIt ends in 46. Then.\n:::', RTL());
    expect(mirrorOf(mirrored)).toBeDefined();
    // The mirrored page paints its line from the other end: read both
    // from the sheet's left.
    const a = painted(plain).sort((p, q) => p.x - q.x);
    const b = painted(mirrored).sort((p, q) => p.x - q.x);
    expect(b.map((p) => p.text)).toEqual(a.map((p) => p.text));
    expect(b.map((p) => p.text)).toContain(`46.${NBSP}n`);
    const fromStart = (list: Painted[]): number[] => list.map((p) => +(p.x - list[0]!.x).toFixed(6));
    expect(fromStart(b)).toEqual(fromStart(a));
    expect(b.every((p) => p.flip === 1)).toBe(true);
    // And an Arabic block of a left-to-right page: no mirror, the same pieces.
    const quoted = build(`:::paragraphs{dir=rtl}\n${AR} (1367) ${AR}\n:::`, config('Amiri'));
    expect(mirrorOf(quoted)).toBeUndefined();
    const c = painted(quoted);
    const open = c.find((p) => p.text === `${BEH}${NBSP}(`)!;
    const number = c.find((p) => p.text === `1367${NBSP}${VERSE_SIGN}`)!;
    const close = c.find((p) => p.text === `${BEH}${NBSP})`)!;
    expect(open.x).toBeCloseTo(number.x + 20, 6);
    expect(close.x).toBeCloseTo(number.x - 4.5, 6);
  });
});

describe('a word with no letter in HTML (#725)', () => {
  const MARK = (mark: string): string => `<span aria-hidden="true" style="font-size:0;-webkit-user-select:none;user-select:none;">${mark}</span>`;
  /** The text a reader selects and copies: the marks are no part of it. */
  const copied = (html: string): string => html.replace(/<span aria-hidden="true" style="font-size:0;[^>]*>[^<]*<\/span>/g, '').replace(/<[^>]+>/g, '');

  it('holds the mark of its script in a box of no size, after it', () => {
    const html = renderToHtml(build('It ends in 46. Then.', config('Amiri')));
    expect(html).toContain(`>46.${MARK(`${NBSP}n`)}</span>`);
    expect(copied(html)).toContain('It ends in 46. Then.');
    expect(copied(html)).not.toContain(`${NBSP}n`);
  });

  it('a right-to-left word has it before it; the number between the brackets after it', () => {
    const html = renderToHtml(build(`${AR} (1367) ${AR}`, RTL()));
    expect(html).toContain(`>${MARK(`${BEH}${NBSP}`)}(</span>`);
    expect(html).toContain(`>1367${MARK(`${NBSP}${VERSE_SIGN}`)}</span>`);
    expect(html).toContain(`>${MARK(`${BEH}${NBSP}`)})</span>`);
    expect(copied(html)).toContain(`${AR} (1367) ${AR}`);
  });

  it('a face that draws them one way, and a document with the rule off, carry no mark', () => {
    expect(renderToHtml(build(NOTE, config('Plain')))).not.toContain('font-size:0');
    expect(renderToHtml(build(NOTE, config('Amiri', { bodyText: { scriptContext: false } })))).not.toContain('font-size:0');
  });
});

describe('a word with no letter on a tracked line (#725)', () => {
  // Level-2 headings tracked half a point after each letter.
  const tracked = (cfg: PostextConfig): PostextConfig => ({ ...cfg, page: { ...cfg.page!, width: pt(400) }, headings: { fontFamily: 'Amiri', levels: [{ level: 2, letterSpacing: pt(0.5), fontSize: pt(10) }] } });
  const heading = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'heading')!;
  const headingSegments = (doc: VDTDocument): VDTLineSegment[] => heading(doc).lines.flatMap((l) => l.segments ?? []);

  it('in a Latin context it is tracked as any word, the same on both browsers', () => {
    for (const version of [131, 154] as const) {
      on(version);
      const doc = build('## It ends in 46.', tracked(config('Amiri')));
      const seg = headingSegments(doc).find((s) => s.text === '46.')!;
      expect(seg.scriptContext).toBe('Latn');
      // 12 px in its Latin forms and half a point after each character.
      expect(seg.width).toBeCloseTo(12 + 3 * 0.5, 6);
      const word = painted(doc).find((p) => p.text === `46.${NBSP}n`)!;
      expect(word.spacing).toBe(0.5);
    }
  });

  it('in the Arabic script it takes no tracking, as the Arabic words around it take none', () => {
    for (const version of [131, 154] as const) {
      on(version);
      const doc = build(`## ${AR} (1367) ${AR}`, tracked(RTL()));
      expect(heading(doc).letterSpacing ?? heading(doc).lines[0]!.letterSpacing).toBeCloseTo(0.5, 6);
      const pieces = headingSegments(doc).filter((s) => s.scriptContext);
      // Measured with no tracking: a current browser spaces no run of a
      // cursive script, where Chrome 131 did.
      expect(pieces.map((s) => [s.text, s.scriptContext, +s.width.toFixed(4)])).toEqual([['(', 'Arab', 4.5], ['1367', 'Arab', 20], [')', 'Arab', 4.5]]);
      const seen = painted(doc);
      for (const text of [`${BEH}${NBSP}(`, `1367${NBSP}${VERSE_SIGN}`, `${BEH}${NBSP})`]) {
        expect(seen.find((p) => p.text === text)!.spacing, text).toBe(0);
      }
      // And the HTML says so on each of them.
      const html = renderToHtml(doc);
      expect(html.match(/letter-spacing:0;[^"]*"><span aria-hidden="true" style="font-size:0;/g) ?? []).toHaveLength(2);
      expect(html).toMatch(/letter-spacing:0;[^"]*">1367<span aria-hidden="true"/);
    }
  });
});

describe('a right-to-left word with a mark at its edge (#725)', () => {
  // The closing bracket of `(1367\u0645)` goes with the letter before it:
  // one right-to-left word. Measured in a left-to-right context the bracket
  // falls outside the word's run, and a current browser shapes it alone.
  const MEEM = '\u0645';

  it('is measured as it is painted, right to left: the same width on both browsers', () => {
    const widths = (version: 131 | 154, cfg: PostextConfig): number[] => {
      on(version);
      return segmentsOf(build(`${AR} (1367${MEEM}) ${AR}`, cfg)).filter((s) => s.text === `${MEEM})`).map((s) => +s.width.toFixed(4));
    };
    // The letter and the Arabic bracket: 5 + 4.5 px.
    expect(widths(131, RTL())).toEqual([9.5]);
    expect(widths(154, RTL())).toEqual([9.5]);
    // With the rule off a current browser measures the bracket in its
    // Latin form, 2 px narrower than the canvas paints it.
    const off = RTL({ bodyText: { scriptContext: false } });
    expect(widths(131, off)).toEqual([9.5]);
    expect(widths(154, off)).toEqual([7.5]);
  });

  it('carries no field: it is painted as any right-to-left word', () => {
    const seg = segmentsOf(build(`${AR} (1367${MEEM}) ${AR}`, RTL())).find((s) => s.text === `${MEEM})`)!;
    expect(seg.rtl).toBe(true);
    expect('scriptContext' in seg).toBe(false);
    expect('scriptRtl' in seg).toBe(false);
  });
});

describe('the leader of a contents entry (#725)', () => {
  const MD = '# Contents {style="front"}\n\n:::toc\n\n# First\n\nText.\n\n# Second\n\nText.';
  const book = (cfg: PostextConfig): PostextConfig => ({ ...cfg, page: { ...cfg.page!, width: pt(300) }, headingStyles: [{ id: 'front', numbered: false, toc: false }], headings: { fontFamily: 'Amiri' }, toc: { pageNumber: { fontFamily: 'Amiri' } } });
  const leaders = (doc: VDTDocument): VDTLineSegment[] => doc.blocks.filter((b) => b.tocEntry !== undefined).flatMap((b) => b.lines.flatMap((l) => l.segments ?? [])).filter((s) => s.leader === 'text');

  it('is set in the script of the document\'s language: the same dots on both browsers', () => {
    const dots = (version: 131 | 154, cfg: PostextConfig): [string | undefined, number, number][] => {
      on(version);
      return leaders(build(MD, book(cfg))).map((s) => [s.scriptContext, s.text.length, +s.width.toFixed(3)]);
    };
    const latin = dots(131, config('Amiri'));
    expect(latin.length).toBeGreaterThan(0);
    expect(latin.every(([script]) => script === 'Latn')).toBe(true);
    expect(dots(154, config('Amiri'))).toEqual(latin);
    // An Arabic book: the Arabic stop, half as wide again, so fewer dots.
    const arabic = dots(131, RTL());
    expect(arabic.every(([script]) => script === 'Arab')).toBe(true);
    expect(dots(154, RTL())).toEqual(arabic);
    expect(arabic[0]![1]).toBeLessThan(latin[0]![1]);
    // With the rule off each browser counts its own.
    const off = RTL({ bodyText: { scriptContext: false } });
    expect(dots(131, off)[0]![1]).not.toBe(dots(154, off)[0]![1]);
    expect(dots(131, off).every(([script]) => script === undefined)).toBe(true);
  });

  it('a face that draws its stop one way keeps its leader as it was', () => {
    const doc = build(MD, { ...book(config('Plain')), headings: { fontFamily: 'Plain' }, toc: { pageNumber: { fontFamily: 'Plain' } } });
    expect(leaders(doc).length).toBeGreaterThan(0);
    expect(leaders(doc).some((s) => 'scriptContext' in s)).toBe(false);
  });
});

// A word that has a letter is one script run, and each piece it is painted
// in belongs to it. The joints of a DOI or a web address, the hyphen of a
// compound and a cut in a word wider than its line leave pieces with no
// letter (`10.1006/`, `.2001`, `19`), each a text of its own to a
// renderer. Their places are measured inside the word, in its script;
// painted alone they took the browser's pick, and in a face that draws
// digits by script (Noto Serif SC: 0.47 em by default, 0.55 em under
// `latn`) the difference was air after the next piece.
const SONG = '10px Song';
const DOI = 'DOI: [10.1006/ijhc.2001.0458](https://doi.org/10.1006/ijhc.2001.0458) end.';
const chinese = (extra: PostextConfig = {}): PostextConfig => config('Song', { locale: 'zh-Hans', ...extra });
const pieces = (doc: VDTDocument): [string, string | undefined, number][] => segmentsOf(doc).filter((seg) => seg.kind === 'text').map((seg) => [seg.text, seg.scriptContext, +seg.width.toFixed(4)]);

describe('the pieces of a word that has a letter (#725)', () => {
  it('a word of letters and marks has one script for its pieces with no letter: its first letter\'s', () => {
    expect(wordPieceScript('10.1006/ijhc.2001.0458')).toBe('Latn');
    expect(wordPieceScript('COVID-19')).toBe('Latn');
    expect(wordPieceScript(`37${NBSP}\u00B0C`)).toBe('Latn');
    expect(wordPieceScript('\u03B1-2')).toBe('Grek');
    // Letters only, no letter at all, or a script the engine does not act on.
    expect(wordPieceScript('ijhc')).toBeUndefined();
    expect(wordPieceScript('10.1006/')).toBeUndefined();
    expect(wordPieceScript('\u0E01-2')).toBeUndefined();
  });

  it('a piece with no letter takes the script of the letter before it in the word, else the word\'s', () => {
    const word = '10.1006/ijhc.2001.0458';
    expect(pieceScriptContext(word, 0, 8, 'Latn')).toBe('Latn');
    expect(pieceScriptContext(word, 12, 17, 'Latn')).toBe('Latn');
    // A piece with a letter is shaped by its own.
    expect(pieceScriptContext(word, 8, 12, 'Latn')).toBeUndefined();
    expect(pieceScriptContext(word, 0, 12, 'Latn')).toBeUndefined();
    // Two scripts in one word: the nearer letter before the piece.
    expect(pieceScriptContext('ab-\u03B1\u03B2-19', 6, 8, 'Latn')).toBe('Grek');
    expect(scriptAt('ab-\u03B1\u03B2-19', 3, 'Latn')).toBe('Latn');
    // A word with no script for its pieces says nothing of them.
    expect(pieceScriptContext(word, 0, 8, undefined)).toBeUndefined();
  });

  it('a DOI: every piece in its Latin forms, each box the width of its own ink, on both browsers', () => {
    for (const version of [131, 154] as const) {
      on(version);
      expect(faceReadsScript(SONG)).toBe(true);
      expect(pieces(build(DOI, chinese()))).toEqual([
        ['DOI:', undefined, 18],
        // Six digits at 5.5 px, the stop and the stroke at 3.
        ['10.1006/', 'Latn', 39],
        ['ijhc', undefined, 20],
        ['.2001', 'Latn', 25],
        ['.0458', 'Latn', 25],
        ['end.', undefined, 18],
      ]);
    }
  });

  it('with the rule off the lines are what postext 1.27 measured, the first piece alone', () => {
    const off = chinese({ bodyText: { scriptContext: false } });
    on(131);
    // `10.1006/` in the default forms (six digits at 4.7 px), and the
    // 4.8 px it lacks left after `ijhc`.
    expect(pieces(build(DOI, off))).toEqual([
      ['DOI:', undefined, 18],
      ['10.1006/', undefined, 34.2],
      ['ijhc', undefined, 24.8],
      ['.2001', undefined, 25],
      ['.0458', undefined, 25],
      ['end.', undefined, 18],
    ]);
    on(154);
    expect(pieces(build(DOI, off)).map(([text, script, width]) => [text, script, width])).toEqual([
      ['DOI:', undefined, 18],
      ['10.1006/', undefined, 39],
      ['ijhc', undefined, 20],
      ['.2001', undefined, 25],
      ['.0458', undefined, 25],
      ['end.', undefined, 18],
    ]);
  });

  it('an address with no letter at all takes the script of the sentence, its pieces too', () => {
    for (const version of [131, 154] as const) {
      on(version);
      const doc = build('See [10.1006/2001.0458](https://doi.org/10.1006/2001.0458) there.', chinese());
      expect(pieces(doc).filter(([, script]) => script)).toEqual([['10.1006/', 'Latn', 39], ['2001', 'Latn', 22], ['.0458', 'Latn', 25]]);
    }
  });

  it('the canvas and the HTML paint each such piece beside the mark of its script', () => {
    for (const version of [131, 154] as const) {
      on(version);
      const doc = build(DOI, chinese());
      const seen = painted(doc);
      const texts = seen.map((p) => p.text);
      expect(texts).toEqual(['DOI:', `10.1006/${NBSP}n`, 'ijhc', `.2001${NBSP}n`, `.0458${NBSP}n`, 'end.']);
      // Each piece starts where the one before it ends: no air in the word.
      const at = (text: string): number => seen.find((p) => p.text === text)!.x;
      expect(at('ijhc') - at(`10.1006/${NBSP}n`)).toBeCloseTo(39, 6);
      expect(at(`.2001${NBSP}n`) - at('ijhc')).toBeCloseTo(20, 6);
      expect(at(`.0458${NBSP}n`) - at(`.2001${NBSP}n`)).toBeCloseTo(25, 6);
      const html = renderToHtml(doc);
      const mark = `<span aria-hidden="true" style="font-size:0;-webkit-user-select:none;user-select:none;">${NBSP}n</span>`;
      for (const piece of ['10.1006/', '.2001', '.0458']) expect(html).toContain(`>${piece}${mark}</`);
      expect(html).not.toContain(`>ijhc${mark}`);
    }
  });

  it('both breakers: a compound broken after its hyphen, the number on the next line in the word\'s script', () => {
    const spans = [{ text: 'COVID-19 cc', bold: false, italic: false }];
    for (const optimal of [true, false]) {
      for (const version of [131, 154] as const) {
        on(version);
        // The compound is 39 px wide in a measure of 35: it parts at its hyphen.
        const block = measureRichBlock(spans, SONG, SONG, SONG, SONG, 35, 14, { textAlign: 'left', optimal, hyphenate: false });
        expect(block.lines.map((l) => l.text), `${optimal} ${version}`).toEqual(['COVID-', '19 cc']);
        const number = block.lines[1]!.segments![0]!;
        expect([number.text, number.scriptContext, +number.width.toFixed(4)]).toEqual(['19', 'Latn', 11]);
        const head = block.lines[0]!.segments!.find((seg) => seg.text === 'COVID-')!;
        expect(head.scriptContext).toBeUndefined();
        expect(head.width).toBeCloseTo(28, 6);
      }
    }
  });

  it('a word cut where its line ends: what is left of it with no letter keeps the word\'s script', () => {
    for (const version of [131, 154] as const) {
      on(version);
      // Wider than any line: cut between two characters, a hyphen added.
      const block = measureRichBlock([{ text: 'ab12345678901234567890', bold: false, italic: false }], SONG, SONG, SONG, SONG, 60, 14, { textAlign: 'left', optimal: false, hyphenate: false });
      expect(block.lines.length).toBeGreaterThan(1);
      const rest = block.lines.slice(1).flatMap((l) => l.segments ?? []).filter((seg) => seg.kind === 'text');
      expect(rest.length).toBeGreaterThan(0);
      for (const seg of rest) {
        expect(seg.scriptContext, seg.text).toBe('Latn');
        // Its digits at 5.5 px, and the hyphen a cut adds at 3.
        const digits = seg.text.replace(/-/g, '').length;
        expect(seg.width).toBeCloseTo(digits * 5.5 + (seg.text.length - digits) * 3, 6);
      }
    }
  });

  it('a paragraph with no formatting goes to the word-by-word breaker when a word of it may part into such a piece', () => {
    const opts = { textAlign: 'left' as const };
    const lines = (text: string, width: number) => measureBlock(text, SONG, width, 14, opts).lines;
    const marked = (text: string, width: number) => lines(text, width).flatMap((l) => l.segments ?? []).filter((seg) => seg.scriptContext).map((seg) => [seg.text, seg.scriptContext, +seg.width.toFixed(4)]);
    for (const version of [131, 154] as const) {
      on(version);
      // Pretext ends a line after any hyphen and measures `19` alone, each
      // browser its way; the breaker parts a compound between two letters
      // only (`breaksAfterHardHyphen`), so the number stays with its word.
      expect(lines('see COVID-19 there', 50).map((l) => l.text.trim())).toEqual(['see', 'COVID-19', 'there']);
      // A word wider than its line is cut where the line ends: what is
      // left of it, seven digits and a stop, in the word's Latin forms.
      // Divided as up to 1.51, between two characters: the slash is no
      // break here (#1164 would part the word after it).
      setSlashBreaks(false);
      try {
        expect(marked('DOI:10.1006/ijhc.2001.0458 end', 90)).toEqual([['001.0458', 'Latn', 41.5]]);
      } finally {
        setSlashBreaks(true);
      }
    }
    // With the rule off the paragraph stays with pretext, as in postext
    // 1.27: the number alone on the next line, 9.4 px wide on Chrome 131
    // and 11 px on a current one.
    setMeasureScriptContext({ enabled: false });
    on(131);
    const old = lines('see COVID-19 there', 50);
    expect(old.map((l) => l.text.trim())).toEqual(['see COVID-', '19 there']);
    expect(old[1]!.segments![0]!.width).toBeCloseTo(9.4, 6);
    on(154);
    expect(lines('see COVID-19 there', 50)[1]!.segments![0]!.width).toBeCloseTo(11, 6);
    // A paragraph with no such word stays with pretext under the rule too.
    setMeasureScriptContext({ enabled: true, script: 'Latn' });
    expect(lines('see after-dinner talk there', 60).map((l) => l.text.trim())).toEqual(measureRichBlock([{ text: 'see after-dinner talk there', bold: false, italic: false }], SONG, SONG, SONG, SONG, 60, 14, opts).lines.map((l) => l.text.trim()));
    expect(lines('see after-dinner talk there', 60).flatMap((l) => l.segments ?? []).some((seg) => seg.scriptContext)).toBe(false);
  });

  it('a face that draws digits one way, and a word of letters, are left as they were', () => {
    const plain = build(DOI, config('Plain', { locale: 'zh-Hans' }));
    expect(segmentsOf(plain).some((seg) => 'scriptContext' in seg)).toBe(false);
    expect(layout(plain)).toEqual(layout(build(DOI, config('Plain', { locale: 'zh-Hans', bodyText: { scriptContext: false } }))));
    const words = measureRichBlock([{ text: 'after-dinner talk', bold: false, italic: false }], SONG, SONG, SONG, SONG, 40, 14, { textAlign: 'left', optimal: true, hyphenate: false });
    expect(words.lines.flatMap((l) => l.segments ?? []).some((seg) => seg.scriptContext)).toBe(false);
  });
});

// `……` and `——` are the Chinese ellipsis and dash (and the Japanese
// ones): two marks that make one. Cited in an English sentence of a
// Chinese book ("Cuts inside a paragraph are marked …….") the nearest
// letter is Latin, and Noto Serif SC drew the pair in its Latin form:
// three dots on the baseline, twice, run into the full stop.
describe('a doubled ellipsis or dash in a Chinese or Japanese document (#725)', () => {
  const COLOPHON = `Dashes are set as ${EM_DASH}${EM_DASH} here. Cuts inside a paragraph are marked ${ELLIPSIS}${ELLIPSIS}. Set in Song.`;

  it('is told from one mark, and cut out of a word with no letter', () => {
    for (const mark of [`${ELLIPSIS}${ELLIPSIS}`, `${EM_DASH}${EM_DASH}`, '\u2015\u2015', `${ELLIPSIS}${ELLIPSIS}${ELLIPSIS}`]) expect(isDoubledMark(mark)).toBe(true);
    for (const mark of [ELLIPSIS, EM_DASH, `${ELLIPSIS}${EM_DASH}`, '...', `${ELLIPSIS}${ELLIPSIS}.`]) expect(isDoubledMark(mark)).toBe(false);
    expect(cutDoubledMarks(`${ELLIPSIS}${ELLIPSIS}.`)).toEqual([`${ELLIPSIS}${ELLIPSIS}`, '.']);
    expect(cutDoubledMarks(`\u201C${EM_DASH}${EM_DASH}\u201D,`)).toEqual(['\u201C', `${EM_DASH}${EM_DASH}`, '\u201D,']);
    // The pair alone needs no cut; one mark, and a word with a letter, are left whole.
    expect(cutDoubledMarks(`${ELLIPSIS}${ELLIPSIS}`)).toBeUndefined();
    expect(cutDoubledMarks(`${ELLIPSIS}.`)).toBeUndefined();
    expect(cutDoubledMarks(`wait${ELLIPSIS}${ELLIPSIS}and`)).toBeUndefined();
  });

  it('the document\'s language says so: Chinese and Japanese', () => {
    for (const tag of ['zh', 'zh-Hans', 'zh-Hant-TW', 'ja', 'ja-JP']) expect(hanMarksOfLocale(tag)).toBe(true);
    for (const tag of ['en', 'ko', 'ar', '', undefined]) expect(hanMarksOfLocale(tag)).toBe(false);
  });

  it('beside the Han mark both browsers measure the pair in its Han forms', () => {
    expect(scriptMark('Hani', false)).toEqual({ lead: '', trail: `${NBSP}${HAN_MARK}` });
    for (const version of [131, 154] as const) {
      on(version);
      expect(scriptTextWidth(`${ELLIPSIS}${ELLIPSIS}`, SONG, 'Hani', false)).toBeCloseTo(20, 6);
      expect(scriptTextWidth(`${ELLIPSIS}${ELLIPSIS}`, SONG, 'Latn', false)).toBeCloseTo(18, 6);
    }
  });

  it('cited in a Latin sentence it keeps its Han forms, and the stop after it the sentence\'s', () => {
    for (const version of [131, 154] as const) {
      on(version);
      const doc = build(COLOPHON, chinese({ page: { width: pt(520), height: pt(600), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } } }));
      expect(pieces(doc).filter(([, script]) => script)).toEqual([
        [`${EM_DASH}${EM_DASH}`, 'Hani', 20],
        // Two full ems of centred dots, not 18 px of dots on the baseline.
        [`${ELLIPSIS}${ELLIPSIS}`, 'Hani', 20],
        ['.', 'Latn', 3],
      ]);
      // The pair and its stop are one word: nothing between them.
      const segs = segmentsOf(doc);
      const at = segs.findIndex((seg) => seg.text === `${ELLIPSIS}${ELLIPSIS}`);
      expect(segs[at + 1]!.text).toBe('.');
      // Canvas and HTML paint it beside a Han character.
      expect(painted(doc).map((p) => p.text)).toContain(`${ELLIPSIS}${ELLIPSIS}${NBSP}${HAN_MARK}`);
      // The HTML sets it beside the mark too, unless the canvas that
      // measured it sets it alone at that width: then the mark changes
      // nothing there, and in the browser's layout it would bring the
      // forms of the document's language with it (#770).
      const html = renderToHtml(doc);
      const font = doc.pages[0]!.columns[0]!.blocks[0]!.fontString;
      const mark = `<span aria-hidden="true" style="font-size:0;-webkit-user-select:none;user-select:none;">${NBSP}${HAN_MARK}</span>`;
      const set: string[] = [];
      for (const pair of [`${EM_DASH}${EM_DASH}`, `${ELLIPSIS}${ELLIPSIS}`]) {
        const alone = Math.abs(shapedWidth(pair, font, 'ltr') - segs.find((seg) => seg.text === pair)!.width) < 1e-6;
        expect(html, `${version} ${pair}`).toContain(alone ? `>${pair}</` : `>${pair}${mark}</`);
        set.push(alone ? 'alone' : 'marked');
      }
      // In this face the pair alone has the width of its Han forms on
      // both browsers (`wordPieces.test.ts` has a pair that does not).
      expect(set).toEqual(['alone', 'alone']);
    }
  });

  it('the pair and its stop never part at the end of a line', () => {
    on(131);
    const spans = [{ text: `are marked ${ELLIPSIS}${ELLIPSIS}. Set`, bold: false, italic: false }];
    setMeasureScriptContext({ enabled: true, hanMarks: true });
    for (const optimal of [true, false]) {
      // `are marked ……` fits (70 px), its stop (3 px more) does not.
      const block = measureRichBlock(spans, SONG, SONG, SONG, SONG, 72, 14, { textAlign: 'left', optimal, hyphenate: false });
      expect(block.lines.map((l) => l.text), String(optimal)).toEqual(['are marked', `${ELLIPSIS}${ELLIPSIS}. Set`]);
    }
  });

  it('in a document of another language the pair takes the script of the sentence, as any word with no letter', () => {
    on(131);
    const doc = build(COLOPHON, config('Song', { locale: 'en', page: { width: pt(520), height: pt(600), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } } }));
    expect(pieces(doc).filter(([, script]) => script)).toEqual([
      [`${EM_DASH}${EM_DASH}`, 'Latn', 20],
      [`${ELLIPSIS}${ELLIPSIS}.`, 'Latn', 21],
    ]);
  });

  it('with the rule off, and in a face that draws it one way, nothing is cut', () => {
    on(131);
    const wide = { page: { width: pt(520), height: pt(600), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } } };
    const off = build(COLOPHON, chinese({ ...wide, bodyText: { scriptContext: false } }));
    expect(segmentsOf(off).some((seg) => seg.scriptContext)).toBe(false);
    // What postext 1.27 set: the word whole, in the default forms.
    expect(pieces(off).find(([text]) => text.startsWith(ELLIPSIS))).toEqual([`${ELLIPSIS}${ELLIPSIS}.`, undefined, 23]);
    const plain = build(COLOPHON, config('Plain', { locale: 'zh-Hans', ...wide }));
    expect(segmentsOf(plain).some((seg) => 'scriptContext' in seg)).toBe(false);
    expect(segmentsOf(plain).some((seg) => seg.text === `${ELLIPSIS}${ELLIPSIS}.`)).toBe(true);
  });
});

describe('a right-to-left word in a face that draws its marks one way (#770)', () => {
  // Markazi Text draws its Arabic stop and guillemets as a form of the
  // Arabic language alone, so in Persian, in Urdu and with no language it
  // is no face that draws punctuation by script, and its words were
  // measured left to right: the stop and the guillemet of the word below a
  // run apart, 4.9 thousandths of the em wider than the one run painted.
  const MARKAZI = 'Plain Markazi';
  const FONT = `10px ${MARKAZI}`;
  const KHALA = '\u062E\u0627\u0644\u0629';
  const WORD = `${KHALA}.\u00BB`;
  const OWN = { shapingLanguage: 'document' as const };
  const HOST = { shapingLanguage: 'host' as const };
  const cfg = (family: string, bodyText: PostextConfig['bodyText'] = {}): PostextConfig => config(family, { direction: 'rtl', locale: 'fa', bodyText });
  /** What the canvas gives a segment as it paints it: alone, in a context
   *  set right to left. */
  const painted = (text: string, font: string): number => {
    const ctx = new BrowserCtx();
    ctx.font = font;
    ctx.direction = 'rtl';
    return +ctx.measureText(text).width.toFixed(4);
  };
  const widthOf = (markdown: string, text: string, config: PostextConfig): number[] => segmentsOf(build(markdown, config)).filter((s) => s.text === text).map((s) => +s.width.toFixed(4));

  it('the face is none that draws punctuation by script', () => {
    expect(faceReadsScript(FONT)).toBe(false);
    expect(painted(WORD, FONT)).toBeCloseTo(26.21, 6);
  });

  it('in a document shaped in its own language it is measured as it is painted: one run, right to left', () => {
    for (const version of [131, 154] as const) {
      on(version);
      expect(widthOf(`${AR} ${WORD} ${AR}`, WORD, cfg(MARKAZI, OWN))).toEqual([painted(WORD, FONT)]);
      // Its own language is the default (#770).
      expect(widthOf(`${AR} ${WORD} ${AR}`, WORD, cfg(MARKAZI))).toEqual([painted(WORD, FONT)]);
    }
    expect(painted(WORD, FONT)).toBe(26.21);
  });

  it('in a document shaped in its host\'s language it keeps the width it had: two runs on a current browser', () => {
    on(154);
    expect(widthOf(`${AR} ${WORD} ${AR}`, WORD, cfg(MARKAZI, HOST))).toEqual([26.7]);
    // Chrome 131 read a word as one run.
    on(131);
    expect(widthOf(`${AR} ${WORD} ${AR}`, WORD, cfg(MARKAZI, HOST))).toEqual([26.21]);
  });

  it('marks that stand alone between right-to-left words likewise', () => {
    const md = `${AR} .\u00BB ${AR}`;
    expect(widthOf(md, '.\u00BB', cfg(MARKAZI, OWN))).toEqual([painted('.\u00BB', FONT)]);
    expect(painted('.\u00BB', FONT)).toBe(6.21);
    expect(widthOf(md, '.\u00BB', cfg(MARKAZI, HOST))).toEqual([6.7]);
  });

  it('a Hebrew word too', () => {
    const hebrew = '\u05D0\u05D1.\u00BB';
    const md = `\u05D0\u05D1 ${hebrew} \u05D0\u05D1`;
    const own = config(MARKAZI, { direction: 'rtl', locale: 'he', bodyText: OWN });
    expect(widthOf(md, hebrew, own)).toEqual([painted(hebrew, FONT)]);
    expect(widthOf(md, hebrew, config(MARKAZI, { direction: 'rtl', locale: 'he', bodyText: HOST }))).toEqual([16.7]);
  });

  it('carries no field, and is cut where it was', () => {
    const seg = segmentsOf(build(`${AR} ${WORD} ${AR}`, cfg(MARKAZI, OWN))).find((s) => s.text === WORD)!;
    expect(seg.rtl).toBe(true);
    expect('scriptContext' in seg).toBe(false);
    expect('scriptRtl' in seg).toBe(false);
    const texts = (config: PostextConfig): string[] => segmentsOf(build(`${AR} (${KHALA}) ${WORD} 46. ${AR}`, config)).map((s) => s.text);
    expect(texts(cfg(MARKAZI, OWN))).toEqual(texts(cfg(MARKAZI, HOST)));
  });

  it('with the rule off a word is measured as up to postext 1.27', () => {
    on(154);
    expect(widthOf(`${AR} ${WORD} ${AR}`, WORD, cfg(MARKAZI, { ...OWN, scriptContext: false }))).toEqual([26.7]);
  });

  it('a face that draws punctuation by script is measured as it was, in either language', () => {
    for (const version of [131, 154] as const) {
      on(version);
      const md = `${AR} (1367\u0645) ${AR}. 46. ${WORD}`;
      const widths = (config: PostextConfig): unknown => segmentsOf(build(md, config)).map((s) => [s.text, +s.width.toFixed(4), s.scriptContext]);
      expect(widths(cfg('Amiri', OWN))).toEqual(widths(cfg('Amiri', HOST)));
    }
  });
});

describe('a design text with no letter is set in the HTML in the forms the canvas painted it in (#770)', () => {
  // A design text carries no script: the canvas paints each of its runs
  // alone, and a current Chrome gives a run with no letter Latin forms,
  // where the browser's layout gives it the face's default ones.
  const head = (content: string, fontFamily = 'Amiri') => ({ elements: [{ kind: 'text' as const, id: 'rh', content, fontFamily, fontSize: pt(10), overflow: 'wrap' as const, align: 'start' as const, placement: { anchor: { to: 'container' as const, edge: 'top-left' as const }, size: { width: 'fill' as const } } }] });
  const OWN = { bodyText: { shapingLanguage: 'document' as const } };
  const MARK = `<span aria-hidden="true" style="font-size:0;-webkit-user-select:none;user-select:none;">${NBSP}n</span>`;

  it('beside a Latin mark of no size, where the face draws by script and the run has that width', () => {
    const html = renderToHtml(build('Text.', config('Amiri', { locale: 'en', header: head('(1)'), ...OWN })));
    expect(html).toContain(`>(1)${MARK}</span>`);
  });

  it('as it was in a face that draws the same under any script, in a text with letters, and in one of several words', () => {
    const plain = renderToHtml(build('Text.', config('Plain', { locale: 'en', header: head('(1)', 'Plain'), ...OWN })));
    expect(plain).toContain('>(1)</span>');
    expect(plain).not.toContain('font-size:0');
    const letters = renderToHtml(build('Text.', config('Amiri', { locale: 'en', header: head('Page (1)'), ...OWN })));
    expect(letters).not.toContain('font-size:0');
    const words = renderToHtml(build('Text.', config('Amiri', { locale: 'en', header: head('(1) (2)'), ...OWN })));
    expect(words).not.toContain('font-size:0');
  });

  it('as it was where the canvas set it in the default forms, and where the language of the page is not known', () => {
    on(131);
    expect(renderToHtml(build('Text.', config('Amiri', { locale: 'en', header: head('(1)'), ...OWN })))).not.toContain('font-size:0');
    on(154);
    expect(renderToHtml(build('Text.', config('Amiri', { locale: 'en', header: head('(1)'), bodyText: { shapingLanguage: 'host' } })))).not.toContain('font-size:0');
    // The language is known by default (#770).
    expect(renderToHtml(build('Text.', config('Amiri', { locale: 'en', header: head('(1)') })))).toContain(`>(1)${MARK}</span>`);
  });
});

