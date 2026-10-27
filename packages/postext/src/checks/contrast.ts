/**
 * Contrast check (#748): the text of a laid-out document against the
 * ground it is set on, found on the VDT so it runs as soon as a page is
 * laid out. A tagged PDF says what the text is; this says whether it can
 * be read.
 *
 * Two renditions, since the same pages go to a screen and to a press:
 *
 * - `screen`: the WCAG 2 contrast ratio of the sRGB colours, as the
 *   canvas, the HTML and an RGB PDF show them.
 * - `print`: the same ratio worked out from the luminance each colour has
 *   on paper — its separation on the job's output profile (the values of
 *   a colour authored in CMYK as they are), read back through the profile
 *   and taken relative to the bare paper, which is the white of a printed
 *   page as the display's white is the white of a screen. Ink is never a
 *   perfect black, least of all on uncoated stock: black on newsprint is
 *   about 5:1 where a screen gives 21:1, and the number says so. Needs
 *   the profile's transform (`options.transform`); without it only the
 *   reversed text is checked.
 *
 * The threshold follows the text's size and weight (large text: 18 pt, or
 * 14 pt bold) and the level asked (`contrast.level`, AA or AAA).
 *
 * In print, text knocked out of an inked ground is reported on its own
 * (`reversedText`) when it is small, italic or light: its strokes fill in
 * on press whatever the ratio says.
 *
 * What it reads: the lines of every block (inline bold, italic, reference
 * and chip colours included), list markers, drop caps, captions, notes and
 * table cells, the words drawn on a picture (a figure's labels, #902, read
 * on their plate, else inside their halo; bare on the picture they are
 * skipped), and the text of design slots (running heads, openers,
 * heading designs, box titles, a composed page's decoration). The ground
 * is the topmost fill under the text: a design box, a callout, a caption
 * bar, a table cell, a chip, the box of a composed page's frame or the
 * template decoration under it (in the page's paint order,
 * `composedPaintOrder`), else the page's paper colour; a translucent colour is blended with what is
 * under it. Text over a picture is skipped (its ground is not a colour),
 * as are comic lettering, ruby and formulas.
 *
 * The pairs `contrast.allow` names (#1124: by colours, by the style the
 * text is set in, or both) are still reported, as accepted with the
 * entry's reason, so a host lists them apart and does not count them.
 */

import type { CmykPercent, ContrastAllowEntry, ContrastLevel, ResolvedContrastConfig } from '../types.js';
import type { BoundingBox, ResolvedConfig, VDTBlock, VDTDesignSlot, VDTDocument, VDTLine } from '../vdt.js';
import { flowRectToPage, tableCellFill } from '../vdt.js';
import { labToXyz, type OutputTransform } from '../color/transform.js';
import { authoredCmykColors } from '../color/authored.js';
import { resolveContrastConfig } from '../defaults/output/contrast.js';
import { findPxSize, parseFontString } from '../measure/fontString.js';
import { dimensionToPx } from '../units.js';
import { taskBoxText } from '../paint/taskBox.js';
import { composedFrameBlockIds, composedPaintOrder, frameMatrix, paintsOverFrames } from '../composed/paint.js';

export type ContrastMedium = 'screen' | 'print';

/** What a piece of text is, for a host that words its findings. */
export type ContrastRole = 'body' | 'heading' | 'caption' | 'table' | 'runningHead' | 'design' | 'chip' | 'marker' | 'label';

/** Why reversed text is reported: under the size for any face, or under
 *  the size for thin strokes while italic or light. */
export type ReversedTextReason = 'small' | 'italic' | 'light';

/** One text and ground combination the document sets, at one size and
 *  weight, whether it passes or not. */
export interface ContrastPair {
  /** The text colour as painted (`#rrggbb`, a translucent one blended
   *  with its ground). */
  color: string;
  /** The ground as painted (`#rrggbb`). */
  background: string;
  /** The same two as the configuration writes them (lower case, alpha
   *  kept): what a colour field holds. */
  textColor: string;
  groundColor: string;
  sizePt: number;
  weight: number;
  italic: boolean;
  /** Large text (18 pt, or 14 pt bold): the lower threshold applies. */
  large: boolean;
  role: ContrastRole;
  /** How many runs of text are set so. */
  count: number;
  /** Where the first one is: book-absolute page index, its box on the
   *  sheet (page px) and its source range when it has one. */
  pageIndex: number;
  rect: BoundingBox;
  sourceStart?: number;
  sourceEnd?: number;
  /** The first run's text, cut to 40 characters. */
  text: string;
  /** The ratio the level asks of this size and weight. */
  required: number;
  /** The WCAG ratio of the sRGB colours. */
  screen: number;
  /** The ratio on paper; present when the output transform was given. */
  print?: number;
  /** Set when the text is knocked out of an inked ground and is under the
   *  sizes of `contrast.reversedText`. `inks`: how many of the four the
   *  ground is built of. */
  reversed?: { reasons: ReversedTextReason[]; minimumPt: number; inks: number };
  /** The styles the text is set in, innermost first (a chip style, a
   *  label style, a paragraph or heading style, the box styles round it):
   *  set only while `contrast.allow` names a style, the pairs then kept
   *  apart by them. */
  styles?: string[];
}

