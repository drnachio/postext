// `--sandbox-only`: the `.postext` files alone, with the engine each
// capture.json records, and the run's report (#1276: split out of
// capture.ts).
import fs from 'node:fs';
import path from 'node:path';
import { sourceHash } from '../../../src/lib/cookbook/hash.ts';
import { captureDir } from '../../../src/lib/cookbook/paths.ts';
import { listRecipeSlugs, readRecipeMeta } from '../../../src/lib/cookbook/sources.ts';
import { SAMPLE_LOCALES, type RecipeMeta, type CaptureManifest, type SampleLocale, type CaptureVariant } from '../../../src/lib/cookbook/types.ts';
import { launchBrowser, type SandboxBundle, runVariant } from '../harness.ts';
import type { EngineSpec } from '../shim.ts';
import { protocolTimeoutFor, harnessDetail } from '../steps.ts';
import { type CaptureOptions, type CaptureResult, announceForcedConfig, failed, readManifest, dim, pool, userPath } from './common.ts';
import { sandboxMeta, sha1, sandboxFindings, kept, bundleBooks, sandboxFile, writeIfChanged, sandboxEntry } from './evaluate.ts';
import { sayFallbacks } from './write.ts';

// ─── --sandbox-only ─────────────────────────────────────────────────────────

/**
 * Writes the Sandbox bundles of recipes already captured, without touching
 * their pictures: each edition runs again on the engine its capture.json
 * records, and only `<variant>/<slug>.postext`, the edition's `sandbox`
 * entry in capture.json and the bundle's own findings there (`sandbox`,
 * C33) are written (capturedAt stays). A capture whose
 * sources changed since is refused: capture it again instead. The run's
 * VDT hash is compared with the recorded one, so a bundle of another
 * layout than the published pages shows up as a warning.
 */
