// IDML export: the laid-out pages as an InDesign Markup package, for
// finishing in InDesign. Built on the page display list (#1388), as the
// formatted Word export is: the pages stand in spreads (two about the
// spine for a book with mirrored margins, else one each);
// rules, boxes, paths and pictures become native page items; the text of
// each composed-page frame becomes one text frame with one story (frames
// chained by `next` share one story), with the frame's callout style as
// paragraph style. Chips that carry a form field become InDesign form
// fields (`fields.ts`). The lines Postext set are kept (`keptLines.ts`: a
// forced break per line, no-break text, per-line leading), so InDesign
// shows the pages as the PDF does; with `lineBreaks: 'reflow'` InDesign
// sets the text again with its own composer and line breaks may differ.
// Vertical text (Chinese or Japanese set `vertical-rl`) is written in
// vertical stories, a column of characters a line (`vertical.ts`).
//
// The writer's parts: `writer.ts` (its state, the options), `colours.ts`
// (swatches), `geometry.ts`, `shapes.ts` (boxes, rules, paths, chips),
// `images.ts`, `paragraphs.ts` (a paragraph's runs), `story.ts`,
// `spreads.ts`, and `parts.ts` for the package's fixed parts.

import { strToU8, zipSync, type Zippable } from 'fflate';
import { flowRectToPage, pageDisplayList, pageIsVertical } from 'postext';
import { authoredCmykColors } from 'postext/writer';
import { RESERVED_SWATCH_NAMES } from './colours.js';
import {
  BACKING_STORY_XML,
  CONTAINER_XML,
  designMapXml,
  fontsXml,
  graphicXml,
  IDML_MIMETYPE,
  masterSpreadXml,
  preferencesXml,
  stylesXml,
  type DocumentGeometry,
} from './parts.js';
import { linksXml, sectionsXml } from './document.js';
import { pageItemsXml, spreadXml, THREAD_LABEL_SLOT, type SpreadPage } from './spreads.js';
import { pageColumns, threadStory } from './threadStory.js';
import { pageKey, planThread } from './thread.js';
import { flowCallouts, newSurvey, settleStyles, type StyleSurvey } from './styles.js';
import { keepsLines, type IdmlOptions, type IdmlResult, type Writer } from './writer.js';
import { bareDocument, pageFurniture, planMasters, titleKey, RUNNING_HEAD_VARIABLE, runningHeadVariableXml, withoutFurniture, type MasterPage } from './masters.js';

export type { IdmlOptions, IdmlResult, IdmlWarning } from './writer.js';

/** Write the laid-out documents as an IDML package. The pages are
 *  written twice: the first pass counts what the paragraphs of every
 *  style look like, the second writes them in the styles that count
 *  settled on (`styles.ts`, #1555). */
export function idmlDocument(options: IdmlOptions): IdmlResult {
  const first = options.docs[0];
  if (!first || !first.pages.length) throw new Error('idmlDocument: nothing laid out');
  const survey = newSurvey();
  writePackage(options, survey);
  settleStyles(survey);
  return writePackage(options, survey)!;
}

