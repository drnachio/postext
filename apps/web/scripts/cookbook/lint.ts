/**
 * `pnpm cookbook lint [slug…]`: the static checks, with author-friendly
 * output grouped by recipe. Per recipe: recipe.json (schema, registry ids,
 * cross-field rules), the rules across recipes (Nº, order, former slugs),
 * both write-ups, and the pen lint of every composed edition
 * (lib/cookbook/lint.ts). Once: the registries and recipe.schema.json.
 * Exits 1 on any failure.
 */
import fs from "node:fs";
import { loadRegistry } from "../../src/lib/cookbook/registry.ts";
import type { RecipeMeta, Registry } from "../../src/lib/cookbook/types.ts";
import { LOCALES } from "../../src/lib/cookbook/types.ts";
import { lintRecipe, readReleasedEngine } from "../../src/lib/cookbook/lint.ts";
import { previewDraft, recipeSchemaJson, validateRecipeSet, validateRegistry } from "../../src/lib/cookbook/validate.ts";
import { UsageError, c, loadRecipes, mark, parseArgs, plural } from "./args.ts";
import { SCHEMA_FILE } from "./schema.ts";

export const LINT_USAGE = `pnpm cookbook lint [slug…] [--engine local]

  Static checks of recipe.json, the write-ups and every composed pen,
  grouped by recipe (default: every recipe). Exits 1 on any failure.

  --engine local     The recipes are previewed on the workspace engine: a
                     draft may pin the next release (engine.postext newer
                     than packages/postext/package.json), as it does until
                     that release is out and the recipe is captured`;

// ─── Findings ───────────────────────────────────────────────────────────────

export interface Finding {
  level: "fail" | "warn";
  text: string;
  /** Sample editions the finding applies to (empty: the recipe itself). */
  variants: string[];
}

const fail = (text: string): Finding => ({ level: "fail", text, variants: [] });

/** One pen-lint finding: a string, or an object naming the check and what
 *  is wrong ({ check, detail } like the capture's findings). */
function findingText(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const where = o.check ?? o.path ?? o.rule;
    const what = o.detail ?? o.message;
    if (what !== undefined) return where ? `${String(where)}: ${String(what)}` : String(what);
  }
  return JSON.stringify(item);
}

/** Normalises what the pen lint returns: `{ fails, warns }` for the recipe,
 *  or one per edition (an array of `{ variant, fails, warns }`, or a record
 *  keyed by locale); a bare list counts as failures. */
export function collectFindings(result: unknown, variant?: string): Finding[] {
  const variants = variant ? [variant] : [];
  const items = (list: unknown, level: Finding["level"]): Finding[] =>
    Array.isArray(list) ? list.map((item) => ({ level, text: findingText(item), variants })) : [];
  if (result == null) return [];
  if (Array.isArray(result)) {
    const perVariant = result.length > 0 && result.every((entry) => entry && typeof entry === "object" && "variant" in entry);
    if (!perVariant) return items(result, "fail");
    return result.flatMap((entry) => collectFindings(entry, String((entry as { variant: unknown }).variant)));
  }
  if (typeof result !== "object") return [];
  const o = result as Record<string, unknown>;
  if ("fails" in o || "warns" in o) return [...items(o.fails, "fail"), ...items(o.warns, "warn")];
  const keys = Object.keys(o);
  if (keys.length && keys.every((key) => (LOCALES as readonly string[]).includes(key))) {
    return keys.flatMap((key) => collectFindings(o[key], key));
  }
  return [];
}

/** Merges findings that repeat across editions ("[en, es] …"); failures first. */
function merge(findings: Finding[]): Finding[] {
  const byKey = new Map<string, Finding>();
  for (const finding of findings) {
    const key = `${finding.level}\0${finding.text}`;
    const seen = byKey.get(key);
    if (!seen) byKey.set(key, { ...finding, variants: [...finding.variants] });
    else if (!seen.variants.length || !finding.variants.length) seen.variants = [];
    else for (const v of finding.variants) if (!seen.variants.includes(v)) seen.variants.push(v);
  }
  return [...byKey.values()].sort((a, b) => (a.level === b.level ? 0 : a.level === "fail" ? -1 : 1));
}

// ─── Output ─────────────────────────────────────────────────────────────────

interface Group {
  name: string;
  subtitle: string;
  findings: Finding[];
}

function printGroup(group: Group): void {
  const fails = group.findings.filter((f) => f.level === "fail").length;
  const warns = group.findings.length - fails;
  const counts = [fails ? c.red(plural(fails, "failure")) : "", warns ? c.yellow(plural(warns, "warning")) : ""]
    .filter(Boolean)
    .join(", ");
  const status = fails ? mark.fail() : mark.ok();
  console.log(`${status} ${c.bold(group.name)}  ${c.dim(group.subtitle)}${counts ? `  ${counts}` : ""}`);
  for (const finding of group.findings) {
    const where = finding.variants.length ? c.dim(`[${finding.variants.join(", ")}] `) : "";
    const [first, ...rest] = finding.text.split("\n");
    console.log(`    ${finding.level === "fail" ? mark.fail() : mark.warn()} ${where}${first}`);
    for (const line of rest) console.log(`      ${line}`);
  }
}

