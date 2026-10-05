import { describe, it, expect, afterEach } from 'vitest';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import type { VDTDocument } from 'postext';
import { renderToEpub, readEpub } from '../index';
import type { EpubProgress, EpubWarning } from '../types';
import { LORA, PNG, sampleBook } from '../__tests__/sampleBook';
import { createEpubWorker, gatherResourceBytes, transferablesOf, EpubWorkerError } from './client';
import { serveEpubRequests, type EpubWorkerPort } from './serve';
import { cdnWorkerEntryUrl } from './entryUrl';

const MODIFIED = new Date(Date.UTC(2026, 9, 4));
const metadata = { title: 'Sample book', creators: ['Ada Lovelace'], language: 'en-US', modified: MODIFIED };

/** A Worker stand-in: the client talks to one end of a channel, the
 *  worker code serves the other, as it would in a real worker. */
class ChannelWorker extends EventTarget {
  terminated = false;
  readonly posted: unknown[] = [];
  private readonly port: MessagePort;
  constructor(serve = true) {
    super();
    const { port1, port2 } = new MessageChannel();
    this.port = port1;
    port1.on('message', (data) => this.dispatchEvent(new MessageEvent('message', { data })));
    if (serve) {
      const workerSide: EpubWorkerPort = {
        postMessage: (msg, transfer) => port2.postMessage(msg, transfer as never),
        addEventListener: (_type, listener) => port2.on('message', (data) => listener(new MessageEvent('message', { data }))),
        close: () => port2.close(),
      };
      serveEpubRequests(workerSide);
    }
  }
  postMessage(msg: unknown, transfer?: Transferable[]): void {
    this.posted.push(msg);
    this.port.postMessage(msg, (transfer ?? []) as never);
  }
  terminate(): void {
    this.terminated = true;
    this.port.close();
  }
}

const asWorker = (w: ChannelWorker): Worker => w as unknown as Worker;

let docs: VDTDocument[] | null = null;
const book = (): VDTDocument[] => (docs ??= sampleBook());

const handles: { dispose(): void }[] = [];
afterEach(() => {
  for (const h of handles.splice(0)) h.dispose();
});

describe('gatherResourceBytes', () => {
  it('asks the provider once for every picture the pages place', async () => {
    const asked: string[] = [];
    const found = await gatherResourceBytes(book(), (fileId) => {
      asked.push(fileId);
      return fileId === 'f1.png' ? { bytes: PNG, mediaType: 'image/png' } : undefined;
    });
    expect(asked).toEqual(['f1.png']);
    expect(found).toEqual([['f1.png', { bytes: PNG, mediaType: 'image/png' }]]);
  });

  it('takes a map as it is', async () => {
    const map = new Map([['a', { bytes: PNG, mediaType: 'image/png' }]]);
    expect(await gatherResourceBytes(book(), map)).toEqual([['a', { bytes: PNG, mediaType: 'image/png' }]]);
    expect(await gatherResourceBytes(book(), undefined)).toEqual([]);
  });
});

describe('transferablesOf', () => {
  it('lists each buffer of the fonts, pictures and cover once', () => {
    const shared = new Uint8Array(8);
    const font = { family: 'A', weight: 400, style: 'normal' as const, format: 'ttf' as const };
    const buffers = transferablesOf(
      {
        fonts: [{ ...font, bytes: shared.subarray(0, 4) }, { ...font, bytes: shared.subarray(4) }],
        cover: { bytes: new Uint8Array(2), mediaType: 'image/png' },
      },
      [['x', { bytes: new Uint8Array(3), mediaType: 'image/png' }], ['y', { bytes: new Uint8Array(0), mediaType: 'image/png' }]],
    );
    expect(buffers.map((b) => b.byteLength)).toEqual([8, 3, 2]);
  });
});

