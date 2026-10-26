import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearMeasurementCache, measureBlock } from '../../measure/index.js';
import { setMeasureLanguage } from '../../measure/canvas.js';
import { setHyphenationLocale } from '../../hyphenation/hyphenate.js';
import type { MeasureBlockOptions } from '../../measure/types.js';
import type { VDTLine } from '../../vdt.js';

// #770: the head of a break inside a Catalan `l·l`, in a plain paragraph.
// The line ends on the piece `col·` and prints a hyphen in the dot's
// place, so the dot's width is given back. The dot set alone was taken
// for it; a face that sets the dot after an `l` otherwise than alone
// (Castoro's Catalan form, 0.129 em there and 0.297 em alone; Lora's
// `l·` ligature) left the head off the text painted: `til-` 22.02 px for
// 25.28 at 19.4 px in Castoro.

const DOT = '·';
/** px at 10 px: every letter 5, a space 2.5, a hyphen 3, the dot 2.5; the
 *  face ligates `l·`, 1.3 narrower (as Lora). */
function faceWidth(text: string): number {
  const chars = Array.from(text);
  let px = 0;
  chars.forEach((ch, i) => {
    if (ch === ' ') px += 2.5;
    else if (ch === '-') px += 3;
    else if (ch === DOT) px += 2.5;
    else px += 5;
    if (`${chars[i - 1] ?? ''}${ch}` === `l${DOT}`) px -= 1.3;
  });
  return px;
}
class MeasureContext {
  font = '10px Lliga';
  lang = 'inherit';
  direction = 'ltr';
  measureText(s: string): { width: number } {
    return { width: faceWidth(s) };
  }
}
const globals = globalThis as unknown as { OffscreenCanvas: unknown; OffscreenCanvasRenderingContext2D: unknown };
const saved = { canvas: globals.OffscreenCanvas, context: globals.OffscreenCanvasRenderingContext2D };

const FONT = '10px Lliga';
const TEXT = `aa col${DOT}lecció bb`;
const GREEDY: MeasureBlockOptions = { textAlign: 'left', hyphenate: true };
const OPTIMAL: MeasureBlockOptions = { textAlign: 'justify', hyphenate: true, optimal: true };

function lay(language: string | undefined, options: MeasureBlockOptions): VDTLine[] {
  setHyphenationLocale('ca' as never);
  setMeasureLanguage(language);
  return measureBlock(TEXT, FONT, 32, 14, options).lines;
}
/** The width of the pieces a line ends on, back to its last space. */
function closing(line: VDTLine): number {
  let width = 0;
  for (const s of [...(line.segments ?? [])].reverse()) {
    if (s.kind === 'space') break;
    width += s.width;
  }
  return Math.round(width * 1000) / 1000;
}

describe('the head of a break inside an l·l in a plain paragraph (#770)', () => {
  beforeEach(() => {
    globals.OffscreenCanvasRenderingContext2D = MeasureContext;
    globals.OffscreenCanvas = class {
      getContext(): MeasureContext {
        return new MeasureContext();
      }
    };
    clearMeasurementCache();
  });
  afterEach(() => {
    setMeasureLanguage(undefined);
    clearMeasurementCache();
    globals.OffscreenCanvas = saved.canvas;
    globals.OffscreenCanvasRenderingContext2D = saved.context;
  });

  for (const [name, options] of [['line by line', GREEDY], ['Knuth–Plass', OPTIMAL]] as const) {
    it(`${name}: a document shaped in its own language measures the letters before the dot and the hyphen`, () => {
      const lines = lay('ca', options);
      expect(lines[0]!.text).toBe('aa col-');
      // `col` 15 px and the hyphen 3: the text painted.
      expect(closing(lines[0]!)).toBe(18);
    });

    it(`${name}: one shaped in the host's language keeps the width it had`, () => {
      const lines = lay(undefined, options);
      expect(lines[0]!.text).toBe('aa col-');
      // `col·` 16.2 px, less the dot alone, 2.5, and the hyphen.
      expect(closing(lines[0]!)).toBe(16.7);
    });
  }
});
