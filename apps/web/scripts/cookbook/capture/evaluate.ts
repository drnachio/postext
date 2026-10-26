// A run turned into checks and outputs: the Sandbox bundle entry, the
// books an edition carries, and the file helpers the write uses (#1276:
// split out of capture.ts).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { folioConfigOf, folioHash } from '../../../src/lib/cookbook/folio.ts';
import { hash8 } from '../../../src/lib/cookbook/hash.ts';
import { recipeDir, captureDir } from '../../../src/lib/cookbook/paths.ts';
import type { SampleLocale, RecipeMeta, Registry, CaptureVariant, CaptureManifest } from '../../../src/lib/cookbook/types.ts';
import { spreadsOf, sidesOf, altText } from '../cards.ts';
import { type Finding, readBackFindings, pdfPageCount, detect, runChecks } from '../checks.ts';
import { editionBooks } from '../editions.ts';
import type { SandboxMeta, SandboxBundle, VariantRun, HarnessBrowser } from '../harness.ts';
import type { SheetEntry } from '../sheet.ts';
import type { EngineSpec } from '../shim.ts';
import { type Output, type CaptureResult, type Prepared, pad } from './common.ts';

/** The bundle's file name inside an edition's folder. */
export const sandboxFile = (slug: string) => `${slug}.postext`;

/** The bundle's id and name: `recipe-<slug>` and the write-up's title in the
 *  edition's language (its summary as the description). */
export function sandboxMeta(slug: string, variant: SampleLocale, meta: RecipeMeta): SandboxMeta {
  const file = path.join(recipeDir(slug), `${variant}.mdx`);
  const data = fs.existsSync(file) ? (matter(fs.readFileSync(file, "utf-8"), {}).data as Record<string, unknown>) : {};
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const folio = folioConfigOf(meta.folio);
  return {
    id: `recipe-${slug}`, name: text(data.title) || slug,
    ...(text(data.summary) ? { description: text(data.summary) } : {}),
    ...(folio ? { folio } : {}),
  };
}
/** capture.json's `sandbox` entry: the bundle, the folio it carries, and,
 *  when it holds only some of the published builds, which one the recipe
 *  kept (`capture.sandbox`) and how many pages it lays out to; then what
 *  `pnpm cookbook sandbox` compares the Sandbox's own layout with (#736):
 *  each chapter's pages, layout hash and lines hash as the bundle reads
 *  back, and the warnings of the pen's builds it holds. */
export function sandboxEntry(slug: string, bundle: Pick<SandboxBundle, "pages" | "allPages" | "readBack" | "penWarnings"> & { bytes: Buffer }, meta: Pick<RecipeMeta, "folio" | "capture">) {
  const folio = folioHash(meta.folio);
  const keep = meta.capture.sandbox;
  const back = bundle.readBack && !bundle.readBack.error && !bundle.readBack.skipped ? bundle.readBack : null;
  const chapters = (back?.chapters ?? []).map((c) => c.bundle).filter((c): c is { pages: number; hash: string; lines?: string } => !!c);
  return {
    file: sandboxFile(slug), bytes: bundle.bytes.length, ...(folio ? { folio } : {}),
    ...(keep !== undefined ? { keep } : {}),
    ...(bundle.pages && bundle.pages !== bundle.allPages ? { pages: bundle.pages } : {}),
    ...(chapters.length ? { chapters: chapters.map(({ pages, hash, lines }) => ({ pages, hash, ...(lines ? { lines } : {}) })) } : {}),
    ...(bundle.penWarnings.length ? { warnings: bundle.penWarnings } : {}),
  };
}

/** What a bundle's run reports: C33 and a missing bundle as failures, the
 *  builds left out unasked as a warning, what it cannot carry as notes. */
export function sandboxFindings(sandbox: SandboxBundle | null | undefined): Finding[] {
  if (!sandbox) return [];
  const say = (severity: Finding["severity"]) => (detail: string): Finding => ({ check: "sandbox", severity, detail });
  return [
    ...(sandbox.error || !sandbox.bytes ? [say("fail")(`no .postext bundle: ${sandbox.error ?? "not written"}`)] : []),
    ...readBackFindings(sandbox.readBack),
    ...sandbox.warns.map(say("warn")),
    ...[...sandbox.notes, ...sandbox.warnings].map(say("info")),
  ];
}

/**
 * The editions' bundles as one book in several languages each (#1209,
 * editions.ts): `fresh` are the bundles this run wrote, by edition; an
 * edition the run did not take joins with the book its folder holds, when
 * that capture is of the same sources. Returns each edition's book and
 * what the run notes about it.
 */
export async function bundleBooks(
  slug: string,
  meta: RecipeMeta,
  fresh: Map<SampleLocale, Buffer>,
  committedOk: boolean,
): Promise<{ books: Map<SampleLocale, Buffer>; notes: Map<SampleLocale, Finding[]> }> {
  const bundles = new Map(fresh);
  if (committedOk) {
    for (const locale of meta.sample.locales) {
      const file = path.join(captureDir(slug), locale, sandboxFile(slug));
      if (!bundles.has(locale) && fs.existsSync(file)) bundles.set(locale, fs.readFileSync(file));
    }
  }
  const { books, notes } = await editionBooks(bundles, meta.sample.locales);
  const findings = new Map<SampleLocale, Finding[]>();
  for (const [locale, list] of notes) findings.set(locale, list.map((detail) => ({ check: "sandbox", severity: "info" as const, detail })));
  return { books, notes: findings };
}

