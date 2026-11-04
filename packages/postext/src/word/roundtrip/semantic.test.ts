import { describe, expect, it } from 'vitest';
import type { Resource } from '../../types/resources/resources.js';
import { applyDocxEdits, DocxReadError, isExportedDocx } from './index.js';
import { buildFixture, editDocx, lineBlock, plainOf, replaceOnce, type FragSpec } from './fixture.test-helper.js';

const MD =
  '# Título\n\n' +
  'Hola **mundo** cruel, mira [la web](https://a.b) y el :index[término]{key="t"} aquí.\n\n' +
  'La ecuación $x^2$ y la :ref{fig1} cierran.\n\n' +
  'Último párrafo corto.\n';

const CAPTION = 'Un *gato* negro';

function fixture() {
  const frags: FragSpec[] = [
    lineBlock(MD, '# Título', 'h1', 0, 2),
    lineBlock(MD, 'Hola', 'p1'),
    lineBlock(MD, 'La ecuación', 'p2'),
    lineBlock(MD, 'Último', 'p3'),
    { plain: { ...plainOf('Figura 1. '), map: Array(10).fill(-1) }, block: 'g1', part: 0, target: { kind: 'generated' }, range: [0, 0] },
    { plain: plainOf(CAPTION), block: 'c1', part: 0, target: { kind: 'resource', resourceId: 'fig1', field: 'caption' }, range: [0, CAPTION.length] },
  ];
  return buildFixture({ variant: 'semantic', chapters: [{ id: 'ch1', markdown: MD }], frags, resources: { fig1: { id: 'fig1', caption: CAPTION } } });
}

const RESOURCES: Resource[] = [{ id: 'fig1', typeId: 'figure', kind: 'bitmap', caption: CAPTION, createdAt: 0, updatedAt: 0 }];
const current = (markdown = MD) => ({ chapters: [{ id: 'ch1', markdown }], resources: RESOURCES });

function run(edit: (xml: string) => string, md = MD, extra: Record<string, string> = {}) {
  const fx = fixture();
  return applyDocxEdits(editDocx(fx.bytes, edit, extra), current(md));
}

const t = (s: string): string => `<w:t xml:space="preserve">${s}</w:t>`;

