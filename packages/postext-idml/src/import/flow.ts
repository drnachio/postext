// Layout `flow`: the document as a flowing book.
//
// The main story (the one that holds most of the text) becomes the
// chapters, split at its level-1 headings. IDML does not say where text
// lands on a page, so what stands beside the main story (side stories,
// pictures) is cited at the paragraph the page geometry suggests: each
// frame of the main thread is taken to hold a share of the text
// proportional to its area. Stories on pages before the main story are
// front matter, those after it back matter. Shapes drawn on the pages
// are not part of a flowing book and are counted, except on the pages
// set as one unit (a cover, an opener: `fidelity/flowUnits.ts`), which
// keep their artwork.

import type { HeadingStyleConfig, PageTemplate } from 'postext';
import type { IdmlStory } from '../model/document.js';
import { boxHeight, boxWidth, type Box } from '../model/geometry.js';
import { pageSize } from '../resolve/geometry.js';
import type { OrderedStory } from '../resolve/order.js';
import { blocksOf, joinChunks, type BlockEnv, type Chunk } from './blocks.js';
import type { Context } from './context.js';
import type { MasterWords } from './design.js';
import { bookmarkChapters } from './fidelity/bookmarks.js';
import { flowUnits } from './fidelity/flowUnits.js';
import { makeHooks } from './hooks.js';
import { indexTerm, inlineOf } from './inline.js';
import { ownText } from './looks.js';
import { withInlineBreaks } from './marks.js';
import { boxLook, calloutStyleFor } from './objects.js';
import { allPages, numberingDirective } from './pagesetup.js';
import { captionLabel, pictureResource } from './pictures.js';
import { leavesOf, type Leaf } from './scan.js';
import { pt } from './values.js';

const INDEX_STYLE = /\bindex\b|[íi]ndice|stichwort|registro/i;
const TOC_STYLE = /\btoc\b|contents|contenido|sommaire|inhalt|sommario|tabla de contenido/i;

/** The story is one InDesign generated, by the styles its paragraphs
 *  wear: its index, or its table of contents. */
export function generatedKind(ctx: Context, story: IdmlStory): 'index' | 'toc' | undefined {
  let index = 0;
  let toc = 0;
  let n = 0;
  for (const p of story.paragraphs) {
    if (!ownText(p).trim()) continue;
    n++;
    const name = p.paragraphStyle ? (ctx.doc.styles.paragraph.get(p.paragraphStyle)?.name ?? '') : '';
    if (TOC_STYLE.test(name)) toc++;
    else if (INDEX_STYLE.test(name)) index++;
  }
  if (n >= 2 && index >= n * 0.6 && ctx.doc.topics.size) return 'index';
  if (n >= 2 && toc >= n * 0.6) return 'toc';
  return undefined;
}

/** `:::index` (or `:::toc`) in place of a generated story's text, under
 *  its title. */
export function generatedBlocks(ctx: Context, story: IdmlStory, kind: 'index' | 'toc', level: number): Chunk[] {
  const first = story.paragraphs.find((p) => ownText(p).trim());
  const title = first ? ownText(first).replace(/\s+/g, ' ').trim() : kind === 'index' ? 'Index' : 'Contents';
  const out: Chunk[] = [{ kind: 'heading', level, title, text: `${'#'.repeat(level)} ${title} {toc="false"}` }];
  if (kind === 'toc') {
    out.push({ kind: 'block', text: ':::toc' });
    ctx.rep.add('generatedContents', 'info', 'A table of contents InDesign generated is replaced by Postext\'s own (:::toc), which follows the book\'s pages', title);
    return out;
  }
  // "See" references print with the index: one mark per reference.
  const see: string[] = [];
  for (const t of ctx.doc.topics.values()) {
    for (const x of t.crossReferences) {
      if (/also/i.test(x.type)) continue;
      const target = ctx.doc.topics.get(x.topic);
      if (target) see.push(`:index{term="${indexTerm(ctx, [...t.path, t.name])}" see="${indexTerm(ctx, [...target.path, target.name])}"}`);
      else if (x.customText) ctx.rep.add('indexCustomReference', 'warning', 'An index cross-reference with custom text and no topic is left out', `${t.name}: ${x.customText}`);
    }
  }
  if (see.length) out.push({ kind: 'block', text: see.join('\n') });
  out.push({ kind: 'block', text: ':::index' });
  ctx.rep.add('generatedIndex', 'info', 'The index story InDesign generated is replaced by Postext\'s own index (:::index), built from the marks in the text', title);
  return out;
}

