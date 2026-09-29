import { beforeAll, describe, expect, it } from 'vitest';
import { buildBundle, initMathEngine, type VDTDocument } from 'postext';
import { DEFAULT_MARKDOWN_ZH_HANS } from '.';
import { sampleChapterTexts } from '../book/chapterOps';
import { createPostextGuideConfig } from '../context/guideConfig';
import { buildDefaultResources } from '../defaultResources';

// Metrics close to the book's faces: a CJK character or full-width mark
// one em, Latin letters and digits about half an em, a word space a quarter.
const em = (font: string): number => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
function advance(text: string, font: string): number {
  const size = em(font);
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x2e80 || (cp >= 0x2014 && cp <= 0x201d) || cp === 0x2026) w += size;
    else if (ch === ' ') w += size * 0.25;
    else if (/[A-Z]/.test(ch)) w += size * 0.65;
    else if (/[ilj.,:;'|!]/.test(ch)) w += size * 0.28;
    else w += size * 0.52;
  }
  return w;
}
class StubContext {
  font = '16px serif';
  letterSpacing = '0px';
  measureText(text: string) {
    const width = advance(text, this.font);
    return { width, actualBoundingBoxAscent: em(this.font) * 0.88, actualBoundingBoxDescent: em(this.font) * 0.12, fontBoundingBoxAscent: em(this.font) * 0.88, fontBoundingBoxDescent: em(this.font) * 0.12 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubContext {
    return new StubContext();
  }
};

const PROHIBITED_START = /^[。，、；：！？）》”’」』·%]/;
const PROHIBITED_END = /[《（“‘「『]$/;

describe('the Chinese guide laid out as a book', () => {
  let docs: VDTDocument[] = [];
  beforeAll(async () => {
    await initMathEngine();
    const chapters = sampleChapterTexts(DEFAULT_MARKDOWN_ZH_HANS).map((markdown) => ({ markdown }));
    const resources = await buildDefaultResources('zh-Hans');
    docs = buildBundle({ chapters, config: createPostextGuideConfig('zh-Hans'), resources });
  }, 120_000);

  it('sets every chapter, each with pages', () => {
    expect(docs.length).toBe(12);
    for (const doc of docs) expect(doc.pages.length).toBeGreaterThan(0);
  });

  it('reports no CJK line set short and no content warning in any chapter', () => {
    const warnings = docs.flatMap((doc, i) => (doc.contentWarnings ?? []).map((w) => ({ chapter: i + 1, ...w })));
    // A line beside an inline formula (U+FFFC in the plain text) is left
    // out: MathJax sizes the formula in its own fonts, which the stub above
    // does not match, so where such a line breaks here says nothing about
    // the browser (the Sandbox's checks list none there).
    const nearMaths = (w: { text?: string }) => (w.text ?? '').includes('\uFFFC');
    expect(warnings.filter((w) => w.kind === 'cjkLooseLine' && !nearMaths(w))).toEqual([]);
    expect(warnings.filter((w) => w.kind !== 'cjkLooseLine').map((w) => w.kind)).toEqual([]);
  });

  it('composes the body as Chinese, with no mark opening a line and no bracket closing one', () => {
    let composed = 0;
    for (const doc of docs) {
      for (const block of doc.blocks) {
        if (block.type !== 'paragraph') continue;
        for (const line of block.lines) {
          if (line.cjkComposed) composed++;
          expect(line.hyphenated ?? false, line.text).toBe(false);
          expect(line.text.trim(), line.text).not.toMatch(PROHIBITED_START);
          expect(line.text.trim(), line.text).not.toMatch(PROHIBITED_END);
        }
      }
    }
    expect(composed).toBeGreaterThan(500);
  });

  it('numbers chapters 第一章 … 第十章 and figures by chapter, 图3-1', () => {
    const numbered = docs.flatMap((doc) => doc.blocks.filter((b) => b.type === 'heading' && b.headingLevel === 1 && b.numberPrefix)).map((b) => b.numberPrefix);
    expect(numbered).toEqual(['第一章', '第二章', '第三章', '第四章', '第五章', '第六章', '第七章', '第八章', '第九章', '第十章']);
    const captions = JSON.stringify(docs[4]!.pages);
    expect(captions).toContain('图3-1');
    expect(captions).toContain('图3-2');
  });
});
