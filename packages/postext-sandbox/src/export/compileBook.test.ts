import { describe, expect, it } from 'vitest';
import { compiledBaseName, fontFaceRule } from './compileBook.js';

describe('the book compiler’s file names', () => {
  it('takes the title, letters and digits of any script kept', () => {
    expect(compiledBaseName('El ingenioso hidalgo')).toBe('El-ingenioso-hidalgo');
    expect(compiledBaseName('紅樓夢 第一回')).toBe('紅樓夢-第一回');
    expect(compiledBaseName('  «Cuentos»: 2.ª edición ')).toBe('Cuentos-2-ª-edición');
  });

  it('falls back to «book» when nothing of the title is left', () => {
    expect(compiledBaseName('')).toBe('book');
    expect(compiledBaseName('***')).toBe('book');
  });
});

describe('the HTML’s embedded fonts', () => {
  it('writes each file as an @font-face rule with its weight, style, format and range', () => {
    const rule = fontFaceRule({ family: 'Body Serif', weight: 700, style: 'italic', format: 'ttf', bytes: new Uint8Array([1, 2, 3]), unicodeRange: 'U+0000-00FF' });
    expect(rule).toBe('@font-face{font-family:"Body Serif";font-weight:700;font-style:italic;src:url(data:font/ttf;base64,AQID) format("truetype");unicode-range:U+0000-00FF;}');
  });

  it('names woff2 and otf by their CSS formats and leaves the range out when the file has none', () => {
    expect(fontFaceRule({ family: 'A', weight: 400, style: 'normal', format: 'woff2', bytes: new Uint8Array([0]) })).toContain('format("woff2");}');
    expect(fontFaceRule({ family: 'A', weight: 400, style: 'normal', format: 'otf', bytes: new Uint8Array([0]) })).toContain('font/otf;base64,AA==) format("opentype")');
  });
});
