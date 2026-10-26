// What a run writes (#734, #735): each kind of file judged on its own,
// the planned edition and writeRecipe (#1276: split out of capture.ts).
import fs from 'node:fs';
import path from 'node:path';
import { hash8 } from '../../../src/lib/cookbook/hash.ts';
import { captureDir, WEB_DIR } from '../../../src/lib/cookbook/paths.ts';
import { compareSemVer } from '../../../src/lib/cookbook/validate.ts';
import { type SampleLocale, type CaptureManifest, type CaptureVariant, SAMPLE_LOCALES, type SemVer } from '../../../src/lib/cookbook/types.ts';
import type { VariantRun } from '../harness.ts';
import type { EngineSpec } from '../shim.ts';
import { type Output, pad, type Prepared, dim } from './common.ts';
import { sandboxFile, variantFilesExist, sameFiles, manifestKey } from './evaluate.ts';

// ─── What a run writes (#734, #735) ─────────────────────────────────────────

/** The kinds of file an edition holds, each judged on its own. */
export type FileKind = "images" | "pdf" | "bundle";

/** What one captured edition needs written, and why. */
export interface EditionPlan {
  locale: SampleLocale;
  /** The kinds whose files the run writes. */
  write: Set<FileKind>;
  /** Why, in the words `--verify` prints: "layout hash", "pixels (p03:
   *  worst cell 36.2 of 255, …)", "PDF", "bundle", "sources", "new edition". */
  reasons: string[];
  /** Nothing committed to keep: the edition's folder is written anew. */
  fresh: boolean;
  /** The committed bundle stays although its bytes are not the run's: it
   *  reads back as the pen's documents on the run's engine. */
  bundleRead: boolean;
}

const KINDS: readonly FileKind[] = ["images", "pdf", "bundle"];

/** The files of one kind in an edition's outputs. */
function kindOf(slug: string, name: string): FileKind {
  if (name === sandboxFile(slug)) return "bundle";
  return name === `${slug}.pdf` ? "pdf" : "images";
}

/**
 * What a passed edition writes. With other sources, no committed edition,
 * a missing file or --force: everything. With another layout hash or other
 * file names: everything too (the PDF and the bundle are of that layout).
 * Otherwise each kind on its own: the images when a page differs from its
 * committed image beyond rendering noise, the PDF when its bytes differ,
 * the bundle when its bytes differ and, the run being on another engine
 * than the recorded one, the committed bundle does not read back as the
 * pen's documents (on the recorded engine a bundle of other bytes follows
 * the tooling, as it always did).
 */
export function planEdition(
  slug: string,
  locale: SampleLocale,
  output: Output,
  dir: string,
  prev: CaptureManifest | null,
  context: { sourceHash: string; engine: string; force: boolean },
): EditionPlan {
  const next = output.variant!;
  const all = (reason: string): EditionPlan => ({
    locale, reasons: [reason], fresh: true, bundleRead: false,
    write: new Set(KINDS.filter((kind) => [...output.files.keys()].some((name) => kindOf(slug, name) === kind))),
  });
  const old = prev?.variants?.[locale];
  if (context.force) return all("--force");
  if (!prev) return all("no capture");
  if (prev.sourceHash !== context.sourceHash) return all("sources");
  if (!old) return all("new edition");
  if (!variantFilesExist(dir, old)) return all("a committed file is missing");
  if (old.vdtHash !== next.vdtHash) return all("layout hash");
  if (!sameFiles(old, next)) return all("pages published");

  const write = new Set<FileKind>();
  const reasons: string[] = [];
  const onDisk = (name: string) => fs.readFileSync(path.join(dir, name));
  // Pages, card and OG image: they follow the pages they are made from.
  const changes = output.pageChanges
    ?? next.pages.filter((p) => !onDisk(p.file).equals(output.files.get(p.file)!)).map((p) => ({ n: p.n, detail: "other bytes, not compared" }));
  if (changes.length) {
    write.add("images");
    const first = changes[0]!;
    reasons.push(`pixels (p${pad(first.n)}: ${first.detail}${changes.length > 1 ? `, and ${changes.length - 1} more page${changes.length > 2 ? "s" : ""}` : ""})`);
  }
  const pdf = output.files.get(`${slug}.pdf`);
  if (pdf && !onDisk(`${slug}.pdf`).equals(pdf)) {
    write.add("pdf");
    reasons.push("PDF");
  }
  const bundle = output.files.get(sandboxFile(slug));
  let bundleRead = false;
  if (bundle) {
    const file = path.join(dir, sandboxFile(slug));
    const committed = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (!committed?.equals(bundle)) {
      bundleRead = !!committed && prev.engine?.postext !== context.engine && output.committedBundleOk === true;
      if (!bundleRead) {
        write.add("bundle");
        reasons.push("bundle");
      }
    }
  }
  return { locale, write, reasons, fresh: false, bundleRead };
}

