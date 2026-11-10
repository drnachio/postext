// A text replaced whole in an editor that takes its bookmark away
// (#1458). The shapes are the ones a real file showed: the Spanish guide
// uploaded to Google Docs, ten texts changed there with Find and replace,
// downloaded as .docx. Where the whole text of a fragment was replaced,
// Docs had removed the fragment's bookmark, start and end, and left the
// paragraph, the cell or the note where it was with the new text in the
// format of the first character replaced.

import { describe, expect, it } from 'vitest';
import type { Resource } from '../../types/resources/resources.js';
import { exportDocx, type Exported } from '../semantic/fixtures/harness.js';
import { nameLost, type Alignment } from './align.js';
import { applyDocxEdits, rebuildExportMap, type DocxEditResult } from './index.js';
import { editPart, savedByGoogleDocs } from './googleDocs.test-helper.js';

const TABLE: Resource = {
  id: 't1',
  typeId: 'table',
  kind: 'table',
  caption: 'What each tool gives',
  table: { model: { rows: [[{ content: 'Tool' }, { content: 'Result' }], [{ content: 'Engine' }, { content: 'Uneven' }]] } },
  createdAt: 0,
  updatedAt: 0,
} as Resource;

const MD =
  '# Rivers\n\n' +
  'Opening paragraph of the chapter, left as it is.\n\n' +
  '## Where water goes\n\n' +
  'Water runs down the valley and into the sea, slowly.\n\n' +
  '- **The first item** of the list goes on for a while\n- Second item of the list\n\n' +
  ':::callout{type="note" title="Key ideas" placement="top"}\nBox text stands here.\n:::\n\n' +
  'Text with a note.[^n] The table is :ref{id="t1"}, mentioned once.\n\n' +
  '[^n]: The note text, as it was written.\n\n' +
  'Last paragraph of the chapter.\n';

type Edit = (e: Exported) => (bytes: Uint8Array) => Uint8Array;

/**
 * The fragment's whole text replaced as Google Docs leaves it: the
 * bookmark gone, start and end, and one run in the format of the first
 * one where the fragment's runs stood. `text` undefined: the paragraph's
 * text deleted with the bookmark.
 */
function replaced(xml: string, id: string, text: string | undefined): string {
  const start = new RegExp(`<w:bookmarkStart [^>]*w:name="_ptx_${id}"[^>]*/>`).exec(xml)!;
  const endTag = `<w:bookmarkEnd w:id="${/w:id="(\d+)"/.exec(start[0])![1]}"/>`;
  const end = xml.indexOf(endTag, start.index);
  const inner = xml.slice(start.index + start[0].length, end);
  const first = inner.search(/<w:r[ >]/);
  const rPr = /<w:rPr>.*?<\/w:rPr>/s.exec(inner.slice(first))?.[0] ?? '';
  const run = text === undefined ? '' : `<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r>`;
  return xml.slice(0, start.index) + inner.slice(0, first) + run + xml.slice(end + endTag.length);
}

const inPart = (part: string, was: string, now: string | undefined): Edit => (e) => (bytes) => editPart(bytes, part, (xml) => replaced(xml, e.frag(was).id, now));
const inDoc = (was: string, now: string | undefined): Edit => inPart('word/document.xml', was, now);
/** A paragraph typed in the editor before the one that holds `text`. */
const typedBefore = (text: string, typed: string): Edit => () => (bytes) =>
  editPart(bytes, 'word/document.xml', (xml) => {
    const at = xml.lastIndexOf('<w:p ', xml.indexOf(`>${text}<`));
    const from = xml.slice(0, at).endsWith('/>') ? xml.lastIndexOf('<w:bookmarkStart', at) : at;
    return `${xml.slice(0, from)}<w:p><w:r><w:t>${typed}</w:t></w:r></w:p>${xml.slice(from)}`;
  });

const target = (md: string) => ({ chapters: [{ id: 'ch1', title: 'Chapter 1', markdown: md }], config: {} as never, resources: [TABLE] });

/** Export `MD`, save it as Google Docs does, edit it and bring it back
 *  into `now` (the book as it is at import); `was`: the book exported. */
