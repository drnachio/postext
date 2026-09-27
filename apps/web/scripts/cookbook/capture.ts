/**
 * `pnpm cookbook capture [slug…]`: runs every recipe edition in headless
 * Chrome against the released engine, verifies it (checks.ts) and writes
 * the generated media (spec §8.2–8.5):
 *
 *   apps/web/public/cookbook/<slug>/
 *     capture.json                      the manifest (types.ts CaptureManifest)
 *     <variant>/pNN.webp, pNN.s.webp    pages at 1000 and 240 px wide
 *     <variant>/card.webp, card.480.webp, og.jpg
 *     <variant>/<slug>.pdf              when downloads.pdf
 *
 * A recipe writes only when every edition passes, and atomically (a temp
 * folder renamed over the old one). Images are kept, bytes and all, when
 * the source hash, the VDT hash, the engine and the page files are
 * unchanged, unless --force; the rest of the manifest (detection,
 * diagnostics, alt text, spreads) always comes from the new run,
 * and capture.json alone is rewritten when only that changed. --check
 * verifies and writes nothing.
 *
 * Run by Node's type stripping: erasable TypeScript, relative `.ts` imports.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { styleText } from "node:util";
import { hash8, sourceHash } from "../../src/lib/cookbook/hash.ts";
import { captureDir, WEB_DIR } from "../../src/lib/cookbook/paths.ts";
import { loadRegistry } from "../../src/lib/cookbook/registry.ts";
import { listRecipeSlugs, readRecipeMeta, readRecipeSources } from "../../src/lib/cookbook/sources.ts";
import type { CaptureManifest, CaptureVariant, Locale, RecipeMeta, Registry } from "../../src/lib/cookbook/types.ts";
import { LOCALES } from "../../src/lib/cookbook/types.ts";
import { altText, spreadsOf } from "./cards.ts";
import { detect, pdfPageCount, runChecks } from "./checks.ts";
import type { Finding } from "./checks.ts";
import type { HarnessBrowser, VariantRun } from "./harness.ts";
import { launchBrowser, runVariant } from "./harness.ts";
import { writeSheet } from "./sheet.ts";
import type { SheetEntry } from "./sheet.ts";
import { resolveEngine } from "./shim.ts";
import type { EngineSpec } from "./shim.ts";

export interface CaptureOptions {
  slugs: string[];
  all?: boolean;
  langs?: Locale[];
  check?: boolean;
  force?: boolean;
  sheet?: string;
  report?: string;
  headed?: boolean;
  concurrency?: number;
  refreshNet?: boolean;
  /** "npm" (default: the released version) or "npm@x.y.z". */
  engine?: string;
  /** Also write PNG copies of every page, card and OG image here, for reviewers. */
  previewDir?: string;
}

export interface CaptureResult {
  slug: string;
  variant: Locale;
  ok: boolean;
  fails: { check: string; detail: string }[];
  warns: { check: string; severity: "warn" | "info"; detail: string }[];
  pages: number;
  totalMs: number;
  written: boolean;
  outDir: string;
  /** Pinned engine version the edition ran on. */
  engine?: string;
  /** Time of the build that is the result. */
  buildMs?: number;
  /** Bytes of the edition's images (PDF excluded). */
  bytes?: number;
  /** "unchanged", "check only", "not written: …". */
  note?: string;
}

interface Prepared {
  slug: string;
  meta: RecipeMeta;
  sourceHash: string;
  previous: CaptureManifest | null;
  variants: Locale[];
  assets: string[];
}

/** One edition's outputs, in memory until the recipe is written. */
interface Output {
  /** Null when the edition failed (its previews and sheet row still exist). */
  variant: CaptureVariant | null;
  files: Map<string, Buffer>;
  previews: Map<string, Buffer>;
  sheet: SheetEntry;
}

const dim = (text: string) => styleText("dim", text, { stream: process.stderr });

/** A path the user typed, relative to where they ran pnpm. */
function userPath(file: string): string {
  return path.resolve(process.env.INIT_CWD ?? process.cwd(), file);
}

export function readManifest(slug: string): CaptureManifest | null {
  const file = path.join(captureDir(slug), "capture.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as CaptureManifest;
  } catch {
    return null;
  }
}

function prepare(slug: string, langs: readonly Locale[]): Prepared {
  const meta = readRecipeMeta(slug);
  const locales = (meta.sample?.locales ?? []).filter((l) => LOCALES.includes(l));
  return {
    slug,
    meta,
    sourceHash: sourceHash(slug, meta),
    previous: readManifest(slug),
    variants: locales.filter((l) => langs.includes(l)),
    assets: readRecipeSources(slug).assets,
  };
}

