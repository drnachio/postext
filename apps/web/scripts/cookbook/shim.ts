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
  source: "npm";
}

const VERSION = /^\d+\.\d+\.\d+$/;

/** The released version of a workspace package (its package.json). */
export function releasedVersion(name: "postext" | "postext-pdf"): string {
  const file = path.join(REPO_DIR, "packages", name, "package.json");
  const version = (JSON.parse(fs.readFileSync(file, "utf-8")) as { version?: string }).version ?? "";
  if (!VERSION.test(version)) throw new Error(`packages/${name}/package.json has no x.y.z version`);
  return version;
}

/** `npm` (default: the released versions) or `npm@x.y.z` (both packages,
 *  which the release script publishes with one version). */
export function resolveEngine(spec: string = "npm"): EngineSpec {
  if (spec === "npm") {
    return { postext: releasedVersion("postext"), postextPdf: releasedVersion("postext-pdf"), source: "npm" };
  }
  const match = /^npm@(\d+\.\d+\.\d+)$/.exec(spec);
  if (match) return { postext: match[1], postextPdf: match[1], source: "npm" };
  if (spec === "local") throw new Error("--engine local is not available yet: capture against a released version");
  throw new Error(`--engine expects npm or npm@x.y.z, not "${spec}"`);
}

/** Specifiers a pen may import → the shim that serves them. */
export const SHIM_PATHS = {
  "https://esm.sh/postext": "/__shim/postext.js",
  "https://esm.sh/postext?bundle": "/__shim/postext-bundle.js",
  "https://esm.sh/postext/worker": "/__shim/postext-worker.js",
  "https://esm.sh/postext-pdf": "/__shim/postext-pdf.js",
} as const;

export function importMapTag(): string {
  return `<script type="importmap">${JSON.stringify({ imports: SHIM_PATHS })}</script>`;
}

/** Shared by every shim: the record in `window.__cb`. */
const RECORDER = `// The capture's record of what the pen did with the engine.
export const cb = (window.__cb ??= {
  builds: [], images: [], engines: {}, pending: 0, lastBuildAt: 0, importedAt: 0,
  pdf: null, pdfError: null, pdfMs: 0, fontFailures: [],
});
cb.importedAt ||= performance.now();
const known = (cb.known ??= new WeakSet());

/** A finished build: { kind, shim, content, config, docs, ms, at }. */
export function record(entry) {
  entry.index = cb.builds.length;
  for (const doc of entry.docs) if (doc && typeof doc === 'object') known.add(doc);
  cb.builds.push(entry);
  cb.lastBuildAt = performance.now();
  return entry;
}

export function begin() { cb.pending++; return performance.now(); }
export function end() { cb.pending = Math.max(0, cb.pending - 1); cb.lastBuildAt = performance.now(); }

/** A document painted without a recorded build (a worker's, H6). */
export function seen(doc, shim) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.pages) || known.has(doc)) return;
  record({ kind: 'rendered', shim, content: null, config: null, docs: [doc], ms: 0, at: performance.now() });
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
  return real.registerResourceImage(fileId, image, options);
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
      if (doc) record({ kind: 'worker', shim: 'postext', content, config, docs: [doc], ms: performance.now() - t0, at: t0 });
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
  return {
    "/__shim/recorder.js": RECORDER,
    "/__shim/postext.js": engineShim("postext", `https://esm.sh/postext@${V}`),
    "/__shim/postext-bundle.js": engineShim("postext-bundle", `https://esm.sh/postext@${V}?bundle`),
    "/__shim/postext-worker.js": workerShim(`https://esm.sh/postext@${V}/worker`),
    "/__shim/postext-pdf.js": pdfShim(`https://esm.sh/postext-pdf@${P}?deps=postext@${V}`),
  };
}
