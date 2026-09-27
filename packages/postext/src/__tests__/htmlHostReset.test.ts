import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { HTML_TEXT_RESET, renderToHtml, renderToHtmlIndexed } from '../html-backend';
import * as postext from '../index';

// EF-96: the HTML output sets every line at the widths the engine measured,
// so it must not inherit the host page's text properties (letter-spacing,
// word-spacing, text-transform…): the `.pt-doc` root resets them.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

/** The inline style of the `.pt-doc` root, as declarations. */
const rootDecls = (html: string): Map<string, string> => {
  const m = /^<div class="pt-doc"[^>]*style="([^"]*)"/.exec(html);
  if (!m) throw new Error('no .pt-doc root');
  return new Map(m[1]!.split(';').filter(Boolean).map((d) => {
    const i = d.indexOf(':');
    return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as [string, string];
  }));
};

describe('EF-96: renderToHtml resets the inherited text properties on its root', () => {
  const doc = buildDocument({ markdown: '# Title\n\nSome words set at measured widths.' });

  it('resets the properties that change glyph advances or line breaking', () => {
    const decls = rootDecls(renderToHtml(doc));
    expect(decls.get('letter-spacing')).toBe('normal');
    expect(decls.get('word-spacing')).toBe('normal');
    expect(decls.get('text-transform')).toBe('none');
    expect(decls.get('text-indent')).toBe('0');
    expect(decls.get('white-space')).toBe('normal');
    expect(decls.get('font-style')).toBe('normal');
    expect(decls.get('font-variant')).toBe('normal');
    expect(decls.get('font-feature-settings')).toBe('normal');
    expect(decls.get('font-variation-settings')).toBe('normal');
    expect(decls.get('font-kerning')).toBe('auto');
    expect(decls.get('line-height')).toBe('normal');
    expect(decls.get('text-rendering')).toBe('auto');
    expect(decls.get('direction')).toBe('ltr');
    expect(decls.get('-webkit-text-size-adjust')).toBe('100%');
  });

  it('keeps the layout declarations after the reset, in both modes', () => {
    for (const mode of ['multi', 'single'] as const) {
      const decls = rootDecls(renderToHtml(doc, { mode }));
      expect(decls.get('display')).toBe('flex');
      expect(decls.get('box-sizing')).toBe('border-box');
    }
  });

  it('exports the reset for hosts that mount the pages in their own root', () => {
    expect(postext.HTML_TEXT_RESET).toBe(HTML_TEXT_RESET);
    expect(renderToHtmlIndexed(doc).html).toContain(HTML_TEXT_RESET);
    expect(HTML_TEXT_RESET.endsWith(';')).toBe(true);
    // A declaration list only: no selector, no braces, no quotes to escape.
    expect(/[{}"<>]/.test(HTML_TEXT_RESET)).toBe(false);
  });
});
