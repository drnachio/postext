import type {
  CodeOverflow,
  CodeStyleConfig,
  CodeTokenKind,
  ColorValue,
  Dimension,
  InlineCodeStyleConfig,
  ResolvedBodyTextConfig,
  ResolvedCodeStyleConfig,
  ResolvedInlineCodeStyleConfig,
} from '../types';
import { colorsEqual, dimensionsEqual } from './shared';

/** Code listings (#624): a monospaced face a little smaller than the
 *  text on the text's leading, in a pale box padded by 0.6 em, split
 *  between lines across columns and pages, long lines turned over. */
export const DEFAULT_CODE_STYLE: Omit<ResolvedCodeStyleConfig, 'color' | 'tokens' | 'continuesMarker' | 'lineHeight' | 'titleStyle' | 'label' | 'inline'> = {
  blocks: true,
  indentedCode: false,
  fontFamily: 'Source Code Pro',
  fontSize: { value: 0.85, unit: 'em' },
  fontWeight: 400,
  boldFontWeight: 700,
  snapToGrid: true,
  backgroundEnabled: true,
  background: { hex: '#f4f4f4', model: 'hex' },
  padding: {
    top: { value: 0.6, unit: 'em' },
    right: { value: 0.6, unit: 'em' },
    bottom: { value: 0.6, unit: 'em' },
    left: { value: 0.6, unit: 'em' },
  },
  border: { enabled: false, color: { hex: '#cccccc', model: 'hex' }, width: { value: 0.5, unit: 'pt' } },
  borderRadius: { value: 0, unit: 'pt' },
  marginTop: { value: 0.75, unit: 'em' },
  marginBottom: { value: 0.75, unit: 'em' },
  span: 'column',
  tabSize: 4,
  overflow: 'wrap',
  wrapIndent: 2,
  // `↪` is missing from most code faces (JetBrains Mono, Ubuntu Mono…):
  // a missing glyph prints as a box and fails PDF/UA. `»` is in every
  // Latin face.
  wrapMarker: '»',
  minFontScale: 0.8,
  lineNumbers: false,
  lineNumberColor: { hex: '#8a8a8a', model: 'hex' },
  lineNumberGap: { value: 1, unit: 'em' },
  highlightBackground: { hex: '#fff4c2', model: 'hex' },
  keepTogether: false,
  splitMinLines: 2,
  repeatTitle: false,
  continuesMarkerEnabled: false,
  highlight: 'builtin',
};

export const CODE_TOKEN_KINDS: readonly CodeTokenKind[] = [
  'keyword', 'string', 'number', 'comment', 'function', 'type', 'operator',
  'punctuation', 'variable', 'meta', 'prompt', 'output',
];

const hex = (h: string): ColorValue => ({ hex: h, model: 'hex' });

/** The token colours of a listing nobody styled: a quiet palette that
 *  reads on the default pale box and in grey print. Operators, punctuation
 *  and a session's prompt keep the listing's colour; the prompt is bold. */
export const DEFAULT_CODE_TOKENS: Readonly<Record<CodeTokenKind, { color?: ColorValue; bold: boolean; italic: boolean }>> = {
  keyword: { color: hex('#8b2c8f'), bold: false, italic: false },
  string: { color: hex('#3d7a2a'), bold: false, italic: false },
  number: { color: hex('#985f00'), bold: false, italic: false },
  comment: { color: hex('#7a7f87'), bold: false, italic: true },
  function: { color: hex('#2b5fb4'), bold: false, italic: false },
  type: { color: hex('#99540a'), bold: false, italic: false },
  operator: { bold: false, italic: false },
  punctuation: { bold: false, italic: false },
  variable: { color: hex('#b23b2e'), bold: false, italic: false },
  meta: { color: hex('#985f00'), bold: false, italic: false },
  prompt: { bold: true, italic: false },
  output: { color: hex('#5c6168'), bold: false, italic: false },
};

export const CODE_OVERFLOWS: readonly CodeOverflow[] = ['wrap', 'shrink', 'clip'];

const oneOf = <T extends string>(choices: readonly T[], value: unknown, fallback: T): T =>
  typeof value === 'string' && (choices as readonly string[]).includes(value) ? value as T : fallback;

/** A finite number at least `min`, else `fallback`. */
function atLeast(value: unknown, min: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min ? value : fallback;
}

