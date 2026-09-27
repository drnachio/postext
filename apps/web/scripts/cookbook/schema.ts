/**
 * `pnpm cookbook schema [--check]`: writes cookbook/recipe.schema.json from
 * RECIPE_SCHEMA (lib/cookbook/validate.ts), the JSON Schema that recipe.json
 * files name in "$schema" for editor completion. The output is stable: the
 * same schema always gives the same bytes.
 */
import fs from "node:fs";
import path from "node:path";
import { COOKBOOK_DIR, REPO_DIR } from "../../src/lib/cookbook/paths.ts";
import { recipeSchemaJson } from "../../src/lib/cookbook/validate.ts";
import { UsageError, flag, mark, parseArgs, shown } from "./args.ts";

export const SCHEMA_USAGE = `pnpm cookbook schema [--check]

  Regenerates cookbook/recipe.schema.json from RECIPE_SCHEMA.

  --check            Write nothing; exit 1 when the file is out of date`;

export const SCHEMA_FILE = path.join(COOKBOOK_DIR, "recipe.schema.json");

export async function runSchema(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv, { check: { type: "boolean" } }, "schema");
  if (args.positionals.length) {
    throw new UsageError(`schema takes no arguments (got "${args.positionals[0]}")`, "schema");
  }
  const text = recipeSchemaJson();
  const rel = shown(SCHEMA_FILE, REPO_DIR);
  const current = fs.existsSync(SCHEMA_FILE) ? fs.readFileSync(SCHEMA_FILE, "utf-8") : null;
  if (current === text) {
    console.log(`${mark.ok()} ${rel} is up to date`);
    return 0;
  }
  if (flag(args, "check")) {
    console.log(`${mark.fail()} ${rel} is ${current === null ? "missing" : "out of date"}: run pnpm cookbook schema`);
    return 1;
  }
  fs.writeFileSync(SCHEMA_FILE, text);
  console.log(`${mark.ok()} ${current === null ? "Wrote" : "Updated"} ${rel}`);
  return 0;
}
