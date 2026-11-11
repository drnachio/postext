// Character styles (`:span[…]{style="id"}`) in the semantic .docx: a Word
// character style of their look under a name every language reads back,
// and a correction inside one comes back inside its directive.

import { describe, expect, it } from 'vitest';
import type { PostextConfig } from '../../types.js';
import { applyDocxEdits } from '../roundtrip/index.js';
import { editDocx } from '../roundtrip/fixture.test-helper.js';
import { exportDocx, exportProblems } from './fixtures/harness.js';

const config = {
  markStyles: [
    { id: 'mark' },
    { id: 'pen', background: { hex: '#ffe14d', model: 'hex' }, opacity: 50 },
    { id: 'wave', backgroundEnabled: false, line: { style: 'wavy' } },
  ],
  characterStyles: [
    { id: 'term', name: 'Key term', fontWeight: 700, mark: 'pen' },
    { id: 'sub', name: 'Corrección', mark: 'wave', color: { hex: '#aa0000', model: 'hex' } },
  ],
} as unknown as PostextConfig;

const MD = 'Un :span[texto **marcado**]{style="term"} y :span[otro]{style="sub"} aquí, y :span[suelto]{style="nadie"}.\n';

describe('character styles in the semantic .docx', () => {
  it('writes each style the text uses as a Word character style of its look', async () => {
    const e = await exportDocx(MD, { config });
    expect(exportProblems(e, [MD])).toEqual([]);
    const styles = e.part('word/styles.xml');
    // The band of the highlight style it names: its yellow at half
    // strength over white.
    expect(styles).toMatch(/<w:name w:val="Postext Style: Key term"\/>.*?<w:shd w:val="clear" w:color="auto" w:fill="FFF0A6"\/>/);
    expect(styles).toMatch(/<w:name w:val="Postext Style: Corrección"\/>.*?<w:u w:val="wave"\/>/);
    expect(e.doc).toContain('<w:rStyle w:val="PostextCharStyleterm"/>');
    // A style the book does not have sets as plain text.
    expect(styles).not.toContain('nadie');
  });

  it('brings a correction inside a styled run back inside its directive', async () => {
    const e = await exportDocx(MD, { config });
    const edited = editDocx(e.bytes, (xml) => xml.replace('>otro<', '>otra cosa<'));
    const r = applyDocxEdits(edited, { chapters: [{ id: 'ch1', markdown: MD }] });
    expect(r.chapters[0]!.markdown).toBe(MD.replace(':span[otro]', ':span[otra cosa]'));
  });
});
