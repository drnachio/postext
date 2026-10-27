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
import path from "node:path";
import type { Page } from "puppeteer-core";
import type { CaptureBuild, SampleLocale } from "../../src/lib/cookbook/types.ts";
import { heroPages, publishedPages, cardProblems } from "./cards.ts";
import type { EpubRecord, ProbeFacts, BundleReadBack } from "./checks.ts";
import { type NetIssue, interceptor, routeFor } from "./net.ts";
import { startPenServer } from "./serve.ts";
import { step } from "./steps.ts";
import type { RunOptions, VariantRun, SandboxMeta, SandboxBundle, RenderedPage, PageChange } from "./harness/types.ts";

export { findChrome, launchBrowser } from "./harness/browser.ts";
export type { HarnessBrowser } from "./harness/browser.ts";
export type { RenderedPage, CardImages, VariantRun, SandboxBundle, PageChange, SandboxMeta, RunOptions } from "./harness/types.ts";

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

/** Past a step's own timeout, so Puppeteer's error (which names what it
 *  waited for) arrives before the step's bound does. */
const STEP_GRACE_MS = 5_000;
/** `document.fonts.ready` settles when the pen says it is done; a font
 *  request left without an answer would keep it pending for ever. */
const FONTS_BOUND_MS = 10_000;
/** A presented tab paints a frame every 16 ms. */
const FRAME_BOUND_MS = 500;

