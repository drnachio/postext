import { describe, expect, it } from 'vitest';
import { resolveBindingMeasures, softcoverSheet } from 'postext';
import { COVER_COALESCE_MS, copiedCoverItem, copyCoverItem, createCoverHistory, duplicateCoverItem } from './coverEditing.js';
import { elementRect, type CoverElementSetting, type CoverFinishSetting } from '../model/coverLayers.js';
import type { CoverGallery } from '../library/coverGallery.js';

const trim = { width: 150, height: 230 };
const sheet = softcoverSheet(trim, 20, resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, trim), false);

describe('the cover designer’s history', () => {
  it('goes back and forth, quick changes of one thing as one step, a new change dropping the redo', () => {
    const h = createCoverHistory<string>();
    h.remember('a', 'x', 0);
    // Typed digit by digit: one step.
    h.remember('b', 'x', 100);
    h.remember('c', 'x', 100 + COVER_COALESCE_MS + 1);
    expect(h.undo('d')).toBe('c');
    expect(h.undo('c')).toBe('a');
    expect(h.canUndo).toBe(false);
    expect(h.redo('a')).toBe('c');
    h.remember('c', undefined, 5000);
    expect(h.canRedo).toBe(false);
    // Two commands, however quick, are two steps.
    h.remember('d', undefined, 5001);
    expect(h.undo('e')).toBe('d');
    expect(h.undo('d')).toBe('c');
  });
});

describe('copying cover items', () => {
  const photo: CoverElementSetting = { id: 'p', kind: 'image', resourceId: 'cover:pic-1', zone: 'front', x: 10, y: 10, width: 50, height: 40 };
  const gallery: CoverGallery = { projectId: 'a', pictures: [{ id: 'pic-1', name: 'Foto', mime: 'image/png', bytes: new Uint8Array(), width: 10, height: 10, updatedAt: 0 }], traces: [] };

  it('duplicates with a new id, moved by the offset or put where it was dragged', () => {
    const copy = duplicateCoverItem(sheet, 'elements', photo, { offset: 5 }) as CoverElementSetting;
    expect(copy.id).not.toBe('p');
    const a = elementRect(sheet, photo)!;
    const b = elementRect(sheet, copy)!;
    expect(b.x - a.x).toBeCloseTo(5, 6);
    expect(b.y - a.y).toBeCloseTo(5, 6);
    const dropped = duplicateCoverItem(sheet, 'elements', photo, { rect: { ...a, x: a.x + 30 } }) as CoverElementSetting;
    expect(elementRect(sheet, dropped)!.x).toBeCloseTo(a.x + 30, 6);
  });

  it('moves a finish’s own box, and leaves one laid on an element on it', () => {
    const boxed: CoverFinishSetting = { id: 'f', kind: 'varnish', ink: 'Barniz', shape: { box: { zone: 'front', x: 0, y: 0, width: 20, height: 20 } } };
    const moved = duplicateCoverItem(sheet, 'finishes', boxed, { offset: 5 }) as CoverFinishSetting;
    expect(moved.id).not.toBe('f');
    expect('box' in moved.shape && moved.shape.box.x).toBeCloseTo(5, 6);
    const onElement: CoverFinishSetting = { id: 'g', kind: 'varnish', ink: 'Barniz', shape: { element: 'p' } };
    expect((duplicateCoverItem(sheet, 'finishes', onElement, { offset: 5 }) as CoverFinishSetting).shape).toEqual({ element: 'p' });
  });

  it('carries the gallery picture an item places', () => {
    copyCoverItem('elements', photo, gallery);
    expect(copiedCoverItem()?.pictures.map((p) => p.id)).toEqual(['pic-1']);
  });
});
