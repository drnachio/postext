import { describe, it, expect } from 'vitest';
import { buildDocument, measureBlock, getCjkLineBreak, setCjkLineBreak } from '../../index';
import { verticalRuns } from '../../writingMode';
import { graphemesOf } from '../../measure/graphemes';
import { getMeasureWritingMode } from '../../measure/vertical';
import type { PostextConfig, Dimension, Resource } from '../../types';
import type { VDTDocument, VDTLine, VDTLineSegment } from '../../vdt';
import { installSizedStub, stubCharWidth } from './stub';

installSizedStub();

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const stubWidth = (text: string, em: number): number => {
  let w = 0;
  for (const ch of text) w += stubCharWidth(ch, em);
  return w;
};

const config = (locale: string, textAlign: 'left' | 'justify', extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(30), right: pt(30), bottom: pt(30), left: pt(30) } },
  bodyText: { fontFamily: 'Test Serif', fontSize: pt(10), lineHeight: pt(16), textAlign },
  layout: { writingMode: 'vertical-rl', layoutType: 'single' },
  locale,
  ...extra,
});

/** Every text line of the flow of every vertical page, with its block's font. */
function flowLines(doc: VDTDocument): Array<{ line: VDTLine; font: string }> {
  const out: Array<{ line: VDTLine; font: string }> = [];
  for (const page of doc.pages) {
    if (!page.flow) continue;
    for (const col of page.columns) {
      for (const b of col.blocks) {
        if (b.resourceBlock) continue;
        for (const line of b.lines ?? []) out.push({ line, font: b.fontString });
      }
    }
  }
  return out;
}

/** What the canvas painter advances through a segment: its runs as
 *  `verticalRuns` cuts them, sideways runs at their measured width, cells
 *  at their length; the segment's tracking after every grapheme. */
function paintedAdvance(seg: VDTLineSegment, font: string, region: 'mainland' | 'taiwan' | 'hongkong'): number {
  const f = seg.fontString ?? font;
  const em = Number(/(\d*\.?\d+)px/.exec(f)![1]);
  const t = seg.tracking ?? 0;
  let adv = 0;
  for (const run of verticalRuns(graphemesOf(seg.text), region)) {
    adv += run.cell === undefined ? stubWidth(run.text, em) + t * graphemesOf(run.text).length : run.cell * em + t;
  }
  return adv;
}

// Chinese paragraphs with Latin words, numbers and the signs inside them
// (#188 review, finding 1), a Latin paragraph with the marks Chinese
// shares, words with an apostrophe or an interpunct inside, and a Latin
// paragraph quoting Chinese.
const PARAGRAPHS = [
  '他說iPhone很好，價格3×4元，©2026，§3，±5。尺寸30×40，氣溫25℃。',
  '甲·乙，1–2頁，等等……，——他說～，“引號”與‘單引’，他答“yes”。',
  'He said “yes”—then left… © 2026 · ok ± 5 § 2, 3×4 and 30×40.',
  '他的iPhone’s 殼與 don’t、l·l 同列，約翰·史密斯來了。',
  'The novel 紅樓夢—a classic, “Dream of the Red Chamber” (1791).',
  '罕字𠀀𪚥，表情😀，全形ＡＢＣ１２３，半形ｶﾀｶﾅ。數字12345與中文混排，50%。',
];

describe('vertical text: the painter advances what the measurer measured (#188 review)', () => {
  for (const locale of ['zh-Hant', 'zh-Hans'] as const) {
    const region = locale === 'zh-Hant' ? 'taiwan' : 'mainland';

    it(`paints every segment of ragged lines exactly as wide as it was measured (${locale})`, () => {
      const doc = buildDocument({ markdown: PARAGRAPHS.join('\n\n') }, config(locale, 'left'));
      const lines = flowLines(doc);
      expect(lines.length).toBeGreaterThan(5);
      const off: string[] = [];
      for (const { line, font } of lines) {
        for (const seg of line.segments ?? []) {
          if (seg.kind !== 'text') continue;
          const painted = paintedAdvance(seg, font, region);
          if (Math.abs(painted - seg.width) > 0.01) off.push(`${JSON.stringify(seg.text)}: measured ${seg.width.toFixed(2)}, painted ${painted.toFixed(2)}`);
        }
      }
      expect(off).toEqual([]);
    });

    it(`never paints a justified segment past its measured width (${locale})`, () => {
      const doc = buildDocument({ markdown: PARAGRAPHS.join('\n\n') }, config(locale, 'justify'));
      const off: string[] = [];
      for (const { line, font } of flowLines(doc)) {
        for (const seg of line.segments ?? []) {
          if (seg.kind !== 'text') continue;
          const painted = paintedAdvance(seg, font, region);
          if (painted > seg.width + 0.01) off.push(`${JSON.stringify(seg.text)}: measured ${seg.width.toFixed(2)}, painted ${painted.toFixed(2)}`);
        }
      }
      expect(off).toEqual([]);
    });
  }

  it('gives an upright sign inside a number its cell: 3×4 advances 3, one em, 4', () => {
    const doc = buildDocument({ markdown: '價格3×4元' }, config('zh-Hant', 'left'));
    const segs = flowLines(doc)[0]!.line.segments!;
    const run = segs.find((s) => s.text === '3×4')!;
    // 10 px em: the digits ½ em each (the stub), × a whole cell.
    expect(run.width).toBeCloseTo(5 + 10 + 5);
  });

  it('measures a Latin paragraph of a vertical book with the cells its Chinese marks and upright signs are painted in', () => {
    const doc = buildDocument({ markdown: 'ok © ok · ok' }, config('zh-Hant', 'left'));
    const line = flowLines(doc)[0]!.line;
    // ok ×3 (10 px each), four spaces (2.5 px), © and · a cell each.
    const width = (line.segments ?? []).reduce((s, g) => s + g.width, 0);
    expect(width).toBeCloseTo(3 * 10 + 4 * 2.5 + 2 * 10);
  });

  it('sets the mainland interpunct in half a cell and the Taiwan one in a whole cell, painted where it was measured', () => {
    const width = (locale: string) => flowLines(buildDocument({ markdown: '約翰·史密斯' }, config(locale, 'left')))[0]!.line.bbox.width;
    expect(width('zh-Hans')).toBeCloseTo(5 * 10 + 5);
    expect(width('zh-Hant')).toBeCloseTo(6 * 10);
  });
});

