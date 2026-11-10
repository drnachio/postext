// A flow export saved by Google Docs comes back into its book (#1458):
// the map written again from the book, the looks compared instead of the
// run properties, and the edits a proofreader makes there.

import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { Resource } from '../../types/resources/resources.js';
import { readExportTrace } from '../anchors/trace.js';
import { exportDocx } from '../semantic/fixtures/harness.js';
import type { SemanticDesign } from '../semantic/index.js';
import { applyDocxEdits, exportMapLost, isExportedDocx, rebuildExportMap, type DocxEditResult } from './index.js';
import { editPart, savedByGoogleDocs, type GoogleDocsOptions } from './googleDocs.test-helper.js';

const pt = (value: number) => ({ value, unit: 'pt' });

/** Second-level headings in capitals, as a book's design sets them. */
const CONFIG = { headings: { levels: [{ level: 1, fontSize: pt(24) }, { level: 2, fontSize: pt(14), textTransform: 'uppercase' }] } } as never;

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
  '## Where water goes\n\n' +
  'A **bold** word, an *italic* one, `code` here, a [link](https://example.com/a) and H~2~O. Second sentence here.\n\n' +
  '- First item of the list\n- Second item of the list\n\n' +
  ':::callout{type="note"}\nBox text stands here.\n:::\n\n' +
  'Text with a note.[^n] The table is :ref{id="t1"}, mentioned once. And :index[deltas]{term="Deltas"} too.\n\n' +
  '[^n]: The note text.\n\n' +
  '$$ \\det \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc $$\n\n' +
  'Last paragraph of the chapter.\n';

const INDEX = '# Index\n\n:::index\n';
const CONTENTS = '# Contents\n\n:::toc\n';

const book = (chapters: string[], config: never = CONFIG, ids?: string[]) => ({
  chapters: chapters.map((markdown, i) => ({ id: ids?.[i] ?? `ch${i + 1}`, title: `Chapter ${i + 1}`, markdown })),
  config,
  resources: [TABLE],
});

/** Export `chapters`, save the file as Google Docs does, edit it, and
 *  bring it back into `now` (the book as it is at import). */
async function roundTrip(
  chapters: string[],
  design: SemanticDesign,
  options: { docs?: GoogleDocsOptions; edit?: (bytes: Uint8Array) => Uint8Array; now?: string[]; nowIds?: string[]; config?: never; nowConfig?: never } = {},
): Promise<DocxEditResult> {
  const e = await exportDocx(chapters, { config: options.config ?? CONFIG, design, resources: [TABLE] });
  let bytes = savedByGoogleDocs(e.bytes, options.docs);
  if (options.edit) bytes = options.edit(bytes);
  const target = book(options.now ?? chapters, options.nowConfig ?? options.config ?? CONFIG, options.nowIds);
  const rebuilt = await rebuildExportMap(bytes, target);
  expect(rebuilt).toBeDefined();
  return applyDocxEdits(bytes, { chapters: target.chapters, resources: target.resources }, { rebuilt: rebuilt! });
}

const inDoc = (edit: (xml: string) => string) => (bytes: Uint8Array) => editPart(bytes, 'word/document.xml', edit);

