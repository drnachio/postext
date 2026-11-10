import { describe, expect, it } from 'vitest';
import { isTemplateFile, templateFromFile, templateToFile, type DesignTemplate } from './templateStore.js';

const bytes = (...n: number[]) => new Uint8Array(n).buffer;

const template: DesignTemplate = {
  id: 'tpl-1',
  name: 'Colección Salud',
  source: 'Manual de urgencias',
  createdAt: 1,
  updatedAt: 1,
  design: {
    parts: ['typography', 'colors'],
    config: {
      bodyText: { fontFamily: 'House Serif' },
      customFonts: [
        { name: 'House Serif', variants: [{ weight: 400, style: 'normal', fileId: 'f-1', format: 'ttf' }] },
        { name: 'Licensed Sans', redistributable: false, variants: [{ weight: 400, style: 'normal', fileId: 'f-2', format: 'otf' }] },
      ],
    },
  },
  fonts: [
    { fileId: 'f-1', fileName: 'house.ttf', format: 'ttf', buffer: bytes(0, 1, 2, 250) },
    { fileId: 'f-2', fileName: 'licensed.otf', format: 'otf', buffer: bytes(9) },
  ],
  blobs: [],
};

describe('template files', () => {
  it('round-trips a template, fonts included, with a fresh id', () => {
    const file = JSON.parse(JSON.stringify(templateToFile(template))) as unknown;
    expect(isTemplateFile(file)).toBe(true);
    const back = templateFromFile(file as Parameters<typeof templateFromFile>[0]);
    expect(back.id).not.toBe('tpl-1');
    expect(back.name).toBe('Colección Salud');
    expect(back.source).toBe('Manual de urgencias');
    expect(back.design.parts).toEqual(['typography', 'colors']);
    expect(back.design.config.bodyText?.fontFamily).toBe('House Serif');
    expect([...new Uint8Array(back.fonts[0]!.buffer)]).toEqual([0, 1, 2, 250]);
  });

  it('leaves out the files of fonts that are not redistributable', () => {
    const file = templateToFile(template);
    expect(file.fonts.map((f) => f.fileId)).toEqual(['f-1']);
  });

  it('rejects files that are not templates', () => {
    expect(isTemplateFile({ type: 'postext-config', version: 1, config: {} })).toBe(false);
    expect(isTemplateFile(null)).toBe(false);
  });
});
