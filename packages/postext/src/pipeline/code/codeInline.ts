/**
 * Inline code in a code face (#624, `codeStyle.inline`): the characters of
 * a block's `` `x` `` spans (`ContentBlock.inlineCode`, source ranges)
 * become chips set in the code face, at the size, colour and fill the
 * style gives, each one unit as a chip is. A chip span keeps the code's
 * characters as its text, so the block's plain text and source map stay
 * as they are. Without `codeStyle.inline` inline code is set in the text's
 * face, as before #624.
 */

import type { ChipBox, ContentBlock, InlineSpan } from '../../parse/index.js';
import type { ResolvedInlineCodeStyleConfig } from '../../types.js';
import type { ResolvedConfig } from '../../vdt.js';
import { sliceSpan } from '../../parse/links.js';
import { computeSourceMap } from '../../parse/sourceMapping.js';
import { setsObject } from '../../measure/rich.js';
import { dimensionToPx } from '../../units.js';

/** Style id of an inline code chip: no chip style can name it. */
export const INLINE_CODE_CHIP_STYLE = '__postext-code';

/** The chip box of inline code in text of `fontSizePx`. */
function inlineCodeBox(inline: ResolvedInlineCodeStyleConfig, dpi: number, fontSizePx: number): ChipBox {
  const sizePx = dimensionToPx(inline.fontSize, dpi, fontSizePx);
  const px = (d: Parameters<typeof dimensionToPx>[0]) => Math.max(0, dimensionToPx(d, dpi, sizePx));
  const borderWidthPx = inline.borderColor ? px(inline.borderWidth) : 0;
  return {
    styleId: INLINE_CODE_CHIP_STYLE,
    fontFamily: inline.fontFamily,
    fontSizePx: sizePx,
    bold: inline.bold,
    italic: inline.italic,
    ...(inline.color ? { color: inline.color.hex } : {}),
    ...(inline.background ? { background: inline.background.hex } : {}),
    ...(borderWidthPx > 0 && inline.borderColor ? { borderColor: inline.borderColor.hex } : {}),
    borderWidthPx,
    borderRadiusPx: px(inline.borderRadius),
    paddingXPx: px(inline.paddingX),
    paddingYPx: px(inline.paddingY),
    gapPx: 0,
    direction: 'ltr',
  };
}

/**
 * `block` (the block being measured: `raw` with its heading number, its
 * capitals…) with the characters of its inline code set as code chips,
 * when `codeStyle.inline` is set and the block has inline code. `raw` is
 * the parsed block, whose source map tells which characters were written
 * between backticks.
 */
export function withInlineCode(block: ContentBlock, raw: ContentBlock, resolved: ResolvedConfig, fontSizePx: number): ContentBlock {
  const ranges = raw.inlineCode;
  const inline = resolved.codeStyle?.inline;
  if (!ranges || ranges.length === 0 || !inline) return block;
  const prefix = block.text.length - raw.text.length;
  const map = raw.sourceMap;
  const spans = codeChipSpans(block.spans, (p) => {
    const i = p - prefix;
    if (i < 0 || i >= map.length) return false;
    const at = map[i]!;
    return ranges.some((r) => at >= r.start && at < r.end);
  }, inlineCodeBox(inline, resolved.page.dpi, fontSizePx), inline.otherScripts === 'text');
  return spans === block.spans ? block : { ...block, spans };
}

/** Inline code between two backticks on one line, outside an escape, as
 *  the block parser reads it. */
const SNIPPET_CODE_RE = /(?<!\\)`([^`\n]+?)`/g;

/**
 * The spans of an inline snippet (a table cell, a caption, a note) with the
 * characters of its inline code set as code chips, when `inline` is set and
 * `content` (the snippet as written, which `spans` were parsed from) has
 * inline code. Run on the spans {@link parseInlineSnippetSpans} returns,
 * before formulas and references are resolved.
 */
export function withSnippetInlineCode(
  spans: InlineSpan[],
  content: string,
  inline: ResolvedInlineCodeStyleConfig | undefined,
  dpi: number,
  fontSizePx: number,
): InlineSpan[] {
  if (!inline || !content.includes('`')) return spans;
  const ranges: Array<{ start: number; end: number }> = [];
  SNIPPET_CODE_RE.lastIndex = 0;
  for (let m = SNIPPET_CODE_RE.exec(content); m; m = SNIPPET_CODE_RE.exec(content)) {
    ranges.push({ start: m.index + 1, end: m.index + 1 + m[1]!.length });
  }
  if (ranges.length === 0) return spans;
  const map = computeSourceMap(content, 0, content.length, spans.map((s) => s.text).join(''));
  return codeChipSpans(spans, (p) => {
    const at = map[p];
    return at !== undefined && ranges.some((r) => at >= r.start && at < r.end);
  }, inlineCodeBox(inline, dpi, fontSizePx), inline.otherScripts === 'text');
}

