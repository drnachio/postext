import { describe, expect, it } from 'vitest';
import type { VDTDocument } from 'postext';
import { designImageFileIdAtPixel, pixelToSourceOffset, sourceToPlainIndex, xForPlainInLine } from './geometry';

type VDTBlock = VDTDocument['blocks'][number];
type VDTSegment = NonNullable<VDTBlock['lines'][number]['segments']>[number];

// Source:  `En la :ref{id="tabla-1-1" case="lower"} se comprueba cómo`
// Plain:   `En la ⁣ se comprueba cómo`  (the ref is one placeholder char)
// Render:  `En la tabla 1.1 se comprueba cómo`
const REF_SRC = ':ref{id="tabla-1-1" case="lower"}';
const SOURCE = `En la ${REF_SRC} se comprueba cómo`;
const PLAIN = 'En la ⁣ se comprueba cómo';
const AFTER_REF = 6 + REF_SRC.length;
const sourceMap = Array.from({ length: PLAIN.length }, (_, i) =>
  i < 6 ? i : i === 6 ? 6 : AFTER_REF + (i - 7),
);

const word = (text: string, width: number, extra: Partial<VDTSegment> = {}): VDTSegment =>
  ({ kind: 'text', text, width, ...extra }) as VDTSegment;
const space = (): VDTSegment => ({ kind: 'space', text: ' ', width: 5 }) as VDTSegment;

const segments: VDTSegment[] = [
  word('En', 20), space(), word('la', 20), space(),
  word('tabla 1.1', 90, { refResourceId: 'tabla-1-1' }), space(),
  word('se', 20), space(), word('comprueba', 90), space(), word('cómo', 40),
];
const lineWidth = segments.reduce((s, seg) => s + seg.width, 0);

const block = {
  type: 'paragraph',
  pageIndex: 0,
  textAlign: 'left',
  bbox: { x: 0, y: 0, width: lineWidth, height: 20 },
  sourceStart: 0,
  sourceEnd: SOURCE.length,
  sourceMap,
  plainPrefixLen: 0,
  lines: [{
    text: 'En la tabla 1.1 se comprueba cómo',
    bbox: { x: 0, y: 0, width: lineWidth, height: 20 },
    segments,
    plainStart: 0,
    plainEnd: PLAIN.length,
    isLastLine: true,
    hyphenated: false,
  }],
} as unknown as VDTBlock;

const doc = { pages: [{}], blocks: [block] } as unknown as VDTDocument;

const X_COMPRUEBA = 20 + 5 + 20 + 5 + 90 + 5 + 20 + 5; // 170
const SRC_COMPRUEBA = SOURCE.indexOf('comprueba');

describe('inline :ref segments count as one plain char', () => {
  it('maps a click after the ref to the clicked word, not eight chars later', () => {
    // Just inside "comprueba" (rounds to its first glyph).
    expect(pixelToSourceOffset(doc, 0, X_COMPRUEBA + 1, 10)).toBe(SRC_COMPRUEBA);
    // Middle of "comprueba" ("compr|ueba"), previously landed inside "cómo".
    expect(pixelToSourceOffset(doc, 0, X_COMPRUEBA + 45, 10)).toBe(SRC_COMPRUEBA + 5);
  });

  it('places the highlight x for a source offset after the ref on the right glyph', () => {
    const plain = sourceToPlainIndex(block, SRC_COMPRUEBA);
    expect(plain).toBe(PLAIN.indexOf('comprueba'));
    expect(xForPlainInLine(block, block.lines[0]!, plain!)).toBe(X_COMPRUEBA);
  });

  it('still maps text before the ref exactly', () => {
    expect(pixelToSourceOffset(doc, 0, 26, 10)).toBe(SOURCE.indexOf('la'));
  });
});

describe('designImageFileIdAtPixel', () => {
  const image = (fileId: string, x: number, y: number, w: number, h: number) =>
    ({ kind: 'image', fileId, bbox: { x, y, width: w, height: h } });
  const pageDoc = {
    pages: [{
      openerBand: { bbox: { x: 0, y: 0, width: 400, height: 200 }, blocks: [image('cover', 0, 0, 400, 150), { kind: 'box', bbox: { x: 0, y: 0, width: 400, height: 200 }, box: {} }] },
      header: { bbox: { x: 0, y: 0, width: 400, height: 30 }, blocks: [image('logo', 10, 10, 20, 20)] },
    }, {}],
    blocks: [
      { type: 'heading', pageIndex: 0, bbox: { x: 0, y: 300, width: 400, height: 50 }, lines: [], designOverlay: { bbox: { x: 0, y: 300, width: 400, height: 50 }, blocks: [image('plate', 0, 300, 100, 50)] } },
      { type: 'heading', pageIndex: 1, bbox: { x: 0, y: 0, width: 400, height: 50 }, lines: [], designOverlay: { bbox: { x: 0, y: 0, width: 400, height: 50 }, blocks: [image('other-page', 0, 0, 400, 50)] } },
    ],
  } as unknown as VDTDocument;

  it('finds the image of an opener band, a header and an in-column design', () => {
    expect(designImageFileIdAtPixel(pageDoc, 0, 200, 100)).toBe('cover');
    expect(designImageFileIdAtPixel(pageDoc, 0, 320, 320)).toBeNull();
    expect(designImageFileIdAtPixel(pageDoc, 0, 50, 320)).toBe('plate');
  });

  it('lets a later slot paint over an earlier one and ignores other pages', () => {
    expect(designImageFileIdAtPixel(pageDoc, 0, 15, 15)).toBe('logo');
    expect(designImageFileIdAtPixel(pageDoc, 0, 200, 180)).toBeNull();
    expect(designImageFileIdAtPixel(pageDoc, 1, 200, 25)).toBe('other-page');
    expect(designImageFileIdAtPixel(pageDoc, 2, 200, 25)).toBeNull();
  });
});
