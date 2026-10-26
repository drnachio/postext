/**
 * A styled frame that grows with the frames laid inside it (#1117): three
 * photos with their captions in a labelled box, the page's text under the
 * box. With the captions 30 % longer (the stress the porting skill's
 * `composed_check --stress 1.3` lays), the box grows to hold them and the
 * text under it moves down: no caption leaves the box, nothing covers.
 */
import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { growMembers, grownHeight } from '../../../composed/grow.js';
import { resolvePageTemplate } from '../../../composed/templates.js';
import { validatePageTemplates } from '../../../composed/validate.js';
import type { FrameConfig, PageTemplate } from '../../../composed/types.js';
import type { ContentWarning, PostextConfig, Resource, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const CONFIG: PostextConfig = {
  page: { width: mm(210), height: mm(280), dpi: 300, margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
  bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0) } as never,
  calloutStyles: [{
    id: 'caja', backgroundEnabled: true, background: hex('#e8f1fb'),
    border: { enabled: true, color: hex('#1d4f91') }, padding: { top: mm(4), right: mm(4), bottom: mm(3), left: mm(4) },
    label: { color: hex('#ffffff'), background: hex('#1d4f91'), height: mm(6), paddingX: mm(3) },
  }] as never,
};
const PHOTOS: Resource[] = ['heron', 'otter', 'willow'].map((id) => ({
  id, typeId: 'figure', kind: 'bitmap', altText: id, caption: '', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: `${id}.jpg`, format: 'jpeg', width: 600, height: 400, resolution: 300 },
})) as Resource[];

const top = (to: string, x: number, y: number): FrameConfig['placement'] => ({ anchor: { to: `#${to}`, edge: 'top-left' } as never, offset: { x: mm(x), y: mm(y) } });
const below = (to: string, y: number): FrameConfig['placement'] => ({ anchor: { to: `#${to}`, edge: 'below' } as never, offset: { y: mm(y) } });
const frames = (box: Partial<FrameConfig> = {}): FrameConfig[] => [
  { name: 'box', style: 'caja', width: mm(180), placement: { anchor: { to: 'container', edge: 'top-left' } }, ...box },
  ...[0, 1, 2].flatMap((k): FrameConfig[] => [
    { name: `photo${k + 1}`, width: mm(52), height: mm(35), placement: top('box', 4 + k * 58, 10) },
    { name: `caption${k + 1}`, width: mm(36), placement: below(`photo${k + 1}`, 2) },
  ]),
  { name: 'text', flow: true, width: mm(180), placement: below('box', 1) },
];
const CAPTIONS = [
  'A grey heron waits at the edge of the mill pond. It stands still for an hour before it strikes, and the fish never see it coming. The miller counts them each May.',
  'An otter swims under the old bridge at dusk. The family lives in the bank below the mill and comes out when the wheel stops. Its tracks show in the mud.',
  'The willows lean over the water by the lock. Their roots hold the bank together when the river rises in the spring. Some are older than the mill.',
];
const BODY = 'The river rises after the spring rains and falls again by midsummer. The mill keeps a record of each season.';
/** `text` some 30 % longer: its words again, as many as it takes. */
const stretch = (text: string, factor: number): string => {
  const words = text.split(' ');
  const extra = Math.ceil(words.length * (factor - 1));
  return [...words, ...words.slice(0, extra)].join(' ');
};
const markdown = (factor = 1): string => [
  '::::page{template="ficha"}',
  ':::frame{slot="box" label="Along the river"}',
  ':::',
  '',
  ...[0, 1, 2].flatMap((k) => [
    `::resource{id="${PHOTOS[k]!.id}" slot="photo${k + 1}"}`, '',
    `:::frame{slot="caption${k + 1}"}`, stretch(CAPTIONS[k]!, factor), ':::', '',
  ]),
  stretch(BODY, factor),
  '::::',
].join('\n');
const build = (box: Partial<FrameConfig>, factor = 1): VDTDocument =>
  buildDocument({ markdown: markdown(factor), resources: PHOTOS }, { ...CONFIG, pageTemplates: [{ id: 'ficha', frames: frames(box) } as PageTemplate] }, createMeasurementCache());
const page = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frame = (doc: VDTDocument, name: string): VDTFrame => page(doc).composed!.frames.find((f) => f.name === name)!;
const foot = (r: { y: number; height: number }): number => r.y + r.height;
const overlaps = (doc: VDTDocument): ContentWarning[] => (doc.contentWarnings ?? []).filter((w) => w.kind === 'frameCovered' || w.kind === 'frameOutsideArea' || w.kind === 'frameOverflow');
const mmPx = 300 / 25.4;

