/**
 * The local page a recipe runs in, for the capture and for `pnpm cookbook
 * dev`. `/` is the composed pen as a standalone page (lib/cookbook/compose.ts
 * `pageHtml`) whose import map sends the pen's esm.sh imports to the
 * recording shims (shim.ts), with a loader that `import()`s the script and
 * sets `window.__done` ('ok' | 'error') and `window.__err`.
 *
 *   /                      the page
 *   /__pen/script.js       the composed script
 *   /__shim/*.js           the engine shims (pinned versions)
 *   /__cb/probe.js         the in-page half of the harness (lib/probe.js),
 *                          and its modules at /__cb/probe/<name>.js
 *   /__cb/events           live mode: server-sent reload events
 *   /__repo/<path>         a repo file (live mode rewrites jsDelivr URLs here)
 *   /__public/<path>       a file of apps/web/public (live mode: postext.dev)
 *
 * `startSandboxServer` is the other server here: the page and the worker
 * of `pnpm cookbook sandbox` (#736).
 *
 * The capture maps jsDelivr and postext.dev at the network level (net.ts);
 * a live page runs in any browser, so its loader rewrites those URLs in
 * `fetch` instead, and recipes can be developed before their assets reach
 * the main branch. Worker recipes are captured that way too
 * (`rewriteFetch`), since request interception stalls module workers.
 *
 * Run by Node's type stripping: erasable TypeScript, relative `.ts` imports.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { composePen, pageHtml } from "../../src/lib/cookbook/compose.ts";
import { REPO_DIR, WEB_DIR } from "../../src/lib/cookbook/paths.ts";
import { readKit, readRecipeMeta, readRecipeSources, resetKitCache } from "../../src/lib/cookbook/sources.ts";
import type { ComposedPen, SampleLocale, RecipeMeta } from "../../src/lib/cookbook/types.ts";
import { contentType, safeFile } from "./net.ts";
import type { EngineSpec } from "./shim.ts";
import { importMapTag, LOCAL_PREFIX, pdfDateOf, resolveEngine, rewriteBareImports, shimModules } from "./shim.ts";

const PROBE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "lib");

/** lib/probe.js or one of its modules (lib/probe/<name>.js) for a
 *  `/__cb/probe.js` or `/__cb/probe/<name>.js` route, else null. */
function probeFile(route: string): string | null {
  const match = /^\/__cb\/(probe(?:\/[A-Za-z]+)?\.js)$/.exec(route);
  return match ? safeFile(PROBE_DIR, match[1]!) : null;
}

export interface PenServerOptions {
  slug: string;
  variant: SampleLocale;
  /** "npm" (default: the released versions) or "npm@x.y.z". */
  engine?: string;
  /** Re-compose on every request and serve an SSE reload script. */
  live?: boolean;
  /** Default: an ephemeral port. */
  port?: number;
  /** Rewrite jsDelivr and postext.dev URLs in `fetch` to this server (as
   *  live mode does) without live reload: the capture of worker recipes,
   *  which cannot use request interception. */
  rewriteFetch?: boolean;
  /** Each content file as the pen inlines it (the stress test, #869). */
  transformContent?: (text: string, key: string) => string;
}

export interface PenServer {
  url: string;
  close(): Promise<void>;
  /** Live mode: tells every open page to reload. */
  reload(): void;
  /** The pinned engine the shims load. */
  engine: EngineSpec;
  /** The pen and recipe as last composed. */
  current(): { pen: ComposedPen; meta: RecipeMeta };
}

/** Composes one edition from the files on disk. */
export function composeVariant(
  slug: string,
  variant: SampleLocale,
  transformContent?: (text: string, key: string) => string,
): { pen: ComposedPen; meta: RecipeMeta } {
  const meta = readRecipeMeta(slug);
  const sources = readRecipeSources(slug);
  if (transformContent) {
    sources.content = Object.fromEntries(Object.entries(sources.content).map(([key, text]) => [key, transformContent(text, key)]));
  }
  const pen = composePen(sources, meta, variant, { kit: readKit() });
  return { pen, meta };
}

/** jsDelivr repo files and postext.dev files come from disk. */
const LOCAL_FETCH = `
const nativeFetch = window.fetch.bind(window);
const local = (url) => {
  const repo = /^https:\\/\\/cdn\\.jsdelivr\\.net\\/gh\\/drnachio\\/postext(?:@[^/]+)?\\/(.+)$/.exec(url);
  if (repo) return '/__repo/' + repo[1];
  const site = /^https:\\/\\/(?:www\\.)?postext\\.dev\\/(.+)$/.exec(url);
  return site ? '/__public/' + site[1] : null;
};
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const mapped = local(url);
  return nativeFetch(mapped ?? input, init);
};`;

