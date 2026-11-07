// Resources only a `:ref` cites (#1444): written once as a figure after the
// block holding the first reference, and read back as no edit at all.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { Resource } from '../../types.js';
import { applyDocxEdits } from '../roundtrip/index.js';
import { exportDocx, exportProblems } from './fixtures/harness.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const at = { createdAt: 0, updatedAt: 0 };
const figure: Resource = { id: 'fig1', typeId: 'figure', kind: 'bitmap', caption: 'A *red* dot', note: 'Source: me', altText: 'Dot', ...at, bitmap: { fileId: 'f1', format: 'png', width: 100, height: 50 } };
const second: Resource = { id: 'fig2', typeId: 'figure', kind: 'bitmap', caption: 'Another dot', ...at, bitmap: { fileId: 'f1', format: 'png', width: 100, height: 50 } };
const table: Resource = {
  id: 't1',
  typeId: 'table',
  kind: 'table',
  caption: 'Numbers',
  ...at,
  table: { model: { rows: [[{ content: 'a' }, { content: 'b' }], [{ content: '1' }, { content: '2' }]], headerRows: 1 } } as never,
};
const here: Resource = { id: 'h1', typeId: 'figure', kind: 'bitmap', caption: 'Placed by hand', ...at, placement: { position: 'here' }, bitmap: { fileId: 'f1', format: 'png', width: 10, height: 10 } };
const poster: Resource = {
  id: 'v1',
  typeId: 'video',
  kind: 'video',
  caption: 'A film',
  ...at,
  video: { source: 'youtube', url: 'https://youtu.be/abc', poster: { fileId: 'f1', format: 'png', width: 160, height: 90 } },
};
const bare: Resource = { id: 'v2', typeId: 'video', kind: 'video', caption: 'Another film', ...at, video: { source: 'youtube', url: 'https://youtu.be/xyz' } };
const resources = [figure, second, table, here, poster, bare];
const bytes = (id: string): Uint8Array | undefined => (id === 'f1' ? PNG : undefined);

function editDoc(b: Uint8Array, f: (xml: string) => string): Uint8Array {
  const files = unzipSync(b);
  files['word/document.xml'] = strToU8(f(strFromU8(files['word/document.xml']!)));
  return zipSync(files);
}

