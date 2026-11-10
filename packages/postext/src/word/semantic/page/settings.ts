// What the semantic .docx sets for the whole document about its pages
// (#1444): odd and even running heads, how the notes are numbered and
// separated, the paper's colour, and fields Word should bring up to date
// when it opens the file (the page numbers of the contents and the index).

import type { WriterContext } from '../context.js';
import { hex } from '../wml.js';
import { usesEvenAndOdd } from './furniture.js';
import { separatorParagraph, settingsFootnotePr } from './notes.js';

export interface PageSettings {
  evenAndOddHeaders: boolean;
  /** `w:settings` children the package merges in. */
  extra: string;
  background?: string;
  footnoteSeparator?: string;
}

/** A paper colour Word should paint: none for white or no colour. */
function paper(ctx: WriterContext): string | undefined {
  const c = ctx.resolved.page.backgroundColor;
  const rgb = c && c.hex !== 'transparent' ? hex(c) : undefined;
  return rgb && rgb.toUpperCase() !== 'FFFFFF' ? rgb.toUpperCase() : undefined;
}

/** Whether the body holds a contents or an index field. */
const hasListingFields = (body: string): boolean => body.includes('<w:tag w:val="ptx:toc"/>') || body.includes('<w:tag w:val="ptx:index"/>');

/** The document-wide page settings of the book written in `body`. */
export function pageSettings(ctx: WriterContext, body: string): PageSettings {
  const background = paper(ctx);
  let extra = '';
  if (background) extra += '<w:displayBackgroundShape/>';
  // Word asks to update the fields on opening, which fills the page
  // numbers of the contents and the index.
  if (hasListingFields(body)) extra += '<w:updateFields w:val="true"/>';
  let footnoteSeparator: string | undefined;
  if (ctx.footnotes.length) {
    extra += settingsFootnotePr(ctx.resolved);
    // The rule is a share of the column the notes are set in.
    footnoteSeparator = separatorParagraph(ctx.resolved, ctx.units, ctx.textTwips);
  }
  return {
    evenAndOddHeaders: usesEvenAndOdd(ctx.resolved),
    extra,
    ...(background ? { background } : {}),
    ...(footnoteSeparator ? { footnoteSeparator } : {}),
  };
}
