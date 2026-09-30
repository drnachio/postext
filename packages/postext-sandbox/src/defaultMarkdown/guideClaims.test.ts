// What the three editions of the guide say about the book and the Sandbox,
// held to the code that makes it true: each edition's body size and
// leading, the groups of the Design panel, the regions whose punctuation
// keeps a full square, what the Chinese edition itself sets, and the length
// of a vertical book's lines in the HTML view.

import { describe, expect, it } from 'vitest';
import { buildDocument, resolveCjkConfig, type CjkRegion, type PostextConfig } from 'postext';
import { DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES, DEFAULT_MARKDOWN_ZH_HANS } from '.';
import { createPostextGuideConfig } from '../context/guideConfig';
import { SETTINGS_GROUPS, type SettingsGroupId } from '../sidebar/sections/registry';
import { DEFAULT_LABELS } from '../types/defaultLabels';
import { buildHtmlConfigOverride } from '../viewport/HtmlPreview/configOverride';

const spanish = (await import(/* @vite-ignore */ new URL('../../../../apps/web/messages/es.json', import.meta.url).href)) as {
  default: { Sandbox: Record<string, string> };
};

type Edition = 'en' | 'es' | 'zh-Hans';
const EDITIONS: Record<Edition, string> = { en: DEFAULT_MARKDOWN_EN, es: DEFAULT_MARKDOWN_ES, 'zh-Hans': DEFAULT_MARKDOWN_ZH_HANS };

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
      'zh-Hans': /本书用(\d+(?:\.\d+)?) ?pt的字号配(\d+(?:\.\d+)?) ?pt的行距/,
    };
    for (const edition of Object.keys(stated) as Edition[]) {
      const [, size, leading] = claim(edition, stated[edition]);
      const body = createPostextGuideConfig(edition).bodyText!;
      expect(body.fontSize, edition).toEqual({ value: Number(size!.replace(',', '.')), unit: 'pt' });
      expect(body.lineHeight, edition).toEqual({ value: Number(leading!.replace(',', '.')), unit: 'pt' });
    }
  });

  it('names every group of the Design panel, in its order', () => {
    // The Chinese edition names the groups in Chinese; the Sandbox has no
    // Chinese labels to read them from.
    const zh: Record<SettingsGroupId, string> = {
      page: '页面与分栏', writing: '书写系统', colors: '颜色', text: '文字排版', headings: '标题与目录', lists: '列表',
      figures: '图与表', callouts: '标注框', running: '页眉页脚', parts: '篇', output: '导出', advanced: '高级',
    };
    expect(Object.keys(zh)).toEqual(SETTINGS_GROUPS.map((g) => g.id));
    const names: Record<Edition, string[]> = {
      en: SETTINGS_GROUPS.map((g) => (DEFAULT_LABELS[g.labelKey] as string).replace(/&/g, 'and').toLowerCase()),
      es: SETTINGS_GROUPS.map((g) => spanish.default.Sandbox[g.labelKey]!.toLowerCase()),
      'zh-Hans': SETTINGS_GROUPS.map((g) => zh[g.id]),
    };
    const lists: Record<Edition, RegExp> = {
      en: /The \*\*Design\*\* panel edits[^:]*: ([^.]*)\./,
      es: /El panel \*\*Diseño\*\* edita[^:]*: ([^.]*)\./,
      'zh-Hans': /\*\*Design\*\*面板用来编辑[^：]*：([^。]*)。/,
    };
    for (const edition of Object.keys(lists) as Edition[]) {
      const list = claim(edition, lists[edition])[1]!;
      let from = 0;
      for (const name of names[edition]) {
        const at = list.indexOf(name, from);
        expect(at, `${edition}: “${name}” after “${list.slice(0, from)}”`).toBeGreaterThanOrEqual(0);
        from = at + name.length;
      }
    }
  });

  it('says a mark keeps a full square only where the region’s defaults keep it', () => {
    const TAGS: Record<CjkRegion, string> = { mainland: 'zh-Hans', taiwan: 'zh-Hant-TW', hongkong: 'zh-Hant-HK' };
    const fullSquare = (region: CjkRegion): boolean => {
      const cjk = resolveCjkConfig(undefined, TAGS[region]);
      expect(cjk.region).toBe(region);
      return cjk.punctuationWidth === 'fullwidth' && !cjk.compressAdjacent && !cjk.trimLineStart;
    };
    const regions: Record<Edition, Record<CjkRegion, string>> = {
      en: { mainland: 'mainland', taiwan: 'Taiwan', hongkong: 'Hong Kong' },
      es: { mainland: 'China continental', taiwan: 'Taiwán', hongkong: 'Hong Kong' },
      'zh-Hans': { mainland: '大陆', taiwan: '台湾', hongkong: '香港' },
    };
    // The sentence that says so, up to the mark that ends it.
    const sentences: Record<Edition, RegExp> = {
      en: /([^.]*)\bevery mark a full square\b/,
      es: /([^.]*)cada signo ocupa un cuadratín entero/,
      'zh-Hans': /([^。]*)的标点一律占一个字/,
    };
    for (const edition of Object.keys(sentences) as Edition[]) {
      const subject = claim(edition, sentences[edition])[1]!;
      for (const region of Object.keys(TAGS) as CjkRegion[]) {
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
      ['grid', /\bgrid\b|retícula/],
      ['pageNumbers', /page numbers|folios/],
      ['chapters', /\bchapters\b|capítulos/],
      ['figures', /\bfigures\b|figuras/],
    ];
    const sentences: Partial<Record<Edition, RegExp>> = {
      en: /The Chinese edition of this guide ([^.]*)\./,
      es: /La edición china de esta guía ([^.]*)\./,
    };
    for (const edition of Object.keys(sentences) as Edition[]) {
      const said = claim(edition, sentences[edition]!)[1]!;
      // “All of it”: everything the paragraph lists.
      if (/\ball of it\b|lo usa todo/.test(said)) expect(Object.values(uses).every(Boolean), `${edition}: “${said}”`).toBe(true);
      for (const [feature, words] of features) {
        if (words.test(said)) expect(uses[feature], `${edition}: ${feature} in “${said}”`).toBe(true);
      }
    }
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
      'zh-Hans': [new RegExp(`${vertical}HTML视图([^；。，]*)`), /高度/, /宽度/],
    };
    for (const edition of Object.keys(clauses) as Edition[]) {
      const [sentence, height, width] = clauses[edition];
      const said = claim(edition, sentence)[1]!;
      expect(said, edition).toMatch(height);
      expect(said, edition).not.toMatch(width);
    }
  });
});
