import { describe, it, expect } from 'vitest';
import type { PostextConfig } from 'postext';
import { openDesignBundle } from 'postext/bundle';
import {
  designOfTemplate,
  designFileFromTemplate,
  legacyTemplateFromFile,
  legacyTemplateFromRecord,
  moveLegacyTemplates,
  movedTemplateId,
  type LegacyTemplateSource,
} from './legacyTemplates.js';
import type { SavedDesign } from './designStore.js';

// #1532: the design templates of postext 1.78 (#1523's first form) read
// as today's designs, from 1.78's database and from its template files.

const FONT = new Uint8Array([0x00, 0x01, 0x00, 0x00, 1, 2, 3, 4]).buffer;

/** A template's configuration as 1.78 saved it: its parts' keys, the
 *  custom family they name, a 1.78 line binding key. */
const CONFIG = {
  page: { binding: 'right', margins: { top: { value: 20, unit: 'mm' } } },
  layout: { layoutType: 'double' },
  bodyText: { fontFamily: 'House Serif', bindCitations: true },
  headings: { color: { hex: '#123456' } },
  colorPalette: [{ id: 'ink', name: 'Ink', color: { hex: '#111111' } }],
  header: { enabled: true },
  customFonts: [{ name: 'House Serif', variants: [{ weight: 400, style: 'normal', fileId: 'font-1', fileName: 'house.ttf', format: 'ttf' }] }],
} as unknown as PostextConfig;

const record = (over: Record<string, unknown> = {}) => ({
  id: 'tpl-abc',
  name: 'House style',
  description: 'Our journal',
  source: 'Volume 3',
  createdAt: 1000,
  updatedAt: 2000,
  design: { parts: ['page', 'typography', 'colors', 'headerFooter'], config: CONFIG },
  fonts: [{ fileId: 'font-1', fileName: 'house.ttf', format: 'ttf', buffer: FONT }],
  blobs: [],
  ...over,
});

function base64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

describe('1.78 design templates as designs (#1532)', () => {
  it('takes the parts whose settings the template holds', () => {
    const t = legacyTemplateFromRecord(record())!;
    const design = designOfTemplate(t.config, t.parts);
    // 1.78's page held the binding (today's writing part); its typography
    // the headings (a part of their own now) and the composition rules
    // (#1540: the citation breaks below).
    expect(design.parts).toEqual(['page', 'writing', 'colors', 'text', 'composition', 'headings', 'running']);
    expect(design.config.page).toEqual({ binding: 'right', margins: { top: { value: 20, unit: 'mm' } } });
    expect(design.config.customFonts?.map((f) => f.name)).toEqual(['House Serif']);
    // The 1.78 line binding is read as today's setting.
    expect(design.config.bodyText).toEqual({ fontFamily: 'House Serif', citationBreaks: 'avoid' });
  });

  it('keeps the parts of a template whose settings were all defaults', () => {
    expect(designOfTemplate({}, ['typography', 'print']).parts).toEqual(['text', 'output']);
    expect(() => designOfTemplate({}, [])).toThrow();
  });

  it('writes a design file with the template\'s fonts', async () => {
    const t = legacyTemplateFromRecord(record())!;
    const made = await designFileFromTemplate(t, 'en');
    const opened = await openDesignBundle(made.bytes);
    expect(opened.fromBook).toBe(false);
    expect(opened.name).toBe('House style');
    expect(opened.description).toBe('Our journal');
    expect(opened.design.parts).toEqual(made.parts);
    expect(opened.fonts).toHaveLength(1);
    expect([...new Uint8Array(opened.fonts[0]!.bytes)]).toEqual([...new Uint8Array(FONT)]);
  });

  it('reads a .postext-template.json file of 1.78', () => {
    const file = {
      type: 'postext-design-template',
      version: 1,
      configVersion: 22,
      name: 'House style',
      parts: ['typography'],
      config: { bodyText: { bindOperators: true } },
      fonts: [{ fileId: 'font-1', fileName: 'house.ttf', format: 'ttf', data: base64(FONT) }],
      blobs: [],
    };
    const t = legacyTemplateFromFile(file)!;
    expect(t.name).toBe('House style');
    expect(t.config.bodyText).toEqual({ operatorBreaks: 'avoid' });
    expect([...new Uint8Array(t.fonts[0]!.buffer)]).toEqual([...new Uint8Array(FONT)]);
    // Its typography held a composition rule alone (#1540).
    expect(designOfTemplate(t.config, t.parts).parts).toEqual(['composition']);
    expect(legacyTemplateFromFile({ type: 'postext-config', version: 1, config: {} })).toBeNull();
    expect(legacyTemplateFromFile({ ...file, version: 2 })).toBeNull();
  });

  it('moves every record, then deletes the old database', async () => {
    const written: SavedDesign[] = [];
    let removed = false;
    const source: LegacyTemplateSource = { read: async () => [record(), record({ id: 'tpl-def', name: 'Second' })], remove: async () => { removed = true; } };
    expect(await moveLegacyTemplates(async (d) => { expect(removed).toBe(false); written.push(d); }, source)).toBe(2);
    expect(removed).toBe(true);
    expect(written.map((d) => [d.id, d.name])).toEqual([[movedTemplateId('tpl-abc'), 'House style'], [movedTemplateId('tpl-def'), 'Second']]);
    expect(written[0]).toMatchObject({ description: 'Our journal', source: 'Volume 3', createdAt: 1000, updatedAt: 2000 });
    expect((await openDesignBundle(new Uint8Array(written[0]!.bytes))).design.parts).toEqual(written[0]!.parts);
  });

  it('keeps the old database when a record is not written, and makes none when there is none', async () => {
    let removed = false;
    const source: LegacyTemplateSource = { read: async () => [record(), record({ id: 'tpl-def' })], remove: async () => { removed = true; } };
    let calls = 0;
    await moveLegacyTemplates(async () => { if (++calls === 2) throw new Error('quota'); }, source);
    expect(removed).toBe(false);
    const unreadable: LegacyTemplateSource = { read: async () => [{ id: 'x' }], remove: async () => { removed = true; } };
    expect(await moveLegacyTemplates(async () => undefined, unreadable)).toBe(0);
    expect(removed).toBe(false);
    const none: LegacyTemplateSource = { read: async () => null, remove: async () => { removed = true; } };
    expect(await moveLegacyTemplates(async () => { throw new Error('not called'); }, none)).toBe(0);
    expect(removed).toBe(false);
  });
});
