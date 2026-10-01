/**
 * The engine shims of the capture page. A pen imports the unpinned
 * `https://esm.sh/postext`; the capture page's import map sends that
 * specifier to a local shim that re-exports the pinned release and records
 * what the pen does with it in `window.__cb`: every build (content, config,
 * the documents and their time), the images it registers, documents that
 * reach the renderer without a recorded build (a layout worker's, harness
 * need H6), the PDF bytes and the font-provider failures.
 *
 * Workers ignore import maps, so a worker recipe runs the published engine
 * inside its worker; its documents are recorded on the main thread.
 *
 * Run by Node's type stripping: erasable TypeScript, relative `.ts` imports.
 */
import fs from "node:fs";
import path from "node:path";
import { REPO_DIR } from "../../src/lib/cookbook/paths.ts";

export interface EngineSpec {
  /** Pinned postext version, e.g. "1.4.1". */
  postext: string;
  /** Pinned postext-pdf version. */
  postextPdf: string;
  /** Pinned postext-citeproc version (released with postext since 1.12). */
  postextCiteproc: string;
  /** `local`: the workspace packages' `dist`, served by the pen server
   *  (previews of unreleased features; never written as a capture). */
  source: "npm" | "local";
}

const VERSION = /^\d+\.\d+\.\d+$/;

/** The released version of a workspace package (its package.json). */
export function releasedVersion(name: "postext" | "postext-pdf" | "postext-citeproc"): string {
  const file = path.join(REPO_DIR, "packages", name, "package.json");
  const version = (JSON.parse(fs.readFileSync(file, "utf-8")) as { version?: string }).version ?? "";
  if (!VERSION.test(version)) throw new Error(`packages/${name}/package.json has no x.y.z version`);
  return version;
}

/** `npm` (default: the released versions) or `npm@x.y.z` (both packages,
 *  which the release script publishes with one version). */
export function resolveEngine(spec: string = "npm"): EngineSpec {
  if (spec === "npm") {
    return { postext: releasedVersion("postext"), postextPdf: releasedVersion("postext-pdf"), postextCiteproc: releasedVersion("postext-citeproc"), source: "npm" };
  }
  const match = /^npm@(\d+\.\d+\.\d+)$/.exec(spec);
  if (match) return { postext: match[1], postextPdf: match[1], postextCiteproc: match[1], source: "npm" };
  if (spec === "local") {
    return { postext: releasedVersion("postext"), postextPdf: releasedVersion("postext-pdf"), postextCiteproc: releasedVersion("postext-citeproc"), source: "local" };
  }
  throw new Error(`--engine expects npm, npm@x.y.z or local, not "${spec}"`);
}

/** Specifiers a pen may import → the shim that serves them. */
export const SHIM_PATHS = {
  "https://esm.sh/postext": "/__shim/postext.js",
  "https://esm.sh/postext?bundle": "/__shim/postext-bundle.js",
  "https://esm.sh/postext/worker": "/__shim/postext-worker.js",
  "https://esm.sh/postext-pdf": "/__shim/postext-pdf.js",
  "https://esm.sh/postext-citeproc": "/__shim/postext-citeproc.js",
} as const;

/** Where the local engine's modules are served (`packages/<name>/dist`). */
export const LOCAL_PREFIX = "/__local/";

/** The version of `dep` a workspace package installed. */
function installedVersion(pkg: string, dep: string): string {
  const file = path.join(REPO_DIR, "packages", pkg, "node_modules", dep, "package.json");
  return (JSON.parse(fs.readFileSync(file, "utf-8")) as { version: string }).version;
}

/** The local engine's bare imports: the workspace packages to the pen
 *  server, their dependencies to esm.sh at the installed versions. */
