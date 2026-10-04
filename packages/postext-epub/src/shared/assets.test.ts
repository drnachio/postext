import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import type { VDTDocument } from 'postext';
import { bookIdentifier, fontAssets, imageAssets, pageProgressionOf, placedFileIds } from './assets';
import { sniffFontFormat, sniffImageType } from './media';
import { sha1, uuidV5 } from './uuid';
import type { EpubWarning } from '../types';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const SVG = new TextEncoder().encode('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>');
const TTF = Uint8Array.from([0x00, 0x01, 0x00, 0x00, 0, 0]);
const WOFF2 = new TextEncoder().encode('wOF2rest');

describe('sha1 / uuidV5', () => {
  it('matches node:crypto on short and multi-block input', () => {
    for (const s of ['', 'abc', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(200), 'ñandú 中文']) {
      const bytes = new TextEncoder().encode(s);
      const ours = Buffer.from(sha1(bytes)).toString('hex');
      expect(ours).toBe(createHash('sha1').update(bytes).digest('hex'));
    }
  });

  it('is a version 5, RFC 4122 variant UUID', () => {
    expect(uuidV5('https://postext.dev/')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // python3: uuid.uuid5(uuid.NAMESPACE_URL, 'http://python.org/')
    expect(uuidV5('http://python.org/')).toBe('4c565f0d-3f5a-5890-b41b-20cf47701c5e');
  });
});

describe('bookIdentifier', () => {
  it('derives a stable urn:uuid from title, creators and language', () => {
    const a = bookIdentifier({ title: 'Libro', creators: ['Ana'], language: 'es' });
    expect(a).toMatch(/^urn:uuid:/);
    expect(bookIdentifier({ title: 'Libro', creators: ['Ana'], language: 'ES' })).toBe(a);
    expect(bookIdentifier({ title: 'Libro', creators: ['Eva'], language: 'es' })).not.toBe(a);
  });

  it('keeps a given identifier and prefixes a bare ISBN', () => {
    expect(bookIdentifier({ title: 'T', language: 'en', identifier: '978-84-376-0494-7' })).toBe('urn:isbn:9788437604947');
    expect(bookIdentifier({ title: 'T', language: 'en', identifier: 'https://example.org/b' })).toBe('https://example.org/b');
  });
});

describe('media sniffing', () => {
  it('reads picture and font formats from bytes', () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(SVG)).toBe('image/svg+xml');
    expect(sniffImageType(new Uint8Array([1, 2, 3]))).toBeUndefined();
    expect(sniffFontFormat(TTF)).toBe('ttf');
    expect(sniffFontFormat(WOFF2)).toBe('woff2');
    expect(sniffFontFormat(new TextEncoder().encode('OTTO'))).toBe('otf');
  });
});

describe('fontAssets', () => {
  it('writes one item and one @font-face per face, format from the bytes', () => {
    const a = fontAssets([
      { family: 'Lora', weight: 400, style: 'normal', bytes: TTF, format: 'woff2' },
      { family: 'Lora', weight: 400, style: 'normal', bytes: TTF, format: 'ttf' },
      { family: 'Noto Sans SC', weight: '100 900', style: 'italic', bytes: WOFF2, format: 'woff2', unicodeRange: 'U+4E00-9FFF' },
    ]);
    expect(a.items.map((i) => [i.href, i.mediaType])).toEqual([
      ['fonts/lora-400-normal.ttf', 'font/ttf'],
      ['fonts/noto-sans-sc-100-900-italic.woff2', 'font/woff2'],
    ]);
    expect(a.css).toContain('font-family: "Lora";');
    expect(a.css).toContain('src: url("../fonts/lora-400-normal.ttf") format("truetype");');
    expect(a.css).toContain('font-weight: 100 900;');
    expect(a.css).toContain('unicode-range: U+4E00-9FFF;');
    expect([...a.families]).toEqual(['Lora', 'Noto Sans SC']);
  });
});

describe('imageAssets', () => {
  const doc = {
    pages: [
      {
        columns: [{ blocks: [{ resourceBlock: { fileId: 'fig.png', table: { cells: [{ image: { fileId: 'cell.svg' } }] } } }] }],
        header: { blocks: [{ kind: 'image', fileId: 'logo' }] },
      },
      { columns: [], floats: [{ resourceBlock: { fileId: 'fig.png' } }] },
    ],
  } as unknown as VDTDocument;

  it('collects every placed fileId once, in order', () => {
    expect(placedFileIds(doc)).toEqual(['fig.png', 'cell.svg', 'logo']);
  });

  it('writes each picture once with a sniffed type and warns on a miss', async () => {
    const warnings: EpubWarning[] = [];
    const a = await imageAssets([doc, doc], (id) => id === 'fig.png'
      ? { bytes: PNG, mediaType: 'image/jpeg' }
      : id === 'cell.svg' ? Promise.resolve({ bytes: SVG, mediaType: 'image/svg+xml' }) : undefined,
    (w) => warnings.push(w));
    expect(a.items.map((i) => [i.id, i.href, i.mediaType])).toEqual([
      ['img-fig', 'images/fig.png', 'image/png'],
      ['img-cell', 'images/cell.svg', 'image/svg+xml'],
    ]);
    expect(a.hrefOf('cell.svg')).toBe('images/cell.svg');
    expect(a.hrefOf('logo')).toBeUndefined();
    expect(warnings).toEqual([{ kind: 'missingImage', fileId: 'logo' }]);
  });

  it('recolours SVG sources to the ink of a single-ink book', async () => {
    const inked = { ...doc, config: { diagramStyle: { singleInk: true, inkColor: { hex: '#0000ff', model: 'hex' } } } } as unknown as VDTDocument;
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#ff0000" width="1" height="1"/></svg>');
    const a = await imageAssets([inked], (id) => (id === 'cell.svg' ? { bytes: svg, mediaType: 'image/svg+xml' } : undefined));
    const data = a.items.find((i) => i.href === 'images/cell.svg')!.data;
    expect(typeof data).toBe('string');
    expect(data as string).not.toContain('#ff0000');
  });
});

describe('pageProgressionOf', () => {
  it('is rtl for a right-bound book', () => {
    expect(pageProgressionOf([{ binding: 'right' } as VDTDocument])).toBe('rtl');
    expect(pageProgressionOf([{} as VDTDocument])).toBe('ltr');
  });
});