/** The spans of one run of inline code: a chip per piece between its
 *  inner spaces, each space a code space a line may break at (#845), so a
 *  long piece of code never leaves a line it cannot fill. A hyphen between
 *  a letter or digit and a letter (`simp-chinese-informal`) is a place to
 *  break too, behind an empty code space: the hyphen stays the code's, and
 *  none is added. Spaces that open or close the run stay inside its first
 *  or last piece. */
function codePieces(span: InlineSpan, text: string, box: ChipBox, textFace: boolean): InlineSpan[] {
  const chip = (t: string, joinNext: boolean): InlineSpan => ({
    text: t, bold: span.bold, italic: span.italic,
    chip: { style: INLINE_CODE_CHIP_STYLE, spans: textFace ? codeWords(t) : [{ text: t, bold: false, italic: false }], box, ...(joinNext ? { joinNext: true } : {}) },
  });
  const parts = /^(\s*)(.*?)(\s*)$/s.exec(text)!;
  const inner = parts[2]!.split(/( +)|(?<=[\p{L}\p{N}]-)(?=\p{L})/u).map((t) => t ?? '');
  if (inner.length === 1) return [chip(text, false)];
  inner[0] = parts[1]! + inner[0]!;
  inner[inner.length - 1] = inner[inner.length - 1]! + parts[3]!;
  const out: InlineSpan[] = [];
  for (let i = 0; i < inner.length; i += 2) {
    const last = i === inner.length - 1;
    out.push(chip(inner[i]!, !last));
    if (!last) out.push({ text: inner[i + 1]!, bold: span.bold, italic: span.italic, codeSpace: box });
  }
  return out;
}

/** Letters a code face does not carry: Arabic, Hebrew, Syriac and Thaana,
 *  and Chinese, Japanese and Korean, with their full-width marks. */
const TEXT_FACE_RE = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}\u3000-\u303f\uff00-\uffef]/u;
const MARK_RE = /\p{M}/u;

/** The words of a piece of code: one span, or, when it holds letters a
 *  code face does not carry (an Arabic word in `:index[…]`, kanji in a
 *  ruby), a span per run, those runs set in the text's face (#845). A
 *  combining mark goes with the letter before it. */
function codeWords(text: string): InlineSpan[] {
  if (!TEXT_FACE_RE.test(text)) return [{ text, bold: false, italic: false }];
  const out: InlineSpan[] = [];
  let run = '';
  let face = false;
  for (const ch of text) {
    const own: boolean = MARK_RE.test(ch) && run ? face : TEXT_FACE_RE.test(ch);
    if (run && own !== face) {
      out.push({ text: run, bold: false, italic: false, ...(face ? { textFace: true } : {}) });
      run = '';
    }
    face = own;
    run += ch;
  }
  if (run) out.push({ text: run, bold: false, italic: false, ...(face ? { textFace: true } : {}) });
  return out;
}

/** `spans` with every run of characters `isCode` names (by offset in the
 *  spans' joined text) set as one code chip in `box`; `spans` itself when
 *  none is. Objects (formulas, references, chips…) stay as they are. */
function codeChipSpans(spans: InlineSpan[], isCode: (p: number) => boolean, box: ChipBox, textFace: boolean): InlineSpan[] {
  const out: InlineSpan[] = [];
  let at = 0;
  let changed = false;
  for (const span of spans) {
    const len = span.text.length;
    if (setsObject(span) || span.tab || span.inserted || len === 0) {
      out.push(span);
      at += len;
      continue;
    }
    let k = 0;
    while (k < len) {
      const code = isCode(at + k);
      let j = k + 1;
      while (j < len && isCode(at + j) === code) j++;
      if (!code) {
        out.push(k === 0 && j === len ? span : sliceSpan(span, k, j));
      } else {
        out.push(...codePieces(span, span.text.slice(k, j), box, textFace));
        changed = true;
      }
      k = j;
    }
    at += len;
  }
  return changed ? out : spans;
}
