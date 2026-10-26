// Pure helpers for the SVG source editor and the SVG text hit-test. No DOM:
// everything here works on the SVG source string and on a prebuilt
// {@link SvgTextIndex} (produced by `svgTextIndex.ts`, which does need a
// browser). Kept separate so the scanner, the entity codec and the geometry
// lookups can be unit-tested in node.

/** A half-open `[start, end)` range of the SVG source. */
export interface SourceRange {
  start: number;
  end: number;
}

/**
 * Scan an SVG source and return the raw ranges of every text node that sits
 * inside a `<text>` element (at any depth — `<tspan>` children included). The
 * scanner is a minimal XML tokenizer aware of comments, CDATA sections,
 * processing instructions, doctypes and quoted attribute values, so a `<` in
 * an attribute or a `<text>` mentioned in a comment never confuses it.
 * Whitespace-only text nodes are reported too: they are real DOM nodes and
 * the DOM index pairs ranges with nodes in document order. CDATA sections are
 * not text nodes for this purpose and are skipped.
 */
export function scanSvgTextNodeRanges(source: string): SourceRange[] {
  const out: SourceRange[] = [];
  const stack: string[] = [];
  let textDepth = 0;
  let i = 0;
  const n = source.length;
  let textStart = -1;

  const flushText = (end: number) => {
    if (textStart >= 0 && textDepth > 0 && end > textStart) {
      out.push({ start: textStart, end });
    }
    textStart = -1;
  };

  while (i < n) {
    if (source[i] !== '<') {
      if (textStart < 0) textStart = i;
      i++;
      continue;
    }
    // A markup construct starts here: close any pending text run.
    flushText(i);
    if (source.startsWith('<!--', i)) {
      const close = source.indexOf('-->', i + 4);
      i = close < 0 ? n : close + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', i)) {
      const close = source.indexOf(']]>', i + 9);
      i = close < 0 ? n : close + 3;
      continue;
    }
    if (source.startsWith('<?', i)) {
      const close = source.indexOf('?>', i + 2);
      i = close < 0 ? n : close + 2;
      continue;
    }
    if (source.startsWith('<!', i)) {
      // DOCTYPE (possibly with an internal subset in brackets).
      let depth = 0;
      let j = i + 2;
      for (; j < n; j++) {
        const ch = source[j];
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === '>' && depth <= 0) break;
      }
      i = Math.min(n, j + 1);
      continue;
    }
    // Start / end tag.
    const closing = source[i + 1] === '/';
    let j = i + (closing ? 2 : 1);
    const nameStart = j;
    while (j < n && !/[\s/>]/.test(source[j]!)) j++;
    const name = source.slice(nameStart, j);
    // Skip attributes, honouring quotes.
    let selfClosing = false;
    while (j < n) {
      const ch = source[j]!;
      if (ch === '"' || ch === "'") {
        const close = source.indexOf(ch, j + 1);
        j = close < 0 ? n : close + 1;
        continue;
      }
      if (ch === '>') {
        selfClosing = source[j - 1] === '/';
        j++;
        break;
      }
      j++;
    }
    i = j;
    if (name.length === 0) continue;
    if (closing) {
      // Pop to the matching open element (tolerates unbalanced markup).
      const at = stack.lastIndexOf(name);
      if (at >= 0) {
        for (let k = stack.length - 1; k >= at; k--) {
          if (stack[k] === 'text') textDepth--;
        }
        stack.length = at;
      }
    } else if (!selfClosing) {
      stack.push(name);
      if (name === 'text') textDepth++;
    }
  }
  flushText(n);
  return out;
}

/** Decoded text-node content plus, per UTF-16 unit of `text`, the raw source
 *  span it came from (offsets relative to the raw string). An entity such as
 *  `&amp;` decodes to one unit whose span covers the whole entity; a surrogate
 *  pair yields two units sharing one span. */
export interface DecodedXmlText {
  text: string;
  /** `charStart[k]`: raw offset where unit `k`'s character begins. */
  charStart: number[];
  /** `charEnd[k]`: raw offset just past unit `k`'s character. */
  charEnd: number[];
}

const NAMED_ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

/** Decode the XML entities of a raw text-node string. Unknown or malformed
 *  entities are kept verbatim so `text` never silently loses characters. */
export function decodeXmlText(raw: string): DecodedXmlText {
  let text = '';
  const charStart: number[] = [];
  const charEnd: number[] = [];
  const push = (decoded: string, start: number, end: number) => {
    for (let u = 0; u < decoded.length; u++) {
      charStart.push(start);
      charEnd.push(end);
    }
    text += decoded;
  };
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i]!;
    if (ch === '&') {
      const semi = raw.indexOf(';', i + 1);
      if (semi > i + 1 && semi - i <= 12) {
        const body = raw.slice(i + 1, semi);
        let decoded: string | null = null;
        if (body[0] === '#') {
          const hex = body[1] === 'x' || body[1] === 'X';
          const digits = body.slice(hex ? 2 : 1);
          const cp = hex ? (/^[0-9a-fA-F]+$/.test(digits) ? parseInt(digits, 16) : NaN) : (/^[0-9]+$/.test(digits) ? parseInt(digits, 10) : NaN);
          if (Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff) {
            try { decoded = String.fromCodePoint(cp); } catch { decoded = null; }
          }
        } else if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)) {
          decoded = NAMED_ENTITIES[body]!;
        }
        if (decoded !== null) {
          push(decoded, i, semi + 1);
          i = semi + 1;
          continue;
        }
      }
      push('&', i, i + 1);
      i++;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < raw.length) {
      const low = raw.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        push(raw.slice(i, i + 2), i, i + 2);
        i += 2;
        continue;
      }
    }
    push(ch, i, i + 1);
    i++;
  }
  return { text, charStart, charEnd };
}

