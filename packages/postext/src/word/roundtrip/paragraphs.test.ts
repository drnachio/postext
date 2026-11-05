import { describe, expect, it } from 'vitest';
import { applyDocxEdits } from './index.js';
import { buildFixture, editDocx, lineBlock, replaceOnce } from './fixture.test-helper.js';

const MD = 'Antes del texto.\n\n- uno dos\n- tres\n\nDespués 😀 fin.\n';

function run(edit: (xml: string) => string) {
  const fx = buildFixture({
    variant: 'semantic',
    chapters: [{ id: 'a', markdown: MD }],
    frags: [lineBlock(MD, 'Antes', 'p0'), lineBlock(MD, '- uno', 'l1', 0, 2), lineBlock(MD, '- tres', 'l2', 0, 2), lineBlock(MD, 'Después', 'p1')],
  });
  return applyDocxEdits(editDocx(fx.bytes, edit), { chapters: [{ id: 'a', markdown: MD }] });
}

const t = (s: string): string => `<w:t xml:space="preserve">${s}</w:t>`;

describe('round trip, paragraphs and lists', () => {
  it('reads a paragraph added between two exported ones', () => {
    const r = run((x) => replaceOnce(x, `${t('Antes del texto.')}</w:r><w:bookmarkEnd w:id="1"/></w:p>`, `${t('Antes del texto.')}</w:r><w:bookmarkEnd w:id="1"/></w:p><w:p><w:r>${t('Nuevo párrafo.')}</w:r></w:p><w:p/>`));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('Antes del texto.', 'Antes del texto.\n\nNuevo párrafo.'));
    expect(r.edits).toMatchObject([{ kind: 'paragraph', status: 'applied' }]);
  });

  it('keeps text typed just after a bookmark in its fragment', () => {
    const r = run((x) => replaceOnce(x, `${t('Antes del texto.')}</w:r><w:bookmarkEnd w:id="1"/>`, `${t('Antes del texto.')}</w:r><w:bookmarkEnd w:id="1"/><w:r>${t(' Más.')}</w:r>`));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('Antes del texto.', 'Antes del texto. Más.'));
  });

  it('splits a list item into a new item', () => {
    const r = run((x) => replaceOnce(x, t('uno dos'), `${t('uno')}</w:r></w:p><w:p><w:r>${t('dos')}`));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('- uno dos', '- uno\n- dos'));
  });

  it('deletes a paragraph removed with tracked changes', () => {
    const r = run((x) => replaceOnce(x, `<w:p><w:bookmarkStart w:id="1" w:name="_ptx_0"/><w:r>${t('Antes del texto.')}</w:r>`,
      `<w:p><w:pPr><w:rPr><w:del w:id="3" w:author="Ana"/></w:rPr></w:pPr><w:bookmarkStart w:id="1" w:name="_ptx_0"/><w:del w:id="4" w:author="Ana"><w:r><w:delText>Antes del texto.</w:delText></w:r></w:del>`));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('Antes del texto.\n\n', ''));
    expect(r.edits).toMatchObject([{ kind: 'tracked', status: 'applied' }]);
  });

  it('edits next to a character outside the BMP', () => {
    const r = run((x) => replaceOnce(x, t('Después 😀 fin.'), t('Después 😀 final.')));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('fin.', 'final.'));
  });

  it('applies nothing when every bookmark is gone', () => {
    const r = run((x) => x.replace(/<w:bookmark(Start|End)[^>]*\/>/g, ''));
    expect(r.chapters[0]!.markdown).toBe(MD);
    expect(r.changed).toBe(false);
    expect(r.edits).toMatchObject([{ status: 'rejected', reason: 'bookmarks-lost' }]);
  });
});
