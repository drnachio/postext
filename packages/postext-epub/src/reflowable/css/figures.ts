// The book stylesheet's rules for figures, picture labels, comic pages,
// tables and captions (#1276: split out of css.ts).
import { rule, ALIGN, TRACKED_LIGATURES } from './helpers.js';
import { round, idOf } from '../inline.js';
import type { ColorValue, ResolvedTableStyleConfig, Dimension, ResolvedConfig } from 'postext';
import type { StylesheetOptions, CssRule } from './types.js';

/** What createFigureRules takes from bookStylesheet. */
export interface FigureRulesDeps {
  config: ResolvedConfig;
  options: StylesheetOptions;
  dpi: number;
  bodyPx: number;
  fam: (f: string) => string;
  em: (d: Dimension, basePx?: number) => string;
  color: (c: ColorValue | undefined, prop?: string) => string | undefined;
  px: (d: Dimension, basePx?: number) => number;
  out: (string | CssRule)[];
}

export function createFigureRules(deps: FigureRulesDeps) {
  const {
    config, options, dpi, bodyPx, fam, em, color, px, out
  } = deps;
  // --- figures, tables, captions ------------------------------------------
  const cap = config.captionStyle;
  const capPx = px(cap.fontSize);
  out.push(rule('figure', ['margin: 1em 0', 'text-align: center', 'page-break-inside: avoid', 'break-inside: avoid']));
  out.push(rule('figure img', ['max-width: 100%', 'height: auto']));
  // The labels drawn over a picture (#955): a box as wide as the image,
  // the SVG laid over all of it.
  if (options.labelLayers) {
    out.push(rule('.pt-labelled', ['display: inline-block', 'position: relative', 'max-width: 100%', 'line-height: 0']));
    out.push(rule('.pt-label-layer', ['position: absolute', 'left: 0', 'top: 0', 'width: 100%', 'height: 100%', 'pointer-events: none']));
  }
  out.push(rule('figure video', ['width: 100%', 'height: auto', 'background-color: #000']));
  // Comic pages (#565): each panel's picture as wide as the text at most,
  // its lettering under it as plain lines.
  out.push(rule('.pt-comic', ['margin: 1em 0']));
  out.push(rule('.pt-comic-panel', ['margin: 1em 0 0.5em']));
  out.push(rule('.pt-comic-panel svg', ['display: block', 'max-width: 100%', 'height: auto', 'margin: 0 auto']));
  out.push(rule('.pt-comic p', ['text-indent: 0', 'margin: 0.25em 0']));
  out.push(rule('a.pt-video-link', ['display: block']));
  out.push(rule('figcaption, caption', [
    fam(cap.fontFamily),
    `font-size: ${round(capPx / bodyPx)}em`,
    color(cap.color),
    `text-align: ${ALIGN[cap.align] ?? 'start'}`,
    cap.descriptionItalic && 'font-style: italic',
    cap.backgroundEnabled && color(cap.background, 'background-color'),
    cap.backgroundEnabled && `padding: ${round(px(cap.padding, capPx) / capPx)}em`,
    `margin: ${round(px(cap.gap, capPx) / capPx)}em 0`,
    'hyphens: manual',
  ]));
  out.push(rule('caption.pt-caption-below', ['caption-side: bottom']));
  out.push(rule('.pt-label', [
    color(cap.labelColor),
    cap.labelBold ? 'font-weight: bold' : undefined,
    `font-style: ${cap.labelItalic ? 'italic' : 'normal'}`,
  ]));
  const note = cap.note;
  out.push(rule('.pt-note', [
    `font-size: ${em(note.fontSize)}`,
    color(note.color),
    `font-style: ${note.italic ? 'italic' : 'normal'}`,
    `text-align: ${ALIGN[note.align] ?? 'start'}`,
    'text-indent: 0',
  ]));
  out.push(rule('figcaption .pt-note', ['display: block', `margin-block-start: ${em(note.gap, px(cap.fontSize))}`]));
  out.push(rule('.pt-missing', ['border: 1px dashed currentColor', 'padding: 1em', 'font-style: italic']));

  const ts = config.tableStyle;
  /** A rule `widthPx` (at the page dpi) wide, in CSS px. */
  const line = (widthPx: number, c: ColorValue) => `${round(Math.max(0.5, widthPx * (96 / dpi)))}px solid ${c.hex}`;
  /** What a table style decides, by element: on `table` for the document's
   *  style; on `table.pt-table-<id>` for a named one (#625), which then
   *  also undoes what the document's style (`reset`) sets and it does not. */
  const tableStyleDecls = (st: ResolvedTableStyleConfig, reset: ResolvedTableStyleConfig | undefined) => {
    const cellPx = px(st.bodyFontSize);
    const booktabs = st.borders && st.rules === 'booktabs';
    const border = st.borders && st.rules !== 'none' && !booktabs && px(st.borderWidth) > 0
      ? line(px(st.borderWidth), st.borderColor)
      : undefined;
    const tableBorder = border !== undefined && (st.rules === 'outer' || st.rules === 'grid');
    // Booktabs: a heavy rule above and under the table, a light one under
    // the header and, under a head spanning columns above the last header
    // row, a span rule, trimmed at both ends by a background line (a CSS
    // border cannot be).
    const width = (d: Dimension) => {
      const v = px(d, cellPx);
      return booktabs && v > 0 ? Math.max(0.25, v) : 0;
    };
    const heavy = width(st.heavyRuleWidth);
    const light = width(st.lightRuleWidth);
    const span = st.spanRules !== 'none' ? width(st.spanRuleWidth) : 0;
    const wasBooktabs = reset?.borders === true && reset.rules === 'booktabs';
    const extra: [string, (string | false | undefined)[]][] = [];
    if (light > 0) extra.push(['thead', [`border-bottom: ${line(light, st.borderColor)}`]]);
    else if (wasBooktabs) extra.push(['thead', ['border-bottom: none']]);
    const spanSel = 'thead > tr:not(:last-child) > th[colspan]';
    if (span > 0 && st.spanRules === 'trimmed') {
      extra.push([spanSel, [
        `background-image: linear-gradient(${st.borderColor.hex}, ${st.borderColor.hex})`,
        'background-repeat: no-repeat',
        'background-position: center bottom',
        `background-size: calc(100% - ${round(2 * (px(st.spanRuleTrim, cellPx) / cellPx))}em) ${round(Math.max(0.5, span * (96 / dpi)))}px`,
      ]]);
    } else {
      if (span > 0) extra.push([spanSel, [`border-bottom: ${line(span, st.borderColor)}`]]);
      if (wasBooktabs && reset!.spanRules === 'trimmed') extra.push([spanSel, ['background-image: none']]);
    }
    if (st.groupRules && light > 0) {
      extra.push(['tbody > tr.pt-group:not(:first-child) > *', [`border-top: ${line(light, st.borderColor)}`]]);
    }
    return {
      table: [
        reset && fam(st.bodyFontFamily),
        reset && `font-size: ${round(cellPx / bodyPx)}em`,
        reset && color(st.bodyColor),
        tableBorder ? `border: ${border}` : reset && 'border: none',
        heavy > 0 && `border-top: ${line(heavy, st.borderColor)}`,
        heavy > 0 && `border-bottom: ${line(heavy, st.borderColor)}`,
      ],
      cells: [
        reset && `padding: ${round(px(st.cellPadding, cellPx) / cellPx)}em`,
        border && st.rules === 'grid' ? `border: ${border}` : undefined,
        border && st.rules === 'horizontal' ? `border-block: ${border}` : undefined,
        reset && !(border && (st.rules === 'grid' || st.rules === 'horizontal')) && 'border: none',
      ],
      td: [st.bodyBackgroundEnabled ? color(st.bodyBackground, 'background-color') : reset && 'background-color: transparent'],
      alt: st.bodyAlternateBackgroundEnabled ? [color(st.bodyAlternateBackground, 'background-color')] : undefined,
      th: [
        fam(st.headerFontFamily),
        `font-size: ${round(px(st.headerFontSize) / cellPx)}em`,
        color(st.headerColor),
        `font-weight: ${st.headerBold ? 'bold' : 'normal'}`,
        st.headerItalic ? 'font-style: italic' : reset && 'font-style: normal',
        st.headerTextTransform === 'uppercase' ? 'text-transform: uppercase' : reset && 'text-transform: none',
        st.headerLetterSpacing.value !== 0 ? `letter-spacing: ${round(px(st.headerLetterSpacing, cellPx) / cellPx)}em` : reset && 'letter-spacing: normal',
        st.headerLetterSpacing.value !== 0 && TRACKED_LIGATURES,
        st.headerBackgroundEnabled ? color(st.headerBackground, 'background-color') : reset && 'background-color: transparent',
      ],
      extra,
    };
  };
  const bodyCellPx = px(ts.bodyFontSize);
  const base = tableStyleDecls(ts, undefined);
  out.push(rule('.pt-table', ['margin: 1em 0', 'overflow-x: auto']));
  out.push(rule('table', [
    'border-collapse: collapse',
    'margin: 0 auto',
    'max-width: 100%',
    fam(ts.bodyFontFamily),
    `font-size: ${round(bodyCellPx / bodyPx)}em`,
    color(ts.bodyColor),
    'text-indent: 0',
    'hyphens: manual',
    ...base.table,
  ]));
  out.push(rule('th, td', [
    `padding: ${round(px(ts.cellPadding, bodyCellPx) / bodyCellPx)}em`,
    'vertical-align: top',
    'text-align: start',
    ...base.cells,
  ]));
  out.push(rule('td', base.td));
  if (base.alt) out.push(rule('td.pt-alt', base.alt));
  out.push(rule('th', base.th));
  for (const [sel, decls] of base.extra) out.push(rule(sel, decls));
  for (const st of config.tableStyles ?? []) {
    const table = `table.${idOf('pt-table-', st.id)}`;
    const sub = (sel: string) => sel.split(', ').map((x) => `${table} ${x}`).join(', ');
    const d = tableStyleDecls(st, ts);
    out.push(rule(table, d.table));
    out.push(rule(sub('th, td'), d.cells));
    out.push(rule(sub('td'), d.td));
    if (d.alt) out.push(rule(sub('td.pt-alt'), d.alt));
    out.push(rule(sub('th'), d.th));
    for (const [sel, decls] of d.extra) out.push(rule(sub(sel), decls));
  }
  out.push(rule('td img, th img', ['max-width: 100%', 'height: auto', 'display: block', 'margin: 0 auto']));
  return {
  };
}
