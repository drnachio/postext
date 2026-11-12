// The export map's custom XML part (#1389): JSON → deflate → base64 inside
// `<postextExportMap xmlns="https://postext.dev/ns/docx-map/1">`. Fragment
// `map` arrays are stored as runs of consecutive offsets (`m`), which the
// deflate pass then shrinks further; decoding restores them exactly.

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { attr, children, escapeAttr, localName, parseXml, textOf } from '../xml.js';
import { base64Decode, base64Encode } from './base64.js';
import { EXPORT_MAP_NS, EXPORT_MAP_ROOT, type ExportMap, type ExportName, type ExportVariant, type MapFragment } from './types.js';

/** Custom document properties (docProps/custom.xml) the package writes. */
export const PROP_EXPORT_ID = 'postext.exportId';
export const PROP_VARIANT = 'postext.variant';
export const PROP_VERSION = 'postext.version';
/** The export by the name the user chose it by (#1517): what Word's
 *  properties show; `postext.variant` keeps naming the writer, as files
 *  written before it do. */
export const PROP_EXPORT = 'postext.export';

/** The name the user chose an export by (#1517), from what its map or
 *  properties say: the facsimile, or a flow document by its design (one
 *  written before the designs, or without one, is the semantic one). */
export function exportVariantName(about: { variant?: ExportVariant; design?: 'book' | 'plain' }): ExportName {
  if (about.variant === 'formatted') return 'facsimile';
  return about.design === 'book' ? 'formatted' : 'semantic';
}

/** Runs of a source-offset map as flat `[start, length]` pairs: a run of
 *  `start, start+1, …`, or of repeated -1 (synthetic characters). */
export function encodeOffsetRuns(map: readonly number[]): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < map.length) {
    const start = map[i]!;
    let len = 1;
    if (start === -1) while (i + len < map.length && map[i + len] === -1) len++;
    else while (i + len < map.length && map[i + len] === start + len) len++;
    out.push(start, len);
    i += len;
  }
  return out;
}

export function decodeOffsetRuns(runs: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < runs.length; i += 2) {
    const start = runs[i]!;
    const len = runs[i + 1]!;
    for (let k = 0; k < len; k++) out.push(start === -1 ? -1 : start + k);
  }
  return out;
}

type StoredFragment = Omit<MapFragment, 'map'> & { m: number[] };

function packFragment(f: MapFragment): StoredFragment {
  const { map, ...rest } = f;
  return { ...rest, m: encodeOffsetRuns(map) };
}

function unpackFragment(f: StoredFragment): MapFragment {
  const { m, ...rest } = f;
  return { ...rest, map: decodeOffsetRuns(m) } as MapFragment;
}

/** The whole custom XML part for a map. */
export function encodeExportMap(map: ExportMap): string {
  const stored = { ...map, fragments: map.fragments.map(packFragment) };
  const payload = base64Encode(deflateSync(strToU8(JSON.stringify(stored)), { level: 9 }));
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<${EXPORT_MAP_ROOT} xmlns="${EXPORT_MAP_NS}" v="${map.version}" exportId="${escapeAttr(map.exportId)}" variant="${map.variant}" engine="${escapeAttr(map.engine)}">` +
    payload +
    `</${EXPORT_MAP_ROOT}>`
  );
}

/** Whether a parsed root element is an export map part (by name and namespace). */
function isMapRoot(root: { name: string; attrs: Record<string, string> }): boolean {
  if (localName(root.name) !== EXPORT_MAP_ROOT) return false;
  const prefix = root.name.includes(':') ? root.name.slice(0, root.name.indexOf(':')) : '';
  return (prefix ? root.attrs[`xmlns:${prefix}`] : root.attrs.xmlns) === EXPORT_MAP_NS;
}

/** Decode a map part written by {@link encodeExportMap}. Throws on a part
 *  that is not a version 1 export map. */
export function decodeExportMap(xml: string): ExportMap {
  const root = parseXml(xml);
  if (!isMapRoot(root)) throw new Error('decodeExportMap: not a postext export map part');
  const json = strFromU8(inflateSync(base64Decode(textOf(root))));
  const stored = JSON.parse(json) as Omit<ExportMap, 'fragments'> & { fragments: StoredFragment[] };
  if (stored.version !== 1) throw new Error(`decodeExportMap: unsupported version ${String(stored.version)}`);
  return { ...stored, fragments: stored.fragments.map(unpackFragment) };
}

/** A custom document property's string value. */
export function readCustomProp(files: Record<string, Uint8Array>, name: string): string | undefined {
  const bytes = files['docProps/custom.xml'];
  if (!bytes) return undefined;
  try {
    for (const p of children(parseXml(xmlPartText(bytes)), 'property')) {
      if (attr(p, 'name') === name) return textOf(p).trim();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Text of an XML part: UTF-8, or UTF-16 when it starts with a byte order
 *  mark (Word may re-save custom XML items with either BOM). */
export function xmlPartText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    const le = bytes[0] === 0xff;
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) out += String.fromCharCode(le ? bytes[i]! | (bytes[i + 1]! << 8) : (bytes[i]! << 8) | bytes[i + 1]!);
    return out;
  }
  const text = strFromU8(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Find the export map in an unzipped package. The part is located by its
 *  root and namespace among `customXml/item*.xml`; when docProps/custom.xml
 *  names an export id it must match the map's (a map pasted from another
 *  export is ignored). Undefined when there is no valid map. */
export function readExportMap(files: Record<string, Uint8Array>): ExportMap | undefined {
  const expected = readCustomProp(files, PROP_EXPORT_ID);
  for (const path of Object.keys(files).sort()) {
    if (!/^customXml\/item\d+\.xml$/.test(path)) continue;
    const text = xmlPartText(files[path]!);
    if (!text.includes(EXPORT_MAP_ROOT)) continue;
    try {
      const map = decodeExportMap(text);
      if (expected !== undefined && expected !== map.exportId) continue;
      return map;
    } catch {
      continue;
    }
  }
  return undefined;
}
