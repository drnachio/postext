// The book stylesheet's rules for figures, picture labels, comic pages,
// tables and captions (#1276: split out of css.ts).
import { rule, ALIGN, TRACKED_LIGATURES } from './helpers.js';
import { round, idOf } from '../inline.js';
import { ownCaptionStyle } from '../figures.js';
import type { ColorValue, ResolvedCaptionStyleConfig, ResolvedTableStyleConfig, Dimension, ResolvedConfig } from 'postext';
import type { StylesheetOptions, CssRule } from './types.js';

type Decl = string | false | undefined | null | 0;

/** What a property is set back to where a rule over another leaves it out
 *  (#1550); `inherit` for the rest (line height, label weight, colour). */
const RESET: Record<string, string> = { 'font-style': 'normal', 'background-color': 'transparent', padding: '0' };

/** The declarations a rule over `base`'s needs to set `own` (#1550): the
 *  ones it changes, and each property `base` sets that it does not, set
 *  back. */
function overDecls(own: readonly Decl[], base: readonly Decl[]): string[] {
  const set = (list: readonly Decl[]) => list.filter((d): d is string => typeof d === 'string' && d.length > 0);
  const prop = (d: string) => d.slice(0, d.indexOf(':')).trim();
  const o = set(own);
  const b = set(base);
  const props = new Set(o.map(prop));
  return [...o.filter((d) => !b.includes(d)), ...b.filter((d) => !props.has(prop(d))).map((d) => `${prop(d)}: ${RESET[prop(d)] ?? 'inherit'}`)];
}

/** What createFigureRules takes from bookStylesheet. */
export interface FigureRulesDeps {
  config: ResolvedConfig;
  options: StylesheetOptions;
  dpi: number;
  bodyPx: number;
  fam: (f: string) => string;
  em: (d: Dimension, basePx?: number) => string;
  lh: (d: Dimension, fontPx: number) => string;
  color: (c: ColorValue | undefined, prop?: string) => string | undefined;
  px: (d: Dimension, basePx?: number) => number;
  out: (string | CssRule)[];
}

export function createFigureRules(deps: FigureRulesDeps) {
  const {
    config, options, dpi, bodyPx, fam, em, lh, color, px, out
  } = deps;
  // --- figures, tables, captions ------------------------------------------
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
  const bodyHyphens = config.bodyText.hyphenation.enabled;
  /** What a caption style decides, by element (#1550: the document's on
   *  `figcaption`, `caption` and `.pt-note`, a resource type's under its
   *  class). `hyphenation: true` (1.81) is the body's hyphens, as a
   *  paragraph style's: stated, not inherited, since a table's caption and
   *  a note set after the picture inherit other hyphens than the body's. */
  const captionDecls = (c: ResolvedCaptionStyleConfig) => {
    const sizePx = px(c.fontSize);
    const note = c.note;
    return {
      caption: [
        fam(c.fontFamily),
        `font-size: ${round(sizePx / bodyPx)}em`,
        color(c.color),
        `text-align: ${ALIGN[c.align] ?? 'start'}`,
        c.descriptionItalic && 'font-style: italic',
        c.backgroundEnabled && color(c.background, 'background-color'),
        c.backgroundEnabled && `padding: ${round(px(c.padding, sizePx) / sizePx)}em`,
        `margin: ${round(px(c.gap, sizePx) / sizePx)}em 0`,
        c.lineHeight && lh(c.lineHeight, sizePx),
        `hyphens: ${c.hyphenation && bodyHyphens ? 'auto' : 'manual'}`,
      ],
      label: [
        color(c.labelColor),
        c.labelBold ? 'font-weight: bold' : undefined,
        `font-style: ${c.labelItalic ? 'italic' : 'normal'}`,
      ],
      note: [
        `font-size: ${em(note.fontSize)}`,
        color(note.color),
        `font-style: ${note.italic ? 'italic' : 'normal'}`,
        `text-align: ${ALIGN[note.align] ?? 'start'}`,
        'text-indent: 0',
        note.lineHeight && lh(note.lineHeight, px(note.fontSize)),
        `hyphens: ${note.hyphenation && bodyHyphens ? 'auto' : 'manual'}`,
      ],
      noteGap: [`margin-block-start: ${em(note.gap, sizePx)}`],
    };
  };
  const base = captionDecls(config.captionStyle);
  out.push(rule('figcaption, caption', base.caption));
  out.push(rule('caption.pt-caption-below', ['caption-side: bottom']));
  out.push(rule('.pt-label', base.label));
  out.push(rule('.pt-note', base.note));
  out.push(rule('figcaption .pt-note', ['display: block', ...base.noteGap]));
  // A resource type's own caption style (#1550): rules under the class of
  // its figure or table box (`pt-type-<id>`) with what it changes, and
  // what the document's sets that it does not undone.
  for (const typeId of Object.keys(config.resourceTypeCaptionStyles ?? {})) {
    const own = ownCaptionStyle(config, typeId);
    if (!own) continue;
    const t = captionDecls(own);
    const cls = `.${idOf('pt-type-', typeId)}`;
    out.push(rule(`${cls} figcaption, ${cls} caption`, overDecls(t.caption, base.caption)));
    out.push(rule(`${cls} .pt-label`, overDecls(t.label, base.label)));
    out.push(rule(`${cls} .pt-note`, overDecls(t.note, base.note)));
    out.push(rule(`${cls} figcaption .pt-note`, overDecls(t.noteGap, base.noteGap)));
  }
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
        reset && st.hyphenation !== reset.hyphenation && (st.hyphenation ? 'hyphens: inherit' : 'hyphens: manual'),
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
  const table = tableStyleDecls(ts, undefined);
  out.push(rule('.pt-table', ['margin: 1em 0', 'overflow-x: auto']));
  out.push(rule('table', [
    'border-collapse: collapse',
    'margin: 0 auto',
    'max-width: 100%',
    fam(ts.bodyFontFamily),
    `font-size: ${round(bodyCellPx / bodyPx)}em`,
    color(ts.bodyColor),
    'text-indent: 0',
    !ts.hyphenation && 'hyphens: manual',
    ...table.table,
  ]));
  out.push(rule('th, td', [
    `padding: ${round(px(ts.cellPadding, bodyCellPx) / bodyCellPx)}em`,
    'vertical-align: top',
    'text-align: start',
    ...table.cells,
  ]));
  out.push(rule('td', table.td));
  if (table.alt) out.push(rule('td.pt-alt', table.alt));
  out.push(rule('th', table.th));
  for (const [sel, decls] of table.extra) out.push(rule(sel, decls));
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
