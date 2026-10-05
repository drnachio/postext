import type {
  CaptionStyleConfig,
  CaptionNoteStyleConfig,
  ColorPaletteEntry,
  Dimension,
  ResolvedCaptionStyleConfig,
  ResolvedCaptionNoteStyleConfig,
  ResolvedBodyTextConfig,
} from '../types';
import { DEFAULT_MAIN_COLOR, colorsEqual, dimensionsEqual, resolveColor, startEndAsLeftRight } from './shared';
import { isJapaneseLanguage } from '../locale';

/** Ratio of the note size to the caption size when `note.fontSize` is unset. */
const NOTE_SIZE_RATIO = 0.85;

/** Static caption defaults independent of body text. */
const STATIC_DEFAULTS = {
  align: 'left' as const,
  // 0.75em ≈ half the 1.5em line height — matches the previous caption gap.
  gap: { value: 0.75, unit: 'em' as const },
  labelBold: true,
  labelItalic: false,
  descriptionItalic: false,
  position: 'below' as const,
  backgroundEnabled: false,
  background: DEFAULT_MAIN_COLOR,
  padding: { value: 0.35, unit: 'em' as const },
  labelNumberGap: '\u00a0',
  labelSeparator: '. ',
} satisfies Partial<ResolvedCaptionStyleConfig>;

/** What stands around a caption's number when the config sets nothing:
 *  "Figure 1.7. " (a no-break space, then a stop and a space) in most
 *  languages; in a Japanese document (`locale` `ja`, `ja-*`) the label and
 *  the number solid and an ideographic space before the caption text,
 *  with no stop (図1-1　東京の地図, JLReq §4.3). Chinese documents keep
 *  the Latin defaults, as before (their books set the pair by hand). */
export function defaultCaptionLabels(locale?: string): { labelNumberGap: string; labelSeparator: string } {
  return isJapaneseLanguage(locale)
    ? { labelNumberGap: '', labelSeparator: '\u3000' }
    : { labelNumberGap: STATIC_DEFAULTS.labelNumberGap, labelSeparator: STATIC_DEFAULTS.labelSeparator };
}

/** Static note defaults (size and colour derive from the caption). */
const NOTE_STATIC_DEFAULTS = {
  italic: false,
  gap: { value: 0.35, unit: 'em' as const },
  align: 'left' as const,
} satisfies Partial<ResolvedCaptionNoteStyleConfig>;

/** The default note size for a caption size: 0.85 × in the same unit. */
function defaultNoteFontSize(captionFontSize: Dimension): Dimension {
  return { value: captionFontSize.value * NOTE_SIZE_RATIO, unit: captionFontSize.unit };
}

function resolveNote(
  partial: CaptionNoteStyleConfig | undefined,
  captionFontSize: Dimension,
  captionColor: ResolvedCaptionStyleConfig['color'],
): ResolvedCaptionNoteStyleConfig {
  const n = partial ?? {};
  return {
    fontSize: n.fontSize ?? defaultNoteFontSize(captionFontSize),
    color: n.color ?? captionColor,
    italic: n.italic ?? NOTE_STATIC_DEFAULTS.italic,
    gap: n.gap ?? NOTE_STATIC_DEFAULTS.gap,
    align: startEndAsLeftRight(n.align ?? NOTE_STATIC_DEFAULTS.align),
  };
}

/** Resolve a partial caption-style config. Font family, size, and colour (and
 *  thus the label colour) inherit the resolved body text when unset, so a
 *  document with no caption config renders exactly as before. The label's
 *  gap and separator follow the document language `locale` when unset
 *  ({@link defaultCaptionLabels}). */
