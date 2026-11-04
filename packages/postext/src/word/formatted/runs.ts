// Runs of the formatted Word export (#1392): one `w:r` per display run
// with the exact face, size, colour, tracking and shift as direct
// formatting. Spaces of a justified line get a −0.1 pt spacing so Word's
// own advances never push a word onto the next line (justification
// stretches them back). Embedded content (maths, music, swatches, tabs)
// keeps its width as zero-width word joiners spaced out to the run's
// width; the picture itself is anchored over that spot. Ruby bases,
// tate-chu-yoko cells and warichu notes write their own East Asian runs
// (eastAsian.ts, #1394).

import { parseFontString } from '../../measure/fontString.js';
import type { DisplayLine, DisplayRun } from '../../paint/displayList/types.js';
import { escapeAttr } from '../xml.js';
import { wordFontFor } from '../fonts/plan.js';
import { fontSizePx } from './metrics.js';
import { faceStyleId } from './styles.js';
import { eastAsianLayout, kuntenOf, rubyXml, textRun, verticalPieces, type Annotation } from './eastAsian.js';
import { halfPoints, textColorHex, twips } from './units.js';
import type { WriterContext } from './types.js';

/** Spacing (twips) on every space of a justified line. */
export const SPACE_SPACING = -2;
/** Zero-width character that stands for embedded content. */
export const HOLDER = '⁠';
/** Word's font size range, half-points (1 pt to 1638 pt). */
export const MIN_SZ = 2;
export const MAX_SZ = 3276;

/** Text as Word can hold it, one UTF-16 unit for one: characters XML 1.0
 *  forbids (C0 controls, U+FFFE/U+FFFF) and unpaired surrogates become
 *  U+FFFD, line ends and tabs spaces. `escapeXml` would drop the first
 *  ones, and a '\n' in the text would read as an engine break, so the
 *  fragment text would no longer match what the bookmark holds. */
export function wordText(text: string): string {
  return text.replace(/[\t\n\r]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, (c) => (c === '\t' || c === '\n' || c === '\r' ? ' ' : '\ufffd'));
}

export interface ResolvedFont {
  family: string;
  bold: boolean;
  italic: boolean;
  /** Half-points, rounded. */
  sz: number;
  /** Character scale (`w:w`, percent) that brings the rounded size back to
   *  the engine's widths; undefined at 100. */
  scale?: number;
}

/** Something to draw over a run (inline picture or swatch), in the
 *  item's unturned frame. */
export interface InlineDrawing {
  kind: 'math' | 'score' | 'swatch' | 'chip';
  svg?: string;
  color?: string;
  rect: { x: number; y: number; width: number; height: number };
}

export interface EmittedRun {
  /** `w:rPr` (runs with equal properties are merged by the caller). */
  rPr: string;
  /** What the run puts in the document (same length as `run.text`). */
  text: string;
  drawing?: InlineDrawing;
  /** The run's own XML, never merged (a ruby, tate-chu-yoko cells, a
   *  warichu note): it holds `text` as the importer reads it. */
  xml?: string;
  /** Marks drawn beside the run (kanbun), in the item's unturned frame. */
  annotations?: Annotation[];
  rules?: ReturnType<typeof kuntenOf>['rules'];
}

const fontCache = new WeakMap<WriterContext, Map<string, ResolvedFont>>();

/** The Word face and size of a font string. */
export function resolveFont(ctx: WriterContext, fontString: string): ResolvedFont {
  let cache = fontCache.get(ctx);
  if (!cache) fontCache.set(ctx, (cache = new Map()));
  let f = cache.get(fontString);
  if (f) return f;
  const px = fontSizePx(fontString);
  const exact = halfPoints(px, ctx.dpi);
  const sz = Math.min(MAX_SZ, Math.max(MIN_SZ, Math.round(exact)));
  // Word sizes go by half points: a size between them is set at the
  // nearest and scaled across (w:w) to the engine's widths, so every line
  // still fills the measure it was broken for (8.8 pt: 9 pt at 98%).
  const pct = exact > 0 ? Math.min(600, Math.max(1, Math.round((exact / sz) * 100))) : 100;
  const scale = pct !== 100 ? pct : undefined;
  if (exact > 0 && (sz === MAX_SZ || sz === MIN_SZ) && Math.abs(sz - exact) / exact > 0.01) {
    ctx.warn('font-size-rounded', `${fontString}: ${(exact / 2).toFixed(2)} pt is set at ${sz / 2} pt (Word sizes run from 1 pt to 1638 pt)`);
  }
  if (ctx.plan) {
    const ref = wordFontFor(ctx.plan, fontString);
    f = { family: ref.family, bold: ref.bold, italic: ref.italic, sz, ...(scale ? { scale } : {}) };
  } else {
    const req = parseFontString(fontString);
    f = { family: req?.family ?? 'Times New Roman', bold: (req?.weight ?? 400) >= 600, italic: req?.style === 'italic', sz, ...(scale ? { scale } : {}) };
  }
  cache.set(fontString, f);
  return f;
}

