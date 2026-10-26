import type { ColorValue, Dimension } from '../page.js';
import type { ResourceCounterFormat, ResourceCounterReset } from '../resources/resourceTypes.js';

export interface MathConfig {
  /** Enable LaTeX rendering. When false, `$...$` / `$$...$$` spans are
   *  still parsed (so warnings track unclosed delimiters) but rendered as
   *  their literal TeX source. */
  enabled?: boolean;
  /** Scale applied to the surrounding text's font size when rendering math:
   *  one em of the formula's TeX font is that size × this factor — the body
   *  size for display formulas and for inline maths in body text, the
   *  enclosing block's size for inline maths in a heading, a paragraph
   *  style, a caption or a callout body. 1.0 = match the surrounding text
   *  (since postext 1.5; up to 1.4 formulas came out about 13% larger, and
   *  1.131 reproduces that size. The display margins in `em` follow the
   *  formula's size, so 1.4's pages also need them divided by 1.131:
   *  `pinLegacyMathSize` in `postext/bundle` does both, and configurations
   *  stored by 1.4 are read through it). Range: typically 0.5–2.0. */
  fontSizeScale?: number;
  /** Formula colour. If omitted, inherits the body colour. */
  color?: ColorValue;
  /** Top margin for display math blocks. */
  marginTop?: Dimension;
  /** Bottom margin for display math blocks. Baseline grid snap uses this
   *  as the *minimum* bottom gap (the grid always wins). */
  marginBottom?: Dimension;
  /** Indent the first line of a paragraph that follows a display formula,
   *  as any other paragraph. Default `true`. `false` sets every paragraph
   *  right after a display formula flush, as the continuation of the
   *  sentence the formula interrupted ("where …"). A formula written inside
   *  a paragraph — no blank line above it nor below it — is always followed
   *  flush: the text under its closing `$$` continues that paragraph,
   *  whatever this says. */
  indentAfterDisplay?: boolean;
  /** Keep a display formula in the column of the line that leads into it
   *  (TeX's predisplay penalty): when the formula does not fit under the
   *  last line of the paragraph before it, that line goes to the next
   *  column or page with the formula — the whole paragraph when the lines
   *  left behind would break the widow rule (fewer than `widowMinLines`,
   *  when `avoidWidows` is on). The carried line stands alone at the head
   *  of the next column. Default `false`: the formula alone moves on. */
  keepWithLeadIn?: boolean;
  /** Number the display formulas that carry a `\label` (#530). */
  equationNumbering?: EquationNumberingConfig;
}

/** How labelled display formulas are numbered (#530): a `\label{eq:x}`
 *  in a display formula (on a row of an `align` or `gather`) numbers it in
 *  reading order, unless the row says `\nonumber` or `\notag`. An
 *  explicit `\tag{…}` prints as written and is not counted. */
export interface EquationNumberingConfig {
  /** Default `true`. `false` prints no number (a `\label` is dropped)
   *  and a reference prints the equation's page. */
  enabled?: boolean;
  /** Template of the number: `{n}` (the counter) and `{h1}`..`{h6}`
   *  (heading numbers), as a resource type's, with the same style suffix
   *  (`'{h1:A}.{n}'`, #730). Default `'{n}'`; `'{h1}.{n}'` numbers by
   *  chapter (with `resetOn: 'h1'`). */
  numberingTemplate?: string;
  /** When the counter starts again at 1. Default `'never'`. */
  resetOn?: ResourceCounterReset;
  /** How `{n}` is written. Default `'decimal'`. */
  counterFormat?: ResourceCounterFormat;
  /** The number as the formula and `\eqref` print it, `{n}` standing for
   *  the number: `'({n})'` (default), `'[{n}]'`, `'{n}'`. `\ref` prints
   *  the bare number. */
  format?: string;
}

/** {@link EquationNumberingConfig} with every value resolved. */
export interface ResolvedEquationNumberingConfig {
  enabled: boolean;
  numberingTemplate: string;
  resetOn: ResourceCounterReset;
  counterFormat: ResourceCounterFormat;
  format: string;
}

export interface ResolvedMathConfig {
  enabled: boolean;
  fontSizeScale: number;
  color?: ColorValue;
  marginTop: Dimension;
  marginBottom: Dimension;
  indentAfterDisplay: boolean;
  keepWithLeadIn: boolean;
  equationNumbering: ResolvedEquationNumberingConfig;
}
