import { describe, it, expect } from 'vitest';
import {
  buildCover,
  coverZoneBox,
  caseSheet,
  coverPage,
  coverSource,
  markdownLiteral,
  resolveBindingMeasures,
  softcoverSheet,
  workIsbnCaption,
  type BuiltCover,
} from '../../production/index.js';
import { mirrorBands, mirrorBleedSvg, MAX_MIRROR_BANDS } from '../../production/mirrorBleed.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import { buildDocument } from '../../pipeline/index.js';
import { flowRectToPage, pageIsMirrored } from '../../vdt/flowFrames.js';
import { isBookOwnKey, isBookWideKey } from '../../defaults/index.js';
import { DESIGN_PARTS, DESIGN_PART_KEYS } from '../../designs/parts.js';
import { preflightDocument } from '../../checks/preflight.js';
import type { CoverConfig, PostextConfig } from '../../types.js';

// The cover as a Markdown document on a composed page (#1667): what the
// cover makes of untrusted values, the Markdown and the metadata, the
// whole cover built from a book, and the mirror bleed's limits.

(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext() {
    return { font: '', measureText: (t: string) => ({ width: t.length * 7 }) };
  }
};

const trim = { width: 150, height: 230 };
const m = resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, trim);
const sheet = softcoverSheet(trim, 20, m, true);
const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

describe('values a cover writes into SVG', () => {
  const hostile = '"/><script>alert(1)</script><x a="';

  it('never lets an id, a colour or a picture address out of its attribute', () => {
    const cover = coverPage(sheet, {
      cover: {
        elements: [
          { id: hostile, kind: 'box', color: { hex: hostile, model: 'hex' }, shadow: { color: { hex: hostile, model: 'hex' }, opacity: 0.5, x: 1, y: 1, blur: 2 }, zone: 'front', x: 1, y: 1, width: 20, height: 20 },
          { id: 'pic', kind: 'image', resourceId: 'p', clip: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]], zone: 'front', x: 1, y: 30, width: 20, height: 20 },
        ],
      },
      mirrorPictures: { p: { href: `javascript:alert(1)${hostile}`, width: 10, height: 10 } },
    });
    for (const [name, bytes] of Object.entries(cover.files)) {
      expect(name).toMatch(/^[A-Za-z0-9_.-]+$/);
      expect(text(bytes)).not.toContain('<script');
      expect(text(bytes)).not.toContain('javascript:');
    }
    for (const r of cover.resources) expect(r.id).toMatch(/^[A-Za-z0-9_-]+$/);
    // The picture whose address is no PNG or JPEG data is drawn whole.
    expect(cover.issues).toEqual([{ kind: 'coverClipSkipped', resources: ['p'] }]);
  });

  it('keeps a blur from costing more than its picture', () => {
    const start = Date.now();
    coverPage(sheet, { cover: { elements: [{ id: 'b', kind: 'box', color: { hex: '#ffffff', model: 'hex' }, shadow: { color: { hex: '#000000', model: 'hex' }, opacity: 1, x: 0, y: 0, blur: 1e9 }, zone: 'front', x: 0, y: 0, width: 50, height: 50 }] } });
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('leaves out a text box named as a zone, as another box or not as an id', () => {
    const cover = coverPage(sheet, { cover: { textBoxes: [
      { name: 'front', rect: { x: 0, y: 0, width: 10, height: 10 } },
      { name: 'a"b', rect: { x: 0, y: 0, width: 10, height: 10 } },
      { name: 'title', rect: { x: 0, y: 0, width: 10, height: 10 } },
      { name: 'title', rect: { x: 0, y: 0, width: 10, height: 10 } },
    ] } });
    expect(cover.slots.filter((s) => s === 'title')).toHaveLength(1);
    expect(cover.issues.map((i) => i.kind === 'coverTextBoxName' && i.name)).toEqual(['front', 'a"b', 'title']);
  });
});

