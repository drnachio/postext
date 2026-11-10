// End to end through the flow writer in its plain design (#1458) and the
// importer (#1395): the sample book exported with content only, read back
// untouched, and edited the way Word writes edits into document.xml and
// footnotes.xml. The plain file maps its text as the book design does, so
// the same edits come back.

import { beforeAll, describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { encodeExportMap, readExportMap } from '../anchors/exportMap.js';
import { EXPORT_MAP_ROOT } from '../anchors/types.js';
import { semanticDocx } from '../semantic/index.js';
import { initTexToOmml } from '../ommlWrite/index.js';
import type { PostextConfig, Resource } from '../../types.js';
import { apply, DATE, editDocx, expectUnchanged, once, RESOURCES, resourceBytes } from './integration.test-helper.js';
import { CH1, CH2, SAMPLE } from './sample.test-helper.js';
import { trackReplace, typeOver } from './wordEdit.test-helper.js';

/** A book whose design the plain file leaves out: two columns, a serif
 *  face, a filled box. */
const CONFIG = {
  layout: { layoutType: 'double' },
  bodyText: { fontFamily: 'Lora', textAlign: 'justify', color: { hex: '#22313f', model: 'hex' } },
  calloutStyles: [{ id: 'note', name: 'Note', backgroundEnabled: true, background: { hex: '#e8f0fa', model: 'hex' } }],
} as unknown as PostextConfig;

let bytes: Uint8Array;
const T = (s: string): string => `<w:t xml:space="preserve">${s}</w:t>`;
const plain = (): Promise<Uint8Array> => semanticDocx({ chapters: SAMPLE, config: CONFIG, design: 'plain', resources: RESOURCES, resourceBytes, date: DATE, exportId: 'ptx-int-plain' });

beforeAll(async () => {
  await initTexToOmml();
  bytes = await plain();
});

function run(f: (xml: string) => string, part?: string): { md: string[]; resources?: Resource[]; r: ReturnType<typeof apply> } {
  const r = apply(editDocx(bytes, f, {}, part), SAMPLE, RESOURCES);
  return { md: r.chapters.map((c) => c.markdown), resources: r.resources, r };
}

describe('plain round trip: unedited', () => {
  it('is an exported file and reads back byte-identical, with no edits', () => {
    const r = expectUnchanged(bytes, SAMPLE, RESOURCES);
    expect(r.variant).toBe('semantic');
    expect(readExportMap(unzipSync(bytes))!.design).toBe('plain');
  });

  it('is deterministic with a fixed date', async () => {
    expect(await plain()).toEqual(bytes);
  });

  it('reads a file written before the map named its design', async () => {
    const book = await semanticDocx({ chapters: SAMPLE, config: CONFIG, resources: RESOURCES, resourceBytes, date: DATE, exportId: 'ptx-int-book' });
    const files = unzipSync(book);
    const { design, ...earlier } = readExportMap(files)!;
    expect(design).toBe('book');
    // The same file as an earlier version wrote it: no `design` in its map.
    const part = Object.keys(files).find((f) => f.startsWith('customXml/') && strFromU8(files[f]!).includes(EXPORT_MAP_ROOT))!;
    files[part] = strToU8(encodeExportMap(earlier));
    const old = zipSync(files);
    expect(readExportMap(unzipSync(old))!.design).toBeUndefined();
    expectUnchanged(old, SAMPLE, RESOURCES);
    const r = apply(editDocx(old, (x) => once(x, ' beats steadily all day long.', ' beats calmly all day long.')), SAMPLE, RESOURCES);
    expect(r.chapters[0]!.markdown).toBe(CH1.replace('steadily', 'calmly'));
  });
});

describe('plain round trip: Word edits', () => {
  it('replaces, inserts and deletes words', () => {
    const { md, r } = run((x) => once(x, ' beats steadily all day long.', ' beats calmly all day long.'));
    expect(md).toEqual([CH1.replace('steadily', 'calmly'), CH2]);
    expect(r.edits).toMatchObject([{ chapter: 'ch1', before: 'steadily', after: 'calmly', status: 'applied' }]);
    const more = run((x) => once(once(x, T(' here.'), T(' right here.')), ' beats steadily all day long.', ' beats steadily.'));
    expect(more.md).toEqual([CH1.replace(' here.', ' right here.').replace(' all day long', ''), CH2]);
  });

  it('bolds a word and accepts tracked changes', () => {
    const bold = run((x) => once(x, `<w:r>${T('Plain text with ')}</w:r>`, `<w:r>${T('Plain ')}</w:r><w:r><w:rPr><w:b/></w:rPr>${T('text')}</w:r><w:r>${T(' with ')}</w:r>`));
    expect(bold.md[0]).toBe(CH1.replace('Plain text with', 'Plain **text** with'));
    const tracked = run((x) => trackReplace(x, 'Another', 'One more'));
    expect(tracked.md).toEqual([CH1, CH2.replace('Another', 'One more')]);
  });

  it('splits and merges paragraphs', () => {
    const split = run((x) => once(x, `<w:r>${T('Last paragraph of the chapter.')}</w:r>`, `<w:r>${T('Last paragraph ')}</w:r></w:p><w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r>${T('of the chapter.')}</w:r>`));
    expect(split.md[0]).toBe(CH1.replace('Last paragraph of the chapter.', 'Last paragraph\n\nof the chapter.'));
    const merged = run((x) => typeOver(x, 'this line.¶A closing', 'this line. A closing'));
    expect(merged.md[1]).toBe(CH2.replace('this line.\n\nA closing', 'this line. A closing'));
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
    expect(r.edits.map((e) => [e.resourceId, e.status])).toEqual([['t1', 'applied'], ['t1', 'applied']]);
  });

  it('edits an inline equation', () => {
    const { md } = run((x) => once(x, '<m:t xml:space="preserve">x</m:t>', '<m:t xml:space="preserve">y</m:t>'));
    expect(md[0]!.replace(/Inline \$[^$]*\$/, 'Inline $x^2$')).toBe(CH1);
    expect(md[0]).toMatch(/Inline \$y\^\{?2\}?\$ maths in a line\./);
  });

  it('rejects an edit to a caption label', () => {
    const { md, r } = run((x) => once(x, /(Figure <\/w:t>(?:(?!<w:t ).)*<w:t xml:space="preserve">)1\.1</, '$12.1<'));
    expect(md).toEqual([CH1, CH2]);
    expect(r.edits).toMatchObject([{ status: 'rejected', reason: 'generated' }]);
  });
});
