import fs from "fs";
import path from "path";
import { openBundleZip } from "postext/bundle";

/** The Sandbox's first example, the Postext guide, as one `.postext` file.
 *  Built by `docs/examples/open-guide/build-guide.mjs`; the site serves it
 *  and the "open a .postext" pen loads it through jsDelivr. */
export const GUIDE_BUNDLE_PATH = "/bundles/postext-guide.postext";
export const GUIDE_BUNDLE_FILE = "postext-guide.postext";

export interface GuideBundleStats {
  /** Size of the file, in KB. */
  kb: number;
  /** Chapters per language (the guide has the same number in each). */
  chapters: number;
  languages: number;
  fontFiles: number;
  families: string[];
  resources: number;
  imageFiles: number;
}

let cached: GuideBundleStats | null = null;

/** What the guide's `.postext` holds, read from the file itself so the home
 *  page never overstates it. */
export function guideBundleStats(): GuideBundleStats {
  if (cached) return cached;
  const bytes = fs.readFileSync(path.join(process.cwd(), "public", GUIDE_BUNDLE_PATH));
  const { manifest, files } = openBundleZip(new Uint8Array(bytes));
  const m = manifest as {
    chapters: unknown[] | Record<string, unknown[]>;
    fonts?: { name: string; variants: unknown[] }[];
    resources?: unknown[];
  };
  const byLocale = Array.isArray(m.chapters) ? { default: m.chapters } : m.chapters;
  const paths = [...files.keys()];
  cached = {
    kb: Math.round(bytes.length / 1024),
    chapters: Math.max(...Object.values(byLocale).map((c) => c.length)),
    languages: Object.keys(byLocale).length,
    fontFiles: (m.fonts ?? []).reduce((n, f) => n + f.variants.length, 0),
    families: (m.fonts ?? []).map((f) => f.name),
    resources: (m.resources ?? []).length,
    imageFiles: paths.filter((p) => p.startsWith("resources/")).length,
  };
  return cached;
}