/** Why a finding is accepted: the `contrast.allow` entry it matches. */
export interface ContrastAccepted {
  reason: string;
  fg?: string;
  bg?: string;
  style?: string;
}

export type ContrastIssue = {
  /** Book-absolute page index of the first occurrence. */
  pageIndex: number;
  rect: BoundingBox;
  sourceStart?: number;
  sourceEnd?: number;
  color: string;
  background: string;
  /** The smallest size the pair is set at, and that run's weight. */
  sizePt: number;
  weight: number;
  italic: boolean;
  role: ContrastRole;
  text: string;
  /** Runs of text set so, over every size sharing the finding. */
  count: number;
  /** The pair is one `contrast.allow` accepts (#1124): listed, not a
   *  warning. */
  accepted?: ContrastAccepted;
} & (
  | {
      kind: 'lowContrast';
      level: ContrastLevel;
      large: boolean;
      required: number;
      /** The ratio in each rendition checked. */
      screen?: number;
      print?: number;
      /** The renditions under `required`. */
      failing: ContrastMedium[];
    }
  | { kind: 'reversedText'; reasons: ReversedTextReason[]; minimumPt: number; inks: number }
);

export type ContrastKind = ContrastIssue['kind'];

export interface ContrastOptions {
  /** The settings to check against; the document's `config.contrast`
   *  (else the defaults) when omitted. */
  contrast?: ResolvedContrastConfig;
  /** The renditions to check, whatever `contrast.mode` says. */
  media?: readonly ContrastMedium[];
  /** The separation of the job's output profile: gives the print ratio
   *  and counts the inks of a ground. */
  transform?: OutputTransform;
  /** `contrastPairs(doc, …)` under the same settings and transform, when
   *  the host already has them: `contrastDocument` then skips the walk. */
  pairs?: readonly ContrastPair[];
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(color: string | undefined): Rgba | undefined {
  if (!color) return undefined;
  const c = color.trim().toLowerCase();
  if (c === 'transparent') return { r: 255, g: 255, b: 255, a: 0 };
  let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/.exec(c);
  if (m) return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16), a: m[4] ? parseInt(m[4], 16) / 255 : 1 };
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/.exec(c);
  if (m) return { r: parseInt(m[1]! + m[1]!, 16), g: parseInt(m[2]! + m[2]!, 16), b: parseInt(m[3]! + m[3]!, 16), a: m[4] ? parseInt(m[4] + m[4], 16) / 255 : 1 };
  return undefined;
}

const hexByte = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
const toHex = (c: { r: number; g: number; b: number }) => `#${hexByte(c.r)}${hexByte(c.g)}${hexByte(c.b)}`;

function blend(top: Rgba, under: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  if (top.a >= 1) return top;
  return { r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a) };
}

/** `top` painted over `under`, as `#rrggbb`: a translucent colour
 *  (`#rrggbbaa`) blended, an opaque one as it is. `under` reads as opaque.
 *  A colour that is no hex gives `under`. */
export function blendColors(top: string, under: string): string {
  const u = parseColor(under) ?? { r: 255, g: 255, b: 255, a: 1 };
  const t = parseColor(top);
  return toHex(t ? blend(t, u) : u);
}

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** The relative luminance of an sRGB colour (WCAG 2), 0 for black to 1 for
 *  white. Alpha is ignored; a colour that is no hex reads as black. */
export function relativeLuminance(color: string): number {
  const c = parseColor(color);
  if (!c) return 0;
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

const ratioOf = (l1: number, l2: number) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

/** The WCAG 2 contrast ratio of two sRGB colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  return ratioOf(relativeLuminance(a), relativeLuminance(b));
}

/** Whether text counts as large (WCAG 2): 18 pt, or 14 pt at a weight of
 *  700 and over. */
export function isLargeText(sizePt: number, weight = 400): boolean {
  return sizePt >= 18 - 1e-6 || (sizePt >= 14 - 1e-6 && weight >= 700);
}

/** The ratio a level asks: AA 4.5:1 (3:1 for large text), AAA 7:1
 *  (4.5:1). */
export function contrastThreshold(level: ContrastLevel, large: boolean): number {
  if (level === 'AAA') return large ? 4.5 : 7;
  return large ? 3 : 4.5;
}

/** What the print measures need: the job's separation, and the colours of
 *  the configuration authored in CMYK (`authoredCmykColors`), which print
 *  as written. */
export interface PrintContrastContext {
  transform: OutputTransform;
  authored?: ReadonlyMap<string, CmykPercent>;
}

/** The process values a colour prints with, percent: its authored CMYK,
 *  else its separation on the output profile. */
export function printSeparation(color: string, context: PrintContrastContext): CmykPercent {
  const c = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 };
  const exact = context.authored?.get(toHex(c));
  if (exact) return exact;
  const k = context.transform.fromRgb(c.r / 255, c.g / 255, c.b / 255);
  return { c: k.c * 100, m: k.m * 100, y: k.y * 100, k: k.k * 100 };
}

