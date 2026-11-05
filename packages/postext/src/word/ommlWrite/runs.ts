// Math runs (`m:r`): the token elements of MathML (mi, mn, mo, mtext) and
// the spaces between them. A run's style (`m:sty`) and script (`m:scr`)
// come from `mathvariant`; text (`\text{…}`) is a normal-text run (`m:nor`),
// which `ommlToTex` reads back as `\text{…}`.

import { escapeAttr, escapeXml } from '../xml.js';
import { explicitAttr, tokenText, type MmlNode } from './mml.js';

export interface RunStyle {
  /** `m:sty`: p (plain), b (bold), i (italic), bi (bold italic). */
  sty?: 'p' | 'b' | 'i' | 'bi';
  /** `m:scr`: roman, script, fraktur, double-struck, sans-serif, monospace. */
  scr?: string;
  /** Normal (non-math) text. */
  nor?: boolean;
}

export interface RunOptions {
  /** Font for the run's `w:rPr` (Word writes Cambria Math). Omitted: no
   *  `w:rPr`, Word uses the document's math font. */
  font?: string;
  /** Display style (set by the writer as it descends: false inside
   *  scripts, fractions and matrices). */
  display?: boolean;
}

/** mathvariant → run style. */
const VARIANTS: Record<string, RunStyle> = {
  normal: { sty: 'p' },
  bold: { sty: 'b' },
  italic: { sty: 'i' },
  'bold-italic': { sty: 'bi' },
  'double-struck': { scr: 'double-struck', sty: 'p' },
  script: { scr: 'script', sty: 'p' },
  'bold-script': { scr: 'script', sty: 'b' },
  fraktur: { scr: 'fraktur', sty: 'p' },
  'bold-fraktur': { scr: 'fraktur', sty: 'b' },
  'sans-serif': { scr: 'sans-serif', sty: 'p' },
  'bold-sans-serif': { scr: 'sans-serif', sty: 'b' },
  'sans-serif-italic': { scr: 'sans-serif', sty: 'i' },
  'sans-serif-bold-italic': { scr: 'sans-serif', sty: 'bi' },
  monospace: { scr: 'monospace', sty: 'p' },
  '-tex-calligraphic': { scr: 'script', sty: 'p' },
  '-tex-bold-calligraphic': { scr: 'script', sty: 'b' },
  '-tex-oldstyle': { sty: 'p' },
};

/** One `m:r` holding `text`. */
export function mathRun(text: string, style: RunStyle = {}, options: RunOptions = {}): string {
  if (text === '') return '';
  let pr = '';
  if (style.nor) pr = '<m:nor/>';
  else {
    if (style.scr) pr += `<m:scr m:val="${escapeAttr(style.scr)}"/>`;
    if (style.sty) pr += `<m:sty m:val="${style.sty}"/>`;
  }
  const rPr = pr ? `<m:rPr>${pr}</m:rPr>` : '';
  const font = options.font ? `<w:rPr><w:rFonts w:ascii="${escapeAttr(options.font)}" w:hAnsi="${escapeAttr(options.font)}"/></w:rPr>` : '';
  return `<m:r>${rPr}${font}<m:t xml:space="preserve">${escapeXml(text)}</m:t></m:r>`;
}

/** The run style of a token from its `mathvariant` (explicit, or the
 *  MathML default: a multi-letter `mi` is upright). */
export function tokenStyle(node: MmlNode, text: string): RunStyle {
  if (node.kind === 'mtext' || node.kind === 'ms') return { nor: true };
  const variant = explicitAttr(node, 'mathvariant')
    ?? (node.getProperty?.('variant') as string | undefined);
  if (variant !== undefined) {
    const s = VARIANTS[variant];
    // Italic is what Word gives single letters anyway; keep the run bare.
    if (s && !(s.sty === 'i' && !s.scr && node.kind === 'mi' && [...text].length === 1)) return s;
    if (s) return {};
  }
  // A word (a function name, `\lim`, `\bmod`) is upright.
  if ((node.kind === 'mi' && [...text].length > 1) || (node.kind === 'mo' && /^[A-Za-z]{2,}$/.test(text))) return { sty: 'p' };
  return {};
}

/** A token element as a run. */
export function tokenRun(node: MmlNode, options: RunOptions): string {
  const text = tokenText(node);
  // Function application (U+2061) and invisible times/separators are
  // MathML markup, not glyphs Word should set.
  const visible = text.replace(/[⁡-⁤]/g, '');
  return mathRun(visible, tokenStyle(node, visible), options);
}

/** Space widths in em → the Unicode space Word sets for it. */
const SPACES: [number, string][] = [
  [2, '  '],
  [1, ' '],
  [0.5, ' '],
  [0.333, ' '],
  [0.278, ' '],
  [0.222, ' '],
  [0.167, ' '],
  [0.111, ' '],
];

/** The em width of a MathML length (`0.167em`, `thickmathspace`, `1em`). */
export function lengthEm(value: string | undefined): number {
  if (!value) return 0;
  const named: Record<string, number> = {
    veryverythinmathspace: 1 / 18, verythinmathspace: 2 / 18, thinmathspace: 3 / 18,
    mediummathspace: 4 / 18, thickmathspace: 5 / 18, verythickmathspace: 6 / 18, veryverythickmathspace: 7 / 18,
  };
  if (value in named) return named[value]!;
  const m = /^([-+]?[\d.]+)\s*(em|ex|pt|px|mu|cm|mm|in|pc|bp)?$/.exec(value.trim());
  if (!m) return 0;
  const n = parseFloat(m[1]!);
  switch (m[2]) {
    case 'ex': return n * 0.43;
    case 'pt': return n / 10;
    case 'px': return n / 16;
    case 'mu': return n / 18;
    // Physical lengths at the 10pt em the other cases assume.
    case 'cm': return (n * 72.27) / 2.54 / 10;
    case 'mm': return (n * 72.27) / 25.4 / 10;
    case 'in': return (n * 72.27) / 10;
    case 'pc': return (n * 12) / 10;
    case 'bp': return (n * 72.27) / 72 / 10;
    default: return n;
  }
}

/** An `mspace` as a run of Unicode spaces (nothing for a negative or zero
 *  width: Word has no negative space). */
export function spaceRun(node: MmlNode, options: RunOptions): string {
  const em = lengthEm(explicitAttr(node, 'width'));
  if (em <= 0.05) return '';
  for (const [w, chars] of SPACES) if (em >= w - 0.01) return mathRun(chars, {}, options);
  return mathRun(' ', {}, options);
}
