import { describe, expect, it } from 'vitest';
import { exportDocx, exportProblems } from './fixtures/harness.js';

// Struck-through text (`~~…~~`) in the semantic Word export: the struck
// characters are set `w:strike`, never as a link, a link inside the run
// staying a link.

describe('semantic docx: strikethrough', () => {
  it('sets the struck characters w:strike and keeps a link inside them', async () => {
    const md = 'Widget A: ~~165 [list](https://example.org)~~ now 129.\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toContain('<w:strike/>');
    expect(e.doc).toMatch(/<w:hyperlink r:id="rIdLink1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"\/><w:strike\/>/);
    // The text after the run is plain.
    expect(e.doc).toContain('<w:r><w:t xml:space="preserve"> now 129.</w:t></w:r>');
  });
});
