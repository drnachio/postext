// The editor toolbar offers ruby and tate-chū-yoko for a Chinese or
// Japanese book only.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SandboxStoreContext } from '../context/SandboxContext';
import { DEFAULT_LABELS } from '../types/defaultLabels';
import { EditorToolbar, rubyWrap } from './EditorToolbar';

function render(lang: string | undefined): string {
  const state = { config: {}, resources: [], labels: DEFAULT_LABELS, locale: 'en' };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  return renderToString(h(SandboxStoreContext, { value: store as never }, h(EditorToolbar, { viewRef: { current: null }, lang })));
}

describe('EditorToolbar', () => {
  it('adds the ruby and tate-chū-yoko buttons for Japanese and Chinese books', () => {
    for (const lang of ['ja', 'ja-JP', 'zh-Hant']) {
      const html = render(lang);
      expect(html, lang).toContain('(:ruby[…])');
      expect(html, lang).toContain('(:tcy[…])');
    }
    for (const lang of ['en', 'ar', undefined]) {
      const html = render(lang);
      expect(html).not.toContain('(:ruby[…])');
      expect(html).not.toContain('(:tcy[…])');
    }
  });

  it('wraps a selection as a ruby base with the caret on the reading', () => {
    expect(rubyWrap('漢字', 10)).toEqual({ insert: ':ruby[漢字]{rt=""}', caret: 10 + ':ruby[漢字]{rt="'.length });
    expect(rubyWrap('', 0)).toEqual({ insert: ':ruby[]{rt=""}', caret: ':ruby['.length });
  });
});
