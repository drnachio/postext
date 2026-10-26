import { describe, it, expect } from 'vitest';
import { inheritCalloutStyles, resolveCalloutStylesConfig, stripCalloutStylesDefaults } from '../../defaults/boxes/calloutStyles.js';
import { resolveBodyTextConfig } from '../../defaults/text/bodyText.js';
import { resolveHeadingsConfig } from '../../defaults/structure/headings.js';
import { resolveUnorderedListsConfig } from '../../defaults/text/unorderedLists.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import { formatWarning } from '../../pipeline/contentWarnings.js';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import type { CalloutStyleConfig, PostextConfig } from '../../types.js';

// Box styles based on another (#905): a style per place shares the look of
// one.

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

const body = resolveBodyTextConfig({ fontSize: { value: 9, unit: 'pt' } });
const resolve = (styles: CalloutStyleConfig[]) =>
  resolveCalloutStylesConfig(styles, body, resolveHeadingsConfig({}), resolveUnorderedListsConfig({}, body));
const mm = (value: number) => ({ value, unit: 'mm' as const });

const CAJA: CalloutStyleConfig = {
  id: 'caja',
  name: 'Caja',
  title: 'Recuerda',
  background: { model: 'hex', hex: '#dff0fa', paletteId: 'azul' },
  border: { enabled: true, color: { model: 'hex', hex: '#1d70b8' }, width: { value: 1, unit: 'pt' } },
  padding: { top: mm(3), right: mm(4), bottom: mm(3), left: mm(4) },
  titleStyle: { fontWeight: 700, color: { model: 'hex', hex: '#1d70b8' } },
  placement: 'fixed',
  fixed: { anchor: { to: 'container', edge: 'bottom-left' }, offset: { x: mm(0), y: mm(0) } },
};

describe('callout style extends (#905)', () => {
  it('a style takes every field it leaves unset from its parent, objects key by key', () => {
    const [caja, p5] = resolve([CAJA, { id: 'caja-p5', extends: 'caja', fixed: { offset: { y: mm(-40) } }, padding: { right: mm(60) } }]);
    expect(p5!.id).toBe('caja-p5');
    expect(p5!.name).toBe('caja-p5');
    expect(p5!.title).toBe('Recuerda');
    expect(p5!.background).toEqual(caja!.background);
    expect(p5!.border).toEqual(caja!.border);
    expect(p5!.titleStyle).toEqual(caja!.titleStyle);
    expect(p5!.placement).toBe('fixed');
    // Its own place; the rest of `fixed` and `padding` from the parent.
    expect(p5!.fixed.anchor).toEqual(caja!.fixed.anchor);
    expect(p5!.fixed.offset.y).toEqual(mm(-40));
    expect(p5!.fixed.offset.x).toEqual(caja!.fixed.offset.x);
    expect(p5!.padding.right).toEqual(mm(60));
    expect(p5!.padding.left).toEqual(caja!.padding.left);
  });

  it('a colour or a length is replaced whole, and chains are followed from the root', () => {
    const styles = inheritCalloutStyles([
      CAJA,
      { id: 'roja', extends: 'caja', background: { model: 'hex', hex: '#fbe3e3' } },
      { id: 'roja-p9', extends: 'roja', fixed: { offset: { x: mm(10) } } },
    ]);
    // The parent's palette link does not stay on the child's own colour.
    expect(styles[1]!.background).toEqual({ model: 'hex', hex: '#fbe3e3' });
    expect(styles[2]!.background).toEqual({ model: 'hex', hex: '#fbe3e3' });
    expect(styles[2]!.title).toBe('Recuerda');
    expect(styles[2]!.fixed!.offset).toEqual({ x: mm(10), y: mm(0) });
    expect(styles[2]!.extends).toBeUndefined();
    // No style extends: the same list comes back.
    const plain = [CAJA];
    expect(inheritCalloutStyles(plain)).toBe(plain);
  });

  it('an unknown parent or a loop leaves the style standing alone, and warns', () => {
    const config: PostextConfig = {
      calloutStyles: [
        CAJA,
        { id: 'a', extends: 'cajas', title: 'A' },
        { id: 'b', extends: 'c', title: 'B' },
        { id: 'c', extends: 'b', title: 'C' },
      ],
    };
    const [, a, b, c] = resolve(config.calloutStyles!);
    expect(a!.title).toBe('A');
    expect(a!.backgroundEnabled).toBe(true);
    expect(a!.background.hex).toBe('#f4f4f4');
    expect(b!.title).toBe('B');
    expect(c!.title).toBe('C');
    const warnings = collectConfigWarnings(config).filter((w) => w.kind.startsWith('calloutStyleExtends'));
    expect(warnings).toEqual([
      { kind: 'calloutStyleExtendsUnknown', path: 'calloutStyles[1].extends', value: 'cajas', used: '', suggestion: 'caja' },
      { kind: 'calloutStyleExtendsCycle', path: 'calloutStyles[2].extends', value: 'b → c → b', used: '' },
    ]);
    expect(formatWarning(warnings[0]!)).toContain('did you mean "caja"');
    expect(formatWarning(warnings[1]!)).toContain('b → c → b');
  });

  it('saving keeps every field a based-on style sets, defaults included', () => {
    const stripped = stripCalloutStylesDefaults([CAJA, { id: 'sin-borde', extends: 'caja', border: { enabled: false }, keepTogether: true }])!;
    expect(stripped[1]).toEqual({ id: 'sin-borde', extends: 'caja', border: { enabled: false }, keepTogether: true });
    const [, child] = resolve(stripped);
    expect(child!.border.enabled).toBe(false);
  });

  it('a box of the child style is laid out with the parent look at its own place', () => {
    const config: PostextConfig = {
      page: { width: mm(150), height: mm(200), margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
      calloutStyles: [
        { ...CAJA, placement: 'here', fixed: undefined },
        { id: 'caja-p5', extends: 'caja', placement: 'fixed', fixed: { anchor: { to: 'container', edge: 'bottom-left' } } },
      ],
    };
    const doc = buildDocument({ markdown: 'Texto.\n\n:::callout{type="caja"}\nUno.\n:::\n\n:::callout{type="caja-p5"}\nDos.\n:::' }, config, createMeasurementCache());
    const frames = doc.blocks.filter((b) => b.type === 'callout');
    expect(frames).toHaveLength(2);
    const [here, fixed] = frames;
    expect(fixed!.callout!.styleId).toBe('caja-p5');
    // Painted in the parent's colours.
    const colours = (b: typeof here) => new Set(JSON.stringify(b!.designOverlay ?? b).match(/#[0-9a-f]{6}/gi) ?? []);
    expect(colours(fixed).has('#dff0fa')).toBe(true);
    expect(colours(fixed)).toEqual(colours(here));
    expect(fixed!.callout!.placement).toBe('fixed');
    expect(here!.callout!.placement).toBe('here');
    // Pinned to the foot of the content area.
    const page = doc.pages[fixed!.pageIndex]!;
    expect(fixed!.bbox.y + fixed!.bbox.height).toBeCloseTo(page.contentArea.y + page.contentArea.height, 0);
  });
});
