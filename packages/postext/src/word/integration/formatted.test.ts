// End to end through the formatted writer (#1392) and the importer
// (#1395): the sample book laid out by the engine on a justified,
// hyphenated two-column page, exported page by page, read back untouched,
// and edited the way Word saves typing, across line breaks, hyphen splits
// and text boxes.

import { beforeAll, describe, expect, it } from 'vitest';
import { formattedDocx } from '../formatted/index.js';
import { build, config, LOREM } from '../formatted/formatted.test-helper.js';
import { readExportMap } from '../anchors/exportMap.js';
import { unzipSync } from 'fflate';
import type { PostextConfig, Resource } from '../../index.js';
import type { WordChapterInput } from '../semantic/types.js';
import { apply, DATE, editDocx, expectUnchanged, RESOURCES, resourceBytes } from './integration.test-helper.js';
import { CH1, CH2 } from './sample.test-helper.js';
import { formatWord, trackReplace, typeOver, wordText } from './wordEdit.test-helper.js';

const CH2F = `${CH2}\n${LOREM} ${LOREM}\n\n${LOREM}\n`;
const CHAPTERS: WordChapterInput[] = [
  { id: 'ch1', title: 'Introduction', markdown: CH1 },
  { id: 'ch2', title: 'Second chapter', markdown: CH2F },
];
const CFG = config({ layout: { layoutType: 'double' } } as Partial<PostextConfig>);

let bytes: Uint8Array;

beforeAll(async () => {
  const docs = CHAPTERS.map((c) => build(c.markdown, CFG, RESOURCES));
  bytes = await formattedDocx({ docs, chapters: CHAPTERS, resources: RESOURCES, resourceBytes, date: DATE, exportId: 'ptx-int-fmt' });
});

function run(f: (xml: string) => string): { md: string[]; resources?: Resource[]; r: ReturnType<typeof apply> } {
  const r = apply(editDocx(bytes, f), CHAPTERS, RESOURCES);
  return { md: r.chapters.map((c) => c.markdown), resources: r.resources, r };
}

describe('formatted round trip: unedited', () => {
  it('is an exported file and reads back byte-identical, with no edits', () => {
    expectUnchanged(bytes, CHAPTERS, RESOURCES);
  });

  it('sets justified two-column pages with added hyphens', () => {
    const map = readExportMap(unzipSync(bytes))!;
    expect(map.variant).toBe('formatted');
    const hyphens = map.fragments.flatMap((f) => [...f.text].filter((ch, i) => ch === '-' && f.text[i + 1] === '\n' && f.map[i] === -1));
    expect(hyphens.length).toBeGreaterThan(5);
    expect(map.fragments.map((f) => f.target.kind === 'markdown' ? f.target.chapter : -1).filter((c) => c >= 0)).toContain(1);
  });

  it('is deterministic with a fixed date', async () => {
    const docs = CHAPTERS.map((c) => build(c.markdown, CFG, RESOURCES));
    expect(await formattedDocx({ docs, chapters: CHAPTERS, resources: RESOURCES, resourceBytes, date: DATE, exportId: 'ptx-int-fmt' })).toEqual(bytes);
  });
});

