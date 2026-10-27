// What the Resources panel does to a resource record, as functions of the
// record: the panel's handlers call them with what the reader did, and so
// does whatever else edits a resource the way the panel would.

import type { Resource, ResourceKind, ResourcePlacement, ResourceType, TableModel } from 'postext';
import { defaultExampleResourceType, defaultVideoResourceType } from 'postext';
import type { SandboxAction } from '../../context/SandboxContext.js';
import { getBlob, putBlob } from '../../storage/blobStore.js';
import type { BitmapUploadResult } from './uploads/BitmapUploader.js';
import { uniqueSlug } from './slugify.js';
import type { SvgSourceCommit } from './svg/SvgSourceEditor.js';
import type { SvgUploadResult } from './svg/SvgUploader.js';

/** Build a fresh, empty 2×2 table model for new table resources. */
export function emptyTableModel(): TableModel {
  const cell = (isHeader: boolean) => ({ content: '', isHeader });
  return {
    headerRowCount: 1,
    rows: [
      [cell(true), cell(true)],
      [cell(false), cell(false)],
    ],
  };
}

/** A resource of `kind` with nothing in it yet, under the first free id. */
export function newResource(kind: ResourceKind, typeId: string, existingIds: Set<string>): Resource {
  const now = Date.now();
  const base = kind === 'bitmap' ? 'image' : kind === 'svg' ? 'svg' : kind === 'video' ? 'video' : kind === 'score' ? 'score' : 'table';
  const id = uniqueSlug(base, existingIds, base);
  const resource: Resource = { id, typeId, kind, createdAt: now, updatedAt: now };
  if (kind === 'table') resource.table = { model: emptyTableModel() };
  if (kind === 'video') resource.video = { source: 'youtube' };
  if (kind === 'score') resource.score = { format: 'abc', source: NEW_SCORE_SOURCE };
  return resource;
}

/** The notation a new score resource starts with (#1172): a scale to
 *  overwrite. */
const NEW_SCORE_SOURCE = 'X:1\nM:4/4\nL:1/4\nK:C\nCDEF|GABc|cBAG|FEDC|]\n';

/** The resource types with the built-in Example type (#1172), when `types`
 *  has none; null when the book has it. */
export function typesWithExample(types: readonly ResourceType[], locale: string): ResourceType[] | null {
  if (types.some((t) => t.id === 'example')) return null;
  return [...types, defaultExampleResourceType(locale)];
}

/** The resource types with the built-in Video type, when `types` has none:
 *  videos are numbered in a sequence of their own (#454), and a book whose
 *  types predate them gets the type when it adds one. Null when the book
 *  already has it. */
export function typesWithVideo(types: readonly ResourceType[], locale: string): ResourceType[] | null {
  if (types.some((t) => t.id === 'video')) return null;
  return [...types, defaultVideoResourceType(locale)];
}

/**
 * Give a resource another id. Renaming changes the keyed identity: the old
 * record is dropped and the new one added, then opened in the panel. `next`
 * is the resource under its new id; an id that is the old one, or another
 * resource's, is not committed (the record is written back under `oldId`).
 *
 * The blob store keys records by id and the persistence layer cascade-
 * deletes the old record's blobs when the id disappears. To keep a renamed
 * bitmap, SVG or video intact, its blobs are copied to fresh file ids so
 * the cascade deletes the now-orphaned originals rather than the live
 * payload. Resolves with the record as stored.
 */
export function renameResource(
  oldId: string,
  next: Resource,
  resources: readonly Resource[],
  dispatch: (action: SandboxAction) => void,
): Promise<Resource> {
  if (next.id === oldId || resources.some((r) => r.id === next.id)) {
    const kept = { ...next, id: oldId };
    dispatch({ type: 'UPSERT_RESOURCE', payload: kept });
    return Promise.resolve(kept);
  }
  const commit = (renamed: Resource): Resource => {
    dispatch({ type: 'DELETE_RESOURCE', payload: oldId });
    dispatch({ type: 'UPSERT_RESOURCE', payload: renamed });
    dispatch({ type: 'SET_ACTIVE_RESOURCE', payload: renamed.id });
    return renamed;
  };

  if (next.video && (next.video.fileId || next.video.poster)) {
    // A video's file and poster are copied the same way (#454).
    const copy = (fileId: string | undefined) => (fileId
      ? getBlob(fileId).then((record) => (record ? putBlob(record.bytes, record.contentType) : fileId))
      : Promise.resolve(undefined));
    const video = next.video;
    return Promise.all([copy(video.fileId), copy(video.poster?.fileId)])
      .then(([fileId, posterId]): Resource => ({
        ...next,
        video: { ...video, ...(fileId ? { fileId } : {}), ...(video.poster && posterId ? { poster: { ...video.poster, fileId: posterId } } : {}) },
      }))
      .catch(() => next)
      .then(commit);
  }
  const sourceFileId = next.bitmap?.fileId ?? next.svg?.fileId;
  if (sourceFileId) {
    return getBlob(sourceFileId)
      .then((record) => (record ? putBlob(record.bytes, record.contentType) : null))
      .then((newFileId): Resource => (newFileId
        ? next.bitmap
          ? { ...next, bitmap: { ...next.bitmap, fileId: newFileId } }
          : next.svg
            ? { ...next, svg: { ...next.svg, fileId: newFileId } }
            : next
        : next))
      .catch(() => next)
      .then(commit);
  }
  return Promise.resolve(commit(next));
}

