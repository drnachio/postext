import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { resolveAllConfig } from '../../../pipeline/config.js';
import { stripCalloutStylesDefaults } from '../../../defaults/index.js';
import { configFontFamilies } from '../../../fonts/usage.js';
import { renderBlock } from '../../../canvas-backend/blockRender.js';
import type { VDTBlock, VDTDocument } from '../../../vdt.js';
import type { CalloutListStyleConfig, PostextConfig, UnorderedListsConfig } from '../../../types.js';

// #1103: a list inside a box keeps its bullet face. The bullet takes the
// style's `lists.bulletFontFamily`; unset, the list level's own face.

// The symbol face sets its glyphs 20 px wide, every other face 7 px.
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    return { width: s.length * (this.font.includes('Symbols') ? 20 : 7) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (lists: CalloutListStyleConfig, unorderedLists?: UnorderedListsConfig): PostextConfig => ({
  headings: { balancing: { enabled: false } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Doc', fontSize: pt(10) },
  ...(unorderedLists ? { unorderedLists } : {}),
  calloutStyles: [{ id: 'box', body: { fontFamily: 'Box' }, lists }],
});
const MD = ':::callout{type="box"}\n- Boxed item.\n:::\n\n- Running item.';

const build = (cfg: PostextConfig): VDTDocument => buildDocument({ markdown: MD }, cfg, createMeasurementCache());
const item = (doc: VDTDocument, text: string): VDTBlock =>
  doc.blocks.find((b) => b.type === 'listItem' && b.lines[0]?.text.includes(text))!;
const familyOf = (font: string | undefined): string => /px (.+)$/.exec(font ?? '')?.[1] ?? '';

describe('the bullet face of a list in a box (#1103)', () => {
  it('resolves and strips lists.bulletFontFamily', () => {
    expect(resolveAllConfig({ calloutStyles: [{ id: 'x' }] }).calloutStyles[0]!.lists.bulletFontFamily).toBeUndefined();
    expect(resolveAllConfig({ calloutStyles: [{ id: 'x', lists: { bulletFontFamily: 'Symbols' } }] }).calloutStyles[0]!.lists.bulletFontFamily).toBe('Symbols');
    expect(stripCalloutStylesDefaults([{ id: 'x', lists: { bulletFontFamily: 'Symbols' } }])).toEqual([{ id: 'x', lists: { bulletFontFamily: 'Symbols' } }]);
    expect(configFontFamilies({ calloutStyles: [{ id: 'x', lists: { bulletFontFamily: 'Symbols' } }] })).toContain('Symbols');
  });

  it('measures the bullet in the style\'s bullet face', () => {
    const doc = build(config({ bulletFontFamily: 'Symbols' }));
    const boxed = item(doc, 'Boxed');
    expect(familyOf(boxed.bulletFontString)).toBe('Symbols');
    // The running list keeps the document's face.
    expect(familyOf(item(doc, 'Running').bulletFontString)).toBe('Doc');
    // The bullet is 20 px wide in the symbol face: the item's text starts
    // 13 px further in than under a 7 px bullet.
    const plain = item(build(config({})), 'Boxed');
    expect(boxed.lines[0]!.bbox.x - plain.lines[0]!.bbox.x).toBeCloseTo(13, 5);
  });

  it('keeps a list face of its own when the style sets no bullet face', () => {
    const own = build(config({ bulletFontSize: pt(12) }, { fontFamily: 'Symbols' }));
    expect(familyOf(item(own, 'Boxed').bulletFontString)).toBe('Symbols');
    const level = build(config({ bulletFontSize: pt(12) }, { levels: [{ level: 1, fontFamily: 'Symbols' }] }));
    expect(familyOf(item(level, 'Boxed').bulletFontString)).toBe('Symbols');
    // As before: a list face inherited from the body takes the box's body
    // face under a bullet size of the style's own, the document's otherwise.
    expect(familyOf(item(build(config({ bulletFontSize: pt(12) })), 'Boxed').bulletFontString)).toBe('Box');
    expect(familyOf(item(build(config({})), 'Boxed').bulletFontString)).toBe('Doc');
  });

  it('paints the bullet in that face on canvas', () => {
    const boxed = item(build(config({ bulletFontSize: pt(12), bulletFontFamily: 'Symbols' })), 'Boxed');
    const fonts: Array<[string, string]> = [];
    const ctx = Object.assign(new StubCtx(), {
      fillStyle: '', strokeStyle: '', lineWidth: 1, textBaseline: 'alphabetic', textAlign: 'left', direction: 'ltr', globalAlpha: 1,
      fillText(this: StubCtx, text: string) { fonts.push([text, this.font]); },
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, closePath() {},
      setTransform() {}, translate() {}, scale() {},
    });
    renderBlock(ctx as unknown as CanvasRenderingContext2D, boxed, 400, 0);
    const bullet = fonts.find(([text]) => text === boxed.bulletText);
    expect(bullet).toBeDefined();
    expect(familyOf(bullet![1])).toBe('Symbols');
  });
});
