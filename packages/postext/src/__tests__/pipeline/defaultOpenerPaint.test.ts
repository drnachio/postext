import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { VDTBlock, VDTDesignTextBlock, VDTDocument } from '../../vdt';
import type { PostextConfig, TextAlign } from '../../types';

// A measurement stub that knows the style: italic glyphs are 5px wide,
// every other glyph 7px, so a run in italic takes less room than the same
// letters upright.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * (/italic/.test(this.font) ? 5 : 7) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });

// EF-100 measures a page-span heading without a design at the content
// width, and the default opener paints it there. The band was the heading's
// own measure, but the opener set the title plain, left-aligned and wrapped
// greedily: where the measure fitted more on a line (an italic run, a
// justified line whose spaces shrink, a forced break), the opener painted a
// line more than the band held, over the first lines of the text.

/** 400pt page at 72 dpi, 20pt margins: a 360pt content area in two columns.
 *  Body 10/12pt; the level-1 heading spans the page at 20/30pt with a 10pt
 *  margin under it. */
function config(extra: { inlineMarks?: boolean; textAlign?: TextAlign } = {}): PostextConfig {
  return {
    page: { dpi: 72, width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    layout: { layoutType: 'double', gutterWidth: pt(20) },
    bodyText: { fontSize: pt(10), lineHeight: pt(12) },
    header: { elements: [] },
    footer: { elements: [] },
    headings: {
      ...extra,
      balancing: { enabled: false },
      levels: [{ level: 1, span: 'page', fontSize: pt(20), lineHeight: pt(30), marginBottom: pt(10), breakBefore: { enabled: true, parity: 'any' } }],
    },
  };
}

const BODY = 'Body text that runs on for a while. '.repeat(40);
const build = (title: string, cfg: PostextConfig): VDTDocument =>
  buildDocument({ markdown: `# ${title}\n\n${BODY}` }, cfg, createMeasurementCache());

const heading = (doc: VDTDocument): VDTBlock => doc.pages[0]!.columns[0]!.blocks.find((b) => b.type === 'heading')!;
const openerText = (doc: VDTDocument): VDTDesignTextBlock =>
  doc.pages[0]!.openerBand!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;

/** Every painted line lies inside the band (its line box, 30pt tall with the
 *  baseline at 0.8 of it), and the text of both columns starts under it. */
function expectInsideBand(doc: VDTDocument): void {
  const band = doc.pages[0]!.openerBand!.bbox;
  const foot = band.y + band.height;
  for (const line of openerText(doc).lines) {
    expect(line.baselineY - 24).toBeGreaterThanOrEqual(band.y - 0.01);
    expect(line.baselineY + 6).toBeLessThanOrEqual(foot + 0.01);
  }
  for (const col of doc.pages[0]!.columns) {
    const first = col.blocks.find((b) => b.type === 'paragraph');
    expect(first!.bbox.y).toBeGreaterThanOrEqual(foot - 0.01);
  }
}

describe('the default opener paints what its band holds (EF-100)', () => {
  // "Of " upright (21px) and a run of 54 italic characters (270px): 291px,
  // one line in the 360px content area. Set upright, the run takes 378px and
  // the title wraps.
  const ITALIC_TITLE = 'Of *aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk*';

  it('paints the italic run the heading was measured with, on the one line the band holds', () => {
    const doc = build(ITALIC_TITLE, config());
    expect(heading(doc).lines).toHaveLength(1);
    const lines = openerText(doc).lines;
    expect(lines.map((l) => l.text)).toEqual(['Of aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk']);
    const runs = lines[0]!.runs!;
    expect(runs.map((r) => [r.text, /italic/.test(r.fontString)])).toEqual([
      ['Of ', false],
      ['aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk', true],
    ]);
    // One 30pt line + 10pt margin, on the 12pt grid: 48pt.
    expect(doc.pages[0]!.openerBand!.bbox.height).toBeCloseTo(48, 5);
    expectInsideBand(doc);
  });

  it('keeps the title plain, on two lines and a band of two, with inline marks off', () => {
    const doc = build(ITALIC_TITLE, config({ inlineMarks: false }));
    const lines = openerText(doc).lines;
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.runs === undefined)).toBe(true);
    expect(doc.pages[0]!.openerBand!.bbox.height).toBeCloseTo(72, 5);
    expectInsideBand(doc);
  });

  it('reserves the second line a justified title takes when the opener sets it flush left', () => {
    // 52 characters: 364px upright, 4px wider than the content area. The
    // justified measure shrinks its spaces onto one line; the opener does not.
    const title = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kk';
    const doc = build(title, config({ textAlign: 'justify' }));
    expect(heading(doc).lines).toHaveLength(1);
    expect(openerText(doc).lines.map((l) => l.text)).toEqual(['aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj', 'kk']);
    // Two 30pt lines + 10pt margin → 70 → 72pt on the grid.
    expect(doc.pages[0]!.openerBand!.bbox.height).toBeCloseTo(72, 5);
    expectInsideBand(doc);
  });

  it('reserves the line a forced break opens', () => {
    const doc = build('Short \\\\ Title', config());
    expect(heading(doc).lines).toHaveLength(1);
    expect(openerText(doc).lines.map((l) => l.text)).toEqual(['Short', 'Title']);
    expect(doc.pages[0]!.openerBand!.bbox.height).toBeCloseTo(72, 5);
    expectInsideBand(doc);
  });

  it('writes marker characters back escaped, beside a marked run and across a forced break', () => {
    const doc = build('2 \\* 3 \\\\ is *six*', config());
    const lines = openerText(doc).lines;
    expect(lines.map((l) => l.text)).toEqual(['2 * 3', 'is six']);
    expect(lines[1]!.runs!.map((r) => [r.text, /italic/.test(r.fontString)])).toEqual([
      ['is ', false],
      ['six', true],
    ]);
    expectInsideBand(doc);
  });

  it('prints a numbered title with its number upright before the run', () => {
    const cfg = config();
    cfg.headings!.levels![0]!.numberingTemplate = '{1}.';
    const doc = build('The *Canon*', cfg);
    const line = openerText(doc).lines[0]!;
    expect(line.text).toBe('1. The Canon');
    expect(line.runs!.map((r) => [r.text, /italic/.test(r.fontString)])).toEqual([
      ['1. The ', false],
      ['Canon', true],
    ]);
    expectInsideBand(doc);
  });
});
