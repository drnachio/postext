// Measuring balloon text: font strings, tracking, composed widths and the
// measurer of a style.
import { flowTextWidth } from '../../../measure/vertical.js';
import { graphemeCount } from '../../../measure/graphemes.js';
import { buildFontString } from '../../../measure/index.js';
import { joiningScriptIn } from '../../../measure/rtl/joining.js';
import { parseRichDesignText, RichMeasurer, richFontSet, richDesignSpans } from '../../../design/richText.js';
import { type CjkDesignFonts, composesDesignAsCjk, composeCjkDesignParagraph } from '../../../design/cjkText.js';
import { type CjkComposition, getCjkComposition, setCjkComposition } from '../../../measure/cjk/cjkPunctuation.js';
import { measuresRunsAsPainted, directedTextWidth } from '../../../design/bidiText.js';
import type { InlineSpan } from '../../../parse/types.js';
import { type PreparedText, markupOf, hasMarks } from '../text.js';
import type { LetteringStyle } from '../types.js';

export interface Measurer {
  width(a: number, b: number): number;
  /** Markup of the whole text, when it is set with inline marks. */
  rich: boolean;
}

function fontSpec(style: LetteringStyle) {
  return {
    family: style.fontFamily,
    sizePx: style.fontSizePx,
    weight: style.fontWeight ?? 400,
    italic: style.italic ?? false,
  };
}

export function fontString(style: LetteringStyle): string {
  const w = style.fontWeight ?? 400;
  return buildFontString(style.fontFamily, style.fontSizePx, w === 400 ? 'normal' : String(w), style.italic ? 'italic' : 'normal');
}

/** Markup of the whole prepared text, paragraph by paragraph (a marker
 *  never runs across a forced break). */
function wholeMarkup(p: PreparedText): string {
  const parts: string[] = [];
  let a = 0;
  for (let i = 0; i <= p.text.length; i++) {
    if (i === p.text.length || p.text[i] === '\n') {
      parts.push(markupOf(p, a, i));
      a = i + 1;
    }
  }
  return parts.join('\n');
}

/** Tracking a text is set with: none for a joining script (Arabic). */
function trackingOf(p: PreparedText, style: LetteringStyle): number {
  const t = style.letterSpacing ?? 0;
  return Number.isFinite(t) && !joiningScriptIn(p.text) ? t : 0;
}

/** The composition a balloon line is measured under (#723): the
 *  document's with nothing given up and nothing added between the
 *  characters. Every mark keeps its whole width (none set in half an em,
 *  none compressed beside another mark or at an end of the line, none
 *  hung) and no space opens between Han and Latin. What is left of the
 *  composer's work on the line is the 破折号, set in two cells of one em. */
function measuringComposition(c: CjkComposition): CjkComposition {
  return { ...c, punctuationWidth: 'fullwidth', compressAdjacent: false, trimLineStart: false, hangingPunctuation: 'none', latinSpacing: { em: 0 } };
}

/**
 * The width of `text` as a line of its own that the CJK composer sets
 * (#723), undefined when the layout sets it at the font's advances.
 * `setLines` hands each chosen line to the design-text layout as a row,
 * and a row that composes as CJK (`composesDesignAsCjk`, the layout's own
 * test) goes through `composeCjkDesignParagraph`, where a 破折号 takes
 * two cells of one em whatever the face's dashes advance (#652). The line
 * is composed here by the same composer, on one unbounded line, so the
 * pair counts in the shaping what it takes on the page.
 *
 * The rest of the line is measured as before ({@link measuringComposition}):
 * a line that ends in a comma the document's composition sets in half an
 * em is still measured half an em long, and Latin inside Han text without
 * the space `cjk.latinSpacing` opens. With every line measured as set,
 * eight balloons of the published comics chose other lines and two of
 * their pages read worse; with the space alone, one caption broke its
 * title in two (the comparison of #723). A text whose lines hold no pair
 * is shaped as it was.
 */
function composedWidth(text: string, spans: () => InlineSpan[], fonts: CjkDesignFonts, pitch: number, tracking: number, flowIn: FlowMeasure): number | undefined {
  if (text.includes('\n') || !composesDesignAsCjk(text)) return undefined;
  const measureIn = (t: string, font: string): number => Math.max(0, flowIn(t, font) + tracking * graphemeCount(t));
  const own = getCjkComposition();
  setCjkComposition(measuringComposition(own));
  try {
    const lines = composeCjkDesignParagraph(spans(), fonts, undefined, pitch, tracking, measureIn);
    return lines.length === 1 ? lines[0]!.width : undefined;
  } finally {
    setCjkComposition(own);
  }
}

