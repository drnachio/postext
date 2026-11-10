// The trace of an export (#1458): what the file's custom document
// properties say about it. An editor may save the file without its export
// map (Google Docs drops every custom XML part) and still keep
// docProps/custom.xml and the fragments' bookmarks; the importer then
// writes the map again from the book, and the trace tells it how the file
// was written and whether the book changed since. Every value stays under
// 255 characters, the most Word keeps of a string property.

import { attr, children, parseXml, textOf } from '../xml.js';
import { hashText } from './hash.js';
import { PROP_EXPORT_ID, PROP_VARIANT, PROP_VERSION, xmlPartText } from './exportMap.js';
import type { ExportMap, ExportVariant } from './types.js';

export const PROP_DESIGN = 'postext.design';
export const PROP_DIGEST = 'postext.digest';
export const PROP_CHAPTERS = 'postext.chapters';

/** The most characters a property value takes. */
const MAX_VALUE = 240;

/** A chapter of the export: short hashes of its id and of its text, and
 *  the counter of its first fragment (`_ptx_<counter in base 36>`). */
export interface TraceChapter {
  id: string;
  text: string;
  first: number;
}

export interface ExportTrace {
  exportId?: string;
  variant?: ExportVariant;
  engine?: string;
  design?: 'book' | 'plain';
  /** Hashes of the chapters' text, of the resources the export shows and
   *  of the configuration it was set from. */
  text?: string;
  resources?: string;
  config?: string;
  /** How many fragments the export has. */
  fragments?: number;
  chapters?: TraceChapter[];
}

/** JSON with every object's keys in order, so the same value always
 *  gives the same text. */
function stableJson(value: unknown, skip?: ReadonlySet<string>): string {
  if (Array.isArray(value)) return `[${value.map((v) => stableJson(v, skip)).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined && !skip?.has(k)).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k], skip)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** When a resource was made and last saved says nothing of what it shows. */
const RESOURCE_TIMES: ReadonlySet<string> = new Set(['createdAt', 'updatedAt']);

/** The short hash of a chapter id, as the trace lists it. */
export const traceId = (id: string): string => hashText(id).slice(0, 8);

/** The trace of the export `map` describes. `resources`: the ones the
 *  export shows; `media`: how many pictures it holds; `firstFragments`:
 *  the fragment counter each chapter starts at. */
export function exportTrace(
  map: ExportMap,
  about: { config: unknown; start?: unknown; resources: Record<string, unknown>; media: number; firstFragments: readonly number[] },
): ExportTrace {
  const texts = map.snapshot?.chapters ?? [];
  return {
    exportId: map.exportId,
    variant: map.variant,
    engine: map.engine,
    ...(map.design ? { design: map.design } : {}),
    text: hashText(texts.map((c) => c.markdown).join('\u0001')),
    resources: hashText(`${stableJson(about.resources, RESOURCE_TIMES)}\u0001${about.media}`),
    config: hashText(`${stableJson(about.config)}\u0001${stableJson(about.start ?? null)}`),
    fragments: map.fragments.length,
    chapters: map.chapters.map((c, i) => ({ id: traceId(c.id), text: c.hash.slice(0, 8), first: about.firstFragments[i] ?? 0 })),
  };
}

/** The custom document properties that carry a trace (besides the three
 *  the package writes for every map). */
export function traceProps(trace: ExportTrace): Record<string, string> {
  const out: Record<string, string> = {};
  if (trace.design) out[PROP_DESIGN] = trace.design;
  if (trace.text && trace.resources && trace.config) {
    out[PROP_DIGEST] = `text=${trace.text} resources=${trace.resources} config=${trace.config} fragments=${trace.fragments ?? 0}`;
  }
  if (trace.chapters) {
    out[PROP_CHAPTERS] = String(trace.chapters.length);
    let line = '';
    let n = 0;
    const flush = (): void => {
      if (line) out[`${PROP_CHAPTERS}.${++n}`] = line;
      line = '';
    };
    for (const c of trace.chapters) {
      const item = `${c.id}.${c.text}.${c.first.toString(36)}`;
      if (line && line.length + 1 + item.length > MAX_VALUE) flush();
      line += (line ? ' ' : '') + item;
    }
    flush();
  }
  return out;
}

/** Every `postext.*` string property of docProps/custom.xml. */
function postextProps(files: Record<string, Uint8Array>): Map<string, string> {
  const out = new Map<string, string>();
  const bytes = files['docProps/custom.xml'];
  if (!bytes) return out;
  try {
    for (const p of children(parseXml(xmlPartText(bytes)), 'property')) {
      const name = attr(p, 'name') ?? '';
      if (name.startsWith('postext.')) out.set(name, textOf(p).trim());
    }
  } catch {
    out.clear();
  }
  return out;
}

/** The trace an unzipped package carries, or undefined when its
 *  properties name no postext export. A file written before #1458 has
 *  the export's id, variant and engine alone. */
export function readExportTrace(files: Record<string, Uint8Array>): ExportTrace | undefined {
  const props = postextProps(files);
  const exportId = props.get(PROP_EXPORT_ID);
  if (!exportId) return undefined;
  const trace: ExportTrace = { exportId };
  const variant = props.get(PROP_VARIANT);
  if (variant === 'semantic' || variant === 'formatted') trace.variant = variant;
  const engine = props.get(PROP_VERSION);
  if (engine) trace.engine = engine;
  const design = props.get(PROP_DESIGN);
  if (design === 'book' || design === 'plain') trace.design = design;
  const digest = props.get(PROP_DIGEST);
  if (digest) {
    const part = (name: string): string | undefined => new RegExp(`(?:^| )${name}=([0-9a-z]+)`).exec(digest)?.[1];
    const [text, resources, config, fragments] = [part('text'), part('resources'), part('config'), part('fragments')];
    if (text && resources && config) Object.assign(trace, { text, resources, config });
    if (fragments !== undefined && /^\d+$/.test(fragments)) trace.fragments = Number(fragments);
  }
  const count = Number(props.get(PROP_CHAPTERS));
  if (Number.isInteger(count) && count >= 0) {
    const chapters: TraceChapter[] = [];
    for (let n = 1; props.has(`${PROP_CHAPTERS}.${n}`); n++) {
      for (const item of props.get(`${PROP_CHAPTERS}.${n}`)!.split(/\s+/)) {
        const m = /^([0-9a-f]{8})\.([0-9a-f]{8})\.([0-9a-z]+)$/.exec(item);
        if (m) chapters.push({ id: m[1]!, text: m[2]!, first: parseInt(m[3]!, 36) });
      }
    }
    // A list an editor cut short says nothing.
    if (chapters.length === count) trace.chapters = chapters;
  }
  return trace;
}
