/**
 * The capture's network policy (spec §8.2 step 5). Every request the page
 * makes goes through `interceptor()`:
 *
 *   cdn.jsdelivr.net/gh/drnachio/postext[@<ref>]/<path> → <repo>/<path> (FAIL when missing)
 *   postext.dev/<path>                                 → apps/web/public/<path>
 *   esm.sh, cdn.jsdelivr.net/npm/@fontsource/*,
 *   api.fontsource.org                                 → the network, through a disk cache
 *   anything else                                      → aborted, FAIL "host not allowed"
 *
 * Interception disables Chrome's own cache, so the allowed hosts are fetched
 * by Node and kept in apps/web/.cache/cookbook-net/ (gitignored), keyed by
 * URL: a second capture of the same engine runs offline. `--refresh-net`
 * fetches again (once per run).
 *
 * Run by Node's type stripping: erasable TypeScript, relative `.ts` imports.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { HTTPRequest } from "puppeteer-core";
import { REPO_DIR, WEB_DIR } from "../../src/lib/cookbook/paths.ts";

export const NET_CACHE_DIR = path.join(WEB_DIR, ".cache", "cookbook-net");
const PUBLIC_DIR = path.join(WEB_DIR, "public");

const TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".postext": "application/zip",
  ".zip": "application/zip",
};

export function contentType(file: string): string {
  return TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/** `base/<rel>` when it stays inside `base` and is a file; otherwise null. */
export function safeFile(base: string, rel: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return null;
  }
  const file = path.resolve(base, decoded);
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

/** What a request URL maps to. */
export type Route =
  | { kind: "repo"; rel: string }
  | { kind: "public"; rel: string }
  | { kind: "network" }
  | { kind: "blocked"; host: string };

const JSDELIVR_REPO = /^\/gh\/drnachio\/postext(?:@[^/]+)?\/(.+)$/;

export function routeFor(url: string): Route {
  const u = new URL(url);
  const repo = u.hostname === "cdn.jsdelivr.net" ? JSDELIVR_REPO.exec(u.pathname) : null;
  if (repo) return { kind: "repo", rel: repo[1] };
  if (u.hostname === "postext.dev" || u.hostname === "www.postext.dev") {
    return { kind: "public", rel: u.pathname.replace(/^\/+/, "") };
  }
  if (
    u.hostname === "esm.sh" ||
    u.hostname === "api.fontsource.org" ||
    (u.hostname === "cdn.jsdelivr.net" && u.pathname.startsWith("/npm/@fontsource/"))
  ) {
    return { kind: "network" };
  }
  return { kind: "blocked", host: u.host };
}

interface Cached {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  fromCache: boolean;
}

/** Response headers worth replaying (the rest are the network's business). */
const KEPT_HEADERS = ["content-type", "location"];

const inflight = new Map<string, Promise<Cached>>();
const refreshed = new Set<string>();

function cacheFiles(url: string): { meta: string; body: string } {
  const key = crypto.createHash("sha256").update(url).digest("hex");
  const dir = path.join(NET_CACHE_DIR, key.slice(0, 2));
  return { meta: path.join(dir, `${key}.json`), body: path.join(dir, `${key}.body`) };
}

