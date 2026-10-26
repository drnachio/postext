import type { CalloutBorderConfig, CalloutLabelConfig, CalloutPaddingConfig, CalloutTitleStyleConfig } from './calloutParts.js';
import type { ColorValue, Dimension } from './page.js';

/** The kinds of token a code listing is coloured by (#624): what the
 *  built-in tokenizer and a registered highlighter
 *  (`registerCodeHighlighter`) name, and what `codeStyle.tokens` colours.
 *  `prompt` and `output` are a shell session's (`console`): the prompt and
 *  what the program prints. */
export type CodeTokenKind =
  | 'keyword' | 'string' | 'number' | 'comment' | 'function' | 'type' | 'operator'
  | 'punctuation' | 'variable' | 'meta' | 'prompt' | 'output';

/** How a code line wider than its box is set (#624): `'wrap'` turns it
 *  over, `'shrink'` sets the whole listing smaller, `'clip'` cuts it at the
 *  box's inner edge. */
export type CodeOverflow = 'wrap' | 'shrink' | 'clip';

/** The look of one kind of token. Unset fields keep the listing's own. */
export interface CodeTokenStyle {
  color?: ColorValue;
  bold?: boolean;
  italic?: boolean;
}

/** Inline code (`` `x` ``) set in a code face (#624). The span is set in
 *  a box, as a chip is; since #845 a line may break at its spaces and
 *  after a hyphen between a letter or digit and a letter (the box is cut
 *  there, and nothing is added), and the spaces inside it keep the code
 *  face's width. */
export interface InlineCodeStyleConfig {
  /** Default: `codeStyle.fontFamily`. */
  fontFamily?: string;
  /** Size; `em` is the surrounding text's. Default `0.9em`. */
  fontSize?: Dimension;
  /** Default: the surrounding text's colour. */
  color?: ColorValue;
  bold?: boolean;
  italic?: boolean;
  /** A fill behind the span. Default none. */
  background?: ColorValue;
  /** Outline colour. Default none. */
  borderColor?: ColorValue;
  /** Outline width. Default `0.5pt` when a border colour is set. */
  borderWidth?: Dimension;
  /** Corner radius; `em` is the span's size. Default `0.2em`. */
  borderRadius?: Dimension;
  /** Room left and right of the text inside the fill; `em` is the span's
   *  size. Default `0.2em` with a fill or a border, `0` without. */
  paddingX?: Dimension;
  /** Room above and below the text band; paints outside the line box.
   *  Default `0.1em`. */
  paddingY?: Dimension;
  /** The face of the Arabic, Hebrew, Syriac, Thaana and CJK letters inline
   *  code holds (`:index[الكشيدة]`, a ruby's kanji): `'text'` (the
   *  default) sets them in the face of the text around the code, since a
   *  code face rarely has them; `'code'` keeps them in the code face, for
   *  one that does (#845). */
  otherScripts?: 'text' | 'code';
}

/** Code listings (#624): ```` ``` ```` and `~~~` fences, and indented code
 *  behind {@link indentedCode}, set line by line in a box. */
