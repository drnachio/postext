/**
 * `pnpm cookbook sandbox [slug…]`: every recipe bundle through the Sandbox's
 * own font and layout path, against what capture.json records (#736).
 *
 * Check C33 reads a bundle back on the pen's engine with the pen's fonts.
 * It runs no Sandbox code: the Sandbox takes its faces from Google Fonts
 * and Fontsource by family name and sends them to a layout worker, and
 * four defects of 1.25 and 1.26 sat on that path with every capture check
 * green (#688, #689, #690, #691). Each showed as a warning the Sandbox
 * raised and the pen did not.
 *
 *   no --site   the working tree: the Sandbox package's headless entry
 *               (`src/headless/layOutBundle.ts`) and its layout worker are
 *               built with bun and run in a page of the capture's own
 *               static server, the network through the capture's cache
 *   --site URL  a deployed site: `/<lang>/sandbox#recipe=<slug>&lang=<lang>`
 *               in a browser context of its own, the layout worker's
 *               `built` messages read from the page. Also fails when the
 *               page fetched another edition's bundle (#737)
 *
 * An edition fails when its bundle does not open or lay out, when the
 * worker or the page reports an error, when nothing comes within the
 * timeout, or when the Sandbox raises a warning that is not in
 * `sandbox.warnings`. A chapter count, a page count or (on the engine
 * capture.json records) lines other than `sandbox.chapters` fail with
 * --strict and warn without it: a pull request that moves lines on purpose
 * cannot capture the recipe again before its release.
 *
 * The lines, not the layout hash: up to #757 the Sandbox did not measure
 * with the files a pen measures with. The kit loads the static cuts
 * Fontsource serves; the Sandbox's loader took Google's variable file,
 * whose advances between the masters are not rounded to the font's units.
 * A line of body text came out a few hundredths to a few tenths of a pixel
 * wider or narrower (an edition's widest difference: 0.11 px in the median
 * one, 2.3 px in the worst), and the layout hash rounds every box to half
 * a pixel. On the 334 editions captured on 1.28.1: 134 with another layout
 * hash, 127 of them with every line the same and widths apart, 7 with two
 * to eight lines broken at another word. Since #757 the loader declares
 * the static cuts, in the kit's order, and the 334 come back with the
 * recorded layout hash; a family it still takes from Google's style sheet
 * (one Fontsource has no files for, a weight between two cuts) may differ
 * again. The lines hash (`linesHash` in lib/probe.js) holds no box, so it
 * tells a line broken elsewhere from one set to another width; a layout
 * hash that differs under the same lines is a note.
 *
 * Run by Node's type stripping: erasable TypeScript, relative `.ts` imports.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { styleText } from 'node:util';
import type { CDPSession, Browser, Page } from 'puppeteer-core';
import { htmlLang } from '../../src/i18n/locales.ts';
import { WEB_DIR, REPO_DIR, captureDir } from '../../src/lib/cookbook/paths.ts';
import { listRecipeSlugs, readRecipeMeta } from '../../src/lib/cookbook/sources.ts';
import { type SampleLocale, type CaptureVariant, SAMPLE_LOCALES } from '../../src/lib/cookbook/types.ts';
import { parseArgs, str, UsageError, flag, list, int, userPath } from './args.ts';
import type { CaptureResult } from './capture.ts';
import type { NetIssue } from './net.ts';
import { releasedVersion } from './shim.ts';
import { step, StepError, harnessDetail } from './steps.ts';
import { type Edition, editionsOf, dim, bundleFile, compareEdition, resultOf, pool } from './sandbox/compare.ts';

export { extraWarnings, WARNING_SINCE, warningSince, laterRelease, variableFamilies } from './sandbox/warnings.ts';
export { compareEdition } from './sandbox/compare.ts';

export { SANDBOX_USAGE } from "./sandbox-usage.ts";

// ─── What is compared ───────────────────────────────────────────────────────

/** One chapter as the Sandbox laid it out. */
export interface SandboxChapter {
  pages: number;
  hash?: string;
  /** The lines and their order, no box (lib/probe.js `linesHash`). */
  lines?: string;
  /** Kind and what it names, positions aside (lib/probe.js `warningsOf`). */
  warnings: string[];
}

