/**
 * Static checks of the Cookbook's pens and recipe folders (spec §7.4, §9):
 * what `pnpm cookbook lint` prints and what `pens.test.ts` asserts. FAILs
 * block a recipe; WARNs are advice. Nothing here runs a browser: the
 * capture's checks (§8.5) cover what only a real layout can show.
 *
 * Isomorphic Node: relative `.ts` imports only. `lintPen` is pure;
 * `lintRecipe` and `lintAll` read the recipe folder.
 */
import fs from 'node:fs';
import path from 'node:path';
import { composePen, ComposeError, variantFor } from './compose.ts';
import { fontFamilies, penFonts } from './detect.ts';
import { docLinkExists } from './docLinks.ts';
import { recipeDir, REPO_DIR } from './paths.ts';
import { loadRegistry } from './registry.ts';
import { readRecipeMeta, listRecipeSlugs, readRecipeSources, readKit } from './sources.ts';
import { type RecipeMeta, type RecipeSources, type Registry, type SampleLocale, type ComposedPen, type Locale, LOCALES } from './types.ts';
import { fixedGaps, validateRecipeMeta, fixedNotes, validateRecipeSet } from './validate.ts';
import { readWriteup, writeupRefs } from './writeup.ts';
import { styleMessages } from './style.ts';
import { type LintReport, LIMITS, type RecipeLintReport } from './lint/limits.ts';
import { lintPen } from './lint/pen.ts';

export { LIMITS, ALLOWED_IMPORTS, NETWORK_ALLOWLIST, KIT_IMPORTS, KIT_CALLS, isAllowedUrl } from './lint/limits.ts';
export type { LintReport, RecipeLintReport } from './lint/limits.ts';
export { lintPen } from './lint/pen.ts';
export type { LintPenOptions } from './lint/pen.ts';

// ─── Assets ─────────────────────────────────────────────────────────────────

/** Pixel size of a PNG, JPEG, GIF or WebP, or null. */
export function imageSize(data: Uint8Array): { width: number; height: number } | null {
  const u16be = (i: number) => (data[i] << 8) | data[i + 1];
  const u16le = (i: number) => data[i] | (data[i + 1] << 8);
  const u24le = (i: number) => data[i] | (data[i + 1] << 8) | (data[i + 2] << 16);
  const u32be = (i: number) => ((data[i] << 24) >>> 0) + (data[i + 1] << 16) + (data[i + 2] << 8) + data[i + 3];
  const ascii = (i: number, n: number) => String.fromCharCode(...data.subarray(i, i + n));
  if (data.length > 24 && data[0] === 0x89 && ascii(1, 3) === "PNG") return { width: u32be(16), height: u32be(20) };
  if (data.length > 10 && ascii(0, 3) === "GIF") return { width: u16le(6), height: u16le(8) };
  if (data.length > 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8 ") return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (chunk === "VP8L") {
      const b = data.subarray(21, 25);
      return { width: 1 + (((b[1] & 0x3f) << 8) | b[0]), height: 1 + (((b[3] & 0xf) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)) };
    }
    if (chunk === "VP8X") return { width: 1 + u24le(24), height: 1 + u24le(27) };
    return null;
  }
  if (data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) return null;
      const marker = data[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: u16be(i + 7), height: u16be(i + 5) };
      }
      i += 2 + u16be(i + 2);
    }
  }
  return null;
}

function lintAssets(slug: string, meta: RecipeMeta, sources: RecipeSources): LintReport {
  const fails: string[] = [];
  const warns: string[] = [];
  const dir = recipeDir(slug);
  let total = 0;
  const credited = new Set((meta.credits?.images ?? []).map((c) => (c.file ? `assets/${c.file.replace(/^assets\//, "")}` : "")));
  for (const file of sources.assets) {
    const data = fs.readFileSync(path.join(dir, file));
    total += data.length;
    if (data.length > LIMITS.assetBytes) fails.push(`${file}: ${Math.round(data.length / 1024)} KB (at most 400 KB per asset)`);
    if (/\.(jpe?g|png|webp|gif)$/i.test(file)) {
      const size = imageSize(data);
      if (!size) warns.push(`${file}: could not read the image size`);
      else if (Math.max(size.width, size.height) > LIMITS.imageLongSide) {
        fails.push(`${file}: ${size.width}×${size.height} px (long side at most ${LIMITS.imageLongSide} px)`);
      }
    } else if (/\.svg$/i.test(file)) {
      const svg = data.toString("utf-8");
      if (/<marker\b|<filter\b|<mask\b|\sfilter=|\smask=/.test(svg)) fails.push(`${file}: no <marker>, filters or masks in SVG (they fall back to raster)`);
    }
    if (!credited.has(file)) fails.push(`${file}: every asset needs a credits.images entry with "file": "${file.replace(/^assets\//, "")}"`);
  }
  if (total > LIMITS.assetsBytes) fails.push(`assets/: ${Math.round(total / 1024)} KB in all (at most 2 MB)`);
  for (const file of credited) {
    if (file && !sources.assets.includes(file)) fails.push(`credits.images: ${file} does not exist`);
  }
  return { fails, warns };
}

