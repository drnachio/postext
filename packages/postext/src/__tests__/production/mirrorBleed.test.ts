import { describe, it, expect } from 'vitest';
import { caseSheet, coverPage, resolveBindingMeasures, softcoverSheet } from '../../production/index.js';
import { mirrorBands, mirrorBleedSvg } from '../../production/mirrorBleed.js';

// The SVG draws the design at x' = scale · x + shift: a band's point x'
// shows the design's point x = (x' − shift) / scale.
const map = (b: { scale: number; shift: number }, x: number) => (x - b.shift) / b.scale;

describe('mirrorBands', () => {
  it('folds the margin strip out to the edge: reflected, copied, reflected', () => {
    // Trim from 20 to 120 on a 140 mm sheet, a 5 mm design margin: the
    // design runs 15 … 125; 15 mm before it and 15 after, in three bands.
    const { designed, before, after } = mirrorBands(20, 120, 140, 5);
    expect(designed).toEqual([15, 125]);
    expect(before.map((b) => [b.from, b.to, b.scale])).toEqual([[10, 15, -1], [5, 10, 1], [0, 5, -1]]);
    expect(after.map((b) => [b.from, b.to, b.scale])).toEqual([[125, 130, -1], [130, 135, 1], [135, 140, -1]]);
    // Each band shows the margin strip next to the design's edge.
    for (const b of before) {
      const src = [map(b, b.from), map(b, b.to)].sort((p, q) => p - q);
      expect(src[0]).toBeCloseTo(15, 6);
      expect(src[1]).toBeCloseTo(20, 6);
    }
    for (const b of after) {
      const src = [map(b, b.from), map(b, b.to)].sort((p, q) => p - q);
      expect(src[0]).toBeCloseTo(120, 6);
      expect(src[1]).toBeCloseTo(125, 6);
    }
    // The first reflection meets the design edge on itself.
    expect(map(before[0]!, 15)).toBeCloseTo(15, 6);
    expect(map(after[0]!, 125)).toBeCloseTo(125, 6);
  });

  it('leaves nothing to fill when the bleed is within the margin', () => {
    const { before, after } = mirrorBands(3, 103, 106, 5);
    expect(before).toEqual([]);
    expect(after).toEqual([]);
  });
});

describe('mirrorBleedSvg', () => {
  it('fills every band round the design, the corners turned half round', () => {
    const out = mirrorBleedSvg({ width: 50, height: 50, trim: { x: 10, y: 10, width: 30, height: 30 } }, 5, '<rect width="1" height="1"/>')!;
    expect(out.designed).toEqual({ x: 5, y: 5, width: 40, height: 40 });
    // One band before and after on each axis: 3 × 3 − 1 = 8 pieces.
    expect(out.svg.match(/<use /g)!.length).toBe(8);
    // A corner: reflected on both axes (the mirror of the mirror).
    expect(out.svg).toContain('matrix(-1 0 0 -1 10 10)');
    expect(out.svg).toContain('<g id="mirror-content"><rect width="1" height="1"/></g>');
    expect(mirrorBleedSvg({ width: 50, height: 50, trim: { x: 3, y: 3, width: 44, height: 44 } }, 5, 'x')).toBeUndefined();
  });
});

