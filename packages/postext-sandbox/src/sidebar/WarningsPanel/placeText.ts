// Where a snippet warning lies: a caption, a note or a table cell.
import type { SnippetPlace } from '../../warnings/types.js';
import type { SandboxLabels } from '../../types/index.js';

/** `#table · cell 2, 7 — `: the caption, note or cell a snippet warning lies in. */
export function placePrefix(place: SnippetPlace | undefined, labels: SandboxLabels): string {
  if (!place) return '';
  const part = place.part === 'caption' ? labels.warningsPartCaption : place.part === 'note' ? labels.warningsPartNote
    : labels.warningsPartCell.replace('__row__', String((place.cell?.row ?? 0) + 1)).replace('__col__', String((place.cell?.col ?? 0) + 1));
  return `#${place.resourceId} · ${part} — `;
}
