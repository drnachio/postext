import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, Resource, VDTColumn, VDTDocument } from '../../../index.js';

// A resource placed after the paragraph that cites it (`position:
// 'paragraph'`, this fork) is set as a `::resource` line right after that
// paragraph would set it (`position: 'here'`): text wrapped round it
// (#627, #883) and its caption beside it (#729, #1106) included.

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
const SINGLE: PostextConfig = {
  page: { dpi: 72, width: pt(300), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Test', fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), textAlign: 'justify', boldFontWeight: 700, hyphenation: { enabled: false } },
};
/** One-and-a-half layout whose side column takes floats only. */
const SIDE: PostextConfig = {
  page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(30), right: pt(20), mirror: true } },
  layout: { layoutType: 'oneAndHalf', gutterWidth: pt(10), sideColumnPercent: 30, sideColumnRole: 'floats', sideColumnSide: 'outer' },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
};

const sentence = 'The heap needs a cubic metre of mixed waste before it holds its heat.';
const para = (n: number) => Array.from({ length: n }, () => sentence).join(' ');
const CITED = `${para(2)} See :ref{id="fig"}.`;
/** The same text: the figure where a `::resource` line would stand, or
 *  after its paragraph with no line. */
const HERE_MD = `${CITED}\n\n::resource{id="fig"}\n\n${para(8)}`;
const AFTER_MD = `${CITED}\n\n${para(8)}`;

const figure = (placement: Resource['placement'], kind: 'svg' | 'bitmap' = 'svg'): Resource => ({
  id: 'fig',
  typeId: 'figure',
  kind,
  caption: 'A bed of mixed waste, with a caption long enough to take a few lines.',
  note: 'Source: the allotment.',
  createdAt: 0,
  updatedAt: 0,
  ...(kind === 'svg' ? { svg: { fileId: 'fig.svg', width: 400, height: 300 } } : { bitmap: { fileId: 'fig.png', format: 'png', width: 400, height: 300 } }),
  placement,
});

const build = (md: string, resource: Resource, cfg: PostextConfig): VDTDocument =>
  buildDocument({ markdown: md, resources: [resource] }, cfg, createMeasurementCache());

/** Where everything stands: blocks, their lines, the resource's parts and
 *  the columns' exclusions, page by page. */
const geometry = (doc: VDTDocument) =>
  doc.pages.map((p) => p.columns.map((c: VDTColumn) => ({
    kind: c.kind,
    exclusions: c.exclusions ?? [],
    blocks: c.blocks.map((b) => ({
      type: b.type,
      bbox: b.bbox,
      lines: b.lines.map((l) => [l.text, l.bbox]),
      body: b.resourceBlock?.bodyRect,
      caption: b.resourceBlock?.captionLines.map((l) => [l.text, l.bbox]),
      note: b.resourceBlock?.noteLines.map((l) => [l.text, l.bbox]),
    })),
  })));

/** Both settings of the same figure: placed here and after its paragraph. */
const both = (placement: Resource['placement'], cfg: PostextConfig, kind: 'svg' | 'bitmap' = 'svg') => ({
  here: build(HERE_MD, figure({ ...placement, position: 'here' }, kind), cfg),
  after: build(AFTER_MD, figure({ ...placement, position: 'paragraph' }, kind), cfg),
});

describe('a resource placed after its paragraph is set as one placed here', () => {
  it('with text wrapped round it, at either side', () => {
    for (const wrap of ['left', 'right'] as const) {
      const { here, after } = both({ wrap, width: 0.4 }, SINGLE);
      expect(here.pages[0]!.columns[0]!.exclusions, wrap).toHaveLength(1);
      expect(geometry(after), wrap).toEqual(geometry(here));
    }
  });

  it('with text wrapped round its contour', () => {
    const { here, after } = both({ wrap: 'contour', align: 'right', width: 0.4 }, SINGLE, 'bitmap');
    expect(here.pages[0]!.columns[0]!.exclusions?.length).toBeGreaterThan(0);
    expect(geometry(after)).toEqual(geometry(here));
  });

  it('with its caption in the float-only side column', () => {
    const { here, after } = both({ captionSide: true }, SIDE, 'bitmap');
    const embed = (doc: VDTDocument) => doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.filter((b) => b.resourceBlock)))[0]!;
    const side = after.pages[0]!.columns.find((c) => c.kind === 'side')!;
    // The caption stands in the side column, level with the body's top.
    const caption = embed(after).resourceBlock!.captionLines;
    expect(caption.length).toBeGreaterThan(0);
    expect(caption[0]!.bbox.x).toBeCloseTo(side.bbox.x, 3);
    expect(caption[0]!.bbox.y).toBeCloseTo(embed(after).bbox.y, 3);
    expect(geometry(after)).toEqual(geometry(here));
  });

  it('with its caption beside it inside its slot', () => {
    const { here, after } = both({ captionSide: 'inside', width: 0.5 }, SINGLE, 'bitmap');
    expect(geometry(after)).toEqual(geometry(here));
  });
});
