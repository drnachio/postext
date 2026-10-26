import { describe, expect, it } from 'vitest';
import type { ResourceAnchor } from 'postext';
import { DENSE_ANCHORS, sharedField, withTickedFields } from './LabelAnchorsPanel.js';
import { normalizeMarks, withLabelFields, type PictureMarks } from './pictureMarks.js';
import { withMarks } from '../../../webmcp/resourceMarks.js';

// #931: the anchors ticked in the editor take a style, an alignment or a
// writing mode together; #902: writing mode is a label field of an anchor.

const anchors: ResourceAnchor[] = [
  { id: 'a', x: 0.1, y: 0.1, style: 'mar', align: 'start' },
  { id: 'b', x: 0.2, y: 0.2, style: 'mar' },
  { id: 'c', x: 0.3, y: 0.3, style: 'rio', align: 'start', writingMode: 'vertical-rl' },
  { id: 'd', x: 0.4, y: 0.4 },
];
const marks: PictureMarks = { anchors, avoid: [], faces: [] };

describe('what the ticked anchors share (#931)', () => {
  it('reads the value they all have, with the default for a field they leave unset', () => {
    expect(sharedField(anchors, [0, 1], 'style', '')).toEqual({ value: 'mar', mixed: false });
    expect(sharedField(anchors, [1, 3], 'align', 'center')).toEqual({ value: 'center', mixed: false });
    expect(sharedField(anchors, [0, 2], 'writingMode', 'horizontal-tb')).toEqual({ value: 'horizontal-tb', mixed: true });
  });

  it('says they differ, and says nothing for none', () => {
    expect(sharedField(anchors, [0, 2], 'style', '')).toMatchObject({ mixed: true });
    expect(sharedField(anchors, [0, 3], 'align', 'center')).toMatchObject({ mixed: true });
    expect(sharedField(anchors, [], 'style', '')).toBeUndefined();
  });
});

describe('setting the ticked anchors together (#931)', () => {
  it('sets a style and an alignment on every ticked anchor and leaves the others', () => {
    const next = withTickedFields(marks, new Set([0, 3]), { style: 'ciudad', align: 'end', verticalAlign: 'top' });
    expect(next.anchors.map((a) => [a.style, a.align, a.verticalAlign])).toEqual([
      ['ciudad', 'end', 'top'], ['mar', undefined, undefined], ['rio', 'start', undefined], ['ciudad', 'end', 'top'],
    ]);
    expect(next.anchors[1]).toBe(anchors[1]);
  });

  it('drops a field set back to its default, as one anchor’s editor does', () => {
    const next = withTickedFields(marks, [0, 1, 2], { style: undefined, align: 'center', writingMode: 'horizontal-tb' });
    expect(next.anchors.slice(0, 3)).toEqual([{ id: 'a', x: 0.1, y: 0.1 }, { id: 'b', x: 0.2, y: 0.2 }, { id: 'c', x: 0.3, y: 0.3 }]);
    expect(withLabelFields(marks, 2, { writingMode: 'horizontal-tb' }).anchors[2]!.writingMode).toBeUndefined();
  });

  it('is one new marks object: the caller commits it as one step', () => {
    const next = withTickedFields(marks, [0, 1, 2, 3], { writingMode: 'vertical-rl' });
    expect(next).not.toBe(marks);
    expect(next.anchors.every((a) => a.writingMode === 'vertical-rl')).toBe(true);
  });
});

describe('the writing mode of an anchor is kept (#902)', () => {
  it('survives the normalisation the dialog saves through, and is checked in the WebMCP marks', () => {
    expect(normalizeMarks(marks).anchors[2]!.writingMode).toBe('vertical-rl');
    const resource = { id: 'mapa', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'm.png', format: 'png', width: 400, height: 300 } } as never;
    const { resource: saved } = withMarks(resource, { anchors: [{ id: 'a', x: 0.1, y: 0.1, writingMode: 'vertical-rl' }] });
    expect(saved.anchors![0]!.writingMode).toBe('vertical-rl');
    expect(() => withMarks(resource, { anchors: [{ id: 'a', x: 0.1, y: 0.1, writingMode: 'diagonal' as never }] })).toThrow(/writingMode/);
  });

  it('the overlap choice of an anchor is kept, dropped at its default and checked (#977)', () => {
    const resource = { id: 'mapa', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'm.png', format: 'png', width: 400, height: 300 } } as never;
    const allowed = withLabelFields(marks, 0, { overlap: 'allow' });
    expect(allowed.anchors[0]!.overlap).toBe('allow');
    expect(normalizeMarks(allowed).anchors[0]!.overlap).toBe('allow');
    expect(withLabelFields(allowed, 0, { overlap: 'check' }).anchors[0]!.overlap).toBeUndefined();
    expect(withTickedFields(marks, [0, 1], { overlap: 'allow' }).anchors.map((a) => a.overlap)).toEqual(['allow', 'allow', undefined, undefined]);
    expect(withMarks(resource, { anchors: [{ id: 'a', x: 0.1, y: 0.1, overlap: 'allow' }] }).resource.anchors![0]!.overlap).toBe('allow');
    expect(() => withMarks(resource, { anchors: [{ id: 'a', x: 0.1, y: 0.1, overlap: 'permit' as never }] })).toThrow(/overlap/);
  });

  it('the gutter choice of an anchor is kept, dropped at its default and checked (#990)', () => {
    const resource = { id: 'mapa', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'm.png', format: 'png', width: 400, height: 300 } } as never;
    const crossed = withLabelFields(marks, 0, { gutter: 'cross' });
    expect(crossed.anchors[0]!.gutter).toBe('cross');
    expect(normalizeMarks(crossed).anchors[0]!.gutter).toBe('cross');
    expect(withLabelFields(crossed, 0, { gutter: 'keep' }).anchors[0]!.gutter).toBeUndefined();
    expect(withTickedFields(marks, [0, 1], { gutter: 'cross' }).anchors.map((a) => a.gutter)).toEqual(['cross', 'cross', undefined, undefined]);
    expect(withMarks(resource, { anchors: [{ id: 'a', x: 0.1, y: 0.1, gutter: 'cross' }] }).resource.anchors![0]!.gutter).toBe('cross');
    expect(() => withMarks(resource, { anchors: [{ id: 'a', x: 0.1, y: 0.1, gutter: 'over' as never }] })).toThrow(/gutter/);
  });

  it('a map is dense from more than a couple of dozen anchors', () => {
    expect(DENSE_ANCHORS).toBe(24);
  });
});
