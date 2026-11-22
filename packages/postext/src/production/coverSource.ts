/**
 * The cover's Markdown (#1667): a document of the book, one
 * `:::frame{slot="…"}` per zone or text box (the back cover's blurb, a
 * flap's biography), laid out on the cover's page template. The front and
 * the spine the Markdown leaves empty take the book's title, subtitle and
 * author, read from its metadata on every build (never copied into the
 * cover), each in a paragraph style of its own the book may redefine.
 */

import type { DocumentMetadata } from '../types/content.js';
import type { ParagraphStyleConfig } from '../types/text/paragraphStyles.js';
import { COVER_TEMPLATE_ID } from './compose.js';

/** The paragraph styles the front and the spine are set in when the
 *  cover's Markdown leaves them to the metadata. */
export const COVER_PARAGRAPH_STYLES = ['cover-title', 'cover-subtitle', 'cover-author', 'cover-spine'] as const;

/** Something in the cover's Markdown the cover cannot lay out. */
export type CoverSourceIssue =
  /** A frame names a slot the cover has not (`slots`, an endpaper has no
   *  back cover): its text is left out. */
  | { kind: 'coverSlotUnknown'; slot: string; sourceStart: number; sourceEnd: number }
  /** Two frames fill one slot: only the first is laid out, the others
   *  are left out. */
  | { kind: 'coverSlotRepeated'; slot: string; sourceStart: number; sourceEnd: number };

const FRAME_OPEN = /^[ \t]{0,3}(:{3,})[ \t]*frame[ \t]*\{([^}\n]*)\}[ \t]*$/gm;
const SLOT_ATTR = /(?:^|\s)slot\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+))/;

/** The slots the cover's Markdown fills, in order, with where each frame
 *  opens. */
export function coverFrames(markdown: string): { slot: string; start: number; end: number }[] {
  const out: { slot: string; start: number; end: number }[] = [];
  for (const m of markdown.matchAll(FRAME_OPEN)) {
    const attr = SLOT_ATTR.exec(m[2]!);
    if (!attr) continue;
    out.push({ slot: attr[1] ?? attr[2] ?? attr[3] ?? '', start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

/** Text as Markdown that reads as written: every ASCII punctuation mark
 *  escaped, line breaks as spaces. */
export function markdownLiteral(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(/[!-/:-@[-`{-~]/g, (c) => `\\${c}`);
}

const metaText = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

function styled(style: string, text: string): string {
  return `:::paragraphs{style="${style}"}\n${markdownLiteral(text)}\n:::`;
}

/**
 * The Markdown the cover is laid out from: the cover's own frames inside
 * the cover's page fence, and a frame for the front and one for the spine
 * when the cover has the slot, the Markdown leaves it empty and the
 * metadata has something to put there. `slots` are the cover page's
 * (`CoverPage.slots`).
 */
export function coverSource(
  markdown: string | undefined,
  slots: readonly string[],
  metadata: DocumentMetadata = {},
): { markdown: string; issues: CoverSourceIssue[] } {
  const own = (markdown ?? '').replace(/\r\n?/g, '\n').trim();
  const issues: CoverSourceIssue[] = [];
  const known = new Set(slots);
  const filled = new Set<string>();
  const frames = coverFrames(own);
  // A frame the cover cannot take is blanked, its text and its fence up to
  // the next frame, so that nothing spills onto a page of its own and the
  // offsets of what follows stay the Markdown's.
  let kept = own;
  frames.forEach((f, i) => {
    const unknown = !known.has(f.slot);
    if (unknown) issues.push({ kind: 'coverSlotUnknown', slot: f.slot, sourceStart: f.start, sourceEnd: f.end });
    else if (filled.has(f.slot)) issues.push({ kind: 'coverSlotRepeated', slot: f.slot, sourceStart: f.start, sourceEnd: f.end });
    if (unknown || filled.has(f.slot)) {
      const to = frames[i + 1]?.start ?? own.length;
      kept = kept.slice(0, f.start) + kept.slice(f.start, to).replace(/[^\n]/g, ' ') + kept.slice(to);
    }
    filled.add(f.slot);
  });
  const title = metaText(metadata.title);
  const subtitle = metaText(metadata.subtitle);
  const author = metaText(metadata.author);
  const added: string[] = [];
  if (known.has('front') && !filled.has('front') && (title || subtitle || author)) {
    const parts = [
      ...(title ? [styled('cover-title', title)] : []),
      ...(subtitle ? [styled('cover-subtitle', subtitle)] : []),
      ...(author ? [styled('cover-author', author)] : []),
    ];
    added.push(`:::frame{slot="front"}\n${parts.join('\n\n')}\n:::`);
  }
  if (known.has('spine') && !filled.has('spine') && (title || author)) {
    added.push(`:::frame{slot="spine"}\n${styled('cover-spine', [title, author].filter(Boolean).join(' · '))}\n:::`);
  }
  // The cover's own text first, so its source offsets inside the page are
  // the Markdown's shifted by the fence alone.
  const body = [kept.trim() ? kept : '', ...added].filter(Boolean).join('\n\n');
  return { markdown: `::::page{template="${COVER_TEMPLATE_ID}"}\n${body}\n::::`, issues };
}

/** Where the cover's Markdown starts in `coverSource`'s: its offsets
 *  minus this are the cover's own. */
export const coverSourceOffset = (): number => `::::page{template="${COVER_TEMPLATE_ID}"}\n`.length;

/**
 * The paragraph styles the cover sets its metadata text in, from the
 * book's body text: the book's own style of each id goes over its
 * default, field by field. The title and
 * subtitle are centred at 2.4 and 1.4 times the body size, the author at
 * 1.2, the spine's line at the body size; none hyphenated.
 */
export function coverParagraphStyles(own: readonly ParagraphStyleConfig[] | undefined, bodySizePt = 10): ParagraphStyleConfig[] {
  const have = new Set((own ?? []).map((s) => s.id));
  const pt = (k: number) => ({ value: Math.round(bodySizePt * k * 10) / 10, unit: 'pt' as const });
  const defaults: ParagraphStyleConfig[] = [
    { id: 'cover-title', fontSize: pt(2.4), lineHeight: pt(2.8), fontWeight: 700, textAlign: 'center', hyphenation: false },
    { id: 'cover-subtitle', fontSize: pt(1.4), lineHeight: pt(1.8), textAlign: 'center', hyphenation: false },
    { id: 'cover-author', fontSize: pt(1.2), lineHeight: pt(1.6), textAlign: 'center', hyphenation: false },
    { id: 'cover-spine', fontSize: pt(1), lineHeight: pt(1.2), textAlign: 'center', hyphenation: false },
  ];
  // A style of the book's with one of these ids keeps the defaults it
  // leaves out (a colour alone keeps the size and the centring).
  const byId = new Map(defaults.map((d) => [d.id, d]));
  return [
    ...(own ?? []).map((s) => (byId.has(s.id) ? { ...byId.get(s.id)!, ...s } : s)),
    ...defaults.filter((d) => !have.has(d.id)),
  ];
}