/** An edition's outputs with its bundle swapped for `book`: the file, the
 *  `sandbox` entry's size, `hash8` and the notes the book adds. */
export function withBook(slug: string, output: Output, book: Buffer, notes: Finding[], result: CaptureResult): void {
  const name = sandboxFile(slug);
  if (!output.files.has(name)) return;
  output.files.set(name, book);
  const kept = notes.map(({ check, severity, detail }) => ({ check, severity: severity as "warn" | "info", detail }));
  result.warns.push(...kept);
  const v = output.variant;
  if (!v) return;
  v.hash8 = hash8(Buffer.concat([...output.files.values()]));
  if (v.sandbox) v.sandbox = { ...v.sandbox, bytes: book.length };
  v.diagnostics = { ...v.diagnostics, findings: [...v.diagnostics.findings, ...kept] };
}

/** The findings that are not failures, as capture.json keeps them. */
export const kept = (findings: Finding[]) => findings
  .filter((f): f is Finding & { severity: "warn" | "info" } => f.severity !== "fail")
  .map(({ check, severity, detail }) => ({ check, severity, detail }));
export const sha1 = (text: string) => crypto.createHash("sha1").update(text).digest("hex");

/** Turns a run into its checks and, when it passed, its outputs. */
export function evaluate(
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
  // The preview gets the PDF too: a local-engine run writes nothing else to look at.
  if (pdfBytes) previews.set(`${slug}.pdf`, pdfBytes);
  const bundle = run.sandbox?.bytes ?? null;
  if (bundle) files.set(sandboxFile(slug), bundle);
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
    epubs: run.epubs,
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
  // The bundle: read back against the pen (C33), and what it leaves out.
  const bundled = sandboxFindings(run.sandbox);
  const fails = [...findings, ...bundled].filter((f) => f.severity === "fail").map(({ check, detail }) => ({ check, detail }));
  const warns = kept(findings);
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
  // Versos and rectos by book page number, which starts again with each
  // build of a capture that takes several (`capture.doc` as a list).
  const spreads = spreadsOf(run.published, new Map((facts?.pages ?? []).map((p) => [p.n, p.book])));
  const strips = run.pages.map((p) => p.strip);
  const pick = sidesOf(spreads.find(([a, b]) => a !== null && b !== null) ?? spreads[0] ?? [null, null], facts?.binding);
  const sheet: SheetEntry = {
    slug, variant, ok: result.ok, card: run.card?.card480 ?? null,
    spread: [pick[0] === null ? null : strips[pick[0]], pick[1] === null ? null : strips[pick[1]]],
  };
  // What the run found against the committed files (#734).
  const committedBack = run.sandbox?.committedReadBack ?? null;
  const compared = {
    pageChanges: run.pageChanges,
    committedBundleOk: !!committedBack && !committedBack.error && !committedBack.skipped
      && readBackFindings(committedBack).every((f) => f.severity !== "fail"),
  };
  if (!facts || !detected || !selected || !run.card || !result.ok) {
    return { result, output: { variant: null, files, previews, sheet, ...compared } };
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
    ...(facts.binding === "right" ? { binding: "right" as const } : {}),
    card: { file: "card.webp", file480: "card.480.webp", w: 960, h: 720, mode: meta.capture.card },
    og: { file: "og.jpg", w: 580, h: 622 },
    ...(pdfBytes ? { pdf: { file: `${slug}.pdf`, bytes: pdfBytes.length, pages: pdfPages ?? 0 } } : {}),
    ...(bundle ? { sandbox: sandboxEntry(slug, { ...run.sandbox!, bytes: bundle }, meta) } : {}),
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
      ...(facts.cjkLoose?.total
        ? {
            cjkLooseLines: {
              count: facts.cjkLoose.count,
              share: Math.round(facts.cjkLoose.share * 10000) / 10000,
              worst: facts.cjkLoose.worst,
            },
          }
        : {}),
      ...(facts.raggedLines ? { raggedLines: { count: facts.raggedLines.count } } : {}),
      ...(facts.runtFixes?.count ? { runtFixes: { count: facts.runtFixes.count, tracked: facts.runtFixes.tracked, worst: facts.runtFixes.worst } } : {}),
      findings: warns,
    },
  };
  // What the bundle leaves out or cannot carry, after the checks' findings.
  result.warns.push(...kept(bundled));
  return { result, output: { variant: capture, files, previews, sheet, ...compared } };
}

export function variantFilesExist(dir: string, v: CaptureVariant): boolean {
  const names = [
    ...v.pages.flatMap((p) => [p.file, p.strip]), v.card.file, v.card.file480, v.og.file,
    ...(v.pdf ? [v.pdf.file] : []), ...(v.sandbox ? [v.sandbox.file] : []),
  ];
  return names.every((name) => fs.existsSync(path.join(dir, name)));
}

/** True when a new run names the same files as the kept edition. */
export function sameFiles(old: CaptureVariant, next: CaptureVariant): boolean {
  return old.pages.length === next.pages.length
    && old.pages.every((p, i) => p.n === next.pages[i].n && p.file === next.pages[i].file && p.strip === next.pages[i].strip)
    && !!old.pdf === !!next.pdf;
}

/** Writes `bytes` to `file` through a temporary file, unless they are there already. */
export function writeIfChanged(file: string, bytes: Buffer): boolean {
  if (fs.existsSync(file) && fs.readFileSync(file).equals(bytes)) return false;
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, file);
  return true;
}

/** The manifest minus what a rewrite always changes. */
export const manifestKey = (m: CaptureManifest | null) => (m ? JSON.stringify({ ...m, capturedAt: "" }) : "");