/** The fields of `resource` once a bitmap file takes its place. */
export function bitmapReplaced(resource: Resource, r: Omit<BitmapUploadResult, 'filename'>): Partial<Resource> {
  return {
    kind: 'bitmap',
    // A declared resolution is the author's and stays; the file's is
    // the new file's (#631).
    bitmap: {
      fileId: r.fileId, format: r.format, width: r.width, height: r.height,
      ...(resource.bitmap?.resolution ? { resolution: resource.bitmap.resolution } : {}),
      ...(r.fileResolution ? { fileResolution: r.fileResolution } : {}),
    },
    svg: undefined,
    table: undefined,
    video: undefined,
  };
}

/** The fields of `resource` once an SVG file takes its place. */
export function svgReplaced(resource: Resource, r: Omit<SvgUploadResult, 'filename'>): Partial<Resource> {
  return {
    kind: 'svg',
    // A replaced SVG keeps its print master (the master is the
    // publisher's original and outlives screen-side re-exports) and its
    // font opt-out (#630).
    svg: { fileId: r.fileId, width: r.width, height: r.height, pdfFileId: resource.svg?.pdfFileId, ...(resource.svg?.inlineFonts === false ? { inlineFonts: false } : {}) },
    bitmap: undefined,
    table: undefined,
    video: undefined,
  };
}

/** The fields of `resource` once its SVG source was edited and saved as a
 *  new blob: the id swapped, the declared size kept unless the source now
 *  says otherwise. The print master (if any) was made for the source as it
 *  was, so it is detached: the PDF export follows the edited SVG from here
 *  on instead of silently printing the old figure. */
export function svgSourceSaved(resource: Resource, c: SvgSourceCommit): Partial<Resource> {
  return {
    svg: {
      ...resource.svg,
      fileId: c.fileId,
      width: c.width ?? resource.svg?.width,
      height: c.height ?? resource.svg?.height,
      pdfFileId: undefined,
    },
  };
}

/** `placement` with one key merged; `undefined` drops it so the resource
 *  falls back to its type's default placement. Undefined when no key is
 *  left. */
export function placementWith<K extends keyof ResourcePlacement>(
  placement: ResourcePlacement | undefined,
  key: K,
  value: ResourcePlacement[K] | undefined,
): ResourcePlacement | undefined {
  const next: ResourcePlacement = { ...placement };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return Object.keys(next).length > 0 ? next : undefined;
}

type Table = NonNullable<Resource['table']>;

/** The table of `resource` set in a named table style; none: the
 *  document's table style. */
export function tableWithStyle(resource: Pick<Resource, 'table'>, styleId: string | undefined): Table {
  const table: Table = { ...(resource.table ?? { model: { rows: [] } }) };
  if (styleId) table.styleId = styleId;
  else delete table.styleId;
  return table;
}

/** The table of `resource` running `'ltr'` or `'rtl'`; anything else: with
 *  the document. */
export function tableWithDirection(resource: Pick<Resource, 'table'>, direction: string | undefined): Table {
  const table: Table = { ...(resource.table ?? { model: { rows: [] } }) };
  if (direction === 'ltr' || direction === 'rtl') table.direction = direction;
  else delete table.direction;
  return table;
}

type Bitmap = NonNullable<Resource['bitmap']>;

/** `bitmap` with the resolution its author declares (at least 1 ppi), or
 *  without one: the document's `layout.bitmapResolution` then decides. */
export function bitmapWithResolution(bitmap: Bitmap, resolution: number | undefined): Bitmap {
  if (resolution !== undefined) return { ...bitmap, resolution: Math.max(1, resolution) };
  const next: Bitmap = { ...bitmap };
  delete next.resolution;
  return next;
}

/** `bitmap` declared at the resolution its file states. */
export function bitmapAtFileResolution(bitmap: Bitmap, fileResolution: number): Bitmap {
  return { ...bitmap, resolution: fileResolution, ...(bitmap.fileResolution === undefined ? { fileResolution } : {}) };
}

type Svg = NonNullable<Resource['svg']>;

/** `svg` with the fonts its text names embedded as the document says
 *  (`on`), or kept out of it (`svg.inlineFonts: false`). */
export function svgWithInlineFonts(svg: Svg, on: boolean): Svg {
  const next = { ...svg };
  if (on) delete next.inlineFonts;
  else next.inlineFonts = false;
  return next;
}

/** True when the bytes start with a PDF header (`%PDF`). */
export function isPdfBytes(bytes: ArrayBuffer): boolean {
  const b = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  return b.length === 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
}