/** The advance of a text in a font, untracked. */
type FlowMeasure = (text: string, font: string) => number;

/**
 * How the lines a shaping tries are measured, untracked: as the layout
 * that sets the chosen ones measures them (`layoutTextElement`).
 *
 * That is `flowTextWidth`, the text whole and left to right, in a document
 * shaped in its host's language and down a column. In a document shaped
 * in its own language the layout sets a line as wide as its runs are
 * painted, each in its own direction (#770, `measuresRunsAsPainted`), and
 * the shaping measures the same: the line's bidi levels resolved at
 * `base`, the direction the balloon is set at, each run in the direction
 * it is painted in. Measured left to right, the line
 * `منارة بورثكوف، هنا «غانيت».` of an Arabic balloon in Playpen Sans
 * Arabic at 15.625 px is 176.82 px wide, and it is set and painted
 * 177.18 px wide (Chrome 154, in `ar`): its stop and its closing guillemet
 * are a run apart there, and one run with the words when painted. A line
 * with no right-to-left character at a left-to-right base is measured
 * whole either way.
 */
function flowMeasure(base: 'ltr' | 'rtl' | undefined): FlowMeasure {
  return base !== undefined && measuresRunsAsPainted() ? (t, font) => directedTextWidth(t, font, base) : flowTextWidth;
}

/** A measurer of line widths over the prepared text, in the writing mode
 *  in force (call inside `withMeasureWritingMode`). Rich text is measured
 *  through the design-text measurer of its own markup, so that what is
 *  measured is what the layout sets; a markup that does not read back to
 *  the same text falls back to plain. With `composed`, a range the layout
 *  sets with the CJK composer is measured by composing it (#723, see
 *  `composedWidth`): the shaping asks for it, the ruby does not (it
 *  places a reading along a line, and the start of a line is no line of
 *  its own). `base`: the direction the lines are set at, for a measurer
 *  of whole lines ({@link flowMeasure}); the ruby gives none. */
export function measurerFor(p: PreparedText, style: LetteringStyle, composed = false, base?: 'ltr' | 'rtl'): Measurer {
  const tracking = trackingOf(p, style);
  const pitch = style.fontSizePx * style.lineHeight;
  const memo = new Map<number, number>();
  const key = (a: number, b: number) => a * 100003 + b;
  const flowIn = flowMeasure(base);
  if (hasMarks(p)) {
    const rt = parseRichDesignText(wholeMarkup(p), fontSpec(style));
    if (rt.text === p.text) {
      const m = new RichMeasurer(rt, tracking, flowIn === flowTextWidth ? undefined : flowIn);
      const fonts = composed ? richFontSet(fontSpec(style)) : undefined;
      return {
        rich: true,
        width(a, b) {
          const k = key(a, b);
          let w = memo.get(k);
          if (w === undefined) {
            w = a >= b ? 0 : (fonts && composedWidth(p.text.slice(a, b), () => richDesignSpans(rt, a, b), fonts, pitch, tracking, flowIn)) ?? m.measure(a, b);
            memo.set(k, w);
          }
          return w;
        },
      };
    }
  }
  const font = fontString(style);
  const fonts: CjkDesignFonts | undefined = composed ? { normal: font, bold: font, italic: font, boldItalic: font } : undefined;
  return {
    rich: false,
    width(a, b) {
      const k = key(a, b);
      let w = memo.get(k);
      if (w === undefined) {
        const row = p.text.slice(a, b);
        const s = row.replace(/[\u2066-\u2069]/g, '');
        // The isolates of a line set its runs' levels and print nothing:
        // they stay in the text whose runs are resolved, as in the layout.
        w = a >= b ? 0 : (fonts && composedWidth(row, () => [{ text: row, bold: false, italic: false }], fonts, pitch, tracking, flowIn))
          ?? Math.max(0, (flowIn === flowTextWidth ? flowTextWidth(s, font) : flowIn(row, font)) + tracking * graphemeCount(s));
        memo.set(k, w);
      }
      return w;
    },
  };
}
