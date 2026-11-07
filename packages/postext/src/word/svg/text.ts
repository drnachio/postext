// SVG text drawn as outlines for Word (#1444). Word, Word for the web and
// LibreOffice set an SVG's `<text>` in whatever face they find by name,
// and none of them reads the `@font-face` rules a figure carries: an exam
// cover's '1863' in Inter Tight ExtraBold came out as a thin serif. Each
// `<text>` whose face the document embeds is replaced by a group holding
// the glyph outlines of that face, at the place the text stood; the group
// keeps the text's paint (fill, stroke, opacity, transform, class). Text
// the face cannot draw (a missing glyph, right-to-left or per-glyph
// positioning, tspans) stays live text, and the fonts helper names the
// embedded family for it. So does all the text of an SVG whose `<style>`
// holds rules other than `@font-face`: a selector may set a text's size,
// weight or paint, which the outline would not see, and a rule for
// `text` would stop applying once the element is a group.

import { wordFontFor } from '../fonts/plan.js';
import type { WordFontPlan } from '../fonts/types.js';
import { contoursPath, readOutlineFace, type OutlineFace } from './glyphs.js';

/** Attributes the outline replaces (the text's place and font). */
const TEXT_ONLY = new Set(['x', 'y', 'dx', 'dy', 'font-family', 'font-size', 'font-weight', 'font-style', 'font', 'text-anchor', 'letter-spacing', 'xml:space', 'font-variant', 'font-stretch', 'word-spacing', 'lengthadjust', 'textlength', 'direction', 'writing-mode', 'unicode-bidi', 'dominant-baseline', 'alignment-baseline']);
/** Inherited properties read from enclosing groups. */
const INHERITED = ['font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'letter-spacing', 'direction', 'writing-mode', 'dominant-baseline'] as const;
/** Properties the outline cannot honour: the text stays live. */
const UNSUPPORTED = ['writing-mode', 'dominant-baseline', 'alignment-baseline', 'textlength', 'font-variant'];

type Props = Map<string, string>;

/** The attributes of a start tag, names lower-cased. */
function attributes(tag: string): Props {
  const out: Props = new Map();
  for (const m of tag.matchAll(/\s([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out.set(m[1]!.toLowerCase(), m[2] ?? m[3] ?? '');
  return out;
}

/** Presentation properties of a tag: its attributes with its `style`
 *  declarations over them. */
function properties(tag: string): Props {
  const props = attributes(tag);
  const style = props.get('style');
  if (style) {
    for (const decl of style.split(';')) {
      const i = decl.indexOf(':');
      if (i > 0) props.set(decl.slice(0, i).trim().toLowerCase(), decl.slice(i + 1).trim());
    }
  }
  return props;
}

const decode = (s: string): string =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** A single length in user units (undefined: a list, a percentage or a
 *  unit the outline does not convert). */
function length(v: string | undefined, fallback?: number): number | undefined {
  if (v === undefined || v.trim() === '') return fallback;
  const m = /^\s*(-?[\d.]+(?:e[-+]?\d+)?)(px)?\s*$/i.exec(v);
  return m ? Number(m[1]) : undefined;
}

const unquote = (f: string): string => f.trim().replace(/^(['"])(.*)\1$/, '$2').trim();

/** The embedded face a font asks for, read once per plan. */
export interface OutlineOf {
  face: OutlineFace;
  slant: boolean;
}
const faces = new WeakMap<WordFontPlan, Map<string, OutlineOf | null>>();

function faceFor(plan: WordFontPlan, list: string, weight: string, style: string): OutlineOf | undefined {
  const families = new Set([...plan.map.keys()].map((k) => k.split('|')[0]!.toLowerCase()));
  const fam = list.split(',').map(unquote).find((f) => families.has(f.toLowerCase()));
  if (!fam) return undefined;
  const w = /^\d+$/.test(weight) ? Number(weight) : /bold/i.test(weight) ? 700 : 400;
  const italic = /italic|oblique/i.test(style);
  const ref = wordFontFor(plan, `${italic ? 'italic ' : ''}${w} 16px "${fam}"`);
  return outlineFaceOf(plan, ref.family, ref.bold, ref.italic);
}

/** The outlines of an embedded Word family's slot, read once per plan;
 *  `slant`: an italic the family lacks, drawn as its upright slanted (as
 *  Word does). */
export function outlineFaceOf(plan: WordFontPlan, family: string, bold: boolean, italic: boolean): OutlineOf | undefined {
  const key = `${family}|${bold}|${italic}`;
  let byPlan = faces.get(plan);
  if (!byPlan) faces.set(plan, (byPlan = new Map()));
  if (!byPlan.has(key)) {
    const slot = bold ? (italic ? 'boldItalic' : 'bold') : italic ? 'italic' : 'regular';
    const own = plan.faces.find((f) => f.family === family && f.slot === slot);
    const upright = own ?? plan.faces.find((f) => f.family === family && f.slot === (bold ? 'bold' : 'regular'));
    const face = upright ? readOutlineFace(upright.bytes) : undefined;
    byPlan.set(key, face ? { face, slant: !own && italic } : null);
  }
  return byPlan.get(key) ?? undefined;
}

/** The lean of a slanted upright (12 degrees). */
export const SLANT = Math.tan((12 * Math.PI) / 180);

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

/** Path data of one text, or undefined when it has to stay live. */
function outline(plan: WordFontPlan, props: Props, content: string): string | undefined {
  if (UNSUPPORTED.some((p) => props.has(p) && !/^(?:auto|normal|horizontal-tb|lr|lr-tb|alphabetic|baseline|initial)$/i.test(props.get(p)!))) return undefined;
  if (props.get('direction') === 'rtl' || RTL.test(content)) return undefined;
  const list = props.get('font-family');
  const size = length(props.get('font-size'), 16);
  const x = length(props.get('x'), 0);
  const y = length(props.get('y'), 0);
  const dx = length(props.get('dx'), 0);
  const dy = length(props.get('dy'), 0);
  const spacing = props.get('letter-spacing') === 'normal' ? 0 : length(props.get('letter-spacing'), 0);
  if (!list || size === undefined || x === undefined || y === undefined || dx === undefined || dy === undefined || spacing === undefined) return undefined;
  const found = faceFor(plan, list, props.get('font-weight') ?? '', props.get('font-style') ?? '');
  if (!found) return undefined;
  const { face, slant } = found;
  const k = size / face.unitsPerEm;
  const glyphs: number[] = [];
  for (const ch of content) {
    const gid = face.glyph(ch.codePointAt(0)!);
    if (gid === undefined) return undefined;
    glyphs.push(gid);
  }
  const width = glyphs.reduce((w, g) => w + face.advance(g) * k + spacing, 0) - (glyphs.length ? spacing : 0);
  const anchor = props.get('text-anchor');
  let pen = x + dx - (anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0);
  const base = y + dy;
  const skew = slant ? SLANT : 0;
  let d = '';
  for (const g of glyphs) {
    const at = pen;
    d += contoursPath(face.contours(g), (gx, gy) => [at + gx * k + gy * k * skew, base - gy * k]);
    pen += face.advance(g) * k + spacing;
  }
  return d;
}

/** Whether a `<style>` element of the SVG holds a rule other than
 *  `@font-face` (comments and CDATA markers aside). */
export function hasStyleRules(svg: string): boolean {
  for (const m of svg.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    const css = m[1]!
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@font-face\s*\{[^}]*\}/gi, '');
    if (css.includes('{')) return true;
  }
  return false;
}

const escapeAttr = (s: string): string => s.replace(/&(?![#\w]+;)/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The SVG with every `<text>` the embedded faces can draw replaced by its
 * glyph outlines (see the file comment). Text without child elements is
 * outlined; the rest is left as it is.
 */
export function svgTextAsPaths(svg: string, plan: WordFontPlan | undefined): string {
  if (!plan || !plan.faces.length || !/<text\b/i.test(svg) || hasStyleRules(svg)) return svg;
  const stack: Props[] = [];
  let out = '';
  let last = 0;
  const tagRe = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<(\/?)([A-Za-z][\w:.-]*)\b([^<>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(svg))) {
    const [whole, close, name, , selfClose] = m;
    if (!name) continue;
    const local = name.toLowerCase();
    if (close) {
      stack.pop();
      continue;
    }
    if (local === 'text' && !selfClose) {
      const end = svg.indexOf('</text', tagRe.lastIndex);
      if (end < 0) break;
      const inner = svg.slice(tagRe.lastIndex, end);
      const props = properties(whole);
      for (const p of INHERITED) {
        if (props.has(p)) continue;
        const v = [...stack].reverse().find((s) => s.has(p))?.get(p);
        if (v !== undefined) props.set(p, v);
      }
      const preserve = props.get('xml:space') === 'preserve';
      const text = /<(?!!\[CDATA\[)/.test(inner) ? undefined : decode(inner);
      const content = text === undefined ? undefined : preserve ? text.replace(/[\n\r\t]/g, ' ') : text.replace(/\s+/g, ' ').trim();
      const d = content ? outline(plan, props, content) : undefined;
      if (d !== undefined) {
        const closeAt = svg.indexOf('>', end) + 1;
        const kept = [...attributes(whole)].filter(([a]) => !TEXT_ONLY.has(a)).map(([a, v]) => ` ${a}="${escapeAttr(v)}"`).join('');
        out += `${svg.slice(last, m.index)}<g${kept}><title>${escapeAttr(content!)}</title><path d="${d}"/></g>`;
        last = closeAt;
        tagRe.lastIndex = closeAt;
        continue;
      }
      // Live text: its own tags (tspans) are walked like any other.
      stack.push(props);
      continue;
    }
    if (!selfClose) stack.push(properties(whole));
  }
  return last === 0 ? svg : out + svg.slice(last);
}
