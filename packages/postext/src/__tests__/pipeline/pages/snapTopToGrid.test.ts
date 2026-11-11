import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { resolveMathConfig, stripMathDefaults } from '../../../defaults/text/math.js';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../../../defaults/text/bodyText.js';
import { resolveHeadingsConfig, stripHeadingsDefaults } from '../../../defaults/structure/headings.js';
import type { PostextConfig, Resource } from '../../../types.js';
import type { VDTBlock, VDTDocument } from '../../../vdt.js';

// `snapTopToGrid` per style (#1482): the rule lists have had since EF-103 —
// the space above a block rounds up so it opens on a grid line, its margin a
// minimum — for the body text, paragraph styles, headings, display formulas,
// boxes and resource types. Off by default: the offset an off-grid block
// leaves carries on to the next block that snaps, as before.

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
const mm = (value: number) => ({ value, unit: 'mm' as const });
const GRID = 14;
const BODY = { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0) };

/** A biography set smaller on its own leading, off the grid. */
const BIO = { id: 'bio', fontSize: pt(9), lineHeight: pt(11), snapToGrid: false };
const config = (extra: PostextConfig = {}): PostextConfig => ({
  page: { width: mm(120), height: mm(150), dpi: 72, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  bodyText: BODY,
  paragraphStyles: [BIO],
  headings: { balancing: { enabled: false } },
  ...extra,
});

const figure: Resource = {
  id: 'fig', typeId: 'figure', kind: 'svg', caption: 'Figure.', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'f.svg', width: 400, height: 100 }, placement: { position: 'here' },
};
const build = (md: string, cfg: PostextConfig): VDTDocument =>
  buildDocument({ markdown: md, resources: [figure] }, cfg, createMeasurementCache());
const byText = (doc: VDTDocument, start: string): VDTBlock => doc.blocks.find((b) => b.lines[0]?.text.startsWith(start))!;
const ofType = (doc: VDTDocument, type: VDTBlock['type']): VDTBlock => doc.blocks.find((b) => b.type === type)!;
const top = (doc: VDTDocument, b: VDTBlock): number => b.bbox.y - doc.pages[b.pageIndex]!.columns[b.columnIndex]!.bbox.y;
const onGrid = (doc: VDTDocument, b: VDTBlock): boolean => {
  const v = top(doc, b) / GRID;
  return Math.abs(v - Math.round(v)) < 1e-3;
};

/** Text, then an off-grid group: whatever follows starts off the grid. */
const AFTER_BIO = (tail: string) => `Intro.\n\n:::paragraphs{style="bio"}\nOne.\n\nTwo.\n\nThree.\n:::\n\n${tail}`;

describe('snapTopToGrid, off by default', () => {
  it('leaves the offset of an off-grid group on the text after it', () => {
    const doc = build(AFTER_BIO('After.'), config());
    expect(onGrid(doc, byText(doc, 'After'))).toBe(false);
  });
});

describe('bodyText.snapTopToGrid', () => {
  it('opens the body text after an off-grid group on a grid line', () => {
    const doc = build(AFTER_BIO('After.\n\nNext.'), config({ bodyText: { ...BODY, snapTopToGrid: true } }));
    expect(onGrid(doc, byText(doc, 'After'))).toBe(true);
    expect(onGrid(doc, byText(doc, 'Next'))).toBe(true);
    // The group keeps its own leading, and its first paragraph (a style of
    // its own) is not body text.
    expect(top(doc, byText(doc, 'Two')) - top(doc, byText(doc, 'One'))).toBeCloseTo(11, 3);
  });

  it('opens a blockquote on a grid line too', () => {
    const off = build(AFTER_BIO('> Quoted.'), config());
    expect(onGrid(off, ofType(off, 'blockquote'))).toBe(false);
    const on = build(AFTER_BIO('> Quoted.'), config({ bodyText: { ...BODY, snapTopToGrid: true } }));
    expect(onGrid(on, ofType(on, 'blockquote'))).toBe(true);
  });

  it('opens the paragraph after a heading set off the grid on a grid line', () => {
    const headings = { balancing: { enabled: false }, levels: [{ level: 2, fontSize: pt(13), lineHeight: pt(17), marginTop: pt(5), marginBottom: pt(3), snapToGrid: false }] };
    const md = 'Intro.\n\n## A heading\n\nFirst.';
    const off = build(md, config({ headings }));
    expect(onGrid(off, byText(off, 'First'))).toBe(false);
    const on = build(md, config({ headings, bodyText: { ...BODY, snapTopToGrid: true } }));
    expect(onGrid(on, byText(on, 'First'))).toBe(true);
  });
});

