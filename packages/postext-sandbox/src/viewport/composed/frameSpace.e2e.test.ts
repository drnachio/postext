// #910: a composed frame keeps its blocks in its own coordinates — laid out
// `1 / scale` as large when the reflow ladder scaled its text (#858), and
// upright when it is turned — and the backends paint them through
// `frameMatrix`. The Sandbox's click-to-caret test, its caret and its
// selection read them through the same matrix, so a click in a scaled or
// turned frame lands on the character under the pointer and the marks sit
// on the glyphs (canvas, HTML and Folio share these).

import { describe, expect, it } from 'vitest';
import { buildDocument, frameMatrix, resolveDebugConfig } from 'postext';
import type { PostextConfig, VDTBlock, VDTDocument, VDTFrame } from 'postext';
import { pixelToSourceOffset, xForPlainInLine } from '../canvas/CanvasPreview/geometry.js';
import { drawOverlay } from '../canvas/CanvasPreview/overlay.js';
import { blockFrameMatrix, fromBlockSpace, intoBlockSpace, type FrameAffine } from './frameHit.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx { return new StubCtx(); }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });
const FRAME_CONFIG: PostextConfig = {
  page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
  header: { elements: [] },
  footer: { elements: [] },
  pageTemplates: [{
    id: 't',
    frames: [
      { name: 'turned', width: mm(30), rotate: 90, placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(10), y: mm(40) } } },
      { name: 'small', width: mm(30), placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(80), y: mm(140) } } },
    ],
  }],
} as PostextConfig;

const FRAME_MARKDOWN = [
  '::::page{template="t"}',
  ':::frame{slot="turned"}',
  'Turned words set across the frame, more than one line of them for sure.',
  ':::',
  ':::frame{slot="small"}',
  'Small words in a frame whose text the ladder scaled down to half.',
  ':::',
  '::::',
].join('\n');

/** The layout, with the `small` frame's text scaled to one half the way
 *  the reflow ladder leaves it (#858): its blocks stay where they were laid
 *  out, `1 / scale` as large, and the frame paints them at the scale. */
function framedDoc(): { doc: VDTDocument; turned: VDTFrame; small: VDTFrame } {
  const doc = buildDocument({ markdown: FRAME_MARKDOWN }, FRAME_CONFIG);
  const frames = doc.pages[0]!.composed!.frames;
  const turned = frames.find((f) => f.name === 'turned')!;
  const small = frames.find((f) => f.name === 'small')!;
  small.scale = 0.5;
  return { doc, turned, small };
}

const textBlock = (doc: VDTDocument, frame: VDTFrame): VDTBlock =>
  doc.blocks.find((b) => frame.blockIds.includes(b.id) && b.type !== 'callout' && b.lines.length > 0)!;

/** Where the glyph at plain index `k` of the block's second line is
 *  painted on the page (just inside its left edge, mid-line). */
function glyphOnPage(block: VDTBlock, k: number, m: FrameAffine | null): { x: number; y: number } {
  const line = block.lines[1]!;
  const x = xForPlainInLine(block, line, k, false) + 2;
  const y = line.bbox.y + line.bbox.height / 2;
  return fromBlockSpace(m, x, y);
}

describe('clicks in scaled and turned frames (#910)', () => {
  it('gives every frame block the matrix its frame paints it through', () => {
    const { doc, turned, small } = framedDoc();
    const page = doc.pages[0]!;
    expect(blockFrameMatrix(page, textBlock(doc, turned).id)).toEqual(frameMatrix(turned));
    expect(blockFrameMatrix(page, textBlock(doc, small).id)).toEqual(frameMatrix(small));
    const m = frameMatrix(small) as FrameAffine;
    const p = fromBlockSpace(m, 123, 456);
    const back = intoBlockSpace(m, p.x, p.y);
    expect(back.x).toBeCloseTo(123, 9);
    expect(back.y).toBeCloseTo(456, 9);
  });

  for (const which of ['turned', 'small'] as const) {
    it(`lands a click in the ${which} frame on the character under it`, () => {
      const { doc, ...frames } = framedDoc();
      const frame = frames[which];
      const block = textBlock(doc, frame);
      expect(block.lines.length).toBeGreaterThan(1);
      const m = frameMatrix(frame) as FrameAffine;
      const line = block.lines[1]!;
      for (const k of [0, 3, 7]) {
        const at = glyphOnPage(block, k, m);
        const expected = block.sourceMap![line.plainStart! + k - (block.plainPrefixLen ?? 0)];
        expect(pixelToSourceOffset(doc, 0, at.x, at.y)).toBe(expected);
      }
    });
  }

  it('does not land a click on text the frame clips at its foot', () => {
    const { doc, small } = framedDoc();
    small.scale = 1;
    const block = textBlock(doc, small);
    const line = block.lines[1]!;
    const at = glyphOnPage(block, 3, null);
    // The frame's box ends above the second line: the content overflows.
    small.rect = { ...small.rect, height: line.bbox.y - small.rect.y };
    small.overflowPx = block.bbox.y + block.bbox.height - (small.rect.y + small.rect.height);
    expect(pixelToSourceOffset(doc, 0, at.x, at.y)).toBeNull();
    small.overflowPx = 0;
    expect(pixelToSourceOffset(doc, 0, at.x, at.y)).toBe(block.sourceMap![line.plainStart! + 3 - (block.plainPrefixLen ?? 0)]);
  });

  it('reads an upright frame at full size as before', () => {
    const { doc, small } = framedDoc();
    small.scale = 1;
    const block = textBlock(doc, small);
    expect(blockFrameMatrix(doc.pages[0], block.id)).toBeNull();
    const line = block.lines[1]!;
    const at = glyphOnPage(block, 3, null);
    expect(pixelToSourceOffset(doc, 0, at.x, at.y)).toBe(block.sourceMap![line.plainStart! + 3 - (block.plainPrefixLen ?? 0)]);
  });
});

