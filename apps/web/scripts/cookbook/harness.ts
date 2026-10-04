/**
 * The capture harness (spec §8.2): runs one recipe edition in headless
 * Chrome and brings back everything the checks and the outputs need.
 *
 *   serve.ts   compose the pen, serve it with the recording shims
 *   net.ts     answer every request (repo files, the site, cached esm.sh
 *              and Fontsource, nothing else)
 *   here       wait for `__done`, the fonts, a quiet settle window (H10)
 *              and two frames; build the PDF when the recipe keeps one;
 *              read the facts and paint the pages and the card in the page,
 *              then write the document as a `.postext` bundle for the
 *              Sandbox (lib/probe.js)
 *
 * Run by Node's type stripping: erasable TypeScript, relative `.ts` imports.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import type { Browser, Page } from "puppeteer-core";
import type { CaptureBuild, SampleLocale, RecipeMeta } from "../../src/lib/cookbook/types.ts";
import { cardProblems, heroPages, publishedPages } from "./cards.ts";
import type { ProbeFacts } from "./checks.ts";
import type { NetIssue } from "./net.ts";
import { interceptor, routeFor } from "./net.ts";
import type { PenServer } from "./serve.ts";
import { startPenServer } from "./serve.ts";

// ─── Chrome ─────────────────────────────────────────────────────────────────

const CFT_BINARIES = [
  "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "chrome-linux64/chrome",
  "chrome-win64/chrome.exe",
];

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** COOKBOOK_CHROME, else the newest Chrome for Testing puppeteer cached. */
export function findChrome(): string {
  const env = process.env.COOKBOOK_CHROME;
  if (env) {
    if (!fs.existsSync(env)) throw new Error(`COOKBOOK_CHROME does not exist: ${env}`);
    return env;
  }
  const root = path.join(os.homedir(), ".cache", "puppeteer", "chrome");
  const found = (fs.existsSync(root) ? fs.readdirSync(root) : [])
    .map((dir) => ({ dir, version: /-(\d+\.\d+\.\d+\.\d+)$/.exec(dir)?.[1] }))
    .filter((entry): entry is { dir: string; version: string } => !!entry.version)
    .flatMap(({ dir, version }) =>
      CFT_BINARIES.map((bin) => ({ file: path.join(root, dir, bin), version })).filter(({ file }) => fs.existsSync(file)),
    )
    .sort((a, b) => compareVersions(b.version, a.version));
  if (!found.length) {
    throw new Error(
      "No Chrome for Testing found in ~/.cache/puppeteer/chrome. Install one with " +
        "`npx @puppeteer/browsers install chrome@stable` or set COOKBOOK_CHROME.",
    );
  }
  return found[0].file;
}

export interface HarnessBrowser {
  browser: Browser;
  /** "131.0.6778.204" */
  chrome: string;
  userAgent: string;
}

export async function launchBrowser({ headed = false }: { headed?: boolean } = {}): Promise<HarnessBrowser> {
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: !headed,
    args: ["--no-sandbox", "--hide-scrollbars", "--mute-audio", "--no-first-run", "--no-default-browser-check"],
    defaultViewport: null,
  });
  const version = await browser.version();
  return {
    browser,
    chrome: /(\d+\.\d+\.\d+\.\d+)/.exec(version)?.[1] ?? version,
    userAgent: await browser.userAgent(),
  };
}

// ─── One edition ────────────────────────────────────────────────────────────

export interface RenderedPage {
  n: number;
  w: number;
  h: number;
  full: Buffer;
  strip: Buffer;
  png: Buffer | null;
}

export interface CardImages {
  card: Buffer;
  card480: Buffer;
  og: Buffer;
  png: Buffer | null;
  ogPng: Buffer | null;
  magnification: number | null;
}