/** What a run of one edition brought back. */
export interface SandboxRun {
  chapters: SandboxChapter[];
  /** Faces per family: on the page and sent to the worker. */
  fonts: Record<string, { page: string[]; worker: string[] }>;
  /** The plan settled and every chapter has a document. */
  settled: boolean;
  /** Page, console and worker errors. */
  errors: string[];
  /** `--site`: the `.postext` the page fetched (its path). */
  bundleUrl?: string;
}

/** What capture.json records for the edition. */
export interface SandboxExpected {
  slug: string;
  variant: SampleLocale;
  sandbox: NonNullable<CaptureVariant["sandbox"]>;
  /** Pages of the capture (`specimen.pages`), for an edition without `sandbox.chapters`. */
  pages: number;
  /** The engine capture.json records. */
  engine: string;
}

export interface SandboxFinding {
  severity: "fail" | "warn" | "info";
  detail: string;
}

// ─── The working tree ───────────────────────────────────────────────────────

// A directory per run: two checks at once (two sessions in one tree) would
// otherwise serve their pages from a build the other is writing anew.
const BUILD_DIR = path.join(WEB_DIR, ".cache", "cookbook-sandbox", String(process.pid));
const SANDBOX_SRC = path.join(REPO_DIR, "packages", "postext-sandbox", "src");

/** bun, as the workspace installed it (a dev dependency of postext-cli), else on the PATH. */
function findBun(): string {
  for (const dir of [path.join(WEB_DIR, "node_modules", ".bin"), path.join(REPO_DIR, "packages", "postext-cli", "node_modules", ".bin")]) {
    const file = path.join(dir, process.platform === "win32" ? "bun.exe" : "bun");
    if (fs.existsSync(file)) return file;
  }
  return "bun";
}

/** The page entry and the layout worker of the Sandbox package, built from
 *  the working tree as two files that import nothing: a worker's request
 *  for a chunk of its module graph now and then got no answer under the
 *  harness's request interception, and the edition stalled on
 *  `/__sb/page-<hash>.js` (#736). MathJax and the citation engine are in
 *  the files, and still run only when a text needs them. */
