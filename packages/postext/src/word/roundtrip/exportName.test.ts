// The name an export goes by (#1517): the flow writer with the book's
// design is the Formatted export, content only is the Semantic one, and
// the reports and the file's properties say so; the writer is kept apart.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { exportVariantName } from '../anchors/exportMap.js';
import { exportDocx } from '../semantic/fixtures/harness.js';
import { applyDocxEdits } from './index.js';

const MD = '# Title\n\nSome text to edit.\n';

describe('export names', () => {
  it('names each export as the user chose it', () => {
    expect(exportVariantName({ variant: 'semantic', design: 'book' })).toBe('formatted');
    expect(exportVariantName({ variant: 'semantic', design: 'plain' })).toBe('semantic');
    // Written before the designs (1.67–1.71): the semantic export.
    expect(exportVariantName({ variant: 'semantic' })).toBe('semantic');
    expect(exportVariantName({ variant: 'formatted' })).toBe('facsimile');
  });

  for (const [design, name] of [['book', 'formatted'], ['plain', 'semantic']] as const) {
    it(`reports a ${design} export as ${name}, in its properties too`, async () => {
      const e = await exportDocx(MD, { design });
      const props = e.part('docProps/custom.xml');
      expect(props).toContain(`name="postext.variant"><vt:lpwstr>semantic</vt:lpwstr>`);
      expect(props).toContain(`name="postext.export"><vt:lpwstr>${name}</vt:lpwstr>`);
      const r = applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: MD }] });
      expect(r).toMatchObject({ variant: name, writer: 'semantic', design, edits: [] });
    });
  }

  it('reads a file written before the property (1.72–1.77) by its design', async () => {
    const e = await exportDocx(MD, { design: 'book' });
    const files = unzipSync(e.bytes);
    files['docProps/custom.xml'] = strToU8(strFromU8(files['docProps/custom.xml']!).replace(/<property [^>]*name="postext\.export">.*?<\/property>/, ''));
    const old = zipSync(files);
    expect(strFromU8(unzipSync(old)['docProps/custom.xml']!)).not.toContain('name="postext.export"');
    const edited = unzipSync(old);
    edited['word/document.xml'] = strToU8(strFromU8(edited['word/document.xml']!).replace('Some text', 'Other text'));
    const r = applyDocxEdits(zipSync(edited), { chapters: [{ id: 'ch1', markdown: MD }] });
    expect(r).toMatchObject({ variant: 'formatted', writer: 'semantic' });
    expect(r.chapters[0]!.markdown).toBe(MD.replace('Some text', 'Other text'));
  });
});