/** Live mode: reload when the dev command says so. */
const LIVE_RELOAD = `
new EventSource('/__cb/events').addEventListener('message', (event) => {
  if (event.data === 'reload') location.reload();
});`;

function loaderTag({ live = false, rewriteFetch = false }: { live?: boolean; rewriteFetch?: boolean }): string {
  return `<script type="module">
window.__cbErrors = [];
addEventListener('error', (event) => window.__cbErrors.push(String(event.error?.stack ?? event.message)));
addEventListener('unhandledrejection', (event) =>
  window.__cbErrors.push('Unhandled rejection: ' + String(event.reason?.stack ?? event.reason)));${live || rewriteFetch ? LOCAL_FETCH : ""}${live ? LIVE_RELOAD : ""}
import('/__pen/script.js').then(
  () => { window.__done = 'ok'; },
  (error) => { window.__done = 'error'; window.__err = String(error?.stack ?? error); });
</script>`;
}

/** The capture page of a composed pen. */
export function capturePageHtml(
  pen: ComposedPen,
  meta: RecipeMeta,
  { live = false, rewriteFetch = false }: { live?: boolean; rewriteFetch?: boolean } = {},
): string {
  return pageHtml(pen, {
    title: `Nº ${String(meta.number).padStart(3, "0")} · ${pen.slug}`,
    head: `${importMapTag()}\n${loaderTag({ live, rewriteFetch })}`,
    script: "none",
  });
}

