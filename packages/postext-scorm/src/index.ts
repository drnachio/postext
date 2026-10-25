import { directionOf, EXERCISE_RUNTIME } from 'postext';
import type { VDTDocument } from 'postext';
import { bookIdentifier, buildFixedPublication, buildReflowablePublication } from 'postext-epub';
import type { EpubItem, EpubNavPoint, EpubPublication, RenderToEpubOptions } from 'postext-epub';
import { zipSync, type Zippable } from 'fflate';
import { cutDocument, exerciseKey, ownedExercises } from './fragments.js';
import { manifestXml, ncName, type ManifestSco } from './manifest.js';
import { scormLeaves } from './outline.js';
import { PLAYER_CSS, PLAYER_SCRIPT, scoPage, scormWords } from './player.js';
import schemas from './schemas.json' with { type: 'json' };
import type { RenderToScormOptions, ScoData, ScoExercise, ScormItem } from './types.js';

/** Where the content documents and their files go in the package. */
const CONTENT_DIR = 'content/';
/** The EPUB writer's exercise script, which the package replaces. */
const EXERCISE_SCRIPT_ID = 'pt-exercise-script';

/** The content documents' exercise script in a SCORM package (#1267): the
 *  exercise runtime, attached with the player's store and results when the
 *  player has an LMS, as in an EPUB otherwise. */
export const SCORM_EXERCISE_SCRIPT = `(function () {
  var runtime = (${EXERCISE_RUNTIME})();
  function host() {
    try { var w = window.parent; if (w && w !== window && w.PostextScorm) return w.PostextScorm; } catch (e) { return null; }
    return null;
  }
  function go() {
    var h = host();
    runtime.attach(document, h && h.live ? { store: h.store, onResult: h.result } : {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
})();
`;

/** Types stored as they are (already compressed). */
const STORED = /^(image\/(png|jpeg|webp|gif)|font\/woff2?|video\/|audio\/)/;

/** A path relative to a document's directory, resolved from the root. */
function resolvePath(fromHref: string, target: string): string {
  const parts = fromHref.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join('/');
}

/** A content document with its links to another SCO's documents taken
 *  out: an LMS tracks a SCO by what it opens, so each one keeps to its own. */
function keepLinksHome(xhtml: string, href: string, foreign: ReadonlySet<string>): string {
  return xhtml.replace(/(<a\b[^>]*?)\shref="([^"#:]+)(#[^"]*)?"/g, (whole, open: string, path: string) =>
    foreign.has(resolvePath(href, path)) ? open : whole);
}

/** The headings of a publication's contents, with their depth. */
function flatToc(points: readonly EpubNavPoint[], depth = 0): { label: string; href: string; depth: number }[] {
  return points.flatMap((p) => [{ label: p.label, href: p.href, depth }, ...flatToc(p.children ?? [], depth + 1)]);
}

const text = (data: EpubItem['data']): string => (typeof data === 'string' ? data : new TextDecoder().decode(data));

/** The default organization: each document a SCO, titled after its first
 *  heading. */
function defaultItems(docs: readonly VDTDocument[]): ScormItem[] {
  return docs.map((doc, i) => {
    const heading = doc.blocks.find((b) => b.headingLevel !== undefined);
    const title = heading ? heading.lines.map((l) => (l.segments ?? []).map((s) => s.text).join('')).join(' ').trim() : '';
    return { title: title || String(i + 1), doc: i };
  });
}

/**
 * Write a laid-out book, or the parts of it `options.items` picks, as a
 * SCORM package (a zip an LMS imports), entirely in memory. `docs` are the
 * book's print documents, one per chapter in order (what `renderToEpub`
 * takes); each leaf of the organization is a SCO cut from one of them. The
 * content is postext-epub's, fixed pages or reflowable text, written as
 * HTML5 under `content/`; each SCO has a launch page (`sco-<n>.html`) with
 * the player and the LMS adapter.
 */
