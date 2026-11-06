// Struck-through text (`~~…~~`) in the reflowable rendition: the struck
// words, and the spaces between them, inside one `<s>`, which a reading
// system draws and reads as struck; a full stop glued to the run stays out.

import { describe, expect, it } from 'vitest';
import { layOut } from './__tests__/vdt.js';
import { checkXml } from './__tests__/xml.js';
import { buildReflowablePublication } from './index.js';

async function chapterOf(markdown: string): Promise<string> {
  const pub = await buildReflowablePublication([layOut(markdown)], {
    layout: 'reflowable',
    metadata: { title: 'Price list', language: 'en', modified: new Date(Date.UTC(2026, 10, 6)) },
  });
  const chapter = pub.items.find((i) => i.href === 'text/chapter-001.xhtml')!.data as string;
  expect(checkXml(chapter).errors).toEqual([]);
  return /<body>([\s\S]*)<\/body>/.exec(chapter)![1]!.replace(/\n/g, '');
}

describe('strikethrough in the reflowable EPUB', () => {
  it('writes a struck run as one <s>, spaces included', async () => {
    const body = await chapterOf('Widget A now costs 129 instead of ~~the old price of 165~~ in the shop.');
    expect(body).toContain('<s>the old price of 165</s>');
    expect(body).toContain('instead of <s>');
  });

  it('keeps a full stop glued to the run out of it', async () => {
    const body = await chapterOf('It cost ~~165~~. Now less.');
    expect(body).toContain('<s>165</s>.');
  });

  it('nests with emphasis', async () => {
    const body = await chapterOf('Plain **~~bold struck~~** text.');
    // Each word in its own `<strong>`, as bold is written; the space between
    // them is struck too.
    expect(body).toContain('Plain <strong><s>bold</s></strong><s> </s><strong><s>struck</s></strong> text.');
  });
});