// ─── lintRecipe ─────────────────────────────────────────────────────────────

/** The released postext and postext-pdf versions (packages/*\/package.json). */
export function readReleasedEngine(): { postext?: string; postextPdf?: string } {
  const version = (pkg: string) => {
    try {
      return (JSON.parse(fs.readFileSync(path.join(REPO_DIR, "packages", pkg, "package.json"), "utf-8")) as { version?: string }).version;
    } catch {
      return undefined;
    }
  };
  return { postext: version("postext"), postextPdf: version("postext-pdf") };
}

/** Whether the repository tests take a draft pinned to the next release
 *  as a preview, the way `pnpm cookbook lint --engine local` does
 *  (`COOKBOOK_PREVIEW=1`, on the branch that writes the recipe). Off by
 *  default: a draft in develop pins a released engine and has its capture,
 *  so a recipe for a new feature lands in a PR after the release (#201). */
export function previewDraftsAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.COOKBOOK_PREVIEW === "1";
}

export interface LintRecipeOptions {
  registry?: Registry;
  knownSlugs?: string[];
  released?: { postext?: string; postextPdf?: string };
  /** `--engine local`: a draft may pin the next release (validate.ts). */
  preview?: boolean;
  /** `--as-of x.y.z`: judge the notes about fixed pitfalls (`fixedNotes`)
   *  as if every recipe pinned at least that version. */
  fixedAsOf?: string;
}

/** Everything `pnpm cookbook lint <slug>` checks: recipe.json, every
 *  composed edition, the assets, and both write-ups. */