/** The luminance a colour has printed, relative to the bare paper: its
 *  separation read back through the profile (media-relative), 0 to 1.
 *  Paper is 1, as a display's white is in the screen measure; solid black
 *  is about 0.02 on coated stock and 0.1 to 0.17 on newsprint. */
export function printLuminance(color: string, context: PrintContrastContext): number {
  const s = printSeparation(color, context);
  const lab = context.transform.toLab({ c: s.c / 100, m: s.m / 100, y: s.y / 100, k: s.k / 100 });
  return Math.max(0, Math.min(1, labToXyz(lab).Y));
}

/** The contrast ratio of two colours on paper: the WCAG formula over
 *  their printed luminances. */
export function printContrastRatio(a: string, b: string, context: PrintContrastContext): number {
  return ratioOf(printLuminance(a, context), printLuminance(b, context));
}

/** The renditions a document is checked in under `contrast.mode`: with
 *  `'auto'`, the screen always and print for a book set up for print (a
 *  PDF/X standard, a CMYK PDF, or crop marks). */
export function contrastMedia(config: ResolvedConfig, contrast: ResolvedContrastConfig = config.contrast ?? resolveContrastConfig()): ContrastMedium[] {
  if (contrast.mode === 'screen') return ['screen'];
  if (contrast.mode === 'print') return ['print'];
  if (contrast.mode === 'both') return ['screen', 'print'];
  const pdf = config.pdfGeneration;
  const forPrint = (config.print !== undefined && config.print.standard !== 'none')
    || (!!pdf?.forceColorSpace && pdf.colorSpace === 'cmyk')
    || config.page.cutLines.enabled;
  return forPrint ? ['screen', 'print'] : ['screen'];
}

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

const EPS = 0.5;

/** A painted area: a colour, or a picture (`color` absent). */
interface Fill {
  rect: BoundingBox;
  color?: Rgba;
  raw?: string;
}

interface Ground {
  hex: string;
  raw: string;
}

interface TextStyle {
  font: string;
  boldFont?: string;
  italicFont?: string;
  boldItalicFont?: string;
  color: string;
  boldColor?: string;
  italicColor?: string;
  refColor?: string;
  labelColor?: string;
}

function fontSizePx(fontString: string | undefined): number | undefined {
  const m = fontString ? findPxSize(fontString) : null;
  return m ? Number(m.value) : undefined;
}

const normal = (color: string) => color.trim().toLowerCase();

type Affine = [number, number, number, number, number, number];

