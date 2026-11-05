import { describe, expect, it } from 'vitest';
import { applyDocxEdits } from './index.js';
import { buildFixture, editDocx, lineBlock, replaceOnce, type FragSpec } from './fixture.test-helper.js';

const MD = 'Antes del texto con ^sup^ y [enlace](https://a.b) aquí.\n\n- uno dos\n- tres\n\nDespués 😀 fin.\n';
const t = (s: string): string => `<w:t xml:space="preserve">${s}</w:t>`;

/** List items mapped without their `- ` (range from the item text). */
function frags(): FragSpec[] {
  const item = (line: string, block: string): FragSpec => {
    const b = lineBlock(MD, line, block, 0, 2);
    return { ...b, range: [b.range[0] + 2, b.range[1]] };
  };
  return [lineBlock(MD, 'Antes', 'p0'), item('- uno', 'l1'), item('- tres', 'l2'), lineBlock(MD, 'Después', 'p1')];
}

function run(variant: 'semantic' | 'formatted', edit: (xml: string) => string, chapters = [{ id: 'a', markdown: MD }], extra: Record<string, string> = {}, specs = frags()) {
  const fx = buildFixture({ variant, chapters: [{ id: 'a', markdown: MD }], frags: specs });
  return applyDocxEdits(editDocx(fx.bytes, edit, extra), { chapters });
}

/** A text box with one paragraph and no bookmark (a list marker, a folio). */
const DECORATION = `<w:p><w:r><w:drawing><wp:anchor><a:graphic><a:graphicData><wps:wsp><wps:txbx><w:txbxContent><w:p><w:r>${t('•')}</w:r></w:p></w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`;

describe('round trip, review fixes', () => {
  it('ignores text boxes without any bookmark (formatted markers and folios)', () => {
    const r = run('formatted', (x) => replaceOnce(x, '<w:sectPr>', `${DECORATION}<w:sectPr>`));
    expect(r.changed).toBe(false);
    expect(r.edits).toEqual([]);
  });

  it('still reads a paragraph added inside a bookmarked text box', () => {
    const r = run('formatted', (x) => replaceOnce(x, `${t('Después 😀 fin.')}</w:r><w:bookmarkEnd w:id="4"/></w:p>`, `${t('Después 😀 fin.')}</w:r><w:bookmarkEnd w:id="4"/></w:p><w:p><w:r>${t('Nuevo.')}</w:r></w:p>`));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('fin.', 'fin.\n\nNuevo.'));
  });

  it('deletes a list item whose range leaves out its marker, marker included', () => {
    const r = run('semantic', (x) => x.replace(/<w:p><w:bookmarkStart w:id="3"[^]*?<\/w:p>/, ''));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('- tres\n', ''));
  });

  it('splits such a list item into a new item', () => {
    const r = run('semantic', (x) => replaceOnce(x, t('uno dos'), `${t('uno')}</w:r></w:p><w:p><w:r>${t('dos')}`));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('- uno dos', '- uno\n- dos'));
  });

  it('never reports half a surrogate pair', () => {
    const r = run('semantic', (x) => replaceOnce(x, t('Después 😀 fin.'), t('Después 😃 fin.')));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('😀', '😃'));
    expect(r.edits).toMatchObject([{ before: '😀', after: '😃', status: 'applied' }]);
  });

  it('reads a superscript character style as superscript', () => {
    const r = run('semantic', (x) => replaceOnce(x, '<w:vertAlign w:val="superscript"/>', '<w:rStyle w:val="PostextSuperscript"/>'));
    expect(r.edits).toEqual([]);
  });

  it('reads a link written as a HYPERLINK field', () => {
    const r = run('semantic', (x) => x.replace(/<w:hyperlink [^>]*>(<w:r>)(.*?)<\/w:hyperlink>/,
      `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> HYPERLINK "https://a.b" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>$1$2<w:r><w:fldChar w:fldCharType="end"/></w:r>`));
    expect(r.edits).toEqual([]);
  });

  it('drops spaces alone typed or written just outside a bookmark', () => {
    const r = run('semantic', (x) => replaceOnce(replaceOnce(x, '<w:bookmarkStart w:id="1"', `<w:r>${t(' ')}</w:r><w:bookmarkStart w:id="1"`), '<w:bookmarkEnd w:id="1"/>', `<w:bookmarkEnd w:id="1"/><w:r>${t('  ')}</w:r>`));
    expect(r.changed).toBe(false);
    expect(r.edits).toEqual([]);
  });

  it('rejects an edit to a generated number inside a Markdown fragment', () => {
    const specs = frags();
    const p = specs[3]!.plain;
    specs[3] = { ...specs[3]!, plain: { ...p, text: `1 ${p.text}`, map: [-1, -1, ...p.map], flags: ['', '', ...p.flags], hrefs: [undefined, undefined, ...p.hrefs], atoms: [] } };
    const r = run('semantic', (x) => replaceOnce(x, t('1 Después 😀 fin.'), t('2 Después 😀 fin.')), undefined, {}, specs);
    expect(r.chapters[0]!.markdown).toBe(MD);
    expect(r.edits).toMatchObject([{ before: '1', after: '2', status: 'rejected', reason: 'generated' }]);
  });

  it('reads a page break typed inside a paragraph as no edit', () => {
    const r = run('semantic', (x) => replaceOnce(x, t('Después 😀 fin.'), `${t('Después 😀')}<w:br w:type="page"/>${t(' fin.')}`));
    expect(r.edits).toEqual([]);
  });

  it('moves a comment on unedited text with the changes made since the export', () => {
    const comments = '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="5" w:author="Ana"><w:p><w:r><w:t>Ojo</w:t></w:r></w:p></w:comment></w:comments>';
    const ours = `Prefacio.\n\n${MD}`;
    const r = run('semantic', (x) => replaceOnce(x, `<w:r>${t('Después 😀 fin.')}</w:r>`, `<w:commentRangeStart w:id="5"/><w:r>${t('Después 😀 fin.')}</w:r><w:commentRangeEnd w:id="5"/>`), [{ id: 'a', markdown: ours }], { 'word/comments.xml': comments });
    const at = ours.indexOf('Después');
    expect(r.comments).toEqual([{ chapter: 'a', start: at, end: at + 'Después 😀 fin.'.length, author: 'Ana', text: 'Ojo' }]);
  });
});

