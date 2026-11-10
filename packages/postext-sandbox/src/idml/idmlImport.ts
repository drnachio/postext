// The Sandbox side of an InDesign import: the pictures of the
// `Links` folder, picked as a folder or as a ZIP, and the new book written
// as a `.postext` for the import every other book goes through.

import { unzipSync } from 'fflate';
import { createBundle } from 'postext/bundle';
import { linkName, type IdmlImportResult, type IdmlNoteId } from 'postext/idml';
import type { SandboxLabels } from '../types/index.js';

/** The label that words each note of the import. */
export const IDML_NOTE_LABEL: Record<IdmlNoteId, keyof SandboxLabels> = {
  missingLinks: 'idmlNoteMissingLinks',
  unsupportedPictures: 'idmlNoteUnsupportedPictures',
  loosePictures: 'idmlNoteLoosePictures',
  anchoredFrames: 'idmlNoteAnchoredFrames',
  otherObjects: 'idmlNoteOtherObjects',
  marginFrames: 'idmlNoteMarginFrames',
  masterItems: 'idmlNoteMasterItems',
  otherMasters: 'idmlNoteOtherMasters',
  indexMarks: 'idmlNoteIndexMarks',
  verticalText: 'idmlNoteVerticalText',
  characterStyles: 'idmlNoteCharacterStyles',
  spotSwatches: 'idmlNoteSpotSwatches',
  fonts: 'idmlNoteFonts',
};

/** Files a folder picker or a ZIP gives, by file name (the folder they sit
 *  in left out: InDesign links name the file). macOS's `__MACOSX` copies
 *  and hidden files are left out. */
export function linksFromEntries(entries: Iterable<[string, Uint8Array]>): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  for (const [path, bytes] of entries) {
    if (/(^|\/)__MACOSX\//.test(path) || path.endsWith('/')) continue;
    const name = linkName(path);
    if (!name || name.startsWith('.')) continue;
    out.set(name, bytes);
  }
  return out;
}

/** The files of a ZIP (of a `Links` folder, or of a package InDesign made
 *  with File > Package, the IDML among them). */
export function linksFromZip(bytes: Uint8Array): Map<string, Uint8Array> {
  return linksFromEntries(Object.entries(unzipSync(bytes)));
}

/** How many of the document's pictures `links` has, by name. */
export function linksFound(names: readonly string[], links: ReadonlyMap<string, Uint8Array>): number {
  const have = new Set([...links.keys()].map((k) => k.toLowerCase()));
  return names.filter((n) => {
    const low = n.toLowerCase();
    if (have.has(low)) return true;
    // A TIFF or PSD whose screen version has its name.
    const stem = low.replace(/\.[^.]+$/, '');
    return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].some((e) => have.has(`${stem}.${e}`));
  }).length;
}

/** The new book as a `.postext` file. */
export async function idmlBundleBytes(result: IdmlImportResult, meta: { name: string; locale?: string }): Promise<Uint8Array> {
  const files = new Map<string, Uint8Array>();
  for (const [id, f] of result.files) files.set(id, f.bytes);
  const created = await createBundle({
    name: meta.name,
    ...(meta.locale ? { locale: meta.locale } : {}),
    chapters: result.chapters,
    config: result.config,
    resources: result.resources,
    files,
  });
  return created.bytes;
}

/** A note in words: its count, and the names that say which. */
export function noteText(labels: SandboxLabels, id: IdmlNoteId, count: number): string {
  return (labels[IDML_NOTE_LABEL[id]] as string).replace('__count__', String(count));
}
