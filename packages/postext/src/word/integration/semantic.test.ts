// End to end through the semantic writer (#1390) and the importer (#1395):
// the sample book exported, read back untouched, and edited the way Word
// writes edits into document.xml and footnotes.xml.

import { beforeAll, describe, expect, it } from 'vitest';
import { semanticDocx } from '../semantic/index.js';
import { initTexToOmml } from '../ommlWrite/index.js';
import type { Resource } from '../../types.js';
import type { WordChapterInput } from '../semantic/types.js';
import { apply, DATE, editDocx, expectUnchanged, once, RESOURCES, resourceBytes } from './integration.test-helper.js';
import { CH1, CH2, SAMPLE } from './sample.test-helper.js';
import { trackReplace, typeOver } from './wordEdit.test-helper.js';

let bytes: Uint8Array;
const T = (s: string): string => `<w:t xml:space="preserve">${s}</w:t>`;

beforeAll(async () => {
  await initTexToOmml();
  bytes = await semanticDocx({ chapters: SAMPLE, config: {} as never, resources: RESOURCES, resourceBytes, date: DATE, exportId: 'ptx-int-sem' });
});

/** Apply an edit and return the chapters' Markdown and the resources. */
function run(f: (xml: string) => string, part?: string): { md: string[]; resources?: Resource[]; r: ReturnType<typeof apply> } {
  const r = apply(editDocx(bytes, f, {}, part), SAMPLE, RESOURCES);
  return { md: r.chapters.map((c) => c.markdown), resources: r.resources, r };
}

describe('semantic round trip: unedited', () => {
  it('is an exported file and reads back byte-identical, with no edits', () => {
    expectUnchanged(bytes, SAMPLE, RESOURCES);
  });

  it('is deterministic with a fixed date', async () => {
    const again = await semanticDocx({ chapters: SAMPLE, config: {} as never, resources: RESOURCES, resourceBytes, date: DATE, exportId: 'ptx-int-sem' });
    expect(again).toEqual(bytes);
  });

  it('reads back a book whose chapters changed since the export without touching them', () => {
    const now: WordChapterInput[] = [SAMPLE[0]!, { ...SAMPLE[1]!, markdown: CH2.replace('Another', 'Yet another') }];
    const r = apply(bytes, now, RESOURCES);
    expect(r.edits).toEqual([]);
    expect(r.chapters.map((c) => c.markdown)).toEqual(now.map((c) => c.markdown));
  });
});

