import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostextConfig, Resource } from 'postext';
import { chapter, harness } from './testHarness.js';

// The blob and font stores are IndexedDB; here they are maps.
const { blobs, fonts } = vi.hoisted(() => ({
  blobs: new Map<string, { fileId: string; contentType: string; bytes: ArrayBuffer }>(),
  fonts: new Map<string, { fileId: string; fileName: string }>(),
}));
vi.mock('../../storage/blobStore.js', async (original) => {
  let made = 0;
  return {
    ...(await original<typeof import('../../storage/blobStore.js')>()),
    putBlob: async (bytes: ArrayBuffer, contentType: string) => {
      const fileId = `blob-${++made}`;
      blobs.set(fileId, { fileId, contentType, bytes });
      return fileId;
    },
    getBlob: async (fileId: string) => blobs.get(fileId) ?? null,
    deleteBlob: async (fileId: string) => { blobs.delete(fileId); },
  };
});
vi.mock('../../storage/fontStorage.js', async (original) => ({
  ...(await original<typeof import('../../storage/fontStorage.js')>()),
  putFontFile: async (file: { fileId: string; fileName: string }) => { fonts.set(file.fileId, file); },
  deleteFontFile: async (fileId: string) => { fonts.delete(fileId); },
}));

beforeEach(() => {
  blobs.clear();
  fonts.clear();
});

const base64 = (bytes: Uint8Array | string): string => btoa(typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes));

/** The header of a PNG `width` × `height`, stating `ppi` when given: all a
 *  picture is read for here. */
function png(width: number, height: number, ppi?: number): { base64: string; fileName: string; mimeType: string } {
  const chunk = (type: string, data: number[]): number[] => [0, 0, 0, data.length, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const perMetre = ppi ? Math.round(ppi / 0.0254) : 0;
  return {
    base64: base64(new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...chunk('IHDR', [...u32(width), ...u32(height), 8, 6, 0, 0, 0]),
      ...(ppi ? chunk('pHYs', [...u32(perMetre), ...u32(perMetre), 1]) : []),
      ...chunk('IEND', []),
    ])),
    fileName: 'Old Map.png',
    mimeType: 'image/png',
  };
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><text font-family="Lora" font-weight="700">Hi</text></svg>';
const PDF = { base64: base64('%PDF-1.4\n%%EOF\n'), fileName: 'figure.pdf' };