describe('a flow export saved by Google Docs', () => {
  it('is known for an export without its map', async () => {
    const e = await exportDocx([MD], { config: CONFIG });
    const bytes = savedByGoogleDocs(e.bytes);
    expect(isExportedDocx(e.bytes)).toBe(true);
    expect(isExportedDocx(bytes)).toBe(false);
    expect(exportMapLost(bytes)).toBe(true);
    const files = unzipSync(bytes);
    expect(Object.keys(files).some((p) => p.startsWith('customXml/'))).toBe(false);
    // What Google Docs keeps says how the file was written.
    const trace = readExportTrace(files)!;
    expect(trace.design).toBe('book');
    expect(trace.chapters).toHaveLength(1);
    expect(trace.fragments).toBe(e.map.fragments.length);
    // A file that still has its map needs none written again.
    expect(await rebuildExportMap(e.bytes, book([MD]))).toBeUndefined();
  });

  for (const design of ['book', 'plain'] as const) {
    for (const toc of ['plain', 'field'] as const) {
      it(`comes back with no edit (${design}, contents as ${toc})`, async () => {
        const r = await roundTrip([CONTENTS, MD, INDEX], design, { docs: { toc } });
        expect(r.edits).toEqual([]);
        expect(r.changed).toBe(false);
        expect(r.notes).toEqual([{ code: 'map-rebuilt' }]);
        expect(r.chapters.map((c) => c.markdown)).toEqual([CONTENTS, MD, INDEX]);
      });
    }
  }

  it('types out the capitals a style gave, and writes styles on the runs', async () => {
    const e = await exportDocx([MD], { config: CONFIG });
    const doc = strFromU8(unzipSync(savedByGoogleDocs(e.bytes))['word/document.xml']!);
    expect(e.doc).toContain('>Where water goes<');
    expect(doc).toContain('>WHERE WATER GOES<');
    expect(doc).not.toContain('PostextCodeChar');
    expect(doc).toMatch(/<w:bookmarkStart w:colFirst="0" w:colLast="0" w:name="_ptx_0" w:id="\d+"\/><w:p /);
  });

  it('finds the design of a file that does not say it', async () => {
    for (const design of ['book', 'plain'] as const) {
      const r = await roundTrip([MD, INDEX], design, { docs: { oldProps: true } });
      expect(r.edits).toEqual([]);
      expect(r.notes).toEqual([{ code: 'map-rebuilt' }, { code: 'book-unverified' }]);
    }
  });

  it('does not delete what the writer hid and Google Docs dropped', async () => {
    const md = '# Cover {hidden=true}\n\nThe text of the page.\n';
    const e = await exportDocx([md], { config: CONFIG });
    expect(e.doc).toContain('<w:vanish/>');
    const bytes = savedByGoogleDocs(e.bytes);
    expect(strFromU8(unzipSync(bytes)['word/document.xml']!)).not.toContain('>Cover<');
    const target = book([md]);
    const r = applyDocxEdits(bytes, target, { rebuilt: (await rebuildExportMap(bytes, target))! });
    expect(r.edits).toEqual([]);
  });
});

