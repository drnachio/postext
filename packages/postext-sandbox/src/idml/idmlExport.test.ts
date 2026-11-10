import { describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildDocument, type PostextConfig, type Resource } from 'postext';

// Text measured without a DOM: a fixed advance per character.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const px = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 16);
    return { width: s.length * px * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx { return new StubCtx(); }
};

const blobs = new Map<string, Uint8Array>();
vi.mock('../storage/blobStore.js', () => ({
  getBlob: async (id: string) => (blobs.has(id) ? { bytes: blobs.get(id)!.buffer } : null),
}));

const { buildIdmlExport, dataUrlBytes, idmlFileIds, idmlFileName } = await import('./idmlExport.js');

describe('the Sandbox IDML export (#1491)', () => {
  it('names the file after the book', () => {
    expect(idmlFileName('Mi libro: segunda edición')).toBe('Mi libro segunda edición.idml');
    expect(idmlFileName('  ')).toBe('document.idml');
  });

  it('asks for every picture the book names: resources, print masters and the design', () => {
    const resources = [
      { id: 'a', kind: 'bitmap', bitmap: { fileId: 'f-bitmap' } },
      { id: 'b', kind: 'svg', svg: { fileId: 'f-svg', pdfFileId: 'f-master' } },
      { id: 'c', kind: 'video', video: { poster: { fileId: 'f-poster' } } },
    ] as unknown as Resource[];
    const config = { header: { slots: [{ elements: [{ type: 'image', fileId: 'f-logo' }, { type: 'image', fileId: 'data:image/png;base64,AA==' }] }] } } as unknown as PostextConfig;
    expect(idmlFileIds(resources, config).sort()).toEqual(['f-bitmap', 'f-logo', 'f-master', 'f-poster', 'f-svg']);
  });

  it('reads the bytes of a data URL', () => {
    expect([...dataUrlBytes('data:image/png;base64,AAEC')!]).toEqual([0, 1, 2]);
    expect(new TextDecoder().decode(dataUrlBytes('data:image/svg+xml,%3Csvg%2F%3E'))).toBe('<svg/>');
    expect(dataUrlBytes('blob:x')).toBeUndefined();
  });

  it('writes the laid-out chapters as one package, and passes the writer\'s warnings on', async () => {
    const config: PostextConfig = {};
    const docs = [
      buildDocument({ markdown: '# One\n\nThe first chapter.' }, config),
      buildDocument({ markdown: '# Two\n\nThe second chapter.' }, config),
    ];
    const warnings: string[] = [];
    const bytes = await buildIdmlExport({ docs, resources: [], config, title: 'Book', onWarning: (w) => warnings.push(w.code) });
    const zip = unzipSync(bytes);
    expect(strFromU8(zip['mimetype']!)).toBe('application/vnd.adobe.indesign-idml-package');
    const spreads = Object.keys(zip).filter((p) => p.startsWith('Spreads/'));
    expect(spreads.length).toBe(docs.reduce((n, d) => n + d.pages.length, 0));
    expect(strFromU8(zip['designmap.xml']!)).toContain('Book');
    expect(Array.isArray(warnings)).toBe(true);
  });
});
