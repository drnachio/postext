/**
 * `pnpm cookbook new <slug> --chapter <id> [--from <slug>]`: scaffolds a
 * draft recipe from cookbook/_template (or from an existing recipe), with the
 * next permanent Nº, the last place in its chapter and today's dates.
 */
import fs from "node:fs";
import path from "node:path";
import { COOKBOOK_DIR, REPO_DIR, TEMPLATE_DIR, recipeDir } from "../../src/lib/cookbook/paths.ts";
import type { ChapterId, RecipeMeta } from "../../src/lib/cookbook/types.ts";
import { CHAPTER_IDS, SLUG_PATTERN } from "../../src/lib/cookbook/types.ts";
import { validateSlug } from "../../src/lib/cookbook/validate.ts";
import { UsageError, c, loadRecipes, mark, parseArgs, shown, str, today } from "./args.ts";
import { loadRoadmap } from "./coverage.ts";

export const NEW_USAGE = `pnpm cookbook new <slug> --chapter <id> [--from <slug>]

  Scaffolds cookbook/<slug>/ as a draft, created/updated set to today. A
  planned slug (cookbook/_roadmap.json) keeps its catalogue Nº and order;
  any other takes the next Nº (never reused) and the chapter's last place.

  <slug>             English kebab-case outcome phrase, 3–48 characters
  --chapter <id>     ${CHAPTER_IDS.join(" | ")}
                     (default: the design catalogue's chapter for a planned
                     slug, else the chapter of the --from recipe)
  --from <slug>      Start from an existing recipe instead of cookbook/_template`;

/** recipe.json keys in the order of the RecipeMeta interface; unknown keys
 *  keep their place after these. */
const KEY_ORDER = [
  "$schema", "schemaVersion", "number", "status", "replacedBy", "formerSlugs", "chapter", "order", "level",
  "genres", "outputs", "features", "answers", "gaps", "gotchas", "explainsWarnings", "related", "workarounds",
  "engine", "kit", "sample", "capture", "downloads", "credits", "license", "created", "updated",
];

/** Why a new slug cannot be used: its form (pattern, length, reserved
 *  words), or a name already in use (folders and former slugs). */
export function newSlugProblems(slug: string, taken: ReadonlySet<string>): string[] {
  const problems = validateSlug(slug);
  if (taken.has(slug)) problems.push(`slug "${slug}" is already taken (a recipe folder or a former slug)`);
  return problems;
}

/** Serialises JSON with 2-space indentation, keeping arrays and small
 *  objects on one line when they fit (the style of the spec's examples). */
export function formatJson(value: unknown, width = 100): string {
  const inline = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
    if (v && typeof v === "object") {
      const body = Object.entries(v).map(([key, item]) => `${JSON.stringify(key)}: ${inline(item)}`).join(", ");
      return body ? `{ ${body} }` : "{}";
    }
    return JSON.stringify(v);
  };
  const block = (v: unknown, indent: string, prefixLength: number): string => {
    const flat = inline(v);
    if (indent.length + prefixLength + flat.length <= width || !v || typeof v !== "object") return flat;
    const inner = `${indent}  `;
    if (Array.isArray(v)) {
      if (!v.length) return "[]";
      return `[\n${v.map((item) => inner + block(item, inner, 0)).join(",\n")}\n${indent}]`;
    }
    const entries = Object.entries(v);
    if (!entries.length) return "{}";
    const lines = entries.map(([key, item]) => {
      const prefix = `${JSON.stringify(key)}: `;
      return inner + prefix + block(item, inner, prefix.length);
    });
    return `{\n${lines.join(",\n")}\n${indent}}`;
  };
  // The top level is always expanded, one key per line.
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const lines = Object.entries(value).map(([key, item]) => {
      const prefix = `${JSON.stringify(key)}: `;
      return `  ${prefix}${block(item, "  ", prefix.length)}`;
    });
    return `{\n${lines.join(",\n")}\n}\n`;
  }
  return `${block(value, "", 0)}\n`;
}

function ordered(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of KEY_ORDER) if (key in meta) out[key] = meta[key];
  for (const key of Object.keys(meta)) if (!(key in out)) out[key] = meta[key];
  return out;
}

