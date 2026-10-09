// postext: the command line. With no arguments it prints the help.
import { CliError, Options, parseArgs, UsageError } from './args';
import { COMMANDS, commandOptions, findCommand, GLOBAL_OPTIONS } from './commands';
import { commandHelp, mainHelp } from './help';
import { Reporter, setColor, style } from './log';
import { ENGINE_VERSION, VERSION } from './version';

function closest(name: string): string | undefined {
  const distance = (a: string, b: string) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0]![j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[a.length]![b.length]!;
  };
  const best = COMMANDS.map((c) => ({ name: c.name, d: distance(name, c.name) })).sort((x, y) => x.d - y.d)[0];
  return best && best.d <= 3 ? best.name : undefined;
}

async function main(argv: string[]): Promise<number> {
  const [first, ...rest] = argv;
  if (first === undefined) {
    process.stdout.write(`${mainHelp()}\n`);
    return 0;
  }
  if (first === '--version' || first === '-v' || first === 'version') {
    process.stdout.write(`postext ${VERSION} (engine ${ENGINE_VERSION}, ${process.platform}-${process.arch})\n`);
    return 0;
  }
  if (first === '--help' || first === '-h' || first === 'help') {
    const topic = first === 'help' ? rest[0] : undefined;
    const spec = topic ? findCommand(topic) : undefined;
    if (topic && !spec) throw new UsageError(`Unknown command "${topic}"`);
    process.stdout.write(`${spec ? commandHelp(spec) : mainHelp()}\n`);
    return 0;
  }
  if (first.startsWith('-')) {
    // Global options before the command: only the colour switch makes sense there.
    const parsed = parseArgs([first], GLOBAL_OPTIONS);
    setColor(new Options(parsed.options).flag('color'));
    return main(rest);
  }
  const spec = findCommand(first);
  if (!spec) {
    const hint = closest(first);
    throw new UsageError(`Unknown command "${first}"${hint ? ` — did you mean "${hint}"?` : ''}`);
  }
  const parsed = parseArgs(rest, commandOptions(spec));
  const opts = new Options(parsed.options);
  setColor(opts.flag('color'));
  if (opts.flag('help')) {
    process.stdout.write(`${commandHelp(spec)}\n`);
    return 0;
  }
  if (opts.flag('version')) {
    process.stdout.write(`postext ${VERSION} (engine ${ENGINE_VERSION})\n`);
    return 0;
  }
  const json = opts.flag('json') === true;
  const level = opts.flag('quiet') ? 'quiet' : opts.flag('verbose') ? 'verbose' : 'normal';
  const reporter = new Reporter(level, json);
  const started = performance.now();
  let error: unknown;
  try {
    // Skia and the canvas globals load only for the commands that measure
    // or paint text (help, pack or unpack start without them).
    const loading = performance.now();
    if (spec.canvas) await import('./env');
    reporter.timings.canvas = Math.round(performance.now() - loading);
    const mod = await spec.run();
    reporter.timings.load = Math.round(performance.now() - loading);
    await mod.default({ command: spec.name, inputs: parsed.positionals, opts, reporter });
  } catch (err) {
    error = err;
  }
  reporter.timings.total = Math.round(performance.now() - started);
  const code = error ? (error instanceof UsageError ? 2 : error instanceof CliError ? error.exitCode : 1) : reporter.exitCode;
  if (json) {
    const report = {
      ok: code === 0,
      command: spec.name,
      version: VERSION,
      ...reporter.data,
      outputs: reporter.outputs,
      warnings: reporter.warnings,
      timings: reporter.timings,
      ...(error ? { error: (error as Error).message } : {}),
      exitCode: code,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
  if (error) {
    if (!json || level !== 'quiet') printError(error, spec.name, level === 'verbose');
  }
  return code;
}

function printError(err: unknown, command: string | undefined, verbose: boolean): void {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${style.red('error')} ${message}\n`);
  if (err instanceof UsageError) process.stderr.write(`Run "postext help${command ? ` ${command}` : ''}" for the options.\n`);
  else if (!(err instanceof CliError) && verbose && err instanceof Error && err.stack) process.stderr.write(`${style.dim(err.stack)}\n`);
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    printError(err, undefined, process.argv.includes('--verbose'));
    process.exit(err instanceof UsageError ? 2 : err instanceof CliError ? err.exitCode : 1);
  });
