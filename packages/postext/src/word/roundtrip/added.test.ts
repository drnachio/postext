// Paragraphs typed outside every bookmark (#1395): between two blocks, at
// a chapter's start or end, as headings or list items by their style.

import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { semanticDocx } from '../semantic/index.js';
import { applyDocxEdits } from './index.js';

const DATE = '2026-11-04T00:00:00Z';
const CH1 = '# One\n\nFirst para.\n\n- item a\n- item b\n\nLast para.\n';
const CH2 = '# Two\n\nSecond chapter.\n';
const chapters = [{ id: 'a', markdown: CH1 }, { id: 'b', markdown: CH2 }];

const para = (text: string, pPr = ''): string => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

async function run(edit: (xml: string) => string) {
  const bytes = await semanticDocx({ chapters, config: {}, date: DATE });
  const files = unzipSync(bytes);
  const xml = strFromU8(files['word/document.xml']!);
  const edited = edit(xml);
  expect(edited).not.toBe(xml);
  files['word/document.xml'] = strToU8(edited);
  const r = applyDocxEdits(zipSync(files), { chapters });
  return { md: r.chapters.map((c) => c.markdown), r, xml };
}

/** Insert `add` after the paragraph holding `text`. */
const afterPara = (text: string, add: string) => (xml: string): string => xml.replace(new RegExp(`(${text}</w:t>[^]*?</w:p>)`), `$1${add}`);

describe('paragraphs typed outside every bookmark', () => {
  it('goes in between two blocks as a new paragraph', async () => {
    const { md, r } = await run(afterPara('First para\\.', para('Typed *here*.')));
    expect(md).toEqual([CH1.replace('First para.', 'First para.\n\nTyped \\*here\\*.'), CH2]);
    expect(r.edits).toMatchObject([{ kind: 'paragraph', status: 'applied', chapter: 'a' }]);
  });

  it('takes a heading level from a Heading N style', async () => {
    const { md } = await run(afterPara('First para\\.', para('New section', '<w:pStyle w:val="Heading2"/>')));
    expect(md[0]).toBe(CH1.replace('First para.', 'First para.\n\n## New section'));
  });

  it('makes a numbered paragraph next to a list item an item of that list', async () => {
    const { md, xml } = await run((x) => {
      const numPr = /<w:numPr>[^]*?<\/w:numPr>/.exec(x)![0];
      return afterPara('item b', para('item c', `<w:pStyle w:val="ListParagraph"/>${numPr}`))(x);
    });
    expect(xml).toContain('<w:numPr>');
    expect(md[0]).toBe(CH1.replace('- item b', '- item b\n- item c'));
  });

  it('goes at the end of a chapter typed before its section break', async () => {
    const { md } = await run((x) => x.replace('<w:p><w:pPr><w:sectPr', `${para('The end.')}<w:p><w:pPr><w:sectPr`));
    expect(md).toEqual([CH1.replace('Last para.\n', 'Last para.\n\nThe end.\n'), CH2]);
  });

  it('goes at the start of a chapter typed after the section break before it', async () => {
    const { md } = await run((x) => x.replace(/(<w:sectPr[^]*?<\/w:sectPr><\/w:pPr><\/w:p>)/, `$1${para('Foreword.')}`));
    expect(md).toEqual([CH1, `Foreword.\n\n${CH2}`]);
  });

  it('goes at the start of the document', async () => {
    const { md } = await run((x) => x.replace('<w:body>', `<w:body>${para('Title page', '<w:pStyle w:val="Heading1"/>')}`));
    expect(md).toEqual([`# Title page\n\n${CH1}`, CH2]);
  });

  it('keeps several typed paragraphs in their order', async () => {
    const { md } = await run(afterPara('First para\\.', para('One.') + para('Two.')));
    expect(md[0]).toBe(CH1.replace('First para.', 'First para.\n\nOne.\n\nTwo.'));
  });
});