describe('paragraphStyles[].snapTopToGrid', () => {
  const md = AFTER_BIO(':::paragraphs{style="sign"}\nSigned.\n\nDated.\n:::');
  const sign = (snapTopToGrid?: boolean) => ({ id: 'sign', fontSize: pt(9), lineHeight: pt(11), spaceBetween: pt(2), ...(snapTopToGrid !== undefined ? { snapTopToGrid } : {}) });

  it('opens the container on a grid line, its later paragraphs on the style\'s leading', () => {
    const off = build(md, config({ paragraphStyles: [BIO, sign()] }));
    expect(onGrid(off, byText(off, 'Signed'))).toBe(false);
    const on = build(md, config({ paragraphStyles: [BIO, sign(true)] }));
    expect(onGrid(on, byText(on, 'Signed'))).toBe(true);
    expect(top(on, byText(on, 'Dated')) - top(on, byText(on, 'Signed'))).toBeCloseTo(13, 3);
  });
});

describe('headings snapTopToGrid', () => {
  const md = AFTER_BIO('## Section\n\nText.');
  it('opens a heading on a grid line, by the headings-wide value or its level', () => {
    const off = build(md, config());
    expect(onGrid(off, ofType(off, 'heading'))).toBe(false);
    const all = build(md, config({ headings: { balancing: { enabled: false }, snapTopToGrid: true } }));
    expect(onGrid(all, ofType(all, 'heading'))).toBe(true);
    const level = build(md, config({ headings: { balancing: { enabled: false }, levels: [{ level: 2, snapTopToGrid: true }] } }));
    expect(onGrid(level, ofType(level, 'heading'))).toBe(true);
    const otherLevel = build(md, config({ headings: { balancing: { enabled: false }, levels: [{ level: 3, snapTopToGrid: true }] } }));
    expect(onGrid(otherLevel, ofType(otherLevel, 'heading'))).toBe(false);
  });

  it('a heading style sets it too', () => {
    const doc = build(AFTER_BIO('## Section {style="ruled"}\n\nText.'), config({ headingStyles: [{ id: 'ruled', snapTopToGrid: true }] }));
    expect(onGrid(doc, ofType(doc, 'heading'))).toBe(true);
  });

  it('inherits, strips and resolves like snapToGrid', () => {
    expect(resolveHeadingsConfig().snapTopToGrid).toBe(false);
    expect(resolveHeadingsConfig({ snapTopToGrid: true }).levels.every((l) => l.snapTopToGrid)).toBe(true);
    expect(resolveHeadingsConfig({ snapTopToGrid: true, levels: [{ level: 2, snapTopToGrid: false }] }).levels[1]!.snapTopToGrid).toBe(false);
    expect(stripHeadingsDefaults({ snapTopToGrid: false })).toBeUndefined();
    expect(stripHeadingsDefaults({ snapTopToGrid: true, levels: [{ level: 2, snapTopToGrid: true }] })).toEqual({ snapTopToGrid: true });
  });
});

describe('math.snapTopToGrid', () => {
  const md = AFTER_BIO('$$\nx = y\n$$\n\nText.');
  it('opens a display formula on a grid line', () => {
    const off = build(md, config());
    expect(onGrid(off, ofType(off, 'mathDisplay'))).toBe(false);
    const on = build(md, config({ math: { snapTopToGrid: true } }));
    expect(onGrid(on, ofType(on, 'mathDisplay'))).toBe(true);
  });

  it('resolves off, and keeps snapToGrid on by default', () => {
    expect(resolveMathConfig(undefined)).toMatchObject({ snapToGrid: true, snapTopToGrid: false });
    expect(stripMathDefaults({ snapToGrid: true, snapTopToGrid: false })).toBeUndefined();
    expect(stripMathDefaults({ snapTopToGrid: true })).toEqual({ snapTopToGrid: true });
  });
});

