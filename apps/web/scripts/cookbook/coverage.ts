/**
 * `pnpm cookbook coverage [--json] [--catalog <file>]`: the contributors'
 * roadmap. Lists the registry's questions no recipe answers, features no
 * recipe uses, warnings no recipe explains and gaps without a workaround
 * recipe (drafts count: they are on their way), the recipes per chapter, and
 * the planned recipes of the design catalogue that have no folder yet.
 *
 * Informational: exits 0 unless the registry cannot be read.
 */
import fs from "node:fs";
import path from "node:path";
import { COOKBOOK_DIR, REPO_DIR } from "../../src/lib/cookbook/paths.ts";
import { loadRegistry } from "../../src/lib/cookbook/registry.ts";
import type { Localized, RecipeMeta, Registry } from "../../src/lib/cookbook/types.ts";
import { CHAPTER_IDS } from "../../src/lib/cookbook/types.ts";
import { UsageError, c, flag, loadRecipes, parseArgs, plural, shown, str, userPath } from "./args.ts";

export const COVERAGE_USAGE = `pnpm cookbook coverage [--json] [--catalog <file>]

  Questions, features, warnings and gaps that no recipe covers yet, recipes
  per chapter, and the planned recipes that have no folder yet.

  --json             Print the report as JSON
  --catalog <file>   The design catalogue of planned recipes
                     (default: $COOKBOOK_CATALOG, else cookbook/_roadmap.json)`;

// ─── The design catalogue (planned recipes) ─────────────────────────────────

/** The fields of a planned recipe the report reads (the catalogue holds
 *  far more: briefs, visuals, harness needs). Its feature ids are research
 *  ids ("LY-6"), mapped to registry features through `Feature.research`. */
export interface PlannedRecipe {
  slug: string;
  number: number;
  wave?: number;
  chapter: string;
  order?: number;
  level?: number;
  title: Localized;
  features?: { primary?: string[]; also?: string[] };
  answers?: string[];
  gaps?: string[];
  explainsWarnings?: string[];
}

export interface Roadmap {
  file: string;
  version?: string;
  chapters: { id: string; number: number; title: Localized }[];
  recipes: PlannedRecipe[];
}

export const DEFAULT_ROADMAP_FILE = path.join(COOKBOOK_DIR, "_roadmap.json");

/** The design catalogue: `file`, else $COOKBOOK_CATALOG, else
 *  cookbook/_roadmap.json. Null when none exists; throws when an explicit
 *  file is missing or malformed. */
export function loadRoadmap(file?: string): Roadmap | null {
  const explicit = file ?? process.env.COOKBOOK_CATALOG;
  const target = explicit ? userPath(explicit) : DEFAULT_ROADMAP_FILE;
  if (!fs.existsSync(target)) {
    if (explicit) throw new Error(`catalogue not found: ${target}`);
    return null;
  }
  const data = JSON.parse(fs.readFileSync(target, "utf-8")) as Partial<Roadmap>;
  if (!Array.isArray(data.recipes)) throw new Error(`${target} has no "recipes" array`);
  return {
    file: target,
    version: typeof data.version === "string" ? data.version : undefined,
    chapters: Array.isArray(data.chapters) ? data.chapters : [],
    recipes: data.recipes.filter((recipe) => recipe && typeof recipe.slug === "string"),
  };
}

// ─── The report ─────────────────────────────────────────────────────────────

interface Missing {
  id: string;
  label: string;
  /** Kind of question, feature group or warning source. */
  kind?: string;
  /** Planned recipes (not created yet) that would cover it. */
  planned: string[];
}

interface Section {
  total: number;
  covered: number;
  /** Covered only by draft recipes. */
  draftOnly: string[];
  missing: Missing[];
}

export interface CoverageReport {
  recipes: { published: number; draft: number; retired: number; unreadable: string[] };
  registryError?: string;
  chapters: { id: string; number: number; title: string; published: number; draft: number; planned: number }[];
  questions?: Section;
  features?: Section & { neverPrimary: string[] };
  warnings?: Section;
  gaps?: Section;
  roadmap: {
    file: string;
    version?: string;
    total: number;
    remaining: { slug: string; number: number; wave?: number; chapter: string; title: string }[];
  } | null;
}

type Live = { slug: string; meta: RecipeMeta };

/** Coverage of one vocabulary: which ids the live recipes use (published
 *  first), and which planned recipes would cover the rest. */
function section(
  ids: string[],
  label: (id: string) => { label: string; kind?: string },
  used: (meta: RecipeMeta) => readonly string[] | undefined,
  planned: (id: string) => string[],
  live: Live[],
): Section {
  const published = new Set<string>();
  const drafts = new Set<string>();
  for (const { meta } of live) {
    for (const id of used(meta) ?? []) (meta.status === "published" ? published : drafts).add(id);
  }
  const missing: Missing[] = [];
  const draftOnly: string[] = [];
  for (const id of ids) {
    if (published.has(id)) continue;
    if (drafts.has(id)) draftOnly.push(id);
    else missing.push({ id, ...label(id), planned: planned(id) });
  }
  return { total: ids.length, covered: ids.length - missing.length, draftOnly, missing };
}

