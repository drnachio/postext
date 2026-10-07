import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { BUILTIN_PRESET_LOCALES, GUIDE_SAMPLE_DOCUMENTS, createPostextGuidePreset, isPristineArabicGuide, isPristineChineseGuide, isPristineJapaneseGuide, pristineGuideFollowsViewer } from './builtin';
import { localeShortTag } from './localeNames';
import { DEFAULT_MARKDOWN_AR, DEFAULT_MARKDOWN_CA, DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES, DEFAULT_MARKDOWN_JA, DEFAULT_MARKDOWN_PT_BR, DEFAULT_MARKDOWN_ZH_HANS } from '../defaultMarkdown';
import { isPristineBook, sampleBook } from '../book/chapterOps';
import { createPostextGuideConfig } from '../context/guideConfig';

const preset = (extra: Partial<Parameters<typeof createPostextGuidePreset>[0]> = {}) =>
  createPostextGuidePreset({ name: 'The Postext guide', ...extra });

const svgFileIds = (resources: { kind: string; svg?: { fileId: string } }[]) =>
  resources.filter((r) => r.kind === 'svg').map((r) => r.svg!.fileId);

describe('the built-in guide in seven languages', () => {
  it('lists Spanish, Catalan, English, Arabic, Simplified Chinese, Japanese and Brazilian Portuguese, shown as ES, CA, EN, ع, 简, 日 and PT', () => {
    const { summary } = preset();
    expect(summary.locales).toEqual(['es', 'ca', 'en', 'ar', 'zh-Hans', 'ja', 'pt-BR']);
    expect([...BUILTIN_PRESET_LOCALES]).toEqual(summary.locales);
    expect(localeShortTag('zh-Hans', summary.locales!)).toEqual({ text: '简', lang: 'zh-Hans' });
    expect(localeShortTag('ar', summary.locales!)).toEqual({ text: 'ع', lang: 'ar' });
    expect(localeShortTag('ja', summary.locales!)).toEqual({ text: '日', lang: 'ja' });
    expect(localeShortTag('es', summary.locales!).text).toBe('es');
    expect(localeShortTag('ca', summary.locales!).text).toBe('ca');
    // Upper-cased by the row style: PT.
    expect(localeShortTag('pt-BR', summary.locales!).text).toBe('pt');
  });

  it('loads the Brazilian Portuguese edition for any Portuguese tag, hyphenated in Portuguese, with its own figures', async () => {
    for (const tag of ['pt-BR', 'pt', 'pt-PT', 'pt_br']) {
      const loaded = await preset().load(tag);
      expect(loaded.locale).toBe('pt-BR');
      expect(loaded.config.locale).toBe('pt-BR');
      expect(loaded.config.bodyText?.hyphenation?.locale).toBe('pt');
      // The Latin design: the same faces as the English, Spanish and Catalan editions.
      expect(loaded.config.bodyText?.fontFamily).toBe('Lora');
      expect(loaded.config.resourceTypes?.map((t) => t.captionPrefix)).toEqual(['Figura', 'Tabela', 'Vídeo']);
      expect(loaded.chapters[0]!.markdown).toContain('Um compositor programável para a web');
      expect(svgFileIds(loaded.resources).every((id) => id.endsWith('-pt-br'))).toBe(true);
      const table = loaded.resources.find((r) => r.id === 'preset-sizes')!;
      expect(table.caption).toBe('Formatos de página predefinidos e o seu uso habitual.');
      // The Portuguese cut, captioned in Portuguese (#611).
      const showreel = loaded.resources.find((r) => r.kind === 'video')!;
      expect(showreel.video?.url).toContain('/showreel/v1/pt/');
      expect(showreel.video?.duration).toBe(136.57);
      expect(showreel.caption).not.toContain('em inglês');
    }
  });

  it('loads the Catalan edition, hyphenated in Catalan, with its own figures', async () => {
    const loaded = await preset().load('ca-ES');
    expect(loaded.locale).toBe('ca');
    expect(loaded.config.locale).toBe('ca');
    expect(loaded.config.bodyText?.hyphenation?.locale).toBe('ca');
    expect(loaded.chapters[0]!.markdown).toContain('Un tipògraf programable per al web');
    expect(svgFileIds(loaded.resources).every((id) => id.endsWith('-ca'))).toBe(true);
  });

  it('loads the Arabic edition for any Arabic tag, right to left in Arabic faces, with its own figures', async () => {
    for (const tag of ['ar', 'ar-EG', 'ar_MA']) {
      const loaded = await preset().load(tag);
      expect(loaded.locale).toBe('ar');
      const config = loaded.config;
      expect(config.locale).toBe('ar');
      // Direction, binding and digits come from the language.
      expect(config.direction).toBeUndefined();
      expect(config.page?.binding).toBeUndefined();
      expect(config.bodyText?.fontFamily).toBe('Amiri');
      expect(config.headings?.fontFamily).toBe('Noto Kufi Arabic');
      expect(config.captionStyle?.fontFamily).toBe('IBM Plex Sans Arabic');
      expect(config.bodyText?.hyphenation?.enabled).toBe(false);
      expect(config.bodyText?.kashida).toBe('auto');
      expect(config.resourceTypes?.map((t) => t.captionPrefix)).toEqual(['شكل', 'جدول', 'فيديو']);
      expect(svgFileIds(loaded.resources).every((id) => id.endsWith('-ar'))).toBe(true);
      const table = loaded.resources.find((r) => r.id === 'preset-sizes')!;
      expect(table.caption).toBe('مقاسات الصفحة الجاهزة واستعمالاتها المعتادة.');
      expect(loaded.chapters[0]!.markdown).toMatch(/\p{Script=Arabic}/u);
    }
  });

  it('sets no tracking, capitals or Latin-only face where the Arabic design prints Arabic', () => {
    const config = createPostextGuideConfig('ar');
    const json = JSON.stringify(config);
    expect(json).not.toContain('"letterSpacing":{"value":1');
    expect(json).not.toContain('uppercase');
    const latinFaces = ['Lora', 'Geist', 'Bricolage Grotesque'];
    for (const face of latinFaces) expect(json, face).not.toContain(`"${face}"`);
    // Fraunces only for the cover's title, the brand name "Postext".
    const texts: { fontFamily?: string; content: string }[] = [];
    JSON.parse(json, (_k, v: unknown) => {
      if (v && typeof v === 'object' && (v as { kind?: string }).kind === 'text') texts.push(v as { fontFamily?: string; content: string });
      return v;
    });
    expect(texts.filter((e) => e.fontFamily === 'Fraunces').map((e) => e.content)).toEqual(['{title}']);
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

  it('loads the Japanese edition for any Japanese tag, vertical in Japanese faces, with its own figures', async () => {
    for (const tag of ['ja', 'ja-JP', 'ja_jp']) {
      const loaded = await preset().load(tag);
      expect(loaded.locale).toBe('ja');
      const config = loaded.config;
      expect(config.locale).toBe('ja');
      expect(config.layout?.writingMode).toBe('vertical-rl');
      // Binding (right) and every Japanese rule come from the language.
      expect(config.page?.binding).toBeUndefined();
      expect(config.cjk?.region).toBeUndefined();
      expect(config.bodyText?.fontFamily).toBe('Noto Serif JP');
      expect(config.headings?.fontFamily).toBe('Noto Sans JP');
      expect(config.headings?.levels?.find((l) => l.level === 1)?.numberingTemplate).toBe('第{1:一}章');
      expect(config.resourceTypes?.map((t) => t.captionPrefix)).toEqual(['図', '表', '動画']);
      expect(svgFileIds(loaded.resources).every((id) => id.endsWith('-ja'))).toBe(true);
      const table = loaded.resources.find((r) => r.id === 'preset-sizes')!;
      expect(table.caption).toBe('定義済みの判型と主な用途。');
      expect(JSON.stringify(table.table)).toContain('四六判');
      // Vertical: every figure and table takes one tier.
      expect(loaded.resources.every((r) => r.placement?.span !== 'page')).toBe(true);
      expect(loaded.chapters[0]!.markdown).toContain('ウェブで動く、プログラムできる組版システム');
    }
  });

  it('sets no Chinese, Latin-only or Arabic face where the Japanese design prints Japanese', () => {
    const json = JSON.stringify(createPostextGuideConfig('ja'));
    for (const face of ['Lora', 'Geist', 'Bricolage Grotesque', 'Noto Serif SC', 'Noto Sans SC', 'Amiri']) expect(json, face).not.toContain(`"${face}"`);
    expect(json).not.toContain('uppercase');
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
    const counts = await Promise.all(['en', 'es', 'ca', 'zh-Hans', 'ar', 'ja', 'pt-BR'].map(async (l) => (await preset().load(l)).chapters.length));
    expect(counts).toEqual([14, 14, 14, 14, 14, 14, 14]);
  });

  it('follows the language asked for when the host passes one of the samples', async () => {
    const loaded = await preset({ markdownOverride: DEFAULT_MARKDOWN_EN }).load('zh-Hans');
    expect(loaded.chapters[0]!.markdown).toContain('面向网页的可编程排版系统');
    const custom = await preset({ markdownOverride: '# Mine\n\nText.' }).load('zh-Hans');
    expect(custom.chapters[0]!.markdown).toContain('# Mine');
  });

  it('sets the Chinese, Arabic and Japanese editions in their own design even under a host config', async () => {
    const host: PostextConfig = { bodyText: { fontFamily: 'Host Serif' } };
    expect((await preset({ configOverride: host }).load('en')).config).toBe(host);
    const zh = await preset({ configOverride: host }).load('zh-Hans');
    expect(zh.config.bodyText?.fontFamily).toBe('Noto Serif SC');
    const ar = await preset({ configOverride: host }).load('ar');
    expect(ar.config.bodyText?.fontFamily).toBe('Amiri');
    const ja = await preset({ configOverride: host }).load('ja');
    expect(ja.config.bodyText?.fontFamily).toBe('Noto Serif JP');
  });

  it('has a fingerprint that covers the seven editions', async () => {
    const a = await preset().fingerprint!();
    const b = await preset().fingerprint!();
    expect(a).toMatch(/^builtin-[0-9a-f]{8}$/);
    expect(a).toBe(b);
  });
});

describe('pristine guide detection with seven languages', () => {
  let n = 0;
  const ids = () => `c${n++}`;

  it('reads every untouched edition as pristine', () => {
    for (const sample of [DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES, DEFAULT_MARKDOWN_ZH_HANS, DEFAULT_MARKDOWN_CA, DEFAULT_MARKDOWN_AR, DEFAULT_MARKDOWN_JA, DEFAULT_MARKDOWN_PT_BR]) {
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
    // The interface's own edition cut into its chapters stays too (it was
    // reopened on every visit, leaving its resources out of the state).
    expect(pristineGuideFollowsViewer(es, DEFAULT_MARKDOWN_ES, 'es')).toBe(false);
    expect(pristineGuideFollowsViewer(en, DEFAULT_MARKDOWN_EN, 'en')).toBe(false);
    const edited = { ...en, chapters: en.chapters.map((c, i) => (i === 3 ? { ...c, markdown: `${c.markdown}\n\nEdited.` } : c)) };
    expect(pristineGuideFollowsViewer(edited, DEFAULT_MARKDOWN_ZH_HANS, 'en')).toBe(false);
  });

  it('keeps the Arabic guide opened on purpose, like the Chinese one', () => {
    const ar = sampleBook(DEFAULT_MARKDOWN_AR, ids, 'Guide');
    const en = sampleBook(DEFAULT_MARKDOWN_EN, ids, 'Guide');
    expect(isPristineArabicGuide(ar)).toBe(true);
    expect(isPristineArabicGuide(en)).toBe(false);
    // Opened from English or Spanish, it stays…
    expect(pristineGuideFollowsViewer(ar, DEFAULT_MARKDOWN_EN, 'en')).toBe(false);
    expect(pristineGuideFollowsViewer(ar, DEFAULT_MARKDOWN_ES, null)).toBe(false);
    // …the Arabic interface's own follows the next interface…
    expect(pristineGuideFollowsViewer(ar, DEFAULT_MARKDOWN_EN, 'ar')).toBe(true);
    expect(pristineGuideFollowsViewer(ar, DEFAULT_MARKDOWN_ZH_HANS, 'ar-EG')).toBe(true);
    // …and the Arabic interface swaps another edition for its own.
    expect(pristineGuideFollowsViewer(en, DEFAULT_MARKDOWN_AR, 'en')).toBe(true);
    expect(pristineGuideFollowsViewer(ar, DEFAULT_MARKDOWN_AR, 'en')).toBe(false);
  });

  it('keeps the Japanese guide opened on purpose, like the Chinese and Arabic ones', () => {
    const ja = sampleBook(DEFAULT_MARKDOWN_JA, ids, 'Guide');
    const en = sampleBook(DEFAULT_MARKDOWN_EN, ids, 'Guide');
    expect(isPristineJapaneseGuide(ja)).toBe(true);
    expect(isPristineJapaneseGuide(en)).toBe(false);
    expect(isPristineChineseGuide(ja)).toBe(false);
    for (const [viewer, previous] of [[DEFAULT_MARKDOWN_EN, 'en'], [DEFAULT_MARKDOWN_ES, null], [DEFAULT_MARKDOWN_ZH_HANS, 'zh-Hans'], [DEFAULT_MARKDOWN_AR, 'ar']] as const) {
      expect(pristineGuideFollowsViewer(ja, viewer, previous)).toBe(false);
    }
    // The Japanese interface's own follows the next interface…
    expect(pristineGuideFollowsViewer(ja, DEFAULT_MARKDOWN_EN, 'ja')).toBe(true);
    expect(pristineGuideFollowsViewer(ja, DEFAULT_MARKDOWN_AR, 'ja-JP')).toBe(true);
    // …and the Japanese interface swaps another edition for its own.
    expect(pristineGuideFollowsViewer(en, DEFAULT_MARKDOWN_JA, 'en')).toBe(true);
    expect(pristineGuideFollowsViewer(ja, DEFAULT_MARKDOWN_JA, 'en')).toBe(false);
    // An edited Japanese guide is the reader's.
    const edited = { ...ja, chapters: ja.chapters.map((c, i) => (i === 4 ? { ...c, markdown: `${c.markdown}\n\n一文を足した。` } : c)) };
    expect(isPristineJapaneseGuide(edited)).toBe(false);
    expect(isPristineBook(edited, GUIDE_SAMPLE_DOCUMENTS)).toBe(false);
  });

  it('lets an untouched Brazilian Portuguese guide follow the interface, like the Latin editions', () => {
    const pt = sampleBook(DEFAULT_MARKDOWN_PT_BR, ids, 'Guide');
    const en = sampleBook(DEFAULT_MARKDOWN_EN, ids, 'Guide');
    // The Portuguese interface swaps another edition for its own…
    expect(pristineGuideFollowsViewer(en, DEFAULT_MARKDOWN_PT_BR, 'en')).toBe(true);
    // …keeps its own…
    expect(pristineGuideFollowsViewer(pt, DEFAULT_MARKDOWN_PT_BR, 'pt-BR')).toBe(false);
    // …and an untouched Portuguese guide follows any other interface.
    expect(pristineGuideFollowsViewer(pt, DEFAULT_MARKDOWN_EN, 'en')).toBe(true);
    expect(pristineGuideFollowsViewer(pt, DEFAULT_MARKDOWN_ES, null)).toBe(true);
  });

  it('drops an edited Chinese guide', () => {
    const book = sampleBook(DEFAULT_MARKDOWN_ZH_HANS, ids, 'Guide');
    const edited = { ...book, chapters: book.chapters.map((c, i) => (i === 3 ? { ...c, markdown: `${c.markdown}\n\n改了一句。` } : c)) };
    expect(isPristineBook(edited, GUIDE_SAMPLE_DOCUMENTS)).toBe(false);
    expect(isPristineChineseGuide(edited)).toBe(false);
  });
});
