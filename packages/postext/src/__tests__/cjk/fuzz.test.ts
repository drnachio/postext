import { it, expect } from 'vitest';
import { measureRichBlock } from '../../measure/rich';
import { measureBlock } from '../../measure/plain';
import type { InlineSpan } from '../../parse';
import type { CjkLineBreakLevel } from '../../measure/cjkClasses';

// The composer on random mixes of Chinese, punctuation, Latin runs, numbers,
// spaces, U+3000, zero-width spaces, soft hyphens, supplementary-plane and
// combining characters, at random widths, levels, alignments, indents,
// tracking and looseness: it always ends, keeps every character in order,
// and each line's width is the sum of its segments.

class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    let w = 0;
    for (const ch of s) {
      const cp = ch.codePointAt(0)!;
      w += ch === ' ' ? 4 : cp >= 0x2e80 || '—…·“”‘’'.includes(ch) ? 16 : 8;
    }
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const POOL = [
  ...'此开卷第一回也作者自云因曾历过番梦幻之后故将真事隐去而借通灵说撰石头记书',
  ...'，。、；：！？「」『』《》（）“”‘’——……·～／',
  'iPhone', '15', '¥5,999', '50%', ' ', ' ', '\u3000', '\u{20E95}', '\u{1F600}', 'https://a.b/c/d',
  'Pneumonoultramicroscopic', '\u200B', '\u00AD', 'e\u0301',
];
let seed = 12345;
const rnd = (n: number): number => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % n;
};
const LEVELS: CjkLineBreakLevel[] = ['none', 'basic', 'gb', 'strict'];
/** The text without what a break may drop or add: spaces, zero-width
 *  spaces, soft hyphens and the hyphen of a divided word. */
const norm = (s: string): string => s.replace(/[\s\u200B\u00AD-]/g, '');

it('never hangs, loses or invents text', () => {
  for (let iter = 0; iter < 1500; iter++) {
    let text = '';
    const len = 2 + rnd(80);
    for (let i = 0; i < len; i++) text += POOL[rnd(POOL.length)];
    if (!/[一-鿿]{2}/.test(text)) text = `此开${text}`;
    const width = 1 + rnd(300);
    const options = {
      textAlign: rnd(2) ? ('justify' as const) : ('left' as const),
      cjkLineBreak: LEVELS[rnd(4)]!,
      firstLineIndentPx: rnd(3) * 8,
      letterSpacingPx: rnd(3) === 0 ? -0.5 : 0,
      looseness: rnd(5) === 0 ? 1 : 0,
    };
    const cut = rnd(text.length);
    const spans: InlineSpan[] = [{ text: text.slice(0, cut), bold: false, italic: false }, { text: text.slice(cut), bold: true, italic: false }];
    const plain = measureBlock(text, '16px T', width, 20, options);
    const rich = measureRichBlock(spans, '16px T', 'bold 16px T', '16px T', '16px T', width, 20, options);
    for (const block of [plain, rich]) {
      expect(norm(block.lines.map((l) => l.text).join(''))).toBe(norm(text));
      for (const l of block.lines) {
        const w = l.segments!.reduce((s, x) => s + x.width, 0);
        expect(Number.isFinite(w)).toBe(true);
        expect(Math.abs(w - l.bbox.width)).toBeLessThan(1e-6);
        expect(l.text).toBe(l.segments!.map((s) => s.text).join(''));
        for (const s of l.segments!) if (s.tracking !== undefined) expect(s.tracking).toBeGreaterThan(0);
      }
    }
  }
});
