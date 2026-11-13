import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomFontFamily } from 'postext';
import type { CompiledBook } from './compileBook.js';
import type { CompileReply, CompileRequestMessage } from './compileProtocol.js';

// The page's side of the Books panel's compiler (#1526): the open book's
// font registry is never set to another book's, the page only rasterizes
// SVGs (the worker paints the EPUB's cover itself, #1548), and a
// compilation can be stopped.

vi.mock('postext-pdf', () => ({ rasterizeSvgWithDom: vi.fn(async () => new Uint8Array([9])) }));

const { answerCompileAsk, compileOnWorker } = await import('./compileClient.js');
const store = await import('./compileStore.js');
const { customFontsSignature, setCustomFonts } = await import('../controls/fonts/fontLoader.js');

const family = (name: string): CustomFontFamily => ({ name, variants: [{ weight: 400, style: 'normal', fileId: `${name}.ttf`, format: 'ttf' }] });
const request = { projectId: 'p2', format: 'pdf' as const, uiLocale: 'en', epubLayout: 'fixed' as const, profileBaseUrl: 'https://example.test/icc/' };
const book: CompiledBook = { bytes: new Uint8Array([37, 80, 68, 70]), fileName: 'b.pdf', mime: 'application/pdf', pages: 1, locale: 'en', warnings: [] };

/** A stand-in for the compile worker: it answers as the script says. */
class FakeWorker {
  static last: FakeWorker | null = null;
  onmessage: ((e: MessageEvent<CompileReply>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  posted: CompileRequestMessage[] = [];
  terminated = false;
  constructor(public url: URL) { FakeWorker.last = this; }
  postMessage(m: CompileRequestMessage) { this.posted.push(m); }
  terminate() { this.terminated = true; }
  reply(m: CompileReply) { this.onmessage?.({ data: m } as MessageEvent<CompileReply>); }
}

beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker);
  setCustomFonts([family('Open Book Face')], { newBook: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  store.setCompileRunner(null);
});

describe('compileOnWorker', () => {
  it('runs the compilation on its own worker, passes the progress on and answers its questions', async () => {
    const before = customFontsSignature();
    const progress: string[] = [];
    const done = compileOnWorker(request, { onProgress: (p) => progress.push(`${p.phase} ${p.done}/${p.total}`), signal: new AbortController().signal });
    const worker = FakeWorker.last!;
    expect(String(worker.url)).toMatch(/compile\.worker\.js$/);
    expect(worker.posted[0]).toEqual({ type: 'compile', request });
    worker.reply({ type: 'progress', progress: { phase: 'layout', done: 1, total: 3 } });
    worker.reply({ type: 'ask', id: 7, question: { kind: 'rasterize', svgText: '<svg/>', widthPx: 2, heightPx: 2 } });
    await vi.waitFor(() => expect(worker.posted).toContainEqual({ type: 'answer', id: 7, value: new Uint8Array([9]) }));
    worker.reply({ type: 'done', book });
    await expect(done).resolves.toBe(book);
    expect(progress).toEqual(['layout 1/3']);
    expect(worker.terminated).toBe(true);
    // The open book's registry is as it was.
    expect(customFontsSignature()).toBe(before);
  });

  it('ends the worker at once when cancelled', async () => {
    const controller = new AbortController();
    const done = compileOnWorker(request, { onProgress: () => {}, signal: controller.signal });
    controller.abort();
    await expect(done).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.last!.terminated).toBe(true);
  });

  it('rejects with the worker\'s error', async () => {
    const done = compileOnWorker(request, { onProgress: () => {}, signal: new AbortController().signal });
    FakeWorker.last!.reply({ type: 'error', message: 'Project not found' });
    await expect(done).rejects.toThrow('Project not found');
  });
});

describe('answerCompileAsk', () => {
  it('rasterizes an SVG on the page, the page\'s fonts left as they are', async () => {
    const before = customFontsSignature();
    await expect(answerCompileAsk({ kind: 'rasterize', svgText: '<svg/>', widthPx: 4, heightPx: 2 })).resolves.toEqual(new Uint8Array([9]));
    expect(customFontsSignature()).toBe(before);
  });
});

describe('the compile store', () => {
  it('compiles one book at a time and says where it stands', async () => {
    let finish: (b: CompiledBook) => void = () => {};
    store.setCompileRunner((_r, { onProgress }) => new Promise((resolve) => { onProgress({ phase: 'paginate', done: 0, total: 2 }); finish = resolve; }));
    const first = store.startCompile(request, 'Second book');
    expect(store.compileState().job).toMatchObject({ projectId: 'p2', name: 'Second book', format: 'pdf', progress: { phase: 'paginate' } });
    await expect(store.startCompile({ ...request, projectId: 'p3' }, 'Third')).rejects.toThrow(/being compiled/);
    finish(book);
    await expect(first).resolves.toBe(book);
    expect(store.compileState().job).toBeNull();
  });

  it('stops the compilation of a book being deleted, and only that one', async () => {
    store.setCompileRunner((_r, { signal }) => new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(signal.reason)); }));
    const running = store.startCompile(request, 'Second book');
    store.cancelCompileFor('p9');
    expect(store.compileState().job).not.toBeNull();
    store.cancelCompileFor('p2');
    await expect(running).rejects.toSatisfy(store.isCompileCancelled);
    expect(store.compileState()).toEqual({ job: null, failure: null });
  });

  it('keeps a failure for the panel until it is dismissed', async () => {
    store.setCompileRunner(async () => { throw new Error('boom'); });
    await expect(store.startCompile(request, 'Second book')).rejects.toThrow('boom');
    expect(store.compileState().failure).toEqual({ name: 'Second book', format: 'pdf', message: 'boom' });
    store.dismissCompileFailure();
    expect(store.compileState().failure).toBeNull();
  });

  it('gives the worker an absolute address for the output profiles', async () => {
    const runner = vi.fn(async () => book);
    store.setCompileRunner(runner);
    await store.startCompile(request, 'B');
    expect((runner.mock.calls[0] as unknown as [{ profileBaseUrl: string }])[0].profileBaseUrl).toMatch(/^[a-z]+:\/\//);
  });
});
