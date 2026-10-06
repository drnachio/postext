import type { PostextConfig } from 'postext';

/** Whether any page of the book has more than one text column: the
 *  document's layout (two columns when unset) or a heading style's own.
 *  A float's or a box's `columns` only matters then. */
export function hasSeveralColumns(config: Pick<PostextConfig, 'layout' | 'headingStyles'>): boolean {
  if ((config.layout?.layoutType ?? 'double') !== 'single') return true;
  return (config.headingStyles ?? []).some((s) => s.layout?.layoutType !== undefined && s.layout.layoutType !== 'single');
}
