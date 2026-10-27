// The source text of the recording shims: the recorder and the engine,
// worker, PDF and EPUB wrappers.

/** Shared by every shim: the record in `window.__cb`. */
export const RECORDER = `// The capture's record of what the pen did with the engine.
export const cb = (window.__cb ??= {
  builds: [], images: [], engines: {}, pending: 0, lastBuildAt: 0, importedAt: 0,
  pdf: null, pdfError: null, pdfMs: 0, fontFailures: [],
  // Every EPUB the pen writes (shim postext-epub.js, check C30).
  epubs: [],
  // For the Sandbox bundle (probe sandboxBundle): what each registered
  // fileId was drawn from, the files handed to createBundle, the blob each
  // ImageBitmap was decoded from and the faces built from bytes.
  imageSources: new Map(), bundleFiles: new Map(), bitmapBlobs: new WeakMap(), faces: [],
});
cb.importedAt ||= performance.now();
const known = (cb.known ??= new WeakSet());

// A photo reaches registerResourceImage as an ImageBitmap: remember the
// blob it came from, so the bundle carries the original bytes.
if (typeof window.createImageBitmap === 'function' && !window.createImageBitmap.__cb) {
  const decode = window.createImageBitmap.bind(window);
  const wrapped = function (source, ...rest) {
    return decode(source, ...rest).then((bitmap) => {
      if (typeof Blob !== 'undefined' && source instanceof Blob) cb.bitmapBlobs.set(bitmap, source);
      return bitmap;
    });
  };
  wrapped.__cb = true;
  window.createImageBitmap = wrapped;
}

// A face built from bytes (a recipe's own font files, not Fontsource URLs).
if (typeof window.FontFace === 'function' && !window.FontFace.__cb) {
  const RealFontFace = window.FontFace;
  const Recorded = function FontFace(family, source, descriptors) {
    const face = new RealFontFace(family, source, descriptors);
    if (source && typeof source !== 'string') {
      try {
        const bytes = ArrayBuffer.isView(source)
          ? new Uint8Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength))
          : new Uint8Array(source.slice(0));
        cb.faces.push({ family: String(family).replace(/^['"]|['"]$/g, ''), weight: String(descriptors?.weight ?? '400'),
          style: String(descriptors?.style ?? 'normal'), bytes });
      } catch { /* not bytes we can copy */ }
    }
    return face;
  };
  Recorded.prototype = RealFontFace.prototype;
  Recorded.__cb = true;
  window.FontFace = Recorded;
}

/** The faces loaded when a layout starts ([family, weight, style,
 *  unicodeRange]): the probe tells a CJK file that loaded after the layout
 *  (measured in a fallback face) from one the layout used. */
function loadedFaces() {
  const out = [];
  if (typeof document === 'undefined') return null;
  for (const face of document.fonts) {
    if (face.status === 'loaded') out.push([face.family.replace(/^['"]|['"]$/g, ''), face.weight, face.style, face.unicodeRange]);
  }
  return out;
}

/** A finished build: { kind, shim, content, config, docs, ms, at }. */
export function record(entry) {
  if (!('fonts' in entry)) entry.fonts = cb.fontsAtBegin ?? null;
  entry.index = cb.builds.length;
  for (const doc of entry.docs) if (doc && typeof doc === 'object') known.add(doc);
  cb.builds.push(entry);
  cb.lastBuildAt = performance.now();
  return entry;
}

export function begin() { cb.pending++; cb.fontsAtBegin = loadedFaces(); return performance.now(); }
export function end() { cb.pending = Math.max(0, cb.pending - 1); cb.lastBuildAt = performance.now(); }

/** A document painted without a recorded build (a worker's, H6). */
export function seen(doc, shim) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.pages) || known.has(doc)) return;
  record({ kind: 'rendered', shim, content: null, config: null, docs: [doc], ms: 0, at: performance.now(), fonts: null });
}
`;