/** The recipes to capture: the named ones, --all, or the stale ones. */
function selectRecipes(opts: CaptureOptions, langs: readonly Locale[]): { prepared: Prepared[]; broken: CaptureResult[] } {
  const known = listRecipeSlugs();
  for (const slug of opts.slugs) {
    if (!known.includes(slug)) throw new Error(`no recipe "${slug}" in cookbook/`);
  }
  const named = opts.slugs.length > 0;
  const prepared: Prepared[] = [];
  const broken: CaptureResult[] = [];
  for (const slug of named ? opts.slugs : known) {
    let task: Prepared;
    try {
      task = prepare(slug, langs);
    } catch (error) {
      broken.push(failed(slug, "en", "recipe", (error as Error).message));
      continue;
    }
    if (!named && task.meta.status === "retired") continue;
    if (!named && !opts.all) {
      const prev = task.previous;
      const stale = !prev || prev.sourceHash !== task.sourceHash || task.variants.some((v) => !prev.variants?.[v]);
      if (!stale) continue;
    }
    if (task.variants.length) prepared.push(task);
  }
  return { prepared, broken };
}

function failed(slug: string, variant: Locale, check: string, detail: string): CaptureResult {
  return {
    slug, variant, ok: false, fails: [{ check, detail }], warns: [], pages: 0, totalMs: 0, written: false,
    outDir: path.join(captureDir(slug), variant),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const sha1 = (text: string) => crypto.createHash("sha1").update(text).digest("hex");

/** Turns a run into its checks and, when it passed, its outputs. */
function evaluate(
  task: Prepared,
  run: VariantRun,
  hb: HarnessBrowser,
  engine: EngineSpec,
  registry: Registry | null,
): { result: CaptureResult; output: Output | null } {
  const { meta, slug } = task;
  const facts = run.facts;
  const variant = run.variant;
  const files = new Map<string, Buffer>();
  const previews = new Map<string, Buffer>();
  const byN = new Map((facts?.pages ?? []).map((p) => [p.n, p]));
  for (const p of run.pages) {
    files.set(`p${pad(p.n)}.webp`, p.full);
    files.set(`p${pad(p.n)}.s.webp`, p.strip);
    if (p.png) previews.set(`p${pad(p.n)}.png`, p.png);
  }
  if (run.card) {
    files.set("card.webp", run.card.card);
    files.set("card.480.webp", run.card.card480);
    files.set("og.jpg", run.card.og);
    if (run.card.png) previews.set("card.png", run.card.png);
    if (run.card.ogPng) previews.set("og.png", run.card.ogPng);
  }
  const bytes = [...files.values()].reduce((sum, b) => sum + b.length, 0);
  const pdfBytes = run.pdf?.bytes ?? null;
  const pdfPages = pdfBytes ? pdfPageCount(pdfBytes) : null;
  if (pdfBytes) files.set(`${slug}.pdf`, pdfBytes);
  const vdtHash = facts?.vdt ? sha1(facts.vdt) : "";
  const detected = facts && facts.selected >= 0 ? detect(meta, facts, run.pen, registry) : null;
  const previous = task.previous;
  const findings: Finding[] = runChecks({
    meta,
    facts,
    done: run.done,
    err: run.err,
    loaderErrors: run.loaderErrors,
    console: run.console,
    pageErrors: run.pageErrors,
    net: run.net,
    failedRequests: run.failedRequests,
    settleTimedOut: !!run.settle?.timedOut,
    kit: run.kit,
    tainted: run.tainted,
    passive: run.passive,
    workerEngines: run.workerEngines,
    engine: engine.postext,
    timeoutMs: meta.capture.timeoutMs ?? 60_000,
    totalMs: run.timings.runMs,
    pdf: run.pdf ? { ...run.pdf, bytes: pdfBytes?.length ?? 0, pages: pdfPages } : null,
    published: run.published,
    publishError: run.publishError,
    cardErrors: run.cardErrors,
    renderError: run.renderError,
    magnification: run.card?.magnification ?? null,
    bytes,
    cardBytes: run.card ? { card: run.card.card.length, card480: run.card.card480.length, og: run.card.og.length } : null,
    assets: task.assets,
    detected: detected ?? {
      apis: [], configKeys: [], configSections: [], configLeaves: 0, designElements: 0, directives: [], inline: [],
      resources: { svg: 0, bitmap: 0, table: 0 }, fonts: [], features: [], suggestedLevel: meta.level, paths: [],
    },
    registry,
    previous: previous
      ? { chrome: previous.chrome, vdtHash: previous.variants?.[variant]?.vdtHash, sourceHash: previous.sourceHash }
      : null,
    chrome: hb.chrome,
    vdtHash,
    sourceHash: task.sourceHash,
  });
  const fails = findings.filter((f) => f.severity === "fail").map(({ check, detail }) => ({ check, detail }));
  const warns = findings
    .filter((f): f is Finding & { severity: "warn" | "info" } => f.severity !== "fail")
    .map(({ check, severity, detail }) => ({ check, severity, detail }));
  const selected = facts && facts.selected >= 0 ? facts.builds[facts.selected] : null;
  const result: CaptureResult = {
    slug,
    variant,
    ok: fails.length === 0,
    fails,
    warns,
    pages: facts?.pages?.length ?? 0,
    totalMs: run.timings.totalMs,
    written: false,
    outDir: path.join(captureDir(slug), variant),
    engine: engine.postext,
    buildMs: selected?.ms,
    bytes,
  };
  const spreads = spreadsOf(run.published, facts?.pages?.[0]?.book ?? 1);
  const strips = run.pages.map((p) => p.strip);
  const pick = spreads.find(([a, b]) => a !== null && b !== null) ?? spreads[0] ?? [null, null];
  const sheet: SheetEntry = {
    slug, variant, ok: result.ok, card: run.card?.card480 ?? null,
    spread: [pick[0] === null ? null : strips[pick[0]], pick[1] === null ? null : strips[pick[1]]],
  };
  if (!facts || !detected || !selected || !run.card || !result.ok) {
    return { result, output: { variant: null, files, previews, sheet } };
  }
  const first = facts.builds[0];
  const specimen = facts.specimen!;
  const capture: CaptureVariant = {
    hash8: hash8(Buffer.concat([...files.values()])),
    vdtHash,
    timings: {
      importMs: Math.round(facts.importedAt),
      fontsMs: Math.round(Math.max(0, (first?.at ?? facts.importedAt) - facts.importedAt)),
      buildMs: Math.round(selected.ms),
      totalMs: run.timings.runMs,
      builds: facts.builds.length,
    },
    specimen: { ...specimen, ownLines: run.pen.ownLines },
    pages: run.pages.map((p) => {
      const info = byN.get(p.n);
      return {
        n: p.n,
        label: info?.label ?? String(p.n),
        role: info?.role ?? "body",
        w: p.w,
        h: p.h,
        file: `p${pad(p.n)}.webp`,
        strip: `p${pad(p.n)}.s.webp`,
        bytes: p.full.length,
        alt: info ? altText(info, variant) : "",
      };
    }),
    spreads,
    card: { file: "card.webp", file480: "card.480.webp", w: 960, h: 720, mode: meta.capture.card },
    og: { file: "og.jpg", w: 580, h: 622 },
    ...(pdfBytes ? { pdf: { file: `${slug}.pdf`, bytes: pdfBytes.length, pages: pdfPages ?? 0 } } : {}),
    detected: {
      apis: detected.apis,
      configKeys: detected.configKeys,
      configSections: detected.configSections,
      configLeaves: detected.configLeaves,
      designElements: detected.designElements,
      directives: detected.directives,
      inline: detected.inline,
      resources: detected.resources,
      fonts: detected.fonts,
      features: detected.features,
      suggestedLevel: detected.suggestedLevel,
    },
    diagnostics: {
      converged: facts.converged !== false,
      iterationCount: facts.iterationCount ?? 0,
      looseLines: {
        count: facts.loose?.count ?? 0,
        share: Math.round((facts.loose?.share ?? 0) * 10000) / 10000,
        worst: facts.loose?.worst ?? 0,
      },
      findings: warns,
    },
  };
  return { result, output: { variant: capture, files, previews, sheet } };
}

function variantFilesExist(dir: string, v: CaptureVariant): boolean {
  const names = [...v.pages.flatMap((p) => [p.file, p.strip]), v.card.file, v.card.file480, v.og.file, ...(v.pdf ? [v.pdf.file] : [])];
  return names.every((name) => fs.existsSync(path.join(dir, name)));
}

/** True when a new run names the same files as the kept edition. */
function sameFiles(old: CaptureVariant, next: CaptureVariant): boolean {
  return old.pages.length === next.pages.length
    && old.pages.every((p, i) => p.n === next.pages[i].n && p.file === next.pages[i].file && p.strip === next.pages[i].strip)
    && !!old.pdf === !!next.pdf;
}

/** A kept edition: its files (and what describes them: hash, sizes, bytes)
 *  stay, and so do its timings (they vary run to run and would rewrite
 *  capture.json every time); everything else comes from the new run, so
 *  detection, diagnostics, alt text and spreads follow tooling changes that
 *  leave the VDT alone. */
function keptVariant(old: CaptureVariant, next: CaptureVariant): CaptureVariant {
  return {
    ...next,
    hash8: old.hash8,
    timings: old.timings,
    pages: next.pages.map((p, i) => ({ ...p, w: old.pages[i].w, h: old.pages[i].h, bytes: old.pages[i].bytes })),
    card: old.card.mode === next.card.mode ? old.card : next.card,
    og: old.og,
    ...(old.pdf ? { pdf: old.pdf } : {}),
  };
}

/** The manifest minus what a rewrite always changes. */
const manifestKey = (m: CaptureManifest | null) => (m ? JSON.stringify({ ...m, capturedAt: "" }) : "");

/** Writes a recipe's captures atomically; returns the editions whose files
 *  were (re)written, the editions dropped as stale and whether only
 *  capture.json changed, or null when nothing changed. */
function writeRecipe(
  task: Prepared,
  outputs: Map<Locale, Output>,
  engine: EngineSpec,
  chrome: string,
  force: boolean,
): { fresh: Set<Locale>; dropped: Locale[]; manifestOnly: boolean } | null {
  const finalDir = captureDir(task.slug);
  const prev = task.previous;
  const sameBase = !!prev && prev.sourceHash === task.sourceHash && prev.engine?.postext === engine.postext;
  const variants: Partial<Record<Locale, CaptureVariant>> = {};
  const fresh = new Set<Locale>();
  const kept = new Set<Locale>();
  for (const [locale, output] of outputs) {
    const old = prev?.variants?.[locale];
    if (!output.variant) continue;
    if (!force && sameBase && old && old.vdtHash === output.variant.vdtHash && sameFiles(old, output.variant)
      && variantFilesExist(path.join(finalDir, locale), old)) {
      variants[locale] = keptVariant(old, output.variant);
      kept.add(locale);
    } else {
      variants[locale] = output.variant;
      fresh.add(locale);
    }
  }
  // Editions not captured this run survive only when their inputs did not change.
  const sampled = new Set(task.meta.sample.locales);
  const dropped: Locale[] = [];
  for (const locale of LOCALES) {
    const old = prev?.variants?.[locale];
    if (!old || outputs.has(locale)) continue;
    if (sameBase && sampled.has(locale) && variantFilesExist(path.join(finalDir, locale), old)) {
      variants[locale] = old;
      kept.add(locale);
    } else dropped.push(locale);
  }

  const usesPdf = task.meta.outputs.includes("pdf") || !!task.meta.downloads?.pdf || !!task.meta.engine.postextPdf;
  const manifest: CaptureManifest = {
    schemaVersion: 1,
    slug: task.slug,
    sourceHash: task.sourceHash,
    engine: { postext: engine.postext as CaptureManifest["engine"]["postext"], ...(usesPdf ? { postextPdf: engine.postextPdf as CaptureManifest["engine"]["postext"] } : {}), source: "npm" },
    chrome,
    capturedAt: new Date().toISOString(),
    variants: Object.fromEntries(LOCALES.filter((l) => variants[l]).map((l) => [l, variants[l]])),
  };

  // No image changed: rewrite capture.json alone (keeping capturedAt, the
  // time of the images) when the tooling changed what describes them.
  if (!fresh.size && !dropped.length) {
    if (!prev || manifestKey(manifest) === manifestKey(prev)) return null;
    const file = path.join(finalDir, "capture.json");
    const tmpFile = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmpFile, `${JSON.stringify({ ...manifest, capturedAt: prev.capturedAt }, null, 2)}\n`);
    fs.renameSync(tmpFile, file);
    return { fresh, dropped, manifestOnly: true };
  }

  const tmpRoot = path.join(WEB_DIR, ".cache", "cookbook-tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(tmpRoot, `${task.slug}-`));
  const old = `${finalDir}.old-${process.pid}`;
  try {
    for (const locale of kept) fs.cpSync(path.join(finalDir, locale), path.join(tmp, locale), { recursive: true, preserveTimestamps: true });
    for (const locale of fresh) {
      const dir = path.join(tmp, locale);
      fs.mkdirSync(dir, { recursive: true });
      for (const [name, bytes] of outputs.get(locale)!.files) fs.writeFileSync(path.join(dir, name), bytes);
    }
    fs.writeFileSync(path.join(tmp, "capture.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    fs.mkdirSync(path.dirname(finalDir), { recursive: true });
    if (fs.existsSync(finalDir)) fs.renameSync(finalDir, old);
    fs.renameSync(tmp, finalDir);
    fs.rmSync(old, { recursive: true, force: true });
  } catch (error) {
    // Put the published capture back if the swap failed half-way.
    if (!fs.existsSync(finalDir) && fs.existsSync(old)) fs.renameSync(old, finalDir);
    fs.rmSync(tmp, { recursive: true, force: true });
    throw error;
  }
  return { fresh, dropped, manifestOnly: false };
}

/** Runs `jobs` with at most `limit` in flight. */
async function pool<T>(jobs: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await jobs[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, jobs.length)) }, worker));
  return results;
}

