import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { harness } from '../webmcp/tools/testHarness.js';
import { layoutConfig } from '../webmcp/host.js';
import { buildWordExport, type WordExportNote } from './wordExport.js';
import { editCitationText, editReasonText, isWordExport, rebuildWordMap, reviewChanges, reviewWordEdits } from './wordEdits.js';
import { DEFAULT_LABELS as defaultLabels } from '../types/defaultLabels.js';

// #1397: the review of an edited Word export, as the dialog lists it.

async function exported() {
  const { get, call } = harness();
  const s = get();
  const bytes = await buildWordExport({
    variant: 'semantic', scope: 'book', chapters: s.chapters,
    activeChapterId: s.activeChapterId, resources: s.resources, config: layoutConfig(s),
  });
  return { bytes, get, call };
}

/** The file with word/document.xml rewritten. */
function rewritten(bytes: Uint8Array, edit: (xml: string) => string): Uint8Array {
  const files = unzipSync(bytes);
  files['word/document.xml'] = strToU8(edit(strFromU8(files['word/document.xml']!)));
  return zipSync(files);
}

/** The file as Google Docs saves it in what matters here: every custom
 *  XML part gone, and the export map with them. */
function withoutMap(bytes: Uint8Array, edit: (xml: string) => string = (x) => x): Uint8Array {
  const files = unzipSync(bytes);
  for (const path of Object.keys(files)) if (path.startsWith('customXml/')) delete files[path];
  files['word/document.xml'] = strToU8(edit(strFromU8(files['word/document.xml']!)));
  return zipSync(files);
}

describe('a Word export that came back without its map (#1458)', () => {
  it('is read against the book, its map written again from it', async () => {
    const { bytes, get } = await exported();
    const s = get();
    const book = { ...s, config: layoutConfig(s) };
    // A file that carries its map needs none.
    expect(await rebuildWordMap(bytes, book)).toBeUndefined();
    const file = withoutMap(bytes);
    expect(isWordExport(file)).toBe(true);
    const rebuilt = await rebuildWordMap(file, book);
    expect(rebuilt).toBeTruthy();
    const review = reviewWordEdits(file, s, rebuilt!);
    expect(review).toMatchObject({ lost: false, counts: { applied: 0, conflict: 0, rejected: 0 }, groups: [] });
    expect(review.notes).toEqual([{ code: 'map-rebuilt' }]);
  });

  it('places a change made in it, and merges one made in the book meanwhile', async () => {
    const { bytes, get, call } = await exported();
    const s = get();
    const file = withoutMap(bytes, (xml) => xml.replace('The last words', 'The final words'));
    const rebuilt = (await rebuildWordMap(file, { ...s, config: layoutConfig(s) }))!;
    const review = reviewWordEdits(file, s, rebuilt);
    expect(review.counts).toEqual({ applied: 1, conflict: 0, rejected: 0 });
    expect(reviewChanges(review)).toBe(true);
    expect([...review.chapterTexts.values()][0]).toContain('The final words');
    // The book changes while the dialog is open: the map holds the book
    // as it was read, so the two changes merge.
    await call('sandbox_edit_text', { edits: [{ find: '# ', replace: '# A ' }], wait: false });
    const again = reviewWordEdits(file, get(), rebuilt);
    expect(again.counts).toEqual({ applied: 1, conflict: 0, rejected: 0 });
    const text = [...again.chapterTexts.values()][0]!;
    expect(text).toContain('The final words');
    expect(text.startsWith('# A ')).toBe(true);
  });

  it('gives no map for a file exported from another book', async () => {
    const { bytes, get } = await exported();
    const s = get();
    const other = { ...s, chapters: s.chapters.map((c) => ({ ...c, markdown: '# Elsewhere\n\nNothing shared between the two.\n' })), markdown: '# Elsewhere\n\nNothing shared between the two.\n', config: layoutConfig(s) };
    expect(await rebuildWordMap(withoutMap(bytes), other)).toBeNull();
  });
});

describe('the review of an edited Word export (#1397)', () => {
  it('says once that Word dropped the marks, under no group of generated text', async () => {
    const { bytes, get } = await exported();
    const file = rewritten(bytes, (xml) => xml.replace(/<w:bookmark(?:Start|End)\b[^>]*\/>/g, '').replace('The last words', 'The final words'));
    const review = reviewWordEdits(file, get());
    expect(review.lost).toBe(true);
    expect(review.counts.rejected).toBeGreaterThan(0);
    expect(review.groups.some((g) => g.edits.some((e) => e.reason === 'bookmarks-lost'))).toBe(false);
    expect(reviewChanges(review)).toBe(false);
  });

  it('finds nothing to change in the file as it was written', async () => {
    const { bytes, get } = await exported();
    const review = reviewWordEdits(bytes, get());
    expect(review).toMatchObject({ lost: false, counts: { applied: 0, conflict: 0, rejected: 0 }, groups: [] });
  });

  it('gives each note once, however many faces of a family fail', async () => {
    const { get } = harness();
    const s = get();
    const notes: WordExportNote[] = [];
    await buildWordExport({
      variant: 'formatted', scope: 'book', chapters: s.chapters,
      activeChapterId: s.activeChapterId, resources: s.resources, config: layoutConfig(s),
      // Bytes that are no font: every face of every family fails alike.
      fontProvider: async () => new Uint8Array([0, 1, 0, 0, 0, 0]),
      onNote: (n) => notes.push(n),
    });
    const keys = notes.map((n) => (n.kind === 'font' ? `${n.family}|${n.reason}` : `${n.code}|${n.message}|${n.chapter ?? ''}`));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('a change inside a citation, in words (#1516)', () => {
  it('names the citation and the part of it the author wrote', () => {
    expect(editCitationText(defaultLabels, { citation: 'simmons1991', citationPart: 'locator' })).toBe('Citation simmons1991, locator');
    expect(editCitationText(defaultLabels, { citation: 'a; b' })).toBe('Citation a; b');
    expect(editCitationText(defaultLabels, {})).toBe('');
    expect(editReasonText(defaultLabels, 'citation')).toBe(defaultLabels.wordEditReasonCitation);
    expect(editReasonText(defaultLabels, 'citation-part')).toBe(defaultLabels.wordEditReasonCitationPart);
  });
});
