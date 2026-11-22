// The cover's Markdown read and written a frame at a time (#1669): the
// panel's text fields edit one slot's text (the back cover's blurb, a
// flap) and leave the rest of the document as it was written. A front or
// spine frame is an override of the book's metadata: emptied, it goes, and
// the cover takes the title and author again.

import { coverFrames } from 'postext/production';

const CLOSE = /\n?[ \t]{0,3}:{3,}[ \t]*\n*$/;

interface Segment {
  slot: string;
  start: number;
  end: number;
  bodyStart: number;
}

function segments(markdown: string): Segment[] {
  const frames = coverFrames(markdown);
  return frames.map((f, i) => ({ slot: f.slot, start: f.start, bodyStart: f.end, end: frames[i + 1]?.start ?? markdown.length }));
}

function bodyOf(markdown: string, s: Segment): string {
  return markdown.slice(s.bodyStart, s.end).replace(CLOSE, '').replace(/^\n/, '');
}

/** The text of each slot the Markdown fills, the first frame of a slot
 *  only (the cover lays out no other). */
export function coverSlotTexts(markdown: string | undefined): Record<string, string> {
  const md = (markdown ?? '').replace(/\r\n?/g, '\n');
  const out: Record<string, string> = {};
  for (const s of segments(md)) if (!(s.slot in out)) out[s.slot] = bodyOf(md, s);
  return out;
}

/** Whether the Markdown has a frame for the slot (an empty one too: an
 *  empty front frame leaves the front without the title). */
export function hasCoverSlot(markdown: string | undefined, slot: string): boolean {
  return coverFrames((markdown ?? '').replace(/\r\n?/g, '\n')).some((f) => f.slot === slot);
}

const frameOf = (slot: string, text: string) => `:::frame{slot="${slot}"}\n${text.trim()}\n:::`;

/** The Markdown with a slot's text set: its first frame replaced, or a
 *  frame added at the end; `null` removes every frame of the slot. */
export function setCoverSlotText(markdown: string | undefined, slot: string, text: string | null): string {
  const md = (markdown ?? '').replace(/\r\n?/g, '\n');
  const segs = segments(md);
  const mine = segs.filter((s) => s.slot === slot);
  if (mine.length === 0) {
    if (text === null) return md;
    const head = md.trimEnd();
    return `${head ? `${head}\n\n` : ''}${frameOf(slot, text)}\n`;
  }
  let out = '';
  let at = 0;
  mine.forEach((s, i) => {
    out += md.slice(at, s.start);
    if (i === 0 && text !== null) out += `${frameOf(slot, text)}\n\n`;
    at = s.end;
  });
  out += md.slice(at);
  const tidy = out.replace(/\n{3,}/g, '\n\n').trim();
  return tidy ? `${tidy}\n` : '';
}

/** The slots a cover's text goes in: the zones of the sheet that take
 *  text, then the text boxes the design places by hand. */
const ZONE_TEXT_SLOTS = ['front', 'spine', 'back', 'flapFront', 'flapBack', 'pastedown', 'flyleaf'];
export function coverTextSlots(zones: Iterable<string>, textBoxes: readonly { name: string }[] | undefined): string[] {
  const have = new Set(zones);
  return [...ZONE_TEXT_SLOTS.filter((s) => have.has(s)), ...(textBoxes ?? []).map((t) => t.name)];
}

/** The Markdown with every frame of a slot moved to another (a text box
 *  renamed); the rest as it was written. */
export function renameCoverSlot(markdown: string | undefined, from: string, to: string): string {
  const md = (markdown ?? '').replace(/\r\n?/g, '\n');
  let out = '';
  let at = 0;
  for (const f of coverFrames(md)) {
    if (f.slot !== from) continue;
    const head = md.slice(f.start, f.end);
    out += md.slice(at, f.start) + head.replace(/slot\s*=\s*(["']?)[^"'\s}]+\1/, `slot="${to}"`);
    at = f.end;
  }
  return out + md.slice(at);
}
