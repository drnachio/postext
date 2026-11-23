/**
 * The Cookbook CLI: `pnpm cookbook <command>` (from the repo root or
 * apps/web; it runs in apps/web with Node's type stripping).
 *
 *   new · dev · capture · sandbox · lint · schema · coverage · help
 *
 * Exit codes: 0 when everything is green, 1 on any failure, 2 on a usage
 * error. Heavy modules (the capture harness, the pen server) load only for
 * the commands that need them.
 */
import fs from "node:fs";
import path from "node:path";
import { captureDir } from "../../src/lib/cookbook/paths.ts";
import { sourceHash } from "../../src/lib/cookbook/hash.ts";
import type { CaptureManifest, SampleLocale, RecipeMeta } from "../../src/lib/cookbook/types.ts";
import { SAMPLE_LOCALES } from "../../src/lib/cookbook/types.ts";
import { declaresComposedPages } from "../../src/lib/cookbook/bench.ts";
import { readRecipeSources } from "../../src/lib/cookbook/sources.ts";
import type { ParsedArgs, RecipeEntry } from "./args.ts";
import {
  UsageError, c, flag, int, list, loadRecipes, mark, parseArgs, plural, str, stressFactor, userPath,
} from "./args.ts";
import { COVERAGE_USAGE, runCoverage } from "./coverage.ts";
import { DEV_USAGE, ENGINE_PATTERN, runDev } from "./dev.ts";
import { LINT_USAGE, runLint } from "./lint.ts";
import { NEW_USAGE, runNew } from "./new.ts";
import { SANDBOX_USAGE } from "./sandbox-usage.ts";
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
  --engine <spec>        npm (default: packages/postext's version), npm@x.y.z, or local
                         (the workspace packages' dist; checks only, writes no capture)
  --preview-dir <dir>    Also write every page image, the card, the edition's capture.json and its
                         layout text (vdt.txt: every block and line with its box) here for inspection
  --verify               After a release: run as a capture does and write only the
                         record that the recipe was found unchanged on this release
                         (capture.json \`verified\`: the recipe page then prints it as
                         "tested with"). A recipe whose files would change is listed
                         as needing a recapture, with the reason, and the command
                         exits 1. Not with --force, --check, --sandbox-only or
                         --engine local
  --sandbox-only         Write only each edition's <slug>.postext (and its entry
                         and findings in capture.json), with the engine capture.json
                         records; pages, card, OG image and PDF stay as they are.
                         With no slugs: every captured recipe; with --check, the
                         bundles are read back against the pens and nothing is written
  --stress <factor>      The stress test (C38): each edition is laid out again with
                         every text this many times as long (1.3 = 30 % longer;
                         from 1.05 to 3); implies --check
  --stress-out <dir>     With --stress: write the stretched edition's pages
                         (p01.png…), the Markdown they were laid out from and
                         stress.json (the C38 findings) to <dir>/<slug>/<lang>/
  --compare              Compare each published page with the approved capture of
                         the same sources, cell by cell (C39); a page past the
                         threshold fails
  --max-diff <n>         C39's threshold: the largest mean difference of an 8 × 8 px
                         cell, of 255 (default 12)
  --no-pixels            C39 compares the layout hash only (pages painted on another
                         system than the approved ones differ at every glyph edge)
  --strict               C39 fails on any engine, not only the one capture.json records
  --composed             With no slugs: every recipe whose Markdown declares composed
                         pages, stale or not`;

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
      lang: { type: "list", value: "en,es", choices: SAMPLE_LOCALES },
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
      verify: { type: "boolean" },
      stress: { type: "string", value: "factor" },
      "stress-out": { type: "string", value: "dir" },
      compare: { type: "boolean" },
      "max-diff": { type: "int", value: "n", min: 0, max: 255 },
      "no-pixels": { type: "boolean" },
      "hash-warn": { type: "boolean" },
      strict: { type: "boolean" },
      composed: { type: "boolean" },
    },
    "capture",
  );
  return captureWith(args, "capture");
}

