import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { resolvePageConfig, stripPageDefaults } from '../../../defaults/page.js';
import { resolveMathConfig, stripMathDefaults } from '../../../defaults/text/math.js';
import type { PostextConfig } from '../../../types.js';
import type { VDTBlock, VDTDocument } from '../../../vdt.js';

// `page.baselineGrid.perStyle`: each style decides for itself whether it
// sits on the grid. Up to now an off-grid style left the flow off the grid
// until the next block that snaps, so its offset cascaded into the text
// after it.

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

const config = (perStyle: boolean, extra: PostextConfig = {}): PostextConfig => ({
  page: { width: mm(120), height: mm(150), dpi: 72, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) },
    baselineGrid: { enabled: false, perStyle } },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0) },
  // A biography: smaller type on its own leading, off the grid.
  paragraphStyles: [{ id: 'bio', fontSize: pt(9), lineHeight: pt(11), snapToGrid: false }],
  headings: { balancing: { enabled: false } },
  ...extra,
});

const build = (md: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());
const byText = (doc: VDTDocument, start: string): VDTBlock => doc.blocks.find((b) => b.lines[0]?.text.startsWith(start))!;
const top = (doc: VDTDocument, b: VDTBlock): number => b.bbox.y - doc.pages[b.pageIndex]!.columns[b.columnIndex]!.bbox.y;
const onGrid = (v: number): boolean => Math.abs(v / GRID - Math.round(v / GRID)) < 1e-3;

const BIO_THEN_TEXT = 'Intro.\n\n:::paragraphs{style="bio"}\nOne.\n\nTwo.\n\nThree.\n:::\n\nAfter.';

describe('page.baselineGrid.perStyle', () => {
  it('cascades by default: the text after an off-grid group stays off the grid', () => {
    const doc = build(BIO_THEN_TEXT, config(false));
    expect(onGrid(top(doc, byText(doc, 'After')))).toBe(false);
  });

  it('per style: the body text after an off-grid group opens on a grid line', () => {
    const doc = build(BIO_THEN_TEXT, config(true));
    expect(onGrid(top(doc, byText(doc, 'After')))).toBe(true);
    // The group itself keeps its own leading.
    const step = top(doc, byText(doc, 'Two')) - top(doc, byText(doc, 'One'));
    expect(step).toBeCloseTo(11, 3);
  });

  it('per style: an off-grid heading does not carry its offset into the text', () => {
    const cfg = (perStyle: boolean) => config(perStyle, {
      headings: { balancing: { enabled: false }, levels: [{ level: 2, fontSize: pt(13), lineHeight: pt(17), marginTop: pt(5), marginBottom: pt(3), snapToGrid: false }] },
    });
    const md = 'Intro.\n\n## A heading\n\nAfter.';
    expect(onGrid(top(build(md, cfg(false)), byText(build(md, cfg(false)), 'After')))).toBe(false);
    const doc = build(md, cfg(true));
    expect(onGrid(top(doc, byText(doc, 'After')))).toBe(true);
  });

  it('per style: a group that sits on the grid opens on a line after an off-grid one', () => {
    const doc = build(
      'Intro.\n\n:::paragraphs{style="bio"}\nOne.\n\nTwo.\n:::\n\n:::paragraphs{style="firma"}\nSigned.\n:::',
      config(true, { paragraphStyles: [{ id: 'bio', fontSize: pt(9), lineHeight: pt(11), snapToGrid: false }, { id: 'firma', textAlign: 'right' }] }),
    );
    expect(onGrid(top(doc, byText(doc, 'Signed')))).toBe(true);
  });

  it('per style: an off-grid group opens where the text above ends, not on a line', () => {
    const doc = build(
      'Intro.\n\n:::paragraphs{style="bio"}\nOne.\n\nTwo.\n:::\n\n:::paragraphs{style="bio2"}\nOther.\n:::',
      config(true, { paragraphStyles: [{ id: 'bio', fontSize: pt(9), lineHeight: pt(11), snapToGrid: false },
        { id: 'bio2', fontSize: pt(9), lineHeight: pt(11), snapToGrid: false }] }),
    );
    const gap = top(doc, byText(doc, 'Other')) - top(doc, byText(doc, 'Two'));
    expect(gap).toBeCloseTo(11, 3);
  });

  it('per style: body text off the grid follows the block before it', () => {
    const doc = build(BIO_THEN_TEXT, config(true, { bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), snapToGrid: false } }));
    expect(onGrid(top(doc, byText(doc, 'After')))).toBe(false);
  });

  it('per style: the first paragraph after a heading has its own switch', () => {
    const headings = { balancing: { enabled: false }, levels: [{ level: 2, fontSize: pt(13), lineHeight: pt(17), marginTop: pt(5), marginBottom: pt(3), snapToGrid: false }] };
    const md = 'Intro.\n\n## A heading\n\nFirst.\n\nSecond.';
    const off = build(md, config(true, { headings, bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), firstParagraphSnapToGrid: false } }));
    expect(onGrid(top(off, byText(off, 'First')))).toBe(false);
    const on = build(md, config(true, { headings }));
    expect(onGrid(top(on, byText(on, 'First')))).toBe(true);
  });
});

describe('grid settings in the config', () => {
  it('perStyle resolves to false and is kept only when set', () => {
    expect(resolvePageConfig(undefined).baselineGrid.perStyle).toBe(false);
    expect(resolvePageConfig({ baselineGrid: { enabled: false, perStyle: true } }).baselineGrid.perStyle).toBe(true);
    expect(stripPageDefaults({ baselineGrid: { enabled: false, perStyle: true } })?.baselineGrid).toEqual({ enabled: false, perStyle: true });
    expect(stripPageDefaults({ baselineGrid: { enabled: false, perStyle: false } })).toBeUndefined();
  });

  it('math.snapToGrid defaults to true', () => {
    expect(resolveMathConfig(undefined).snapToGrid).toBe(true);
    expect(stripMathDefaults({ snapToGrid: true })).toBeUndefined();
    expect(stripMathDefaults({ snapToGrid: false })).toEqual({ snapToGrid: false });
  });
});

describe('the grid settings at their defaults', () => {
  it('lay a document out as before: the same place for every block', () => {
    const md = '# Title\n\nIntro.\n\n:::paragraphs{style="bio"}\nOne.\n\nTwo.\n:::\n\n## Section\n\nAfter.\n\n$$\nx = y\n$$\n\nLast.';
    const plain = build(md, config(false));
    const explicit = build(md, config(false, {
      bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), snapToGrid: true, firstParagraphSnapToGrid: true },
      headings: { balancing: { enabled: false }, regainGrid: false },
      math: { snapToGrid: true },
    }));
    const places = (doc: VDTDocument) => doc.blocks.map((b) => [b.pageIndex, b.columnIndex, Math.round(b.bbox.y * 1000)]);
    expect(places(explicit)).toEqual(places(plain));
  });
});