export async function runSandboxOnly(opts: CaptureOptions): Promise<CaptureResult[]> {
  announceForcedConfig(true);
  const langs = opts.langs?.length ? opts.langs : SAMPLE_LOCALES;
  const slugs = opts.slugs.length ? opts.slugs : listRecipeSlugs();
  const results: CaptureResult[] = [];
  const tasks: { slug: string; meta: RecipeMeta; manifest: CaptureManifest; variants: SampleLocale[] }[] = [];
  for (const slug of slugs) {
    let meta: RecipeMeta;
    try {
      meta = readRecipeMeta(slug);
    } catch (error) {
      results.push(failed(slug, "en", "recipe", (error as Error).message));
      continue;
    }
    if (!opts.slugs.length && meta.status === "retired") continue;
    const manifest = readManifest(slug);
    if (!manifest) {
      results.push(failed(slug, meta.sample.locales[0] ?? "en", "sandbox", "no capture.json: capture the recipe first"));
      continue;
    }
    if (manifest.sourceHash !== sourceHash(slug, meta)) {
      results.push(failed(slug, meta.sample.locales[0] ?? "en", "sandbox", "the recipe changed since its capture: capture it again, which writes the bundle too"));
      continue;
    }
    const variants = SAMPLE_LOCALES.filter((l) => manifest.variants[l] && langs.includes(l));
    if (variants.length) tasks.push({ slug, meta, manifest, variants });
  }
  if (!tasks.length) return results;

  const hb = await launchBrowser({ headed: opts.headed, protocolTimeout: protocolTimeoutFor(tasks.map((task) => task.meta.capture.timeoutMs)) });
  try {
    const jobs = tasks.flatMap((task) => task.variants.map((variant) => async () => {
      const old = task.manifest.variants[variant]!;
      const engine = `npm@${task.manifest.engine.postext}`;
      const dir = path.join(captureDir(task.slug), variant);
      const card = path.join(dir, old.card.file480);
      const result: CaptureResult = {
        slug: task.slug, variant, ok: false, fails: [], warns: [], pages: old.pages.length, totalMs: 0, written: false,
        outDir: dir, engine: task.manifest.engine.postext,
      };
      process.stderr.write(dim(`  bundling ${task.slug} ${variant} · postext ${task.manifest.engine.postext}
`));
      let bytes: Buffer | null = null;
      let sandbox: SandboxBundle | null = null;
      let findings: CaptureVariant["diagnostics"]["findings"] = [];
      try {
        const run = await runVariant({
          hb, slug: task.slug, variant, meta: task.meta, engine, refreshNet: opts.refreshNet, sandboxOnly: true,
          sandbox: { ...sandboxMeta(task.slug, variant, task.meta), thumbnail: fs.existsSync(card) ? fs.readFileSync(card) : null },
        });
        result.totalMs = run.timings.totalMs;
        sayFallbacks(run);
        if (run.done !== "ok") result.fails.push({ check: "run", detail: run.done === "error" ? `the pen failed: ${run.err ?? ""}` : "the pen timed out" });
        if (run.pageErrors.length) result.fails.push({ check: "run", detail: `page errors: ${run.pageErrors.slice(0, 3).join(" · ")}` });
        if (!run.facts || run.facts.selected < 0) result.fails.push({ check: "run", detail: "no build recorded" });
        const vdtHash = run.facts?.vdt ? sha1(run.facts.vdt) : "";
        if (vdtHash && vdtHash !== old.vdtHash) {
          result.warns.push({ check: "vdt", severity: "warn", detail: "the layout differs from the published pages (fonts or network?)" });
        }
        const bundled = sandboxFindings(run.sandbox ?? { bytes: null, error: "not written", warnings: [], notes: [], warns: [], penWarnings: [], pages: 0, allPages: 0, readBack: null, committedReadBack: null });
        result.fails.push(...bundled.filter((f) => f.severity === "fail").map(({ check, detail }) => ({ check, detail })));
        findings = kept(bundled);
        result.warns.push(...findings);
        sandbox = run.sandbox;
        bytes = run.sandbox?.bytes ?? null;
        result.bytes = bytes?.length;
      } catch (error) {
        result.fails.push({ check: "harness", detail: harnessDetail(error) });
      }
      result.ok = result.fails.length === 0;
      return { task, variant, result, bytes, sandbox, findings };
    }));
    const done = await pool(jobs, opts.concurrency ?? 3);

    for (const task of tasks) {
      const mine = done.filter((d) => d.task === task);
      results.push(...mine.map((d) => d.result));
      if (!mine.every((d) => d.result.ok)) {
        for (const d of mine) d.result.note = d.result.ok ? "not written: another edition failed" : "not written";
        continue;
      }
      // Each edition's bundle becomes the book in every language (#1209).
      const fresh = new Map<SampleLocale, Buffer>(mine.map((d) => [d.variant, d.bytes!]));
      const { books, notes } = await bundleBooks(task.slug, task.meta, fresh, true);
      for (const d of mine) {
        d.bytes = books.get(d.variant) ?? d.bytes;
        const added = kept(notes.get(d.variant) ?? []);
        d.findings = [...d.findings, ...added];
        d.result.warns.push(...added);
      }
      if (opts.check) {
        for (const d of mine) d.result.note = "check only";
        continue;
      }
      // Re-read capture.json: only the `sandbox` entries and the bundle's
      // own findings change.
      const manifest = readManifest(task.slug)!;
      for (const d of mine) {
        const file = sandboxFile(task.slug);
        d.result.written = writeIfChanged(path.join(captureDir(task.slug), d.variant, file), d.bytes!);
        // Where a fresh capture puts them: the entry after the PDF, before
        // `detected`; the findings after the checks' own.
        const { detected, diagnostics, ...head } = manifest.variants[d.variant]!;
        const others = diagnostics.findings.filter((f) => f.check !== "sandbox" && f.check !== "C33");
        manifest.variants[d.variant] = {
          ...head, sandbox: sandboxEntry(task.slug, { ...d.sandbox!, bytes: d.bytes! }, task.meta), detected,
          diagnostics: { ...diagnostics, findings: [...others, ...d.findings] },
        };
        if (!d.result.written) d.result.note = "unchanged";
      }
      // A bundle written again is not the one a later release read back (#735).
      if (mine.some((d) => d.result.written)) delete manifest.verified;
      const target = path.join(captureDir(task.slug), "capture.json");
      if (writeIfChanged(target, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`))) {
        for (const d of mine) if (!d.result.written) d.result.note = "bundle unchanged, capture.json updated";
      }
    }
  } finally {
    await hb.browser.close().catch(() => {});
  }
  return results;
}

export function writeReport(file: string, results: CaptureResult[], engine: EngineSpec, chrome: string | null): void {
  const out = userPath(file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const report = { engine: { postext: engine.postext, postextPdf: engine.postextPdf, source: engine.source }, chrome, results };
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
}
