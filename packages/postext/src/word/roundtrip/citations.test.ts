// A citation corrected in Word (#1516): the author's parts of a rendered
// citation (prefix, locator, suffix) come back into the citation's source;
// the parts the processor writes from the bibliography are reported.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerCitationEngine } from '../../citations/registry.js';
import type { CitationEngine } from '../../citations/types.js';
import { exportDocx, exportProblems } from '../semantic/fixtures/harness.js';
import { applyDocxEdits } from './index.js';

/** A note style that prints `prefix Title, locator suffix` per work. */
const notes: CitationEngine = {
  styles: () => [],
  createProcessor: ({ items }) => ({
    kind: 'note',
    numeric: false,
    cite: (clusters) => clusters.map((c) => c.items.map((it) => {
      const title = String(items.find((x) => x.id === it.id)?.title ?? it.id);
      const label = it.label === 'chapter' ? 'chap. ' : '';
      return [it.prefix, `<i>${title}</i>${it.locator ? `, ${label}${it.locator}` : ''}${it.suffix ?? ''}`].filter(Boolean).join(' ');
    }).join('; ') + '.'),
    bibliography: () => ({ entries: [], hangingIndent: false, labelColumn: false, entrySpacing: 0 }),
    citationNumbers: () => new Map(),
  }),
};

const FRONT = '---\nreferences:\n  - {id: simmons1991, title: The Victorian Railway}\n  - {id: bartky2000, title: Selling the True Time}\n---\n';
const MD = `${FRONT}\n# Railway time\n\nAt Exeter the clock kept the time of the city.[^exeter] Bristol held out.[@simmons1991, 345]\n\n[^exeter]: On the towns see [see also @simmons1991, 346–47; and @bartky2000, chap. 9]\n`;

