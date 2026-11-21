/**
 * The cover designer's own editing commands. The Sandbox's history keeps
 * the text and the configuration; the cover is kept apart, so the
 * designer keeps its own while it is open: undo and redo of the cover's
 * design together with its gallery (a mask or an upload changes both),
 * and copying an item to paste it again, here or on another book's cover.
 */

import type { ProductionSheet } from 'postext';
import type { GalleryPicture } from '../library/coverGallery.js';
import { galleryPictureOf, type CoverGallery } from '../library/coverGallery.js';
import { elementAt, elementRect, finishAsElement, finishFromElement, newElementId, type CoverElementSetting, type CoverFinishSetting, type ItemLayer } from '../model/coverLayers.js';
import { textBoxAsElement, textBoxFromElement, type CoverTextBox } from '../model/coverTexts.js';

/** Changes of the same thing this close together are one step (a number
 *  typed digit by digit, an arrow key held, a mask made with its picture). */
export const COVER_COALESCE_MS = 600;
const MAX_STEPS = 200;

export interface CoverHistory<T> {
  /** Keep `state`, the one before a change, as a step to go back to; a
   *  change with the `key` of the one just before joins its step. */
  remember(state: T, key?: string, now?: number): void;
  /** The state to go back to, `current` kept to redo; undefined when none. */
  undo(current: T): T | undefined;
  redo(current: T): T | undefined;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export function createCoverHistory<T>(): CoverHistory<T> {
  const past: T[] = [];
  const future: T[] = [];
  let last = -Infinity;
  let lastKey: string | undefined;
  return {
    remember(state, key, now = Date.now()) {
      if (!key || key !== lastKey || now - last > COVER_COALESCE_MS) {
        past.push(state);
        if (past.length > MAX_STEPS) past.shift();
      }
      last = now;
      lastKey = key;
      future.length = 0;
    },
    undo(current) {
      if (past.length === 0) return undefined;
      future.push(current);
      last = -Infinity;
      return past.pop();
    },
    redo(current) {
      if (future.length === 0) return undefined;
      past.push(current);
      last = -Infinity;
      return future.pop();
    },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
  };
}

export type CoverItem = CoverElementSetting | CoverFinishSetting | CoverTextBox;

/** An item copied: its layer, and the gallery pictures it places, to paste
 *  it on a book whose gallery does not have them. */
export interface CopiedItem {
  layer: ItemLayer;
  item: CoverItem;
  pictures: GalleryPicture[];
}

/** How far a pasted or duplicated item lands from the one it copies, mm. */
export const PASTE_OFFSET_MM = 5;

let clipboard: CopiedItem | null = null;

export function copyCoverItem(layer: ItemLayer, item: CoverItem, gallery: CoverGallery): void {
  const picture = 'resourceId' in item ? galleryPictureOf(gallery, item.resourceId) : undefined;
  clipboard = { layer, item, pictures: picture ? [picture] : [] };
}

export function copiedCoverItem(): CopiedItem | null {
  return clipboard;
}

/** After a paste, the next one lands further on. */
export function setCopiedCoverItem(next: CopiedItem | null): void {
  clipboard = next;
}

/** A copy of an item with an id of its own, moved by `offset` mm or put on
 *  `rect` (the sheet's mm). A finish laid on an element stays on it. */
export function duplicateCoverItem(sheet: ProductionSheet, layer: ItemLayer, item: CoverItem, to: { offset: number } | { rect: { x: number; y: number; width: number; height: number } }): CoverItem {
  const id = newElementId();
  const place = (el: CoverElementSetting): CoverElementSetting => {
    const r = elementRect(sheet, el);
    if (!r) return el;
    return elementAt(sheet, el, 'rect' in to ? to.rect : { ...r, x: r.x + to.offset, y: r.y + to.offset });
  };
  if (layer === 'texts') {
    const box = item as CoverTextBox;
    return { ...textBoxFromElement(box, place(textBoxAsElement(box))), id: id.replace(/^el-/, 'text-') };
  }
  if (layer === 'finishes') {
    const finish = item as CoverFinishSetting;
    const asElement = finishAsElement(finish, '#000000');
    return asElement ? { ...finishFromElement(finish, place(asElement)), id } : { ...finish, id };
  }
  return { ...place(item as CoverElementSetting), id };
}
