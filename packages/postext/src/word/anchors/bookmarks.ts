// Hidden bookmarks that wrap every exported fragment. Word hides bookmark
// names starting with `_` and caps names at 40 characters.

import { escapeAttr } from '../xml.js';
import { BOOKMARK_PREFIX } from './types.js';

export const MAX_BOOKMARK_NAME = 40;

/** Fragment id for the `counter`-th fragment (base36, short). */
export function newFragmentId(counter: number): string {
  if (!Number.isInteger(counter) || counter < 0) throw new Error(`newFragmentId: bad counter ${counter}`);
  return counter.toString(36);
}

/** The bookmark name of a fragment: `_ptx_<id>`. Throws past 40 characters
 *  (truncating would merge fragments). */
export function bookmarkName(id: string): string {
  // Word keeps only letters, digits and underscores in bookmark names and
  // renames or drops the rest on save, which would lose the anchor.
  if (!/^[A-Za-z0-9_]+$/.test(id)) throw new Error(`bookmarkName: fragment id "${id}" must be letters, digits or underscores`);
  const name = BOOKMARK_PREFIX + id;
  if (name.length > MAX_BOOKMARK_NAME) throw new Error(`bookmarkName: "${name}" is longer than ${MAX_BOOKMARK_NAME} characters`);
  return name;
}

/** The fragment id of a bookmark name, or undefined when it is not ours. */
export function fragmentIdOf(name: string): string | undefined {
  return name.startsWith(BOOKMARK_PREFIX) && name.length > BOOKMARK_PREFIX.length ? name.slice(BOOKMARK_PREFIX.length) : undefined;
}

export function bookmarkStartXml(id: number, name: string): string {
  return `<w:bookmarkStart w:id="${id}" w:name="${escapeAttr(name)}"/>`;
}

export function bookmarkEndXml(id: number): string {
  return `<w:bookmarkEnd w:id="${id}"/>`;
}
