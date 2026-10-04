import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { renderToHtml } from '../../html-backend';
import type { PostextConfig } from '../../types';
import type { VDTDocument, VDTLineSegment } from '../../vdt';

// #379: the language an inline isolate names (`:ltr[…]{lang=en}`) rides on
// the segments of its text (`VDTLineSegment.lang`), for HTML `lang` and PDF
// `/Lang`.

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (direction: 'ltr' | 'rtl'): PostextConfig => ({
  direction,
  locale: direction === 'rtl' ? 'ar' : 'en',
  page: { dpi: 72, width: pt(300), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
});
const segments = (doc: VDTDocument): VDTLineSegment[] => doc.blocks.flatMap((b) => b.lines.flatMap((l) => l.segments ?? []));
const seg = (doc: VDTDocument, text: string) => segments(doc).find((s) => s.text === text)!;

describe('segment languages', () => {
  it('an English phrase in an Arabic paragraph carries its language', () => {
    const doc = buildDocument({ markdown: 'قال :ltr[the old man]{lang=en} إن الكتاب جميل' }, config('rtl'));
    for (const t of ['the', 'old', 'man']) expect(seg(doc, t).lang).toBe('en');
    expect(seg(doc, 'قال').lang).toBeUndefined();
    expect(seg(doc, 'الكتاب').lang).toBeUndefined();
  });

  it('a Persian phrase in an English paragraph, and the innermost named language of nested isolates', () => {
    const doc = buildDocument({ markdown: 'He wrote :rtl[کتاب :ltr[ABC]{lang=en-GB} خوب]{lang=fa} here.' }, config('ltr'));
    expect(seg(doc, 'کتاب').lang).toBe('fa');
    expect(seg(doc, 'خوب').lang).toBe('fa');
    expect(seg(doc, 'ABC').lang).toBe('en-GB');
    expect(seg(doc, 'He').lang).toBeUndefined();
  });

  it('an isolate that names no language leaves its segments without one', () => {
    const doc = buildDocument({ markdown: 'قال :ltr[the old man] إن' }, config('rtl'));
    expect(segments(doc).some((s) => s.lang !== undefined)).toBe(false);
  });

  it('HTML declares the language on the word boxes', () => {
    const html = renderToHtml(buildDocument({ markdown: 'قال :ltr[the old man]{lang=en} إن الكتاب جميل' }, config('rtl')));
    expect(html).toMatch(/<span dir="ltr" lang="en" style="position:absolute;[^"]*">old<\/span>/);
    expect(html).not.toMatch(/lang="en"[^>]*>قال</);
  });
});
