// The files and groups of the Sandbox bundle.
import { canvasOf } from './card.js';
import { plain } from './fonts.js';
import { record, pickOne } from './record.js';

// ─── The Sandbox bundle ─────────────────────────────────────────────────────

/** 1980-01-01 00:00 local time, the earliest date a zip holds: every file
 *  of the bundle carries it, so the same input gives the same bytes. */
export const ZIP_EPOCH = new Date(1980, 0, 1, 0, 0, 0);

export function base64Of(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

export function bytesOfBase64(base64) {
  const text = atob(base64);
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

/** A data: URL as SVG markup (a string) or bytes. */
function dataUrlFile(url) {
  const comma = url.indexOf(',');
  const head = url.slice(5, comma);
  const payload = url.slice(comma + 1);
  const svg = /^image\/svg\+xml/i.test(head);
  if (/;base64$/i.test(head)) {
    const bytes = bytesOfBase64(payload);
    return svg ? new TextDecoder().decode(bytes) : bytes;
  }
  const text = decodeURIComponent(payload);
  return svg ? text : new TextEncoder().encode(text);
}

/** The picture a fileId was registered with, as a file: SVG markup from a
 *  data: URL, the blob an ImageBitmap was decoded from, the bytes of the
 *  image's URL, else the pixels re-encoded (`format`: png or jpeg). */
export async function imageFile(image, format) {
  const cb = record();
  if (!image) return null;
  const src = typeof image.currentSrc === 'string' && image.currentSrc ? image.currentSrc
    : typeof image.src === 'string' ? image.src
      : image.href?.baseVal ?? '';
  if (src.startsWith('data:')) return dataUrlFile(src);
  const blob = cb.bitmapBlobs?.get(image);
  if (blob) return new Uint8Array(await blob.arrayBuffer());
  if (/^(https?|blob):/.test(src)) {
    try {
      const res = await fetch(src);
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        return /svg/i.test(res.headers.get('content-type') ?? '') ? new TextDecoder().decode(bytes) : bytes;
      }
    } catch { /* fall back to the pixels */ }
  }
  const w = image.naturalWidth || image.videoWidth || image.width;
  const h = image.naturalHeight || image.videoHeight || image.height;
  if (!w || !h) return null;
  const canvas = canvasOf(w, h);
  canvas.getContext('2d').drawImage(image, 0, 0, w, h);
  const type = format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  const out = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
  return out ? new Uint8Array(await out.arrayBuffer()) : null;
}

/** The plain text of a document's first `# ` heading, or ''. */
export function headingTitle(markdown) {
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = m[1]
      .replace(/\{[^}]*\}\s*$/, '')
      .replace(/\s*\\\\\s*/g, ' ')
      .replace(/[*_`]/g, '')
      .replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1')
      .trim();
    if (text) return text;
  }
  return '';
}

/** JSON with its keys sorted: two configurations written in another order
 *  are the same one. */
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * A configuration as a bundle carries it, for telling two builds apart
 * (#690): plain JSON (functions dropped), without the values that restate a
 * default (the engine's own `stripConfigDefaults`, which `createBundle`
 * applies), keys sorted. Two builds with the same key lay out under one
 * bundle configuration.
 * @param {unknown} config
 * @param {{ stripConfigDefaults?: (config: any) => any } | null} [engine]
 */
export function configKeyOf(config, engine = null) {
  let own = plain(config ?? {}) ?? {};
  if (typeof engine?.stripConfigDefaults === 'function') {
    try {
      own = plain(engine.stripConfigDefaults(own)) ?? own;
    } catch { /* compared as written */ }
  }
  return stableJson(own);
}

/** `capture.sandbox` ('first', 'last' or an index into the `capture.doc`
 *  list) as a position in `picked`; 0 when unset, -1 when it names none. */
export function keptPosition(select, keep, picked) {
  if (keep === null || keep === undefined) return 0;
  if (!Array.isArray(select)) return -1;
  const at = keep === 'first' ? 0 : keep === 'last' ? select.length - 1 : keep;
  if (!Number.isInteger(at) || at < 0 || at >= select.length) return -1;
  return picked.indexOf(pickOne(record().builds, select[at]));
}

/**
 * What of several builds a bundle holds. `capture.doc` lists several
 * document builds; a bundle has one configuration, so it holds the builds
 * that share the kept one's (#690). `keep` is the position in `picked` of
 * the build `capture.sandbox` names (the first when the recipe names none,
 * `explicit` false).
 *
 * Builds chained into one publication (#540: every one after the first
 * continues the one before it, `content.continuation`, as a pen that sets
 * articles with numbering of their own and renders one PDF from all of
 * them) make a book with one chapter per build of the kept configuration
 * (`chain`: its markdown, titled after its first heading, with those
 * builds' resources, the first of an id winning, and files). What a later
 * continuation sets is reported in `notes`: the Sandbox chains the
 * chapters itself. Builds that do not chain (two editions) leave the kept
 * one alone in the bundle.
 *
 * `builds` are the positions in `picked` the bundle holds, `left` the ones
 * it does not. Builds of another configuration are named in `warns` when
 * the recipe did not choose (it gets the first build's), in `notes` when it
 * did. Null for fewer than two builds or a position out of range.
 */
export function bundleGroup(picked, name = '', { keep = 0, explicit = false, keyOf = (b) => configKeyOf(b?.config) } = {}) {
  if (!Array.isArray(picked) || picked.length < 2 || !picked[keep]) return null;
  const all = picked.map((_, i) => i);
  const sourced = (b) => b?.kind === 'document' || b?.kind === 'worker';
  const titleOf = (i) => headingTitle(String(picked[i].content?.markdown ?? ''));
  const named = (i) => `build ${i + 1}${titleOf(i) ? ` (${titleOf(i)})` : ''}`;
  const list = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0]);
  const alone = () => ({
    builds: [keep], left: all.filter((i) => i !== keep), chain: null, warns: [],
    notes: explicit ? [`capture.sandbox keeps build ${keep + 1} of ${picked.length}: the bundle is that document alone`] : [],
  });
  const chained = picked.every(sourced)
    && picked.slice(1).every((b) => b.content?.continuation && typeof b.content.continuation === 'object');
  if (!chained) return alone();

  const keys = picked.map((b) => keyOf(b));
  const builds = all.filter((i) => keys[i] === keys[keep]);
  const left = all.filter((i) => keys[i] !== keys[keep]);
  const notes = [];
  const warns = [];
  if (left.length) {
    const holds = `${builds.length > 1 ? 'builds' : 'build'} ${list(builds.map((i) => String(i + 1)))}`;
    if (explicit) {
      notes.push(`capture.sandbox keeps ${holds} of ${picked.length}; ${list(left.map(named))} left out (another configuration)`);
    } else {
      warns.push(`${list(left.map(named))} left out of the bundle: ${left.length > 1 ? 'their configurations differ' : 'its configuration differs'} `
        + `from the first build's, and a bundle carries one. It holds ${holds}; name the build to keep in capture.sandbox`);
    }
  }
  if (builds.length < 2) return { builds, left, chain: null, notes, warns };
  const chapters = [];
  const resources = [];
  const seen = new Set();
  const files = [];
  builds.forEach((i, n) => {
    const b = picked[i];
    const markdown = String(b.content?.markdown ?? '');
    chapters.push({ title: headingTitle(markdown) || `${name || 'Chapter'} ${n + 1}`, markdown });
    for (const r of b.content?.resources ?? []) {
      if (!r || seen.has(r.id)) continue;
      seen.add(r.id);
      resources.push(r);
    }
    if (b.content?.files instanceof Map) files.push(b.content.files);
    if (n === 0) return;
    for (const key of Object.keys(b.content.continuation)) {
      if (key !== 'pageIndexOffset') notes.push(`build ${i + 1}: continuation.${key} not carried (the Sandbox chains the chapters itself)`);
    }
  });
  return { builds, left, chain: { chapters, resources, files }, notes, warns };
}