interface Share {
  page: number;
  box: Box;
  from: number;
  to: number;
}

export interface FlowResult {
  chapters: { title: string; markdown: string }[];
  words: MasterWords;
  /** Resource types the captions asked for. */
  labels: Map<'figure' | 'table', string>;
  /** Templates of the pages set as composed pages (a cover, a divider). */
  templates: PageTemplate[];
  /** Heading styles whose design draws an opener page's frames. */
  headingStyles: HeadingStyleConfig[];
}

export function layoutFlow(ctx: Context, stories: readonly OrderedStory[], main: OrderedStory | undefined, words: MasterWords): FlowResult {
  const doc = ctx.doc;
  const hooks = makeHooks(ctx, 'flow');
  const labels = new Map<'figure' | 'table', string>();
  const headingAttrs = [...words.attrs].map(([k, v]) => `${k}="${v}"`);
  const pages = allPages(ctx);
  const firstPage = (e: OrderedStory): number => e.frames.find((f) => f.pageIndex >= 0)?.pageIndex ?? Number.MAX_SAFE_INTEGER;

  // The share of the main story each of its frames holds.
  const shares: Share[] = [];
  const lengths = main ? main.story.paragraphs.map((p) => ownText(p).length + 1) : [];
  const total = lengths.reduce((a, b) => a + b, 0);
  if (main) {
    const frames = main.frames.filter((f) => f.box && f.pageIndex >= 0);
    const area = frames.reduce((a, f) => a + boxWidth(f.box!) * boxHeight(f.box!), 0) || 1;
    let at = 0;
    for (const f of frames) {
      const part = (boxWidth(f.box!) * boxHeight(f.box!) / area) * total;
      shares.push({ page: f.pageIndex, box: f.box!, from: at, to: at + part });
      at += part;
    }
  }
  const paragraphAt = (offset: number): number => {
    let acc = 0;
    for (let n = 0; n < lengths.length; n++) {
      acc += lengths[n]!;
      if (offset < acc) return n;
    }
    return lengths.length - 1;
  };
  /** The paragraph of the main story a thing at `y` of `page` stands
   *  beside; `before`/`after` when the main story is not on that page. */
  const beside = (page: number, y: number): number | 'before' | 'after' => {
    if (!shares.length) return 'after';
    const on = shares.filter((s) => s.page === page);
    if (!on.length) {
      if (page < shares[0]!.page) return 'before';
      const earlier = shares.filter((s) => s.page < page);
      if (earlier.length === shares.length) return 'after';
      return paragraphAt(earlier[earlier.length - 1]!.to - 1);
    }
    const s = on.find((x) => y >= x.box.top && y <= x.box.bottom) ?? on[0]!;
    const f = Math.min(1, Math.max(0, (y - s.box.top) / Math.max(1, boxHeight(s.box))));
    return paragraphAt(s.from + f * (s.to - s.from));
  };

  // Pictures and shapes on the pages.
  const insert = new Map<number, (string | Chunk)[]>();
  // `lead`: an opener's heading, which goes before whatever else its page
  // gives (a picture placed by the geometry would otherwise stand on the
  // page before the one the heading opens).
  const front: { page: number; chunks: Chunk[]; lead?: boolean }[] = [];
  const back: { page: number; chunks: Chunk[]; lead?: boolean }[] = [];
  const put = (where: number | 'before' | 'after', page: number, blocks: (string | Chunk)[]): void => {
    if (!blocks.length) return;
    const chunks = (): Chunk[] => blocks.map((b) => (typeof b === 'string' ? { kind: 'block', text: b } : b));
    if (where === 'before') front.push({ page, chunks: chunks() });
    else if (where === 'after') back.push({ page, chunks: chunks() });
    else insert.set(where, [...(insert.get(where) ?? []), ...blocks]);
  };
  /** A story that stands above or below the main story's frames on a
   *  page they share is part of the running text, in reading order: the
   *  paragraph of the main story it goes before (`n - 1`) or after. */
  const inSequence = (page: number, box: Box | undefined): number | undefined => {
    const on = shares.filter((s) => s.page === page);
    if (!on.length || !box) return undefined;
    // Beside: it shares more than half of its height with a frame of the
    // main story (frames set one under another may touch or lap a little).
    const shared = on.some((s) => Math.min(s.box.bottom, box.bottom) - Math.max(s.box.top, box.top) > 0.5 * Math.max(1, boxHeight(box)));
    if (shared) return undefined;
    const middle = (box.top + box.bottom) / 2;
    const above = on.filter((s) => (s.box.top + s.box.bottom) / 2 > middle);
    // Above the main text of the page: before the paragraph it opens with.
    if (above.length === on.length) return paragraphAt(on[0]!.from) - (on[0]!.from > 0 ? 0 : 1);
    return paragraphAt(on[on.length - 1]!.to - 1);
  };
  const leaves = doc.spreads.flatMap((spread) => leavesOf(ctx, spread));
  // Pages whose frames read together are set whole before anything else
  // is placed (#1556): a cover as a composed page, the frames above an
  // opener's running text as the design of its heading. What they hold
  // is left out of the passes below.
  const usedAnchors = new Set<string>();
  const units = flowUnits(ctx, stories, main, { leaves, headingAttrs, usedAnchors, generated: (e) => generatedKind(ctx, e.story) !== undefined });
  /** The paragraph of the main story after which the text of a page
   *  that opens at `from` goes on (-1: before the first). The share is an
   *  estimate; a break typed at the end of a paragraph near it (next
   *  page, next frame) is where the page really begins. */
  const openingParagraph = (from: number): number => {
    if (from <= 0) return -1;
    const guess = paragraphAt(from);
    const paragraphs = main!.story.paragraphs;
    const ends = (n: number): boolean => /Page|Frame/.test(paragraphs[n]?.breakAfter ?? '');
    for (let d = 0; d <= 3; d++) {
      if (ends(guess + d)) return guess + d;
      if (d && ends(guess - d)) return guess - d;
    }
    return guess;
  };
  const captionOf = new Map<Leaf, OrderedStory>();
  const captions = new Set<OrderedStory>();
  const pictures: Leaf[] = [];
  let shapes = 0;
  const shapePages = new Set<string>();
  {
    for (const leaf of leaves) {
      const item = leaf.at.item;
      if (units.items.has(item)) continue;
      if (item.graphic) {
        pictures.push(leaf);
        continue;
      }
      const drawn = (!item.textFrame?.story && (item.attrs.FillColor || item.attrs.StrokeColor || item.kind === 'GraphicLine') ? 1 : 0) + (item.textPaths.length ? 1 : 0);
      shapes += drawn;
      if (drawn && leaf.g.page) shapePages.add(leaf.g.page.name);
    }
  }
  if (shapes) ctx.rep.add('pageArtInFlow', 'loss', 'Shapes, rules and boxes drawn on the pages are left out of a flowing book, whose pages show its text, its pictures and its running heads only (layout: "pages" keeps them where they stand)', `page ${[...shapePages].slice(0, 8).join(', ')}`, shapes);
  // A caption is the short story grouped with a picture or set right
  // under it.
  for (const leaf of pictures) {
    const group = leaf.at.parents[leaf.at.parents.length - 1];
    let best: OrderedStory | undefined;
    for (const e of stories) {
      if (e === main || captions.has(e) || units.stories.has(e) || e.frames.length !== 1) continue;
      const f = e.frames[0]!;
      if (f.pageIndex !== leaf.g.pageIndex || !f.box) continue;
      const text = e.story.paragraphs.map(ownText).join(' ').trim();
      if (!text || text.length > 400 || e.story.paragraphs.length > 4) continue;
      const grouped = group ? group.children.includes(f.item) : false;
      const shared = Math.min(f.box.right, leaf.g.box.right) - Math.max(f.box.left, leaf.g.box.left);
      const under = f.box.top >= leaf.g.box.bottom - 3 && f.box.top <= leaf.g.box.bottom + 28 && shared >= 0.6 * Math.min(boxWidth(f.box), boxWidth(leaf.g.box));
      if (grouped || under) {
        best = e;
        break;
      }
    }
    if (best) {
      captions.add(best);
      captionOf.set(leaf, best);
    }
  }
  const typeArea = pages[0] ? pageSize(pages[0]).width - pages[0].margins.left - pages[0].margins.right : 0;
  const columns = pages[0]?.margins.columnCount ?? 1;
  for (const leaf of pictures) {
    const caption = captionOf.get(leaf);
    let text: string | undefined;
    let typeId = 'picture';
    if (caption) {
      const carry: string[] = [];
      const lines = caption.story.paragraphs.map((p) => withInlineBreaks(inlineOf(ctx, p, { where: 'snippet', look: ctx.looks.of(p), notes: [], after: [], before: [], carry, hooks }).text).trim()).filter(Boolean);
      text = lines.join(' ');
      const plain = caption.story.paragraphs.map(ownText).join(' ');
      const label = captionLabel(plain);
      // The label goes only when the Markdown opens with the same words,
      // set plain or in bold or italics (Postext sets its own label bold).
      const lead = label ? plain.slice(0, plain.length - label.rest.length).trim() : '';
      const marked = label ? new RegExp(`^(\\*\\*|\\*|__|_)?${lead.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1?`).exec(text) : null;
      if (label && marked) {
        text = text.slice(marked[0].length).trim();
        typeId = label.kind;
        if (!ctx.labelWords.has(label.kind)) ctx.labelWords.set(label.kind, label.word.replace(/\.$/, ''));
        ctx.rep.add('captionLabels', 'info', 'A caption\'s typed label ("Figure 3.") is replaced by Postext\'s own numbering of the resource', plain.slice(0, 40));
      }
      ctx.counts.stories++;
    }
    const y = (leaf.g.box.top + leaf.g.box.bottom) / 2;
    const h = pages[leaf.g.pageIndex] ? pageSize(pages[leaf.g.pageIndex]!).height : 0;
    const w = boxWidth(leaf.g.box);
    const id = pictureResource(ctx, leaf.at.item, {
      ...(text ? { caption: text } : {}),
      typeId,
      placement: { position: h && y < h / 3 ? 'top' : h && y > (2 * h) / 3 ? 'bottom' : 'auto', span: columns > 1 && typeArea && w > typeArea * 0.8 ? 'page' : 'column', width: pt(w), align: 'center' },
    });
    if (id) put(beside(leaf.g.pageIndex, leaf.g.box.top), leaf.g.pageIndex, [`::resource{id="${id}"}`]);
  }

  // Sections after the first start a page and its numbering.
  const sectionPages = doc.sections.slice(1).map((s) => ({ s, page: pages.find((p) => p.self === s.pageStart)?.index ?? -1 })).filter((x) => x.page >= 0);
  const pendingSections = [...sectionPages];
  const sectionBlocks = (upTo: number): Chunk[] => {
    const out: Chunk[] = [];
    while (pendingSections.length && pendingSections[0]!.page <= upTo) {
      const x = pendingSections.shift()!;
      out.push({ kind: 'break', text: ':::pagebreak' }, { kind: 'block', text: numberingDirective(ctx, x.s, x.page) });
    }
    return out;
  };
  for (const x of sectionPages) {
    const share = shares.find((s) => s.page === x.page);
    // A section that opens inside the main story's pages.
    if (share && share !== shares[0]) {
      const n = paragraphAt(share.from);
      put(n - 1, x.page, [':::pagebreak', numberingDirective(ctx, x.s, x.page)]);
      pendingSections.splice(pendingSections.indexOf(x), 1);
      ctx.rep.add('sectionInsideStory', 'warning', 'A section that starts inside the main story restarts the page numbering at the paragraph the page geometry suggests', `page ${pages[x.page]?.name ?? ''}`);
    }
  }

  // The stories in reading order.
  const chunks: Chunk[] = [];
  const emit = (e: OrderedStory, env: Partial<BlockEnv> = {}): Chunk[] => {
    ctx.counts.stories++;
    const kind = generatedKind(ctx, e.story);
    if (kind) return generatedBlocks(ctx, e.story, kind, 1);
    const page = e.frames.find((f) => f.page)?.page;
    const anchor = page ? ctx.pageAnchor.get(page.self) : undefined;
    const carry = anchor && !usedAnchors.has(anchor) ? [`:anchor{#${anchor}}`] : [];
    if (anchor) usedAnchors.add(anchor);
    return blocksOf(ctx, e.story.paragraphs, { notes: [], carry, hooks, target: 'flow', headingAttrs, ...(page ? { pageName: page.name } : {}), ...env });
  };
  const sides: OrderedStory[] = [];
  // A composed page stands where its page comes in the flow.
  for (const u of units.pages) {
    const where = beside(u.page, 0);
    if (where === 'before') front.push({ page: u.page, chunks: u.chunks });
    else if (where === 'after') back.push({ page: u.page, chunks: u.chunks });
    else put(where, u.page, u.chunks);
  }
  // An opener's heading goes before the running text of its page: in the
  // main story at the paragraph that page opens with, or before a story
  // that starts on it.
  const leads = new Map<OrderedStory, Chunk[]>();
  for (const o of units.openers) {
    if (o.body !== main) {
      leads.set(o.body, o.chunks);
      continue;
    }
    const on = shares.filter((s) => s.page === o.page);
    if (on.length) put(openingParagraph(on[0]!.from), o.page, o.chunks);
  }
  /** A running head or a page number set on a page rather than on its
   *  master (a Postext export draws them so): a short story in a frame of
   *  its own wholly in the head or foot margin of a page the main text
   *  runs on. It is no part of the running text. */
  const furniture = (e: OrderedStory): boolean => {
    const f = e.frames.length === 1 ? e.frames[0]! : undefined;
    if (!f?.page || !f.box || !shares.some((s) => s.page === f.pageIndex)) return false;
    if (e.story.paragraphs.length > 2 || e.story.paragraphs.map(ownText).join(' ').trim().length > 200) return false;
    const m = f.page.margins;
    return f.box.bottom <= m.top + 2 || f.box.top >= pageSize(f.page).height - m.bottom - 2;
  };
  let inOrder = 0;
  let heads = 0;
  bookmarkChapters(ctx, main, insert, (page) => {
    const share = shares.find((s) => s.page === page);
    return share ? paragraphAt(share.from) : undefined;
  });
  for (const e of stories) {
    if (e === main || captions.has(e) || units.stories.has(e)) continue;
    if (furniture(e)) {
      heads++;
      continue;
    }
    const page = firstPage(e);
    const box = e.frames.find((f) => f.box)?.box;
    const where = beside(page, box ? box.top : 0);
    const lead = leads.get(e) ?? [];
    if (where === 'before' || where === 'after') {
      const list = where === 'before' ? front : back;
      if (lead.length) list.push({ page, chunks: lead, lead: true });
      list.push({ page, chunks: emit(e) });
    }
    else {
      const item = e.frames[0]!.item;
      const dress = boxLook(ctx, item, 'side story');
      const sequence = dress.fill || dress.stroke ? undefined : inSequence(page, box);
      if (sequence !== undefined) {
        inOrder++;
        put(sequence, page, [...lead, ...emit(e)]);
        continue;
      }
      if (lead.length) put(where, page, lead);
      // A story beside the main one is a box at the paragraph it faces.
      sides.push(e);
      const style = calloutStyleFor(ctx, item, dress);
      const inner = emit(e, { target: 'box' });
      const width = box ? boxWidth(box) : 0;
      const column = shares.find((s) => s.page === page)?.box;
      const narrow = column && width > 0 && width < boxWidth(column) * 0.7;
      const side = column && box && (box.left + box.right) / 2 < (column.left + column.right) / 2 ? 'left' : 'right';
      const attrs = narrow ? ` wrap="${side}" width=${Math.round((width / boxWidth(column)) * 100) / 100}` : '';
      if (inner.length) put(where, page, [`:::callout{type="${style}"${attrs}}\n${joinChunks(inner)}\n:::`]);
    }
  }
  if (sides.length) ctx.rep.add('sideStories', 'info', 'Stories that stand beside the main text (or in a filled or stroked frame of their own) are boxes set at the paragraph of the main story the page geometry suggests', undefined, sides.length);
  if (heads) ctx.rep.add('runningHeadsOnPages', 'loss', 'Running heads and page numbers set on the pages, in their head or foot margins, are left out of the running text: a flowing book draws its own from its design (set it in Design → Running heads)', undefined, heads);
  if (inOrder) ctx.rep.add('storiesInSequence', 'info', 'Stories set in plain frames above or below the main text on its pages are part of the running text, in reading order', undefined, inOrder);
  const byPage = (a: { page: number; lead?: boolean }, b: { page: number; lead?: boolean }): number => a.page - b.page || Number(!!b.lead) - Number(!!a.lead);
  front.sort(byPage);
  back.sort(byPage);
  let lastPage = -1;
  for (const f of front) {
    chunks.push(...sectionBlocks(f.page));
    if (lastPage >= 0 && f.page !== lastPage && chunks.length) chunks.push({ kind: 'break', text: ':::pagebreak' });
    chunks.push(...f.chunks);
    lastPage = f.page;
  }
  if (main) {
    chunks.push(...sectionBlocks(shares[0]?.page ?? firstPage(main)));
    chunks.push(...emit(main, { insert }));
  }
  for (const b of back) {
    chunks.push(...sectionBlocks(b.page));
    chunks.push(...b.chunks);
  }
  chunks.push(...sectionBlocks(Number.MAX_SAFE_INTEGER));
  for (const [self, id] of ctx.pageAnchor) if (!usedAnchors.has(id)) ctx.rep.add('pageLinkTarget', 'warning', 'A link points at a page no story starts on; in a flowing book the link leads nowhere', ctx.pageByRef(self)?.name ?? id);

  // Chapters at the level-1 headings.
  const chapters: FlowResult['chapters'] = [];
  let current: Chunk[] = [];
  let title: string | undefined;
  const flush = (): void => {
    if (current.some((c) => c.kind !== 'break')) chapters.push({ title: title || doc.title || doc.name || `Chapter ${chapters.length + 1}`, markdown: `${joinChunks(current)}\n` });
    else if (chapters.length && current.length) chapters[chapters.length - 1]!.markdown += `\n${joinChunks(current)}\n`;
    current = [];
    title = undefined;
  };
  for (const c of chunks) {
    if (c.chapter !== undefined) {
      flush();
      title = c.chapter;
      continue;
    }
    if (c.kind === 'heading' && c.level === 1) {
      // Breaks and numbering set right before a chapter open it.
      const lead: Chunk[] = [];
      while (current.length && (current[current.length - 1]!.kind === 'break' || /^:::numbering/.test(current[current.length - 1]!.text))) lead.unshift(current.pop()!);
      flush();
      current.push(...lead);
      title = c.title;
    }
    current.push(c);
  }
  flush();
  return { chapters, words, labels, templates: units.templates, headingStyles: units.headingStyles };
}