describe('round trip, semantic body', () => {
  it('detects exported files and leaves an unedited one byte-identical', () => {
    const fx = fixture();
    expect(isExportedDocx(fx.bytes)).toBe(true);
    expect(isExportedDocx(new Uint8Array([1, 2, 3]))).toBe(false);
    const r = applyDocxEdits(fx.bytes, current());
    expect(r.variant).toBe('semantic');
    expect(r.exportId).toBe('exp-1');
    expect(r.edits).toEqual([]);
    expect(r.changed).toBe(false);
    expect(r.chapters[0]!.markdown).toBe(MD);
    expect(r.resources).toBeUndefined();
  });

  it('throws DocxReadError for a broken file', () => {
    expect(() => applyDocxEdits(new Uint8Array([1, 2, 3]), current())).toThrow(DocxReadError);
  });

  it('replaces a word', () => {
    const r = run((x) => replaceOnce(x, t(' cruel, mira '), t(' amable, mira ')));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('cruel', 'amable'));
    expect(r.edits.every((e) => e.status === 'applied' && e.kind === 'text')).toBe(true);
    expect(r.changed).toBe(true);
  });

  it('fixes a typo inside an emphasised word', () => {
    const r = run((x) => replaceOnce(x, '<w:t xml:space="preserve">mundo</w:t>', t('mando')));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('**mundo**', '**mando**'));
    const r2 = run((x) => replaceOnce(x, '<w:t xml:space="preserve">mundo</w:t>', t('mundos')));
    expect(r2.chapters[0]!.markdown).toBe(MD.replace('**mundo**', '**mundos**'));
  });

  it('edits next to a link and inside it, keeping the link markup', () => {
    const r = run((x) => replaceOnce(x, t(' y el término aquí.'), t('! y el término aquí.')));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('(https://a.b) y', '(https://a.b)! y'));
    const r2 = run((x) => replaceOnce(x, t('la web'), t('la página web')));
    expect(r2.chapters[0]!.markdown).toBe(MD.replace('[la web]', '[la página web]'));
  });

  it('edits next to an index mark, keeping the mark', () => {
    const r = run((x) => replaceOnce(x, t(' y el término aquí.'), t(' y el términos allí.')));
    expect(r.chapters[0]!.markdown).toBe(MD.replace(':index[término]{key="t"} aquí', ':index[términos]{key="t"} allí'));
  });

  it('replaces a changed equation whole and rejects a retyped reference', () => {
    const r = run((x) => replaceOnce(x, '<m:t>2</m:t>', '<m:t>3</m:t>'));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('$x^2$', '$x^{3}$'));
    const r2 = run((x) => replaceOnce(x, t(' y la 1 cierran.'), t(' y la 2 cierran.')));
    // The engine prints the number: retyping it would lose the reference.
    expect(r2.chapters[0]!.markdown).toBe(MD);
    expect(r2.edits).toMatchObject([{ status: 'rejected', reason: 'generated' }]);
  });

  it('adds and removes bold', () => {
    const r = run((x) => replaceOnce(x, `<w:r>${t(' cruel, mira ')}</w:r>`, `<w:r>${t(' ')}</w:r><w:r><w:rPr><w:b/></w:rPr>${t('cruel')}</w:r><w:r>${t(', mira ')}</w:r>`));
    expect(r.chapters[0]!.markdown).toBe(MD.replace(' cruel,', ' **cruel**,'));
    expect(r.edits).toMatchObject([{ kind: 'format', status: 'applied', before: 'cruel', after: '**cruel**' }]);
    const r2 = run((x) => replaceOnce(x, `<w:rPr><w:b/></w:rPr>${t('mundo')}`, t('mundo')));
    expect(r2.chapters[0]!.markdown).toBe(MD.replace('**mundo**', 'mundo'));
  });

  it('splits, merges and deletes paragraphs', () => {
    const split = run((x) => replaceOnce(x, t('Último párrafo corto.'), `${t('Último párrafo ')}</w:r></w:p><w:p><w:r>${t('corto.')}`));
    expect(split.chapters[0]!.markdown).toBe(MD.replace('Último párrafo corto.', 'Último párrafo\n\ncorto.'));
    expect(split.edits).toMatchObject([{ kind: 'paragraph', status: 'applied' }]);
    const merged = run((x) => x.replace(/(cierran\.<\/w:t><\/w:r><w:bookmarkEnd w:id="\d+"\/>)<\/w:p><w:p>/, '$1'));
    expect(merged.chapters[0]!.markdown).toBe(MD.replace('cierran.\n\nÚltimo', 'cierran.Último'));
    const deleted = run((x) => x.replace(/<w:p><w:bookmarkStart w:id="\d+" w:name="_ptx_2"\/>.*?<\/w:p>/, ''));
    expect(deleted.chapters[0]!.markdown).toBe(MD.replace('La ecuación $x^2$ y la :ref{fig1} cierran.\n\n', ''));
  });

  it('accepts tracked insertions and deletions', () => {
    const r = run((x) => replaceOnce(x, `<w:r>${t(' cruel, mira ')}</w:r>`,
      `<w:r>${t(' ')}</w:r><w:del w:id="91" w:author="Ana"><w:r><w:delText>cruel</w:delText></w:r></w:del><w:ins w:id="92" w:author="Ana"><w:r>${t('amable')}</w:r></w:ins><w:r>${t(', mira ')}</w:r>`));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('cruel', 'amable'));
    expect(r.edits.map((e) => e.kind)).toEqual(['tracked']);
  });

  it('lists comments with their source range', () => {
    const comments = '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="5" w:author="Ana"><w:p><w:r><w:t>¿Seguro?</w:t></w:r></w:p></w:comment></w:comments>';
    const r = run((x) => replaceOnce(x, `<w:r><w:rPr><w:b/></w:rPr>${t('mundo')}</w:r>`, `<w:commentRangeStart w:id="5"/><w:r><w:rPr><w:b/></w:rPr>${t('mundo')}</w:r><w:commentRangeEnd w:id="5"/>`), MD, { 'word/comments.xml': comments });
    const at = MD.indexOf('mundo');
    expect(r.comments).toEqual([{ chapter: 'ch1', start: at, end: at + 5, author: 'Ana', text: '¿Seguro?' }]);
    expect(r.changed).toBe(false);
  });

  it('writes caption edits back to the resource and rejects edits to generated text', () => {
    const r = run((x) => replaceOnce(replaceOnce(x, t(' negro'), t(' blanco')), t('Figura 1. '), t('Figura 2. ')));
    expect(r.resources?.[0]?.caption).toBe('Un *gato* blanco');
    expect(RESOURCES[0]!.caption).toBe(CAPTION);
    expect(r.chapters[0]!.markdown).toBe(MD);
    expect(r.edits).toEqual([
      { resourceId: 'fig1', field: 'caption', start: 10, end: 15, before: 'negro', after: 'blanco', kind: 'text', status: 'applied' },
      { start: -1, end: -1, before: 'Figura 1. ', after: 'Figura 2. ', kind: 'text', status: 'rejected', reason: 'generated' },
    ]);
  });

  it('merges with a source changed since the export and reports conflicts', () => {
    const ours = 'Prefacio.\n\n' + MD.replace('cruel', 'feroz');
    const r = run((x) => replaceOnce(replaceOnce(x, t(' cruel, mira '), t(' amable, mira ')), t('Último párrafo corto.'), t('Último párrafo largo.')), ours);
    expect(r.chapters[0]!.markdown).toBe(ours.replace('corto', 'largo'));
    expect(r.edits.map((e) => [e.status, e.before, e.after])).toEqual([
      ['conflict', 'cruel', 'amable'],
      ['applied', 'corto', 'largo'],
    ].map(([s, b, a]) => [s, b, a]));
  });
});