/** Points the pen at its new slug and Nº: the `RECIPE` constant, the
 *  banner's Nº and every postext.dev / repository URL naming the old slug. */
export function retargetScript(script: string, slug: string, number: number): { script: string; notes: string[] } {
  const notes: string[] = [];
  const recipeConst = /^(\s*const RECIPE = )(['"])([^'"]*)\2;/m;
  const match = recipeConst.exec(script);
  const oldSlug = match?.[3];
  let out = script;
  if (match) out = out.replace(recipeConst, `$1$2${slug}$2;`);
  else notes.push("script.js has no `const RECIPE = '<slug>';` line: add one below `const LANG`");
  // The banner: "// ═══ Postext Cookbook · Nº 009 · Title ═══".
  const banner = /^(\/\/.*Postext Cookbook\s*·\s*Nº\s*)[^\s·]+/m;
  if (banner.test(out)) out = out.replace(banner, `$1${String(number).padStart(3, "0")}`);
  else notes.push("script.js has no `// ═══ Postext Cookbook · Nº …` banner line");
  // The page URL in the banner, whatever placeholder the template uses.
  out = out.replace(/(postext\.dev\/(?:en|es)\/cookbook\/)[^\s'"`)]+/g, `$1${slug}`);
  // Repository paths that still name the source recipe.
  if (oldSlug && oldSlug !== slug && SLUG_PATTERN.test(oldSlug)) {
    out = out.split(`cookbook/${oldSlug}/`).join(`cookbook/${slug}/`);
  }
  return { script: out, notes };
}

export async function runNew(argv: readonly string[]): Promise<number> {
  const args = parseArgs(
    argv,
    {
      chapter: { type: "string", value: "id", choices: CHAPTER_IDS },
      from: { type: "string", value: "slug" },
    },
    "new",
  );
  const [slug, ...extra] = args.positionals;
  if (!slug) throw new UsageError("name the new recipe: pnpm cookbook new <slug> --chapter <id>", "new");
  if (extra.length) throw new UsageError(`one recipe at a time (unexpected "${extra[0]}")`, "new");

  const recipes = loadRecipes();
  const taken = new Set<string>();
  if (fs.existsSync(COOKBOOK_DIR)) for (const name of fs.readdirSync(COOKBOOK_DIR)) taken.add(name);
  for (const { meta } of recipes) for (const former of meta?.formerSlugs ?? []) taken.add(former);
  const problems = newSlugProblems(slug, taken);
  if (problems.length) throw new UsageError(problems.join("; "), "new");

  const from = str(args, "from");
  const source = from ? recipes.find((recipe) => recipe.slug === from) : undefined;
  if (from && !source) throw new UsageError(`--from ${from}: no recipe folder cookbook/${from}/`, "new");

  // Without --chapter: the design catalogue's chapter for a planned slug,
  // else the chapter of the recipe it starts from.
  let chapter = str(args, "chapter") as ChapterId | undefined;
  let planned: { number: number; chapter: string; order?: number; title: string } | null = null;
  let reserved: number[] = [];
  try {
    const roadmap = loadRoadmap();
    const entry = roadmap?.recipes.find((recipe) => recipe.slug === slug);
    reserved = (roadmap?.recipes ?? []).map((recipe) => recipe.number).filter(Number.isInteger);
    if (entry) {
      planned = { number: entry.number, chapter: entry.chapter, order: entry.order, title: entry.title?.en ?? slug };
      if (!chapter && (CHAPTER_IDS as readonly string[]).includes(entry.chapter)) chapter = entry.chapter as ChapterId;
    }
  } catch {
    // An unreadable catalogue only loses the planned chapter, Nº and order.
  }
  if (!chapter && source?.meta && CHAPTER_IDS.includes(source.meta.chapter)) chapter = source.meta.chapter;
  if (!chapter) throw new UsageError(`choose a chapter: --chapter ${CHAPTER_IDS.join("|")}`, "new");

  const sourceDir = source ? recipeDir(source.slug) : TEMPLATE_DIR;
  if (!source && !fs.existsSync(path.join(TEMPLATE_DIR, "recipe.json"))) {
    console.error(
      `${mark.fail()} ${shown(TEMPLATE_DIR, REPO_DIR)}/ is missing (or has no recipe.json): nothing to copy.\n` +
        `  Start from an existing recipe instead: pnpm cookbook new ${slug} --chapter ${chapter} --from <slug>`,
    );
    return 1;
  }

  // Unreadable recipe.json files still hold their Nº: refuse to guess.
  const unreadable = recipes.filter((recipe) => !recipe.meta);
  if (unreadable.length) {
    console.error(
      `${mark.fail()} cannot assign a Nº while these recipe.json files do not parse: ` +
        `${unreadable.map((recipe) => recipe.slug).join(", ")}\n  Run pnpm cookbook lint to see why.`,
    );
    return 1;
  }
  const metas = recipes.map((recipe) => recipe.meta as RecipeMeta);
  // A planned recipe keeps its catalogue Nº (recipes are written in any
  // order); any other takes the next Nº after every recipe and every plan.
  const numbers = new Set(metas.map((meta) => meta.number));
  const number =
    planned && !numbers.has(planned.number)
      ? planned.number
      : Math.max(0, ...reserved, ...metas.map((meta) => (Number.isInteger(meta.number) ? meta.number : 0))) + 1;
  const inChapter = metas.filter((meta) => meta.chapter === chapter).map((meta) => meta.order || 0);
  const lastOrder = Math.max(0, ...inChapter);
  const order =
    planned?.order && planned.chapter === chapter && !inChapter.includes(planned.order)
      ? planned.order
      : Math.floor(lastOrder / 10) * 10 + 10;
  const date = today();

  // Build in a hidden folder (listRecipeSlugs skips dot folders), then rename.
  const target = recipeDir(slug);
  const staging = path.join(COOKBOOK_DIR, `.new-${slug}`);
  fs.rmSync(staging, { recursive: true, force: true });
  const notes: string[] = [];
  try {
    fs.cpSync(sourceDir, staging, {
      recursive: true,
      filter: (file) => file === sourceDir || !path.basename(file).startsWith("."),
    });

    const metaFile = path.join(staging, "recipe.json");
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf-8")) as Record<string, unknown>;
    delete meta.replacedBy;
    delete meta.formerSlugs;
    Object.assign(meta, {
      $schema: "../recipe.schema.json",
      number,
      status: "draft",
      chapter,
      order,
      created: date,
      updated: date,
    });
    fs.writeFileSync(metaFile, formatJson(ordered(meta)));

    const scriptFile = path.join(staging, "script.js");
    if (fs.existsSync(scriptFile)) {
      const result = retargetScript(fs.readFileSync(scriptFile, "utf-8"), slug, number);
      fs.writeFileSync(scriptFile, result.script);
      notes.push(...result.notes);
    } else {
      notes.push("no script.js was copied: the recipe needs one");
    }
    fs.renameSync(staging, target);
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }

  const files = fs
    .readdirSync(target, { withFileTypes: true })
    .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
    .sort();
  const rel = shown(target, REPO_DIR);
  const numberLabel = `Nº ${String(number).padStart(3, "0")}`;
  console.log(`${mark.ok()} Created ${c.bold(`${rel}/`)} · ${numberLabel} · chapter ${chapter} · order ${order} · draft`);
  console.log(c.dim(`    ${from ? `from ${from}: ` : ""}${files.join("  ")}`));
  if (planned) {
    const catalogueNote = planned.number === number ? "" : ` (Nº ${planned.number} in the catalogue)`;
    console.log(c.dim(`    planned recipe: ${planned.title}${catalogueNote}`));
  }
  for (const note of notes) console.log(`  ${mark.warn()} ${note}`);
  console.log(`
  Next:
    1. Design and content: ${rel}/script.js, content.*.md; the write-up in en.mdx and es.mdx
    2. ${c.cyan(`pnpm cookbook dev ${slug}`)}        live preview while you edit
    3. ${c.cyan(`pnpm cookbook lint ${slug}`)}       static checks
    4. ${c.cyan(`pnpm cookbook capture ${slug}`)}    pages, card and verification`);
  return 0;
}
