// What the six editions of the guide say about the book and the Sandbox,
// held to the code that makes it true: each edition's body size and
// leading, the groups of the Design panel, the viewer's tabs, the regions
// whose punctuation keeps a full square, what the Chinese edition itself
// sets, what the Japanese edition says of its own design, and the length of
// a vertical book's lines in the HTML view.

import { describe, expect, it } from 'vitest';
import { buildDocument, resolveCjkConfig, type CjkRegion, type PostextConfig } from 'postext';
import { DEFAULT_MARKDOWN_AR, DEFAULT_MARKDOWN_CA, DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES, DEFAULT_MARKDOWN_JA, DEFAULT_MARKDOWN_ZH_HANS } from '.';
import { createPostextGuideConfig } from '../context/guideConfig';
import { GUIDE_FOLIO } from '../context/guideKit';
import { SETTINGS_GROUPS, type SettingsGroupId } from '../sidebar/sections/registry';
import { DEFAULT_LABELS } from '../types/defaultLabels';
import { VIEWPORT_TABS } from '../storage/viewHash';
import { buildHtmlConfigOverride } from '../viewport/HtmlPreview/configOverride';

const spanish = (await import(/* @vite-ignore */ new URL('../../../../apps/web/messages/es.json', import.meta.url).href)) as {
  default: { Sandbox: Record<string, string> };
};
const catalan = (await import(/* @vite-ignore */ new URL('../../../../apps/web/messages/ca.json', import.meta.url).href)) as {
  default: { Sandbox: Record<string, string> };
};
const chinese = (await import(/* @vite-ignore */ new URL('../../../../apps/web/messages/zh.json', import.meta.url).href)) as {
  default: { Sandbox: Record<string, string> };
};
const arabic = (await import(/* @vite-ignore */ new URL('../../../../apps/web/messages/ar.json', import.meta.url).href)) as {
  default: { Sandbox: Record<string, string> };
};

type Edition = 'en' | 'es' | 'ca' | 'zh-Hans' | 'ar' | 'ja';
const EDITIONS: Record<Edition, string> = {
  en: DEFAULT_MARKDOWN_EN, es: DEFAULT_MARKDOWN_ES, ca: DEFAULT_MARKDOWN_CA, 'zh-Hans': DEFAULT_MARKDOWN_ZH_HANS, ar: DEFAULT_MARKDOWN_AR,
  ja: DEFAULT_MARKDOWN_JA,
};

const KANJI_DIGITS = '〇一二三四五六七八九';
/** A number in kanji as the vertical Japanese edition writes it: counted
 *  (十六, 百七十) or positional (一七〇), with ・ for the decimal point
 *  (九・二五). */
function kanjiNumber(written: string): number {
  const [whole, fraction] = written.split('・');
  let n = 0;
  if (/[十百千]/.test(whole!)) {
    let digit = 0;
    for (const ch of whole!) {
      const d = KANJI_DIGITS.indexOf(ch);
      if (d >= 0) { digit = d; continue; }
      n += (digit || 1) * ({ 十: 10, 百: 100, 千: 1000 } as Record<string, number>)[ch]!;
      digit = 0;
    }
    n += digit;
  } else {
    for (const ch of whole!) n = n * 10 + KANJI_DIGITS.indexOf(ch);
  }
  return fraction ? Number(`${n}.${[...fraction].map((c) => KANJI_DIGITS.indexOf(c)).join('')}`) : n;
}

/** A number as an edition writes it — Arabic-Indic digits and the Arabic
 *  decimal separator ٫ in the Arabic one, a decimal comma in the Spanish and
 *  Catalan ones, kanji in the Japanese one — as a JavaScript number. */
