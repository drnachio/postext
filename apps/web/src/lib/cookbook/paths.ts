/**
 * Where the Cookbook lives on disk. Next (dev, build), vitest and the CLI all
 * run with `apps/web` as the working directory, like `lib/docs.ts` and
 * `lib/codepen/codepen.ts` assume; `POSTEXT_WEB_DIR` overrides it.
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
/** Where the recipe folders are read: cookbook/ itself, or the folder
 *  `COOKBOOK_RECIPES_DIR` names (the composed-page bench's fixture recipe,
 *  #869, which is no published recipe). The kit, the registries and the
 *  template always come from cookbook/. */
export const RECIPES_DIR = process.env.COOKBOOK_RECIPES_DIR
  ? path.resolve(process.env.INIT_CWD ?? process.cwd(), process.env.COOKBOOK_RECIPES_DIR)
  : COOKBOOK_DIR;
/** Generated media: `public/cookbook/<slug>/{capture.json,<variant>/…}`.
 *  Every file name has a dot, so these URLs skip the locale proxy.
 *  `COOKBOOK_CAPTURE_DIR` names another folder: a copy of it, to try a
 *  capture or a `--verify` round without touching the committed files. */
export const PUBLIC_COOKBOOK_DIR = process.env.COOKBOOK_CAPTURE_DIR ?? path.join(/*turbopackIgnore: true*/ WEB_DIR, "public", "cookbook");
/** URL prefix of the generated media. */
export const PUBLIC_COOKBOOK_URL = "/cookbook";

export function recipeDir(slug: string): string {
  return path.join(RECIPES_DIR, slug);
}

export function captureDir(slug: string): string {
  return path.join(PUBLIC_COOKBOOK_DIR, slug);
}