function errorPage(message: string): string {
  const text = message.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html><meta charset="utf-8"><title>Cookbook: compose error</title>
<body style="margin:0;background:#0e1014;color:#f4f1ea;font:14px/1.5 system-ui,sans-serif;padding:32px">
<h1 style="font-size:18px;color:#e5484d">The pen does not compose</h1><pre style="white-space:pre-wrap">${text}</pre>
<script>new EventSource('/__cb/events').addEventListener('message', (e) => { if (e.data === 'reload') location.reload(); });</script>`;
}

/** A module of the local engine: `postext/pipeline` → the file in
 *  `packages/postext/dist` (tsc keeps the imports extensionless, so the
 *  server tries `.js` and `/index.js`). `packagesDir` is the workspace's
 *  `packages` folder (a test's stand-in for it). */
export function localModule(rel: string, packagesDir: string = path.join(REPO_DIR, "packages")): { file: string; path: string } | null {
  const match = /^(postext|postext-pdf|postext-citeproc|postext-folio|postext-epub)\/(.+)$/.exec(rel);
  if (!match) return null;
  const dist = path.join(packagesDir, match[1]!, "dist");
  const asked = match[2]!;
  const base = asked.replace(/\.js$/, "");
  // A file the package ships beside its modules (postext-pdf's
  // harfbuzz.wasm, fetched from `new URL('./harfbuzz.wasm', import.meta.url)`)
  // is served as it is.
  const candidates = asked.endsWith(".js") ? [asked, `${base}/index.js`] : /\.wasm$/.test(asked) ? [asked] : [`${base}.js`, `${base}/index.js`];
  for (const candidate of candidates) {
    const file = safeFile(dist, candidate);
    if (file) return { file, path: `${match[1]}/${candidate}` };
  }
  // `pnpm build` and `pnpm dev` of postext-pdf copy the binary into `dist`
  // (scripts/copy-harfbuzz.mjs); a `dist` made by plain `tsc` has none, and
  // the next places the binding tries are a jsDelivr path the capture
  // blocks (#742). The file the script copies is answered instead.
  if (rel === HARFBUZZ_WASM) {
    const file = safeFile(path.join(packagesDir, "postext-pdf", "node_modules", "harfbuzzjs", "dist"), "harfbuzz.wasm");
    if (file) return { file, path: rel };
  }
  return null;
}

/** postext-pdf's HarfBuzz binary, beside its modules. */
const HARFBUZZ_WASM = "postext-pdf/harfbuzz.wasm";

/** The engine's MathJax module in the local engine's `dist`. */
const MATHJAX_MODULE = "postext/math/mathjax.js";

let mathJaxBundle: { stamp: number; code: Promise<string> } | null = null;

/**
 * The local engine's MathJax module as one self-contained module (#683).
 *
 * `pnpm build` writes `dist/math/mathjax.js` as a bundle of MathJax
 * (packages/postext/scripts/bundle-mathjax.mjs). Plain `tsc`, which is what
 * a local-engine run is prepared with, writes it back as the module of
 * `src`, with its `mathjax-full/js/…` imports. A page can only take those
 * from a CDN that builds each subpath with a private copy of MathJax's
 * core: the engine starts, every formula throws ("Right-hand side of
 * 'instanceof' is not an object") and is set as a small red box, and the
 * pages after the first formula are not the recipe's. So a `source` that
 * still imports MathJax is answered with the bundle the package ships,
 * made once per run; a bundled one is returned as it is.
 */
export async function localMathJaxModule(source: string): Promise<string> {
  if (!/^\s*import\b[^;]*?["']mathjax-full\//m.test(source)) return source;
  const dir = path.join(REPO_DIR, "packages", "postext");
  const stamp = fs.statSync(path.join(dir, "src", "math", "mathjax.ts")).mtimeMs;
  if (mathJaxBundle?.stamp !== stamp) {
    const code = (async () => {
      const script = pathToFileURL(path.join(dir, "scripts", "bundle-mathjax.mjs")).href;
      const { bundleMathJax } = (await import(/* @vite-ignore */ script)) as { bundleMathJax(): Promise<string> };
      return bundleMathJax();
    })();
    mathJaxBundle = { stamp, code };
    // A failed bundle is tried again by the next request.
    code.catch(() => { if (mathJaxBundle?.code === code) mathJaxBundle = null; });
  }
  return mathJaxBundle.code;
}

/** The page `pnpm cookbook sandbox` lays bundles out in (#736): the
 *  headless entry of the Sandbox package, built from the working tree. */
const SANDBOX_PAGE = `<!doctype html><meta charset="utf-8"><title>Cookbook: Sandbox check</title>
<script type="module">
window.__sbErrors = [];
addEventListener('error', (event) => window.__sbErrors.push(String(event.error?.stack ?? event.message)));
addEventListener('unhandledrejection', (event) => window.__sbErrors.push('Unhandled rejection: ' + String(event.reason?.stack ?? event.reason)));
import('/__sb/page.js').then(
  () => { window.__sbReady = true; },
  (error) => { window.__sbReady = false; window.__sbErrors.push(String(error?.stack ?? error)); });
</script>`;

export interface SandboxServer {
  url: string;
  close(): Promise<void>;
}

/**
 * The static server of the Sandbox check (#736), one for a whole run:
 *
 *   /                          the harness page
 *   /__sb/<path>               the built entries (`buildDir`): the page
 *                              script, the layout worker and their chunks.
 *                              Files of the local origin on purpose: the
 *                              interceptor lets them through, and answering
 *                              a worker's module requests from the cache
 *                              stalls it (net.ts)
 *   /__cb/probe.js             the layout hash and the warning keys (and
 *                              its modules, /__cb/probe/<name>.js)
 *   /__bundle/<slug>/<lang>    an edition's committed `.postext`
 */
export async function startSandboxServer({ buildDir, bundleFile, port }: { buildDir: string; bundleFile(slug: string, lang: string): string; port?: number }): Promise<SandboxServer> {
  const send = (res: http.ServerResponse, status: number, type: string, body: string | Buffer) => {
    res.writeHead(status, { "content-type": type, "cache-control": "no-store", "access-control-allow-origin": "*" });
    res.end(body);
  };
  const server = http.createServer((req, res) => {
    const route = new URL(req.url ?? "/", "http://localhost").pathname;
    try {
      if (route === "/" || route === "/index.html") return send(res, 200, "text/html; charset=utf-8", SANDBOX_PAGE);
      const probe = probeFile(route);
      if (probe && fs.existsSync(probe)) return send(res, 200, "text/javascript; charset=utf-8", fs.readFileSync(probe));
      const built = /^\/__sb\/(.+)$/.exec(route);
      if (built) {
        const file = safeFile(buildDir, built[1]!);
        return file ? send(res, 200, contentType(file), fs.readFileSync(file)) : send(res, 404, "text/plain", `not built: ${route}`);
      }
      const bundle = /^\/__bundle\/([a-z0-9-]+)\/([a-z]+)$/.exec(route);
      if (bundle) {
        const file = bundleFile(bundle[1]!, bundle[2]!);
        return fs.existsSync(file) ? send(res, 200, "application/zip", fs.readFileSync(file)) : send(res, 404, "text/plain", `no bundle: ${route}`);
      }
      if (route === "/favicon.ico") return send(res, 204, "text/plain", "");
      return send(res, 404, "text/plain", `not found: ${route}`);
    } catch (error) {
      // The stack stays in the terminal; the client gets a plain status.
      console.error(`[cookbook] ${route}:`, error);
      return send(res, 500, "text/plain", `internal error: ${route} (see the terminal)`);
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${typeof address === "object" && address ? address.port : port}/`,
    close: () => new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    }),
  };
}

