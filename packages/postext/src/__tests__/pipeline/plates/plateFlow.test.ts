import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { buildBundle } from '../../../bundle/index.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, Resource, VDTDocument } from '../../../index.js';
import { config, mm, para, bitmap, svg, floatOf, textOn, plateAlone, fillOf } from './fixture.js';

// Where a full-page plate goes in the flow (#1461): a page of its own it
// can have whole, after the page that cites it, whatever else waits.

const build = (md: string, resources: Resource[], cfg: PostextConfig = config): VDTDocument =>
  buildDocument({ markdown: md, resources }, cfg, createMeasurementCache());

describe('a plate in the flow', () => {
  it('sets two plates cited together on two pages of their own, both whole', () => {
    const md = `${para(6)} See :ref{id="a"} and :ref{id="b"}. ${para(50)}`;
    const doc = build(md, [svg('a', 300, 400), svg('b', 300, 400)]);
    const a = floatOf(doc, 'a')!;
    const b = floatOf(doc, 'b')!;
    expect(b.page.index).toBe(a.page.index + 1);
    expect(plateAlone(a.page, 'a')).toBe(true);
    expect(plateAlone(b.page, 'b')).toBe(true);
    // The second waits for a page of its own instead of shrinking into
    // what the first leaves.
    expect(fillOf(b)).toBeCloseTo(fillOf(a), 2);
    expect(b.block.resourceBlock!.bodyRect.height).toBeCloseTo(a.block.resourceBlock!.bodyRect.height, 3);
    expect(textOn(doc.pages[b.page.index + 1]!)).toBeGreaterThan(0);
  });

  it('sets a plate cited at the very end of a chapter after its last page', () => {
    const md = `${para(12)} See :ref{id="a"}.`;
    const doc = build(md, [svg('a', 300, 400)]);
    const a = floatOf(doc, 'a')!;
    expect(a.page.index).toBe(doc.pages.length - 1);
    expect(plateAlone(a.page, 'a')).toBe(true);
    expect(textOn(doc.pages[a.page.index - 1]!)).toBeGreaterThan(0);
    expect(fillOf(a)).toBeGreaterThan(0.8);
  });

  it('waits for a page it can have whole, never shrinking into a page another float heads', () => {
    // A page-span table cited with the plate takes the head of the next
    // fresh page first: the plate goes on to the page after it.
    const table: Resource = {
      id: 't', typeId: 'table', kind: 'table', caption: 'Yields.', createdAt: 0, updatedAt: 0,
      placement: { span: 'page', position: 'top' },
      table: { model: { rows: [[{ content: 'Bed' }, { content: 'Yield' }], [{ content: 'North' }, { content: '12 kg' }]] } } as never,
    };
    const md = `${para(6)} See :ref{id="t"} and :ref{id="a"}. ${para(60)}`;
    const doc = build(md, [table, svg('a', 300, 400)]);
    const t = floatOf(doc, 't')!;
    const a = floatOf(doc, 'a')!;
    expect(a.page.index).toBeGreaterThan(t.page.index);
    expect(plateAlone(a.page, 'a')).toBe(true);
    const alone = floatOf(build(`${para(6)} See :ref{id="a"}. ${para(60)}`, [svg('a', 300, 400)]), 'a')!;
    expect(a.block.resourceBlock!.bodyRect.height).toBeCloseTo(alone.block.resourceBlock!.bodyRect.height, 3);
  });

  it('keeps the notes cited before it off its page, and loses none', () => {
    const md = `${para(14)} A claim.[^1] See :ref{id="a"}. ${para(30)}\n\n[^1]: The note on the claim, set at the foot of its column.`;
    const doc = build(md, [svg('a', 300, 400)]);
    const a = floatOf(doc, 'a')!;
    expect(plateAlone(a.page, 'a')).toBe(true);
    const notes = doc.blocks.filter((b) => b.footnoteNote !== undefined);
    expect(notes.map((n) => n.footnoteNote)).toEqual(['1']);
    expect(notes[0]!.pageIndex).not.toBe(a.page.index);
    expect(doc.pages[a.page.index]!.footnoteAreas ?? []).toHaveLength(0);
  });

  it('turns off on a resource whose type sets a plate', () => {
    const cfg = { ...config, resourceTypes: [{ id: 'figure', defaultPlacement: { plate: true } }] } as unknown as PostextConfig;
    const md = `${para(6)} See :ref{id="a"}. ${para(30)}`;
    const typed = floatOf(build(md, [svg('a', 300, 400, undefined)], cfg), 'a')!;
    expect(typed.block.resourceBlock!.plateScale).toBeDefined();
    const off = floatOf(build(md, [svg('a', 300, 400, { plate: false })], cfg), 'a')!;
    expect(off.block.resourceBlock!.plateScale).toBeUndefined();
    // Set as a figure of its type, a column wide.
    expect(off.block.bbox.width).toBeLessThan(off.page.contentArea.width / 2);
  });

  it('is set the same on mirrored pages, and on right-to-left ones', () => {
    const md = `${para(6)} See :ref{id="a"}. ${para(40)}`;
    const plain = floatOf(build(md, [svg('a', 300, 400)]), 'a')!;
    const mirrored = floatOf(build(md, [svg('a', 300, 400)], { ...config, page: { ...config.page!, margins: { ...config.page!.margins, left: mm(20), right: mm(12), mirror: true } } } as PostextConfig), 'a')!;
    const rtl = floatOf(build(md, [svg('a', 300, 400)], { ...config, direction: 'rtl' } as PostextConfig), 'a')!;
    // The mirrored page is narrower (32 mm of margins): the plate is as
    // wide as its content area there, its proportions kept.
    const m = mirrored.block.resourceBlock!.bodyRect;
    expect(m.width).toBeCloseTo(mirrored.page.contentArea.width, 3);
    expect(m.width / m.height).toBeCloseTo(300 / 400, 3);
    expect(rtl.block.resourceBlock!.bodyRect.height).toBeCloseTo(plain.block.resourceBlock!.bodyRect.height, 3);
    for (const found of [mirrored, rtl]) {
      expect(plateAlone(found.page, 'a')).toBe(true);
      // Centred in its own content area, whichever side the spine is on.
      const rb = found.block.resourceBlock!;
      const left = found.block.bbox.x + rb.bodyRect.x - found.page.contentArea.x;
      const right = found.page.contentArea.x + found.page.contentArea.width - (found.block.bbox.x + rb.bodyRect.x + rb.bodyRect.width);
      expect(Math.abs(left - right)).toBeLessThan(1);
    }
  });

  it('covers the trim on a right-to-left page as on a left-to-right one', () => {
    const md = `${para(6)} See :ref{id="a"}. ${para(40)}`;
    const rtl = build(md, [bitmap('a', 400, 200, { plate: 'trim' })], { ...config, direction: 'rtl' } as PostextConfig);
    const a = floatOf(rtl, 'a')!;
    const rb = a.block.resourceBlock!;
    expect(a.block.bbox.x + rb.bodyRect.x).toBeCloseTo(0, 3);
    expect(rb.bodyRect.width).toBeCloseTo(a.page.width, 3);
    expect(a.page.role).toBe('plate');
  });

  it('is set in each chapter of a book laid out chapter by chapter', () => {
    const resources = [svg('a', 300, 400), svg('b', 300, 400)];
    const docs = buildBundle({
      config,
      resources,
      chapters: [
        { markdown: `# One\n\n${para(6)} See :ref{id="a"}. ${para(20)}` },
        { markdown: `# Two\n\n${para(6)} Again :ref{id="a"}, and :ref{id="b"}. ${para(20)}` },
      ],
    });
    const a = floatOf(docs[0]!, 'a');
    expect(a && plateAlone(a.page, 'a')).toBe(true);
    // Placed once, in the chapter that first cites it.
    expect(floatOf(docs[1]!, 'a')).toBeUndefined();
    const b = floatOf(docs[1]!, 'b')!;
    expect(plateAlone(b.page, 'b')).toBe(true);
    expect(b.block.resourceBlock!.bodyRect.height).toBeCloseTo(a!.block.resourceBlock!.bodyRect.height, 3);
  });
});
