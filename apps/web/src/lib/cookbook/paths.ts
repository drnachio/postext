/**
 * Where the Cookbook lives on disk. Next (dev, build), vitest and the CLI all
 * run with `apps/web` as the working directory, like `lib/docs.ts` and
 * `lib/codepen.ts` assume; `POSTEXT_WEB_DIR` overrides it.
 *
 * Isomorphic: plain Node imports, relative `.ts` imports only.
 */
import path from "node:path";

export const WEB_DIR = process.env.POSTEXT_WEB_DIR ?? process.cwd();
export const REPO_DIR = path.resolve(WEB_DIR, "../..");
export const COOKBOOK_DIR = path.join(REPO_DIR, "cookbook");
export const REGISTRY_DIR = path.join(COOKBOOK_DIR, "_registry");
export const KIT_DIR = path.join(COOKBOOK_DIR, "_kit");
export const TEMPLATE_DIR = path.join(COOKBOOK_DIR, "_template");
export const DOCS_DIR = path.join(REPO_DIR, "docs");
/** Generated media: `public/cookbook/<slug>/{capture.json,<variant>/…}`.
 *  Every file name has a dot, so these URLs skip the locale proxy. */
export const PUBLIC_COOKBOOK_DIR = path.join(WEB_DIR, "public", "cookbook");
/** URL prefix of the generated media. */
export const PUBLIC_COOKBOOK_URL = "/cookbook";

export function recipeDir(slug: string): string {
  return path.join(COOKBOOK_DIR, slug);
}

export function captureDir(slug: string): string {
  return path.join(PUBLIC_COOKBOOK_DIR, slug);
}
