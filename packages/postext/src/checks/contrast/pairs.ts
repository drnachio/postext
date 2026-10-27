// The walk over a laid-out document collecting text/ground contrast pairs.
import { type BoundingBox, type VDTDocument, flowRectToPage, type VDTLine, type VDTDesignSlot, type VDTBlock, tableCellFill } from '../../vdt.js';
import { authoredCmykColors } from '../../color/authored.js';
import { resolveContrastConfig } from '../../defaults/output/contrast.js';
import { findPxSize, parseFontString } from '../../measure/fontString.js';
import { dimensionToPx } from '../../units.js';
import { taskBoxText } from '../../paint/taskBox.js';
import { composedFrameBlockIds, paintsOverFrames, composedPaintOrder, frameMatrix } from '../../composed/paint.js';
import { type Rgba, type PrintContrastContext, printLuminance, printSeparation, parseColor, blend, toHex, blendColors, isLargeText, contrastThreshold, contrastRatio, ratioOf, relativeLuminance } from './colours.js';
import type { ContrastOptions, ContrastPair, ContrastRole, ReversedTextReason } from './types.js';

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