// ─── The command ────────────────────────────────────────────────────────────

export async function runLint(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv, { engine: { type: "string", value: "local", choices: ["local"] } }, "lint");
  const preview = args.options.engine === "local";
  const entries = loadRecipes();
  const slugs = entries.map((entry) => entry.slug);
  const unknown = args.positionals.filter((slug) => !slugs.includes(slug));
  if (unknown.length) throw new UsageError(`no recipe ${unknown.map((s) => `"${s}"`).join(", ")} in cookbook/`, "lint");
  const selected = args.positionals.length ? entries.filter((entry) => args.positionals.includes(entry.slug)) : entries;
  const live = entries.filter((entry): entry is { slug: string; meta: RecipeMeta } => entry.meta !== null);

  // Shared files: the registries and the generated schema.
  const shared: Finding[] = [];
  let registry: Registry | null = null;
  try {
    registry = loadRegistry();
    const requireFeatured = live.some(({ meta }) => meta.status === "published");
    shared.push(...validateRegistry(registry, { knownSlugs: slugs, requireFeatured }).map(fail));
  } catch (error) {
    shared.push(fail((error as Error).message));
  }
  const schema = fs.existsSync(SCHEMA_FILE) ? fs.readFileSync(SCHEMA_FILE, "utf-8") : null;
  if (schema !== recipeSchemaJson()) {
    const state = schema === null ? "missing" : "out of date";
    shared.push(fail(`cookbook/recipe.schema.json is ${state}: run pnpm cookbook schema`));
  }

  // Rules across recipes come back as "<slug>: <problem>".
  const across = new Map<string, Finding[]>();
  for (const error of validateRecipeSet(live)) {
    const cut = error.indexOf(": ");
    const slug = error.slice(0, cut);
    across.set(slug, [...(across.get(slug) ?? []), fail(error.slice(cut + 2))]);
  }

  const released = readReleasedEngine();
  const groups: Group[] = [];
  for (const { slug, meta, error } of selected) {
    const findings: Finding[] = [];
    if (!meta) findings.push(fail(error ?? "recipe.json is unreadable"));
    else {
      findings.push(...(across.get(slug) ?? []));
      // recipe.json against the schema and the registries, every composed
      // edition, the assets and both write-ups (lib/cookbook/lint.ts).
      try {
        const report = lintRecipe(slug, { registry: registry ?? undefined, knownSlugs: slugs, released, preview });
        findings.push(...collectFindings(report));
        if (preview && previewDraft(meta, released)) {
          findings.push({
            level: "warn",
            text: `a preview of postext ${meta.engine.postext} (released: ${released.postext}): capture it from npm once that release is out`,
            variants: [],
          });
        }
      } catch (err) {
        findings.push(fail(`lint crashed: ${(err as Error).message}`));
      }
    }
    const subtitle = meta
      ? `Nº ${String(meta.number ?? "?").padStart(3, "0")} · ${meta.chapter ?? "?"} · ${meta.status ?? "?"}`
      : "recipe.json unreadable";
    groups.push({ name: slug, subtitle, findings: merge(findings) });
  }

  // Checks that could not run make the result incomplete, so they fail.
  const skipped: Finding[] = [];
  if (!registry && selected.length) {
    skipped.push(fail("the registries did not load: recipe.json and write-up checks did not run"));
  }

  console.log(`${c.bold("Cookbook lint")} · ${plural(selected.length, "recipe")}\n`);
  if (!entries.length) console.log(c.dim("  No recipes yet: pnpm cookbook new <slug> --chapter <id>\n"));
  for (const group of groups) printGroup(group);
  printGroup({ name: "shared", subtitle: "cookbook/_registry, recipe.schema.json", findings: merge(shared) });
  if (skipped.length) printGroup({ name: "skipped", subtitle: "checks that did not run", findings: skipped });

  const all = [...groups.flatMap((g) => g.findings), ...shared, ...skipped];
  const fails = all.filter((f) => f.level === "fail").length;
  const warns = all.length - fails;
  const failed = groups.filter((g) => g.findings.some((f) => f.level === "fail")).length;
  const parts: string[] = [];
  if (fails) {
    if (failed) parts.push(`${failed} of ${plural(groups.length, "recipe")} failed`);
    if (shared.length) parts.push("shared files failed");
    if (skipped.length) parts.push("some checks did not run");
    parts.push(plural(fails, "failure"));
  } else parts.push(`${plural(groups.length, "recipe")} clean`);
  if (warns) parts.push(c.yellow(plural(warns, "warning")));
  console.log(`\n${fails ? mark.fail() : mark.ok()} ${parts.join(" · ")}`);
  return fails ? 1 : 0;
}
