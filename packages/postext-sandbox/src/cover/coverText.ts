// The cover's Markdown read and written a frame at a time (#1669): the
// panel's text fields edit one slot's text (the back cover's blurb, a
// flap) and leave the rest of the document as it was written. A front or
// spine frame is an override of the book's metadata: emptied, it goes, and
// the cover takes the title and author again.
//
// A frame may name the sheets it is for (#1673, `sheet="case"`): it takes
// its slot there over the frame every sheet shares. The functions below
// read and write the shared frames unless given the names of a sheet
// (`case`, `endpaperFront`…), and then that sheet's own.

import { coverFrames, coverSource } from 'postext/production';
import type { DocumentMetadata } from 'postext';

const CLOSE = /\n?[ \t]{0,3}:{3,}[ \t]*\n*$/;

interface Segment {
  slot: string;
  start: number;
  end: number;
  bodyStart: number;
  sheets?: string[];
}

function segments(markdown: string): Segment[] {
  const frames = coverFrames(markdown);
  return frames.map((f, i) => ({ slot: f.slot, start: f.start, bodyStart: f.end, end: frames[i + 1]?.start ?? markdown.length, ...(f.sheets ? { sheets: f.sheets } : {}) }));
}

/** Whether a frame is one of those asked for: a shared one when no sheet
 *  is named, else one for any of the sheet's names. */
const forSheet = (f: { sheets?: readonly string[] }, sheets: readonly string[] | undefined) =>
  !sheets || sheets.length === 0 ? !f.sheets : !!f.sheets?.some((s) => sheets.includes(s));

function bodyOf(markdown: string, s: Segment): string {
  return markdown.slice(s.bodyStart, s.end).replace(CLOSE, '').replace(/^\n/, '');
}

/** The text of each slot the Markdown fills, the first frame of a slot
 *  only (the cover lays out no other): the shared frames, or with
 *  `sheets` the frames of that sheet's own. */
export function coverSlotTexts(markdown: string | undefined, sheets?: readonly string[]): Record<string, string> {
  const md = (markdown ?? '').replace(/\r\n?/g, '\n');
  const out: Record<string, string> = {};
  for (const s of segments(md)) if (forSheet(s, sheets) && !(s.slot in out)) out[s.slot] = bodyOf(md, s);
  return out;
}

/** Whether the Markdown has a frame for the slot (an empty one too: an
 *  empty front frame leaves the front without the title): a shared one,
 *  or with `sheets` one of that sheet's own. */
export function hasCoverSlot(markdown: string | undefined, slot: string, sheets?: readonly string[]): boolean {
  return coverFrames((markdown ?? '').replace(/\r\n?/g, '\n')).some((f) => f.slot === slot && forSheet(f, sheets));
}

const frameOf = (slot: string, text: string, sheet?: string) => `:::frame{slot="${slot}"${sheet ? ` sheet="${sheet.trim()}"` : ''}}\n${text.trim()}\n:::`;

/** The Markdown with a slot's text set: its first frame replaced, or a
 *  frame added at the end; `null` removes every frame of the slot. The
 *  shared frames, or with `sheets` the frames of that sheet's own (a new
 *  one written for its first name, `sheet="case"`). */
export function setCoverSlotText(markdown: string | undefined, slot: string, text: string | null, sheets?: readonly string[]): string {
  const md = (markdown ?? '').replace(/\r\n?/g, '\n');
  const segs = segments(md);
  const mine = segs.filter((s) => s.slot === slot && forSheet(s, sheets));
  if (mine.length === 0) {
    if (text === null) return md;
    const head = md.trimEnd();
    return `${head ? `${head}\n\n` : ''}${frameOf(slot, text, sheets?.[0])}\n`;
  }
  let out = '';
  let at = 0;
  mine.forEach((s, i) => {
    out += md.slice(at, s.start);
    // A frame of the sheet's keeps the sheets it named.
    if (i === 0 && text !== null) out += `${frameOf(slot, text, s.sheets?.join(' '))}\n\n`;
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

/** The texts the front and the spine print while no frame replaces them:
 *  the frames the cover writes from the book's metadata (its title,
 *  subtitle and author in the cover's styles), without the page fence
 *  round them (#1675). */
export function metadataSlotTexts(metadata: DocumentMetadata | undefined): Record<string, string> {
  const md = coverSource(undefined, ['front', 'spine'], metadata ?? {}).markdown;
  return coverSlotTexts(md.replace(/^[^\n]*\n/, '').replace(/\n:{4,}\s*$/, ''));
}
