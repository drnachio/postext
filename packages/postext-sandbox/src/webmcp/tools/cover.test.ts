import { describe, expect, it } from 'vitest';
import { chapter, harness } from './testHarness.js';

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
});
