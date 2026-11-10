// What editors do to an export nobody edited, and the edits that used to
// leave debris in the Markdown (#1458): renamed and dropped bookmarks, a
// sentence deleted with its markup, a quote typed into an attribute, a
// paragraph moved, a note deleted, a link saved with a closing slash.

import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Resource } from '../../types/resources/resources.js';
import { exportDocx, type Exported } from '../semantic/fixtures/harness.js';
import { applyDocxEdits, exportMapLost, isExportedDocx } from './index.js';

type Parts = Record<string, (xml: string) => string>;

function edited(e: Exported, parts: Parts): Uint8Array {
  const files = { ...unzipSync(e.bytes) };
  for (const [path, edit] of Object.entries(parts)) files[path] = strToU8(edit(strFromU8(files[path]!)));
  return zipSync(files);
}

const back = (bytes: Uint8Array, md: string) => applyDocxEdits(bytes, { chapters: [{ id: 'ch1', markdown: md }] });

/** The fragment's text typed again as one plain run. */
function retype(e: Exported, was: string, now: string): (xml: string) => string {
  const id = e.frag(was).id;
  return (xml) => {
    const start = xml.indexOf(`w:name="_ptx_${id}"/>`);
    const from = start + `w:name="_ptx_${id}"/>`.length;
    const wid = /w:id="(\d+)"/.exec(xml.slice(xml.lastIndexOf('<w:bookmarkStart', start), start))![1]!;
    const to = xml.indexOf(`<w:bookmarkEnd w:id="${wid}"/>`, from);
    return `${xml.slice(0, from)}<w:r><w:t xml:space="preserve">${now}</w:t></w:r>${xml.slice(to)}`;
  };
}

const NOTES = 'Texto[^a] fin.\n\n[^a]: Nota primera.\n\nOtro[^b] más.\n\n[^b]: Nota segunda.\n';

describe('a file an editor saved again', () => {
  it('reads the bookmarks LibreOffice renames in footnotes', async () => {
    const e = await exportDocx(NOTES);
    const bytes = edited(e, { 'word/footnotes.xml': (x) => x.replace(/w:name="(_ptx_[0-9a-z]+)"/g, 'w:name="$1_Copy_1"') });
    const r = back(bytes, NOTES);
    expect(r.edits).toEqual([]);
    expect(r.chapters[0]!.markdown).toBe(NOTES);
  });

  it('keeps the fragment its own name stands for when a copy carries a renamed one', async () => {
    const md = 'Uno solo.\n\nDos solo.\n';
    const e = await exportDocx(md);
    const id = e.frag('Uno solo.').id;
    // A paragraph copied in the editor: the copy gets `_Copy_1`.
    const bytes = edited(e, {
      'word/document.xml': (x) => {
        const at = x.indexOf('<w:sectPr');
        return `${x.slice(0, at)}<w:p><w:bookmarkStart w:id="9001" w:name="_ptx_${id}_Copy_1"/><w:r><w:t>Uno solo.</w:t></w:r><w:bookmarkEnd w:id="9001"/></w:p>${x.slice(at)}`;
      },
    });
    expect(back(bytes, md).chapters[0]!.markdown).toBe(md);
  });

  it('does not delete text whose bookmarks an editor dropped', async () => {
    const e = await exportDocx(NOTES);
    const drop = (x: string): string => x.replace(/<w:bookmark(?:Start|End)[^>]*\/>/g, '');
    for (const parts of [{ 'word/footnotes.xml': drop }, { 'word/document.xml': (x: string) => drop(x).replace('Otro', 'Otro') }] as Parts[]) {
      const r = back(edited(e, parts), NOTES);
      expect(r.edits.filter((x) => x.status === 'applied')).toEqual([]);
      expect(r.chapters[0]!.markdown).toBe(NOTES);
    }
  });

  it('names an export whose map is gone', async () => {
    const e = await exportDocx(NOTES);
    const files = { ...unzipSync(e.bytes) };
    for (const path of Object.keys(files)) if (path.startsWith('customXml/')) delete files[path];
    const noMap = zipSync(files);
    expect(isExportedDocx(noMap)).toBe(false);
    expect(exportMapLost(noMap)).toBe(true);
    // Without the property that names the export, the map still serves.
    const noProps = { ...unzipSync(e.bytes) };
    delete noProps['docProps/custom.xml'];
    expect(isExportedDocx(zipSync(noProps))).toBe(true);
    expect(exportMapLost(e.bytes)).toBe(false);
  });

  it('reads a link to a site root saved with its closing slash as the same link', async () => {
    const md = 'Mira [Google Fonts](https://fonts.google.com) aquí.\n';
    const e = await exportDocx(md);
    const bytes = edited(e, { 'word/_rels/document.xml.rels': (x) => x.replace('Target="https://fonts.google.com"', 'Target="https://fonts.google.com/"') });
    expect(back(bytes, md).edits).toEqual([]);
  });
});

