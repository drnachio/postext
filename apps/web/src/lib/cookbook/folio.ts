/**
 * recipe.json `folio` → the `config.folio` the `.postext` bundle carries.
 * recipe.json writes colours as `#rrggbb`; the config takes ColorValues.
 * Isomorphic Node.
 */
import crypto from "node:crypto";
import type { RecipeFolio } from "./types.ts";

const COLOR_KEYS = new Set(["shade", "coverColor", "color"]);

/** The folio as `PostextConfig.folio`; undefined when the recipe sets none. */
export function folioConfigOf(folio: RecipeFolio | undefined): Record<string, unknown> | undefined {
  if (!folio) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(folio)) {
    if (value && typeof value === "object") {
      out[key] = Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, COLOR_KEYS.has(k) && typeof v === "string" ? { hex: v.toLowerCase(), model: "hex" } : v]),
      );
    } else out[key] = value;
  }
  return out;
}

/** A short hash of the folio, recorded in capture.json's `sandbox` entry
 *  so a bundle written before a folio change reads as stale. */
export function folioHash(folio: RecipeFolio | undefined): string | undefined {
  if (!folio) return undefined;
  const stable = (v: unknown): string =>
    Array.isArray(v) ? `[${v.map(stable).join(",")}]`
    : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`
    : JSON.stringify(v);
  return crypto.createHash("sha256").update(stable(folio)).digest("hex").slice(0, 8);
}
