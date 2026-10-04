import { beforeAll, describe, expect, it } from 'vitest';
import { buildBundle, findLooseLines, initMathEngine, type VDTDocument } from 'postext';
import { DEFAULT_MARKDOWN_ZH_HANS } from '.';
import { sampleChapterTexts } from '../book/chapterOps';
import { createPostextGuideConfig } from '../context/guideConfig';
import { buildDefaultResources } from '../defaultResources';

// Advances of the characters the Chinese guide sets outside the CJK blocks,
// in thousandths of an em, read with fontkit from the Google Fonts static
// instances of Noto Serif SC (Regular, Bold) and Noto Sans SC (the Medium
// instance, for every weight of the sans): the book's faces, so the layout
// here breaks the lines where the Sandbox does (kerning aside). Every CJK
// character and full-width mark is one em in both faces.
const LATIN = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~©·×–—‘’“”•…";
const ADVANCES = {
  serif: [256, 308, 376, 574, 550, 923, 779, 196, 364, 364, 478, 580, 327, 346, 327, 352, 557, 471, 558, 557, 555, 558, 558, 549, 558, 562, 327, 327, 580, 580, 580, 432, 912, 718, 670, 691, 770, 652, 629, 741, 853, 405, 403, 731, 625, 975, 796, 767, 641, 767, 715, 567, 659, 797, 714, 1053, 700, 687, 605, 344, 352, 344, 580, 563, 435, 557, 638, 538, 629, 547, 388, 566, 663, 332, 311, 607, 334, 974, 661, 596, 638, 607, 462, 473, 367, 653, 548, 838, 564, 552, 498, 374, 316, 374, 580, 821, 327, 1000, 563, 890, 1000, 1000, 1000, 1000, 1000, 1000],
  serifBold: [250, 355, 447, 615, 589, 966, 803, 235, 400, 400, 485, 603, 335, 370, 335, 400, 593, 466, 594, 593, 593, 594, 594, 588, 594, 596, 335, 335, 603, 603, 603, 473, 970, 746, 708, 702, 789, 666, 648, 757, 864, 426, 428, 767, 642, 1001, 815, 785, 673, 785, 751, 597, 695, 818, 734, 1091, 726, 701, 627, 372, 400, 372, 603, 593, 447, 585, 672, 565, 658, 572, 402, 596, 687, 349, 335, 651, 355, 1008, 685, 623, 671, 640, 500, 499, 393, 678, 578, 874, 599, 582, 517, 380, 338, 380, 603, 837, 335, 1000, 593, 928, 1000, 1000, 1000, 1000, 1000, 1000],
  sans: [225, 343, 518, 570, 570, 939, 706, 298, 356, 356, 484, 570, 298, 357, 298, 390, 570, 570, 570, 570, 570, 570, 570, 570, 570, 570, 298, 298, 570, 570, 570, 492, 972, 622, 667, 646, 699, 600, 566, 701, 741, 309, 549, 664, 558, 830, 734, 754, 648, 754, 656, 608, 611, 733, 594, 894, 596, 553, 607, 356, 390, 356, 570, 562, 615, 575, 629, 517, 630, 566, 346, 578, 621, 288, 289, 575, 298, 943, 624, 615, 630, 630, 409, 480, 396, 620, 545, 829, 526, 544, 491, 356, 281, 356, 570, 840, 1000, 1000, 540, 900, 1000, 1000, 1000, 1000, 1000, 1000],
};
const em = (font: string): number => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
function advance(text: string, font: string): number {
  const size = em(font);
  const face = /Noto Serif SC/.test(font) ? (/\b(700|bold)\b/.test(font) ? ADVANCES.serifBold : ADVANCES.serif) : ADVANCES.sans;
  let w = 0;
  for (const ch of text) {
    const i = ch.codePointAt(0)! >= 0x2e80 ? -1 : LATIN.indexOf(ch);
    w += size * (i >= 0 ? face[i]! / 1000 : ch.codePointAt(0)! >= 0x2e80 ? 1 : 0.5);
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
/** A last line of one Chinese character, alone or with the marks after it
 *  (孤字): 图, 版。, 说。” */
const SINGLE_CHARACTER = /^[\u3400-\u9fff][。，、；：！？）》”’」』]*$/u;

describe('the Chinese guide laid out as a book', () => {
  let docs: VDTDocument[] = [];
  beforeAll(async () => {
    await initMathEngine();
    const chapters = sampleChapterTexts(DEFAULT_MARKDOWN_ZH_HANS).map((markdown) => ({ markdown }));
    const resources = await buildDefaultResources('zh-Hans');
    docs = buildBundle({ chapters, config: createPostextGuideConfig('zh-Hans'), resources });
  }, 120_000);

  it('sets every chapter, each with pages', () => {
    expect(docs.length).toBe(14);
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

  it('sets no loose line (the Checks panel\'s default threshold) and no paragraph ending on a single character', () => {
    const loose = docs.flatMap((doc, i) => findLooseLines(doc).map((l) => ({ chapter: i + 1, text: l.line.text, ratio: l.ratio })));
    expect(loose).toEqual([]);
    const runts: { chapter: number; text: string }[] = [];
    docs.forEach((doc, i) => {
      for (const block of doc.blocks) {
        if ((block.type !== 'paragraph' && block.type !== 'listItem') || block.lines.length < 2) continue;
        const last = block.lines[block.lines.length - 1]!.text.trim();
        if (SINGLE_CHARACTER.test(last)) runts.push({ chapter: i + 1, text: `${block.lines[block.lines.length - 2]!.text.slice(-12)}|${last}` });
      }
    });
    expect(runts).toEqual([]);
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

  it('numbers chapters 第一章 … 第十一章 and figures by chapter, 图3-1', () => {
    const numbered = docs.flatMap((doc) => doc.blocks.filter((b) => b.type === 'heading' && b.headingLevel === 1 && b.numberPrefix)).map((b) => b.numberPrefix);
    expect(numbered).toEqual(['第一章', '第二章', '第三章', '第四章', '第五章', '第六章', '第七章', '第八章', '第九章', '第十章', '第十一章']);
    const captions = JSON.stringify(docs[4]!.pages);
    expect(captions).toContain('图3-1');
    expect(captions).toContain('图3-2');
  });
});
