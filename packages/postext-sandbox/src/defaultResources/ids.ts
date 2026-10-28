// The ids of the built-in example resources, as the default markdown's
// `::resource` embeds and `:ref` references name them (#1276: split out of
// index.ts).


/** Stable ids referenced by the default markdown (en.ts, es.ts, zh-Hans.ts…).
 *  Keys are internal; the string *values* are the ids the markdown's
 *  `:ref{id=…}` directives resolve against, so they must stay in sync with
 *  the markdown. */
export const DEFAULT_RESOURCE_IDS = {
  // Cover artwork (a design image of the cover heading style, never referenced)
  cover: 'guide-cover',
  // Figures (SVG)
  layoutPipeline: 'layout-pipeline',
  convergenceLoop: 'convergence-loop',
  measurementSpeed: 'measurement-speed',
  orphanWidow: 'orphan-widow',
  knuthPlass: 'knuth-plass-model',
  cjkComposition: 'cjk-composition',
  baselineGrid: 'baseline-grid',
  columnLayouts: 'column-layouts',
  balancing: 'column-balancing',
  floatSlots: 'float-slots',
  bookAnatomy: 'book-anatomy',
  vectorRosette: 'vector-rosette',
  vectorChart: 'vector-chart',
  vectorClip: 'vector-clip',
  sandboxUi: 'sandbox-ui',
  epubRenditions: 'epub-renditions',
  // Tables
  featureTable: 'feature-comparison',
  toolsTable: 'tools-comparison',
  placementTable: 'placement-options',
  documentFormatTable: 'document-format',
  presetTable: 'preset-sizes',
  phasesTable: 'development-phases',
  paperStocksTable: 'paper-stocks',
  editionLayersTable: 'edition-layers',
} as const;
