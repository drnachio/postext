// A book Postext exported with its running text threaded (#1559): the
// lines it kept read back as the paragraphs it wrote.
//
// With lines kept, the export ends every line of the thread's story in a
// forced line break and every column in a frame break, so InDesign sets
// the pages as Postext did; a paragraph a column split is two there. The
// thread's first frame carries a label that says what each of those
// breaks and paragraph ends was (`export/thread.ts`): a line end between
// two words (a space), inside a word (nothing), on a hyphen Postext added
// (the hyphen goes), a line the author broke, a paragraph's end, a column
// the author broke. Read with it, the story's paragraphs are the book's
// again: lines joined, the hyphens and breaks Postext added gone, the
// local leadings, trackings and alignments that only placed the lines
// dropped.
//
// The label is checked against the story: when the count of breaks and
// paragraph ends is not the label's (the story was edited in InDesign),
// the story is read as InDesign holds it.

import type { IdmlPageItem, IdmlParagraph, IdmlRun, Inline } from '../../model/document.js';
import type { OrderedStory } from '../../resolve/order.js';
import { children, localName } from '../../xml/read.js';
import type { Context } from '../context.js';

/** The key of the label (the export's `THREAD_LABEL`). */
const THREAD_LABEL = 'postext:thread';

/** The label of a thread's first frame: its mode and codes. */
export function threadCodes(item: IdmlPageItem): { kept: boolean; codes: string } | undefined {
  const label = item.properties.Label;
  if (!label) return undefined;
  for (const kv of children(label)) {
    if (localName(kv.name) !== 'KeyValuePair' || kv.attrs.Key !== THREAD_LABEL) continue;
    const m = /^([kr]):([snhbpc]*)$/.exec(kv.attrs.Value ?? '');
    return m ? { kept: m[1] === 'k', codes: m[2]! } : undefined;
  }
  return undefined;
}

const isBreak = (i: Inline): boolean => i.kind === 'special' && i.char === 'forcedLineBreak';

/** The breaks the label tells of in `paragraphs`. */
function boundaries(paragraphs: readonly IdmlParagraph[], kept: boolean): number {
  let n = Math.max(0, paragraphs.length - 1);
  if (kept) for (const p of paragraphs) for (const r of p.runs) for (const i of r.content) if (isBreak(i)) n++;
  return n;
}

/** The paragraphs as written, or undefined when the label does not fit. */
export function rejoinParagraphs(paragraphs: readonly IdmlParagraph[], kept: boolean, codes: string): IdmlParagraph[] | undefined {
  if (!paragraphs.length || boundaries(paragraphs, kept) !== codes.length) return undefined;
  let c = 0;
  const out: IdmlParagraph[] = [];
  let cur: IdmlParagraph | undefined;
  // The last text of the paragraph being built: where a space goes, or
  // whence a hyphen Postext added goes.
  let lastText: { kind: 'text'; text: string } | undefined;
  const join = (code: string, run: IdmlRun): void => {
    if (code === 's') {
      if (lastText && !/\s$/.test(lastText.text)) lastText.text += ' ';
    } else if (code === 'h') {
      if (lastText) lastText.text = lastText.text.replace(/[-‐­]$/, '');
    } else if (code === 'b') run.content.push({ kind: 'special', char: 'forcedLineBreak' });
  };
  const copyRun = (r: IdmlRun): IdmlRun => {
    const attrs = { ...r.attrs };
    // Lines that could break only where Postext broke them, tracked to
    // fit its measure (a style's own tracking is the style's).
    if (kept) {
      delete attrs.NoBreak;
      delete attrs.Tracking;
    }
    const properties = { ...r.properties };
    // A line's own leading placed it on Postext's baseline.
    if (kept) delete properties.Leading;
    return { ...r, attrs, properties, content: [] };
  };
  paragraphs.forEach((p, i) => {
    if (!cur) {
      cur = { ...p, attrs: { ...p.attrs }, runs: [] };
      lastText = undefined;
    } else {
      // The rest of a paragraph: where it ends, and how it is aligned.
      for (const k of ['Justification', 'SpaceAfter'] as const) {
        if (p.attrs[k] !== undefined) cur.attrs[k] = p.attrs[k]!;
        else delete cur.attrs[k];
      }
      if (p.breakAfter) cur.breakAfter = p.breakAfter;
      else delete cur.breakAfter;
    }
    for (const r of p.runs) {
      const run = copyRun(r);
      for (const inline of r.content) {
        if (kept && isBreak(inline)) {
          join(codes[c++]!, run);
          continue;
        }
        if (inline.kind === 'text') {
          lastText = { kind: 'text', text: inline.text };
          run.content.push(lastText);
        } else run.content.push(inline);
      }
      cur.runs.push(run);
    }
    if (i === paragraphs.length - 1) return;
    const code = codes[c++]!;
    if (code === 'p' || code === 'c') {
      // A frame or page break Postext's columns made is no break of the
      // book's; a column the author broke is.
      if (code === 'c') cur.breakAfter = 'NextColumn';
      else delete cur.breakAfter;
      out.push(cur);
      cur = undefined;
      return;
    }
    const tail = cur.runs[cur.runs.length - 1];
    if (tail) join(code, tail);
  });
  if (cur) out.push(cur);
  return out;
}

/** Read the stories a Postext export threaded as their paragraphs were
 *  written. */
export function rejoinThreads(ctx: Context, stories: readonly OrderedStory[]): void {
  for (const e of stories) {
    // (A frame anchored in it carries its own label.)
    rejoinThreads(ctx, e.anchored.map((a) => ({ ...a.entry, frames: [{ item: a.item } as OrderedStory['frames'][number]] })));
    const first = e.frames[0]?.item;
    const label = first ? threadCodes(first) : undefined;
    if (!label) continue;
    const paragraphs = rejoinParagraphs(e.story.paragraphs, label.kept, label.codes);
    if (!paragraphs) {
      // (A story of one frame the importer joined to the next is no edit.)
      if (e.frames.length < 2) continue;
      ctx.rep.add('threadEdited', 'info', 'The running text of a book exported from Postext was edited in InDesign: its lines are read as InDesign holds them', e.story.self);
      continue;
    }
    e.story.paragraphs = paragraphs;
  }
}
