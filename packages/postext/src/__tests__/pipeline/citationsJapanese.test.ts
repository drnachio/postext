import { describe, it, expect, afterEach } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { renderToHtml } from '../../html-backend';
import { citationLocale } from '../../pipeline/citations';
import { resolveAllConfig } from '../../pipeline/config';
import { registerCitationEngine } from '../../citations/registry';
import { parseBibtex } from '../../citations/bibtex';
import { normalizeCslItem } from '../../citations/data';
import type { CitationEngine, CitationProcessor } from '../../citations/types';
import type { PostextConfig } from '../../index';

// Japanese citations (#426): the ja-JP locale, the narrative names a
// numbered marker or a note writes in the sentence, and family-first CJK
// names.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: [...s].length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

/** A numbered or a note style whose processor carries the given locale
 *  terms (as postext-citeproc's does), recording the locale it was asked
 *  for. */
const stub = (kind: 'in-text' | 'note', terms: CitationProcessor['terms'], seen: string[] = []): CitationEngine => ({
  styles: () => [],
  createProcessor: ({ locale }) => {
    seen.push(locale);
    const order = new Map<string, number>();
    return {
      kind,
      numeric: kind === 'in-text',
      ...(terms ? { terms } : {}),
      cite: (clusters) => clusters.map((c) => {
        for (const it of c.items) if (!order.has(it.id)) order.set(it.id, order.size + 1);
        return kind === 'note' ? 'Note.' : `[${c.items.map((it) => order.get(it.id)).join(', ')}]`;
      }),
      bibliography: () => ({ entries: [], hangingIndent: false, labelColumn: true, entrySpacing: 0 }),
      citationNumbers: () => order,
    };
  },
});

const JA_TERMS = { and: 'と', etAl: 'ほか' };

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (locale: string): PostextConfig => ({
  locale,
  page: { width: pt(400), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  citations: { marker: 'brackets', bibliography: { auto: false } },
});
const front = [
  '---',
  'references:',
  '  - {id: natsume, title: こころ, author: [{family: 夏目, given: 漱石}]}',
  '  - {id: yamada, title: 縦組み, author: [{family: 山田, given: 太郎}, {family: 佐藤, given: 花子}]}',
  '  - {id: suzuki, title: 活字, author: [{family: 鈴木, given: 一郎}, {family: 田中, given: 次郎}, {family: 高橋, given: 三郎}]}',
  '  - {id: zhang, title: 排版学, author: [张三, 李四, 王五]}',
  '---',
  '',
].join('\n');
const text = (markdown: string, locale: string): string =>
  renderToHtml(buildDocument({ markdown: front + markdown }, config(locale))).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');

describe('citation locale', () => {
  it('maps every Japanese tag to ja-JP', () => {
    const resolved = resolveAllConfig({ locale: 'ja' });
    expect(['ja', 'ja-JP', 'ja_JP', 'ja-Jpan', 'JA'].map((t) => citationLocale(resolved, t))).toEqual(['ja-JP', 'ja-JP', 'ja-JP', 'ja-JP', 'ja-JP']);
    expect(citationLocale(resolveAllConfig({ locale: 'ja', citations: { locale: 'en-US' } }), 'ja')).toBe('en-US');
    expect(citationLocale(resolved, 'zh')).toBe('zh-CN');
  });
});

describe('narrative names in Japanese', () => {
  afterEach(() => registerCitationEngine(undefined));

  it('take the locale terms in a numbered marker the engine writes', () => {
    const seen: string[] = [];
    registerCitationEngine(stub('in-text', JA_TERMS, seen));
    const out = text('@natsume によれば、@yamada と @suzuki も同じ。', 'ja');
    expect(seen[0]).toBe('ja-JP');
    expect(out).toContain('夏目 [1]');
    expect(out).toContain('山田と佐藤 [2]');
    expect(out).toContain('鈴木ほか [3]');
    expect(out).not.toMatch(/[等、]\s?\[/);
  });

  it('take them in the sentence of a note citation', () => {
    registerCitationEngine(stub('note', JA_TERMS));
    expect(text('@suzuki によれば同じ。', 'ja')).toContain('鈴木ほか');
  });

  it('keep 、 and 等 in Chinese, and without locale terms', () => {
    registerCitationEngine(stub('in-text', { and: '和', etAl: '等' }));
    const zh = text('@yamada 与 @zhang', 'zh');
    expect(zh).toContain('山田、佐藤 [1]');
    expect(zh).toContain('张三等 [2]');
    // (Other clusters than the tests above: the processed citations are
    // memoised by their content, not by the engine.)
    registerCitationEngine(stub('in-text', undefined));
    expect(text('@zhang と @suzuki', 'ja')).toContain('鈴木等 [2]');
  });
});

describe('CJK names with a space', () => {
  it('read family first in BibTeX and in YAML strings', () => {
    const [item] = parseBibtex('@book{k, author = {夏目 漱石 and 김 철수 and Ana García and 张三}, title = {こころ}}');
    expect(item!.author).toEqual([
      { family: '夏目', given: '漱石' }, { family: '김', given: '철수' }, { family: 'García', given: 'Ana' }, { family: '张三' },
    ]);
    expect(normalizeCslItem({ id: 'a', author: ['夏目 漱石', 'Ana García', '张三', 'García, Ana'] })!.author).toEqual([
      { family: '夏目', given: '漱石' }, { family: 'García', given: 'Ana' }, { family: '张三' }, { family: 'García', given: 'Ana' },
    ]);
  });
});