describe('vertical text: what stands upright on the sheet is measured horizontally (#188 review)', () => {
  const figure: Resource = {
    id: 'f1',
    typeId: 'figure',
    kind: 'bitmap',
    caption: '寶玉·黛玉初見',
    createdAt: 0,
    updatedAt: 0,
    bitmap: { fileId: 'f1.png', format: 'png', width: 400, height: 300 },
  };
  const table: Resource = {
    id: 't1',
    typeId: 'table',
    kind: 'table',
    caption: '人物',
    createdAt: 0,
    updatedAt: 0,
    table: { model: { rows: [[{ content: '名' }, { content: '字' }], [{ content: '約翰·史密斯' }, { content: '約翰' }]] } },
  };

  /** Each non-space segment is as wide as its text measured horizontally. */
  const horizontalWidths = (segments: VDTLineSegment[], em: number): Array<[number, number]> =>
    segments.filter((s) => s.kind === 'text' && s.text.trim() !== '').map((s) => [s.width, stubWidth(s.text, em) + (s.tracking ?? 0) * graphemesOf(s.text).length]);

  it('measures the caption of an upright figure and the cells of an upright table as horizontal text', () => {
    const doc = buildDocument(
      { markdown: '此開卷第一回也。見圖:ref{id="f1"}，見表:ref{id="t1"}。\n\n作者自云。', resources: [figure, table] },
      config('zh-Hant', 'left'),
    );
    const blocks = doc.pages.flatMap((p) => [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? [])]).filter((b) => b.resourceBlock);
    expect(blocks.length).toBe(2);
    const caption = blocks.find((b) => b.resourceBlock!.resource.id === 'f1')!.resourceBlock!;
    const captionEm = Number(/(\d*\.?\d+)px/.exec(caption.captionFontString)![1]);
    const withDot = caption.captionLines.flatMap((l) => l.segments ?? []).filter((s) => s.text.includes('·'));
    expect(withDot.length).toBeGreaterThan(0);
    for (const [measured, horizontal] of horizontalWidths(caption.captionLines.flatMap((l) => l.segments ?? []), captionEm)) {
      expect(measured).toBeCloseTo(horizontal);
    }
    const tableLayout = blocks.find((b) => b.resourceBlock!.resource.id === 't1')!.resourceBlock!.table!;
    const john = tableLayout.cells.find((c) => c.lines.some((l) => l.text.includes('·')))!;
    const cellEm = Number(/(\d*\.?\d+)px/.exec(tableLayout.fontString)![1]);
    for (const [measured, horizontal] of horizontalWidths(john.lines.flatMap((l) => l.segments ?? [{ kind: 'text', text: l.text, width: l.bbox.width } as VDTLineSegment]), cellEm)) {
      expect(measured).toBeCloseTo(horizontal);
    }
  });

  it('measures running heads, which stay horizontal on the sheet, as horizontal text', () => {
    const doc = buildDocument({ markdown: '此開卷第一回也。' }, config('zh-Hant', 'left', {
      header: {
        elements: [{
          kind: 'text', id: 'rh', overflow: 'clip', fontSize: pt(8), content: '紅樓夢·第一回',
          placement: { anchor: { to: 'container', edge: 'bottom-left' }, size: { width: 'fill' } },
        }],
      } as PostextConfig['header'],
    }));
    const header = doc.pages[0]!.header!;
    const text = header.blocks.find((b) => b.kind === 'text')!;
    expect(text.kind).toBe('text');
    if (text.kind !== 'text') return;
    const em = Number(/(\d*\.?\d+)px/.exec(text.fontString)![1]);
    // 紅樓夢 and 第一回 one em each, · half an em (the stub): not a cell.
    expect(text.lines[0]!.width).toBeCloseTo(6 * em + em / 2);
  });
});

describe('vertical text: a build leaves the measuring state as it found it (#188 review)', () => {
  it('measures text after a vertical build as before it', () => {
    const font = '40px "Test Serif"';
    const width = () => measureBlock('甲·乙丙', font, 2000, 60).lines[0]!.bbox.width;
    const before = width();
    const levelBefore = getCjkLineBreak();
    setCjkLineBreak('none');
    try {
      buildDocument({ markdown: '正文。' }, config('zh-Hant', 'left'));
      expect(getMeasureWritingMode()).toBe('horizontal-tb');
      expect(getCjkLineBreak()).toBe('none');
      expect(width()).toBeCloseTo(before);
    } finally {
      setCjkLineBreak(levelBefore);
    }
  });
});