/** The text of the notes, runs joined. */
const notesText = (xml: string): string =>
  [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');

/** The export with `find` replaced by `replace` in its notes. */
function editNotes(bytes: Uint8Array, find: string, replace: string): Uint8Array {
  const files = unzipSync(bytes);
  const xml = strFromU8(files['word/footnotes.xml']!);
  if (!xml.includes(find)) throw new Error(`"${find}" is not in the notes: ${xml}`);
  files['word/footnotes.xml'] = strToU8(xml.replace(find, replace));
  return zipSync(files);
}

describe('round trip: citations corrected in Word', () => {
  beforeAll(() => registerCitationEngine(notes));
  afterAll(() => registerCitationEngine(undefined));

  for (const design of ['book', 'plain'] as const) {
    it(`brings a corrected locator back into the citation (${design})`, async () => {
      const e = await exportDocx(MD, { design });
      expect(notesText(e.part('word/footnotes.xml'))).toContain('see also The Victorian Railway, 346–47; and Selling the True Time, chap. 9.');
      const r = applyDocxEdits(editNotes(e.bytes, '346–47', '346–48'), { chapters: [{ id: 'ch1', markdown: MD }] });
      expect(r.edits.map((x) => [x.status, x.before, x.after, x.reason])).toEqual([['applied', '7', '8', undefined]]);
      expect(r.chapters[0]!.markdown).toBe(MD.replace('346–47', '346–48'));
    });
  }

  it('writes a sound file whose citations are set as the text is (#1518)', async () => {
    const e = await exportDocx(MD);
    expect(exportProblems(e, [MD])).toEqual([]);
    const styles = e.part('word/styles.xml');
    const citation = /<w:style w:type="character" w:styleId="PostextCitation"[^>]*>.*?<\/w:style>/.exec(styles)?.[0] ?? '';
    expect(citation).toContain('<w:name w:val="Postext Citation"/>');
    expect(citation).not.toMatch(/<w:b\/>|<w:color /);
    // Cross-references keep their own look.
    expect(styles).toContain('w:styleId="PostextReference"');
    expect(e.part('word/footnotes.xml')).not.toContain('PostextReference');
    // The title in italic, as the processor prints it and the book sets it.
    expect(e.part('word/footnotes.xml')).toContain('<w:r><w:rPr><w:rStyle w:val="PostextCitation"/><w:i/><w:iCs/></w:rPr><w:t xml:space="preserve">The Victorian Railway</w:t></w:r>');
    expect(applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: MD }] }).edits).toEqual([]);
    // The citation's own note is bookmarked as a note over the citation.
    const note = e.map.fragments.find((f) => f.text === 'The Victorian Railway, 345.')!;
    expect(note.formats).toEqual([{ start: 0, end: 21, flags: 'i' }]);
    expect(note.role).toBe('footnote');
    expect(note.atoms?.map((a) => [a.kind, MD.slice(a.start, a.end)])).toEqual([['citation', '[@simmons1991, 345]']]);
  });

  it('deletes a citation deleted whole, and takes part of a locator out', async () => {
    const e = await exportDocx(MD);
    const gone = applyDocxEdits(editNotes(e.bytes, '>Selling the True Time<', '><'), { chapters: [{ id: 'ch1', markdown: MD }] });
    expect(gone.edits.map((x) => [x.status, x.reason])).toEqual([['rejected', 'citation']]);
    const shorter = applyDocxEdits(editNotes(e.bytes, '346–47', '346'), { chapters: [{ id: 'ch1', markdown: MD }] });
    expect(shorter.chapters[0]!.markdown).toBe(MD.replace('346–47', '346'));
    const files = unzipSync(e.bytes);
    // Every run of the first citation (its title in a run of its own).
    files['word/footnotes.xml'] = strToU8(strFromU8(files['word/footnotes.xml']!).replace(/(?:<w:r><w:rPr><w:rStyle w:val="PostextCitation"\/>(?:(?!<\/w:r>).)*<\/w:r>)+/, ''));
    const deleted = applyDocxEdits(zipSync(files), { chapters: [{ id: 'ch1', markdown: MD }] });
    expect(deleted.chapters[0]!.markdown).toBe(MD.replace('[see also @simmons1991, 346–47; and @bartky2000, chap. 9]', ''));
  });

  it('brings back a corrected prefix and a whole new locator', async () => {
    const e = await exportDocx(MD);
    const prefix = applyDocxEdits(editNotes(e.bytes, '>see also <', '>compare <'), { chapters: [{ id: 'ch1', markdown: MD }] });
    expect(prefix.chapters[0]!.markdown).toBe(MD.replace('see also @simmons1991', 'compare @simmons1991'));
    const locator = applyDocxEdits(editNotes(e.bytes, 'chap. 9', 'chap. 11'), { chapters: [{ id: 'ch1', markdown: MD }] });
    expect(locator.chapters[0]!.markdown).toBe(MD.replace('chap. 9]', 'chap. 11]'));
  });

  it('brings back a locator corrected in a note the citation makes', async () => {
    const e = await exportDocx(MD);
    expect(notesText(e.part('word/footnotes.xml'))).toContain('The Victorian Railway, 345.');
    const r = applyDocxEdits(editNotes(e.bytes, ', 345.', ', 348.'), { chapters: [{ id: 'ch1', markdown: MD }] });
    expect(r.edits.map((x) => [x.status, x.before, x.after])).toEqual([['applied', '5', '8']]);
    expect(r.chapters[0]!.markdown).toBe(MD.replace('@simmons1991, 345]', '@simmons1991, 348]'));
    // Unedited: the note changes nothing.
    expect(applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: MD }] }).edits).toEqual([]);
  });

  it('reports a change to the text the bibliography writes, naming the citation', async () => {
    const e = await exportDocx(MD);
    const r = applyDocxEdits(editNotes(e.bytes, 'Selling the True Time', 'Selling True Time'), { chapters: [{ id: 'ch1', markdown: MD }] });
    expect(r.chapters[0]!.markdown).toBe(MD);
    expect(r.edits).toHaveLength(1);
    const edit = r.edits[0]!;
    expect(edit).toMatchObject({ status: 'rejected', reason: 'citation', citation: 'simmons1991; bartky2000', before: 'see also The Victorian Railway, 346–47; and Selling the True Time, chap. 9.', after: 'see also The Victorian Railway, 346–47; and Selling True Time, chap. 9.' });
    // The source range is the citation's.
    expect(MD.slice(edit.start, edit.end)).toBe('[see also @simmons1991, 346–47; and @bartky2000, chap. 9]');
  });

  it('lists a locator it cannot place in the source for review', async () => {
    // Written `--`, printed `–`: the corrected text has no place in the source.
    const md = MD.replace('346–47', '346--47');
    const e = await exportDocx(md);
    const r = applyDocxEdits(editNotes(e.bytes, '346–47', '346–48'), { chapters: [{ id: 'ch1', markdown: md }] });
    expect(r.chapters[0]!.markdown).toBe(md);
    expect(r.edits).toHaveLength(1);
    const edit = r.edits[0]!;
    expect(edit).toMatchObject({ status: 'rejected', reason: 'citation-part', citation: 'simmons1991', before: '346–47', after: '346–48' });
    expect(md.slice(edit.start, edit.end)).toBe('346--47');
  });
});