export interface VariantRun {
  slug: string;
  variant: SampleLocale;
  engine: PenServer["engine"];
  pen: ReturnType<PenServer["current"]>["pen"];
  done: "ok" | "error" | "timeout";
  err: string | null;
  loaderErrors: string[];
  console: { type: string; text: string }[];
  pageErrors: string[];
  net: NetIssue[];
  failedRequests: string[];
  settle: { waitedMs: number; timedOut?: boolean } | null;
  /** `data-postext` and the status line once the pen settled, before the PDF. */
  kit: { state: string | null; status: string | null } | null;
  facts: ProbeFacts | null;
  /** Pages whose painting taints the canvas (C15). */
  tainted: number[];
  pdf: { wanted: boolean; button: boolean; timedOut: boolean; error: string | null; fontFailures: string[]; ms: number; bytes: Buffer | null } | null;
  published: number[];
  publishError: string | null;
  cardErrors: string[];
  pages: RenderedPage[];
  card: CardImages | null;
  renderError: { message: string; taint: boolean } | null;
  timings: { totalMs: number; runMs: number };
  netStats: { cached: number; fetched: number };
  /** Captured without request interception (a worker recipe). */
  passive: boolean;
  /** postext versions a worker imported (workers ignore the import map). */
  workerEngines: string[];
  /** The selected document as a `.postext` file for the Sandbox. */
  sandbox: SandboxBundle | null;
}

export interface SandboxBundle {
  bytes: Buffer | null;
  error: string | null;
  /** createBundle's warnings (a family left out, a skipped face). */
  warnings: string[];
  /** What the bundle cannot carry (a continuation's page sides, counters). */
  notes: string[];
}

/** What the bundle is called: `recipe-<slug>`, the write-up's title. */
export interface SandboxMeta {
  id: string;
  name: string;
  description?: string;
  /** The card (480 px WebP), used as the bundle's thumbnail. */
  thumbnail?: Buffer | null;
  /** recipe.json `folio` as `config.folio`, over the pen's own. */
  folio?: Record<string, unknown>;
}

export interface RunOptions {
  hb: HarnessBrowser;
  slug: string;
  variant: SampleLocale;
  meta: RecipeMeta;
  engine?: string;
  refreshNet?: boolean;
  /** Also encode PNG copies (for --previewDir). */
  png?: boolean;
  /** Write the Sandbox bundle (the card becomes its thumbnail). */
  sandbox?: SandboxMeta;
  /** Only the facts and the Sandbox bundle: no PDF, pages or card. */
  sandboxOnly?: boolean;
}

const PROBE = "/__cb/probe.js";

/** Calls an export of lib/probe.js inside the page. */
function probe<T>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    async (url: string, fn: string, params: unknown[]) => {
      const mod = await import(url);
      return mod[fn](...params);
    },
    PROBE,
    name,
    args,
  ) as Promise<T>;
}

