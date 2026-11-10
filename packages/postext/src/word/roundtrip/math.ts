// Equations read back from Word. The writer records a hash of the
// canonical OMML of each equation (anchors/ommlHash.ts); an equation whose
// OMML still hashes the same is untouched and keeps its source. Otherwise
// ommlToTex gives the TeX, which rarely is the TeX that was written
// (`x^{2}` for `x^2`), so the equation still counts as unchanged when the
// two TeX strings agree after normalising, or, with the OMML writer
// running, when both write the same OMML. Only a changed equation replaces
// its source.

import { isTexToOmmlReady, texToDisplayOmml, texToOmml } from '../ommlWrite/index.js';

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

/** An equation number in TeX (`\tag{1}`, `\tag*{A}`), braces nested one
 *  level deep. */
const TAG = /\\tag\*?\s*\{(?:[^{}]|\{[^{}]*\})*\}/;

/** `tex` without its equation number. The writer sets the number beside
 *  the equation, outside the OMML, so the TeX Word gives back has none. */
export const stripTag = (tex: string): string => tex.replace(TAG, '');

const omml = (tex: string, display: boolean): string | null =>
  display ? (texToDisplayOmml(stripTag(tex))?.omml ?? null) : texToOmml(tex, false);

export function mathUnchanged(source: string, tex: string): boolean {
  const orig = texOfSource(source);
  if (normalizeTex(stripTag(orig.tex)) === normalizeTex(stripTag(tex))) return true;
  if (!isTexToOmmlReady()) return false;
  const a = omml(orig.tex, orig.display);
  return a !== null && a === omml(tex, orig.display);
}

/** The TeX of an equation edited in Word, given back the number its source
 *  had (`\tag{2}`): Word never saw it, so its TeX lacks it. */
export function keepTag(source: string, tex: string): string {
  if (TAG.test(tex)) return tex;
  const tag = TAG.exec(texOfSource(source).tex);
  return tag ? `${tex.trimEnd()} ${tag[0]}` : tex;
}

/** Markdown for an equation typed or changed in Word. */
export function mathSource(tex: string, display = false): string {
  return display ? `$$${tex}$$` : `$${tex}$`;
}
