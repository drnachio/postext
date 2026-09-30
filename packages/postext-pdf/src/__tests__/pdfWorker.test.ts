import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { parseFontString } from '../fontString';
import type { PdfFontFallbackWarning, PdfWarning, RenderProgress } from '../pdf-backend';
import type { createPdfWorker as CreatePdfWorker } from '../worker/client';

// EF-52: `postext-pdf/worker` end to end, with the worker run in-process
// behind a message channel that clones every message the way a real
// worker boundary does. The host answers the worker's font questions and
// receives its progress and warnings.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const face = fontkit.create(fontBytes);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    return { width: (face.layout(s).advanceWidth / face.unitsPerEm) * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

type Listener = (event: { data: unknown }) => void;

/** One end of a message channel: messages posted here reach the other end
 *  on a later task, structured-cloned. */
class Port {
  other!: Port;
  private listeners: Listener[] = [];
  addEventListener(type: string, fn: Listener): void {
    if (type === 'message') this.listeners.push(fn);
  }
  postMessage(data: unknown): void {
    const copy = structuredClone(data);
    setTimeout(() => {
      for (const fn of this.other.listeners) fn({ data: copy });
    }, 0);
  }
  terminate(): void {}
  close(): void {}
}

/** One handle for the one in-process worker (a handle listens to every
 *  message of its worker, so two on one channel would both answer). */
let pdf: ReturnType<typeof CreatePdfWorker>;

beforeAll(async () => {
  const host = new Port();
  const scope = new Port();
  host.other = scope;
  scope.other = host;
  // The worker module binds `self` when it loads.
  (globalThis as unknown as { self: unknown }).self = scope;
  await import('../worker/pdf.worker');
  const { createPdfWorker } = await import('../worker/client');
  pdf = createPdfWorker({ worker: host as unknown as Worker });
});

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { width: pt(300), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  bodyText: { fontFamily: 'Lora' },
  headings: { fontFamily: 'Lora', levels: [{ level: 1, breakBefore: { enabled: false } }] },
};

describe('createPdfWorker (EF-52)', () => {
  it('renders on the worker, asking the host for fonts and reporting progress', async () => {
    const doc = buildDocument({ markdown: '# Title\n\nBody text.' }, config);
    const asked: string[] = [];
    const progress: RenderProgress['phase'][] = [];
    const bytes = await pdf.render(doc, {
      fontProvider: async (family, weight, style) => {
        asked.push(`${family}|${weight}|${style}`);
        return new Uint8Array(fontBytes);
      },
      onProgress: (p) => progress.push(p.phase),
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(asked).toContain('Lora|400|normal');
    expect(progress).toEqual(expect.arrayContaining(['prepare', 'pages', 'save']));
  });

  it('forwards font fallback warnings to the host', async () => {
    const doc = buildDocument({ markdown: 'Some *italic* words.' }, config);
    const warnings: PdfFontFallbackWarning[] = [];
    const bytes = await pdf.render(doc, {
      fontProvider: async (_family, _weight, style) => {
        if (style === 'italic') throw new Error('no italic cut');
        return new Uint8Array(fontBytes);
      },
      onWarning: (w) => { if (w.kind === 'fontFallback') warnings.push(w); },
    });
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ kind: 'fontFallback', family: 'Lora', style: 'italic', fallback: { style: 'normal' } });
    expect(warnings[0]!.reason).toContain('no italic cut');
  });

  it('forwards a missing image to the host, and logs only font fallbacks without a handler', async () => {
    const photo = {
      id: 'photo', typeId: 'figure', kind: 'bitmap' as const, caption: 'A photo.', createdAt: 0, updatedAt: 0,
      bitmap: { fileId: 'file-photo', format: 'png' as const, width: 400, height: 300 }, placement: { position: 'here' as const },
    };
    const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="photo"}\n', resources: [photo] }, config);
    const fontProvider = async () => new Uint8Array(fontBytes);
    const warnings: PdfWarning[] = [];
    await pdf.render(doc, { fontProvider, onWarning: (w) => warnings.push(w) });
    expect(warnings).toEqual([{ kind: 'missingImage', fileId: 'file-photo', resourceId: 'photo', pageIndex: 0, documentIndex: 0 }]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await pdf.render(doc, { fontProvider });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('sends each face the characters it sets, and takes a face back as several files (#196)', async () => {
    const slices = ['noto-serif-tc-122.ttf', 'noto-serif-tc-123.ttf', 'noto-serif-tc-121.ttf']
      .map((name) => new Uint8Array(fs.readFileSync(new URL(`./fixtures/cjk/${name}`, import.meta.url))));
    const doc = buildDocument({ markdown: '之也。《》' }, { ...config, bodyText: { fontFamily: 'Noto Serif TC' }, footer: { elements: [] } });
    const heard: string[] = [];
    const warnings: PdfWarning[] = [];
    const bytes = await pdf.render(doc, {
      fontProvider: async (family, _weight, _style, request) => {
        heard.push(`${family}: ${[...(request?.codePoints ?? [])].map((cp) => String.fromCodePoint(cp)).sort().join('')}`);
        return slices;
      },
      onWarning: (w) => warnings.push(w),
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(heard).toEqual(['Noto Serif TC: 。《》之也']);
    expect(warnings).toEqual([]);
  });

  it('rejects when a family cannot be had at all', async () => {
    const doc = buildDocument({ markdown: 'Body.' }, config);
    await expect(pdf.render(doc, {
      fontProvider: async () => { throw new Error('offline'); },
      onWarning: () => undefined,
    })).rejects.toThrow(/failed to load font\(s\): Lora 400/);
  });
});
