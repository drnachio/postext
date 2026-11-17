// The chapters of a long book laid out on several threads (#1611). Each
// worker (`layoutWorker.ts`) opens the book as this thread did — the same
// inputs and options, so the same configuration, resources, fonts and
// hyphenation — keeps a measurement cache of its own, and lays out the
// chapters it is sent; `buildBundleParallel` chains them and settles the
// pages, and gives the documents a layout on one thread gives.

import { buildBundleParallel, type BundleLayoutCache, type ChapterLayoutJob, type ChapterRecord } from 'postext/bundle';
import type { PostextConfig, Resource, VDTDocument } from 'postext';
import { availableParallelism } from 'node:os';
import { UsageError, type OptionValue, type Options } from './args';
import type { Book, BookChapter } from './input';

/** What a worker needs to open the book this thread opened. */
export interface LayoutSource {
  command: string;
  inputs: string[];
}

export type PoolRequest =
  | { kind: 'open'; command: string; inputs: string[]; options: Record<string, OptionValue> }
  | { kind: 'lay'; id: number; job: ChapterLayoutJob };

export type PoolResponse =
  | { kind: 'opened'; key: string }
  | { kind: 'laid'; id: number; record: ChapterRecord }
  | { kind: 'error'; id?: number; message: string };

/** Text below which a book is laid out on one thread: starting the
 *  workers and warming each one up costs more than it saves. */
const MIN_CHARACTERS = 2_000_000;
const MIN_CHAPTERS = 8;
const MAX_WORKERS = 8;

/** A fingerprint of what every chapter is laid out with: a worker whose
 *  book gives another one did not open the book this thread opened. */
export function layoutInputsKey(config: PostextConfig, resources: readonly Resource[]): string {
  const text = JSON.stringify([config, resources.map(({ createdAt: _c, updatedAt: _u, ...rest }) => rest)]);
  return `${text.length}:${Bun.hash(text).toString(36)}`;
}

/** How many workers lay `chapters` out (0: this thread alone): `--threads
 *  N`, or with `--threads auto` as many as the machine has cores to spare
 *  for a book long enough. Without the option a book is laid out on one
 *  thread, and so is one that cannot be opened again (read from standard
 *  input) and a layout that keeps its chapters between runs (--watch). */
export function poolSize(opts: Options, chapters: readonly BookChapter[], source: LayoutSource | undefined, watching: boolean): number {
  if (!source || watching || source.inputs.length === 0 || source.inputs.includes('-')) return 0;
  const asked = opts.string('threads');
  if (asked === undefined) return 0;
  if (asked !== 'auto') {
    const n = Number(asked);
    if (!Number.isInteger(n) || n < 1) throw new UsageError(`--threads takes a whole number or "auto" (got "${asked}")`);
    return n > 1 ? Math.min(n, chapters.length) : 0;
  }
  const characters = chapters.reduce((n, c) => n + c.markdown.length, 0);
  if (chapters.length < MIN_CHAPTERS || characters < MIN_CHARACTERS) return 0;
  const workers = Math.min(MAX_WORKERS, availableParallelism() - 1, chapters.length);
  return workers > 1 ? workers : 0;
}

/** Lay `chapters` out on `size` workers. Rejects when a worker cannot be
 *  started, opens another book or fails on a chapter: the caller lays the
 *  book out on its own thread instead. */
export async function layOutOnWorkers(
  bundle: { chapters: BookChapter[]; config: PostextConfig; resources: Resource[]; start?: Book['start'] },
  source: LayoutSource,
  opts: Options,
  size: number,
  layoutCache?: BundleLayoutCache,
): Promise<VDTDocument[]> {
  const workers = Array.from({ length: size }, () => new Worker(new URL('./layoutWorker.ts', import.meta.url).href));
  try {
    const waiting = new Map<number, { resolve: (record: ChapterRecord) => void; reject: (err: Error) => void }>();
    let failed: Error | undefined;
    const fail = (err: Error) => {
      failed ??= err;
      for (const w of waiting.values()) w.reject(failed);
      waiting.clear();
    };
    const key = layoutInputsKey(bundle.config, bundle.resources);
    await Promise.all(workers.map((worker) => new Promise<void>((resolve, reject) => {
      worker.addEventListener('error', (event) => {
        const err = new Error(`layout worker: ${(event as ErrorEvent).message ?? 'failed'}`);
        fail(err);
        reject(err);
      });
      worker.addEventListener('message', (event: MessageEvent<PoolResponse>) => {
        const message = event.data;
        if (message.kind === 'opened') {
          if (message.key === key) resolve();
          else reject(new Error('layout worker: the book it opened is not the one being laid out'));
        } else if (message.kind === 'laid') {
          waiting.get(message.id)?.resolve(message.record);
          waiting.delete(message.id);
        } else {
          const err = new Error(`layout worker: ${message.message}`);
          fail(err);
          reject(err);
        }
      });
      worker.postMessage({ kind: 'open', command: source.command, inputs: source.inputs, options: opts.values } satisfies PoolRequest);
    })));
    // A chapter goes to the same worker every time, which has its
    // paragraphs measured from the time before: the longest chapters
    // first, each to the worker with the least text so far.
    const owner: number[] = [];
    const load = new Array<number>(size).fill(0);
    const byLength = bundle.chapters.map((c, i) => [c.markdown.length, i] as const).sort((a, b) => b[0] - a[0]);
    for (const [length, index] of byLength) {
      const worker = load.indexOf(Math.min(...load));
      load[worker]! += length;
      owner[index] = worker;
    }
    let nextId = 0;
    const layOutChapters = (jobs: ChapterLayoutJob[]): Promise<ChapterRecord[]> => Promise.all(jobs.map((job) => new Promise<ChapterRecord>((resolve, reject) => {
      if (failed) {
        reject(failed);
        return;
      }
      const id = nextId++;
      waiting.set(id, { resolve, reject });
      workers[owner[job.index] ?? 0]!.postMessage({ kind: 'lay', id, job } satisfies PoolRequest);
    })));
    return await buildBundleParallel(
      { chapters: bundle.chapters, config: bundle.config, resources: bundle.resources, ...(bundle.start ? { start: bundle.start } : {}) },
      { layOutChapters, ...(layoutCache ? { layoutCache } : {}) },
    );
  } finally {
    for (const worker of workers) worker.terminate();
  }
}