/** Just enough of an SVG DOM for `drawOverlay` (the suite runs in node). */
class FakeEl {
  readonly attrs = new Map<string, string>();
  readonly style: Record<string, string> = {};
  readonly children: FakeEl[] = [];
  constructor(readonly tag: string, role?: string) {
    if (role) this.attrs.set('data-role', role);
  }
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
  getAttribute(k: string): string | null { return this.attrs.get(k) ?? null; }
  removeAttribute(k: string): void { this.attrs.delete(k); }
  appendChild(c: FakeEl): FakeEl { this.children.push(c); return c; }
  removeChild(c: FakeEl): FakeEl { this.children.splice(this.children.indexOf(c), 1); return c; }
  get firstChild(): FakeEl | null { return this.children[0] ?? null; }
  get firstElementChild(): FakeEl | null { return this.children[0] ?? null; }
  querySelector(sel: string): FakeEl | null {
    const role = /data-role="([^"]+)"/.exec(sel)?.[1];
    for (const c of this.children) if (c.attrs.get('data-role') === role) return c;
    return null;
  }
}
(globalThis as unknown as { document: unknown }).document = { createElementNS: (_ns: string, tag: string) => new FakeEl(tag) };

function overlaySvg(): { svg: SVGSVGElement; selection: FakeEl; caret: FakeEl } {
  const svg = new FakeEl('svg');
  const selection = svg.appendChild(new FakeEl('g', 'selection'));
  const cursor = svg.appendChild(new FakeEl('g', 'cursor'));
  const caret = cursor.appendChild(new FakeEl('rect'));
  svg.appendChild(new FakeEl('g', 'looseLines'));
  return { svg: svg as unknown as SVGSVGElement, selection, caret };
}

describe('the caret and the selection in scaled and turned frames (#910)', () => {
  const debug = resolveDebugConfig();
  const matrixAttr = (f: VDTFrame) => `matrix(${(frameMatrix(f) as FrameAffine).join(' ')})`;

  for (const which of ['turned', 'small'] as const) {
    it(`sets the caret in the ${which} frame through its matrix`, () => {
      const { doc, ...frames } = framedDoc();
      const frame = frames[which];
      const block = textBlock(doc, frame);
      const head = block.sourceMap![block.lines[1]!.plainStart! + 3 - (block.plainPrefixLen ?? 0)]!;
      const { svg, caret } = overlaySvg();
      const rect = drawOverlay(svg, doc, 0, { from: head, to: head, head }, debug, true, doc.blocks.indexOf(block));
      expect(rect).toBe(caret);
      expect(caret.getAttribute('transform')).toBe(matrixAttr(frame));
      // In the block's own coordinates: on the glyph its line paints.
      const line = block.lines[1]!;
      expect(Number(caret.getAttribute('y'))).toBeCloseTo(line.bbox.y, 6);
      expect(Number(caret.getAttribute('x')) + 1.5).toBeCloseTo(xForPlainInLine(block, line, 3, false), 6);
    });

    it(`draws a selection in the ${which} frame through its matrix`, () => {
      const { doc, ...frames } = framedDoc();
      const frame = frames[which];
      const block = textBlock(doc, frame);
      const { svg, selection } = overlaySvg();
      drawOverlay(svg, doc, 0, { from: block.sourceStart!, to: block.sourceEnd!, head: block.sourceEnd! }, debug, true, doc.blocks.indexOf(block));
      const marks = selection.children.filter((r) => Number(r.getAttribute('y')) >= block.bbox.y - 1 && Number(r.getAttribute('y')) <= block.bbox.y + block.bbox.height);
      expect(marks.length).toBe(block.lines.length);
      for (const r of marks) expect(r.getAttribute('transform')).toBe(matrixAttr(frame));
    });
  }

  it('takes the matrix off the caret once it leaves the frame', () => {
    const { doc, turned, small } = framedDoc();
    small.scale = 1;
    const { svg, caret } = overlaySvg();
    const inTurned = textBlock(doc, turned);
    drawOverlay(svg, doc, 0, { from: inTurned.sourceStart!, to: inTurned.sourceStart!, head: inTurned.sourceStart! }, debug, true, doc.blocks.indexOf(inTurned));
    expect(caret.getAttribute('transform')).toBe(matrixAttr(turned));
    const upright = textBlock(doc, small);
    drawOverlay(svg, doc, 0, { from: upright.sourceStart!, to: upright.sourceStart!, head: upright.sourceStart! }, debug, true, doc.blocks.indexOf(upright));
    expect(caret.getAttribute('transform')).toBeNull();
  });
});
