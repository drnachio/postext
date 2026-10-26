import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { renderToHtml } from '../../../html-backend/html-backend.js';
import { resolveParagraphStylesConfig, stripParagraphStylesDefaults } from '../../../defaults/text/paragraphStyles.js';
import { resolveBodyTextConfig } from '../../../defaults/text/bodyText.js';
import { collectConfigWarnings } from '../../../checks/configWarnings.js';
import type { ParagraphStyleConfig, PostextConfig } from '../../../types.js';
import type { VDTBlock, VDTDocument } from '../../../vdt.js';

// #907: a paragraph style tracks its letters (`letterSpacing`), measured
// into the lines and painted as a heading level's tracking is.

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
const em = (value: number) => ({ value, unit: 'em' as const });
// 72 dpi and a 10 pt body: 1 em = 10 px.
const config = (style: Omit<ParagraphStyleConfig, 'id'>): PostextConfig => ({
  page: { width: pt(200), height: pt(400), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), hyphenation: { enabled: false }, avoidRunts: false },
  paragraphStyles: [{ id: 't', textAlign: 'left', ...style }],
});

const TEXT = 'The long line of the page title runs on past the measure of the column and turns over.';
const build = (style: Omit<ParagraphStyleConfig, 'id'>, markdown = `:::paragraphs{style="t"}\n${TEXT}\n:::`): VDTDocument =>
  buildDocument({ markdown }, config(style));
const para = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'paragraph')!;

describe('paragraphStyles[].letterSpacing (#907)', () => {
  it('resolves absent when unset or zero, and survives the strip when set', () => {
    const body = resolveBodyTextConfig();
    const [none, zero, set] = resolveParagraphStylesConfig([{ id: 'a' }, { id: 'b', letterSpacing: em(0) }, { id: 'c', letterSpacing: em(0.015) }], body);
    expect(none!.letterSpacing).toBeUndefined();
    expect(zero!.letterSpacing).toBeUndefined();
    expect(set!.letterSpacing).toEqual(em(0.015));
    expect(stripParagraphStylesDefaults([{ id: 'b', letterSpacing: em(0) }, { id: 'c', letterSpacing: em(0.015) }])).toEqual([{ id: 'b' }, { id: 'c', letterSpacing: em(0.015) }]);
    expect(collectConfigWarnings({ paragraphStyles: [{ id: 'c', letterSpacing: em(0.015) }] }).filter((w) => w.kind === 'unknownConfigKey')).toEqual([]);
  });

  it('measures the tracking into the lines and stamps it on the block', () => {
    const plain = para(build({}));
    const tracked = para(build({ letterSpacing: em(0.1) }));
    expect(plain.letterSpacing).toBeUndefined();
    // 0.1 em of a 10 px style.
    expect(tracked.letterSpacing).toBeCloseTo(1, 5);
    // One px after every letter: the same words take more room, so the
    // paragraph turns over into more lines.
    expect(tracked.lines.length).toBeGreaterThan(plain.lines.length);
    const first = (b: VDTBlock) => b.lines[0]!;
    const perChar = (b: VDTBlock) => first(b).bbox.width / first(b).text.length;
    expect(perChar(tracked)).toBeGreaterThan(perChar(plain) + 0.5);
  });

  it('is relative to the style’s own size, and a negative value tightens', () => {
    const big = para(build({ fontSize: pt(20), lineHeight: pt(24), letterSpacing: em(0.05) }));
    expect(big.letterSpacing).toBeCloseTo(1, 5);
    const tight = para(build({ letterSpacing: { value: -0.5, unit: 'pt' } }));
    expect(tight.letterSpacing).toBeCloseTo(-0.5, 5);
  });

  it('keeps justified lines full: the word spaces take the slack over the tracking', () => {
    const b = para(build({ textAlign: 'justify', letterSpacing: em(0.05) }));
    expect(b.letterSpacing).toBeCloseTo(0.5, 5);
    expect(b.lines.length).toBeGreaterThan(1);
    // Each space is a 7 px glyph plus its tracking; the words and the
    // spaces at the line's ratio fill the measure.
    const space = 7 + 0.5;
    for (const line of b.lines.slice(0, -1)) {
      const spaces = line.text.trim().split(' ').length - 1;
      const ratio = line.justifiedSpaceRatio!;
      expect(ratio).toBeGreaterThanOrEqual(0.6);
      expect(line.bbox.width - spaces * space + spaces * space * ratio).toBeCloseTo(b.bbox.width, 3);
    }
  });

  it('is painted by the HTML backend', () => {
    const html = renderToHtml(build({ letterSpacing: em(0.1) }));
    expect(html).toMatch(/letter-spacing:1px/);
    expect(renderToHtml(build({}))).not.toMatch(/letter-spacing:1px/);
  });

  it('tracks a styled paragraph inside a box', () => {
    const cfg = config({ letterSpacing: em(0.1) });
    const doc = buildDocument({ markdown: `:::callout\n:::paragraphs{style="t"}\n${TEXT}\n:::\n:::` }, cfg);
    const boxed = doc.blocks.find((b) => b.type === 'paragraph' && b.containerId !== undefined);
    expect(boxed?.letterSpacing).toBeCloseTo(1, 5);
  });
});
