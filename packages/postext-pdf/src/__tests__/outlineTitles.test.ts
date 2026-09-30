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

// GB/T 9704 indents every head two cells, and a heading level has no
// indent of its own: the template opens with two ideographic spaces
// (`'　　{2:一}、'`). The lines read back trimmed, so the number is found in
// them without its indent, and the bookmark neither repeats it nor starts
// with the indent.
describe('bookmarks of heads whose number opens with ideographic spaces', () => {
  const cfg: PostextConfig = {
    ...config,
    locale: 'zh-Hans',
    headings: { levels: [
      { level: 1, breakBefore: { enabled: false }, numberingTemplate: '\u3000\u3000{1:一}、', numberSeparator: '' },
      { level: 2, numberingTemplate: '\u3000\u3000（{2:一}）', numberSeparator: '' },
      { level: 3, numberingTemplate: '\u3000\u3000{3}.', numberSeparator: '' },
    ] },
  };
  const markdown = '# 培训时间\n\n正文。\n\n## 排版规范\n\n正文。\n\n### 公文格式\n\n正文。';

  it('print the number once, without the indent', async () => {
    const doc = buildDocument({ markdown }, cfg);
    expect(doc.blocks.find((b) => b.type === 'heading')!.numberPrefix).toBe('\u3000\u3000一、');
    expect(await outlineTitles(markdown, cfg)).toEqual(['一、培训时间', '（一）排版规范', '1.公文格式']);
  }, 60_000);

  it('name the document after the first head the same way', async () => {
    const pdf = await PDFDocument.load(await renderToPdf(buildDocument({ markdown }, cfg), { fontProvider, accessible: true }));
    expect(pdf.getTitle()).toBe('一、培训时间');
  }, 60_000);
});

// A forced break (`\\`) reads in the column as a space, which the page
// sets as the Han–Latin space where a Chinese character meets a digit or a
// Latin letter. Plain text has no such space: the bookmark and the document
// title join the two halves with nothing there, with the ideographic space
// between two Chinese characters (a couplet title) and with a space
// between Latin words (#221).
describe('bookmarks of headings with a forced break', () => {
  const zh = (width: number, extra: Partial<PostextConfig> = {}): PostextConfig => ({
    ...config,
    locale: 'zh-Hans',
    page: { ...config.page, width: pt(width) },
    headings: { levels: [{ level: 1, breakBefore: { enabled: false }, numberingTemplate: '' }] },
    ...extra,
  });
  const official = '# 示例市出版协会关于举办 \\\\ 2026年中文排版实务培训班的通知\n\n为提高会员单位排版人员的业务水平，协会定于2026年10月举办中文排版实务培训班。';
  const joined = '示例市出版协会关于举办2026年中文排版实务培训班的通知';

  it('join a Chinese character and a number with nothing, in the bookmark and the document title', async () => {
    // 300 pt sets the title on one line, the break as a space (the
    // Han–Latin space); 180 pt wraps it after the break, 120 pt at it.
    const printed: Record<number, string[]> = {
      300: ['示例市出版协会关于举办 2026年中文排版实务培训班的通知'],
      180: ['示例市出版协会关于举办 2026年中文', '排版实务培训班的通知'],
      120: ['示例市出版协会关于举办', '2026年中文排版实', '务培训班的通知'],
    };
    for (const width of [300, 180, 120]) {
      const cfg = zh(width);
      const doc = buildDocument({ markdown: official }, cfg);
      expect(doc.blocks.find((b) => b.type === 'heading')!.lines.map((l) => l.text), String(width)).toEqual(printed[width]);
      expect(await outlineTitles(official, cfg), String(width)).toEqual([joined]);
      const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: true }));
      expect(pdf.getTitle(), String(width)).toBe(joined);
    }
  }, 60_000);

  it('join Chinese and Latin text with nothing, and keep the space between Latin words', async () => {
    const markdown = '# Postext \\\\ 使用手册\n\n正文。\n\n# 第二部分 \\\\ Appendix\n\n正文。\n\n# Latin title \\\\ second half\n\n正文。\n\n# 甄士隱夢幻識通靈 \\\\ 賈雨村風塵懷閨秀\n\n正文。';
    expect(await outlineTitles(markdown, zh(300))).toEqual(['Postext使用手册', '第二部分Appendix', 'Latin title second half', '甄士隱夢幻識通靈\u3000賈雨村風塵懷閨秀']);
  }, 60_000);

  it('join them the same way in a heading set in capitals, named as written', async () => {
    const cfg = zh(300, { headingStyles: [{ id: 'back', textTransform: 'uppercase', numberingTemplate: '' }] });
    const markdown = '# 年会 \\\\ Annual meeting {style="back"}\n\n正文。\n\n# Author \\\\ contributions {style="back"}\n\n正文。';
    expect(await outlineTitles(markdown, cfg)).toEqual(['年会Annual meeting', 'Author contributions']);
  }, 60_000);

  // A part's title reads its break as a heading's does (#221 review).
  it('join the halves of a part title the same way', async () => {
    const markdown = ':::part{number="第一部" title="风月宝鉴 \\\\ 2026年版"}\n:::\n\n# 甲\n\n正文。\n\n:::part{number="第二部" title="金陵 \\\\ 十二钗"}\n:::\n\n# 乙\n\n正文。\n\n:::part{number="Part III" title="Stone \\\\ and dream"}\n:::\n\n# 丙\n\n正文。';
    expect(await outlineTitles(markdown, zh(300))).toEqual(['第一部 风月宝鉴2026年版', '甲', '第二部 金陵\u3000十二钗', '乙', 'Part III Stone and dream', '丙']);
  }, 60_000);

  // The 《》 of a book title are set by the layout, no characters of the
  // title: the break is found past them, and the author's space elsewhere
  // in the title stays (#221 review).
  it('find the break past the brackets of a book title', async () => {
    const markdown = '# 第一章 \\\\ 中 API:book[手册]\n\n正文。\n\n# 关于举办 \\\\ 2026年:book[红楼梦]研讨\n\n正文。';
    // One line, and wrapped at the break, at the author's space or inside
    // the brackets.
    for (const width of [300, 100, 90]) {
      expect(await outlineTitles(markdown, zh(width)), String(width)).toEqual(['第一章\u3000中 API《手册》', '关于举办2026年《红楼梦》研讨']);
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

describe('bookmarks of a plate set as a heading', () => {
  // The vertical 紅樓夢 puts each chapter's plate on the verso before its
  // opener with a level-1 heading of a `plate` style (#200): it interrupts no
  // chapter and is listed nowhere, so it gets no bookmark either.
  const cfg = (plate: { runningChapter?: boolean; toc?: boolean }): PostextConfig => ({
    ...config,
    headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
    headingStyles: [{ id: 'plate', numbered: false, ...plate }],
  });
  const markdown = '# The gate {style="plate"}\n\n# Chapter one\n\nText.\n\n# The garden {style="plate"}\n\n# Chapter two\n\nText.';

  it('leave out a heading kept out of the running chapter and the contents', async () => {
    expect(await outlineTitles(markdown, cfg({ runningChapter: false, toc: false }))).toEqual(['Chapter one', 'Chapter two']);
  }, 60_000);

  it('keep one the contents list or the running heads name', async () => {
    expect(await outlineTitles(markdown, cfg({ runningChapter: false, toc: true }))).toEqual(['The gate', 'Chapter one', 'The garden', 'Chapter two']);
    expect(await outlineTitles(markdown, cfg({ toc: false }))).toEqual(['The gate', 'Chapter one', 'The garden', 'Chapter two']);
  }, 60_000);
});
