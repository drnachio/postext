/**
 * External links in print (#1302, `links.print`): what a printed page shows
 * of the address a link points at. Every output keeps the link itself; this
 * adds, after the link text, either the address in parentheses
 * (`'inline'`) or a note marker whose note — numbered and placed with the
 * footnotes, as a note-style citation is — prints the address, a QR code
 * that opens it (`ContentBlock.linkQr`), or both (`'notes'`).
 */

import type { ContentBlock, InlineLink, InlineSpan } from '../../parse/index.js';
import type { ResolvedLinksConfig } from '../../types.js';
import { FOOTNOTE_PLACEHOLDER } from '../../parse/inlineFormatting/inlineDirectives.js';

/** Prefix of the ids of link notes: no `[^id]` an author writes takes it. */
export const LINK_NOTE_PREFIX = '__postext-link:';

/** Whether a link points outside the document, at an address worth printing. */
export function isExternalLink(href: string): boolean {
  return /^https?:\/\/[^\s/]/i.test(href);
}

/** The address as `urlDisplay` writes it: in full, or short (no scheme, no
 *  leading `www.`, no trailing `/`). */
export function printedAddress(href: string, display: 'full' | 'short'): string {
  if (display === 'full') return href;
  const short = href.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
  return short || href;
}

/** Whether a link's text already shows its address. */
function showsAddress(text: string, href: string): boolean {
  const norm = (s: string): string => s.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '').toLowerCase();
  return norm(text) === norm(href);
}

/** The blocks whose links take an address: running text, lists, quotations
 *  and the notes themselves. Headings (their text goes to the contents
 *  and the running heads), bibliography entries (which print their DOIs
 *  and URLs as the citation style says) and generated blocks keep theirs. */
function printsAddresses(b: ContentBlock): boolean {
  if (b.type !== 'paragraph' && b.type !== 'listItem' && b.type !== 'blockquote') return false;
  return b.bibEntry === undefined && b.toc === undefined && b.index === undefined;
}

/** One link as written: where it ends (span index, offset in that span's
 *  text), its target and the text it covers. */
interface LinkRun {
  span: number;
  end: number;
  href: string;
  text: string;
}

/** The external links of a block in order: a link whose text crosses
 *  emphasis spreads over several spans, and is one link. */
function linkRuns(spans: readonly InlineSpan[]): LinkRun[] {
  const runs: LinkRun[] = [];
  let open: LinkRun | undefined;
  spans.forEach((span, i) => {
    const links = (span.links ?? []).filter((l) => l.mark === undefined).sort((a, b) => a.start - b.start);
    let continued = false;
    for (const l of links) {
      const text = span.text.slice(l.start, l.end);
      if (open && l.start === 0 && open.href === l.href && open.span === i - 1 && open.end === spans[i - 1]!.text.length) {
        open.span = i;
        open.end = l.end;
        open.text += text;
        continued = true;
      } else {
        open = { span: i, end: l.end, href: l.href, text };
        runs.push(open);
      }
    }
    // A span with no link, or whose link stops short of its end, closes
    // the link before it.
    if (!continued && links.length === 0) open = undefined;
  });
  return runs.filter((r) => isExternalLink(r.href));
}

/** A piece of `span`'s text, `[from, to)`, with the links that cover it. */
function slice(span: InlineSpan, from: number, to: number): InlineSpan {
  const links: InlineLink[] = [];
  for (const l of span.links ?? []) {
    const start = Math.max(l.start, from);
    const end = Math.min(l.end, to);
    if (end > start) links.push({ ...l, start: start - from, end: end - from });
  }
  const { links: _drop, ...rest } = span;
  void _drop;
  return { ...rest, text: span.text.slice(from, to), ...(links.length > 0 ? { links } : {}) };
}

/** `block` with `insert(run)` set right after the text of each run that
 *  gets one; the inserted characters map to the source just past the
 *  link's text. */
function withInsertions(block: ContentBlock, runs: readonly LinkRun[], insert: (run: LinkRun) => InlineSpan[] | undefined): ContentBlock {
  const bySpan = new Map<number, { at: number; spans: InlineSpan[] }[]>();
  for (const run of runs) {
    const spans = insert(run);
    if (!spans || spans.length === 0) continue;
    const list = bySpan.get(run.span) ?? [];
    list.push({ at: run.end, spans });
    bySpan.set(run.span, list);
  }
  if (bySpan.size === 0) return block;
  const spans: InlineSpan[] = [];
  const sourceMap: number[] = [];
  let plain = 0;
  block.spans.forEach((span, i) => {
    const cuts = bySpan.get(i);
    const src = block.sourceMap.slice(plain, plain + span.text.length);
    plain += span.text.length;
    if (!cuts) {
      spans.push(span);
      sourceMap.push(...src);
      return;
    }
    let from = 0;
    for (const cut of cuts.sort((a, b) => a.at - b.at)) {
      if (cut.at > from) {
        spans.push(slice(span, from, cut.at));
        sourceMap.push(...src.slice(from, cut.at));
      }
      const origin = cut.at > 0 ? (src[cut.at - 1] ?? block.sourceStart) + 1 : src[0] ?? block.sourceStart;
      for (const s of cut.spans) {
        spans.push(s);
        for (let k = 0; k < s.text.length; k++) sourceMap.push(origin);
      }
      from = cut.at;
    }
    if (from < span.text.length) {
      spans.push(slice(span, from, span.text.length));
      sourceMap.push(...src.slice(from));
    }
  });
  sourceMap.push(...block.sourceMap.slice(plain));
  return { ...block, spans, text: spans.map((s) => s.text).join(''), sourceMap };
}

