// Fingerprints of a chapter layout's inputs. A layout record is only valid
// for the configuration, resources and engine it was built with; comparing
// fingerprints (rather than object identity) lets a record persisted in
// storage or carried by a bundle stay current across sessions.

import { hashString, hashStringWide, stableStringify as engineStableStringify, stripConfigDefaults } from 'postext';
import type { LayoutContinuation, PostextConfig, Resource } from 'postext';
import enginePackage from 'postext/package.json' with { type: 'json' };

/** Bumped by hand when the record shape or the layout semantics change
 *  between engine releases (development builds share a version). */
const RECORD_FORMAT = 3;

/** The layout engine a record was built with (the `postext` version and
 *  the record format). A record from another is recomputed. */
export const ENGINE_KEY = `${enginePackage.version}/${RECORD_FORMAT}`;

/** Storage-local fields that do not shape a layout: the ids of stored files
 *  (remapped when a bundle is imported), timestamps, and the custom font
 *  registry (families are referenced by name; a bundle rebuilds the list
 *  with its own file ids and names). */
const VOLATILE_KEYS = new Set(['fileId', 'pdfFileId', 'createdAt', 'updatedAt', 'customFonts']);

/** JSON with sorted object keys and the volatile fields left out, so equal
 *  content gives equal text whatever the object came through (the
 *  engine's, #629). */
export function stableStringify(value: unknown): string {
  return engineStableStringify(value, VOLATILE_KEYS);
}

/** djb2 over a string, as 8 hex digits and the length (the engine's
 *  `hashString`): the keys stored with layout records keep this shape. */
const hash = hashString;

/** Two independent 32-bit hashes side by side: a document cache keyed by
 *  the text must not confuse two chapters. */
const hashWide = hashStringWide;

/** Fingerprint of everything one build of a chapter depends on — the key
 *  the worker's document cache is looked up by. Fonts are left out on
 *  purpose: the worker drops its cache when a face is (un)registered. */
export function layoutCacheKey(input: {
  markdown: string;
  metadata: unknown;
  config: PostextConfig;
  resources: readonly Resource[];
  continuation: LayoutContinuation | undefined;
  continuationKey: string;
  outlineKey: string;
}): string {
  const c = input.continuation;
  return [
    hashWide(input.markdown),
    hashWide(JSON.stringify(input.metadata ?? null)),
    configKeyOf(input.config),
    resourcesKeyOf(input.resources),
    input.continuationKey,
    c?.pageIndexOffset ?? '',
    c?.pageNumbering?.startAt ?? '',
    c?.pageNumbering?.format ?? '',
    c?.bookPageCount ?? '',
    input.outlineKey,
  ].join('|');
}

const configKeys = new WeakMap<PostextConfig, string>();
const pagesConfigKeys = new WeakMap<PostextConfig, string>();
const resourceKeys = new WeakMap<readonly Resource[], string>();

/** `config` without the parts that never reach a layout, and without the
 *  values that restate a default. */
function layoutPartOf(config: PostextConfig): PostextConfig {
  // How the Folio viewer presents the book does not shape its pages, nor
  // does how it is separated and checked for print, nor the contrast
  // check's settings, nor the checks of the configuration (#849), nor the
  // space the Canvas leaves between pages (#1002).
  const layout: PostextConfig = { ...config };
  delete layout.folio;
  delete layout.print;
  delete layout.contrast;
  delete layout.checks;
  delete layout.canvasViewer;
  // Nor how the form fields write numbers (#1491): the canvas and the
  // PDF take them from the live configuration.
  if (layout.pdfGeneration?.forms) {
    const pdfGeneration = { ...layout.pdfGeneration };
    delete pdfGeneration.forms;
    layout.pdfGeneration = pdfGeneration;
  }
  // Nor which fit marks the Canvas draws over composed pages (#1160).
  if (layout.debug && ('fitMarks' in layout.debug || 'fitMarksMinScale' in layout.debug)) {
    const debug = { ...layout.debug };
    delete debug.fitMarks;
    delete debug.fitMarksMinScale;
    layout.debug = debug;
  }
  return stripConfigDefaults(layout);
}

/** Fingerprint of everything in `config` a layout depends on: the key of
 *  a built document, whose boxes carry their colours. Cached per object,
 *  so a plan re-derived on every state change pays nothing. */
export function configKeyOf(config: PostextConfig): string {
  let key = configKeys.get(config);
  if (key === undefined) {
    key = hash(stableStringify(layoutPartOf(config)));
    configKeys.set(config, key);
  }
  return key;
}

/** A colour as the configuration writes it (`ColorValue`). */
const isColor = (value: unknown): boolean =>
  typeof value === 'object' && value !== null
  && typeof (value as { hex?: unknown }).hex === 'string' && typeof (value as { model?: unknown }).model === 'string';

/** `value` with every colour written the same: what is left says where
 *  a colour is set, not which. */
function withoutColorValues(value: unknown): unknown {
  if (isColor(value)) return '#';
  if (Array.isArray(value)) return value.map(withoutColorValues);
  if (typeof value !== 'object' || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) out[key] = withoutColorValues(item);
  return out;
}

/** Fingerprint of everything in `config` the pages of a chapter depend
 *  on: how many it takes, their numbers, where its headings and anchors
 *  fall. The stamp of a layout record (#1618). It is {@link configKeyOf}
 *  with the value of every colour left out: none moves a line, so a
 *  colour changed in the Design panel leaves the records of the whole
 *  book current, and only the documents on screen are built again to be
 *  painted with it. Where a colour is set still counts (a colour given to
 *  a part that had none is another configuration). */
export function pagesConfigKeyOf(config: PostextConfig): string {
  let key = pagesConfigKeys.get(config);
  if (key === undefined) {
    key = hash(stableStringify(withoutColorValues(layoutPartOf(config))));
    pagesConfigKeys.set(config, key);
  }
  return key;
}

/** Fingerprint of the resource records (captions, sizes, placement — not
 *  the stored files' ids). Order-independent: a preset applies its
 *  resources in manifest order while storage hands them back sorted by
 *  id, and a layout depends on the set, never on its order. */
export function resourcesKeyOf(resources: readonly Resource[]): string {
  let key = resourceKeys.get(resources);
  if (key === undefined) {
    const sorted = [...resources].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    key = hash(stableStringify(sorted));
    resourceKeys.set(resources, key);
  }
  return key;
}