describe('the resource tools', () => {
  it('keep a picture, its resolution and what a replaced file keeps', async () => {
    const { call, get } = harness();
    const saved = await call('sandbox_save_resource', { image: png(600, 400), caption: 'A map', resolution: 300, wait: false });
    expect(saved).toMatchObject({ ok: true, id: 'old-map', created: true, use: '::resource{id="old-map"}' });
    expect(get().resources[0]).toMatchObject({ kind: 'bitmap', typeId: 'figure', caption: 'A map', bitmap: { format: 'png', width: 600, height: 400, resolution: 300 } });
    const first = get().resources[0]!.bitmap!.fileId;

    // Another file: the declared resolution is the author's and stays.
    await call('sandbox_save_resource', { id: 'old-map', image: png(1200, 800, 150), wait: false });
    expect(get().resources[0]!.bitmap).toMatchObject({ width: 1200, height: 800, resolution: 300, fileResolution: 150.01 });
    expect(get().resources[0]!.bitmap!.fileId).not.toBe(first);
    expect(get().resources[0]!.caption).toBe('A map');

    await call('sandbox_save_resource', { id: 'old-map', resolution: null, wait: false });
    expect('resolution' in get().resources[0]!.bitmap!).toBe(false);
    await call('sandbox_save_resource', { id: 'old-map', resolution: 'file', wait: false });
    expect(get().resources[0]!.bitmap!.resolution).toBe(150.01);
    expect((await call('sandbox_save_resource', { id: 'old-map', resolution: 9000 })).error).toBe('resolution is 1 to 4800 pixels per inch.');

    // A file that states none has none to take.
    await call('sandbox_save_resource', { id: 'plain', image: png(10, 10), wait: false });
    expect((await call('sandbox_save_resource', { id: 'plain', resolution: 'file' })).error).toMatch(/states no resolution/);
    expect((await call('sandbox_save_resource', { id: 'plain', embedFonts: false })).error).toBe('embedFonts is an SVG\'s; "plain" is a bitmap.');
    expect((await call('sandbox_save_resource', { image: { base64: base64('GIF89a'), fileName: 'clip.mp4' } })).error).toMatch(/"clip\.mp4" is a video file: hand it over as video: \{ file \}/);
  });

  it('keep a music score, typed or read from a file, numbered as an example (#1172)', async () => {
    const { call, get } = harness();
    const saved = await call('sandbox_save_resource', { score: { format: 'abc', source: 'X:1\nK:C\nCDEF|\n' }, caption: 'A scale', wait: false });
    expect(saved).toMatchObject({ ok: true, created: true, addedType: 'example' });
    const id = get().resources[0]!.id;
    expect(get().resources[0]).toMatchObject({ kind: 'score', typeId: 'example', caption: 'A scale', score: { format: 'abc', source: 'X:1\nK:C\nCDEF|\n' } });
    expect(get().config.resourceTypes?.some((t) => t.id === 'example')).toBe(true);

    // A file: its text and its format, the style kept apart.
    const mei = '<mei xmlns="http://www.music-encoding.org/ns/mei"/>';
    await call('sandbox_save_resource', { id, score: { file: { base64: base64(mei), fileName: 'cadence.mei' }, styleId: 'small' }, wait: false });
    expect(get().resources[0]!.score).toEqual({ format: 'mei', source: mei, styleId: 'small' });
    await call('sandbox_save_resource', { id, score: { styleId: null }, wait: false });
    expect(get().resources[0]!.score).toEqual({ format: 'mei', source: mei });
  });

  it('set a width as a length and a full-page plate (#1461)', async () => {
    const { call, get } = harness();
    await call('sandbox_save_resource', { id: 'map', image: png(600, 400, 72), placement: { width: { value: 95, unit: 'mm' }, plate: 'bleed' }, wait: false });
    expect(get().resources[0]!.placement).toEqual({ width: { value: 95, unit: 'mm' }, plate: 'bleed' });
    // `false` is kept: it turns off a plate the type sets.
    await call('sandbox_save_resource', { id: 'map', placement: { plate: false, width: 0.4 }, wait: false });
    expect(get().resources[0]!.placement).toEqual({ width: 0.4, plate: false });
    await call('sandbox_save_resource', { id: 'map', placement: { plate: null }, wait: false });
    expect(get().resources[0]!.placement).toEqual({ width: 0.4 });
    expect((await call('sandbox_save_resource', { id: 'map', placement: { width: { value: 3, unit: 'em' } } })).error).toMatch(/unit among mm, cm, in, pt/);
    expect((await call('sandbox_save_resource', { id: 'map', placement: { width: { value: 0, unit: 'mm' } } })).error).toMatch(/value above 0/);
    expect((await call('sandbox_save_resource', { id: 'map', placement: { plate: 'page' } })).error).toMatch(/placement\.plate is true, false/);
  });

  it('merge single fields, and take a placement key back to the type\'s', async () => {
    const { call, get } = harness();
    await call('sandbox_save_resource', { id: 'map', image: png(600, 400, 72), placement: { position: 'top', span: 'page', width: 0.5, rotate: 'cw' }, wait: false });
    expect(get().resources[0]!.placement).toEqual({ position: 'top', span: 'page', width: 0.5, rotate: 'cw' });
    await call('sandbox_save_resource', { id: 'map', placement: { span: null, rotate: 'none', align: 'center' }, wait: false });
    expect(get().resources[0]!.placement).toEqual({ position: 'top', width: 0.5, align: 'center' });
    await call('sandbox_save_resource', { id: 'map', placement: { position: null, width: null, align: null }, wait: false });
    expect('placement' in get().resources[0]!).toBe(false);
    expect((await call('sandbox_save_resource', { id: 'map', placement: { width: 50 } })).error).toMatch(/placement\.width is a share, above 0 and up to 1/);
    expect((await call('sandbox_save_resource', { id: 'map', placement: { float: 'left' } })).error).toMatch(/placement\.float is not a parameter/);

    // One member of the bitmap, without restating it.
    await call('sandbox_save_resource', { id: 'map', fields: { bitmap: { resolution: 240 }, id: 'other', kind: 'svg' }, wait: false });
    expect(get().resources[0]).toMatchObject({ id: 'map', kind: 'bitmap', bitmap: { format: 'png', width: 600, height: 400, resolution: 240, fileResolution: 72.01 } });
    await call('sandbox_save_resource', { id: 'map', fields: { bitmap: { resolution: null } }, wait: false });
    expect('resolution' in get().resources[0]!.bitmap!).toBe(false);
    expect(get().resources[0]!.bitmap!.width).toBe(600);

    await call('sandbox_save_resource', { id: 'map', marks: { safeArea: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, anchors: [{ id: 'ana', x: 0.9, y: 0.9 }] }, wait: false });
    expect(get().resources[0]).toMatchObject({ safeArea: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, anchors: [{ id: 'ana', x: 0.9, y: 0.9 }] });
    const cleared = await call('sandbox_save_resource', { id: 'map', marks: { safeArea: null }, wait: false });
    expect('safeArea' in cleared.resource).toBe(false);
    expect(cleared.resource.anchors).toHaveLength(1);
    expect((await call('sandbox_save_resource', { id: 'map', marks: { anchors: [{ id: 'sfx', x: 0, y: 0 }] } })).error).toMatch(/marks\.anchors\[0\]\.id "sfx" is a key the script keeps for itself/);
    // The drawing's own symbols (#994) are an SVG's, and named.
    expect((await call('sandbox_save_resource', { id: 'map', marks: { svgSymbols: { idPrefix: 'sym-' } } })).error).toMatch(/svgSymbols is an SVG's/);
  });

  it('read the symbols of an SVG as avoid zones only where a document can measure it (#994)', async () => {
    const { call } = harness();
    await call('sandbox_save_resource', { id: 'Diagram One', svg: SVG, wait: false });
    expect((await call('sandbox_save_resource', { id: 'diagram-one', marks: { svgSymbols: {} } })).error).toMatch(/names the symbols by idPrefix or className/);
    // This suite runs without a document: the measuring says so instead of adding nothing.
    expect((await call('sandbox_save_resource', { id: 'diagram-one', marks: { svgSymbols: { idPrefix: 'sym-' } } })).error).toMatch(/could not be measured here/);
  });

  it('keep an SVG, its print master and its font opt-out through a new file, and detach the master from an edited source', async () => {
    const { call, get } = harness();
    const saved = await call('sandbox_save_resource', { id: 'Diagram One', svg: SVG, printMaster: PDF, embedFonts: false, wait: false });
    expect(saved).toMatchObject({ ok: true, id: 'diagram-one', created: true });
    const svg = (): NonNullable<Resource['svg']> => get().resources[0]!.svg!;
    const master = svg().pdfFileId!;
    expect(blobs.get(master)!.contentType).toBe('application/pdf');
    expect(svg().inlineFonts).toBe(false);

    const read = await call('sandbox_list_resources', { id: 'diagram-one' });
    expect(read.svg).toBe(SVG);
    expect(read.fonts).toEqual({ embedded: false, faces: [{ face: 'Lora 700', status: 'kept' }] });

    // A new file for the same figure: the master and the opt-out stay.
    const source = svg().fileId;
    await call('sandbox_save_resource', { id: 'diagram-one', image: { base64: base64(SVG.replace('Hi', 'Hello')), fileName: 'd.svg' }, wait: false });
    expect(svg()).toMatchObject({ pdfFileId: master, inlineFonts: false });
    expect(svg().fileId).not.toBe(source);

    // The source edited: the master was made for the drawing as it was.
    const edited = await call('sandbox_save_resource', { id: 'diagram-one', svg: SVG.replace('Hi', 'Hey'), wait: false });
    expect(edited.printMasterDetached).toBe(true);
    expect('pdfFileId' in svg()).toBe(false);
    expect(svg().inlineFonts).toBe(false);
    expect(new TextDecoder().decode(blobs.get(svg().fileId)!.bytes)).toContain('Hey');

    // Attached again, replaced (the old file goes), removed.
    await call('sandbox_save_resource', { id: 'diagram-one', printMaster: PDF, embedFonts: true, wait: false });
    const second = svg().pdfFileId!;
    expect('inlineFonts' in svg()).toBe(false);
    await call('sandbox_save_resource', { id: 'diagram-one', printMaster: PDF, wait: false });
    expect(blobs.has(second)).toBe(false);
    const third = svg().pdfFileId!;
    await call('sandbox_save_resource', { id: 'diagram-one', printMaster: null, wait: false });
    expect('pdfFileId' in svg()).toBe(false);
    expect(blobs.has(third)).toBe(false);
    expect((await call('sandbox_save_resource', { id: 'diagram-one', printMaster: { base64: base64('not a pdf'), fileName: 'x.pdf' } })).error).toBe('"x.pdf" is not a PDF file (it does not start with %PDF).');
  });

  it('take a table\'s cells as they are read, and keep their formatting under new texts', async () => {
    const config: PostextConfig = { tableStyles: [{ id: 'ruled', name: 'Ruled' }] };
    const { call, get } = harness({ config });
    await call('sandbox_save_resource', { id: 'logo', image: png(40, 40), wait: false });
    await call('sandbox_save_resource', { id: 'sizes', table: { rows: [['Paper', '', 'Use'], ['A', 'A5', 'Novels'], ['', 'A4', 'Reports']], style: 'ruled' }, wait: false });
    const table = (): NonNullable<Resource['table']> => get().resources[1]!.table!;
    expect(table().styleId).toBe('ruled');

    // The cells as stored, with a merge, a fill and a picture laid on.
    const read = await call('sandbox_list_resources', { id: 'sizes' });
    expect(read.tableStyles).toEqual([{ id: 'ruled', name: 'Ruled' }]);
    const cells = read.resource.table.model.rows;
    cells[0][0] = { ...cells[0][0], colSpan: 2 };
    cells[1][0] = { ...cells[1][0], rowSpan: 2, background: '#eeeeee' };
    cells[1][1] = { ...cells[1][1], image: { resourceId: 'logo', width: 0.5 }, align: 'right' };
    const saved = await call('sandbox_save_resource', { id: 'sizes', table: { cells, columnWidths: [1, 2, 2] }, wait: false });
    expect(saved.ok).toBe(true);
    expect(table().model.rows[0]![1]).toEqual({ content: '', isHeader: true, hiddenBy: { row: 0, col: 0 } });
    expect(table().model.rows[2]![0]!.hiddenBy).toEqual({ row: 1, col: 0 });
    expect(table()).toMatchObject({ styleId: 'ruled', model: { headerRowCount: 1, columnWidths: [1, 2, 2] } });

    // What is read back is what is taken.
    const again = await call('sandbox_list_resources', { id: 'sizes' });
    const before = JSON.stringify(table());
    await call('sandbox_save_resource', { id: 'sizes', table: { cells: again.resource.table.model.rows }, wait: false });
    expect(JSON.stringify(table())).toBe(before);

    // New texts leave the formatting where it is.
    await call('sandbox_save_resource', { id: 'sizes', table: { rows: [['Format', '', 'For'], ['B', 'B5', 'Paperbacks'], ['', 'B4', 'Posters'], ['C', 'C5', 'Envelopes']] }, wait: false });
    expect((await call('sandbox_list_resources', { id: 'sizes' })).rows).toEqual([['Format', '', 'For'], ['B', 'B5', 'Paperbacks'], ['', 'B4', 'Posters'], ['C', 'C5', 'Envelopes']]);
    expect(table().model.rows[0]![0]).toEqual({ content: 'Format', isHeader: true, colSpan: 2 });
    expect(table().model.rows[1]![0]).toEqual({ content: 'B', background: { hex: '#eeeeee', model: 'hex' }, rowSpan: 2 });
    expect(table().model.rows[1]![1]).toEqual({ content: 'B5', image: { resourceId: 'logo', width: 0.5 }, align: 'right' });
    expect(table().model.columnWidths).toEqual([1, 2, 2]);

    // The table as it is: its style and direction alone.
    await call('sandbox_save_resource', { id: 'sizes', table: { style: null, direction: 'rtl' }, wait: false });
    expect(table().styleId).toBeUndefined();
    expect(table().direction).toBe('rtl');
    expect(table().model.rows).toHaveLength(4);
    expect((await call('sandbox_save_resource', { id: 'sizes', table: { style: 'fancy' } })).error).toMatch(/No table style "fancy"/);
    expect((await call('sandbox_save_resource', { id: 'sizes', table: { cells: [[{ content: 'a', colSpan: 2 }]] } })).error).toMatch(/table\.cells\[0\]\[0\]: a colSpan of 2 runs past the last column/);
    expect((await call('sandbox_save_resource', { id: 'sizes', table: { cells: [[{ text: 'a' }]] } })).error).toMatch(/table\.cells\[0\]\[0\]\.text is not a parameter/);
    expect((await call('sandbox_save_resource', { id: 'logo', table: { style: 'ruled' } })).error).toBe('A table needs "rows", "tsv" or "cells".');
    expect((await call('sandbox_save_resource', { id: 'sizes', table: { headerRows: 1 }, svg: SVG })).error).toBe('Give one content: an image, an svg source, a table, a video or a score.');
  });

  it('rename a resource where the book refers to it', async () => {
    const chapters = [
      chapter('a', 'Opening', '# Opening\n\nSee :ref{id="map"}.\n\n::resource{id="map"}\n\nThe word map and `:ref{id="map"}` stay.\n'),
      chapter('b', 'Second', '# Second\n\nAgain :ref{id=map style=number}.\n'),
    ];
    const config: PostextConfig = { calloutStyles: [{ id: 'note', icon: { kind: 'resource', resourceId: 'map' } }] } as PostextConfig;
    const { call, get } = harness({ chapters, markdown: chapters[0]!.markdown, config });
    await call('sandbox_save_resource', { id: 'map', image: png(600, 400), caption: 'The map', wait: false });
    await call('sandbox_save_resource', { id: 'key', table: { cells: [[{ content: 'Key to :ref{id="map"}', image: { resourceId: 'map' } }]] }, wait: false });
    const file = get().resources[0]!.bitmap!.fileId;

    expect((await call('sandbox_save_resource', { id: 'map', newId: 'key' })).error).toMatch(/Another resource has the id "key"/);
    expect((await call('sandbox_save_resource', { newId: 'x', svg: SVG })).error).toMatch(/newId renames a resource the book has/);

    const renamed = await call('sandbox_save_resource', { id: 'map', newId: 'Europe 1900', caption: 'Europe', wait: false });
    expect(renamed).toMatchObject({
      ok: true,
      id: 'europe-1900',
      created: false,
      use: '::resource{id="europe-1900"}',
      renamed: { from: 'map', to: 'europe-1900', referencesRewritten: 5, inChapters: [1, 2], inResources: ['key'], designStillNames: ['calloutStyles[0].icon.resourceId'] },
    });
    expect(renamed.notes[0]).toMatch(/The design still names "map" at calloutStyles\[0\]\.icon\.resourceId/);
    expect(get().resources.map((r) => r.id).sort()).toEqual(['europe-1900', 'key']);
    const moved = get().resources.find((r) => r.id === 'europe-1900')!;
    expect(moved.caption).toBe('Europe');
    // Its file was copied, so the store's clean-up of the old record takes
    // the original and not the picture.
    expect(moved.bitmap!.fileId).not.toBe(file);
    expect(blobs.has(moved.bitmap!.fileId)).toBe(true);
    expect(get().activeResourceId).toBe('europe-1900');
    expect(get().markdown).toBe('# Opening\n\nSee :ref{id="europe-1900"}.\n\n::resource{id="europe-1900"}\n\nThe word map and `:ref{id="map"}` stay.\n');
    expect(get().chapters[0]!.markdown).toBe(get().markdown);
    expect(get().chapters[1]!.markdown).toBe('# Second\n\nAgain :ref{id=europe-1900 style=number}.\n');
    expect(get().resources.find((r) => r.id === 'key')!.table!.model.rows[0]![0]).toEqual({ content: 'Key to :ref{id="europe-1900"}', image: { resourceId: 'europe-1900' } });

    // As the panel renames: the id alone.
    const alone = await call('sandbox_save_resource', { id: 'europe-1900', newId: 'atlas', updateReferences: false, wait: false });
    expect(alone.renamed).toEqual({ from: 'europe-1900', to: 'atlas' });
    expect(get().chapters[1]!.markdown).toContain('id=europe-1900');
  });

  it('keep a video as the editor does', async () => {
    // No platform answers here: a link is kept without its poster.
    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    try {
      const figure = { id: 'figure', name: 'Figure', shortLabel: 'Fig.', numberingTemplate: '{n}', resetOn: 'none', counterFormat: 'decimal', captionPrefix: 'Figure' };
      const { call, get } = harness({ config: { resourceTypes: [figure] } as PostextConfig });
      const added = await call('sandbox_save_resource', { video: { url: 'https://youtu.be/dQw4w9WgXcQ', start: 12, end: 0, player: { controls: false, privacy: true } }, caption: 'The talk', wait: false });
      expect(added).toMatchObject({ ok: true, id: 'the-talk', created: true, addedType: 'video' });
      expect(added.notes[0]).toMatch(/YouTube gave no poster/);
      expect(get().config.resourceTypes!.map((t) => t.id)).toEqual(['figure', 'video']);
      expect(get().resources[0]).toMatchObject({ kind: 'video', typeId: 'video', caption: 'The talk' });
      expect(get().resources[0]!.video).toEqual({ source: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', start: 12, player: { controls: false, privacy: true } });

      // An option back to the book's Video style, the range from the start.
      await call('sandbox_save_resource', { id: 'the-talk', video: { start: null, player: { controls: null, loop: true } }, wait: false });
      expect(get().resources[0]!.video).toEqual({ source: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', player: { privacy: true, loop: true } });
      expect((await call('sandbox_save_resource', { id: 'the-talk', video: { player: { download: true } } })).error).toMatch(/video\.player\.download is not an option of a YouTube video's player\. Its options: controls, fullscreen, autoplay, muted, loop, privacy\./);
      expect((await call('sandbox_save_resource', { id: 'the-talk', video: { source: 'youtube', url: 'https://example.com/a.mp4' } })).error).toBe('"https://example.com/a.mp4" is not a YouTube link.');
      expect((await call('sandbox_save_resource', { id: 'the-talk', video: { posterTime: 3 } })).error).toMatch(/posterTime takes a frame of a self-hosted video/);

      // A picture as its poster, which takes a safe area like a picture.
      expect((await call('sandbox_save_resource', { id: 'the-talk', marks: { safeArea: { x: 0.25, y: 0, width: 0.5, height: 1 } } })).error).toMatch(/This video has no poster/);
      await call('sandbox_save_resource', { id: 'the-talk', video: { poster: png(1280, 720) }, marks: { safeArea: { x: 0.25, y: 0, width: 0.5, height: 1 } }, wait: false });
      expect(get().resources[0]!.video!.poster).toMatchObject({ format: 'png', width: 1280, height: 720 });
      expect(get().resources[0]!.safeArea).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
      expect((await call('sandbox_save_resource', { id: 'the-talk', video: { poster: { base64: base64(SVG), fileName: 'p.svg' } } })).error).toMatch(/"p\.svg" is not a picture a poster can be/);

      // Another platform's link moves the video there; the other's player
      // options it does not honour stay as the editor leaves them.
      await call('sandbox_save_resource', { id: 'the-talk', video: { url: 'https://vimeo.com/76979871' }, wait: false });
      expect(get().resources[0]!.video).toMatchObject({ source: 'vimeo', url: 'https://vimeo.com/76979871' });

      // With nothing said of it, the empty video "Add video" makes.
      expect((await call('sandbox_save_resource', { video: {}, wait: false })).resource).toMatchObject({ id: 'video', kind: 'video', typeId: 'video', video: { source: 'youtube' } });
      await call('sandbox_delete_resource', { id: 'video', wait: false });

      // An address alone is a self-hosted video played from it.
      const stream = await call('sandbox_save_resource', { id: 'Lecture', video: { url: 'https://media.example.com/lecture/master.m3u8', player: { exclusive: false, preload: 'none' } }, wait: false });
      expect(stream).toMatchObject({ ok: true, id: 'lecture', created: true });
      expect('addedType' in stream).toBe(false);
      expect(stream.resource.video).toEqual({ source: 'file', url: 'https://media.example.com/lecture/master.m3u8', format: 'hls', player: { exclusive: false, preload: 'none' } });
      expect(stream.notes[0]).toMatch(/could not be loaded to read its frame size and length/);
      expect((await call('sandbox_save_resource', { id: 'lecture', video: { url: 'ftp://x' } })).error).toMatch(/is not a web address/);
      expect((await call('sandbox_save_resource', { id: 'lecture', video: { fetchPoster: true } })).error).toMatch(/fetchPoster asks YouTube or Vimeo/);
      expect((await call('sandbox_save_resource', { id: 'lecture', image: png(4, 4) })).ok).toBe(true);
      expect((await call('sandbox_save_resource', { id: 'lecture', video: { start: 1 } })).error).toMatch(/"lecture" is a bitmap resource\. A video is a resource of its own/);
      expect((await call('sandbox_list_resources')).resources.map((r: { id: string; kind: string; source?: string }) => [r.id, r.kind, r.source])).toEqual([['the-talk', 'video', 'vimeo'], ['lecture', 'bitmap', undefined]]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('the font tools', () => {
  const font = (fileName: string) => ({ base64: base64('wOF2 not a real font'), fileName });

  it('keep the faces of a custom family, one per weight and style', async () => {
    const { call, get } = harness({ config: { bodyText: { fontFamily: 'Fabrik' }, headings: { fontFamily: 'Fabrik, serif' } } as PostextConfig });
    const added = await call('sandbox_save_font', { action: 'add', family: 'Fabrik', file: font('Fabrik-Regular.woff2'), wait: false });
    expect(added).toMatchObject({ ok: true, family: 'Fabrik', faces: [{ weight: 400, style: 'normal', file: 'Fabrik-Regular.woff2' }] });
    expect('replaced' in added).toBe(false);
    await call('sandbox_save_font', { action: 'add', family: 'Fabrik', weight: 700, file: font('Fabrik-Bold.woff2'), wait: false });
    const first = get().config.customFonts![0]!.variants[0]!.fileId;

    // The same weight and style again takes the face's place.
    const again = await call('sandbox_save_font', { action: 'add', family: 'Fabrik', file: font('Fabrik-Book.woff2'), wait: false });
    expect(again).toMatchObject({ replaced: true, replacedFiles: ['Fabrik-Regular.woff2'] });
    expect(again.faces.map((f: { file: string }) => f.file)).toEqual(['Fabrik-Bold.woff2', 'Fabrik-Book.woff2']);
    expect(fonts.has(first)).toBe(false);
    expect(fonts.size).toBe(2);

    const listed = await call('sandbox_list_fonts');
    // The body's family first; what else the defaults set comes after.
    expect(listed.inUse[0]).toEqual({ family: 'Fabrik', roles: ['body', 'headings'], source: 'custom' });
    expect(listed.inUse.slice(1).every((f: { roles: string[] }) => f.roles.join() === 'other')).toBe(true);
    expect(listed.custom).toEqual([{ family: 'Fabrik', faces: [{ weight: 700, style: 'normal', file: 'Fabrik-Bold.woff2' }, { weight: 400, style: 'normal', file: 'Fabrik-Book.woff2' }] }]);

    // A face declared at another weight and style.
    const updated = await call('sandbox_save_font', { action: 'update_face', family: 'Fabrik', fileName: 'Fabrik-Book.woff2', newWeight: 300, newStyle: 'italic', wait: false });
    expect(updated.faces[1]).toEqual({ weight: 300, style: 'italic', file: 'Fabrik-Book.woff2' });
    expect((await call('sandbox_save_font', { action: 'update_face', family: 'Fabrik', newWeight: 500 })).error).toMatch(/2 faces match: name one by its fileName, weight and style\. Its faces: 700 normal \(Fabrik-Bold\.woff2\); 300 italic \(Fabrik-Book\.woff2\)\./);
    expect((await call('sandbox_save_font', { action: 'update_face', family: 'Fabrik', weight: 700 })).error).toBe('update_face needs newWeight or newStyle.');

    // Renamed as the panel renames it: the settings keep the old name.
    const renamed = await call('sandbox_save_font', { action: 'rename_family', family: 'Fabrik', newFamily: ' Fabrik Text ', wait: false });
    expect(renamed).toMatchObject({ family: 'Fabrik Text', renamed: true, from: 'Fabrik', stillNamedBy: ['bodyText.fontFamily', 'headings.fontFamily'] });
    expect(get().config.customFonts![0]!.name).toBe('Fabrik Text');
    expect(get().config.bodyText!.fontFamily).toBe('Fabrik');
    expect((await call('sandbox_save_font', { action: 'rename_family', family: 'Fabrik', newFamily: 'x' })).error).toMatch(/No custom family named "Fabrik"\. The custom families: Fabrik Text\./);
    expect((await call('sandbox_save_font', { action: 'rename_family', family: 'Fabrik Text' })).error).toBe('rename_family needs the new name (newFamily).');

    // One face among several, by its file.
    const removed = await call('sandbox_save_font', { action: 'remove', family: 'Fabrik Text', fileName: 'Fabrik-Bold.woff2', wait: false });
    expect(removed).toMatchObject({ removedFaces: 1, familyRemoved: false, faces: [{ weight: 300, style: 'italic', file: 'Fabrik-Book.woff2' }] });
    expect(fonts.size).toBe(1);
    expect((await call('sandbox_save_font', { action: 'remove', family: 'Fabrik Text', weight: 900 })).error).toMatch(/has no face of that file name, weight and style/);
    expect((await call('sandbox_save_font', { action: 'remove' })).error).toBe('remove needs the family\'s name (family).');
  });

  it('take every custom font away', async () => {
    const { call, get } = harness();
    await call('sandbox_save_font', { action: 'add', family: 'One', file: font('one.ttf'), wait: false });
    await call('sandbox_save_font', { action: 'add', family: 'Two', style: 'italic', file: font('two.otf'), wait: false });
    expect(fonts.size).toBe(2);
    expect(await call('sandbox_save_font', { action: 'remove_all', wait: false })).toMatchObject({ ok: true, removedFamilies: ['One', 'Two'], removedFaces: 2 });
    expect(get().config.customFonts).toBeUndefined();
    expect(fonts.size).toBe(0);
    expect((await call('sandbox_save_font', { action: 'add', family: 'One', file: { base64: base64('x'), fileName: 'one.txt' } })).error).toMatch(/is not a font file the Sandbox takes/);
  });
});
