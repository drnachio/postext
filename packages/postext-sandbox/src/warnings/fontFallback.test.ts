import { describe, expect, it } from 'vitest';
import { buildDocument } from 'postext';
import type { FontFaceLike, FontFaceSetLike, PostextConfig } from 'postext';
import { computeWarnings } from './compute';
import { warningCategory } from './categories';
import type { WarningPayload } from './types';

// #629: the faces the layout measured with a fallback (the engine's
// `fontFallback`) are listed under Fonts, once per face, and go with the
// missing-font checks when they are turned off.

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

/** A font set holding one loaded regular face of "Only Regular". */
function fontSet(): FontFaceSetLike {
  const faces: FontFaceLike[] = [{ family: 'Only Regular', weight: '400', style: 'normal', status: 'loaded' }];
  return {
    get size() { return faces.length; },
    [Symbol.iterator]: () => faces[Symbol.iterator](),
    add: (f: FontFaceLike) => faces.push(f),
    load: async () => [],
  };
}

const fallbacks = (cfg: PostextConfig, markdown: string) =>
  computeWarnings({ markdown, config: cfg, doc: buildDocument({ markdown }, cfg, undefined, { fontSet: fontSet() }) })
    .filter((w): w is typeof w & { payload: Extract<WarningPayload, { kind: 'fontFallback' }> } => w.payload.kind === 'fontFallback');

const base: PostextConfig = { header: { elements: [] }, footer: { elements: [] } };

describe('fontFallback in the Checks panel (#629)', () => {
  it('lists a missing face and a synthesized one under Fonts', () => {
    const found = fallbacks({ ...base, bodyText: { fontFamily: 'Only Regular' }, headings: { fontFamily: 'Absent Sans' } }, '# Head\n\nBody ***both*** text.');
    expect(found.map((w) => w.payload)).toEqual(expect.arrayContaining([
      { kind: 'fontFallback', family: 'Absent Sans', weight: expect.any(Number), style: 'normal', reason: 'missing' },
      { kind: 'fontFallback', family: 'Only Regular', weight: 700, style: 'italic', reason: 'synthesized' },
    ]));
    expect(warningCategory('fontFallback')).toBe('fonts');
  });

  it('is turned off with the missing-font checks', () => {
    expect(fallbacks({ ...base, bodyText: { fontFamily: 'Absent Sans' }, debug: { warnings: { missingFont: false } } }, 'Body.')).toEqual([]);
  });
});