/** `codeStyle.inline` in full, or undefined when unset. */
function resolveInline(inline: InlineCodeStyleConfig | undefined, family: string): ResolvedInlineCodeStyleConfig | undefined {
  if (!inline) return undefined;
  const framed = inline.background !== undefined || inline.borderColor !== undefined;
  return {
    fontFamily: inline.fontFamily?.trim() || family,
    fontSize: inline.fontSize ?? { value: 0.9, unit: 'em' },
    ...(inline.color ? { color: inline.color } : {}),
    bold: inline.bold === true,
    italic: inline.italic === true,
    ...(inline.background ? { background: inline.background } : {}),
    ...(inline.borderColor ? { borderColor: inline.borderColor } : {}),
    borderWidth: inline.borderWidth ?? (inline.borderColor ? { value: 0.5, unit: 'pt' } : { value: 0, unit: 'pt' }),
    borderRadius: inline.borderRadius ?? { value: 0.2, unit: 'em' },
    paddingX: inline.paddingX ?? (framed ? { value: 0.2, unit: 'em' } : { value: 0, unit: 'em' }),
    paddingY: inline.paddingY ?? { value: 0.1, unit: 'em' },
  };
}

/** `codeStyle` in full: the colour defaults to the body text's, the token
 *  styles merge kind by kind onto {@link DEFAULT_CODE_TOKENS}. */
export function resolveCodeStyleConfig(partial: CodeStyleConfig | undefined, bodyText: ResolvedBodyTextConfig): ResolvedCodeStyleConfig {
  const D = DEFAULT_CODE_STYLE;
  const p = partial ?? {};
  const fontFamily = p.fontFamily?.trim() || D.fontFamily;
  const tokens = {} as ResolvedCodeStyleConfig['tokens'];
  for (const kind of CODE_TOKEN_KINDS) {
    const base = DEFAULT_CODE_TOKENS[kind];
    const own = p.tokens?.[kind];
    const color = own?.color ?? base.color;
    tokens[kind] = { ...(color ? { color } : {}), bold: own?.bold ?? base.bold, italic: own?.italic ?? base.italic };
  }
  const inline = resolveInline(p.inline, fontFamily);
  return {
    blocks: p.blocks !== false,
    indentedCode: p.indentedCode === true,
    fontFamily,
    fontSize: p.fontSize ?? D.fontSize,
    fontWeight: atLeast(p.fontWeight, 1, D.fontWeight),
    boldFontWeight: atLeast(p.boldFontWeight, 1, D.boldFontWeight),
    ...(p.lineHeight ? { lineHeight: p.lineHeight } : {}),
    snapToGrid: p.snapToGrid !== false,
    color: p.color ?? bodyText.color,
    backgroundEnabled: p.backgroundEnabled !== false,
    background: p.background ?? D.background,
    padding: {
      top: p.padding?.top ?? D.padding.top,
      right: p.padding?.right ?? D.padding.right,
      bottom: p.padding?.bottom ?? D.padding.bottom,
      left: p.padding?.left ?? D.padding.left,
    },
    border: {
      enabled: p.border?.enabled ?? D.border.enabled,
      color: p.border?.color ?? D.border.color,
      width: p.border?.width ?? D.border.width,
    },
    borderRadius: p.borderRadius ?? D.borderRadius,
    marginTop: p.marginTop ?? D.marginTop,
    marginBottom: p.marginBottom ?? D.marginBottom,
    span: p.span === 'page' ? 'page' : 'column',
    tabSize: Math.floor(atLeast(p.tabSize, 1, D.tabSize)),
    overflow: oneOf(CODE_OVERFLOWS, p.overflow, D.overflow),
    wrapIndent: Math.floor(atLeast(p.wrapIndent, 0, D.wrapIndent)),
    wrapMarker: typeof p.wrapMarker === 'string' ? p.wrapMarker : D.wrapMarker,
    minFontScale: Math.min(1, atLeast(p.minFontScale, 0.3, D.minFontScale)),
    lineNumbers: p.lineNumbers === true,
    lineNumberColor: p.lineNumberColor ?? D.lineNumberColor,
    lineNumberGap: p.lineNumberGap ?? D.lineNumberGap,
    highlightBackground: p.highlightBackground ?? D.highlightBackground,
    keepTogether: p.keepTogether === true,
    splitMinLines: Math.floor(atLeast(p.splitMinLines, 1, D.splitMinLines)),
    repeatTitle: p.repeatTitle === true,
    continuesMarkerEnabled: p.continuesMarkerEnabled === true,
    ...(typeof p.continuesMarker === 'string' && p.continuesMarker.trim() !== '' ? { continuesMarker: p.continuesMarker } : {}),
    ...(p.titleStyle ? { titleStyle: p.titleStyle } : {}),
    ...(p.label ? { label: p.label } : {}),
    highlight: p.highlight === 'none' ? 'none' : 'builtin',
    tokens,
    ...(inline ? { inline } : {}),
  };
}

