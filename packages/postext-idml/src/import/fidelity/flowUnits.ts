// Pages of a flowing book that are set as one unit (#1556).
//
// A flowing book sets its main story as running text and every other
// story at the paragraph the page geometry suggests, one story at a time.
// That suits a picture or a box beside the text. It does not suit a page
// built from several frames that only read together: the frames of a
// cover (title, subtitle, a key of three numbered squares) came out one
// after another, the squares and bands under them were left out, and
// white words were set on white paper or pushed onto the next page.
//
// So two kinds of page are taken out of the story-by-story pass and set
// whole, from where their frames stand:
//
// - A page with no running text (no frame of the main story, no long
//   story on it) whose frames all hold short stories of that page, with
//   artwork or more than one frame: a cover, a title page, a divider.
//   It becomes a composed page in the flow, a template with a frame for
//   each text frame at its place and the shapes and pictures as its
//   decoration.
// - A page where running text starts under frames of other stories, one
//   of them a heading, with a band, a picture or a filled frame among
//   them: an opener. The heading leads the running text of
//   that page and opens a page of its own; its design draws what stands
//   above the text (a band and its picture, the kicker and the route, a
//   tab on the fore edge) where InDesign has it. The words of the frames
//   other than the title travel as attributes of the heading, so the
//   configuration holds no text and openers drawn alike share a style.
//
// Frames are read top to bottom, then from left to right, as the reading
// order reads them; their paint order is kept for the layers.

import type { DesignElement, FrameConfig, HeadingStyleConfig, PageTemplate } from 'postext';
import type { IdmlPage, IdmlPageItem } from '../../model/document.js';
import { boxHeight, overlap, type Box } from '../../model/geometry.js';
import { graphicCrop } from '../../resolve/geometry.js';
import { masterItems } from '../../resolve/masters.js';
import type { OrderedStory } from '../../resolve/order.js';
import { plainText } from '../../read/story.js';
import { blocksOf, joinChunks, type Chunk } from '../blocks.js';
import type { Context } from '../context.js';
import { masterElements, placeAt, shapeElement, type MasterWords } from '../design.js';
import { makeHooks } from '../hooks.js';
import { ownText } from '../looks.js';
import { boxLook, calloutStyleFor } from '../objects.js';
import { allPages, parityOf } from '../pagesetup.js';
import { pictureResource } from '../pictures.js';
import type { Leaf } from '../scan.js';
import { pt } from '../values.js';
import { FOOT_ROOM, frameBox, VERTICAL } from '../frames.js';
import { firstLineShift, frameSetup, fromTop, openingLines } from './baseline.js';

/** A story this long is running text, even in one paragraph (a book
 *  exported a paragraph to a frame): a page that holds a frame of it is
 *  not a cover. Titles, kickers and keys are shorter. */
const RUNNING = 200;
export interface FlowUnits {
  /** Page items the units draw; the rest of the flow leaves them alone. */
  items: Set<IdmlPageItem>;
  /** Stories the units set. */
  stories: Set<OrderedStory>;
  /** Composed pages: the page and its fence (after a break to its side
   *  of the sheet). */
  pages: { page: number; chunks: Chunk[] }[];
  /** Openers: the page, the story whose text the heading opens, and the
   *  heading (with what else its frame holds). */
  openers: { page: number; body: OrderedStory; chunks: Chunk[] }[];
  templates: PageTemplate[];
  headingStyles: HeadingStyleConfig[];
}

export interface UnitEnv {
  /** The items of every spread that draw something, back to front. */
  leaves: readonly Leaf[];
  /** Attributes every level-1 heading carries (the running heads' words). */
  headingAttrs: string[];
  /** Page anchors already given to a story. */
  usedAnchors: Set<string>;
  /** The story is one InDesign generated (a contents, an index). */
  generated: (e: OrderedStory) => boolean;
}

/** A frame's box, or undefined for one with no width or height (a rule),
 *  which holds no text. */
function sizedFrameBox(leaf: Leaf): { box: Box; rotation: number } | undefined {
  const fb = frameBox(leaf);
  return fb && fb.box.right - fb.box.left > 0.01 && fb.box.bottom - fb.box.top > 0.01 ? fb : undefined;
}

interface Placed {
  box: Box;
  z: number;
  /** The top-level group the item stands in, if any. */
  group?: IdmlPageItem;
}

/** Rows top to bottom, each row left to right. A frame joins the row
 *  above when the two share more than half the shorter one's height, so a
 *  numeral set a point higher than the word beside it is still read
 *  before that word, and a tall frame is read before the frames stacked
 *  beside it. */
