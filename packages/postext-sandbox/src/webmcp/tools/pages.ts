// The laid-out pages: as pictures, and in words.

import { composeBookMemo } from '../../book/compose.js';
import type { SandboxAction } from '../../context/SandboxContext.js';
import { toChapterFocus } from '../../viewport/canvas/CanvasPreview/chapterFocus.js';
import { chapterOf, dispatchAndWait, layOutChapter, layoutConfig, pageIndexOf, type SandboxToolHost } from '../host.js';
import { ToolError, imageResult, type WebMcpTool } from '../modelContext.js';
import { pageImage, preparePainting, printPreviewFor } from '../pageImage.js';
import { balloonSummary, hitTestPage, linkDestination, sourcePlace } from '../pagePoint.js';
import { outlinePages, summariseBlock, summarisePage } from '../pageText.js';
import { screenPosition } from './view.js';
import { breadcrumb, breadcrumbText, climbable, crumbText, type PageSelection } from '../../selection/pageSelection.js';
import { sourceAt } from 'postext';
import { setPageSelection } from '../../selection/selectionStore.js';
import { createSelectionApply } from '../../selection/applySelection.js';
import { selectionTarget } from '../../selection/selectionTargets.js';
import { editModeNow } from '../../editing/editMode.js';

/** The levels of the source map an agent can pick at a point (#865). */
const PICK_LEVELS = ['text', 'attr', 'label', 'resource', 'block', 'box', 'frame', 'group', 'design', 'slot', 'template'] as const;

const CHAPTER_PARAM = {
  type: ['integer', 'string'],
  description: 'The chapter: its position in the book (from 1), its title or its id. The chapter the reader is at when left out.',
} as const;

/** Most pages one call paints. */
const MAX_PAGES = 6;

