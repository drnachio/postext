// Resource binaries for PDF embedding (RenderToPdfOptions.resourceBytes).
//
// Bitmaps pass through as their stored bytes (pdf-lib embeds PNG/JPEG
// natively; WebP is converted inside postext-pdf). SVGs are rasterised to PNG
// on the main thread — pdf-lib vector emission is still deferred
// (TODO #49-svg-vector) — honouring diagramStyle.singleInk so single-ink
// documents print with recoloured diagrams.

import type { PostextConfig, Resource } from 'postext';
import { applySingleInkToSvg, resolveColorValue, resolveDiagramStyleConfig } from 'postext';
import { getBlob } from '../storage/blobStore';

/** Supersampling factor over the SVG's intrinsic CSS-px size (~288 dpi). */
const RASTER_SCALE = 3;

async function svgToPngBytes(svgText: string, width: number, height: number): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null;
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG decode failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * RASTER_SCALE));
    canvas.height = Math.max(1, Math.round(height * RASTER_SCALE));
    const c2d = canvas.getContext('2d');
    if (!c2d) return null;
    c2d.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pngBlob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!pngBlob) return null;
    return new Uint8Array(await pngBlob.arrayBuffer());
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Pull every image-bearing resource's bytes from the blob store, rasterising
 *  SVGs (with the document's single-ink recolouring when enabled). Missing or
 *  undecodable entries are simply absent — the PDF renderer falls back to a
 *  placeholder for those. */
export async function buildPdfResourceBytes(
  resources: Resource[],
  config: PostextConfig,
): Promise<Map<string, Uint8Array>> {
  const ds = resolveDiagramStyleConfig(config.diagramStyle);
  const inkHex = ds.singleInk
    ? resolveColorValue(ds.inkColor, config.colorPalette, ds.inkColor).hex
    : null;
  const out = new Map<string, Uint8Array>();
  for (const r of resources) {
    if (r.kind === 'bitmap' && r.bitmap?.fileId && !out.has(r.bitmap.fileId)) {
      const rec = await getBlob(r.bitmap.fileId).catch(() => null);
      if (rec) out.set(r.bitmap.fileId, new Uint8Array(rec.bytes));
    } else if (r.kind === 'svg' && r.svg?.fileId && !out.has(r.svg.fileId)) {
      const rec = await getBlob(r.svg.fileId).catch(() => null);
      if (!rec) continue;
      let svgText = new TextDecoder().decode(rec.bytes);
      if (inkHex) svgText = applySingleInkToSvg(svgText, inkHex);
      // SVGs without declared intrinsic dims rasterise at a sane default box.
      const png = await svgToPngBytes(svgText, r.svg.width ?? 480, r.svg.height ?? 360);
      if (png) out.set(r.svg.fileId, png);
    }
  }
  return out;
}
