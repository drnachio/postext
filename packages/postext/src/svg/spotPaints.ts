// Spot inks named in SVG markup (#1468): SVG 1.1 paints with an ICC colour
// after the sRGB one (`#e4002b icc-named-color(PANTONE, "PANTONE 185 C")`)
// and Postext's `data-spot="…"` attribute.
//
// Everything here reads the markup in one pass, character by character:
// paints are looked for only where SVG puts them (the paint attributes, a
// `style` attribute's declarations, the declarations of a `<style>` sheet),
// never in text content or comments, and no regular expression runs over
// foreign markup with a pattern that could backtrack.

/** The attributes and properties that hold a colour. */
const PAINT_PROPERTIES = new Set(['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color', 'solid-color']);

/** A spot ink an SVG names: its name, and the tint in percent when the SVG
 *  gives one. */
export interface SvgSpotInk {
  name: string;
  /** Percent of the ink, 0–100; unset: 100. */
  tint?: number;
}

/** A paint split at its ICC colour: the sRGB colour before it, and the ink
 *  an `icc-named-color` names. */
export interface IccPaint {
  /** The colour before the ICC colour (`#e4002b`), as written. */
  base: string;
  /** The ink of an `icc-named-color`; absent for an `icc-color`. */
  ink?: SvgSpotInk;
}

const isSpace = (c: string): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

/** A tint written `40%`, `40` or `0.4`, as a percent (0–100). */
export function inkTintPercent(raw: string): number | undefined {
  const t = raw.trim();
  const pct = t.endsWith('%');
  const v = Number(pct ? t.slice(0, -1) : t);
  if (t === '' || !Number.isFinite(v)) return undefined;
  return Math.max(0, Math.min(100, !pct && v <= 1 ? v * 100 : v));
}

/** The arguments of a function call, split at the commas outside quotes. */
function splitArgs(inner: string): string[] {
  const out: string[] = [];
  let quote = '';
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]!;
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ',') {
      out.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  out.push(inner.slice(start));
  return out.map((a) => a.trim());
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) return t.slice(1, -1);
  return t;
}

/**
 * A paint value split at its ICC colour (`#e4002b icc-named-color(profile,
 * "PANTONE 185 C"[, tint])` or `#e4002b icc-color(profile, …)`), or
 * undefined when it has none. Entities must be decoded first. Linear in the
 * length of the value.
 */
export function splitIccPaint(value: string): IccPaint | undefined {
  const v = value.trim();
  if (!v.endsWith(')')) return undefined;
  const lower = v.toLowerCase();
  let at = lower.indexOf('icc-named-color(');
  let named = true;
  if (at < 0) {
    at = lower.indexOf('icc-color(');
    named = false;
  }
  if (at <= 0 || !isSpace(v[at - 1]!)) return undefined;
  const base = v.slice(0, at).trim();
  if (!base) return undefined;
  if (!named) return { base };
  const inner = v.slice(at + 'icc-named-color('.length, -1);
  const args = splitArgs(inner);
  const name = unquote(args[1] ?? '').trim();
  if (!name) return { base };
  const tint = args[2] !== undefined ? inkTintPercent(args[2]) : undefined;
  return { base, ink: { name, ...(tint !== undefined ? { tint } : {}) } };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** XML entities decoded (the five named ones and numeric references). */
function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  let out = '';
  let i = 0;
  while (i < s.length) {
    const amp = s.indexOf('&', i);
    if (amp < 0) break;
    const semi = s.indexOf(';', amp);
    out += s.slice(i, amp);
    const body = semi > amp && semi - amp <= 12 ? s.slice(amp + 1, semi) : '';
    let ch: string | undefined;
    if (body.startsWith('#x') || body.startsWith('#X')) ch = codePoint(parseInt(body.slice(2), 16));
    else if (body.startsWith('#')) ch = codePoint(parseInt(body.slice(1), 10));
    else ch = ENTITIES[body];
    if (ch === undefined) {
      out += '&';
      i = amp + 1;
    } else {
      out += ch;
      i = semi + 1;
    }
  }
  return out + s.slice(i);
}

function codePoint(n: number): string | undefined {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : undefined;
}

