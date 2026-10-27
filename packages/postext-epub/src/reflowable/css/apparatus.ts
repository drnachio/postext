// The book stylesheet's rules for notes, contents, bibliography and index,
// maths, chips, swatches, scores, exercises and the Chinese and Japanese marks
// (#1276: split out of css.ts).
import { rule, ALIGN, dotsRule } from './helpers.js';
import { round, idOf } from '../inline.js';
import type { ResolvedConfig, Dimension, ColorValue, ResolvedBodyTextConfig } from 'postext';
import type { StylesheetOptions, CssRule } from './types.js';

/** What createApparatusRules takes from bookStylesheet. */
export interface ApparatusRulesDeps {
  config: ResolvedConfig;
  options: StylesheetOptions;
  dpi: number;
  body: ResolvedBodyTextConfig;
  bodyPx: number;
  fam: (f: string) => string;
  lh: (d: Dimension, fontPx: number) => string;
  color: (c: ColorValue | undefined, prop?: string) => string | undefined;
  px: (d: Dimension, basePx?: number) => number;
  out: (string | CssRule)[];
}

export function createApparatusRules(deps: ApparatusRulesDeps) {
  const {
    config, options, dpi, body, bodyPx, fam, lh, color, px, out
  } = deps;
  // --- notes, contents, bibliography, index -------------------------------
  const fn = config.footnotes;
  const fnPx = px(fn.fontSize);
  out.push(rule('.pt-footnotes', ['margin-block-start: 2em', 'border-block-start: 1px solid currentColor', 'padding-block-start: 0.5em']));
  out.push(rule('aside.pt-footnote', [
    `font-size: ${round(fnPx / bodyPx)}em`,
    lh(fn.lineHeight, fnPx),
    color(fn.color),
    fn.textAlign && `text-align: ${ALIGN[fn.textAlign] ?? 'start'}`,
    `margin-block-end: ${round(px(fn.spaceBetween, fnPx) / fnPx)}em`,
  ]));
  out.push(rule('aside.pt-footnote p', ['text-indent: 0']));
  out.push(rule('a.pt-noteref', ['text-decoration: none', color(body.referenceColor)]));
  out.push(rule('a[role="doc-backlink"]', ['text-decoration: none']));
  out.push(rule('nav.pt-toc ol', ['list-style: none', 'padding-inline-start: 0']));
  out.push(rule('nav.pt-toc li', ['margin-block-start: 0.3em']));
  out.push(rule('nav.pt-toc a', ['text-decoration: none', 'color: inherit']));
  out.push(rule('nav.pt-toc li > .pt-lbl:first-child', ['margin-inline-start: 0', 'min-width: 2em']));
  out.push(rule('.pt-toc-part', ['font-weight: bold', 'margin-block-start: 0.8em']));
  out.push(rule('.pt-toc-subtitle', ['font-style: italic', 'font-size: 0.9em']));
  out.push(rule('p.pt-bib', ['padding-inline-start: 2em', 'text-indent: -2em', 'margin-block-end: 0.3em']));
  out.push(rule('p.pt-index-group', ['font-weight: bold', 'text-indent: 0', 'margin-block-start: 1em', 'page-break-after: avoid', 'break-after: avoid']));
  // Index entries hang their turnover lines, and a sub-entry sits one
  // indent in per level, both in the index's own em.
  const ix = config.index;
  const ixPx = px(ix.fontSize);
  const turnover = round(px(ix.turnoverIndent, ixPx) / ixPx);
  const step = round(px(ix.indent, ixPx) / ixPx);
  out.push(rule('p.pt-index-entry', [
    ixPx !== bodyPx && `font-size: ${round(ixPx / bodyPx)}em`,
    `padding-inline-start: ${turnover}em`,
    `text-indent: -${turnover}em`,
    'text-align: start',
    'hyphens: manual',
  ]));
  for (const level of [1, 2, 3]) {
    out.push(rule(`p.pt-index-l${level}`, [`margin-inline-start: ${round(step * level)}em`]));
  }

  // --- maths, chips, swatches, Chinese marks ------------------------------
  out.push(rule('.pt-math-display', ['text-align: center', 'margin: 0.5em 0', 'text-indent: 0', 'overflow-x: auto']));
  // Music scores (#1172): systems as wide as the column, a little air
  // between two.
  out.push(rule('.pt-score', ['margin: 0.75em 0', 'text-indent: 0']));
  out.push(rule('.pt-score-system', ['display: block', 'width: 100%', 'height: auto', 'margin: 0 0 0.4em']));
  out.push(rule('.pt-math svg', ['display: inline']));
  out.push(rule('.pt-swatch', ['display: inline-block', 'width: 0.8em', 'height: 0.8em', 'border: 1px solid currentColor', 'vertical-align: baseline']));
  out.push(rule('.pt-chip', ['display: inline-block', 'padding: 0 0.3em', 'border-radius: 0.2em', 'text-indent: 0', 'line-height: 1.2']));
  for (const c of config.chipStyles) {
    const cPx = c.fontSize ? px(c.fontSize) : bodyPx;
    out.push(rule(`.${idOf('pt-chip-', c.id)}`, [
      c.backgroundEnabled && color(c.background, 'background-color'),
      // A blank to write on (#1227) is underlined, not boxed.
      px(c.borderWidth) > 0 && `${c.underline ? 'border-bottom' : 'border'}: ${round(px(c.borderWidth) * (96 / dpi))}px ${c.underline ?? 'solid'} ${c.borderColor.hex}`,
      px(c.borderRadius) > 0 && `border-radius: ${round(px(c.borderRadius, cPx) / cPx)}em`,
      `padding: ${round(px(c.paddingY, cPx) / cPx)}em ${round(px(c.paddingX, cPx) / cPx)}em`,
      c.fontFamily && fam(c.fontFamily),
      c.fontSize && `font-size: ${round(cPx / bodyPx)}em`,
      c.color && color(c.color),
      c.bold && 'font-weight: bold',
      c.italic && 'font-style: italic',
    ]));
  }
  // Exercises (#1231): a blank holds its input, a drawn box its picture
  // (and, the script running, the controls laid over it); the answer key
  // for a reader with no script follows the exercise.
  out.push(rule('.pt-ex-slot', ['position: relative']));
  out.push(rule('.pt-ex-blank', ['height: 1.2em', 'vertical-align: -0.25em']));
  out.push(rule('.pt-ex-blank > input', ['box-sizing: border-box', 'width: 100%', 'height: 100%', 'margin: 0', 'padding: 0', 'border: 0', 'background: transparent', 'color: inherit', 'font: inherit', 'text-align: center']));
  out.push(rule('.pt-ex-drawn', ['position: relative', 'margin: 0.4em 0', 'text-indent: 0', 'max-width: 100%']));
  out.push(rule('.pt-ex-drawn > svg', ['display: block', 'overflow: visible', 'width: 100%', 'height: auto']));
  out.push(rule('.pt-ex-static', ['margin: 0.6em 0 0', 'font-size: 0.9em', 'text-indent: 0']));
  out.push(rule('.pt-ex-static > summary', ['cursor: pointer']));
  out.push(rule('.pt-sc', ['font-variant: small-caps']));
  out.push(rule('.pt-dots', ['font-style: normal', 'text-emphasis: filled dot', '-epub-text-emphasis-style: filled dot', '-webkit-text-emphasis-style: filled dot', 'text-emphasis-position: under right', '-webkit-text-emphasis-position: under right']));
  // Other shapes and sides (the Japanese sesame over the text, #428),
  // sorted so the stylesheet is the same whatever order they were read in.
  for (const cls of [...(options.dots ?? [])].sort()) out.push(dotsRule(cls));
  out.push(rule('.pt-proper', ['text-decoration: underline']));
  out.push(rule('.pt-book', ['text-decoration: underline wavy']));
  // Side lines (傍線): under horizontal text and left of vertical text, or
  // over and right of it; one unbroken line, descenders and all.
  const underSide = ['text-underline-position: under left', '-epub-text-underline-position: under left', '-webkit-text-underline-position: under left'];
  out.push(rule('.pt-side', ['text-decoration-line: underline', 'text-decoration-skip-ink: none', ...underSide]));
  out.push(rule('.pt-side.pt-side-over', ['text-decoration-line: overline']));
  for (const style of ['double', 'wavy', 'dotted']) out.push(rule(`.pt-side.pt-side-${style}`, [`text-decoration-style: ${style}`]));
  out.push(rule('.pt-tcy', ['text-combine-upright: all', '-epub-text-combine: horizontal', '-webkit-text-combine: horizontal']));
  out.push(rule('.pt-upright', ['text-orientation: upright', '-epub-text-orientation: upright', '-webkit-text-orientation: upright']));
  out.push(rule('.pt-sideways', ['text-orientation: sideways', '-epub-text-orientation: sideways', '-webkit-text-orientation: sideways']));
  out.push(rule('.pt-warichu', ['font-size: 0.6em']));
  out.push(rule('ruby.pt-ruby-under', ['ruby-position: under', '-epub-ruby-position: under', '-webkit-ruby-position: after']));
  out.push(rule('ruby.pt-ruby-right', ['ruby-position: inter-character']));
  // Kanbun marks (訓点): half size, the 送り仮名 raised (right of vertical
  // text) and the 返り点 lowered (left of it), after their character.
  out.push(rule('.pt-okuri, .pt-kaeri', ['font-size: 0.5em', 'line-height: 0']));
  out.push(rule('.pt-okuri', ['vertical-align: super']));
  out.push(rule('.pt-kaeri', ['vertical-align: sub']));
  out.push(rule('.pt-marker', ['height: 0']));
  // Japanese note markers (JLReq §4.2.3), only in a book that sets them.
  // In the line gap: a box of no advance, its text running back from it
  // (right to left, inline-start being the end), its baseline raised past
  // the text's em box (0.88 em over its baseline) without growing the
  // line. Right of a vertical line: reduced, its box against
  // the line's right side.
  const marker = config.footnotes.markerPosition;
  if (marker === 'side' || marker === 'right') {
    const size = config.footnotes.markerSize;
    const em = size.unit === 'em' || size.unit === 'rem' ? size.value : px(size) / bodyPx;
    if (marker === 'side') {
      out.push(rule('.pt-note-side', ['display: inline-block', 'inline-size: 0', 'direction: rtl', 'white-space: nowrap', 'line-height: 0', `font-size: ${round(em)}em`, `vertical-align: ${round(0.88 / em + 0.12)}em`]));
      out.push(rule('.pt-note-side > span', ['direction: ltr', 'unicode-bidi: isolate']));
    } else {
      out.push(rule('.pt-note-right', [`font-size: ${round(em)}em`, 'vertical-align: text-top', 'line-height: 0']));
    }
  }
  return {
  };
}
