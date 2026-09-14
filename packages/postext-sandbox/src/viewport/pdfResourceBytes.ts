// Resource binaries for PDF embedding (RenderToPdfOptions.resourceBytes).
//
// The PDF backend sniffs whatever bytes it gets: bitmaps embed natively, SVG
// markup is emitted as vector paths (recoloured first when
// diagramStyle.singleInk is on) or rasterised when it uses features outside
// the vector subset, and a single-page PDF is embedded verbatim. So the host's
// only decision is which payload represents an SVG resource: its print master
// (`svg.pdfFileId`) when one is attached — unless single-ink mode is on, since
// the recolouring pass only works on SVG markup — and the SVG source otherwise.

import type { PostextConfig, Resource } from 'postext';
import { resolveDiagramStyleConfig } from 'postext';
import { getBlob } from '../storage/blobStore';

/** Pull every image-bearing resource's bytes from the blob store. Missing
 *  entries are simply absent — the PDF renderer falls back to a placeholder
 *  for those. */
export async function buildPdfResourceBytes(
  resources: Resource[],
  config: PostextConfig,
): Promise<Map<string, Uint8Array>> {
  const singleInk = resolveDiagramStyleConfig(config.diagramStyle).singleInk;
  const out = new Map<string, Uint8Array>();
  const load = async (fileId: string): Promise<Uint8Array | null> => {
    const rec = await getBlob(fileId).catch(() => null);
    return rec ? new Uint8Array(rec.bytes) : null;
  };
  for (const r of resources) {
    if (r.kind === 'bitmap' && r.bitmap?.fileId && !out.has(r.bitmap.fileId)) {
      const bytes = await load(r.bitmap.fileId);
      if (bytes) out.set(r.bitmap.fileId, bytes);
    } else if (r.kind === 'svg' && r.svg?.fileId && !out.has(r.svg.fileId)) {
      const master = r.svg.pdfFileId && !singleInk ? await load(r.svg.pdfFileId) : null;
      const bytes = master ?? await load(r.svg.fileId);
      if (bytes) out.set(r.svg.fileId, bytes);
    }
  }
  return out;
}