describe('edits made in Google Docs', () => {
  const edits: [string, (xml: string) => string, (md: string) => string][] = [
    ['a word in a paragraph', (x) => x.replace('Second sentence here.', 'Second phrase here.'), (m) => m.replace('Second sentence', 'Second phrase')],
    // The plain design sets no capitals: the heading reads as written.
    ['a heading set in capitals', (x) => x.replace('>WHERE WATER GOES<', '>WHERE THE WATER GOES<').replace('>Where water goes<', '>Where the water goes<'), (m) => m.replace('Where water goes', 'Where the water goes')],
    ['a list item', (x) => x.replace('First item of the list', 'First entry of the list'), (m) => m.replace('First item', 'First entry')],
    ['a box', (x) => x.replace('Box text stands here.', 'Box text sits here.'), (m) => m.replace('stands', 'sits')],
    ['a sentence deleted', (x) => x.replace(' Second sentence here.', ''), (m) => m.replace(' Second sentence here.', '')],
    ['a sentence added', (x) => x.replace('Last paragraph of the chapter.', 'Last paragraph of the chapter. One more.'), (m) => m.replace('chapter.\n', 'chapter. One more.\n')],
  ];
  for (const design of ['book', 'plain'] as const) {
    for (const [name, edit, want] of edits) {
      it(`${name} (${design})`, async () => {
        const r = await roundTrip([MD, INDEX], design, { edit: inDoc(edit) });
        expect(r.edits.map((e) => e.status)).toEqual(['applied']);
        expect(r.chapters[0]!.markdown).toBe(want(MD));
        expect(r.chapters[1]!.markdown).toBe(INDEX);
        expect(r.resources).toBeUndefined();
      });
    }
  }

  it('a caption and a table cell', async () => {
    const r = await roundTrip([MD, INDEX], 'book', {
      edit: inDoc((x) => x.replace('What each tool gives', 'What each tool yields').replace('>Uneven<', '>Patchy<')),
    });
    expect(r.edits.map((e) => [e.resourceId, e.field, e.status])).toEqual(expect.arrayContaining([['t1', 'caption', 'applied'], ['t1', 'cell:1:1', 'applied']]));
    expect(r.edits).toHaveLength(2);
    const t = r.resources!.find((x) => x.id === 't1')!;
    expect(t.caption).toBe('What each tool yields');
    expect(t.table!.model.rows[1]![1]!.content).toBe('Patchy');
    expect(r.chapters[0]!.markdown).toBe(MD);
  });

  it('a footnote', async () => {
    const r = await roundTrip([MD, INDEX], 'plain', { edit: (b) => editPart(b, 'word/footnotes.xml', (x) => x.replace('The note text.', 'The note, corrected.')) });
    expect(r.chapters[0]!.markdown).toBe(MD.replace('The note text.', 'The note, corrected.'));
  });

  it('a word made bold and one made italic, which Google Docs writes on the run', async () => {
    const cut = (xml: string, word: string, prop: string): string => {
      // The word's run cut in three, the middle one with the property on.
      const at = xml.indexOf(word);
      const start = xml.lastIndexOf('<w:r ', at);
      const end = xml.indexOf('</w:r>', at) + 6;
      const run = xml.slice(start, end);
      const [before, after] = [run.slice(0, run.indexOf(word)), run.slice(run.indexOf(word) + word.length)];
      const open = run.slice(0, run.indexOf('<w:t'));
      const piece = (props: string, text: string) => `${props}<w:t xml:space="preserve">${text}</w:t></w:r>`;
      const on = open.replace(`<w:${prop} w:val="0"/>`, `<w:${prop} w:val="1"/>`);
      return xml.slice(0, start) + before + '</w:t></w:r>' + piece(on, word) + piece(open, '') .replace('<w:t xml:space="preserve"></w:t></w:r>', `<w:t xml:space="preserve">${after.replace('</w:t></w:r>', '')}</w:t></w:r>`) + xml.slice(end);
    };
    const r = await roundTrip([MD, INDEX], 'book', { edit: inDoc((x) => cut(cut(x, 'paragraph of', 'b'), 'mentioned', 'i')) });
    expect(r.edits.map((e) => [e.kind, e.status])).toEqual([['format', 'applied'], ['format', 'applied']]);
    expect(r.chapters[0]!.markdown).toBe(MD.replace('mentioned', '*mentioned*').replace('paragraph of', '**paragraph of**'));
  });

  it('a bold taken off', async () => {
    const r = await roundTrip([MD, INDEX], 'plain', {
      edit: inDoc((x) => {
        const at = x.indexOf('>bold<');
        const start = x.lastIndexOf('<w:r ', at);
        return x.slice(0, start) + x.slice(start, at).replace('<w:b w:val="1"/>', '<w:b w:val="0"/>') + x.slice(at);
      }),
    });
    expect(r.chapters[0]!.markdown).toBe(MD.replace('**bold**', 'bold'));
  });

  it('a paragraph split in two', async () => {
    const r = await roundTrip([MD, INDEX], 'book', {
      edit: inDoc((x) => {
        const at = x.indexOf(' Second sentence here.');
        const run = x.slice(x.lastIndexOf('<w:r ', at), x.indexOf('<w:t', x.lastIndexOf('<w:r ', at)));
        const p = x.slice(x.lastIndexOf('<w:p ', at), x.indexOf('</w:pPr>', x.lastIndexOf('<w:p ', at)) + 8);
        return `${x.slice(0, at)}</w:t></w:r></w:p>${p}${run}<w:t xml:space="preserve">Second sentence here.${x.slice(at + ' Second sentence here.'.length)}`;
      }),
    });
    expect(r.edits.every((e) => e.status === 'applied')).toBe(true);
    expect(r.chapters[0]!.markdown).toBe(MD.replace('H~2~O. Second', 'H~2~O.\n\nSecond'));
  });

  it('a paragraph split in two by an editor that moves the bookmark to the second half', async () => {
    const r = await roundTrip([MD, INDEX], 'book', {
      edit: inDoc((x) => {
        // The first half stands outside the bookmark, the reference to
        // the table in it; the bookmark's start goes before the second.
        const at = x.indexOf(' mentioned once.');
        const p0 = x.lastIndexOf('<w:p ', at);
        const mark = x.slice(x.lastIndexOf('<w:bookmarkStart', p0), p0);
        expect(mark).toContain('_ptx_');
        const run = x.slice(x.lastIndexOf('<w:r ', at), x.indexOf('<w:t', x.lastIndexOf('<w:r ', at)));
        const p = x.slice(p0, x.indexOf('</w:pPr>', p0) + 8);
        const out = `${x.slice(0, at)}</w:t></w:r></w:p>${mark}${p}${run}<w:t xml:space="preserve">mentioned once.${x.slice(at + ' mentioned once.'.length)}`;
        return out.slice(0, out.lastIndexOf('<w:bookmarkStart', p0)) + out.slice(p0);
      }),
    });
    expect(r.edits.every((e) => e.status === 'applied')).toBe(true);
    // The note and the reference of the first half stay as written.
    expect(r.chapters[0]!.markdown).toBe(MD.replace('is :ref{id="t1"}, mentioned once.', 'is :ref{id="t1"},\n\nmentioned once.'));
  });

  it('a paragraph deleted whole', async () => {
    const r = await roundTrip([MD, INDEX], 'plain', {
      edit: inDoc((x) => {
        const at = x.indexOf('Last paragraph of the chapter.');
        const start = x.lastIndexOf('<w:bookmarkStart', x.lastIndexOf('<w:p ', at));
        return x.slice(0, start) + x.slice(x.indexOf('</w:p>', at) + 6);
      }),
    });
    expect(r.edits.map((e) => e.status)).toEqual(['applied']);
    expect(r.chapters[0]!.markdown).not.toContain('Last paragraph');
  });

  // Google Docs numbers the footnotes again from 0 in reading order, so
  // a note typed there takes a number the book's notes had.
  for (const [where, typed, kept] of [['before', 0, 1], ['after', 1, 0]] as const) {
    it(`a footnote typed in ${where} the book's own`, async () => {
      const call = (id: number) => `<w:r><w:footnoteReference w:customMarkFollows="0" w:id="${id}"/></w:r>`;
      const anchor = where === 'before' ? 'Second sentence here.' : 'Last paragraph of the chapter.';
      const r = await roundTrip([MD, INDEX], 'book', {
        edit: (b) =>
          editPart(
            editPart(b, 'word/document.xml', (x) => {
              expect(x).toContain('<w:footnoteReference w:customMarkFollows="0" w:id="0"/>');
              return x.replace('<w:footnoteReference w:customMarkFollows="0" w:id="0"/>', `<w:footnoteReference w:customMarkFollows="0" w:id="${kept}"/>`).replace(`${anchor}</w:t></w:r>`, `${anchor}</w:t></w:r>${call(typed)}`);
            }),
            'word/footnotes.xml',
            (x) => {
              const note = `<w:footnote w:id="${typed}"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> A note typed in the editor.</w:t></w:r></w:p></w:footnote>`;
              const own = x.replace('<w:footnote w:id="0">', `<w:footnote w:id="${kept}">`);
              return where === 'before' ? own.replace(`<w:footnote w:id="${kept}">`, `${note}<w:footnote w:id="${kept}">`) : own.replace('</w:footnotes>', `${note}</w:footnotes>`);
            },
          ),
      });
      expect(r.edits.every((e) => e.status === 'applied')).toBe(true);
      expect(r.chapters[0]!.markdown).toBe(`${MD.replace(anchor, `${anchor}[^wf${typed}]`)}\n[^wf${typed}]: A note typed in the editor.\n`);
    });
  }

  it('words typed at the start of a caption, after the number postext writes', async () => {
    for (const design of ['book', 'plain'] as const) {
      const r = await roundTrip([MD, INDEX], design, {
        edit: inDoc((x) => {
          // Between the end of the label's bookmark and the start of the
          // caption's: where an editor puts what is typed there.
          const start = x.lastIndexOf('<w:bookmarkStart', x.indexOf('What each tool gives'));
          expect(x.slice(start - 30, start)).toMatch(/<w:bookmarkEnd w:id="\d+"\/>$/);
          return `${x.slice(0, start)}<w:r><w:t xml:space="preserve">Here: </w:t></w:r>${x.slice(start)}`;
        }),
      });
      expect(r.edits.map((e) => [e.resourceId, e.field, e.status])).toEqual([['t1', 'caption', 'applied']]);
      expect(r.resources!.find((x) => x.id === 't1')!.caption).toBe('Here: What each tool gives');
    }
  });

  it('a row added to a table: reported, and not written into the chapter', async () => {
    const r = await roundTrip([MD, INDEX], 'book', {
      edit: inDoc((x) => {
        const at = x.indexOf('>Uneven<');
        const end = x.indexOf('</w:tr>', at) + 7;
        const row = x.slice(Math.max(x.lastIndexOf('<w:tr>', at), x.lastIndexOf('<w:tr ', at)), end);
        const added = row.replace(/<w:bookmark(?:Start|End) [^>]*\/>/g, '').replace('>Engine<', '>Loom<').replace('>Uneven<', '>Even<');
        expect(added).toContain('>Loom<');
        return x.slice(0, end) + added + x.slice(end);
      }),
    });
    expect(r.edits.map((e) => [e.resourceId, e.status, e.reason, e.after])).toEqual([['t1', 'rejected', 'table-row', 'Loom'], ['t1', 'rejected', 'table-row', 'Even']]);
    expect(r.changed).toBe(false);
    expect(r.chapters[0]!.markdown).toBe(MD);
  });

  it('a paragraph typed in', async () => {
    const r = await roundTrip([MD, INDEX], 'plain', {
      edit: inDoc((x) => {
        const at = x.indexOf('</w:p>', x.indexOf('Last paragraph of the chapter.')) + 6;
        return `${x.slice(0, at)}<w:p><w:pPr></w:pPr><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>A new closing line.</w:t></w:r></w:p>${x.slice(at)}`;
      }),
    });
    expect(r.chapters[0]!.markdown).toContain('Last paragraph of the chapter.\n\nA new closing line.\n');
  });
});

