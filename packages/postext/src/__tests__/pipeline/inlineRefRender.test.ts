import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { PostextContent, Resource } from '../../types';

// The build pipeline measures text via an OffscreenCanvas 2D context. The node
// test environment has none, so install a deterministic stub (width ∝ length)
// before any measurement runs. Exact widths don't matter here — the assertions
// are about segment text, ref tagging, and source offsets, and the inputs are
// short enough never to wrap.
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

const now = 0;

const figure = (id: string): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'A test figure.',
  createdAt: now,
  updatedAt: now,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 100, height: 80 },
});

/** Collect every rendered text segment across all paragraph blocks. */
const paragraphSegments = (content: PostextContent) => {
  const doc = buildDocument(content);
  const segs: { text: string; refResourceId?: string }[] = [];
  for (const block of doc.blocks) {
    if (block.type !== 'paragraph') continue;
    for (const line of block.lines) {
      for (const seg of line.segments ?? []) {
        segs.push({ text: seg.text, refResourceId: seg.refResourceId });
      }
    }
  }
  return segs;
};

describe('inline :ref rendering in body text', () => {
  it('renders the computed number for a :ref inside a paragraph', () => {
    const content: PostextContent = {
      markdown: 'As shown in :ref{id="fig-a"}, the result holds.',
      resources: [figure('fig-a')],
    };
    const segs = paragraphSegments(content);

    // The reference must appear as a tagged, atomic segment carrying the label.
    const refSeg = segs.find((s) => s.refResourceId === 'fig-a');
    expect(refSeg).toBeDefined();
    // Default style: short label + number ("Fig." + NBSP + "1"). With no h1 in
    // the document the "{h1}." part of the template collapses away.
    expect(refSeg!.text).toBe('Fig. 1');

    // The raw directive must not leak into the rendered text.
    const joined = segs.map((s) => s.text).join('');
    expect(joined).not.toContain(':ref{');
    expect(joined).toContain('Fig. 1');
  });

  it('honours style="number" and style="full"', () => {
    const number = paragraphSegments({
      markdown: 'See :ref{id="fig-a" style="number"}.',
      resources: [figure('fig-a')],
    }).find((s) => s.refResourceId === 'fig-a');
    expect(number!.text).toBe('1');

    const full = paragraphSegments({
      markdown: 'See :ref{id="fig-a" style="full"}.',
      resources: [figure('fig-a')],
    }).find((s) => s.refResourceId === 'fig-a');
    expect(full!.text).toBe('Figure 1');
  });

  it('uses verbatim override text', () => {
    const seg = paragraphSegments({
      markdown: 'See :ref{id="fig-a" text="the diagram"}.',
      resources: [figure('fig-a')],
    }).find((s) => s.refResourceId === 'fig-a');
    expect(seg!.text).toBe('the diagram');
  });

  it('case=lower lowercases the label but not the number', () => {
    const seg = paragraphSegments({
      markdown: 'See :ref{id="fig-a" case="lower"}.',
      resources: [figure('fig-a')],
    }).find((s) => s.refResourceId === 'fig-a');
    // Label lowercased, NBSP kept, number untouched.
    expect(seg!.text).toBe('fig.\u00A01');

    const full = paragraphSegments({
      markdown: 'See :ref{id="fig-a" style="full" case="lower"}.',
      resources: [figure('fig-a')],
    }).find((s) => s.refResourceId === 'fig-a');
    expect(full!.text).toBe('figure\u00A01');
  });

  it('case=upper uppercases the label but not the number', () => {
    const seg = paragraphSegments({
      markdown: 'See :ref{id="fig-a" style="full" case="upper"}.',
      resources: [figure('fig-a')],
    }).find((s) => s.refResourceId === 'fig-a');
    expect(seg!.text).toBe('FIGURE\u00A01');
  });

  it('case=capitalize capitalizes the label', () => {
    // A lower-case type so the transform is observable on the label.
    const doc = buildDocument(
      { markdown: 'See :ref{id="fig-a" case="capitalize"}.', resources: [figure('fig-a')] },
      {
        resourceTypes: [
          {
            id: 'figure',
            name: 'figure',
            shortLabel: 'fig.',
            numberingTemplate: '{n}',
            resetOn: 'never',
            counterFormat: 'decimal',
            captionPrefix: 'Figure',
          },
        ],
      },
    );
    const para = doc.blocks.find((b) => b.type === 'paragraph')!;
    const seg = (para.lines[0]!.segments ?? []).find((s) => s.refResourceId === 'fig-a');
    expect(seg!.text).toBe('Fig.\u00A01');
  });

  it('case has no effect on style="number"', () => {
    const seg = paragraphSegments({
      markdown: 'See :ref{id="fig-a" style="number" case="upper"}.',
      resources: [figure('fig-a')],
    }).find((s) => s.refResourceId === 'fig-a');
    expect(seg!.text).toBe('1');
  });

  it('text override ignores case', () => {
    const seg = paragraphSegments({
      markdown: 'See :ref{id="fig-a" text="the Diagram" case="upper"}.',
      resources: [figure('fig-a')],
    }).find((s) => s.refResourceId === 'fig-a');
    expect(seg!.text).toBe('the Diagram');
  });

  it('styles references bold + emphasis colour by default, and honours overrides', () => {
    const md = 'See :ref{id="fig-a"} now.';
    // Default: emphasis colour (#295AA3) on the block, ref segment bold.
    const doc = buildDocument({ markdown: md, resources: [figure('fig-a')] });
    const para = doc.blocks.find((b) => b.type === 'paragraph')!;
    expect(para.refColor?.toLowerCase()).toBe('#295aa3');
    const refSeg = (para.lines[0]!.segments ?? []).find((s) => s.refResourceId === 'fig-a');
    expect(refSeg?.bold).toBe(true);

    // Custom reference colour + non-bold applies.
    const doc2 = buildDocument(
      { markdown: md, resources: [figure('fig-a')] },
      { bodyText: { referenceColor: { hex: '#ff0000', model: 'hex' }, referenceBold: false } },
    );
    const para2 = doc2.blocks.find((b) => b.type === 'paragraph')!;
    expect(para2.refColor?.toLowerCase()).toBe('#ff0000');
    const refSeg2 = (para2.lines[0]!.segments ?? []).find((s) => s.refResourceId === 'fig-a');
    expect(refSeg2?.bold).toBeFalsy();
  });

  it('keeps source mapping aligned for text after a ref', () => {
    const md = 'A :ref{id="fig-a"} B';
    const doc = buildDocument({ markdown: md, resources: [figure('fig-a')] });
    const para = doc.blocks.find((b) => b.type === 'paragraph');
    expect(para).toBeDefined();
    const line = para!.lines[0]!;
    // The trailing "B" maps back to its real source offset, not the block end —
    // i.e. the multi-char label did not push subsequent offsets out of range.
    expect(line.sourceEnd).toBe(md.length);
  });
});
