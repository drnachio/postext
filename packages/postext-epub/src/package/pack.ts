// OCF container writer. Owner: #394.

import type { EpubPublication } from '../types';

/** Write a publication as an EPUB 3 file: `mimetype` first and stored,
 *  `META-INF/container.xml`, `OEBPS/content.opf`, `OEBPS/nav.xhtml`,
 *  `OEBPS/toc.ncx` and every item. Deterministic for a given input. */
export function packEpub(_publication: EpubPublication): Uint8Array {
  throw new Error('packEpub: not implemented yet (#394)');
}