describe("the cover's Markdown", () => {
  const slots = ['flapBack', 'back', 'spine', 'front', 'flapFront'];

  it('fills the front and the spine from the metadata, in the cover styles, escaped', () => {
    const { markdown } = coverSource(':::frame{slot="back"}\nBlurb.\n:::', slots, { title: 'C++ *Primer*', subtitle: 'Fifth edition', author: 'S. Lippman' });
    expect(markdown).toContain(':::frame{slot="back"}\nBlurb.\n:::');
    expect(markdown).toContain(':::frame{slot="front"}\n:::paragraphs{style="cover-title"}\nC\\+\\+ \\*Primer\\*\n:::');
    expect(markdown).toContain(':::paragraphs{style="cover-author"}\nS\\. Lippman\n:::');
    expect(markdown).toContain(':::frame{slot="spine"}\n:::paragraphs{style="cover-spine"}\nC\\+\\+ \\*Primer\\* · S\\. Lippman\n:::');
  });

  it('leaves a front or a spine the cover writes itself alone, and fills nothing without metadata', () => {
    const own = coverSource(':::frame{slot="front"}\n# My title\n:::\n\n:::frame{slot="spine"}\nSpine\n:::', slots, { title: 'Other' }).markdown;
    expect(own).not.toContain('cover-title');
    expect(own).not.toContain('Other');
    expect(coverSource('', slots).markdown).toBe('::::page{template="postext-cover"}\n\n::::');
    expect(coverSource('', ['front']).markdown).not.toContain('spine');
  });

  it('reports a slot the cover has not and a slot filled twice', () => {
    const { issues } = coverSource(':::frame{slot="back"}\nA\n:::\n:::frame{slot=back}\nB\n:::\n:::frame{slot="rear"}\nC\n:::', slots);
    expect(issues.map((i) => [i.kind, i.slot])).toEqual([['coverSlotRepeated', 'back'], ['coverSlotUnknown', 'rear']]);
  });

  it('writes text as Markdown that reads as written', () => {
    expect(markdownLiteral('  A_b [c](d)\n:::x  ')).toBe('A\\_b \\[c\\]\\(d\\) \\:\\:\\:x');
  });
});

