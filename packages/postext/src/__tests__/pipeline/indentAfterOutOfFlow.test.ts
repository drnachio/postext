import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, Resource, VDTBlock, VDTDocument } from '../../index';

// EF-67: with `indentAfterHeading: false`, the paragraph after a heading is
// set flush. A box or a figure that leaves the flow — a `span: 'side'` box
// set in the side column, a floated or fixed box, a floated figure — is not
// the block before that paragraph: in the column the paragraph still follows
// the heading. postext 1.4.1 counted the box and indented the paragraph.

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
const INDENT_PX = (4 / 25.4) * 150;
const PARAGRAPH = 'Paragraph after the heading, long enough to run over several lines of the main column of the page.';

const CONFIG: PostextConfig = {
  page: { width: mm(180), height: mm(200), dpi: 150, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'oneAndHalf', sideColumnPercent: 30, sideColumnRole: 'floats', sideColumnSide: 'right', gutterWidth: mm(6) },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { firstLineIndent: mm(4), indentAfterHeading: false },
  headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
  calloutStyles: [
    { id: 'box', title: 'Box' },
    { id: 'badge', title: 'Badge', placement: 'fixed', width: 'auto' },
  ],
};

const figure: Resource = {
  id: 'fig',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'A figure.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'fig.png', format: 'png', width: 1000, height: 400 },
  placement: { position: 'top', span: 'page' },
};

function build(md: string, config: PostextConfig = CONFIG): VDTDocument {
  return buildDocument({ markdown: md, resources: [figure] }, config, createMeasurementCache());
}

/** Indent of the first line of the first main-flow paragraph whose text
 *  starts with "Paragraph after". */
function indentOf(doc: VDTDocument): number {
  const p = doc.blocks.find((b: VDTBlock) => b.type === 'paragraph' && b.containerId === undefined && b.lines[0]?.text.startsWith('Paragraph after'))!;
  expect(p, 'paragraph').toBeDefined();
  return p.lines[0]!.bbox.x - p.bbox.x;
}

describe('indentAfterHeading: false and blocks that leave the flow (EF-67)', () => {
  it('the paragraph after a heading is flush, with nothing in between (control)', () => {
    expect(indentOf(build(`# Title\n\n${PARAGRAPH}`))).toBeCloseTo(0, 3);
  });

  it('a side box between the heading and its paragraph leaves it flush', () => {
    const doc = build(`# Title\n\n:::callout{type="box" span="side"}\nSide box.\n:::\n\n${PARAGRAPH}`);
    // The box did go to the side column.
    const frame = doc.blocks.find((b) => b.type === 'callout')!;
    expect(doc.pages[frame.pageIndex]!.columns[frame.columnIndex]!.kind).toBe('side');
    expect(indentOf(doc)).toBeCloseTo(0, 3);
  });

  it('…after an H2 too', () => {
    const doc = build(`# Title\n\nFirst paragraph.\n\n## Section\n\n:::callout{type="box" span="side"}\nSide box.\n:::\n\n${PARAGRAPH}`);
    expect(indentOf(doc)).toBeCloseTo(0, 3);
  });

  it('a floated box, a fixed box and a floated figure leave it flush as well', () => {
    for (const between of [
      ':::callout{type="box" span="page" placement="top"}\nFloated box.\n:::',
      ':::callout{type="badge"}\nFixed box.\n:::',
      '::resource{id="fig"}',
    ]) {
      expect(indentOf(build(`# Title\n\n${between}\n\n${PARAGRAPH}`)), between).toBeCloseTo(0, 3);
    }
  });

  it('a box set in the flow still counts: the paragraph after it is indented', () => {
    const doc = build(`# Title\n\n:::callout{type="box" placement="here"}\nA box in the text.\n:::\n\n${PARAGRAPH}`);
    expect(indentOf(doc)).toBeCloseTo(INDENT_PX, 3);
  });

  it('a side box with no side column to go to stays in the flow and counts', () => {
    const single: PostextConfig = { ...CONFIG, layout: { layoutType: 'single' } };
    const doc = build(`# Title\n\n:::callout{type="box" span="side"}\nSide box.\n:::\n\n${PARAGRAPH}`, single);
    expect(indentOf(doc)).toBeCloseTo(INDENT_PX, 3);
  });

  it('with indentAfterHeading: true nothing changes', () => {
    const on: PostextConfig = { ...CONFIG, bodyText: { firstLineIndent: mm(4), indentAfterHeading: true } };
    expect(indentOf(build(`# Title\n\n:::callout{type="box" span="side"}\nSide box.\n:::\n\n${PARAGRAPH}`, on))).toBeCloseTo(INDENT_PX, 3);
  });
});
