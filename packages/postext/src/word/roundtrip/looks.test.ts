// The look of a run with its styles counted in, and the walker on what
// Google Docs writes (#1458).

import { describe, expect, it } from 'vitest';
import { parseXml } from '../xml.js';
import { styleLooks } from './looks.js';
import { texSymbols } from './looseTex.js';
import { mathUnchanged } from './math.js';
import { walkPart, type Token } from './walk.js';

const STYLES =
  '<w:styles><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Lora"/></w:rPr></w:rPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:basedOn w:val="Normal"/><w:rPr><w:b/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Kicker"><w:basedOn w:val="Heading1"/><w:rPr><w:b w:val="0"/><w:caps/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Listing"><w:rPr><w:rFonts w:ascii="Geist Mono"/></w:rPr></w:style>' +
  '<w:style w:type="character" w:styleId="PostextCodeChar"><w:rPr><w:rFonts w:ascii="Some Face"/></w:rPr></w:style>' +
  '<w:style w:type="character" w:styleId="Emphasis"><w:rPr><w:i/></w:rPr></w:style></w:styles>';

const rPr = (inner: string) => parseXml(`<w:rPr>${inner}</w:rPr>`);

describe('the look of a run', () => {
  const looks = styleLooks(parseXml(STYLES));

  it('counts in the paragraph style, the character style and the run', () => {
    expect(looks.look(undefined, undefined)).toBe('');
    expect(looks.look('Heading1', undefined)).toBe('b');
    expect(looks.look('Heading1', rPr('<w:i/>'))).toBe('bi');
    expect(looks.look('Heading1', rPr('<w:b w:val="0"/>'))).toBe('');
    expect(looks.look('Normal', rPr('<w:rStyle w:val="Emphasis"/><w:vertAlign w:val="superscript"/>'))).toBe('ip');
  });

  it('follows a style to the one it is based on', () => {
    expect(looks.look('Kicker', undefined)).toBe('u');
    expect(looks.caps).toBe(true);
  });

  it('reads code by its style or by a monospaced face, wherever either is set', () => {
    expect(looks.look('Listing', undefined)).toBe('k');
    expect(looks.look('Normal', rPr('<w:rStyle w:val="PostextCodeChar"/>'))).toBe('k');
    expect(looks.look('Normal', rPr('<w:rFonts w:ascii="Roboto Mono"/>'))).toBe('k');
    expect(looks.look('Listing', rPr('<w:rFonts w:ascii="Arial"/>'))).toBe('');
  });

  it('reads the looks Google Docs writes on every run of a file without styles', () => {
    const plain = styleLooks(undefined);
    expect(plain.look(undefined, rPr('<w:b w:val="1"/><w:i w:val="0"/><w:smallCaps w:val="0"/><w:vertAlign w:val="baseline"/>'))).toBe('b');
    expect(plain.caps).toBe(false);
    plain.look(undefined, rPr('<w:caps/>'));
    expect(plain.caps).toBe(true);
  });
});

const tokens = (body: string, generated?: string[]): Token[] => walkPart(parseXml(`<w:body>${body}</w:body>`), {}, [], 0, 0, generated ? { generated } : {}).tokens;
const shape = (ts: Token[]): string =>
  ts
    .map((t) => (t.t === 'char' ? t.ch : t.t === 'bmStart' ? `[${t.fid}@${t.para}` : t.t === 'bmEnd' ? ']' : t.t === 'para' ? '¶' : ''))
    .join('');
const start = (name: string, id: number) => `<w:bookmarkStart w:colFirst="0" w:colLast="0" w:name="${name}" w:id="${id}"/>`;
const end = (id: number) => `<w:bookmarkEnd w:id="${id}"/>`;
const run = (text: string) => `<w:r><w:t>${text}</w:t></w:r>`;

describe('bookmarks as Google Docs writes them', () => {
  it('opens a start written between the paragraphs with the paragraph that follows', () => {
    const doc = `${start('_ptx_0', 1)}<w:p>${run('One.')}${end(1)}</w:p>${start('_ptx_1', 2)}${start('own', 3)}${end(3)}<w:p>${run('Two.')}${end(2)}</w:p>`;
    expect(shape(tokens(doc))).toBe('[0@0One.]¶][1@1Two.]¶');
  });

  it('keeps a start that stands inside its paragraph where it is', () => {
    // A label and its caption: the second bookmark starts where the first ends.
    const doc = `${start('_ptx_a', 1)}<w:p>${run('Table 1. ')}${end(1)}${start('_ptx_b', 2)}${run('What it shows.')}${end(2)}</w:p>`;
    expect(shape(tokens(doc))).toBe('[a@0Table 1. ][b@0What it shows.]¶');
  });

  it('opens two starts hoisted before one paragraph one after the other', () => {
    const doc = `${start('_ptx_a', 1)}${start('_ptx_b', 2)}<w:p>${run('Table 1. ')}${end(1)}${run('What it shows.')}${end(2)}</w:p>`;
    expect(shape(tokens(doc))).toBe('[a@0Table 1. ][b@0What it shows.]¶');
  });

  it('opens a start before a table with the first paragraph of its first cell', () => {
    const doc = `<w:tbl><w:tr><w:tc><w:tcPr/>${start('_ptx_c', 1)}<w:p>${run('Cell')}${end(1)}</w:p></w:tc></w:tr></w:tbl>`;
    expect(shape(tokens(doc))).toBe('[c@0Cell]¶');
  });

  it('reads a paragraph split in the editor inside its bookmark', () => {
    const doc = `${start('_ptx_0', 1)}<w:p>${run('First half.')}</w:p><w:p>${run('Second half.')}${end(1)}</w:p>`;
    expect(shape(tokens(doc))).toBe('[0@0First half.¶Second half.]¶');
  });

  it('collects the lines the writer generated', () => {
    const generated: string[] = [];
    const field = (type: string) => `<w:r><w:fldChar w:fldCharType="${type}"/></w:r>`;
    const doc = `<w:p>${field('begin')}<w:r><w:instrText> INDEX </w:instrText></w:r>${field('separate')}${run('A')}</w:p><w:p>${run('alpha, 3')}${field('end')}</w:p><w:p>${run('Text.')}</w:p>`;
    expect(shape(tokens(doc, generated))).toBe('Text.¶');
    expect(generated).toEqual(['A', 'alpha, 3']);
  });
});

describe('an equation from an editor without matrices', () => {
  const det = '\\det \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc';
  const cases = '|x| = \\begin{cases} x & \\text{si } x \\ge 0 \\\\ -x & \\text{si } x<0 \\end{cases}';

  it('has the symbols of the equation as written', () => {
    // What the reader gives for the OMML Google Docs writes.
    expect(texSymbols('\\det det \\left(a b c d \\right) =ad−bc')).toBe(texSymbols(det));
    expect(texSymbols('|x|=\\{x si x≥0 −x si x<0')).toBe(texSymbols(cases));
  });

  it('is the equation, unchanged', () => {
    expect(mathUnchanged(`$$ ${det} $$`, '\\det det \\left(a b c d \\right) =ad−bc')).toBe(true);
    expect(mathUnchanged(`$$ ${cases} $$`, '|x|=\\{x si x≥0 −x si x<0')).toBe(true);
  });

  it('is another equation once a symbol changed', () => {
    expect(mathUnchanged(`$$ ${det} $$`, '\\det det \\left(a b c e \\right) =ad−bc')).toBe(false);
    // An equation with no grid to lose is compared as before.
    expect(mathUnchanged('$x^2$', 'x_2')).toBe(false);
  });
});