export function coverageReport(roadmap: Roadmap | null): CoverageReport {
  const entries = loadRecipes();
  const all = entries.filter((entry): entry is Live => entry.meta !== null);
  const live = all.filter(({ meta }) => meta.status !== "retired");
  const existing = new Set(entries.map((entry) => entry.slug));
  for (const { meta } of all) for (const slug of meta.formerSlugs ?? []) existing.add(slug);
  const remaining = (roadmap?.recipes ?? []).filter((recipe) => !existing.has(recipe.slug));

  let registry: Registry | null = null;
  let registryError: string | undefined;
  try {
    registry = loadRegistry();
  } catch (error) {
    registryError = (error as Error).message;
  }

  const plannedBy = (pick: (recipe: PlannedRecipe) => readonly string[] | undefined) => (id: string) =>
    remaining.filter((recipe) => (pick(recipe) ?? []).includes(id)).map((recipe) => recipe.slug);

  // Chapters: the registry's taxonomy, else the catalogue's, else the ids.
  const chapterList: { id: string; number: number; title: string }[] = registry
    ? registry.taxonomy.chapters.map((ch) => ({ id: ch.id, number: ch.number, title: ch.title.en }))
    : roadmap?.chapters.length
      ? roadmap.chapters.map((ch) => ({ id: ch.id, number: ch.number, title: ch.title.en }))
      : CHAPTER_IDS.map((id, i) => ({ id, number: i + 1, title: id }));
  const chapters = chapterList.map((ch) => ({
    ...ch,
    published: live.filter(({ meta }) => meta.chapter === ch.id && meta.status === "published").length,
    draft: live.filter(({ meta }) => meta.chapter === ch.id && meta.status === "draft").length,
    planned: remaining.filter((recipe) => recipe.chapter === ch.id).length,
  }));

  const report: CoverageReport = {
    recipes: {
      published: all.filter(({ meta }) => meta.status === "published").length,
      draft: all.filter(({ meta }) => meta.status === "draft").length,
      retired: all.filter(({ meta }) => meta.status === "retired").length,
      unreadable: entries.filter((entry) => !entry.meta).map((entry) => entry.slug),
    },
    registryError,
    chapters,
    roadmap: roadmap && {
      file: roadmap.file,
      version: roadmap.version,
      total: roadmap.recipes.length,
      remaining: remaining.map((recipe) => ({
        slug: recipe.slug,
        number: recipe.number,
        wave: recipe.wave,
        chapter: recipe.chapter,
        title: recipe.title?.en ?? recipe.slug,
      })),
    },
  };
  if (!registry) return report;
  const reg = registry;

  report.questions = section(
    Object.keys(reg.questions),
    (id) => ({ label: reg.questions[id].text.en }),
    (meta) => meta.answers,
    plannedBy((recipe) => recipe.answers),
    live,
  );

  // A planned recipe covers a feature when it lists the registry id or one
  // of the research ids the feature stands for.
  const featureAliases = (id: string) => [id, ...(reg.features[id].research ?? [])];
  const features = section(
    Object.keys(reg.features),
    (id) => ({ label: reg.features[id].label.en, kind: reg.features[id].group }),
    (meta) => [...(meta.features?.primary ?? []), ...(meta.features?.also ?? [])],
    (id) => {
      const aliases = featureAliases(id);
      return remaining
        .filter((recipe) =>
          [...(recipe.features?.primary ?? []), ...(recipe.features?.also ?? [])].some((f) => aliases.includes(f)),
        )
        .map((recipe) => recipe.slug);
    },
    live,
  );
  const taught = new Set(live.flatMap(({ meta }) => meta.features?.primary ?? []));
  const missingFeatures = new Set(features.missing.map((m) => m.id));
  report.features = {
    ...features,
    neverPrimary: Object.keys(reg.features).filter((id) => !taught.has(id) && !missingFeatures.has(id)),
  };

  report.warnings = section(
    Object.keys(reg.warnings),
    (id) => ({ label: reg.warnings[id].label.en, kind: reg.warnings[id].source }),
    (meta) => meta.explainsWarnings,
    plannedBy((recipe) => recipe.explainsWarnings),
    live,
  );
  report.gaps = section(
    Object.keys(reg.gaps),
    (id) => ({ label: reg.gaps[id].label.en }),
    (meta) => meta.gaps,
    plannedBy((recipe) => recipe.gaps),
    live,
  );
  return report;
}

// ─── Text output ────────────────────────────────────────────────────────────

