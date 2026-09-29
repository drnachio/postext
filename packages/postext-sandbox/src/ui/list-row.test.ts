// Row tags that show a short text (繁, 简) and carry a longer name: a
// plain span may not be named with aria-label, so the name is read from
// hidden text and the short one is left out of the accessibility tree
// (#198).
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RowTag } from './list-row';

describe('RowTag', () => {
  it('names a static tag by hidden text, not by aria-label on a span', () => {
    const html = renderToString(h(RowTag, { label: 'Simplified Chinese', children: h('span', { lang: 'zh-Hans' }, '简') }));
    expect(html).not.toContain('aria-label');
    expect(html).toContain('title="Simplified Chinese"');
    expect(html).toMatch(/<span aria-hidden="true"><span lang="zh-Hans">简<\/span><\/span>/);
    expect(html).toMatch(/<span class="[^"]*sr-only[^"]*">Simplified Chinese<\/span>/);
  });

  it('leaves a tag without a name as its text', () => {
    const html = renderToString(h(RowTag, { children: 'CC BY 4.0' }));
    expect(html).not.toContain('aria-hidden');
    expect(html).not.toContain('sr-only');
    expect(html).toContain('>CC BY 4.0</span>');
  });

  it('names a toggle tag with aria-label, as a button may be', () => {
    const html = renderToString(h(RowTag, { label: 'Load the Simplified Chinese version', onClick: () => {}, children: '简' }));
    expect(html).toContain('<button');
    expect(html).toContain('aria-label="Load the Simplified Chinese version"');
  });
});
