import { describe, expect, it } from 'vitest';
import { chapter, harness } from '../testHarness.js';

// #1669: the print cover for an agent — the sheet read, the cover's text
// written as a step of the history.

const book = () => {
  const chapters = [chapter('a', 'Opening', '---\ntitle: The Book\nauthor: Someone\n---\n\n# Opening\n\nSome words here.\n')];
  return { chapters, markdown: chapters[0]!.markdown };
};
const withVersion = { production: { versions: [{ id: 'pb', name: 'Paperback', binding: 'perfect' }] } };

describe('the cover tools', () => {
  it('say how to add a version when the book has none', async () => {
    const { call } = harness(book());
    expect((await call('sandbox_cover_get')).error).toMatch(/no print version.*production\.versions/);
  });

  it('read the sheet of a version: its size, spine, panels and slots', async () => {
    const { call } = harness({ ...book(), config: withVersion as never });
    const got = await call('sandbox_cover_get');
    expect(got).toMatchObject({ version: 'pb', sheet: 'cover', sheets: ['cover'] });
    expect(got.size.widthMm).toBeGreaterThan(2 * got.zones.find((z: { name: string }) => z.name === 'front').widthMm);
    expect(got.zones.map((z: { name: string }) => z.name)).toEqual(expect.arrayContaining(['front', 'back', 'spine']));
    expect(got.slots).toEqual(expect.arrayContaining([{ slot: 'back', text: null }]));
    expect((await call('sandbox_cover_get', { version: 'hc' })).error).toMatch(/No version "hc".*pb/);
  });

  it('write a slot\'s text as one step of the history, and refuse a slot the sheet has not', async () => {
    const { call, get } = harness({ ...book(), config: withVersion as never });
    const done = await call('sandbox_cover_write_text', { slot: 'back', text: 'A *blurb* for the back.' });
    expect(done.slots).toEqual(expect.arrayContaining([{ slot: 'back', text: 'A *blurb* for the back.' }]));
    expect(get().coverMarkdown).toContain(':::frame{slot="back"}');
    expect((await call('sandbox_cover_write_text', { slot: 'pastedown', text: 'x' })).error).toMatch(/no slot "pastedown"/);
    const undone = await call('sandbox_undo', { wait: false });
    expect(undone.undone).toEqual({ kind: 'cover' });
    expect(get().coverMarkdown ?? '').not.toContain('blurb');
  });

  it('read the versions and the cover\'s design written through sandbox_set_config', async () => {
    const { call } = harness(book());
    const set = await call('sandbox_set_config', { patch: {
      production: { versions: [{ id: 'pb', name: 'Paperback', binding: 'perfect', isbn: '978-0-306-40615-7' }, { id: 'hc', name: 'Hardcover', binding: 'case-flat' }] },
      cover: { textBoxes: [{ name: 'quote', rect: { x: 20, y: 30, width: 80, height: 40 } }] },
    }, wait: false });
    expect(set.error).toBeUndefined();
    const got = await call('sandbox_cover_get', { version: 'hc' });
    expect(got.versions).toEqual([
      { id: 'pb', name: 'Paperback', binding: 'perfect', isbn: '978-0-306-40615-7' },
      { id: 'hc', name: 'Hardcover', binding: 'case-flat' },
    ]);
    expect(got.version).toBe('hc');
    expect(got.sheets).toEqual(['cover', 'endpaperFront', 'endpaperBack']);
    expect(got.slots.map((s: { slot: string }) => s.slot)).toContain('quote');
    expect(got.items).toEqual(expect.arrayContaining([expect.objectContaining({ layer: 'textBoxes', id: 'quote', rectMm: { x: 20, y: 30, width: 80, height: 40 } })]));
  });

  // #1673: a design and text per sheet, the collection's catalogue.
  const hardcover = { production: { versions: [{ id: 'hc', name: 'Hardcover', binding: 'case-flat', flaps: true, caseMaterial: 'cloth' }] }, cover: { background: { hex: '#ffffff', model: 'hex' }, image: { resourceId: 'art' } } };

  it('give the case a design of its own, edit it apart from the book’s and go back', async () => {
    const { call, get } = harness({ ...book(), config: hardcover as never });
    const before = await call('sandbox_cover_get');
    expect(before.sheets).toEqual(['cover', 'jacket', 'endpaperFront', 'endpaperBack']);
    expect(before.design).toEqual({ uses: 'book', choices: ['case'] });
    const own = await call('sandbox_cover_sheet_design', { design: 'own', patch: { image: null, background: { hex: '#24452f', model: 'hex' } } });
    expect(own.uses).toBe('case');
    expect(own.design).toEqual({ background: { hex: '#24452f', model: 'hex' } });
    expect(get().config.cover!.image).toEqual({ resourceId: 'art' });
    expect((await call('sandbox_cover_get', { sheet: 'jacket' })).design.uses).toBe('book');
    const endpaper = await call('sandbox_cover_sheet_design', { sheet: 'endpaperFront', design: 'endpapers' });
    expect(endpaper).toMatchObject({ uses: 'endpapers', choices: ['endpaperFront', 'endpapers'] });
    expect((await call('sandbox_cover_sheet_design', { design: 'own', sheet: 'jacket', version: 'hc' })).uses).toBe('jacket');
    expect(Object.keys(get().config.cover!.sheets!)).toEqual(['case', 'endpapers', 'jacket']);
    const back = await call('sandbox_cover_sheet_design', { design: 'book' });
    expect(back.uses).toBe('book');
    expect(get().config.cover!.sheets!.case).toBeUndefined();
    const undone = await call('sandbox_undo', { wait: false });
    expect(undone.undone).toMatchObject({ kind: 'design' });
    expect(get().config.cover!.sheets!.case).toBeDefined();
  });

  it('refuse an own design or text on a paperback’s cover', async () => {
    const { call } = harness({ ...book(), config: withVersion as never });
    expect((await call('sandbox_cover_sheet_design', { design: 'own' })).error).toMatch(/book's cover itself/);
    expect((await call('sandbox_cover_write_text', { slot: 'back', text: 'x', thisSheetOnly: true })).error).toMatch(/shared ones/);
  });

  it('write a text for the case alone beside the shared one', async () => {
    const { call, get } = harness({ ...book(), config: hardcover as never });
    await call('sandbox_cover_write_text', { slot: 'front', text: 'Shared front' });
    const done = await call('sandbox_cover_write_text', { slot: 'front', text: 'Stamped title', thisSheetOnly: true });
    expect(done.slots).toEqual(expect.arrayContaining([{ slot: 'front', text: 'Shared front', sheetText: 'Stamped title' }]));
    expect(get().coverMarkdown).toContain(':::frame{slot="front" sheet="case"}');
    const jacket = await call('sandbox_cover_get', { sheet: 'jacket' });
    expect(jacket.slots).toEqual(expect.arrayContaining([{ slot: 'front', text: 'Shared front' }]));
  });

  it('write the catalogue and the volume, and refuse a volume or picture the book has not', async () => {
    const { call, get } = harness({ ...book(), config: hardcover as never });
    const set = await call('sandbox_cover_set_collection', {
      name: 'Series',
      catalogue: [{ id: 'one', title: 'One' }, { id: 'two', title: 'Two' }],
      volume: 'two',
    });
    expect(set.collection).toEqual({ name: 'Series', catalogue: [{ id: 'one', title: 'One' }, { id: 'two', title: 'Two' }], volume: 'two' });
    expect((await call('sandbox_cover_get')).collection.volume).toBe('two');
    expect((await call('sandbox_cover_set_collection', { volume: 'three' })).error).toMatch(/No title "three".*one, two/);
    expect((await call('sandbox_cover_set_collection', { catalogue: [{ id: 'a', title: 'A', resource: 'missing' }] })).error).toMatch(/No resource "missing"/);
    expect((await call('sandbox_cover_set_collection', { catalogue: [{ id: 'a b', title: 'A' }] })).error).toMatch(/letters, digits/);
    // A catalogue without the volume's title drops the volume.
    await call('sandbox_cover_set_collection', { catalogue: [{ id: 'one', title: 'One' }] });
    expect(get().config.production!.collection).toEqual({ name: 'Series', catalogue: [{ id: 'one', title: 'One' }] });
  });

  // #1679: text boxes anchored, continued, grown and shrunk.
  it('add text boxes anchored to a panel and to each other, continued, and report them', async () => {
    const { call, get } = harness({ ...book(), config: withVersion as never });
    const title = await call('sandbox_cover_text_box', { name: 'title', rect: { x: 0, y: 0, width: 80, height: 20 }, anchor: { to: 'front', edge: 'top', y: 10 }, maxHeight: 40 });
    expect(title.error).toBeUndefined();
    expect(title.box).toMatchObject({ name: 'title', anchor: { to: 'front', edge: 'top', y: 10 }, maxHeight: 40 });
    await call('sandbox_cover_text_box', { name: 'more', rect: { x: 0, y: 0, width: 80, height: 30 } });
    const blurb = await call('sandbox_cover_text_box', { name: 'blurb', rect: { x: 0, y: 0, width: 80, height: 30 }, anchor: { to: 'title', edge: 'below', y: 4 }, next: 'more', fit: { minScale: 0.8 } });
    expect(blurb.rectMm.y).toBeCloseTo(title.rectMm.y + 20 + 4, 1);
    expect(blurb.issues).toEqual([]);
    const got = await call('sandbox_cover_get');
    expect(got.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'blurb', anchor: { to: 'title', edge: 'below', y: 4 }, next: 'more', fit: { minScale: 0.8 } })]));
    expect(got.slots).toEqual(expect.arrayContaining([{ slot: 'more', text: null, continues: 'blurb' }]));
    expect((await call('sandbox_cover_text_box', { name: 'x', rect: { x: 0, y: 0, width: 1, height: 1 }, anchor: { to: 'front', edge: 'below' } })).error).toMatch(/beside another text box/);
    expect((await call('sandbox_cover_text_box', { name: 'blurb', next: 'nowhere' })).error).toMatch(/no other text box/);
    // Removing the box hung from lets the other go.
    const removed = await call('sandbox_cover_text_box', { name: 'title', remove: true });
    expect(removed.removed).toBe('title');
    expect(get().config.cover!.textBoxes!.find((t) => t.name === 'blurb')!.anchor).toBeUndefined();
  });
});