/** Ids of the left-to-right isolates set around addresses in right-to-left
 *  text: far past the ones a parse hands out. */
const ADDRESS_ISOLATE_BASE = 1_000_000;

/** The address as printed: a link to itself, broken as a URL. In
 *  right-to-left text (`isolate`, its id) it is a left-to-right isolate, so
 *  its slashes and dots stay where they are written. */
function addressSpan(href: string, links: ResolvedLinksConfig, emphasis: Pick<InlineSpan, 'bold' | 'italic'>, isolate?: number): InlineSpan {
  const text = printedAddress(href, links.urlDisplay);
  return {
    text, bold: emphasis.bold, italic: emphasis.italic, url: true, links: [{ start: 0, end: text.length, href }],
    ...(isolate !== undefined ? { direction: { dir: 'ltr' as const, id: ADDRESS_ISOLATE_BASE + isolate } } : {}),
  };
}

/** ` (address)` after a link, in the emphasis of the text around it. */
function inlineAddress(href: string, links: ResolvedLinksConfig, at: InlineSpan, isolate?: number): InlineSpan[] {
  const emphasis = { bold: at.bold, italic: at.italic };
  return [
    { text: ' (', ...emphasis },
    addressSpan(href, links, emphasis, isolate),
    { text: ')', ...emphasis },
  ];
}

/** Print the address of every external link of `blocks` as
 *  `links.print` says. `'notes'` appends the notes' definitions after the
 *  blocks, as `[^id]: …` paragraphs are (the footnote pass takes them out
 *  of the flow). Returns the blocks unchanged with nothing to print. `rtl`:
 *  the document runs right to left. */
export function applyLinkNotes(blocks: readonly ContentBlock[], links: ResolvedLinksConfig | undefined, vertical = false, rtl = false): ContentBlock[] {
  if (!links || links.print === 'none') return blocks as ContentBlock[];
  if (!blocks.some((b) => b.spans.some((s) => s.links?.some((l) => isExternalLink(l.href))))) return blocks as ContentBlock[];
  const out: ContentBlock[] = [];
  const notes: ContentBlock[] = [];
  /** `repeat: 'first'`: the note each address took in this chapter. */
  const noted = new Map<string, string>();
  let count = 0;
  let isolates = 0;
  // Vertical text sets no QR code: its notes print the address.
  const show = vertical && links.show !== 'url' ? 'url' : links.show;
  for (const block of blocks) {
    if (block.type === 'heading' && block.level === 1) noted.clear();
    if (!printsAddresses(block)) { out.push(block); continue; }
    const runs = linkRuns(block.spans);
    if (runs.length === 0) { out.push(block); continue; }
    const inNote = block.footnoteDef !== undefined;
    const rtlBlock = (block.direction ?? (rtl ? 'rtl' : 'ltr')) === 'rtl';
    const isolate = (): number | undefined => (rtlBlock ? ++isolates : undefined);
    out.push(withInsertions(block, runs, (run) => {
      const visible = showsAddress(run.text, run.href);
      const at = block.spans[run.span]!;
      // A note has no note of its own: the address goes in parentheses.
      if (links.print === 'inline' || inNote) {
        return visible && links.visibleUrls === 'skip' ? undefined : inlineAddress(run.href, links, at, isolate());
      }
      // A visible address needs a note only for its code.
      const content = visible && links.visibleUrls === 'skip' ? (show === 'url' ? undefined : 'qr') : show;
      if (!content) return undefined;
      const key = `${content}\u0000${run.href}`;
      let id = links.repeat === 'first' ? noted.get(key) : undefined;
      if (id === undefined) {
        id = `${LINK_NOTE_PREFIX}${++count}`;
        noted.set(key, id);
        const spans: InlineSpan[] = content === 'qr' ? [] : [addressSpan(run.href, links, { bold: false, italic: false }, rtl ? ++isolates : undefined)];
        const text = spans.map((s) => s.text).join('');
        const origin = block.sourceMap[0] ?? block.sourceStart;
        notes.push({
          type: 'paragraph',
          text,
          spans,
          footnoteDef: id,
          sourceStart: block.sourceStart,
          sourceEnd: block.sourceEnd,
          sourceMap: new Array<number>(text.length).fill(origin),
          ...(content !== 'url' ? { linkQr: run.href } : {}),
        });
      }
      return [{ text: FOOTNOTE_PLACEHOLDER, bold: at.bold, italic: at.italic, footnote: { id } }];
    }));
  }
  return notes.length > 0 ? [...out, ...notes] : out;
}
