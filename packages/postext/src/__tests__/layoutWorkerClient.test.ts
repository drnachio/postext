import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLayoutWorker } from '../worker/client';
import { cdnWorkerEntryUrl } from '../worker/entryUrl';
import { documentFontFamilies, fontFaceDescriptors, unavailableFontFamilies } from '../worker/fonts';
import { buildDocument } from '../pipeline';
import type { ResponseMessage } from '../worker/protocol';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

/** A stand-in for `Worker`: records how it was started and lets a test
 *  post messages back to the client. */
class FakeWorker {
  static started: { url: string; options?: WorkerOptions }[] = [];
  static last: FakeWorker | null = null;
  listeners = new Map<string, ((event: unknown) => void)[]>();
  sent: unknown[] = [];
  constructor(url: string | URL, options?: WorkerOptions) {
    FakeWorker.started.push({ url: String(url), options });
    FakeWorker.last = this;
  }
  addEventListener(type: string, fn: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  postMessage(msg: unknown) { this.sent.push(msg); }
  terminate() {}
  reply(msg: ResponseMessage) { for (const fn of this.listeners.get('message') ?? []) fn({ data: msg }); }
}

const g = globalThis as unknown as { Worker?: unknown; location?: unknown };

describe('createLayoutWorker', () => {
  beforeEach(() => {
    FakeWorker.started = [];
    g.Worker = FakeWorker;
    g.location = { origin: 'https://app.example', href: 'https://app.example/editor/' };
  });
  afterEach(() => {
    delete g.Worker;
    delete g.location;
    vi.restoreAllMocks();
  });

  it('starts a worker entry on another origin (a CDN) through a same-origin blob module', async () => {
    const blobs: Blob[] = [];
    const create = URL.createObjectURL;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { blobs.push(blob as Blob); return create(blob as Blob); });
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const layout = createLayoutWorker({ url: 'https://esm.sh/postext@1.4.2/worker/entry' });
    expect(FakeWorker.started).toHaveLength(1);
    expect(FakeWorker.started[0]!.url).toMatch(/^blob:/);
    expect(FakeWorker.started[0]!.options).toEqual({ type: 'module' });
    expect(await blobs[0]!.text()).toBe('import "https://esm.sh/postext@1.4.2/worker/entry";\n');
    layout.dispose();
    expect(revoke).toHaveBeenCalledWith(FakeWorker.started[0]!.url);
  });

  it('starts a same-origin worker entry directly', () => {
    createLayoutWorker({ url: '/assets/postext-worker.js' }).dispose();
    expect(FakeWorker.started).toEqual([{ url: 'https://app.example/assets/postext-worker.js', options: { type: 'module' } }]);
  });

  it('still starts the worker file next to the client by default (bundlers rewrite that URL)', () => {
    createLayoutWorker().dispose();
    expect(FakeWorker.started).toHaveLength(1);
    expect(FakeWorker.started[0]!.url).toMatch(/\/worker\/layout\.worker\.js$/);
  });

  it('accepts numeric font weights', async () => {
    const layout = createLayoutWorker({ worker: new FakeWorker('x') as unknown as Worker });
    const registered = layout.registerFonts([{ family: 'EB Garamond', weight: 700, style: 'italic', buffer: new ArrayBuffer(8) }]);
    expect((FakeWorker.last!.sent[0] as { faces: { weight: unknown }[] }).faces[0]!.weight).toBe('700');
    expect(fontFaceDescriptors({ weight: 700, style: 'italic' })).toEqual({ weight: '700', style: 'italic', unicodeRange: undefined });
    expect(fontFaceDescriptors({ weight: '400', style: 'normal', unicodeRange: 'U+0000-00FF' })).toEqual({ weight: '400', style: 'normal', unicodeRange: 'U+0000-00FF' });
    layout.dispose();
    await expect(registered).rejects.toThrow('Worker disposed');
  });

  it('warns once per family the worker had to measure with a fallback font', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fake = new FakeWorker('x');
    const layout = createLayoutWorker({ worker: fake as unknown as Worker });
    const doc = buildDocument({ markdown: 'Text.' });
    for (let round = 0; round < 2; round++) {
      const built = layout.build({ markdown: 'Text.' });
      const id = (fake.sent.at(-1) as { id: number }).id;
      fake.reply({ kind: 'built', id, doc, stats: { passes: [], totalMs: 1, missingFonts: ['EB Garamond'] } });
      await built;
    }
    const calls = warn.mock.calls.filter((c) => String(c[0]).includes('EB Garamond'));
    expect(calls).toHaveLength(1);
    expect(String(calls[0]![0])).toContain('registerFonts');
    layout.dispose();
  });
});

