// One edition's Sandbox run against its capture: compareEdition, the
// editions of a recipe, and the result and pool helpers (#1276: split out
// of sandbox.ts).
import fs from 'node:fs';
import path from 'node:path';
import { styleText } from 'node:util';
import { captureDir } from '../../../src/lib/cookbook/paths.ts';
import { type SampleLocale, type CaptureManifest, SAMPLE_LOCALES } from '../../../src/lib/cookbook/types.ts';
import type { CaptureResult } from '../capture.ts';
import type { SandboxExpected, SandboxRun, SandboxFinding } from '../sandbox.ts';
import { fallbackFamily, extraWarnings, warningSince, laterRelease, variableFamilies, listed } from './warnings.ts';

/**
 * An edition's run against its record. Failures: an error of the page or
 * the worker, a layout that did not settle, a warning the pen's builds do
 * not have (for a `fontFallback`, with the family's faces on the page and
 * in the worker; a kind newer than the recipe's engine is a warning). A chapter count, a page count or, on the recorded engine
 * (`sameEngine`), lines other than the recorded ones: failures with
 * `strict`, warnings without. A layout hash other than the recorded one
 * under the recorded lines is a note: the Sandbox measures with another
 * build of the family than the pen (Google's variable file, the pen the
 * static cuts), and the hash rounds widths that differ by fractions of a
 * pixel. With no lines recorded (a capture from before them) the layout
 * hash cannot tell a line that moved from such a width: a warning that
 * says to capture again. An edition whose capture.json has no
 * `sandbox.chapters` yet is compared on its page total, and its warnings
 * are notes: there is nothing recorded to read them against.
 */
export function compareEdition(
  expected: SandboxExpected,
  run: SandboxRun,
  { strict, sameEngine, ownBundle }: { strict: boolean; sameEngine: boolean; ownBundle?: string },
): SandboxFinding[] {
  const out: SandboxFinding[] = [];
  const add = (severity: SandboxFinding["severity"], detail: string) => out.push({ severity, detail });
  const moved: SandboxFinding["severity"] = strict ? "fail" : "warn";
  for (const error of run.errors) add("fail", error);
  if (!run.chapters.length) {
    if (!run.errors.length) add("fail", "the Sandbox laid out no chapter");
    return out;
  }
  if (!run.settled) add("fail", "the book's plan did not settle: a chapter kept being asked for again");
  if (ownBundle !== undefined && run.bundleUrl !== ownBundle) {
    add("fail", `the page fetched ${run.bundleUrl ?? "no bundle"}, not the edition's own ${ownBundle}`);
  }

  const s = (n: number) => `${n} page${n === 1 ? "" : "s"}`;
  const got = run.chapters;
  const want = expected.sandbox.chapters;
  const raised = got.flatMap((c) => c.warnings);
  const faces = (warning: string) => {
    const family = fallbackFamily(warning, Object.keys(run.fonts));
    const held = family ? run.fonts[family] : undefined;
    return held ? ` (${family} on the page: ${held.page.join(", ") || "no face"}; in the worker: ${held.worker.join(", ") || "no face"})` : "";
  };
  if (!want) {
    // Before the capture records chapters: the page total, and notes.
    const total = got.reduce((sum, c) => sum + c.pages, 0);
    const recorded = expected.sandbox.pages ?? expected.pages;
    if (total !== recorded) add(moved, `the Sandbox lays the bundle out to ${s(total)}, the capture counts ${recorded}`);
    for (const warning of raised) add("info", `the Sandbox raises ${warning}${faces(warning)} (capture.json records no sandbox.warnings to read it against: capture with --sandbox-only)`);
    return out;
  }
  for (const warning of extraWarnings(expected.sandbox.warnings ?? [], raised)) {
    const since = warningSince(warning);
    if (since && laterRelease(since, expected.engine)) {
      add("warn", `the Sandbox raises ${warning}, a warning postext ${since} added after the recipe's ${expected.engine}: capture again on ${since} or later`);
      continue;
    }
    add("fail", `the Sandbox raises a warning the pen does not: ${warning}${faces(warning)}`);
  }
  if (got.length !== want.length) {
    add(moved, `the Sandbox lays out ${got.length} chapter${got.length === 1 ? "" : "s"}, the capture records ${want.length}`);
    return out;
  }
  const one = want.length === 1;
  const variable = variableFamilies(run.fonts);
  const measured = variable.length ? `the Sandbox measures ${listed(variable)} from ${variable.length === 1 ? "a variable file" : "variable files"}, a pen from the static cuts` : "";
  got.forEach((chapter, i) => {
    const name = one ? "the bundle" : `chapter ${i + 1}`;
    const recorded = want[i]!;
    if (chapter.pages !== recorded.pages) {
      add(moved, `the Sandbox lays ${name} out to ${s(chapter.pages)}, the capture records ${recorded.pages}`);
      return;
    }
    if (!sameEngine || chapter.hash === undefined || chapter.hash === recorded.hash) return;
    const hashes = `layout hash ${chapter.hash} against ${recorded.hash}`;
    if (recorded.lines === undefined || chapter.lines === undefined) {
      add("warn", `the Sandbox lays ${name} out to another layout hash than the capture records (${s(chapter.pages)} on both sides, ${hashes}), and capture.json records no lines hash to tell a line that breaks elsewhere from one set to another width: capture with --sandbox-only`);
    } else if (chapter.lines !== recorded.lines) {
      add(moved, `the Sandbox breaks the lines of ${name} otherwise than the capture records (${s(chapter.pages)} on both sides, lines hash ${chapter.lines} against ${recorded.lines})${measured ? `; ${measured}, and a line a fraction of a pixel from its measure breaks on either side of it` : ""}`);
    } else {
      add("info", `the Sandbox sets ${name} in the lines the capture records, some of them to another width (${hashes})${measured ? `: ${measured}` : ""}`);
    }
  });
  return out;
}

