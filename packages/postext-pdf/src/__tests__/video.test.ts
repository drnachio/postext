import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFString, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource, VDTBlock } from 'postext';
import { renderToPdf } from '../pdf-backend';

// A video resource (#454) prints as its poster frame with the play mark and
// the QR code drawn as vectors over it, and the poster links to the video.

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

const talk = (over: Partial<Resource> = {}): Resource => ({
  id: 'talk',
  typeId: 'video',
  kind: 'video',
  caption: 'The keeper explains the lamp.',
  altText: 'A lighthouse keeper beside the lamp',
  createdAt: 0,
  updatedAt: 0,
  video: { source: 'vimeo', url: 'https://vimeo.com/76979871', poster: { fileId: 'poster.jpg', format: 'jpeg', width: 480, height: 633 } },
  placement: { position: 'here' },
  ...over,
});

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

function uriAnnots(pdf: PDFDocument, pageIndex = 0): { uri: string; rect: number[]; contents?: string; structParent?: number }[] {
  const annots = pdf.getPage(pageIndex).node.lookup(PDFName.of('Annots'));
  if (!(annots instanceof PDFArray)) return [];
  const out: { uri: string; rect: number[]; contents?: string; structParent?: number }[] = [];
  for (let i = 0; i < annots.size(); i++) {
    const a = annots.lookup(i);
    if (!(a instanceof PDFDict)) continue;
    const action = a.lookup(PDFName.of('A'));
    if (!(action instanceof PDFDict)) continue;
    const uri = action.lookup(PDFName.of('URI'));
    const rect = a.lookup(PDFName.of('Rect'));
    const contents = a.lookup(PDFName.of('Contents'));
    const sp = a.lookup(PDFName.of('StructParent'));
    out.push({
      uri: uri instanceof PDFString || uri instanceof PDFHexString ? uri.decodeText() : String(uri),
      rect: rect instanceof PDFArray ? rect.asArray().map((n) => (n as PDFNumber).asNumber()) : [],
      ...(contents instanceof PDFHexString || contents instanceof PDFString ? { contents: contents.decodeText() } : {}),
      ...(sp instanceof PDFNumber ? { structParent: sp.asNumber() } : {}),
    });
  }
  return out;
}

const firstResource = (doc: ReturnType<typeof buildDocument>): VDTBlock => {
  for (const page of doc.pages) for (const col of page.columns) for (const b of col.blocks) if (b.type === 'resource') return b;
  throw new Error('no resource');
};

describe('video resources in the PDF', () => {
  it('draws the poster, the play mark and the QR code, and links the poster to the video', async () => {
    const doc = buildDocument({ markdown: '::resource{id="talk"}', resources: [talk()] }, config);
    const block = firstResource(doc);
    const rb = block.resourceBlock!;
    const bytes = await renderToPdf(doc, { fontProvider, resourceBytes: () => new Uint8Array(photo), accessible: true });
    if (process.env.VIDEO_PDF) fs.writeFileSync(process.env.VIDEO_PDF, bytes);
    const pdf = await PDFDocument.load(bytes);
    const ops = contentOps(pdf, 0);
    // The poster as an image XObject.
    expect(ops).toMatch(/\/Image-\d+ Do/);
    // The QR code: one filled path of many module rectangles.
    const qr = rb.video!.qr!;
    expect(qr.text).toBe('https://vimeo.com/76979871');
    expect((ops.match(/ l\n/g) ?? []).length).toBeGreaterThan(100);
    const [annot] = uriAnnots(pdf);
    expect(annot!.uri).toBe('https://vimeo.com/76979871');
    // Over the poster: the body in points (72 dpi, so px = pt), bottom-up.
    const x = block.bbox.x + rb.bodyRect.x;
    const y = block.bbox.y + rb.bodyRect.y;
    expect(annot!.rect.map((n) => +n.toFixed(2))).toEqual([x, 560 - y - rb.bodyRect.height, x + rb.bodyRect.width, 560 - y].map((n) => +n.toFixed(2)));
    // Tagged: the link joins the figure's structure, with its contents.
    expect(annot!.contents).toContain('A lighthouse keeper beside the lamp');
    expect(annot!.structParent).toBeTypeOf('number');
  });

  it('prints no link and no QR code when the style turns them off', async () => {
    const doc = buildDocument(
      { markdown: '::resource{id="talk"}', resources: [talk()] },
      { ...config, videoStyle: { linkPoster: false, qr: { enabled: false }, playMark: { enabled: false } } },
    );
    const bytes = await renderToPdf(doc, { fontProvider, resourceBytes: () => new Uint8Array(photo) });
    const pdf = await PDFDocument.load(bytes);
    expect(uriAnnots(pdf)).toEqual([]);
    expect((contentOps(pdf, 0).match(/ l\n/g) ?? []).length).toBeLessThan(20);
  });

  it('draws a dark frame for a video without a poster', async () => {
    const r = talk();
    delete r.video!.poster;
    const doc = buildDocument({ markdown: '::resource{id="talk"}', resources: [r] }, config);
    const missing: string[] = [];
    const bytes = await renderToPdf(doc, { fontProvider, onWarning: (w) => missing.push(w.kind) });
    expect(missing).not.toContain('missingImage');
    const ops = contentOps(await PDFDocument.load(bytes), 0);
    expect(ops).toMatch(/0\.1215\d* 0\.1215\d* 0\.1215\d* rg/);
  });
});
