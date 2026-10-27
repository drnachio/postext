// Resolving a bundle plan's files to bytes from the caller's sources.
import type { BundleManifestV2, BundleLocaleOverrides } from '../types.js';
import type { BundlePlan } from './plan.js';

export interface BundleByteSources {
  readBlob: (fileId: string) => Promise<ArrayBuffer | Uint8Array | null | undefined>;
  readFont: (fileId: string) => Promise<ArrayBuffer | Uint8Array | null | undefined>;
}

export interface ResolvedBundleFiles {
  /** Path → bytes, ready to zip (`preset.json` and chapters included). */
  files: Record<string, Uint8Array>;
  manifest: BundleManifestV2;
  warnings: string[];
  /** Planned paths whose bytes could not be read (and were dropped). */
  missing: string[];
}

function toBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/** Resolve a plan's bytes. A resource whose payload is gone is dropped from
 *  the manifest (a spec without a file would come back as a broken
 *  figure); a font variant whose file is gone is dropped likewise, and its
 *  family with it when nothing remains. */
export async function resolveBundleFiles(plan: BundlePlan, sources: BundleByteSources): Promise<ResolvedBundleFiles> {
  const warnings = [...plan.warnings];
  const files: Record<string, Uint8Array> = {};
  const missingPaths = new Set<string>();

  await Promise.all(
    plan.files.map(async (f) => {
      const bytes = f.kind === 'blob'
        ? await Promise.resolve(sources.readBlob(f.fileId)).catch(() => null)
        : await Promise.resolve(sources.readFont(f.fileId)).catch(() => null);
      if (!bytes) {
        missingPaths.add(f.path);
        warnings.push(f.locale ? `${f.owner}: missing ${f.locale} file, the shared one is used` : `${f.owner}: missing file, skipped`);
        return;
      }
      files[f.path] = toBytes(bytes);
    }),
  );

  let manifest = plan.manifest;
  if (manifest.thumbnail && missingPaths.has(manifest.thumbnail)) {
    manifest = { ...manifest };
    delete manifest.thumbnail;
  }
  if (missingPaths.size > 0) {
    const resources = manifest.resources
      // A video keeps its address and player without its file or poster.
      ?.filter((r) => r.kind === 'video' || !r.file || !missingPaths.has(r.file))
      .map((r) => {
        if (r.kind === 'video') {
          const spec = { ...r };
          if (spec.file && missingPaths.has(spec.file)) delete spec.file;
          if (spec.poster && missingPaths.has(spec.poster)) {
            delete spec.poster;
            delete spec.width;
            delete spec.height;
          }
          return spec;
        }
        return r.pdfFile && missingPaths.has(r.pdfFile) ? { ...r, pdfFile: undefined } : r;
      });
    const fonts = manifest.fonts
      ?.map((fam) => ({ ...fam, variants: fam.variants.filter((v) => !missingPaths.has(v.file)) }))
      .filter((fam) => fam.variants.length > 0);
    manifest = {
      ...manifest,
      ...(resources && resources.length > 0 ? { resources } : {}),
      ...(fonts && fonts.length > 0 ? { fonts } : {}),
    };
    if (!resources || resources.length === 0) delete manifest.resources;
    if (!fonts || fonts.length === 0) delete manifest.fonts;
    // A locale whose own artwork is missing reads the shared picture.
    if (manifest.localized) {
      const localized: Record<string, BundleLocaleOverrides> = {};
      for (const [locale, overrides] of Object.entries(manifest.localized)) {
        const wording = overrides.resources
          ?.map((r) => {
            const spec = { ...r };
            if (spec.file && missingPaths.has(spec.file)) {
              delete spec.file;
              delete spec.width;
              delete spec.height;
              delete spec.pdfFile;
            }
            if (spec.pdfFile && missingPaths.has(spec.pdfFile)) delete spec.pdfFile;
            return spec;
          })
          .filter((r) => Object.keys(r).length > 1);
        const next: BundleLocaleOverrides = { ...overrides };
        if (wording && wording.length > 0) next.resources = wording;
        else delete next.resources;
        localized[locale] = next;
      }
      manifest = { ...manifest, localized };
    }
  }

  const enc = new TextEncoder();
  files['preset.json'] = enc.encode(JSON.stringify(manifest, null, 2));
  for (const c of plan.chapterFiles) files[c.path] = enc.encode(c.markdown);
  return { files, manifest, warnings, missing: [...missingPaths] };
}
