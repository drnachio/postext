import { describe, it, expect, beforeAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  openBundle,
  buildBundle,
  createBundle,
  readBundle,
  CONFIG_VERSION,
  LEGACY_MATH_SIZE,
  migrateConfig,
  pinLegacyMathSize,
} from '../bundle';
import { initMathEngine, clearMathCache } from '../math';
import { stripConfigDefaults } from '../defaults';
import type { PostextConfig } from '../types';
import type { VDTDocument } from '../vdt';

// Deterministic text measurement stub (no DOM in the node test env).
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

beforeAll(async () => {
  await initMathEngine();
  clearMathCache();
});

// EF-75: postext 1.5 sets one em of a formula at the surrounding text's
// size × `math.fontSizeScale`; 1.4 set it 0.5 ÷ 0.442 ≈ 1.131 times larger.
// A configuration stored for older rules keeps the size it was laid out at.
const CHAPTER = [
  'Gauss found $\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$ as a boy, and $e^{i\\pi} + 1 = 0$ came later.',
  '',
  '$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$',
  '',
  'After the formula the text goes on.',
  '',
].join('\n');

const BODY = { bodyText: { fontSize: { value: 12, unit: 'pt' } }, layout: { layoutType: 'single' } } satisfies PostextConfig;
const SCALED = { ...BODY, math: { fontSizeScale: 1.2, marginTop: { value: 1, unit: 'em' }, marginBottom: { value: 6, unit: 'pt' } } } satisfies PostextConfig;

interface LaidOutBlock {
  type: string;
  y: number;
  h: number;
  maths: { w: number; h?: number }[];
}

/** What postext 1.4.1 laid `CHAPTER` out as, under `BODY` and `SCALED`
 *  (the same measurement stub, `openBundle` + `buildBundle` on the
 *  released engine): each block's top, its height and its formulas'
 *  widths (a display formula's height too). */
const LAID_OUT_BY_1_4_1: Record<'BODY' | 'SCALED', LaidOutBlock[]> = {
  BODY: [
    { type: 'paragraph', y: 236.2205, h: 75, maths: [{ w: 386.4762 }, { w: 268.775 }] },
    { type: 'mathDisplay', y: 351.2205, h: 185, maths: [{ w: 348.3, h: 139.75 }] },
    { type: 'paragraph', y: 536.2205, h: 75, maths: [] },
  ],
  SCALED: [
    { type: 'paragraph', y: 236.2205, h: 75, maths: [{ w: 386.4762 }, { w: 322.53 }] },
    { type: 'mathDisplay', y: 371.2205, h: 240, maths: [{ w: 417.96, h: 167.7 }] },
    { type: 'paragraph', y: 611.2205, h: 75, maths: [] },
  ],
};

const round = (n: number) => Math.round(n * 1e4) / 1e4;
function laidOut(doc: VDTDocument): LaidOutBlock[] {
  return doc.blocks.map((b) => ({
    type: b.type,
    y: round(b.bbox.y),
    h: round(b.bbox.height),
    maths: b.type === 'mathDisplay'
      ? [{ w: round(b.lines[0]!.bbox.width), h: round(b.lines[0]!.bbox.height) }]
      : b.lines.flatMap((l) => (l.segments ?? []).filter((s) => s.kind === 'math').map((s) => ({ w: round(s.width) }))),
  }));
}

const bundleBytes = (config: PostextConfig, extra: Record<string, unknown> = {}, chapter = CHAPTER) => zipSync({
  'preset.json': strToU8(JSON.stringify({
    version: 2, id: 'sums', name: 'Sums', locale: 'en',
    chapters: [{ title: 'Sums', file: 'chapters/01.md' }],
    config,
    ...extra,
  })),
  'chapters/01.md': strToU8(chapter),
});