describe('cdnWorkerEntryUrl', () => {
  it('finds the worker entry of an esm.sh-style build on another origin', () => {
    expect(cdnWorkerEntryUrl('https://esm.sh/postext@1.4.2/es2022/worker.mjs', 'https://app.example'))
      .toBe('https://esm.sh/postext@1.4.2/worker/entry');
    expect(cdnWorkerEntryUrl('https://esm.sh/postext@1.4.2/es2022/worker.bundle.mjs', 'https://app.example'))
      .toBe('https://esm.sh/postext@1.4.2/worker/entry');
    expect(cdnWorkerEntryUrl('https://cdn.example/esm/postext@2.0.0-beta.1/esnext/dist/worker/client.js', undefined))
      .toBe('https://cdn.example/esm/postext@2.0.0-beta.1/worker/entry');
  });

  it('handles the esm.sh URLs of ?deps=, ?external=, ?alias= and the external-all *postext form', () => {
    // `?deps=` / `?external=` / `?alias=` add an `X-…` segment after the
    // version; `*postext` marks every dependency external. A module worker
    // has no import map, so the worker entry is always the plain build.
    expect(cdnWorkerEntryUrl('https://esm.sh/postext@1.4.2/X-ZGZmbGF0ZUAwLjguMg/es2022/worker.mjs', 'https://app.example'))
      .toBe('https://esm.sh/postext@1.4.2/worker/entry');
    expect(cdnWorkerEntryUrl('https://esm.sh/postext@1.4.2/X-ZWZmbGF0ZQ/es2022/worker.development.mjs', 'https://app.example'))
      .toBe('https://esm.sh/postext@1.4.2/worker/entry');
    expect(cdnWorkerEntryUrl('https://esm.sh/*postext@1.4.2/es2022/worker.mjs', 'https://app.example'))
      .toBe('https://esm.sh/postext@1.4.2/worker/entry');
    expect(cdnWorkerEntryUrl('https://esm.sh/v135/*postext@1.4.2/X-YWZmbGF0ZTpmZmxhdGVAMC44LjE/esnext/worker.mjs', 'https://app.example'))
      .toBe('https://esm.sh/v135/postext@1.4.2/worker/entry');
    // Another package whose name ends in "postext" is not this one.
    expect(cdnWorkerEntryUrl('https://esm.sh/notpostext@1.0.0/es2022/worker.mjs', 'https://app.example')).toBeNull();
  });

  it('leaves bundled, same-origin and unrecognised module URLs to the default', () => {
    expect(cdnWorkerEntryUrl('file:///repo/node_modules/postext/dist/worker/client.js', 'https://app.example')).toBeNull();
    expect(cdnWorkerEntryUrl('https://app.example/_next/static/chunks/postext@1.4.2/es2022/x.js', 'https://app.example')).toBeNull();
    expect(cdnWorkerEntryUrl('https://cdn.jsdelivr.net/npm/postext@1.4.2/dist/worker/client.js', 'https://app.example')).toBeNull();
  });
});

describe('worker font check', () => {
  it('lists the families the laid-out text uses', () => {
    const doc = buildDocument(
      { markdown: '# Title\n\nBody *text* here.' },
      { bodyText: { fontFamily: 'EB Garamond' }, headings: { fontFamily: 'Optima 105' } },
    );
    const families = documentFontFamilies(doc);
    expect(families).toContain('EB Garamond');
    expect(families).toContain('Optima 105');
  });

  it('reports a family whose text measures like the generic fallbacks', () => {
    // A measurer where only "Installed Sans" changes the width.
    const measure = (font: string, text: string) => text.length * (font.includes('Installed Sans') ? 9 : 7);
    expect(unavailableFontFamilies(['Installed Sans', 'Web Font Serif'], measure)).toEqual(['Web Font Serif']);
  });
});
