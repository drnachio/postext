// What every capture run shares: its options and result, the recipes it
// selects and prepares, the manifest it reads, and output and pool helpers
// (#1276: split out of capture.ts).
import fs from 'node:fs';
import path from 'node:path';
import { styleText } from 'node:util';
import { declaresComposedPages } from '../../../src/lib/cookbook/bench.ts';
import { sourceHash } from '../../../src/lib/cookbook/hash.ts';
import { captureDir } from '../../../src/lib/cookbook/paths.ts';
import { compareSemVer } from '../../../src/lib/cookbook/validate.ts';
import { readRecipeMeta, readRecipeSources, listRecipeSlugs } from '../../../src/lib/cookbook/sources.ts';
import { type SampleLocale, type RecipeMeta, type CaptureManifest, type CaptureVariant, SAMPLE_LOCALES } from '../../../src/lib/cookbook/types.ts';
import type { PageChange } from '../harness.ts';
import type { SheetEntry } from '../sheet.ts';
import { type EngineSpec, forcedConfig } from '../shim.ts';

export interface CaptureOptions {
  slugs: string[];
  all?: boolean;
  langs?: SampleLocale[];
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
  /** Write only the Sandbox bundles, with the engine capture.json records. */
  sandboxOnly?: boolean;
  /** Write only `verified` records (#735): a recipe whose files would
   *  change is listed as needing a recapture, and fails the run. */
  verify?: boolean;
  /** The stress test (#869, C38): each edition is laid out again with its
   *  text this many times as long. Writes nothing. */
  stress?: number;
  /** With `stress`: write every page of the stretched edition, its
   *  stretched Markdown and its C38 findings to `<dir>/<slug>/<lang>/`
   *  (`--stress-out`, #915). */
  stressOut?: string;
  /** Compare every published page with the approved capture (C39). */
  compare?: boolean;
  /** C39's threshold: the largest mean difference of a cell, of 255. */
  maxDiff?: number;
  /** C39 compares the layout hash only (`--no-pixels`): pages painted on
   *  another system than the approved ones differ at every glyph edge. */
  pixels?: boolean;
  /** C39 warns, not fails, on a layout hash that differs (`--hash-warn`):
   *  a run on another system than the capture's. */
  hashWarn?: boolean;
  /** C39 fails on any engine, not only the one the capture records. */
  strict?: boolean;
  /** With no slugs: every recipe whose Markdown declares composed pages
   *  (the bench), stale or not. */
  composed?: boolean;
}

export interface CaptureResult {
  slug: string;
  variant: SampleLocale;
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

export interface Prepared {
  slug: string;
  meta: RecipeMeta;
  sourceHash: string;
  previous: CaptureManifest | null;
  variants: SampleLocale[];
  assets: string[];
}

/** One edition's outputs, in memory until the recipe is written. */
export interface Output {
  /** Null when the edition failed (its previews and sheet row still exist). */
  variant: CaptureVariant | null;
  files: Map<string, Buffer>;
  previews: Map<string, Buffer>;
  sheet: SheetEntry;
  /** The published pages that are not their committed images beyond
   *  rendering noise (#734); null when the run did not compare them. */
  pageChanges?: PageChange[] | null;
  /** The committed bundle, of other bytes than the run's, reads back as
   *  the pen's documents on the run's engine (#734). */
  committedBundleOk?: boolean;
}

export const dim = (text: string) => styleText("dim", text, { stream: process.stderr });

/** A path the user typed, relative to where they ran pnpm. */
export function userPath(file: string): string {
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

function prepare(slug: string, langs: readonly SampleLocale[]): Prepared {
  const meta = readRecipeMeta(slug);
  const locales = (meta.sample?.locales ?? []).filter((l) => SAMPLE_LOCALES.includes(l));
  return {
    slug,
    meta,
    sourceHash: sourceHash(slug, meta),
    previous: readManifest(slug),
    variants: locales.filter((l) => langs.includes(l)),
    assets: readRecipeSources(slug).assets,
  };
}

/** The recipes to capture: the named ones, --all, or the stale ones. A
 *  recipe that needs a newer postext than the engine the run pins (a draft
 *  previewing the next release) is reported instead of run. */
export function selectRecipes(opts: CaptureOptions, langs: readonly SampleLocale[], engine: EngineSpec): { prepared: Prepared[]; broken: CaptureResult[] } {
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
    if (!named && opts.composed) {
      if (!declaresComposedPages(readRecipeSources(slug).content)) continue;
    } else if (!named && !opts.all) {
      const prev = task.previous;
      const stale = !prev || prev.sourceHash !== task.sourceHash || task.variants.some((v) => !prev.variants?.[v]);
      if (!stale) continue;
    }
    if (engine.source === "npm" && compareSemVer(task.meta.engine.postext, engine.postext) > 0) {
      const why = `needs postext ${task.meta.engine.postext}; this run pins ${engine.postext}: preview it with --engine local until the release`;
      if (named) broken.push(failed(slug, task.variants[0] ?? "en", "engine", why));
      else process.stderr.write(dim(`  skipping ${slug}: ${why}\n`));
      continue;
    }
    if (task.variants.length) prepared.push(task);
  }
  return { prepared, broken };
}

export function failed(slug: string, variant: SampleLocale, check: string, detail: string): CaptureResult {
  return {
    slug, variant, ok: false, fails: [{ check, detail }], warns: [], pages: 0, totalMs: 0, written: false,
    outDir: path.join(captureDir(slug), variant),
  };
}

export const pad = (n: number) => String(n).padStart(2, "0");

/** Runs `jobs` with at most `limit` in flight. */
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

/**
 * A run with a forced configuration (`COOKBOOK_FORCE_CONFIG`, shim.ts)
 * lays the recipes out as no reader's pen does: it checks, and says so on
 * its first line; asked to write a capture or a bundle, it stops.
 */
export function announceForcedConfig(writes: boolean): void {
  const force = forcedConfig();
  if (!force) return;
  if (writes) throw new Error("COOKBOOK_FORCE_CONFIG is set: a forced configuration is never captured, run with --check (or unset it)");
  process.stderr.write(styleText("yellow", `  configuration forced on every build (COOKBOOK_FORCE_CONFIG): ${JSON.stringify(force)}\n`, { stream: process.stderr }));
}
