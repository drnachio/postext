// The crop dialog's edits (`Resource.crop`, CropEditor.tsx), as plain
// functions of the frame being drawn: where a press starts a drag, what a
// pointer move or an arrow key makes of the frame, the undo history, and
// the figure the crop gives. The dialog holds the state; these decide it.
import type { Resource, ResourceSafeArea } from 'postext';
import { normalizeSafeArea } from 'postext';
import { dragRect, nudgeRect, type Handle, type Point } from './pictureMarks.js';

/** Where a new crop starts: the picture less a tenth on every side. */
export const INITIAL_CROP: ResourceSafeArea = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
/** The whole picture: what «Whole picture» sets, and no crop once applied. */
export const WHOLE_PICTURE: ResourceSafeArea = { x: 0, y: 0, width: 1, height: 1 };

/** The frame a dialog opens on: the saved crop, or a proposal. */
export function cropStart(resource: Resource): ResourceSafeArea {
  return normalizeSafeArea(resource.crop) ?? INITIAL_CROP;
}

/** The picture's own size, from the resource (a video's poster). */
export function cropPictureSize(resource: Resource): { width: number; height: number } | undefined {
  const s = resource.kind === 'bitmap' ? resource.bitmap : resource.kind === 'svg' ? resource.svg : resource.video?.poster;
  return s?.width && s.height ? { width: s.width, height: s.height } : undefined;
}

/** The file the picture is drawn from (a video's poster). */
export function cropFileId(resource: Resource): string | undefined {
  return resource.kind === 'bitmap' ? resource.bitmap?.fileId : resource.kind === 'video' ? resource.video?.poster?.fileId : resource.svg?.fileId;
}

/** A drag under way: the handle held, the frame and point it started from,
 *  the frame before it (for undo) and whether the pointer moved. */
export interface CropDrag {
  handle: Handle;
  from: ResourceSafeArea;
  origin: Point;
  before: ResourceSafeArea;
  moved: boolean;
}

/** The drag a press at `p` starts: on the frame, the handle pressed (its
 *  body moves it); outside it, a new frame stretched from the pointer. */
export function cropPress(rect: ResourceSafeArea, p: Point, onFrame: boolean, handle: Handle | undefined): CropDrag {
  return onFrame
    ? { handle: handle ?? 'move', from: rect, origin: p, before: rect, moved: false }
    : { handle: 'se', from: { x: p.x, y: p.y, width: 0, height: 0 }, origin: p, before: rect, moved: false };
}

/** The frame a drag gives with the pointer at `p` (kept in the picture,
 *  never thinner than the smallest side). Marks the drag as moved. */
export function cropDragTo(drag: CropDrag, p: Point): ResourceSafeArea {
  drag.moved = true;
  return dragRect(drag.handle, drag.from, p, { x: p.x - drag.origin.x, y: p.y - drag.origin.y });
}

const ARROWS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** The frame an arrow key gives (moved a step; resized from its right and
 *  bottom edges with Shift), or `undefined` for any other key. */
export function cropNudge(rect: ResourceSafeArea, key: string, shift: boolean): ResourceSafeArea | undefined {
  const dir = ARROWS[key];
  return dir ? nudgeRect(rect, dir[0], dir[1], shift) : undefined;
}

/** The undo history of a dialog: the frames before each edit. */
export interface CropHistory {
  rect: ResourceSafeArea;
  past: ResourceSafeArea[];
}

/** `history` with `rect` set as one more step. */
export function cropEdit(history: CropHistory, rect: ResourceSafeArea): CropHistory {
  return { rect, past: [...history.past, history.rect] };
}

/** `history` one step back; unchanged when there is none. */
export function cropUndo(history: CropHistory): CropHistory {
  if (history.past.length === 0) return history;
  return { rect: history.past[history.past.length - 1]!, past: history.past.slice(0, -1) };
}

/** The crop to store for `rect`: `undefined` when it keeps the whole
 *  picture (or is malformed), so «Whole picture» then «Apply» removes it. */
export function cropToStore(rect: ResourceSafeArea): ResourceSafeArea | undefined {
  return normalizeSafeArea(rect);
}

/** The height over the width of the figure the crop gives: the crop's own
 *  ratio, in the picture's pixels when its size is known. */
export function croppedRatio(rect: ResourceSafeArea, size: { width: number; height: number } | undefined): number {
  return size ? (rect.height * size.height) / (rect.width * size.width) : rect.height / rect.width;
}

/** The preview's picture, placed so that `rect` fills its box. */
export function cropPreviewStyle(rect: ResourceSafeArea): { width: string; height: string; left: string; top: string } {
  return {
    width: `${100 / rect.width}%`,
    left: `${(-rect.x / rect.width) * 100}%`,
    top: `${(-rect.y / rect.height) * 100}%`,
    height: `${100 / rect.height}%`,
  };
}
