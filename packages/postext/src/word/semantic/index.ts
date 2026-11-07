// The semantic .docx (#1390): an editable Word document built from the
// engine parser — real styles mirroring the book's design, Word lists,
// footnotes, boxes as content controls, figures and tables, OMML maths,
// sections and columns from the config — with every text fragment wrapped
// in a hidden `_ptx_` bookmark and described in the export map, so edits
// made in Word re-import into the exact Markdown and resource positions
// (#1395). What Word cannot express travels as exact source text in
// `ptx:raw` content controls.

import { resolveAllConfig } from '../../pipeline/config.js';
import { CONFIG_VERSION } from '../../bundle/configVersion/rules.js';
import { resolvedCodeStyle } from '../../defaults/text/codeStyle.js';
import type { PostextConfig, Resource } from '../../types.js';
import { hashText } from '../anchors/hash.js';
import type { ExportMap } from '../anchors/types.js';
import type { WordFontPlan } from '../fonts/types.js';
import { initTexToOmml } from '../ommlWrite/index.js';
import { createDocxPackage } from '../ooxml/package.js';
import { bookNumbers } from './engineNumbers.js';
import { parseChapter, renderChapter } from './chapter.js';
import type { SemanticWarning, WriterContext } from './context.js';
import { prepareMedia } from './figures.js';
import { floatedResources } from './floated.js';
import { designPictureIds } from './designPictures.js';
import { FragmentLog } from './fragments.js';
import { Numbering } from './numbering.js';
import { pageGeometry } from './sections.js';
import { StyleRegistry } from './styles.js';
import type { WordChapterInput } from './types.js';
import { px, type Units } from './wml.js';

export type { WordChapterInput } from './types.js';
export type { SemanticWarning } from './context.js';
export { STYLE as SEMANTIC_STYLE } from './styles.js';

/** Options of `semanticDocx`: the chapters, design, resources, fonts and
 *  metadata. */
export interface SemanticDocxOptions {
  chapters: WordChapterInput[];
  config: PostextConfig;
  resources?: Resource[];
  resourceBytes?: (fileId: string) => Uint8Array | undefined;
  rasterizeSvg?: (svg: string, widthPx: number, heightPx: number) => Promise<Uint8Array | undefined>;
  fonts?: WordFontPlan;
  title?: string;
  author?: string;
  /** ISO timestamp: a fixed value makes the output byte-identical. */
  date?: string;
  exportId?: string;
  onWarning?: (w: SemanticWarning) => void;
}

/** The map's `engine`: the writer and the configuration version it reads. */
export const SEMANTIC_ENGINE = `postext-word-semantic/1 config/${CONFIG_VERSION}`;

/** Write a book as a `.docx` with native Word structures: styles, lists,
 *  tables, notes and fields. */
