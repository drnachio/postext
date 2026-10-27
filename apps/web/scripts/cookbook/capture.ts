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
 *     <variant>/<slug>.postext          the document, for the Sandbox
 *
 * A recipe writes only when every edition passes, and atomically (a temp
 * folder renamed over the old one). With the same sources, each kind of
 * file is judged on its own, whatever engine the run used (#734, unless
 * --force): the pages, card and OG image stay when the layout hash and the
 * file names are the same and every page is within rendering noise of its
 * committed image; the PDF stays when its bytes are the same (the capture
 * dates it the day the recipe was written); the bundle stays when its
 * bytes are the same or, written by another engine, it reads back as the
 * pen's documents on this one. `engine`, `chrome` and `capturedAt` name the
 * run that wrote files: a recipe with nothing to write keeps its folder
 * byte for byte, and a run on a newer release records that in `verified`
 * (#735; --verify writes only those records). On the recorded engine the
 * rest of the manifest (detection, diagnostics, alt text, spreads) still
 * follows the tooling, and capture.json alone is rewritten when only that
 * changed. --check verifies and writes nothing. --sandbox-only writes the `.postext` files
 * alone, with the engine each capture.json records (runSandboxOnly). A
 * bundle is read back against the pen's documents before it is kept (C33).
 *
 * Run by Node's type stripping: erasable TypeScript, relative `.ts` imports.
 */
import fs from 'node:fs';
import path from 'node:path';
import { styleText } from 'node:util';
import { stretchedEdition, stretchMarkdown } from '../../src/lib/cookbook/bench.ts';
import { captureDir } from '../../src/lib/cookbook/paths.ts';
import { loadRegistry } from '../../src/lib/cookbook/registry.ts';
import { readRecipeSources } from '../../src/lib/cookbook/sources.ts';
import { SAMPLE_LOCALES, type Registry, type SampleLocale } from '../../src/lib/cookbook/types.ts';
import { compareFindings, type Finding, stressFindings } from './checks.ts';
import { launchBrowser, runVariant, type VariantRun, type HarnessBrowser } from './harness.ts';
import { type SheetEntry, writeSheet } from './sheet.ts';
import { resolveEngine } from './shim.ts';
import { protocolTimeoutFor, harnessDetail } from './steps.ts';
import { type CaptureOptions, type CaptureResult, announceForcedConfig, selectRecipes, dim, failed, pool, type Output, userPath, type Prepared, pad } from './capture/common.ts';
import { sandboxMeta, evaluate, sha1, sandboxFile, bundleBooks, withBook } from './capture/evaluate.ts';
import { writeReport } from './capture/sandboxOnly.ts';
import { sayFallbacks, writeRecipe, writtenNote } from './capture/write.ts';

export { readManifest } from './capture/common.ts';
export type { CaptureOptions, CaptureResult, Output } from './capture/common.ts';
export { sandboxFile, sandboxEntry } from './capture/evaluate.ts';
export { planEdition, withVerified, writeRecipe } from './capture/write.ts';
export type { FileKind, EditionPlan, WriteOutcome } from './capture/write.ts';
export { runSandboxOnly } from './capture/sandboxOnly.ts';

export async function runCapture(opts: CaptureOptions): Promise<CaptureResult[]> {
  announceForcedConfig(!opts.check);
  const engine = resolveEngine(opts.engine ?? "npm");
  const langs = opts.langs?.length ? opts.langs : SAMPLE_LOCALES;
  const { prepared, broken } = selectRecipes(opts, langs, engine);
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

  const hb = await launchBrowser({ headed: opts.headed, protocolTimeout: protocolTimeoutFor(prepared.map((task) => task.meta.capture.timeoutMs)) });
  const sheetEntries: SheetEntry[] = [];
  try {
    const jobs = prepared.flatMap((task) =>
      task.variants.map((variant) => async () => {
        process.stderr.write(dim(`  capturing ${task.slug} ${variant} · postext ${engine.postext}\n`));
        try {
          // The committed edition to compare with, when it is of these sources.
          const committed = !opts.force && task.previous?.sourceHash === task.sourceHash && task.previous.variants?.[variant]
            ? path.join(captureDir(task.slug), variant) : undefined;
          const run = await runVariant({
            hb, slug: task.slug, variant, meta: task.meta, engine: opts.engine, refreshNet: opts.refreshNet, png: !!opts.previewDir,
            sandbox: sandboxMeta(task.slug, variant, task.meta),
            ...(committed ? { committedDir: committed } : {}),
            ...(opts.maxDiff !== undefined ? { maxDiff: opts.maxDiff } : {}),
          });
          sayFallbacks(run);
          const evaluated = evaluate(task, run, hb, engine, registry);
          const bench = [
            ...(opts.compare
              ? compareFindings({
                  approved: committed ? { vdtHash: task.previous?.variants?.[variant]?.vdtHash, engine: task.previous?.engine?.postext } : null,
                  run: { vdtHash: run.facts?.vdt ? sha1(run.facts.vdt) : "", engine: engine.postext },
                  changes: run.pageChanges, pages: run.pages.length, maxDiff: opts.maxDiff ?? PAGE_MAX_DIFF,
                  pixels: opts.pixels !== false, strict: !!opts.strict, hashWarn: !!opts.hashWarn,
                })
              : []),
            ...(opts.stress ? await stressRun(task, variant, run, hb, opts) : []),
          ];
          addFindings(evaluated.result, bench);
          return { task, variant, ...evaluated };
        } catch (error) {
          return { task, variant, result: failed(task.slug, variant, "harness", harnessDetail(error)), output: null };
        }
      }),
    );
    const done = await pool(jobs, opts.concurrency ?? 3);

    for (const task of prepared) {
      const mine = done.filter((d) => d.task === task);
      const outputs = new Map<SampleLocale, Output>();
      for (const d of mine) {
        if (d.output) sheetEntries.push(d.output.sheet);
        // Previews are written even for a failed edition: they show what failed.
        if (opts.previewDir && d.output) {
          const dir = path.join(userPath(opts.previewDir), task.slug, d.variant);
          fs.mkdirSync(dir, { recursive: true });
          // An earlier, longer run's pages would linger among the new ones.
          for (const name of fs.readdirSync(dir)) if (/^(p\d+|card|og)\.png$|\.pdf$/.test(name)) fs.rmSync(path.join(dir, name));
          for (const [name, bytes] of d.output.previews) fs.writeFileSync(path.join(dir, name), bytes);
          // What capture.json would record for the edition (a local-engine
          // preview writes no capture): diagnostics, detection, binding.
          if (d.output.variant) fs.writeFileSync(path.join(dir, "capture.json"), `${JSON.stringify(d.output.variant, null, 2)}\n`);
          else fs.rmSync(path.join(dir, "capture.json"), { force: true });
        }
        if (d.result.ok && d.output?.variant) outputs.set(d.variant, d.output);
      }
      const allOk = mine.every((d) => d.result.ok);
      if (allOk) {
        // Each edition's bundle becomes the book in every language (#1209).
        const fresh = new Map<SampleLocale, Buffer>();
        for (const [locale, output] of outputs) {
          const bundle = output.files.get(sandboxFile(task.slug));
          if (bundle) fresh.set(locale, bundle);
        }
        const sameSources = !opts.force && task.previous?.sourceHash === task.sourceHash;
        const { books, notes } = await bundleBooks(task.slug, task.meta, fresh, sameSources);
        for (const d of mine) {
          const output = outputs.get(d.variant);
          const book = books.get(d.variant);
          if (output && book) withBook(task.slug, output, book, notes.get(d.variant) ?? [], d.result);
        }
      }
      if (!allOk) {
        for (const d of mine) d.result.note = d.result.ok ? "not written: another edition failed" : "not written";
      } else if (opts.check || engine.source === "local") {
        // A published capture comes from npm: the local engine only previews.
        for (const d of mine) d.result.note = engine.source === "local" ? "local engine: check only" : "check only";
      } else {
        const outcome = writeRecipe(task, outputs, engine, hb.chrome, { force: !!opts.force, verifyOnly: !!opts.verify });
        for (const d of mine) {
          const kinds = outcome.written.get(d.variant);
          d.result.written = !!kinds;
          const needs = outcome.needs.find((n) => n.locale === d.variant);
          if (needs) {
            // --verify: the files would change, and it writes none.
            d.result.ok = false;
            d.result.fails.push({ check: "verify", detail: `needs a recapture: ${needs.reasons.join(", ")}` });
            d.result.note = "not written";
          } else if (outcome.needs.length) d.result.note = "not verified: another edition needs a recapture";
          else if (kinds) d.result.note = writtenNote(kinds, d.output?.variant ?? null) || undefined;
          else if (outcome.verified) d.result.note = `unchanged, verified on ${outcome.verified}`;
          else d.result.note = outcome.manifestOnly ? "images unchanged, capture.json updated" : "unchanged";
        }
        if (outcome.dropped.length) {
          process.stderr.write(styleText("yellow", `  ${task.slug}: removed the earlier ${outcome.dropped.join(", ")} capture, whose inputs changed; capture it again with --lang ${outcome.dropped.join(",")}\n`, { stream: process.stderr }));
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

// ─── The composed-page bench (#869) ─────────────────────────────────────────

/** lib/probe.js `PAGE_DIFFERENCE.max`: C39's threshold by default. */
export const PAGE_MAX_DIFF = 12;

/** Findings of the bench added to an edition's result: a failure makes it fail. */
function addFindings(result: CaptureResult, findings: Finding[]): void {
  for (const f of findings) {
    if (f.severity === "fail") result.fails.push({ check: f.check, detail: f.detail });
    else result.warns.push({ check: f.check, severity: f.severity, detail: f.detail });
  }
  result.ok = result.fails.length === 0;
}

/** C38: the edition once more, its text `opts.stress` times as long, facts only. */
async function stressRun(task: Prepared, variant: SampleLocale, base: VariantRun, hb: HarnessBrowser, opts: CaptureOptions): Promise<Finding[]> {
  const factor = opts.stress!;
  const content = readRecipeSources(task.slug).content;
  const stretch = stretchedEdition(content, variant, task.meta.sample.locales[0] ?? variant, factor);
  process.stderr.write(dim(`  stretching ${task.slug} ${variant} · text × ${factor}\n`));
  const stretched = new Map<string, string>();
  try {
    const run = await runVariant({
      hb, slug: task.slug, variant, meta: task.meta, engine: opts.engine, refreshNet: opts.refreshNet,
      ...(opts.stressOut ? { pagesOnly: true } : { factsOnly: true }),
      transformContent: (text, key) => {
        const out = stretchMarkdown(text, factor).markdown;
        stretched.set(key, out);
        return out;
      },
    });
    sayFallbacks(run);
    const findings = stressFindings({
      meta: task.meta, factor, stretch, done: run.done, err: run.err, pageErrors: run.pageErrors, facts: run.facts, base: base.facts,
    });
    if (opts.stressOut) writeStressOut(path.join(userPath(opts.stressOut), task.slug, variant), run, stretched, factor, findings);
    return findings;
  } catch (error) {
    return [{ check: "C38", severity: "fail", detail: `the stretched edition: ${harnessDetail(error)}` }];
  }
}

/** `--stress-out` (#915): the stretched edition's pages (`p01.png`…), the
 *  Markdown it was laid out from (`<key>.stretched.md`) and its C38
 *  findings (`stress.json`), an earlier run's pages removed first. */
function writeStressOut(dir: string, run: VariantRun, stretched: ReadonlyMap<string, string>, factor: number, findings: Finding[]): void {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(dir)) if (/^p\d+\.png$|\.stretched\.md$/.test(name)) fs.rmSync(path.join(dir, name));
  for (const p of run.pages) if (p.png) fs.writeFileSync(path.join(dir, `p${pad(p.n)}.png`), p.png);
  // The edition's own files (`en`, `notes.en`), else every file it was given.
  const own = [...stretched.keys()].filter((key) => key.split(".").pop() === path.basename(dir));
  for (const [key, text] of stretched) {
    if (own.length && !own.includes(key)) continue;
    fs.writeFileSync(path.join(dir, `${key.replace(/[^\w.-]+/g, "_")}.stretched.md`), text);
  }
  const record = { factor, pages: run.pages.length, renderError: run.renderError ?? null, findings };
  fs.writeFileSync(path.join(dir, "stress.json"), `${JSON.stringify(record, null, 2)}\n`);
  process.stderr.write(dim(`  stretched pages: ${dir} (${run.pages.length})\n`));
}