describe('semantic docx: resources a :ref floats', () => {
  it('writes each one once, after the block holding its first reference', async () => {
    const md = 'Intro.\n\nSee :ref{id="fig1"} and :ref{id="t1"}.\n\n- an item citing :ref{id="fig2"}\n- and :ref{id="fig1"} again\n\nAfter the list.\n';
    const e = await exportDocx(md, { resources, resourceBytes: bytes });
    expect(exportProblems(e, [md])).toEqual([]);
    const doc = e.doc;
    expect(doc.split('ptx:figure:fig1').length).toBe(2);
    expect(doc.split('ptx:figure:fig2').length).toBe(2);
    const order = ['See ', 'ptx:figure:fig1', 'ptx:figure:t1', 'an item citing', ' again', 'ptx:figure:fig2', 'After the list.'].map((s) => doc.indexOf(s));
    expect(order.every((x) => x >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(e.frag('A red dot').target).toEqual({ kind: 'resource', resourceId: 'fig1', field: 'caption' });
    expect(e.frag('b').target).toEqual({ kind: 'resource', resourceId: 't1', field: 'cell', row: 0, col: 1 });
    expect(Object.keys(e.files).filter((p) => p.startsWith('word/media/'))).toHaveLength(1);
    expect(e.warnings.filter((w) => w.code === 'resourceMissing')).toEqual([]);
  });

  it('leaves out resources a block shows, placed here, or cited in a later chapter again', async () => {
    const md = ['See :ref{id="fig1"}, :ref{id="h1"} and :ref{id="fig2"}.\n\n::resource{id="fig2"}\n', 'Again :ref{id="fig1"}.\n'];
    const e = await exportDocx(md, { resources, resourceBytes: bytes });
    expect(e.doc.split('ptx:figure:fig1').length).toBe(2);
    expect(e.doc.split('ptx:figure:fig2').length).toBe(2);
    expect(e.doc).not.toContain('ptx:figure:h1');
    expect(e.doc.indexOf('ptx:figure:fig1')).toBeLessThan(e.doc.indexOf('Again'));
  });

  it('floats out of a box after the whole box', async () => {
    const md = ':::callout\nInside :ref{id="fig1"}.\n\nMore inside.\n:::\n\nOutside.\n';
    const e = await exportDocx(md, { resources, resourceBytes: bytes });
    expect(exportProblems(e, [md])).toEqual([]);
    const doc = e.doc;
    expect(doc.indexOf('More inside.')).toBeLessThan(doc.indexOf('ptx:figure:fig1'));
    expect(doc.indexOf('ptx:figure:fig1')).toBeLessThan(doc.indexOf('Outside.'));
  });

  it('prints a video as its poster, or as a link line without one, never as source', async () => {
    const md = 'Watch :ref{id="v1"} and :ref{id="v2"}.\n';
    const e = await exportDocx(md, { resources, resourceBytes: bytes });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toContain('ptx:figure:v1');
    expect(e.doc).toMatch(/ptx:figure:v1.*<w:drawing>/);
    expect(e.frag('▶ https://youtu.be/xyz').target).toEqual({ kind: 'generated' });
    expect(e.part('word/_rels/document.xml.rels')).toContain('Target="https://youtu.be/xyz"');
    expect(e.doc).not.toContain('ptx:raw');
  });

  it('reads an unchanged export back as the same Markdown, and a caption edit into the resource', async () => {
    const md = 'Before.\n\nSee :ref{id="fig1"} and :ref{id="t1"}.\n\nWatch :ref{id="v2"}.\n\nAfter.\n';
    const e = await exportDocx(md, { resources, resourceBytes: bytes });
    const current = { chapters: [{ id: 'ch1', markdown: md }], resources };
    const same = applyDocxEdits(e.bytes, current);
    expect(same.edits).toEqual([]);
    expect(same.changed).toBe(false);
    expect(same.chapters[0]!.markdown).toBe(md);
    expect(same.resources).toBeUndefined();

    const edited = applyDocxEdits(editDoc(e.bytes, (x) => x.replace('<w:t xml:space="preserve"> dot</w:t>', '<w:t xml:space="preserve"> square</w:t>')), current);
    expect(edited.chapters[0]!.markdown).toBe(md);
    expect(edited.resources?.find((r) => r.id === 'fig1')?.caption).toBe('A *red* square');
  });
});

describe('semantic docx: pictures a heading design draws', () => {
  const size = { width: { value: 40, unit: 'mm' }, height: { value: 20, unit: 'mm' } };
  const at0 = { anchor: { to: 'page', edge: 'top-left' }, size };
  const config = {
    headingStyles: [
      {
        id: 'dish',
        advancedDesign: {
          enabled: true,
          slot: {
            elements: [
              { kind: 'image', id: 'photo', resourceId: '{attr.art}', placement: at0 },
              { kind: 'image', id: 'over', resourceId: 'fig2', placement: at0 },
              { kind: 'image', id: 'orn', resourceId: 'h1', decorative: true, placement: { ...at0, offset: { x: { value: 5, unit: 'mm' } } } },
              { kind: 'text', id: 'title', content: '{titleText}', placement: { anchor: { to: 'container', edge: 'top-left' } } },
            ],
          },
        },
      },
    ],
  } as never;

  it('writes the picture after its heading, without overlays or ornaments, and reads back unchanged', async () => {
    const md = '# Soup {style="dish" art="fig1"}\n\nStir well.\n';
    const e = await exportDocx(md, { resources, resourceBytes: bytes, config });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toContain('ptx:design:fig1');
    expect(e.doc).not.toContain('ptx:design:fig2');
    expect(e.doc).not.toContain('ptx:design:h1');
    expect(e.doc.indexOf('Soup')).toBeLessThan(e.doc.indexOf('ptx:design:fig1'));
    expect(e.doc.indexOf('ptx:design:fig1')).toBeLessThan(e.doc.indexOf('Stir well.'));
    // 40 mm wide at most, not the column.
    const cx = Number(/ptx:design:fig1.*?<wp:extent cx="(\d+)"/.exec(e.doc)?.[1]);
    expect(cx).toBeGreaterThan(0);
    expect(cx).toBeLessThanOrEqual(Math.round((40 / 25.4) * 914400) + 1);
    const r = applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: md }], resources });
    expect(r.edits).toEqual([]);
    expect(r.chapters[0]!.markdown).toBe(md);
  });
});
