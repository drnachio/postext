import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { harness } from '../webmcp/tools/testHarness.js';
import { layoutConfig } from '../webmcp/host.js';
import { buildWordExport, type WordExportNote } from './wordExport.js';
import { reviewChanges, reviewWordEdits } from './wordEdits.js';

// #1397: the review of an edited Word export, as the dialog lists it.

async function exported() {
  const { host, get } = harness();
  const s = get();
  const bytes = await buildWordExport({
    variant: 'semantic', scope: 'book', service: host.layout, clientId: 'test', chapters: s.chapters,
    activeChapterId: s.activeChapterId, resources: s.resources, config: layoutConfig(s), plan: host.store.getPlan(s),
  });
  return { bytes, get };
}

/** The file with word/document.xml rewritten. */
function rewritten(bytes: Uint8Array, edit: (xml: string) => string): Uint8Array {
  const files = unzipSync(bytes);
  files['word/document.xml'] = strToU8(edit(strFromU8(files['word/document.xml']!)));
  return zipSync(files);
}

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
    const { host, get } = harness();
    const s = get();
    const notes: WordExportNote[] = [];
    await buildWordExport({
      variant: 'formatted', scope: 'book', service: host.layout, clientId: 'test', chapters: s.chapters,
      activeChapterId: s.activeChapterId, resources: s.resources, config: layoutConfig(s), plan: host.store.getPlan(s),
      // Bytes that are no font: every face of every family fails alike.
      fontProvider: async () => new Uint8Array([0, 1, 0, 0, 0, 0]),
      onNote: (n) => notes.push(n),
    });
    const keys = notes.map((n) => (n.kind === 'font' ? `${n.family}|${n.reason}` : `${n.code}|${n.message}|${n.chapter ?? ''}`));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
