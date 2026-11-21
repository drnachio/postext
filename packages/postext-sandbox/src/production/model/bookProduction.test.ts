import { describe, it, expect } from 'vitest';
import type { PostextConfig } from 'postext';
import {
  bookRuns,
  bookTrimMm,
  coverDesignOf,
  coverParagraphStyles,
  coverDocumentInput,
  dimensionMm,
  metadataIsbn,
  metadataTexts,
  newVersion,
  pickSheet,
  planPageCount,
  readBookProduction,
  sheetChoices,
  sheetFileName,
  sheetsOf,
  styledZoneText,
} from './bookProduction.js';

const mm = (value: number) => ({ value, unit: 'mm' as const });
const config: PostextConfig = { page: { sizePreset: 'custom', width: mm(150), height: mm(230) }, folio: { paper: { grammage: 80, bulk: 1.5 } } };

describe('book production', () => {
  it('measures the trim in mm whatever the unit', () => {
    expect(bookTrimMm(config)).toEqual({ width: 150, height: 230 });
    expect(dimensionMm({ value: 1, unit: 'in' }, 300)).toBeCloseTo(25.4, 6);
    expect(dimensionMm({ value: 72, unit: 'pt' }, 300)).toBeCloseTo(25.4, 6);
    expect(dimensionMm({ value: 300, unit: 'px' }, 300)).toBeCloseTo(25.4, 6);
  });

  it('counts the pages of the plan and puts them on the book paper', () => {
    expect(planPageCount({ a: { pageIndex: 0, pageCount: 12 }, b: { pageIndex: 12, pageCount: 230 } })).toBe(242);
    expect(bookRuns(242, config)).toEqual([{ pages: 242, grammage: 80, bulk: 1.5 }]);
    expect(bookRuns(0, config)).toEqual([]);
  });

  it('gives a paperback a cover and a hardcover its case, jacket and endpapers', () => {
    const paper = sheetsOf(newVersion('paperback', 'Rústica'), config, 242, []);
    const hard = sheetsOf({ ...newVersion('hardcover', 'Cartoné'), flaps: true }, config, 242, []);
    if (!('cover' in paper) || !('cover' in hard)) throw new Error('no profile');
    expect(sheetChoices(paper)).toEqual(['cover', 'epub', 'square', 'story', 'landscape']);
    expect(sheetChoices(hard)).toEqual(['cover', 'jacket', 'endpaperFront', 'endpaperBack', 'epub', 'square', 'story', 'landscape']);
    expect(pickSheet(hard, 'story', { width: 150, height: 230 }).height).toBeCloseTo((150 * 1920) / 1080, 6);
    expect(pickSheet(hard, 'jacket').kind).toBe('jacket');
    // 256 pages after rounding to 16: 128 leaves of 120 µm, plus 0.5 mm.
    expect(paper.spine.used).toBeCloseTo(128 * 0.12 + 0.5, 6);
  });

  it('lays a sheet out with the book design and the cover texts', () => {
    const version = { ...newVersion('paperback', 'Rústica'), isbn: '978-0-306-40615-7' };
    const sheets = sheetsOf(version, { ...config, page: { ...config.page, dpi: 150 } }, 242, []);
    if (!('cover' in sheets)) throw new Error('no profile');
    const input = coverDocumentInput(sheets.cover, version, { front: '# Título', back: 'Sinopsis' }, { ...config, page: { ...config.page, dpi: 150 } });
    expect(input.config.page?.width).toEqual(input.cover.page.width);
    expect(input.config.page?.dpi).toBe(150);
    expect(input.config.pageTemplates?.[0]?.id).toBe('production-sheet');
    // Each zone's text in its default box (./coverTexts.ts).
    expect(input.markdown).toContain(':::frame{slot="text-front"}');
    expect(input.markdown).toContain(':::frame{slot="text-back"}');
    expect(input.cover.resources.length).toBe(1);
  });

  it('puts no text and no barcode on an endpaper', () => {
    const version = { ...newVersion('hardcover', 'Cartoné'), isbn: '978-0-306-40615-7' };
    const sheets = sheetsOf(version, config, 242, []);
    if (!('cover' in sheets)) throw new Error('no profile');
    const input = coverDocumentInput(pickSheet(sheets, 'endpaperFront'), version, { front: 'X' }, config);
    expect(input.markdown).not.toContain(':::frame');
    expect(input.cover.resources).toEqual([]);
  });

  it('names the file after the book, the version and the sheet', () => {
    expect(sheetFileName('El título', 'Cartoné', 'jacket')).toBe('El-título-Cartoné-jacket.pdf');
    expect(sheetFileName('El título', 'Rústica', 'epub')).toBe('El-título-Rústica-epub.jpg');
  });

  it('reads a stored record, leaving out what does not read', () => {
    expect(readBookProduction(null)).toBeNull();
    const read = readBookProduction({
      projectId: 'p',
      versions: [{ id: 'a', name: 'A', binding: 'perfect' }, { id: 'b' }],
      activeVersionId: 'b',
      texts: { front: 'F', back: 3 },
      updatedAt: 5,
    });
    expect(read).toEqual({ projectId: 'p', versions: [{ id: 'a', name: 'A', binding: 'perfect' }], texts: { front: 'F' }, updatedAt: 5 });
  });

  it('takes the cover and spine texts and the ISBN from the book metadata', () => {
    expect(metadataTexts({ title: 'El oficio', subtitle: 'Una guía', author: 'Reyes' })).toEqual({
      title: 'El oficio',
      subtitle: 'Una guía',
      author: 'Reyes',
      spine: 'Reyes · El oficio',
    });
    expect(metadataTexts({ title: 'Solo título' })).toEqual({ title: 'Solo título', spine: 'Solo título' });
    expect(metadataTexts({ author: 'Sin título' })).toEqual({});
    expect(metadataIsbn({ isbn: ' 978-84-00000-00-4 ' })).toBe('978-84-00000-00-4');
    expect(metadataIsbn({})).toBeUndefined();
  });

  it('turns the panel design into the sheet design, the flaps sharing one ground', () => {
    expect(coverDesignOf(undefined)).toBeUndefined();
    expect(coverDesignOf({})).toBeUndefined();
    expect(coverDesignOf({ background: '#112233', zones: { flaps: '#eeeeee' }, image: { resourceId: 'p' } })).toEqual({
      background: { hex: '#112233', model: 'hex' },
      image: { resourceId: 'p', area: 'sheet' },
      zones: { flapFront: { hex: '#eeeeee', model: 'hex' }, flapBack: { hex: '#eeeeee', model: 'hex' } },
    });
  });

  it('lays the design and the text colour on a cover, not on an endpaper', () => {
    const version = newVersion('hardcover', 'Cartoné');
    const sheets = sheetsOf(version, config, 242, []);
    if (!('cover' in sheets)) throw new Error('no profile');
    const photo = { id: 'photo', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'p.jpg', format: 'jpeg', width: 10, height: 10 } } as const;
    const design = { background: '#112233', textColor: '#ffffff', image: { resourceId: 'photo' } };
    const cover = coverDocumentInput(sheets.cover, version, { front: '# T' }, config, design, [photo]);
    expect(cover.resources.map((r) => r.id)).toEqual(['photo']);
    expect(cover.config.bodyText?.color).toEqual({ hex: '#ffffff', model: 'hex' });
    expect(cover.config.paragraphStyles?.find((p) => p.id === 'cover-front-title')?.color).toEqual({ hex: '#ffffff', model: 'hex' });
    expect(cover.cover.template.decoration?.elements.map((e) => ('id' in e ? e.id : ''))).toEqual(['cover-ground', 'cover-image']);
    const endpaper = coverDocumentInput(pickSheet(sheets, 'endpaperFront'), version, {}, config, design, [photo]);
    expect(endpaper.resources).toEqual([]);
    expect(endpaper.cover.template.decoration).toBeUndefined();
    expect(endpaper.config.bodyText?.color).toBeUndefined();
  });

  it('keeps a stored design only as far as it reads', () => {
    const read = readBookProduction({ projectId: 'p', versions: [], texts: {}, design: { background: 'red', textColor: '#ffffff', zones: { spine: '#000000', bogus: '#111111' }, image: { resourceId: 'x', area: 'front' } } });
    expect(read?.design).toEqual({ textColor: '#ffffff', zones: { spine: '#000000' }, image: { resourceId: 'x', area: 'front' } });
  });

  it('sets a zone’s titles and text in its own paragraph styles', () => {
    expect(styledZoneText('# Título\n\nSubtítulo\n\nAutora', 'front')).toBe(
      ':::paragraphs{style="cover-front-title"}\n\nTítulo\n\n:::\n\n:::paragraphs{style="cover-front-text"}\n\nSubtítulo\n\nAutora\n\n:::',
    );
    expect(styledZoneText('Bio', 'flapBack')).toBe(':::paragraphs{style="cover-flaps-text"}\n\nBio\n\n:::');
  });

  it('starts the title from the book’s level-1 heading and lays the zone’s changes over it', () => {
    const styles = coverParagraphStyles(config, { zoneStyles: { front: { title: { fontSize: 36, align: 'center', bold: true }, text: { italic: true } } } });
    const title = styles.find((p) => p.id === 'cover-front-title')!;
    expect(title.fontSize).toEqual({ value: 36, unit: 'pt' });
    expect(title.lineHeight).toEqual({ value: 43.2, unit: 'pt' });
    expect(title.textAlign).toBe('center');
    expect(title.fontWeight).toBe(700);
    expect(styles.find((p) => p.id === 'cover-front-text')).toEqual({
      id: 'cover-front-text',
      italic: true,
      hyphenation: false,
      firstLineIndent: { value: 0, unit: 'pt' },
      indent: { value: 0, unit: 'pt' },
      textAlign: 'start',
      snapToGrid: false,
    });
    expect(styles.find((p) => p.id === 'cover-back-title')?.fontFamily).toBeTruthy();
    expect(styles.length).toBe(8);
  });

  it('places a zone’s text and keeps a stored zone style only as far as it reads', () => {
    const version = newVersion('paperback', 'Rústica');
    const sheets = sheetsOf(version, config, 242, []);
    if (!('cover' in sheets)) throw new Error('no profile');
    const input = coverDocumentInput(sheets.cover, version, { front: '# T' }, config, { zoneStyles: { front: { vertical: 'bottom' } } });
    expect(input.cover.template.frames?.find((f) => f.name === 'front')?.verticalAlign).toBe('bottom');
    const read = readBookProduction({ projectId: 'p', versions: [], texts: {}, design: { zoneStyles: { front: { title: { fontSize: 30, align: 'middle' }, vertical: 'bottom' }, nowhere: {} } } });
    expect(read?.design).toEqual({ zoneStyles: { front: { title: { fontSize: 30 }, vertical: 'bottom' } } });
  });

  it('lays the effects, the library’s logos and the finishes over the text, plates for the press', () => {
    const version = newVersion('paperback', 'Rústica');
    const sheets = sheetsOf(version, config, 242, []);
    if (!('cover' in sheets)) throw new Error('no profile');
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0]);
    const library = [{ id: 'pub', name: 'Editorial', group: 'publisher' as const, clearance: 4, mime: 'image/png' as const, bytes: png, width: 200, height: 100, updatedAt: 0 }];
    const design = {
      effects: [{ id: 'veil', kind: 'box' as const, color: '#000000', opacity: 0.5, zone: 'front' as const, x: 0, y: 0, width: 50, height: 20 }],
      logos: [{ id: 'l', kind: 'image' as const, logoId: 'pub', resourceId: 'logo:pub', zone: 'front' as const, x: 10, y: 180, width: 30, height: 15, clearance: 4 }],
      finishes: [{ id: 'gold', kind: 'foilGold' as const, ink: 'Oro', shape: { element: 'l' } }],
    };
    expect(coverDesignOf(design)).toMatchObject({
      effects: [{ id: 'veil', opacity: 0.5, color: { hex: '#000000' } }],
      logos: [{ id: 'l', resourceId: 'logo:pub', clearance: 4 }],
      finishes: [{ id: 'gold', ink: 'Oro' }],
    });
    const screen = coverDocumentInput(sheets.cover, version, {}, config, design, [], { logos: library });
    expect(screen.resources.map((r) => r.id)).toEqual(['logo:pub']);
    expect(screen.cover.files['logo-pub.png']).toBe(png);
    const ids = (input: typeof screen) => (input.cover.template.decoration?.elements ?? []).map((e) => ('id' in e ? e.id : ''));
    expect(ids(screen)).toEqual(['cover-fx-veil', 'cover-logo-l', 'cover-finish-gold']);
    const press = coverDocumentInput(sheets.cover, version, {}, config, design, [], { logos: library, press: true });
    const gold = press.cover.template.decoration!.elements.find((e) => 'id' in e && e.id === 'cover-finish-gold') as { style: { backgroundColor: { model: string; spot: { name: string } } } };
    expect(gold.style.backgroundColor).toMatchObject({ model: 'spot', spot: { name: 'Oro' } });
    const noFinishes = coverDocumentInput(sheets.cover, version, {}, config, design, [], { logos: library, hidden: new Set(['finishes'] as const) });
    expect(ids(noFinishes)).toEqual(['cover-fx-veil', 'cover-logo-l']);
  });

  it('mirrors a hardcover’s design into its turn-in past the version’s design margin', () => {
    const version = { ...newVersion('hardcover', 'Cartoné'), overrides: { designMargin: 6 } };
    const sheets = sheetsOf(version, config, 242, []);
    if (!('cover' in sheets)) throw new Error('no profile');
    expect(sheets.measures.designMargin).toBe(6);
    const input = coverDocumentInput(sheets.cover, version, {}, config, { background: '#112233' }, [], { mirror: { margin: sheets.measures.designMargin, pictures: {} } });
    expect(input.cover.designed?.x).toBeCloseTo(sheets.cover.trim.x - 6, 6);
    expect(input.resources.map((r) => r.id)).toContain('cover-mirror');
    const paper = sheetsOf(newVersion('paperback', 'Rústica'), config, 242, []);
    if (!('cover' in paper)) throw new Error('no profile');
    const soft = coverDocumentInput(paper.cover, newVersion('paperback', 'R'), {}, config, { background: '#112233' }, [], { mirror: { margin: paper.measures.designMargin, pictures: {} } });
    expect(soft.cover.designed).toBeUndefined();
  });
});

