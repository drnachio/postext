import { describe, it, expect, afterEach } from 'vitest';
import { clearTextWidthCache, setMeasureLanguage } from '../../../measure/canvas.js';
import { prepareText, readLetteringText } from '../text.js';
import { shapeText } from '../shape-text.js';
import { presetLetteringStyles } from '../presets.js';
import { pxOf } from '../../../__tests__/htmlText.js';

// #770, round 2: the lines a shaping tries are measured as the layout sets
// the ones it chooses. In a document shaped in its own language the layout
// sets a line as wide as its runs are painted, each in its own direction;
// the shaping measured every line left to right, whole, so a line of an
// Arabic balloon that ends in a stop or a guillemet was chosen at another
// width than it is set at.

const EM = 20;

/**
 * The advance of `text`, in em, in a face that draws its marks by the run
 * they stand in, as Playpen Sans Arabic and Markazi Text do in Arabic: a
 * guillemet is 0.47 em and a stop 0.3 em in a text measured left to right
 * (a run apart from the Arabic word, shaped alone), 0.41 em and 0.2 em in
 * the right-to-left run it is painted in. A space is 0.25 em, any other
 * character half an em.
 */
function faceWidth(text: string, rtl: boolean): number {
  let em = 0;
  for (const ch of text) {
    if (/[⁦-⁩]/.test(ch)) continue;
    if (ch === ' ') em += 0.25;
    else if (ch === '«' || ch === '»') em += rtl ? 0.41 : 0.47;
    else if (ch === '.') em += rtl ? 0.2 : 0.3;
    else em += 0.5;
  }
  return em;
}
class StubCtx {
  font = `${EM}px Test`;
  lang = 'inherit';
  direction = 'ltr';
  measureText(s: string): { width: number } {
    const px = Number(pxOf(this.font) ?? EM);
    return { width: faceWidth(s, this.direction === 'rtl') * px };
  }
}
const globals = globalThis as unknown as { OffscreenCanvas: unknown; OffscreenCanvasRenderingContext2D: unknown };
globals.OffscreenCanvasRenderingContext2D = StubCtx;
globals.OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};
clearTextWidthCache();

afterEach(() => setMeasureLanguage(undefined));

function shape(text: string, locale: string) {
  const style = presetLetteringStyles({ fontSizePx: EM, locale, fontFamily: 'Test' })['speech']!;
  const p = prepareText(readLetteringText(text, undefined), style, { locale, vertical: false });
  const shaped = shapeText(p, style, { locale, vertical: false, dpi: 96 });
  return { shaped, lines: shaped.lines.map((l) => p.text.slice(l.start, l.end)) };
}

// Two sentences, each closed by a stop; the second inside guillemets.
const ARABIC = 'هذا هو النص الاول. «وهذا هو النص الثاني.»';

describe('#770: a balloon line is fitted at the width it is set at', () => {
  it('in a document shaped in its own language, a right-to-left line as it is painted', () => {
    setMeasureLanguage('ar');
    const { shaped, lines } = shape(ARABIC, 'ar');
    const set = shaped.block.lines.filter((l) => l.text.length > 0);
    expect(set).toHaveLength(lines.length);
    // The layout sets each line as one right-to-left run.
    set.forEach((l, i) => expect(l.width).toBeCloseTo(faceWidth(lines[i]!, true) * EM, 6));
    // And the shaping chose it at that width.
    shaped.lines.forEach((l, i) => expect(l.width).toBeCloseTo(set[i]!.width, 6));
    // The text holds marks the two directions set at other widths.
    expect(faceWidth(ARABIC, false)).toBeGreaterThan(faceWidth(ARABIC, true) + 0.3);
  });

  it('in a document shaped in its host’s language, left to right and whole, as it was', () => {
    const { shaped, lines } = shape(ARABIC, 'ar');
    const set = shaped.block.lines.filter((l) => l.text.length > 0);
    shaped.lines.forEach((l, i) => {
      expect(l.width).toBeCloseTo(faceWidth(lines[i]!, false) * EM, 6);
      expect(set[i]!.width).toBeCloseTo(l.width, 6);
    });
  });

  it('a left-to-right line whole, whatever the document is shaped in', () => {
    const text = 'This is one line. «And this is another.»';
    const host = shape(text, 'en');
    setMeasureLanguage('en');
    const own = shape(text, 'en');
    expect(own.lines).toEqual(host.lines);
    own.shaped.lines.forEach((l, i) => {
      expect(l.width).toBeCloseTo(faceWidth(own.lines[i]!, false) * EM, 6);
      expect(l.width).toBeCloseTo(host.shaped.lines[i]!.width, 6);
    });
  });
});