describe('buildCover', () => {
  const config: PostextConfig = {
    page: { sizePreset: 'custom', width: { value: 150, unit: 'mm' }, height: { value: 230, unit: 'mm' } },
    header: { elements: [{ kind: 'text', id: 'h', content: '{title}', fontSize: { value: 9, unit: 'pt' }, placement: { anchor: { to: 'page', edge: 'top-left' } } }] },
    production: {
      versions: [
        { id: 'pb', name: 'Paperback', binding: 'perfect', flaps: true, isbn: '978-0-306-40615-7', workIsbn: '978-84-9835-000-2' },
        { id: 'hc', name: 'Hardcover', binding: 'case-flat' },
      ],
    },
    cover: {
      background: { hex: '#123456', model: 'hex' },
      finishes: [{ id: 'seal', process: 'emboss', shape: { box: { zone: 'front', x: 40, y: 150, width: 30, height: 30 } } }],
    },
    paragraphStyles: [{ id: 'cover-title', fontSize: { value: 40, unit: 'pt' } }],
    locale: 'es',
  } as PostextConfig;
  const metadata = { title: 'La linterna', author: 'Ana Ruiz' };

  it('makes the sheet of a version a document of its own, the metadata on the front and the spine', () => {
    const built = buildCover({ config, version: 'pb', pages: 240, markdown: ':::frame{slot="back"}\nUna historia.\n:::', metadata }) as BuiltCover;
    expect(built.config).toBeDefined();
    expect(built.sheet.kind).toBe('softcover');
    expect(built.config.production).toBeUndefined();
    expect(built.config.cover).toBeUndefined();
    expect(built.config.header).toEqual({ elements: [] });
    expect(built.config.pageTemplates!.map((t) => t.id)).toEqual(['postext-cover']);
    // The book's own title style wins; the rest are the cover's defaults.
    const styles = built.config.paragraphStyles!;
    expect(styles.find((s) => s.id === 'cover-title')!.fontSize).toEqual({ value: 40, unit: 'pt' });
    expect(styles.map((s) => s.id)).toEqual(['cover-title', 'cover-subtitle', 'cover-author', 'cover-spine']);
    expect(built.content.resources!.map((r) => r.id)).toContain('postext-cover-isbn');
    expect(text(built.files['postext-cover-isbn.svg'])).toContain('978-0-306-40615-7');
    const doc = buildDocument(built.content, built.config);
    expect(doc.pages).toHaveLength(1);
    const page = doc.pages[0]!;
    const words = [...(page.floats ?? [])].flatMap((b) => b.lines.map((l) => l.text)).join(' ');
    expect(words).toContain('La linterna');
    expect(words).toContain('Ana Ruiz');
    expect(words).toContain('Una historia.');
    // The whole work's ISBN in the book's language, over the barcode.
    const deco = page.composed!.decoration!.blocks;
    expect(deco.some((b) => b.kind === 'text' && b.lines.some((l) => l.text.includes('ISBN obra completa 978-84-9835-000-2')))).toBe(true);
    expect(page.plates).toEqual([expect.objectContaining({ process: 'emboss' })]);
    expect(built.issues.filter((i) => i.kind !== 'spineTooThinForText')).toEqual([]);
  });

  it('takes the spine from the laid-out pages and gives a case its jacket and endpapers', () => {
    const thin = buildCover({ config, version: 'pb', pages: 40 }) as BuiltCover;
    const thick = buildCover({ config, version: 'pb', pages: 400 }) as BuiltCover;
    expect(thick.sheets.spine.used).toBeGreaterThan(thin.sheets.spine.used);
    expect(thick.sheet.width).toBeGreaterThan(thin.sheet.width);
    const hc = buildCover({ config, version: 'hc', pages: 240, sheet: 'endpaperFront' }) as BuiltCover;
    expect(hc.sheet.kind).toBe('endpaper');
    expect(hc.content.resources!.some((r) => r.id === 'postext-cover-isbn')).toBe(false);
  });

  it('prints the barcode on the jacket of a case that wears one, and on the case that does not', () => {
    const jacketed = { ...config, production: { versions: [{ id: 'hc', name: 'Hardcover', binding: 'case-flat', flaps: true, isbn: '978-0-306-40615-7', workIsbn: '978-84-9835-000-2' }] } } as PostextConfig;
    const barcode = (c: PostextConfig, sheet?: 'jacket') => (buildCover({ config: c, version: 'hc', pages: 240, sheet }) as BuiltCover).content.resources?.some((r) => r.id === 'postext-cover-isbn');
    expect(barcode(jacketed, 'jacket')).toBe(true);
    expect(barcode(jacketed)).toBe(false);
    const bare = { ...config, production: { versions: [{ id: 'hc', name: 'Hardcover', binding: 'case-flat', isbn: '978-0-306-40615-7' }] } } as PostextConfig;
    expect(barcode(bare)).toBe(true);
  });

  it('mirrors the sheet of a book bound on the right: the front on the left, the back on the right', () => {
    const order = (c: PostextConfig, version = 'pb', sheet?: 'jacket') =>
      (buildCover({ config: c, version, pages: 240, ...(sheet ? { sheet } : {}) }) as BuiltCover).sheet.zones.map((z) => z.name);
    expect(order(config)).toEqual(['flapBack', 'back', 'spine', 'front', 'flapFront']);
    // An Arabic book (direction auto from its language), a vertical one, a page bound on the right.
    const arabic = { ...config, locale: 'ar' } as PostextConfig;
    const vertical = { ...config, locale: 'ja', layout: { writingMode: 'vertical-rl' } } as PostextConfig;
    const right = { ...config, page: { ...config.page, binding: 'right' } } as PostextConfig;
    for (const c of [arabic, vertical, right]) expect(order(c)).toEqual(['flapFront', 'front', 'spine', 'back', 'flapBack']);
    expect(order(arabic, 'hc')).toEqual(['front', 'jointFront', 'spine', 'jointBack', 'back']);
    const built = buildCover({ config: arabic, version: 'pb', pages: 240 }) as BuiltCover;
    const zone = (n: string) => built.sheet.zones.find((z) => z.name === n)!;
    // The same panels, moved across: the back flap ends where the sheet's bleed starts.
    expect(zone('flapBack').rect.x + zone('flapBack').rect.width).toBeCloseTo(built.sheet.width - built.sheet.bleed, 6);
    expect(built.sheet.lines.map((l) => l.x)).toEqual([...built.sheet.lines.map((l) => l.x)].sort((a, b) => a - b));
  });

  it('sets each zone’s text in its own panel on a sheet bound either way', () => {
    const arabic = { ...config, locale: 'ar' } as PostextConfig;
    const vertical = { ...config, locale: 'ja', layout: { writingMode: 'vertical-rl' } } as PostextConfig;
    const right = { ...config, page: { ...config.page, binding: 'right' } } as PostextConfig;
    for (const c of [config, arabic, vertical, right]) {
      const built = buildCover({ config: c, version: 'pb', pages: 240, markdown: ':::frame{slot="back"}\nUna historia.\n:::', metadata }) as BuiltCover;
      const doc = buildDocument(built.content, built.config);
      const page = doc.pages[0]!;
      const centre = (text: string) => {
        // A line that says only that: the spine joins the title and the author.
        const block = (page.floats ?? []).find((b) => b.lines.some((l) => l.text === text))!;
        // Where it is painted: a right-to-left page's flow is mirrored; a
        // vertical page's frames are laid out on the page itself.
        const r = pageIsMirrored(page) ? flowRectToPage(page, block.bbox) : block.bbox;
        return r.x + r.width / 2;
      };
      const inside = (text: string, zone: string) => {
        const box = coverZoneBox(built, zone, doc)!;
        const x = centre(text);
        expect(x, `${c.locale ?? 'en'} ${zone}`).toBeGreaterThan(box.x);
        expect(x, `${c.locale ?? 'en'} ${zone}`).toBeLessThan(box.x + box.width);
      };
      inside('Una historia.', 'back');
      inside('La linterna', 'front');
      // A turned spine is turned about its centre, so its box's centre holds.
      inside('La linterna · Ana Ruiz', 'spine');
    }
    // A vertical book's sheet is a horizontal page whose zones are set vertical.
    const v = buildCover({ config: vertical, version: 'pb', pages: 240 }) as BuiltCover;
    expect(v.config.layout?.writingMode).toBe('horizontal-tb');
    expect(new Set(v.config.pageTemplates![0]!.frames!.map((f) => f.writingMode))).toEqual(new Set(['vertical-rl']));
  });

  it('says what is missing instead of making a cover', () => {
    expect(buildCover({ config, version: 'nope', pages: 10 })).toEqual({ issues: [{ kind: 'coverVersionMissing', version: 'nope' }] });
    expect((buildCover({ config, version: 'pb', pages: 10, sheet: 'jacket' }) as { issues: { kind: string }[] }).issues).toContainEqual({ kind: 'coverSheetMissing', sheet: 'jacket' });
  });

  it('lays out the same book with and without a cover design', () => {
    const book = { markdown: '# One\n\nText of the book.' };
    const a = buildDocument(book, { ...config, cover: undefined });
    const b = buildDocument(book, config);
    expect(b.pages.map((p) => p.columns)).toEqual(a.pages.map((p) => p.columns));
  });
});