function localImports(): Record<string, string> {
  const esm = (pkg: string, dep: string) => `https://esm.sh/${dep}@${installedVersion(pkg, dep)}`;
  const imports: Record<string, string> = {
    postext: `${LOCAL_PREFIX}postext/index.js`,
    "postext/bundle": `${LOCAL_PREFIX}postext/bundle/index.js`,
    "postext/worker": `${LOCAL_PREFIX}postext/worker/client.js`,
    "mathjax-full/": `${esm("postext", "mathjax-full")}/`,
  };
  for (const dep of ["@chenglou/pretext", "fflate", "gray-matter", "hypher", "react"]) imports[dep] = esm("postext", dep);
  for (const lang of ["ca", "de", "en-us", "es", "fr", "it", "nl", "pt"]) imports[`hyphenation.${lang}`] = esm("postext", `hyphenation.${lang}`);
  for (const dep of ["@pdf-lib/fontkit", "pdf-lib", "wawoff2"]) imports[dep] = esm("postext-pdf", dep);
  imports.citeproc = esm("postext-citeproc", "citeproc");
  return imports;
}

export function importMapTag(engine?: EngineSpec): string {
  const imports = engine?.source === "local" ? { ...localImports(), ...SHIM_PATHS } : SHIM_PATHS;
  return `<script type="importmap">${JSON.stringify({ imports })}</script>`;
}

/** Shared by every shim: the record in `window.__cb`. */
const RECORDER = `// The capture's record of what the pen did with the engine.
export const cb = (window.__cb ??= {
  builds: [], images: [], engines: {}, pending: 0, lastBuildAt: 0, importedAt: 0,
  pdf: null, pdfError: null, pdfMs: 0, fontFailures: [],
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

function engineShim(name: string, url: string): string {
  return `export * from '${url}';
import * as real from '${url}';
import { cb, record, begin, end, seen } from '/__shim/recorder.js';
const SHIM = ${JSON.stringify(name)};
cb.engines[SHIM] = real;

export function buildDocument(content, config, cache, options) {
  const t0 = begin();
  try {
    const doc = real.buildDocument(content, config, cache, options);
    record({ kind: 'document', shim: SHIM, content, config, docs: [doc], ms: performance.now() - t0, at: t0 });
    return doc;
  } finally { end(); }
}

export function buildBundle(bundle, options) {
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

function workerShim(url: string): string {
  return `export * from '${url}';
import * as real from '${url}';
import { record, begin, end } from '/__shim/recorder.js';

/** The worker client's build() is recorded like buildDocument (H6). */
export function createLayoutWorker(...args) {
  const client = real.createLayoutWorker(...args);
  const build = client.build;
  client.build = function (content, config, options) {
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

function pdfShim(url: string): string {
  return `export * from '${url}';
import * as real from '${url}';
import { cb } from '/__shim/recorder.js';

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
  const t0 = performance.now();
  try {
    const bytes = await real.renderToPdf(input, { ...options, fontProvider });
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

/** The shim modules of one run, keyed by the path the server answers. */
export function shimModules(engine: EngineSpec): Record<string, string> {
  const V = engine.postext;
  const P = engine.postextPdf;
  if (engine.source === "local") {
    const local = (file: string) => `${LOCAL_PREFIX}${file}`;
    return {
      "/__shim/recorder.js": RECORDER,
      "/__shim/postext.js": engineShim("postext", local("postext/index.js")),
      "/__shim/postext-bundle.js": engineShim("postext-bundle", local("postext/index.js")),
      "/__shim/postext-worker.js": workerShim(local("postext/worker/client.js")),
      "/__shim/postext-pdf.js": pdfShim(local("postext-pdf/index.js")),
      "/__shim/postext-citeproc.js": `export * from '${local("postext-citeproc/index.js")}';\n`,
    };
  }
  return {
    "/__shim/recorder.js": RECORDER,
    "/__shim/postext.js": engineShim("postext", `https://esm.sh/postext@${V}`),
    "/__shim/postext-bundle.js": engineShim("postext-bundle", `https://esm.sh/postext@${V}?bundle`),
    "/__shim/postext-worker.js": workerShim(`https://esm.sh/postext@${V}/worker`),
    "/__shim/postext-pdf.js": pdfShim(`https://esm.sh/postext-pdf@${P}?deps=postext@${V}`),
    "/__shim/postext-citeproc.js": `export * from 'https://esm.sh/postext-citeproc@${engine.postextCiteproc}?deps=postext@${V}';\n`,
  };
}
