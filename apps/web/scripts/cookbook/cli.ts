/**
 * The Cookbook CLI: `pnpm cookbook <command>` (from the repo root or
 * apps/web; it runs in apps/web with Node's type stripping).
 *
 *   new · dev · capture · lint · schema · coverage · help
 *
 * Exit codes: 0 when everything is green, 1 on any failure, 2 on a usage
 * error. Heavy modules (the capture harness, the pen server) load only for
 * the commands that need them.
 */
import fs from "node:fs";
import path from "node:path";
import { captureDir } from "../../src/lib/cookbook/paths.ts";
import { sourceHash } from "../../src/lib/cookbook/hash.ts";
import type { CaptureManifest, Locale, RecipeMeta } from "../../src/lib/cookbook/types.ts";
import { LOCALES } from "../../src/lib/cookbook/types.ts";
import type { RecipeEntry } from "./args.ts";
import {
  UsageError, c, flag, int, list, loadRecipes, mark, parseArgs, plural, str, userPath,
} from "./args.ts";
import { COVERAGE_USAGE, runCoverage } from "./coverage.ts";
import { DEV_USAGE, ENGINE_PATTERN, runDev } from "./dev.ts";
import { LINT_USAGE, runLint } from "./lint.ts";
import { NEW_USAGE, runNew } from "./new.ts";
import { SCHEMA_USAGE, runSchema } from "./schema.ts";

// ─── capture ────────────────────────────────────────────────────────────────

const CAPTURE_USAGE = `pnpm cookbook capture [slug…] [options]

  Runs each recipe's pen in Chrome against the released engine, verifies it
  and writes pages, card, OG image, PDF and capture.json to
  apps/web/public/cookbook/<slug>/. With no slugs: the recipes whose capture
  is missing or stale (the source hash changed).

  --all                  Every recipe that is not retired
  --lang <en,es>         Only these sample editions
  --check                Run and verify, write nothing (regression run)
  --force                Rewrite images even when the VDT hash and card inputs are unchanged
  --sheet <out.webp>     Contact sheet of every card and first spread (design review)
  --report <out.json>    The results as JSON
  --headed               Show the browser
  --concurrency <n>      Recipes captured at once (default 3)
  --refresh-net          Bypass the on-disk network cache
  --engine <spec>        npm (default: packages/postext's version) or npm@x.y.z
  --preview-dir <dir>    Also write every page image here for inspection
  --sandbox-only         Write only each edition's <slug>.postext (and its entry
                         in capture.json), with the engine capture.json records;
                         pages, card, OG image and PDF stay as they are. With no
                         slugs: every captured recipe`;

type CaptureState = "fresh" | "missing" | "stale" | "incomplete" | "unreadable";

/** Whether a recipe's committed capture still matches its sources. */
function captureState(slug: string, meta: RecipeMeta): CaptureState {
  const file = path.join(captureDir(slug), "capture.json");
  if (!fs.existsSync(file)) return "missing";
  let manifest: CaptureManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, "utf-8")) as CaptureManifest;
  } catch {
    return "unreadable";
  }
  try {
    if (manifest.sourceHash !== sourceHash(slug, meta)) return "stale";
  } catch {
    return "stale";
  }
  const locales = meta.sample?.locales ?? [];
  return locales.every((locale) => manifest.variants?.[locale]) ? "fresh" : "incomplete";
}

const STATE_LABEL: Record<CaptureState, string> = {
  fresh: "up to date",
  missing: "no capture",
  stale: "stale",
  incomplete: "missing an edition",
  unreadable: "capture.json unreadable",
};

