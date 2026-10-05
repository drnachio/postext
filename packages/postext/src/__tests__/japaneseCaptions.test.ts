import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { stripConfigDefaults } from '../defaults';
import { defaultCaptionLabels, resolveCaptionStyleConfig, stripCaptionStyleDefaults } from '../defaults/captionStyle';
import { resolveBodyTextConfig } from '../defaults/bodyText';
import { defaultResourceTypes } from '../defaults/resourceTypes';
import { resolveAllConfig } from '../pipeline/config';
import type { PostextConfig, Resource } from '../types';
import type { VDTDocument } from '../vdt';
import { installSizedStub } from './vertical/stub';

// #464: a Japanese caption reads 図1-1　キャプション (the label and the
// number solid, an ideographic space before the text, no stop) unless the
// config says otherwise; a :ref and a continued table caption agree with it.
installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
const page = { width: pt(400), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } };
const figure: Resource = {
  id: 'map', typeId: 'figure', kind: 'bitmap', caption: '東京の地図', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'm.png', format: 'png', width: 400, height: 300 },
};
const md = '# 東京\n\n:ref{id="map"}を見よ。\n\n::resource{id="map"}';
const build = (locale: string, extra: PostextConfig = {}) => buildDocument({ markdown: md, resources: [figure] }, { locale, page, ...extra });
const captionText = (doc: VDTDocument) => {
  const all = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])];
  return (all.find((b) => b.type === 'resource')!.resourceBlock?.captionLines ?? []).map((l) => l.text).join('');
};
const refText = (doc: VDTDocument) => doc.blocks.find((b) => b.type === 'paragraph')!.lines.map((l) => l.text).join('');

describe('Japanese caption labels (#464)', () => {
  it('sets 図1-1　 by default in a Japanese document, and a :ref reads 図1-1', () => {
    for (const locale of ['ja', 'ja-JP']) {
      const doc = build(locale);
      expect(captionText(doc), locale).toBe('図1-1　東京の地図');
      expect(refText(doc), locale).toBe('図1-1を見よ。');
    }
  });

  it('keeps what the config writes', () => {
    const doc = build('ja', { captionStyle: { labelNumberGap: ' ', labelSeparator: '. ' } });
    expect(captionText(doc)).toBe('図 1-1. 東京の地図');
    expect(refText(doc)).toBe('図 1-1を見よ。');
    expect(captionText(build('ja', { captionStyle: { labelSeparator: '：' } }))).toBe('図1-1：東京の地図');
    // A type's own caption style still wins.
    const typed = build('ja', { resourceTypes: defaultResourceTypes('ja').map((t) => (t.id === 'figure' ? { ...t, captionStyle: { labelNumberGap: ' ' } } : t)) });
    expect(captionText(typed)).toBe('図 1-1　東京の地図');
  });

  it('leaves Chinese and Latin documents as they were', () => {
    expect(captionText(build('zh-Hans'))).toBe('图 1-1. 東京の地図');
    expect(captionText(build('en'))).toBe('Figure 1.1. 東京の地図');
    expect(resolveAllConfig({ locale: 'zh-Hant' }).captionStyle).toEqual(resolveAllConfig({}).captionStyle);
  });

  it('a continued table caption takes （続き） solid after the text', () => {
    const cell = (content: string) => ({ content });
    const table: Resource = {
      id: 'tab', typeId: 'table', kind: 'table', caption: '東京の区', createdAt: 0, updatedAt: 0,
      table: { model: { headerRowCount: 1, rows: [[cell('区'), cell('人口')], ...Array.from({ length: 60 }, (_, i) => [cell(`区${i + 1}`), cell('多い')])] } },
      placement: { span: 'page' },
    };
    const doc = buildDocument({ markdown: '# 東京\n\n:ref{id="tab"}を見よ。', resources: [table] }, {
      locale: 'ja', page: { ...page, height: pt(400) }, headings: { balancing: { enabled: false } },
    });
    const captions = doc.pages.flatMap((p) => p.floats ?? []).map((b) => b.resourceBlock!.captionLines.map((l) => l.text).join(''));
    expect(captions.length).toBeGreaterThan(1);
    expect(captions[0]).toBe('表1-1　東京の区');
    expect(captions[1]).toBe('表1-1　東京の区（続き）');
  });

  it('resolves and strips against the document language', () => {
    const body = resolveBodyTextConfig(undefined);
    expect(defaultCaptionLabels('ja')).toEqual({ labelNumberGap: '', labelSeparator: '　' });
    expect(defaultCaptionLabels('zh-Hans')).toEqual({ labelNumberGap: ' ', labelSeparator: '. ' });
    expect(defaultCaptionLabels()).toEqual(defaultCaptionLabels('en'));
    expect(resolveCaptionStyleConfig(undefined, body, 'ja')).toMatchObject({ labelNumberGap: '', labelSeparator: '　' });
    expect(resolveCaptionStyleConfig(undefined, body)).toMatchObject({ labelNumberGap: ' ', labelSeparator: '. ' });
    // The Japanese values are defaults in a Japanese document only; the
    // Latin ones are kept there.
    expect(stripCaptionStyleDefaults({ labelNumberGap: '', labelSeparator: '　' }, 'ja')).toBeUndefined();
    expect(stripCaptionStyleDefaults({ labelNumberGap: ' ', labelSeparator: '. ' }, 'ja')).toEqual({ labelNumberGap: ' ', labelSeparator: '. ' });
    expect(stripCaptionStyleDefaults({ labelNumberGap: '', labelSeparator: '　' }, 'zh-Hans')).toEqual({ labelNumberGap: '', labelSeparator: '　' });
    expect(stripConfigDefaults({ locale: 'ja', captionStyle: { labelNumberGap: '', labelSeparator: '　' } })?.captionStyle).toBeUndefined();
    expect(stripConfigDefaults({ locale: 'ja', captionStyle: { labelSeparator: '. ' } })?.captionStyle).toEqual({ labelSeparator: '. ' });
  });
});
