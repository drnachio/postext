// A one-line English message for any build, configuration, content or
// render warning (#1276: split out of contentWarnings.ts).
import { isGenericFamily } from '../../fonts/faces.js';
import type { LayoutWarning, ContentWarning, ConfigWarning, RenderWarning } from '../../vdt.js';
import type { HeadingDesignCut } from '../sections/headingDesignCuts.js';
import { describeFitStep, describeFrameOverflowProposal, describeFrameCoverProposal, describeFrameOutsideProposal } from '../../composed/reflowLog.js';

/** Where a warning sits, for a message: `page 3` / `offset 120`. A
 *  configuration warning names its setting in the text instead. */
function where(w: LayoutWarning | ContentWarning | ConfigWarning | RenderWarning | HeadingDesignCut): string {
  const parts: string[] = [];
  if ('documentIndex' in w && w.documentIndex !== undefined) parts.push(`document ${w.documentIndex + 1}`);
  if ('pageIndex' in w && w.pageIndex !== undefined) parts.push(`page ${w.pageIndex + 1}`);
  if ('sourceStart' in w && w.sourceStart !== undefined) parts.push(`offset ${w.sourceStart}`);
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

/**
 * A one-line English description of a build, configuration or render
 * warning, for logs and simple diagnostics panels:
 *
 * ```ts
 * const all = [...(doc.warnings ?? []), ...(doc.contentWarnings ?? []), ...(doc.configWarnings ?? [])];
 * for (const w of all) console.warn(formatWarning(w));
 * // Unknown resource id "fig-map" in :ref — it prints "?" (page 2, offset 314)
 * // bodyText.fontFamily: font stack "Georgia, serif" — set in "Georgia"
 * ```
 *
 * It describes the results of `collectHeadingDesignCuts(doc)` too.
 * Hosts that localise their messages switch on `kind` instead.
 */
export function formatWarning(w: LayoutWarning | ContentWarning | ConfigWarning | RenderWarning | HeadingDesignCut): string {
  const inRes = 'inResource' in w && w.inResource !== undefined ? ` in resource "${w.inResource}"` : '';
  let text: string;
  switch (w.kind) {
    case 'calloutOverflow':
      text = `A box fits no column and overflows its column by ${Math.round(w.overflowPx)}px`;
      break;
    case 'unknownResourceId':
      text = w.usage === 'embed'
        ? `Unknown resource id "${w.resourceId}" in ::resource — nothing is embedded`
        : w.usage === 'cellImage'
          ? `Unknown resource id "${w.resourceId}" for a table cell image${inRes} — the cell stays text-only`
          : `Unknown resource id "${w.resourceId}" in :ref${inRes} — it prints "?" (or its text= label), with no number or link`;
      break;
    case 'invalidFrontmatter':
      text = `The front matter cannot be read: ${w.message} — the document is set without its metadata`;
      break;
    case 'unknownDirective':
      text = `Unknown directive ":::${w.name}" — the line is set as text`;
      break;
    case 'unknownCitationKey':
      text = `No reference defines "@${w.key}" — the citation prints without it`;
      break;
    case 'citationsUnavailable':
      text = 'Citations need a citation engine (import "postext-citeproc/register") — they print as written';
      break;
    case 'referencesUnreadable':
      text = `A :::references block cannot be read: ${w.message}`;
      break;
    case 'malformedEmbed':
      text = `The embed line "::${w.name}" is set as text — write ::resource{id="…"} alone on its line, after a blank line`;
      break;
    case 'unknownParagraphStyle':
      text = `Unknown paragraph style "${w.style}" — the paragraphs are set as body text`;
      break;
    case 'unknownCalloutType':
      text = `Unknown callout type "${w.type}" — the box takes the first callout style`;
      break;
    case 'exerciseUnknownType':
      text = `Unknown exercise type "${w.type}" — the exercise takes the kind its content tells`;
      break;
    case 'exerciseUnknownStyle':
      text = `Unknown exercise style "${w.style}" — the exercise takes the first exercise style`;
      break;
    case 'exerciseNoAnswer':
      text = `A ${w.exerciseKind} exercise has no right answer to check — tick an option with [x], or write the answers as [[…]]`;
      break;
    case 'exerciseUnreadItem':
      text = `An item the exercise cannot read is set as written: "${w.text}"`;
      break;
    case 'exerciseNested':
      text = 'An exercise inside another exercise is set as part of the outer one';
      break;
    case 'exerciseWordUnplaced':
      text = `"${w.word}" does not fit the grid and is left out — a crossword word needs a letter in common with another`;
      break;
    case 'solutionOutside':
      text = 'A :::solution or :::hint outside an exercise prints nothing';
      break;
    case 'templateUnknown':
      text = w.template === ''
        ? '::::page names no template — write ::::page{template="…"}; its content is set in the flow'
        : `Unknown page template "${w.template}" — no pageTemplates entry has this id; the page's content is set in the flow`;
      break;
    case 'slotUnknown':
      text = `Slot "${w.slot}" is no frame of template "${w.template}" — the content goes to the flow frame${w.frame ? ` "${w.frame}"` : ''}`;
      break;
    case 'repeatOverflow':
      text = `Grid "${w.group}" of template "${w.template}" holds ${w.max} item${w.max === 1 ? '' : 's'} — item ${w.item} of "${w.frame}" goes to ${w.flowFrame ? `the flow frame "${w.flowFrame}"` : 'the flow after the page'}; raise repeat.max or move the item to another page`;
      break;
    case 'lookUnknown':
      text = `Frame "${w.frame}" of template "${w.template}" names the look "${w.look}", which frameLooks does not have${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''} — the frame wears its style and its template look`;
      break;
    case 'moduleUnknown':
      text = w.reason === 'unknown'
        ? (w.module === '' ? `:::module names no template — write :::module{template="…"}; its content goes to the flow frame` : `Unknown module "${w.module}" — no pageTemplates entry has this id; the module's content goes to the flow frame`)
        : w.reason === 'notModule'
          ? `Template "${w.module}" is no module — give it role: "module" to stack it in a page; the module's content goes to the flow frame`
          : `Template "${w.template}" has no modules group — give one of its groups modules: true; module "${w.name}" is not laid and its content goes to the flow frame`;
      break;
    case 'moduleAsPage':
      text = `Template "${w.template}" is a module — a module is stacked in a page with :::module{template="${w.template}"}, never laid as a page; the page's content is set in the flow`;
      break;
    case 'moduleNested':
      text = `Module "${w.module}" inside a module of template "${w.template}" — a module does not hold modules; its content is the outer module's`;
      break;
    case 'moduleNameRejected':
      text = w.reason === 'taken'
        ? `Another module of the page is named "${w.name}" — this one is named "${w.used}"; give each module its own name`
        : `Module name "${w.name}" holds a space, ".", "#", "[" or "]" — the module is named "${w.used}"`;
      break;
    case 'slotEmpty':
      text = `Frame "${w.frame}" of template "${w.template}" receives no content — give it a slot="${w.frame}" piece, or mark the frame optional`;
      break;
    case 'frameOverflow': {
      // The steps the reflow ladder tried and what would make it fit (#858).
      const steps = (w.stepsTried ?? []).map((st) => describeFitStep(st, { scale: w.scale, imageScale: w.imageScale }));
      const fixes = (w.proposals ?? []).map(describeFrameOverflowProposal);
      text = `Frame "${w.frame}" of template "${w.template}"${w.locale ? ` (${w.locale})` : ''} is ${w.overflowMm} mm short of its content`
        + `${steps.length > 0 ? ` after ${steps.join(', ')}` : ''} — the rest is cut at the frame's foot`
        + (fixes.length > 0 ? `; to fit: ${fixes.join('; or ')}` : '; give it more height (height, maxHeight), chain it to another frame with next, or shorten the text');
      break;
    }
    case 'frameCovered': {
      // Ink under a frame painted over it (#1053).
      const what = w.text !== undefined ? `"${w.text}"` : w.picture !== undefined ? `the picture "${w.picture}"` : 'its ink';
      const fixes = (w.proposals ?? []).map(describeFrameCoverProposal);
      text = `Frame "${w.frame}" of template "${w.template}"${w.locale ? ` (${w.locale})` : ''} lies under frame "${w.coveredBy}" (${w.overlapMm2} mm² of ${what} hidden)`
        + (fixes.length > 0 ? `; to uncover it: ${fixes.join('; or ')}` : '')
        + `; or set overlap: 'allow' on either frame if the art is meant to sit over it`;
      break;
    }
    case 'frameOutsideArea': {
      // Ink past the trim, the bleed or the box it is anchored inside (#1053).
      const past = w.past === 'trim' ? 'the trim (its text is cut there)' : w.past === 'bleed' ? 'the bleed' : `the ${w.past} "${w.target ?? ''}" it is anchored inside`;
      const sides = (['top', 'right', 'bottom', 'left'] as const).filter((k) => w.sides?.[k] !== undefined).map((k) => `${k} ${w.sides[k]} mm`);
      const fixes = (w.proposals ?? []).map(describeFrameOutsideProposal);
      text = `Frame "${w.frame}" of template "${w.template}"${w.locale ? ` (${w.locale})` : ''} runs ${w.excessMm} mm past ${past}${sides.length > 0 ? ` (${sides.join(', ')})` : ''}`
        + (fixes.length > 0 ? `; to bring it in: ${fixes.join('; or ')}` : '; move or shrink the frame')
        + `; or set overlap: 'allow' on the frame if it hangs out on purpose`;
      break;
    }
    case 'frameContinuationLimit':
      text = `Frame "${w.frame}" of template "${w.template}" went on to ${w.pages} added pages, the most a composed page may add, and is still ${w.overflowMm} mm short — the rest is cut at the frame's foot; give the frame there more room, or shorten the text`;
      break;
    case 'continueTargetMissing':
      text = w.fromChapter !== undefined
        ? `A story of chapter ${w.fromChapter + 1} jumps to page "${w.target}" (frame "${w.frame}" of template "${w.template}"), and this chapter has no ::::page{id="${w.target}"} fence with a known template — the rest is not set; give the page its fence back, or fix the name in the chapter that sends the story`
        : w.before
        ? `Frame "${w.frame}" of template "${w.template}" jumps to page "${w.target}", which comes before it — the rest goes on on the next page; move the ::::page{id="${w.target}"} fence after this page, or name a later one`
        : `Frame "${w.frame}" of template "${w.template}" jumps to page "${w.target}", and no ::::page{id="${w.target}"} fence follows — the rest goes on on the next page; give a later page fence that id, or fix the name`;
      break;
    case 'spreadMismatch':
      text = w.templateSpread
        ? `Template "${w.template}" is a spread — the page is laid over two facing pages; write ::::page{template="${w.template}" spread}`
        : `Template "${w.template}" is a single page — the page is laid on one page; drop spread from the fence, or use a template with spread: true`;
      break;
    case 'labelAnchorUnknown':
      if (w.connector !== undefined) {
        // A connector's end at an anchor of its frame's picture (#1057).
        text = `Connector "${w.connector}" ends at anchor "${w.anchor}" of the picture in frame "${w.frame ?? ''}"${w.locale ? ` (${w.locale})` : ''}: ${w.resourceId ? `"${w.resourceId}" has no such anchor` : 'the frame holds no picture on this page'} — that end is left out${w.known.length > 0 ? `; use one of ${w.known.slice(0, 6).map((a) => `"${a}"`).join(', ')}${w.known.length > 6 ? '…' : ''}` : ''}`;
        break;
      }
      text = `Label at anchor "${w.anchor}" of "${w.resourceId}"${w.locale ? ` (${w.locale})` : ''}: the resource has no such anchor — the label is not drawn; ${w.known.length > 0 ? `use one of ${w.known.slice(0, 6).map((a) => `"${a}"`).join(', ')}${w.known.length > 6 ? '…' : ''}, add the anchor to the resource,` : 'add the anchor to the resource'} or place it with at="x% y%"`;
      break;
    case 'anchorUnlabelled':
      text = `Anchor "${w.anchor}" of "${w.resourceId}" names the label style "${w.style}" but no label of the figure stands at it${w.locale ? ` in ${w.locale}` : ''} — add ::label[…]{at="${w.anchor}"}, or drop the anchor's style`;
      break;
    case 'labelOverflow':
      text = `Label "${w.text}"${w.anchor ? ` at anchor "${w.anchor}"` : ''} of "${w.resourceId}"${w.locale ? ` (${w.locale})` : ''} is wider than its measure${w.widthPct > 0 ? ` (${w.widthPct}% of the picture)` : ''} even at ${Math.round(w.scale * 100)}% — it runs past it; widen the anchor's width, shorten the label, or lower the style's minScale`;
      break;
    case 'labelOverlap':
      text = w.withSymbol !== undefined
        ? `Label "${w.text}"${w.anchor ? ` at anchor "${w.anchor}"` : ''} of "${w.resourceId}"${w.locale ? ` (${w.locale})` : ''} runs onto symbol ${w.withSymbol} of the picture (an avoid zone)${w.count > 1 ? ` and ${w.count - 1} more` : ''} — move the anchor, narrow the label's width, shorten the words in this edition, or set overlap: 'allow' on the anchor if the source prints it so`
        : `Label "${w.text}"${w.anchor ? ` at anchor "${w.anchor}"` : ''} of "${w.resourceId}"${w.locale ? ` (${w.locale})` : ''} runs into "${w.with}"${w.withAnchor ? ` at "${w.withAnchor}"` : ''}${w.count > 1 ? ` and ${w.count - 1} more` : ''} — move an anchor, narrow the label's width or shorten the words in this edition`;
      break;
    case 'pageFenceLength':
      text = 'A composed page needs four colons (::::page{template="…"} … ::::) — this :::page is read as a comic page';
      break;
    case 'columnsFlowUnknown':
      text = `Unknown flow "${w.value}" for :::columns — the group fills its columns in turn ("snake"), or stream by stream ("parallel") when it sets breaks`;
      break;
    case 'paperAttributeInvalid':
      text = `:::paper ${w.key}="${w.value}" is not a value it reads — dropped, the pages keep the document's paper for it`;
      break;
    case 'headingClaimsColumn':
      text = w.element !== undefined
        ? `The design of an H${w.level} reserves its whole column: the element "${w.element}" reaches the foot of it, so the text after the heading starts in the next column — set reserve: false on the element if it is decoration, or span: 'page' on the level if the page is meant to be the heading's`
        : `The design of an H${w.level} reserves its whole column: its minHeight is as tall as the column, so the text after the heading starts in the next column — lower minHeight, or set span: 'page' on the level if the page is meant to be the heading's`;
      break;
    case 'figureWordsShared':
      text = `Figure of "${w.resourceId}" gives its ${w.words.map((k) => (k === 'alt' ? 'alt text' : k)).join(' and ')} to a resource an earlier figure of this chapter already worded — the pages show the first figure's words and drop these; give this figure a resource of its own (a second entry for the same file) to keep both`;
      break;
    case 'unknownChipStyle':
      text = `Unknown chip style "${w.style}"${inRes} — the chip takes the first chip style`;
      break;
    case 'unknownMarkStyle':
      text = `Unknown highlight style "${w.style}"${inRes} — the mark takes the first highlight style`;
      break;
    case 'undefinedFootnote':
      text = `Footnote [^${w.id}] has no definition — write [^${w.id}]: text on a line of its own`;
      break;
    case 'unusedFootnote':
      text = `Footnote definition [^${w.id}]: is never cited — it is not set`;
      break;
    case 'indexMarkInvalid':
      text = 'An index mark names no term — write :index[word] or :index{term="…"}; it indexes nothing';
      break;
    case 'indexSeeUnknown':
      text = `The index${w.index ? ` "${w.index}"` : ''} has no entry "${w.target}" for a see / see also reference — the reference still prints`;
      break;
    case 'indexRangeUnclosed':
      text = `The index range of "${w.term}" has no range="${w.missing}" mark — it prints a single page`;
      break;
    case 'indexReadingMissing':
      text = `The index entry "${w.term}" has a kanji and no reading — add yomi="…" in kana to its mark; it files after the kana entries`;
      break;
    case 'unknownHeadingStyle':
      text = `Unknown heading style "${w.style}" on an H${w.level} — the level's own settings apply`;
      break;
    case 'unknownTableStyle':
      text = `Unknown table style "${w.styleId}" on table "${w.resourceId}" — the document's table style applies`;
      break;
    case 'fullwidthMarkup':
      text = `Markup typed in fullwidth characters "${w.typed}" is set as text — type ${w.ascii} instead`;
      break;
    case 'attributeKeyInvalid':
      text = `The attribute key "${w.key}" is not read — keys are written in ASCII letters, digits, _ and -`;
      break;
    case 'tabInVerticalText':
      text = 'A :tab in vertical text is set as a word space — tab stops are set in horizontal text only';
      break;
    case 'raggedTableGrid':
      text = w.reason === 'spanOverlap'
        ? `Table "${w.resourceId}": the cell at row ${w.row + 1}, column ${w.col + 1} sits under a merged cell — keep covered cells with hiddenBy (mergeCells) or the cells shift`
        : `Table "${w.resourceId}": row ${w.row + 1} has no cell from column ${w.col + 1} on — the grid has a hole`;
      if (w.count > 1) text += ` (${w.count} issues)`;
      break;
    case 'missingImage':
      text = `No image for file "${w.fileId}"${w.resourceId !== undefined ? ` (resource "${w.resourceId}")` : ''} — painted as a placeholder`;
      break;
    case 'svgFontUnavailable':
      text = `The SVG "${w.fileId}"${w.resourceId !== undefined ? ` (resource "${w.resourceId}")` : ''} sets text in "${w.family}" ${w.weight}${w.style === 'italic' ? ' italic' : ''}, which has no face to embed — the image sets it in a fallback face`;
      break;
    case 'svgFontsTooLarge':
      text = `The fonts of the SVG "${w.fileId}"${w.resourceId !== undefined ? ` (resource "${w.resourceId}")` : ''} come to ${Math.round(w.bytes / 1024)} KB, over the ${Math.round(w.maxBytes / 1024)} KB cap — none was embedded`;
      break;
    case 'cjkLooseLine':
      text = `The justified line "${w.text}" needs more space between its characters than the cap allows — it is set short of the measure`;
      break;
    case 'raggedLine':
      text = `The justified line "${w.text.trim()}" would need its word spaces at ${Math.round(w.ratio * 10) / 10}× their width: it is set ragged`;
      break;
    case 'fontFallback': {
      const face = `"${w.family}" ${w.weight}${w.style === 'italic' ? ' italic' : ''}`;
      text = w.reason === 'missing'
        ? `The face ${face} was not loaded when the document was laid out — its text was measured with a fallback face; load it first (prepareFonts, buildDocumentWithFonts)`
        : `The face ${face} has no file of its own — the browser draws it from another weight or slant of the family; load that face or set a weight the family has`;
      break;
    }
    case 'glyphFallback': {
      const face = `"${w.family}" ${w.weight}${w.style === 'italic' ? ' italic' : ''}`;
      const more = w.count > w.characters.length ? ` and ${w.count - w.characters.length} more` : '';
      const by = w.supplier ? `the face of ${isGenericFamily(w.supplier) ? w.supplier : `"${w.supplier}"`}` : 'a face the system picks';
      text = `The face ${face} has no glyph for ${w.count === 1 ? '1 character' : `${w.count} characters`} (${w.characters.join(' ')}${more}); ${by} draws them instead — choose a family that covers them or name one after it`;
      break;
    }
    case 'designTextTruncated':
      text = w.mode === 'clip'
        ? `The ${w.slot} text "${w.text}" (element "${w.elementId}") is wider than its box and clipped`
        : `The ${w.slot} text "${w.text}" (element "${w.elementId}") does not fit its width and ends in an ellipsis — set overflow: 'wrap' to break it onto more lines, or give it more room`;
      break;
    case 'unbreakableWordOverflow':
      text = `The line "${w.text}" holds an Arabic-script word wider than the line — such a word is never divided, so it runs past the measure`;
      break;
    case 'wordDividedByCharacter':
      text = `The line "${w.text}" ends in a word wider than the whole line, cut between two of its letters with no hyphen to fit — give the text more room or a smaller size`;
      break;
    case 'wordDividedBySyllable':
      text = `The line "${w.text}" ends in a word wider than the whole line, divided at a syllable to fit`;
      break;
    case 'joiningScriptLetterSpacing':
      text = `"${w.text}": its style sets letter-spacing, which Arabic-script words do not take (it breaks their joins) — they are set without it`;
      break;
    case 'dropCap':
      text = w.reason === 'shortParagraph'
        ? `"${w.text}": the paragraph has fewer lines than its drop cap sinks — ${w.handling === 'shrink' ? `the initial spans its ${w.lines ?? 1} line${(w.lines ?? 1) === 1 ? '' : 's'}` : w.handling === 'skip' ? 'it is set without one' : 'the room under the initial is kept'}`
        : w.reason === 'split'
          ? `"${w.text}": the paragraph breaks before the last line of its drop cap — alone in a column too short for the initial`
          : w.reason === 'joiningScript'
            ? `"${w.text}": its first letter joins the next — the drop cap is not set`
            : w.reason === 'verticalText'
              ? `"${w.text}": drop caps are set in horizontal text only — the paragraph is set without one`
              : w.reason === 'inBox'
                ? `"${w.text}": a paragraph inside a box takes no drop cap — it is set without one; set the paragraphs outside the :::callout, or in a frame of a composed page`
              : `"${w.text}": the paragraph opens with no letter to set as a drop cap — it is set without one`;
      break;
    case 'codeOverflow': {
      const what = `${w.lines === 1 ? 'A line' : `${w.lines} lines`} of a${w.lang ? ` ${w.lang}` : ''} code listing ${w.lines === 1 ? 'is' : 'are'} wider than its box`;
      text = w.mode === 'wrap'
        ? `${what} — turned over`
        : w.mode === 'clip'
          ? `${what} — cut at the box's edge`
          : `${what} — the listing is set at ${Math.round((w.scale ?? 1) * 100)} % of its size, and what still does not fit is turned over`;
      break;
    }
    case 'columnsTooNarrow':
      text = `The ${w.columns} columns of a :::columns group are ${Math.round(w.widthPx)} px wide, narrower than six ems of their text — few words fit a line; set fewer columns or a smaller gap`;
      break;
    case 'afterText':
      text = `${w.resourceId !== undefined ? `The resource "${w.resourceId}"` : 'A side box'} stands in the side column of a page with no text — the text ended before the side column had room for it; fence it earlier or make it shorter`;
      break;
    case 'unplaced':
      text = `${w.resourceId !== undefined ? `The resource "${w.resourceId}"` : 'A box'} found no slot before the layout ended — it is on no page`;
      break;
    case 'tocGroupSplit':
      text = `The contents block "${w.title}" is cut between ${w.columns} columns — it is taller than a full column, or its column is too short to hold it; list fewer levels (:::toc{levels="1"}), head the blocks with a lower level (toc.groups.head) or make the rows smaller`;
      break;
    case 'shortListSplit':
      text = `A list of ${w.items} ${w.items === 1 ? 'item' : 'items'} is cut between two columns — bodyText.shortListSplit: "avoid" sets a short list whole when a column can hold it`;
      break;
    case 'openerFloat':
      text = `${w.resourceId !== undefined ? `The resource "${w.resourceId}"` : 'A floated box'} is set on an opener page — layout.openerFloats: "avoid" moves it to the first slot after that page`;
      break;
    case 'textWrap': {
      const what = w.resourceId !== undefined ? `The resource "${w.resourceId}"` : `A "${w.box ?? 'callout'}" box`;
      text = w.reason === 'moved'
        ? `${what} wraps text round it but is too tall for the room left in its column — it moved on to the next column with its anchor`
        : w.reason === 'tooNarrow'
          ? `${what} would leave the text beside it narrower than layout.wrap.minTextWidth — it takes its band whole, with no text beside it`
          : w.reason === 'verticalText'
            ? `${what} asks for text wrap, which is set in horizontal text only — in vertical text it takes its band whole`
            : w.reason === 'noContour'
              ? `${what} wraps text round its contour, but its shape is not known (no contour.points, no transparency, or an alpha channel the host did not trace) — the text runs round its box`
              : `${what} is shorter than layout.wrap.minLinesBeside lines — it takes its band whole, with no text beside it`;
      break;
    }
    case 'pictureBelowPrintSize':
      text = `The picture "${w.resourceId}" is set at ${Math.round(w.scale * 100)} % of its print size: its column is ${w.widthPx} px wide, the picture ${w.printWidthPx} px at its resolution, the text block ${w.pageWidthPx} px. A picture in the flow is never wider than its column, and the default page has two. Span the page (placement.span: 'page'), set the page in one column (layout.layoutType: 'single'), or give the picture a higher resolution if this size is the one you want`;
      break;
    case 'emptyCaption':
      text = `The resource "${w.resourceId}" has no caption, so its caption line prints "${w.label}" alone — write its caption, or leave it as a numbered label if that is meant`;
      break;
    case 'folioMissing':
      text = `This page of the template "${w.template}" draws no ${w.folio ? 'folio' : w.slot === 'header' ? 'running head' : w.slot === 'footer' ? 'running foot' : 'running text'} "${w.elementId}" (${w.slot}), which ${w.drawnOn} of the other ${w.siblings} ${w.side} pages of the template draw — check what the element reads on this page (an {attr.x} the page fence leaves unset, a name empty here), or switch it off on purpose with when / unless on the element and an attribute on the page fence`;
      break;
    case 'resourceMoved':
      text = `The resource "${w.resourceId}" set in the text is too tall for the room left in its column and moved on to the next, leaving ${w.emptyMm} mm of the column empty — make it smaller, move its ::resource line, or float it (placement.position: 'auto')`;
      break;
    case 'floatShrunk':
      text = w.overflowPx !== undefined
        ? `The picture "${w.resourceId}" is set at its smallest scale, ${Math.round(w.scale * 100)} % of its size, and still runs ${w.overflowPx} px past the foot of the page's text block`
        : `The picture "${w.resourceId}" is set at ${Math.round(w.scale * 100)} % of its size to fit the room left on its page`;
      break;
    case 'cjkMarksExceedLeading':
      text = `The paragraph "${w.text}" has emphasis dots or name and title lines in a line gap of ${w.gapEm} em — they need ${w.neededEm} em; set it with more leading`;
      break;
    case 'rubyExceedsLeading':
      text = `The paragraph "${w.text}" has ruby readings ${w.neededEm} em high in a line gap of ${w.gapEm} em — they touch the next line; set it with more leading`;
      break;
    case 'kuntenExceedsLeading':
      text = `The kanbun "${w.text}" has reading marks ${w.neededEm} em out of its lines in a line gap of ${w.gapEm} em — they touch the next line; set it with more leading`;
      break;
    case 'arabicMarksExceedLeading':
      text = `The vowel marks of "${w.text}" meet the next line: the two lines' ink takes ${w.neededEm} em, and their baselines are ${w.lineHeightEm} em apart; set the paragraph with more leading`;
      break;
    case 'unknownNumberFormat':
      text = `${w.path}: unknown number format "${w.value}" — numbered as ${w.used}`;
      break;
    case 'fontFamilyStack':
      text = `${w.path}: font stack "${w.value}" — set in "${w.used}"`;
      break;
    case 'unknownConfigKey':
      text = `${w.path}: unknown setting "${w.value}" — ignored${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''}`;
      break;
    case 'headingDesignCut':
      text = `The design of an H${w.level} runs ${Math.round(w.overflowPx)}px past the foot of its ${w.where} — that part is cut off`;
      break;
    case 'sideColumnPercentClamped':
      text = w.value.trim() !== '' && Number.isFinite(Number(w.value))
        ? `${w.path}: a side column of ${w.value}% leaves a column with no width — cut at ${w.used}%`
        : `${w.path}: "${w.value}" is not a percentage — the side column is cut at ${w.used}%`;
      break;
    case 'columnCountClamped':
      text = `${w.path}: ${w.value} is not a column count from 3 to 8 — the page is cut into ${w.used} columns`;
      break;
    case 'comicSplitSyntax':
      text = `A comic page's split cannot be read as written: ${w.message}`;
      break;
    case 'comicSplitOverflow':
      text = `The sizes of a comic page's split add up to ${w.total} % — they are scaled down to fit`;
      break;
    case 'comicPanelCount':
      text = w.panels > w.cells
        ? `A comic page has ${w.panels} panels and its split ${w.cells} cells — the last ${w.panels - w.cells} are not set`
        : `A comic page has ${w.panels} panels and its split ${w.cells} cells — the last ${w.cells - w.panels} cells stay empty`;
      break;
    case 'comicStrayText':
      text = `"${w.text}" is not a script line (key: text) or sits before the first ::panel — it is lettered as a caption`;
      break;
    case 'comicUnknownBalloonStyle':
      text = `Unknown balloon style "${w.style}" — the line takes the default style of its key`;
      break;
    case 'comicUnknownArt':
      text = `A comic panel names "${w.resourceId}", which is no picture resource — the panel is set empty`;
      break;
    case 'comicPanelLetterbox':
      text = `Panel ${w.panel + 1} cannot hold the safe area of "${w.resourceId}" under a crop — the picture is shown whole within bands of the panel background`;
      break;
    case 'comicBalloonOverflow':
      text = `A balloon of panel ${w.panel + 1} does not fit cleanly (${w.reasons.join(', ') || 'crowded'}) — shorten the line, enlarge the panel or pin it with at=`;
      break;
    case 'comicUnknownSpeaker':
      text = `No picture of this comic page marks the speaker "${w.speaker}" and no cast entry names it — its tails point off the panel`;
      break;
    case 'comicPanelFrame':
      text = w.reason === 'unknownBox'
        ? `Panel ${w.panel + 1} names the box style "${w.style ?? ''}", which no callout style defines — the panel keeps its panel style`
        : w.reason === 'textOverflow'
          ? `The text of panel ${w.panel + 1} does not fit its frame (${w.overflowMm ?? 0} mm over) — the rest is clipped; shorten it or give the panel a larger cell`
          : `Panel ${w.panel + 1} is a text panel ${w.reason === 'strip' ? 'of a strip' : w.reason === 'spread' ? 'of a spread' : 'in a vertical or right-to-left document'} — its frame takes no text there, and the text is set in the flow after the comic`;
      break;
    case 'comicAnchorOutsideSafeArea':
      text = `The anchor "${w.anchorId}" of "${w.resourceId}" lies outside the picture's safe area — a crop may cut it off`;
      break;
    case 'wrapUnsupported':
      text = `${w.path}: text wraps in horizontal text only — in this vertical document "${w.value}" is ignored and the figures keep their bands whole`;
      break;
    case 'contentInConfig': {
      const n = w.count ?? 1;
      text = `${w.path}${w.ownerId ? ` (${w.ownerId})` : ''}: ${n} design text${n === 1 ? '' : 's'} hold${n === 1 ? 's' : ''} ${w.chars ?? 0} characters of content ("${w.value}") — move the text into the Markdown and keep only placeholders in the design`;
      break;
    }
    case 'cjkGridClamped':
      text = `${w.path}: ${w.value} ${w.path.endsWith('charsPerLine') ? 'characters per line' : 'lines'} do not fit inside the margins — the grid is set with ${w.used}`;
      break;
    // Box styles based on another (#905).
    case 'calloutStyleExtendsUnknown':
      text = `${w.path}: no box style has the id "${w.value}"${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''} — the style stands alone`;
      break;
    case 'calloutStyleExtendsCycle':
      text = `${w.path}: the box styles extend each other in a loop (${w.value}) — the style stands alone`;
      break;
    // Page templates (#853): `path` is a JSON pointer.
    case 'templateDuplicate':
      text = `${w.path}: another template already has the id "${w.value}" — this one is ignored`;
      break;
    case 'templateExtendsCycle':
      text = `${w.path}: the templates extend each other in a loop (${w.value}) — the template is dropped`;
      break;
    case 'templateExtendsUnknown':
      text = `${w.path}: no template has the id "${w.value}"${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''} — the template stands alone`;
      break;
    case 'frameDuplicate':
      text = `${w.path}: the name "${w.value}" is already taken by a frame or group of this template — this one is ignored`;
      break;
    case 'frameStyleUnknown':
      text = `${w.path}: no callout style has the id "${w.value}"${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''} — the frame is drawn without a box`;
      break;
    case 'frameAnchorUnknown':
      text = w.value.includes(' → ')
        ? `${w.path}: the frames are anchored to each other in a loop (${w.value}) — this anchor reads as the area`
        : `${w.path}: the template has no frame, group or element "${w.value}"${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''} — the anchor reads as the area`;
      break;
    case 'frameMinMax':
      text = `${w.path}: ${w.value} — the frame takes ${w.used}`;
      break;
    case 'groupFrameUnknown':
      text = `${w.path}: the template has no frame "${w.value}"${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''} — the group skips it`;
      break;
    case 'groupFrameTwice':
      text = `${w.path}: the frame "${w.value}" is already in a group — a frame belongs to one group, this listing is skipped`;
      break;
    case 'frameChainLoop':
      text = `${w.path}: the frames continue into each other in a loop (${w.value}) — this link is dropped`;
      break;
    case 'overflowTargetUnknown':
      text = `${w.path}: "${w.value}" names no frame or template${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''} — the content does not continue there`;
      break;
    case 'labelStyleUnknown':
      text = `${w.path}: an anchor of "${w.resourceId ?? ''}" names the label style "${w.value}", which labelStyles does not have${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''} — its labels take the default look`;
      break;
    default:
      // A kind this build does not know (a VDT from a newer engine).
      text = `Warning "${(w as { kind: string }).kind}"`;
  }
  return text + where(w);
}
