import { describe, expect, it } from 'vitest';
import type { Resource } from 'postext';
import { withMarks } from './resourceMarks.js';

const picture: Resource = { id: 'panel', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f', format: 'png', width: 800, height: 600 } };

describe('the marks of a picture', () => {
  it('are stored as the dialog stores them', () => {
    const { resource, notes } = withMarks(picture, {
      safeArea: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      anchors: [
        { id: ' ana ', x: 0.31234567, y: 0.4, head: { x: 0.3, y: 0.3 }, face: { x: 0.25, y: 0.25, width: 0.1, height: 0.12 } },
        { id: 'tomás', x: 0.9, y: 1.4 },
      ],
      avoid: [{ x: 0.8, y: 0.8, width: 0.5, height: 0.1 }],
      faces: [{ x: 0.1, y: 0.1, width: 0.1, height: 0.1 }],
    });
    expect(resource.safeArea).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    expect(resource.anchors).toEqual([
      { id: 'ana', x: 0.3123, y: 0.4, head: { x: 0.3, y: 0.3 }, face: { x: 0.25, y: 0.25, width: 0.1, height: 0.12 } },
      { id: 'tomás', x: 0.9, y: 1 },
    ]);
    // A zone is kept inside the picture.
    expect(resource.avoid).toEqual([{ x: 0.8, y: 0.8, width: 0.2, height: 0.1 }]);
    expect(resource.faces).toHaveLength(1);
    expect(notes).toEqual(['tomás lies outside the safe area: a crop may hide it.']);
  });

  it('change one kind at a time, and null removes it', () => {
    const marked = withMarks(picture, { safeArea: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, anchors: [{ id: 'ana', x: 0.2, y: 0.2 }], avoid: [{ x: 0, y: 0, width: 0.2, height: 0.2 }] }).resource;
    const next = withMarks(marked, { safeArea: null, avoid: null }).resource;
    expect('safeArea' in next).toBe(false);
    expect('avoid' in next).toBe(false);
    expect(next.anchors).toEqual([{ id: 'ana', x: 0.2, y: 0.2 }]);
    expect(withMarks(next, { anchors: [] }).resource.anchors).toBeUndefined();
  });

  it('are refused where the dialog would not save them', () => {
    const fail = (marks: Parameters<typeof withMarks>[1], resource = picture): string => {
      try {
        withMarks(resource, marks);
      } catch (err) {
        return (err as Error).message;
      }
      return '';
    };
    expect(fail({ anchors: [{ id: 'ana', x: 0, y: 0 }, { id: 'ana', x: 1, y: 1 }] })).toBe('marks.anchors[0].id "ana" is the id of another speaker too.');
    expect(fail({ anchors: [{ id: 'caption', x: 0, y: 0 }] })).toMatch(/is a key the script keeps for itself/);
    expect(fail({ anchors: [{ id: 'two words', x: 0, y: 0 }] })).toMatch(/is not a script key/);
    expect(fail({ anchors: [{ id: '  ', x: 0, y: 0 }] })).toMatch(/is empty/);
    expect(fail({ anchors: [{ id: 'ana', x: 0, y: 0, face: { x: 2, y: 2, width: 0.1, height: 0.1 } }] })).toMatch(/marks\.anchors\[0\]\.face is not a rectangle inside the picture/);
    expect(fail({ avoid: [{ x: 0, y: 0, width: 0.2, height: 0.2 }, { x: 0.5, y: 0.5, width: 0, height: 0.2 }] })).toMatch(/marks\.avoid\[1\] is not a rectangle inside the picture/);
    expect(fail({ safeArea: { x: 0, y: 0, width: 1, height: 1 } })).toMatch(/smaller than the whole picture/);
    const table: Resource = { id: 't', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0, table: { model: { rows: [] } } };
    expect(fail({ safeArea: null }, table)).toBe('Marks are drawn over a picture; "t" is a table.');
    const video: Resource = { id: 'v', typeId: 'video', kind: 'video', createdAt: 0, updatedAt: 0, video: { source: 'youtube', poster: { fileId: 'p', format: 'jpeg', width: 1280, height: 720 } } };
    expect(withMarks(video, { safeArea: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } }).resource.safeArea).toBeDefined();
    expect(fail({ faces: [{ x: 0, y: 0, width: 0.2, height: 0.2 }] }, video)).toMatch(/A video's poster takes a safe area only, not faces/);
    expect(fail({ safeArea: null }, { ...video, video: { source: 'youtube' } })).toMatch(/This video has no poster/);
  });
});

describe('the anchors of a map (#866)', () => {
  it('keep their label fields, rounded as the dialog keeps them, and name label styles the design lacks', () => {
    const { resource, notes } = withMarks(picture, {
      anchors: [
        { id: 'albar', x: 0.2, y: 0.4, style: ' capital ', align: 'start', verticalAlign: 'bottom', rotate: 12.345, width: 0.123456 },
        { id: 'rio', x: 0.3, y: 0.5, style: 'rio' },
      ],
    }, ['capital']);
    expect(resource.anchors).toEqual([
      { id: 'albar', x: 0.2, y: 0.4, style: 'capital', align: 'start', verticalAlign: 'bottom', rotate: 12.35, width: 0.1235 },
      { id: 'rio', x: 0.3, y: 0.5, style: 'rio' },
    ]);
    expect(notes).toEqual([expect.stringContaining('No label style "rio" in the design')]);
  });

  it('refuse label fields the engine cannot read', () => {
    expect(() => withMarks(picture, { anchors: [{ id: 'a', x: 0.1, y: 0.1, align: 'left' as never }] })).toThrow(/align is start, center or end/);
    expect(() => withMarks(picture, { anchors: [{ id: 'a', x: 0.1, y: 0.1, verticalAlign: 'baseline' as never }] })).toThrow(/verticalAlign/);
    expect(() => withMarks(picture, { anchors: [{ id: 'a', x: 0.1, y: 0.1, width: 2 }] })).toThrow(/width is a fraction/);
    expect(() => withMarks(picture, { anchors: [{ id: 'a', x: 0.1, y: 0.1, rotate: Number.NaN }] })).toThrow(/rotate/);
  });

  it('crop a picture, the safe area read inside the crop (#1494)', () => {
    const cropped = withMarks(picture, { crop: { x: 0.25, y: 0.125, width: 0.5, height: 0.75 } });
    expect(cropped.resource.crop).toEqual({ x: 0.25, y: 0.125, width: 0.5, height: 0.75 });
    expect(cropped.notes).toEqual([]);
    // A safe area reaching outside the crop counts only within it.
    const both = withMarks(cropped.resource, { safeArea: { x: 0, y: 0, width: 0.5, height: 0.5 } });
    expect(both.notes).toEqual(['The safe area reaches outside the crop: the safe area is read inside the crop, so only its part within the crop counts.']);
    expect('crop' in withMarks(both.resource, { crop: null }).resource).toBe(false);
    // Marks left out keep the crop.
    expect(withMarks(cropped.resource, { anchors: [] }).resource.crop).toEqual(cropped.resource.crop);
  });
});
