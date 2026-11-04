// Round trip through the real writers (#1390, #1392): an unedited export
// comes back unchanged, and a word edited in Word lands in the source.

import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { semanticDocx } from '../semantic/index.js';
import { formattedDocx } from '../formatted/index.js';
import { build, config, LOREM, mm } from '../formatted/formatted.test-helper.js';
import { applyDocxEdits } from './index.js';

const DATE = '2026-11-04T00:00:00Z';

function edit(bytes: Uint8Array, f: (xml: string) => string): Uint8Array {
  const files = unzipSync(bytes);
  files['word/document.xml'] = strToU8(f(strFromU8(files['word/document.xml']!)));
  return zipSync(files);
}

describe('round trip through the writers', () => {
  it('semantic: paragraphs, emphasis, a link and a list', async () => {
    const md = `# Heading one\n\nSome **bold** and *it* with a [link](http://a.b) here. ${LOREM}\n\n- item a\n- item b\n\nLast paragraph.\n`;
    const chapters = [{ id: 'c', markdown: md }];
    const bytes = await semanticDocx({ chapters, config: config(), date: DATE });
    expect(applyDocxEdits(bytes, { chapters }).edits).toEqual([]);
    const r = applyDocxEdits(edit(bytes, (x) => x.replace('Typesetting', 'Typesettin').replace('item b', 'item B')), { chapters });
    expect(r.chapters[0]!.markdown).toBe(md.replace('Typesetting', 'Typesettin').replace('item b', 'item B'));
  });

  it('semantic: code inside a link keeps its backticks', async () => {
    const md = 'Install [`postext`](https://www.npmjs.com/package/postext) now, or **`bold code`** and *[`it`](https://a.b)*.\n';
    const chapters = [{ id: 'c', markdown: md }];
    const bytes = await semanticDocx({ chapters, config: config(), date: DATE });
    expect(applyDocxEdits(bytes, { chapters }).edits).toEqual([]);
  });

  it('formatted: a paragraph over several pages, hyphenated', async () => {
    const md = `${LOREM} ${LOREM}\n\n${LOREM} ${LOREM} ${LOREM}\n`;
    const chapters = [{ id: 'c', markdown: md }];
    const cfg = config({ page: { dpi: 72, width: mm(90), height: mm(80), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } } } as never);
    const bytes = await formattedDocx({ docs: [build(md, cfg)], chapters, date: DATE });
    expect(applyDocxEdits(bytes, { chapters }).edits).toEqual([]);
    const r = applyDocxEdits(edit(bytes, (x) => x.replaceAll('Typesetting', 'Type setting')), { chapters });
    expect(r.chapters[0]!.markdown).toBe(md.replaceAll('Typesetting', 'Type setting'));
  });
});
