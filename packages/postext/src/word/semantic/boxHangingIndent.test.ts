// A box style's `body.hangingIndent` (#1451) in the semantic Word export:
// the box's paragraph style hangs its turnovers as the engine does, and
// the export reads back unchanged.

import { describe, expect, it } from 'vitest';
import type { PostextConfig } from '../../types.js';
import { exportDocx, exportProblems, type Exported } from './fixtures/harness.js';

const cfg = (c: Record<string, unknown>): PostextConfig => c as unknown as PostextConfig;
const em = (value: number) => ({ value, unit: 'em' });
const md = ':::callout{type="notes"}\n*\tA note long enough to turn over.\n:::\n';

/** The `w:ind` of the box's body paragraph style. */
const boxIndent = (e: Exported): string => {
  const xml = e.part('word/styles.xml');
  const at = xml.search(/w:styleId="PostextBox(?!Title)/);
  const style = xml.slice(at, xml.indexOf('</w:style>', at));
  return style.match(/<w:ind [^>]*\/>/)?.[0] ?? '';
};

async function indentOf(body: Record<string, unknown>): Promise<string> {
  const e = await exportDocx(md, { config: cfg({ calloutStyles: [{ id: 'notes', body }] }) });
  expect(exportProblems(e, [md])).toEqual([]);
  return boxIndent(e);
}

describe('semantic docx: hanging box body (#1451)', () => {
  it('writes only the first-line indent of a box that does not hang', async () => {
    expect(await indentOf({ firstLineIndent: em(1) })).toBe('<w:ind w:firstLine="160"/>');
    expect(await indentOf({ firstLineIndent: em(1), hangingIndent: false })).toBe('<w:ind w:firstLine="160"/>');
  });

  it('hangs every line but the first by the first-line indent when the hang is true', async () => {
    expect(await indentOf({ firstLineIndent: em(1), hangingIndent: true })).toBe('<w:ind w:left="160" w:hanging="160"/>');
  });

  it('sets the turnovers at a hanging length, the first line at the edge', async () => {
    expect(await indentOf({ hangingIndent: em(2) })).toBe('<w:ind w:left="320" w:hanging="320"/>');
  });

  it('starts the first line at the style\'s own first-line indent beside a hanging length', async () => {
    expect(await indentOf({ firstLineIndent: em(0.5), hangingIndent: em(2) })).toBe('<w:ind w:left="320" w:hanging="240"/>');
    // A first line deeper than the turnovers is a first-line indent from them.
    expect(await indentOf({ firstLineIndent: em(3), hangingIndent: em(2) })).toBe('<w:ind w:left="320" w:firstLine="160"/>');
  });
});