describe('semantic round trip: Word edits', () => {
  it('replaces a word', () => {
    const { md, r } = run((x) => once(x, ' beats steadily all day long.', ' beats calmly all day long.'));
    expect(md).toEqual([CH1.replace('steadily', 'calmly'), CH2]);
    expect(r.edits).toMatchObject([{ chapter: 'ch1', before: 'steadily', after: 'calmly', status: 'applied' }]);
  });

  it('inserts and deletes words', () => {
    const { md } = run((x) => once(once(x, T(' here.'), T(' right here.')), ' beats steadily all day long.', ' beats steadily.'));
    expect(md).toEqual([CH1.replace(' here.', ' right here.').replace(' all day long', ''), CH2]);
  });

  it('edits next to an index mark and a link', () => {
    const { md } = run((x) => once(once(x, ' in it. The heart', ' in it. The human heart'), T('link'), T('web link')));
    expect(md[0]).toBe(CH1.replace('The heart:index', 'The human heart:index').replace('[link]', '[web link]'));
  });

  it('bolds a word', () => {
    const { md, r } = run((x) => once(x, `<w:r>${T('Plain text with ')}</w:r>`, `<w:r>${T('Plain ')}</w:r><w:r><w:rPr><w:b/></w:rPr>${T('text')}</w:r><w:r>${T(' with ')}</w:r>`));
    expect(md[0]).toBe(CH1.replace('Plain text with', 'Plain **text** with'));
    expect(r.edits.map((e) => e.kind)).toEqual(['format']);
  });

  it('accepts tracked insertions and deletions', () => {
    const { md, r } = run((x) => trackReplace(x, 'Another', 'One more'));
    expect(md).toEqual([CH1, CH2.replace('Another', 'One more')]);
    expect(r.edits.every((e) => e.status === 'applied')).toBe(true);
  });

  it('splits a paragraph', () => {
    const { md } = run((x) => once(x, `<w:r>${T('Last paragraph of the chapter.')}</w:r>`, `<w:r>${T('Last paragraph ')}</w:r></w:p><w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r>${T('of the chapter.')}</w:r>`));
    expect(md[0]).toBe(CH1.replace('Last paragraph of the chapter.', 'Last paragraph\n\nof the chapter.'));
  });

  it('merges two paragraphs', () => {
    const { md } = run((x) => typeOver(x, 'this line.\u00b6A closing', 'this line. A closing'));
    expect(md[1]).toBe(CH2.replace('this line.\n\nA closing', 'this line. A closing'));
  });

  it('deletes a forced break with its markup, and keeps scripts', () => {
    const { md } = run((x) => typeOver(x, '.\nA forced', '. A forced'));
    expect(md[1]).toBe(CH2.replace('H~2~O.\\\nA forced', 'H~2~O. A forced'));
    const sub = run((x) => typeOver(x, 'with H2O', 'with H2O2'));
    expect(sub.md[1]).toBe(CH2.replace('H~2~O.', 'H~2~O2.'));
  });

  it('edits a heading, a list item, a box and a footnote', () => {
    const { md } = run((x) => once(once(once(x, T('Lists and notes'), T('Lists and footnotes')), T('second item'), T('second entry')), T('Inside the box there is a sentence.'), T('Inside the box there is a line.')));
    expect(md[0]).toBe(CH1.replace('## Lists and notes', '## Lists and footnotes').replace('- second item', '- second entry').replace('there is a sentence.', 'there is a line.'));
    const note = run((x) => once(x, 'The note text is short.', 'The note text is shorter.'), 'word/footnotes.xml');
    expect(note.md[0]).toBe(CH1.replace('The note text is short.', 'The note text is shorter.'));
  });

  it('writes caption and cell edits back to the resources', () => {
    const { md, resources, r } = run((x) => once(once(x, T('Services and grades.'), T('Services and marks.')), T('Fair'), T('Poor')));
    expect(md).toEqual([CH1, CH2]);
    const t1 = resources!.find((x) => x.id === 't1')!;
    expect(t1.caption).toBe('Services and marks.');
    expect(t1.table!.model.rows[2]![1]!.content).toBe('Poor');
    expect(resources!.find((x) => x.id === 'fig1')).toEqual(RESOURCES[0]);
    expect(r.edits.map((e) => [e.resourceId, e.status])).toEqual([['t1', 'applied'], ['t1', 'applied']]);
  });

  it('edits an inline equation', () => {
    const { md } = run((x) => once(x, '<m:t xml:space="preserve">x</m:t>', '<m:t xml:space="preserve">y</m:t>'));
    expect(md[0]).toMatch(/Inline \$y\^\{?2\}?\$ maths in a line\./);
    expect(md[0]!.replace(/Inline \$[^$]*\$/, 'Inline $x^2$')).toBe(CH1);
  });
});

describe('semantic round trip: generated text', () => {
  it('rejects edits to a caption label and its number', () => {
    // The engine's number ("Figure 1.1. "), set as text: a SEQ field
    // would count it as 1.
    const { md, resources, r } = run((x) => once(x, /(Figure\u00a0<\/w:t>(?:(?!<w:t ).)*<w:t xml:space="preserve">)1\.1</, '$12.1<'));
    expect(md).toEqual([CH1, CH2]);
    expect(resources ?? RESOURCES).toEqual(RESOURCES);
    expect(r.edits).toMatchObject([{ status: 'rejected', reason: 'generated' }]);
    expect(r.changed).toBe(false);
  });

  it('rejects an edit to a cross-reference’s printed text', () => {
    const { md, r } = run((x) => once(x, T('Fig.\u00a01.1'), T('Fig.\u00a02.1')));
    expect(md).toEqual([CH1, CH2]);
    expect(r.edits).toMatchObject([{ status: 'rejected' }]);
  });
});
