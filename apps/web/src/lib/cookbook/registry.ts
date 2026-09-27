/**
 * The bilingual registries in cookbook/_registry/*.json: taxonomy, features,
 * APIs, config keys, questions, gaps, warnings, gotchas and collections.
 * Read once per process. Isomorphic Node.
 */
import fs from "node:fs";
import path from "node:path";
import { REGISTRY_DIR } from "./paths.ts";
import type { Registry } from "./types.ts";

export const REGISTRY_FILES = [
  "taxonomy", "features", "apis", "config", "questions", "gaps", "warnings", "gotchas", "collections",
] as const satisfies readonly (keyof Registry)[];

let cache: Registry | null = null;

function readJson(name: string): unknown {
  const file = path.join(REGISTRY_DIR, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Cookbook registry missing: cookbook/_registry/${name}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
  // A "$schema" or "$comment" key documents the file; it is not an entry.
  for (const key of Object.keys(data)) if (key.startsWith("$")) delete data[key];
  return data;
}

/** All registries, typed (validated by validate.ts / registry.test.ts). */
export function loadRegistry(): Registry {
  if (cache) return cache;
  const registry = {} as Record<string, unknown>;
  for (const name of REGISTRY_FILES) registry[name] = readJson(name);
  cache = registry as unknown as Registry;
  return cache;
}

/** Drops the cached registries (the CLI's dev server watches the files). */
export function resetRegistryCache(): void {
  cache = null;
}