describe('maths in configurations written before postext 1.5 (EF-75)', () => {
  it('lays a 1.4 bundle\'s formulas out at the size, and with the spacing, 1.4.1 did', async () => {
    for (const [name, config] of [['BODY', BODY], ['SCALED', SCALED]] as const) {
      const old = await openBundle(bundleBytes(config));
      expect(laidOut(buildBundle(old)[0]!)).toEqual(LAID_OUT_BY_1_4_1[name]);
    }
  });

  it('pins the scale and the display margins in em, and nothing else', async () => {
    const old = await openBundle(bundleBytes(BODY));
    expect(old.config.math).toEqual({
      fontSizeScale: LEGACY_MATH_SIZE,
      marginTop: { value: 0.8 / LEGACY_MATH_SIZE, unit: 'em' },
      marginBottom: { value: 0.8 / LEGACY_MATH_SIZE, unit: 'em' },
    });
    const scaled = await openBundle(bundleBytes(SCALED));
    // A margin in pt is a length of the page, not of the formula.
    expect(scaled.config.math).toEqual({
      fontSizeScale: 1.2 * LEGACY_MATH_SIZE,
      marginTop: { value: 1 / LEGACY_MATH_SIZE, unit: 'em' },
      marginBottom: { value: 6, unit: 'pt' },
    });
    expect(LEGACY_MATH_SIZE).toBeCloseTo(1.1312, 4);
  });

  it('sets a bundle written for today\'s rules at the documented size', async () => {
    const today = await openBundle(bundleBytes(BODY, { configVersion: CONFIG_VERSION }));
    expect(today.config.math).toBeUndefined();
    const [doc] = buildBundle(today);
    const now = laidOut(doc!);
    const then = LAID_OUT_BY_1_4_1.BODY;
    // The display formula is 0.442 / 0.5 of 1.4's, and so is the second
    // inline one (the first is scaled down to the line box either way).
    expect(now[1]!.maths[0]!.w).toBeCloseTo(then[1]!.maths[0]!.w * 0.884, 1);
    expect(now[1]!.maths[0]!.h).toBeCloseTo(then[1]!.maths[0]!.h! * 0.884, 1);
    expect(now[0]!.maths[1]!.w).toBeCloseTo(then[0]!.maths[1]!.w * 0.884, 1);
  });

  it('pins a bundle stamped 3 (a 1.5 prerelease, before the size changed), but not its heading breaks', async () => {
    const headings = { fontFamily: 'Georgia' };
    const v3 = await openBundle(bundleBytes({ ...BODY, headings }, { configVersion: 3 }));
    expect(laidOut(buildBundle(v3)[0]!)).toEqual(LAID_OUT_BY_1_4_1.BODY);
    expect(v3.config.headings).toEqual(headings);
    // Unversioned (1.4): both pins.
    const v0 = await openBundle(bundleBytes({ ...BODY, headings }));
    expect(v0.config.headings?.levels?.[0]?.breakBefore).toEqual({ enabled: false });
    expect(v0.config.math?.fontSizeScale).toBe(LEGACY_MATH_SIZE);
  });

  it('leaves a book with no maths, or with maths switched off, as it was written', async () => {
    const prose = await openBundle(bundleBytes(BODY, {}, 'No formula here, only prose.\n'));
    expect(prose.config.math).toBeUndefined();
    const off = { ...BODY, math: { enabled: false } };
    expect((await openBundle(bundleBytes(off))).config.math).toEqual({ enabled: false });
  });

  it('pins the maths the layers leave in force: a locale\'s own `math` replaces the shared one', async () => {
    const bytes = zipSync({
      'preset.json': strToU8(JSON.stringify({
        version: 2, id: 'sums', name: 'Sums', locale: 'en', locales: ['en', 'es'],
        chapters: { en: [{ title: 'Sums', file: 'chapters/en.md' }], es: [{ title: 'Sumas', file: 'chapters/es.md' }] },
        config: { ...BODY, math: { fontSizeScale: 0.9, color: { hex: '#123456' } } },
        localized: { es: { config: { math: { fontSizeScale: 1.1 } } } },
      })),
      'chapters/en.md': strToU8(CHAPTER),
      'chapters/es.md': strToU8(CHAPTER),
    });
    const en = await openBundle(bytes);
    expect(en.config.math).toMatchObject({ fontSizeScale: 0.9 * LEGACY_MATH_SIZE, color: { hex: '#123456' } });
    const es = await openBundle(bytes, { locale: 'es' });
    expect(es.config.math).toMatchObject({ fontSizeScale: 1.1 * LEGACY_MATH_SIZE });
    expect(es.config.math?.color).toBeUndefined();
    // The reader's base configuration counts as a layer under the bundle's.
    const read = await readBundle(
      { version: 2, id: 'b', name: 'B', chapters: [{ title: 'S', file: 'c.md' }] },
      async () => strToU8(CHAPTER).buffer as ArrayBuffer,
      { baseConfig: { math: { fontSizeScale: 1.5 } } },
    );
    expect(read.config.math?.fontSizeScale).toBe(1.5 * LEGACY_MATH_SIZE);
  });

  it('writes bundles for today\'s rules, which read back unpinned', async () => {
    const { manifest, bytes } = await createBundle({ name: 'Now', chapters: [{ markdown: CHAPTER }], config: BODY });
    expect(CONFIG_VERSION).toBe(8);
    expect(manifest.configVersion).toBe(8);
    const again = await openBundle(bytes);
    expect(again.config.math).toBeUndefined();
    // …and a 1.4 bundle, opened and written again, is read back as it was
    // opened: pinned once, never twice.
    const old = await openBundle(bundleBytes(BODY));
    const rewritten = await createBundle({ name: 'Again', chapters: old.chapters, config: stripConfigDefaults(old.config) });
    const reread = await openBundle(rewritten.bytes);
    expect(reread.config.math).toEqual(old.config.math);
    expect(laidOut(buildBundle(reread)[0]!)).toEqual(LAID_OUT_BY_1_4_1.BODY);
  });
});

