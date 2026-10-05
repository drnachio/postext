// The type sample under Body text: the opening of 吾輩は猫である for a
// Japanese book, its *…* run set with sesame marks over the characters
// (right of them in a vertical line), the Chinese sample unchanged.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resolveBodyTextConfig, type PostextConfig } from 'postext';
import { SandboxStoreContext } from '../../context/SandboxContext';
import { DEFAULT_LABELS } from '../../types/defaultLabels';
import { TypeSample } from './TypeSample';

function render(config: PostextConfig, lang: string): string {
  const state = { config, resources: [], labels: DEFAULT_LABELS, locale: 'en' };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  return renderToString(h(SandboxStoreContext, { value: store as never }, h(TypeSample, { body: resolveBodyTextConfig(config.bodyText, lang), lang })));
}

/** The marks drawn: one absolutely placed box per marked character. */
const marks = (html: string) => html.match(/<span style="position:absolute[^"]*"/g) ?? [];

describe('TypeSample', () => {
  it('sets a Japanese book\'s sample in Japanese, sesame marks over the emphasised kana', () => {
    const html = render({ locale: 'ja' }, 'ja');
    expect(html).toContain('lang="ja"');
    expect(html).toContain('名前はまだ無い');
    expect(html).toContain('ニャーニャー');
    expect(html).toContain('Sōseki');
    const m = marks(html);
    // と ん と: three sesame lenses, hung above the baseline.
    expect(m).toHaveLength(3);
    for (const s of m) {
      expect(s).toContain('border-radius:0 100%');
      expect(s).toContain('top:calc(-0.94em - 0.2em)');
    }
    // The rōmaji title keeps its italics.
    expect(html).toMatch(/<em style="font-style:italic[^"]*">Wagahai wa neko de aru<\/em>/);
  });

  it('puts the marks right of a vertical line, and follows the configured mark', () => {
    const vertical = marks(render({ locale: 'ja', layout: { writingMode: 'vertical-rl' } }, 'ja'));
    expect(vertical).toHaveLength(3);
    expect(vertical[0]).toContain('left:calc(50% + 0.68em)');
    const dots = marks(render({ locale: 'ja', cjk: { emphasisMark: { style: 'dot', position: 'under' } } }, 'ja'));
    expect(dots[0]).toContain('border-radius:50%');
    expect(dots[0]).toContain('top:0.24em');
    const open = marks(render({ locale: 'ja', cjk: { emphasisMark: { fill: 'open' } } }, 'ja'));
    expect(open[0]).toContain('background-color:transparent');
    // Italics asked for: no marks.
    expect(marks(render({ locale: 'ja', cjk: { emphasis: 'italic' } }, 'ja'))).toHaveLength(0);
  });

  it('keeps the Chinese sample with dots under the characters', () => {
    const html = render({ locale: 'zh-Hans' }, 'zh-Hans');
    expect(html).toContain('此开卷第一回也');
    const m = marks(html);
    expect(m).toHaveLength(4);
    expect(m[0]).toContain('border-radius:50%');
    expect(m[0]).toContain('top:0.24em');
    expect(marks(render({}, 'en'))).toHaveLength(0);
  });
});