export async function semanticDocx(options: SemanticDocxOptions): Promise<Uint8Array> {
  const resolved = resolveAllConfig(options.config);
  const units: Units = { dpi: resolved.page.dpi || 96, basePx: 16 };
  units.basePx = px(units, resolved.bodyText.fontSize) || 16;
  let chapterId: string | undefined;
  const seen = new Set<string>();
  const warn = (code: string, message: string): void => {
    const key = `${chapterId ?? ''}\u0000${code}\u0000${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    options.onWarning?.({ code, message, ...(chapterId ? { chapter: chapterId } : {}) });
  };
  const code = resolvedCodeStyle(resolved);
  const parsed = options.chapters.map((c) => parseChapter(c, { fences: code.blocks, indentedCode: code.indentedCode }));
  const needsMath = options.chapters.some((c) => c.markdown.includes('$')) || (options.resources ?? []).some((r) => r.caption?.includes('$') || r.table?.model.rows.some((row) => row.some((cell) => cell.content.includes('$'))));
  if (needsMath) {
    try {
      await initTexToOmml();
    } catch (e) {
      warn('mathUnavailable', `Equations are kept as TeX: ${(e as Error).message}`);
    }
  }
  const pkg = createDocxPackage();
  const geo = pageGeometry(resolved, units);
  const resources = new Map((options.resources ?? []).map((r) => [r.id, r]));
  // Numbers as the engine prints them (captions, `:ref`s, headings).
  const numbers = bookNumbers(parsed, options.config, resolved, options.resources ?? []);
  const resourceTypes = numbers.resourceTypes;
  // Resources shown as blocks or floated by a `:ref`, whose pictures go
  // into the package.
  const floated = floatedResources(parsed, resources, resourceTypes);
  const shown = new Set<string>();
  for (const pc of parsed) {
    for (const b of pc.blocks) {
      if (b.type !== 'resourceBlock' || !b.resourceId || !resources.has(b.resourceId)) continue;
      shown.add(b.resourceId);
    }
  }
  for (const id of floated) shown.add(id);
  for (const id of designPictureIds(parsed, resolved, resources)) shown.add(id);
  let sdtId = 0;
  let footnoteId = 0;
  const styles = new StyleRegistry(resolved, units, options.fonts);
  const ctx: WriterContext = {
    pkg,
    log: new FragmentLog(pkg),
    config: options.config,
    resolved,
    units,
    styles,
    numbering: new Numbering(resolved, units, (stack, weight, italic) => styles.font(stack, weight, italic)),
    plan: options.fonts,
    resources,
    resourceTypes,
    resourceBytes: options.resourceBytes,
    rasterizeSvg: options.rasterizeSvg,
    columnPx: geo.columnPx,
    textTwips: Math.round((geo.columnPx * 1440) / units.dpi),
    usedResources: new Set(),
    numbers,
    footnotes: [],
    headers: {},
    footers: {},
    bookmarkNames: new Set(),
    floated,
    floatedPlaced: new Set(),
    media: new Map(),
    warn,
    nextSdtId: () => ++sdtId,
    nextFootnoteId: () => ++footnoteId,
    book: parsed,
    chapter: { index: 0, input: { id: '', markdown: '' }, markdown: '', offset: 0, defs: new Map(), cited: new Set(), usedDefs: new Set(), headingNumbers: new Map(), blockCounter: 0 },
  };
  await prepareMedia(ctx, shown);

  let body = '';
  parsed.forEach((pc, i) => {
    chapterId = pc.input.id;
    body += renderChapter(ctx, pc, i, geo, i === parsed.length - 1);
  });
  chapterId = undefined;
  if (!parsed.length) body = `<w:p/>${'<w:sectPr/>'}`;

  const createdAt = options.date ?? new Date().toISOString();
  const exportId = options.exportId ?? `ptx-${hashText(`${createdAt}\u0000${options.chapters.map((c) => `${c.id}\u0000${c.markdown}`).join('\u0001')}`)}`;
  const snapshotResources: Record<string, unknown> = {};
  for (const id of [...ctx.usedResources].sort()) {
    const r = resources.get(id);
    if (r) snapshotResources[id] = r;
  }
  const map: ExportMap = {
    version: 1,
    exportId,
    variant: 'semantic',
    engine: SEMANTIC_ENGINE,
    createdAt,
    chapters: options.chapters.map((c) => ({ id: c.id, ...(c.title !== undefined ? { title: c.title } : {}), hash: hashText(c.markdown) })),
    fragments: ctx.log.all(),
    snapshot: {
      chapters: options.chapters.map((c) => ({ id: c.id, markdown: c.markdown })),
      ...(Object.keys(snapshotResources).length ? { resources: snapshotResources } : {}),
    },
  };
  const extra = (geo.mirror ? '<w:mirrorMargins/>' : '') + '<w:doNotAutoCompressPictures/>';
  return pkg.build({
    body,
    styles: ctx.styles.xml(),
    docDefaults: ctx.styles.docDefaults(options.config.locale),
    ...(ctx.numbering.empty ? {} : { numbering: ctx.numbering.xml() }),
    ...(ctx.footnotes.length ? { footnotes: ctx.footnotes } : {}),
    headers: ctx.headers,
    footers: ctx.footers,
    core: { title: options.title, author: options.author, language: options.config.locale, date: createdAt },
    settings: {
      autoHyphenation: resolved.bodyText.hyphenation.enabled,
      embedFonts: (options.fonts?.faces.length ?? 0) > 0,
      extra,
    },
    fonts: options.fonts?.faces,
    exportMap: map,
  });
}
