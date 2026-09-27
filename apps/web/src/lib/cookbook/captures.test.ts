import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sourceHash } from "./hash.ts";
import { readReleasedEngine } from "./lint.ts";
import { captureDir } from "./paths.ts";
import { getCapture, getVisibleRecipes } from "./recipes.ts";
import type { Recipe } from "./types.ts";
import { compareSemVer } from "./validate.ts";

/** Variant weight without the PDF and the .postext: warning at 0.9 MB, failure at 1.4 MB (spec §8.3). */
const VARIANT_BUDGET = 1.4 * 1024 * 1024;
const PDF_BUDGET = 2 * 1024 * 1024;
const MAX_PAGES = 12;

const recipes = getVisibleRecipes();
const capture = (slug: string) => `run \`pnpm cookbook capture ${slug}\``;

/** Runs `check` on every visible recipe that has a capture and collects its problems. */
function each(check: (recipe: Recipe, problems: string[]) => void): string[] {
  const problems: string[] = [];
  for (const recipe of recipes) if (getCapture(recipe.slug)) check(recipe, problems);
  return problems;
}

describe("captures (public/cookbook/<slug>/capture.json)", () => {
  it("exist for every visible recipe and sample language", () => {
    const problems: string[] = [];
    for (const { slug, meta } of recipes) {
      const manifest = getCapture(slug);
      if (!manifest) {
        problems.push(`${slug}: no capture.json: ${capture(slug)}`);
        continue;
      }
      if (manifest.slug !== slug) problems.push(`${slug}: capture.json belongs to ${manifest.slug}`);
      for (const locale of meta.sample.locales) {
        if (!manifest.variants[locale]) problems.push(`${slug}: no "${locale}" edition in capture.json: ${capture(slug)}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("match the working tree (sourceHash)", () => {
    const problems = each(({ slug, meta }, out) => {
      if (getCapture(slug)!.sourceHash !== sourceHash(slug, meta)) {
        out.push(`${slug}: the recipe changed since its capture: ${capture(slug)}`);
      }
    });
    expect(problems).toEqual([]);
  });

  it("reference files that exist, within budget", () => {
    const problems = each(({ slug, meta }, out) => {
      const manifest = getCapture(slug)!;
      for (const [locale, variant] of Object.entries(manifest.variants)) {
        if (!variant) continue;
        const dir = path.join(captureDir(slug), locale);
        const files = [
          ...variant.pages.flatMap((page) => [page.file, page.strip]),
          variant.card.file,
          variant.card.file480,
          variant.og.file,
          ...(variant.pdf ? [variant.pdf.file] : []),
          ...(variant.sandbox ? [variant.sandbox.file] : []),
        ];
        let bytes = 0;
        for (const file of files) {
          const full = path.join(dir, file);
          if (!fs.existsSync(full)) out.push(`${slug}: ${locale}/${file} is missing: ${capture(slug)}`);
          else if (file !== variant.pdf?.file && file !== variant.sandbox?.file) bytes += fs.statSync(full).size;
        }
        if (bytes > VARIANT_BUDGET) out.push(`${slug}: the ${locale} images weigh ${Math.round(bytes / 1024)} KB (at most 1.4 MB)`);
        if (variant.pdf && variant.pdf.bytes > PDF_BUDGET) out.push(`${slug}: the ${locale} PDF weighs over 2 MB`);
        if (meta.downloads?.pdf && !variant.pdf) out.push(`${slug}: downloads.pdf is set but the ${locale} capture has no PDF`);
        if (variant.pages.length > MAX_PAGES) out.push(`${slug}: ${variant.pages.length} pages published (at most ${MAX_PAGES})`);
        if (variant.card.mode !== meta.capture.card) out.push(`${slug}: the ${locale} card is "${variant.card.mode}", recipe.json asks for "${meta.capture.card}"`);
        for (const n of [meta.capture.hero].flat()) {
          if (!variant.pages.some((page) => page.n === n)) out.push(`${slug}: hero page ${n} is not among the ${locale} pages`);
        }
      }
    });
    expect(problems).toEqual([]);
  });

  it("were made with a released engine the recipe accepts", () => {
    const released = readReleasedEngine();
    const problems = each(({ slug, meta }, out) => {
      const { engine } = getCapture(slug)!;
      if (meta.status === "published" && engine.source !== "npm") {
        out.push(`${slug}: captured with a local engine; published recipes are captured from npm: ${capture(slug)}`);
      }
      if (compareSemVer(engine.postext, meta.engine.postext) < 0) {
        out.push(`${slug}: captured with postext ${engine.postext}, but the recipe needs ≥ ${meta.engine.postext}: ${capture(slug)}`);
      }
      if (released.postext && compareSemVer(meta.engine.postext, released.postext) > 0) {
        out.push(`${slug}: needs postext ${meta.engine.postext}, newer than the released ${released.postext}`);
      }
      if (meta.engine.postextPdf && released.postextPdf && compareSemVer(meta.engine.postextPdf, released.postextPdf) > 0) {
        out.push(`${slug}: needs postext-pdf ${meta.engine.postextPdf}, newer than the released ${released.postextPdf}`);
      }
    });
    expect(problems).toEqual([]);
  });
});
