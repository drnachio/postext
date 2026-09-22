import { describe, expect, it } from 'vitest';
import {
  chapterFileName,
  fontsToCustomFonts,
  isPresetIndex,
  isPresetManifest,
  mimeForFile,
  pickChapterSpecs,
  pickMarkdownFile,
  presetFileId,
  presetFontFileId,
  resourceFromSpec,
} from './manifest';
import type { PresetManifestV1, PresetManifestV2 } from './types';

const manifest = (over: Partial<PresetManifestV1> = {}): PresetManifestV1 => ({
  version: 1,
  id: 'brochure',
  name: 'Brochure',
  markdown: 'doc.md',
  ...over,
});

const manifestV2 = (over: Partial<PresetManifestV2> = {}): PresetManifestV2 => ({
  version: 2,
  id: 'book',
  name: 'Book',
  chapters: [{ title: 'One', file: 'chapters/01-one.md' }, { title: 'Two', file: 'chapters/02-two.md' }],
  ...over,
});

describe('v2 manifests', () => {
  it('accepts chapter lists and per-locale chapter maps', () => {
    expect(isPresetManifest(manifestV2())).toBe(true);
    expect(isPresetManifest(manifestV2({ chapters: { en: [{ title: '', file: 'en/01.md' }], es: [{ title: '', file: 'es/01.md' }] } }))).toBe(true);
    expect(isPresetManifest(manifestV2({ chapters: [] }))).toBe(false);
    expect(isPresetManifest(manifestV2({ chapters: [{ title: 'x', file: '' }] }))).toBe(false);
    expect(isPresetManifest({ ...manifestV2(), version: 3 })).toBe(false);
  });
  it('picks chapter specs for both versions', () => {
    expect(pickChapterSpecs(manifest(), 'en')).toEqual([{ title: '', file: 'doc.md' }]);
    expect(pickChapterSpecs(manifestV2(), 'en').map((c) => c.file)).toEqual(['chapters/01-one.md', 'chapters/02-two.md']);
    const localized = manifestV2({ chapters: { en: [{ title: 'E', file: 'en.md' }], es: [{ title: 'S', file: 'es.md' }] }, locale: 'es' });
    expect(pickChapterSpecs(localized, 'es-ES')[0]!.file).toBe('es.md');
    expect(pickChapterSpecs(localized, 'fr')[0]!.file).toBe('es.md');
  });
  it('names chapter files with a padded ordinal and a unique slug', () => {
    const taken = new Set<string>();
    expect(chapterFileName(0, 'Intro duction', taken, 12)).toBe('chapters/01-intro-duction.md');
    expect(chapterFileName(1, 'Intro duction', taken, 12)).toBe('chapters/02-intro-duction.md');
    expect(chapterFileName(2, '', taken, 120)).toBe('chapters/003-chapter.md');
  });
});

describe('isPresetIndex', () => {
  it('accepts a well-formed index', () => {
    expect(isPresetIndex({ version: 1, presets: [{ id: 'a', dir: 'a', name: 'A' }] })).toBe(true);
    expect(isPresetIndex({ version: 1, presets: [] })).toBe(true);
  });
  it('accepts showcase metadata and rejects mistyped fields', () => {
    const meta = { locales: ['es', 'en'], thumbnail: 'thumbnail.jpg', license: 'CC BY 4.0', credits: 'ESO', tags: ['magazine'] };
    expect(isPresetIndex({ version: 1, presets: [{ id: 'a', dir: 'a', name: 'A', ...meta }] })).toBe(true);
    expect(isPresetManifest(manifestV2(meta))).toBe(true);
    expect(isPresetIndex({ version: 1, presets: [{ id: 'a', dir: 'a', name: 'A', locales: 'es' }] })).toBe(false);
    expect(isPresetIndex({ version: 1, presets: [{ id: 'a', dir: 'a', name: 'A', tags: [1] }] })).toBe(false);
    expect(isPresetManifest({ ...manifestV2(), license: 4 })).toBe(false);
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
      note: 'Source: field survey',
    }, { width: 300, height: 120 });
    expect(r.kind).toBe('svg');
    expect(r.svg).toEqual({ fileId: 'preset:brochure:figures-pipeline-svg', width: 300, height: 120 });
    expect(r.bitmap).toBeUndefined();
    expect(r.caption).toBe('Pipeline');
    expect(r.note).toBe('Source: field survey');
    expect((r as unknown as { file?: string }).file).toBeUndefined();
    expect(typeof r.createdAt).toBe('number');
    expect(r.updatedAt).toBe(r.createdAt);
  });

  it('omits SVG dimensions when unknown', () => {
    const r = resourceFromSpec('b', { id: 'x', typeId: 'figure', kind: 'svg', file: 'x.svg' });
    expect(r.svg).toEqual({ fileId: 'preset:b:x-svg' });
  });

  it('attaches a PDF print master to an SVG and ignores it elsewhere', () => {
    const r = resourceFromSpec('b', { id: 'x', typeId: 'figure', kind: 'svg', file: 'x.svg', pdfFile: 'x.pdf' });
    expect(r.svg).toEqual({ fileId: 'preset:b:x-svg', pdfFileId: 'preset:b:x-pdf' });
    expect((r as unknown as { pdfFile?: string }).pdfFile).toBeUndefined();
    const notPdf = resourceFromSpec('b', { id: 'y', typeId: 'figure', kind: 'svg', file: 'y.svg', pdfFile: 'y.ai' });
    expect(notPdf.svg).toEqual({ fileId: 'preset:b:y-svg' });
    const png = resourceFromSpec('b', { id: 'p', typeId: 'figure', kind: 'bitmap', file: 'p.png', pdfFile: 'p.pdf' });
    expect(png.svg).toBeUndefined();
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