/** What {@link scanSvgPaints} hands its visitor. */
interface PaintVisitor {
  /** A paint value (raw, entities not decoded): return a replacement to
   *  rewrite it, or undefined to keep it. `spot` is the `data-spot` of the
   *  element whose attribute holds it (none in a `<style>` sheet). */
  paint?: (raw: string, spot?: string) => string | undefined;
  /** An element's `data-spot` / `data-spot-tint` attributes, decoded. */
  dataSpot?: (name: string, tint: string | undefined) => void;
}

/** The declarations of a CSS text (a `style` attribute or a sheet), each
 *  paint value handed to `paint`; returns the text, rewritten where it
 *  answered. */
function scanDeclarations(css: string, paint: (raw: string) => string | undefined): string {
  let out = '';
  let start = 0;
  for (let i = 0; i <= css.length; i++) {
    const c = css[i];
    if (i < css.length && c !== ';' && c !== '{' && c !== '}') continue;
    const segment = css.slice(start, i);
    const colon = segment.indexOf(':');
    let rewritten = segment;
    if (colon > 0) {
      const prop = segment.slice(0, colon).trim().toLowerCase();
      if (PAINT_PROPERTIES.has(prop)) {
        const raw = segment.slice(colon + 1);
        const next = paint(raw);
        if (next !== undefined) rewritten = `${segment.slice(0, colon + 1)}${next}`;
      }
    }
    out += rewritten + (i < css.length ? c : '');
    start = i + 1;
  }
  return out;
}

/** The attributes of a start tag's body (after the name), in order, with
 *  where each value sits in `tag`. */
function attributes(tag: string, from: number): { name: string; value: string; start: number; end: number }[] {
  const out: { name: string; value: string; start: number; end: number }[] = [];
  let i = from;
  const n = tag.length;
  while (i < n) {
    while (i < n && (isSpace(tag[i]!) || tag[i] === '/')) i++;
    const nameStart = i;
    while (i < n && !isSpace(tag[i]!) && tag[i] !== '=' && tag[i] !== '/') i++;
    const name = tag.slice(nameStart, i);
    if (!name) {
      i++;
      continue;
    }
    while (i < n && isSpace(tag[i]!)) i++;
    if (tag[i] !== '=') continue;
    i++;
    while (i < n && isSpace(tag[i]!)) i++;
    const q = tag[i];
    if (q === '"' || q === "'") {
      const close = tag.indexOf(q, i + 1);
      const end = close < 0 ? n : close;
      out.push({ name, value: tag.slice(i + 1, end), start: i + 1, end });
      i = end + 1;
    } else {
      const start = i;
      while (i < n && !isSpace(tag[i]!)) i++;
      out.push({ name, value: tag.slice(start, i), start, end: i });
    }
  }
  return out;
}

/** Where a start tag that begins at `lt` ends (its `>`, outside quoted
 *  values), or -1. */
function tagEnd(text: string, lt: number): number {
  let quote = '';
  for (let i = lt + 1; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i;
  }
  return -1;
}

/**
 * Walk the paints of SVG markup — the paint attributes, `style` attributes
 * and `<style>` sheets — and the `data-spot` attributes, skipping comments,
 * processing instructions, declarations and text. Returns the markup with
 * the paints `visitor.paint` rewrote (the same string when it rewrote
 * none).
 */