export function resolveCaptionStyleConfig(
  partial: CaptionStyleConfig | undefined,
  bodyText: ResolvedBodyTextConfig,
  locale?: string,
): ResolvedCaptionStyleConfig {
  const p = partial ?? {};
  const labels = defaultCaptionLabels(locale);
  const color = p.color ?? bodyText.color;
  const fontSize = p.fontSize ?? bodyText.fontSize;
  return {
    fontFamily: p.fontFamily ?? bodyText.fontFamily,
    fontSize,
    color,
    align: startEndAsLeftRight(p.align ?? STATIC_DEFAULTS.align),
    gap: p.gap ?? STATIC_DEFAULTS.gap,
    labelBold: p.labelBold ?? STATIC_DEFAULTS.labelBold,
    labelItalic: p.labelItalic ?? STATIC_DEFAULTS.labelItalic,
    labelColor: p.labelColor ?? color,
    descriptionItalic: p.descriptionItalic ?? STATIC_DEFAULTS.descriptionItalic,
    position: p.position ?? STATIC_DEFAULTS.position,
    backgroundEnabled: p.backgroundEnabled ?? STATIC_DEFAULTS.backgroundEnabled,
    background: p.background ?? STATIC_DEFAULTS.background,
    padding: p.padding ?? STATIC_DEFAULTS.padding,
    note: resolveNote(p.note, fontSize, color),
    labelNumberGap: typeof p.labelNumberGap === 'string' ? p.labelNumberGap : labels.labelNumberGap,
    labelSeparator: typeof p.labelSeparator === 'string' ? p.labelSeparator : labels.labelSeparator,
  };
}

/**
 * Merge a partial per-resource-type caption override over an already-resolved
 * caption style. Only the keys defined in `override` replace the base; the
 * derived defaults follow the same rules as {@link resolveCaptionStyleConfig}
 * (an overridden `color` also drives the label and note colours unless those
 * were set explicitly, an overridden `fontSize` rescales the default note
 * size). Palette references inside the override (`ColorValue.paletteId`)
 * resolve against `palette` when given; the base is assumed resolved already.
 */
export function mergeCaptionStyle(
  base: ResolvedCaptionStyleConfig,
  override: CaptionStyleConfig | undefined,
  palette?: ColorPaletteEntry[],
): ResolvedCaptionStyleConfig {
  if (!override) return base;
  const o = override;
  const color = resolveColor(o.color, palette) ?? base.color;
  const fontSize = o.fontSize ?? base.fontSize;
  // Label / note colours track the caption colour unless explicitly set.
  const labelFollows = colorsEqual(base.labelColor, base.color);
  const noteColorFollows = colorsEqual(base.note.color, base.color);
  const noteSizeFollows = dimensionsEqual(base.note.fontSize, defaultNoteFontSize(base.fontSize));
  const n = o.note ?? {};
  return {
    fontFamily: o.fontFamily ?? base.fontFamily,
    fontSize,
    color,
    align: startEndAsLeftRight(o.align ?? base.align),
    gap: o.gap ?? base.gap,
    labelBold: o.labelBold ?? base.labelBold,
    labelItalic: o.labelItalic ?? base.labelItalic,
    labelColor: resolveColor(o.labelColor, palette) ?? (labelFollows ? color : base.labelColor),
    descriptionItalic: o.descriptionItalic ?? base.descriptionItalic,
    position: o.position ?? base.position,
    backgroundEnabled: o.backgroundEnabled ?? base.backgroundEnabled,
    background: resolveColor(o.background, palette) ?? base.background,
    padding: o.padding ?? base.padding,
    note: {
      fontSize: n.fontSize ?? (noteSizeFollows ? defaultNoteFontSize(fontSize) : base.note.fontSize),
      color: resolveColor(n.color, palette) ?? (noteColorFollows ? color : base.note.color),
      italic: n.italic ?? base.note.italic,
      gap: n.gap ?? base.note.gap,
      align: startEndAsLeftRight(n.align ?? base.note.align),
    },
    labelNumberGap: typeof o.labelNumberGap === 'string' ? o.labelNumberGap : base.labelNumberGap,
    labelSeparator: typeof o.labelSeparator === 'string' ? o.labelSeparator : base.labelSeparator,
  };
}

/** Drop note fields equal to their static default (size / colour are
 *  inherited, so they are kept whenever set). */
