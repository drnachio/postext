// A summary of a document for the dialog a host shows before importing:
// what is there, how much of it, and what will need a second look.

import type { IdmlDocument, IdmlPageItem, IdmlParagraph, IdmlStory, StyleKind } from '../model/document.js';
import { itemIndex } from './geometry.js';
import { readingOrder, type OrderedStory } from './order.js';
import { runAttr, runProperty, stylePath } from './styles.js';

export interface StoryCount {
  characters: number;
  paragraphs: number;
  tables: number;
  footnotes: number;
  endnotes: number;
  notes: number;
  indexMarks: number;
  anchored: number;
  variables: number;
}

export interface IdmlAttention {
  /** A word a host has its own text for. */
  code:
    | 'nestedStyles' | 'grepStyles' | 'lineStyles' | 'textOnPath' | 'effects' | 'conditions' | 'trackedChanges' | 'textVariables'
    | 'verticalText' | 'rightToLeft' | 'missingLinks' | 'missingFonts' | 'hiddenContent' | 'pasteboardContent' | 'gradients' | 'spotColours'
    | 'crossReferences' | 'interactive' | 'xmlTags';
  count: number;
}

export interface IdmlSummary {
  title?: string;
  author?: string;
  /** InDesign's version that wrote the package (`21.6`), when it says. */
  product?: string;
  pages: number;
  spreads: number;
  /** The distinct page sizes, the commonest first. */
  pageSizes: { width: number; height: number; pages: number }[];
  facingPages: boolean;
  binding: 'left' | 'right';
  /** The names pages go by, first and last (`i`–`2`). */
  pageNames: string[];
  masters: { name: string; basedOn?: string; pages: number; items: number; appliedTo: number }[];
  layers: { name: string; visible: boolean; printable: boolean; items: number }[];
  stories: number;
  /** The stories a reader of the pages reads: placed, visible, on a page. */
  readableStories: number;
  /** The longest story in characters: where the book's text is. */
  mainStory?: { self: string; characters: number; paragraphs: number; frames: number; pages: number[] };
  characters: number;
  fonts: { family: string; style: string; characters: number; status?: string }[];
  paragraphStyles: { self: string; path: string; paragraphs: number }[];
  characterStyles: { self: string; path: string; runs: number }[];
  objectStyles: { self: string; path: string; items: number }[];
  swatches: { process: number; spot: number; tint: number; gradient: number; mixedInk: number };
  pictures: { total: number; linked: number; embedded: number; missing: number; formats: Record<string, number> };
  tables: number;
  footnotes: number;
  endnotes: number;
  hyperlinks: number;
  crossReferences: number;
  bookmarks: number;
  indexMarks: number;
  indexTopics: number;
  anchoredObjects: number;
  languages: string[];
  attention: IdmlAttention[];
  warnings: number;
}

interface Tally {
  count: StoryCount;
  fonts: Map<string, number>;
  paragraphStyles: Map<string, number>;
  characterStyles: Map<string, number>;
  languages: Map<string, number>;
  conditions: number;
  changes: number;
  crossReferences: Set<string>;
  hiddenRuns: number;
  tags: number;
  items: IdmlPageItem[];
}

const bump = (map: Map<string, number>, key: string, by = 1): void => void map.set(key, (map.get(key) ?? 0) + by);