export async function startPenServer(opts: PenServerOptions): Promise<PenServer> {
  const engine = resolveEngine(opts.engine);
  const live = opts.live === true;
  let state = composeVariant(opts.slug, opts.variant, opts.transformContent);
  // A captured PDF is dated the day its recipe was written (#734).
  const shims = shimModules(engine, { pdfDate: pdfDateOf(state.meta.created) });
  const clients = new Set<http.ServerResponse>();

  // Live mode composes on every page request, so a save shows at once.
  const fresh = (): { pen: ComposedPen; meta: RecipeMeta } => {
    if (!live) return state;
    resetKitCache();
    state = composeVariant(opts.slug, opts.variant, opts.transformContent);
    return state;
  };

  const send = (res: http.ServerResponse, status: number, type: string, body: string | Buffer) => {
    res.writeHead(status, { "content-type": type, "cache-control": "no-store", "access-control-allow-origin": "*" });
    res.end(body);
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = url.pathname;
    try {
      if (route === "/" || route === "/index.html") {
        let page: string;
        try {
          const { pen, meta } = fresh();
          page = capturePageHtml(pen, meta, { live, rewriteFetch: opts.rewriteFetch });
        } catch (error) {
          if (!live) throw error;
          page = errorPage((error as Error).message);
        }
        return send(res, 200, "text/html; charset=utf-8", page);
      }
      if (route === "/__pen/script.js") return send(res, 200, "text/javascript; charset=utf-8", fresh().pen.js);
      if (shims[route] !== undefined) return send(res, 200, "text/javascript; charset=utf-8", shims[route]);
      const probe = probeFile(route);
      if (probe && fs.existsSync(probe)) return send(res, 200, "text/javascript; charset=utf-8", fs.readFileSync(probe));
      if (route === "/__cb/events" && live) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        res.write(": connected\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      const local = /^\/__(repo|public)\/(.+)$/.exec(route);
      if (local) {
        const file = safeFile(local[1] === "repo" ? REPO_DIR : path.join(WEB_DIR, "public"), local[2]);
        if (!file) return send(res, 404, "text/plain", `not found: ${local[2]}`);
        return send(res, 200, contentType(file), fs.readFileSync(file));
      }
      if (engine.source === "local" && route.startsWith(LOCAL_PREFIX)) {
        const found = localModule(route.slice(LOCAL_PREFIX.length));
        if (!found) return send(res, 404, "text/plain", `not built: ${route} (run tsc in the package)`);
        // Relative imports resolve against the module's URL: send an
        // extensionless one to the file's own path first.
        if (found.path !== route.slice(LOCAL_PREFIX.length)) {
          res.writeHead(302, { location: LOCAL_PREFIX + found.path, "cache-control": "no-store" });
          return res.end();
        }
        const type = found.file.endsWith(".wasm") ? "application/wasm" : "text/javascript; charset=utf-8";
        if (found.path === MATHJAX_MODULE) {
          localMathJaxModule(fs.readFileSync(found.file, "utf-8")).then(
            (code) => send(res, 200, type, code),
            (error) => {
              console.error("[cookbook] the MathJax bundle of the local engine failed:", error);
              send(res, 500, "text/plain", "the MathJax bundle of the local engine failed (see the terminal)");
            },
          );
          return;
        }
        if (found.file.endsWith(".wasm")) return send(res, 200, type, fs.readFileSync(found.file));
        // The bare imports as URLs (#742): a worker has no import map.
        return send(res, 200, type, rewriteBareImports(fs.readFileSync(found.file, "utf-8")));
      }
      if (route === "/favicon.ico") return send(res, 204, "text/plain", "");
      return send(res, 404, "text/plain", `not found: ${route}`);
    } catch (error) {
      // The stack stays in the terminal; the client gets a plain status.
      console.error(`[cookbook] ${route}:`, error);
      return send(res, 500, "text/plain", `internal error: ${route} (see the terminal)`);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : opts.port;

  return {
    url: `http://127.0.0.1:${port}/`,
    engine,
    current: () => state,
    reload() {
      for (const client of clients) client.write("data: reload\n\n");
    },
    close() {
      for (const client of clients) client.end();
      clients.clear();
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}
