// Inline the sandbox's custom fonts into SVG markup.
//
// The previews rasterise SVG resources through an `<img>` (canvas) or show
// them as `<img src>` (HTML), and an image document cannot see the page's
// `FontFace`s — so `<text font-family="Roboto Condensed">` would silently fall
// back to a system face. Before handing an SVG to an image, this helper adds
// a `<style>` with one `@font-face` per uploaded / preset variant of every
// custom family the markup names, its bytes embedded as a data URI. Families
// the sandbox does not hold (system or Google-hosted faces) are left alone.
// The PDF backend never sees this: it reads the stored bytes and sets text in
// the same families through its own font provider.

import type { CustomFontFamily, CustomFontFormat } from 'postext';
import { getCustomFontFamily } from './fontLoader';
import { getFontFile } from '../storage/fontStorage';

/** A variant ready to embed. */
export interface InlineFace {
  weight: number;
  style: 'normal' | 'italic';
  format: CustomFontFormat;
  /** Base64 of the font file. */
  base64: string;
}

const FAMILY_ATTR_RE = /font-family\s*(?:=\s*(["'])([^"']*)\1|:\s*([^;}]+))/gi;

/** Every family name an SVG's `font-family` attributes / declarations mention,
 *  quotes stripped, in first-seen order. Pure. */
export function svgFontFamilies(svgText: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of svgText.matchAll(FAMILY_ATTR_RE)) {
    const list = (m[2] ?? m[3] ?? '').trim();
    for (const raw of list.split(',')) {
      const name = raw.trim().replace(/^['"]|['"]$/g, '').trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
  }
  return out;
}

const MIME: Record<CustomFontFormat, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

/** `@font-face` rules for one family. Pure. */
export function fontFaceCss(family: string, faces: InlineFace[]): string {
  const name = family.replace(/["\\]/g, '');
  return faces
    .map((f) => `@font-face{font-family:"${name}";font-weight:${f.weight};font-style:${f.style};src:url(data:${MIME[f.format]};base64,${f.base64}) format("${f.format === 'ttf' ? 'truetype' : f.format === 'otf' ? 'opentype' : f.format}")}`)
    .join('');
}

/** Insert `css` as a `<style>` right after the root `<svg …>` start tag. Pure;
 *  returns the markup unchanged when no root tag is found. */
export function injectSvgStyle(svgText: string, css: string): string {
  if (!css) return svgText;
  const m = /<svg\b[^>]*?(\/?)>/i.exec(svgText);
  if (!m) return svgText;
  if (m[1] === '/') return svgText; // an empty self-closing root has no text
  const at = m.index + m[0].length;
  const cdata = `<![CDATA[${css.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
  return `${svgText.slice(0, at)}<style type="text/css">${cdata}</style>${svgText.slice(at)}`;
}

/** Resolve a family's embeddable faces; `null` when the sandbox does not hold
 *  the family as a custom font. */
export type FaceLookup = (family: string) => Promise<InlineFace[] | null>;

/** Inline the faces of every custom family the SVG names. Pure given the
 *  lookup, so it can be exercised without storage. */
export async function inlineSvgFontsWith(svgText: string, lookup: FaceLookup): Promise<string> {
  const families = svgFontFamilies(svgText);
  if (families.length === 0) return svgText;
  let css = '';
  for (const family of families) {
    const faces = await lookup(family).catch(() => null);
    if (faces && faces.length > 0) css += fontFaceCss(family, faces);
  }
  return injectSvgStyle(svgText, css);
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

/** family name → faces, keyed by the variant file ids so a re-uploaded
 *  family is re-encoded. */
const faceCache = new Map<string, { key: string; faces: Promise<InlineFace[]> }>();

function facesOf(family: CustomFontFamily): Promise<InlineFace[]> {
  const key = family.variants.map((v) => `${v.fileId}|${v.weight}|${v.style}`).join(',');
  const cached = faceCache.get(family.name);
  if (cached && cached.key === key) return cached.faces;
  const faces = Promise.all(
    family.variants.map(async (v): Promise<InlineFace | null> => {
      const file = await getFontFile(v.fileId).catch(() => null);
      if (!file || v.format === 'woff') return null;
      return { weight: v.weight, style: v.style, format: v.format, base64: toBase64(file.buffer) };
    }),
  ).then((list) => list.filter((f): f is InlineFace => f !== null));
  faceCache.set(family.name, { key, faces });
  return faces;
}

/** Inline the sandbox's custom fonts into `svgText` (see the module comment). */
export function inlineSvgFonts(svgText: string): Promise<string> {
  return inlineSvgFontsWith(svgText, async (family) => {
    const custom = getCustomFontFamily(family);
    return custom ? facesOf(custom) : null;
  });
}
