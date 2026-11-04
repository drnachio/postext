import { beforeAll, describe, expect, it } from 'vitest';
import { attr, child, children, descendants, localName, parseXml, textOf, type XmlElement } from '../xml.js';
import { ommlToTex } from '../omml.js';
import { initTexToOmml, isTexToOmmlReady, setTexToOmmlConverter, texToOmml } from './index.js';
import { lengthEm } from './runs.js';

beforeAll(async () => {
  await initTexToOmml();
});

/** Parse with the Word reader (namespaces declared so the XML is a
 *  stand-alone document). */
function parse(omml: string): XmlElement {
  return parseXml(`<w:root xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${omml}</w:root>`);
}

/** The local names of every element, in document order. */
function names(el: XmlElement, out: string[] = []): string[] {
  for (const c of children(el)) {
    out.push(localName(c.name));
    names(c, out);
  }
  return out;
}

/** Balanced tags: every open tag closed in order (the reader is lenient,
 *  so check it separately). */
function wellFormed(xml: string): boolean {
  const stack: string[] = [];
  const re = /<(\/?)([A-Za-z][\w:.-]*)[^>]*?(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const [, close, name, self] = m;
    if (self) continue;
    if (close) {
      if (stack.pop() !== name) return false;
    } else stack.push(name!);
  }
  return stack.length === 0 && !/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(xml);
}

function oMathOf(tex: string, display = false): XmlElement {
  const out = texToOmml(tex, display);
  expect(out, tex).not.toBeNull();
  expect(wellFormed(out!), out!).toBe(true);
  const root = parse(out!);
  return display ? child(child(root, 'oMathPara'), 'oMath')! : child(root, 'oMath')!;
}

/** [TeX, element names the OMML must contain]. */
const SAMPLES: [string, string[]][] = [
  ['\\frac{a}{b}', ['f', 'num', 'den']],
  ['\\frac{1}{1+\\frac{1}{x}}', ['f', 'num', 'den']],
  ['\\tfrac{a}{b}+\\dfrac{c}{d}', ['f']],
  ['x^2', ['sSup']],
  ['x_i', ['sSub']],
  ['x_i^2', ['sSubSup']],
  ['e^{x^{2}}', ['sSup']],
  ['a_{i_{j}}', ['sSub']],
  ['\\sum_{i=1}^{n} x_i', ['nary', 'sub', 'sup', 'e']],
  ['\\prod_{k} a_k', ['nary']],
  ['\\int_0^1 f(x)\\,dx', ['nary']],
  ['\\iint_D f', ['nary']],
  ['\\oint_C F', ['nary']],
  ['\\bigcup_{i} A_i', ['nary']],
  ['\\sqrt{x}', ['rad', 'radPr', 'degHide']],
  ['\\sqrt[3]{x+1}', ['rad', 'deg']],
  ['\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', ['d', 'm', 'mr', 'mcs']],
  ['\\begin{bmatrix}1&0\\\\0&1\\end{bmatrix}', ['d', 'm']],
  ['\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}', ['d', 'm']],
  ['\\begin{matrix}1&2&3\\end{matrix}', ['m']],
  ['\\begin{cases}1 & x>0\\\\0 & \\text{otherwise}\\end{cases}', ['d', 'm', 'nor']],
  ['\\begin{aligned}a&=b+c\\\\d&=e\\end{aligned}', ['eqArr']],
  ['\\hat{x}', ['acc']],
  ['\\bar{x}', ['acc']],
  ['\\vec{v}', ['acc']],
  ['\\dot{x}+\\ddot{y}', ['acc']],
  ['\\tilde{n}', ['acc']],
  ['\\overline{AB}', ['bar']],
  ['\\underline{x}', ['bar']],
  ['\\overbrace{a+b}^{n}', ['limUpp', 'groupChr']],
  ['\\underbrace{a+b}_{n}', ['limLow', 'groupChr']],
  ['\\sin x', ['func', 'fName']],
  ['\\log_2 n', ['func', 'sSub']],
  ['\\lim_{x\\to 0} \\frac{\\sin x}{x}', ['func', 'limLow']],
  ['\\operatorname{tr} A', ['func']],
  ['\\text{if } x', ['nor']],
  ['\\alpha+\\beta=\\Gamma', ['r']],
  ['\\binom{n}{k}', ['d', 'f', 'type']],
  ['\\left(\\frac{a}{b}\\right)', ['d']],
  ['\\left\\{x \\middle| x>0\\right\\}', ['d', 'sepChr']],
  ['\\left.\\frac{df}{dx}\\right|_{x=0}', ['sSub', 'd']],
  ['\\boxed{E=mc^2}', ['borderBox']],
  ['\\phantom{x}y', ['phant']],
  ['\\mathbb{R}\\mathcal{L}\\mathbf{v}\\mathfrak{g}', ['scr', 'sty']],
  ['a\\,b\\quad c', ['r']],
  ['x < y \\& z', ['r']],
  ['\\text{a < b > c}', ['nor']],
];

