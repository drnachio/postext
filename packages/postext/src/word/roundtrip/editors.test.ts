// What editors do to an export nobody edited, and the edits that used to
// leave debris in the Markdown (#1458): renamed and dropped bookmarks, a
// sentence deleted with its markup, a quote typed into an attribute, a
// paragraph moved, a note deleted, a link saved with a closing slash.

import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
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
