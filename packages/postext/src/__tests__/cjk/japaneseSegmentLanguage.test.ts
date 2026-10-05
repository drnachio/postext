import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { PostextConfig } from '../../types';
import type { VDTDocument, VDTLineSegment } from '../../vdt';

// #427: in Japanese text the CJK composer carries the language an inline
// isolate names (`:ltr[…]{lang=zh}`) to the segments of its text, never
// joining them with text of another language, so the PDF shapes and tags
// each in its own language. Chinese composed text carries none, as before.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    let w = 0;
    for (const ch of s) w += ch.codePointAt(0)! >= 0x2e80 || ch === '“' || ch === '”' ? 16 : 8;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (locale: string, vertical = false): PostextConfig => ({
  locale,
  page: { dpi: 72, width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single', ...(vertical ? { writingMode: 'vertical-rl' as const } : {}) },
  bodyText: { fontFamily: 'Test Serif', fontSize: pt(16), lineHeight: pt(24), firstLineIndent: pt(0) },
  header: { elements: [] },
  footer: { elements: [] },
});

function segments(doc: VDTDocument): VDTLineSegment[] {
  return doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => (b.lines ?? []).flatMap((l) => l.segments ?? []))));
}

const languages = (doc: VDTDocument) => segments(doc).filter((s) => s.kind === 'text').map((s) => [s.text, s.lang ?? null]);
/** Each character with the language of its segment. */
const byChar = (doc: VDTDocument) => segments(doc).filter((s) => s.kind === 'text').flatMap((s) => [...s.text].map((ch) => `${ch}${s.lang ? `:${s.lang}` : ''}`)).join(' ');

describe('isolate languages on composed Japanese lines (#427)', () => {
  it('carries the language of an isolate to its segments, apart from the text around it', () => {
    for (const vertical of [false, true]) {
      const doc = buildDocument({ markdown: '私は:ltr[“本当”]{lang=zh}と書く。' }, config('ja', vertical));
      expect(byChar(doc), String(vertical)).toBe('私 は “:zh 本:zh 当:zh ”:zh と 書 く 。');
    }
  });

  it('carries a Japanese isolate’s language in a Chinese document, and no other', () => {
    const ja = buildDocument({ markdown: '他說:ltr[本当]{lang=ja}。' }, config('zh-Hans'));
    expect(languages(ja)).toContainEqual(['本当', 'ja']);
    const en = buildDocument({ markdown: '他說:ltr[the end]{lang=en}。' }, config('zh-Hans'));
    expect(segments(en).some((s) => s.lang !== undefined)).toBe(false);
  });
});
