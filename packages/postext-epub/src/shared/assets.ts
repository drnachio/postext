// Fonts, pictures and identity shared by both renditions.
// Owner: #394 (package writer). Signatures are the contract the renditions
// code against; bodies are filled in by that work.

import type { VDTDocument } from 'postext';
import type { EpubFontFile, EpubItem, EpubMetadata, EpubResourceBytes, EpubWarning } from '../types';

/** The embedded font files as manifest items under `fonts/` and the
 *  `@font-face` rules that declare them, with `url()`s relative to a
 *  stylesheet in `styles/` (`../fonts/…`). */
export interface FontAssets {
  items: EpubItem[];
  css: string;
  /** Families that have at least one face. */
  families: Set<string>;
}

export function fontAssets(_fonts: readonly EpubFontFile[]): FontAssets {
  throw new Error('fontAssets: not implemented yet (#394)');
}

/** The pictures the documents place (resource bitmaps/SVGs, table-cell
 *  images, design images), each written once under `images/`. `hrefOf`
 *  answers the href (relative to the package document) of a `fileId`, or
 *  undefined when the host had no bytes (reported once as `missingImage`). */
export interface ImageAssets {
  items: EpubItem[];
  hrefOf(fileId: string): string | undefined;
}

export async function imageAssets(
  _docs: readonly VDTDocument[],
  _resourceBytes: EpubResourceBytes | undefined,
  _onWarning?: (warning: EpubWarning) => void,
): Promise<ImageAssets> {
  throw new Error('imageAssets: not implemented yet (#394)');
}

/** The `dc:identifier` of the book: the given one, else a stable
 *  `urn:uuid:` derived from the metadata. */
export function bookIdentifier(_metadata: EpubMetadata): string {
  throw new Error('bookIdentifier: not implemented yet (#394)');
}

/** Page progression of the book: rtl for a right-bound book (Arabic,
 *  vertical Chinese), else ltr. */
export function pageProgressionOf(docs: readonly VDTDocument[]): 'ltr' | 'rtl' {
  return docs.some((d) => d.binding === 'right') ? 'rtl' : 'ltr';
}
