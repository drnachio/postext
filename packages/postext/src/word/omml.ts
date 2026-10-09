// Word equations (Office Math, `m:oMath`) to TeX for MathJax: fractions,
// scripts, radicals, n-ary operators, delimiters, functions, accents,
// matrices and equation arrays. What it does not know it sets as its text,
// so nothing is lost; the import report asks for a look at every equation.

import { attr, child, children, localName, textOf, type XmlElement } from './xml';

const ACCENTS: Record<string, string> = {
  '̂': '\\hat', '̃': '\\tilde', '̇': '\\dot', '̈': '\\ddot', '̄': '\\bar',
  '⃗': '\\vec', '́': '\\acute', '̀': '\\grave', '̆': '\\breve', '̌': '\\check',
};

const NARY: Record<string, string> = {
  '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint',
  '∮': '\\oint', '⋃': '\\bigcup', '⋂': '\\bigcap', '⋁': '\\bigvee', '⋀': '\\bigwedge',
};

const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'sinh', 'cosh', 'tanh', 'det', 'arg', 'deg', 'dim', 'gcd', 'inf', 'sup', 'arcsin', 'arccos', 'arctan']);

const DELIMS: Record<string, string> = { '{': '\\{', '}': '\\}', '|': '|', '‖': '\\|', '⟨': '\\langle', '⟩': '\\rangle', '⌊': '\\lfloor', '⌋': '\\rfloor', '⌈': '\\lceil', '⌉': '\\rceil', '': '.' };

const TEX_SPECIAL: Record<string, string> = { '{': '\\{', '}': '\\}', '%': '\\%', '#': '\\#', '&': '\\&', '_': '\\_', '$': '\\$', '\\': '\\backslash ' };

function prop(el: XmlElement | undefined, prName: string, key: string): string | undefined {
  return attr(child(child(el, prName), key), 'val');
}

const group = (s: string): string => (s.length === 1 ? s : `{${s}}`);

function runText(r: XmlElement): string {
  const t = children(r, 't').map(textOf).join('');
  if (FUNCTIONS.has(t)) return `\\${t}`;
  // Normal text (`m:nor`) inside an equation: words, not variables.
  if (child(child(r, 'rPr'), 'nor') !== undefined && /[A-Za-z]/.test(t)) return `\\text{${t}}`;
  let out = '';
  for (const ch of t) out += TEX_SPECIAL[ch] ?? ch;
  return out;
}

function arg(el: XmlElement | undefined): string {
  return el ? convertChildren(el) : '';
}

function convertChildren(el: XmlElement): string {
  let out = '';
  for (const c of children(el)) {
    const piece = convert(c);
    if (!piece) continue;
    // Keep a command and the letters after it apart (`\alpha x`).
    if (/\\[A-Za-z]+$/.test(out) && /^[A-Za-z]/.test(piece)) out += ' ';
    out += piece;
  }
  return out;
}

function convert(el: XmlElement): string {
  switch (localName(el.name)) {
    case 'r':
      return runText(el);
    case 'f': {
      const type = prop(el, 'fPr', 'type');
      const num = arg(child(el, 'num'));
      const den = arg(child(el, 'den'));
      if (type === 'lin') return `${group(num)}/${group(den)}`;
      if (type === 'noBar') return `\\genfrac{}{}{0pt}{}{${num}}{${den}}`;
      return `\\frac{${num}}{${den}}`;
    }
    case 'sSup':
      return `${group(arg(child(el, 'e')))}^{${arg(child(el, 'sup'))}}`;
    case 'sSub':
      return `${group(arg(child(el, 'e')))}_{${arg(child(el, 'sub'))}}`;
    case 'sSubSup':
      return `${group(arg(child(el, 'e')))}_{${arg(child(el, 'sub'))}}^{${arg(child(el, 'sup'))}}`;
    case 'sPre':
      return `{}_{${arg(child(el, 'sub'))}}^{${arg(child(el, 'sup'))}}${group(arg(child(el, 'e')))}`;
    case 'rad': {
      const deg = arg(child(el, 'deg'));
      const e = arg(child(el, 'e'));
      return deg ? `\\sqrt[${deg}]{${e}}` : `\\sqrt{${e}}`;
    }
    case 'nary': {
      const chr = prop(el, 'naryPr', 'chr') ?? '∫';
      const op = NARY[chr] ?? chr;
      const sub = arg(child(el, 'sub'));
      const sup = arg(child(el, 'sup'));
      return `${op}${sub ? `_{${sub}}` : ''}${sup ? `^{${sup}}` : ''} ${arg(child(el, 'e'))}`;
    }
    case 'd': {
      const pr = child(el, 'dPr');
      const beg = attr(child(pr, 'begChr'), 'val') ?? '(';
      const end = attr(child(pr, 'endChr'), 'val') ?? ')';
      const sep = attr(child(pr, 'sepChr'), 'val') ?? '|';
      const parts = children(el, 'e').map(arg);
      const sepTex = DELIMS[sep] ?? sep;
      return `\\left${DELIMS[beg] ?? beg}${parts.join(sepTex === '|' ? '\\mid ' : sepTex)}\\right${DELIMS[end] ?? end}`;
    }
    case 'func': {
      const name = arg(child(el, 'fName')).trim();
      const fn = FUNCTIONS.has(name) ? `\\${name}` : name.startsWith('\\') ? name : `\\operatorname{${name}}`;
      return `${fn}{${arg(child(el, 'e'))}}`;
    }
    case 'acc': {
      const chr = prop(el, 'accPr', 'chr') ?? '̂';
      return `${ACCENTS[chr] ?? '\\hat'}{${arg(child(el, 'e'))}}`;
    }
    case 'bar': {
      const pos = prop(el, 'barPr', 'pos');
      return `${pos === 'bot' ? '\\underline' : '\\overline'}{${arg(child(el, 'e'))}}`;
    }
    case 'groupChr': {
      const pos = prop(el, 'groupChrPr', 'pos');
      return `${pos === 'top' ? '\\overbrace' : '\\underbrace'}{${arg(child(el, 'e'))}}`;
    }
    case 'limLow':
      return `${group(arg(child(el, 'e')))}_{${arg(child(el, 'lim'))}}`;
    case 'limUpp':
      return `${group(arg(child(el, 'e')))}^{${arg(child(el, 'lim'))}}`;
    case 'm': {
      const rows = children(el, 'mr').map((mr) => children(mr, 'e').map(arg).join(' & '));
      return `\\begin{matrix}${rows.join(' \\\\ ')}\\end{matrix}`;
    }
    case 'eqArr': {
      const rows = children(el, 'e').map(arg);
      return `\\begin{aligned}${rows.join(' \\\\ ')}\\end{aligned}`;
    }
    case 'box':
    case 'borderBox':
    case 'phant':
    case 'e':
    case 'oMath':
      return convertChildren(el);
    case 'ctrlPr':
    case 'rPr':
    default:
      if (localName(el.name).endsWith('Pr')) return '';
      return convertChildren(el);
  }
}

/** TeX for one `m:oMath` element. */
export function ommlToTex(oMath: XmlElement): string {
  return convertChildren(oMath).replace(/\s+/g, ' ').trim();
}