export async function renderToScorm(docs: readonly VDTDocument[], options: RenderToScormOptions): Promise<Uint8Array> {
  if (docs.length === 0) throw new Error('renderToScorm: no documents');
  const { layout, version, signal } = options;
  const items = options.items ?? defaultItems(docs);
  const metadata = { ...options.metadata, identifier: bookIdentifier(options.metadata) };

  // The SCOs and the documents they hold, one per SCO, in order.
  const parts: { item: ScormItem; doc: VDTDocument; source: VDTDocument }[] = [];
  for (const item of scormLeaves(items)) {
    const source = item.doc !== undefined ? docs[item.doc] : undefined;
    if (!source) continue;
    const cut = cutDocument(source, item.range, layout);
    if (cut) parts.push({ item, doc: cut, source });
    else options.onWarning?.({ kind: 'unsupported', detail: `"${item.title}" holds nothing to show` });
  }
  if (parts.length === 0) throw new Error('renderToScorm: nothing to write');

  const epubOptions: RenderToEpubOptions = {
    layout,
    metadata,
    ...(options.fonts ? { fonts: options.fonts } : {}),
    ...(options.svgFonts ? { svgFonts: options.svgFonts } : {}),
    ...(options.resourceBytes ? { resourceBytes: options.resourceBytes } : {}),
    ...(options.cover && layout === 'reflowable' ? { cover: options.cover } : {}),
    ...(options.onProgress ? { onProgress: (p) => options.onProgress!({ ...p }) } : {}),
    ...(options.onWarning ? { onWarning: options.onWarning } : {}),
    ...(signal ? { signal } : {}),
  };
  const cuts = parts.map((p) => p.doc);
  const pub: EpubPublication = layout === 'fixed'
    ? await buildFixedPublication(cuts, epubOptions)
    : await buildReflowablePublication(cuts, epubOptions);
  signal?.throwIfAborted();
  options.onProgress?.({ phase: 'package', done: 0, total: 1 });

  // Each SCO's content documents, in reading order.
  const byId = new Map(pub.items.map((i) => [i.id, i]));
  const docsOf = parts.map(() => [] as EpubItem[]);
  pub.spine.forEach((entry, i) => {
    const item = byId.get(entry.idref);
    if (!item) return;
    // The cover opens the first SCO.
    const sco = entry.doc ?? (i === 0 ? 0 : undefined);
    if (sco !== undefined) docsOf[sco]!.push(item);
  });
  const scoOfHref = new Map<string, number>();
  docsOf.forEach((list, s) => list.forEach((d) => scoOfHref.set(d.href, s)));
  const labelOf = new Map(pub.pageList.map((p) => [p.href.split('#')[0]!, p.label]));
  const toc = flatToc(pub.toc);
  const lang = metadata.language;
  const words = scormWords(lang);
  const storageKey = `pt-ex:${metadata.identifier}`;
  const passingPercent = options.passingScore ?? docs.find((d) => d.exerciseDigital?.passingScore)?.exerciseDigital?.passingScore ?? 0;
  const passing = passingPercent > 0 ? Math.min(100, passingPercent) / 100 : undefined;
  const page = pub.fixed?.viewport;

  const files: Zippable = {};
  const enc = new TextEncoder();
  const put = (path: string, data: Uint8Array | string, stored = false): void => {
    files[path] = [typeof data === 'string' ? enc.encode(data) : data, { level: stored ? 0 : 9 }];
  };

  const scos: ManifestSco[] = [];
  const scoOfItem = new Map<ScormItem, ManifestSco>();
  parts.forEach((part, s) => {
    const own = docsOf[s]!;
    const ownSet = new Set(own.map((d) => d.href));
    const foreign = new Set([...scoOfHref.keys()].filter((h) => !ownSet.has(h)));
    for (const d of own) d.data = keepLinksHome(text(d.data), d.href, foreign);
    const exercises: ScoExercise[] = [];
    for (const { record, points } of ownedExercises(part.source, part.item.range)) {
      // The fixed layout keeps answers per document, the reflowable book
      // per file: the file that sets the exercise's box.
      const scope = layout === 'fixed'
        ? String(s)
        : own.find((d) => text(d.data).includes(`data-pt-exercise="${record.id}"`))?.href;
      if (scope === undefined) continue;
      exercises.push({ key: exerciseKey(scope, record), points, number: record.number, ...(record.title ? { title: record.title } : {}) });
    }
    const data: ScoData = {
      version,
      layout,
      title: part.item.title,
      book: metadata.title,
      lang,
      dir: directionOf(lang),
      docs: own.map((d, i) => ({ href: CONTENT_DIR + d.href, label: labelOf.get(d.href) ?? String(i + 1) })),
      toc: toc.flatMap((e) => {
        const file = e.href.split('#')[0]!;
        const i = own.findIndex((d) => d.href === file);
        return i < 0 ? [] : [{ label: e.label, doc: i, href: CONTENT_DIR + e.href, depth: e.depth }];
      }),
      ...(page ? { page } : {}),
      ...(pub.pageProgression === 'rtl' ? { rtl: true } : {}),
      storageKey,
      exercises,
      ...(passing !== undefined ? { passing } : {}),
      words,
    };
    const href = `sco-${s + 1}.html`;
    put(href, scoPage(data));
    const sco: ManifestSco = { item: part.item, href, files: own.map((d) => CONTENT_DIR + d.href), points: exercises.reduce((n, e) => n + e.points, 0) };
    scos.push(sco);
    scoOfItem.set(part.item, sco);
  });

  // The content, with the exercise script that reports to the player.
  const shared: string[] = ['player/player.js', 'player/player.css'];
  put('player/player.js', PLAYER_SCRIPT);
  put('player/player.css', PLAYER_CSS);
  for (const item of pub.items) {
    if (item.remote) continue;
    const data = item.id === EXERCISE_SCRIPT_ID ? SCORM_EXERCISE_SCRIPT : item.data;
    put(CONTENT_DIR + item.href, data, STORED.test(item.mediaType));
    // A content document no SCO shows (a navigation document) is shared.
    if (!scoOfHref.has(item.href)) shared.push(CONTENT_DIR + item.href);
  }
  // The schemas the manifest names, at the package's root.
  for (const name of Object.keys((schemas as Record<string, Record<string, string>>)[version] ?? {})) {
    put(name, (schemas as Record<string, Record<string, string>>)[version]![name]!);
  }
  put('imsmanifest.xml', manifestXml({
    version,
    identifier: ncName(`postext-${metadata.identifier}`),
    title: metadata.title,
    language: lang,
    items,
    scoOf: (item) => scoOfItem.get(item),
    shared,
    ...(passing !== undefined ? { passing } : {}),
  }));
  const zip = zipSync(files, { mtime: new Date('2026-01-01T00:00:00Z') });
  options.onProgress?.({ phase: 'package', done: 1, total: 1 });
  return zip;
}

export { cutDocument, exerciseKey, ownedExercises } from './fragments.js';
export { manifestXml } from './manifest.js';
export { scormTree, scormOrganization, scormLeaves, treeLeaves, pickState, SCORM_TREE_DEPTH, type ScormTreeNode } from './outline.js';
export { scormWords, PLAYER_SCRIPT } from './player.js';
export type {
  RenderToScormOptions,
  ScormItem,
  ScormLayout,
  ScormProgress,
  ScormRange,
  ScormVersion,
  ScormWarning,
  ScormWords,
  ScoData,
  ScoExercise,
} from './types.js';
