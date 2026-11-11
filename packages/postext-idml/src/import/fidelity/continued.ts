// A paragraph that goes on in another frame.
//
// A threaded story is one text and its paragraphs cross frames as they
// come. A document made of separate frames (an export that writes one
// story per block of a page) cuts a paragraph a frame break splits in
// two stories: the first piece is justified to its last line
// (`Justification="FullyJustified"` set on the paragraph itself), the
// second starts the next column or page in the same style. Such a pair
// is one paragraph again here: the two stories become one, its frames
// in a chain, and the pieces are joined by a forced line break, which
// Postext justifies as any line but a paragraph's last
// (`bodyText.justifyHardBreaks`).
//
// The rule is narrow on purpose. Both pieces wear one paragraph style in
// one face, size and leading; the first is the last paragraph of its
// story and is justified to its last line by an override of its own;
// its frame ends a column (no frame of the same text under it); the
// second opens the first frame of that text in the next column of the
// page or on the next page, as wide as the first.

import type { IdmlParagraph, IdmlRun } from '../../model/document.js';
import { boxWidth } from '../../model/geometry.js';
import type { FramePlace, OrderedStory } from '../../resolve/order.js';
import type { Context } from '../context.js';
import { ownText, type Look } from '../looks.js';

const hasText = (p: IdmlParagraph): boolean => ownText(p).trim() !== '';

/** The first and the last paragraph of a story that hold text. */
function ends(e: OrderedStory): { first?: IdmlParagraph; last?: IdmlParagraph } {
  const ps = e.story.paragraphs;
  const first = ps.find(hasText);
  let last: IdmlParagraph | undefined;
  for (let n = ps.length - 1; n >= 0 && !last; n--) if (hasText(ps[n]!)) last = ps[n];
  return { ...(first ? { first } : {}), ...(last ? { last } : {}) };
}

const sameType = (a: Look, b: Look): boolean => a.cf.fontFamily === b.cf.fontFamily && a.cf.pointSize === b.cf.pointSize && Math.abs(a.cf.leading - b.cf.leading) < 0.01 && a.cf.fontStyle === b.cf.fontStyle;

/** Frames stand in one column: they share most of the narrower's width. */
function sameColumn(a: FramePlace, b: FramePlace): boolean {
  const shared = Math.min(a.box!.right, b.box!.right) - Math.max(a.box!.left, b.box!.left);
  return shared > 0.5 * Math.min(boxWidth(a.box!), boxWidth(b.box!));
}

const BREAK: IdmlRun = { attrs: {}, properties: {}, content: [{ kind: 'special', char: 'forcedLineBreak' }], conditions: [], tags: [] };

/** `head` and `tail` as one paragraph: the head's indents, the tail's
 *  alignment and space after. */
function joined(head: IdmlParagraph, tail: IdmlParagraph): IdmlParagraph {
  const attrs: Record<string, string> = { ...head.attrs };
  for (const name of ['Justification', 'SpaceAfter']) {
    if (tail.attrs[name] !== undefined) attrs[name] = tail.attrs[name]!;
    else delete attrs[name];
  }
  const last = head.runs[head.runs.length - 1];
  // The break wears the format of the text before it.
  const br: IdmlRun = last ? { attrs: last.attrs, properties: last.properties, content: BREAK.content, conditions: [], tags: [], ...(last.characterStyle ? { characterStyle: last.characterStyle } : {}) } : BREAK;
  const out: IdmlParagraph = { attrs, properties: head.properties, runs: [...head.runs, br, ...tail.runs] };
  if (head.paragraphStyle) out.paragraphStyle = head.paragraphStyle;
  if (tail.breakAfter) out.breakAfter = tail.breakAfter;
  return out;
}

/** The stories with every paragraph cut at a frame break made whole.
 *  The joined story keeps the first one's place in the order; `ctx.alias`
 *  names it for the frames of the stories it took in. */
