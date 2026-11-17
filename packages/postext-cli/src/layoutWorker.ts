// A layout worker (#1611): opens the book the main thread opened and lays
// out the chapters it is sent (`layoutPool.ts`).

import './env';
import { createMeasurementCache } from 'postext';
import { layOutChapter, type ChapterLayoutContext } from 'postext/bundle';
import { Options } from './args';
import type { CommandContext } from './context';
import { layoutInputsKey, type PoolRequest, type PoolResponse } from './layoutPool';
import { prepareEngines, selectChapters, shapedBySkia } from './layout';
import { Reporter } from './log';
import { openBook } from './session';

declare const self: Worker;

const send = (message: PoolResponse): void => self.postMessage(message);
const text = (err: unknown): string => (err instanceof Error ? err.message : String(err));

let context: ChapterLayoutContext | undefined;
// One message at a time, in the order they came: opening the book is
// asynchronous and the chapters wait for it.
let queue: Promise<void> = Promise.resolve();

async function handle(message: PoolRequest): Promise<void> {
  if (message.kind === 'open') {
    try {
      const opts = new Options(message.options);
      const reporter = new Reporter('quiet', true);
      const ctx: CommandContext = { command: message.command, inputs: message.inputs, opts, reporter };
      const { book } = await openBook(ctx);
      await prepareEngines(selectChapters(book, opts).map((c) => c.markdown), book, reporter);
      const config = shapedBySkia(book.config);
      context = { config, resources: book.resources, cache: createMeasurementCache() };
      send({ kind: 'opened', key: layoutInputsKey(config, book.resources) });
    } catch (err) {
      send({ kind: 'error', message: text(err) });
    }
    return;
  }
  try {
    if (!context) throw new Error('no book open');
    send({ kind: 'laid', id: message.id, record: layOutChapter(message.job, context) });
  } catch (err) {
    send({ kind: 'error', id: message.id, message: text(err) });
  }
}

self.addEventListener('message', (event: MessageEvent<PoolRequest>) => {
  queue = queue.then(() => handle(event.data));
});