describe('calloutStyles[].snapTopToGrid', () => {
  const md = AFTER_BIO(':::callout{type="note"}\nInside.\n:::\n\nText.');
  it('opens an in-flow box on a grid line', () => {
    const off = build(md, config());
    expect(onGrid(off, ofType(off, 'callout'))).toBe(false);
    const on = build(md, config({ calloutStyles: [{ id: 'note', snapTopToGrid: true }] }));
    expect(onGrid(on, ofType(on, 'callout'))).toBe(true);
  });

  it('fits a box with the space it is placed with: it never runs past its column', () => {
    // A box of several lines after an off-grid group, the group growing a
    // line at a time: at some length the rounding is what the box lacks,
    // and it then moves on whole instead of overflowing.
    let moved = 0;
    for (let n = 1; n <= 24; n++) {
      const bio = Array.from({ length: n }, (_, i) => `Bio ${i}.`).join('\n\n');
      const box = Array.from({ length: 6 }, (_, i) => `Line ${i}.`).join('\n\n');
      const doc = build(`Intro.\n\n:::paragraphs{style="bio"}\n${bio}\n:::\n\n:::callout{type="note"}\n${box}\n:::`,
        config({ calloutStyles: [{ id: 'note', snapTopToGrid: true }] }));
      const frame = ofType(doc, 'callout');
      const col = doc.pages[frame.pageIndex]!.columns[frame.columnIndex]!;
      expect(frame.bbox.y + frame.bbox.height, `${n}`).toBeLessThanOrEqual(col.bbox.y + col.bbox.height + 0.01);
      expect(onGrid(doc, frame), `${n}`).toBe(true);
      if (frame.pageIndex > 0) moved++;
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('splits a box at the room left under the rounded space', () => {
    // A box longer than the room, cut where the column ends: its head is
    // cut for the room the rounding leaves, not the room above it. Cut for
    // the room above it, the head did not fit where it was placed and moved
    // whole to the next page, leaving this one a third empty.
    for (let n = 1; n <= 12; n++) {
      const bio = Array.from({ length: n }, (_, i) => `Bio ${i}.`).join('\n\n');
      const box = Array.from({ length: 40 }, (_, i) => `Line ${i}.`).join('\n\n');
      const doc = build(`Intro.\n\n:::paragraphs{style="bio"}\n${bio}\n:::\n\n:::callout{type="note"}\n${box}\n:::`,
        config({ calloutStyles: [{ id: 'note', snapTopToGrid: true, keepTogether: false }] }));
      const frames = doc.blocks.filter((b) => b.type === 'callout');
      expect(frames[0]!.pageIndex, `${n}`).toBe(byText(doc, 'Bio 0').pageIndex);
      for (const frame of frames) {
        const col = doc.pages[frame.pageIndex]!.columns[frame.columnIndex]!;
        expect(frame.bbox.y + frame.bbox.height, `${n}`).toBeLessThanOrEqual(col.bbox.y + col.bbox.height + 0.01);
      }
    }
  });
});

describe('resourceTypes[].snapTopToGrid', () => {
  const md = AFTER_BIO('::resource{id="fig"}\n\nText.');
  it('opens a figure set in the text on a grid line', () => {
    const off = build(md, config());
    expect(onGrid(off, ofType(off, 'resource'))).toBe(false);
    const on = build(md, config({ resourceTypes: [{ id: 'figure', snapTopToGrid: true } as never] }));
    expect(onGrid(on, ofType(on, 'resource'))).toBe(true);
  });
});

describe('the settings at their defaults', () => {
  it('lay a document out as with nothing set: every block in the same place', () => {
    const md = '# Title\n\nIntro.\n\n:::paragraphs{style="bio"}\nOne.\n\nTwo.\n:::\n\n## Section\n\nAfter.\n\n$$\nx = y\n$$\n\n:::callout{type="note"}\nBox.\n:::\n\n::resource{id="fig"}\n\nLast.';
    const plain = build(md, config());
    const explicit = build(md, config({
      bodyText: { ...BODY, snapTopToGrid: false },
      paragraphStyles: [{ ...BIO, snapTopToGrid: false }],
      headings: { balancing: { enabled: false }, regainGrid: false, snapTopToGrid: false },
      math: { snapToGrid: true, snapTopToGrid: false },
      calloutStyles: [{ id: 'note', snapTopToGrid: false }],
    }));
    const places = (doc: VDTDocument) => doc.blocks.map((b) => [b.type, b.pageIndex, b.columnIndex, Math.round(b.bbox.y * 1000)]);
    expect(places(explicit)).toEqual(places(plain));
  });

  it('body text resolves and strips off', () => {
    expect(resolveBodyTextConfig(undefined).snapTopToGrid).toBe(false);
    expect(stripBodyTextDefaults({ snapTopToGrid: false })).toBeUndefined();
    expect(stripBodyTextDefaults({ snapTopToGrid: true })).toEqual({ snapTopToGrid: true });
  });
});
