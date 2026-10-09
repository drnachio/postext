import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { resolveLayoutConfig, stripLayoutDefaults } from '../../defaults';
import { CONFIG_VERSION, migrateConfig, pinLegacyBoxChildCut } from '../../bundle';
import { migrateBundleConfig } from '../../bundle/configVersion';
import type { VDTBlock, VDTDocument } from '../../vdt';
import type { PostextConfig } from '../../types';

// EF-115: `splitMinLines` is the fewest text lines a split leaves on each
// side of a cut, counting every line of the box on that side. A cut inside
// a paragraph or list item only checked that count, so a two-line list item
// split one and one, an orphan at the foot of the column and a widow at the
// head of the next. Now such a cut also leaves at least two lines of the
// child on each side (one when `splitMinLines` is 1). The two is
// `layout.boxChildSplitMinLines`; configurations stored before rules 6 are
// read with 1, the 1.4 cut.

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const config = (splitMinLines?: number): PostextConfig => ({
  headings: { balancing: { enabled: false } },
  page: { width: mm(120), height: mm(70), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  calloutStyles: [{ id: 'kp', keepTogether: false, ...(splitMinLines !== undefined ? { splitMinLines } : {}) }],
});

const build = (md: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());
const frames = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'callout');
const childrenOf = (doc: VDTDocument, frame: VDTBlock): VDTBlock[] =>
  doc.blocks.filter((b) => b.containerId === frame.containerId && b.type !== 'callout'
    && b.pageIndex === frame.pageIndex && b.columnIndex === frame.columnIndex);

const SENTENCE = 'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos. ';
// Each item sets on `lines` lines of the 100 mm measure (about 160 characters a line).
const item = (i: number, lines: number): string =>
  `- Paso ${i + 1}: ${'numera las horas en las dos caras del cuadrante. '.repeat(Math.ceil((lines - 1) * 3.3) + 1).trim()}`;

/** The cuts that fell inside a child: the lines of that child on each side. */
function cutsInsideChildren(doc: VDTDocument): { before: number; after: number }[] {
  const parts = frames(doc);
  const out: { before: number; after: number }[] = [];
  for (let i = 0; i + 1 < parts.length; i++) {
    const head = childrenOf(doc, parts[i]!);
    const rest = childrenOf(doc, parts[i + 1]!);
    const last = head[head.length - 1];
    const first = rest[0];
    if (last && first && last.contentIndex === first.contentIndex) {
      out.push({ before: last.lines.length, after: first.lines.length });
    }
  }
  return out;
}

describe('a cut inside a child never leaves a lone line of it (EF-115)', () => {
  it('the items set as intended', () => {
    const doc = build([':::callout{type="kp"}', item(0, 2), item(1, 3), item(2, 4), ':::'].join('\n'), { ...config(), page: { ...config().page!, height: mm(400) } });
    expect(childrenOf(doc, frames(doc)[0]!).map((c) => c.lines.length)).toEqual([2, 3, 4]);
  });

  for (const [name, lines] of [['two-line', 2], ['three-line', 3]] as const) {
    it(`never splits a ${name} list item (each side would hold fewer than 2 of its lines)`, () => {
      let splits = 0;
      for (let n = 1; n <= 12; n++) {
        const md = [SENTENCE.repeat(n).trim(), '', ':::callout{type="kp"}', ...Array.from({ length: 8 }, (_, i) => item(i, lines)), ':::'].join('\n');
        const doc = build(md, config());
        if (frames(doc).length > 1) splits++;
        expect(cutsInsideChildren(doc)).toEqual([]);
      }
      expect(splits).toBeGreaterThan(0);
    }, 30_000);
  }

  it('splits a four-line item two and two, never one and three', () => {
    let inside = 0;
    for (let n = 1; n <= 12; n++) {
      const md = [SENTENCE.repeat(n).trim(), '', ':::callout{type="kp"}', ...Array.from({ length: 5 }, (_, i) => item(i, 4)), ':::'].join('\n');
      for (const cut of cutsInsideChildren(build(md, config()))) {
        expect(cut).toEqual({ before: 2, after: 2 });
        inside++;
      }
    }
    expect(inside).toBeGreaterThan(0);
  }, 30_000);

  it('splitMinLines: 3 still counts every line of each side, and cuts inside an item two and two', () => {
    let inside = 0;
    for (let n = 1; n <= 12; n++) {
      const md = [SENTENCE.repeat(n).trim(), '', ':::callout{type="kp"}', ...Array.from({ length: 5 }, (_, i) => item(i, 4)), ':::'].join('\n');
      const doc = build(md, config(3));
      for (const cut of cutsInsideChildren(doc)) {
        expect(cut.before).toBeGreaterThanOrEqual(2);
        expect(cut.after).toBeGreaterThanOrEqual(2);
        inside++;
      }
      for (const part of frames(doc)) {
        const lines = childrenOf(doc, part).reduce((sum, c) => sum + c.lines.length, 0);
        expect(lines).toBeGreaterThanOrEqual(3);
      }
    }
    // A 2|2 cut inside an item is allowed: each side holds other lines too.
    expect(inside).toBeGreaterThan(0);
  }, 30_000);

  it('splitMinLines: 3 does not split a box of one four-line item (each side would hold 2 lines)', () => {
    for (let n = 1; n <= 12; n++) {
      const md = [SENTENCE.repeat(n).trim(), '', ':::callout{type="kp"}', item(0, 4), ':::'].join('\n');
      const doc = build(md, config(3));
      expect(frames(doc)).toHaveLength(1);
    }
  }, 30_000);

  it('splitMinLines: 1 lets a two-line item split one and one', () => {
    let inside = 0;
    for (let n = 1; n <= 12; n++) {
      const md = [SENTENCE.repeat(n).trim(), '', ':::callout{type="kp"}', ...Array.from({ length: 8 }, (_, i) => item(i, 2)), ':::'].join('\n');
      for (const cut of cutsInsideChildren(build(md, config(1)))) {
        expect(cut).toEqual({ before: 1, after: 1 });
        inside++;
      }
    }
    expect(inside).toBeGreaterThan(0);
  }, 30_000);
});