async function captureWith(args: ParsedArgs, command: string, bench = false): Promise<number> {
  const engine = str(args, "engine");
  if (engine && !ENGINE_PATTERN.test(engine)) {
    throw new UsageError(`--engine expects npm, npm@x.y.z or local, not "${engine}"`, command);
  }
  const all = flag(args, "all");
  if (all && args.positionals.length) throw new UsageError("name recipes or pass --all, not both", command);
  const stress = stressFactor(str(args, "stress"), command) ?? (bench ? 1.3 : undefined);
  const composed = bench ? !args.positionals.length : flag(args, "composed");
  if (composed && (all || args.positionals.length)) throw new UsageError("--composed picks the recipes itself: drop the slugs and --all", command);
  const stressOut = str(args, "stress-out");
  if (stressOut && stress === undefined) throw new UsageError("--stress-out writes the stretched pages: add --stress <factor>", command);
  const compare = bench || flag(args, "compare");
  const maxDiff = int(args, "max-diff");
  if (stress !== undefined || compare || composed) {
    if (flag(args, "sandbox-only") || flag(args, "verify")) {
      throw new UsageError("--stress, --compare and --composed check pages: drop --sandbox-only and --verify", command);
    }
  }
  const sandboxOnly = flag(args, "sandbox-only");
  if (sandboxOnly && (engine || flag(args, "force") || str(args, "sheet") || str(args, "preview-dir"))) {
    throw new UsageError("--sandbox-only uses the engine capture.json records and writes no images: drop --engine, --force, --sheet and --preview-dir", command);
  }

  const verify = flag(args, "verify");
  if (verify && (flag(args, "force") || flag(args, "check") || sandboxOnly || engine === "local")) {
    throw new UsageError("--verify records that a release left a capture unchanged: drop --force, --check, --sandbox-only and --engine local", command);
  }

  const entries = loadRecipes();
  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const unknown = args.positionals.filter((slug) => !bySlug.has(slug));
  if (unknown.length) throw new UsageError(`no recipe ${unknown.map((s) => `"${s}"`).join(", ")} in cookbook/`, command);

  let selected: RecipeEntry[];
  const reasons = new Map<string, string>();
  if (composed) {
    selected = entries.filter((entry) => entry.meta?.status !== "retired" && declaresComposedPages(readRecipeSources(entry.slug).content));
    if (!selected.length) {
      console.log(`${mark.ok()} No recipe declares composed pages (::::page{template=…}): nothing for the bench.`);
      return 0;
    }
  } else if (sandboxOnly && !args.positionals.length) {
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

  const langs = list(args, "lang") as SampleLocale[] | undefined;
  const check = flag(args, "check") || stress !== undefined;
  const mode = (sandboxOnly ? " · Sandbox bundles only" : "") + (check ? " · check only, nothing written" : "")
    + (verify ? " · verify: only the record of an unchanged capture is written" : "")
    + (stress !== undefined ? ` · stress × ${stress}` : "") + (compare ? (flag(args, "no-pixels") ? " · compared with the approved layout" : ` · compared with the approved pages (${maxDiff ?? 12} of 255)`) : "");
  const names = selected.map((entry) => {
    const reason = reasons.get(entry.slug);
    return reason ? `${entry.slug} ${c.dim(`(${reason})`)}` : entry.slug;
  });
  const editions = langs ? ` · ${langs.join(", ")}` : "";
  console.log(`${c.bold(bench ? "Cookbook bench" : "Cookbook capture")} · ${plural(selected.length, "recipe")}${editions}${mode}`);
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
    check,
    force: flag(args, "force"),
    sheet: sheet && userPath(sheet),
    report: reportFile && userPath(reportFile),
    headed: flag(args, "headed"),
    concurrency: int(args, "concurrency"),
    refreshNet: flag(args, "refresh-net"),
    engine,
    previewDir: previewDir && userPath(previewDir),
    verify,
    ...(stress !== undefined ? { stress } : {}),
    ...(stressOut ? { stressOut: userPath(stressOut) } : {}),
    ...(compare ? { compare } : {}),
    ...(maxDiff !== undefined ? { maxDiff } : {}),
    ...(flag(args, "no-pixels") ? { pixels: false } : {}),
    ...(flag(args, "hash-warn") ? { hashWarn: true } : {}),
    ...(flag(args, "strict") ? { strict: true } : {}),
    ...(composed ? { composed } : {}),
  });
  const code = printResults(results);
  return broken.length ? Math.max(code, 1) : code;
}

