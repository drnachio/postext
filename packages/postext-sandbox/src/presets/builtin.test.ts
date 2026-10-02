import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { BUILTIN_PRESET_LOCALES, GUIDE_SAMPLE_DOCUMENTS, createPostextGuidePreset, isPristineChineseGuide, pristineGuideFollowsViewer } from './builtin';
import { localeShortTag } from './localeNames';
import { DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES, DEFAULT_MARKDOWN_ZH_HANS } from '../defaultMarkdown';
import { isPristineBook, sampleBook } from '../book/chapterOps';

const preset = (extra: Partial<Parameters<typeof createPostextGuidePreset>[0]> = {}) =>
  createPostextGuidePreset({ name: 'The Postext guide', ...extra });

const svgFileIds = (resources: { kind: string; svg?: { fileId: string } }[]) =>
  resources.filter((r) => r.kind === 'svg').map((r) => r.svg!.fileId);

describe('the built-in guide in three languages', () => {
  it('lists Spanish, English and Simplified Chinese, the last shown as 简', () => {
    const { summary } = preset();
    expect(summary.locales).toEqual(['es', 'en', 'zh-Hans']);
    expect([...BUILTIN_PRESET_LOCALES]).toEqual(summary.locales);
    expect(localeShortTag('zh-Hans', summary.locales!)).toEqual({ text: '简', lang: 'zh-Hans' });
    expect(localeShortTag('es', summary.locales!).text).toBe('es');
  });

  it('loads the Chinese edition for any Chinese tag', async () => {
    for (const tag of ['zh-Hans', 'zh', 'zh-CN', 'zh-TW']) {
      const loaded = await preset().load(tag);
      expect(loaded.locale).toBe('zh-Hans');
      expect(loaded.config.locale).toBe('zh-Hans');
      expect(loaded.chapters[0]!.markdown).toContain('面向网页的可编程排版系统');
      // Its figures under ids of their own, captions and tables in Chinese.
      expect(svgFileIds(loaded.resources).every((id) => id.endsWith('-zh-hans'))).toBe(true);
      const table = loaded.resources.find((r) => r.id === 'preset-sizes')!;
      expect(table.caption).toBe('预设开本及其常见用途。');
      expect(JSON.stringify(table.table)).toContain('平装小说');
    }
  });

  it('keeps the English and Spanish editions and their blob ids', async () => {
    const en = await preset().load('en');
    const es = await preset().load('es-ES');
    expect(en.locale).toBe('en');
    expect(es.locale).toBe('es');
    expect(en.config.locale).toBe('en-us');
    expect(es.config.locale).toBe('es');
    expect(svgFileIds(en.resources)).toContain('default-layout-pipeline-en');
    expect(svgFileIds(es.resources)).toContain('default-layout-pipeline-es');
    expect(en.chapters.length).toBe(es.chapters.length);
  });

  it('cuts every edition into the same chapters', async () => {
    const counts = await Promise.all(['en', 'es', 'zh-Hans'].map(async (l) => (await preset().load(l)).chapters.length));
    expect(counts).toEqual([13, 13, 13]);
  });

  it('follows the language asked for when the host passes one of the samples', async () => {
    const loaded = await preset({ markdownOverride: DEFAULT_MARKDOWN_EN }).load('zh-Hans');
    expect(loaded.chapters[0]!.markdown).toContain('面向网页的可编程排版系统');
    const custom = await preset({ markdownOverride: '# Mine\n\nText.' }).load('zh-Hans');
    expect(custom.chapters[0]!.markdown).toContain('# Mine');
  });

  it('sets the Chinese edition in its own design even under a host config', async () => {
    const host: PostextConfig = { bodyText: { fontFamily: 'Host Serif' } };
    expect((await preset({ configOverride: host }).load('en')).config).toBe(host);
    const zh = await preset({ configOverride: host }).load('zh-Hans');
    expect(zh.config.bodyText?.fontFamily).toBe('Noto Serif SC');
  });

  it('has a fingerprint that covers the three editions', async () => {
    const a = await preset().fingerprint!();
    const b = await preset().fingerprint!();
    expect(a).toMatch(/^builtin-[0-9a-f]{8}$/);
    expect(a).toBe(b);
  });
});

