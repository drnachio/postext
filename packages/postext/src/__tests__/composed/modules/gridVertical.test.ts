/**
 * A grid on a vertical page (#1078): a frame set of a box and a picture
 * anchored inside it, repeated down a vertical-rl composed page. The
 * picture of a frame of the page's own mode stands upright (#971); the
 * frame was laid as tall (across the lines) as the picture measured, but
 * the picture was set two lines smaller in it, so a grid row, which counts
 * the frame, was wider than what it showed, and the last row ran past the
 * grid's foot, where the ladder scaled its picture down.
 */
import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, Resource, VDTBlock, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';
import { installSizedStub } from '../../vertical/stub.js';

installSizedStub();

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const DPI = 150;
const MM = DPI / 25.4;
/** Three 4:3 paintings of 720 × 540 px at 330 ppi: 55.4 × 41.6 mm. */
const PICTURES: Resource[] = ['uno', 'dos', 'tres'].map((id) => ({
  id, typeId: 'dibujo', kind: 'bitmap', altText: 'A painting', caption: '', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: `${id}.jpg`, format: 'jpeg', width: 720, height: 540, resolution: 330 },
} as Resource));
const item = (k: number): string =>
  `:::frame{slot="uso" label="第${k}"}\n${'河水流进一行行庄稼中间。'.repeat(4)}\n\n:::figure{resource="${PICTURES[k - 1]!.id}" slot="uso-foto"}\n:::\n:::\n`;
const MARKDOWN = `::::page{template="usos"}\n${[1, 2, 3].map(item).join('\n')}::::\n`;

/** The page: 210 × 280 mm, its type area 184 mm across the lines of a
 *  vertical page and 244 mm along them. A box per use, a picture `pic` mm
 *  along the lines at the end of its first lines (8 mm in from the box's
 *  start), the grid 8 mm between rows. */
const config = (mode: 'vertical-rl' | 'horizontal-tb', pic: number, extra: { rowGap?: number } = {}): PostextConfig => {
  const measure = mode === 'vertical-rl' ? 244 : 184;
  return {
    page: { sizePreset: 'custom', width: mm(210), height: mm(280), dpi: DPI, margins: { top: mm(18), bottom: mm(18), left: mm(14), right: mm(12) } },
    layout: { layoutType: 'single', writingMode: mode },
    bodyText: { fontFamily: 'Test Serif', fontSize: pt(12), lineHeight: pt(21), textAlign: 'left' },
    headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
    locale: 'zh-Hans',
    resourceTypes: [{ id: 'dibujo', name: 'Dibujo', shortLabel: '', numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal', captionPrefix: '', defaultPlacement: { position: 'here' } }],
    calloutStyles: [{ id: 'dato', backgroundEnabled: true, background: hex('#fcefd2'), border: { enabled: false }, padding: { top: mm(3.4), right: mm(5), bottom: mm(4), left: mm(5) } }],
    pageTemplates: [{
      id: 'usos',
      frames: [
        { name: 'uso', style: 'dato', width: mm(measure), minHeight: mm(52), padding: { right: mm(pic + 8) } },
        { name: 'uso-foto', layer: 2, width: mm(pic), exclude: 'push', placement: { anchor: { to: '#uso', edge: 'top-right' }, offset: { x: mm(-5), y: mm(8) } } },
      ],
      groups: [{
        name: 'usos', kind: 'grid', columns: 1, rowGap: mm(extra.rowGap ?? 8), rowAlign: 'start', repeat: { frames: ['uso', 'uso-foto'] },
        placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: mm(measure), height: 'fill' } },
      }],
    }],
  } as unknown as PostextConfig;
};
const build = (mode: 'vertical-rl' | 'horizontal-tb', pic: number, extra?: { rowGap?: number }): VDTDocument =>
  buildDocument({ markdown: MARKDOWN, resources: PICTURES }, config(mode, pic, extra), createMeasurementCache());
const composedPage = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frameOf = (page: VDTPage, name: string): VDTFrame => page.composed!.frames.find((f) => f.name === name)!;
const pictureOf = (page: VDTPage, name: string): VDTBlock =>
  frameOf(page, name).blockIds.map((id) => page.floats!.find((b) => b.id === id)!).find((b) => b?.resourceBlock)!;

describe('a grid of boxes with a picture on a vertical page (#1078)', () => {
  it('sets each picture as large as its frame measured it: the frame shows what it takes', () => {
    const page = composedPage(build('vertical-rl', 44));
    for (const n of [1, 2]) {
      const frame = frameOf(page, `uso-foto[${n}]`);
      const picture = pictureOf(page, `uso-foto[${n}]`);
      // In the flow, the picture's extent across the lines is the frame's.
      expect(picture.bbox.height).toBeCloseTo(frame.rect.height, 1);
      // Upright, at its own size (55.4 × 41.6 mm): the 44 mm along the
      // lines hold its height.
      expect(picture.resourceBlock!.rotation!.width / MM).toBeCloseTo(720 / 330 * 25.4, 0);
    }
  });

  it('lays its rows at the template\'s rowGap, each as wide as its box and picture, and scales no picture', () => {
    // A picture 30 mm along the lines stands 40 mm across them, inside its
    // 52 mm box: three rows and two gaps of 8 mm fit the 184 mm.
    const page = composedPage(build('vertical-rl', 30));
    const boxes = [1, 2, 3].map((n) => frameOf(page, `uso[${n}]`));
    const pictures = [1, 2, 3].map((n) => pictureOf(page, `uso-foto[${n}]`));
    for (let k = 1; k < 3; k++) {
      const prev = boxes[k - 1]!.rect;
      expect(boxes[k]!.rect.y - (prev.y + prev.height)).toBeCloseTo(8 * MM, 1);
    }
    for (const [k, p] of pictures.entries()) {
      const box = boxes[k]!.rect;
      expect(p.bbox.y + p.bbox.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
      expect(p.bbox.height).toBeCloseTo(pictures[0]!.bbox.height, 3);
      expect(p.resourceBlock!.rotation!.width / MM).toBeCloseTo(40, 0);
    }
    for (const n of [1, 2, 3]) expect(frameOf(page, `uso-foto[${n}]`).overflowPx).toBe(0);
  });

  it('a row counts a picture that hangs past its box, as on a horizontal page', () => {
    // 44 mm along the lines leave the picture its own size, 55.4 mm across
    // them: 8 + 55.4 mm, past the 52 mm box. The next row starts past it.
    const page = composedPage(build('vertical-rl', 44));
    const pic1 = frameOf(page, 'uso-foto[1]').rect;
    expect(frameOf(page, 'uso[2]').rect.y).toBeCloseTo(pic1.y + pic1.height + 8 * MM, 1);
  });

  it('leaves a horizontal page as it was: the picture inside its box, rows a box and a gap apart', () => {
    const page = composedPage(build('horizontal-tb', 56));
    const boxes = [1, 2, 3].map((n) => frameOf(page, `uso[${n}]`).rect);
    for (let k = 1; k < 3; k++) expect(boxes[k]!.y - (boxes[k - 1]!.y + boxes[k - 1]!.height)).toBeCloseTo(8 * MM, 1);
    const picture = pictureOf(page, 'uso-foto[1]');
    expect(picture.resourceBlock!.rotation).toBeUndefined();
    expect(picture.bbox.height).toBeCloseTo(frameOf(page, 'uso-foto[1]').rect.height, 1);
  });
});
