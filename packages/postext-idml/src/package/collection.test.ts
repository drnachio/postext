// A font collection taken apart into single fonts (#1558).

import { describe, expect, it } from 'vitest';
import { isFontCollection, sfntChecksum, splitFontCollection } from './collection.js';
import { buildCollection, repoFont, sfntTables } from './collection.test-helper.js';
import { readFontFace } from './fontFace.js';

const regular = repoFont('Amiri-Regular.ttf');
const bold = repoFont('Amiri-Bold.ttf');
const ruqaa = repoFont('ArefRuqaa-Bold.ttf');
const ttc = buildCollection([regular, bold, ruqaa]);

describe('splitFontCollection', () => {
  const faces = splitFontCollection(ttc)!;

  it('takes every face out, in the order the collection lists them', () => {
    expect(isFontCollection(ttc)).toBe(true);
    expect(faces.map((f) => f.index)).toEqual([0, 1, 2]);
    const names = faces.map((f) => {
      const face = readFontFace('', f.bytes!);
      return 'unusable' in face ? face.unusable : `${face.format} ${face.postScriptName} ${face.weight}`;
    });
    expect(names).toEqual(['ttf Amiri-Regular 400', 'ttf Amiri-Bold 700', 'ttf ArefRuqaa-Bold 700']);
  });

  it('copies each table of the face as it stands in the font it came from', () => {
    const got = sfntTables(faces[1]!.bytes!);
    const want = sfntTables(bold);
    expect([...got.keys()].sort()).toEqual([...want.keys()].sort());
    for (const [tag, t] of want) if (tag !== 'head') expect(got.get(tag)!.data).toEqual(t.data);
  });

  it('writes a file whose checksums hold, its tables in tag order on four-byte offsets', () => {
    for (const { bytes } of faces) {
      const tables = [...sfntTables(bytes!)];
      expect(tables.map(([tag]) => tag)).toEqual(tables.map(([tag]) => tag).sort());
      for (const [tag, t] of tables) {
        expect(t.offset % 4).toBe(0);
        const data = tag === 'head' ? Uint8Array.from(t.data, (b, i) => (i >= 8 && i < 12 ? 0 : b)) : t.data;
        expect(t.checksum).toBe(sfntChecksum(data));
      }
      // The whole file sums to the number the format names, by way of head.checkSumAdjustment.
      expect(sfntChecksum(bytes!)).toBe(0xb1b0afba);
    }
  });

  it('leaves out a face whose tables lie past the end of the file', () => {
    const cut = ttc.slice();
    new DataView(cut.buffer).setUint32(12 + 2 * 4, cut.length + 100);
    const split = splitFontCollection(cut)!;
    expect(split.map((f) => Boolean(f.bytes))).toEqual([true, true, false]);
  });

  it('takes no single font for a collection', () => {
    expect(splitFontCollection(regular)).toBeUndefined();
    expect(isFontCollection(regular)).toBe(false);
  });
});