// ─── bench ──────────────────────────────────────────────────────────────────

const BENCH_USAGE = `pnpm cookbook bench [slug…] [options]

  The composed-page bench (#869): every edition of each recipe whose
  Markdown declares composed pages (::::page{template=…}), or of the named
  ones, run and checked as a capture checks it, and then:

    C37  no frameOverflow, tocGroupSplit, contentInConfig or composed-page
         source or template warning, in any edition
    C38  the stress test: every text made longer (--stress, 1.3 by default);
         each page rearranges or goes on, and a frameOverflow under stress
         carries proposals with values
    C39  the layout and each published page against the approved capture
    C40  the source map: a click inside every element of a composed page
         comes back to its Markdown (once the engine has sourceAt, #857)
    C41  a configuration under 1 MB

  Writes nothing. The bundle in the Sandbox is \`pnpm cookbook sandbox\`.

  --lang <en,es>         Only these sample editions
  --stress <factor>      How much longer the text is made (default 1.3)
  --stress-out <dir>     Write the stretched pages, their Markdown and stress.json
                         to <dir>/<slug>/<lang>/
  --max-diff <n>         C39's threshold, of 255 (default 12)
  --no-pixels            C39 compares the layout hash only (CI: Linux against captures
                         made on another system)
  --strict               C39 fails on any engine; without it a difference on another
                         engine than the approved capture's is a warning
  --engine <spec>        npm (default), npm@x.y.z, or local (the workspace packages' dist)
  --report <out.json>    The results as JSON
  --preview-dir <dir>    Also write every page image here
  --concurrency <n>      Recipes run at once (default 3)
  --headed               Show the browser
  --refresh-net          Bypass the on-disk network cache

  COOKBOOK_RECIPES_DIR reads the recipe folders from another directory
  (the bench's own fixture: apps/web/src/lib/cookbook/fixtures/recipes).`;

async function runBenchCommand(argv: readonly string[]): Promise<number> {
  const args = parseArgs(
    argv,
    {
      lang: { type: "list", value: "en,es", choices: SAMPLE_LOCALES },
      stress: { type: "string", value: "factor" },
      "stress-out": { type: "string", value: "dir" },
      "max-diff": { type: "int", value: "n", min: 0, max: 255 },
      "no-pixels": { type: "boolean" },
      "hash-warn": { type: "boolean" },
      strict: { type: "boolean" },
      engine: { type: "string", value: "spec" },
      report: { type: "string", value: "out.json" },
      "preview-dir": { type: "string", value: "dir" },
      concurrency: { type: "int", value: "n", min: 1, max: 16 },
      headed: { type: "boolean" },
      "refresh-net": { type: "boolean" },
    },
    "bench",
  );
  return captureWith(args, "bench", true);
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
  bench: {
    run: runBenchCommand,
    usage: BENCH_USAGE,
    summary: "The composed-page bench: every check, the stress test, the approved pages, the source map",
  },
  sandbox: {
    // The check pulls in puppeteer: loaded only for this command.
    run: async (argv) => (await import("./sandbox.ts")).runSandbox(argv),
    usage: SANDBOX_USAGE,
    summary: "Lay every bundle out as the Sandbox does and compare it with capture.json",
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
  bench: "bench [slug…] [--stress 1.3] [--engine local] …",
  sandbox: "sandbox [slug…] [--site <url>] [--strict] …",
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
