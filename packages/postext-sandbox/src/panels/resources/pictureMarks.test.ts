// #569: the speakers and avoid zones of a comic panel's picture, edited in
// the "Safe area & lettering" dialog. The dialog keeps a `PictureMarks`
// value and replaces it through these pure functions.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Resource } from 'postext';
import { SandboxStoreContext } from '../../context/SandboxContext';
import { DEFAULT_LABELS } from '../../types/defaultLabels';
import { SafeAreaField } from './SafeAreaEditor';
import {
  addAnchor, addFace, addHead, anchorIdProblem, anchorOutsideSafeArea, applyDrag, applyMarks, firstAnchorIdProblem,
  marksOf, nextAnchorId, normalizeMarks, nudge, removeMark, zoneAround, type PictureMarks,
} from './pictureMarks';

const empty: PictureMarks = { anchors: [], avoid: [] };
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('speaker ids', () => {
  it('number new speakers past the ones in use', () => {
    expect(nextAnchorId([])).toBe('speaker1');
    expect(nextAnchorId([{ id: 'speaker2', x: 0, y: 0 }])).toBe('speaker3');
    expect(nextAnchorId([{ id: 'ana', x: 0, y: 0 }, { id: 'speaker3', x: 0, y: 0 }])).toBe('speaker4');
  });

  it('take the shape of a script key, unique and not reserved', () => {
    const at = (id: string) => ({ id, x: 0.5, y: 0.5 });
    expect(anchorIdProblem([at('ana')], 0)).toBeUndefined();
    expect(anchorIdProblem([at('señor_x.2-b')], 0)).toBeUndefined();
    expect(anchorIdProblem([at('小明')], 0)).toBeUndefined();
    expect(anchorIdProblem([at('')], 0)).toBe('empty');
    expect(anchorIdProblem([at('ana bel')], 0)).toBe('invalid');
    expect(anchorIdProblem([at('ana:')], 0)).toBe('invalid');
    expect(anchorIdProblem([at('caption')], 0)).toBe('reserved');
    expect(anchorIdProblem([at('sfx')], 0)).toBe('reserved');
    expect(anchorIdProblem([at('ana'), at('ana')], 1)).toBe('duplicate');
    expect(firstAnchorIdProblem([at('ana'), at('bo'), at('bo')])).toBe(1);
    expect(firstAnchorIdProblem([at('ana'), at('bo')])).toBe(-1);
  });
});

describe('adding and removing marks', () => {
  it('adds a speaker at the click, clamped to the picture', () => {
    const m = addAnchor(addAnchor(empty, { x: 0.3, y: 0.4 }), { x: 1.2, y: -0.1 });
    expect(m.anchors).toEqual([{ id: 'speaker1', x: 0.3, y: 0.4 }, { id: 'speaker2', x: 1, y: 0 }]);
  });

  it('adds a head above the mouth and a face around the head', () => {
    let m = addAnchor(empty, { x: 0.5, y: 0.5 });
    m = addHead(m, 0);
    close(m.anchors[0]!.head!.y, 0.42);
    m = addFace(m, 0);
    const f = m.anchors[0]!.face!;
    close(f.x + f.width / 2, 0.5);
    close(f.y + f.height / 2, 0.42);
  });

  it('removes a head or a face only, a mouth with its speaker', () => {
    let m = addFace(addHead(addAnchor(empty, { x: 0.5, y: 0.5 }), 0), 0);
    expect(removeMark(m, { kind: 'head', index: 0 }).anchors[0]).not.toHaveProperty('head');
    expect(removeMark(m, { kind: 'face', index: 0 }).anchors[0]).not.toHaveProperty('face');
    expect(removeMark(m, { kind: 'mouth', index: 0 }).anchors).toEqual([]);
    m = { ...m, avoid: [zoneAround({ x: 0.2, y: 0.2 }), zoneAround({ x: 0.8, y: 0.8 })] };
    expect(removeMark(m, { kind: 'avoid', index: 0 }).avoid).toEqual([m.avoid[1]]);
  });

  it('keeps a zone around a point inside the picture', () => {
    expect(zoneAround({ x: 0, y: 1 }, 0.2)).toEqual({ x: 0, y: 0.8, width: 0.2, height: 0.2 });
  });
});

