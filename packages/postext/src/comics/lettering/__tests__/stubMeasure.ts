// A deterministic text measurer for the lettering tests (no canvas in the
// node test environment): advances by character class, in ems of the
// font's px size, close enough to a comic face for shapes to be judged.

import { clearTextWidthCache } from '../../../measure/canvas';

const SIZE_RE = /(\d*\.?\d+)px/;

/** Advance of one character, in em. */
export function stubAdvance(ch: string): number {
  if (/[　-ヿ㐀-鿿豈-﫿！-｠]/.test(ch)) return 1;
  if (/[؀-ۿ]/.test(ch)) return 0.42;
  if (/\s/.test(ch)) return 0.27;
  if (/[A-Z0-9]/.test(ch)) return 0.6;
  if (/[a-z]/.test(ch)) return 0.5;
  if (/[.,;:'!|]/.test(ch)) return 0.25;
  if (ch === '…') return 0.8;
  return 0.55;
}

class StubCtx {
  font = '16px sans-serif';
  measureText(s: string): { width: number } {
    const m = SIZE_RE.exec(this.font);
    const px = m ? parseFloat(m[1]!) : 16;
    let w = 0;
    for (const ch of s) w += stubAdvance(ch);
    return { width: w * px };
  }
}

/** Install the stub as the engine's measuring canvas. */
export function installStubMeasure(): void {
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    getContext(): StubCtx {
      return new StubCtx();
    }
  };
  clearTextWidthCache();
}
