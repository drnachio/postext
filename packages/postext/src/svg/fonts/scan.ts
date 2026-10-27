// Scanning an SVG for the font faces its text asks for (attributes,
// style sheets, the font shorthand).
import type { SvgFontFormat, SvgFontStyle, SvgFontRequest } from './types.js';

export const ALL_FORMATS: readonly SvgFontFormat[] = ['woff2', 'woff', 'ttf', 'otf'];

/** Generic CSS families, which never name a loadable face. */
const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
  'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', 'revert', 'default',
]);

/** Elements whose character data is never drawn as text. */
const NON_TEXT = new Set(['title', 'desc', 'metadata', 'script', 'style']);

// ------------------------------------------------------------ parsing

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

function charOf(cp: number): string {
  return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
}

function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === '#') return charOf(body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10));
    return ENTITIES[body] ?? m;
  });
}

function localName(name: string): string {
  const i = name.indexOf(':');
  return (i < 0 ? name : name.slice(i + 1)).toLowerCase();
}

/** A `font-family` list as names, quotes stripped, generic families and
 *  CSS-wide keywords left out. */
export function parseFontFamilyList(value: string): string[] {
  const out: string[] = [];
  for (const raw of value.split(',')) {
    const name = raw.trim().replace(/^(['"])(.*)\1$/, '$2').trim();
    if (name && !GENERIC_FAMILIES.has(name.toLowerCase()) && !out.includes(name)) out.push(name);
  }
  return out;
}

function parseWeight(value: string, inherited: number): number | null {
  const v = value.trim().toLowerCase();
  if (v === 'normal') return 400;
  if (v === 'bold') return 700;
  if (v === 'bolder') return inherited < 400 ? 400 : inherited < 600 ? 700 : 900;
  if (v === 'lighter') return inherited < 600 ? 100 : inherited < 800 ? 400 : 700;
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 1000 ? n : null;
}

function parseStyle(value: string): SvgFontStyle | null {
  const v = value.trim().toLowerCase();
  if (v === 'normal') return 'normal';
  if (v.startsWith('italic') || v.startsWith('oblique')) return 'italic';
  return null;
}

/** Font properties in force on an element. */
interface FontContext {
  families: string[];
  weight: number;
  style: SvgFontStyle;
}

/** CSS declarations of a `style` attribute or rule body, lower-cased names. */
function declarations(css: string): [string, string][] {
  const out: [string, string][] = [];
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const name = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).replace(/!important\s*$/i, '').trim();
    if (name) out.push([name, value]);
  }
  return out;
}

/** The `font` shorthand: `[style] [variant] [weight] size[/line-height]
 *  family-list`. */
function parseFontShorthand(value: string, ctx: FontContext): Partial<FontContext> | null {
  const m = /^(.*?)(?:^|\s)(?:[\d.]+(?:px|pt|em|rem|%|ex|ch|mm|cm|in|pc|q|vh|vw)|0|xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)(?:\s*\/\s*\S+)?\s+(.+)$/i.exec(value.trim());
  if (!m) return null;
  const out: Partial<FontContext> = { families: parseFontFamilyList(m[2]!), weight: 400, style: 'normal' };
  for (const word of m[1]!.trim().split(/\s+/)) {
    if (!word) continue;
    const style = parseStyle(word);
    if (style && word.toLowerCase() !== 'normal') out.style = style;
    const weight = parseWeight(word, ctx.weight);
    if (weight !== null && word.toLowerCase() !== 'normal') out.weight = weight;
  }
  return out;
}

/** Apply font properties (attributes, then `style`, which wins) to an
 *  inherited context. */
function applyFontProps(ctx: FontContext, props: Iterable<[string, string]>): FontContext {
  let next = ctx;
  for (const [name, value] of props) {
    if (name === 'font-family') {
      next = { ...next, families: parseFontFamilyList(value) };
    } else if (name === 'font-weight') {
      const w = parseWeight(value, next.weight);
      if (w !== null) next = { ...next, weight: w };
    } else if (name === 'font-style') {
      const s = parseStyle(value);
      if (s) next = { ...next, style: s };
    } else if (name === 'font') {
      const f = parseFontShorthand(value, next);
      if (f) next = { ...next, ...f };
    }
  }
  return next;
}

/** A start tag's attributes. */
function parseAttributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const re = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (const m of tag.matchAll(re)) attrs.set(m[1]!.toLowerCase(), decodeEntities(m[3] ?? m[4] ?? ''));
  return attrs;
}

/** What one pass over the markup finds. */
export interface SvgFontScan {
  requests: SvgFontRequest[];
  /** Families the SVG declares in its own `@font-face` rules (lower case). */
  declared: Set<string>;
}

/** Strip CSS comments. */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The rules of a style sheet, `@font-face` ones apart: top-level
 *  `prelude { body }` pairs (an at-rule block such as `@media` is opened
 *  and its rules read in turn). */
function cssRules(css: string): { prelude: string; body: string }[] {
  const out: { prelude: string; body: string }[] = [];
  const text = stripCssComments(css);
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const prelude = text.slice(i, open).trim();
    // The matching brace, counting nested blocks.
    let depth = 1;
    let j = open + 1;
    for (; j < text.length && depth > 0; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
    }
    const body = text.slice(open + 1, j - 1);
    if (/^@(media|supports|layer|container)\b/i.test(prelude)) out.push(...cssRules(body));
    else out.push({ prelude, body });
    i = j;
  }
  return out;
}

/** Whether a style sheet holds nothing but `@font-face` rules (comments
 *  and whitespace aside): the faces an author embedded, which change no
 *  geometry. */
