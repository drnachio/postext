import { beforeAll, describe, expect, it, vi } from 'vitest';
import { extractDesign, type PostextConfig } from 'postext';
import { createDesignBundle } from 'postext/bundle';
import { setDesignUrls } from '../../designs/designSources.js';
import { designTrialOf } from '../../designs/designTrial.js';
import { harness } from './testHarness.js';

// #1523: designs as tools, on the module the Design panel uses. A design
// the site ships is fetched like any other (no IndexedDB here).

const pt = (value: number) => ({ value, unit: 'pt' as const });
const URL_ = '/designs/lean.postext';
let bytes: Uint8Array;

beforeAll(async () => {
  const config = {
    page: { sizePreset: '21x28' },
    bodyText: { fontSize: pt(12) },
    paragraphStyles: [{ id: 'quote', name: 'Quote', italic: true }],
    headings: { textAlign: 'end' },
  } as PostextConfig;
  bytes = (await createDesignBundle({ id: 'lean', name: 'Lean', locale: 'en', design: extractDesign(config, ['page', 'text']), mtime: new Date(1980, 0, 1) })).bytes;
  vi.stubGlobal('fetch', async (url: string) => (url === URL_ ? new Response(bytes.slice()) : new Response(null, { status: 404 })));
  setDesignUrls([URL_]);
});

const BOOK = {
  page: { width: { value: 120, unit: 'mm' }, height: { value: 180, unit: 'mm' } },
  headings: { textAlign: 'center' },
  paragraphStyles: [{ id: 'aside', name: 'Aside' }],
} as PostextConfig;

describe('the design tools', () => {
  it('list the shipped design with its parts', async () => {
    const { call } = harness({ config: BOOK, activePresetId: 'list' });
    const listed = await call('sandbox_list_designs');
    expect(listed.designs).toContainEqual(expect.objectContaining({ id: 'builtin:lean', kind: 'builtin', name: 'Lean', parts: ['page', 'text'] }));
    expect(listed.trying).toBeNull();
    expect(listed.parts[0]).toBe('page');
  });

  it('try a design and discard it, keeping the edits made meanwhile', async () => {
    const { call, get, host } = harness({ config: BOOK, activePresetId: 'discard' });
    const tried = await call('sandbox_try_design', { design: 'builtin:lean' });
    expect(tried.ok).toBe(true);
    expect(tried.trying).toMatchObject({ design: 'builtin:lean', parts: ['page', 'text'], missingStyles: [] });
    expect(get().config.page?.sizePreset).toBe('21x28');
    expect(get().config.bodyText?.fontSize).toEqual(pt(12));
    // Named styles merge by id; headings are not a part of this design.
    expect(get().config.paragraphStyles?.map((s) => s.id)).toEqual(['aside', 'quote']);
    expect(get().config.headings?.textAlign).toBe('center');
    // An edit made while trying.
    host.store.dispatch({ type: 'SET_CONFIG', payload: { ...get().config, headings: { textAlign: 'start' } } as PostextConfig });
    const ended = await call('sandbox_end_design_trial', { outcome: 'discard' });
    expect(ended.discarded).toBe('builtin:lean');
    expect(get().config.page).toEqual(BOOK.page);
    expect(get().config.bodyText?.fontSize).toBeUndefined();
    expect(get().config.paragraphStyles?.map((s) => s.id)).toEqual(['aside']);
    expect(get().config.headings?.textAlign).toBe('start');
    expect((await call('sandbox_end_design_trial', { outcome: 'keep' })).error).toMatch(/No design is being tried/);
  });

  it('keep a trial, and take it back with undo', async () => {
    const { call, get } = harness({ config: BOOK, activePresetId: 'keep' });
    await call('sandbox_try_design', { design: 'builtin:lean', parts: ['text'] });
    expect(get().config.page).toEqual(BOOK.page);
    expect((await call('sandbox_end_design_trial', { outcome: 'keep' })).kept).toBe('builtin:lean');
    expect(designTrialOf(get())).toBeNull();
    expect(get().config.bodyText?.fontSize).toEqual(pt(12));
    await call('sandbox_undo', {});
    expect(get().config.bodyText?.fontSize).toBeUndefined();
  });

  it('drop a trial when another book opens', async () => {
    const { call, get } = harness({ config: BOOK, activePresetId: 'first' });
    await call('sandbox_try_design', { design: 'builtin:lean' });
    expect(designTrialOf(get())).not.toBeNull();
    expect(designTrialOf({ ...get(), activePresetId: 'second' })).toBeNull();
  });

  it('apply a design to the general settings of a book in several languages', async () => {
    const shared = { ...BOOK } as PostextConfig;
    const edition = { ...BOOK, locale: 'ar', bodyText: { fontFamily: 'Amiri' } } as PostextConfig;
    const { call, get } = harness({ config: edition, configLayers: { shared, scope: 'edition' }, activePresetId: 'many' });
    const done = await call('sandbox_apply_design', { design: 'builtin:lean' });
    expect(done).toMatchObject({ applied: 'builtin:lean', parts: ['page', 'text'] });
    expect(get().configLayers?.shared.bodyText?.fontSize).toEqual(pt(12));
    expect(get().configLayers?.shared.page?.sizePreset).toBe('21x28');
    // The edition keeps what it sets itself.
    expect(get().config.bodyText?.fontFamily).toBe('Amiri');
    expect(get().config.locale).toBe('ar');
  });

  it('export the book’s design as a design file, by parts', async () => {
    const { call } = harness({ config: { ...BOOK, bodyText: { fontSize: pt(10) } } as PostextConfig, activePresetId: 'export' });
    const out = await call('sandbox_export_design', { parts: ['text'], name: 'Mine', deliver: 'data' });
    expect(out).toMatchObject({ file: 'mine.postext', parts: ['text'] });
    expect(atob(out.base64).slice(0, 2)).toBe('PK');
  });

  it('say what was wrong', async () => {
    const { call } = harness({ activePresetId: 'wrong' });
    expect((await call('sandbox_try_design', { design: 'builtin:none' })).error).toMatch(/No design "builtin:none"/);
    expect((await call('sandbox_try_design', { design: 'builtin:lean', parts: ['typography'] })).error).toMatch(/parts\[0\]/);
    expect((await call('sandbox_apply_design', { design: 'builtin:lean', asChapterStyle: {} })).error).toMatch(/an id .* or a name/);
    expect((await call('sandbox_delete_design', { design: 'builtin:lean' })).error).toMatch(/Only a saved design/);
  });
});