export function lintRecipe(slug: string, options: LintRecipeOptions = {}): RecipeLintReport {
  const fails: string[] = [];
  const warns: string[] = [];
  const report = (): RecipeLintReport => ({ slug, fails: [...new Set(fails)], warns: [...new Set(warns)] });

  let meta: RecipeMeta;
  try {
    meta = readRecipeMeta(slug);
  } catch (error) {
    fails.push(`recipe.json: ${(error as Error).message}`);
    return report();
  }
  let registry: Registry;
  try {
    registry = options.registry ?? loadRegistry();
  } catch (error) {
    fails.push((error as Error).message);
    return report();
  }
  const knownSlugs = options.knownSlugs ?? listRecipeSlugs();
  // A gap the engine closed at or before the recipe's pin is no longer worked
  // around: its id leaves `gaps` (#641). Always a failure: no recipe listed
  // one when this check arrived, so it needs no `--strict-fixed`.
  fails.push(...fixedGaps(meta, registry.gaps, options.fixedAsOf).map((note) => `recipe.json › ${note.message}`));
  fails.push(
    // Worded like scripts/cookbook/lint.ts, which also validates recipe.json and merges equal findings.
    ...validateRecipeMeta(meta, slug, registry, { knownSlugs, released: options.released ?? readReleasedEngine(), preview: options.preview }).map(
      (e) => `recipe.json › ${e}`,
    ),
  );
  // A note about a pitfall fixed at or before the recipe's pin fails (#641):
  // the page no longer shows the pitfall, and a workaround that names its
  // follow-up explains code by a bug the recipe's engine does not have.
  fails.push(...fixedNotes(meta, registry.gotchas, options.fixedAsOf).map((note) => `recipe.json › ${note.message}`));
  if (!Array.isArray(meta.sample?.locales) || !Array.isArray(meta.kit)) return report();

  const sources = readRecipeSources(slug);
  if (!sources.script) fails.push("script.js: missing");
  for (const locale of meta.sample.locales) {
    if (sources.content[locale] === undefined) fails.push(`content.${locale}.md: missing (sample.locales lists "${locale}")`);
  }
  for (const key of Object.keys(sources.content)) {
    const locale = key.split(".").pop() as SampleLocale;
    if (!meta.sample.locales.includes(locale)) warns.push(`content.${key}.md: "${locale}" is not in sample.locales, so no edition uses it`);
  }

  // Every edition composes and lints.
  const kit = readKit();
  const composed: Partial<Record<SampleLocale, ComposedPen>> = {};
  for (const variant of meta.sample.locales) {
    try {
      composed[variant] = composePen(sources, meta, variant, { kit });
    } catch (error) {
      if (!(error instanceof ComposeError)) throw error;
      fails.push(`script.js: ${error.message}`);
      continue;
    }
    const result = lintPen(composed[variant], meta, sources, {
      kit,
      repoFileExists: (repoPath) => fs.existsSync(path.join(REPO_DIR, repoPath)),
    });
    fails.push(...result.fails);
    warns.push(...result.warns);
  }
  const assets = lintAssets(slug, meta, sources);
  fails.push(...assets.fails);
  warns.push(...assets.warns);

  // Fonts: one credit per FONTS family.
  const families = fontFamilies(penFonts(sources.script));
  const credited = new Set((meta.credits?.fonts ?? []).map((f) => f.family));
  for (const family of families) if (!credited.has(family)) fails.push(`credits.fonts: add "${family}" (it is in FONTS)`);
  for (const family of credited) if (!families.includes(family)) fails.push(`credits.fonts: "${family}" is not in FONTS`);

  // Write-ups.
  const headings = registry.taxonomy.sections;
  const excerpts: Partial<Record<Locale, string[]>> = {};
  for (const locale of LOCALES) {
    const writeup = readWriteup(slug, locale, headings);
    if (!writeup) {
      fails.push(`${locale}.mdx is missing (${locale === "zh" || locale === "ca" || locale === "ar" || locale === "ja" || locale === "pt" || locale === "fr" || locale === "de" || locale === "it" ? `the ${locale} page shows the English write-up meanwhile` : `the ${locale} page would 404`})`);
      continue;
    }
    fails.push(...writeup.issues);
    const fm = writeup.frontmatter;
    const style = styleMessages(`${locale}.mdx`, [fm.title, fm.summary, fm.plain ?? "", fm.description ?? "", fm.question ?? "", writeup.body].join("\n\n"), locale);
    fails.push(...style.fails);
    warns.push(...style.warns);
    const refs = writeupRefs(writeup.body);
    excerpts[locale] = refs.excerpts;
    const pen = composed[variantFor(meta, locale)];
    for (const region of refs.excerpts) {
      if (pen && !pen.ranges.regions[region]) fails.push(`${locale}.mdx: <Excerpt region="${region}"> names no #region in script.js`);
    }
    for (const id of refs.gotchas) if (!registry.gotchas[id]) fails.push(`${locale}.mdx: <Gotcha id="${id}"> is not in gotchas.json`);
    for (const id of refs.features) if (!registry.features[id]) fails.push(`${locale}.mdx: <Feature id="${id}"> is not in features.json`);
    for (const other of refs.recipes) {
      if (!knownSlugs.includes(other)) fails.push(`${locale}.mdx: <RecipeLink slug="${other}"> names no recipe`);
    }
    for (const link of refs.links) {
      if (!link.startsWith(`/${locale}/`)) fails.push(`${locale}.mdx: ${link} must use the /${locale}/ prefix`);
      else if (link.startsWith(`/${locale}/docs/`) && !docLinkExists(link)) fails.push(`${locale}.mdx: ${link} does not resolve`);
      else if (/^\/(en|es|ca|zh|ja|ar|pt|fr|de|it)\/cookbook\/([a-z0-9-]+)/.test(link)) {
        const target = /^\/(en|es|ca|zh|ja|ar|pt|fr|de|it)\/cookbook\/([a-z0-9-]+)/.exec(link)?.[2] ?? "";
        if (!knownSlugs.includes(target)) fails.push(`${locale}.mdx: ${link} names no recipe`);
      }
    }
    const hero = [meta.capture?.hero].flat();
    for (const page of refs.pages) {
      if (!Number.isInteger(page) || page < 1) fails.push(`${locale}.mdx: page={${page}} is not a page number`);
      else if (Array.isArray(meta.capture?.pages) && !meta.capture.pages.includes(page) && !hero.includes(page)) {
        fails.push(`${locale}.mdx: page ${page} is not among capture.pages`);
      }
    }
  }
  for (const locale of LOCALES) {
    const own = excerpts[locale];
    if (locale === "en" || !excerpts.en || !own || excerpts.en.join() === own.join()) continue;
    fails.push(`en.mdx and ${locale}.mdx must show the same <Excerpt> regions in the same order (${excerpts.en.join(", ")} / ${own.join(", ")})`);
  }
  return report();
}

/** Lints every recipe (or the given ones) plus the rules across recipes. */
export function lintAll(slugs?: string[], { preview = false }: { preview?: boolean } = {}): RecipeLintReport[] {
  const all = listRecipeSlugs();
  const released = readReleasedEngine();
  let registry: Registry | undefined;
  try {
    registry = loadRegistry();
  } catch {
    registry = undefined; // each report says the registry is missing
  }
  const reports = (slugs ?? all).map((slug) => lintRecipe(slug, { registry, knownSlugs: all, released, preview }));
  const metas: { slug: string; meta: RecipeMeta }[] = [];
  for (const slug of all) {
    try {
      metas.push({ slug, meta: readRecipeMeta(slug) });
    } catch {
      // reported by lintRecipe
    }
  }
  for (const error of validateRecipeSet(metas)) {
    const slug = error.slice(0, error.indexOf(":"));
    const target = reports.find((r) => r.slug === slug);
    if (target) target.fails.push(error.slice(slug.length + 2));
  }
  return reports;
}
