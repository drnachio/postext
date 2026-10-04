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
 *   /__cb/probe.js         the in-page half of the harness (lib/probe.js)
 *   /__cb/events           live mode: server-sent reload events
 *   /__repo/<path>         a repo file (live mode rewrites jsDelivr URLs here)
 *   /__public/<path>       a file of apps/web/public (live mode: postext.dev)
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
import { fileURLToPath } from "node:url";
import { composePen, pageHtml } from "../../src/lib/cookbook/compose.ts";
import { REPO_DIR, WEB_DIR } from "../../src/lib/cookbook/paths.ts";
import { readKit, readRecipeMeta, readRecipeSources, resetKitCache } from "../../src/lib/cookbook/sources.ts";
import type { ComposedPen, SampleLocale, RecipeMeta } from "../../src/lib/cookbook/types.ts";
import { contentType, safeFile } from "./net.ts";
import type { EngineSpec } from "./shim.ts";
import { importMapTag, LOCAL_PREFIX, resolveEngine, shimModules } from "./shim.ts";

const PROBE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "lib", "probe.js");

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
export function composeVariant(slug: string, variant: SampleLocale): { pen: ComposedPen; meta: RecipeMeta } {
  const meta = readRecipeMeta(slug);
  const pen = composePen(readRecipeSources(slug), meta, variant, { kit: readKit() });
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
  { live = false, rewriteFetch = false, engine }: { live?: boolean; rewriteFetch?: boolean; engine?: EngineSpec } = {},
): string {
  return pageHtml(pen, {
    title: `Nº ${String(meta.number).padStart(3, "0")} · ${pen.slug}`,
    head: `${importMapTag(engine)}\n${loaderTag({ live, rewriteFetch })}`,
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
 *  server tries `.js` and `/index.js`). */
function localModule(rel: string): { file: string; path: string } | null {
  // HarfBuzz as the workspace installed it, untransformed (see shim.ts).
  const hb = /^harfbuzzjs\/([\w.-]+\.(?:mjs|js|wasm))$/.exec(rel);
  if (hb) {
    const file = safeFile(path.join(REPO_DIR, "packages", "postext-pdf", "node_modules", "harfbuzzjs", "dist"), hb[1]!);
    return file ? { file, path: rel } : null;
  }
  const match = /^(postext|postext-pdf|postext-citeproc|postext-folio)\/(.+)$/.exec(rel);
  if (!match) return null;
  const dist = path.join(REPO_DIR, "packages", match[1]!, "dist");
  const asked = match[2]!;
  const base = asked.replace(/\.js$/, "");
  const candidates = asked.endsWith(".js") ? [asked, `${base}/index.js`] : [`${base}.js`, `${base}/index.js`];
  for (const candidate of candidates) {
    const file = safeFile(dist, candidate);
    if (file) return { file, path: `${match[1]}/${candidate}` };
  }
  return null;
}

export async function startPenServer(opts: PenServerOptions): Promise<PenServer> {
  const engine = resolveEngine(opts.engine);
  const shims = shimModules(engine);
  const live = opts.live === true;
  let state = composeVariant(opts.slug, opts.variant);
  const clients = new Set<http.ServerResponse>();

  // Live mode composes on every page request, so a save shows at once.
  const fresh = (): { pen: ComposedPen; meta: RecipeMeta } => {
    if (!live) return state;
    resetKitCache();
    state = composeVariant(opts.slug, opts.variant);
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
          page = capturePageHtml(pen, meta, { live, rewriteFetch: opts.rewriteFetch, engine });
        } catch (error) {
          if (!live) throw error;
          page = errorPage((error as Error).message);
        }
        return send(res, 200, "text/html; charset=utf-8", page);
      }
      if (route === "/__pen/script.js") return send(res, 200, "text/javascript; charset=utf-8", fresh().pen.js);
      if (shims[route] !== undefined) return send(res, 200, "text/javascript; charset=utf-8", shims[route]);
      if (route === "/__cb/probe.js") return send(res, 200, "text/javascript; charset=utf-8", fs.readFileSync(PROBE_FILE));
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
        return send(res, 200, type, fs.readFileSync(found.file));
      }
      if (route === "/favicon.ico") return send(res, 204, "text/plain", "");
      return send(res, 404, "text/plain", `not found: ${route}`);
    } catch (error) {
      return send(res, 500, "text/plain", String((error as Error).stack ?? error));
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
