// Underlined text (`++…++`) in the reflowable rendition: the underlined
// words, and the spaces between them, inside one `<u>`; a full stop glued
// to the run stays out.

import { describe, expect, it } from 'vitest';
import { layOut } from './__tests__/vdt.js';
import { checkXml } from './__tests__/xml.js';
import { buildReflowablePublication } from './index.js';

async function chapterOf(markdown: string): Promise<string> {
  const pub = await buildReflowablePublication([layOut(markdown)], {
    layout: 'reflowable',
    metadata: { title: 'Letter', language: 'en', modified: new Date(Date.UTC(2026, 10, 10)) },
  });
  const chapter = pub.items.find((i) => i.href === 'text/chapter-001.xhtml')!.data as string;
  expect(checkXml(chapter).errors).toEqual([]);
  return /<body>([\s\S]*)<\/body>/.exec(chapter)![1]!.replace(/\n/g, '');
}

describe('underline in the reflowable EPUB', () => {
  it('writes an underlined run as one <u>, spaces included', async () => {
    const body = await chapterOf('Please ++sign all pages++ and return them.');
    expect(body).toContain('Please <u>sign all pages</u> and');
  });

  it('keeps a full stop glued to the run out of it', async () => {
    const body = await chapterOf('Return it by ++Friday++. Thank you.');
    expect(body).toContain('<u>Friday</u>.');
  });

  it('goes with a strikethrough and with emphasis', async () => {
    expect(await chapterOf('Now ~~++both++~~ lines.')).toContain('<u><s>both</s></u>');
    expect(await chapterOf('Plain **++bold under++** text.')).toContain('Plain <strong><u>bold</u></strong><u> </u><strong><u>under</u></strong> text.');
  });
});