const propsCache = new WeakMap<WriterContext, Map<string, string>>();

/** `w:rPr` of a run (CT_RPr child order), cached per distinct style. */
export function runProps(ctx: WriterContext, run: DisplayRun, opts: { spacing?: number; rtl?: boolean; ea?: string }): string {
  // An East Asian layout carries an id of its own: never cached.
  if (opts.ea) return buildRunProps(ctx, run, opts);
  let cache = propsCache.get(ctx);
  if (!cache) propsCache.set(ctx, (cache = new Map()));
  const key = `${run.fontString}|${run.bold ? 1 : 0}${run.italic ? 1 : 0}|${run.color}|${opts.spacing ?? 0}|${opts.rtl ? 1 : 0}|${run.smallCaps ? 1 : 0}|${run.baselineShift ?? 0}|${run.script ?? ''}|${ctx.lang ?? ''}`;
  let props = cache.get(key);
  if (props === undefined) {
    props = buildRunProps(ctx, run, opts);
    cache.set(key, props);
  }
  return props;
}

function buildRunProps(ctx: WriterContext, run: DisplayRun, opts: { spacing?: number; rtl?: boolean; ea?: string }): string {
  const f = resolveFont(ctx, run.fontString);
  const fam = escapeAttr(f.family);
  // Bold or italic that is the face's (a heading, a header cell, an italic
  // quote) and not emphasis in the source goes through a character style:
  // the importer reads direct w:b / w:i as emphasis the user added. So
  // does a script raised by hand, which has no w:vertAlign to read.
  const faceB = f.bold && !run.bold;
  const faceI = f.italic && !run.italic;
  const face = faceStyleId(faceB, faceI, run.baselineShift ? run.script : undefined);
  const p: string[] = face ? [`<w:rStyle w:val="${face}"/>`] : [];
  p.push(`<w:rFonts w:ascii="${fam}" w:hAnsi="${fam}" w:eastAsia="${fam}" w:cs="${fam}"/>`);
  if (f.bold && !faceB) p.push('<w:b/><w:bCs/>');
  if (f.italic && !faceI) p.push('<w:i/><w:iCs/>');
  if (run.smallCaps) p.push('<w:smallCaps/>');
  p.push(`<w:color w:val="${textColorHex(run.color)}"/>`);
  if (opts.spacing) p.push(`<w:spacing w:val="${opts.spacing}"/>`);
  if (f.scale) p.push(`<w:w w:val="${f.scale}"/>`);
  p.push('<w:kern w:val="1"/>');
  // A shifted run carries its own (already reduced) size: raise it by the
  // shift; a bare script asks Word for its super/subscript.
  const shift = run.baselineShift ? Math.round(halfPoints(run.baselineShift, ctx.dpi)) : 0;
  if (shift) p.push(`<w:position w:val="${shift}"/>`);
  p.push(`<w:sz w:val="${f.sz}"/><w:szCs w:val="${f.sz}"/>`);
  if (run.script && !run.baselineShift) p.push(`<w:vertAlign w:val="${run.script === 'sup' ? 'superscript' : 'subscript'}"/>`);
  if (opts.rtl) p.push('<w:rtl/>');
  if (ctx.lang) {
    const lang = escapeAttr(ctx.lang);
    p.push(opts.rtl ? `<w:lang w:val="${lang}" w:bidi="${lang}"/>` : `<w:lang w:val="${lang}"/>`);
  }
  if (opts.ea) p.push(opts.ea);
  p.push('<w14:ligatures w14:val="standardContextual"/>');
  return `<w:rPr>${p.join('')}</w:rPr>`;
}

