import { describe, expect, it } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { contrastDocument, contrastPairs } from '../../checks/contrast.js';
import type { PostextConfig } from '../../types.js';
import type { FrameConfig } from '../../composed/types.js';

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
import { PAGE8_CONFIG, PAGE8_RESOURCES, page8Fixture } from './fixtures/page8.js';

// The contrast check on a composed page (#908): frame text is read on what
// is painted under it, in the page's paint order — the frame's own box, the
// template's decoration (boxes and pictures), then the paper.

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

const BLUE = '#005a8c';
const GREEN = '#2e6417';
const NAVY = '#102a43';

/** The p. 8 stand-in's template with three tabs of white lettering: on a
 *  blue and a green box of the decoration, on bare paper, and in a frame
 *  that paints its own navy box over a white decoration box. */
function tabsConfig(extra: { rotate?: number } = {}): PostextConfig {
  const base = PAGE8_CONFIG.pageTemplates![0]!;
  const tab = (name: string, x: number, style = 'pestana', layer = 1): FrameConfig => ({
    name, style, layer, width: mm(50), ...(extra.rotate ? { rotate: extra.rotate } : {}),
    placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(x), y: mm(8) } },
  }) as never;
  const band = (id: string, x: number, color: string) => ({
    kind: 'box', id, placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(x), y: mm(6) }, size: { width: mm(54), height: mm(14) } }, style: { backgroundColor: hex(color) },
  });
  const decoration = (base.decoration as { elements: unknown[] }).elements
    // Keep the white card; drop the full-bleed picture (and the theme name
    // set on it) so the paper is what lies under the bare tab.
    .filter((e) => !['fondo', 'tema'].includes((e as { id: string }).id));
  return {
    ...PAGE8_CONFIG,
    locale: 'es',
    calloutStyles: [
      ...(PAGE8_CONFIG.calloutStyles ?? []),
      // Frameless lettering: no fill of its own, white text.
      { id: 'pestana', backgroundEnabled: false, border: { enabled: false }, padding: { top: mm(1), right: mm(2), bottom: mm(1), left: mm(2) }, body: { color: hex('#ffffff'), fontSize: pt(11), lineHeight: pt(14) } } as never,
      { id: 'pestana-propia', backgroundEnabled: true, background: hex(NAVY), border: { enabled: false }, body: { color: hex('#ffffff'), fontSize: pt(11), lineHeight: pt(14) } } as never,
    ],
    pageTemplates: [{
      ...base,
      decoration: { elements: [...decoration, band('azul', 8, BLUE), band('verde', 68, GREEN), band('blanca', 188, '#ffffff')] } as never,
      frames: [...(base.frames ?? []), tab('t-azul', 10), tab('t-verde', 70), tab('t-papel', 130), tab('t-propia', 190, 'pestana-propia')],
    } as never],
  };
}

const MARKDOWN = `::::page{template="tema-cajas" tema="Retos del planeta"}
# El dinero y la vida de cada día

Cada familia necesita alimentos, ropa y una casa.

:::frame{slot="t-azul"}
Pestaña azul
:::

:::frame{slot="t-verde"}
Pestaña verde
:::

:::frame{slot="t-papel"}
Pestaña suelta
:::

:::frame{slot="t-propia"}
Pestaña propia
:::
::::
`;

function build(config: PostextConfig) {
  return buildDocument({ markdown: MARKDOWN, resources: PAGE8_RESOURCES }, config, createMeasurementCache());
}

describe('contrast of frame text over template decoration (#908)', () => {
  it('reads white tab lettering on the decoration box under it, not on the paper', () => {
    const doc = build(tabsConfig());
    const pairs = contrastPairs(doc).filter((p) => p.color === '#ffffff');
    const ground = (text: string) => pairs.find((p) => p.text.startsWith(text))?.background;
    expect(ground('Pestaña azul')).toBe(BLUE);
    expect(ground('Pestaña verde')).toBe(GREEN);
    // Nothing under this one but the paper: white on white, as before.
    expect(ground('Pestaña suelta')).toBe('#ffffff');
    // A frame that paints its own box reads on it, whatever lies beneath.
    expect(ground('Pestaña propia')).toBe(NAVY);
    const low = contrastDocument(doc).filter((i) => i.kind === 'lowContrast');
    expect(low.map((i) => i.text)).toEqual(['Pestaña suelta']);
    expect(low[0]).toMatchObject({ color: '#ffffff', background: '#ffffff' });
  });

  it('follows a turned frame onto the sheet before it reads the ground', () => {
    const doc = build(tabsConfig({ rotate: 4 }));
    const pairs = contrastPairs(doc).filter((p) => p.color === '#ffffff');
    expect(pairs.find((p) => p.text.startsWith('Pestaña azul'))?.background).toBe(BLUE);
    expect(pairs.find((p) => p.text.startsWith('Pestaña verde'))?.background).toBe(GREEN);
  });

  it('reads the decoration’s own text on the decoration under it', () => {
    const config = tabsConfig();
    const tpl = config.pageTemplates![0]!;
    const elements = [...(tpl.decoration as { elements: unknown[] }).elements, {
      kind: 'text', id: 'sello', content: 'Sello', fontSize: pt(9), color: hex('#ffffff'),
      placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(70), y: mm(15) } },
    }];
    const doc = build({ ...config, pageTemplates: [{ ...tpl, decoration: { elements } } as never] });
    expect(contrastPairs(doc).find((p) => p.text === 'Sello')?.background).toBe(GREEN);
  });

  it('leaves the p. 8 stand-in with no low-contrast frame text', () => {
    for (const locale of ['es', 'en'] as const) {
      const doc = buildDocument({ markdown: page8Fixture(locale).markdown, resources: PAGE8_RESOURCES }, { ...PAGE8_CONFIG, locale }, createMeasurementCache());
      // The white theme name stands on the full-bleed picture: skipped, as
      // any text over a picture is.
      expect(contrastPairs(doc).some((p) => p.text.startsWith(locale === 'es' ? 'Retos' : 'Planet'))).toBe(false);
      expect(contrastDocument(doc).filter((i) => i.kind === 'lowContrast')).toEqual([]);
    }
  });
});
