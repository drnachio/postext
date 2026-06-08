// Built-in example resources for the default Sandbox document. These are seeded
// on first entry (when the resource store is empty) and restored on document
// reset, so the default markdown's `::resource` embeds and `:ref` references
// resolve out-of-the-box and the resources system is functional immediately.
//
// Blobs are stored under deterministic fileIds via `putBlobAt`, so re-seeding
// overwrites the same record instead of orphaning the previous blob.

import type { Resource, TableModel } from 'postext';
import { putBlobAt } from '../storage/blobStore';

/** Stable ids referenced by the default markdown (en.ts / es.ts). */
export const DEFAULT_RESOURCE_IDS = {
  layoutDiagram: 'layout-pipeline',
  featureTable: 'feature-comparison',
} as const;

const DIAGRAM_FILE_ID = 'default-layout-pipeline';

// A small, self-contained diagram of the Postext pipeline. Pure SVG so it can
// be embedded as text without any external binary asset.
const LAYOUT_DIAGRAM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 140" role="img" aria-label="Postext pipeline">
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="#555" />
    </marker>
  </defs>
  <rect x="8" y="48" width="100" height="44" rx="6" fill="#eef2ff" stroke="#6366f1" />
  <text x="58" y="74" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#3730a3">Markdown</text>
  <rect x="138" y="48" width="100" height="44" rx="6" fill="#ecfeff" stroke="#06b6d4" />
  <text x="188" y="74" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#155e75">Parse</text>
  <rect x="268" y="48" width="100" height="44" rx="6" fill="#f0fdf4" stroke="#22c55e" />
  <text x="318" y="74" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#166534">Layout</text>
  <rect x="392" y="20" width="80" height="32" rx="6" fill="#fef9c3" stroke="#eab308" />
  <text x="432" y="40" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#854d0e">Canvas</text>
  <rect x="392" y="60" width="80" height="32" rx="6" fill="#fee2e2" stroke="#ef4444" />
  <text x="432" y="80" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#991b1b">PDF</text>
  <rect x="392" y="100" width="80" height="32" rx="6" fill="#f1f5f9" stroke="#64748b" />
  <text x="432" y="120" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#334155">HTML</text>
  <line x1="108" y1="70" x2="134" y2="70" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)" />
  <line x1="238" y1="70" x2="264" y2="70" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)" />
  <line x1="368" y1="70" x2="388" y2="36" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)" />
  <line x1="368" y1="70" x2="388" y2="76" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)" />
  <line x1="368" y1="70" x2="388" y2="116" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)" />
</svg>`;

/** A comparison table demonstrating microformats (bold, inline code) in cells,
 *  header rows, and ordinary body cells. */
function featureTableModel(): TableModel {
  const h = (content: string) => ({ content, isHeader: true });
  const c = (content: string) => ({ content });
  return {
    headerRowCount: 1,
    rows: [
      [h('Capability'), h('Plain CSS'), h('Postext')],
      [c('Balanced multi-column flow'), c('Partial'), c('**Yes**')],
      [c('Orphan & widow control'), c('Inconsistent'), c('**Yes**')],
      [c('PDF from same source'), c('No'), c('**Yes**')],
      [c('Inline math (`$x^2$`)'), c('No'), c('**Yes**')],
    ],
  };
}

/** Build (and persist the blobs for) the default example resources. Safe to
 *  call repeatedly — blob writes are idempotent on their deterministic ids. */
export async function buildDefaultResources(): Promise<Resource[]> {
  const now = Date.now();

  // Persist the diagram SVG blob; tolerate IndexedDB being unavailable.
  try {
    const bytes = new TextEncoder().encode(LAYOUT_DIAGRAM_SVG).buffer;
    await putBlobAt(DIAGRAM_FILE_ID, bytes, 'image/svg+xml');
  } catch {
    // Without storage the SVG won't render, but the table resource still works
    // and the warnings panel will flag the unresolved blob.
  }

  return [
    {
      id: DEFAULT_RESOURCE_IDS.layoutDiagram,
      typeId: 'figure',
      kind: 'svg',
      svg: { fileId: DIAGRAM_FILE_ID },
      caption: 'The Postext pipeline: Markdown is parsed, laid out, then rendered to canvas, PDF, and HTML.',
      altText: 'Flow diagram from Markdown through parse and layout to canvas, PDF, and HTML outputs.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: DEFAULT_RESOURCE_IDS.featureTable,
      typeId: 'table',
      kind: 'table',
      table: { model: featureTableModel() },
      caption: 'Editorial layout capabilities of plain CSS versus Postext.',
      createdAt: now,
      updatedAt: now,
    },
  ];
}
