import { describe, it, expect } from 'vitest';
import { annotateArabicMarks } from '../../arabicMarks';
import type { VDTBlock, VDTColumn, VDTDocument, VDTLine } from '../../vdt';

// Issue #445: two words whose ink boxes meet are painted and compared
// column by column. A tall mark at one end of a word and a deep descender
// at the other end of the word above are no collision.

/** Each character advances 10 px. Ink, px above and below the baseline:
 *  a letter 10 up and 4 down; a fatḥa raises the letter before it to 24, a
 *  kasra drops it to 14. */
const ADVANCE = 10;
function columns(text: string): { above: number; below: number }[] {
  const out: { above: number; below: number }[] = [];
  for (const ch of text) {
    if (ch === 'َ') out[out.length - 1]!.above = 24;
    else if (ch === 'ِ') out[out.length - 1]!.below = 14;
    else out.push({ above: 10, below: 4 });
  }
  return out;
}

class PixelCtx {
  font = '';
  textAlign = 'left';
  textBaseline = 'alphabetic';
  fillStyle = '#000';
  direction = 'ltr';
  canvas = { width: 1, height: 1 };
  private draws: { text: string; x: number; y: number }[] = [];
  measureText(text: string): Partial<TextMetrics> {
    const cols = columns(text);
    const width = cols.length * ADVANCE;
    return {
      width,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: width,
      actualBoundingBoxAscent: Math.max(...cols.map((c) => c.above)),
      actualBoundingBoxDescent: Math.max(...cols.map((c) => c.below)),
    };
  }
  setTransform(): void {}
  clearRect(): void {
    this.draws = [];
  }
  fillText(text: string, x: number, y: number): void {
    this.draws.push({ text, x, y });
  }
  getImageData(sx: number, sy: number, w: number, h: number): { data: Uint8ClampedArray } {
    const data = new Uint8ClampedArray(w * h * 4);
    for (const d of this.draws) {
      columns(d.text).forEach((c, i) => {
        for (let x = d.x + i * ADVANCE; x < d.x + (i + 1) * ADVANCE; x++) {
          for (let y = d.y - c.above; y < d.y + c.below; y++) {
            const px = x - sx;
            const py = y - sy;
            if (px >= 0 && px < w && py >= 0 && py < h) data[(py * w + px) * 4 + 3] = 255;
          }
        }
      });
    }
    return { data };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  private ctx = new PixelCtx();
  getContext(): PixelCtx {
    return this.ctx;
  }
};

const FATHA_FIRST = 'بَببب';
const KASRA_LAST = 'بببِب';
const KASRA_FIRST = 'بِببب';

function line(baseline: number, text: string): VDTLine {
  const width = columns(text).length * ADVANCE;
  return {
    text,
    bbox: { x: 0, y: baseline - 12, width, height: 16 },
    baseline,
    hyphenated: false,
    segments: [{ kind: 'text', text, width }],
    isLastLine: true,
  };
}

function docOf(lines: VDTLine[]): VDTDocument {
  const block = {
    id: 'b', type: 'paragraph', bbox: { x: 0, y: 0, width: 400, height: 100 }, lines,
    pageIndex: 0, columnIndex: 0, fontString: '400 20px Amiri', textAlign: 'left',
  } as unknown as VDTBlock;
  const column = { bbox: { x: 0, y: 0, width: 400, height: 100 }, blocks: [block] } as unknown as VDTColumn;
  return { blocks: [block], pages: [{ columns: [column] }] } as unknown as VDTDocument;
}

describe('Arabic vowel marks — ink profiles', () => {
  it('lets a mark pass under a descender standing elsewhere along the word', () => {
    // Boxes: 24 + 14 = 38 px against a 30 px pitch. Ink: the fatḥa's
    // column has 4 px hanging over it, the kasra's 10 px rising under it.
    expect(annotateArabicMarks(docOf([line(20, KASRA_LAST), line(50, FATHA_FIRST)]))).toEqual([]);
  });

  it('reports the mark standing right under a descender', () => {
    const found = annotateArabicMarks(docOf([line(20, KASRA_FIRST), line(50, FATHA_FIRST)]));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: 'arabicMarksExceedLeading', lineHeightEm: 1.5, neededEm: 1.9 });
  });
});
