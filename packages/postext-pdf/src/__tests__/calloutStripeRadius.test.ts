import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { CalloutStyleConfig, PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// EF-99: the stripe of a rounded callout is clipped to the frame's rounded
// rectangle in the PDF, as on canvas and in HTML.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);
const face = fontkit.create(fontBytes);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    const run = face.layout(s);
    return { width: (run.advanceWidth / face.unitsPerEm) * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

const config = (extra: Partial<CalloutStyleConfig>): PostextConfig => ({
  page: { width: pt(300), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { balancing: { enabled: false } },
  layout: { layoutType: 'single' },
  calloutStyles: [{
    id: 'note',
    background: hex('#eef2f7'),
    stripe: { enabled: true, side: 'left', width: mm(3), color: hex('#2d5a8a') },
    ...extra,
  }],
});

async function pageOps(cfg: PostextConfig): Promise<string> {
  const doc = buildDocument({ markdown: ':::callout{type="note"}\nSome text.\n:::' }, cfg);
  const bytes = await renderToPdf(doc, { fontProvider });
  const pdf = await PDFDocument.load(bytes);
  const contents = pdf.getPage(0).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents];
  return streams
    .map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : ''))
    .join('\n');
}

/** The operators between the last clip before the stripe's fill colour and
 *  that fill, plus the path the clip was built from. */
function clipBeforeStripe(ops: string): { path: string; between: string } | null {
  // #2d5a8a → 0.17647 0.35294 0.54118 rg (pdf-lib prints up to 5 decimals).
  const fill = /0\.176\d* 0\.352\d* 0\.541\d* rg/.exec(ops);
  if (!fill) throw new Error('no stripe fill');
  const before = ops.slice(0, fill.index);
  const clipAt = before.search(/W\s+n\s*(?![\s\S]*W\s+n)/);
  if (clipAt < 0) return null;
  const pathStart = before.lastIndexOf('q', clipAt);
  return { path: before.slice(pathStart, clipAt), between: before.slice(clipAt) };
}

describe('EF-99: a rounded callout clips its stripe in the PDF', () => {
  it('clips the stripe to a curved outline that is still in force when it is filled', async () => {
    const ops = await pageOps(config({ borderRadius: mm(3) }));
    const clip = clipBeforeStripe(ops);
    expect(clip).not.toBeNull();
    // Bézier corners in the clip path.
    expect(/ c\n/.test(clip!.path)).toBe(true);
    // The clip's graphics state has not been popped before the fill.
    const opens = (clip!.between.match(/\bq\b/g) ?? []).length;
    const closes = (clip!.between.match(/\bQ\b/g) ?? []).length;
    expect(closes).toBeLessThanOrEqual(opens);
    // Balanced graphics state over the page.
    expect((ops.match(/\bq\b/g) ?? []).length).toBe((ops.match(/\bQ\b/g) ?? []).length);
    // Tagged output: the stripe is decoration, marked as an artifact inside
    // the clip's graphics state (marked content nests within q … Q).
    const artifactAt = clip!.between.lastIndexOf('/Artifact');
    expect(artifactAt).toBeGreaterThan(-1);
    expect(clip!.between.slice(artifactAt)).not.toMatch(/\bEMC\b/);
  });

  it('draws a square frame\'s stripe without a clip of its own (unchanged output)', async () => {
    const ops = await pageOps(config({ borderRadius: mm(0) }));
    // Only the column's rectangular clip encloses it.
    const clip = clipBeforeStripe(ops);
    expect(clip === null || !/ c\n/.test(clip.path)).toBe(true);
  });
});