/** Escape text typed into a text node so it stays well-formed XML. */
export function escapeXmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Axis-aligned box in the SVG's rendered viewport, as fractions `[0, 1]` of
 *  its width / height — the same normalised space both previews stretch the
 *  figure into (`bodyRect`). */
export interface SvgCharBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One text node's glyph geometry paired with its raw source range. */
export interface SvgTextRun {
  /** Raw source range of the text node (what the editor may change). */
  start: number;
  end: number;
  /** Decoded content (equals the DOM node's `data`). */
  text: string;
  /** Absolute source offsets per UTF-16 unit of `text` (see {@link DecodedXmlText}). */
  charStart: number[];
  charEnd: number[];
  /** One normalised box per UTF-16 unit of `text` (astral pairs share one). */
  boxes: SvgCharBox[];
}

export interface SvgTextIndex {
  runs: SvgTextRun[];
}

/** Hit boxes grow by this fraction of the glyph height on every side: glyph
 *  metrics measured in the hidden inline `<svg>` can differ slightly from the
 *  `<img>` rasterisation the previews paint (web fonts in particular). */
const HIT_PAD_RATIO = 0.2;

/** Caret position (source offset) for a point given as fractions of the
 *  figure's rendered box. Snaps to the nearest glyph inside its padded box;
 *  `null` when the point is not on any text. The caret lands before or after
 *  the glyph depending on which half was hit. */
export function hitSvgTextIndex(index: SvgTextIndex, u: number, v: number): number | null {
  let best: { dist: number; offset: number } | null = null;
  for (const run of index.runs) {
    for (let k = 0; k < run.boxes.length; k++) {
      const b = run.boxes[k]!;
      const h = Math.max(1e-6, b.y1 - b.y0);
      const w = Math.max(1e-6, b.x1 - b.x0);
      const pad = h * HIT_PAD_RATIO;
      if (u < b.x0 - pad || u > b.x1 + pad || v < b.y0 - pad || v > b.y1 + pad) continue;
      const cx = (b.x0 + b.x1) / 2;
      const cy = (b.y0 + b.y1) / 2;
      // Normalise by the glyph size so a wide glyph does not win over a
      // nearer narrow one.
      const dist = Math.abs(u - cx) / w + Math.abs(v - cy) / h;
      if (best === null || dist < best.dist) {
        best = { dist, offset: u < cx ? run.charStart[k]! : run.charEnd[k]! };
      }
    }
  }
  return best ? best.offset : null;
}

/** Normalised boxes covering the glyphs whose source lies in `[from, to)`.
 *  Consecutive glyphs of one run merge into a single box per text node. */
export function svgSourceRangeToBoxes(index: SvgTextIndex, from: number, to: number): SvgCharBox[] {
  const out: SvgCharBox[] = [];
  if (to <= from) return out;
  for (const run of index.runs) {
    if (run.end <= from || run.start >= to) continue;
    let acc: SvgCharBox | null = null;
    for (let k = 0; k < run.boxes.length; k++) {
      // A glyph is selected when its source span overlaps the range.
      if (run.charEnd[k]! <= from || run.charStart[k]! >= to) continue;
      const b = run.boxes[k]!;
      acc = acc
        ? { x0: Math.min(acc.x0, b.x0), y0: Math.min(acc.y0, b.y0), x1: Math.max(acc.x1, b.x1), y1: Math.max(acc.y1, b.y1) }
        : { ...b };
    }
    if (acc) out.push(acc);
  }
  return out;
}

/** Caret geometry for a source offset: a zero-width box at the left edge of
 *  the glyph starting there, or at the right edge of the glyph ending there.
 *  `null` when the offset is not inside any text node. */
export function svgSourceOffsetToCaret(index: SvgTextIndex, offset: number): SvgCharBox | null {
  for (const run of index.runs) {
    if (offset < run.start || offset > run.end) continue;
    if (run.boxes.length === 0) continue;
    for (let k = 0; k < run.boxes.length; k++) {
      if (run.charStart[k] === offset) {
        const b = run.boxes[k]!;
        return { x0: b.x0, y0: b.y0, x1: b.x0, y1: b.y1 };
      }
    }
    for (let k = run.boxes.length - 1; k >= 0; k--) {
      if (run.charEnd[k]! <= offset) {
        const b = run.boxes[k]!;
        return { x0: b.x1, y0: b.y0, x1: b.x1, y1: b.y1 };
      }
    }
    const b = run.boxes[0]!;
    return { x0: b.x0, y0: b.y0, x1: b.x0, y1: b.y1 };
  }
  return null;
}

/** The text-node range containing `offset` (inclusive of both ends). */
export function svgTextRangeAt(ranges: readonly SourceRange[], offset: number): SourceRange | null {
  for (const r of ranges) {
    if (offset >= r.start && offset <= r.end) return r;
  }
  return null;
}
