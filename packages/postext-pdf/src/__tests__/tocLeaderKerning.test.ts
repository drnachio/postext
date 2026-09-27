import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument, VDTLineSegment } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// EF-148: a face that kerns full stops apart sets a run of them wider than
// its count of single dots. Cormorant Garamond does (a dot in a run of 30
// is 1.29 times a lone one). The leader was counted from one dot and ran
// from the title into the page number; it is now fitted as a whole run,
// and the PDF paints it where the layout put it, at its kerned width.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/CormorantGaramond.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);
const face = fontkit.create(fontBytes);

/** Canvas stand-in: every string measured as the face shapes it (kerning
 *  included), whatever the family asked for. */
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    return { width: (face.layout(s).advanceWidth / face.unitsPerEm) * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const FAMILY = 'Cormorant Garamond';
const config: PostextConfig = {
  page: { dpi: 72, width: pt(360), height: pt(400), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: FAMILY },
  headings: { fontFamily: FAMILY, levels: [{ level: 1, breakBefore: { enabled: false, parity: 'any' } }] },
  headingStyles: [{ id: 'front', numbered: false, toc: false }],
  toc: { levels: [{ level: 1, fontFamily: FAMILY, fontSize: pt(12) }, { level: 2, fontFamily: FAMILY }], pageNumber: { fontFamily: FAMILY } },
};
const markdown = ['# Contents {style="front"}', ':::toc', '# One', 'Text.', '## A', 'Text.', '## Bb', 'Text.'].join('\n\n');

async function contentOf(doc: VDTDocument): Promise<string> {
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: false }));
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

const sum = (segs: readonly VDTLineSegment[]) => segs.reduce((s, seg) => s + seg.width, 0);

describe('contents leaders in a face that kerns its dots (EF-148)', () => {
  it('fits every row to the column and paints its dots and page number where the layout put them', async () => {
    const doc = buildDocument({ markdown }, config);
    const col = doc.pages[0]!.columns[0]!;
    const rows = doc.blocks.filter((b) => b.tocEntry !== undefined && b.pageIndex === 0);
    expect(rows).toHaveLength(3);
    const content = await contentOf(doc);
    const xs = [...content.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)].map((m) => Number(m[1]));
    const dotEnds: number[] = [];
    for (const row of rows) {
      const line = row.lines.at(-1)!;
      const segs = line.segments!;
      expect(line.bbox.x + sum(segs)).toBeCloseTo(col.bbox.x + col.bbox.width, 3);
      const at = segs.findIndex((s) => s.kind === 'text' && /^\.+$/.test(s.text));
      expect(at).toBeGreaterThan(0);
      const dotsX = line.bbox.x + sum(segs.slice(0, at));
      const labelX = line.bbox.x + sum(segs.slice(0, -1));
      // The layout width of the dots is the face's shaped width of the run.
      const size = parseFontString(segs[at]!.fontString!)!.sizePx;
      expect(segs[at]!.width).toBeCloseTo((face.layout(segs[at]!.text).advanceWidth / face.unitsPerEm) * size, 3);
      expect(dotsX + segs[at]!.width).toBeLessThanOrEqual(labelX + 0.01);
      dotEnds.push(dotsX + segs[at]!.width);
      // 72 dpi: px = pt, so the PDF places both runs at the same x.
      expect(xs.some((x) => Math.abs(x - dotsX) < 0.01)).toBe(true);
      expect(xs.some((x) => Math.abs(x - labelX) < 0.01)).toBe(true);
    }
    // The two level-2 rows (the number's room is in ems of the entry size,
    // so the level-1 row ends its dots elsewhere).
    expect(dotEnds[2]).toBeCloseTo(dotEnds[1]!, 3);
  }, 60_000);
});