describe('edits that left debris', () => {
  it('deletes a sentence with its bold phrase and its index mark', async () => {
    const md = 'Uno acaba. Recibe **contenido** y :index{term="configuración"}calcula reales. Después sigue.\n';
    const e = await exportDocx(md);
    const was = e.map.fragments.find((f) => f.role === 'body')!.text;
    const r = back(edited(e, { 'word/document.xml': retype(e, was, 'Uno acaba. Después sigue.') }), md);
    expect(r.chapters[0]!.markdown).toBe('Uno acaba. Después sigue.\n');
  });

  it('takes the backslash of an escaped character with it', async () => {
    const md = 'Turning points. It cost less than \\$40, most of it. The end.\n';
    const e = await exportDocx(md);
    const was = e.map.fragments.find((f) => f.role === 'body')!.text;
    expect(was).toContain('$40');
    const r = back(edited(e, { 'word/document.xml': retype(e, was, 'Turning points. The end.') }), md);
    expect(r.chapters[0]!.markdown).toBe('Turning points. The end.\n');
  });

  it('keeps an attribute whole when a quote is typed into its text', async () => {
    const md = ':::callout{title="Ideas clave"}\nTexto.\n:::\n';
    const e = await exportDocx(md);
    const r = back(edited(e, { 'word/document.xml': retype(e, 'Ideas clave', 'Ideas "clave"') }), md);
    expect(r.chapters[0]!.markdown).toBe(':::callout{title="Ideas “clave”"}\nTexto.\n:::\n');
  });

  it('removes a deleted note with its label', async () => {
    const e = await exportDocx(NOTES);
    const bytes = edited(e, {
      'word/document.xml': (x) => x.replace(/<w:r>(?:(?!<\/w:r>).)*<w:footnoteReference w:id="1"\/><\/w:r>/, ''),
      'word/footnotes.xml': (x) => x.replace(/<w:footnote w:id="1">.*?<\/w:footnote>/, ''),
    });
    expect(back(bytes, NOTES).chapters[0]!.markdown).toBe('Texto fin.\n\nOtro[^b] más.\n\n[^b]: Nota segunda.\n');
  });

  it('brings in a note typed in the editor: its reference and its text', async () => {
    const e = await exportDocx(NOTES);
    const bytes = edited(e, {
      'word/document.xml': (x) => x.replace(/(>Otro<\/w:t><\/w:r>)/, '$1<w:r><w:footnoteReference w:id="9"/></w:r>'),
      'word/footnotes.xml': (x) => x.replace('</w:footnotes>', '<w:footnote w:id="9"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> Jerga de *ciegos*.</w:t></w:r></w:p></w:footnote></w:footnotes>'),
    });
    const r = back(bytes, NOTES);
    expect(r.edits.every((x) => x.status === 'applied')).toBe(true);
    expect(r.chapters[0]!.markdown).toBe(`${NOTES.replace('Otro[^b]', 'Otro[^wf9][^b]')}\n[^wf9]: Jerga de \\*ciegos\\*.\n`);
  });

  describe('in a table of the book', () => {
    const TABLE = { id: 't1', typeId: 'table', kind: 'table', caption: 'Lo que da cada uno', table: { model: { rows: [[{ content: 'Útil' }, { content: 'Fruto' }], [{ content: 'Motor' }, { content: 'Parejo' }]] } }, createdAt: 0, updatedAt: 0 } as Resource;
    const MD = 'La tabla es :ref{id="t1"}, citada una vez.\n\nFin del texto.\n';
    const tableBack = (bytes: Uint8Array) => applyDocxEdits(bytes, { chapters: [{ id: 'ch1', markdown: MD }], resources: [TABLE] });

    it('takes words typed between the number of a caption and its text into the caption', async () => {
      const e = await exportDocx(MD, { resources: [TABLE] });
      const bytes = edited(e, {
        'word/document.xml': (x) => {
          // Word leaves what is typed there outside both bookmarks.
          const start = x.lastIndexOf('<w:bookmarkStart', x.indexOf('Lo que da cada uno'));
          expect(x.slice(start - 30, start)).toMatch(/<w:bookmarkEnd w:id="\d+"\/>$/);
          return `${x.slice(0, start)}<w:r><w:t xml:space="preserve">Aquí: </w:t></w:r>${x.slice(start)}`;
        },
      });
      const r = tableBack(bytes);
      expect(r.edits.map((x) => [x.field, x.status])).toEqual([['caption', 'applied']]);
      expect(r.resources!.find((x) => x.id === 't1')!.caption).toBe('Aquí: Lo que da cada uno');
    });

    it('leaves words typed after a generated label that ends its paragraph with the label', async () => {
      const e = await exportDocx(MD, { resources: [TABLE] });
      const bytes = edited(e, {
        'word/document.xml': (x) => {
          // The caption's own bookmark taken away: nothing of the book follows the label.
          const at = x.indexOf('Lo que da cada uno');
          const start = x.lastIndexOf('<w:bookmarkStart', at);
          const wid = /w:id="(\d+)"/.exec(x.slice(start, at))![1]!;
          const end = x.indexOf(`<w:bookmarkEnd w:id="${wid}"/>`, at);
          return `${x.slice(0, start)}<w:r><w:t xml:space="preserve">Otro pie</w:t></w:r>${x.slice(end + `<w:bookmarkEnd w:id="${wid}"/>`.length)}`;
        },
      });
      const r = tableBack(bytes);
      expect(r.edits.some((x) => x.status === 'rejected' && x.reason === 'generated')).toBe(true);
      expect(r.edits.some((x) => x.status === 'applied' && x.chapter !== undefined)).toBe(false);
    });

    it('reports a row added in Word and writes none of it into the chapter', async () => {
      const e = await exportDocx(MD, { resources: [TABLE] });
      const bytes = edited(e, {
        'word/document.xml': (x) => {
          const at = x.indexOf('>Parejo<');
          const end = x.indexOf('</w:tr>', at) + 7;
          const row = x.slice(x.lastIndexOf('<w:tr>', at), end);
          const added = row.replace(/<w:bookmark(?:Start|End) [^>]*\/>/g, '').replace('>Motor<', '>Telar<').replace('>Parejo<', '>Liso<');
          expect(added).toContain('>Telar<');
          return x.slice(0, end) + added + x.slice(end);
        },
      });
      const r = tableBack(bytes);
      expect(r.edits.map((x) => [x.resourceId, x.status, x.reason, x.after])).toEqual([['t1', 'rejected', 'table-row', 'Telar'], ['t1', 'rejected', 'table-row', 'Liso']]);
      expect(r.chapters[0]!.markdown).toBe(MD);
      expect(r.resources).toBeUndefined();
    });

    it('still takes a paragraph typed under a table as a paragraph of the chapter', async () => {
      const e = await exportDocx(MD, { resources: [TABLE] });
      const bytes = edited(e, {
        'word/document.xml': (x) => {
          const end = x.indexOf('</w:tbl>', x.indexOf('>Parejo<')) + 8;
          return `${x.slice(0, end)}<w:p><w:r><w:t>Escrito bajo la tabla.</w:t></w:r></w:p>${x.slice(end)}`;
        },
      });
      const r = tableBack(bytes);
      expect(r.edits.map((x) => [x.chapter, x.kind, x.status])).toEqual([['ch1', 'paragraph', 'applied']]);
      expect(r.chapters[0]!.markdown).toContain('Escrito bajo la tabla.');
    });
  });

  it('joins bold made longer in Word with the bold beside it', async () => {
    const md = 'Una (**negra**), seguida de más.\n';
    const bold = (text: string) => `<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
    const plain = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
    /** The run that holds `text` written again as `runs`. */
    const rewrite = (x: string, text: string, runs: string): string => {
      const at = x.indexOf(`${text}</w:t></w:r>`);
      expect(at).toBeGreaterThan(0);
      return x.slice(0, x.lastIndexOf('<w:r>', at)) + runs + x.slice(at + `${text}</w:t></w:r>`.length);
    };
    const e = await exportDocx(md);
    const after = back(edited(e, { 'word/document.xml': (x) => rewrite(x, '), seguida de más.', bold('),') + plain(' seguida de más.')) }), md);
    expect(after.edits.map((x) => [x.kind, x.status])).toEqual([['format', 'applied']]);
    expect(after.chapters[0]!.markdown).toBe('Una (**negra),** seguida de más.\n');
    const before = back(edited(e, { 'word/document.xml': (x) => rewrite(x, 'Una (', plain('Una ') + bold('(')) }), md);
    expect(before.chapters[0]!.markdown).toBe('Una **(negra**), seguida de más.\n');
    const both = back(edited(e, { 'word/document.xml': (x) => rewrite(rewrite(x, '), seguida de más.', bold('),') + plain(' seguida de más.')), 'Una (', plain('Una ') + bold('(')) }), md);
    expect(both.chapters[0]!.markdown).toBe('Una **(negra),** seguida de más.\n');
    // Bold a word apart from the bold one: a passage of its own.
    const apart = back(edited(e, { 'word/document.xml': (x) => rewrite(x, '), seguida de más.', plain('), ') + bold('seguida') + plain(' de más.')) }), md);
    expect(apart.chapters[0]!.markdown).toBe('Una (**negra**), **seguida** de más.\n');
  });

  it('reports a paragraph moved in Word and leaves the source in its order', async () => {
    const md = '1. uno\n2. dos\n3. tres\n';
    const e = await exportDocx(md);
    const bytes = edited(e, {
      'word/document.xml': (x) => {
        const paras = x.match(/<w:p>(?:(?!<\/w:p>).)*<\/w:p>/g)!;
        const two = paras.find((p) => p.includes('>dos<'))!;
        const three = paras.find((p) => p.includes('>tres<'))!;
        return x.replace(two, '\u0000').replace(three, two).replace('\u0000', three);
      },
    });
    const r = back(bytes, md);
    expect(r.chapters[0]!.markdown).toBe(md);
    expect(r.edits.map((x) => [x.status, x.reason])).toEqual([['rejected', 'moved']]);
  });
});