describe('coverPage with a mirror bleed', () => {
  const trim = { width: 150, height: 230 };
  const ink = (hex: string) => ({ hex, model: 'hex' as const });

  it('mirrors a case’s background and elements into its turn-in, under the text', () => {
    const m = resolveBindingMeasures({ id: 'c', name: 'C', style: 'caseFlat' }, trim);
    const sheet = caseSheet(trim, 26, m);
    const cover = coverPage(sheet, {
      mirrorMargin: m.designMargin,
      mirrorPictures: { photo: { href: 'data:image/png;base64,AAAA', width: 100, height: 50 } },
      design: {
        background: ink('#123456'),
        image: { resourceId: 'photo', area: 'front' },
        elements: [{ id: 'dot', kind: 'box', color: ink('#ff0000'), zone: 'front', x: -3, y: -3, width: 10, height: 10 }],
        logos: [{ id: 'logo', kind: 'image', resourceId: 'seal', zone: 'front', x: 10, y: 10, width: 10, height: 10, clearance: 2 }],
      },
    });
    expect(cover.designed).toEqual({ x: m.turnIn - 5, y: m.turnIn - 5, width: sheet.trim.width + 10, height: sheet.trim.height + 10 });
    const ids = cover.template.decoration!.elements.map((e) => ('id' in e ? e.id : ''));
    // After the background and elements, before what goes over the text.
    expect(ids.indexOf('cover-mirror')).toBe(ids.indexOf('cover-el-dot') + 1);
    expect(ids.indexOf('cover-mirror')).toBeLessThan(ids.indexOf('cover-logo-logo'));
    const svg = new TextDecoder().decode(cover.files['cover-mirror.svg']);
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('href="data:image/png;base64,AAAA"');
    // Logos, texts and finishes are never mirrored.
    expect(svg).not.toContain('seal');
    expect(cover.resources.map((r) => r.id)).toContain('cover-mirror');
  });

  it('paints an element that keeps its own bleed over the mirror, and folds the rest', () => {
    const m = resolveBindingMeasures({ id: 'c', name: 'C', style: 'caseFlat' }, trim);
    const sheet = caseSheet(trim, 26, m);
    const cover = coverPage(sheet, {
      mirrorMargin: m.designMargin,
      design: {
        background: ink('#123456'),
        elements: [
          { id: 'photo', kind: 'box', color: ink('#00ff00'), zone: 'front', x: -12, y: -12, width: 60, height: 60, bleed: 'own' },
          { id: 'dot', kind: 'box', color: ink('#ff0000'), zone: 'front', x: 40, y: 40, width: 10, height: 10 },
        ],
      },
    });
    const ids = cover.template.decoration!.elements.map((e) => ('id' in e ? e.id : ''));
    expect(ids.indexOf('cover-el-photo')).toBe(ids.indexOf('cover-mirror') + 1);
    expect(ids.indexOf('cover-el-dot')).toBeLessThan(ids.indexOf('cover-mirror'));
    const svg = new TextDecoder().decode(cover.files['cover-mirror.svg']);
    expect(svg).not.toContain('#00ff00');
    expect(svg).toContain('#ff0000');
  });

  it('folds a shape of colour out with its outline', () => {
    const m = resolveBindingMeasures({ id: 'c', name: 'C', style: 'caseFlat' }, trim);
    const cover = coverPage(caseSheet(trim, 26, m), {
      mirrorMargin: m.designMargin,
      design: { elements: [{ id: 'leaf', kind: 'shape', color: ink('#ff0000'), outline: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }]], zone: 'front', x: -5, y: 0, width: 20, height: 20 }] },
    });
    const svg = new TextDecoder().decode(cover.files['cover-mirror.svg']);
    // The triangle in sheet mm, at the shape's box.
    expect(svg).toMatch(/<path d="M [\d.]+ [\d.]+ L [\d.]+ [\d.]+ L [\d.]+ [\d.]+ Z" fill="#ff0000"\/>/);
  });

  it('adds no mirror where the bleed is within the design margin', () => {
    const m = resolveBindingMeasures({ id: 'p', name: 'P', style: 'perfect' }, trim);
    const cover = coverPage(softcoverSheet(trim, 20, m, false), { mirrorMargin: m.designMargin, design: { background: ink('#123456') } });
    expect(cover.designed).toBeUndefined();
    expect(cover.resources).toEqual([]);
  });
});

describe('a picture the mirror cannot draw', () => {
  it('leaves the design to run to the edge, and says which picture', () => {
    const trim = { width: 150, height: 230 };
    const m = resolveBindingMeasures({ id: 'c', name: 'C', style: 'caseFlat' }, trim);
    const cover = coverPage(caseSheet(trim, 26, m), {
      mirrorMargin: m.designMargin,
      design: { background: { hex: '#123456', model: 'hex' }, image: { resourceId: 'vector-art' } },
    });
    expect(cover.designed).toBeUndefined();
    expect(cover.mirrorSkipped).toEqual(['vector-art']);
    expect(cover.resources).toEqual([]);
  });
});
