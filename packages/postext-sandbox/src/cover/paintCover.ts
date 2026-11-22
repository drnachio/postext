// A laid-out cover painted on a canvas, whole or cut to one of its panels
// (the front for the EPUB's cover picture, the spine for Folio).

import { renderPageToCanvas, type VDTDocument } from 'postext';
import { coverZoneBox, type BuiltCover } from 'postext/production';

/** The cover's page painted at `scale` of its own pixels. */
export function paintCoverPage(doc: VDTDocument, canvas: HTMLCanvasElement, scale: number): boolean {
  const page = doc.pages[0];
  if (!page) return false;
  renderPageToCanvas(page, doc, canvas, { scale });
  return true;
}

/** One panel of the cover (`front`, `back`, `spine`, a flap) as a new
 *  canvas whose long side is `longSide` px; null when the sheet has no
 *  such panel or nothing was laid out. */
export function paintCoverZone(built: BuiltCover, doc: VDTDocument, zone: string, longSide: number): HTMLCanvasElement | null {
  const box = coverZoneBox(built, zone, doc);
  if (!box || box.width <= 0 || box.height <= 0) return null;
  const scale = longSide / Math.max(box.width, box.height);
  const whole = document.createElement('canvas');
  if (!paintCoverPage(doc, whole, scale)) return null;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(box.width * scale));
  out.height = Math.max(1, Math.round(box.height * scale));
  const g = out.getContext('2d');
  if (!g) return null;
  // On white: a cover without a ground colour is transparent.
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(whole, box.x * scale, box.y * scale, box.width * scale, box.height * scale, 0, 0, out.width, out.height);
  // The whole page is let go at once, not left to the collector.
  whole.width = 0;
  whole.height = 0;
  return out;
}

/** A canvas as JPEG bytes. */
export async function canvasJpeg(canvas: HTMLCanvasElement, quality = 0.9): Promise<Uint8Array | null> {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}
