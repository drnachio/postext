// Round-trip defects the repository corpus found (#1399), cut down to the
// Markdown that shows them. Each is expected to fail until it is fixed:
// when one starts passing, `it.fails` turns red, and the case moves into
// the passing tests of its writer.

import { beforeAll, describe, expect, it } from 'vitest';
import { formattedDocx } from '../formatted/index.js';
import { build, config } from '../formatted/formatted.test-helper.js';
import { initTexToOmml } from '../ommlWrite/index.js';
import { semanticDocx } from '../semantic/index.js';
import { applyDocxEdits } from '../roundtrip/index.js';
import type { PostextConfig } from '../../index.js';
import type { WordChapterInput } from '../semantic/types.js';
import { DATE } from './integration.test-helper.js';

const CFG = config({ layout: { layoutType: 'double' } } as Partial<PostextConfig>);

async function unedited(variant: 'semantic' | 'formatted', markdown: string): Promise<void> {
  const chapters: WordChapterInput[] = [{ id: 'c1', markdown }];
  const bytes = variant === 'semantic'
    ? await semanticDocx({ chapters, config: {} as never, date: DATE, exportId: 'ptx-known' })
    : await formattedDocx({ docs: [build(markdown, CFG)], chapters, date: DATE, exportId: 'ptx-known' });
  const r = applyDocxEdits(bytes, { chapters });
  expect(r.edits).toEqual([]);
  expect(r.chapters[0]!.markdown).toBe(markdown);
}

describe('known round-trip defects (unedited export reads back changed)', () => {
  beforeAll(async () => {
    await initTexToOmml();
  });

  // guide/ar c15: the inline code inside a link reads back as plain text
  // (an "applied format" edit `postext` → postext).
  it('semantic: inline code inside a link keeps its backticks', async () => {
    await unedited('semantic', 'The engine is on npm as [`postext`](https://www.npmjs.com/package/postext) and runs anywhere.\n');
  });

  // guide c13 in every edition: each line of a fenced code block comes
  // back as a "rejected format" edit whose before and after are equal.
  it('formatted: a fenced code block gives no format edits', async () => {
    await unedited('formatted', "Some text before.\n\n```ts\nimport { buildDocument } from 'postext';\nconst doc = buildDocument(markdown, config);\n```\n\nAfter.\n");
  });

  // guide/ja c4: mono ruby (a reading per character) loses its base text,
  // {漢字|かん|じ} → {|かん|じ}, as "applied text" edits 漢字 → "".
  it('formatted: mono ruby keeps its base text', async () => {
    await unedited('formatted', '日本語の段落でも{漢字|かん|じ}と{紅葉|もみじ}にルビを振る。\n');
  });
});
