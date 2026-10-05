import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource, VDTBlock } from 'postext';
import { renderToPdf } from '../pdf-backend';

// A picture cropped within its safe area (#442) is drawn whole at its
// uncropped box, clipped to the body.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);
// 480 × 633 px.
const photo = fs.readFileSync(new URL('../../../../apps/web/public/presets/deep-sky/thumbnail.jpg', import.meta.url));

class StubCtx {
  font = '';
  letterSpacing = '0px';
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
  page: { width: pt(400), height: pt(560), dpi: 72, margins: { top: pt(30), bottom: pt(30), left: pt(30), right: pt(30) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Lora', fontSize: pt(11), lineHeight: pt(16), hyphenation: { enabled: false } },
  headings: { balancing: { enabled: false } },
};
const para = 'The plate below shows the field the survey mapped, with the cluster at its heart and a wide margin of sky around it on every side. ';
const plate: Resource = {
  id: 'plate',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'A survey field.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'photo.jpg', format: 'jpeg', width: 480, height: 633 },
  placement: { position: 'here' },
  safeArea: { x: 0.1, y: 0.25, width: 0.8, height: 0.45 },
};

function contentOps(pdf: PDFDocument, pageIndex: number): string {
  const contents = pdf.getPage(pageIndex).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

describe('safe area in the PDF', () => {
  it('clips a cropped picture to its body and draws it whole around it', async () => {
    const doc = buildDocument(
      { markdown: `${para.repeat(3)}\n\n${para.repeat(2)}\n\n::resource{id="plate"}\n\n${para}`, resources: [plate] },
      config,
    );
    let figure: VDTBlock | undefined;
    for (const page of doc.pages) for (const col of page.columns) for (const b of col.blocks) if (b.type === 'resource') figure = b;
    const rb = figure!.resourceBlock!;
    // Kept on the first page, cropped top and bottom within its safe area.
    expect(figure!.pageIndex).toBe(0);
    const src = rb.bodySource!;
    expect(src.width).toBe(1);
    expect(src.height).toBeLessThan(1);

    const bytes = await renderToPdf(doc, { fontProvider, resourceBytes: () => new Uint8Array(photo) });
    if (process.env.SAFE_AREA_PDF) fs.writeFileSync(process.env.SAFE_AREA_PDF, bytes);
    const ops = contentOps(await PDFDocument.load(bytes), 0);
    const b = { ...rb.bodyRect, x: figure!.bbox.x + rb.bodyRect.x, y: figure!.bbox.y + rb.bodyRect.y };
    const n = (v: number) => +v.toFixed(2);
    // q, the body as the clip, then the image scaled to the uncropped height.
    const fullHeight = b.height / src.height;
    const clip = new RegExp(`q\\s+${n(b.x)} ${n(560 - b.y - b.height)} ${n(b.width)} ${n(b.height)} re\\s+W\\s+n`);
    expect(ops).toMatch(clip);
    const matrix = new RegExp(`${clip.source}[\\s\\S]*?([\\d.]{2,}) 0 0 ([\\d.]{2,}) 0 0 cm[\\s\\S]*?Do\\s+Q`).exec(ops);
    expect(Number(matrix![1])).toBeCloseTo(b.width, 2);
    expect(Number(matrix![2])).toBeCloseTo(fullHeight, 2);
    // No empty figure content left before the clip.
    expect(ops).not.toMatch(/\/Figure <<\s*\/MCID \d+\s*>> BDC\s*EMC/);
  });
});
