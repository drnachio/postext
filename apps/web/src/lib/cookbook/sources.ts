/**
 * Reads recipe folders and the kit from disk. Isomorphic Node (site server,
 * tests, CLI): relative `.ts` imports only.
 */
import fs from "node:fs";
import path from "node:path";
import { COOKBOOK_DIR, KIT_DIR, recipeDir } from "./paths.ts";
import { penJson } from "./compose.ts";
import type { KitBlock, RecipeMeta, RecipeSources } from "./types.ts";
import { KIT_ORDER, SLUG_PATTERN } from "./types.ts";

function readOptional(file: string): string {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
}

/** Every folder under cookbook/ that holds a recipe.json (folders starting
 *  with `_` or `.` are tooling), sorted by name. */
export function listRecipeSlugs(): string[] {
  if (!fs.existsSync(COOKBOOK_DIR)) return [];
  return fs
    .readdirSync(COOKBOOK_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !/^[_.]/.test(entry.name))
    .filter((entry) => fs.existsSync(path.join(COOKBOOK_DIR, entry.name, "recipe.json")))
    .map((entry) => entry.name)
    .sort();
}

/** The parsed recipe.json (unvalidated: see validate.ts). */
export function readRecipeMeta(slug: string): RecipeMeta {
  if (!SLUG_PATTERN.test(slug)) throw new Error(`Cookbook: invalid slug "${slug}"`);
  const file = path.join(recipeDir(slug), "recipe.json");
  return JSON.parse(fs.readFileSync(file, "utf-8")) as RecipeMeta;
}

function listFiles(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, base);
    return entry.name.startsWith(".") ? [] : [path.relative(base, full).split(path.sep).join("/")];
  });
}

/** The raw files of a recipe folder. */
export function readRecipeSources(slug: string): RecipeSources {
  if (!SLUG_PATTERN.test(slug)) throw new Error(`Cookbook: invalid slug "${slug}"`);
  const dir = recipeDir(slug);
  const content: Record<string, string> = {};
  for (const name of fs.readdirSync(dir)) {
    const match = /^content\.(?:([a-z0-9-]+)\.)?(en|es|ca|zh|ar|ja|pt)\.md$/.exec(name);
    if (!match) continue;
    content[match[1] ? `${match[1]}.${match[2]}` : match[2]] = fs.readFileSync(path.join(dir, name), "utf-8");
  }
  const pen = readOptional(path.join(dir, "pen.json"));
  return {
    slug,
    script: readOptional(path.join(dir, "script.js")),
    html: readOptional(path.join(dir, "index.html")),
    css: readOptional(path.join(dir, "style.css")),
    pen: penJson(pen ? JSON.parse(pen) : {}),
    content,
    assets: listFiles(path.join(dir, "assets")).map((file) => `assets/${file}`),
  };
}

let kitCache: Partial<Record<KitBlock, string>> | null = null;

/** The kit blocks (cookbook/_kit/<block>.js). Cached per process. */
export function readKit(): Partial<Record<KitBlock, string>> {
  if (kitCache) return kitCache;
  const kit: Partial<Record<KitBlock, string>> = {};
  for (const block of KIT_ORDER) {
    const file = path.join(KIT_DIR, `${block}.js`);
    if (fs.existsSync(file)) kit[block] = fs.readFileSync(file, "utf-8");
  }
  kitCache = kit;
  return kit;
}

/** Drops the cached kit (the CLI's dev server watches the files). */
export function resetKitCache(): void {
  kitCache = null;
}