/** The axis-aligned box of `rect` put through `m` (canvas order). */
function transformRect(m: Affine, rect: BoundingBox): BoundingBox {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]] as const) {
    xs.push(m[0] * x + m[2] * y + m[4]);
    ys.push(m[1] * x + m[3] * y + m[5]);
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * Every text and ground combination `doc` sets, with its ratio on screen
 * and, when `options.transform` is given, on paper — passing or not, one
 * entry per colours, size, weight and slant. Runs whatever
 * `contrast.enabled` says: a host shows these beside its colour fields.
 */
export function contrastPairs(doc: VDTDocument, options: ContrastOptions = {}): ContrastPair[] {
  const contrast = options.contrast ?? doc.config.contrast ?? resolveContrastConfig();
  const dpi = doc.config.page.dpi;
  const pxToPt = (px: number) => (px / dpi) * 72;
  const offset = doc.pageIndexOffset ?? 0;
  const printContext: PrintContrastContext | undefined = options.transform
    ? { transform: options.transform, authored: authoredCmykColors(doc.config) }
    : undefined;
  const authored = printContext?.authored ?? authoredCmykColors(doc.config);
  const reversedCfg = contrast.reversedText;
  const minPt = pxToPt(dimensionToPx(reversedCfg.minSize, dpi));
  const minFinePt = pxToPt(dimensionToPx(reversedCfg.minFineSize, dpi));
  const pairs = new Map<string, ContrastPair>();
  // The styles of the text being walked (#1124), kept only while an allow
  // entry names a style.
  const byStyle = contrast.allow?.some((e) => e.style !== undefined) ?? false;
  let styles: string[] = [];
  const withStyles = <T>(inner: readonly (string | undefined)[], walk: () => T): T => {
    if (!byStyle) return walk();
    const outer = styles;
    styles = [...inner.filter((v): v is string => !!v), ...outer];
    try {
      return walk();
    } finally {
      styles = outer;
    }
  };
  /** A box's style by its parser container id, from its frame block. */
  const boxStyles = new Map<number, string>();

  const printLum = new Map<string, number>();
  const lumOnPaper = (hex: string): number => {
    let v = printLum.get(hex);
    if (v === undefined) printLum.set(hex, (v = printLuminance(hex, printContext!)));
    return v;
  };
  /** Inks of a colour: exact with the transform or an authored CMYK, else
   *  one for a neutral and three for any other colour. */
  const inksOf = (hex: string): number => {
    const sep = authored.get(hex) ?? (printContext ? printSeparation(hex, printContext) : undefined);
    if (sep) return [sep.c, sep.m, sep.y, sep.k].filter((v) => v > EPS).length;
    if (hex === '#ffffff') return 0;
    return hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7) ? 1 : 3;
  };

  for (const page of doc.pages) {
    const pageIndex = page.index + offset;
    /** The matrix of the composed-page frame being walked (#908): its
     *  blocks are in the frame's own coordinates, turned and scaled onto
     *  the sheet by it. */
    let frameToSheet: Affine | undefined;
    const sheet = (rect: BoundingBox, inFlow: boolean): BoundingBox => {
      const r = inFlow ? flowRectToPage(page, rect) : rect;
      return frameToSheet ? transformRect(frameToSheet, r) : r;
    };
    const paperRaw = page.background ?? doc.config.page.backgroundColor.hex;
    const fills: Fill[] = [{
      rect: { x: -Infinity, y: -Infinity, width: Infinity, height: Infinity },
      color: parseColor(paperRaw) ?? { r: 255, g: 255, b: 255, a: 1 },
      raw: normal(paperRaw),
    }];
    const fill = (rect: BoundingBox, color: string | undefined) => {
      const c = parseColor(color);
      if (c && c.a > 0) fills.push({ rect, color: c, raw: normal(color!) });
    };
    const picture = (rect: BoundingBox) => fills.push({ rect });

    /** The ground at a point of the sheet: the fills there from the top
     *  one down to the first opaque one, blended over white. Undefined
     *  over a picture. */
    const groundAt = (x: number, y: number): Ground | undefined => {
      const stack: Fill[] = [];
      for (let i = fills.length - 1; i >= 0; i--) {
        const f = fills[i]!;
        const r = f.rect;
        if (i > 0 && (x < r.x || y < r.y || x > r.x + r.width || y > r.y + r.height)) continue;
        if (!f.color) return undefined;
        if (f.color.a <= 0) continue;
        stack.push(f);
        if (f.color.a >= 1) break;
      }
      let under = { r: 255, g: 255, b: 255 };
      for (let i = stack.length - 1; i >= 0; i--) under = blend(stack[i]!.color!, under);
      return { hex: toHex(under), raw: stack[0]?.raw ?? '#ffffff' };
    };
    const groundIn = (rect: BoundingBox): Ground | undefined => groundAt(rect.x + rect.width / 2, rect.y + rect.height / 2);
    /** A fill of the element's own over the ground beneath it. */
    const over = (color: string | undefined, beneath: Ground | undefined): Ground | undefined => {
      const c = parseColor(color);
      if (!c || c.a <= 0) return beneath;
      if (c.a >= 1) return { hex: toHex(c), raw: normal(color!) };
      if (!beneath) return undefined;
      return { hex: blendColors(color!, beneath.hex), raw: normal(color!) };
    };

    const note = (
      color: string | undefined,
      font: string | undefined,
      text: string,
      ground: Ground | undefined,
      rect: BoundingBox,
      role: ContrastRole,
      src: { start?: number; end?: number },
      sizeFont: string | undefined = font,
    ) => {
      if (!ground) return;
      const c = parseColor(color);
      const sizePx = fontSizePx(sizeFont);
      if (!c || c.a <= 0 || sizePx === undefined || sizePx <= 0) return;
      const face = font ? parseFontString(font) : null;
      const weight = face?.weight ?? 400;
      const italic = face?.style === 'italic';
      const hex = toHex(blend(c, parseColor(ground.hex)!));
      const sizePt = Math.round(pxToPt(sizePx) * 10) / 10;
      const key = `${hex}|${ground.hex}|${normal(color!)}|${ground.raw}|${sizePt}|${weight}|${italic ? 'i' : 'n'}${byStyle ? `|${styles.join(',')}` : ''}`;
      const seen = pairs.get(key);
      if (seen) {
        seen.count++;
        return;
      }
      const large = isLargeText(sizePt, weight);
      const pair: ContrastPair = {
        color: hex,
        background: ground.hex,
        textColor: normal(color!),
        groundColor: ground.raw,
        sizePt,
        weight,
        italic,
        large,
        role,
        count: 1,
        pageIndex,
        rect,
        ...(src.start !== undefined ? { sourceStart: src.start, ...(src.end !== undefined ? { sourceEnd: src.end } : {}) } : {}),
        text: text.trim().slice(0, 40),
        required: contrastThreshold(contrast.level, large),
        screen: contrastRatio(hex, ground.hex),
      };
      if (printContext) pair.print = ratioOf(lumOnPaper(hex), lumOnPaper(ground.hex));
      if (byStyle && styles.length > 0) pair.styles = [...styles];
      // Knocked out of an inked ground: lighter than it, and the ground
      // is more than bare paper.
      const lighter = printContext ? lumOnPaper(hex) > lumOnPaper(ground.hex) : relativeLuminance(hex) > relativeLuminance(ground.hex);
      const inks = lighter ? inksOf(ground.hex) : 0;
      if (inks > 0) {
        const reasons: ReversedTextReason[] = [];
        if (sizePt < minPt - 1e-6) reasons.push('small');
        if (sizePt < minFinePt - 1e-6) {
          if (italic) reasons.push('italic');
          if (weight <= reversedCfg.lightWeight) reasons.push('light');
        }
        if (reasons.length > 0) {
          const fine = reasons.includes('italic') || reasons.includes('light');
          pair.reversed = { reasons, minimumPt: Math.round((fine ? minFinePt : minPt) * 10) / 10, inks };
        }
      }
      pairs.set(key, pair);
    };

    /** The runs of laid-out lines, each in the colour and face the
     *  renderers paint it with. */
    const noteLines = (lines: readonly VDTLine[], style: TextStyle, ground: Ground | undefined, rectOf: (line: VDTLine) => BoundingBox, role: ContrastRole, src: { start?: number; end?: number }) => {
      for (const line of lines) {
        const segs = line.segments ?? [];
        const lineSrc = line.sourceStart !== undefined ? { start: line.sourceStart, end: line.sourceEnd } : src;
        if (segs.length === 0) {
          if (line.text.trim()) note(style.color, style.font, line.text, ground, rectOf(line), role, lineSrc);
          continue;
        }
        const seen = new Set<string>();
        for (const seg of segs) {
          const bold = !!seg.bold;
          const italic = !!seg.italic;
          const segColor = seg.color
            ?? (seg.refResourceId !== undefined && style.refColor ? style.refColor
              : seg.captionLabel && style.labelColor ? style.labelColor
                : bold && style.boldColor ? style.boldColor
                  : italic && style.italicColor ? style.italicColor
                    : style.color);
          if (seg.kind === 'chip' && seg.chip) {
            const chip = seg.chip;
            const chipGround = over(chip.background, ground);
            withStyles([chip.styleId], () => {
              for (const run of chip.runs) {
                if (run.text.trim()) note(chip.color ?? segColor, run.fontString, run.text, chipGround, rectOf(line), 'chip', lineSrc);
              }
            });
            continue;
          }
          if (seg.kind !== 'text' || !seg.text.trim() || seg.sideMarker) continue;
          const base = (bold && italic && style.boldItalicFont) || (bold && style.boldFont) || (italic && style.italicFont) || style.font;
          const font = seg.fontString ?? base;
          const key = `${font}|${segColor}`;
          if (seen.has(key)) continue;
          seen.add(key);
          // A superscript or subscript is judged at its text's size.
          // An inline run in a face or colour of its own is quoted alone.
          const own = bold || italic || seg.color !== undefined || seg.fontString !== undefined || seg.refResourceId !== undefined;
          note(segColor, font, own ? seg.text : line.text, ground, rectOf(line), role, lineSrc, seg.script ? base : font);
        }
      }
    };

    const walkSlot = (slot: VDTDesignSlot | undefined, inFlow: boolean, role: ContrastRole) => {
      for (const b of slot?.blocks ?? []) {
        const rect = sheet(b.bbox, inFlow);
        if (b.kind === 'box') {
          fill(rect, b.box.backgroundColor);
        } else if (b.kind === 'path' && b.boxPart === 'fill') {
          // A card joined to its tab (#1059): its fill is the ground.
          fill(rect, b.fill);
        } else if (b.kind === 'image') {
          picture(rect);
        } else if (b.kind === 'text') {
          if (b.box) fill(rect, b.box.backgroundColor);
          const first = b.lines.find((l) => l.text.trim());
          if (!first) continue;
          // Under the first line's ink (a horizontal block's lines start
          // `xOffset` from its box's edge, on a baseline given in the
          // slot's own coordinates), else under the box's middle.
          const size = fontSizePx(b.fontString) ?? 0;
          const probe = b.vertical
            ? rect
            : sheet({ x: b.bbox.x + first.xOffset, y: first.baselineY - size * 0.7, width: Math.max(first.width, 1), height: Math.max(size * 0.7, 1) }, inFlow);
          const ground = groundIn(probe);
          // Hollow letters print their outline only.
          const color = b.stroke?.hollow ? b.stroke.color : b.color;
          const src = { start: b.sourceStart, end: b.sourceEnd };
          const fonts = new Set<string>();
          for (const line of b.lines) {
            if (!line.text.trim()) continue;
            for (const font of line.runs?.length ? line.runs.filter((r) => r.text.trim()).map((r) => r.fontString) : [b.fontString]) {
              if (fonts.has(font)) continue;
              fonts.add(font);
              note(color, font, line.text, ground, rect, role, src);
            }
          }
        }
      }
    };

    /** The styles a block's text is set in: its own paragraph or heading
     *  style, a box's own, then the boxes round it, innermost first. */
    const blockStyles = (block: VDTBlock): (string | undefined)[] => {
      if (!byStyle) return [];
      if (block.callout && block.containerId !== undefined) boxStyles.set(block.containerId, block.callout.styleId);
      const around = [...(block.calloutPath ?? []), ...(block.containerId !== undefined ? [block.containerId] : [])]
        .reverse()
        .map((id) => boxStyles.get(id));
      return [block.paragraphStyleId, block.headingStyleId, block.boxDesign?.styleId, block.callout?.styleId, ...around];
    };
    const walkBlock = (block: VDTBlock) => withStyles(blockStyles(block), () => walkOneBlock(block));
    const walkOneBlock = (block: VDTBlock) => {
      if (block.hidden) return;
      const src = { start: block.sourceStart, end: block.sourceEnd };
      const heading = block.type === 'heading' || block.headingLevel !== undefined;
      if (block.designOverlay) {
        walkSlot(block.designOverlay, true, heading ? 'heading' : 'design');
        return;
      }
      const box = sheet(block.bbox, true);
      const blockStyle: TextStyle = {
        font: block.fontString,
        boldFont: block.boldFontString,
        italicFont: block.italicFontString,
        boldItalicFont: block.boldItalicFontString,
        color: block.color,
        refColor: block.refColor,
      };
      if (block.comic) {
        // A strip: its art is a picture; only its caption is text.
        const caption = block.stripCaption;
        if (caption) {
          const ground = over(caption.bar?.background, groundIn(box));
          noteLines(block.lines.slice(caption.firstLine, caption.firstLine + caption.lineCount), blockStyle, ground, () => box, 'caption', src);
        }
        picture(box);
        return;
      }
      const rb = block.resourceBlock;
      if (rb) {
        const beneath = groundIn(box);
        const table = rb.table;
        if (table) {
          for (const cell of table.cells ?? []) {
            if (cell.lines.length === 0) continue;
            const header = cell.isHeader;
            noteLines(cell.lines, {
              font: header ? table.headerFontString : table.fontString,
              boldFont: header ? table.headerBoldFontString : table.boldFontString,
              italicFont: header ? table.headerItalicFontString : table.italicFontString,
              boldItalicFont: header ? table.headerBoldItalicFontString : table.boldItalicFontString,
              color: header ? table.headerColor : table.color,
              refColor: rb.linkColor,
            }, over(tableCellFill(table, cell), beneath), () => box, 'table', src);
          }
        }
        if (rb.captionLines.length > 0) {
          noteLines(rb.captionLines, {
            font: rb.captionFontString,
            boldFont: rb.captionBoldFontString,
            italicFont: rb.captionItalicFontString,
            boldItalicFont: rb.captionBoldItalicFontString,
            color: rb.captionColor,
            refColor: rb.linkColor,
            labelColor: rb.captionLabelColor,
          }, over(rb.captionBar?.background, beneath), () => box, 'caption', src);
        }
        const noteStyle: TextStyle = {
          font: rb.noteFontString,
          boldFont: rb.noteBoldFontString,
          italicFont: rb.noteItalicFontString,
          boldItalicFont: rb.noteBoldItalicFontString,
          color: rb.noteColor,
          refColor: rb.linkColor,
        };
        if (rb.noteLines.length > 0) noteLines(rb.noteLines, noteStyle, beneath, () => box, 'caption', src);
        if (rb.continuesLines.length > 0) noteLines(rb.continuesLines, noteStyle, beneath, () => box, 'caption', src);
        // The words on the picture (#902): a plate is their ground, else the
        // halo they are read inside; with neither the ground is the picture.
        for (const label of rb.labels ?? []) {
          const layout = label.layout;
          if (!layout) continue;
          const ground = over(layout.background?.color, undefined) ?? over(layout.halo?.color, undefined);
          if (!ground) continue;
          const labelBox = label.rect ? sheet(label.rect, true) : box;
          withStyles([layout.styleId ?? label.style], () => noteLines(layout.lines, {
            font: layout.fontString,
            boldFont: layout.boldFontString,
            italicFont: layout.italicFontString,
            boldItalicFont: layout.boldItalicFontString,
            color: layout.color,
            refColor: rb.linkColor,
          }, ground, () => labelBox, 'label', { start: label.sourceStart, end: label.sourceEnd }));
        }
        return;
      }
      const role: ContrastRole = heading ? 'heading' : 'body';
      const ground = groundIn(box);
      if (block.bulletText?.trim()) {
        note(block.bulletColor ?? block.color, block.bulletFontString ?? block.fontString, block.bulletText, ground, box, 'marker', src);
      } else if (block.bulletBox) {
        // A task item's drawn box (#765) is checked as the marker it is.
        note(block.bulletColor ?? block.color, block.fontString, taskBoxText(block.bulletBox.checked), ground, box, 'marker', src);
      }
      if (block.dropCap) note(block.dropCap.color, block.dropCap.fontString, block.dropCap.text, ground, box, role, src);
      noteLines(
        block.lines,
        { ...blockStyle, boldColor: block.boldColor, italicColor: block.italicColor },
        ground,
        (line) => sheet(line.bbox, true),
        role,
        src,
      );
    };

    // In paint order: what is painted later lies over what came before.
    walkSlot(page.openerBand, true, 'design');
    for (const column of page.columns) for (const block of column.blocks) walkBlock(block);
    const inFrames = composedFrameBlockIds(page);
    for (const block of page.floats ?? []) if (!inFrames.has(block.id)) walkBlock(block);
    // A composed page (#908): its frames in layer order with the template's
    // decoration at layer 0, as the backends paint them, so frame text is
    // read on its frame's own box, else on the decoration under it, else
    // on the paper. The half of a frame read on the facing page of a
    // spread is checked there.
    // Texts over the frames (#1189) are read on what lies under them
    // then, frames included.
    const deco = page.composed?.decoration;
    const overText = (b: VDTDesignSlot['blocks'][number]): boolean => b.kind === 'text' && paintsOverFrames(b);
    for (const item of composedPaintOrder(page)) {
      if (item.kind === 'decoration') {
        walkSlot(deco && deco.blocks.some(overText) ? { ...deco, blocks: deco.blocks.filter((b) => !overText(b)) } : deco, false, 'design');
        continue;
      }
      // Connectors over the frames (#1076) are lines, not a ground, and
      // were walked with the decoration.
      if (item.kind === 'over') {
        if (deco && deco.blocks.some(overText)) walkSlot({ ...deco, blocks: deco.blocks.filter(overText) }, false, 'design');
        continue;
      }
      if (item.facing) continue;
      frameToSheet = frameMatrix(item.frame);
      withStyles([item.frame.styleId], () => {
        for (const block of item.blocks) walkBlock(block);
      });
      frameToSheet = undefined;
    }
    for (const block of page.marginNotes) walkBlock(block);
    // A comic page is pictures and lettering from edge to edge.
    if (page.comic) picture({ x: 0, y: 0, width: page.width, height: page.height });
    walkSlot(page.lineNumbers, false, 'marker');
    walkSlot(page.header, false, 'runningHead');
    walkSlot(page.footer, false, 'runningHead');
  }
  return [...pairs.values()];
}

