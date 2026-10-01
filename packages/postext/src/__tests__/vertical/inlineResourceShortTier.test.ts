import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { flowRectToPage, type VDTBlock, type VDTDocument } from '../../vdt';
import type { PostextConfig, Dimension, Resource } from '../../types';
import { installSizedStub } from './stub';

installSizedStub();

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const P = '冰川缓缓向前推进，把谷底的岩石磨得光滑圆润，留下一道道擦痕与沟槽。';

/** Two tiers on a vertical page; the chapter heading spans both, so the
 *  tiers of the opener page are cut short beside it. */
const config: PostextConfig = {
  page: { width: pt(300), height: pt(420), margins: { top: pt(40), right: pt(30), bottom: pt(40), left: pt(30) } },
  bodyText: { fontSize: pt(10), lineHeight: pt(16) },
  layout: { writingMode: 'vertical-rl', layoutType: 'double', gutterWidth: pt(20) },
  headings: { levels: [{ level: 1, fontSize: pt(24), lineHeight: pt(32), span: 'page', marginBottom: pt(48) }] },
  locale: 'zh-Hans',
};

/** An SVG fills its slot: upright on a vertical page, as long as the flow
 *  is tall — the length of a whole tier's line run, more than the tiers
 *  cut short by the heading hold. */
const roche: Resource = {
  id: 'roche', typeId: 'figure', kind: 'svg', caption: '羊背石', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'roche.svg', width: 200, height: 120 }, placement: { position: 'here' },
};

function resourceOutside(doc: VDTDocument): string[] {
  const out: string[] = [];
  for (const page of doc.pages) {
    for (const c of page.columns) {
      for (const b of c.blocks as VDTBlock[]) {
        if (!b.resourceBlock) continue;
        const r = flowRectToPage(page, b.bbox);
        const off = r.x < -0.5 || r.y < -0.5 || r.x + r.width > page.width + 0.5 || r.y + r.height > page.height + 0.5;
        if (off || b.bbox.y + b.bbox.height > c.bbox.y + c.bbox.height + 0.5) out.push(`page ${page.index}, tier ${c.index}`);
      }
    }
  }
  return out;
}

describe('an in-flow resource at the end of a short tier (#288)', () => {
  it('moves on to a tier that holds it instead of running off the sheet', () => {
    let placed = 0;
    for (let n = 2; n <= 20; n++) {
      const markdown = `# 冰川\n\n${P.repeat(n)}羊背石：\n\n::resource{id="roche"}\n\n${P.repeat(6)}`;
      const doc = buildDocument({ markdown, resources: [roche] }, config);
      placed += doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks)).filter((b) => b.resourceBlock).length;
      expect(resourceOutside(doc), `${n} sentences`).toEqual([]);
    }
    expect(placed).toBe(19);
  });
});
