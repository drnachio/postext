/**
 * The source hash that ties a capture to the files it was made from. The
 * `captures` test recomputes it from the working tree and fails with
 * "run `pnpm cookbook capture <slug>`" when a recipe changed after its
 * capture. Isomorphic Node.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { COMPOSE_VERSION } from "./compose.ts";
import { recipeDir } from "./paths.ts";
import { readKit, readRecipeSources } from "./sources.ts";
import type { RecipeMeta } from "./types.ts";
import { KIT_ORDER } from "./types.ts";

/** recipe.json keys that change what the capture produces. */
const CAPTURE_KEYS = ["capture", "engine", "sample", "kit", "downloads"] as const;

function normalize(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** Deterministic JSON (sorted keys). */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(obj[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** sha256 over the normalised pen sources, the content files, the assets
 *  (path + bytes), the kit blocks the recipe uses, the capture-relevant
 *  recipe.json keys and COMPOSE_VERSION. */
export function sourceHash(slug: string, meta: RecipeMeta): string {
  const sources = readRecipeSources(slug);
  const kit = readKit();
  const hash = crypto.createHash("sha256");
  const add = (label: string, data: string | Buffer) => {
    hash.update(label);
    hash.update("\0");
    hash.update(data);
    hash.update("\0");
  };
  add("compose", String(COMPOSE_VERSION));
  add("script.js", normalize(sources.script));
  add("index.html", normalize(sources.html));
  add("style.css", normalize(sources.css));
  add("pen.json", stable(sources.pen));
  for (const key of Object.keys(sources.content).sort()) add(`content:${key}`, normalize(sources.content[key]));
  for (const file of [...sources.assets].sort()) add(file, fs.readFileSync(path.join(recipeDir(slug), file)));
  for (const block of KIT_ORDER) {
    if (meta.kit.includes(block)) add(`kit:${block}`, normalize(kit[block] ?? ""));
  }
  const picked: Record<string, unknown> = {};
  for (const key of CAPTURE_KEYS) picked[key] = meta[key];
  add("recipe.json", stable(picked));
  return hash.digest("hex");
}

/** A short content hash for `?v=` cache-busting. */
export function hash8(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 8);
}