// ─── The editions of a run ──────────────────────────────────────────────────

export interface Edition extends SandboxExpected {
  timeoutMs: number;
}

export function editionsOf(slugs: readonly string[], langs: readonly SampleLocale[], timeoutMs: number): { editions: Edition[]; broken: CaptureResult[] } {
  const editions: Edition[] = [];
  const broken: CaptureResult[] = [];
  const failed = (slug: string, detail: string): CaptureResult => ({
    slug, variant: "en", ok: false, fails: [{ check: "sandbox", detail }], warns: [], pages: 0, totalMs: 0, written: false, outDir: captureDir(slug),
  });
  for (const slug of slugs) {
    const file = path.join(captureDir(slug), "capture.json");
    if (!fs.existsSync(file)) {
      broken.push(failed(slug, "no capture.json: capture the recipe first"));
      continue;
    }
    let manifest: CaptureManifest;
    try {
      manifest = JSON.parse(fs.readFileSync(file, "utf-8")) as CaptureManifest;
    } catch (error) {
      broken.push(failed(slug, `capture.json does not parse: ${(error as Error).message}`));
      continue;
    }
    for (const variant of SAMPLE_LOCALES) {
      const data = manifest.variants?.[variant];
      if (!data?.sandbox || !langs.includes(variant)) continue;
      editions.push({ slug, variant, sandbox: data.sandbox, pages: data.specimen.pages, engine: manifest.engine.postext, timeoutMs });
    }
  }
  return { editions, broken };
}

export const bundleFile = (slug: string, lang: string) => path.join(captureDir(slug), lang, `${slug}.postext`);
export const dim = (text: string) => styleText("dim", text, { stream: process.stderr });

/** A run's findings as the capture's report prints them. */
export function resultOf(edition: Edition, findings: SandboxFinding[], run: SandboxRun | null, totalMs: number, engine: string): CaptureResult {
  const fails = findings.filter((f) => f.severity === "fail").map((f) => ({ check: "sandbox", detail: f.detail }));
  return {
    slug: edition.slug, variant: edition.variant, ok: fails.length === 0, fails,
    warns: findings.filter((f): f is SandboxFinding & { severity: "warn" | "info" } => f.severity !== "fail").map((f) => ({ check: "sandbox", severity: f.severity, detail: f.detail })),
    pages: run?.chapters.reduce((sum, c) => sum + c.pages, 0) ?? 0, totalMs, written: false,
    outDir: path.join(captureDir(edition.slug), edition.variant), engine,
  };
}

export async function pool<T>(jobs: (() => Promise<T>)[], limit: number): Promise<T[]> {
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