describe('the cover’s type', () => {
  it('breaks no words and indents no first line, whatever the book’s body does', async () => {
    const { coverParagraphStyles } = await import('./bookProduction.js');
    const styles = coverParagraphStyles({ bodyText: { firstLineIndent: { value: 1, unit: 'em' }, hyphenation: { enabled: true } } } as never, { zoneStyles: { front: { title: { align: 'center' } } } });
    for (const s of styles) {
      expect(s.hyphenation).toBe(false);
      expect(s.firstLineIndent).toEqual({ value: 0, unit: 'pt' });
    }
    expect(styles.find((s) => s.id.includes('front') && s.id.includes('title'))!.textAlign).toBe('center');
  });
});

describe('the book’s paper', () => {
  it('counts the inserts on their own paper, and the rest on the main one', async () => {
    const { bookRuns, readBookProduction } = await import('./bookProduction.js');
    const config = { folio: { paper: { grammage: 90, bulk: 1.25 } } } as never;
    const library = [{ id: 'offset80', name: 'Offset 80', grammage: 80, bulk: 1.3 }];
    expect(bookRuns(240, config)).toEqual([{ pages: 240, grammage: 90, bulk: 1.25 }]);
    const paper = { profileId: 'offset80', inserts: [{ pages: 16, grammage: 115, bulk: 0.9, name: 'Estucado' }] };
    expect(bookRuns(240, config, paper, library)).toEqual([{ pages: 224, grammage: 80, bulk: 1.3 }, { pages: 16, grammage: 115, bulk: 0.9 }]);
    // A profile gone from the library: the design's paper again.
    expect(bookRuns(240, config, { profileId: 'gone' }, library)[0]).toMatchObject({ grammage: 90 });
    const read = readBookProduction({ projectId: 'p', versions: [], texts: {}, paper: { profileId: 'offset80', inserts: [{ pages: 16, grammage: 115, bulk: 0.9 }, { pages: -2 }] } });
    expect(read!.paper).toEqual({ profileId: 'offset80', inserts: [{ pages: 16, grammage: 115, bulk: 0.9 }] });
  });

  it('prints the whole work’s ISBN over the barcode, introduced as asked', async () => {
    const { coverDocumentInput, newVersion, sheetsOf } = await import('./bookProduction.js');
    const config = { page: { width: { value: 150, unit: 'mm' }, height: { value: 230, unit: 'mm' } } } as never;
    const version = { ...newVersion('paperback', 'Rústica'), isbn: '978-0-306-40615-7', workIsbn: '9788498350005' };
    const sheets = sheetsOf(version, config, 240, []);
    if (!('cover' in sheets)) throw new Error('no profile');
    const input = coverDocumentInput(sheets.cover, version, {}, config, undefined, [], { workIsbnLabel: 'ISBN obra completa' });
    const text = input.cover.template.decoration!.elements.find((e) => 'id' in e && e.id === 'isbn-work') as { content: string } | undefined;
    expect(text?.content).toBe('ISBN obra completa 9788498350005');
    const bad = coverDocumentInput(sheets.cover, { ...version, workIsbn: '123' }, {}, config);
    expect(bad.cover.template.decoration!.elements.some((e) => 'id' in e && e.id === 'isbn-work')).toBe(false);
  });
});
