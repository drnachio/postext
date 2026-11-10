// Character styles (`[…]|id|`) in the semantic .docx: a Word
// character style of their look, and a correction inside one comes back
// with the brackets kept.

import { describe, expect, it } from 'vitest';
import type { PostextConfig } from '../../types.js';
import { applyDocxEdits } from '../roundtrip/index.js';
import { editDocx } from '../roundtrip/fixture.test-helper.js';
import { exportDocx, exportProblems } from './fixtures/harness.js';

const config = {
  characterStyles: [
    { id: 'rotulador', name: 'Rotulador', highlight: { enabled: true, opacity: 50 } },
    { id: 'sub', name: 'Subrayado', underline: { enabled: true, style: 'wavy' } },
  ],
} as unknown as PostextConfig;

const MD = 'Un [texto **marcado**]|rotulador| y [otro]|sub| aquí, y [suelto]|nadie|.\n';

describe('character styles in the semantic .docx', () => {
  it('writes each style the text uses as a Word character style of its look', async () => {
    const e = await exportDocx(MD, { config });
    expect(exportProblems(e, [MD])).toEqual([]);
    const styles = e.part('word/styles.xml');
    // The band: its yellow at half strength over white.
    expect(styles).toMatch(/<w:name w:val="Character style: Rotulador"\/>.*?<w:shd w:val="clear" w:color="auto" w:fill="FFF0A6"\/>/);
    expect(styles).toMatch(/<w:name w:val="Character style: Subrayado"\/>.*?<w:u w:val="wave"\/>/);
    expect(e.doc).toContain('<w:rStyle w:val="PostextCharStylerotulador"/>');
    // A style the book does not have sets as plain text.
    expect(styles).not.toContain('nadie');
  });

  it('brings a correction inside a styled run back inside its brackets', async () => {
    const e = await exportDocx(MD, { config });
    const edited = editDocx(e.bytes, (xml) => xml.replace('>otro<', '>otra cosa<'));
    const r = applyDocxEdits(edited, { chapters: [{ id: 'ch1', markdown: MD }] });
    expect(r.chapters[0]!.markdown).toBe(MD.replace('[otro]|sub|', '[otra cosa]|sub|'));
  });
});