async function runCaptureCommand(argv: readonly string[]): Promise<number> {
  const args = parseArgs(
    argv,
    {
      all: { type: "boolean" },
      lang: { type: "list", value: "en,es", choices: LOCALES },
      check: { type: "boolean" },
      force: { type: "boolean" },
      sheet: { type: "string", value: "out.webp" },
      report: { type: "string", value: "out.json" },
      headed: { type: "boolean" },
      concurrency: { type: "int", value: "n", min: 1, max: 16 },
      "refresh-net": { type: "boolean" },
      engine: { type: "string", value: "spec" },
      "preview-dir": { type: "string", value: "dir" },
      "sandbox-only": { type: "boolean" },
    },
    "capture",
  );
  const engine = str(args, "engine");
  if (engine === "local") throw new UsageError("--engine local is not supported yet: capture against npm", "capture");
  if (engine && !ENGINE_PATTERN.test(engine)) {
    throw new UsageError(`--engine expects npm or npm@x.y.z, not "${engine}"`, "capture");
  }
  const all = flag(args, "all");
  if (all && args.positionals.length) throw new UsageError("name recipes or pass --all, not both", "capture");
  const sandboxOnly = flag(args, "sandbox-only");
  if (sandboxOnly && (engine || flag(args, "force") || str(args, "sheet") || str(args, "preview-dir"))) {
    throw new UsageError("--sandbox-only uses the engine capture.json records and writes no images: drop --engine, --force, --sheet and --preview-dir", "capture");
  }

  const entries = loadRecipes();
  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const unknown = args.positionals.filter((slug) => !bySlug.has(slug));
  if (unknown.length) throw new UsageError(`no recipe ${unknown.map((s) => `"${s}"`).join(", ")} in cookbook/`, "capture");

  let selected: RecipeEntry[];
  const reasons = new Map<string, string>();
  if (sandboxOnly && !args.positionals.length) {
    selected = entries.filter((entry) => entry.meta?.status !== "retired" && fs.existsSync(path.join(captureDir(entry.slug), "capture.json")));
  } else if (args.positionals.length) {
    selected = args.positionals.map((slug) => bySlug.get(slug) as RecipeEntry);
  } else {
    const live = entries.filter((entry) => entry.meta?.status !== "retired");
    selected = all ? live : [];
    for (const entry of all ? [] : live) {
      const state = entry.meta ? captureState(entry.slug, entry.meta) : "missing";
      if (state === "fresh") continue;
      selected.push(entry);
      reasons.set(entry.slug, STATE_LABEL[state]);
    }
  }
  // A recipe.json that does not parse cannot be captured; the rest still are.
  const broken = selected.filter((entry) => !entry.meta);
  for (const entry of broken) console.error(`${mark.fail()} ${entry.slug}: ${entry.error} ${c.dim("(pnpm cookbook lint)")}`);
  selected = selected.filter((entry) => entry.meta);
  if (!selected.length && broken.length) return 1;
  if (!selected.length) {
    const count = entries.filter((entry) => entry.meta?.status !== "retired").length;
    console.log(
      count
        ? `${mark.ok()} Every capture is up to date (${plural(count, "recipe")}). Name recipes or pass --all to recapture.`
        : `${mark.ok()} No recipes yet: pnpm cookbook new <slug> --chapter <id>`,
    );
    return 0;
  }

  const langs = list(args, "lang") as Locale[] | undefined;
  const mode = (sandboxOnly ? " · Sandbox bundles only" : "") + (flag(args, "check") ? " · check only, nothing written" : "");
  const names = selected.map((entry) => {
    const reason = reasons.get(entry.slug);
    return reason ? `${entry.slug} ${c.dim(`(${reason})`)}` : entry.slug;
  });
  const editions = langs ? ` · ${langs.join(", ")}` : "";
  console.log(`${c.bold("Cookbook capture")} · ${plural(selected.length, "recipe")}${editions}${mode}`);
  console.log(`  ${names.join(c.dim(", "))}\n`);

  // The harness pulls in puppeteer: load it only for this command.
  const { runCapture, runSandboxOnly } = await import("./capture.ts");
  const { printResults } = await import("./report.ts");

  const sheet = str(args, "sheet");
  const reportFile = str(args, "report");
  const previewDir = str(args, "preview-dir");
  const results = await (sandboxOnly ? runSandboxOnly : runCapture)({
    slugs: selected.map((entry) => entry.slug),
    all,
    langs,
    check: flag(args, "check"),
    force: flag(args, "force"),
    sheet: sheet && userPath(sheet),
    report: reportFile && userPath(reportFile),
    headed: flag(args, "headed"),
    concurrency: int(args, "concurrency"),
    refreshNet: flag(args, "refresh-net"),
    engine,
    previewDir: previewDir && userPath(previewDir),
  });
  const code = printResults(results);
  return broken.length ? Math.max(code, 1) : code;
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

interface Command {
  run(argv: readonly string[]): Promise<number>;
  usage: string;
  summary: string;
}

const COMMANDS: Record<string, Command> = {
  new: {
    run: runNew,
    usage: NEW_USAGE,
    summary: "Scaffold a draft recipe from cookbook/_template (or --from a recipe)",
  },
  dev: { run: runDev, usage: DEV_USAGE, summary: "Serve one recipe's capture page with live reload" },
  capture: {
    run: runCaptureCommand,
    usage: CAPTURE_USAGE,
    summary: "Capture and verify pages, cards and PDFs (default: stale recipes)",
  },
  lint: { run: runLint, usage: LINT_USAGE, summary: "Static checks, grouped by recipe (default: all)" },
  schema: { run: runSchema, usage: SCHEMA_USAGE, summary: "Regenerate cookbook/recipe.schema.json" },
  coverage: {
    run: runCoverage,
    usage: COVERAGE_USAGE,
    summary: "What no recipe covers yet, and the planned recipes (the roadmap)",
  },
};

const SYNOPSES: Record<string, string> = {
  new: "new <slug> --chapter <id> [--from <slug>]",
  dev: "dev <slug> [--lang es] [--port 4400]",
  capture: "capture [slug…] [--all] [--check] [--force] …",
  lint: "lint [slug…]",
  schema: "schema [--check]",
  coverage: "coverage [--json] [--catalog <file>]",
};

function help(topic?: string): number {
  if (topic) {
    if (!Object.hasOwn(COMMANDS, topic)) throw new UsageError(`unknown command "${topic}"`);
    const command = COMMANDS[topic];
    console.log(command.usage);
    return 0;
  }
  const width = Math.max(...Object.values(SYNOPSES).map((s) => s.length));
  const rows = Object.keys(COMMANDS).map((name) => `  ${SYNOPSES[name].padEnd(width)}  ${c.dim(COMMANDS[name].summary)}`);
  console.log(`${c.bold("Postext Cookbook")}: scaffold, preview, capture and check recipes.

Usage: pnpm cookbook <command> [options]

${rows.join("\n")}
  ${"help [command]".padEnd(width)}  ${c.dim("This text, or one command's options")}

Recipes live in cookbook/<slug>/; captures in apps/web/public/cookbook/<slug>/.
Exit codes: 0 all green · 1 something failed · 2 usage error`);
  return 0;
}

async function main(argv: readonly string[]): Promise<number> {
  // `pnpm cookbook -- …` passes the separator through.
  const args = argv[0] === "--" ? argv.slice(1) : [...argv];
  const [name, ...rest] = args;
  if (!name || name === "help" || name === "--help" || name === "-h") return help(rest[0]);
  if (!Object.hasOwn(COMMANDS, name)) throw new UsageError(`unknown command "${name}"`);
  const command = COMMANDS[name];
  if (rest.includes("--help") || rest.includes("-h")) {
    console.log(command.usage);
    return 0;
  }
  return command.run(rest);
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError) {
    console.error(`${mark.fail()} ${error.message}`);
    const pointer = error.command ? `pnpm cookbook help ${error.command}` : "pnpm cookbook help";
    console.error(c.dim(`  See ${pointer}`));
    process.exitCode = 2;
  } else {
    const err = error as Error;
    console.error(`${mark.fail()} ${err.message ?? String(error)}`);
    // Our own explained failures need no stack; anything else keeps it.
    if (err.stack && err.name !== "ComposeError") {
      console.error(c.dim(err.stack.split("\n").slice(1).join("\n")));
    }
    process.exitCode = 1;
  }
}