export function isFontFaceOnlyStyleSheet(css: string): boolean {
  const text = stripCssComments(css.replace(/<!\[CDATA\[|\]\]>/g, ''));
  if (text.trim() === '') return true;
  const rules = cssRules(text);
  if (rules.length === 0) return false;
  // Whatever lies outside the rule blocks must be blank.
  const outside = text.replace(/\{[^{}]*\}/g, '').replace(/@font-face/gi, '');
  return outside.trim() === '' && rules.every((r) => /^@font-face$/i.test(r.prelude));
}

export function scanSvgFonts(svgText: string): SvgFontScan {
  const byKey = new Map<string, SvgFontRequest>();
  const order: SvgFontRequest[] = [];
  const declared = new Set<string>();
  const sheets: string[] = [];
  const allCodePoints = new Set<number>([0x20]);

  const note = (ctx: FontContext, text: string): void => {
    if (ctx.families.length === 0) return;
    const key = `${ctx.families.join('\u0000')}|${ctx.weight}|${ctx.style}`;
    let req = byKey.get(key);
    if (!req) {
      req = { families: [...ctx.families], weight: ctx.weight, style: ctx.style, codePoints: new Set([0x20]) };
      byKey.set(key, req);
      order.push(req);
    }
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (cp > 0x20) req.codePoints.add(cp);
    }
  };

  const root: FontContext = { families: [], weight: 400, style: 'normal' };
  const stack: { name: string; ctx: FontContext; inText: boolean; nonText: boolean }[] = [];
  const top = () => stack[stack.length - 1];
  const onText = (raw: string, isCdata: boolean): void => {
    const t = top();
    if (!t) return;
    const text = isCdata ? raw : decodeEntities(raw);
    if (t.name === 'style') {
      sheets.push(text);
      return;
    }
    if (t.nonText || !t.inText) return;
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (cp > 0x20) allCodePoints.add(cp);
    }
    note(t.ctx, text);
  };

  const n = svgText.length;
  let i = 0;
  while (i < n) {
    const lt = svgText.indexOf('<', i);
    if (lt < 0) {
      onText(svgText.slice(i), false);
      break;
    }
    if (lt > i) onText(svgText.slice(i, lt), false);
    i = lt;
    if (svgText.startsWith('<!--', i)) {
      const end = svgText.indexOf('-->', i + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (svgText.startsWith('<![CDATA[', i)) {
      const end = svgText.indexOf(']]>', i + 9);
      onText(svgText.slice(i + 9, end < 0 ? n : end), true);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (svgText.startsWith('<?', i)) {
      const end = svgText.indexOf('?>', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (svgText.startsWith('<!', i)) {
      let depth = 0;
      let j = i + 2;
      for (; j < n; j++) {
        const ch = svgText[j];
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === '>' && depth === 0) break;
      }
      i = j + 1;
      continue;
    }
    if (svgText.startsWith('</', i)) {
      const end = svgText.indexOf('>', i + 2);
      const name = localName(svgText.slice(i + 2, end < 0 ? n : end).trim());
      // Pop to the matching element (tolerates sloppy markup).
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k]!.name === name) {
          stack.length = k;
          break;
        }
      }
      i = end < 0 ? n : end + 1;
      continue;
    }
    // A start tag: find its end outside quoted attribute values.
    let j = i + 1;
    let quote: string | null = null;
    for (; j < n; j++) {
      const ch = svgText[j]!;
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
    }
    const tag = svgText.slice(i + 1, j);
    i = j + 1;
    const selfClosing = tag.endsWith('/');
    const nameMatch = /^([^\s/>]+)/.exec(tag);
    if (!nameMatch) continue;
    const name = localName(nameMatch[1]!);
    const parent = top();
    const attrs = parseAttributes(tag);
    const props: [string, string][] = [];
    for (const key of ['font-family', 'font-weight', 'font-style']) {
      const v = attrs.get(key);
      if (v !== undefined) props.push([key, v]);
    }
    const style = attrs.get('style');
    if (style) props.push(...declarations(style));
    const ctx = applyFontProps(parent?.ctx ?? root, props);
    const entry = {
      name,
      ctx,
      inText: (parent?.inText ?? false) || name === 'text',
      nonText: (parent?.nonText ?? false) || NON_TEXT.has(name),
    };
    if (!selfClosing) stack.push(entry);
  }

  // Style sheets: `@font-face` rules declare families; a rule that names a
  // family is taken to style the SVG's text (its selector is not matched).
  for (const sheet of sheets) {
    for (const rule of cssRules(sheet)) {
      const decls = declarations(rule.body);
      if (/^@font-face$/i.test(rule.prelude)) {
        for (const [name, value] of decls) {
          if (name === 'font-family') for (const f of parseFontFamilyList(value)) declared.add(f.toLowerCase());
        }
        continue;
      }
      if (rule.prelude.startsWith('@')) continue;
      const ctx = applyFontProps(root, decls);
      if (ctx.families.length > 0 && decls.some(([k]) => k === 'font-family' || k === 'font')) {
        note(ctx, String.fromCodePoint(...allCodePoints));
      }
    }
  }
  return { requests: order, declared };
}

/** Every `(families, weight, style)` the SVG's text runs ask for, with
 *  the characters each sets, from `font-family`, `font-weight`,
 *  `font-style` and `font` in attributes, `style` attributes and inherited
 *  from enclosing elements. A `<style>` rule that names a family counts
 *  too (with all the SVG's characters: its selector is not matched).
 *  Generic families are ignored, and so is text in `<title>`, `<desc>`
 *  and the like. Pure. */
export function svgFontRequests(svgText: string): SvgFontRequest[] {
  return scanSvgFonts(svgText).requests;
}

/** Families the SVG declares in its own `@font-face` rules, as written. */
export function svgDeclaredFontFamilies(svgText: string): string[] {
  return [...scanSvgFonts(svgText).declared];
}