/** One pass over the pages; the package itself only from the second. */
function writePackage(options: IdmlOptions, styles: StyleSurvey): IdmlResult | undefined {
  const { docs } = options;
  const first = docs[0]!;
  const surveying = styles.pass === 'survey';
  let n = 0x100;
  const seen = new Set<string>();
  const palette = new Map<string, string>();
  for (const e of first.config.colorPalette ?? []) palette.set(e.value.hex.slice(0, 7).toLowerCase(), e.name);
  const w: Writer = {
    next: () => `u${(n++).toString(16)}`,
    k: 72 / first.config.page.dpi,
    ox: 0,
    oy: 0,
    pageH: 0,
    px: 0,
    links: [],
    inlineCount: 0,
    pageBase: 0,
    swatches: new Map(),
    swatchNames: new Set(RESERVED_SWATCH_NAMES.map((n) => n.toLowerCase())),
    cmyk: authoredCmykColors(first.config),
    palette,
    fonts: new Map(),
    faces: new Map(),
    fontFiles: new Map(),
    paraStyles: new Map(),
    charStyles: new Map(),
    styles,
    doc: first,
    blockStyles: new Map(),
    stories: [],
    titleStyles: new Map(),
    media: new Map(),
    opts: options,
    warn: (code, message) => {
      // (The first pass says nothing: the second meets the same.)
      if (surveying) return;
      const key = `${code}\u0000${message}`;
      if (seen.has(key)) return;
      seen.add(key);
      options.onWarning?.({ code, message });
    },
  };

  // The pages, each written in the frame of the spread it will stand in.
  const facing = options.spreads ? options.spreads === 'facing' : !!(first.config.page as { margins?: { mirror?: boolean } }).margins?.mirror;
  const rightBound = first.binding === 'right';
  // The book's first page may be an even one (a bundle that holds part of
  // a longer book): page indices say which side each page is.
  const start = first.pages[0]?.index ?? 0;
  w.pageBase = -start;
  const laid: (SpreadPage & { label?: string; recto: boolean })[] = [];
  let geometry: DocumentGeometry = { width: 0, height: 0, bleed: 0, pages: 0 };
  // The running text of the pages laid out in columns, threaded (#1559).
  const lists = docs.map((doc) => doc.pages.map((_, p) => pageDisplayList(doc, p)));
  const thread = planThread(w, docs, lists);
  // With the running text threaded, the running heads and folios go on
  // master spreads (`masters.ts`): each page's list without them.
  const masterPages: MasterPage[] = [];
  const bares = thread
    ? docs.map((doc) => {
        const bare = bareDocument(doc);
        return doc.pages.map((vdt, p) => ((vdt.header || vdt.footer) && !vdt.composed && !vdt.flow && !pageIsVertical(vdt) ? pageDisplayList(bare, p) : undefined));
      })
    : undefined;
  // Each page's furniture, and the chapter titles its heads show (the
  // running-header variable matches the style they are set in).
  const furnitureOf = bares?.map((list, d) => list.map((bare, p) => (bare ? pageFurniture(docs[d]!, docs[d]!.pages[p]!, lists[d]![p]!.items.slice(bare.items.length)) : undefined)));
  w.chapterTitles = new Set(furnitureOf?.flatMap((list) => list.flatMap((f) => f?.titles.map(titleKey) ?? [])).filter(Boolean));
  let labelled = -1;
  docs.forEach((doc, d) => {
    w.k = 72 / doc.config.page.dpi;
    w.doc = doc;
    w.blockStyles.clear();
    for (let p = 0; p < doc.pages.length; p++) {
      const whole = lists[d]![p]!;
      const bare = bares?.[d]?.[p];
      const furniture = furnitureOf?.[d]?.[p];
      const page = bare && furniture ? withoutFurniture(whole, bare, furniture) : whole;
      const trim = page.trim ?? { x: 0, y: 0, width: page.width, height: page.height };
      const n = laid.length;
      const recto = (start + n) % 2 === 0;
      const left = facing && (rightBound ? recto : !recto);
      const width = trim.width * w.k;
      w.ox = trim.x;
      w.oy = trim.y;
      w.pageH = trim.height * w.k;
      w.px = left ? -width : 0;
      // The margins the page's content area leaves (a page laid out in a
      // mirrored flow says them in that flow: left out).
      const vdt = doc.pages[p]!;
      // (A vertical page's area is told in its flow: where it stands on the sheet.)
      w.page = vdt;
      w.callouts = flowCallouts(vdt);
      const area = pageIsVertical(vdt) ? flowRectToPage(vdt, vdt.contentArea) : vdt.flow ? undefined : vdt.contentArea;
      const l = area ? Math.max(0, (area.x - trim.x) * w.k) : 0;
      const r = area ? Math.max(0, (trim.x + trim.width - area.x - area.width) * w.k) : 0;
      const margins = area
        ? { top: Math.max(0, (area.y - trim.y) * w.k), bottom: Math.max(0, (trim.y + trim.height - area.y - area.height) * w.k), inside: left ? r : l, outside: left ? l : r }
        : undefined;
      if (!n) geometry = { width, height: w.pageH, bleed: trim.x * w.k, pages: 0, facing, rightBound, ...(margins ? { margins } : {}) };
      else if (Math.abs(width - geometry.width) > 0.5 || Math.abs(w.pageH - geometry.height) > 0.5) w.warn('page.size', `Page ${n + 1} has its own size; IDML pages keep it, the document setup shows the first page's`);
      const frames = new Map((vdt.composed?.frames ?? []).map((f) => [f.id, f] as const));
      const own = thread?.byPage.get(pageKey(d, p));
      const items = pageItemsXml(w, page, frames, own && thread ? { thread, frames: own, boxes: thread.boxes.get(pageKey(d, p)) ?? [], sides: thread.sides.get(pageKey(d, p)) ?? [] } : undefined);
      if (thread && pageKey(d, p) === thread.first) labelled = laid.length;
      // A page of the thread says its columns, so its frames follow them.
      const columns = own ? pageColumns(vdt, w.k) : undefined;
      if (furniture) masterPages.push({ at: n, left, furniture, state: { k: w.k, ox: w.ox, oy: w.oy, pageH: w.pageH, width, doc, page: vdt, index: page.index, ...(margins ? { margins } : {}), ...(columns ? { columns } : {}) } });
      laid.push({ self: `pg${n}`, name: page.label ?? String(n + 1), ...(page.label !== undefined ? { label: page.label } : {}), width, height: w.pageH, left, ...(margins ? { margins } : {}), ...(columns ? { columns } : {}), items, recto });
    }
  });
  // The thread's story, a document after another, and the label that
  // tells its breaks (`thread.ts`).
  if (thread) {
    const label = threadStory(w, docs, thread);
    const page = laid[labelled];
    if (page) page.items = page.items.replace(THREAD_LABEL_SLOT, label);
  }
  // The masters that draw the running heads, and the page each applies.
  const masters = planMasters(w, masterPages, facing, { ...geometry, pages: laid.length });
  for (const [at, self] of masters.byPage) laid[at]!.master = self;
  if (surveying) return undefined;
  // A verso and the recto after it share a spread; a page a spread otherwise.
  const groups: (typeof laid)[] = [];
  for (const page of laid) {
    const last = groups[groups.length - 1];
    if (facing && last && last.length === 1 && !last[0]!.recto && page.recto) last.push(page);
    else groups.push([page]);
  }
  const spreads = groups.map((pages, i) => {
    const id = w.next();
    return { id, xml: spreadXml(id, pages, i, 36) };
  });

  const g = { ...geometry, pages: laid.length };
  const parts = new Map<string, Uint8Array>();
  parts.set('mimetype', strToU8(IDML_MIMETYPE));
  parts.set('designmap.xml', strToU8(designMapXml({ title: options.title ?? 'Postext', layerId: 'ulayer', masterId: masters.spreads[0]?.id ?? 'umaster', masters: masters.spreads.slice(1).map((m) => m.id), ...(masters.spreads.length && w.stories.some((s) => s.xml.includes(RUNNING_HEAD_VARIABLE)) ? { variables: runningHeadVariableXml(w) } : {}), spreads: spreads.map((s) => s.id), stories: w.stories.map((s) => s.id), sections: sectionsXml(w, laid), links: linksXml(w, laid.map((p) => p.self)) })));
  parts.set('META-INF/container.xml', strToU8(CONTAINER_XML));
  parts.set('Resources/Graphic.xml', strToU8(graphicXml([...w.swatches.values()])));
  parts.set('Resources/Fonts.xml', strToU8(fontsXml(w.fonts)));
  parts.set('Resources/Styles.xml', strToU8(stylesXml([...w.paraStyles.values()], keepsLines(w), [...w.charStyles.values()])));
  parts.set('Resources/Preferences.xml', strToU8(preferencesXml(g)));
  // (The empty master stands alone when no master draws anything.)
  if (!masters.spreads.length) parts.set('MasterSpreads/MasterSpread_umaster.xml', strToU8(masterSpreadXml('umaster', g)));
  for (const m of masters.spreads) parts.set(`MasterSpreads/MasterSpread_${m.id}.xml`, strToU8(m.xml));
  for (const s of spreads) parts.set(`Spreads/Spread_${s.id}.xml`, strToU8(s.xml));
  for (const s of w.stories) parts.set(`Stories/Story_${s.id}.xml`, strToU8(s.xml));
  parts.set('XML/BackingStory.xml', strToU8(BACKING_STORY_XML));

  // The mimetype first and stored, as for EPUB and ODF.
  const z: Zippable = {};
  for (const [path, bytes] of parts) z[path] = path === 'mimetype' ? [bytes, { level: 0 }] : bytes;
  const bytes = zipSync(z, { level: 6, mtime: new Date(1980, 0, 1, 0, 0, 0) });
  return { bytes, links: [...w.media.values()], fonts: [...w.fontFiles.values()] };
}
