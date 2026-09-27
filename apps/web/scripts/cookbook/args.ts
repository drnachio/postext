/**
 * What every CLI command shares: the argument parser, terminal helpers and
 * the recipe listing. The parser is deliberately tiny (no dependency):
 * `--name value`, `--name=value`, boolean flags, comma or repeated lists,
 * and `--` to end the options.
 *
 * Run by Node's type stripping: erasable TypeScript and relative `.ts`
 * imports only.
 */
import path from "node:path";
import { styleText } from "node:util";
import { listRecipeSlugs, readRecipeMeta } from "../../src/lib/cookbook/sources.ts";
import type { RecipeMeta } from "../../src/lib/cookbook/types.ts";

/** A usage mistake: the CLI prints it with a pointer to `help` and exits 2. */
export class UsageError extends Error {
  command: string | null;

  constructor(message: string, command: string | null = null) {
    super(message);
    this.name = "UsageError";
    this.command = command;
  }
}

export type OptionType = "boolean" | "string" | "int" | "list";

export interface OptionSpec {
  type: OptionType;
  /** Placeholder shown in errors ("--port <n>"). */
  value?: string;
  /** Accepted values ("list" checks every item). */
  choices?: readonly string[];
  /** Inclusive bounds of an "int". */
  min?: number;
  max?: number;
}

export type OptionValue = string | number | boolean | string[];

export interface ParsedArgs {
  positionals: string[];
  options: Record<string, OptionValue | undefined>;
}

function describe(name: string, spec: OptionSpec): string {
  return spec.type === "boolean" ? `--${name}` : `--${name} <${spec.value ?? spec.type}>`;
}

/** Parses `argv` against `specs`; throws a UsageError naming `command`. */
export function parseArgs(
  argv: readonly string[],
  specs: Record<string, OptionSpec>,
  command: string,
): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, OptionValue | undefined> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith("-") || arg === "-") {
      positionals.push(arg);
      continue;
    }
    if (!arg.startsWith("--")) throw new UsageError(`unknown option "${arg}" (options are spelled --name)`, command);
    const eq = arg.indexOf("=");
    const name = arg.slice(2, eq < 0 ? undefined : eq);
    if (!Object.hasOwn(specs, name)) throw new UsageError(`unknown option "--${name}"`, command);
    const spec = specs[name];
    if (spec.type === "boolean") {
      if (eq >= 0) throw new UsageError(`--${name} takes no value`, command);
      options[name] = true;
      continue;
    }
    let raw: string | undefined;
    if (eq >= 0) raw = arg.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) raw = argv[++i];
    if (raw === undefined || raw === "") throw new UsageError(`${describe(name, spec)} needs a value`, command);
    options[name] = coerce(name, spec, raw, options[name], command);
  }
  return { positionals, options };
}

function coerce(
  name: string,
  spec: OptionSpec,
  raw: string,
  previous: OptionValue | undefined,
  command: string,
): OptionValue {
  const check = (value: string) => {
    if (spec.choices && !spec.choices.includes(value)) {
      throw new UsageError(`--${name}: "${value}" is not one of ${spec.choices.join(", ")}`, command);
    }
  };
  if (spec.type === "int") {
    const n = Number(raw);
    const inRange = (spec.min === undefined || n >= spec.min) && (spec.max === undefined || n <= spec.max);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || !inRange) {
      const range = spec.min !== undefined && spec.max !== undefined ? ` between ${spec.min} and ${spec.max}` : "";
      throw new UsageError(`--${name} expects a whole number${range}, not "${raw}"`, command);
    }
    return n;
  }
  if (spec.type === "list") {
    const items = raw.split(",").map((item) => item.trim()).filter(Boolean);
    items.forEach(check);
    const list = Array.isArray(previous) ? previous : [];
    return [...list, ...items.filter((item) => !list.includes(item))];
  }
  check(raw);
  return raw;
}

// ─── Typed getters ──────────────────────────────────────────────────────────

export function flag(args: ParsedArgs, name: string): boolean {
  return args.options[name] === true;
}

export function str(args: ParsedArgs, name: string): string | undefined {
  const value = args.options[name];
  return typeof value === "string" ? value : undefined;
}

export function int(args: ParsedArgs, name: string): number | undefined {
  const value = args.options[name];
  return typeof value === "number" ? value : undefined;
}

export function list(args: ParsedArgs, name: string): string[] | undefined {
  const value = args.options[name];
  return Array.isArray(value) ? value : undefined;
}

// ─── Paths and output ───────────────────────────────────────────────────────

/** A path the author typed. `pnpm cookbook` runs in apps/web, so relative
 *  paths resolve against the directory the command was typed in
 *  (pnpm's INIT_CWD). */
export function userPath(file: string): string {
  return path.resolve(process.env.INIT_CWD ?? process.cwd(), file);
}

/** A path for display: relative to the repo root when inside it. */
export function shown(file: string, repoDir: string): string {
  const rel = path.relative(repoDir, file);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : file;
}

type Style = Parameters<typeof styleText>[0];

/** styleText strips the escapes when stdout is not a colour terminal
 *  (or NO_COLOR is set). */
function paint(style: Style, text: string): string {
  return styleText(style, text, { stream: process.stdout });
}

export const c = {
  bold: (text: string) => paint("bold", text),
  dim: (text: string) => paint("dim", text),
  green: (text: string) => paint("green", text),
  red: (text: string) => paint("red", text),
  yellow: (text: string) => paint("yellow", text),
  cyan: (text: string) => paint("cyan", text),
};

export const mark = {
  ok: () => c.green("✓"),
  fail: () => c.red("✗"),
  warn: () => c.yellow("!"),
};

/** Today in the local time zone, YYYY-MM-DD. */
export function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "1 recipe" / "3 recipes". */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

// ─── Recipes on disk ────────────────────────────────────────────────────────

export interface RecipeEntry {
  slug: string;
  /** Null when recipe.json does not parse (`error` says why). */
  meta: RecipeMeta | null;
  error?: string;
}

/** Every recipe folder with its parsed (unvalidated) recipe.json. */
export function loadRecipes(): RecipeEntry[] {
  return listRecipeSlugs().map((slug) => {
    try {
      return { slug, meta: readRecipeMeta(slug) };
    } catch (error) {
      return { slug, meta: null, error: `recipe.json: ${(error as Error).message}` };
    }
  });
}