function stripNoteDefaults(note: CaptionNoteStyleConfig | undefined): CaptionNoteStyleConfig | undefined {
  if (!note) return undefined;
  const r: CaptionNoteStyleConfig = {};
  let has = false;
  if (note.fontSize !== undefined) { r.fontSize = note.fontSize; has = true; }
  if (note.color !== undefined) { r.color = note.color; has = true; }
  if (note.italic !== undefined && note.italic !== NOTE_STATIC_DEFAULTS.italic) { r.italic = note.italic; has = true; }
  if (note.gap !== undefined && !dimensionsEqual(note.gap, NOTE_STATIC_DEFAULTS.gap)) { r.gap = note.gap; has = true; }
  if (note.align !== undefined && note.align !== NOTE_STATIC_DEFAULTS.align) { r.align = note.align; has = true; }
  return has ? r : undefined;
}

/** Drop fields equal to their static default; inherited font/colour fields are
 *  kept whenever explicitly set. The label's gap and separator are compared
 *  with the defaults of the document language `locale`
 *  ({@link defaultCaptionLabels}): a no-break space kept in a Japanese
 *  document is no default there. Returns `undefined` when nothing remains. */
export function stripCaptionStyleDefaults(
  captionStyle: CaptionStyleConfig | undefined,
  locale?: string,
): CaptionStyleConfig | undefined {
  if (!captionStyle) return undefined;
  const labels = defaultCaptionLabels(locale);
  const r: CaptionStyleConfig = {};
  let has = false;

  if (captionStyle.fontFamily !== undefined) { r.fontFamily = captionStyle.fontFamily; has = true; }
  if (captionStyle.fontSize !== undefined) { r.fontSize = captionStyle.fontSize; has = true; }
  if (captionStyle.color !== undefined) { r.color = captionStyle.color; has = true; }
  if (captionStyle.labelColor !== undefined) { r.labelColor = captionStyle.labelColor; has = true; }
  if (captionStyle.align !== undefined && captionStyle.align !== STATIC_DEFAULTS.align) { r.align = captionStyle.align; has = true; }
  if (captionStyle.gap !== undefined && !dimensionsEqual(captionStyle.gap, STATIC_DEFAULTS.gap)) { r.gap = captionStyle.gap; has = true; }
  if (captionStyle.labelBold !== undefined && captionStyle.labelBold !== STATIC_DEFAULTS.labelBold) { r.labelBold = captionStyle.labelBold; has = true; }
  if (captionStyle.labelItalic !== undefined && captionStyle.labelItalic !== STATIC_DEFAULTS.labelItalic) { r.labelItalic = captionStyle.labelItalic; has = true; }
  if (captionStyle.descriptionItalic !== undefined && captionStyle.descriptionItalic !== STATIC_DEFAULTS.descriptionItalic) { r.descriptionItalic = captionStyle.descriptionItalic; has = true; }
  if (captionStyle.position !== undefined && captionStyle.position !== STATIC_DEFAULTS.position) { r.position = captionStyle.position; has = true; }
  if (captionStyle.backgroundEnabled !== undefined && captionStyle.backgroundEnabled !== STATIC_DEFAULTS.backgroundEnabled) { r.backgroundEnabled = captionStyle.backgroundEnabled; has = true; }
  if (captionStyle.background !== undefined && !colorsEqual(captionStyle.background, STATIC_DEFAULTS.background)) { r.background = captionStyle.background; has = true; }
  if (captionStyle.padding !== undefined && !dimensionsEqual(captionStyle.padding, STATIC_DEFAULTS.padding)) { r.padding = captionStyle.padding; has = true; }
  const note = stripNoteDefaults(captionStyle.note);
  if (note) { r.note = note; has = true; }
  if (captionStyle.labelNumberGap !== undefined && captionStyle.labelNumberGap !== labels.labelNumberGap) { r.labelNumberGap = captionStyle.labelNumberGap; has = true; }
  if (captionStyle.labelSeparator !== undefined && captionStyle.labelSeparator !== labels.labelSeparator) { r.labelSeparator = captionStyle.labelSeparator; has = true; }

  return has ? r : undefined;
}