/** A run's properties, what it writes and anything to draw over it. */
export function emitRun(ctx: WriterContext, run: DisplayRun, line: DisplayLine): EmittedRun {
  const justified = line.align === 'justify';
  const rtl = run.rtl === true;
  const n = run.text.length;
  if (n === 0) return { rPr: '', text: '' };
  // Content with a width of its own: zero-width holders spaced out.
  const fixed = run.inline !== undefined && run.inline.kind !== 'chip' ? true : /^\t+$/.test(run.text);
  if (fixed) {
    const text = HOLDER.repeat(n);
    const spacing = Math.round(twips(run.width, ctx.dpi) / n);
    const out: EmittedRun = { rPr: runProps(ctx, run, { spacing, rtl }), text };
    const inl = run.inline;
    if (inl && (inl.svg || inl.kind === 'swatch')) {
      const ascent = inl.ascentPx ?? inl.heightPx * 0.8;
      out.drawing = {
        kind: inl.kind,
        ...(inl.svg ? { svg: inl.svg } : {}),
        ...(inl.kind === 'swatch' ? { color: run.color } : {}),
        rect: { x: run.x, y: line.baseline - (run.baselineShift ?? 0) - ascent, width: inl.widthPx, height: inl.heightPx },
      };
    }
    return out;
  }
  const tracking = run.tracking ? twips(run.tracking, ctx.dpi) : 0;
  const isSpace = run.space === true || /^[  ]+$/.test(run.text);
  const spacing = tracking + (justified && isSpace ? SPACE_SPACING : 0);
  const text = wordText(run.text);
  const rPr = runProps(ctx, run, { spacing, rtl });
  const out: EmittedRun = { rPr, text };
  if (run.kunten) {
    const k = kuntenOf(run, line);
    if (k.annotations.length) out.annotations = k.annotations;
    if (k.rules.length) out.rules = k.rules;
  }
  if (run.ruby) {
    const rt: DisplayRun = { text: run.ruby.text, x: run.x, width: 0, fontString: run.ruby.fontString, color: run.ruby.color ?? run.color, textStart: 0 };
    const sizes = { base: resolveFont(ctx, run.fontString).sz, rt: resolveFont(ctx, run.ruby.fontString).sz };
    out.xml = rubyXml(ctx, run, text, rPr, runProps(ctx, rt, {}), sizes, line);
  } else if (run.warichu) {
    // Word's two lines in one puts the first half of the text on top.
    const { upper, lower } = run.warichu;
    if (upper.length !== Math.ceil((upper.length + lower.length) / 2)) {
      ctx.warn('warichu-split', `a warichu note's rows (${upper.length} and ${lower.length} characters) are split in half by Word's two lines in one`);
    }
    out.xml = textRun(runProps(ctx, run, { spacing, rtl, ea: eastAsianLayout(ctx, 'combine') }), text);
  } else if (line.vertical) {
    const pieces = verticalPieces(ctx, run, text);
    if (pieces.some((piece) => piece.tcy)) {
      out.xml = pieces.map((piece) => textRun(piece.tcy ? runProps(ctx, run, { spacing, rtl, ea: eastAsianLayout(ctx, 'vert') }) : rPr, piece.text)).join('');
    }
  }
  return out;
}

/** The `MapFormat` flags of a run (b, i, c, p, s). A code block's lines are
 *  code by their paragraph style, not by inline backticks: no `k`, which
 *  would read back as removed. */
export function formatFlags(run: DisplayRun): string {
  let f = '';
  if (run.bold) f += 'b';
  if (run.italic) f += 'i';
  if (run.smallCaps) f += 'c';
  if (run.script === 'sup') f += 'p';
  if (run.script === 'sub') f += 's';
  return f;
}

/** An external link target Word can open (not an in-book anchor). */
export function linkTarget(href: string | undefined): string | undefined {
  if (!href) return undefined;
  return /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : undefined;
}