describe("growWith: 'children' (#1117)", () => {
  it('without it, longer captions leave the box and run onto the text under it', () => {
    // The box sized to hold the captions as written, as a port sizes it.
    const held = frame(build({ growWith: 'children' }), 'box').rect.height;
    const doc = build({ minHeight: mm(held / mmPx) }, 1.3);
    const box = frame(doc, 'box');
    const lowest = Math.max(...[1, 2, 3].map((k) => foot(frame(doc, `caption${k}`).rect)));
    expect(lowest).toBeGreaterThan(foot(box.rect));
    expect(overlaps(doc).map((w) => w.kind)).toContain('frameCovered');
  });

  it('with it, the box holds its captions under the 1.3 stress and the text moves down', () => {
    const plain = build({ growWith: 'children' });
    const doc = build({ growWith: 'children' }, 1.3);
    const box = frame(doc, 'box');
    const pad = 3 * mmPx;
    const lowest = Math.max(...[1, 2, 3].map((k) => foot(frame(doc, `caption${k}`).rect)));
    // The box ends at the lowest caption's foot and its bottom padding.
    expect(foot(box.rect)).toBeCloseTo(lowest + pad, 0);
    expect(box.rect.height).toBeGreaterThan(frame(plain, 'box').rect.height);
    // The text stands under it, as far below as the template says.
    expect(frame(doc, 'text').rect.y).toBeCloseTo(foot(box.rect) + 1 * mmPx, 0);
    expect(overlaps(doc)).toEqual([]);
  });

  it('the box’s fill is drawn at its grown height', () => {
    const doc = build({ growWith: 'children' }, 1.3);
    const box = frame(doc, 'box');
    const block = page(doc).floats!.find((b) => b.id === box.blockIds[0])!;
    const fill = block.designOverlay!.blocks.find((b) => b.kind === 'box' && b.box.backgroundColor === '#e8f1fb')!;
    expect(foot(fill.bbox)).toBeCloseTo(foot(box.rect), 0);
  });

  it('a box tall enough already keeps its height', () => {
    const doc = build({ growWith: 'children', minHeight: mm(120) });
    expect(frame(doc, 'box').rect.height).toBeCloseTo(120 * mmPx, 0);
  });

  it('a list of names grows with those only', () => {
    const doc = build({ growWith: ['photo1', 'caption1'] }, 1.3);
    const box = frame(doc, 'box');
    expect(foot(box.rect)).toBeCloseTo(foot(frame(doc, 'caption1').rect) + 3 * mmPx, 0);
  });

  it('a page with no growWith lays as before', () => {
    const a = build({});
    const b = build({ growWith: undefined });
    expect(page(a).composed!.frames.map((f) => f.rect)).toEqual(page(b).composed!.frames.map((f) => f.rect));
  });
});

describe('growMembers and grownHeight (#1117)', () => {
  const resolved = (box: Partial<FrameConfig>) => resolvePageTemplate({ pageTemplates: [{ id: 'ficha', frames: frames(box) } as PageTemplate] }, 'ficha')!;
  it("'children': the frames anchored to the box's top side, and those anchored to them", () => {
    const tpl = resolved({ growWith: 'children' });
    const m = growMembers(tpl, tpl.frames[0]!);
    expect(m.frames.sort()).toEqual(['caption1', 'caption2', 'caption3', 'photo1', 'photo2', 'photo3']);
    // The text anchored below the box is no member.
    expect(m.frames).not.toContain('text');
  });

  it('a frame anchored to the box by its foot is no member', () => {
    const tpl = resolvePageTemplate({ pageTemplates: [{ id: 'ficha', frames: [
      { name: 'box', growWith: 'children' },
      { name: 'stamp', placement: { anchor: { to: '#box', edge: 'bottom-right' } } },
    ] } as PageTemplate] }, 'ficha')!;
    expect(growMembers(tpl, tpl.frames[0]!).frames).toEqual([]);
  });

  it('the height: down to the lowest foot and the padding, only when taller', () => {
    expect(grownHeight({ x: 0, y: 10, width: 100, height: 50 }, [{ x: 0, y: 20, width: 10, height: 60 }], 5)).toBe(75);
    expect(grownHeight({ x: 0, y: 10, width: 100, height: 80 }, [{ x: 0, y: 20, width: 10, height: 60 }], 5)).toBeUndefined();
    expect(grownHeight({ x: 0, y: 10, width: 100, height: 50 }, [], 5)).toBeUndefined();
  });
});

describe('growWith in the template checks (#1117)', () => {
  const warnings = (box: Record<string, unknown>) => validatePageTemplates({ ...CONFIG, pageTemplates: [{ id: 'ficha', frames: frames(box as Partial<FrameConfig>) } as PageTemplate] })
    .map((w) => [w.kind, w.path, w.value, w.suggestion]);
  it("'children' and names of the template pass", () => {
    expect(warnings({ growWith: 'children' })).toEqual([]);
    expect(warnings({ growWith: ['photo1', 'caption1'] })).toEqual([]);
  });
  it('another word, a name of no frame or group, the box itself, are reported', () => {
    expect(warnings({ growWith: 'childrn' })).toEqual([['unknownConfigValue', '/pageTemplates/0/frames/0/growWith', 'childrn', 'children']]);
    expect(warnings({ growWith: ['photo1', 'caption9', 'box'] })).toEqual([
      ['unknownConfigValue', '/pageTemplates/0/frames/0/growWith', 'caption9', 'caption1'],
      ['unknownConfigValue', '/pageTemplates/0/frames/0/growWith', 'box', undefined],
    ]);
    expect(warnings({ growWith: [3] })).toEqual([['unknownConfigValue', '/pageTemplates/0/frames/0/growWith/0', '3', undefined]]);
  });
});
