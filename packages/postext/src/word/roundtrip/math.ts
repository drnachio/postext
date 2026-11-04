// Equations read back from Word: ommlToTex rarely gives the TeX that was
// written (`x^{2}` for `x^2`), so an equation counts as unchanged when the
// two TeX strings agree after normalising, or, with the OMML writer
// running, when both write the same OMML. Only a changed equation replaces
// its source.

import { isTexToOmmlReady, texToOmml } from '../ommlWrite/index.js';

/** The TeX inside a source equation (`$…$`, `$$…$$`, `\(…\)`, `\[…\]`). */
export function texOfSource(source: string): { tex: string; display: boolean } {
  const s = source.trim();
  if (s.startsWith('$$') && s.endsWith('$$') && s.length >= 4) return { tex: s.slice(2, -2), display: true };
  if (s.startsWith('\\[') && s.endsWith('\\]')) return { tex: s.slice(2, -2), display: true };
  if (s.startsWith('\\(') && s.endsWith('\\)')) return { tex: s.slice(2, -2), display: false };
  if (s.startsWith('$') && s.endsWith('$') && s.length >= 2) return { tex: s.slice(1, -1), display: false };
  return { tex: s, display: false };
}

/** A canonical spelling: no spaces, single tokens unbraced after `^`/`_`,
 *  `\left`/`\right` dropped, `\dfrac`/`\tfrac` as `\frac`. */
export function normalizeTex(tex: string): string {
  let t = tex.replace(/\\left(?![A-Za-z])|\\right(?![A-Za-z])/g, '').replace(/\\[dt]frac(?![A-Za-z])/g, '\\frac');
  t = t.replace(/\\([A-Za-z]+)\s+(?=[A-Za-z])/g, '\\$1\u0001').replace(/\s+/g, '');
  for (let prev = ''; prev !== t; ) {
    prev = t;
    t = t.replace(/([_^])\{(\\[A-Za-z]+|[^{}\\])\}/g, '$1$2');
  }
  return t.replace(/\u0001/g, ' ');
}

export function mathUnchanged(source: string, tex: string): boolean {
  const orig = texOfSource(source);
  if (normalizeTex(orig.tex) === normalizeTex(tex)) return true;
  if (!isTexToOmmlReady()) return false;
  const a = texToOmml(orig.tex, orig.display);
  return a !== null && a === texToOmml(tex, orig.display);
}

/** Markdown for an equation typed or changed in Word. */
export function mathSource(tex: string, display = false): string {
  return display ? `$$${tex}$$` : `$${tex}$`;
}
