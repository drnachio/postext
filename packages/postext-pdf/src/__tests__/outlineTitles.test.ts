import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';

// EF-81: a heading set in capitals (`textTransform: 'uppercase'`) is named
// in the bookmarks as it was written, the way CSS `text-transform` leaves
// the text itself alone: the case is how the page prints it.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });

const config: PostextConfig = {
  page: { dpi: 72, width: pt(300), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }, { level: 2, numberingTemplate: '{1}.{2}' }] },
  headingStyles: [{ id: 'back', textTransform: 'uppercase', numberingTemplate: '' }],
};

async function outlineTitles(markdown: string, cfg: PostextConfig = config): Promise<string[]> {
  const doc = buildDocument({ markdown }, cfg);
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: false }));
  const titles: string[] = [];
  const walk = (first: PDFDict | undefined): void => {
    for (let item = first; item; item = item.lookupMaybe(PDFName.of('Next'), PDFDict)) {
      const title = item.get(PDFName.of('Title'));
      if (title instanceof PDFHexString || title instanceof PDFString) titles.push(title.decodeText());
      walk(item.lookupMaybe(PDFName.of('First'), PDFDict));
    }
  };
  walk(pdf.catalog.lookup(PDFName.of('Outlines'), PDFDict).lookupMaybe(PDFName.of('First'), PDFDict));
  return titles;
}

describe('bookmarks of headings set in capitals (EF-81)', () => {
  it('name the heading as written, while the page prints it in capitals', async () => {
    const markdown = '# Pendulum\n\n## Methods\n\nText.\n\n## Author contributions {style="back"}\n\nText.';
    const doc = buildDocument({ markdown }, config);
    const printed = doc.blocks.filter((b) => b.type === 'heading').map((b) => b.lines.map((l) => l.text).join(' '));
    expect(printed).toContain('AUTHOR CONTRIBUTIONS');
    expect(await outlineTitles(markdown)).toEqual(['Pendulum', '1.1 Methods', 'Author contributions']);
  }, 60_000);

  it('keep the number, which the transform never touched', async () => {
    const cfg: PostextConfig = { ...config, headings: { levels: [{ level: 1, breakBefore: { enabled: false }, numberingTemplate: 'Part {1:I}', textTransform: 'uppercase' }] } };
    expect(await outlineTitles('# The sea\n\nText.', cfg)).toEqual(['Part I The sea']);
  }, 60_000);
});

describe('bookmarks of Chinese chapter heads', () => {
  it('join the number and the title with the level\'s separator', async () => {
    const cfg = (numberSeparator?: string): PostextConfig => ({
      ...config,
      locale: 'zh-Hant',
      headings: { levels: [{ level: 1, breakBefore: { enabled: false }, numberingTemplate: '第{1:一}回', ...(numberSeparator !== undefined ? { numberSeparator } : {}) }] },
    });
    const markdown = '# 甄士隱夢幻識通靈 \\\\ 賈雨村風塵懷閨秀\n\n此開卷第一回也。';
    expect(await outlineTitles(markdown, cfg('\u3000'))).toEqual(['第一回\u3000甄士隱夢幻識通靈\u3000賈雨村風塵懷閨秀']);
    expect(await outlineTitles(markdown, cfg(''))).toEqual(['第一回甄士隱夢幻識通靈\u3000賈雨村風塵懷閨秀']);
    expect(await outlineTitles(markdown, cfg())).toEqual(['第一回 甄士隱夢幻識通靈\u3000賈雨村風塵懷閨秀']);
  }, 60_000);

  // A heading that wraps is read back the way it was broken: nothing
  // between two Chinese characters (賈 | 雨村), the ideographic space back
  // where a line ends or starts with it, in the bookmark and in the tagged
  // document title alike.
  it('read a wrapped heading back without a space inside the title', async () => {
    const markdown = '# 甄士隱夢幻識通靈 \\\\ 賈雨村風塵懷閨秀\n\n此開卷第一回也。';
    const expected = '第一回\u3000甄士隱夢幻識通靈\u3000賈雨村風塵懷閨秀';
    // 140 pt breaks after 賈; 125 pt starts the second line with the
    // couplet's ideographic space, 135 pt ends the first line with it.
    for (const width of [140, 125, 135]) {
      const cfg: PostextConfig = {
        ...config,
        locale: 'zh-Hant',
        page: { ...config.page, width: pt(width) },
        headings: { levels: [{ level: 1, breakBefore: { enabled: false }, numberingTemplate: '第{1:一}回', numberSeparator: '\u3000' }] },
      };
      const doc = buildDocument({ markdown }, cfg);
      expect(doc.blocks.find((b) => b.type === 'heading')!.lines.length, String(width)).toBeGreaterThan(1);
      const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: true }));
      expect(pdf.getTitle(), String(width)).toBe(expected);
      expect(await outlineTitles(markdown, cfg), String(width)).toEqual([expected]);
    }
  }, 60_000);
});

describe('bookmarks of wrapped headings', () => {
  it('rejoin a word the line cut, and keep a hard hyphen', async () => {
    const cfg: PostextConfig = { ...config, page: { ...config.page, width: pt(150) } };
    expect(await outlineTitles('# The incomprehensibilities of the sea\n\nText.', cfg)).toEqual(['The incomprehensibilities of the sea']);
    expect(await outlineTitles('# A well-known and oft-quoted opening line\n\nText.', cfg)).toEqual(['A well-known and oft-quoted opening line']);
  }, 60_000);
});