async function fromDocs(edits: Edit[], now = MD, was = MD): Promise<DocxEditResult> {
  const e = await exportDocx([was], { config: {} as never, design: 'book', resources: [TABLE] });
  let bytes = savedByGoogleDocs(e.bytes);
  for (const edit of edits) bytes = edit(e)(bytes);
  const book = target(now);
  const rebuilt = await rebuildExportMap(bytes, book);
  expect(rebuilt).toBeDefined();
  return applyDocxEdits(bytes, { chapters: book.chapters, resources: book.resources }, { rebuilt: rebuilt! });
}

const applied = (r: DocxEditResult): boolean => r.edits.length > 0 && r.edits.every((e) => e.status === 'applied');
const md = (r: DocxEditResult): string => r.chapters[0]!.markdown;
const table = (r: DocxEditResult): Resource => (r.resources ?? [TABLE]).find((x) => x.id === 't1')!;

describe('a text replaced whole in Google Docs, its bookmark gone', () => {
  it('a heading stays a heading of its level, with no mark for what its style gives', async () => {
    const r = await fromDocs([inDoc('Where water goes', 'Where rivers end')]);
    expect(r.edits.map((e) => [e.kind, e.status, e.before, e.after])).toEqual([['text', 'applied', 'Where water goes', 'Where rivers end']]);
    expect(md(r)).toBe(MD.replace('## Where water goes', '## Where rivers end'));
  });

  it('a paragraph is one edit of that paragraph', async () => {
    const r = await fromDocs([inDoc('Water runs down the valley and into the sea, slowly.', 'Water runs to the sea.')]);
    expect(r.edits.map((e) => [e.kind, e.status])).toEqual([['text', 'applied']]);
    expect(md(r)).toBe(MD.replace('Water runs down the valley and into the sea, slowly.', 'Water runs to the sea.'));
  });

  it('a list item whose lead was bold stays an item, all of it in the lead\'s bold', async () => {
    const r = await fromDocs([inDoc('The first item of the list goes on for a while', 'The first item is short')]);
    expect(applied(r)).toBe(true);
    expect(md(r)).toBe(MD.replace('- **The first item** of the list goes on for a while', '- **The first item is short**'));
  });

  it('a caption goes to the resource, not to the number before it', async () => {
    const r = await fromDocs([inDoc('What each tool gives', 'What the tools give')]);
    expect(r.edits.map((e) => [e.resourceId, e.field, e.status])).toEqual([['t1', 'caption', 'applied']]);
    expect(table(r).caption).toBe('What the tools give');
    expect(md(r)).toBe(MD);
  });

  it('a table cell keeps its cell', async () => {
    const r = await fromDocs([inDoc('Engine', 'The engine')]);
    expect(r.edits.map((e) => [e.field, e.status])).toEqual([['cell:1:0', 'applied']]);
    expect(table(r).table!.model.rows.map((row) => row.map((c) => c.content))).toEqual([['Tool', 'Result'], ['The engine', 'Uneven']]);
  });

  it('a box title goes to the title attribute', async () => {
    const r = await fromDocs([inDoc('Key ideas', 'Main points')]);
    expect(applied(r)).toBe(true);
    expect(md(r)).toBe(MD.replace('title="Key ideas"', 'title="Main points"'));
  });

  it('a note keeps its id', async () => {
    const r = await fromDocs([inPart('word/footnotes.xml', 'The note text, as it was written.', 'The note, rewritten.')]);
    expect(applied(r)).toBe(true);
    expect(md(r)).toBe(MD.replace('[^n]: The note text, as it was written.', '[^n]: The note, rewritten.'));
  });

  it('several at once, two of them in a row, and the file read again into the book they changed', async () => {
    const edits = [
      inDoc('Where water goes', 'Where rivers end'),
      inDoc('Water runs down the valley and into the sea, slowly.', 'Water runs to the sea.'),
      inDoc('What each tool gives', 'What the tools give'),
      inDoc('Key ideas', 'Main points'),
      inPart('word/footnotes.xml', 'The note text, as it was written.', 'The note, rewritten.'),
    ];
    const want = MD.replace('## Where water goes', '## Where rivers end')
      .replace('Water runs down the valley and into the sea, slowly.', 'Water runs to the sea.')
      .replace('title="Key ideas"', 'title="Main points"')
      .replace('[^n]: The note text, as it was written.', '[^n]: The note, rewritten.');
    const r = await fromDocs(edits);
    expect(applied(r)).toBe(true);
    expect(r.edits).toHaveLength(5);
    expect(md(r)).toBe(want);
    expect(table(r).caption).toBe('What the tools give');
    // The book changed since the export: its passages are matched by
    // their text, and the ones the file has no name for by their place.
    const e = await exportDocx([MD], { config: {} as never, design: 'book', resources: [TABLE] });
    let bytes = savedByGoogleDocs(e.bytes);
    for (const edit of edits) bytes = edit(e)(bytes);
    const book = { ...target(want), resources: r.resources! };
    const again = applyDocxEdits(bytes, { chapters: book.chapters, resources: book.resources }, { rebuilt: (await rebuildExportMap(bytes, book))! });
    expect(again.edits).toEqual([]);
  });

  it('in a book that changed since the export, matched by its text', async () => {
    const now = MD.replace(':::callout', 'A paragraph the book gained since.\n\n:::callout');
    const r = await fromDocs([inDoc('Where water goes', 'Where rivers end'), inDoc('What each tool gives', 'What the tools give'), inDoc('Engine', 'The engine')], now);
    expect(r.notes?.map((n) => n.code)).toEqual(['map-rebuilt', 'book-changed']);
    expect(r.edits).toHaveLength(3);
    expect(applied(r)).toBe(true);
    expect(md(r)).toBe(now.replace('## Where water goes', '## Where rivers end'));
    expect(table(r).caption).toBe('What the tools give');
    expect(table(r).table!.model.rows[1]![0]!.content).toBe('The engine');
  });

  it('where the book gained a passage beside the one replaced, nothing tells the two apart: left as before', async () => {
    // One name gone from the file, two passages of the book without partner there.
    const now = MD.replace('## Where water goes', 'A paragraph the book gained since.\n\n## Where water goes');
    const r = await fromDocs([inDoc('Where water goes', 'Where rivers end')], now);
    expect(md(r)).toContain('A paragraph the book gained since.\n\n## Where water goes\n');
  });
});