export async function runCapture(opts: CaptureOptions): Promise<CaptureResult[]> {
  const engine = resolveEngine(opts.engine ?? "npm");
  const langs = opts.langs?.length ? opts.langs : LOCALES;
  const { prepared, broken } = selectRecipes(opts, langs);
  const results: CaptureResult[] = [...broken];
  if (!prepared.length) {
    if (opts.report) writeReport(opts.report, results, engine, null);
    return results;
  }
  let registry: Registry | null = null;
  try {
    registry = loadRegistry();
  } catch {
    registry = null;   // C27 needs the feature registry; without it the check is skipped
  }

  const hb = await launchBrowser({ headed: opts.headed });
  const sheetEntries: SheetEntry[] = [];
  try {
    const jobs = prepared.flatMap((task) =>
      task.variants.map((variant) => async () => {
        process.stderr.write(dim(`  capturing ${task.slug} ${variant} · postext ${engine.postext}\n`));
        try {
          const run = await runVariant({
            hb, slug: task.slug, variant, meta: task.meta, engine: opts.engine, refreshNet: opts.refreshNet, png: !!opts.previewDir,
          });
          return { task, variant, ...evaluate(task, run, hb, engine, registry) };
        } catch (error) {
          return { task, variant, result: failed(task.slug, variant, "harness", String((error as Error).stack ?? error).split("\n").slice(0, 3).join(" ⏎ ")), output: null };
        }
      }),
    );
    const done = await pool(jobs, opts.concurrency ?? 3);

    for (const task of prepared) {
      const mine = done.filter((d) => d.task === task);
      const outputs = new Map<Locale, Output>();
      for (const d of mine) {
        if (d.output) sheetEntries.push(d.output.sheet);
        // Previews are written even for a failed edition: they show what failed.
        if (opts.previewDir && d.output) {
          const dir = path.join(userPath(opts.previewDir), task.slug, d.variant);
          fs.mkdirSync(dir, { recursive: true });
          // An earlier, longer run's pages would linger among the new ones.
          for (const name of fs.readdirSync(dir)) if (/^(p\d+|card|og)\.png$/.test(name)) fs.rmSync(path.join(dir, name));
          for (const [name, bytes] of d.output.previews) fs.writeFileSync(path.join(dir, name), bytes);
        }
        if (d.result.ok && d.output?.variant) outputs.set(d.variant, d.output);
      }
      const allOk = mine.every((d) => d.result.ok);
      if (!allOk) {
        for (const d of mine) d.result.note = d.result.ok ? "not written: another edition failed" : "not written";
      } else if (opts.check) {
        for (const d of mine) d.result.note = "check only";
      } else {
        const written = writeRecipe(task, outputs, engine, hb.chrome, !!opts.force);
        for (const d of mine) {
          d.result.written = !!written?.fresh.has(d.variant);
          if (!d.result.written) d.result.note = written?.manifestOnly ? "images unchanged, capture.json updated" : "unchanged";
        }
        if (written?.dropped.length) {
          process.stderr.write(styleText("yellow", `  ${task.slug}: removed the earlier ${written.dropped.join(", ")} capture, whose inputs changed; capture it again with --lang ${written.dropped.join(",")}\n`, { stream: process.stderr }));
        }
      }
      results.push(...mine.map((d) => d.result));
    }

    if (opts.sheet && sheetEntries.length) {
      const sheet = await writeSheet(hb.browser, sheetEntries, userPath(opts.sheet));
      process.stderr.write(dim(`  contact sheet: ${sheet.file} (${Math.round(sheet.bytes / 1024)} KB)\n`));
    }
  } finally {
    await hb.browser.close().catch(() => {});
  }
  if (opts.report) writeReport(opts.report, results, engine, hb.chrome);
  return results;
}

function writeReport(file: string, results: CaptureResult[], engine: EngineSpec, chrome: string | null): void {
  const out = userPath(file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const report = { engine: { postext: engine.postext, postextPdf: engine.postextPdf, source: engine.source }, chrome, results };
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
}
