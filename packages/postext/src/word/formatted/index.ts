// The formatted (page-faithful) Word export (#1392): the print chain's
// pages, through the shared page display list, as one Word section per
// page whose text sits in exactly placed text boxes with the engine's
// line breaks, and whose rules, boxes, paths, pictures and tables are
// native drawings. Every importable fragment is bookmarked and described
// in the export map, so edits made in Word re-import (#1395).

import { CONFIG_VERSION } from '../../bundle/configVersion/rules.js';
import { pageDisplayList } from '../../paint/displayList/page.js';
import type { ExportMap } from '../anchors/types.js';
import { guidFrom, hashText } from '../anchors/hash.js';
import { createDocxPackage } from '../ooxml/package.js';
import { MetricsCache } from './metrics.js';
import { pageXml } from './page.js';
import { docDefaultsXml, stylesXml } from './styles.js';
import type { FormattedDocxOptions, WriterContext } from './types.js';

export type { FormattedDocxOptions, FormattedWarning } from './types.js';
export { baselineOffset, readFaceMetrics, FALLBACK_DESCENT } from './metrics.js';

/** `ExportMap.engine` (and `postext.version`) of the files this writer
 *  makes: writer and config versions, as the semantic writer stamps its. */
export const FORMATTED_ENGINE = `postext-word-formatted/1 config/${CONFIG_VERSION}`;

export async function formattedDocx(options: FormattedDocxOptions): Promise<Uint8Array> {
  const { docs, chapters } = options;
  if (chapters.length < docs.length) throw new Error(`formattedDocx: ${docs.length} documents but ${chapters.length} chapters`);
  const pkg = createDocxPackage();
  const seen = new Set<string>();
  const ctx: WriterContext = {
    pkg,
    dpi: docs[0]?.config.page.dpi ?? 96,
    plan: options.fonts,
    lang: undefined,
    metrics: new MetricsCache(options.fonts),
    chapters,
    docIndex: 0,
    fragments: [],
    nextFragment: 0,
    parts: new Map(),
    referenced: new Set(),
    z: 0,
    warn: (code, message) => {
      const chapter = chapters[ctx.docIndex]?.id;
      const key = `${code}\u0000${message}`;
      if (seen.has(key)) return;
      seen.add(key);
      options.onWarning?.({ code, message, ...(chapter !== undefined ? { chapter } : {}) });
    },
    resourceBytes: options.resourceBytes,
    rasterizeSvg: options.rasterizeSvg,
    media: new Map(),
  };

  const total = docs.reduce((n, d) => n + d.pages.length, 0);
  let done = 0;
  const body: string[] = [];
  for (let d = 0; d < docs.length; d++) {
    const doc = docs[d]!;
    ctx.docIndex = d;
    ctx.dpi = doc.config.page.dpi;
    ctx.lang = doc.config.locale;
    for (let p = 0; p < doc.pages.length; p++) {
      const page = pageDisplayList(doc, p);
      body.push(await pageXml(ctx, page, ++done === total));
      options.onProgress?.(done, total);
    }
  }
  if (total === 0) {
    // A document with no pages still needs a body section.
    body.push('<w:p/><w:sectPr><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>');
  }

  const createdAt = options.date ?? new Date().toISOString();
  const exportId = options.exportId ?? guidFrom(`formatted\u0000${createdAt}\u0000${chapters.map((c) => hashText(c.markdown)).join(',')}`).slice(1, -1).toLowerCase();
  const resources = (options.resources ?? []).filter((r) => ctx.referenced.has(r.id));
  const exportMap: ExportMap = {
    version: 1,
    exportId,
    variant: 'formatted',
    engine: FORMATTED_ENGINE,
    createdAt,
    chapters: chapters.map((c) => ({ id: c.id, ...(c.title !== undefined ? { title: c.title } : {}), hash: hashText(c.markdown) })),
    fragments: ctx.fragments,
    snapshot: {
      chapters: chapters.map((c) => ({ id: c.id, markdown: c.markdown })),
      ...(resources.length ? { resources: Object.fromEntries(resources.map((r) => [r.id, r as unknown])) } : {}),
    },
  };
  const lang = docs[0]?.config.locale;
  const faces = options.fonts?.faces ?? [];
  return pkg.build({
    body: body.join(''),
    styles: stylesXml(),
    docDefaults: docDefaultsXml(lang),
    core: {
      ...(options.title ? { title: options.title } : {}),
      ...(options.author ? { author: options.author } : {}),
      ...(lang ? { language: lang } : {}),
      ...(options.date ? { date: options.date } : {}),
    },
    settings: { autoHyphenation: false, embedFonts: faces.length > 0, openTypeFeatures: true, evenAndOddHeaders: false },
    ...(faces.length ? { fonts: faces } : {}),
    exportMap,
  });
}
