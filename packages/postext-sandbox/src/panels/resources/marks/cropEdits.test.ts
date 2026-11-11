// The crop dialog (`Resource.crop`, #1494): what a press, a drag, an arrow
// key, undo and «Apply» make of the frame, and the field as it renders.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Resource } from 'postext';
import { SandboxStoreContext } from '../../../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../../../types/defaultLabels.js';
import { CropField } from './CropEditor.js';
import {
  INITIAL_CROP,
  WHOLE_PICTURE,
  cropDragTo,
  cropEdit,
  cropFileId,
  cropNudge,
  cropPictureSize,
  cropPress,
  cropPreviewStyle,
  cropStart,
  cropToStore,
  cropUndo,
  croppedRatio,
} from './cropEdits.js';
import { MIN_SIDE, STEP } from './pictureMarks.js';

const bitmap = (extra: Partial<Resource> = {}): Resource => ({
  id: 'pic', typeId: 'figure', kind: 'bitmap', caption: '', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'f.png', format: 'png', width: 800, height: 400 },
  ...extra,
});
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const round = (r: { x: number; y: number; width: number; height: number }) => ({ x: r3(r.x), y: r3(r.y), width: r3(r.width), height: r3(r.height) });

describe('the crop dialog’s frame', () => {
  it('opens on the saved crop, or on a proposal', () => {
    expect(cropStart(bitmap())).toEqual(INITIAL_CROP);
    expect(round(cropStart(bitmap({ crop: { x: 0.2, y: 0, width: 0.5, height: 1 } })))).toEqual({ x: 0.2, y: 0, width: 0.5, height: 1 });
    // A crop that keeps the whole picture is no crop.
    expect(cropStart(bitmap({ crop: WHOLE_PICTURE }))).toEqual(INITIAL_CROP);
  });

  it('moves with its body, kept inside the picture', () => {
    const d = cropPress(INITIAL_CROP, { x: 0.5, y: 0.5 }, true, undefined);
    expect(d.handle).toBe('move');
    expect(round(cropDragTo(d, { x: 0.55, y: 0.45 }))).toEqual({ x: 0.15, y: 0.05, width: 0.8, height: 0.8 });
    // Pushed past the edge, it stops at it.
    expect(round(cropDragTo(d, { x: 1, y: 1 }))).toEqual({ x: 0.2, y: 0.2, width: 0.8, height: 0.8 });
    expect(d.moved).toBe(true);
  });

  it('resizes from a handle, never thinner than the smallest side', () => {
    const d = cropPress(INITIAL_CROP, { x: 0.9, y: 0.9 }, true, 'se');
    expect(round(cropDragTo(d, { x: 0.6, y: 0.7 }))).toEqual({ x: 0.1, y: 0.1, width: 0.5, height: 0.6 });
    expect(cropDragTo(d, { x: 0, y: 0 }).width).toBeCloseTo(MIN_SIDE, 9);
  });

  it('draws a new frame from a press outside it', () => {
    const rect = { x: 0.5, y: 0.5, width: 0.2, height: 0.2 };
    const d = cropPress(rect, { x: 0.1, y: 0.2 }, false, undefined);
    expect(d.before).toEqual(rect);
    expect(d.moved).toBe(false);
    expect(round(cropDragTo(d, { x: 0.4, y: 0.6 }))).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  });

  it('steps with the arrows and resizes with Shift; other keys do nothing', () => {
    expect(round(cropNudge(INITIAL_CROP, 'ArrowRight', false)!)).toEqual({ x: r3(0.1 + STEP), y: 0.1, width: 0.8, height: 0.8 });
    expect(round(cropNudge(INITIAL_CROP, 'ArrowUp', true)!)).toEqual({ x: 0.1, y: 0.1, width: 0.8, height: r3(0.8 - STEP) });
    expect(cropNudge(INITIAL_CROP, 'Enter', false)).toBeUndefined();
    // At the picture's edge a step goes no further.
    const edge = { x: 0, y: 0, width: 0.5, height: 0.5 };
    expect(cropNudge(edge, 'ArrowLeft', false)).toEqual(edge);
  });

  it('undoes one step at a time, and nothing once back at the start', () => {
    const start = { rect: INITIAL_CROP, past: [] };
    const a = cropEdit(start, { x: 0.2, y: 0.2, width: 0.5, height: 0.5 });
    const b = cropEdit(a, WHOLE_PICTURE);
    expect(cropUndo(b)).toEqual(a);
    expect(cropUndo(cropUndo(b))).toEqual(start);
    expect(cropUndo(start)).toBe(start);
  });

  it('stores no crop for the whole picture, so «Whole picture» then «Apply» removes it', () => {
    expect(cropToStore(WHOLE_PICTURE)).toBeUndefined();
    expect(round(cropToStore({ x: 0.2, y: 0, width: 0.5, height: 1 })!)).toEqual({ x: 0.2, y: 0, width: 0.5, height: 1 });
  });
});

describe('the cropped figure', () => {
  it('takes the crop’s ratio in the picture’s pixels', () => {
    // Half the width of an 800 × 400 picture: a square.
    expect(croppedRatio({ x: 0, y: 0, width: 0.5, height: 1 }, cropPictureSize(bitmap()))).toBeCloseTo(1, 9);
    // Size unknown: the frame's own ratio.
    expect(croppedRatio({ x: 0, y: 0, width: 0.5, height: 1 }, undefined)).toBeCloseTo(2, 9);
  });

  it('places the preview so the crop fills its box', () => {
    expect(cropPreviewStyle({ x: 0.25, y: 0.5, width: 0.5, height: 0.5 })).toEqual({ width: '200%', left: '-50%', top: '-100%', height: '200%' });
  });

  it('reads a video’s poster', () => {
    const video = { ...bitmap(), kind: 'video', bitmap: undefined, video: { source: 'youtube', url: 'https://youtu.be/x', poster: { fileId: 'p.png', format: 'png', width: 640, height: 360 } } } as unknown as Resource;
    expect(cropFileId(video)).toBe('p.png');
    expect(cropPictureSize(video)).toEqual({ width: 640, height: 360 });
  });
});

describe('the Crop field', () => {
  const render = (resource: Resource): string => {
    const state = { config: {}, resources: [resource], labels: DEFAULT_LABELS, locale: 'en' };
    const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
    return renderToString(h(SandboxStoreContext, { value: store as never }, h(CropField, { resource, onChange: () => {} })));
  };

  it('says the whole picture shows, and offers no removal, without a crop', () => {
    const html = render(bitmap());
    expect(html).toContain(DEFAULT_LABELS.resourceCropNone);
    expect(html).toContain(DEFAULT_LABELS.resourceCropMark);
    expect(html).not.toContain(DEFAULT_LABELS.resourceCropRemove);
  });

  it('gives the share kept and a removal with a crop', () => {
    const html = render(bitmap({ crop: { x: 0.25, y: 0, width: 0.5, height: 1 } }));
    expect(html).toContain(DEFAULT_LABELS.resourceCropEdit);
    expect(html).toContain(DEFAULT_LABELS.resourceCropRemove);
    expect(html).toContain(DEFAULT_LABELS.resourceSafeAreaSummary.replace('__w__', '50').replace('__h__', '100'));
  });
});