describe('formatted round trip: Word edits', () => {
  it('replaces a word in the middle of a line', () => {
    const { md, r } = run((x) => typeOver(x, 'arrang-\ning physical', 'arrang-\ning concrete'));
    expect(md).toEqual([CH1, CH2F.replace('physical', 'concrete')]);
    expect(r.edits).toMatchObject([{ chapter: 'ch2', before: 'physical', after: 'concrete', status: 'applied' }]);
  });

  it('retypes a word split by an added hyphen', () => {
    const { md } = run((x) => typeOver(x, 'of arrang-\ning', 'of order-\ning'));
    expect(md).toEqual([CH1, CH2F.replace('arranging', 'ordering')]);
  });

  it('deletes a word across a hyphen split', () => {
    const { md } = run((x) => typeOver(x, 'arrang-\ning physical', 'physical'));
    expect(md).toEqual([CH1, CH2F.replace('arranging physical', 'physical')]);
  });

  it('deletes words across a line break', () => {
    const { md } = run((x) => typeOver(x, 'is the¶composition of', 'is of'));
    expect(md).toEqual([CH1, CH2F.replace('is the composition of', 'is of')]);
    const br = run((x) => typeOver(x, 'of text\nby means of arrang', 'of text means of arrang'));
    expect(br.md).toEqual([CH1, CH2F.replace('of text by means', 'of text means')]);
  });

  it('joins lines and rejoins a paragraph the writer split: no edit', () => {
    const { md, r } = run((x) => typeOver(x, 'is the¶composition', 'is the composition'));
    expect(md).toEqual([CH1, CH2F]);
    expect(r.edits).toEqual([]);
  });

  it('bolds a word', () => {
    const { md, r } = run((x) => formatWord(x, 'closing', '<w:b/><w:bCs/>'));
    expect(md).toEqual([CH1, CH2F.replace('A closing', 'A **closing**')]);
    expect(r.edits.map((e) => e.kind)).toEqual(['format']);
  });

  it('accepts tracked insertions and deletions', () => {
    const { md, r } = run((x) => trackReplace(x, 'Another', 'One more'));
    expect(md).toEqual([CH1, CH2F.replace('Another', 'One more')]);
    expect(r.edits).toMatchObject([{ kind: 'tracked', status: 'applied' }]);
  });

  it('splits a paragraph', () => {
    const { md } = run((x) => typeOver(x, 'Last paragraph of the', 'Last paragraph¶of the'));
    expect(md).toEqual([CH1.replace('Last paragraph of the chapter.', 'Last paragraph\n\nof the chapter.'), CH2F]);
  });

  it('edits a heading, a list item, a box, a footnote and a forced-break line', () => {
    const { md } = run((x) => typeOver(typeOver(typeOver(typeOver(typeOver(x, 'Lists and notes', 'Lists and footnotes'), 'second item', 'second entry'), 'there\nis a sentence', 'there\nis a line'), 'text is\nshort.', 'text is\nshorter.'), 'A forced break comes', 'A forced break goes'));
    expect(md).toEqual([
      CH1.replace('## Lists and notes', '## Lists and footnotes').replace('- second item', '- second entry').replace('is a sentence', 'is a line').replace('is short.', 'is shorter.'),
      CH2F.replace('break comes', 'break goes'),
    ]);
  });

  it('deletes a forced break with its markup', () => {
    const { md } = run((x) => typeOver(x, 'with H2O.¶A forced', 'with H2O. A forced'));
    expect(md[1]).toBe(CH2F.replace('H~2~O.\\\nA forced', 'H~2~O. A forced'));
  });

  it('writes caption and cell edits back to the resources', () => {
    const { md, resources } = run((x) => typeOver(typeOver(x, 'Services\nand grades.', 'Services\nand marks.'), 'Fair', 'Poor'));
    expect(md).toEqual([CH1, CH2F]);
    const t1 = resources!.find((x) => x.id === 't1')!;
    expect(t1.caption).toBe('Services and marks.');
    expect(t1.table!.model.rows[2]![1]!.content).toBe('Poor');
  });

  it('edits the text after a cross-reference, around maths and before an index mark', () => {
    const { md } = run((x) => typeOver(typeOver(typeOver(x, 'Tab.\u00a01.1.', 'Tab.\u00a01.1 too.'), 'maths in a line', 'maths on a line'), 'The heart beats', 'The human heart beats'));
    expect(md[0]).toBe(CH1.replace(':ref{id="t1"}.', ':ref{id="t1"} too.').replace('maths in a line', 'maths on a line').replace('The heart:index', 'The human heart:index'));
  });
});

describe('formatted round trip: generated text', () => {
  it('rejects edits to a caption label and a reference number', () => {
    const { md, resources, r } = run((x) => typeOver(typeOver(x, 'Figure\u00a01.1. A red', 'Figure\u00a02.1. A red'), 'See figure Fig.\u00a01.1', 'See figure Fig.\u00a03.1'));
    expect(md).toEqual([CH1, CH2F]);
    expect(resources ?? RESOURCES).toEqual(RESOURCES);
    expect(r.edits.length).toBeGreaterThan(0);
    expect(r.edits.every((e) => e.status === 'rejected')).toBe(true);
    expect(r.changed).toBe(false);
  });

  it('ignores edits to list markers, which no bookmark holds', () => {
    const { md, r } = run((x) => typeOver(x, '•first item', '*first item'));
    expect(md).toEqual([CH1, CH2F]);
    expect(r.edits).toEqual([]);
  });
});

it('reads the Word text the way the edit helper sees it', () => {
  expect(wordText('<w:p><w:r><w:t>a</w:t><w:br/><w:t xml:space="preserve">b </w:t></w:r></w:p><w:p><w:r><w:t>c</w:t></w:r></w:p>')).toBe('a\nb ¶c');
});