function rows<T extends Placed>(items: readonly T[]): T[] {
  const sorted = [...items].sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left || a.z - b.z);
  const out: T[][] = [];
  for (const it of sorted) {
    const row = out[out.length - 1];
    const shared = (r: T): boolean => Math.min(r.box.bottom, it.box.bottom) - Math.max(r.box.top, it.box.top) > 0.5 * Math.min(boxHeight(r.box), boxHeight(it.box));
    if (row?.some(shared)) row.push(it);
    else out.push([it]);
  }
  return out.flatMap((r) => r.sort((a, b) => a.box.left - b.box.left || a.box.top - b.box.top || a.z - b.z));
}

/** The reading order of a page's frames (#1556): rows as above, the
 *  frames of a group read together where the group stands. */
export function readingOrder<T extends Placed>(items: readonly T[]): T[] {
  const groups = new Map<IdmlPageItem, T[]>();
  const blocks: (Placed & { members: T[] })[] = [];
  for (const it of items) {
    if (!it.group) {
      blocks.push({ box: it.box, z: it.z, members: [it] });
      continue;
    }
    const list = groups.get(it.group);
    if (list) list.push(it);
    else groups.set(it.group, [it]);
  }
  for (const members of groups.values()) {
    const box = members.reduce<Box>((u, m) => ({ left: Math.min(u.left, m.box.left), top: Math.min(u.top, m.box.top), right: Math.max(u.right, m.box.right), bottom: Math.max(u.bottom, m.box.bottom) }), { ...members[0]!.box });
    blocks.push({ box, z: Math.min(...members.map((m) => m.z)), members });
  }
  return rows(blocks).flatMap((b) => (b.members.length > 1 ? rows(b.members) : b.members));
}

