// Layout `pages`: every page of the document as a composed page.
//
// A page template holds the frames of one kind of page at their boxes
// (from the trim's top left corner, in points), the shapes and master
// artwork as decoration, and the threads between frames; the Markdown
// holds one page fence per page with a `:::frame` per story, in reading
// order. Pages whose frames stand in the same places share a template.
// A story is written whole where its thread starts: the template sends
// what does not fit to the next frame of the thread, on the same page or
// on a later one.

import type { DesignElement, FrameConfig, PageTemplate } from 'postext';
import type { IdmlPage, IdmlPageItem } from '../model/document.js';
import { apply, boxCentre, boxHeight, boxWidth, decompose, isRectangle, overlap, pathExtent, type Box } from '../model/geometry.js';
import { graphicCrop, pageSize } from '../resolve/geometry.js';
import { masterItems } from '../resolve/masters.js';
import type { OrderedStory } from '../resolve/order.js';
import { blocksOf, joinChunks, type Chunk } from './blocks.js';
import type { Context } from './context.js';
import { masterElements, placeAt, shapeElement, type MasterWords } from './design.js';
import { customAnchors, type HostFrame } from './fidelity/anchorPlaces.js';
import { firstLineShift, frameSetup, fromTop, openingLines, runningLines } from './fidelity/baseline.js';
import { makeHooks } from './hooks.js';
import { boxLook, calloutStyleFor } from './objects.js';
import { numberingDirective } from './pagesetup.js';
import { pictureResource } from './pictures.js';
import { freeBands, jumpObjectOf, meetsWithOffsets, spansColumns, type JumpObject } from './jumps.js';
import { hasContent, leavesOf, type Leaf } from './scan.js';
import { pt } from './values.js';

interface Slot {
  leaf: Leaf;
  kind: 'text' | 'picture' | 'box';
  /** The frame's own box on the page, before its turn. */
  box: Box;
  rotation: number;
  name: string;
  page: number;
  story?: string;
  /** The story is set on the item's path. */
  onPath?: boolean;
  resource?: string;
  style?: string;
  /** A band of a text frame cut round a jump object (#1554) after the
   *  first: the frame's text goes on in it. */
  continues?: boolean;
  /** The next band of the same frame, which the text runs into. */
  nextPiece?: Slot;
}

interface PagePlan {
  page: IdmlPage;
  slots: Slot[];
  decoration: DesignElement[];
  words: MasterWords;
  /** Objects whose wrap keeps text off their whole width (#1554). */
  jumps: JumpObject[];
}

const VERTICAL: Record<string, FrameConfig['verticalAlign']> = { CenterAlign: 'middle', BottomAlign: 'bottom', JustifyAlign: 'justify' };
const snap = (n: number): number => Math.round(n / 2.835) * 2.835;

/** A frame's own rectangle on the page and its turn. */
function frameBox(leaf: Leaf): { box: Box; rotation: number; flipped: boolean } | undefined {
  const own = pathExtent(leaf.at.item.paths);
  if (!own) return undefined;
  const d = decompose(leaf.g.toPage);
  const w = boxWidth(own) * d.scaleX;
  const h = boxHeight(own) * d.scaleY;
  const c = apply(leaf.g.toPage, boxCentre(own));
  if (![w, h, c.x, c.y].every(Number.isFinite)) return undefined;
  return { box: { left: c.x - w / 2, top: c.y - h / 2, right: c.x + w / 2, bottom: c.y + h / 2 }, rotation: Math.abs(d.rotation) < 0.01 ? 0 : d.rotation, flipped: d.flipped };
}

export interface PagesResult {
  templates: PageTemplate[];
  chapters: { title: string; markdown: string }[];
}

/** The room under a plain text frame, in leadings (see where it is used). */
const FOOT_ROOM = 0.2;