/**
 * The text of `doc` that does not read: every text and ground pair under
 * the ratio its size, its weight and `contrast.level` ask, in the
 * renditions `contrast.mode` names (`lowContrast`, one finding per pair
 * and threshold, at its first occurrence), and in print the reversed text
 * under the sizes of `contrast.reversedText` (`reversedText`). Worst
 * ratio first. Empty when `contrast.enabled` is off.
 */
export function contrastDocument(doc: VDTDocument, options: ContrastOptions = {}): ContrastIssue[] {
  const contrast = options.contrast ?? doc.config.contrast ?? resolveContrastConfig();
  if (!contrast.enabled) return [];
  const media = options.media ?? contrastMedia(doc.config, contrast);
  const screen = media.includes('screen');
  const print = media.includes('print');
  if (!screen && !print) return [];
  const pairs = options.pairs ?? contrastPairs(doc, { ...options, contrast });
  const low = new Map<string, Extract<ContrastIssue, { kind: 'lowContrast' }>>();
  const reversed = new Map<string, Extract<ContrastIssue, { kind: 'reversedText' }>>();
  const allow = contrast.allow ?? [];

  // The finding of a pair is its first occurrence, at its smallest size.
  const merge = <T extends ContrastIssue>(into: T, pair: ContrastPair): void => {
    into.count += pair.count;
    const earlier = pair.pageIndex < into.pageIndex;
    if (pair.sizePt < into.sizePt) {
      into.sizePt = pair.sizePt;
      into.weight = pair.weight;
      into.italic = pair.italic;
    }
    if (earlier) {
      into.pageIndex = pair.pageIndex;
      into.rect = pair.rect;
      into.text = pair.text;
      into.role = pair.role;
      delete into.sourceStart;
      delete into.sourceEnd;
      if (pair.sourceStart !== undefined) into.sourceStart = pair.sourceStart;
      if (pair.sourceEnd !== undefined) into.sourceEnd = pair.sourceEnd;
    }
  };
  const base = (pair: ContrastPair) => ({
    pageIndex: pair.pageIndex,
    rect: pair.rect,
    ...(pair.sourceStart !== undefined ? { sourceStart: pair.sourceStart } : {}),
    ...(pair.sourceEnd !== undefined ? { sourceEnd: pair.sourceEnd } : {}),
    color: pair.color,
    background: pair.background,
    sizePt: pair.sizePt,
    weight: pair.weight,
    italic: pair.italic,
    role: pair.role,
    text: pair.text,
    count: pair.count,
  });
  const round = (ratio: number) => Math.floor(ratio * 100) / 100;

  for (const pair of pairs) {
    const failing: ContrastMedium[] = [];
    if (screen && pair.screen < pair.required) failing.push('screen');
    if (print && pair.print !== undefined && pair.print < pair.required) failing.push('print');
    const entry = allow.length > 0 && (failing.length > 0 || pair.reversed) ? allowEntryFor(pair, allow) : undefined;
    const accepted = entry ? acceptedBy(entry) : undefined;
    const mark = accepted ? '|accepted' : '';
    if (failing.length > 0) {
      const key = `${pair.color}|${pair.background}|${pair.required}${mark}`;
      const seen = low.get(key);
      if (seen) {
        merge(seen, pair);
      } else {
        low.set(key, {
          ...base(pair),
          kind: 'lowContrast',
          level: contrast.level,
          large: pair.large,
          required: pair.required,
          ...(screen ? { screen: round(pair.screen) } : {}),
          ...(print && pair.print !== undefined ? { print: round(pair.print) } : {}),
          failing,
          ...(accepted ? { accepted } : {}),
        });
      }
    }
    if (print && contrast.reversedText.enabled && pair.reversed) {
      const key = `${pair.color}|${pair.background}${mark}`;
      const seen = reversed.get(key);
      if (seen) {
        for (const reason of pair.reversed.reasons) if (!seen.reasons.includes(reason)) seen.reasons.push(reason);
        seen.minimumPt = Math.max(seen.minimumPt, pair.reversed.minimumPt);
        merge(seen, pair);
      } else {
        reversed.set(key, { ...base(pair), kind: 'reversedText', reasons: [...pair.reversed.reasons], minimumPt: pair.reversed.minimumPt, inks: pair.reversed.inks, ...(accepted ? { accepted } : {}) });
      }
    }
  }
  const worst = (issue: Extract<ContrastIssue, { kind: 'lowContrast' }>) => Math.min(issue.screen ?? Infinity, issue.print ?? Infinity);
  const sorted = [
    ...[...low.values()].sort((a, b) => worst(a) - worst(b) || a.pageIndex - b.pageIndex),
    ...[...reversed.values()].sort((a, b) => a.sizePt - b.sizePt || a.pageIndex - b.pageIndex),
  ];
  // The accepted findings after the others, in the same order.
  return allow.length > 0 ? [...sorted.filter((i) => !i.accepted), ...sorted.filter((i) => i.accepted)] : sorted;
}

const sameHex = (a: string | undefined, b: string): boolean => a !== undefined && a.toLowerCase() === b.toLowerCase();

/** The first `contrast.allow` entry (resolved: colours `#rrggbb` in lower
 *  case) that accepts `pair`: its colours are the text's and the ground's
 *  as written or as painted, its style one the text is set in. */
export function allowEntryFor(pair: ContrastPair, allow: readonly ContrastAllowEntry[]): ContrastAllowEntry | undefined {
  return allow.find((e) =>
    (e.fg !== undefined || e.bg !== undefined || e.style !== undefined)
    && (e.fg === undefined || sameHex(e.fg, pair.textColor) || sameHex(e.fg, pair.color))
    && (e.bg === undefined || sameHex(e.bg, pair.groundColor) || sameHex(e.bg, pair.background))
    && (e.style === undefined || (pair.styles?.includes(e.style) ?? false)));
}

function acceptedBy(entry: ContrastAllowEntry): ContrastAccepted {
  return {
    reason: entry.reason,
    ...(entry.fg !== undefined ? { fg: entry.fg } : {}),
    ...(entry.bg !== undefined ? { bg: entry.bg } : {}),
    ...(entry.style !== undefined ? { style: entry.style } : {}),
  };
}