function writeAtomic(file: string, data: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

async function fetchAndStore(url: string, userAgent: string): Promise<Cached> {
  const res = await fetch(url, {
    redirect: "manual",
    headers: { "user-agent": userAgent, accept: "*/*" },
    signal: AbortSignal.timeout(90_000),
  });
  const headers: Record<string, string> = {};
  for (const name of KEPT_HEADERS) {
    const value = res.headers.get(name);
    if (value) headers[name] = value;
  }
  const body = Buffer.from(await res.arrayBuffer());
  // Errors are not cached: a transient 5xx must not stick.
  if (res.status < 400) {
    const files = cacheFiles(url);
    writeAtomic(files.body, body);
    writeAtomic(files.meta, JSON.stringify({ url, status: res.status, headers }, null, 1));
  }
  return { status: res.status, headers, body, fromCache: false };
}

/** A GET through the disk cache. esm.sh picks its build from the user
 *  agent, so the browser's is forwarded. */
export function cachedFetch(url: string, { refresh = false, userAgent }: { refresh?: boolean; userAgent: string }): Promise<Cached> {
  const running = inflight.get(url);
  if (running) return running;
  const job = (async (): Promise<Cached> => {
    const files = cacheFiles(url);
    const fresh = refresh && !refreshed.has(url);
    if (!fresh && fs.existsSync(files.meta) && fs.existsSync(files.body)) {
      const meta = JSON.parse(fs.readFileSync(files.meta, "utf-8")) as { status: number; headers: Record<string, string> };
      return { status: meta.status, headers: meta.headers, body: fs.readFileSync(files.body), fromCache: true };
    }
    refreshed.add(url);
    return fetchAndStore(url, userAgent);
  })();
  inflight.set(url, job);
  job.finally(() => inflight.delete(url)).catch(() => {});
  return job;
}

export interface NetIssue {
  severity: "fail" | "warn";
  detail: string;
  url: string;
}

export interface InterceptorOptions {
  /** The pen server's origin: its requests pass through untouched. */
  localOrigin: string;
  userAgent: string;
  refresh?: boolean;
  onIssue(issue: NetIssue): void;
  /** Counts cache hits and network fetches, for the report. */
  stats?: { cached: number; fetched: number };
}

const CORS = { "access-control-allow-origin": "*" };

/** The `request` handler for `page.setRequestInterception(true)`. */
export function interceptor(opts: InterceptorOptions): (request: HTTPRequest) => Promise<void> {
  return async (request) => {
    if (request.isInterceptResolutionHandled()) return;
    const url = request.url();
    try {
      if (url.startsWith(opts.localOrigin) || !/^https?:/.test(url)) {
        await request.continue();
        return;
      }
      const route = routeFor(url);
      if (route.kind === "blocked") {
        opts.onIssue({ severity: "fail", url, detail: `host not allowed: ${route.host} (${url})` });
        await request.abort("blockedbyclient");
        return;
      }
      if (route.kind === "repo" || route.kind === "public") {
        const base = route.kind === "repo" ? REPO_DIR : PUBLIC_DIR;
        const file = safeFile(base, route.rel);
        if (!file) {
          const where = route.kind === "repo" ? route.rel : `apps/web/public/${route.rel}`;
          opts.onIssue({ severity: "fail", url, detail: `missing ${route.kind === "repo" ? "repo asset" : "site file"}: ${where}` });
          await request.respond({ status: 404, headers: CORS, contentType: "text/plain", body: "not found" });
          return;
        }
        await request.respond({ status: 200, headers: CORS, contentType: contentType(file), body: fs.readFileSync(file) });
        return;
      }
      // A dedicated worker's requests have no frame, and answering them from
      // the cache stalls the worker's module graph: they go to the network.
      if (request.method() !== "GET" || request.frame() === null) {
        await request.continue();
        return;
      }
      let res: Cached;
      try {
        res = await cachedFetch(url, { refresh: opts.refresh, userAgent: opts.userAgent });
      } catch (error) {
        opts.onIssue({ severity: "fail", url, detail: `network error: ${(error as Error).message} (${url})` });
        await request.abort("failed");
        return;
      }
      if (opts.stats) opts.stats[res.fromCache ? "cached" : "fetched"]++;
      if (res.status >= 400) {
        // A missing font file is the kit's business: it asks for the bold
        // and italic faces Fontsource lists, and the list is not always right
        // (Libre Caslon Text 700 italic has no latin file, #168). A face the
        // pages do use and could not load fails C12; anything else broke.
        const tolerated = /\/@fontsource\/.+\.woff2$/.test(url);
        opts.onIssue({ severity: tolerated ? "warn" : "fail", url, detail: `HTTP ${res.status}: ${url}` });
      }
      await request.respond({
        status: res.status,
        headers: { ...res.headers, ...CORS },
        body: res.body,
      });
    } catch (error) {
      // The page closed while we answered: nothing left to do.
      if (!/Target closed|Session closed|not handled|already handled/i.test((error as Error).message)) {
        opts.onIssue({ severity: "fail", url, detail: `interception error: ${(error as Error).message}` });
      }
    }
  };
}