/** Count a story's text, the text of its tables and notes included. */
function tally(doc: IdmlDocument, story: IdmlStory, into: Tally): StoryCount {
  const count: StoryCount = { characters: 0, paragraphs: 0, tables: 0, footnotes: 0, endnotes: 0, notes: 0, indexMarks: 0, anchored: 0, variables: 0 };
  const stack: { paragraphs: readonly IdmlParagraph[]; body: boolean }[] = [{ paragraphs: story.paragraphs, body: true }];
  while (stack.length) {
    const { paragraphs, body } = stack.pop()!;
    for (const p of paragraphs) {
      if (body) count.paragraphs++;
      if (p.paragraphStyle) bump(into.paragraphStyles, p.paragraphStyle);
      for (const r of p.runs) {
        let chars = 0;
        for (const i of r.content) {
          switch (i.kind) {
            case 'text': chars += i.text.length; break;
            case 'footnote': count.footnotes++; stack.push({ paragraphs: i.paragraphs, body: false }); break;
            case 'endnote': count.endnotes++; break;
            case 'note': count.notes++; break;
            case 'table':
              count.tables++;
              for (const cell of i.table.cells) {
                stack.push({ paragraphs: cell.paragraphs, body: false });
                into.items.push(...cell.items);
              }
              break;
            case 'item': count.anchored++; into.items.push(i.item); break;
            case 'indexMark': count.indexMarks++; break;
            case 'variable': count.variables++; chars += i.result.length; break;
            default:
          }
        }
        count.characters += chars;
        if (r.characterStyle) bump(into.characterStyles, r.characterStyle);
        if (r.conditions.length) into.conditions++;
        if (r.change) into.changes++;
        if (r.crossReference) into.crossReferences.add(r.linkSource ?? '');
        if (r.hidden) into.hiddenRuns++;
        if (r.tags.length) into.tags++;
        if (chars) {
          const family = runProperty(doc, p, r, 'AppliedFont')?.trim() ?? '';
          const style = runAttr(doc, p, r, 'FontStyle') ?? 'Regular';
          bump(into.fonts, `${family}\u0000${style}`, chars);
          const language = runAttr(doc, p, r, 'AppliedLanguage');
          if (language) bump(into.languages, language, chars);
        }
      }
    }
  }
  for (const k of Object.keys(count) as (keyof StoryCount)[]) into.count[k] += count[k];
  return count;
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

export function inspectIdml(doc: IdmlDocument): IdmlSummary {
  const order = readingOrder(doc);
  const into: Tally = {
    count: { characters: 0, paragraphs: 0, tables: 0, footnotes: 0, endnotes: 0, notes: 0, indexMarks: 0, anchored: 0, variables: 0 },
    fonts: new Map(), paragraphStyles: new Map(), characterStyles: new Map(), languages: new Map(),
    conditions: 0, changes: 0, crossReferences: new Set(), hiddenRuns: 0, tags: 0, items: [],
  };

  // Every story once, with where it stands.
  const flat: OrderedStory[] = [];
  const pending = [...order].reverse();
  const seen = new Set<OrderedStory>();
  while (pending.length) {
    const e = pending.pop()!;
    if (seen.has(e)) continue;
    seen.add(e);
    flat.push(e);
    for (let i = e.anchored.length - 1; i >= 0; i--) pending.push(e.anchored[i]!.entry);
  }
  let main: IdmlSummary['mainStory'];
  let readable = 0;
  let pasteboard = 0;
  let hidden = 0;
  let vertical = 0;
  let rtl = 0;
  let textPaths = 0;
  for (const e of flat) {
    const f = e.flags;
    const count = tally(doc, e.story, into);
    if (f.textPath) textPaths++;
    if (e.story.orientation === 'vertical') vertical++;
    if (e.story.direction === 'rtl') rtl++;
    if (f.master) continue;
    if (f.pasteboard) pasteboard++;
    if (f.hidden || f.hiddenLayer) hidden++;
    if (f.unplaced || f.pasteboard || f.hidden || f.hiddenLayer || f.anchored) continue;
    readable++;
    if (!main || count.characters > main.characters) {
      main = { self: e.story.self, characters: count.characters, paragraphs: count.paragraphs, frames: e.frames.length, pages: [...new Set(e.frames.map((x) => x.pageIndex).filter((i) => i >= 0))].sort((a, b) => a - b) };
    }
  }

  // Page items: the spreads' own, and the ones anchored in text.
  const all: IdmlPageItem[] = [];
  const objectStyles = new Map<string, number>();
  const layerItems = new Map<string, number>();
  for (const at of itemIndex(doc).values()) {
    all.push(at.item);
    const layer = [...at.parents, at.item].map((i) => i.layer).find((l) => l !== undefined);
    if (layer && !at.parents.length) bump(layerItems, layer);
  }
  const inText = [...into.items];
  while (inText.length) {
    const item = inText.pop()!;
    all.push(item);
    for (const c of item.children) inText.push(c);
  }
  const pictures = { total: 0, linked: 0, embedded: 0, missing: 0, formats: {} as Record<string, number> };
  let effects = 0;
  let interactive = 0;
  const carried = new Set([...doc.files.keys()].map((n) => n.split('/').pop()!.toLowerCase()));
  for (const item of all) {
    if (item.objectStyle) bump(objectStyles, item.objectStyle);
    if (item.effects.length || item.opacity < 100 || item.blendMode) effects++;
    if (item.kind === 'Button' || item.kind === 'MultiStateObject' || /Box$|Field$|Button$/.test(item.kind)) interactive++;
    const g = item.graphic;
    if (!g) continue;
    pictures.total++;
    const format = g.link?.format ?? g.type;
    pictures.formats[format] = (pictures.formats[format] ?? 0) + 1;
    if (g.data) pictures.embedded++;
    else {
      pictures.linked++;
      // A linked picture is at hand only when the package carries it; a
      // link InDesign already knew to be broken says so itself.
      const inPackage = g.link ? carried.has(g.link.name.toLowerCase()) : false;
      if (!inPackage) pictures.missing++;
    }
  }

  const sizes = new Map<string, { width: number; height: number; pages: number }>();
  const pageNames: string[] = [];
  let pages = 0;
  for (const spread of doc.spreads) {
    for (const page of spread.pages) {
      pages++;
      pageNames.push(page.name);
      const width = round(page.bounds.right - page.bounds.left);
      const height = round(page.bounds.bottom - page.bounds.top);
      const key = `${width}x${height}`;
      const size = sizes.get(key);
      if (size) size.pages++;
      else sizes.set(key, { width, height, pages: 1 });
    }
  }

  const styleRows = <K extends string>(kind: StyleKind, used: Map<string, number>, field: K): ({ self: string; path: string } & Record<K, number>)[] =>
    [...doc.styles[kind].values()].map((s) => ({ self: s.self, path: stylePath(s), [field]: used.get(s.self) ?? 0 }) as { self: string; path: string } & Record<K, number>);

  const swatches = { process: 0, spot: 0, tint: 0, gradient: 0, mixedInk: 0 };
  for (const s of doc.swatches.values()) {
    // InDesign's own colours and the unnamed ones it keeps for itself
    // are not swatches an author made.
    if (s.kind === 'color') {
      if (s.special || !s.name) continue;
      if (s.model === 'Spot') swatches.spot++;
      else swatches.process++;
    } else if (s.kind === 'tint') swatches.tint++;
    else if (s.kind === 'gradient') {
      if (s.name) swatches.gradient++;
    } else if (s.kind === 'mixedInk') swatches.mixedInk++;
  }

  let nested = 0;
  let grep = 0;
  let line = 0;
  for (const s of doc.styles.paragraph.values()) {
    for (const n of s.nested ?? []) {
      if (n.kind === 'nested') nested++;
      else if (n.kind === 'grep') grep++;
      else line++;
    }
  }

  const status = new Map<string, string>();
  for (const f of doc.fonts) if (f.status) status.set(`${f.family}\u0000${f.style}`, f.status);
  const fonts = [...into.fonts].map(([key, characters]) => {
    const [family = '', style = ''] = key.split('\u0000');
    const st = status.get(key);
    return { family, style, characters, ...(st ? { status: st } : {}) };
  }).sort((a, b) => b.characters - a.characters);
  const missingFonts = fonts.filter((f) => f.status !== undefined && f.status !== 'Installed').length;

  const attention: IdmlAttention[] = [];
  const note = (code: IdmlAttention['code'], count: number): void => {
    if (count > 0) attention.push({ code, count });
  };
  note('nestedStyles', nested);
  note('grepStyles', grep);
  note('lineStyles', line);
  note('textOnPath', textPaths);
  note('effects', effects);
  note('conditions', into.conditions);
  note('trackedChanges', into.changes);
  note('textVariables', into.count.variables);
  note('crossReferences', into.crossReferences.size);
  note('verticalText', vertical);
  note('rightToLeft', rtl);
  note('missingLinks', pictures.missing);
  note('missingFonts', missingFonts);
  note('hiddenContent', hidden + into.hiddenRuns);
  note('pasteboardContent', pasteboard);
  note('gradients', swatches.gradient);
  note('spotColours', swatches.spot);
  note('interactive', interactive);
  note('xmlTags', into.tags);

  const countBookmarks = (): number => {
    let n = 0;
    const stack = [...doc.bookmarks];
    while (stack.length) {
      const b = stack.pop()!;
      n++;
      for (const c of b.children) stack.push(c);
    }
    return n;
  };

  const product = doc.product ? /^[\d.]+/.exec(doc.product)?.[0] : undefined;
  return {
    ...(doc.title ? { title: doc.title } : {}),
    ...(doc.author ? { author: doc.author } : {}),
    ...(product ? { product } : {}),
    pages,
    spreads: doc.spreads.length,
    pageSizes: [...sizes.values()].sort((a, b) => b.pages - a.pages),
    facingPages: doc.preferences.facingPages,
    binding: doc.preferences.rightToLeft ? 'right' : 'left',
    pageNames,
    masters: doc.masterSpreads.map((m) => ({
      name: m.name ?? m.self,
      ...(m.basedOn ? { basedOn: doc.masterSpreads.find((x) => x.self === m.basedOn)?.name ?? m.basedOn } : {}),
      pages: m.pages.length,
      items: m.items.length,
      appliedTo: doc.spreads.reduce((n, s) => n + s.pages.filter((p) => p.appliedMaster === m.self).length, 0),
    })),
    layers: doc.layers.map((l) => ({ name: l.name, visible: l.visible, printable: l.printable, items: layerItems.get(l.self) ?? 0 })),
    stories: doc.stories.size,
    readableStories: readable,
    ...(main ? { mainStory: main } : {}),
    characters: into.count.characters,
    fonts,
    paragraphStyles: styleRows('paragraph', into.paragraphStyles, 'paragraphs'),
    characterStyles: styleRows('character', into.characterStyles, 'runs'),
    objectStyles: styleRows('object', objectStyles, 'items'),
    swatches,
    pictures,
    tables: into.count.tables,
    footnotes: into.count.footnotes,
    endnotes: into.count.endnotes,
    hyperlinks: doc.hyperlinks.length,
    crossReferences: into.crossReferences.size,
    bookmarks: countBookmarks(),
    indexMarks: into.count.indexMarks,
    indexTopics: doc.topics.size,
    anchoredObjects: into.count.anchored,
    languages: [...into.languages].sort((a, b) => b[1] - a[1]).map(([name]) => name.replace(/^\$ID\//, '')),
    attention,
    warnings: doc.warnings.length,
  };
}