describe('dragging and nudging', () => {
  it('moves a point by the distance the pointer went, not to the pointer', () => {
    const start = addAnchor(empty, { x: 0.5, y: 0.5 });
    const m = applyDrag({ target: { kind: 'mouth', index: 0 }, handle: 'move', start, origin: { x: 0.52, y: 0.5 } }, { x: 0.62, y: 0.4 });
    close(m.anchors[0]!.x, 0.6);
    close(m.anchors[0]!.y, 0.4);
  });

  it('drags a head that was unset from the mouth', () => {
    const start = addAnchor(empty, { x: 0.5, y: 0.5 });
    const m = applyDrag({ target: { kind: 'head', index: 0 }, handle: 'move', start, origin: { x: 0.5, y: 0.5 } }, { x: 0.5, y: 0.3 });
    expect(m.anchors[0]!.head).toEqual({ x: 0.5, y: 0.3 });
  });

  it('resizes a face from a handle and draws a new zone from the pointer', () => {
    const start = addFace(addAnchor(empty, { x: 0.5, y: 0.5 }), 0);
    const f0 = start.anchors[0]!.face!;
    const m = applyDrag({ target: { kind: 'face', index: 0 }, handle: 'se', start, origin: { x: 0, y: 0 } }, { x: 0.9, y: 0.9 });
    const f = m.anchors[0]!.face!;
    close(f.x, f0.x);
    close(f.x + f.width, 0.9);
    const from = { x: 0.1, y: 0.1, width: 0, height: 0 };
    const drawn = applyDrag(
      { target: { kind: 'avoid', index: 0 }, handle: 'se', start: { ...empty, avoid: [from] }, origin: { x: 0.1, y: 0.1 }, from },
      { x: 0.4, y: 0.3 },
    );
    expect(drawn.avoid[0]!.width).toBeCloseTo(0.3);
    expect(drawn.avoid[0]!.height).toBeCloseTo(0.2);
  });

  it('nudges points by a step (five with Shift) and rectangles like the safe area', () => {
    const m = addAnchor({ ...empty, avoid: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }] }, { x: 0.5, y: 0.5 });
    close(nudge(m, { kind: 'mouth', index: 0 }, 1, 0, false).anchors[0]!.x, 0.51);
    close(nudge(m, { kind: 'mouth', index: 0 }, 0, -1, true).anchors[0]!.y, 0.45);
    close(nudge(m, { kind: 'avoid', index: 0 }, 1, 0, false).avoid[0]!.x, 0.11);
    close(nudge(m, { kind: 'avoid', index: 0 }, 1, 0, true).avoid[0]!.width, 0.21);
    close(nudge(m, { kind: 'mouth', index: 0 }, -100, 0, false).anchors[0]!.x, 0);
  });
});

describe('the safe area hint', () => {
  const area = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
  it('flags a mouth or a head outside the safe area, never without one', () => {
    expect(anchorOutsideSafeArea({ id: 'a', x: 0.5, y: 0.5 }, area)).toBe(false);
    expect(anchorOutsideSafeArea({ id: 'a', x: 0.1, y: 0.5 }, area)).toBe(true);
    expect(anchorOutsideSafeArea({ id: 'a', x: 0.5, y: 0.5, head: { x: 0.5, y: 0.1 } }, area)).toBe(true);
    expect(anchorOutsideSafeArea({ id: 'a', x: 0.1, y: 0.5 }, undefined)).toBe(false);
  });
});

describe('saving onto the resource', () => {
  const picture: Resource = {
    id: 'p1', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'f1', width: 800, height: 600, format: 'jpeg' },
  } as Resource;

  it('rounds to four decimals, trims ids and drops degenerate zones', () => {
    const m = normalizeMarks({
      anchors: [{ id: ' ana ', x: 0.123456, y: 1.5, face: { x: 0.1, y: 0.1, width: 0.001, height: 0.2 } }],
      avoid: [{ x: 0.333333, y: 0, width: 0.2, height: 0.2 }, { x: 0.5, y: 0.5, width: 0, height: 0.1 }],
    });
    expect(m.anchors).toEqual([{ id: 'ana', x: 0.1235, y: 1 }]);
    expect(m.avoid).toEqual([{ x: 0.3333, y: 0, width: 0.2, height: 0.2 }]);
  });

  it('writes anchors and avoid zones, and leaves the keys out when empty', () => {
    const marks = { ...addAnchor(empty, { x: 0.4, y: 0.6 }), avoid: [{ x: 0, y: 0, width: 0.1, height: 0.1 }] };
    const saved = applyMarks(picture, marks);
    expect(saved.anchors).toEqual([{ id: 'speaker1', x: 0.4, y: 0.6 }]);
    expect(saved.avoid).toEqual([{ x: 0, y: 0, width: 0.1, height: 0.1 }]);
    expect(saved).not.toHaveProperty('safeArea');
    expect(marksOf(saved)).toEqual({ safeArea: undefined, anchors: saved.anchors, avoid: saved.avoid });
    const cleared = applyMarks(saved, empty);
    expect(cleared).not.toHaveProperty('anchors');
    expect(cleared).not.toHaveProperty('avoid');
  });

  it('keeps the marks of the stored resource apart from the edited copy', () => {
    const r = { ...picture, anchors: [{ id: 'ana', x: 0.5, y: 0.5, head: { x: 0.5, y: 0.4 } }] };
    const m = marksOf(r);
    m.anchors[0]!.head!.x = 0.9;
    expect(r.anchors[0]!.head!.x).toBe(0.5);
  });

  it('sums the marks up in the field of a picture, not of a video poster', () => {
    const render = (resource: Resource) => {
      const state = { config: {}, resources: [resource], labels: DEFAULT_LABELS, locale: 'en' };
      const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
      return renderToString(h(SandboxStoreContext, { value: store as never }, h(SafeAreaField, { resource, onChange: () => {} })));
    };
    const html = render({ ...picture, anchors: [{ id: 'ana', x: 0.5, y: 0.5 }], avoid: [{ x: 0, y: 0, width: 0.1, height: 0.1 }] });
    expect(html).toContain('Safe area &amp; lettering');
    expect(html).toContain('Speakers & avoid zones'.replace('&', '&amp;'));
    expect(html).toContain('Speakers: 1 · Avoid zones: 1');
    const video = render({ id: 'v1', typeId: 'figure', kind: 'video', createdAt: 0, updatedAt: 0, video: { poster: { fileId: 'f2', width: 640, height: 360, format: 'jpeg' } } } as Resource);
    expect(video).toContain('Safe area');
    expect(video).not.toContain('lettering');
  });
});
