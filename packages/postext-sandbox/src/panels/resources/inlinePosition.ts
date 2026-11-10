// Inline resource positions, shared by the resource panel and the resource
// types section (#1492).
import type { ResourcePlacement } from 'postext';

/** Whether a resource placed at `position` is set in the text rather than
 *  floated: where its `::resource` line stands, or after the paragraph that
 *  cites it (the engine's `isInlinePosition`, which `postext` does not
 *  export). */
export function isInlinePosition(position: ResourcePlacement['position']): boolean {
  return position === 'here' || position === 'paragraph';
}
