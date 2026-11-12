import { describe, expect, it } from 'vitest';
import { applyDocxEdits } from './index.js';
import { buildFixture, cut, documentXml, editDocx, lineBlock, replaceEach, withBreaks, type FragSpec } from './fixture.test-helper.js';

// A paragraph set in two columns: line breaks after "con " and after
// "texto que " (the column ends), a hyphen the engine added in "ejem-plo".
const MD = 'Primer párrafo con un ejemplo claro de texto que sigue en la otra columna sin parar.\n\nSegundo *bloque* breve.\n';

function fixture() {
  const p = lineBlock(MD, 'Primer', 'b0');
  const text = p.plain.text;
  const at = (s: string): number => text.indexOf(s);
  const broken = withBreaks(p.plain, [
    { after: at('con ') + 3 },
    { after: at('ejemplo') + 3, hyphen: true },
    { after: at('que ') + 3 },
  ]);
  const [left, right] = cut(broken, broken.text.indexOf('sigue'));
  const frags: FragSpec[] = [
    { ...p, plain: left!, part: 0 },
    { ...p, plain: right!, part: 1 },
    lineBlock(MD, 'Segundo', 'b1'),
  ];
  return buildFixture({ variant: 'formatted', chapters: [{ id: 'c', markdown: MD }], frags, pages: [[0], [1, 2]] });
}

const t = (s: string): string => `<w:t xml:space="preserve">${s}</w:t>`;

function run(edit: (xml: string) => string, md = MD) {
  return applyDocxEdits(editDocx(fixture().bytes, edit), { chapters: [{ id: 'c', markdown: md }] });
}

describe('round trip, formatted text boxes', () => {
  it('lays the fixture out as the writer does', () => {
    const xml = documentXml(fixture().bytes);
    expect(xml).toContain(`${t('Primer párrafo con ')}</w:r><w:r><w:br/></w:r><w:r>${t('un ejem-')}`);
    expect(xml.match(/<w:txbxContent>/g)).toHaveLength(6);
  });

  it('reads each text box once and leaves an unedited file byte-identical', () => {
    const r = applyDocxEdits(fixture().bytes, { chapters: [{ id: 'c', markdown: MD }] });
    expect(r).toMatchObject({ variant: 'facsimile', writer: 'formatted' });
    expect(r.edits).toEqual([]);
    expect(r.chapters[0]!.markdown).toBe(MD);
  });

  it('replaces a word on a line', () => {
    const r = run((x) => replaceEach(x, t('plo claro de texto que '), t('plo nítido de texto que ')));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('claro', 'nítido'));
    expect(r.edits).toMatchObject([{ before: 'claro', after: 'nítido', status: 'applied' }]);
  });

  it('inserts words at the start and at the end of a line', () => {
    const start = run((x) => replaceEach(x, t('un ejem-'), t('solo un ejem-')));
    expect(start.chapters[0]!.markdown).toBe(MD.replace('con un', 'con solo un'));
    const end = run((x) => replaceEach(x, t('Primer párrafo con '), t('Primer párrafo con todo ')));
    expect(end.chapters[0]!.markdown).toBe(MD.replace('con un', 'con todo un'));
  });

  it('deletes words across a line break and a hyphenated word', () => {
    const across = run((x) => replaceEach(replaceEach(x, t('Primer párrafo con '), t('Primer párrafo ')), t('un ejem-'), t('ejem-')));
    expect(across.chapters[0]!.markdown).toBe(MD.replace('con un ', ''));
    const hyphen = run((x) => replaceEach(replaceEach(x, t('un ejem-'), t('un ')), t('plo claro de texto que '), t('claro de texto que ')));
    expect(hyphen.chapters[0]!.markdown).toBe(MD.replace('ejemplo ', ''));
  });

  it('edits across the column break', () => {
    const r = run((x) => replaceEach(x, t('sigue en la otra columna sin parar.'), t('continúa en la otra columna sin parar.')));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('sigue', 'continúa'));
    const del = run((x) => replaceEach(replaceEach(x, t('plo claro de texto que '), t('plo claro de texto ')), t('sigue en la otra columna sin parar.'), t('en la otra columna sin parar.')));
    expect(del.chapters[0]!.markdown).toBe(MD.replace('que sigue ', ''));
  });

  it('keeps a paragraph mark between engine lines out of a word replaced beside it', () => {
    // The writer starts a paragraph between two lines where the alignment
    // changes: that mark stands for the line break, also when the word
    // after it (or before it) is retyped.
    const split = (x: string, before: string, after: string): string => replaceEach(x, `${t('Primer párrafo con ')}</w:r><w:r><w:br/></w:r><w:r>${t('un ejem-')}`, `${t(before)}</w:r></w:p><w:p><w:r>${t(after)}`);
    const next = run((x) => split(x, 'Primer párrafo con ', 'otro ejem-'));
    expect(next.chapters[0]!.markdown).toBe(MD.replace('con un', 'con otro'));
    expect(next.edits).toMatchObject([{ before: 'un', after: 'otro', status: 'applied' }]);
    const prev = run((x) => split(x, 'Primer párrafo sin ', 'un ejem-'));
    expect(prev.chapters[0]!.markdown).toBe(MD.replace('con un', 'sin un'));
  });

  it('accepts a tracked insertion inside a text box', () => {
    const r = run((x) => replaceEach(x, `<w:r>${t('plo claro de texto que ')}</w:r>`, `<w:r>${t('plo ')}</w:r><w:ins w:id="7" w:author="Ana"><w:r>${t('muy ')}</w:r></w:ins><w:r>${t('claro de texto que ')}</w:r>`));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('ejemplo claro', 'ejemplo muy claro'));
    expect(r.edits).toMatchObject([{ kind: 'tracked', status: 'applied', after: 'muy ' }]);
  });

  it('turns a line break typed by the user into a forced break', () => {
    const r = run((x) => replaceEach(x, `<w:r>${t('plo claro de texto que ')}</w:r>`, `<w:r>${t('plo claro')}</w:r><w:r><w:br/></w:r><w:r>${t(' de texto que ')}</w:r>`));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('claro de', 'claro\\\nde'));
  });

  it('ignores the fallback copy of a text box', () => {
    // Only the drawing (mc:Choice) is edited; the VML copy keeps the old text.
    const r = run((x) => x.replace(t('Segundo '), t('Tercer ')));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('Segundo', 'Tercer'));
  });

  it('keeps emphasis when a word inside it is retyped', () => {
    const r = run((x) => replaceEach(x, '<w:rPr><w:i/></w:rPr><w:t xml:space="preserve">bloque</w:t>', '<w:rPr><w:i/></w:rPr><w:t xml:space="preserve">párrafo</w:t>'));
    expect(r.chapters[0]!.markdown).toBe(MD.replace('*bloque*', '*párrafo*'));
  });
});
