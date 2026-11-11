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

const { buildIdmlExport, dataUrlBytes, idmlFaces, idmlFileIds, idmlFileName, pickIdmlFace } = await import('./idmlExport.js');

// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
const { readFileSync } = await import('node:fs');
const lora = new Uint8Array(readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url)));
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

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
    const file = await buildIdmlExport({ docs, resources: [], config, title: 'Book', onWarning: (w) => warnings.push(w.code) });
    expect(file).toMatchObject({ name: 'Book.idml', mime: 'application/vnd.adobe.indesign-idml-package', zipped: false, links: [], fonts: [], withheld: [] });
    expect(file.bytes).toBe(file.idml);
    const zip = unzipSync(file.bytes);
    expect(strFromU8(zip['mimetype']!)).toBe('application/vnd.adobe.indesign-idml-package');
    const spreads = Object.keys(zip).filter((p) => p.startsWith('Spreads/'));
    expect(spreads.length).toBe(docs.reduce((n, d) => n + d.pages.length, 0));
    expect(strFromU8(zip['designmap.xml']!)).toContain('Book');
    expect(Array.isArray(warnings)).toBe(true);
  });

  const story = (name: string, zip: Record<string, Uint8Array>) => Object.keys(zip).filter((p) => p.startsWith(name)).map((p) => strFromU8(zip[p]!)).join('');

  it('keeps the lines unless asked to leave them to InDesign, and pairs the pages as asked', async () => {
    const config: PostextConfig = {};
    const docs = [buildDocument({ markdown: '# One\n\n' + 'A paragraph long enough to run over several lines of the page. '.repeat(12) }, config)];
    const kept = unzipSync((await buildIdmlExport({ docs, resources: [], config })).bytes);
    const reflowed = unzipSync((await buildIdmlExport({ docs, resources: [], config, choices: { lineBreaks: 'reflow' } })).bytes);
    const breaks = (zip: Record<string, Uint8Array>) => story('Stories/', zip).split('&#x2028;').length + story('Stories/', zip).split('\u2028').length;
    expect(breaks(kept)).toBeGreaterThan(breaks(reflowed));
    const facing = unzipSync((await buildIdmlExport({ docs, resources: [], config, choices: { spreads: 'facing' } })).bytes);
    const single = unzipSync((await buildIdmlExport({ docs, resources: [], config, choices: { spreads: 'single' } })).bytes);
    expect(strFromU8(facing['Resources/Preferences.xml']!)).toContain('FacingPages="true"');
    expect(strFromU8(single['Resources/Preferences.xml']!)).toContain('FacingPages="false"');
  });

  it('links the pictures from a Links folder, the package and the folder in one zip', async () => {
    blobs.set('f-pic', PNG);
    const config: PostextConfig = {};
    const resources = [{ id: 'pic', typeId: 'figure', kind: 'bitmap', bitmap: { fileId: 'f-pic', format: 'png', width: 1, height: 1 }, createdAt: 0, updatedAt: 0 }] as unknown as Resource[];
    const docs = [buildDocument({ markdown: '# One\n\n::resource{id="pic"}\n\nText.', resources }, config)];
    const file = await buildIdmlExport({ docs, resources, config, title: 'Atlas', choices: { images: 'link' } });
    expect(file).toMatchObject({ name: 'Atlas.zip', mime: 'application/zip', zipped: true });
    expect(file.links).toHaveLength(1);
    const zip = unzipSync(file.bytes);
    expect(Object.keys(zip).sort()).toEqual(['Atlas.idml', file.links[0]!].sort());
    expect(file.links[0]).toMatch(/^Links\//);
    expect(strFromU8(unzipSync(zip['Atlas.idml']!)['mimetype']!)).toBe('application/vnd.adobe.indesign-idml-package');
    const embedded = await buildIdmlExport({ docs, resources, config, title: 'Atlas' });
    expect(embedded.zipped).toBe(false);
  });

  it('names a face as its file does, and hands the files over only when asked and allowed', async () => {
    const config = { bodyText: { fontFamily: 'Lora' } } as unknown as PostextConfig;
    const docs = [buildDocument({ markdown: 'Plain words.' }, config)];
    const asked: string[] = [];
    const faces = await idmlFaces(docs, async (family, weight, style) => {
      asked.push(family + ' ' + weight + ' ' + style);
      if (family !== 'Lora') throw new Error('no such family');
      return [lora];
    });
    expect(asked).toContain('Lora 400 normal');
    expect(faces.map((f) => f.family)).toEqual(expect.arrayContaining(['Lora']));
    expect(pickIdmlFace(faces, 'lora', 700, true)?.bytes).toBe(lora);
    expect(pickIdmlFace(faces, 'Georgia', 400, false)).toBeUndefined();

    const named = await buildIdmlExport({ docs, resources: [], config, faces });
    expect(named.zipped).toBe(false);
    expect(strFromU8(unzipSync(named.bytes)['Resources/Fonts.xml']!)).toContain('PostScriptName="Lora-Regular"');

    const packed = await buildIdmlExport({ docs, resources: [], config, title: 'Book', faces, choices: { fonts: true } });
    expect(packed.fonts).toEqual(['Document fonts/Lora-Regular.ttf']);
    expect(Object.keys(unzipSync(packed.bytes)).sort()).toEqual(['Book.idml', 'Document fonts/Lora-Regular.ttf']);

    const closed = await buildIdmlExport({ docs, resources: [], config, title: 'Book', faces, choices: { fonts: true }, withheld: (family) => family === 'Lora' });
    expect(closed).toMatchObject({ zipped: false, fonts: [], withheld: ['Lora'] });
  });
});