export function scanSvgPaints(svg: string, visitor: PaintVisitor): string {
  let out = '';
  let copied = 0;
  let i = 0;
  const replace = (from: number, to: number, text: string) => {
    out += svg.slice(copied, from) + text;
    copied = to;
  };
  while (i < svg.length) {
    const lt = svg.indexOf('<', i);
    if (lt < 0) break;
    if (svg.startsWith('<!--', lt)) {
      const end = svg.indexOf('-->', lt + 4);
      i = end < 0 ? svg.length : end + 3;
      continue;
    }
    if (svg.startsWith('<![CDATA[', lt)) {
      const end = svg.indexOf(']]>', lt + 9);
      i = end < 0 ? svg.length : end + 3;
      continue;
    }
    if (svg[lt + 1] === '?' || svg[lt + 1] === '!' || svg[lt + 1] === '/') {
      const end = svg.indexOf('>', lt + 1);
      i = end < 0 ? svg.length : end + 1;
      continue;
    }
    const end = tagEnd(svg, lt);
    if (end < 0) break;
    let nameEnd = lt + 1;
    while (nameEnd < end && !isSpace(svg[nameEnd]!) && svg[nameEnd] !== '/') nameEnd++;
    const tagName = svg.slice(lt + 1, nameEnd);
    const local = tagName.slice(tagName.indexOf(':') + 1).toLowerCase();
    const tag = svg.slice(lt, end);
    let spotName: string | undefined;
    let spotTint: string | undefined;
    const attrs = attributes(tag, nameEnd - lt);
    for (const a of attrs) {
      const name = a.name.toLowerCase();
      if (name === 'data-spot') spotName = decodeEntities(a.value).trim();
      else if (name === 'data-spot-tint') spotTint = decodeEntities(a.value);
    }
    const paint = visitor.paint;
    for (const a of attrs) {
      const name = a.name.toLowerCase();
      if (paint && PAINT_PROPERTIES.has(name)) {
        const next = paint(a.value, spotName || undefined);
        if (next !== undefined) replace(lt + a.start, lt + a.end, next);
      } else if (paint && name === 'style' && a.value.includes(':')) {
        const next = scanDeclarations(a.value, (raw) => paint(raw, spotName || undefined));
        if (next !== a.value) replace(lt + a.start, lt + a.end, next);
      }
    }
    if (spotName && visitor.dataSpot) visitor.dataSpot(spotName, spotTint);
    i = end + 1;
    // A style sheet: its declarations, up to its end tag.
    if (local === 'style' && svg[end - 1] !== '/') {
      const close = svg.indexOf(`</${tagName}`, i);
      const sheetEnd = close < 0 ? svg.length : close;
      if (visitor.paint) {
        const sheet = svg.slice(i, sheetEnd);
        const next = scanDeclarations(sheet, visitor.paint);
        if (next !== sheet) replace(i, sheetEnd, next);
      }
      i = sheetEnd;
    }
  }
  if (copied === 0) return svg;
  return out + svg.slice(copied);
}

/** Whether markup might name an ink at all (a cheap test before a scan). */
function mayNameInks(svg: string): boolean {
  return /icc-|data-spot/i.test(svg);
}

/**
 * SVG markup with its ICC colours taken off, each paint left as the colour
 * before it: browsers paint `#e4002b icc-named-color(…)` black, as an
 * invalid paint, while the print PDF reads the ink from it
 * (`postext-pdf`'s SVG converter). For every screen output: the canvas, the
 * HTML and the EPUB. Only paints are rewritten (paint attributes, `style`
 * attributes, `<style>` declarations); text and comments are left as they
 * are. Markup without one is returned as is.
 */
export function screenSvgColors(svgText: string): string {
  if (!/icc-/i.test(svgText)) return svgText;
  return scanSvgPaints(svgText, {
    paint: (raw) => {
      if (!raw.toLowerCase().includes('icc-')) return undefined;
      const split = splitIccPaint(raw);
      if (!split) return undefined;
      // Keep the spacing around the value as written.
      const lead = raw.length - raw.trimStart().length;
      return `${raw.slice(0, lead)}${split.base}`;
    },
  });
}

/**
 * The spot inks an SVG names, each once, in the order they first appear:
 * `icc-named-color` paints and `data-spot` attributes. The preflight lists
 * them with the job's inks; a print PDF puts each on its own plate.
 */
export function svgSpotInks(svgText: string): SvgSpotInk[] {
  if (!mayNameInks(svgText)) return [];
  const seen = new Map<string, SvgSpotInk>();
  const add = (ink: SvgSpotInk) => {
    if (!seen.has(ink.name)) seen.set(ink.name, ink);
  };
  scanSvgPaints(svgText, {
    paint: (raw) => {
      if (raw.toLowerCase().includes('icc-named-color')) {
        const ink = splitIccPaint(decodeEntities(raw))?.ink;
        if (ink) add(ink);
      }
      return undefined;
    },
    dataSpot: (name, tint) => {
      const t = tint !== undefined ? inkTintPercent(tint) : undefined;
      add({ name, ...(t !== undefined ? { tint: t } : {}) });
    },
  });
  return [...seen.values()];
}