export function buildSandboxEntries(outDir: string = BUILD_DIR): void {
  for (const name of ["postext", "postext-citeproc"]) {
    if (!fs.existsSync(path.join(REPO_DIR, "packages", name, "dist", "index.js"))) {
      throw new Error(`packages/${name}/dist is not built: run pnpm turbo run build --filter=postext-sandbox... first`);
    }
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  try {
    for (const entry of ["page.ts", "worker.ts"]) {
      execFileSync(findBun(), [
        "build", path.join(SANDBOX_SRC, "headless", entry),
        "--outdir", outDir, "--target", "browser", "--format", "esm",
      ], { cwd: path.join(REPO_DIR, "packages", "postext-sandbox"), stdio: ["ignore", "pipe", "pipe"] });
    }
  } catch (error) {
    const { stderr, stdout, message } = error as { stderr?: Buffer; stdout?: Buffer; message: string };
    throw new Error(`the Sandbox's headless entry did not build with bun: ${String(stderr ?? "") || String(stdout ?? "") || message}`);
  }
}

/** Where a thread is, if it is running script: the debugger stops it and
 *  says its frames. "idle" for a thread that waits (#757). */
async function runningIn(client: CDPSession, label: string): Promise<string> {
  try {
    await Promise.race([client.send("Debugger.enable"), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    const paused = new Promise<{ callFrames: { functionName: string; url: string; location: { lineNumber: number; columnNumber?: number } }[] } | null>((resolve) => {
      client.once("Debugger.paused", resolve);
      setTimeout(() => resolve(null), 3_000);
    });
    await Promise.race([client.send("Debugger.pause"), new Promise((resolve) => setTimeout(resolve, 3_000))]);
    const stop = await paused;
    if (!stop) return `${label}: idle`;
    const frames = stop.callFrames.slice(0, 12).map((f) => `${f.functionName || "(anonymous)"} ${f.url.split("/").pop()}:${f.location.lineNumber + 1}:${f.location.columnNumber ?? 0}`);
    void client.send("Debugger.resume").catch(() => {});
    return `${label} runs ${frames.join(" < ")}`;
  } catch (error) {
    return `${label}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** One edition in a page of the harness: a browser context of its own (the
 *  font store and the loader's caches are per page), the network through
 *  the capture's cache with Google Fonts allowed. */
async function runLocal(browser: Browser, userAgent: string, url: string, edition: Edition, refresh: boolean, crashes: ReadonlyMap<string, string>): Promise<SandboxRun> {
  const { interceptor } = await import("./net.ts");
  const name = `${edition.slug} ${edition.variant}`;
  const within = <T>(what: string, run: () => Promise<T>, timeoutMs = edition.timeoutMs) => step(what, { edition: name, timeoutMs }, run);
  const context = await browser.createBrowserContext();
  const errors: string[] = [];
  try {
    const page = await within("newPage", () => context.newPage({ type: "window" }));
    const issues: NetIssue[] = [];
    await within("intercept", () => page.setRequestInterception(true));
    page.on("request", interceptor({ localOrigin: url.replace(/\/$/, ""), userAgent, refresh, profile: "sandbox", onIssue: (issue) => issues.push(issue) }));
    // The requests still out, for a step that never answers (#757): what
    // the page waits for is the first thing to know about a stall.
    const out = new Map<string, number>();
    page.on("request", (request) => out.set(request.url(), Date.now()));
    page.on("requestfinished", (request) => out.delete(request.url()));
    page.on("requestfailed", (request) => out.delete(request.url()));
    const waitingFor = (): string => {
      const now = Date.now();
      const urls = [...out].map(([u, at]) => `${u.replace(/^https?:\/\//, "")} (${Math.round((now - at) / 1000)} s)`);
      return urls.length ? `the page waits for ${urls.slice(0, 6).join(", ")}${urls.length > 6 ? ` and ${urls.length - 6} more` : ""}` : "no request of the page is out";
    };
    page.on("pageerror", (error) => errors.push(`page error: ${error instanceof Error ? error.message : String(error)}`));
    // The debugger, on from the start (#757): a thread that never comes back
    // (a loop) answers no question, and only a debugger already on can
    // stop it to say where it is.
    const debug = await page.createCDPSession();
    await debug.send("Debugger.enable").catch(() => {});
    page.on("workercreated", (worker) => { void worker.client.send("Debugger.enable").catch(() => {}); });
    // The page's process gone (#757): nothing it was asked gets an answer.
    let crashed = "";
    const died = new Promise<never>((_, reject) => {
      page.on("error", (error) => {
        // How it ended, as the browser says it (crashed, killed, out of memory, and the exit code).
        crashed = `the page's process died (${error instanceof Error ? error.message : String(error)})`;
        // The browser's word comes a moment after the page's.
        setTimeout(() => {
          const how = crashes.get((page.target() as unknown as { _targetId?: string })._targetId ?? "");
          if (how) crashed = `the page's process died (${how})`;
          reject(new StepError("layout", name, crashed, { stalled: true }));
        }, 300);
      });
    });
    died.catch(() => {});
    page.on("console", (message) => {
      // A font file the loader could not fetch is the warnings' business.
      if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(`console error: ${message.text().slice(0, 300)}`);
    });
    await within("goto", () => page.goto(url, { waitUntil: "domcontentloaded", timeout: edition.timeoutMs }));
    await within("entry", () => page.waitForFunction("window.__sbReady !== undefined", { timeout: edition.timeoutMs, polling: 50 }));
    const laid = await within("layout", () => Promise.race([died, page.evaluate(
      async (bundle: string, locale: string) => {
        const w = window as unknown as {
          __sbReady?: boolean; __sbErrors: string[];
          __postextSandbox?: { layOutBundle(bytes: Uint8Array, options: object): Promise<{ chapters: { pages: number; hash?: string; lines?: string; warnings: string[] }[]; fonts: Record<string, { page: string[]; worker: string[] }>; settled: boolean; unanswered: string[] }> };
        };
        if (!w.__sbReady || !w.__postextSandbox) return { error: `the Sandbox entry did not load: ${w.__sbErrors.join(" · ")}` };
        try {
          const stage = (name: string) => { (window as unknown as { __sbStage?: string }).__sbStage = name; };
          stage("importing the probe");
          const probe = (await import("/__cb/probe.js" as string)) as { layoutHash(doc: unknown): string; linesHash(doc: unknown): string; warningsOf(doc: unknown): string[] };
          stage("fetching the bundle");
          const res = await fetch(bundle);
          if (!res.ok) return { error: `the bundle did not load: HTTP ${res.status}` };
          const bytes = new Uint8Array(await res.arrayBuffer());
          // The worker's script is fetched by the page and handed over as a
          // blob: a worker's own request for it now and then got no answer
          // under the harness's request interception (#736).
          stage("fetching the worker's script");
          const script = await fetch("/__sb/worker.js");
          if (!script.ok) return { error: `the layout worker did not load: HTTP ${script.status}` };
          const worker = new Worker(URL.createObjectURL(new Blob([await script.text()], { type: "text/javascript" })), { type: "module" });
          worker.addEventListener("error", (event) => w.__sbErrors.push(`worker error: ${event.message ?? "the layout worker failed to start"}`));
          stage("layOutBundle");
          const out = await w.__postextSandbox.layOutBundle(bytes, { locale, worker, layoutHash: probe.layoutHash, linesHash: probe.linesHash, warningsOf: probe.warningsOf });
          return { chapters: out.chapters, fonts: out.fonts, settled: out.settled, unanswered: out.unanswered, errors: w.__sbErrors };
        } catch (error) {
          return { error: `the bundle does not open and lay out in the Sandbox: ${String((error as Error)?.message ?? error)}`, errors: w.__sbErrors };
        }
      },
      `/__bundle/${edition.slug}/${edition.variant}`,
      htmlLang(edition.variant),
    )])).catch(async (error: unknown) => {
      if (!(error instanceof StepError && error.stalled)) throw error;
      // A process that died says nothing more: tried again at once.
      if (crashed) throw error;
      // What the page says it waits for (#757): the step of the headless
      // entry, the loader's requests, the layout service, the worker.
      const state = await Promise.race([
        page.evaluate(() => {
          const w = window as unknown as { __sbStage?: string; __sbErrors?: string[]; __postextSandbox?: { state?: () => unknown } };
          return JSON.stringify({ stage: w.__sbStage ?? "before the layout", errors: w.__sbErrors ?? [], entry: w.__postextSandbox?.state?.() ?? null });
        }).catch((e: unknown) => `the page did not say (${e instanceof Error ? e.message : String(e)})`),
        new Promise<string>((resolve) => setTimeout(() => resolve("the page did not say in 8 s"), 8_000)),
      ]);
      // And what its threads are running, when one is busy: a page that
      // does not say is a main thread that does not come back, and a
      // worker in a loop answers nothing either. The debugger stops a
      // running thread where it is; an idle one has nothing to stop.
      const stacks = await Promise.all([
        runningIn(debug, "the page"),
        ...page.workers().map((worker, i) => runningIn(worker.client, `worker ${i + 1}`)),
      ]);
      if (page.workers().length === 0) stacks.push("no worker");
      throw new StepError(error.step, error.edition, `${error.message.replace(/^step \S+ of [^:]+: /, "")}; ${waitingFor()}; state ${state}; ${stacks.join("; ")}`, { stalled: true });
    });
    for (const issue of issues) if (issue.severity === "fail") errors.push(`network: ${issue.detail}`);
    if ("error" in laid && laid.error) return { chapters: [], fonts: {}, settled: false, errors: [laid.error, ...(laid.errors ?? []), ...errors] };
    const ok = laid as { chapters: SandboxChapter[]; fonts: SandboxRun["fonts"]; settled: boolean; unanswered?: string[]; errors: string[] };
    // A font request the network did not answer (#757): the pages were laid
    // out without that file, which says nothing of the bundle. Tried once
    // more, as a step that never answered is.
    if (ok.unanswered?.length) {
      throw new StepError("layout", name, `the network did not answer ${ok.unanswered.length} font request${ok.unanswered.length === 1 ? "" : "s"} (${ok.unanswered.slice(0, 4).map((u) => u.replace(/^https?:\/\//, "")).join(", ")}${ok.unanswered.length > 4 ? ", …" : ""})`, { stalled: true });
    }
    return { chapters: ok.chapters, fonts: ok.fonts, settled: ok.settled, errors: [...ok.errors, ...errors] };
  } finally {
    await context.close().catch(() => {});
  }
}

// ─── A deployed site ────────────────────────────────────────────────────────

/** Runs before the page's scripts: every layout worker's `build` requests
 *  and `built` answers are kept, the newest document per text built (a
 *  chapter is built again when the ones before it move its start). */
const SITE_HOOK = `(() => {
  const state = (window.__sbSite = { chapters: new Map(), errors: [], lastBuiltAt: 0, seq: 0 });
  const Real = window.Worker;
  window.Worker = class extends Real {
    constructor(url, options) {
      super(url, options);
      const asked = new Map();
      const post = this.postMessage.bind(this);
      this.postMessage = (data, transfer) => {
        if (data && data.kind === 'build' && data.content) asked.set(data.id, String(data.content.markdown ?? ''));
        return post(data, transfer);
      };
      this.addEventListener('message', (event) => {
        const data = event.data || {};
        if (data.kind === 'built' && data.doc && asked.has(data.id)) {
          state.chapters.set(asked.get(data.id), { doc: data.doc, seq: state.seq++ });
          state.lastBuiltAt = performance.now();
        }
        if (data.kind === 'error') state.errors.push('worker error: ' + String(data.message ?? data.error ?? '').slice(0, 300));
      });
      this.addEventListener('error', (event) => state.errors.push('worker error: ' + String(event.message ?? 'the layout worker failed').slice(0, 300)));
    }
  };
})()`;

/** How long no `built` message must come before the last one is read. */
const QUIET_MS = 2500;

async function runSite(browser: Browser, site: string, edition: Edition): Promise<SandboxRun> {
  const probe = (await import("./lib/probe.js" as string)) as { layoutHash(doc: unknown): string; linesHash(doc: unknown): string; warningsOf(doc: unknown): string[] };
  const name = `${edition.slug} ${edition.variant}`;
  const within = <T>(what: string, run: () => Promise<T>, timeoutMs = edition.timeoutMs) => step(what, { edition: name, timeoutMs }, run);
  const context = await browser.createBrowserContext();
  const errors: string[] = [];
  let bundleUrl: string | undefined;
  try {
    const page: Page = await within("newPage", () => context.newPage({ type: "window" }));
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(SITE_HOOK);
    page.on("pageerror", (error) => errors.push(`page error: ${error instanceof Error ? error.message : String(error)}`));
    page.on("requestfinished", (request) => {
      const url = request.url();
      if (url.split("?")[0]!.endsWith(".postext") && request.response()?.ok()) bundleUrl = new URL(url).pathname;
    });
    await within("goto", () => page.goto(`${site}/${edition.variant}/sandbox#recipe=${edition.slug}&lang=${edition.variant}`, { waitUntil: "domcontentloaded", timeout: edition.timeoutMs }));
    // Every chapter paginated, the book's fonts settled (`data-postext-fonts`,
    // #757: no build waits for font files and no layout for late faces is
    // due; a deploy older than the attribute is waited for as before), and
    // no `built` message for a while.
    await within("layout", () => page.waitForFunction(
      `(() => { const s = window.__sbSite; return !!s && s.chapters.size > 0 && performance.now() - s.lastBuiltAt > ${QUIET_MS}
        && document.documentElement.dataset.postextPagination !== 'pending' && document.documentElement.dataset.postextPagination !== 'loading'
        && document.documentElement.dataset.postextFonts !== 'pending'; })()`,
      { timeout: edition.timeoutMs, polling: 250 },
    ), edition.timeoutMs + 5_000);
    const count = await page.evaluate("window.__sbSite.chapters.size") as number;
    const docs: { offset: number; seq: number; doc: unknown }[] = [];
    for (let i = 0; i < count; i++) {
      // One document at a time through the protocol.
      const json = await within("read", () => page.evaluate(
        `(() => { const entry = [...window.__sbSite.chapters.values()][${i}]; return JSON.stringify({ seq: entry.seq, doc: entry.doc }); })()`,
      ) as Promise<string>);
      const { seq, doc } = JSON.parse(json) as { seq: number; doc: { pageIndexOffset?: number } };
      docs.push({ offset: doc.pageIndexOffset ?? 0, seq, doc });
    }
    errors.push(...(await page.evaluate("window.__sbSite.errors") as string[]));
    docs.sort((a, b) => a.offset - b.offset || a.seq - b.seq);
    const chapters = docs.map(({ doc }) => ({
      pages: (doc as { pages: unknown[] }).pages.length, hash: probe.layoutHash(doc), lines: probe.linesHash(doc), warnings: probe.warningsOf(doc),
    }));
    return { chapters, fonts: {}, settled: true, errors, bundleUrl };
  } finally {
    await context.close().catch(() => {});
  }
}

// ─── The command ────────────────────────────────────────────────────────────

export interface SandboxOptions {
  slugs: string[];
  langs?: SampleLocale[];
  site?: string;
  strict: boolean;
  concurrency?: number;
  timeoutMs: number;
  report?: string;
  refreshNet?: boolean;
}

export async function runSandboxCheck(opts: SandboxOptions): Promise<CaptureResult[]> {
  const langs = opts.langs?.length ? opts.langs : SAMPLE_LOCALES;
  const { editions, broken } = editionsOf(opts.slugs, langs, opts.timeoutMs);
  const results: CaptureResult[] = [...broken];
  if (!editions.length) return results;

  const { launchBrowser } = await import("./harness.ts");
  const tree = releasedVersion("postext");
  let server: { url: string; close(): Promise<void> } | null = null;
  if (!opts.site) {
    process.stderr.write(dim("  building the Sandbox's headless entry and its layout worker with bun\n"));
    buildSandboxEntries();
    const { startSandboxServer } = await import("./serve.ts");
    server = await startSandboxServer({ buildDir: BUILD_DIR, bundleFile });
  }
  // An edition that hangs fails alone: a CDP call may wait a little longer
  // than the edition's own bound, no more.
  const hb = await launchBrowser({ protocolTimeout: opts.timeoutMs + 30_000 });
  // How a page's process ended, by target (#757): the browser says whether
  // it crashed, was killed or ran out of memory, and with what code.
  const crashes = new Map<string, string>();
  try {
    const session = await hb.browser.target().createCDPSession();
    await session.send("Target.setDiscoverTargets", { discover: true });
    session.on("Target.targetCrashed", (event: { targetId: string; status: string; errorCode: number }) => {
      crashes.set(event.targetId, `${event.status}, code ${event.errorCode}`);
    });
  } catch {
    // The reason is a nicety: without it a death is still told.
  }
  try {
    const jobs = editions.map((edition) => async () => {
      const t0 = Date.now();
      process.stderr.write(dim(`  ${opts.site ? "opening" : "laying out"} ${edition.slug} ${edition.variant}\n`));
      let run: SandboxRun | null = null;
      let findings: SandboxFinding[];
      // The lines are the engine's: only the recorded release gives the recorded ones.
      let version = tree;
      // A step that never answered gets a second try in a context of its
      // own: a font file the network stalled on is in the cache by then, and
      // an edition that hangs for a reason of its own hangs again and fails.
      const open = () => opts.site
        ? runSite(hb.browser, opts.site.replace(/\/$/, ""), edition)
        : runLocal(hb.browser, hb.userAgent, server!.url, edition, !!opts.refreshNet, crashes);
      try {
        let stalled: StepError | null = null;
        try {
          run = await open();
        } catch (error) {
          if (!(error instanceof StepError && error.stalled)) throw error;
          stalled = error;
          process.stderr.write(dim(`  ${edition.slug} ${edition.variant}: ${error.message}; trying once more\n`));
          run = await open();
        }
        if (opts.site) version = edition.engine;
        findings = compareEdition(edition, run, {
          strict: opts.strict,
          sameEngine: opts.site ? true : edition.engine === tree,
          ...(opts.site ? { ownBundle: `/cookbook/${edition.slug}/${edition.variant}/${edition.slug}.postext` } : {}),
        });
        if (stalled) findings.push({ severity: "info", detail: `laid out at the second try (the first: ${stalled.message})` });
      } catch (error) {
        findings = [{ severity: "fail", detail: harnessDetail(error) }];
      }
      return resultOf(edition, findings, run, Date.now() - t0, version);
    });
    results.push(...await pool(jobs, opts.concurrency ?? 3));
  } finally {
    await hb.browser.close().catch(() => {});
    await server?.close();
    if (!opts.site) fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  }
  if (opts.report) {
    fs.mkdirSync(path.dirname(opts.report), { recursive: true });
    fs.writeFileSync(opts.report, `${JSON.stringify({ mode: opts.site ? "site" : "tree", site: opts.site ?? null, postext: tree, strict: opts.strict, chrome: hb.chrome, results }, null, 2)}\n`);
  }
  return results;
}

export async function runSandbox(argv: readonly string[]): Promise<number> {
  const args = parseArgs(
    argv,
    {
      lang: { type: "list", value: "en,es", choices: SAMPLE_LOCALES },
      site: { type: "string", value: "url" },
      strict: { type: "boolean" },
      "no-strict": { type: "boolean" },
      concurrency: { type: "int", value: "n", min: 1, max: 16 },
      timeout: { type: "int", value: "s", min: 5, max: 1800 },
      report: { type: "string", value: "out.json" },
      "refresh-net": { type: "boolean" },
    },
    "sandbox",
  );
  const site = str(args, "site");
  if (site && !/^https?:\/\/[^/]+/.test(site)) throw new UsageError(`--site expects a URL (https://postext.dev), not "${site}"`, "sandbox");
  if (flag(args, "strict") && flag(args, "no-strict")) throw new UsageError("pass --strict or --no-strict, not both", "sandbox");
  const known = listRecipeSlugs();
  const unknown = args.positionals.filter((slug) => !known.includes(slug));
  if (unknown.length) throw new UsageError(`no recipe ${unknown.map((s) => `"${s}"`).join(", ")} in cookbook/`, "sandbox");
  // With no slugs: every captured recipe that is not retired.
  const slugs = args.positionals.length ? args.positionals : known.filter((slug) => {
    try {
      return readRecipeMeta(slug).status !== "retired" && fs.existsSync(path.join(captureDir(slug), "capture.json"));
    } catch {
      return false;
    }
  });
  const strict = site ? !flag(args, "no-strict") : flag(args, "strict");
  const report = str(args, "report");
  const { printResults } = await import("./report.ts");
  console.log(`${styleText("bold", "Cookbook Sandbox check", { stream: process.stdout })} · ${slugs.length} recipe${slugs.length === 1 ? "" : "s"} · ${site ?? "the working tree"}${strict ? " · strict" : ""}\n`);
  const results = await runSandboxCheck({
    slugs,
    langs: list(args, "lang") as SampleLocale[] | undefined,
    ...(site ? { site } : {}),
    strict,
    concurrency: int(args, "concurrency"),
    timeoutMs: (int(args, "timeout") ?? 60) * 1000,
    ...(report ? { report: userPath(report) } : {}),
    refreshNet: flag(args, "refresh-net"),
  });
  return printResults(results);
}
