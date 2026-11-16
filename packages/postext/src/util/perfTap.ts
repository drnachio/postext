// Stage timing for benchmarks (#1603). Absent in normal runs: a benchmark
// sets `globalThis.__postextPerfTap` and receives the time each stage of a
// layout took, to tell where a build's time goes. Stages nest: the
// `measure.*` ones run inside `pass.blocks` (and a few inside the setup
// ones), and `kp` inside `measure.miss` and `measure.uncached`; the
// `pass.*` ones run inside `build.rounds`, which with `build.before` and
// the `post.*` ones makes a whole document build.

/** A stage of a layout, as reported to the tap. */
export type PerfStage =
  | 'pass.config' | 'pass.pageSetup' | 'pass.contentSetup' | 'pass.wiring' | 'pass.blocks' | 'pass.finish'
  | 'measure.key' | 'measure.hit' | 'measure.miss' | 'measure.uncached'
  | 'kp'
  | 'build.before' | 'build.rounds' | 'post.warnings' | 'post.marks' | 'post.fonts' | 'post.config'
  | 'bundle.flags' | 'bundle.pageIds' | 'bundle.citations' | 'bundle.provisionalOutline' | 'bundle.chapterOutline' | 'bundle.continuation' | 'bundle.bookOutline';

/** Receives the milliseconds one run of a stage took. */
export type PerfTap = (stage: PerfStage, ms: number) => void;

/** The benchmark's tap, when one is listening. */
export function perfTap(): PerfTap | undefined {
  return (globalThis as { __postextPerfTap?: PerfTap }).__postextPerfTap;
}

/** The clock stage times are read from. */
export const perfNow = (): number => performance.now();

const idle = (): void => {};

/** A lap timer over consecutive stages: each call reports the time since
 *  the one before (or since the timer was made) as `stage`. Does nothing
 *  when no benchmark listens. */
export function perfLap(): (stage: PerfStage) => void {
  const tap = perfTap();
  if (!tap) return idle;
  let last = perfNow();
  return (stage) => {
    const at = perfNow();
    tap(stage, at - last);
    last = at;
  };
}

/** `measure()` timed as `stage`, or just run when no benchmark listens. */
export function perfTimed<T>(stage: PerfStage, measure: () => T): T {
  const tap = perfTap();
  if (!tap) return measure();
  const started = perfNow();
  try {
    return measure();
  } finally {
    tap(stage, perfNow() - started);
  }
}

/** A placement pass as a benchmark sees it (#1603): the document the pass
 *  produced, before the passes after it touch anything. `doc` is typed
 *  loosely here to keep this file free of the layout's types. */
export interface PassTrace<Doc> {
  /** 1-based pass within its contents round. */
  pass: number;
  /** 0-based round of a document laying out its own contents. */
  tocRound: number;
  doc: Doc;
}

/** The benchmark's pass tap, when one is listening
 *  (`globalThis.__postextPassTap`): two engine cores are compared pass by
 *  pass through it, far finer than by the hash of the finished layout. */
export function passTap<Doc>(): ((trace: PassTrace<Doc>) => void) | undefined {
  return (globalThis as { __postextPassTap?: (trace: PassTrace<Doc>) => void }).__postextPassTap;
}
