// Terminal output. Messages go to stderr so stdout stays free for data:
// the JSON report (`--json`) or a file written to `-o -`.

const useColor = (): boolean => {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return false;
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '0') return true;
  return !!process.stderr.isTTY;
};

let colorOn = useColor();

export function setColor(on: boolean | undefined): void {
  if (on !== undefined) colorOn = on;
}

const paint = (open: number, close: number) => (text: string) => (colorOn ? `\x1b[${open}m${text}\x1b[${close}m` : text);

export const style = {
  bold: paint(1, 22),
  dim: paint(2, 22),
  red: paint(31, 39),
  yellow: paint(33, 39),
  green: paint(32, 39),
  cyan: paint(36, 39),
};

export interface Warning {
  /** What kind of problem (`missingFont`, `unknownResource`, `pdf.fontFallback`…). */
  kind: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  /** Where in the sources, when known: `chapters/02.md:14`. */
  at?: string;
  page?: string;
}

export interface OutputRecord {
  kind: string;
  path: string;
  bytes?: number;
  pages?: number;
}

export type LogLevel = 'quiet' | 'normal' | 'verbose';

/** Collects what a run did (for `--json`) and prints it as it goes. */
export class Reporter {
  readonly warnings: Warning[] = [];
  readonly outputs: OutputRecord[] = [];
  readonly timings: Record<string, number> = {};
  readonly data: Record<string, unknown> = {};
  /** Exit code of a run that finished but found problems (`check`: 3). */
  exitCode = 0;
  private readonly seen = new Set<string>();

  constructor(readonly level: LogLevel, readonly json: boolean) {}

  info(message: string): void {
    if (this.level !== 'quiet') process.stderr.write(`${message}\n`);
  }

  detail(message: string): void {
    if (this.level === 'verbose') process.stderr.write(`${style.dim(message)}\n`);
  }

  warn(w: Warning): void {
    const key = `${w.kind}|${w.message}|${w.at ?? ''}|${w.page ?? ''}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.warnings.push(w);
    if (this.level === 'quiet' && w.severity !== 'error') return;
    // A long run of the same kind is summarised unless --verbose.
    const sameKind = this.warnings.filter((x) => x.kind === w.kind).length;
    if (this.level !== 'verbose' && sameKind > 5) {
      if (sameKind === 6) process.stderr.write(`${style.dim(`  … more "${w.kind}" warnings (--verbose shows them all)`)}\n`);
      return;
    }
    const tag = w.severity === 'error' ? style.red('error') : w.severity === 'warning' ? style.yellow('warning') : style.cyan('note');
    const where = [w.at, w.page ? `page ${w.page}` : undefined].filter(Boolean).join(', ');
    process.stderr.write(`${tag} ${style.dim(w.kind)}${where ? ` ${style.dim(`(${where})`)}` : ''}: ${w.message}\n`);
  }

  output(record: OutputRecord): void {
    this.outputs.push(record);
    if (record.path === '-') return;
    const size = record.bytes !== undefined ? ` ${style.dim(formatBytes(record.bytes))}` : '';
    const pages = record.pages !== undefined ? ` ${style.dim(`${record.pages} pages`)}` : '';
    this.info(`${style.green('wrote')} ${record.path}${pages}${size}`);
  }

  time<T>(name: string, fn: () => T): T {
    const t0 = performance.now();
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(() => {
        this.timings[name] = round(performance.now() - t0);
      }) as T;
    }
    this.timings[name] = round(performance.now() - t0);
    return result;
  }

  errorCount(): number {
    return this.warnings.filter((w) => w.severity === 'error').length;
  }
}

const round = (ms: number) => Math.round(ms * 10) / 10;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