export async function runVariant(opts: RunOptions): Promise<VariantRun> {
  const { hb, meta } = opts;
  const timeout = meta.capture.timeoutMs ?? 60_000;
  // Request interception stalls a module worker's imports, so a worker
  // recipe runs unintercepted: its page rewrites jsDelivr and postext.dev
  // URLs in fetch() to the local server, and hosts are checked after the fact.
  const passive = !!meta.engine.worker;
  const server = await startPenServer({
    slug: opts.slug, variant: opts.variant, engine: opts.engine, rewriteFetch: passive,
    ...(opts.transformContent ? { transformContent: opts.transformContent } : {}),
  });
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
    fallbacks: [],
    kit: null,
    facts: null,
    tainted: [],
    pdf: null,
    epubs: [],
    published: [],
    publishError: null,
    cardErrors: [],
    pages: [],
    pageChanges: null,
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
  // Every step is named and bounded by the recipe's own timeout (#743): a
  // call that never answers says which step of which edition it was.
  const edition = `${opts.slug} ${opts.variant}`;
  const within = <T>(name: string, run: () => Promise<T>, timeoutMs: number = timeout) => step(name, { edition, timeoutMs }, run);
  let page: Page;
  try {
    // A window of its own (#743). As tabs of one window only the last one
    // opened is presented: the others get no animation frame, and
    // `document.fonts.ready` and whatever a pen awaits before it paints stay
    // pending until Chrome happens to bring them forward. With three
    // editions at a time the first one opened could wait for the whole run.
    page = await within("newPage", () => hb.browser.newPage({ type: "window" }));
  } catch (error) {
    await server.close();
    throw error;
  }
  try {
    const screenshot = meta.capture.card === "screenshot";
    const viewport = meta.capture.viewport ?? { width: 1280, height: 900 };
    await within("viewport", () => page.setViewport({ ...viewport, deviceScaleFactor: screenshot ? 2 : 1 }));
    const localOrigin = server.url.replace(/\/$/, "");
    const onIssue = (issue: NetIssue) => {
      flagged.add(issue.url);
      run.net.push(issue);
    };
    if (!passive) {
      await within("intercept", () => page.setRequestInterception(true));
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

    await within("goto", () => page.goto(server.url, { waitUntil: "domcontentloaded", timeout }), timeout + STEP_GRACE_MS);
    try {
      const left = Math.max(1000, timeout - (Date.now() - t0));
      await within("done", () => page.waitForFunction("window.__done !== undefined", { timeout: left, polling: 100 }), left + STEP_GRACE_MS);
    } catch {
      run.done = "timeout";
    }
    const state = await within("state", () => page.evaluate(
      "({ done: window.__done ?? null, err: window.__err ?? null, errors: window.__cbErrors ?? [] })",
    ) as Promise<{ done: "ok" | "error" | null; err: string | null; errors: string[] }>);
    if (state.done) run.done = state.done;
    run.err = state.err;
    run.loaderErrors = state.errors;
    if (run.done === "timeout") return run;

    // Fonts, then no new build for 500 ms (H10), then two frames. The
    // fonts and the frames wait on the browser, so each has a timer beside
    // it in the page (#743): a tab the browser is not presenting gets no
    // animation frame. No picture is taken of a `sandboxOnly` run, which
    // needs no frame at all.
    const fonts = await within("fonts", () => probe<{ timedOut?: boolean }>(page, "fontsReady", FONTS_BOUND_MS));
    if (fonts.timedOut) run.fallbacks.push(`fonts: document.fonts.ready did not settle in ${FONTS_BOUND_MS / 1000} s`);
    run.settle = await within("settle", () => probe(page, "settle", 500, 10_000));
    {
      const painted = await within("frames", () => probe<{ frames: number; fellBack?: boolean }>(page, "frames", 2, FRAME_BOUND_MS));
      if (painted.fellBack) run.fallbacks.push(`frames: no animation frame in ${FRAME_BOUND_MS} ms after ${painted.frames} of 2`);
    }
    run.timings.runMs = Date.now() - t0;
    run.kit = await within("kit", () => probe(page, "kitState"));
    run.epubs = await within("epubs", () => probe<EpubRecord[]>(page, "epubState"));

    if (meta.downloads?.pdf && !opts.sandboxOnly && !opts.factsOnly && !opts.pagesOnly) {
      const button = await within("pdfButton", () => page.$("[data-postext-pdf]"));
      const pdf: NonNullable<VariantRun["pdf"]> = {
        wanted: true, button: !!button, timedOut: false, error: null, fontFailures: [], ms: 0, bytes: null,
      };
      run.pdf = pdf;
      if (button) {
        await within("pdfClick", async () => {
          await page.evaluate("window.scrollTo(0, 0)");
          await button.click();
        });
        try {
          await within("pdf", () => page.waitForFunction(
            "!!(window.__cb && (window.__cb.pdf || window.__cb.pdfError)) || document.documentElement.dataset.postext === 'error'",
            { timeout, polling: 100 },
          ), timeout + STEP_GRACE_MS);
        } catch {
          pdf.timedOut = true;
        }
        const pdfState = await within("pdfState", () => probe<{ bytes: number; error: string | null; fontFailures: string[]; ms: number }>(page, "pdfState"));
        pdf.error = pdfState.error;
        pdf.fontFailures = pdfState.fontFailures;
        pdf.ms = pdfState.ms;
        if (pdfState.bytes) {
          const base64 = await within("pdfBytes", () => probe<string | null>(page, "pdfBase64"));
          if (base64) pdf.bytes = Buffer.from(base64, "base64");
        }
      }
    }

    const hero = heroPages(meta);
    const select = meta.capture.doc ?? "last";
    run.facts = await within("facts", () => probe<ProbeFacts>(page, "facts", { select, hero }));
    // C36: the characters no loaded file of their family holds (the
    // browser is asked, which takes a moment: a step of its own).
    if (run.facts.selected >= 0) {
      run.facts.systemFont = await within("systemFont", () => probe<NonNullable<ProbeFacts["systemFont"]>>(page, "systemFontChars", { select }));
    }
    const all = (run.facts.pages ?? []).map((p) => p.n);
    if (run.facts.selected < 0 || all.length === 0 || opts.factsOnly) return run;
    if (opts.pagesOnly) {
      const rendered = await within("pages", () => probe<{ pages?: { n: number; w: number; h: number; full: string; strip: string; png: string | null }[]; error?: string; taint?: boolean }>(
        page, "renderPages", { select, pages: all, png: true },
      ));
      if (rendered.error) run.renderError = { message: rendered.error, taint: !!rendered.taint };
      run.pages = (rendered.pages ?? []).map((p) => ({
        n: p.n, w: p.w, h: p.h, full: dataUrlBytes(p.full), strip: dataUrlBytes(p.strip), png: p.png ? dataUrlBytes(p.png) : null,
      }));
      return run;
    }
    const keep = meta.capture.sandbox ?? null;
    if (opts.sandboxOnly) {
      const sandbox = opts.sandbox;
      if (sandbox) run.sandbox = await within("bundle", () => sandboxBundle(page, select, keep, opts.variant, sandbox, sandbox.thumbnail ?? null, null));
      return run;
    }

    run.tainted = await within("tainted", () => probe<number[]>(page, "taintedPages", { select }));
    const published = publishedPages(meta, all);
    run.published = published.list;
    run.publishError = published.error;
    run.cardErrors = cardProblems(meta, all, new Map((run.facts.pages ?? []).map((p) => [p.n, p.book])));

    const rendered = await within("pages", () => probe<{ pages?: { n: number; w: number; h: number; full: string; strip: string; png: string | null }[]; error?: string; taint?: boolean }>(
      page, "renderPages", { select, pages: run.published, png: !!opts.png },
    ));
    if (rendered.error) run.renderError = { message: rendered.error, taint: !!rendered.taint };
    run.pages = (rendered.pages ?? []).map((p) => ({
      n: p.n, w: p.w, h: p.h, full: dataUrlBytes(p.full), strip: dataUrlBytes(p.strip), png: p.png ? dataUrlBytes(p.png) : null,
    }));

    if (opts.committedDir && !run.renderError) {
      const dir = opts.committedDir;
      run.pageChanges = await within("compare", () => changedPages(page, dir, run.pages, opts.maxDiff));
    }

    let shot: string | null = null;
    if (screenshot && !run.cardErrors.length) {
      try {
        shot = await within("screenshot", () => screenshotOf(page, meta.capture.selector ?? "#pages"));
      } catch (error) {
        run.cardErrors.push((error as Error).message);
      }
    }
    if (!run.cardErrors.length && !run.renderError) {
      const card = await within("card", () => probe<{ card?: string; card480?: string; og?: string; png?: string | null; ogPng?: string | null; magnification?: number | null; error?: string; taint?: boolean }>(
        page, "composeCard", { select, mode: meta.capture.card, hero, focus: meta.capture.focus ?? null, screenshot: shot, png: !!opts.png },
      ));
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
    const sandbox = opts.sandbox;
    const committedBundle = opts.committedDir ? path.join(opts.committedDir, `${opts.slug}.postext`) : null;
    const committed = committedBundle && fs.existsSync(committedBundle) ? fs.readFileSync(committedBundle) : null;
    if (sandbox) run.sandbox = await within("bundle", () => sandboxBundle(page, select, keep, opts.variant, sandbox, run.card?.card480 ?? null, committed));
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
 *  pen's engine and read back by it (lib/probe.js `sandboxBundle`). `keep`
 *  is `capture.sandbox`: of several builds, the one whose configuration the
 *  bundle takes. */
async function sandboxBundle(
  page: Page,
  select: CaptureBuild | CaptureBuild[],
  keep: CaptureBuild | null,
  locale: SampleLocale,
  meta: SandboxMeta,
  thumbnail: Buffer | null,
  committed: Buffer | null,
): Promise<SandboxBundle> {
  const none = { warnings: [], notes: [], warns: [], penWarnings: [], pages: 0, allPages: 0, readBack: null, committedReadBack: null };
  try {
    const out = await probe<{
      base64?: string; error?: string; warnings?: string[]; notes?: string[]; warns?: string[];
      pages?: number; allPages?: number; readBack?: BundleReadBack; committedReadBack?: BundleReadBack; penWarnings?: string[];
    }>(page, "sandboxBundle", {
      select,
      keep,
      id: meta.id,
      name: meta.name,
      description: meta.description,
      locale,
      thumbnail: thumbnail ? thumbnail.toString("base64") : null,
      folio: meta.folio ?? null,
      committed: committed ? committed.toString("base64") : null,
    });
    return {
      bytes: out.base64 ? Buffer.from(out.base64, "base64") : null,
      error: out.error ?? (out.base64 ? null : "no bundle"),
      warnings: out.warnings ?? [],
      notes: out.notes ?? [],
      warns: out.warns ?? [],
      penWarnings: out.penWarnings ?? [],
      pages: out.pages ?? 0,
      allPages: out.allPages ?? 0,
      readBack: out.readBack ?? null,
      committedReadBack: out.committedReadBack ?? null,
    };
  } catch (error) {
    return { ...none, bytes: null, error: String((error as Error).message ?? error) };
  }
}

/** The published pages whose image is not the committed one (#734): equal
 *  bytes pass at once; the rest are decoded in the page, both sides, and
 *  compared cell by cell (lib/probe.js `comparePages`). */
async function changedPages(page: Page, dir: string, pages: RenderedPage[], max?: number): Promise<PageChange[]> {
  const changes: PageChange[] = [];
  const pairs: { n: number; committed: string; fresh: string }[] = [];
  for (const p of pages) {
    const file = path.join(dir, `p${String(p.n).padStart(2, "0")}.webp`);
    if (!fs.existsSync(file)) {
      changes.push({ n: p.n, detail: "no committed image" });
      continue;
    }
    const committed = fs.readFileSync(file);
    if (!committed.equals(p.full)) pairs.push({ n: p.n, committed: committed.toString("base64"), fresh: p.full.toString("base64") });
  }
  // A few at a time: each pair is two images through the protocol.
  for (let i = 0; i < pairs.length; i += 4) {
    const compared = await probe<{ n: number; differ: boolean; worst: number; cells: number; error?: string }[]>(page, "comparePages", pairs.slice(i, i + 4), max === undefined ? {} : { max });
    for (const c of compared) {
      if (c.differ) changes.push({ n: c.n, worst: c.worst, detail: c.error ?? `worst cell ${c.worst} of 255, ${c.cells} cell${c.cells === 1 ? "" : "s"} over the threshold` });
    }
  }
  return changes.sort((a, b) => a.n - b.n);
}

/** The DOM card (`capture.card: 'screenshot'`): the element's top 4:3, at
 *  the viewport and DPR 2 set when the page opened. */
async function screenshotOf(page: Page, selector: string): Promise<string> {
  await page.evaluate("window.scrollTo(0, 0)");
  // The selector goes in as an argument, never spliced into the code.
  const box = (await page.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
  }, selector)) as { x: number; y: number; width: number; height: number } | null;
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