export function pageTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;

  /** The page the reader is looking at, as an index into the document of
   *  the chapter it is in; the chapter's first page with content when the
   *  reader is elsewhere. */
  const pageOnScreen = (chapterIndex: number, doc: { pages: readonly { pageNumberValue: number; blankForParity?: boolean; blankForForce?: boolean }[] }): number => {
    const at = screenPosition(host);
    if (at.page !== null && at.chapterIndex === chapterIndex) {
      const found = doc.pages.findIndex((p) => p.pageNumberValue === at.page);
      if (found >= 0) return found;
    }
    return Math.max(0, doc.pages.findIndex((p) => !p.blankForParity && !p.blankForForce));
  };

  const renderPage: WebMcpTool = {
    name: 'sandbox_render_page',
    title: 'Sandbox: a page as a picture',
    description: 'A picture of a page of the book as it is laid out now — the way to see the effect of a change. It waits for the layout to follow the last change, so it can be called right after one. Without a page it gives the one on screen; count gives the pages after it too (2 for a spread). crop magnifies a part of the page for a close look at type and spacing. The picture shows what the settings draw on the page (baseline grid, crop marks), not the caret or the selection. The result is a list of content parts: a JSON text describing each page, then one image per page.',
    inputSchema: {
      type: 'object',
      properties: {
        chapter: CHAPTER_PARAM,
        page: { type: 'integer', description: 'The page number as printed on the page and shown in the viewer\'s page field.' },
        position: { type: 'integer', minimum: 1, description: 'The page by its position among the chapter\'s pages (from 1).' },
        count: { type: 'integer', minimum: 1, maximum: MAX_PAGES, description: `How many consecutive pages, from that one (default 1, at most ${MAX_PAGES}).` },
        width: { type: 'integer', minimum: 160, maximum: 2400, description: 'Width of each picture in pixels (default 900). A crop is given at this width too, so it shows more detail.' },
        format: { type: 'string', enum: ['jpeg', 'png', 'webp'], description: 'Default jpeg.' },
        quality: { type: 'number', minimum: 0.3, maximum: 1, description: 'JPEG or WebP quality (default 0.82).' },
        crop: {
          type: 'object',
          description: 'A part of the page, as fractions of its width and height from the top left corner: { x: 0, y: 0, width: 1, height: 0.5 } is the top half.',
          properties: {
            x: { type: 'number', minimum: 0, maximum: 1 },
            y: { type: 'number', minimum: 0, maximum: 1 },
            width: { type: 'number', minimum: 0.02, maximum: 1 },
            height: { type: 'number', minimum: 0.02, maximum: 1 },
          },
          required: ['x', 'y', 'width', 'height'],
          additionalProperties: false,
        },
        trimmed: { type: 'boolean', description: 'Leave out the margin with the bleed and crop marks, when the layout has cut lines.' },
        printPreview: { type: 'boolean', description: 'Paint the soft proof of the print output profile, with the trim, bleed and safe-zone guides and the preflight marks.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async (args, { signal }) => {
      const { chapter, index } = chapterOf(store.getSnapshot(), args.chapter ?? screenPosition(host).chapterIndex + 1);
      const { doc, state, settled } = await layOutChapter(host, chapter.id, signal);
      const first = args.position === undefined && args.page === undefined
        ? pageOnScreen(index, doc)
        : pageIndexOf(doc, { position: args.position as number | undefined, number: args.page as number | undefined });
      const count = Math.min((args.count as number | undefined) ?? 1, doc.pages.length - first);
      const crop = args.crop as { x: number; y: number; width: number; height: number } | undefined;
      if (crop && (crop.x + crop.width > 1.0001 || crop.y + crop.height > 1.0001)) {
        throw new ToolError('The crop reaches past the page: x + width and y + height must stay within 1.');
      }
      const config = layoutConfig(state);
      await preparePainting(config, chapter.markdown, state.resources);
      const printPreview = args.printPreview ? await printPreviewFor(config, state.resources, doc).catch((err: Error) => {
        throw new ToolError(`The print preview could not be set up: ${err.message}.`);
      }) : undefined;
      const images = [];
      const pages = [];
      for (let i = first; i < first + count; i++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const page = doc.pages[i]!;
        const image = pageImage(page, doc, {
          width: (args.width as number | undefined) ?? 900,
          format: (args.format as 'jpeg' | 'png' | 'webp' | undefined) ?? 'jpeg',
          quality: (args.quality as number | undefined) ?? 0.82,
          ...(crop ? { crop } : {}),
          trimmed: !!args.trimmed,
          ...(printPreview ? { printPreview } : {}),
        });
        images.push(image);
        pages.push({
          position: i + 1,
          page: page.pageLabel,
          ...(page.blankForParity || page.blankForForce ? { blank: true } : {}),
          width: image.width,
          height: image.height,
          ...(image.missingImages > 0 ? { picturesNotLoaded: image.missingImages } : {}),
        });
        // Let the page breathe between two paintings.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return imageResult({
        ok: true,
        chapter: index + 1,
        title: chapter.title,
        chapterPages: doc.pages.length,
        ...(settled ? {} : { note: 'The chapters before this one were still being laid out: page numbers may change.' }),
        ...(crop ? { crop } : {}),
        pages,
      }, images);
    },
  };

  const inspectPages: WebMcpTool = {
    name: 'sandbox_inspect_pages',
    title: 'Sandbox: the pages in words',
    description: 'What the layout engine put on the pages of a chapter, as data. Without a page: one line per page of the chapter (its number, whether it is blank, how many lines and figures, how it starts) — the map to pick pages from. With a page: every block on it with its text, column, number of lines, hyphenated lines, loose justified lines and how wide their spaces are, where it sits on the page, plus how full each column is; on a composed page, its template and what the layout moved, grew or scaled so the content fits ("dinero grew 8.2 mm", "gasto moved down 8.2 mm"). It waits for the layout to follow the last change.',
    inputSchema: {
      type: 'object',
      properties: {
        chapter: CHAPTER_PARAM,
        page: { type: 'integer', description: 'The page number as printed on the page.' },
        position: { type: 'integer', minimum: 1, description: 'The page by its position among the chapter\'s pages (from 1).' },
        count: { type: 'integer', minimum: 1, maximum: 12, description: 'How many consecutive pages to detail, from that one (default 1).' },
        textLength: { type: 'integer', minimum: 0, maximum: 4000, description: 'Characters of each block\'s text to give (default 240).' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (args, { signal }) => {
      const { chapter, index } = chapterOf(store.getSnapshot(), args.chapter ?? screenPosition(host).chapterIndex + 1);
      const { doc, settled } = await layOutChapter(host, chapter.id, signal);
      const base = {
        chapter: index + 1,
        title: chapter.title,
        chapterPages: doc.pages.length,
        converged: doc.converged,
        ...(settled ? {} : { note: 'The chapters before this one were still being laid out: page numbers may change.' }),
      };
      if (args.position === undefined && args.page === undefined) return { ...base, pages: outlinePages(doc) };
      const first = pageIndexOf(doc, { position: args.position as number | undefined, number: args.page as number | undefined });
      const count = Math.min((args.count as number | undefined) ?? 1, doc.pages.length - first);
      const textLength = (args.textLength as number | undefined) ?? 240;
      return { ...base, pages: Array.from({ length: count }, (_, i) => summarisePage(doc, first + i, textLength)) };
    },
  };

  const inspectPoint: WebMcpTool = {
    name: 'sandbox_inspect_point',
    title: 'Sandbox: what is at a point of a page',
    description: 'What lies at a point of a page and what a click there does in the Canvas: the block, the place in the chapter\'s Markdown source (line, column, offset and the word there), a link and the page it leads to (a :ref, a footnote marker, an index page number, a row of the contents) or its URL, the resource (a table cell, a caption, a note, a text of an SVG figure, a picture a design draws, a comic panel\'s art) and the part of a comic. x and y are fractions of the page from its top left corner, the space of sandbox_render_page\'s crop, so a spot seen in a picture can be asked about (pass trimmed as it was passed there). select also does what the click does short of following a link: it opens the Manuscript panel with the caret there (word: the word there selected, as a double click; to: a selection dragged to a second point), or the Resources panel on the resource, with the caret in its text. elements lists what lies at the point, innermost first, as a click picks it and each further click or Esc climbs (a glyph, its paragraph, the box round it, the frame of a composed page, its group, the page and its template; or a design element and its slot), each with its stable id, its source (Markdown range, config path, attribute, resource) and its name in the path the Sandbox shows (path); select with level picks one of them. sandbox_inspect_pages lists every block of a page; sandbox_go_to_page with anchor goes where a link leads.',
    inputSchema: {
      type: 'object',
      properties: {
        chapter: CHAPTER_PARAM,
        page: { type: 'integer', description: 'The page number as printed on the page.' },
        position: { type: 'integer', minimum: 1, description: 'The page by its position among the chapter\'s pages (from 1). The page on screen when neither is given.' },
        x: { type: 'number', minimum: 0, maximum: 1, description: 'Across the page, from its left edge (0) to its right edge (1).' },
        y: { type: 'number', minimum: 0, maximum: 1, description: 'Down the page, from its top edge (0) to its bottom edge (1).' },
        trimmed: { type: 'boolean', description: 'x and y are fractions of the page without its margin of bleed and crop marks, as in a picture rendered with trimmed.' },
        select: { type: 'boolean', description: 'Also put the caret (or the selection) there in the Manuscript panel, or open the resource in the Resources panel.' },
        word: { type: 'boolean', description: 'With select: select the word at the point, as a double click does.' },
        level: { type: 'string', enum: PICK_LEVELS, description: 'With select: pick the element of that level at the point (the path lists them), as clicking again on the spot or pressing Esc climbs to it: block the paragraph, frame the frame of a composed page, template the page and its template, design an element of a running head, a folio or the decoration. Content mode then selects its Markdown; Design mode opens its frame, style or template; a design element opens its settings in either mode.' },
        to: {
          type: 'object',
          description: 'With select: a second point of the same page; the text from the first point to this one is selected, as a drag does.',
          properties: {
            x: { type: 'number', minimum: 0, maximum: 1 },
            y: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['x', 'y'],
          additionalProperties: false,
        },
      },
      required: ['x', 'y'],
      additionalProperties: false,
    },
    // Not marked read-only: `select` opens a panel and moves the caret.
    annotations: { untrustedContentHint: true },
    execute: async (args, { signal }) => {
      if ((args.word !== undefined || args.to !== undefined || args.level !== undefined) && args.select !== true) throw new ToolError('word, to and level say what to select: set select to true with them.');
      if (args.level !== undefined && (args.word !== undefined || args.to !== undefined)) throw new ToolError('level picks an element at the point; word and to select text: give one of them.');
      if (args.word === true && args.to !== undefined) throw new ToolError('word selects the word at the point and to selects up to a second point: give one of them.');
      const { chapter, index } = chapterOf(store.getSnapshot(), args.chapter ?? screenPosition(host).chapterIndex + 1);
      const { doc, state, plan, settled } = await layOutChapter(host, chapter.id, signal);
      const pageIndex = args.position === undefined && args.page === undefined
        ? pageOnScreen(index, doc)
        : pageIndexOf(doc, { position: args.position as number | undefined, number: args.page as number | undefined });
      const page = doc.pages[pageIndex]!;
      const inset = args.trimmed && doc.trimOffset > 0 ? doc.trimOffset : 0;
      const onSheet = (p: { x: number; y: number }) => ({ x: inset + p.x * (page.width - 2 * inset), y: inset + p.y * (page.height - 2 * inset) });
      const point = onSheet({ x: args.x as number, y: args.y as number });
      const hit = hitTestPage(doc, pageIndex, point.x, point.y, state.resources);

      // The document is the chapter's own: its offsets are the chapter's.
      const book = composeBookMemo(state.chapters, chapter.id);
      const source = chapter.id === state.activeChapterId ? state.markdown : chapter.markdown;
      const caretOffset = hit.click.action === 'place_caret' ? hit.click.offset : hit.offset;
      const place = caretOffset === null ? null : sourcePlace(source, toChapterFocus(book, caretOffset, caretOffset, false).anchor);

      const link = hit.link;
      const leadsTo = link ? linkDestination(doc, index, link, state.chapters, plan) : null;
      const comic = hit.comic;
      const resource = hit.resourceText
        ? {
            id: hit.resourceText.resourceId,
            part: hit.resourceText.target.kind,
            ...(hit.resourceText.target.kind === 'cell' ? { row: hit.resourceText.target.row + 1, column: hit.resourceText.target.col + 1 } : {}),
            offset: hit.resourceText.offset,
          }
        : comic?.kind === 'art'
          ? { id: comic.art.resourceId, part: 'comicArt' }
          : hit.designImageResourceId !== null
            ? { id: hit.designImageResourceId, part: 'designImage' }
            : hit.block?.resourceBlock
              ? { id: hit.block.resourceBlock.resource.id, part: 'body' }
              : null;

      // The elements at the point, innermost first, as a click picks them
      // and climbs them (#865), and the path the Sandbox shows for each.
      const chain = climbable(sourceAt(doc, pageIndex, point.x, point.y));
      const labels = state.labels;
      const pathOf = (level: number) => {
        const sel: PageSelection = { pageIndex, chain, level, point, origin: 'page' };
        return breadcrumbText(breadcrumb(doc, sel), labels);
      };
      const elements = chain.map((e, i) => {
        const crumb = breadcrumb(doc, { pageIndex, chain, level: i, point, origin: 'page' }).find((c) => c.level === i);
        return {
          level: e.level,
          id: e.id,
          ...(crumb ? { name: crumbText(crumb, labels) } : {}),
          source: e.source.kind === 'markdown' || e.source.kind === 'attr'
            ? { ...e.source, text: source.slice(toChapterFocus(book, e.source.start, e.source.start, false).anchor, toChapterFocus(book, e.source.end, e.source.end, false).anchor).slice(0, 120) }
            : e.source,
          ...(e.content ? { content: e.content } : {}),
        };
      });

      let selected: Record<string, unknown> | undefined;
      if (args.select === true && args.level !== undefined) {
        const level = chain.findIndex((e) => e.level === args.level);
        if (level < 0) throw new ToolError(`Nothing of level ${String(args.level)} is at that point: the levels there are ${chain.map((e) => e.level).join(', ') || 'none'}.`);
        const sel: PageSelection = { pageIndex, chain, level, point, origin: 'page', chapter: chapter.id };
        const target = selectionTarget(doc, sel, editModeNow());
        const apply = createSelectionApply({
          dispatch: () => store.dispatch,
          activePanel: () => store.getSnapshot().activePanel,
          sourceOfPage: () => book,
          chapters: () => store.getSnapshot().chapters,
        });
        setPageSelection(sel, doc, apply);
        apply(sel, doc);
        await dispatchAndWait(host, []);
        selected = { path: pathOf(level), element: elements[level], opens: target.kind, panel: store.getSnapshot().activePanel ?? null };
      } else if (args.select === true) {
        const word = args.word === true;
        const to = args.to as { x: number; y: number } | undefined;
        const end = to ? hitTestPage(doc, pageIndex, onSheet(to).x, onSheet(to).y, state.resources) : null;
        const openPanel = (panel: 'markdown' | 'resources'): SandboxAction[] => (store.getSnapshot().activePanel === panel ? [] : [{ type: 'SET_PANEL', payload: panel }]);
        const click = hit.click;
        // A link is not followed: the caret goes to its text.
        const caret = click.action === 'place_caret' ? click.offset : click.action === 'follow_link' ? hit.offset : null;
        if (click.action === 'open_resource') {
          await dispatchAndWait(host, [...openPanel('resources'), { type: 'SET_ACTIVE_RESOURCE', payload: click.resourceId }]);
          selected = { panel: 'resources', resource: click.resourceId };
        } else if (click.action === 'edit_resource_text') {
          const { resourceId, target, offset } = click.hit;
          let head = offset;
          if (end) {
            const other = end.resourceText;
            const same = other && other.resourceId === resourceId && other.target.kind === target.kind
              && (target.kind !== 'cell' || (other.target.kind === 'cell' && other.target.row === target.row && other.target.col === target.col));
            if (!same) throw new ToolError('The second point is not in the same text of the resource (the same cell, caption, note or SVG): a selection stays inside one.');
            head = other.offset;
          }
          await dispatchAndWait(host, [
            ...openPanel('resources'),
            { type: 'SET_ACTIVE_RESOURCE', payload: resourceId },
            { type: 'SET_PENDING_RESOURCE_FOCUS', payload: { resourceId, target, anchor: offset, head, selectWord: word } },
          ]);
          selected = { panel: 'resources', resource: resourceId, part: target.kind, anchor: offset, head, ...(word ? { word: true } : {}) };
        } else if (caret !== null) {
          let head = caret;
          if (end) {
            if (end.offset === null) throw new ToolError('The second point is not on text of the page: nothing to select up to.');
            head = end.offset;
          }
          const focus = toChapterFocus(book, caret, head, word);
          await dispatchAndWait(host, [...openPanel('markdown'), { type: 'SET_PENDING_EDITOR_FOCUS', payload: { ...focus, fromViewer: true } }]);
          selected = { panel: 'markdown', chapter: index + 1, anchor: focus.anchor, head: focus.head, ...(word ? { word: true } : {}) };
        } else {
          selected = { panel: null, note: 'Nothing to select at that point: it is off the text and the pictures of the page.' };
        }
      }

      return {
        chapter: index + 1,
        title: chapter.title,
        position: pageIndex + 1,
        page: page.pageLabel,
        chapterPages: doc.pages.length,
        ...(settled ? {} : { note: 'The chapters before this one were still being laid out: page numbers may change.' }),
        ...(hit.block ? { block: summariseBlock(hit.block, page, 120) } : {}),
        ...(place ? { source: place } : {}),
        ...(link
          ? {
              link: {
                kind: link.kind,
                ...('id' in link ? { id: link.id } : {}),
                ...(link.kind === 'url' ? { href: link.href, followed: 'with Cmd or Ctrl held' } : leadsTo ? { leadsTo } : { leadsTo: null, note: 'Its target is not on a page this layout knows (another chapter sets it and is not paginated yet, or nothing does). sandbox_go_to_page with anchor looks for it in every chapter.' }),
              },
            }
          : {}),
        ...(resource ? { resource } : {}),
        ...(comic
          ? {
              comic: {
                part: comic.kind === 'text' ? 'balloon text' : comic.kind,
                ...('balloon' in comic ? { balloon: balloonSummary(comic.balloon) } : {}),
                ...('panel' in comic ? { panel: comic.panel.index + 1 } : {}),
              },
            }
          : {}),
        click: hit.click.action,
        ...(chain.length > 0 ? { path: pathOf(0), elements } : {}),
        ...(selected ? { selected } : {}),
      };
    },
  };

  return [renderPage, inspectPages, inspectPoint];
}