export function engineShim(name: string, url: string): string {
  return `export * from '${url}';
import * as real from '${url}';
import { cb, record, begin, end, seen, forced } from '/__shim/recorder.js';
const SHIM = ${JSON.stringify(name)};
cb.engines[SHIM] = real;

export function buildDocument(content, config, cache, options) {
  config = forced(config);
  const t0 = begin();
  try {
    const doc = real.buildDocument(content, config, cache, options);
    record({ kind: 'document', shim: SHIM, content, config, docs: [doc], ms: performance.now() - t0, at: t0 });
    return doc;
  } finally { end(); }
}

// The engine's font preparation around a build (#629): recorded as the
// document it returns, with the faces loaded when its last build ran.
// Its time is the passes of its last build (font loading left out).
export async function buildDocumentWithFonts(content, config, options) {
  config = forced(config);
  const started = performance.now();
  let ms = 0;
  const onPass = (info) => {
    if (info.pass === 1 && info.tocRound === 0) ms = 0;
    ms += info.ms;
    options?.onPass?.(info);
  };
  cb.pending++;
  let doc;
  try { doc = await real.buildDocumentWithFonts(content, config, { ...options, onPass }); } finally { cb.pending = Math.max(0, cb.pending - 1); }
  begin();
  end();
  record({ kind: 'document', shim: SHIM, content, config, docs: [doc], ms, at: started });
  return doc;
}

export function buildBundle(bundle, options) {
  if (forced(null)) options = { ...options, config: forced(options?.config ?? bundle?.config) };
  const t0 = begin();
  const done = (docs) => {
    record({ kind: 'bundle', shim: SHIM, content: bundle, config: options?.config ?? bundle?.config,
      docs: [...docs], ms: performance.now() - t0, at: t0 });
    return docs;
  };
  let out;
  try { out = real.buildBundle(bundle, options); } catch (error) { end(); throw error; }
  if (out && typeof out.then === 'function') {
    return out.then((docs) => { end(); return done(docs); }, (error) => { end(); throw error; });
  }
  end();
  return done(out);
}

export function registerResourceImage(fileId, image, options) {
  cb.images.push(fileId);
  cb.imageSources.set(fileId, image);
  return real.registerResourceImage(fileId, image, options);
}

export function createBundle(input, ...rest) {
  try {
    const files = input?.files instanceof Map ? input.files : Object.entries(input?.files ?? {});
    for (const [fileId, data] of files) cb.bundleFiles.set(fileId, data);
  } catch { /* the engine reports a bad input itself */ }
  return real.createBundle(input, ...rest);
}

export function renderPageToCanvas(page, doc, canvas, options) { seen(doc, SHIM); return real.renderPageToCanvas(page, doc, canvas, options); }
export function renderPage(page, doc, ...rest) { seen(doc, SHIM); return real.renderPage(page, doc, ...rest); }
export function renderToCanvas(doc, ...rest) { seen(doc, SHIM); return real.renderToCanvas(doc, ...rest); }
export function renderToHtml(doc, ...rest) { seen(doc, SHIM); return real.renderToHtml(doc, ...rest); }
`;
}

export function workerShim(url: string): string {
  return `export * from '${url}';
import * as real from '${url}';
import { record, begin, end, forced } from '/__shim/recorder.js';

/** The worker client's build() is recorded like buildDocument (H6). */
export function createLayoutWorker(...args) {
  const client = real.createLayoutWorker(...args);
  const build = client.build;
  client.build = function (content, config, options) {
    config = forced(config);
    const t0 = begin();
    return build.call(this, content, config, options).then((doc) => {
      end();
      if (doc) record({ kind: 'worker', shim: 'postext', content, config, docs: [doc], ms: performance.now() - t0, at: t0, fonts: null });
      return doc;
    }, (error) => { end(); throw error; });
  };
  return client;
}
`;
}

/** `date`: the date the capture gives a PDF whose pen sets none (#734), so
 *  a recapture with an unchanged layout writes the same bytes. A pen on a
 *  postext-pdf without the option ignores it. */
