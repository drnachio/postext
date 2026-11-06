import { describe, it, expect, afterEach } from 'vitest';
import { createPdfWorker } from '../worker/client.js';

// #1433: a font or picture answer that arrives after the handle was
// disposed is dropped. Sending it threw "PDF worker has been disposed",
// and the error path sent again and threw again, unhandled.

type Listener = (event: { data: unknown }) => void;

class FakeWorker {
  posted: { kind: string }[] = [];
  private listeners: Listener[] = [];
  addEventListener(type: string, fn: Listener): void {
    if (type === 'message') this.listeners.push(fn);
  }
  postMessage(data: { kind: string }): void { this.posted.push(data); }
  terminate(): void {}
  emit(data: unknown): void { for (const fn of this.listeners) fn({ data }); }
}

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
process.on('unhandledRejection', onUnhandled);
afterEach(() => { unhandled.length = 0; });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createPdfWorker after dispose (#1433)', () => {
  it.each([
    ['a font', (finish: { resolve: (v: Uint8Array) => void }) => finish.resolve(new Uint8Array([1, 2, 3]))],
    ['a failed font', (finish: { reject: (e: Error) => void }) => finish.reject(new Error('network'))],
  ] as const)('drops %s answer that arrives after the handle was disposed', async (_label, settle) => {
    const worker = new FakeWorker();
    const handle = createPdfWorker({ worker: worker as unknown as Worker });
    let finish!: { resolve: (v: Uint8Array) => void; reject: (e: Error) => void };
    const font = new Promise<Uint8Array>((resolve, reject) => { finish = { resolve, reject }; });
    const rendered = handle.render([], { fontProvider: () => font }).catch((err: unknown) => err);
    worker.emit({ kind: 'font', askId: 1, family: 'Lora', weight: 400, style: 'normal' });
    handle.dispose();
    (settle as (f: typeof finish) => void)(finish);
    await tick();
    await tick();
    expect((await rendered as Error).name).toBe('AbortError');
    expect(worker.posted.map((m) => m.kind)).toEqual(['render', 'dispose']);
    expect(unhandled).toEqual([]);
  });
});
