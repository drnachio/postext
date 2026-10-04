import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { mirroredChar, resolveParagraph } from '../../bidi';
import type { PostextConfig } from '../../types';
import type { VDTLine } from '../../vdt';

// #401: the ornate parentheses of Qurʾān quotations, ﴿ (U+FD3F, opening
// since Unicode 14) and ﴾ (U+FD3E, closing), are not mirrored and are not
// paired brackets (they are not in BidiBrackets.txt): rules N1/N2 resolve
// them like any neutral. Their glyphs are drawn for right-to-left text,
// ﴿ to stand on the right of the words it opens.
//
// In a left-to-right paragraph a quotation typed ﴿…﴾ between Latin words
// has its brackets at the paragraph's level (N2: Latin on one side, Arabic
// on the other), so ﴿ stands on the left with its right-hand shape and the
// pair reads reversed. Browsers do the same, since it is what UAX #9 says.
// The quotation set as a right-to-left isolate, `:rtl[﴿…﴾]`, puts both
// brackets inside its run, ﴿ on the right.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  locale: 'en',
  page: { width: pt(400), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  bodyText: { firstLineIndent: pt(0), textAlign: 'left' },
};
const OPEN = '﴿';
const CLOSE = '﴾';

/** The line's characters as painted, left to right: segments in `order`,
 *  a right-to-left segment's characters reversed. */
function painted(line: VDTLine): string {
  const segs = line.segments!;
  return (line.order ?? segs.map((_, i) => i))
    .map((i) => segs[i]!)
    .map((s) => (s.rtl ? Array.from(s.text).reverse().map(mirroredChar).join('') : s.text))
    .join('');
}

describe('#401: ornate Qurʾān parentheses', () => {
  it('are neutrals that are never mirrored', () => {
    expect(mirroredChar(OPEN)).toBe(OPEN);
    expect(mirroredChar(CLOSE)).toBe(CLOSE);
    // In a right-to-left paragraph ﴿ comes first and stands on the right.
    const rtl = resolveParagraph(`${OPEN}بسم الله${CLOSE}`, 'rtl');
    expect(rtl.levels[0]).toBe(1);
    expect(rtl.levels[rtl.levels.length - 1]).toBe(1);
  });

  it('in a left-to-right paragraph, resolve to its level beside a Latin word (UAX #9 N2)', () => {
    const doc = buildDocument({ markdown: `See ${OPEN}بسم الله${CLOSE} here` }, config);
    const line = doc.blocks[0]!.lines[0]!;
    const out = painted(line);
    // ﴿ on the left of the Arabic run, ﴾ on its right: the pair reads
    // reversed, as in a browser.
    expect(out.indexOf(OPEN)).toBeLessThan(out.indexOf(CLOSE));
  });

  it('set as a right-to-left isolate, stand ﴿ on the right', () => {
    const doc = buildDocument({ markdown: `See :rtl[${OPEN}بسم الله${CLOSE}] here` }, config);
    const line = doc.blocks[0]!.lines[0]!;
    const out = painted(line);
    expect(out.indexOf(CLOSE)).toBeLessThan(out.indexOf(OPEN));
    expect(out.startsWith('See ')).toBe(true);
    expect(out.endsWith(' here')).toBe(true);
  });
});