/** capture.json's entry of a planned edition. What describes a kept file
 *  (its sizes and bytes) stays the committed entry's; `hash8` and the
 *  timings change only when a file of the edition is written (the timings
 *  vary run to run and would rewrite capture.json every time); the rest
 *  (detection, diagnostics, alt text, spreads) comes from the new run. */
function plannedVariant(slug: string, plan: EditionPlan, output: Output, old: CaptureVariant | undefined, dir: string): CaptureVariant {
  const next = output.variant!;
  if (plan.fresh || !old) return next;
  const images = plan.write.has("images");
  const merged: CaptureVariant = {
    ...next,
    ...(images ? {} : {
      pages: next.pages.map((p, i) => ({ ...p, w: old.pages[i].w, h: old.pages[i].h, bytes: old.pages[i].bytes })),
      card: old.card.mode === next.card.mode ? old.card : next.card,
      og: old.og,
    }),
    ...(old.pdf && !plan.write.has("pdf") ? { pdf: old.pdf } : {}),
    ...(plan.bundleRead && old.sandbox ? { sandbox: old.sandbox } : {}),
  };
  if (!plan.write.size) return { ...merged, hash8: old.hash8, timings: old.timings };
  // The hash of the files as the folder will hold them.
  const bytes = [...output.files].map(([name, fresh]) => (plan.write.has(kindOf(slug, name)) ? fresh : fs.readFileSync(path.join(dir, name))));
  return { ...merged, hash8: hash8(Buffer.concat(bytes)) };
}

/** `verified` written into capture.json's text, after `capturedAt`: no
 *  other byte of the file changes (#735). */
export function withVerified(text: string, verified: NonNullable<CaptureManifest["verified"]>): string {
  const block = JSON.stringify(verified, null, 2).replace(/\n/g, "\n  ");
  const had = /\n {2}"verified": \{[^}]*\},?(?=\n)/;
  if (had.test(text)) return text.replace(had, `\n  "verified": ${block},`);
  const at = /\n {2}"capturedAt": "[^"\n]*",(?=\n)/.exec(text);
  if (at) return `${text.slice(0, at.index + at[0].length)}\n  "verified": ${block},${text.slice(at.index + at[0].length)}`;
  // A file some other tool formatted: written again whole.
  const { schemaVersion, slug, sourceHash: hash, engine, chrome, capturedAt, variants, ...rest } = JSON.parse(text) as CaptureManifest;
  return `${JSON.stringify({ schemaVersion, slug, sourceHash: hash, engine, chrome, capturedAt, verified, ...rest, variants }, null, 2)}\n`;
}

/** What `writeRecipe` did, or would do under `verifyOnly`. */
export interface WriteOutcome {
  /** The kinds written per edition (an edition absent wrote nothing). */
  written: Map<SampleLocale, Set<FileKind>>;
  dropped: SampleLocale[];
  /** Only capture.json changed: what describes the files, on the engine
   *  that wrote them. */
  manifestOnly: boolean;
  /** `verified` was recorded for this release (#735). */
  verified: string | null;
  /** Under `verifyOnly`: why the recipe needs a recapture, per edition. */
  needs: { locale: SampleLocale; reasons: string[] }[];
}