describe('the same file imported again, into the book that took its edits', () => {
  const FIRST = 'The first paragraph says how water runs down a slope and gathers in a bed.';
  const NEXT = 'The one after it tells where the river meets the sea, and what it leaves there on the way.';
  const TWO = `# Rivers\n\nA line before them.\n\n${FIRST}\n\n${NEXT}\n\nA line after them.\n`;

  /** Export, save as Google Docs does, edit, import, then import the
   *  same file once more into what the first import gave. */
  async function twice(edit: (xml: string) => string): Promise<{ first: DocxEditResult; again: DocxEditResult }> {
    const e = await exportDocx([TWO], { config: CONFIG, design: 'plain', resources: [TABLE] });
    const bytes = editPart(savedByGoogleDocs(e.bytes), 'word/document.xml', edit);
    const run = async (chapters: string[]): Promise<DocxEditResult> => {
      const target = book(chapters);
      return applyDocxEdits(bytes, { chapters: target.chapters, resources: target.resources }, { rebuilt: (await rebuildExportMap(bytes, target))! });
    };
    const first = await run([TWO]);
    return { first, again: await run(first.chapters.map((c) => c.markdown)) };
  }

  it('two paragraphs joined: the joined one keeps both halves', async () => {
    const { first, again } = await twice((x) => {
      // Backspace at the start of the second: its runs and its bookmark
      // move into the first.
      const pB = x.lastIndexOf('<w:p ', x.indexOf(NEXT));
      const head = x.slice(pB, x.indexOf('</w:pPr>', pB) + 8);
      const endA = x.lastIndexOf('</w:p>', pB);
      return `${x.slice(0, endA)}<w:r><w:t xml:space="preserve"> </w:t></w:r>${x.slice(endA + 6, pB)}${x.slice(pB + head.length)}`;
    });
    const joined = TWO.replace(`${FIRST}\n\n${NEXT}`, `${FIRST} ${NEXT}`);
    expect(first.chapters[0]!.markdown).toBe(joined);
    expect(again.edits.filter((e) => e.status === 'applied')).toEqual([]);
    expect(again.chapters[0]!.markdown).toBe(joined);
  });

  it('a paragraph split in two: neither half is written twice', async () => {
    const { first, again } = await twice((x) => {
      const at = x.indexOf(' and gathers in a bed.');
      const run = x.slice(x.lastIndexOf('<w:r ', at), x.indexOf('<w:t', x.lastIndexOf('<w:r ', at)));
      const p = x.slice(x.lastIndexOf('<w:p ', at), x.indexOf('</w:pPr>', x.lastIndexOf('<w:p ', at)) + 8);
      return `${x.slice(0, at)}</w:t></w:r></w:p>${p}${run}<w:t xml:space="preserve">And gathers in a bed.${x.slice(at + ' and gathers in a bed.'.length)}`;
    });
    const split = TWO.replace(' and gathers in a bed.', '\n\nAnd gathers in a bed.');
    expect(first.chapters[0]!.markdown).toBe(split);
    expect(again.edits.filter((e) => e.status === 'applied')).toEqual([]);
    expect(again.chapters[0]!.markdown).toBe(split);
  });

  it('a word changed, a paragraph deleted and one typed in: nothing more to bring', async () => {
    const { first, again } = await twice((x) => {
      const gone = x.indexOf('A line before them.');
      const start = x.lastIndexOf('<w:bookmarkStart', x.lastIndexOf('<w:p ', gone));
      const out = x.slice(0, start) + x.slice(x.indexOf('</w:p>', gone) + 6);
      const end = out.indexOf('</w:p>', out.indexOf('A line after them.')) + 6;
      return `${out.slice(0, end)}<w:p><w:pPr></w:pPr><w:r><w:t>A line typed at the end.</w:t></w:r></w:p>${out.slice(end)}`.replace('meets the sea', 'reaches the sea');
    });
    const want = TWO.replace('A line before them.\n\n', '').replace('meets', 'reaches').replace('A line after them.\n', 'A line after them.\n\nA line typed at the end.\n');
    expect(first.chapters[0]!.markdown).toBe(want);
    expect(again.edits.filter((e) => e.status === 'applied')).toEqual([]);
    expect(again.chapters[0]!.markdown).toBe(want);
  });
});