/** The defaults, resolved against `bodyText`, for a configuration with no
 *  `codeStyle` section. Memoised per body text (configs are resolved once). */
const defaultsByBody = new WeakMap<ResolvedBodyTextConfig, ResolvedCodeStyleConfig>();

/** The code style a resolved configuration lays listings out with: its
 *  own section, else the defaults. */
export function resolvedCodeStyle(resolved: { codeStyle?: ResolvedCodeStyleConfig; bodyText: ResolvedBodyTextConfig }): ResolvedCodeStyleConfig {
  if (resolved.codeStyle) return resolved.codeStyle;
  let hit = defaultsByBody.get(resolved.bodyText);
  if (!hit) defaultsByBody.set(resolved.bodyText, (hit = resolveCodeStyleConfig(undefined, resolved.bodyText)));
  return hit;
}

/** `codeStyle` without the fields that hold their default; undefined when
 *  none is left. Colours, faces, the title row, the label and inline code
 *  are kept as written. */
export function stripCodeStyleDefaults(codeStyle?: CodeStyleConfig): CodeStyleConfig | undefined {
  if (!codeStyle) return undefined;
  const D = DEFAULT_CODE_STYLE;
  const out: CodeStyleConfig = {};
  const dim = (v: Dimension | undefined, d: Dimension): boolean => v !== undefined && !dimensionsEqual(v, d);
  const col = (v: ColorValue | undefined, d: ColorValue): boolean => v !== undefined && !colorsEqual(v, d);
  if (codeStyle.blocks !== undefined && codeStyle.blocks !== D.blocks) out.blocks = codeStyle.blocks;
  if (codeStyle.indentedCode !== undefined && codeStyle.indentedCode !== D.indentedCode) out.indentedCode = codeStyle.indentedCode;
  if (codeStyle.fontFamily !== undefined && codeStyle.fontFamily !== D.fontFamily) out.fontFamily = codeStyle.fontFamily;
  if (dim(codeStyle.fontSize, D.fontSize)) out.fontSize = codeStyle.fontSize;
  if (codeStyle.fontWeight !== undefined && codeStyle.fontWeight !== D.fontWeight) out.fontWeight = codeStyle.fontWeight;
  if (codeStyle.boldFontWeight !== undefined && codeStyle.boldFontWeight !== D.boldFontWeight) out.boldFontWeight = codeStyle.boldFontWeight;
  if (codeStyle.lineHeight !== undefined) out.lineHeight = codeStyle.lineHeight;
  if (codeStyle.snapToGrid !== undefined && codeStyle.snapToGrid !== D.snapToGrid) out.snapToGrid = codeStyle.snapToGrid;
  if (codeStyle.color !== undefined) out.color = codeStyle.color;
  if (codeStyle.backgroundEnabled !== undefined && codeStyle.backgroundEnabled !== D.backgroundEnabled) out.backgroundEnabled = codeStyle.backgroundEnabled;
  if (col(codeStyle.background, D.background)) out.background = codeStyle.background;
  if (codeStyle.padding) {
    const pad: NonNullable<CodeStyleConfig['padding']> = {};
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      if (dim(codeStyle.padding[side], D.padding[side])) pad[side] = codeStyle.padding[side];
    }
    if (Object.keys(pad).length > 0) out.padding = pad;
  }
  if (codeStyle.border) {
    const b: NonNullable<CodeStyleConfig['border']> = {};
    if (codeStyle.border.enabled !== undefined && codeStyle.border.enabled !== D.border.enabled) b.enabled = codeStyle.border.enabled;
    if (col(codeStyle.border.color, D.border.color)) b.color = codeStyle.border.color;
    if (dim(codeStyle.border.width, D.border.width)) b.width = codeStyle.border.width;
    if (Object.keys(b).length > 0) out.border = b;
  }
  if (dim(codeStyle.borderRadius, D.borderRadius)) out.borderRadius = codeStyle.borderRadius;
  if (dim(codeStyle.marginTop, D.marginTop)) out.marginTop = codeStyle.marginTop;
  if (dim(codeStyle.marginBottom, D.marginBottom)) out.marginBottom = codeStyle.marginBottom;
  if (codeStyle.span !== undefined && codeStyle.span !== D.span) out.span = codeStyle.span;
  if (codeStyle.tabSize !== undefined && codeStyle.tabSize !== D.tabSize) out.tabSize = codeStyle.tabSize;
  if (codeStyle.overflow !== undefined && codeStyle.overflow !== D.overflow) out.overflow = codeStyle.overflow;
  if (codeStyle.wrapIndent !== undefined && codeStyle.wrapIndent !== D.wrapIndent) out.wrapIndent = codeStyle.wrapIndent;
  if (codeStyle.wrapMarker !== undefined && codeStyle.wrapMarker !== D.wrapMarker) out.wrapMarker = codeStyle.wrapMarker;
  if (codeStyle.minFontScale !== undefined && codeStyle.minFontScale !== D.minFontScale) out.minFontScale = codeStyle.minFontScale;
  if (codeStyle.lineNumbers !== undefined && codeStyle.lineNumbers !== D.lineNumbers) out.lineNumbers = codeStyle.lineNumbers;
  if (col(codeStyle.lineNumberColor, D.lineNumberColor)) out.lineNumberColor = codeStyle.lineNumberColor;
  if (dim(codeStyle.lineNumberGap, D.lineNumberGap)) out.lineNumberGap = codeStyle.lineNumberGap;
  if (col(codeStyle.highlightBackground, D.highlightBackground)) out.highlightBackground = codeStyle.highlightBackground;
  if (codeStyle.keepTogether !== undefined && codeStyle.keepTogether !== D.keepTogether) out.keepTogether = codeStyle.keepTogether;
  if (codeStyle.splitMinLines !== undefined && codeStyle.splitMinLines !== D.splitMinLines) out.splitMinLines = codeStyle.splitMinLines;
  if (codeStyle.repeatTitle !== undefined && codeStyle.repeatTitle !== D.repeatTitle) out.repeatTitle = codeStyle.repeatTitle;
  if (codeStyle.continuesMarkerEnabled !== undefined && codeStyle.continuesMarkerEnabled !== D.continuesMarkerEnabled) out.continuesMarkerEnabled = codeStyle.continuesMarkerEnabled;
  if (codeStyle.continuesMarker !== undefined && codeStyle.continuesMarker.trim() !== '') out.continuesMarker = codeStyle.continuesMarker;
  if (codeStyle.titleStyle && Object.keys(codeStyle.titleStyle).length > 0) out.titleStyle = codeStyle.titleStyle;
  if (codeStyle.label) out.label = codeStyle.label;
  if (codeStyle.highlight !== undefined && codeStyle.highlight !== D.highlight) out.highlight = codeStyle.highlight;
  if (codeStyle.tokens) {
    const tokens: NonNullable<CodeStyleConfig['tokens']> = {};
    for (const kind of CODE_TOKEN_KINDS) {
      const own = codeStyle.tokens[kind];
      if (!own) continue;
      const base = DEFAULT_CODE_TOKENS[kind];
      const t: NonNullable<CodeStyleConfig['tokens']>[CodeTokenKind] = {};
      if (own.color !== undefined && (!base.color || !colorsEqual(own.color, base.color))) t.color = own.color;
      if (own.bold !== undefined && own.bold !== base.bold) t.bold = own.bold;
      if (own.italic !== undefined && own.italic !== base.italic) t.italic = own.italic;
      if (Object.keys(t).length > 0) tokens[kind] = t;
    }
    if (Object.keys(tokens).length > 0) out.tokens = tokens;
  }
  if (codeStyle.inline) out.inline = codeStyle.inline;
  return Object.keys(out).length > 0 ? out : undefined;
}