export function flowUnits(ctx: Context, stories: readonly OrderedStory[], main: OrderedStory | undefined, env: UnitEnv): FlowUnits {
  const out: FlowUnits = { items: new Set(), stories: new Set(), pages: [], openers: [], templates: [], headingStyles: [] };
  const byStory = new Map(stories.map((e) => [e.story.self, e]));
  // The frames of a story joined to another hold the joined story.
  for (const [self, e] of ctx.alias) byStory.set(self, e);
  const storyOf = (item: IdmlPageItem): OrderedStory | undefined => (item.textFrame?.story ? byStory.get(item.textFrame.story) : undefined);
  const lengths = new Map<OrderedStory, number>();
  const lengthOf = (e: OrderedStory): number => {
    let n = lengths.get(e);
    if (n === undefined) lengths.set(e, (n = plainText(e.story.paragraphs).trim().length));
    return n;
  };
  const running = (e: OrderedStory): boolean => e === main || lengthOf(e) >= RUNNING;
  const onlyHere = (e: OrderedStory, page: number): boolean => e.frames.length > 0 && e.frames.every((f) => f.pageIndex === page);
  const templateIds = new Map<string, string>();
  const styleIds = new Map<string, string>();
  const takenIds = new Set([...ctx.looks.all.values()].map((l) => l.id).filter((id): id is string => !!id));
  const composed: string[] = [];
  const openers: string[] = [];

  for (const page of allPages(ctx)) {
    const p = page.index;
    const mine = env.leaves.filter((l) => l.g.pageIndex === p && !out.items.has(l.at.item));
    if (!mine.length) continue;
    // Text on a path is left to the flow: a composed frame cannot hold it.
    if (mine.some((l) => l.at.item.textPaths.some((t) => byStory.has(t.story)))) continue;
    const here = stories.filter((e) => e.frames.some((f) => f.pageIndex === p));
    const runningHere = here.filter(running);
    if (!runningHere.length) {
      if (composePage(page, mine)) composed.push(page.name);
      continue;
    }
    // The running text of the page: the main story's, or that of a long
    // story that starts here. A story that only goes on here has its
    // opening elsewhere, and what stands above it is left to the flow.
    const body = main && runningHere.includes(main) ? main : runningHere.filter((e) => e.frames[0]?.pageIndex === p).sort((a, b) => lengthOf(b) - lengthOf(a))[0];
    if (!body) continue;
    if (opener(page, mine, body)) openers.push(page.name);
  }
  if (composed.length) ctx.rep.add('composedPagesInFlow', 'info', 'Pages with no running text whose frames read together (a cover, a title page, a divider) are set as composed pages of the flowing book: each frame where InDesign has it, the shapes and pictures under them', composed.slice(0, 8).map((n) => `page ${n}`).join(', '), composed.length);
  if (openers.length) ctx.rep.add('openerDesigns', 'info', 'The frames above the running text of an opener page (its title, a kicker, a band, a tab) are drawn by the design of a heading that opens the page; the words of the frames other than the title travel as attributes of the heading', openers.slice(0, 8).map((n) => `page ${n}`).join(', '), openers.length);
  return out;

  /** A page set whole as a composed page; false when it is not one. */
  function composePage(page: IdmlPage, mine: readonly Leaf[]): boolean {
    const p = page.index;
    const where = `page ${page.name}`;
    const texts = mine.filter((l) => storyOf(l.at.item));
    if (!texts.length) return false;
    // Every frame holds a story of this page alone: a thread that runs on
    // to another page is running text in the making.
    if (texts.some((l) => { const e = storyOf(l.at.item)!; return e === main || out.stories.has(e) || env.generated(e) || !onlyHere(e, p) || !sizedFrameBox(l); })) return false;
    const art = mine.some((l) => {
      if (storyOf(l.at.item)) return false;
      if (l.at.item.graphic) return true;
      const look = boxLook(ctx, l.at.item, where);
      return !!(look.fill || look.stroke);
    });
    if (texts.length < 2 && !art) return false;

    const decoration: DesignElement[] = [];
    const words: MasterWords = { attrs: new Map() };
    if (ctx.opt.masterItems) {
      masterItems(ctx.doc, page).forEach((mi, n) => {
        masterElements(ctx, mi.item, { toPage: mi.toPage, id: `m${n + 1}`, words, where: `master of ${where}` }, decoration);
      });
    }
    let slots: (Placed & { leaf: Leaf; rotation: number; e: OrderedStory; name: string })[] = [];
    let over = 0;
    for (const leaf of mine) {
      const item = leaf.at.item;
      out.items.add(item);
      const e = storyOf(item);
      if (e) {
        const fb = sizedFrameBox(leaf)!;
        slots.push({ leaf, ...fb, z: leaf.z, e, name: '', ...(leaf.at.parents[0] ? { group: leaf.at.parents[0] } : {}) });
        continue;
      }
      // Pictures and shapes are the page's decoration, in paint order; a
      // template's decoration lies under its frames.
      if (slots.some((s) => overlap(s.box, leaf.g.box) > 1)) over++;
      const shape = shapeElement(ctx, item, { toPage: leaf.g.toPage, id: `s${leaf.z}`, words, where });
      if (shape) decoration.push(shape);
      if (!item.graphic) continue;
      const id = pictureResource(ctx, item);
      if (!id) continue;
      // A picture its frame crops covers the frame about the cropped
      // part's centre; one shown whole keeps its proportions.
      const crop = graphicCrop(item);
      const cropped = !!crop && crop.width > 0 && crop.height > 0 && (crop.width < 0.995 || crop.height < 0.995) && Math.abs(crop.rotation) < 0.01;
      const r4 = (n: number): number => Math.round(n * 10000) / 10000;
      decoration.push({ kind: 'image', id: `s${leaf.z}-picture`, pin: true, reserve: false, placement: placeAt(leaf.g.box), resourceId: id, decorative: !item.altText, fit: cropped ? 'cover' : 'contain', ...(cropped ? { focus: { x: r4(crop.x + crop.width / 2), y: r4(crop.y + crop.height / 2) } } : {}) });
    }
    if (over) ctx.rep.add('shapeOverFrame', 'warning', 'A shape drawn over a text or picture frame is painted under it: page decoration lies under the frames', where, over);

    slots = readingOrder(slots);
    slots.forEach((s, n) => (s.name = `t${n + 1}`));
    const layers = [...new Set(slots.map((s) => s.z))].sort((a, b) => a - b);
    const frames: FrameConfig[] = [];
    const pieces: string[] = [];
    const hooks = makeHooks(ctx, 'frame');
    const anchor = ctx.pageAnchor.get(page.self);
    for (const s of slots) {
      const item = s.leaf.at.item;
      const tf = item.textFrame!;
      const story = s.e.story;
      const setup = frameSetup(ctx, item);
      const [, left, bottom, right] = setup.inset;
      let top = setup.inset[0];
      let box = s.box;
      const look = boxLook(ctx, item, where);
      const style = look.fill || look.stroke ? calloutStyleFor(ctx, item, look, false) : undefined;
      const horizontal = story.orientation !== 'vertical';
      // The first baseline where InDesign has it (see `baseline.ts`).
      if (fromTop(setup) && horizontal) {
        const shift = firstLineShift(ctx, setup, openingLines(ctx, story.paragraphs), where);
        if (top + shift >= 0) top += shift;
        else if (!style && !s.rotation) {
          box = { ...box, top: box.top + top + shift };
          top = 0;
        } else top = 0;
      }
      if (!style && !s.rotation && horizontal) box = { ...box, bottom: box.bottom + FOOT_ROOM * (ctx.looks.body?.cf.leading ?? 12) };
      const f: FrameConfig = { name: s.name, placement: placeAt(box, 'container'), layer: 1 + layers.indexOf(s.z), optional: true, pin: true };
      if (s.rotation) f.rotate = Math.round(s.rotation * 100) / 100;
      if (style) f.style = style;
      if (slots.some((o) => o !== s && overlap(o.box, s.box) > 1)) f.overlap = 'allow';
      if (top || left || bottom || right || style) f.padding = { top: pt(top), left: pt(left), bottom: pt(bottom), right: pt(right) };
      if (tf.columns > 1) {
        f.columns = tf.columns;
        f.columnGap = pt(tf.gutter);
      }
      const v = VERTICAL[setup.verticalJustification];
      if (v) f.verticalAlign = v;
      if (!horizontal) f.writingMode = 'vertical-rl';
      if (story.direction === 'rtl') f.direction = 'rtl';
      frames.push(f);

      out.stories.add(s.e);
      ctx.counts.stories++;
      const notes: string[] = [];
      const carry: string[] = [];
      let text = joinChunks(blocksOf(ctx, story.paragraphs, { notes, carry, hooks, target: 'frame', pageName: page.name }));
      if (carry.length) text += (text ? '\n\n' : '') + carry.join('');
      if (notes.length) text += `\n\n${notes.join('\n\n')}`;
      if (anchor && !env.usedAnchors.has(anchor)) {
        env.usedAnchors.add(anchor);
        text = `:anchor{#${anchor}}${text}`;
      }
      if (text.trim()) pieces.push(`:::frame{slot="${s.name}"}\n${text}\n:::`);
    }
    const signature = JSON.stringify([frames, decoration]);
    let id = templateIds.get(signature);
    if (!id) {
      id = `page-${out.templates.length + 1}`;
      templateIds.set(signature, id);
      const master = ctx.doc.masterSpreads.find((m) => m.self === page.appliedMaster);
      out.templates.push({ id, name: `Page ${page.name}${master?.name ? ` (${master.name})` : ''}`, area: 'trim', header: false, footer: false, frames, ...(decoration.length ? { decoration: { elements: decoration } } : {}) });
    }
    const attrs = [...words.attrs].map(([k, v]) => ` ${k}="${v}"`).join('');
    const chunks: Chunk[] = [{ kind: 'block', text: `::::page{template="${id}"${attrs}}\n${pieces.join('\n\n')}${pieces.length ? '\n' : ''}::::` }];
    // A page after the first keeps its side of the sheet: a divider on the
    // left faces the opener on the right, as in InDesign.
    const parity = p > 0 ? parityOf(ctx, page) : undefined;
    if (parity) chunks.unshift({ kind: 'break', text: `:::pagebreak{parity="${parity}"}` });
    out.pages.push({ page: p, chunks });
    return true;
  }

  /** The frames above the running text of a page as the design of the
   *  heading that opens it; false when the page has no such heading. */
  function opener(page: IdmlPage, mine: readonly Leaf[], body: OrderedStory): boolean {
    const p = page.index;
    const where = `page ${page.name}`;
    const bodyFrames = body.frames.filter((f) => f.pageIndex === p && f.box);
    if (!bodyFrames.length) return false;
    const bodyItems = new Set(bodyFrames.map((f) => f.item));
    const top = Math.min(...bodyFrames.map((f) => f.box!.top));
    // What starts above the running text: what ends before it does, or
    // stands clear of its frames to the side (a tab on the fore edge).
    const beside = (b: Box): boolean => bodyFrames.every((f) => Math.min(f.box!.right, b.right) - Math.max(f.box!.left, b.left) <= 1);
    const unit = mine.filter((l) => !bodyItems.has(l.at.item) && l.g.box.top < top - 1 && (l.g.box.bottom <= top + 2 || beside(l.g.box)));
    const texts = unit.filter((l) => storyOf(l.at.item));
    if (!texts.length) return false;
    // Only a designed opener: a band, a picture or a filled frame among
    // them. Plain title frames over the text read well as running text in
    // the order they stand (`inSequence` in `flow.ts`), and keep their
    // inline formatting there.
    if (!unit.some((l) => { if (l.at.item.graphic) return true; const look = boxLook(ctx, l.at.item, where); return !!(look.fill || look.stroke); })) return false;
    // Each frame holds a short story of its own page: a thread that runs
    // on is left to the flow, and so is the page.
    if (texts.some((l) => { const e = storyOf(l.at.item)!; return e === main || e === body || out.stories.has(e) || env.generated(e) || !onlyHere(e, p); })) return false;
    // The title: the frame whose first words are the highest heading.
    const headingOf = (l: Leaf): { level: number; size: number } | undefined => {
      const first = storyOf(l.at.item)!.story.paragraphs.find((x) => ownText(x).trim());
      const look = first ? ctx.looks.of(first) : undefined;
      return look?.role === 'heading' ? { level: look.level ?? 1, size: look.cf.pointSize } : undefined;
    };
    let title: Leaf | undefined;
    for (const { leaf: l } of readingOrder(texts.map((leaf) => ({ box: leaf.g.box, z: leaf.z, leaf })))) {
      const h = headingOf(l);
      const best = title ? headingOf(title)! : undefined;
      if (h && (!best || h.level < best.level || (h.level === best.level && h.size > best.size))) title = l;
    }
    if (!title) return false;
    const titleStory = storyOf(title.at.item)!;
    const notes: string[] = [];
    const chunks = blocksOf(ctx, titleStory.story.paragraphs, { notes, carry: [], hooks: makeHooks(ctx, 'flow'), target: 'flow', headingAttrs: env.headingAttrs, pageName: page.name });
    // A kicker typed in the title's own frame, before the title, would
    // stay behind on the page before the opener: such a page is left to
    // the flow.
    const at = chunks.findIndex((c) => c.kind === 'heading');
    if (at !== 0) return false;

    // The design: everything of the unit in paint order, each at its
    // place on the page. It reserves nothing itself: the heading keeps
    // the room down to the top of the running text (`minHeight`).
    const elements: DesignElement[] = [];
    const words: MasterWords = { attrs: new Map() };
    let n = 0;
    for (const l of unit) {
      out.items.add(l.at.item);
      const own = l === title;
      masterElements(ctx, l.at.item, { toPage: l.g.toPage, id: own ? 'title' : `u${++n}`, words: own ? { attrs: new Map() } : words, where }, elements);
    }
    const titleText = elements.find((e) => e.kind === 'text' && e.id === 'title-text');
    if (titleText && titleText.kind === 'text') titleText.content = '{titleText}';
    const room = top - page.margins.top;
    const parity = parityOf(ctx, page);
    const design = { span: 'page' as const, breakBefore: { enabled: true, ...(parity ? { parity } : {}) }, marginTop: pt(0), marginBottom: pt(0), snapToGrid: false, advancedDesign: { enabled: true, slot: { elements }, ...(room > 0 ? { minHeight: pt(room) } : {}) } };
    const signature = JSON.stringify(design);
    let id = styleIds.get(signature);
    if (!id) {
      id = 'opener';
      for (let k = 2; takenIds.has(id); k++) id = `opener-${k}`;
      takenIds.add(id);
      styleIds.set(signature, id);
      out.headingStyles.push({ id, name: `Opener (page ${page.name})`, ...design });
    }

    // The heading line takes the opener's style in place of its look's,
    // and the other frames' words as attributes.
    const heading = chunks[at]!;
    const m = /^(#{1,6} .*?)(?: \{([^{}]*)\})?$/s.exec(heading.text)!;
    const kept = (m[2]?.match(/\S+?="[^"]*"|\S+/g) ?? []).filter((a) => !a.startsWith('style='));
    const attrs = [`style="${id}"`, ...kept, ...[...words.attrs].map(([k, v]) => `${k}="${v}"`)];
    chunks[at] = { ...heading, text: `${m[1]} {${attrs.join(' ')}}` };
    for (const note of notes) chunks.push({ kind: 'block', text: note });
    for (const l of texts) {
      const e = storyOf(l.at.item)!;
      if (!out.stories.has(e)) ctx.counts.stories++;
      out.stories.add(e);
    }
    out.openers.push({ page: p, body, chunks });
    return true;
  }
}