describe('a book that changed since the export', () => {
  const SECOND = '# Lakes\n\nStill water first.\n\nStill water second.\n';
  const THIRD = '# Seas\n\nSalt water first.\n\nSalt water second.\n';

  it('still takes the edits, and says so', async () => {
    // A paragraph written into the first chapter after the export: every
    // name after it moved.
    const now = [MD.replace('- First item', 'A paragraph written since.\n\n- First item'), SECOND, THIRD];
    const r = await roundTrip([MD, SECOND, THIRD], 'book', {
      now,
      edit: inDoc((x) => x.replace('Box text stands here.', 'Box text sits here.').replace('Salt water second.', 'Salt water, again.')),
    });
    expect(r.notes).toEqual([{ code: 'map-rebuilt' }, { code: 'book-changed', chapters: ['ch1'], unplaced: 1, foreign: 0 }]);
    expect(r.edits.every((e) => e.status === 'applied')).toBe(true);
    expect([...new Set(r.edits.map((e) => e.chapter))]).toEqual(['ch1', 'ch3']);
    expect(r.chapters[0]!.markdown).toBe(now[0]!.replace('stands', 'sits'));
    expect(r.chapters[1]!.markdown).toBe(SECOND);
    expect(r.chapters[2]!.markdown).toBe(THIRD.replace('Salt water second.', 'Salt water, again.'));
  });

  it('deletes a paragraph of a chapter that did not change', async () => {
    const now = [MD.replace('- First item', 'A paragraph written since.\n\n- First item'), SECOND, THIRD];
    const r = await roundTrip([MD, SECOND, THIRD], 'plain', {
      now,
      edit: inDoc((x) => {
        const at = x.indexOf('Still water second.');
        const start = x.lastIndexOf('<w:bookmarkStart', x.lastIndexOf('<w:p ', at));
        return x.slice(0, start) + x.slice(x.indexOf('</w:p>', at) + 6);
      }),
    });
    expect(r.chapters[1]!.markdown).toBe('# Lakes\n\nStill water first.\n');
    expect(r.chapters[0]!.markdown).toBe(now[0]);
  });

  it('still deletes a paragraph when only a setting changed', async () => {
    const r = await roundTrip([MD, SECOND], 'plain', {
      nowConfig: { ...(CONFIG as object), bodyText: { fontSize: pt(11) } } as never,
      edit: inDoc((x) => {
        const at = x.indexOf('Still water second.');
        const start = x.lastIndexOf('<w:bookmarkStart', x.lastIndexOf('<w:p ', at));
        return x.slice(0, start) + x.slice(x.indexOf('</w:p>', at) + 6);
      }),
    });
    expect(r.notes).toEqual([{ code: 'map-rebuilt' }, { code: 'book-changed', chapters: [], unplaced: 0, foreign: 0 }]);
    expect(r.edits.map((e) => e.status)).toEqual(['applied']);
    expect(r.chapters[1]!.markdown).toBe('# Lakes\n\nStill water first.\n');
  });

  it('reads a change made in the book as an edit that undoes it', async () => {
    const now = [MD.replace('Last paragraph of the chapter.', 'Last paragraph of this chapter.')];
    const r = await roundTrip([MD], 'plain', { now });
    expect(r.notes?.[1]).toMatchObject({ code: 'book-changed', chapters: ['ch1'] });
    expect(r.edits.map((e) => [e.before, e.after])).toEqual([['this', 'the']]);
  });

  it('leaves out a chapter the book no longer has', async () => {
    const r = await roundTrip([MD, SECOND, THIRD], 'plain', {
      now: [MD, THIRD],
      nowIds: ['ch1', 'ch3'],
      edit: inDoc((x) => x.replace('Salt water second.', 'Salt water, again.').replace('Still water first.', 'Still water, edited.')),
    });
    expect(r.notes?.map((n) => n.code)).toEqual(['map-rebuilt', 'chapters-missing', 'book-changed']);
    expect(r.notes?.[1]).toEqual({ code: 'chapters-missing', count: 1 });
    // The edit made in the chapter that is gone goes nowhere.
    expect(r.edits.every((e) => e.chapter === 'ch3' && e.status === 'applied')).toBe(true);
    expect(r.chapters.map((c) => c.markdown)).toEqual([MD, THIRD.replace('Salt water second.', 'Salt water, again.')]);
  });

  it('finds the one chapter a file without properties was exported from', async () => {
    const e = await exportDocx([SECOND], { config: CONFIG, design: 'plain' });
    // The Sandbox exports the chapter on screen: here the second of three.
    const bytes = editPart(savedByGoogleDocs(e.bytes, { oldProps: true }), 'word/document.xml', (x) => x.replace('Still water second.', 'Still water, edited.'));
    const target = { chapters: [MD, SECOND, THIRD].map((markdown, i) => ({ id: `c${i}`, markdown })), config: CONFIG, resources: [TABLE] };
    const rebuilt = (await rebuildExportMap(bytes, target))!;
    const r = applyDocxEdits(bytes, target, { rebuilt });
    expect(r.edits.length).toBeGreaterThan(0);
    expect(r.edits.every((x) => x.chapter === 'c1' && x.status === 'applied')).toBe(true);
    expect(r.chapters[1]!.markdown).toBe(SECOND.replace('Still water second.', 'Still water, edited.'));
  });
});