describe('layout.boxChildSplitMinLines', () => {
  const twoLineItems = (n: number): string =>
    [SENTENCE.repeat(n).trim(), '', ':::callout{type="kp"}', ...Array.from({ length: 8 }, (_, i) => item(i, 2)), ':::'].join('\n');

  it('1 lets a cut leave one line of a two-line item, as postext 1.4 did', () => {
    let inside = 0;
    for (let n = 1; n <= 12; n++) {
      const cfg = config();
      for (const cut of cutsInsideChildren(build(twoLineItems(n), { ...cfg, layout: { ...cfg.layout, boxChildSplitMinLines: 1 } }))) {
        expect(cut).toEqual({ before: 1, after: 1 });
        inside++;
      }
    }
    expect(inside).toBeGreaterThan(0);
  }, 30_000);

  it('3 keeps three lines of a paragraph or item on each side where the style allows it', () => {
    let inside = 0;
    for (let n = 1; n <= 12; n++) {
      const md = [SENTENCE.repeat(n).trim(), '', ':::callout{type="kp"}', ...Array.from({ length: 4 }, (_, i) => item(i, 6)), ':::'].join('\n');
      const cfg = config(3);
      for (const cut of cutsInsideChildren(build(md, { ...cfg, layout: { ...cfg.layout, boxChildSplitMinLines: 3 } }))) {
        expect(cut.before).toBeGreaterThanOrEqual(3);
        expect(cut.after).toBeGreaterThanOrEqual(3);
        inside++;
      }
    }
    expect(inside).toBeGreaterThan(0);
  }, 30_000);

  it('resolves a whole number of lines, at least one, and strips the default', () => {
    expect(resolveLayoutConfig().boxChildSplitMinLines).toBe(2);
    expect(resolveLayoutConfig({ boxChildSplitMinLines: 1 }).boxChildSplitMinLines).toBe(1);
    expect(resolveLayoutConfig({ boxChildSplitMinLines: 0 }).boxChildSplitMinLines).toBe(2);
    expect(resolveLayoutConfig({ boxChildSplitMinLines: 1.5 }).boxChildSplitMinLines).toBe(2);
    expect(stripLayoutDefaults({ boxChildSplitMinLines: 2 })).toBeUndefined();
    expect(stripLayoutDefaults({ boxChildSplitMinLines: 1 })).toEqual({ boxChildSplitMinLines: 1 });
  });

  it('is pinned to 1 for configurations stored before rules 6 whose book holds a box', () => {
    const cfg: PostextConfig = { layout: { layoutType: 'single', inlineResourceGap: 'around', inlineResourceGapInBoxes: true } };
    const box = twoLineItems(3);
    expect(CONFIG_VERSION).toBe(10);
    // Unversioned (1.4) and stamped 5 (a 1.5 prerelease): pinned.
    expect(migrateConfig(cfg, undefined, { content: box }).layout?.boxChildSplitMinLines).toBe(1);
    expect(migrateConfig(cfg, 5, { content: ['No box here.', box] }).layout?.boxChildSplitMinLines).toBe(1);
    // Unknown content: pinned.
    expect(migrateConfig(cfg, 5).layout?.boxChildSplitMinLines).toBe(1);
    // Today's rules, a book with no box, or a configuration that names the
    // setting: as it is.
    expect(migrateConfig(cfg, CONFIG_VERSION, { content: box })).toBe(cfg);
    expect(migrateConfig(cfg, 5, { content: `${SENTENCE}\n\nA mention of \`:::callout\` in the text.` })).toBe(cfg);
    const named: PostextConfig = { layout: { boxChildSplitMinLines: 2 } };
    expect(pinLegacyBoxChildCut(named)).toBe(named);
    expect(pinLegacyBoxChildCut({} as PostextConfig).layout).toEqual({ boxChildSplitMinLines: 1 });
    expect(migrateBundleConfig({}, [cfg], 5, { content: box }).layout?.boxChildSplitMinLines).toBe(1);
  });

  it('lays a book stored before rules 6 out with the 1.4 cuts', () => {
    let inside = 0;
    for (let n = 1; n <= 12; n++) {
      const md = twoLineItems(n);
      const stored = config();
      for (const cut of cutsInsideChildren(build(md, migrateConfig(stored, undefined, { content: md })))) {
        expect(cut).toEqual({ before: 1, after: 1 });
        inside++;
      }
      expect(cutsInsideChildren(build(md, migrateConfig(stored, CONFIG_VERSION, { content: md })))).toEqual([]);
    }
    expect(inside).toBeGreaterThan(0);
  }, 60_000);
});