describe('a bookmark gone with nothing, or with more, in its place', () => {
  it('nothing in its place is still a deletion', async () => {
    const r = await fromDocs([inDoc('Water runs down the valley and into the sea, slowly.', undefined)]);
    expect(r.edits.map((e) => [e.kind, e.status, e.after])).toEqual([['paragraph', 'applied', '']]);
    expect(md(r)).toBe(MD.replace('Water runs down the valley and into the sea, slowly.\n\n', ''));
  });

  it('text typed between two fragments that kept their bookmarks is still an addition', async () => {
    const r = await fromDocs([typedBefore('Last paragraph of the chapter.', 'A paragraph typed in.')]);
    expect(r.edits.map((e) => [e.kind, e.status])).toEqual([['paragraph', 'applied']]);
    expect(md(r)).toContain('\n\nA paragraph typed in.\n\nLast paragraph of the chapter.\n');
    expect(md(r)).toContain('## Where water goes\n\nWater runs down the valley and into the sea, slowly.\n');
  });

  it('one fragment gone and two paragraphs there: the one most like it is its text, the other one typed in, and said so', async () => {
    const r = await fromDocs([
      inDoc('Water runs down the valley and into the sea, slowly.', 'Water runs to the sea.'),
      typedBefore('Water runs to the sea.', 'A paragraph typed in.'),
    ]);
    expect(r.edits.map((e) => [e.kind, e.status, e.reason])).toEqual([['text', 'applied', 'bookmark-placed'], ['paragraph', 'applied', undefined]]);
    expect(md(r)).toBe(MD.replace('Water runs down the valley and into the sea, slowly.', 'A paragraph typed in.\n\nWater runs to the sea.'));
  });

  // The formatted design as Google Docs saves it: no heading keeps a
  // style name, each run says how it is set.
  const unstyled: Edit = () => (bytes) => editPart(bytes, 'word/document.xml', (xml) => xml.replace(/<w:pStyle w:val="[^"]*"\/>/g, ''));
  /** A paragraph typed after the one that holds `text`, set as it is. */
  const typedAfter = (text: string, typed: string): Edit => () => (bytes) =>
    editPart(bytes, 'word/document.xml', (xml) => {
      const at = xml.indexOf(`>${text}<`);
      const from = xml.lastIndexOf('<w:p ', at);
      const to = xml.indexOf('</w:p>', at) + '</w:p>'.length;
      const copy = xml.slice(from, to).replace(/<w:bookmark(?:Start|End) [^>]*\/>/g, '').replace(`>${text}<`, `>${typed}<`);
      return xml.slice(0, to) + copy + xml.slice(to);
    });

  for (const [name, beside] of [
    ['before it', typedBefore('Where rivers end', 'Rivers, typed in.')],
    ['after it, set as the heading is', typedAfter('Where rivers end', 'Typed after the heading.')],
  ] as const) {
    it(`a heading replaced stays a heading with a paragraph typed ${name}, styles or none`, async () => {
      for (const more of [[], [unstyled]]) {
        const r = await fromDocs([inDoc('Where water goes', 'Where rivers end'), beside, ...more]);
        expect(r.edits.every((e) => e.status === 'applied')).toBe(true);
        expect(r.edits.filter((e) => e.after === '')).toEqual([]);
        expect(md(r)).toContain('## Where rivers end\n');
        expect(md(r)).not.toContain('**Where rivers end**');
        expect(md(r)).not.toContain('Where water goes');
        expect(md(r)).toMatch(/Rivers, typed in\.|Typed after the heading\./);
      }
    });
  }

  it('a paragraph replaced beside a heading-like paragraph typed in is told by how it is set', async () => {
    const r = await fromDocs([
      inDoc('Water runs down the valley and into the sea, slowly.', 'Brooks join.'),
      typedAfter('Where water goes', 'Typed, set as a heading'),
      unstyled,
    ]);
    expect(r.edits.filter((e) => e.after === '')).toEqual([]);
    expect(md(r)).toContain('## Where water goes\n\n**Typed, set as a heading**\n\nBrooks join.\n');
  });

  it('two replaced in a row and one of them deleted: the heading left is the heading, the paragraph is deleted and said so', async () => {
    for (const more of [[], [unstyled]]) {
      const r = await fromDocs([inDoc('Where water goes', 'Where rivers end'), inDoc('Water runs down the valley and into the sea, slowly.', undefined), ...more]);
      expect(r.edits.map((e) => [e.kind, e.status, e.reason])).toEqual([['text', 'applied', 'bookmark-placed'], ['paragraph', 'applied', 'bookmark-unpaired']]);
      expect(md(r)).toBe(MD.replace('## Where water goes\n\nWater runs down the valley and into the sea, slowly.\n\n', '## Where rivers end\n\n'));
    }
    const r = await fromDocs([inDoc('Where water goes', undefined), inDoc('Water runs down the valley and into the sea, slowly.', 'Brooks join.'), unstyled]);
    expect(md(r)).toBe(MD.replace('## Where water goes\n\nWater runs down the valley and into the sea, slowly.\n\n', 'Brooks join.\n\n'));
  });

  it('two cells replaced in a row and one of them emptied: each is the cell in its place', async () => {
    for (const [edits, want] of [
      [[inDoc('Tool', undefined), inDoc('Result', 'Outcome')], ['', 'Outcome']],
      [[inDoc('Tool', 'Instrument'), inDoc('Result', undefined)], ['Instrument', '']],
    ] as const) {
      const r = await fromDocs([...edits]);
      expect(r.edits.every((e) => e.status === 'applied')).toBe(true);
      expect(table(r).table!.model.rows.map((row) => row.map((c) => c.content))).toEqual([want, ['Engine', 'Uneven']]);
      expect(md(r)).toBe(MD);
    }
  });
});

describe('a text replaced whole that held marks', () => {
  const WAS = '# Rivers\n\n1. **Faults of the line.** The _widows_ and the _orphans_ are [known](https://example.org/k), the **rest** is not\n2. Second item\n\nA \\*starred\\* word and _one_ more.\n';

  it('is one edit that leaves no mark open or empty, and reads back with no edit', async () => {
    const edits = [inDoc('Faults of the line. The widows and the orphans are known, the rest is not', 'Widows and orphans.'), inDoc('A *starred* word and one more.', 'A plain sentence.')];
    const r = await fromDocs(edits, WAS, WAS);
    expect(r.edits.map((e) => [e.kind, e.status])).toEqual([['text', 'applied'], ['text', 'applied']]);
    const want = '# Rivers\n\n1. **Widows and orphans.**\n2. Second item\n\nA plain sentence.\n';
    expect(md(r)).toBe(want);
    const again = await fromDocs(edits, want, WAS);
    expect(again.edits).toEqual([]);
  });
});

describe('a line of an index the book no longer gives', () => {
  const INDEX = '# Index\n\n:::index\n';
  const BODY = '# Rivers\n\nA brook:index{term="brook"} runs here.\n\nThe delta:index{term="delta"} is wide and slow, every year.\n\nThe estuary:index{term="estuary"} opens.\n';

  it('is not a paragraph typed in the editor', async () => {
    const e = await exportDocx([BODY, INDEX], { config: {} as never, design: 'book' });
    const bytes = savedByGoogleDocs(e.bytes);
    // The passage that brought `delta` was reworded in the book since.
    const now = BODY.replace('The delta:index{term="delta"} is wide and slow, every year.', 'The mouth is wide and slow, every year.');
    const book = { chapters: [{ id: 'ch1', title: 'Chapter 1', markdown: now }, { id: 'ch2', title: 'Chapter 2', markdown: INDEX }], config: {} as never };
    const r = applyDocxEdits(bytes, { chapters: book.chapters }, { rebuilt: (await rebuildExportMap(bytes, book))! });
    expect(r.chapters[1]!.markdown).toBe(INDEX);
    expect(r.edits.filter((x) => x.kind === 'paragraph')).toEqual([]);
  });
});

describe('a paragraph typed over in Word, its bookmark gone, in a file that keeps its map', () => {
  const back = (bytes: Uint8Array) => applyDocxEdits(bytes, { chapters: [{ id: 'ch1', markdown: MD }], resources: [TABLE] });

  it('is that paragraph with new text: a heading, a cell, a note', async () => {
    const e = await exportDocx([MD], { resources: [TABLE] });
    let bytes = e.bytes;
    for (const edit of [inDoc('Where water goes', 'Where rivers end'), inDoc('Engine', 'The engine'), inPart('word/footnotes.xml', 'The note text, as it was written.', 'The note, rewritten.')]) bytes = edit(e)(bytes);
    const r = back(bytes);
    expect(applied(r)).toBe(true);
    expect(r.edits).toHaveLength(3);
    expect(md(r)).toBe(MD.replace('## Where water goes', '## Where rivers end').replace('[^n]: The note text, as it was written.', '[^n]: The note, rewritten.'));
    expect(table(r).table!.model.rows[1]![0]!.content).toBe('The engine');
  });

  it('keeps a paragraph deleted and a heading typed there apart: the styles differ', async () => {
    const e = await exportDocx([MD], { resources: [TABLE] });
    const bytes = editPart(inDoc('Water runs down the valley and into the sea, slowly.', undefined)(e)(e.bytes), 'word/document.xml', (xml) => {
      const at = xml.lastIndexOf('<w:p>', xml.indexOf('>The first item<'));
      return `${xml.slice(0, at)}<w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr><w:r><w:t>A heading typed in</w:t></w:r></w:p>${xml.slice(at)}`;
    });
    const r = back(bytes);
    expect(r.edits.every((x) => x.status === 'applied')).toBe(true);
    expect(md(r)).not.toContain('down the valley');
    expect(md(r)).toContain('### A heading typed in\n');
  });
});

describe('the names a file lacks', () => {
  const named = (ids: string[]) => ids.map((id) => ({ id, text: id }));
  const alignment = (ids: [string, string][], unplaced: string[]): Alignment => ({ ids: new Map(ids), unplaced: new Set(unplaced), foreign: new Set() });

  it('go to the fragments without partner that stand there, as many as names', () => {
    // The book gained nothing; the file lacks `2` and `5` of 0…6.
    const out = alignment([['0', '0'], ['1', '1'], ['3', '3'], ['4', '4'], ['6', '6']], ['2', '5']);
    nameLost(named(['0', '1', '2', '3', '4', '5', '6']), new Set(['0', '1', '3', '4', '6']), out, 0, 7);
    expect([...out.lost!]).toEqual([['2', '2'], ['5', '5']]);
  });

  it('are not given out when the book gained a passage there too, or past an end that is not known', () => {
    // `2` and `3` of the book have no partner; the file lacks one name.
    const out = alignment([['0', '0'], ['1', '1'], ['4', '3'], ['5', '4']], ['2', '3', '6']);
    nameLost(named(['0', '1', '2', '3', '4', '5', '6']), new Set(['0', '1', '3', '4']), out, 0, Infinity);
    expect(out.lost).toBeUndefined();
    // With the end known, the last one is the name the file lacks there.
    nameLost(named(['0', '1', '2', '3', '4', '5', '6']), new Set(['0', '1', '3', '4']), out, 0, 6);
    expect([...out.lost!]).toEqual([['6', '5']]);
  });
});