describe('pristine guide detection with three languages', () => {
  let n = 0;
  const ids = () => `c${n++}`;

  it('reads every untouched edition as pristine', () => {
    for (const sample of [DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES, DEFAULT_MARKDOWN_ZH_HANS]) {
      expect(GUIDE_SAMPLE_DOCUMENTS).toContain(sample);
      expect(isPristineBook(sampleBook(sample, ids, 'Guide'), GUIDE_SAMPLE_DOCUMENTS)).toBe(true);
    }
  });

  it('tells the Chinese guide apart, so it stays Chinese in an English or Spanish interface', () => {
    expect(isPristineChineseGuide(sampleBook(DEFAULT_MARKDOWN_ZH_HANS, ids, 'Guide'))).toBe(true);
    expect(isPristineChineseGuide(sampleBook(DEFAULT_MARKDOWN_EN, ids, 'Guide'))).toBe(false);
    expect(isPristineChineseGuide(sampleBook(DEFAULT_MARKDOWN_ES, ids, 'Guide'))).toBe(false);
  });

  it('lets an untouched guide in another language follow the interface', () => {
    const en = sampleBook(DEFAULT_MARKDOWN_EN, ids, 'Guide');
    const es = sampleBook(DEFAULT_MARKDOWN_ES, ids, 'Guide');
    const zh = sampleBook(DEFAULT_MARKDOWN_ZH_HANS, ids, 'Guide');
    // The Chinese interface swaps an English or Spanish guide for its own.
    expect(pristineGuideFollowsViewer(en, DEFAULT_MARKDOWN_ZH_HANS, 'en')).toBe(true);
    expect(pristineGuideFollowsViewer(es, DEFAULT_MARKDOWN_ZH_HANS, null)).toBe(true);
    // A Chinese guide opened on purpose from English or Spanish stays…
    expect(pristineGuideFollowsViewer(zh, DEFAULT_MARKDOWN_EN, 'en')).toBe(false);
    expect(pristineGuideFollowsViewer(zh, DEFAULT_MARKDOWN_ES, 'es')).toBe(false);
    expect(pristineGuideFollowsViewer(zh, DEFAULT_MARKDOWN_EN, null)).toBe(false);
    // …while the Chinese interface's own follows the next interface.
    expect(pristineGuideFollowsViewer(zh, DEFAULT_MARKDOWN_EN, 'zh-Hans')).toBe(true);
    expect(pristineGuideFollowsViewer(zh, DEFAULT_MARKDOWN_ES, 'zh')).toBe(true);
    // The interface's own edition, or an edited book, stays.
    expect(pristineGuideFollowsViewer(zh, DEFAULT_MARKDOWN_ZH_HANS, 'en')).toBe(false);
    expect(pristineGuideFollowsViewer(en, DEFAULT_MARKDOWN_ES, 'en')).toBe(true);
    const edited = { ...en, chapters: en.chapters.map((c, i) => (i === 3 ? { ...c, markdown: `${c.markdown}\n\nEdited.` } : c)) };
    expect(pristineGuideFollowsViewer(edited, DEFAULT_MARKDOWN_ZH_HANS, 'en')).toBe(false);
  });

  it('drops an edited Chinese guide', () => {
    const book = sampleBook(DEFAULT_MARKDOWN_ZH_HANS, ids, 'Guide');
    const edited = { ...book, chapters: book.chapters.map((c, i) => (i === 3 ? { ...c, markdown: `${c.markdown}\n\n改了一句。` } : c)) };
    expect(isPristineBook(edited, GUIDE_SAMPLE_DOCUMENTS)).toBe(false);
    expect(isPristineChineseGuide(edited)).toBe(false);
  });
});
