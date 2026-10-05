import type { ResolvedCaptionStyleConfig, ResourceType } from 'postext';

/** A stop a caption prefix may already end in ("Pl."), after which the
 *  engine adds none. */
const CAPTION_STOP_RE = /[.:!?…。．：！？]$/;

/**
 * The label a caption of `type` opens with in the Resources panel's
 * preview, built as the engine builds it (`captionLabelText` in postext's
 * `pipeline/resourceLayout.ts`) with `#` standing for the number, which
 * depends on the resource's place in the book: "Figure #. ". A type
 * numbered with an empty template prints no number, so its label is the
 * prefix and a stop, "Do. " (none added when the prefix ends in one, as
 * "Pl."). Empty when the type has no caption prefix, as the engine prints
 * none then. `labels`: the caption style's gap and separator around the
 * number (a type's own caption style first, then the document's, whose
 * unset values follow its language: 図#　 in a Japanese book); unset, the
 * Latin no-break space and stop.
 */
export function captionPreviewLabel(
  type: (Pick<ResourceType, 'captionPrefix' | 'numberingTemplate'> & Partial<Pick<ResourceType, 'captionStyle'>>) | undefined,
  labels?: Pick<ResolvedCaptionStyleConfig, 'labelNumberGap' | 'labelSeparator'>,
): string {
  const prefix = type?.captionPrefix ?? '';
  if (prefix.length === 0) return '';
  if ((type!.numberingTemplate ?? '') !== '') {
    const gap = type!.captionStyle?.labelNumberGap ?? labels?.labelNumberGap ?? '\u00A0';
    const sep = type!.captionStyle?.labelSeparator ?? labels?.labelSeparator ?? '. ';
    return `${prefix}${gap}#${sep}`;
  }
  const label = prefix.trimEnd();
  if (label.length === 0) return '';
  return CAPTION_STOP_RE.test(label) ? `${label} ` : `${label}. `;
}
