// The book stylesheet's rules for the body text, the headings, quotations and
// lists (#1276: split out of css.ts).
import { rule, ALIGN, japaneseDecls, TRACKED_LIGATURES } from './helpers.js';
import { round, idOf } from '../inline.js';
import { dimensionToPx, type ResolvedConfig, type Dimension, type ColorValue, type ResolvedBodyTextConfig } from 'postext';
import type { StylesheetOptions, CssRule } from './types.js';

/** What createTextRules takes from bookStylesheet. */
export interface TextRulesDeps {
  config: ResolvedConfig;
  options: StylesheetOptions;
  dpi: number;
  body: ResolvedBodyTextConfig;
  bodyPx: number;
  fam: (f: string) => string;
  em: (d: Dimension, basePx?: number) => string;
  lh: (d: Dimension, fontPx: number) => string;
  color: (c: ColorValue | undefined, prop?: string) => string | undefined;
  px: (d: Dimension, basePx?: number) => number;
  spacingEm: (spacing: boolean | Dimension | undefined, lineHeight: Dimension, basePx?: number) => number;
  out: (string | CssRule)[];
}

export function createTextRules(deps: TextRulesDeps) {
  const {
    config, options, dpi, body, bodyPx, fam, em, lh, color, px, spacingEm, out
  } = deps;
  // --- body text -----------------------------------------------------------
  const hyphens = body.hyphenation.enabled;
  if (options.vertical) {
    out.push(rule('html', ['writing-mode: vertical-rl', '-epub-writing-mode: vertical-rl', '-webkit-writing-mode: vertical-rl']));
  }
  out.push(rule('body', [
    fam(body.fontFamily),
    lh(body.lineHeight, bodyPx),
    color(body.color),
    `text-align: ${ALIGN[body.textAlign] ?? 'start'}`,
    hyphens && 'hyphens: auto',
    hyphens && '-epub-hyphens: auto',
    hyphens && '-webkit-hyphens: auto',
    body.fontWeight !== 400 && `font-weight: ${body.fontWeight}`,
    // CSS names the two rules the other way round (#717): `orphans` is
    // the lines a paragraph keeps at the foot of a page (the engine's
    // `avoidWidows`), `widows` the lines at the head of the next (its
    // `avoidOrphans`). A rule that is off writes 1: the initial value of
    // both properties is 2, so leaving one out would keep the rule.
    `orphans: ${body.avoidWidows ? Math.max(1, body.widowMinLines) : 1}`,
    `widows: ${body.avoidOrphans ? Math.max(1, body.orphanMinLines) : 1}`,
    'margin: 0',
    'padding: 0 1em',
    ...japaneseDecls(config.cjk),
  ]));
  const indent = px(body.firstLineIndent);
  const ratio = round(dimensionToPx(body.lineHeight, dpi, bodyPx) / bodyPx);
  const spacing = spacingEm(body.paragraphSpacing, body.lineHeight);
  out.push(rule('p', [
    'margin: 0',
    spacing === 0 && indent > 0 && `text-indent: ${round(indent / bodyPx)}em`,
    spacing > 0 && `margin-block-end: ${spacing}em`,
  ]));
  if (spacing === 0 && indent > 0) {
    // The first paragraph after a heading, a list, a figure… is not
    // indented (unless the book indents after headings).
    const after = ['ul', 'ol', 'blockquote', 'figure', 'div', 'aside', 'nav', 'section > p:first-child'];
    if (!body.indentAfterHeading) after.unshift('h1', 'h2', 'h3', 'h4', 'h5', 'h6');
    out.push(rule(after.map((s) => (s.includes(' ') ? s : `${s} + p`)).join(', '), ['text-indent: 0']));
  }
  out.push(rule('strong, b', [`font-weight: ${body.boldFontWeight}`, color(body.boldColor)]));
  out.push(rule('em, i', [color(body.italicColor)]));
  out.push(rule('a', ['color: inherit', 'text-decoration: underline']));
  out.push(rule('a.pt-ref', [
    color(body.referenceColor),
    'text-decoration: none',
    body.referenceBold && `font-weight: ${body.boldFontWeight}`,
    body.referenceItalic && 'font-style: italic',
  ]));
  out.push(rule('a.pt-pageref', ['text-decoration: none']));
  out.push(rule('sup, sub', ['line-height: 0', 'font-size: 0.7em']));

  // --- headings ------------------------------------------------------------
  const headings = config.headings;
  /** The body's line pitch, px: a 行取り heading (`lineSpan`, #424) takes
   *  whole numbers of it. */
  const bodyLinePx = body.lineHeight.unit === 'em' || body.lineHeight.unit === 'rem'
    ? body.lineHeight.value * bodyPx
    : px(body.lineHeight);
  for (const level of headings.levels) {
    if (level.level < 1 || level.level > 6) continue;
    const hPx = px(level.fontSize);
    // 行取り: the heading's line centred in N body lines, its margins the
    // rest of them (a reflowable book has no grid to keep).
    const lineSpanMargin = level.lineSpan !== undefined
      ? Math.max(0, (level.lineSpan * bodyLinePx - (level.lineHeight.unit === 'em' || level.lineHeight.unit === 'rem' ? level.lineHeight.value * hPx : px(level.lineHeight, hPx))) / 2)
      : undefined;
    out.push(rule(`h${level.level}`, [
      fam(level.fontFamily || headings.fontFamily),
      `font-size: ${round(hPx / bodyPx)}em`,
      lh(level.lineHeight, hPx),
      `font-weight: ${level.fontWeight}`,
      `font-style: ${level.italic ? 'italic' : 'normal'}`,
      color(level.color),
      `text-align: ${ALIGN[headings.textAlign] ?? 'start'}`,
      level.letterSpacing.value !== 0 && `letter-spacing: ${em(level.letterSpacing, hPx)}`,
      level.letterSpacing.value !== 0 && TRACKED_LIGATURES,
      level.textTransform === 'uppercase' && 'text-transform: uppercase',
      lineSpanMargin !== undefined
        ? `margin: ${round(lineSpanMargin / hPx)}em 0`
        : `margin: ${round(px(level.marginTop, hPx) / hPx)}em 0 ${round(px(level.marginBottom, hPx) / hPx)}em`,
      // 字下げ: the indent counts body characters.
      level.indent && px(level.indent) > 0 && `margin-inline-start: ${round(px(level.indent) / hPx)}em`,
      'hyphens: manual',
      '-epub-hyphens: manual',
      'page-break-after: avoid',
      'break-after: avoid',
    ]));
  }
  for (const style of config.headingStyles) {
    const o = style.overrides;
    const sPx = o.fontSize ? px(o.fontSize) : undefined;
    out.push(rule(`.${idOf('hs-', style.id)}`, [
      o.fontFamily && fam(o.fontFamily),
      sPx !== undefined && `font-size: ${round(sPx / bodyPx)}em`,
      o.fontWeight !== undefined && `font-weight: ${o.fontWeight}`,
      o.italic !== undefined && `font-style: ${o.italic ? 'italic' : 'normal'}`,
      o.color && color(o.color),
      o.textTransform && `text-transform: ${o.textTransform === 'uppercase' ? 'uppercase' : 'none'}`,
    ]));
  }
  out.push(rule('.pt-part-title', ['text-align: center', 'margin-block-start: 3em']));
  out.push(rule('.pt-part-number', ['display: block', 'font-size: 0.6em', 'margin-block-end: 0.5em']));
  out.push(rule('.pt-hidden', [
    'position: absolute',
    'width: 1px',
    'height: 1px',
    'overflow: hidden',
    'clip: rect(0 0 0 0)',
    'white-space: nowrap',
  ]));

  // --- quotations, lists ---------------------------------------------------
  const bq = body.blockquote;
  out.push(rule('blockquote', [
    `margin: ${ratio / 2}em 0`,
    `margin-inline-start: ${em(bq.indent)}`,
    color(bq.color),
    bq.italic && 'font-style: italic',
  ]));
  if (bq.italic) out.push(rule('blockquote em', ['font-style: normal']));
  const ul = config.unorderedLists;
  const ol = config.orderedLists;
  out.push(rule('ul, ol', [
    'list-style: none',
    `margin: ${em(ol.marginTop)} 0 ${em(ol.marginBottom)}`,
    'padding-inline-start: 1.6em',
    'text-indent: 0',
  ]));
  out.push(rule('li', [ol.itemSpacing.value > 0 && `margin-block-start: ${em(ol.itemSpacing)}`]));
  out.push(rule('li li', ['margin-block-start: 0']));
  out.push(rule('li > .pt-lbl:first-child', [
    'display: inline-block',
    'min-width: 1.6em',
    'margin-inline-start: -1.6em',
    'text-indent: 0',
  ]));
  out.push(rule('ul > li > .pt-lbl:first-child', [color(ul.color), ul.fontWeight !== body.fontWeight && `font-weight: ${ul.fontWeight}`]));
  out.push(rule('ol > li > .pt-lbl:first-child', [color(ol.color), ol.fontWeight !== body.fontWeight && `font-weight: ${ol.fontWeight}`]));
  out.push(rule('.pt-done', ['text-decoration: line-through']));
  return {
  };
}
