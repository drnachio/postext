// Three dots stay three in a face whose ellipsis glyph is one dot (#676,
// found in the Cookbook page review: the demons of `pepper-and-carrot-page`
// speak Arabic in Lalezar, whose U+2026 is as wide as its full stop).

import { describe, it, expect, beforeAll } from 'vitest';
import { stubAdvance } from './stubMeasure.js';
import { clearTextWidthCache } from '../../../measure/canvas.js';
import { letterPanelDetailed } from '../letter.js';
import { presetLetteringStyles } from '../presets.js';
import { prepareText, readLetteringText } from '../text.js';
import type { LetteringPanel } from '../types.js';
import { fontPx } from '../../../__tests__/fontPx.js';

// The stub measurer, with a face named Lalezar whose ellipsis is one dot.
beforeAll(() => {
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    getContext() {
      return {
        font: '16px sans-serif',
        measureText(this: { font: string }, t: string) {
          const px = parseFloat(fontPx(this.font)?.[1] ?? '16');
          const oneDot = this.font.includes('Lalezar');
          let w = 0;
          for (const ch of t) w += oneDot && ch === '…' ? stubAdvance('.') * 1.07 : stubAdvance(ch);
          return { width: w * px };
        },
      };
    }
  };
  clearTextWidthCache();
});

const ar = presetLetteringStyles({ fontSizePx: 12, locale: 'ar', fontFamily: 'Playpen Sans Arabic' });
const prep = (text: string, fontFamily: string, locale = 'ar') =>
  prepareText(readLetteringText(text, undefined), { ...ar.speech!, fontFamily }, { locale, vertical: false }).text;

describe('the ellipsis rule and the face of the line', () => {
  it('keeps the dots as written, closed up, in a face whose ellipsis is one dot', () => {
    expect(prep('على من نهجم ...؟', 'Lalezar')).toBe('على من نهجم ...؟');
    expect(prep('... بما أنني . . . .', 'Lalezar')).toBe('... بما أنني ...');
  });

  it('sets one ellipsis in a face that has one, as before', () => {
    expect(prep('على من نهجم ...؟', 'Playpen Sans Arabic')).toBe('على من نهجم …؟');
    expect(prep('Well... maybe', 'Comic Neue', 'en')).toBe('Well… maybe');
  });

  it('letters the balloon with its three dots', () => {
    const cell = { x: 0, y: 0, width: 400, height: 300 };
    const panel: LetteringPanel = {
      index: 0, bbox: cell, insetPx: 6, direction: 'rtl', writingMode: 'horizontal', locale: 'ar', anchors: [], dpi: 96,
      polygon: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }],
    };
    const line = (fontFamily: string) => letterPanelDetailed(panel, [{
      id: 'm', order: 0, kind: 'balloon', text: 'ما هي أوامرنا؟ على من نهجم ...؟', sourceStart: 0, sourceEnd: 10, style: { ...ar.speech!, fontFamily },
    }]).balloons[0]!.text[0]!.lines.map((l) => l.text).join(' ');
    expect(line('Lalezar')).toContain('...');
    expect(line('Lalezar')).not.toContain('…');
    expect(line('Playpen Sans Arabic')).toContain('…');
  });
});