/**
 * Writes a recipe's captures atomically: the files each edition's plan
 * names ({@link planEdition}), the editions dropped as stale, or
 * capture.json alone. `verifyOnly` (#735) writes nothing but a `verified`
 * record, and reports the plans that would write a file. `root` is the
 * recipe's capture folder (a test's stand-in for it).
 */
export function writeRecipe(
  task: Pick<Prepared, "slug" | "meta" | "sourceHash" | "previous">,
  outputs: Map<SampleLocale, Output>,
  engine: EngineSpec,
  chrome: string,
  { force = false, verifyOnly = false, root = captureDir(task.slug), now = () => new Date() }: { force?: boolean; verifyOnly?: boolean; root?: string; now?: () => Date } = {},
): WriteOutcome {
  const finalDir = root;
  const prev = task.previous;
  const context = { sourceHash: task.sourceHash, engine: engine.postext, force };
  const plans = new Map<SampleLocale, EditionPlan>();
  for (const [locale, output] of outputs) {
    if (output.variant) plans.set(locale, planEdition(task.slug, locale, output, path.join(finalDir, locale), prev, context));
  }
  const writes = [...plans.values()].some((plan) => plan.write.size > 0);
  const sameSources = !!prev && prev.sourceHash === task.sourceHash;
  const sameEngine = sameSources && prev.engine?.postext === engine.postext;

  // Editions not captured this run survive only when their inputs did not
  // change and the manifest goes on naming the engine that pictured them.
  const sampled = new Set(task.meta.sample.locales);
  const uncaptured = SAMPLE_LOCALES.filter((locale) => prev?.variants?.[locale] && !outputs.has(locale));
  const survives = (locale: SampleLocale) => sameSources && (sameEngine || !writes) && sampled.has(locale)
    && variantFilesExist(path.join(finalDir, locale), prev!.variants[locale]!);
  const dropped = uncaptured.filter((locale) => !survives(locale));

  const outcome: WriteOutcome = { written: new Map(), dropped: [], manifestOnly: false, verified: null, needs: [] };
  const needs = [...plans.values()].filter((plan) => plan.write.size > 0).map((plan) => ({ locale: plan.locale, reasons: plan.reasons }));
  if (verifyOnly && (needs.length || dropped.length)) {
    outcome.needs = [...needs, ...dropped.map((locale) => ({ locale, reasons: ["its capture is of other inputs"] }))];
    return outcome;
  }

  const usesPdf = task.meta.outputs.includes("pdf") || !!task.meta.downloads?.pdf || !!task.meta.engine.postextPdf;
  const released = { postext: engine.postext as SemVer, ...(usesPdf ? { postextPdf: engine.postextPdf as SemVer } : {}) };
  const file = path.join(finalDir, "capture.json");

  if (!writes && !dropped.length && prev) {
    // No file of the recipe changed. On another release than the recorded
    // one the folder stays as it is, and a newer release is recorded as
    // the one the recipe was last verified on (#735): a run that did not
    // take every edition of the recipe proves nothing of the others.
    if (!sameEngine) {
      const whole = SAMPLE_LOCALES.every((locale) => !prev.variants[locale] || plans.has(locale));
      const newer = compareSemVer(engine.postext, prev.verified?.postext ?? prev.engine.postext) > 0;
      if (whole && newer && engine.source === "npm") {
        const verified = { ...released, chrome, at: now().toISOString() };
        const tmpFile = `${file}.tmp-${process.pid}`;
        fs.writeFileSync(tmpFile, withVerified(fs.readFileSync(file, "utf-8"), verified));
        fs.renameSync(tmpFile, file);
        outcome.verified = engine.postext;
      }
      return outcome;
    }
    if (verifyOnly) return outcome;
    // On the recorded engine: capture.json alone, when the tooling changed
    // what describes the files (capturedAt and chrome stay: they are the
    // run's that made the images).
    const variants: Partial<Record<SampleLocale, CaptureVariant>> = {};
    for (const locale of SAMPLE_LOCALES) {
      const plan = plans.get(locale);
      if (plan) variants[locale] = plannedVariant(task.slug, plan, outputs.get(locale)!, prev.variants[locale], path.join(finalDir, locale));
      else if (prev.variants[locale]) variants[locale] = prev.variants[locale];
    }
    const manifest: CaptureManifest = {
      schemaVersion: 1, slug: task.slug, sourceHash: task.sourceHash, engine: prev.engine, chrome: prev.chrome, capturedAt: prev.capturedAt,
      ...(prev.verified ? { verified: prev.verified } : {}),
      variants,
    };
    if (manifestKey(manifest) === manifestKey(prev)) return outcome;
    const tmpFile = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmpFile, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.renameSync(tmpFile, file);
    outcome.manifestOnly = true;
    return outcome;
  }
  if (verifyOnly) {
    // No capture to verify.
    outcome.needs = [...plans.keys()].map((locale) => ({ locale, reasons: ["no capture"] }));
    return outcome;
  }

  // A file is written: the manifest names this run, and `verified` goes
  // (the files say it themselves).
  const variants: Partial<Record<SampleLocale, CaptureVariant>> = {};
  for (const locale of SAMPLE_LOCALES) {
    const plan = plans.get(locale);
    if (plan) variants[locale] = plannedVariant(task.slug, plan, outputs.get(locale)!, prev?.variants?.[locale], path.join(finalDir, locale));
    else if (prev?.variants?.[locale] && !dropped.includes(locale)) variants[locale] = prev.variants[locale];
  }
  const manifest: CaptureManifest = {
    schemaVersion: 1,
    slug: task.slug,
    sourceHash: task.sourceHash,
    engine: { ...released, source: "npm" },
    chrome,
    capturedAt: now().toISOString(),
    variants,
  };

  const tmpRoot = path.join(WEB_DIR, ".cache", "cookbook-tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(tmpRoot, `${task.slug}-`));
  const old = `${finalDir}.old-${process.pid}`;
  try {
    for (const locale of SAMPLE_LOCALES) {
      if (!variants[locale]) continue;
      const plan = plans.get(locale);
      const dir = path.join(tmp, locale);
      // What stays is copied as it is; a fresh edition starts empty, so no
      // page of an earlier, longer capture lingers.
      if (!plan?.fresh) fs.cpSync(path.join(finalDir, locale), dir, { recursive: true, preserveTimestamps: true });
      else fs.mkdirSync(dir, { recursive: true });
      if (!plan) continue;
      for (const [name, bytes] of outputs.get(locale)!.files) {
        if (plan.write.has(kindOf(task.slug, name))) fs.writeFileSync(path.join(dir, name), bytes);
      }
      if (plan.write.size) outcome.written.set(locale, plan.write);
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
  outcome.dropped = dropped;
  return outcome;
}

/** "PDF written, images and bundle kept". */
export function writtenNote(kinds: Set<FileKind>, variant: CaptureVariant | null): string {
  const name: Record<FileKind, string> = { images: "images", pdf: "PDF", bundle: "bundle" };
  const has = KINDS.filter((kind) => kind === "images" || (kind === "pdf" ? !!variant?.pdf : !!variant?.sandbox));
  const kept = has.filter((kind) => !kinds.has(kind));
  return kept.length ? `${[...kinds].map((k) => name[k]).join(" and ")} written, ${kept.map((k) => name[k]).join(" and ")} kept` : "";
}

/** A wait of the harness that ended on its timer (#743), on stderr: the
 *  capture goes on, and whoever reads the run sees which edition it was. */
export function sayFallbacks(run: VariantRun): void {
  for (const what of run.fallbacks) process.stderr.write(dim(`  ${run.slug} ${run.variant}: ${what}\n`));
}
