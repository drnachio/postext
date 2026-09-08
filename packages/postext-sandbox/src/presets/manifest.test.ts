import { describe, expect, it } from 'vitest';
import {
  fontsToCustomFonts,
  isPresetIndex,
  isPresetManifest,
  mimeForFile,
  pickMarkdownFile,
  presetFileId,
  presetFontFileId,
  resourceFromSpec,
} from './manifest';
import type { PresetManifest } from './types';

const manifest = (over: Partial<PresetManifest> = {}): PresetManifest => ({
  version: 1,
  id: 'brochure',
  name: 'Brochure',
  markdown: 'doc.md',
  ...over,
});

describe('isPresetIndex', () => {
  it('accepts a well-formed index', () => {
    expect(isPresetIndex({ version: 1, presets: [{ id: 'a', dir: 'a', name: 'A' }] })).toBe(true);
    expect(isPresetIndex({ version: 1, presets: [] })).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(isPresetIndex(null)).toBe(false);
    expect(isPresetIndex('nope')).toBe(false);
    expect(isPresetIndex({ version: 2, presets: [] })).toBe(false);
    expect(isPresetIndex({ version: 1 })).toBe(false);
    expect(isPresetIndex({ version: 1, presets: [{ id: 'a', name: 'A' }] })).toBe(false);
    expect(isPresetIndex({ version: 1, presets: [{ id: '', dir: 'a', name: 'A' }] })).toBe(false);
  });
});

describe('isPresetManifest', () => {
  it('accepts string and per-locale markdown', () => {
    expect(isPresetManifest(manifest())).toBe(true);
    expect(isPresetManifest(manifest({ markdown: { en: 'en.md', es: 'es.md' } }))).toBe(true);
    expect(isPresetManifest(manifest({
      resources: [{ id: 'fig', typeId: 'figure', kind: 'svg', file: 'fig.svg' }],
      fonts: [{ name: 'Acme', variants: [{ weight: 400, style: 'normal', file: 'acme.woff2' }] }],
    }))).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(isPresetManifest(undefined)).toBe(false);
    expect(isPresetManifest(manifest({ version: 0 as unknown as 1 }))).toBe(false);
    expect(isPresetManifest({ ...manifest(), id: undefined })).toBe(false);
    expect(isPresetManifest(manifest({ markdown: {} }))).toBe(false);
    expect(isPresetManifest(manifest({ markdown: '' }))).toBe(false);
    expect(isPresetManifest({ ...manifest(), config: 'x' })).toBe(false);
    expect(isPresetManifest({ ...manifest(), resources: [{ id: 'x' }] })).toBe(false);
    expect(isPresetManifest({ ...manifest(), fonts: [{ name: 'A', variants: [{ file: 'a.ttf' }] }] })).toBe(false);
  });
});

describe('presetFileId / presetFontFileId', () => {
  it('is deterministic and slugs the path', () => {
    expect(presetFileId('brochure', 'figures/Cover Photo.PNG')).toBe('preset:brochure:figures-cover-photo-png');
    expect(presetFileId('brochure', 'figures/Cover Photo.PNG')).toBe(presetFileId('brochure', 'figures/Cover Photo.PNG'));
    expect(presetFontFileId('brochure', 'fonts/Acme-Bold.ttf')).toBe('preset-font:brochure:fonts-acme-bold-ttf');
  });

  it('separates presets and files', () => {
    expect(presetFileId('a', 'x.svg')).not.toBe(presetFileId('b', 'x.svg'));
    expect(presetFileId('a', 'x.svg')).not.toBe(presetFileId('a', 'y.svg'));
    expect(presetFileId('a', 'x.svg')).not.toBe(presetFontFileId('a', 'x.svg'));
  });
});

describe('pickMarkdownFile', () => {
  it('returns a plain string as-is', () => {
    expect(pickMarkdownFile(manifest(), 'es')).toBe('doc.md');
  });

  it('falls back exact → base language → manifest locale → first', () => {
    const m = manifest({ markdown: { 'pt-BR': 'pt-br.md', es: 'es.md', 'en-GB': 'en-gb.md' }, locale: 'en-GB' });
    expect(pickMarkdownFile(m, 'pt-BR')).toBe('pt-br.md');
    expect(pickMarkdownFile(m, 'es-ES')).toBe('es.md');
    expect(pickMarkdownFile(m, 'fr')).toBe('en-gb.md');
    const noLocale = manifest({ markdown: { es: 'es.md', en: 'en.md' } });
    expect(pickMarkdownFile(noLocale, 'fr')).toBe('es.md');
    expect(pickMarkdownFile(noLocale, 'EN')).toBe('en.md');
  });
});