export function layoutPages(ctx: Context, stories: readonly OrderedStory[]): PagesResult {
  const doc = ctx.doc;
  const wanted = new Map(stories.map((e) => [e.story.self, e]));
  // The frames of a story joined to another (a paragraph that goes on in
  // the next frame) hold the joined story.
  for (const [self, e] of ctx.alias) wanted.set(self, e);
  const plans: PagePlan[] = [];
  const slotOf = new Map<string, Slot>();

  // Pass 1: what stands on each page.
  for (const spread of doc.spreads) {
    const leaves = leavesOf(ctx, spread);
    for (const page of spread.pages) {
      const plan: PagePlan = { page, slots: [], decoration: [], words: { attrs: new Map() }, jumps: [] };
      plans.push(plan);
      const mine = leaves.filter((l) => l.g.page === page);
      const size = pageSize(page);
      if (ctx.opt.masterItems) {
        masterItems(doc, page).forEach((mi, n) => {
          masterElements(ctx, mi.item, { toPage: mi.toPage, id: `m${n + 1}`, words: plan.words, where: `master of page ${page.name}` }, plan.decoration);
        });
      }
      const shapes: { leaf: Leaf; element: DesignElement; box: Box }[] = [];
      for (const leaf of mine) {
        const item = leaf.at.item;
        const where = `page ${page.name}`;
        const jump = jumpObjectOf(item, leaf.g.box);
        if (jump) plan.jumps.push(jump);
        const fb = frameBox(leaf);
        if (!fb || !(boxWidth(fb.box) > 0.01) || !(boxHeight(fb.box) > 0.01)) {
          // A rule has no height: it is still a shape.
          const el = shapeElement(ctx, item, { toPage: leaf.g.toPage, id: `s${leaf.z}`, words: plan.words, where });
          if (el) shapes.push({ leaf, element: el, box: leaf.g.box });
          else if (item.textFrame?.story && wanted.has(item.textFrame.story)) ctx.rep.add('emptyFrameSize', 'warning', 'A text frame with no width or height cannot hold text; its story is set in the next frame of its thread, or left out', where);
          continue;
        }
        if (fb.flipped) ctx.rep.add('flippedFrame', 'warning', 'A mirrored frame is set unmirrored', where);
        if (leaf.g.box.right > size.width + 1 && leaf.g.box.left < size.width - 1 && spread.pages.length > 1) ctx.rep.add('acrossSpine', 'warning', 'An object that runs across the spine is set on the page that holds most of it', where);
        const held = item.textFrame?.story;
        const story = held && wanted.has(held) ? wanted.get(held)!.story.self : held;
        const base = { leaf, box: fb.box, rotation: fb.rotation, name: '', page: page.index };
        if (story && wanted.has(story) && hasContent(wanted.get(story)!.story)) {
          const slot: Slot = { ...base, kind: 'text', story };
          const look = boxLook(ctx, item, where);
          if (look.fill || look.stroke) slot.style = calloutStyleFor(ctx, item, look, false);
          if (!isRectangle(item.paths)) ctx.rep.add('shapedTextFrame', 'warning', 'Text in a frame that is not a rectangle is set in the frame\'s bounding box', where);
          plan.slots.push(slot);
          slotOf.set(item.self, slot);
        } else if (item.graphic) {
          const id = pictureResource(ctx, item);
          // A picture its frame crops is drawn by the template, which
          // can cover a box with a picture about a point of it; a frame
          // of the page would show the whole picture.
          const crop = graphicCrop(item);
          if (id && crop && !fb.rotation && crop.width > 0 && crop.height > 0 && (crop.width < 0.995 || crop.height < 0.995) && Math.abs(crop.rotation) < 0.01) {
            const look = boxLook(ctx, item, where);
            const r4 = (n: number): number => Math.round(n * 10000) / 10000;
            plan.decoration.push({ kind: 'image', id: `s${leaf.z}`, pin: true, reserve: false, placement: placeAt(fb.box), resourceId: id, decorative: !item.altText, fit: 'cover', focus: { x: r4(crop.x + crop.width / 2), y: r4(crop.y + crop.height / 2) } });
            if (look.stroke) plan.decoration.push({ kind: 'box', id: `s${leaf.z}-edge`, pin: true, reserve: false, placement: placeAt(fb.box), style: { borderColor: look.stroke, borderWidth: pt(look.strokeWeight) } });
            ctx.rep.add('croppedPictureAsDecoration', 'warning', 'A picture its frame crops is drawn by the page template (cover, about the cropped part\'s centre): it keeps its crop on the page and is not part of reflowable output', item.graphic.link?.name ?? where);
            continue;
          }
          const slot: Slot = { ...base, kind: 'picture', ...(id ? { resource: id } : {}) };
          const look = boxLook(ctx, item, where);
          if (look.fill || look.stroke) slot.style = calloutStyleFor(ctx, item, look, false);
          plan.slots.push(slot);
        } else {
          const el = shapeElement(ctx, item, { toPage: leaf.g.toPage, id: `s${leaf.z}`, words: plan.words, where });
          if (el) shapes.push({ leaf, element: el, box: leaf.g.box });
        }
        for (const path of item.textPaths) {
          if (!wanted.has(path.story)) continue;
          plan.slots.push({ ...base, rotation: 0, box: leaf.g.box, kind: 'text', story: path.story, onPath: true });
        }
        if (item.wrap && item.wrap.mode === 'Contour') ctx.rep.add('contourWrap', 'warning', 'Text wrap round an object\'s outline is set round its bounding box', where);
      }
      // A shape painted over a frame cannot be decoration (decoration
      // lies under the frames): an upright filled rectangle becomes an
      // empty frame with its look, anything else is reported.
      for (const s of shapes) {
        const over = plan.slots.some((f) => f.leaf.z < s.leaf.z && overlap(f.box, s.box) > 1);
        const item = s.leaf.at.item;
        if (over && s.element.kind === 'box') {
          const look = boxLook(ctx, item, `page ${page.name}`);
          plan.slots.push({ leaf: s.leaf, kind: 'box', box: s.box, rotation: 0, name: '', page: page.index, style: calloutStyleFor(ctx, item, look, false) });
        } else {
          if (over) ctx.rep.add('shapeOverFrame', 'warning', 'A shape drawn over a text or picture frame is painted under it: page decoration lies under the frames', `page ${page.name}`);
          plan.decoration.push(s.element);
        }
      }
    }
  }

  // Objects anchored at a custom position get a frame of their own where
  // their rule puts them, on the page of the frame their anchor stands in.
  for (const e of stories) {
    const hosts: (HostFrame & { slot: Slot })[] = [];
    for (const fp of e.frames) {
      const slot = slotOf.get(fp.item.self);
      if (slot && !slot.rotation && !slot.onPath) hosts.push({ item: fp.item, box: slot.box, page: plans[slot.page]!.page, slot });
    }
    for (const a of customAnchors(ctx, e, hosts)) {
      const host = hosts.find((h) => h.item === a.host)!.slot;
      const plan = plans[host.page]!;
      const leaf: Leaf = { at: { item: a.item, spread: host.leaf.at.spread, parents: [] }, g: host.leaf.g, z: host.leaf.z + 0.5 };
      const where = `page ${plan.page.name}`;
      const base = { leaf, box: a.box, rotation: 0, name: '', page: host.page };
      const inner = a.item.textFrame?.story ? e.anchored.find((x) => x.item === a.item)?.entry : undefined;
      if (inner && hasContent(inner.story) && !wanted.has(inner.story.self)) {
        wanted.set(inner.story.self, inner);
        const slot: Slot = { ...base, kind: 'text', story: inner.story.self };
        const look = boxLook(ctx, a.item, where);
        if (look.fill || look.stroke) slot.style = calloutStyleFor(ctx, a.item, look, false);
        plan.slots.push(slot);
      } else if (a.item.graphic) {
        const id = pictureResource(ctx, a.item);
        const slot: Slot = { ...base, kind: 'picture', ...(id ? { resource: id } : {}) };
        const look = boxLook(ctx, a.item, where);
        if (look.fill || look.stroke) slot.style = calloutStyleFor(ctx, a.item, look, false);
        plan.slots.push(slot);
      } else continue;
      ctx.placedAnchors.add(a.item);
      const what = a.item.graphic?.link?.name ?? (inner ? ctx.sample(inner.story.paragraphs[0]!) : 'object');
      if (a.estimated) ctx.rep.add('anchoredObjectFrameEstimated', 'warning', 'An object anchored beside its text (custom position, level with a line) stands in a frame of its own: across the page where its rule puts it, down the page at the line of its anchor, which is estimated from the share of the story\'s text before it (IDML does not say where lines fall)', `${what} (${where})`);
      else ctx.rep.add('anchoredObjectFrame', 'info', 'An object anchored to its frame or its page (custom position) stands in a frame of its own where its rule puts it', `${what} (${where})`);
    }
  }

  // Text frames behind a jump object are cut round it (#1554).
  const jumped = cutRoundJumps(ctx, plans);

  for (const plan of plans) {
    {
      // Slot names follow the place on the page, so pages laid alike name
      // their frames alike.
      const ordered = [...plan.slots].sort((a, b) => Math.round(a.box.top / 6) - Math.round(b.box.top / 6) || a.box.left - b.box.left || a.leaf.z - b.leaf.z);
      const n = { text: 0, picture: 0, box: 0 };
      for (const s of ordered) s.name = `${s.kind === 'text' ? 't' : s.kind === 'picture' ? 'p' : 'b'}${++n[s.kind]}`;
      plan.slots = ordered;
    }
  }

  // Pass 2: templates and Markdown.
  const templates: PageTemplate[] = [];
  const bySignature = new Map<string, string>();
  const fences: { plan: PagePlan; text: string; title?: string }[] = [];
  const written = new Set<string>();
  const hooks = makeHooks(ctx, 'frame');
  const sectionAt = new Map<string, number>();
  doc.sections.forEach((s, n) => {
    if (n > 0 && s.pageStart) sectionAt.set(s.pageStart, n);
  });
  let backwards = 0;

  for (const plan of plans) {
    const page = plan.page;
    const frames: FrameConfig[] = [];
    const attrs: string[] = [];
    const pieces: string[] = [];
    let title: string | undefined;
    // Layers follow the paint order.
    const zs = [...new Set(plan.slots.map((s) => s.leaf.z))].sort((a, b) => a - b);
    for (const slot of plan.slots) {
      const item = slot.leaf.at.item;
      const tf = item.textFrame;
      const entry = slot.kind === 'text' && slot.story ? wanted.get(slot.story) : undefined;
      // Insets, and where the first line stands: the difference between
      // InDesign's first baseline and Postext's goes to the top padding,
      // or moves the frame up.
      const setup = frameSetup(ctx, item);
      const [, left, bottom, right] = setup.inset;
      let top = setup.inset[0];
      let box = slot.box;
      if (slot.kind === 'text' && tf && entry && !slot.onPath && fromTop(setup) && entry.story.orientation !== 'vertical') {
        // A band after the first goes on with the frame's text.
        const opens = !slot.continues && (!entry.frames.length || entry.frames[0]!.item === item);
        const shift = firstLineShift(ctx, setup, opens ? openingLines(ctx, entry.story.paragraphs) : runningLines(ctx, entry.story.paragraphs), `page ${page.name}`);
        if (top + shift >= 0) top += shift;
        else if (!slot.style && !slot.rotation) {
          box = { ...box, top: box.top + top + shift };
          top = 0;
        } else {
          ctx.rep.add('firstBaselineOff', 'warning', 'The first line of a frame with a fill or a stroke, or of a turned frame, stands lower than in InDesign: its first baseline is nearer the frame\'s edge than Postext sets a line, and the frame keeps its place', `${Math.round(-(top + shift) * 10) / 10} pt (page ${page.name})`);
          top = 0;
        }
      }
      // InDesign sets a line whose baseline and descenders are inside the
      // frame; Postext needs the whole line box, a fifth of the leading
      // under the baseline. A plain frame is that much taller, so the
      // page keeps its last line.
      if (slot.kind === 'text' && tf && entry && !slot.onPath && !slot.style && !slot.rotation && entry.story.orientation !== 'vertical') {
        box = { ...box, bottom: box.bottom + FOOT_ROOM * (ctx.looks.body?.cf.leading ?? 12) };
      }
      const f: FrameConfig = { name: slot.name, placement: placeAt(box, 'container'), layer: 1 + zs.indexOf(slot.leaf.z), optional: true, pin: true };
      if (slot.rotation) f.rotate = Math.round(slot.rotation * 100) / 100;
      if (slot.style) f.style = slot.style;
      if (plan.slots.some((o) => o !== slot && overlap(o.box, slot.box) > 1)) f.overlap = 'allow';
      // A jump object whose text frames were all cut round it pushes
      // nothing: the bands keep clear of it, its offsets included, and a
      // push would set their first lines short by the wrap gap.
      if (item.wrap && item.wrap.mode !== 'None' && !jumped.has(item) && !(slot.kind === 'text' && item.textFrame?.ignoreWrap)) f.exclude = 'push';
      if (slot.kind === 'text' && tf && !slot.onPath) {
        if (top || left || bottom || right || slot.style) f.padding = { top: pt(top), left: pt(left), bottom: pt(bottom), right: pt(right) };
        if (tf.columns > 1) {
          f.columns = tf.columns;
          f.columnGap = pt(tf.gutter);
        }
        const v = VERTICAL[setup.verticalJustification];
        if (v) f.verticalAlign = v;
        const story = doc.stories.get(slot.story!);
        if (story?.orientation === 'vertical') f.writingMode = 'vertical-rl';
        if (story?.direction === 'rtl') f.direction = 'rtl';
        if (tf.autoSizing && tf.autoSizing !== 'Off') ctx.rep.add('autoSizeFrames', 'info', 'An auto-sizing text frame keeps the size it had when the document was saved', `page ${page.name}`);
        // The thread: on the same page a chain, on a later page a jump.
        // A band cut round a jump object runs into the next band first.
        const at = entry ? entry.frames.findIndex((fp) => fp.item === item) : -1;
        const next = slot.nextPiece ?? (at >= 0 ? entry!.frames.slice(at + 1).map((fp) => slotOf.get(fp.item.self)).find((s) => s !== undefined && s !== slot && !s.continues) : undefined);
        if (next && next.page === slot.page) f.next = next.name;
        else if (next && next.page > slot.page) {
          f.overflow = { continueIn: `page:{attr.to_${slot.name}}#${next.name}`, mark: false };
          attrs.push(`to_${slot.name}="p${next.page + 1}"`);
        } else if (next) backwards++;
      }
      if (slot.kind === 'picture' || slot.kind === 'box') f.padding = { top: pt(0), left: pt(0), bottom: pt(0), right: pt(0) };
      frames.push(f);

      // Content: a story where its thread starts, a picture in its frame.
      if (slot.kind === 'picture' && slot.resource) pieces.push(`::resource{id="${slot.resource}" slot="${slot.name}"}`);
      if (slot.kind === 'text' && slot.story && !written.has(slot.story)) {
        if (!entry) continue;
        const first = entry.frames.map((fp) => slotOf.get(fp.item.self)).find((s) => s !== undefined);
        if (first && first !== slot && !slot.onPath) continue;
        written.add(slot.story);
        ctx.counts.stories++;
        const notes: string[] = [];
        const carry: string[] = [];
        const anchor = ctx.pageAnchor.get(page.self);
        const chunks: Chunk[] = blocksOf(ctx, entry.story.paragraphs, { notes, carry, hooks, target: 'frame', pageName: page.name });
        title ??= chunks.find((c) => c.kind === 'heading')?.title;
        let body = joinChunks(chunks);
        if (carry.length) body += (body ? '\n\n' : '') + carry.join('');
        if (notes.length) body += `\n\n${notes.join('\n\n')}`;
        if (anchor && !pieces.some((p) => p.includes(`{#${anchor}}`))) body = `:anchor{#${anchor}}${body}`;
        if (body.trim()) pieces.push(`:::frame{slot="${slot.name}"}\n${body}\n:::`);
      }
    }
    for (const [k, v] of plan.words.attrs) attrs.push(`${k}="${v}"`);
    // The template of this kind of page.
    const signature = JSON.stringify([frames.map((f) => ({ ...f, placement: { ...f.placement, offset: { x: snap(f.placement!.offset!.x!.value), y: snap(f.placement!.offset!.y!.value) }, size: { w: snap((f.placement!.size!.width as { value: number }).value), h: snap((f.placement!.size!.height as { value: number }).value) } } })), plan.decoration]);
    let id = bySignature.get(signature);
    if (!id) {
      id = `page-${templates.length + 1}`;
      bySignature.set(signature, id);
      const master = doc.masterSpreads.find((m) => m.self === page.appliedMaster);
      templates.push({ id, name: `Page ${page.name}${master?.name ? ` (${master.name})` : ''}`, area: 'trim', header: false, footer: false, frames, ...(plan.decoration.length ? { decoration: { elements: plan.decoration } } : {}) });
    }
    const fence = `::::page{template="${id}" id="p${page.index + 1}"${attrs.length ? ` ${attrs.join(' ')}` : ''}}\n${pieces.join('\n\n')}${pieces.length ? '\n' : ''}::::`;
    fences.push({ plan, text: fence, ...(title ? { title } : {}) });
  }
  if (backwards) ctx.rep.add('threadBackwards', 'loss', 'A thread that goes back to an earlier page is cut: the text stays in the frames before the jump', undefined, backwards);
  // A page a link points at with no text frame to hold its anchor.
  for (const [self, id] of ctx.pageAnchor) {
    if (!fences.some((f) => f.text.includes(`{#${id}}`))) ctx.rep.add('pageLinkTarget', 'warning', 'A link points at a page with no text of its own to carry the anchor; the link leads nowhere', ctx.pageByRef(self)?.name ?? id);
  }

  // Stories the options asked for that stand on no page (pasteboard).
  const loose: string[] = [];
  for (const e of stories) {
    if (written.has(e.story.self)) continue;
    const notes: string[] = [];
    const body = joinChunks(blocksOf(ctx, e.story.paragraphs, { notes, carry: [], hooks: makeHooks(ctx, 'flow'), target: 'flow' }));
    if (body.trim()) loose.push([body, ...notes].join('\n\n'));
    ctx.counts.stories++;
    ctx.rep.add('storyOffPage', 'warning', 'A story that stands on no page of its own (the pasteboard, a frame the options left out) is set as running text after the pages', body.slice(0, 60));
  }

  // Chapters: one per section whose first page no thread runs into.
  const chapters: PagesResult['chapters'] = [];
  let current: string[] = [];
  let name: string | undefined;
  const flush = (): void => {
    if (!current.length) return;
    chapters.push({ title: name ?? ctx.doc.title ?? ctx.doc.name ?? `Pages ${chapters.length + 1}`, markdown: `${current.join('\n\n')}\n` });
    current = [];
    name = undefined;
  };
  for (const f of fences) {
    const section = sectionAt.get(f.plan.page.self);
    if (section !== undefined) {
      const runsIn = f.plan.slots.some((s) => {
        const e = s.kind === 'text' && s.story && !s.onPath ? wanted.get(s.story) : undefined;
        const at = e ? e.frames.findIndex((fp) => fp.item === s.leaf.at.item) : -1;
        return at > 0 && e!.frames.slice(0, at).some((fp) => (slotOf.get(fp.item.self)?.page ?? s.page) < s.page);
      });
      if (!runsIn) flush();
      current.push(numberingDirective(ctx, doc.sections[section]!, f.plan.page.index));
    }
    name ??= f.title;
    current.push(f.text);
  }
  if (loose.length) current.push(...loose);
  flush();
  return { templates, chapters };
}