describe('the cover in the configuration', () => {
  it('is a design part of its own, book-wide, never the book’s alone', () => {
    expect(DESIGN_PARTS).toContain('cover');
    expect(DESIGN_PART_KEYS.cover).toEqual(['cover']);
    expect(isBookWideKey('cover')).toBe(true);
    expect(isBookOwnKey('cover')).toBe(false);
  });

  it('warns of what the cover changes or leaves out', () => {
    const cover = {
      bakground: { hex: '#fff', model: 'hex' },
      background: { hex: 'red', model: 'hex' },
      elements: [{ id: 'a b', kind: 'box', zone: 'roof', x: 0, y: 0, width: 1, height: 1 }],
      finishes: [
        { id: 'f', process: 'glitter', shape: { box: { zone: 'front', x: 0, y: 0, width: 1, height: 1 } } },
        { id: 'g', process: 'foil', ink: { hex: '#ff0000', model: 'hex' }, shape: { element: 'nothing' } },
      ],
      textBoxes: [{ name: 'spine', rect: { x: 0, y: 0, width: 1, height: 1 } }],
      mirrorMargin: 0.5,
      barcodeMagnification: 0.5,
    } as unknown as CoverConfig;
    const paths = collectConfigWarnings({ cover }).filter((w) => w.path.startsWith('cover')).map((w) => w.path);
    expect(paths).toEqual([
      'cover.bakground', 'cover.background', 'cover.elements[0].id', 'cover.elements[0].zone',
      'cover.finishes[0].process', 'cover.finishes[1].ink', 'cover.finishes[1].shape.element',
      'cover.textBoxes[0].name', 'cover.mirrorMargin', 'cover.barcodeMagnification',
    ]);
    expect(collectConfigWarnings({ cover: { background: { hex: '#ffffff', model: 'hex' } } }).filter((w) => w.path.startsWith('cover'))).toEqual([]);
  });
});

describe('mirror bleed limits', () => {
  it('folds no narrower than 2 mm', () => {
    const { designed } = mirrorBands(20, 120, 140, 0.1);
    expect(designed).toEqual([18, 122]);
  });

  it('stops at its most bands and says so', () => {
    const wide = { width: 400, height: 400, trim: { x: 150, y: 150, width: 100, height: 100 } };
    const out = mirrorBleedSvg(wide, 2, '<rect/>')!;
    expect(out.capped).toBe(true);
    expect(mirrorBands(150, 250, 400, 2).before).toHaveLength(MAX_MIRROR_BANDS);
    const c = resolveBindingMeasures({ id: 'c', name: 'C', style: 'caseFlat' }, trim);
    expect(mirrorBleedSvg(caseSheet(trim, 26, c), c.designMargin, '<rect/>')!.capped).toBe(false);
  });
});

describe('the cover in the preflight', () => {
  it('reports text across a fold of the sheet', () => {
    const built = buildCover({
      config: { production: { versions: [{ id: 'pb', name: 'P', binding: 'perfect' }] }, cover: { textBoxes: [{ name: 'band', rect: { x: 150, y: 50, width: 40, height: 20 } }] } },
      version: 'pb',
      pages: 200,
      markdown: ':::frame{slot="band"}\nA line of words long enough to run across the spine fold\n:::',
    }) as BuiltCover;
    const doc = buildDocument(built.content, built.config);
    expect(preflightDocument(doc).some((i) => i.kind === 'foldText')).toBe(true);
  });

  it('names the whole work in the book’s language, English by default', () => {
    expect(workIsbnCaption('978-84', 'ca-ES')).toBe('ISBN obra completa 978-84');
    expect(workIsbnCaption('978-84', 'nl')).toBe('ISBN of the complete work 978-84');
  });
});