export function joinContinued(ctx: Context, stories: readonly OrderedStory[]): OrderedStory[] {
  // Only text set in frames, left to right, with a place on a page.
  const usable = (e: OrderedStory): boolean => e.frames.length > 0 && e.frames.every((f) => !f.textPath && f.box && f.pageIndex >= 0) && e.story.direction === 'ltr' && e.story.orientation === 'horizontal';
  const candidates = stories.filter(usable);
  if (candidates.length < 2) return [...stories];
  const info = new Map<OrderedStory, { first?: IdmlParagraph; last?: IdmlParagraph; head: FramePlace; tail: FramePlace }>();
  for (const e of candidates) info.set(e, { ...ends(e), head: e.frames[0]!, tail: e.frames[e.frames.length - 1]! });
  const taken = new Set<OrderedStory>();
  const nextOf = new Map<OrderedStory, OrderedStory>();

  for (const e of candidates) {
    const a = info.get(e)!;
    const p = a.last;
    if (!p || p.attrs.Justification !== 'FullyJustified' || p !== e.story.paragraphs[e.story.paragraphs.length - 1]) continue;
    if (a.tail.item.textFrame?.next) continue;
    const look = ctx.looks.of(p);
    const fits = (o: OrderedStory): boolean => {
      const b = info.get(o)!;
      if (o === e || taken.has(o) || !b.first || b.first !== o.story.paragraphs.find(hasText)) return false;
      if (b.first.paragraphStyle !== p.paragraphStyle || !sameType(look, ctx.looks.of(b.first))) return false;
      return Math.abs(boxWidth(b.head.box!) - boxWidth(a.tail.box!)) <= 8 && !b.head.item.textFrame?.previous;
    };
    // The frame ends its column: no frame of the same text under it.
    const under = candidates.some((o) => o !== e && info.get(o)!.first?.paragraphStyle === p.paragraphStyle && o.frames.some((f) => f.pageIndex === a.tail.pageIndex && f.box!.top >= a.tail.box!.bottom - 2 && sameColumn(f, a.tail)));
    if (under) continue;
    // Where the text goes on: the next column of the page, else the next page.
    const ahead = candidates.filter((o) => fits(o) && ((info.get(o)!.head.pageIndex === a.tail.pageIndex && info.get(o)!.head.box!.left >= a.tail.box!.right - 2) || info.get(o)!.head.pageIndex === a.tail.pageIndex + 1));
    if (!ahead.length) continue;
    const place = (o: OrderedStory): FramePlace => info.get(o)!.head;
    ahead.sort((x, y) => place(x).pageIndex - place(y).pageIndex || place(x).box!.left - place(y).box!.left || place(x).box!.top - place(y).box!.top);
    const next = ahead[0]!;
    const head = place(next);
    // It opens its column: no frame of the same text above it there.
    const above = candidates.some((o) => o !== next && o !== e && info.get(o)!.first?.paragraphStyle === p.paragraphStyle && o.frames.some((f) => f.pageIndex === head.pageIndex && f.box!.top < head.box!.top - 2 && sameColumn(f, head)));
    if (above) continue;
    nextOf.set(e, next);
    taken.add(next);
  }
  if (!nextOf.size) return [...stories];

  const out: OrderedStory[] = [];
  for (const e of stories) {
    if (taken.has(e)) continue;
    if (!nextOf.has(e)) {
      out.push(e);
      continue;
    }
    let paragraphs = [...e.story.paragraphs];
    const frames = [...e.frames];
    const anchored = [...e.anchored];
    const parts = [e];
    for (let at = nextOf.get(e); at; at = nextOf.get(at)) {
      const tail = at.story.paragraphs;
      const from = tail.findIndex(hasText);
      const sample = ctx.sample(paragraphs[paragraphs.length - 1]!);
      const offset = paragraphs.length - 1 - from;
      paragraphs = [...paragraphs.slice(0, -1), joined(paragraphs[paragraphs.length - 1]!, tail[from]!), ...tail.slice(from + 1)];
      frames.push(...at.frames);
      anchored.push(...at.anchored.map((x) => ({ ...x, paragraph: x.paragraph + offset })));
      parts.push(at);
      ctx.rep.add('continuedParagraphs', 'info', 'A paragraph the document cuts in two stories at a frame break (its first piece justified to the last line) is one paragraph again; its frames are chained, and the line that ended the first piece is justified as the lines about it', sample);
    }
    const merged: OrderedStory = { story: { ...e.story, paragraphs }, frames, flags: e.flags, anchored };
    for (const part of parts) ctx.alias.set(part.story.self, merged);
    out.push(merged);
  }
  return out;
}
