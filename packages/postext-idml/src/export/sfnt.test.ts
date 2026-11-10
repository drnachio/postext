import { describe, expect, it } from 'vitest';
import { fontFormat, fontNames } from './sfnt.js';

/** A minimal sfnt with a name table (Windows Unicode English records). */
function font(names: Record<number, string>, tables: string[] = ['glyf', 'GSUB']): Uint8Array {
  const entries = Object.entries(names).map(([id, text]) => ({ id: Number(id), text }));
  const strings = entries.map((e) => {
    const b = new Uint8Array(e.text.length * 2);
    for (let i = 0; i < e.text.length; i++) new DataView(b.buffer).setUint16(i * 2, e.text.charCodeAt(i));
    return b;
  });
  const nameLen = 6 + entries.length * 12 + strings.reduce((n, s) => n + s.length, 0);
  const all = ['name', ...tables];
  const head = 12 + all.length * 16;
  const out = new Uint8Array(head + nameLen);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x00010000);
  v.setUint16(4, all.length);
  all.forEach((tag, i) => {
    for (let k = 0; k < 4; k++) out[12 + i * 16 + k] = tag.charCodeAt(k);
    if (tag === 'name') {
      v.setUint32(12 + i * 16 + 8, head);
      v.setUint32(12 + i * 16 + 12, nameLen);
    }
  });
  v.setUint16(head + 2, entries.length);
  v.setUint16(head + 4, 6 + entries.length * 12);
  let at = 0;
  entries.forEach((e, i) => {
    const rec = head + 6 + i * 12;
    v.setUint16(rec, 3);
    v.setUint16(rec + 2, 1);
    v.setUint16(rec + 4, 0x409);
    v.setUint16(rec + 6, e.id);
    v.setUint16(rec + 8, strings[i]!.length);
    v.setUint16(rec + 10, at);
    out.set(strings[i]!, head + 6 + entries.length * 12 + at);
    at += strings[i]!.length;
  });
  return out;
}

describe('fontNames', () => {
  it('reads family and style, the typographic ones first', () => {
    expect(fontNames(font({ 1: 'Alegreya Medium', 2: 'Regular', 16: 'Alegreya', 17: 'Medium', 6: 'AlegreyaRoman-Medium', 4: 'Alegreya Medium' }))).toEqual({
      family: 'Alegreya', style: 'Medium', postScriptName: 'AlegreyaRoman-Medium', fullName: 'Alegreya Medium', type: 'OpenTypeTT', extension: 'ttf',
    });
    expect(fontNames(font({ 1: 'Lora', 2: 'Bold Italic' }, ['CFF ']))).toMatchObject({ family: 'Lora', style: 'Bold Italic', type: 'OpenTypeCFF', extension: 'otf' });
  });

  it('answers nothing for compressed or foreign bytes, and never throws on a cut file', () => {
    expect(fontFormat(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('woff2');
    expect(fontNames(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeUndefined();
    const whole = font({ 1: 'Lora', 2: 'Regular' });
    for (let n = 0; n < whole.length; n += 7) expect(() => fontNames(whole.subarray(0, n))).not.toThrow();
  });
});
