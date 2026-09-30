import { describe, it, expect } from 'vitest';
import { buildDocument, renderToHtml } from '../../index';
import type { PostextConfig, Dimension } from '../../types';
import { installSizedStub } from './stub';

installSizedStub();

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const HLM = '此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去，而借「通靈」之說，撰此《石頭記》一書也。';

describe('HTML output of a vertical, right-bound book', () => {
  const config: PostextConfig = {
    page: { width: pt(300), height: pt(420) },
    layout: { writingMode: 'vertical-rl' },
    locale: 'zh-Hant',
  };

  it('renders every page without failing and lays the row out right to left', () => {
    const doc = buildDocument({ markdown: `# 第一回\n\n${Array.from({ length: 12 }, () => HLM).join('\n\n')}` }, config);
    expect(doc.pages.length).toBeGreaterThan(1);
    const html = renderToHtml(doc, { mode: 'multi' });
    expect(html).toContain('flex-direction:row-reverse');
    expect(html).toContain('此開卷');
  });

  it('keeps a left-bound row left to right', () => {
    const doc = buildDocument({ markdown: HLM }, { ...config, layout: {} });
    expect(renderToHtml(doc, { mode: 'multi' })).toContain('flex-direction:row;');
  });
});