function dataUrlBytes(url: string): Buffer {
  return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runVariant(opts: RunOptions): Promise<VariantRun> {
  const { hb, meta } = opts;
  const timeout = meta.capture.timeoutMs ?? 60_000;
  // Request interception stalls a module worker's imports, so a worker
  // recipe runs unintercepted: its page rewrites jsDelivr and postext.dev
  // URLs in fetch() to the local server, and hosts are checked after the fact.
  const passive = !!meta.engine.worker;
  const server = await startPenServer({ slug: opts.slug, variant: opts.variant, engine: opts.engine, rewriteFetch: passive });
  const netStats = { cached: 0, fetched: 0 };
  const run: VariantRun = {
    slug: opts.slug,
    variant: opts.variant,
    engine: server.engine,
    pen: server.current().pen,
    done: "timeout",
    err: null,
    loaderErrors: [],
    console: [],
    pageErrors: [],
    net: [],
    failedRequests: [],
    settle: null,
    kit: null,
    facts: null,
    tainted: [],
    pdf: null,
    published: [],
    publishError: null,
    cardErrors: [],
    pages: [],
    card: null,
    renderError: null,
    timings: { totalMs: 0, runMs: 0 },
    netStats,
    passive,
    workerEngines: [],
    sandbox: null,
  };
  const flagged = new Set<string>();
  const t0 = Date.now();
  const page = await hb.browser.newPage();
  try {
    const screenshot = meta.capture.card === "screenshot";
    const viewport = meta.capture.viewport ?? { width: 1280, height: 900 };
    await page.setViewport({ ...viewport, deviceScaleFactor: screenshot ? 2 : 1 });
    const localOrigin = server.url.replace(/\/$/, "");
    const onIssue = (issue: NetIssue) => {
      flagged.add(issue.url);
      run.net.push(issue);
    };
    if (!passive) {
      await page.setRequestInterception(true);
      page.on("request", interceptor({ localOrigin, userAgent: hb.userAgent, refresh: opts.refreshNet, stats: netStats, onIssue }));
    } else {
      page.on("request", (request) => {
        const url = request.url();
        if (url.startsWith(localOrigin) || !/^https?:/.test(url)) return;
        const route = routeFor(url);
        if (route.kind === "blocked") onIssue({ severity: "fail", url, detail: `host not allowed: ${route.host} (${url})` });
        const version = request.frame() === null ? /^https:\/\/esm\.sh\/postext@(\d+\.\d+\.\d+)\//.exec(url)?.[1] : undefined;
        if (version && !run.workerEngines.includes(version)) run.workerEngines.push(version);
      });
    }
    page.on("console", (message) => run.console.push({ type: message.type(), text: message.text() }));
    page.on("pageerror", (error) => run.pageErrors.push(error instanceof Error ? error.message : String(error)));
    page.on("requestfailed", (request) => {
      if (!flagged.has(request.url())) run.failedRequests.push(`${request.failure()?.errorText ?? "failed"}: ${request.url()}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && !flagged.has(response.url())) {
        run.failedRequests.push(`HTTP ${response.status()}: ${response.url()}`);
      }
    });

    await page.goto(server.url, { waitUntil: "domcontentloaded", timeout });
    try {
      await page.waitForFunction("window.__done !== undefined", { timeout: Math.max(1000, timeout - (Date.now() - t0)), polling: 100 });
    } catch {
      run.done = "timeout";
    }
    const state = (await page.evaluate(
      "({ done: window.__done ?? null, err: window.__err ?? null, errors: window.__cbErrors ?? [] })",
    )) as { done: "ok" | "error" | null; err: string | null; errors: string[] };
    if (state.done) run.done = state.done;
    run.err = state.err;
    run.loaderErrors = state.errors;
    if (run.done === "timeout") return run;

    // Fonts, then no new build for 500 ms (H10), then two frames.
    await page.evaluate("document.fonts.ready.then(() => true)");
    run.settle = await probe(page, "settle", 500, 10_000);
    await probe(page, "frames", 2);
    run.timings.runMs = Date.now() - t0;
    run.kit = await probe(page, "kitState");

    if (meta.downloads?.pdf && !opts.sandboxOnly) {
      const button = await page.$("[data-postext-pdf]");
      const pdf: NonNullable<VariantRun["pdf"]> = {
        wanted: true, button: !!button, timedOut: false, error: null, fontFailures: [], ms: 0, bytes: null,
      };
      run.pdf = pdf;
      if (button) {
        await page.evaluate("window.scrollTo(0, 0)");
        await button.click();
        try {
          await page.waitForFunction(
            "!!(window.__cb && (window.__cb.pdf || window.__cb.pdfError)) || document.documentElement.dataset.postext === 'error'",
            { timeout, polling: 100 },
          );
        } catch {
          pdf.timedOut = true;
        }
        const pdfState = await probe<{ bytes: number; error: string | null; fontFailures: string[]; ms: number }>(page, "pdfState");
        pdf.error = pdfState.error;
        pdf.fontFailures = pdfState.fontFailures;
        pdf.ms = pdfState.ms;
        if (pdfState.bytes) {
          const base64 = await probe<string | null>(page, "pdfBase64");
          if (base64) pdf.bytes = Buffer.from(base64, "base64");
        }
      }
    }

    const hero = heroPages(meta);
    const select = meta.capture.doc ?? "last";
    run.facts = await probe<ProbeFacts>(page, "facts", { select, hero });
    const all = (run.facts.pages ?? []).map((p) => p.n);
    if (run.facts.selected < 0 || all.length === 0) return run;
    if (opts.sandboxOnly) {
      if (opts.sandbox) run.sandbox = await sandboxBundle(page, select, opts.variant, opts.sandbox, opts.sandbox.thumbnail ?? null);
      return run;
    }

    run.tainted = await probe<number[]>(page, "taintedPages", { select });
    const published = publishedPages(meta, all);
    run.published = published.list;
    run.publishError = published.error;
    run.cardErrors = cardProblems(meta, all, new Map((run.facts.pages ?? []).map((p) => [p.n, p.book])));

    const rendered = await probe<{ pages?: { n: number; w: number; h: number; full: string; strip: string; png: string | null }[]; error?: string; taint?: boolean }>(
      page, "renderPages", { select, pages: run.published, png: !!opts.png },
    );
    if (rendered.error) run.renderError = { message: rendered.error, taint: !!rendered.taint };
    run.pages = (rendered.pages ?? []).map((p) => ({
      n: p.n, w: p.w, h: p.h, full: dataUrlBytes(p.full), strip: dataUrlBytes(p.strip), png: p.png ? dataUrlBytes(p.png) : null,
    }));

    let shot: string | null = null;
    if (screenshot && !run.cardErrors.length) {
      try {
        shot = await screenshotOf(page, meta.capture.selector ?? "#pages");
      } catch (error) {
        run.cardErrors.push((error as Error).message);
      }
    }
    if (!run.cardErrors.length && !run.renderError) {
      const card = await probe<{ card?: string; card480?: string; og?: string; png?: string | null; ogPng?: string | null; magnification?: number | null; error?: string; taint?: boolean }>(
        page, "composeCard", { select, mode: meta.capture.card, hero, focus: meta.capture.focus ?? null, screenshot: shot, png: !!opts.png },
      );
      if (card.error || !card.card || !card.card480 || !card.og) {
        run.renderError = { message: `card: ${card.error ?? "no image"}`, taint: !!card.taint };
      } else {
        run.card = {
          card: dataUrlBytes(card.card),
          card480: dataUrlBytes(card.card480),
          og: dataUrlBytes(card.og),
          png: card.png ? dataUrlBytes(card.png) : null,
          ogPng: card.ogPng ? dataUrlBytes(card.ogPng) : null,
          magnification: card.magnification ?? null,
        };
      }
    }
    if (opts.sandbox) run.sandbox = await sandboxBundle(page, select, opts.variant, opts.sandbox, run.card?.card480 ?? null);
    return run;
  } finally {
    run.timings.totalMs = Date.now() - t0;
    if (!run.timings.runMs) run.timings.runMs = run.timings.totalMs;
    // Let late requests settle before the page and its server go away.
    await sleep(20);
    await page.close().catch(() => {});
    await server.close();
  }
}

/** The selected document as a `.postext` file, written in the page by the
 *  pen's engine (lib/probe.js `sandboxBundle`). */
async function sandboxBundle(
  page: Page,
  select: CaptureBuild | CaptureBuild[],
  locale: SampleLocale,
  meta: SandboxMeta,
  thumbnail: Buffer | null,
): Promise<SandboxBundle> {
  try {
    const out = await probe<{ base64?: string; error?: string; warnings?: string[]; notes?: string[] }>(page, "sandboxBundle", {
      select,
      id: meta.id,
      name: meta.name,
      description: meta.description,
      locale,
      thumbnail: thumbnail ? thumbnail.toString("base64") : null,
      folio: meta.folio ?? null,
    });
    return {
      bytes: out.base64 ? Buffer.from(out.base64, "base64") : null,
      error: out.error ?? (out.base64 ? null : "no bundle"),
      warnings: out.warnings ?? [],
      notes: out.notes ?? [],
    };
  } catch (error) {
    return { bytes: null, error: String((error as Error).message ?? error), warnings: [], notes: [] };
  }
}

/** The DOM card (`capture.card: 'screenshot'`): the element's top 4:3, at
 *  the viewport and DPR 2 set when the page opened. */
async function screenshotOf(page: Page, selector: string): Promise<string> {
  await page.evaluate("window.scrollTo(0, 0)");
  const box = (await page.evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
      const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`,
  )) as { x: number; y: number; width: number; height: number } | null;
  if (!box || box.width < 1 || box.height < 1) throw new Error(`capture.selector matches nothing visible: ${selector}`);
  const height = Math.min(box.height, (box.width * 3) / 4);
  // Capturing beyond the viewport resizes it for the shot, and a page that
  // relayouts on resize (a WebGL viewer repainting its pages) is caught
  // half-drawn: only when the crop does not fit the viewport.
  const viewport = page.viewport();
  const fits = !!viewport && box.y + height <= viewport.height && box.x + box.width <= viewport.width;
  const base64 = await page.screenshot({
    clip: { x: box.x, y: box.y, width: box.width, height },
    captureBeyondViewport: !fits,
    encoding: "base64",
    type: "png",
  });
  return `data:image/png;base64,${base64}`;
}
