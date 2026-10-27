// Fence lines: composed pages, container closes, comic pages and strips,
// references, verse, figures, banks and the known containers and
// directives.
// Part of parseBlocks (blockParser.ts), split out of its loop in #1276.
import type { LineScan, StepJump } from './lineScan.js';
import type { ParseOptions, ContentBlock, ParseIssue, ContainerName, DirectiveName, DirectiveAttrs, BlockSlot } from '../types.js';
import type { ParseState } from './parseState.js';
import type { SourceRange } from '../../composed/types.js';
import type { ComposedModuleFence } from '../types/blockInfo.js';
import { PAGE_FENCE_RE, attrSourcesOf, LONG_CLOSE_RE, CONTAINER_CLOSE_RE, DIRECTIVE_RE, parseBlocks, comicTextSource, BANK_LINE_RE, KNOWN_CONTAINERS, slotOf, KNOWN_DIRECTIVES } from '../blockParser.js';
import { parseDirectiveAttrs } from '../attrs.js';
import { parseComicFence } from '../../comics/page.js';

/** What createFenceLines takes from around the loop. */
export interface FenceLinesDeps {
  markdown: string;
  options: ParseOptions | undefined;
  parse: ParseState;
  blocks: ContentBlock[];
  issues: ParseIssue[];
  rawLines: string[];
  lineOffsets: number[];
  lineEndOffset: (k: number) => number;
  inExerciseText: () => boolean;
  containerStack: { id: number; name: ContainerName; sourceStart: number; sourceEnd: number; colons?: number; slot?: string; module?: string; }[];
  parseVerse: (start: number, attrsRaw: string) => { blocks: ContentBlock[]; next: number; };
  inlineRun: (raw: string, srcStart: number, srcEnd: number, hardBreaks?: boolean, report?: boolean, icons?: boolean) => { text: string; spans: ContentBlock["spans"]; sourceMap: number[]; };
  openPageAt: () => number;
  popContainer: (srcStart: number, srcEnd: number, unclosed: boolean) => void;
  oneLineDirectiveBefore: (at: number) => DirectiveName | undefined;
  openModule: (attrs: DirectiveAttrs, attrSources: Record<string, SourceRange>, sourceStart: number, sourceEnd: number, nested: boolean) => ComposedModuleFence;
  scopeSlot: (slot: BlockSlot | undefined) => BlockSlot | undefined;
  parseFigure: (start: number, attrsRaw: string) => number;
}