export interface CodeStyleConfig {
  /** Read fences as code blocks. Default `true`; `false` reads a fence's
   *  lines as Markdown, as postext 1.22 did (stored documents written
   *  before #624 get it, see `pinLegacyCodeBlocks`). */
  blocks?: boolean;
  /** Read a run of lines indented by four spaces (or a tab) after a blank
   *  line as a code block. Default `false`: Postext text often indents
   *  with spaces, and nested lists read leading spaces. */
  indentedCode?: boolean;
  /** Default `'Source Code Pro'`. */
  fontFamily?: string;
  /** `em` is the body's size. Default `0.85em`. */
  fontSize?: Dimension;
  fontWeight?: number;
  /** Weight of bold tokens. Default `700`. */
  boldFontWeight?: number;
  /** Leading of the code lines; `em` is the code's size. Default: the
   *  body's baseline grid line. */
  lineHeight?: Dimension;
  /** The text after a listing goes back to the baseline grid. Default
   *  `true`; `false` keeps the exact `marginBottom`. */
  snapToGrid?: boolean;
  /** Default: the body text colour. */
  color?: ColorValue;
  /** Default `true`. */
  backgroundEnabled?: boolean;
  /** Default `#f4f4f4`. */
  background?: ColorValue;
  /** Default `0.6em` on every side. */
  padding?: CalloutPaddingConfig;
  /** Default off, `#cccccc`, `0.5pt`. */
  border?: CalloutBorderConfig;
  /** Default `0`. */
  borderRadius?: Dimension;
  /** Default `0.75em`. */
  marginTop?: Dimension;
  /** Default `0.75em`. */
  marginBottom?: Dimension;
  /** Default `'column'`; a fence sets its own with `span=page`. */
  span?: 'column' | 'page';
  /** Columns a tab advances to. Default `4`. */
  tabSize?: number;
  /** Default `'wrap'`. */
  overflow?: CodeOverflow;
  /** Indent of a wrapped line's continuations, in character cells.
   *  Default `2`. */
  wrapIndent?: number;
  /** Set in the indent of a continuation line. Default `'»'` (a mark
   *  every Latin face carries; `'↪'` is missing from most code faces);
   *  `''` sets none. */
  wrapMarker?: string;
  /** `'shrink'`: the smallest size the listing is set at, as a share of
   *  `fontSize`; past it the lines wrap. Default `0.8`. */
  minFontScale?: number;
  /** Number the lines of every listing. Default `false`; a fence sets its
   *  own with `lineNumbers` / `lineNumbers=false` and `start=N`. */
  lineNumbers?: boolean;
  /** Default `#8a8a8a`. */
  lineNumberColor?: ColorValue;
  /** Room between the numbers and the code; `em` is the code's size.
   *  Default `1em`. */
  lineNumberGap?: Dimension;
  /** The tint behind the lines a fence's `highlight="3,5-7"` names.
   *  Default `#fff4c2`. */
  highlightBackground?: ColorValue;
  /** Default `false`: a listing splits between lines across columns and
   *  pages. */
  keepTogether?: boolean;
  /** Fewest lines on each side of a split. Default `2`. */
  splitMinLines?: number;
  /** Repeat the title on each continuation. Default `false`. */
  repeatTitle?: boolean;
  /** Mark a part that goes on ("Continued"). Default `false`. */
  continuesMarkerEnabled?: boolean;
  /** Default `"Continued"` in the document language. */
  continuesMarker?: string;
  /** The title row a fence's `title` prints. Default: the code face at
   *  0.85 of the code size, bold. */
  titleStyle?: CalloutTitleStyleConfig;
  /** When set, the fence's `title` prints in a label tab on the box's top
   *  edge (a callout label) instead of a title row. */
  label?: CalloutLabelConfig;
  /** Default `'builtin'`: the built-in tokenizer colours `js`/`ts`,
   *  `json`, `python`, `bash`/`sh`/`zsh`, `console`, `css`, `html`/`xml`,
   *  `markdown` and `sql`; a registered highlighter takes precedence.
   *  `'none'` sets every listing plain. */
  highlight?: 'builtin' | 'none';
  /** The look of each kind of token. Defaults: a muted palette (see
   *  `DEFAULT_CODE_TOKENS`). */
  tokens?: Partial<Record<CodeTokenKind, CodeTokenStyle>>;
  /** Inline code in a code face. Unset: inline code is set in the body
   *  face, as before #624. */
  inline?: InlineCodeStyleConfig;
}

export interface ResolvedInlineCodeStyleConfig {
  fontFamily: string;
  fontSize: Dimension;
  color?: ColorValue;
  bold: boolean;
  italic: boolean;
  background?: ColorValue;
  borderColor?: ColorValue;
  borderWidth: Dimension;
  borderRadius: Dimension;
  paddingX: Dimension;
  paddingY: Dimension;
  otherScripts: 'text' | 'code';
}

export interface ResolvedCodeStyleConfig {
  blocks: boolean;
  indentedCode: boolean;
  fontFamily: string;
  fontSize: Dimension;
  fontWeight: number;
  boldFontWeight: number;
  /** Absent: the body's baseline grid line. */
  lineHeight?: Dimension;
  snapToGrid: boolean;
  color: ColorValue;
  backgroundEnabled: boolean;
  background: ColorValue;
  padding: { top: Dimension; right: Dimension; bottom: Dimension; left: Dimension };
  border: { enabled: boolean; color: ColorValue; width: Dimension };
  borderRadius: Dimension;
  marginTop: Dimension;
  marginBottom: Dimension;
  span: 'column' | 'page';
  tabSize: number;
  overflow: CodeOverflow;
  wrapIndent: number;
  wrapMarker: string;
  minFontScale: number;
  lineNumbers: boolean;
  lineNumberColor: ColorValue;
  lineNumberGap: Dimension;
  highlightBackground: ColorValue;
  keepTogether: boolean;
  splitMinLines: number;
  repeatTitle: boolean;
  continuesMarkerEnabled: boolean;
  /** Absent: the document language's. */
  continuesMarker?: string;
  /** As written; absent: the default title row. */
  titleStyle?: CalloutTitleStyleConfig;
  /** As written; absent: no label tab. */
  label?: CalloutLabelConfig;
  highlight: 'builtin' | 'none';
  tokens: Record<CodeTokenKind, { color?: ColorValue; bold: boolean; italic: boolean }>;
  /** Absent: inline code in the body face. */
  inline?: ResolvedInlineCodeStyleConfig;
}
