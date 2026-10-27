// The faces the page loaded and the characters no loaded face holds (C25, C36).
import { walkPainted } from './paint.js';
import { pick, engineOf, pagesOf } from './record.js';

// ─── Small helpers ──────────────────────────────────────────────────────────

export function hexOf(color) {
  if (!color) return '';
  return String(typeof color === 'string' ? color : color.hex ?? '').toUpperCase();
}

/** A config value as JSON: functions dropped, maps as objects, bytes as a length. */
export function plain(value) {
  const path = new Set();   // ancestors only: shared objects are fine, cycles are cut
  const walk = (v) => {
    if (v === null || typeof v !== 'object') return typeof v === 'function' || typeof v === 'symbol' ? undefined : v;
    if (path.has(v)) return undefined;
    if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return { bytes: v.byteLength };
    if (typeof Blob !== 'undefined' && v instanceof Blob) return { bytes: v.size };
    path.add(v);
    let out;
    if (v instanceof Map) out = Object.fromEntries([...v].map(([k, x]) => [String(k), walk(x)]));
    else if (Array.isArray(v)) out = v.map(walk);
    else {
      out = {};
      for (const [k, x] of Object.entries(v)) {
        const w = walk(x);
        if (w !== undefined) out[k] = w;
      }
    }
    path.delete(v);
    return out;
  };
  return walk(value);
}