describe('fontsToCustomFonts', () => {
  it('groups variants per family and skips .woff / unknown files', () => {
    const out = fontsToCustomFonts('brochure', [
      {
        name: 'Acme',
        variants: [
          { weight: 400, style: 'normal', file: 'fonts/Acme-Regular.ttf' },
          { weight: 700, style: 'italic', file: 'fonts/Acme-BoldItalic.otf' },
          { weight: 300, style: 'normal', file: 'fonts/Acme-Light.woff' },
        ],
      },
      { name: 'Legacy', variants: [{ weight: 400, style: 'normal', file: 'legacy.eot' }] },
    ]);
    expect(out.families).toEqual([
      {
        name: 'Acme',
        variants: [
          { weight: 400, style: 'normal', fileId: 'preset-font:brochure:fonts-acme-regular-ttf', format: 'ttf', fileName: 'Acme-Regular.ttf' },
          { weight: 700, style: 'italic', fileId: 'preset-font:brochure:fonts-acme-bolditalic-otf', format: 'otf', fileName: 'Acme-BoldItalic.otf' },
        ],
      },
    ]);
    expect(out.files.map((f) => f.file)).toEqual(['fonts/Acme-Regular.ttf', 'fonts/Acme-BoldItalic.otf']);
    expect(out.warnings).toHaveLength(3);
    expect(out.warnings[0]).toContain('Acme-Light.woff');
    expect(out.warnings[1]).toContain('legacy.eot');
    expect(out.warnings[2]).toContain('Legacy');
  });
});

describe('resourceFromSpec', () => {
  it('maps an SVG file', () => {
    const r = resourceFromSpec('brochure', {
      id: 'pipeline', typeId: 'figure', kind: 'svg', file: 'figures/pipeline.svg', caption: 'Pipeline',
      note: 'authoring note',
    }, { width: 300, height: 120 });
    expect(r.kind).toBe('svg');
    expect(r.svg).toEqual({ fileId: 'preset:brochure:figures-pipeline-svg', width: 300, height: 120 });
    expect(r.bitmap).toBeUndefined();
    expect(r.caption).toBe('Pipeline');
    expect((r as unknown as { note?: string }).note).toBeUndefined();
    expect((r as unknown as { file?: string }).file).toBeUndefined();
    expect(typeof r.createdAt).toBe('number');
    expect(r.updatedAt).toBe(r.createdAt);
  });

  it('omits SVG dimensions when unknown', () => {
    const r = resourceFromSpec('b', { id: 'x', typeId: 'figure', kind: 'svg', file: 'x.svg' });
    expect(r.svg).toEqual({ fileId: 'preset:b:x-svg' });
  });

  it('maps a bitmap file, preferring explicit dimensions', () => {
    const r = resourceFromSpec('b', {
      id: 'cover', typeId: 'figure', kind: 'bitmap', file: 'Cover.JPG', width: 800, height: 600,
    }, { width: 1, height: 1 });
    expect(r.kind).toBe('bitmap');
    expect(r.bitmap).toEqual({ fileId: 'preset:b:cover-jpg', format: 'jpeg', width: 800, height: 600 });
    const png = resourceFromSpec('b', { id: 'p', typeId: 'figure', kind: 'bitmap', file: 'p.png' });
    expect(png.bitmap).toEqual({ fileId: 'preset:b:p-png', format: 'png', width: 0, height: 0 });
  });

  it('keeps a table inline', () => {
    const model = { rows: [[{ content: 'a' }]], headerRowCount: 0 };
    const r = resourceFromSpec('b', {
      id: 't', typeId: 'table', kind: 'table', table: { model }, placement: { position: 'top', span: 'page' },
    });
    expect(r.kind).toBe('table');
    expect(r.table).toEqual({ model });
    expect(r.placement).toEqual({ position: 'top', span: 'page' });
    expect(r.svg).toBeUndefined();
    expect(r.bitmap).toBeUndefined();
  });
});

describe('mimeForFile', () => {
  it('maps known extensions', () => {
    expect(mimeForFile('a/b.svg')).toBe('image/svg+xml');
    expect(mimeForFile('x.JPG')).toBe('image/jpeg');
    expect(mimeForFile('x.webp')).toBe('image/webp');
    expect(mimeForFile('x.bin')).toBe('application/octet-stream');
  });
});