describe('createEpubWorker', () => {
  it('writes the same book as renderToEpub, with progress and warnings', async () => {
    const options = {
      layout: 'fixed' as const,
      metadata,
      fonts: [{ family: 'Lora', weight: 400, style: 'normal' as const, bytes: LORA, format: 'ttf' as const }],
    };
    const direct = await renderToEpub(book(), {
      ...options,
      resourceBytes: (fileId) => (fileId === 'f1.png' ? { bytes: PNG, mediaType: 'image/png' } : undefined),
    });

    const handle = createEpubWorker({ worker: asWorker(new ChannelWorker()) });
    handles.push(handle);
    const progress: EpubProgress[] = [];
    const warnings: EpubWarning[] = [];
    const fontBytes = LORA.slice();
    const bytes = await handle.render(book(), {
      ...options,
      fonts: [{ ...options.fonts[0]!, bytes: fontBytes }],
      resourceBytes: (fileId) => (fileId === 'f1.png' ? { bytes: PNG.slice(), mediaType: 'image/png' } : undefined),
      onProgress: (p) => progress.push(p),
      onWarning: (w) => warnings.push(w),
    });
    expect(bytes).toEqual(direct);
    // The font went over by transfer.
    expect(fontBytes.byteLength).toBe(0);
    expect(progress.at(-1)).toEqual({ phase: 'package', done: 1, total: 1 });
    expect(progress.some((p) => p.phase === 'documents')).toBe(true);
    // The sample sets its footer in the default face, which is not embedded.
    expect(warnings.some((w) => w.kind === 'missingFont')).toBe(true);
    expect(readEpub(bytes).layout).toBe('fixed');
  });

  it('writes a reflowable book with a picture map and a cover', async () => {
    const handle = createEpubWorker({ worker: asWorker(new ChannelWorker()) });
    handles.push(handle);
    const bytes = await handle.render(book(), {
      layout: 'reflowable',
      metadata,
      resourceBytes: new Map([['f1.png', { bytes: PNG.slice(), mediaType: 'image/png' }]]),
      cover: { bytes: PNG.slice(), mediaType: 'image/png' },
    });
    const epub = readEpub(bytes);
    expect(epub.layout).toBe('reflowable');
    expect(epub.coverPath).toBeDefined();
    expect([...epub.files.keys()].some((p) => p.includes('images/f1'))).toBe(true);
  });

  it('rejects at once on abort and ends a worker of its own', async () => {
    const made: ChannelWorker[] = [];
    const handle = createEpubWorker({ worker: () => { const w = new ChannelWorker(); made.push(w); return asWorker(w); } });
    handles.push(handle);
    const controller = new AbortController();
    // Stopped as soon as the worker says it has started.
    const pending = handle.render(book(), { layout: 'fixed', metadata, signal: controller.signal, onProgress: () => controller.abort() });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(made).toHaveLength(1);
    expect(made[0]!.terminated).toBe(true);
    expect(made[0]!.posted.some((m) => (m as { kind: string }).kind === 'cancel')).toBe(true);
    // The next render starts a fresh worker.
    const bytes = await handle.render(book(), { layout: 'reflowable', metadata });
    expect(readEpub(bytes).layout).toBe('reflowable');
    expect(made).toHaveLength(2);
  });

  it('only asks a given worker to stop', async () => {
    const w = new ChannelWorker();
    const handle = createEpubWorker({ worker: asWorker(w) });
    handles.push(handle);
    const controller = new AbortController();
    // Stopped as soon as the worker says it has started.
    const pending = handle.render(book(), { layout: 'fixed', metadata, signal: controller.signal, onProgress: () => controller.abort() });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(w.terminated).toBe(false);
    const bytes = await handle.render(book(), { layout: 'fixed', metadata });
    expect(readEpub(bytes).layout).toBe('fixed');
  });

  it('turns a worker failure into an EpubWorkerError', async () => {
    const w = new ChannelWorker(false);
    const handle = createEpubWorker({ worker: asWorker(w) });
    handles.push(handle);
    const pending = handle.render(book(), { layout: 'fixed', metadata });
    await new Promise((r) => setTimeout(r, 0));
    const event = Object.assign(new Event('error', { cancelable: true }), { message: 'failed to load' });
    w.dispatchEvent(event);
    await expect(pending).rejects.toBeInstanceOf(EpubWorkerError);
  });

  it('reports a worker that cannot be made as an EpubWorkerError', async () => {
    const handle = createEpubWorker({ worker: () => { throw new Error('Module scripts are not supported'); } });
    handles.push(handle);
    await expect(handle.render(book(), { layout: 'fixed', metadata })).rejects.toBeInstanceOf(EpubWorkerError);
  });

  it('refuses work once disposed', async () => {
    const handle = createEpubWorker({ worker: asWorker(new ChannelWorker()) });
    handle.dispose();
    await expect(handle.render(book(), { layout: 'fixed', metadata })).rejects.toThrow(/disposed/);
  });
});

describe('cdnWorkerEntryUrl', () => {
  it('finds the worker entry of an esm.sh build on another origin', () => {
    expect(cdnWorkerEntryUrl('https://esm.sh/postext-epub@0.1.0/es2022/worker.mjs', 'https://app.example'))
      .toBe('https://esm.sh/postext-epub@0.1.0/worker/entry');
    expect(cdnWorkerEntryUrl('https://cdn.example/esm/postext-epub@1.0.0-beta.1/esnext/dist/worker/client.js', undefined))
      .toBe('https://cdn.example/esm/postext-epub@1.0.0-beta.1/worker/entry');
  });

  it('handles the esm.sh URLs of ?deps= and the external-all *postext-epub form', () => {
    // `?deps=postext@…` (what a pen pins) adds an `X-…` segment after the version.
    expect(cdnWorkerEntryUrl('https://esm.sh/postext-epub@0.1.0/X-ZHBvc3RleHRAMS4xNS4w/es2022/worker.mjs', 'https://app.example'))
      .toBe('https://esm.sh/postext-epub@0.1.0/worker/entry');
    expect(cdnWorkerEntryUrl('https://esm.sh/*postext-epub@0.1.0/es2022/worker.mjs', 'https://app.example'))
      .toBe('https://esm.sh/postext-epub@0.1.0/worker/entry');
    // postext's own modules, and another package ending in the name, are not this one.
    expect(cdnWorkerEntryUrl('https://esm.sh/postext@1.15.0/es2022/worker.mjs', 'https://app.example')).toBeNull();
    expect(cdnWorkerEntryUrl('https://esm.sh/my-postext-epub@1.0.0/es2022/worker.mjs', 'https://app.example')).toBeNull();
  });

  it('leaves bundled, same-origin and unrecognised module URLs to the default', () => {
    expect(cdnWorkerEntryUrl('file:///repo/node_modules/postext-epub/dist/worker/client.js', 'https://app.example')).toBeNull();
    expect(cdnWorkerEntryUrl('https://app.example/_next/static/chunks/postext-epub@0.1.0/es2022/x.js', 'https://app.example')).toBeNull();
    expect(cdnWorkerEntryUrl('https://cdn.jsdelivr.net/npm/postext-epub@0.1.0/dist/worker/client.js', 'https://app.example')).toBeNull();
  });
});
