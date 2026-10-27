// The book stylesheet's rules for classical verse, stanzas, line numbers,
// tab stops, code listings, drop caps and text wrap (#1276: split out of
// css.ts).
import { rule } from './helpers.js';
import { resolvedCodeStyle, dimensionToPx, type Dimension, type ResolvedConfig, type ColorValue, type ResolvedBodyTextConfig } from 'postext';
import { round } from '../inline.js';
import type { StylesheetOptions, CssRule } from './types.js';

/** What createVerseRules takes from bookStylesheet. */
export interface VerseRulesDeps {
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
  out: (string | CssRule)[];
}

export function createVerseRules(deps: VerseRulesDeps) {
  const {
    config, options, dpi, body, bodyPx, fam, em, lh, color, px, out
  } = deps;
  // --- classical verse -----------------------------------------------------
  // A bayt is a row of two equal hemistich columns (and the ornament's,
  // empty without one): the ṣadr from the start side, the ʿajuz flush
  // with the end side, so the rhymes stand in one column as in print. On
  // a narrow screen the two halves stagger, the ʿajuz on its own line
  // flush with the end, as the print does when they do not fit.
  // A stanza set line by line (#620): its lines of verse, a blank line
  // between stanzas, never hyphenated; each line's hang is on its own
  // element.
  if (options.stanzas) {
    out.push(rule('.pt-stanza', ['margin: 0 0 1em', 'text-indent: 0', 'text-align: start', 'hyphens: manual']));
    out.push(rule('.pt-verse-line', ['display: block']));
  }
  // Line numbers (#621): a poem's every Nth line carries its number in a
  // margin on the start side of the stanza, out of the reading order.
  if (options.stanzas && options.lineNumbers) {
    out.push(rule('.pt-stanza', ['padding-left: 3em']));
    out.push(rule('.pt-verse-line', ['position: relative']));
    out.push(rule('.pt-line-number', [
      'position: absolute', 'right: 100%', 'margin-right: 0.8em', 'text-indent: 0', 'font-size: 0.8em',
      'white-space: nowrap', '-webkit-user-select: none', 'user-select: none',
    ]));
    out.push(rule('[dir="rtl"] .pt-stanza, .pt-stanza[dir="rtl"]', ['padding-left: 0', 'padding-right: 3em']));
    out.push(rule('[dir="rtl"] .pt-line-number, .pt-stanza[dir="rtl"] .pt-line-number', ['right: auto', 'left: 100%', 'margin-right: 0', 'margin-left: 0.8em']));
  }
  // Tab stops (#622): a line holding tabs is a row of its parts; a filler
  // (with its leader as a border on the baseline) pushes the part after it
  // to the row's end, a start stop's part keeps its printed width.
  if (options.tabs) {
    out.push(rule('.pt-tab-row', ['display: flex', 'align-items: baseline', 'text-indent: 0']));
    out.push(rule('.pt-tab-part', ['flex: 0 1 auto']));
    out.push(rule('.pt-tab-rest', ['flex: 1 1 0']));
    out.push(rule('.pt-tab-fill', ['flex: 1 1 auto', 'min-width: 1em', 'margin: 0 0.5em']));
    out.push(rule('.pt-tab-gap', ['flex: 0 0 0.5em']));
    out.push(rule('.pt-leader-dots', ['border-bottom: 0.12em dotted currentColor']));
    out.push(rule('.pt-leader-rule', ['border-bottom: 0.06em solid currentColor']));
  }
  // Code listings (#624): the box of `codeStyle` around `<pre><code>`, the
  // lines as written in the code face, turned over by the reading system
  // when the screen is narrow (`pre-wrap`); numbers and wrap left out of a
  // selection; the highlighted lines tinted.
  if (options.code) {
    const cs = resolvedCodeStyle(config);
    const codePx = dimensionToPx(cs.fontSize, dpi, bodyPx);
    const bodyLead = body.lineHeight.unit === 'em' || body.lineHeight.unit === 'rem' ? body.lineHeight.value * bodyPx : px(body.lineHeight);
    const codeLead = cs.lineHeight ? lh(cs.lineHeight, codePx) : `line-height: ${round(bodyLead / codePx)}`;
    const len = (d: Dimension) => em(d, codePx);
    out.push(rule('.pt-code-box', [
      'display: block',
      `margin: ${em(cs.marginTop, codePx)} 0 ${em(cs.marginBottom, codePx)}`,
      `font-size: ${round(codePx / bodyPx)}em`,
      cs.backgroundEnabled && color(cs.background, 'background-color'),
      cs.border.enabled && `border: ${round(px(cs.border.width) / codePx)}em solid ${cs.border.color.hex}`,
      px(cs.borderRadius, codePx) > 0 && `border-radius: ${len(cs.borderRadius)}`,
      `padding: ${len(cs.padding.top)} ${len(cs.padding.right)} ${len(cs.padding.bottom)} ${len(cs.padding.left)}`,
      'text-indent: 0',
    ]));
    out.push(rule('.pt-code-title', [fam(cs.titleStyle?.fontFamily ?? cs.fontFamily), 'font-weight: bold', 'margin: 0 0 0.4em', 'text-indent: 0']));
    out.push(rule('pre.pt-code', [
      fam(cs.fontFamily), 'font-size: 1em', codeLead, 'margin: 0', color(cs.color),
      'white-space: pre-wrap', 'overflow-wrap: anywhere', `tab-size: ${cs.tabSize}`, `-moz-tab-size: ${cs.tabSize}`,
      'text-align: left', 'hyphens: none',
    ]));
    out.push(rule('pre.pt-code code', ['font: inherit', 'background: none']));
    out.push(rule('.pt-code-num', [color(cs.lineNumberColor), 'margin-right: 1em', '-webkit-user-select: none', 'user-select: none']));
    out.push(rule('mark.pt-code-hl', [color(cs.highlightBackground, 'background-color'), 'color: inherit']));
  }
  // Drop caps (#623): CSS initial letters, `lines` tall, sunk `sink`
  // lines; a reading system without `initial-letter` floats the letter,
  // about as tall, on the start side.
  if (options.dropCaps && options.dropCaps.length > 0) {
    out.push(rule('.pt-has-dropcap', ['text-indent: 0']));
    out.push(rule('.pt-dropcap', ['float: left', 'line-height: 0.85', 'margin: 0.05em 0.08em 0 0', 'text-indent: 0']));
    out.push(rule('[dir="rtl"] .pt-dropcap, p[dir="rtl"] .pt-dropcap', ['float: right', 'margin: 0.05em 0 0 0.08em']));
    for (const shape of options.dropCaps) {
      const [lines, sink] = shape.split('-').map(Number) as [number, number];
      out.push(rule(`.pt-dropcap-${shape}`, [`font-size: ${round(lines * 1.25)}em`]));
      out.push(`@supports (initial-letter: 1) or (-webkit-initial-letter: 1) {\n  .pt-dropcap-${shape} { float: none; margin: 0 0.08em 0 0; font-size: 1em; line-height: inherit; -webkit-initial-letter: ${lines} ${sink}; initial-letter: ${lines} ${sink}; }\n}\n`);
    }
  }
  // Text wrap (#627): a figure or a box floated to its side; what cannot
  // run beside it in print (headings, other figures, tables, boxes,
  // formulas, poems) clears it.
  if (options.wraps) {
    out.push(rule('.pt-wrap', ['margin-top: 0', 'margin-bottom: 1em']));
    out.push(rule('.pt-wrap-left', ['float: left', 'clear: left']));
    out.push(rule('.pt-wrap-right', ['float: right', 'clear: right']));
    out.push(rule('.pt-wrap img', ['max-width: 100%', 'height: auto']));
    out.push(rule('h1, h2, h3, h4, h5, h6, figure:not(.pt-wrap), table, aside:not(.pt-wrap), .pt-math-display, .pt-stanza, .pt-verse', ['clear: both']));
  }
  if (options.verse) {
    // The poem as wide as its widest bayt, centred: its hemistichs share
    // one width, as in print, instead of drifting to the screen's edges.
    out.push(rule('.pt-verse', ['width: fit-content', 'max-width: 100%', 'margin: 0.5em auto', 'text-indent: 0']));
    out.push(rule('.pt-bayt', [
      'display: grid',
      'grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)',
      'column-gap: 1em',
      'margin: 0',
      'text-indent: 0',
      'text-align: start',
      'hyphens: manual',
      'page-break-inside: avoid',
      'break-inside: avoid',
    ]));
    out.push(rule('.pt-sadr', ['grid-column: 1', 'text-align: start']));
    out.push(rule('.pt-verse-ornament', ['grid-column: 2', 'text-align: center']));
    out.push(rule('.pt-ajuz', ['grid-column: 3', 'text-align: end']));
    out.push(rule('.pt-bayt-single .pt-sadr', ['grid-column: 1 / -1', 'text-align: center']));
    out.push('@media (max-width: 30em) {\n' +
      '  .pt-bayt { display: block; }\n' +
      '  .pt-sadr, .pt-ajuz { display: block; }\n' +
      '  .pt-verse-ornament { display: none; }\n' +
      '}\n');
  }
  return {
  };
}