/** Cut each upright text frame that stands behind a jump object into the
 *  bands the objects leave free, chained top to bottom (see `jumps.ts`).
 *  The slot keeps the first band, so the thread from the frame before
 *  still reaches it; the bands after it are new slots of the same frame.
 *  Returns the jump objects every frame they meet was cut round; one
 *  that meets a frame it cannot cut (turned, set on a path, several
 *  columns it does not span, or no band left) keeps pushing it. */
function cutRoundJumps(ctx: Context, plans: readonly PagePlan[]): Set<IdmlPageItem> {
  const handled = new Set<IdmlPageItem>();
  const kept = new Set<IdmlPageItem>();
  // A band shorter than most of a line holds no text: dropped.
  const minHeight = 0.75 * (ctx.looks.body?.cf.leading ?? 12);
  let cut = 0;
  for (const plan of plans) {
    if (plan.jumps.length === 0) continue;
    for (const slot of [...plan.slots]) {
      const item = slot.leaf.at.item;
      const tf = item.textFrame;
      if (slot.kind !== 'text' || !tf || tf.ignoreWrap) continue;
      const mine = plan.jumps.filter((j) => j.item !== item && meetsWithOffsets(j, slot.box));
      if (mine.length === 0) continue;
      const fits = !slot.rotation && !slot.onPath && (tf.columns <= 1 || mine.every((j) => spansColumns(j, slot.box, tf.inset)));
      const bands = fits ? freeBands(slot.box, mine, minHeight) : undefined;
      if (!bands || (bands.length === 1 && bands[0] === slot.box)) {
        for (const j of mine) kept.add(j.item);
        if (!fits || !bands) ctx.rep.add('jumpWrapApproximated', 'warning', 'A text frame behind a Jump Object or Jump to Next Column wrap that cannot be cut round it (turned, on a path, several columns the object does not span, or no room left) runs round the object beside it', `page ${plan.page.name}`);
        continue;
      }
      for (const j of mine) handled.add(j.item);
      cut++;
      slot.box = bands[0]!;
      let prev = slot;
      for (const band of bands.slice(1)) {
        const piece: Slot = { ...slot, box: band, continues: true };
        prev.nextPiece = piece;
        plan.slots.push(piece);
        prev = piece;
      }
    }
  }
  if (cut) ctx.rep.add('jumpWrap', 'info', 'A text frame behind an object whose wrap is Jump Object (or Jump to Next Column) is cut into chained frames above and below it, its offsets kept', undefined, cut);
  for (const k of kept) handled.delete(k);
  return handled;
}