describe('migrateConfig and pinLegacyMathSize', () => {
  it('pins the maths size of a configuration older than 4, once', () => {
    const old: PostextConfig = { math: { fontSizeScale: 1.2 } };
    const once = migrateConfig(old, 3);
    expect(once.math?.fontSizeScale).toBe(1.2 * LEGACY_MATH_SIZE);
    // Stored again under today's rules, it is read as it is.
    expect(migrateConfig(once, CONFIG_VERSION)).toBe(once);
    expect(migrateConfig(old, CONFIG_VERSION)).toBe(old);
  });

  it('skips content with no maths, and pins unknown content', () => {
    const plain: PostextConfig = { bodyText: { fontFamily: 'Georgia' } };
    const prose = migrateConfig(plain, 3, { content: ['# One', 'Prose only.'] });
    expect(prose.math).toBeUndefined();
    expect(prose.bodyText).toBe(plain.bodyText);
    expect(migrateConfig(plain, 3, { content: 'Costs $5.' }).math?.fontSizeScale).toBe(LEGACY_MATH_SIZE);
    expect(migrateConfig(plain, 3).math?.fontSizeScale).toBe(LEGACY_MATH_SIZE);
    expect(migrateConfig(plain, 3, { content: 'Costs $5.' }).bodyText).toBe(plain.bodyText);
  });

  it('writes only what differs from the defaults', () => {
    // 0.884 × 1.131 is the default scale; 0.8 em × 1.131 is the default margin.
    const back = pinLegacyMathSize({ math: { fontSizeScale: 0.442 / 0.5, marginTop: { value: 0.8 * LEGACY_MATH_SIZE, unit: 'em' } } });
    expect(back.math).toEqual({ marginBottom: { value: 0.8 / LEGACY_MATH_SIZE, unit: 'em' } });
    const pinned = pinLegacyMathSize<PostextConfig>({});
    expect(stripConfigDefaults(pinned).math).toEqual(pinned.math);
    const off: PostextConfig = { math: { enabled: false, fontSizeScale: 2 } };
    expect(pinLegacyMathSize(off)).toBe(off);
    // A margin in a page unit stays as written.
    expect(pinLegacyMathSize({ math: { marginTop: { value: 4, unit: 'mm' }, marginBottom: { value: 1, unit: 'rem' } } }).math)
      .toEqual({ fontSizeScale: LEGACY_MATH_SIZE, marginTop: { value: 4, unit: 'mm' }, marginBottom: { value: 1 / LEGACY_MATH_SIZE, unit: 'rem' } });
  });
});
