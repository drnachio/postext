import { beforeAll, describe, expect, it } from 'vitest';
import { child, parseXml, type XmlElement } from './xml.js';
import { ommlToTex } from './omml.js';
import { initTexToOmml, texToOmml } from './ommlWrite/index.js';

const NS = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function oMath(inner: string): XmlElement {
  return child(parseXml(`<w:root ${NS}><m:oMath>${inner}</m:oMath></w:root>`), 'oMath')!;
}

const r = (t: string): string => `<m:r><m:t>${t}</m:t></m:r>`;

describe('ommlToTex', () => {
  it('keeps the alignment marks of an equation array and joins its rows with \\\\', () => {
    const xml = `<m:eqArr><m:e>${r('a')}${r('&amp;')}${r('=b+c')}</m:e><m:e>${r('d')}${r('&amp;')}${r('=e')}</m:e></m:eqArr>`;
    expect(ommlToTex(oMath(xml))).toBe('\\begin{aligned}a&=b+c \\\\ d&=e\\end{aligned}');
  });

  it('still escapes a literal ampersand outside an equation array', () => {
    expect(ommlToTex(oMath(r('a&amp;b')))).toBe('a\\&b');
  });

  it('reads a function named by a lower limit as \\lim_{…}', () => {
    const xml = `<m:func><m:fName><m:limLow><m:e>${r('lim')}</m:e><m:lim>${r('x→0')}</m:lim></m:limLow></m:fName><m:e>${r('f')}</m:e></m:func>`;
    expect(ommlToTex(oMath(xml))).toBe('\\lim_{x→0}{f}');
  });

  it('groups a limit base that is not a lone command', () => {
    const xml = `<m:limLow><m:e>${r('ab')}</m:e><m:lim>${r('n')}</m:lim></m:limLow>`;
    expect(ommlToTex(oMath(xml))).toBe('{ab}_{n}');
  });
});

describe('ommlToTex after texToOmml', () => {
  beforeAll(async () => {
    await initTexToOmml();
  });

  // The TeX read back writes the same OMML again: the equation survives.
  for (const tex of ['\\begin{aligned}a&=b+c\\\\d&=e\\end{aligned}', '\\lim_{x\\to 0} \\frac{\\sin x}{x}', '\\max_{i} x_{i}']) {
    it(tex, () => {
      const display = tex.startsWith('\\begin');
      const first = texToOmml(tex, display)!;
      expect(first).not.toBeNull();
      const root = parseXml(`<w:root ${NS}>${first}</w:root>`);
      const math = display ? child(child(root, 'oMathPara'), 'oMath')! : child(root, 'oMath')!;
      const back = ommlToTex(math);
      expect(back).not.toContain('\\&');
      expect(back).not.toContain('operatorname');
      expect(texToOmml(back, display), back).toBe(first);
    });
  }
});