function clip(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, Math.max(1, width - 1))}…`;
}

function plannedNote(planned: string[]): string {
  if (!planned.length) return c.yellow("no recipe planned");
  const head = planned.slice(0, 2).join(", ");
  return c.dim(`planned: ${head}${planned.length > 2 ? ` +${planned.length - 2}` : ""}`);
}

function printSection(title: string, data: Section | undefined, width: number): void {
  if (!data) return;
  const summary = `${data.missing.length} of ${data.total}`;
  const drafts = data.draftOnly.length ? c.dim(` · ${data.draftOnly.length} covered only by drafts`) : "";
  console.log(`\n${c.bold(title)} · ${data.missing.length ? summary : c.green("none")}${drafts}`);
  if (!data.missing.length) return;
  const idWidth = Math.min(28, Math.max(...data.missing.map((m) => m.id.length)));
  const texts = data.missing.map((m) => (m.kind ? `${m.label} · ${m.kind}` : m.label));
  const labelWidth = Math.min(Math.max(24, width - idWidth - 40), Math.max(...texts.map((t) => t.length)));
  data.missing.forEach((item, i) => {
    console.log(`  ${item.id.padEnd(idWidth)}  ${clip(texts[i], labelWidth).padEnd(labelWidth)}  ${plannedNote(item.planned)}`);
  });
}

function printReport(report: CoverageReport): void {
  const width = Math.max(80, Math.min(process.stdout.columns ?? 110, 160));
  const { published, draft, retired, unreadable } = report.recipes;
  const counts = [`${published} published`, plural(draft, "draft")];
  if (retired) counts.push(`${retired} retired`);
  console.log(`${c.bold("Cookbook coverage")} · ${plural(published + draft + retired, "recipe")} (${counts.join(", ")})`);
  if (unreadable.length) {
    console.log(c.red(`  unreadable recipe.json: ${unreadable.join(", ")} (run pnpm cookbook lint)`));
  }
  if (report.registryError) console.log(c.red(`  registry: ${report.registryError}`));

  console.log(`\n${c.bold("Chapters")}${" ".repeat(26)}${c.dim("published  draft  planned")}`);
  for (const ch of report.chapters) {
    const name = `${String(ch.number).padStart(2)}  ${clip(ch.title, 26).padEnd(26)}`;
    const cols = [ch.published, ch.draft, ch.planned].map((n, i) => String(n || "·").padStart([9, 7, 9][i]));
    console.log(`  ${name}${cols.join("")}`);
  }

  printSection("Questions without a recipe", report.questions, width);
  printSection("Features no recipe uses", report.features, width);
  if (report.features?.neverPrimary.length) {
    const names = report.features.neverPrimary.join(", ");
    console.log(c.dim(`  used but never taught (no recipe has them as primary): ${names}`));
  }
  printSection("Warnings no recipe explains", report.warnings, width);
  printSection("Gaps without a workaround recipe", report.gaps, width);

  const roadmap = report.roadmap;
  if (!roadmap) {
    const where = shown(DEFAULT_ROADMAP_FILE, REPO_DIR);
    console.log(c.dim(`\nRoadmap: no design catalogue (pass --catalog <file>, set COOKBOOK_CATALOG, or add ${where}).`));
    return;
  }
  const created = roadmap.total - roadmap.remaining.length;
  const version = roadmap.version ? ` ${roadmap.version}` : "";
  console.log(
    `\n${c.bold("Roadmap")} · ${roadmap.remaining.length} of ${roadmap.total} planned recipes not created yet` +
      c.dim(` (${created} done · ${shown(roadmap.file, REPO_DIR)}${version})`),
  );
  const waves = [...new Set(roadmap.remaining.map((r) => r.wave ?? 0))].sort((a, b) => a - b);
  for (const wave of waves) {
    const rows = roadmap.remaining.filter((r) => (r.wave ?? 0) === wave).sort((a, b) => a.number - b.number);
    if (waves.length > 1 || wave) {
      console.log(`  ${c.bold(wave ? `Wave ${wave}` : "Unscheduled")} ${c.dim(`· ${rows.length}`)}`);
    }
    const slugWidth = Math.max(...rows.map((r) => r.slug.length));
    for (const r of rows) {
      const n = `Nº ${String(r.number).padStart(2)}`;
      const room = Math.max(20, width - slugWidth - 32);
      console.log(`    ${c.dim(n)}  ${r.slug.padEnd(slugWidth)}  ${c.dim(r.chapter.padEnd(13))}  ${clip(r.title, room)}`);
    }
  }
}

export async function runCoverage(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv, { json: { type: "boolean" }, catalog: { type: "string", value: "file" } }, "coverage");
  if (args.positionals.length) {
    throw new UsageError(`coverage takes no recipes (got "${args.positionals[0]}")`, "coverage");
  }
  const roadmap = loadRoadmap(str(args, "catalog"));
  const report = coverageReport(roadmap);
  if (flag(args, "json")) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
  return report.registryError ? 1 : 0;
}
