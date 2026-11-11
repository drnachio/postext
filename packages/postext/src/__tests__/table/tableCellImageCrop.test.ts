import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { renderToHtml } from '../../html-backend/html-backend.js';
import { documentDisplayList, type DisplayItem } from '../../paint/displayList/index.js';
import type { VDTDocument, VDTResourceTableCellImage } from '../../vdt.js';
import type { PostextConfig, Resource } from '../../types.js';

// A table cell's picture with a manual crop (`Resource.crop`, #1494).

// Deterministic text measurement stub (no DOM in the node test env).
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
const config: PostextConfig = {
  page: { dpi: 96, sizePreset: '17x24' },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  header: { elements: [] },
  footer: { elements: [] },
};

const picture = (crop?: Resource['crop']): Resource => ({
  id: 'pic', typeId: 'figure', kind: 'svg', caption: '', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'pic.svg', width: 800, height: 400 },
  ...(crop ? { crop } : {}),
});
const table: Resource = {
  id: 'tab', typeId: 'table', kind: 'table', caption: 'A table.', createdAt: 0, updatedAt: 0,
  placement: { position: 'here' },
  table: { model: { rows: [[{ content: 'A', isHeader: true }], [{ content: '', image: { resourceId: 'pic' } }]], headerRowCount: 1 } },
};

const build = (crop?: Resource['crop']): VDTDocument =>
  buildDocument({ markdown: 'Text.\n\n::resource{id="tab"}\n\nMore.', resources: [table, picture(crop)] }, config);
const cellImage = (doc: VDTDocument): VDTResourceTableCellImage => {
  for (const b of doc.blocks) {
    const img = b.resourceBlock?.table?.cells.find((c) => c.image)?.image;
    if (img) return img;
  }
  throw new Error('no cell image');
};

describe('a cropped picture in a table cell', () => {
  it('takes the crop’s ratio and carries the crop', () => {
    const whole = cellImage(build());
    const cropped = cellImage(build({ x: 0.25, y: 0, width: 0.5, height: 1 }));
    expect(whole.rect.height / whole.rect.width).toBeCloseTo(0.5, 3);
    expect(whole.crop).toBeUndefined();
    expect(cropped.rect.height / cropped.rect.width).toBeCloseTo(1, 3);
    expect(cropped.crop).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
  });

  it('ignores a crop that keeps the whole picture', () => {
    expect(cellImage(build({ x: 0, y: 0, width: 1, height: 1 })).crop).toBeUndefined();
  });

  it('is drawn cropped in the HTML: the whole picture fitted round the crop', () => {
    const url = { resourceImageUrl: () => 'pic.svg' } as never;
    const html = renderToHtml(build({ x: 0.25, y: 0, width: 0.5, height: 1 }), url);
    // Half the width shown from a quarter in: the left margin is half of
    // what is cut away.
    expect(html).toContain('object-fit:cover;object-position:50% 0%');
    expect(html).toMatch(/<img src="pic\.svg"/);
    expect(renderToHtml(build(), url)).not.toContain('object-fit:cover');
  });

  it('hands the crop to the display list (IDML, Word)', () => {
    const images = (doc: VDTDocument): DisplayItem[] => {
      const out: DisplayItem[] = [];
      const walk = (items: readonly DisplayItem[]) => {
        for (const i of items) {
          if (i.kind === 'table') for (const c of i.cells) if (c.image) out.push(c.image);
          if ('items' in i && Array.isArray((i as { items?: unknown }).items)) walk((i as unknown as { items: DisplayItem[] }).items);
        }
      };
      for (const p of documentDisplayList(doc)) walk(p.items);
      return out;
    };
    const [img] = images(build({ x: 0.25, y: 0, width: 0.5, height: 1 }));
    expect(img).toMatchObject({ kind: 'image', crop: { x: 0.25, y: 0, width: 0.5, height: 1 } });
    const [plain] = images(build());
    expect(plain && 'crop' in plain ? plain.crop : undefined).toBeUndefined();
  });
});
