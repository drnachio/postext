/**
 * The parts of painting a line that carries directions (#369, #380) that
 * the body text (`blockRender.ts`) and the caption and table cell lines
 * (`renderResourceBlock.ts`) share: where `order` puts each segment, the
 * language of each segment for tagging, and the styled runs of a word set
 * in several styles.
 */
import { bidiClassOf, localeScript, type VDTLineSegment } from 'postext';
import type { Color, PDFFont } from 'pdf-lib';
import { colorFromHex, type PageCtx } from './primitives';
import type { StyledWordPart } from './shapedText';

/** The styled runs of a word (`VDTLineSegment.runs`) as ranges of its text
 *  with the face and colour each is painted in. A run in the segment's own
 *  style takes the segment's face (`font`) and colour (its own font
 *  string, a link colour); any other the face and colour `styleOf` gives
 *  its style (the block's bold face, its bold colour), the segment's face
 *  when that face is not loaded. A run's own `color` wins. */
export function wordParts(
  seg: VDTLineSegment,
  font: PDFFont,
  color: Color,
  ctx: PageCtx,
  styleOf: (bold: boolean, italic: boolean) => { font: PDFFont | undefined; color: Color },
): StyledWordPart[] {
  const parts: StyledWordPart[] = [];
  let at = 0;
  for (const run of seg.runs ?? []) {
    const own = !!run.bold === !!seg.bold && !!run.italic === !!seg.italic;
    const style = own ? undefined : styleOf(!!run.bold, !!run.italic);
    parts.push({
      start: at,
      end: at + run.text.length,
      font: style?.font ?? font,
      color: run.color !== undefined ? colorFromHex(run.color, ctx.colorSpace) : style?.color ?? color,
    });
    at += run.text.length;
  }
  return parts;
}

/** Each segment's x when the line is laid out in `order` from `startX`,
 *  each advancing by `advance`: by segment index. */
export function segmentOffsets(
  segments: readonly VDTLineSegment[],
  order: readonly number[],
  startX: number,
  advance: (seg: VDTLineSegment) => number,
): number[] {
  const xs: number[] = new Array(segments.length).fill(startX);
  let x = startX;
  for (const i of order) {
    xs[i] = x;
    x += advance(segments[i]!);
  }
  return xs;
}

/** The language a script implies, for a run of a directed line: Arabic
 *  letters `ar`, Hebrew `he`; none for any other. */
function scriptLanguage(cp: number): { lang: string; script: string } | undefined {
  if ((cp >= 0x0600 && cp <= 0x06ff) || (cp >= 0x0750 && cp <= 0x077f) || (cp >= 0x0870 && cp <= 0x08ff) || (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfefe)) {
    return { lang: 'ar', script: 'Arab' };
  }
  if ((cp >= 0x0590 && cp <= 0x05ff) || (cp >= 0xfb1d && cp <= 0xfb4f)) return { lang: 'he', script: 'Hebr' };
  return undefined;
}

/**
 * The language of each segment of a directed line, where it is not the
 * document's (`docLang`): its own `lang` when the VDT names one (a
 * `:ltr[…]{lang=en}` isolate, once the engine carries it to the segment),
 * else the one its right-to-left letters imply when the document is in
 * another script: an Arabic quotation in an English book reads as `ar`
 * (`he` for Hebrew). Arabic letters in a Persian or Urdu book are that
 * book's own and take nothing. A segment with no strong letter (digits,
 * punctuation) and a word space take the language of the words either
 * side when both have the same, so a quotation is one `Span`. Undefined
 * entries read in the document's language.
 */
export function segmentLanguages(segments: readonly VDTLineSegment[], docLang: string | undefined): Array<string | undefined> {
  const docScript = docLang ? localeScript(docLang) : undefined;
  const docPrimary = docLang?.split('-')[0]?.toLowerCase();
  // null: no strong letter (takes its neighbours'); '' the document's.
  const own = segments.map((seg): string | null => {
    if (seg.kind === 'space') return null;
    if (seg.kind !== 'text' || seg.chip) return '';
    const named = seg.lang;
    if (named) return named.split('-')[0]!.toLowerCase() === docPrimary ? '' : named;
    for (const ch of seg.text) {
      const cp = ch.codePointAt(0)!;
      const cls = bidiClassOf(cp);
      if (cls === 'L') return '';
      if (cls !== 'R' && cls !== 'AL') continue;
      const implied = scriptLanguage(cp);
      return implied && implied.script !== docScript ? implied.lang : '';
    }
    return null;
  });
  if (!own.some((l) => l)) return segments.map(() => undefined);
  return own.map((lang, i) => {
    if (lang !== null) return lang || undefined;
    let before: string | null = null;
    for (let j = i - 1; j >= 0 && before === null; j--) before = own[j]!;
    let after: string | null = null;
    for (let j = i + 1; j < own.length && after === null; j++) after = own[j]!;
    return before && before === after ? before : undefined;
  });
}
