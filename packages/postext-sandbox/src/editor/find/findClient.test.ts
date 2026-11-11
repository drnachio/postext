import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { Worker as NodeWorker } from 'node:worker_threads';
import { DEFAULT_FIND_OPTIONS } from '../../book/find/compile.js';
import { createFindSession } from '../../book/find/session.js';
import { createFindClient, type FindClient, type FindWorkerLike } from './findClient.js';

// The find bar's searches run in a worker that the page ends when a search
// takes too long: a regular expression with catastrophic backtracking
// cannot be stopped from inside one `exec`.

const clients: FindClient[] = [];
afterEach(() => {
  for (const c of clients.splice(0)) c.dispose();
});

/** A worker in this process that answers on the next turn. */
function fakeWorker(log: unknown[]): FindWorkerLike {
  const session = createFindSession();
  const w: FindWorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: (m) => {
      log.push(m);
      const { seq, request } = m as { seq: number; request: Parameters<typeof session.run>[0] };
      setTimeout(() => w.onmessage?.({ data: { seq, outcome: session.run(request) } }), 0);
    },
    terminate: () => { log.push('terminated'); },
  };
  return w;
}

/** A real thread (Node's worker_threads, standing in for a Web Worker)
 *  that runs the query on the first text, as the find worker does. */
function threadWorker(): FindWorkerLike {
  const code = `
    const { parentPort } = require('node:worker_threads');
    parentPort.on('message', ({ seq, request }) => {
      const re = new RegExp(request.query, 'gmu');
      re.test(request.texts[0].text);
      parentPort.postMessage({ seq, outcome: { results: [], stopped: null } });
    });`;
  const t = new NodeWorker(code, { eval: true });
  const w: FindWorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: (m) => t.postMessage(m),
    terminate: () => { void t.terminate(); },
  };
  t.on('message', (data: unknown) => w.onmessage?.({ data }));
  t.on('error', (e: unknown) => w.onerror?.(e));
  return w;
}

const search = (query: string, chapters: { id: string; text: string }[], regex = false) => ({
  query, options: { ...DEFAULT_FIND_OPTIONS, regex }, chapters,
});

describe('the find client', () => {
  it('sends a chapter\'s text only when it changed', async () => {
    const log: unknown[] = [];
    const client = createFindClient({ spawn: () => fakeWorker(log) });
    clients.push(client);
    const book = [{ id: 'a', text: 'uno' }, { id: 'b', text: 'dos uno' }];
    expect(await client.search(search('uno', book))).toMatchObject({ results: [{ chapterId: 'a' }, { chapterId: 'b' }], stopped: null });
    await client.search(search('uno', [book[0]!, { id: 'b', text: 'dos' }]));
    const sent = log.map((m) => (m as { request: { texts: { id: string }[] } }).request.texts.map((t) => t.id));
    expect(sent).toEqual([['a', 'b'], ['b']]);
  });

  it('answers superseded for a request replaced before it ran', async () => {
    const client = createFindClient({ spawn: () => fakeWorker([]) });
    clients.push(client);
    const book = [{ id: 'a', text: 'uno' }];
    const first = client.search(search('u', book));
    const second = client.search(search('un', book));
    const third = client.search(search('uno', book));
    expect(await first).toMatchObject({ stopped: null });
    expect(await second).toEqual({ superseded: true });
    expect(await third).toMatchObject({ results: [{ chapterId: 'a', matches: [{ from: 0, to: 3 }] }] });
  });

  it('ends a worker stuck in backtracking, keeps the page responsive, and searches again with a fresh one', async () => {
    let spawned = 0;
    const client = createFindClient({ spawn: () => (spawned++ === 0 ? threadWorker() : fakeWorker([])), hardLimitMs: 300 });
    clients.push(client);
    let ticks = 0;
    const timer = setInterval(() => ticks++, 20);
    const started = Date.now();
    const stuck = await client.search(search('(a+)+$', [{ id: 'a', text: `${'a'.repeat(40)}!` }], true));
    clearInterval(timer);
    expect(stuck).toEqual({ results: [], stopped: 'timeout' });
    expect(Date.now() - started).toBeLessThan(2000);
    // The page went on running while the worker was stuck.
    expect(ticks).toBeGreaterThan(5);
    const next = await client.search(search('a', [{ id: 'a', text: 'abc' }]));
    expect(spawned).toBe(2);
    expect(next).toMatchObject({ results: [{ chapterId: 'a' }] });
  });

  it('searches in the page where there is no worker', async () => {
    const client = createFindClient({ spawn: () => null });
    clients.push(client);
    expect(await client.search(search('o', [{ id: 'a', text: 'no' }]))).toMatchObject({ results: [{ chapterId: 'a' }] });
  });
});
