// Command-line arguments: a small parser with no dependencies. Options are
// declared per command (see `commands.ts`); `--name value`, `--name=value`,
// `-o value`, `--no-name` for switches and `--` to end options all work.

export type OptionKind = 'string' | 'boolean' | 'number' | 'list';

export interface OptionSpec {
  name: string;
  short?: string;
  kind: OptionKind;
  /** Placeholder shown in the help (`FILE`, `N`). */
  arg?: string;
  help: string;
}

export type OptionValue = string | boolean | number | string[];

export interface ParsedArgs {
  positionals: string[];
  options: Record<string, OptionValue>;
}

/** A mistake in how the command was called: exit code 2. */
export class UsageError extends Error {}

/** A command that ran and failed: exit code 1 (or the code given). */
export class CliError extends Error {
  constructor(message: string, readonly exitCode = 1) {
    super(message);
  }
}

export function parseArgs(argv: readonly string[], specs: readonly OptionSpec[]): ParsedArgs {
  const byName = new Map(specs.map((s) => [s.name, s]));
  const byShort = new Map(specs.filter((s) => s.short).map((s) => [s.short!, s]));
  const positionals: string[] = [];
  const options: Record<string, OptionValue> = {};
  const set = (spec: OptionSpec, raw: string | true) => {
    if (spec.kind === 'boolean') {
      options[spec.name] = raw === true ? true : !/^(false|0|no|off)$/i.test(raw);
      return;
    }
    if (raw === true) throw new UsageError(`--${spec.name} needs a value`);
    if (spec.kind === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new UsageError(`--${spec.name} takes a number, not "${raw}"`);
      options[spec.name] = n;
    } else if (spec.kind === 'list') {
      const list = (options[spec.name] as string[] | undefined) ?? [];
      list.push(raw);
      options[spec.name] = list;
    } else {
      options[spec.name] = raw;
    }
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const name = arg.slice(2, eq === -1 ? undefined : eq);
      const spec = byName.get(name);
      if (!spec && name.startsWith('no-')) {
        const negated = byName.get(name.slice(3));
        if (negated?.kind === 'boolean' && eq === -1) {
          options[negated.name] = false;
          continue;
        }
      }
      if (!spec) throw new UsageError(`Unknown option --${name}`);
      if (eq !== -1) set(spec, arg.slice(eq + 1));
      else if (spec.kind === 'boolean') set(spec, true);
      else {
        const next = argv[i + 1];
        if (next === undefined) throw new UsageError(`--${name} needs a value`);
        set(spec, next);
        i++;
      }
      continue;
    }
    if (arg.length > 1 && arg.startsWith('-') && !/^-\d/.test(arg)) {
      const spec = byShort.get(arg.slice(1));
      if (!spec) throw new UsageError(`Unknown option ${arg}`);
      if (spec.kind === 'boolean') set(spec, true);
      else {
        const next = argv[i + 1];
        if (next === undefined) throw new UsageError(`${arg} needs a value`);
        set(spec, next);
        i++;
      }
      continue;
    }
    positionals.push(arg);
  }
  return { positionals, options };
}

/** Typed reads of parsed options. */
export class Options {
  constructor(readonly values: Record<string, OptionValue>) {}
  has(name: string): boolean {
    return this.values[name] !== undefined;
  }
  string(name: string): string | undefined;
  string(name: string, fallback: string): string;
  string(name: string, fallback?: string): string | undefined {
    const v = this.values[name];
    return typeof v === 'string' ? v : fallback;
  }
  number(name: string): number | undefined;
  number(name: string, fallback: number): number;
  number(name: string, fallback?: number): number | undefined {
    const v = this.values[name];
    return typeof v === 'number' ? v : fallback;
  }
  flag(name: string): boolean | undefined {
    const v = this.values[name];
    return typeof v === 'boolean' ? v : undefined;
  }
  list(name: string): string[] {
    const v = this.values[name];
    return Array.isArray(v) ? v : [];
  }
  /** A string option that must be one of `allowed`. */
  choice<T extends string>(name: string, allowed: readonly T[]): T | undefined {
    const v = this.string(name);
    if (v === undefined) return undefined;
    if (!(allowed as readonly string[]).includes(v)) {
      throw new UsageError(`--${name} must be one of ${allowed.join(', ')} (got "${v}")`);
    }
    return v as T;
  }
}