describe('texToOmml', () => {
  it('starts', () => {
    expect(isTexToOmmlReady()).toBe(true);
  });

  for (const [tex, expected] of SAMPLES) {
    it(tex, () => {
      const els = names(oMathOf(tex));
      for (const e of expected) expect(els, `${tex} → ${e}`).toContain(e);
    });
  }

  it('wraps display maths in m:oMathPara', () => {
    const out = texToOmml('x^2', true)!;
    expect(out.startsWith('<m:oMathPara><m:oMath>')).toBe(true);
    expect(out.endsWith('</m:oMath></m:oMathPara>')).toBe(true);
    expect(texToOmml('x^2', false)!.startsWith('<m:oMath>')).toBe(true);
  });

  it('escapes XML in runs and attributes', () => {
    const out = texToOmml('a<b \\& \\left<x\\right>', false)!;
    expect(wellFormed(out)).toBe(true);
    expect(textOf(parse(out))).toContain('<');
    expect(textOf(parse(out))).toContain('&');
  });

  it('sets limits under a display sum and beside an inline one', () => {
    const limLoc = (display: boolean): string | undefined =>
      attr(descendants(oMathOf('\\sum_{i=1}^n i', display), 'limLoc')[0], 'val');
    expect(limLoc(true)).toBe('undOvr');
    expect(limLoc(false)).toBe('subSup');
    const loc = (tex: string): string | undefined => attr(descendants(oMathOf(tex), 'limLoc')[0], 'val');
    expect(loc('\\sum\\limits_{i}^{n} i')).toBe('undOvr');
    expect(loc('\\displaystyle\\sum_i^n i')).toBe('undOvr');
    expect(loc('\\int\\limits_0^1 f')).toBe('undOvr');
    expect(loc('\\int_0^1 f')).toBe('subSup');
  });

  it('takes the terms after an n-ary operator as its body', () => {
    const nary = descendants(oMathOf('\\sum_i a_i b_i + c'), 'nary')[0]!;
    expect(textOf(child(nary, 'e')!)).toBe('aibi');
    const subHide = descendants(oMathOf('\\int f'), 'subHide');
    expect(subHide).toHaveLength(1);
  });

  it('marks a binomial as a fraction without a bar', () => {
    expect(attr(descendants(oMathOf('\\binom{n}{k}'), 'type')[0], 'val')).toBe('noBar');
  });

  it('keeps an empty closing delimiter for cases', () => {
    const pr = descendants(oMathOf('\\begin{cases}a\\\\b\\end{cases}'), 'dPr')[0]!;
    expect(attr(child(pr, 'begChr'), 'val')).toBe('{');
    expect(attr(child(pr, 'endChr'), 'val')).toBe('');
  });

  it('aligns matrix columns as the environment says', () => {
    const jcs = descendants(oMathOf('\\begin{array}{lcr}a&b&c\\end{array}'), 'mcJc').map((j) => attr(j, 'val'));
    expect(jcs).toEqual(['left', 'center', 'right']);
  });

  it('puts alignment marks between the cells of an equation array', () => {
    const rows = children(descendants(oMathOf('\\begin{aligned}a&=b\\\\c&=d\\end{aligned}', true), 'eqArr')[0]!, 'e');
    expect(rows.map(textOf)).toEqual(['a&=b', 'c&=d']);
  });

  it('sets function names upright and gives them their argument', () => {
    const func = descendants(oMathOf('\\sin(x+y)'), 'func')[0]!;
    expect(attr(descendants(child(func, 'fName')!, 'sty')[0], 'val')).toBe('p');
    expect(textOf(child(func, 'e')!)).toBe('(x+y)');
  });

  it('keeps a closing bracket the n-ary body did not open outside it', () => {
    const math = oMathOf('(\\sum_i x_i) + 1');
    const nary = descendants(math, 'nary')[0]!;
    expect(textOf(child(nary, 'e')!)).toBe('xi');
    expect(children(math).map((c) => localName(c.name))).toEqual(['r', 'nary', 'r', 'r', 'r']);
    // A bracket group the body opens stays inside it.
    expect(textOf(child(descendants(oMathOf('\\sum_i (a_i) b'), 'nary')[0]!, 'e')!)).toBe('(ai)b');
  });

  it('zeroes the dimensions of vertical and horizontal phantoms, smash and lap', () => {
    const pr = (tex: string): string[] => children(descendants(oMathOf(tex), 'phantPr')[0]!)
      .map((c) => `${localName(c.name)}=${attr(c, 'val')}`);
    expect(pr('\\vphantom{x}y')).toEqual(['show=0', 'zeroWid=1']);
    expect(pr('\\hphantom{x}')).toEqual(['show=0', 'zeroAsc=1', 'zeroDesc=1']);
    expect(pr('\\phantom{x}')).toEqual(['show=0']);
    expect(pr('\\smash{x}')).toEqual(['zeroAsc=1', 'zeroDesc=1']);
    expect(pr('\\rlap{x}y')).toEqual(['zeroWid=1']);
  });

  it('sets prescripts as m:sPre', () => {
    const pre = descendants(oMathOf('\\prescript{a}{b}{X}'), 'sPre')[0]!;
    expect(children(pre).map((c) => localName(c.name))).toEqual(['sub', 'sup', 'e']);
    expect([textOf(child(pre, 'sub')!), textOf(child(pre, 'sup')!), textOf(child(pre, 'e')!)]).toEqual(['b', 'a', 'X']);
    expect(names(oMathOf('\\sideset{_a^b}{_c^d}\\sum'))).toEqual(expect.arrayContaining(['sPre', 'sSubSup', 'nary']));
  });

  it('draws cancelto as an up-diagonal strike', () => {
    expect(names(oMathOf('\\cancelto{0}{x}'))).toEqual(expect.arrayContaining(['borderBox', 'strikeBLTR', 'sSup']));
  });

  it('writes at least one row for an empty matrix (CT_M needs one)', () => {
    const m = descendants(oMathOf('\\begin{matrix}\\end{matrix}'), 'm')[0]!;
    expect(children(m, 'mr')).toHaveLength(1);
  });

  it('refuses a matrix wider than the 64 columns CT_MCS allows', () => {
    const wide = `\\begin{array}{${'c'.repeat(65)}}${Array(65).fill('1').join('&')}\\end{array}`;
    expect(texToOmml(wide, false)).toBeNull();
    const ok = `\\begin{array}{${'c'.repeat(64)}}${Array(64).fill('1').join('&')}\\end{array}`;
    expect(texToOmml(ok, false)).not.toBeNull();
  });

  it('reads physical lengths for explicit spaces', () => {
    expect(lengthEm('1cm')).toBeCloseTo(2.845, 2);
    expect(lengthEm('10mm')).toBeCloseTo(2.845, 2);
    expect(lengthEm('1in')).toBeCloseTo(7.227, 2);
    expect(textOf(oMathOf('\\hspace{1cm}x')).length).toBeGreaterThan(1);
  });

  it('starts again after the converter is reset', async () => {
    setTexToOmmlConverter(null);
    expect(texToOmml('x', false)).toBeNull();
    await initTexToOmml();
    expect(isTexToOmmlReady()).toBe(true);
    expect(texToOmml('x', false)).not.toBeNull();
  });

  it('answers null for what OMML cannot hold or TeX that does not parse', () => {
    expect(texToOmml('x \\tag{1}', true)).toBeNull();
    expect(texToOmml('\\frac', false)).toBeNull();
    expect(texToOmml('\\undefinedmacro', false)).toBeNull();
  });
});

describe('ommlToTex round trip', () => {
  // The OMML of the TeX ommlToTex reads back is the OMML we wrote: the
  // equation survives a trip through Word untouched.
  const ROUND = [
    'x^{2}', 'x_{i}', 'x_{i}^{2}', '\\frac{a}{b}', '\\frac{1}{1+\\frac{1}{x}}', '\\sqrt{x}', '\\sqrt[3]{x}',
    '\\sum_{i=1}^{n} x_{i}', '\\int_{0}^{1} f', '\\hat{x}+\\bar{y}+\\vec{v}', '\\binom{n}{k}',
    '\\left(a+b\\right)', '\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}', '\\sin x', '\\alpha+\\beta',
    '\\text{if } x', '\\overline{AB}',
  ];
  for (const tex of ROUND) {
    it(tex, () => {
      const first = texToOmml(tex, false)!;
      const back = ommlToTex(child(parse(first), 'oMath')!);
      expect(texToOmml(back, false), back).toBe(first);
    });
  }
});