const numberOf = (written: string | undefined): number =>
  /^[〇一二三四五六七八九十百千・]+$/.test(written ?? '')
    ? kanjiNumber(written!)
    : Number((written ?? '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[,٫]/, '.'));
/** A number in any of those forms, for the regular expressions below. */
const N = '[\\d٠-٩]+(?:[.,٫][\\d٠-٩]+)?';

/** The first match of `re` in the edition, or a failure naming what is missing. */
function claim(edition: Edition, re: RegExp): RegExpMatchArray {
  const m = EDITIONS[edition].match(re);
  expect(m, `${edition}: ${re}`).not.toBeNull();
  return m!;
}

// Every glyph one em of the size in the font string: enough to see where
// the engine breaks a line of Chinese.
class StubContext {
  font = '16px serif';
  letterSpacing = '0px';
  measureText(text: string) {
    const em = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 16);
    return { width: [...text].length * em, actualBoundingBoxAscent: em * 0.88, actualBoundingBoxDescent: em * 0.12, fontBoundingBoxAscent: em * 0.88, fontBoundingBoxDescent: em * 0.12 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubContext {
    return new StubContext();
  }
};

describe('what the guide says about itself and the Sandbox', () => {
  it('gives each edition’s own body size and leading', () => {
    const stated: Record<Edition, RegExp> = {
      en: /this book uses (\d+(?:\.\d+)?) points on (\d+(?:\.\d+)?)/,
      es: /este libro usa (\d+(?:,\d+)?) puntos sobre (\d+(?:,\d+)?)/,
      ca: /aquest llibre fa servir (\d+(?:,\d+)?) punts sobre (\d+(?:,\d+)?)/,
      'zh-Hans': /本书用(\d+(?:\.\d+)?) ?pt的字号配(\d+(?:\.\d+)?) ?pt的行距/,
      ar: new RegExp(`(?:يستخدم|يستعمل) هذا الكتاب (${N}) نقطة على (${N})`),
      ja: /本書は([〇一二三四五六七八九十・]+)ポイントの文字を([〇一二三四五六七八九十・]+)ポイントの行送りで組/,
    };
    for (const edition of Object.keys(stated) as Edition[]) {
      const [, size, leading] = claim(edition, stated[edition]);
      const body = createPostextGuideConfig(edition).bodyText!;
      expect(body.fontSize, edition).toEqual({ value: numberOf(size), unit: 'pt' });
      expect(body.lineHeight, edition).toEqual({ value: numberOf(leading), unit: 'pt' });
    }
  });

  it('names every group of the Design panel, in its order', () => {
    // The Chinese edition names the groups in Chinese; the Sandbox has no
    // Chinese labels to read them from.
    const zh: Record<SettingsGroupId, string> = {
      page: '页面与分栏', writing: '书写系统', colors: '颜色', text: '文字排版', headings: '标题与目录', lists: '列表',
      figures: '图与表', callouts: '标注框', running: '页眉页脚', parts: '篇', output: '导出', folio: 'folio', advanced: '高级',
    };
    expect(Object.keys(zh)).toEqual(SETTINGS_GROUPS.map((g) => g.id));
    // Nor are there Japanese labels: the Japanese edition names the groups
    // in its own words.
    const ja: Record<SettingsGroupId, string> = {
      page: 'ページと段組', writing: '表記体系', colors: '色', text: '文字組み', headings: '見出しと目次', lists: 'リスト',
      figures: '図と表', callouts: '囲み', running: '柱とノンブル', parts: '部', output: '書き出し', folio: 'folio', advanced: '詳細設定',
    };
    expect(Object.keys(ja)).toEqual(SETTINGS_GROUPS.map((g) => g.id));
    const names: Record<Edition, string[]> = {
      en: SETTINGS_GROUPS.map((g) => (DEFAULT_LABELS[g.labelKey] as string).replace(/&/g, 'and').toLowerCase()),
      es: SETTINGS_GROUPS.map((g) => spanish.default.Sandbox[g.labelKey]!.toLowerCase()),
      ca: SETTINGS_GROUPS.map((g) => catalan.default.Sandbox[g.labelKey]!.toLowerCase()),
      'zh-Hans': SETTINGS_GROUPS.map((g) => zh[g.id]),
      ar: SETTINGS_GROUPS.map((g) => arabic.default.Sandbox[g.labelKey]!.toLowerCase()),
      ja: SETTINGS_GROUPS.map((g) => ja[g.id]),
    };
    const lists: Record<Edition, RegExp> = {
      en: /The \*\*Design\*\* panel edits[^:]*: ([^.]*)\./,
      es: /El panel \*\*Diseño\*\* edita[^:]*: ([^.]*)\./,
      ca: /El tauler \*\*Disseny\*\* edita[^:]*: ([^.]*)\./,
      'zh-Hans': /\*\*Design\*\*面板用来编辑[^：]*：([^。]*)。/,
      ar: /تحرّر لوحة \*\*التصميم\*\*[^:]*: ([^.]*)\./,
      ja: /\*\*Design\*\*パネルは[^：]*：([^。]*)。/,
    };
    for (const edition of Object.keys(lists) as Edition[]) {
      const list = claim(edition, lists[edition])[1]!.toLowerCase();
      let from = 0;
      for (const name of names[edition]) {
        const at = list.indexOf(name, from);
        expect(at, `${edition}: “${name}” after “${list.slice(0, from)}”`).toBeGreaterThanOrEqual(0);
        from = at + name.length;
      }
    }
  });

  it('names the viewer’s tabs, how many and in the order the tab bar shows them', () => {
    const labels: Record<Edition, Record<string, string>> = {
      en: DEFAULT_LABELS as unknown as Record<string, string>,
      es: spanish.default.Sandbox,
      ca: catalan.default.Sandbox,
      'zh-Hans': chinese.default.Sandbox,
      ar: arabic.default.Sandbox,
      // The Sandbox speaks no Japanese: the edition names the tabs as the
      // English interface shows them.
      ja: { canvas: 'Canvas', pdf: 'PDF', folio: 'Folio', html: 'HTML', epub: 'EPUB 3' },
    };
    const COUNT: Record<Edition, string[]> = {
      en: ['four', 'five', 'six'],
      es: ['cuatro', 'cinco', 'seis'],
      ca: ['quatre', 'cinc', 'sis'],
      'zh-Hans': ['四', '五', '六'],
      ar: ['أربعة', 'خمسة', 'ستة'],
      ja: ['四', '五', '六'],
    };
    const said: Record<Edition, [RegExp, RegExp, RegExp]> = {
      en: [/shows the same layout in (\w+) tabs: ([^.]*)\./, /, | and /, /^## The (\w+) views$/m],
      es: [/muestra la misma maquetación en (\w+) pestañas: ([^.]*)\./, /, | y /, /^## Las (\w+) vistas$/m],
      ca: [/mostra la mateixa maquetació en (\w+) pestanyes: ([^.]*)\./, /, | i /, /^## Les (\w+) vistes$/m],
      'zh-Hans': [/用(.)个标签页显示同一个版面：([^。]*)。/, /、|和/, /^## (.)种视图$/m],
      ar: [/تعرض الإخراج نفسه في (\S+) تبويبات: ([^.]*)\./, / و/, /^## العروض ال(\S+)$/m],
      ja: [/同じ版面を(.)つのタブで表示する：([^。]*)。/, /、/, /^## (.)つのビュー$/m],
    };
    const count = (edition: Edition, word: string) => COUNT[edition].indexOf(word) + 4;
    for (const edition of Object.keys(said) as Edition[]) {
      const [sentence, separator, heading] = said[edition];
      const [, n, list] = claim(edition, sentence);
      expect(list!.split(separator), edition).toEqual(VIEWPORT_TABS.map((tab) => labels[edition][tab]));
      expect(count(edition, n!), edition).toBe(VIEWPORT_TABS.length);
      expect(count(edition, claim(edition, heading)[1]!), edition).toBe(VIEWPORT_TABS.length);
    }
  });

  it('says a mark keeps a full square only where the region’s defaults keep it', () => {
    // The guide's sentence is about the Chinese regions.
    type ChineseRegion = Exclude<CjkRegion, 'japan'>;
    const TAGS: Record<ChineseRegion, string> = { mainland: 'zh-Hans', taiwan: 'zh-Hant-TW', hongkong: 'zh-Hant-HK' };
    const fullSquare = (region: ChineseRegion): boolean => {
      const cjk = resolveCjkConfig(undefined, TAGS[region]);
      expect(cjk.region).toBe(region);
      return cjk.punctuationWidth === 'fullwidth' && !cjk.compressAdjacent && !cjk.trimLineStart;
    };
    const regions: Record<Edition, Record<ChineseRegion, string>> = {
      en: { mainland: 'mainland', taiwan: 'Taiwan', hongkong: 'Hong Kong' },
      es: { mainland: 'China continental', taiwan: 'Taiwán', hongkong: 'Hong Kong' },
      ca: { mainland: 'Xina continental', taiwan: 'Taiwan', hongkong: 'Hong Kong' },
      'zh-Hans': { mainland: '大陆', taiwan: '台湾', hongkong: '香港' },
      ar: { mainland: 'البر الصيني', taiwan: 'تايوان', hongkong: 'هونغ كونغ' },
      ja: { mainland: '中国大陸', taiwan: '台湾', hongkong: '香港' },
    };
    // The sentence that says so, up to the mark that ends it.
    const sentences: Record<Edition, RegExp> = {
      en: /([^.]*)\bevery mark a full square\b/,
      es: /([^.]*)cada signo ocupa un cuadratín entero/,
      ca: /([^.]*)cada signe ocupa un quadratí sencer/,
      'zh-Hans': /([^。]*)的标点一律占一个字/,
      ar: /([^.]*)كل علامة (?:في )?مربع(?:ًا)? كامل/,
      ja: /([^。]*)ではすべての約物を全角で組/,
    };
    for (const edition of Object.keys(sentences) as Edition[]) {
      const subject = claim(edition, sentences[edition])[1]!;
      for (const region of Object.keys(TAGS) as ChineseRegion[]) {
        expect(subject.includes(regions[edition][region]), `${edition}: ${region} in “${subject}”`).toBe(fullSquare(region));
      }
    }
  });

  it('claims for the Chinese edition only what its configuration sets', () => {
    const config = createPostextGuideConfig('zh-Hans');
    const cjk = resolveCjkConfig(config.cjk, config.locale);
    const chapters = config.headings?.levels?.find((l) => l.level === 1)?.numberingTemplate ?? '';
    const figure = config.resourceTypes?.find((t) => t.id === 'figure');
    const uses = {
      grid: cjk.grid.enabled,
      pageNumbers: /chinese|cjk/.test(config.page?.pageNumbering?.format ?? ''),
      chapters: /\{1:[一二三四五六七八九十]\}/.test(chapters),
      figures: figure?.name === '图' && figure.resetOn === 'h1',
    };
    const features: [keyof typeof uses, RegExp][] = [
      ['grid', /\bgrid\b|retícula|شبكة/],
      ['pageNumbers', /page numbers|folios|folis|أرقام (?:ال)?صفح|ترقيم (?:ال)?صفح/],
      ['chapters', /\bchapters\b|capítulos|capítols|فصول/],
      ['figures', /\bfigures\b|figuras|أشكال/],
    ];
    const sentences: Partial<Record<Edition, RegExp>> = {
      en: /The Chinese edition of this guide ([^.]*)\./,
      es: /La edición china de esta guía ([^.]*)\./,
      ca: /L'edició xinesa d'aquesta guia ([^.]*)\./,
      ar: /(?:الطبعة|النسخة) الصينية من هذا الدليل ([^.]*)\./,
    };
    for (const edition of Object.keys(sentences) as Edition[]) {
      const said = claim(edition, sentences[edition]!)[1]!;
      // “All of it”: everything the paragraph lists.
      if (/\ball of it\b|lo usa todo|ho fa servir tot/.test(said)) expect(Object.values(uses).every(Boolean), `${edition}: “${said}”`).toBe(true);
      for (const [feature, words] of features) {
        if (words.test(said)) expect(uses[feature], `${edition}: ${feature} in “${said}”`).toBe(true);
      }
    }
  });

  it('claims for the Japanese edition only what its configuration sets', () => {
    const config = createPostextGuideConfig('ja');
    const md = DEFAULT_MARKDOWN_JA;
    const pt = (d: { value: number; unit: string } | undefined) => (d?.unit === 'pt' ? d.value : NaN);
    // 一段三十四字: the tier holds that many body characters, the gutter less
    // than one more.
    const chars = kanjiNumber(claim('ja', /一段([〇一二三四五六七八九十]+)字/)[1]!);
    const body = pt(config.bodyText!.fontSize as { value: number; unit: string });
    const tier = (((280 - 24 - 22) - (config.layout!.gutterWidth as { value: number }).value) / 2) * (72 / 25.4);
    expect(Math.floor(tier / body + 1e-6), 'characters down a tier').toBe(chars);
    // 三行取り、三字下げ for the section headings.
    const [, lines, indent] = claim('ja', /節見出しは([一二三四五]+)行取り、([一二三四五]+)字下げ/);
    const h2 = config.headings!.levels!.find((l) => l.level === 2)!;
    expect(h2.lineSpan).toBe(kanjiNumber(lines!));
    expect(h2.indent).toEqual({ value: kanjiNumber(indent!), unit: 'em' });
    // A heading may close the last column of an even page.
    expect(md).toMatch(/偶数ページの最後の段だけは[^。]*見出しで終わってよい/);
    expect(config.headings!.keepWithNextSpread).toBe(true);
    // Running heads: the book on even pages, the chapter on odd ones, and
    // Arabic folios at the foot.
    expect(md).toMatch(/偶数ページには書名を、[^。]*奇数ページには章の番号と章題を[^。]*ノンブルはアラビア数字で/);
    const header = config.header!.elements.filter((e) => e.kind === 'text') as { content: string; parity?: string }[];
    expect(header.find((e) => e.parity === 'even')?.content).toBe('Postext入門');
    expect(header.find((e) => e.parity === 'odd')?.content).toBe('{chapterNumber}　{chapterTitle}');
    expect(config.page?.pageNumbering?.format).toBe('decimal');
    // One-em paragraph indent.
    expect(config.bodyText?.firstLineIndent).toEqual({ value: 1, unit: 'em' });
  });

  it('describes the book in 3D as the Folio settings set it', () => {
    // Paper weight, stock, binding, surface and light, as the chapter on the
    // Folio view states them.
    const said: Record<Edition, [RegExp, RegExp, RegExp, RegExp, RegExp]> = {
      en: [/This guide is set as ([^.]*)\./, /saddle-stitched/, /coated gloss paper of (\d+) grams/, /felt/, /studio light/],
      es: [/Esta guía está montada como ([^.]*)\./, /grapado a caballete/, /estucado brillo de (\d+) gramos/, /fieltro/, /luz de estudio/],
      ca: [/Aquesta guia està muntada com ([^.]*)\./, /grapat a cavall/, /estucat brillant de (\d+) grams/, /feltre/, /llum d'estudi/],
      'zh-Hans': [/本指南设为([^。]*)。/, /骑马钉/, /(\d+)g\/m²的光面铜版纸/, /毛毡/, /摄影棚光照/],
      // The Arabic interface's words (messages/ar.json): تدبيس سرجي, مطلي لامع, لبّاد, استوديو.
      ar: [/([^.\n]*تدبيس سرجي[^.\n]*)\./, /تدبيس سرجي/, /مطلي لامع[^.\d٠-٩]*([\d٠-٩]+) غرام/, /لبّاد|لباد/, /استوديو/],
      ja: [/本ガイドは([^。]*)。/, /中綴じ/, /坪量([〇一二三四五六七八九十百]+)グラムのグロスコート紙/, /フェルト/, /スタジオの照明/],
    };
    for (const edition of Object.keys(said) as Edition[]) {
      const [sentence, binding, paper, surface, light] = said[edition];
      const text = claim(edition, sentence)[1]!;
      expect(text, edition).toMatch(binding);
      expect(GUIDE_FOLIO.binding?.type).toBe('saddleStitch');
      expect(numberOf(text.match(paper)?.[1]), edition).toBe(GUIDE_FOLIO.paper?.grammage);
      expect(GUIDE_FOLIO.paper?.type).toBe('coatedGloss');
      expect(text, edition).toMatch(surface);
      expect(GUIDE_FOLIO.surface?.type).toBe('felt');
      expect(text, edition).toMatch(light);
      expect(GUIDE_FOLIO.lighting?.environment).toBe('studio');
    }
    expect(createPostextGuideConfig('en').folio).toEqual(GUIDE_FOLIO);
  });

  it('gives the HTML view’s vertical lines the length it sets them to', () => {
    // A vertical book in the HTML view, paged: its lines follow the height
    // of the viewer's page and nothing of the screen's width.
    const paragraph = '此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去，而借「通靈」之說，撰此《石頭記》一書也。'.repeat(6);
    const base: PostextConfig = { locale: 'zh-Hant', layout: { layoutType: 'single', writingMode: 'vertical-rl' } };
    const linesAt = (screenWidth: number, screenHeight: number): string[] => {
      const config = buildHtmlConfigOverride(base, {
        fontScale: 1, columnMode: 'multi', pageWidthPx: screenWidth, layoutType: 'single',
        viewportHeightPx: screenHeight, locale: 'en', optimalLineBreaking: false,
      });
      const doc = buildDocument({ markdown: paragraph }, config);
      return doc.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines.map((l) => l.text));
    };
    const lines = linesAt(600, 500);
    expect(lines.length).toBeGreaterThan(2);
    expect(linesAt(1200, 500)).toEqual(lines);
    expect(linesAt(600, 900)[0]!.length).toBeGreaterThan(lines[0]!.length);

    // The clause in the paragraph on vertical books.
    const vertical = "`layout\\.writingMode: 'vertical-rl'`[^\\n]*?";
    const clauses: Record<Edition, [RegExp, RegExp, RegExp]> = {
      en: [new RegExp(`${vertical}the HTML view ([^;.]*)`), /\bheight\b/, /\bwidth\b/],
      es: [new RegExp(`${vertical}la vista HTML ([^;.]*)`), /\baltura\b/, /\bancho\b/],
      ca: [new RegExp(`${vertical}la vista HTML ([^;.]*)`), /alçada/, /amplada/],
      'zh-Hans': [new RegExp(`${vertical}HTML视图([^；。，]*)`), /高度/, /宽度/],
      ar: [new RegExp(`${vertical}(?:عرض|معاينة) HTML ([^؛;.]*)`), /ارتفاع/, /عرض/],
      ja: [new RegExp(`${vertical}HTMLビュー([^、。]*)`), /高さ/, /幅/],
    };
    for (const edition of Object.keys(clauses) as Edition[]) {
      const [sentence, height, width] = clauses[edition];
      const said = claim(edition, sentence)[1]!;
      expect(said, edition).toMatch(height);
      expect(said, edition).not.toMatch(width);
    }
  });
});