export function lineOf(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** '700 37.5px "Open Sans"' → { family, weight, style, px }. */
export function parseFont(font) {
  const m = /^(?:(italic|oblique)\s+)?(?:small-caps\s+)?(?:(\d+|bold|normal)\s+)?([\d.]+)px\s+(.+)$/.exec(String(font).trim());
  if (!m) return null;
  const weight = m[2] === 'bold' ? 700 : !m[2] || m[2] === 'normal' ? 400 : Number(m[2]);
  return { family: m[4].replace(/^["']|["']$/g, ''), weight, style: m[1] ? 'italic' : 'normal', px: Number(m[3]) };
}

export function loadedFaces() {
  return [...document.fonts].filter((face) => face.status === 'loaded').map((face) => ({
    family: face.family.replace(/^["']|["']$/g, ''), weight: face.weight, style: face.style,
  }));
}

/** The code-point ranges of a FontFace's `unicodeRange` ("U+4E00-4FFF, U+3001"). */
export function rangesOf(unicodeRange) {
  return String(unicodeRange ?? 'U+0-10FFFF').split(',').map((part) => {
    const [lo, hi = lo] = part.trim().replace(/^U\+/i, '').split('-');
    if (lo.includes('?')) return [parseInt(lo.replace(/\?/g, '0'), 16), parseInt(lo.replace(/\?/g, 'F'), 16)];
    return [parseInt(lo, 16), parseInt(hi, 16)];
  });
}

/** Families served by unicode-range slices that reach the Han ideographs
 *  or the hiragana (a kana-only Japanese display face has no kanji; the cjk
 *  kit block adds every file of such a face, loaded or not) or the
 *  Arabic letters (the arabic block adds each face's arabic file next to
 *  the latin ones loadFonts adds), with the code points their files cover:
 *  the PDF's cjkPdfProvider and arabicPdfProvider hand over whichever of
 *  those files the pages need. */
export function slicedFamilies() {
  const out = new Map();
  for (const face of document.fonts) {
    const family = face.family.replace(/^["']|["']$/g, '');
    const ranges = rangesOf(face.unicodeRange);
    const list = out.get(family) ?? [];
    list.push(...ranges);
    out.set(family, list);
  }
  for (const [family, ranges] of out) {
    const reaches = (cp) => ranges.some(([lo, hi]) => lo <= cp && hi >= cp);
    if (!(reaches(0x4e00) || reaches(0x3042) || reaches(0x0627)) || ranges.some(([lo, hi]) => lo === 0 && hi >= 0x10ffff)) {
      out.delete(family);
    }
  }
  return out;
}

/** Families with loaded faces that declare a unicode-range of their own
 *  (Fontsource's latin and latin-ext files, as loadFonts adds them), with
 *  the code points those files cover. A face with no range (one built from
 *  a recipe's assets) is left out: the PDF provider decides what it holds. */
export function rangedFamilies() {
  const out = new Map();
  for (const face of document.fonts) {
    if (face.status !== 'loaded') continue;
    const ranges = rangesOf(face.unicodeRange);
    if (ranges.some(([lo, hi]) => lo === 0 && hi >= 0x10ffff)) continue;
    const family = face.family.replace(/^["']|["']$/g, '');
    out.set(family, [...(out.get(family) ?? []), ...ranges]);
  }
  return out;
}

/** A loaded FontFace covers exactly this family, weight and style. */
export function hasFace(faces, family, weight, style) {
  return faces.some((face) => {
    if (face.family !== family || face.style !== style) return false;
    const [low, high = low] = String(face.weight).split(' ').map(Number);
    return weight >= low && weight <= high;
  });
}

/** Dimension → pt (em against `basePt`). */
export function dimPt(dim, dpi, basePt = 0) {
  if (!dim) return 0;
  const v = Number(dim.value);
  switch (dim.unit) {
    case 'pt': return v;
    case 'mm': return (v / 25.4) * 72;
    case 'cm': return (v / 2.54) * 72;
    case 'in': return v * 72;
    case 'px': return (v * 72) / dpi;
    case 'em': case 'rem': return v * basePt;
    default: return v;
  }
}

// ─── Walking what the renderer paints ───────────────────────────────────────

/** A block's font set: prefix '' → fontString…, 'caption' → captionFontString… */
export function fontsOf(owner, prefix) {
  const key = (name) => (prefix ? prefix + name : name.charAt(0).toLowerCase() + name.slice(1));
  const n = owner[key('FontString')];
  const b = owner[key('BoldFontString')] ?? n;
  const i = owner[key('ItalicFontString')] ?? n;
  return { n, b, i, bi: owner[key('BoldItalicFontString')] ?? b };
}

// ─── Characters no loaded face holds (C36) ──────────────────────────────────

/**
 * A TrueType font in which every code point maps to one empty glyph
 * `advance` units wide, 1000 units to the em (a cmap of format 13: one
 * group, U+0000 to U+10FFFF). Named after a family in a font list, it takes
 * every character the family's loaded files do not hold, and the width says
 * so: no system font is asked. Built here, so the check needs no file and
 * no network.
 */
export function blankFont(advance) {
  const u16 = (n) => [(n >> 8) & 255, n & 255];
  const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const zeros = (n) => new Array(n).fill(0);
  const tag = (s) => [...s].map((c) => c.charCodeAt(0));
  const names = [[1, 'Cookbook Blank'], [2, 'Regular'], [3, `Cookbook Blank ${advance}`], [4, 'Cookbook Blank'],
    [5, 'Version 1.0'], [6, 'CookbookBlank']];
  const strings = names.map(([, s]) => [...s].flatMap((c) => u16(c.charCodeAt(0))));
  let at = 0;
  const records = names.flatMap(([id], i) => {
    const record = [...u16(3), ...u16(1), ...u16(0x409), ...u16(id), ...u16(strings[i].length), ...u16(at)];
    at += strings[i].length;
    return record;
  });
  const tables = {
    // The .notdef glyph is a small triangle: a table of no bytes is refused.
    glyf: [...u16(1), ...u16(0), ...u16(0), ...u16(10), ...u16(10), ...u16(2), ...u16(0), 0x31, 0x33, 0x27, 10, 10, 10],
    loca: [...u16(0), ...u16(10), ...u16(10)],
    cmap: [...u16(0), ...u16(1), ...u16(3), ...u16(10), ...u32(12),
      ...u16(13), ...u16(0), ...u32(28), ...u32(0), ...u32(1), ...u32(0), ...u32(0x10ffff), ...u32(1)],
    head: [...u32(0x00010000), ...u32(0x00010000), ...u32(0), ...u32(0x5f0f3cf5), ...u16(3), ...u16(1000),
      ...zeros(16), ...u16(0), ...u16(0), ...u16(10), ...u16(10), ...u16(0), ...u16(8), ...u16(2), ...u16(0), ...u16(0)],
    hhea: [...u32(0x00010000), ...u16(800), ...u16(0x10000 - 200), ...u16(0), ...u16(advance), ...zeros(6),
      ...u16(1), ...zeros(14), ...u16(2)],
    hmtx: [...u16(advance), ...u16(0), ...u16(advance), ...u16(0)],
    maxp: [...u32(0x00010000), ...u16(2), ...u16(3), ...u16(1), ...zeros(4), ...u16(1), ...zeros(16)],
    name: [...u16(0), ...u16(names.length), ...u16(6 + 12 * names.length), ...records, ...strings.flat()],
    'OS/2': [...u16(4), ...u16(advance), ...u16(400), ...u16(5), ...zeros(50), ...tag('PTXT'), ...u16(0x40),
      ...u16(0x20), ...u16(0xffff), ...u16(800), ...u16(0x10000 - 200), ...u16(0), ...u16(800), ...u16(200), ...zeros(18)],
    post: [...u32(0x00030000), ...zeros(4), ...u16(0x10000 - 100), ...u16(50), ...u32(1), ...zeros(16)],
  };
  const tags = Object.keys(tables).sort();
  const sum = (bytes) => {
    let total = 0;
    for (let i = 0; i < bytes.length; i += 4) {
      total = (total + (((bytes[i] ?? 0) << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0))) >>> 0;
    }
    return total;
  };
  const out = [...u32(0x00010000), ...u16(tags.length), ...u16(128), ...u16(3), ...u16(tags.length * 16 - 128)];
  let offset = 12 + 16 * tags.length;
  const body = [];
  let headAt = 0;
  for (const name of tags) {
    const bytes = tables[name];
    if (name === 'head') headAt = offset;
    out.push(...tag(name), ...u32(sum(bytes)), ...u32(offset), ...u32(bytes.length));
    body.push(...bytes, ...zeros((4 - (bytes.length % 4)) % 4));
    offset = 12 + 16 * tags.length + body.length;
  }
  out.push(...body);
  const adjust = (0xb1b0afba - sum(out)) >>> 0;
  out.splice(headAt + 8, 4, ...u32(adjust));
  return new Uint8Array(out);
}

/** Calls visit(font, text, where) for the text {@link walkPainted} does not
 *  reach: whatever carries a font of its own beside its text (a drop cap, a
 *  ruby reading, the kanbun marks, a warichu note, a balloon's lettering,
 *  a design line set in runs). */
function walkOwnFonts(pages, visit) {
  const TEXT_KEYS = ['text', 'upper', 'lower', 'kaeri', 'okuri'];
  for (const { page, n } of pages) {
    const seen = new WeakSet();
    const walk = (node) => {
      if (!node || typeof node !== 'object' || seen.has(node) || ArrayBuffer.isView(node)) return;
      seen.add(node);
      if (Array.isArray(node)) {
        if (typeof node[0] !== 'number') for (const item of node) walk(item);
        return;
      }
      if (typeof node.fontString === 'string' && !node.hidden) {
        for (const key of TEXT_KEYS) if (typeof node[key] === 'string' && node[key].trim()) visit(node.fontString, node[key], `p${n}`);
        for (const line of Array.isArray(node.lines) ? node.lines : []) {
          if (typeof line?.text === 'string' && line.text.trim() && !line.segments?.length && !line.runs?.length) visit(node.fontString, line.text, `p${n}`);
        }
      }
      for (const [key, value] of Object.entries(node)) {
        if (value && typeof value === 'object' && !/^(sourceMap|mathRender|attrSources)$/.test(key)) walk(value);
      }
    };
    walk(page);
  }
}

/** The two blank fonts and their advances, in units of 1000 to the em. */
const BLANK_FONTS = [['cookbook-blank-a', 3000], ['cookbook-blank-b', 5000]];

/** What no glyph is asked for: the word space and the line ends, controls,
 *  joiners, variation selectors. The other spaces (no-break, thin, figure,
 *  ideographic) stay: each is a character a face holds or does not. */
const UNPRINTED = /[\t\n\v\f\r \u2028\u2029\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u;

/** The characters each face sets on `pages` ([{ page, n }], or documents,
 *  whose pages are then counted from each one's first):
 *  [{ family, weight, style, chars: [[ch, where], …] }], `where` the first
 *  place a character stands ("p2 paragraph"), a combining mark kept with
 *  the letter before it ("e\u0301"). `skip`: the engine's
 *  placeholder characters (a formula, a swatch, a chip). */
export function textOfFaces(pages, skip = new Set()) {
  const faces = new Map();
  const note = (font, text, where) => {
    const face = font ? parseFont(font) : null;
    if (!face) return;
    const key = `${face.family}|${face.weight}|${face.style}`;
    const entry = faces.get(key) ?? { family: face.family, weight: face.weight, style: face.style, chars: new Map() };
    // A combining mark is kept with the letter it stands on.
    let base = '';
    for (const ch of text) {
      if (skip.has(ch) || UNPRINTED.test(ch)) {
        if (/\s/.test(ch)) base = '';
        continue;
      }
      const mark = /\p{M}/u.test(ch);
      if (!mark) base = ch;
      else if (!base) continue;
      const set = mark ? base + ch : ch;
      if (!entry.chars.has(set)) entry.chars.set(set, where);
    }
    faces.set(key, entry);
  };
  const list = pages.flatMap((p) => (Array.isArray(p.pages) ? p.pages.map((page) => ({ page, n: page.index + 1 })) : [p]));
  walkPainted(list, note);
  walkOwnFonts(list, note);
  return [...faces.values()]
    .map((face) => ({ ...face, chars: [...face.chars] }))
    .sort((a, b) => `${a.family}${a.weight}${a.style}`.localeCompare(`${b.family}${b.weight}${b.style}`));
}

/**
 * Of the characters {@link textOfFaces} lists, those no loaded file of
 * their own family holds: the browser sets each in a font of the system,
 * which is another on every machine, so the lines a reader gets are not
 * the published ones. A file's `unicode-range` does not answer this (it
 * says what the file may be asked for, not what it holds), so the browser
 * is asked: each character is measured in its face followed by a blank
 * font, twice, with blank fonts of two advances; a character whose width
 * follows the blank font is in no file of the family. A combining mark is
 * measured on the letter it stands on (a mark alone has no advance in any
 * font) and counted when that letter is in the family and the pair is not.
 * A character of emoji presentation is counted when the system's colour
 * font takes it whatever the family holds. Runs in a page or in a worker,
 * on the font set of either.
 * Resolves to [{ family, weight, style, chars: [{ ch, code, where }] }],
 * the faces with nothing missing left out.
 */
export async function charsInNoFace(faces) {
  const fonts = globalThis.document?.fonts ?? globalThis.fonts;
  // The browser's own constructor: the capture's recorder keeps a face
  // built from bytes for the Sandbox bundle, and these are not the recipe's.
  const Face = FontFace.prototype.constructor;
  const blanks = BLANK_FONTS.map(([name, advance]) => new Face(name, blankFont(advance)));
  await Promise.all(blanks.map((face) => face.load()));
  for (const face of blanks) fonts.add(face);
  const out = [];
  try {
    const canvas = globalThis.document ? document.createElement('canvas') : new OffscreenCanvas(1, 1);
    const ctx = canvas.getContext('2d');
    const codeOf = (ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
    for (const face of faces) {
      const head = `${face.style === 'italic' ? 'italic ' : ''}${face.weight} 100px "${face.family}"`;
      // The files of a family served in slices load when a text asks for them.
      await fonts.load(head, face.chars.map(([ch]) => ch).join('')).catch(() => {});
      // A text set wholly in the family's files is as wide before one
      // blank font as before the other.
      const beyond = (text) => {
        const [a, b] = BLANK_FONTS.map(([name]) => {
          ctx.font = `${head}, "${name}"`;
          return ctx.measureText(text).width;
        });
        return Math.abs(a - b) > 0.001;
      };
      // A character of emoji presentation goes to the system's colour
      // font before any face of the list that is not one: it is then as
      // wide after the family as with no family at all.
      const systemEmoji = (ch) => {
        if (!/\p{Emoji_Presentation}/u.test(ch)) return false;
        ctx.font = `${head}, "${BLANK_FONTS[0][0]}"`;
        const after = ctx.measureText(ch).width;
        ctx.font = `100px "${BLANK_FONTS[0][0]}"`;
        return Math.abs(after - ctx.measureText(ch).width) < 0.001;
      };
      const missing = [];
      const listed = new Set();
      for (const [set, where] of face.chars) {
        const [first, mark] = [...set];
        const ch = mark ?? first;
        if (listed.has(ch)) continue;
        if (mark === undefined ? beyond(first) || systemEmoji(first) : !beyond(first) && beyond(set)) {
          listed.add(ch);
          missing.push({ ch, code: codeOf(ch), where });
        }
      }
      if (missing.length) out.push({ family: face.family, weight: face.weight, style: face.style, chars: missing });
    }
  } finally {
    for (const face of blanks) fonts.delete(face);
  }
  return out;
}

/** {@link textOfFaces} for the pages of the capture's build. */
export function paintedFaces({ select = 'last' } = {}) {
  const build = pick(select);
  if (!build || !build.docs?.length) return [];
  const engine = engineOf(build);
  const skip = new Set([engine?.MATH_PLACEHOLDER, engine?.SWATCH_PLACEHOLDER, engine?.CHIP_PLACEHOLDER, '￼'].filter(Boolean));
  return textOfFaces(pagesOf(build), skip);
}

/** {@link charsInNoFace} for the pages of the capture's build (C36). */
export function systemFontChars({ select = 'last' } = {}) {
  return charsInNoFace(paintedFaces({ select }));
}