export function pdfShim(url: string, date: string | null = null): string {
  return `export * from '${url}';
import * as real from '${url}';
import { cb } from '/__shim/recorder.js';
const DATE = ${JSON.stringify(date)};

export async function renderToPdf(input, options = {}) {
  const provider = options.fontProvider;
  const fontProvider = provider && (async (...face) => {
    try {
      return await provider(...face);
    } catch (error) {
      cb.fontFailures.push(face.join(' ') + ': ' + (error?.message ?? error));
      throw error;
    }
  });
  // A PDF shaped without HarfBuzz reaches the console (check C14) even
  // when the pen keeps its warnings to itself.
  const onWarning = options.onWarning && ((w) => {
    if (w.kind === 'complexShapingUnavailable') console.warn(w.message);
    options.onWarning(w);
  });
  const t0 = performance.now();
  try {
    const dated = DATE && options.date === undefined ? { date: DATE } : {};
    const bytes = await real.renderToPdf(input, { ...dated, ...options, fontProvider, ...(onWarning ? { onWarning } : {}) });
    cb.pdf = bytes;
    cb.pdfMs = performance.now() - t0;
    return bytes;
  } catch (error) {
    cb.pdfError = String(error?.stack ?? error);
    throw error;
  }
}
`;
}

/** renderToEpub recorded: each file the pen writes is read back with the
 *  package's own readEpub, as a reading system opens it (check C30). */
export function epubShim(url: string): string {
  return `export * from '${url}';
import * as real from '${url}';
import { cb } from '/__shim/recorder.js';

export async function renderToEpub(docs, options = {}) {
  const entry = { layout: options.layout ?? null, bytes: 0, ms: 0, documents: 0, pages: 0, toc: 0,
    readLayout: null, warnings: [], error: null };
  cb.epubs.push(entry);
  const onWarning = (w) => {
    entry.warnings.push(w.kind + ': ' + (w.fileId ?? w.family ?? w.detail ?? ''));
    options.onWarning?.(w);
  };
  const t0 = performance.now();
  let bytes;
  try {
    bytes = await real.renderToEpub(docs, { ...options, onWarning });
  } catch (error) {
    entry.error = String(error?.stack ?? error);
    throw error;
  }
  entry.ms = performance.now() - t0;
  entry.bytes = bytes.length;
  try {
    const book = real.readEpub(bytes);
    Object.assign(entry, { documents: book.spine.length, pages: book.pageList.length, toc: book.toc.length, readLayout: book.layout });
  } catch (error) {
    entry.error = 'readEpub: ' + String(error?.message ?? error);
  }
  return bytes;
}
`;
}

/** createEpubWorker recorded: each file its handle writes is read back
 *  with the package's readEpub (`main`), as renderToEpub's are (check C30). */
export function epubWorkerShim(url: string, main: string): string {
  return `export * from '${url}';
import * as real from '${url}';
import { readEpub } from '${main}';
import { cb } from '/__shim/recorder.js';

export function createEpubWorker(...args) {
  const handle = real.createEpubWorker(...args);
  const render = handle.render;
  handle.render = async function (docs, options = {}) {
    const entry = { layout: options.layout ?? null, bytes: 0, ms: 0, documents: 0, pages: 0, toc: 0,
      readLayout: null, warnings: [], error: null, worker: true };
    cb.epubs.push(entry);
    const onWarning = (w) => {
      entry.warnings.push(w.kind + ': ' + (w.fileId ?? w.family ?? w.detail ?? ''));
      options.onWarning?.(w);
    };
    const t0 = performance.now();
    let bytes;
    try {
      bytes = await render.call(this, docs, { ...options, onWarning });
    } catch (error) {
      entry.error = String(error?.stack ?? error);
      throw error;
    }
    entry.ms = performance.now() - t0;
    entry.bytes = bytes.length;
    try {
      const book = readEpub(bytes);
      Object.assign(entry, { documents: book.spine.length, pages: book.pageList.length, toc: book.toc.length, readLayout: book.layout });
    } catch (error) {
      entry.error = 'readEpub: ' + String(error?.message ?? error);
    }
    return bytes;
  };
  return handle;
}
`;
}