export function createFenceLines(deps: FenceLinesDeps) {
  const {
    markdown, options, parse, blocks, issues, rawLines, lineOffsets, lineEndOffset, inExerciseText,
    containerStack, parseVerse, inlineRun, openPageAt, popContainer, oneLineDirectiveBefore,
    openModule, scopeSlot, parseFigure
  } = deps;
  /** Reads a fence or directive line; `continue` once it is read. */
  const parseFenceLine = (lineScan: LineScan): StepJump => {
    const {
      line, trimmed
    } = lineScan;
    // A composed page (#854): `::::page{template=…}` opens it, a bare fence
    // of as many colons closes it. A page opened while one is open closes
    // that one first (reported unclosed), and so does its closing fence any
    // `:::` container still open inside it.
    const pageOpen = PAGE_FENCE_RE.exec(trimmed);
    if (pageOpen) {
      const srcStart = lineOffsets[parse.i]!;
      const srcEnd = lineEndOffset(parse.i);
      const at = openPageAt();
      if (at >= 0) while (containerStack.length > at) popContainer(srcStart, srcStart, true);
      const attrsRaw = pageOpen[2] ?? '';
      const attrs = parseDirectiveAttrs(attrsRaw);
      const blobStart = srcStart + line.indexOf('{') + 1;
      const attrSources = attrsRaw ? attrSourcesOf(attrsRaw, blobStart) : {};
      const id = parse.nextContainerId++;
      const colons = pageOpen[1]!.length;
      containerStack.push({ id, name: 'composedPage', sourceStart: srcStart, sourceEnd: srcEnd, colons });
      const spread = attrs.spread !== undefined && attrs.spread.trim().toLowerCase() !== 'false';
      parse.pageFence = { template: attrs.template?.trim() ?? '', spread, attrs, attrSources, fenceIndex: parse.pageFences++, colons };
      parse.moduleNames = new Set();
      parse.moduleCounts = new Map();
      blocks.push({
        type: 'containerStart',
        text: '',
        spans: [],
        containerName: 'composedPage',
        containerAttrs: attrs,
        containerId: id,
        composedPage: parse.pageFence,
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: [],
      });
      parse.i++;
      return 'continue';
    }
    const longClose = LONG_CLOSE_RE.exec(trimmed);
    if (longClose) {
      const at = openPageAt();
      if (at >= 0 && containerStack[at]!.colons === longClose[1]!.length) {
        const srcStart = lineOffsets[parse.i]!;
        while (containerStack.length > at + 1) popContainer(srcStart, srcStart, true);
        popContainer(srcStart, lineEndOffset(parse.i), false);
        parse.i++;
        return 'continue';
      }
    }

    // Container closing fence — a bare `:::` while a container is open pops
    // it and emits the matching `containerEnd` marker. With nothing open the
    // line is not special and falls through to paragraph parsing so the
    // stray fence stays visible instead of vanishing silently.
    // A bare `:::` never closes a composed page (#854): right inside one it
    // is a stray fence, set as text.
    if (containerStack.length > 0 && containerStack[containerStack.length - 1]!.colons === undefined && CONTAINER_CLOSE_RE.test(trimmed)) {
      popContainer(lineOffsets[parse.i]!, lineEndOffset(parse.i), false);
      parse.i++;
      return 'continue';
    }
    // A bare `:::` with nothing to close right after a one-line directive
    // (`:::toc` then `:::`, #1125): a closing fence written for a directive
    // that takes none. Dropped and reported instead of printed.
    if (CONTAINER_CLOSE_RE.test(trimmed)) {
      const directive = oneLineDirectiveBefore(parse.i);
      if (directive) {
        issues.push({ kind: 'strayFence', delimiter: ':::', directiveName: directive, sourceStart: lineOffsets[parse.i]!, sourceEnd: lineEndOffset(parse.i) });
        parse.i++;
        return 'continue';
      }
    }

    // A comic page (#555) or strip (#566): `:::page{split=…}` … `:::`, its
    // panels and script read whole (`parseComicFence`).
    const comicMatch = trimmed.match(DIRECTIVE_RE);
    if (comicMatch && (comicMatch[1] === 'page' || comicMatch[1] === 'strip')) {
      const comic = parseComicFence(markdown, lineOffsets[parse.i]!);
      if (comic) {
        comic.source.fenceIndex = parse.comicFences++;
        blocks.push({
          type: 'directive',
          text: '',
          spans: [],
          directiveName: comic.source.kind,
          directiveAttrs: comic.source.attrs,
          comic: comic.source,
          sourceStart: comic.source.sourceStart,
          sourceEnd: comic.source.sourceEnd,
          sourceMap: [],
        });
        // The Markdown of its text panels (`::panel{text}`, #885), read as
        // any text is and set after it: the layout pours it into the
        // panels' frames (`wrapComicTextPanels`), or sets it in the flow
        // where it cannot.
        for (const panel of comic.source.panels) {
          if (!panel.text || panel.text.end <= panel.text.start) continue;
          const body = parseBlocks(comicTextSource(markdown, panel.text.start, panel.text.end), options);
          blocks.push(...body.blocks);
          issues.push(...body.issues);
        }
        // Past the closing fence line.
        while (parse.i < rawLines.length && lineOffsets[parse.i]! <= comic.end) parse.i++;
        return 'continue';
      }
    }

    // Reference data (#268): `:::references{format=bibtex}` … `:::`. The
    // body is kept as written (BibTeX braces, YAML indentation) and never
    // set; an unclosed block runs to the end of the text.
    const refsMatch = trimmed.match(DIRECTIVE_RE);
    if (refsMatch && refsMatch[1] === 'references') {
      const startIdx = parse.i;
      const body: string[] = [];
      parse.i++;
      while (parse.i < rawLines.length && !CONTAINER_CLOSE_RE.test(rawLines[parse.i]!.trim())) body.push(rawLines[parse.i++]!);
      const closed = parse.i < rawLines.length;
      const srcEnd = closed ? lineEndOffset(parse.i) : lineEndOffset(rawLines.length - 1);
      blocks.push({
        type: 'directive',
        text: '',
        spans: [],
        directiveName: 'references',
        directiveAttrs: parseDirectiveAttrs(refsMatch[2] ?? ''),
        rawBody: body.join('\n'),
        sourceStart: lineOffsets[startIdx]!,
        sourceEnd: srcEnd,
        sourceMap: [],
      });
      if (closed) parse.i++;
      return 'continue';
    }

    // A poem (#378, #620): `:::verse{attrs}` … `:::`, a bayt or a line of
    // verse a line.
    if (refsMatch && refsMatch[1] === 'verse') {
      const verse = parseVerse(parse.i, refsMatch[2] ?? '');
      blocks.push(...verse.blocks);
      parse.i = verse.next;
      return 'continue';
    }

    // A figure with labels (#854): `:::figure{resource=…}` … `:::`.
    if (refsMatch && refsMatch[1] === 'figure') {
      parse.i = parseFigure(parse.i, refsMatch[2] ?? '');
      return 'continue';
    }

    // An exercise's word bank (#1225): `::bank[sun | rain]{…}`.
    const bankMatch = inExerciseText() ? trimmed.match(BANK_LINE_RE) : null;
    if (bankMatch) {
      const srcStart = lineOffsets[parse.i]!;
      const srcEnd = lineEndOffset(parse.i);
      const words = bankMatch[1] ?? '';
      const wordsAt = srcStart + line.indexOf('::bank') + 7;
      const run = words ? inlineRun(words, wordsAt, wordsAt + words.length, false, false) : { text: '', spans: [], sourceMap: [] };
      blocks.push({
        type: 'directive',
        text: run.text,
        spans: run.spans,
        directiveName: 'bank',
        directiveAttrs: parseDirectiveAttrs(bankMatch[2] ?? ''),
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: run.sourceMap,
      });
      parse.i++;
      return 'continue';
    }

    // Container opening fence — `:::name` / `:::name{attrs}` whose name is a
    // known container. Emits a `containerStart` marker; the blocks that
    // follow are parsed as usual until the matching closing fence.
    const directiveMatch = trimmed.match(DIRECTIVE_RE);
    if (directiveMatch && KNOWN_CONTAINERS.has(directiveMatch[1] as ContainerName)) {
      const name = directiveMatch[1] as ContainerName;
      const attrsRaw = directiveMatch[2] ?? '';
      const srcStart = lineOffsets[parse.i]!;
      const srcEnd = lineEndOffset(parse.i);
      const id = parse.nextContainerId++;
      const containerAttrs = parseDirectiveAttrs(attrsRaw);
      // Where each attribute's value is written (#857): a frame's tab text
      // (`label`) and title map back to it.
      const containerAttrSources = attrsRaw ? attrSourcesOf(attrsRaw, srcStart + line.indexOf('{') + 1) : undefined;
      // A module of the open composed page (#1062): its own name, the
      // slots of its blocks scoped by it. (Outside a page it is a plain
      // box of its content.)
      const pageAt = name === 'module' ? openPageAt() : -1;
      const module = pageAt >= 0 ? openModule(containerAttrs, containerAttrSources ?? {}, srcStart, srcEnd, containerStack.slice(pageAt + 1).some((e) => e.name === 'module')) : undefined;
      // `:::frame{slot="…"}` (#854), or any container sent to a slot.
      const slot = name === 'module' ? undefined : scopeSlot(containerAttrs.slot !== undefined ? slotOf(containerAttrs, attrsRaw, srcStart + line.indexOf('{') + 1) : undefined);
      containerStack.push({ id, name, sourceStart: srcStart, sourceEnd: srcEnd, ...(slot ? { slot: slot.name } : {}), ...(module && !module.nested ? { module: module.name } : {}) });
      blocks.push({
        type: 'containerStart',
        text: '',
        spans: [],
        containerName: name,
        containerAttrs,
        ...(containerAttrSources && Object.keys(containerAttrSources).length > 0 ? { containerAttrSources } : {}),
        containerId: id,
        ...(slot ? { slot } : {}),
        ...(module ? { module } : {}),
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: [],
      });
      parse.i++;
      return 'continue';
    }

    // Directive — `:::name` or `:::name{attrs}` on its own line. Only known
    // directive names are promoted to a `directive` block; unknown names
    // fall through to paragraph parsing so they remain visible in the
    // output (and downstream warnings surface the typo).
    if (directiveMatch && KNOWN_DIRECTIVES.has(directiveMatch[1] as DirectiveName)) {
      const name = directiveMatch[1] as DirectiveName;
      const attrsRaw = directiveMatch[2] ?? '';
      const srcStart = lineOffsets[parse.i]!;
      const srcEnd = lineEndOffset(parse.i);
      blocks.push({
        type: 'directive',
        text: '',
        spans: [],
        directiveName: name,
        directiveAttrs: parseDirectiveAttrs(attrsRaw),
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: [],
      });
      parse.i++;
      return 'continue';
    }
  };
  return { parseFenceLine };
}
