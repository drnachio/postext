import { describe, expect, it } from 'vitest';
import { unzipSync, zipSync } from 'fflate';
import { createBundle, openBundle } from '../../bundle/index.js';
import { buildCover, coverParagraphStyles, coverSource, coverZoneBox, folioOfBook, productionFolioBinding, type BuiltCover } from '../../production/index.js';
import { buildDocument } from '../../pipeline/index.js';
import type { PostextConfig } from '../../types.js';

// The same cover in every output (#1668): the cover Markdown a bundle
// carries, the frames of other sheets left out, the book's styles over
// the cover's, Folio bound as the version, and where a panel lies on the
// laid-out cover.

(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext() {
    return { font: '', measureText: (t: string) => ({ width: t.length * 7 }) };
  }
};

const production = {
  versions: [
    { id: 'pb', name: 'Paperback', binding: 'perfect' },
    { id: 'hc', name: 'Hardcover', binding: 'case-flat', caseMaterial: 'cloth' as const },
  ],
};

describe('the cover Markdown in a bundle', () => {
  it('is written as cover.md, read back, and a language may have its own', async () => {
    const created = await createBundle({
      name: 'Lantern',
      locale: 'en',
      chapters: [{ markdown: '# One\n\nText.' }],
      coverMarkdown: ':::frame{slot="back"}\nA story.\n:::',
      localized: { es: { coverMarkdown: ':::frame{slot="back"}\nUna historia.\n:::' } },
    });
    expect(created.manifest.coverMarkdown).toBe('cover.md');
    expect(created.manifest.localized?.es?.coverMarkdown).toBe('cover/es.md');
    expect(new TextDecoder().decode(created.files['cover.md'])).toContain('A story.');
    expect((await openBundle(created.bytes)).coverMarkdown).toContain('A story.');
    expect((await openBundle(created.bytes, { locale: 'es' })).coverMarkdown).toContain('Una historia.');
  });

  it('writes nothing for a blank cover, and opens a bundle whose cover file is missing with a warning', async () => {
    const plain = await createBundle({ name: 'B', chapters: [{ markdown: '# One' }], coverMarkdown: '  ' });
    expect(plain.manifest.coverMarkdown).toBeUndefined();
    const files = unzipSync(plain.bytes);
    const manifest = JSON.parse(new TextDecoder().decode(files['preset.json']));
    files['preset.json'] = new TextEncoder().encode(JSON.stringify({ ...manifest, coverMarkdown: 'cover.md' }));
    const opened = await openBundle(zipSync(files));
    expect(opened.coverMarkdown).toBeUndefined();
    expect(opened.warnings.join(' ')).toContain('cover.md');
  });
});

describe('the cover Markdown on a sheet', () => {
  it('leaves out a frame the sheet has not, and a second frame of one slot, keeping the offsets of the rest', () => {
    const md = ':::frame{slot="pastedown"}\nEx libris.\n:::\n\n:::frame{slot="back"}\nA story.\n:::\n\n:::frame{slot="back"}\nAgain.\n:::';
    const out = coverSource(md, ['back', 'spine', 'front'], {});
    expect(out.issues.map((i) => i.kind)).toEqual(['coverSlotUnknown', 'coverSlotRepeated']);
    expect(out.markdown).not.toContain('Ex libris');
    expect(out.markdown).not.toContain('Again');
    const back = md.indexOf(':::frame{slot="back"}');
    expect(out.markdown.indexOf(':::frame{slot="back"}')).toBe(back + '::::page{template="postext-cover"}\n'.length);
  });

  it('reports only the slots no sheet has: one Markdown serves the cover and the endpapers', () => {
    const config = { production, cover: {} } as PostextConfig;
    const built = buildCover({ config, version: 'hc', pages: 200, sheet: 'endpaperFront', markdown: ':::frame{slot="back"}\nA.\n:::\n\n:::frame{slot="nowhere"}\nB.\n:::' }) as BuiltCover;
    const unknown = built.issues.filter((i) => i.kind === 'coverSlotUnknown').map((i) => (i as { slot: string }).slot);
    expect(unknown).toEqual(['nowhere']);
  });

  it('lays the book\'s own cover styles over the defaults, field by field', () => {
    const styles = coverParagraphStyles([{ id: 'cover-title', color: { hex: '#ffffff', model: 'hex' } }], 10);
    const title = styles.find((s) => s.id === 'cover-title')!;
    expect(title).toMatchObject({ textAlign: 'center', fontWeight: 700, color: { hex: '#ffffff' } });
    expect(styles.filter((s) => s.id === 'cover-title')).toHaveLength(1);
  });
});

describe('Folio bound as the version', () => {
  it('takes the binding and the case of the version, under the book\'s own folio settings', () => {
    expect(productionFolioBinding(production)).toEqual({ type: 'paperback', coverMaterial: 'paper' });
    expect(productionFolioBinding(production, 'hc')).toEqual({ type: 'hardcover', coverMaterial: 'cloth' });
    expect(folioOfBook({ production, folio: { binding: { type: 'sewn' } } })?.binding).toEqual({ type: 'sewn', coverMaterial: 'paper' });
    expect(folioOfBook({ folio: { tilt: 10 } })).toEqual({ tilt: 10 });
    expect(folioOfBook({ production: { versions: [{ id: 'x', name: 'X', binding: 'no-such-profile' }] } })).toBeUndefined();
  });

  it('reaches the document\'s resolved folio settings, which no layout reads', () => {
    const plain = buildDocument({ markdown: '# One\n\nText.' }, {});
    const bound = buildDocument({ markdown: '# One\n\nText.' }, { production } as PostextConfig);
    expect(plain.config.folio).toBeUndefined();
    expect(bound.config.folio?.binding).toMatchObject({ type: 'paperback', coverMaterial: 'paper' });
    expect(bound.pages.map((p) => p.columns)).toEqual(plain.pages.map((p) => p.columns));
  });
});

describe('a panel on the laid-out cover', () => {
  it('lies past the bleed, at the size of the trim', () => {
    const config = {
      page: { sizePreset: 'custom', width: { value: 150, unit: 'mm' }, height: { value: 230, unit: 'mm' }, dpi: 300 },
      production,
      cover: {},
    } as PostextConfig;
    const built = buildCover({ config, version: 'pb', pages: 200, metadata: { title: 'T' } }) as BuiltCover;
    const doc = buildDocument(built.content, built.config);
    const front = coverZoneBox(built, 'front', doc)!;
    const px = 300 / 25.4;
    expect(front.width).toBeCloseTo(150 * px, 0);
    expect(front.height).toBeCloseTo(230 * px, 0);
    expect(front.x + front.width).toBeCloseTo(doc.pages[0]!.width - doc.trimOffset, 0);
    expect(front.y).toBeCloseTo(doc.trimOffset, 0);
    expect(coverZoneBox(built, 'pastedown', doc)).toBeUndefined();
  });
});
