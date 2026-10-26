// Containers, composed-page modules, figures and labels: closing a fence,
// opening a module, reading a :::figure and a label.
// Part of parseBlocks (blockParser.ts), split out of it in #1276.
import type { DirectiveName, BlockSlot, DirectiveAttrs, ComposedModuleFence, FigureLabel, FigureWordKind, FigureWord, ContentBlock, ParseIssue, ContainerName } from '../types.js';
import { DIRECTIVE_RE, ONE_LINE_DIRECTIVES, MODULE_NAME_RE, PAGE_FENCE_RE, LONG_CLOSE_RE, attrSourcesOf, CONTAINER_CLOSE_RE, FIGURE_WORD_LINE_RE, LABEL_CONTAINER_RE, LABEL_LINE_RE, slotOf, closingBracket, LABEL_AT_PERCENT_RE, BLOCK_MATH_FENCE_RE } from '../blockParser.js';
import type { SourceRange } from '../../composed/types.js';
import { parseDirectiveAttrs } from '../attrs.js';
import { labelElementId } from '../../composed/ids.js';
import { BREAK_PLACEHOLDER } from '../inlineFormatting.js';
import type { ParseState } from './parseState.js';

/** What createContainerParsing takes from the pass. */
export interface ContainerParsingDeps {
  blocks: ContentBlock[];
  issues: ParseIssue[];
  rawLines: string[];
  lineOffsets: number[];
  lineEndOffset: (k: number) => number;
  inlineRun: (raw: string, srcStart: number, srcEnd: number, hardBreaks?: boolean, report?: boolean, icons?: boolean) => { text: string; spans: ContentBlock["spans"]; sourceMap: number[]; };
  containerStack: { id: number; name: ContainerName; sourceStart: number; sourceEnd: number; colons?: number; slot?: string; module?: string }[];
  parse: ParseState;
}

export function createContainerParsing(deps: ContainerParsingDeps) {
  const {
    blocks, issues, rawLines, lineOffsets, lineEndOffset, inlineRun, containerStack, parse
  } = deps;
  /** Emit the `containerEnd` of the innermost open container (at
   *  `srcStart`…`srcEnd`), reporting it as unclosed when `unclosed`. */
  const popContainer = (srcStart: number, srcEnd: number, unclosed: boolean): void => {
    const open = containerStack.pop()!;
    blocks.push({
      type: 'containerEnd',
      text: '',
      spans: [],
      containerName: open.name,
      containerId: open.id,
      sourceStart: srcStart,
      sourceEnd: srcEnd,
      sourceMap: [],
    });
    if (unclosed) {
      issues.push({
        kind: 'unclosedContainer',
        delimiter: ':::',
        containerName: open.name,
        containerId: open.id,
        sourceStart: open.sourceStart,
        sourceEnd: open.sourceEnd,
      });
    }
  };
  /** The one-line directive on the last non-blank line before line `at`,
   *  if that line is one. */
  const oneLineDirectiveBefore = (at: number): DirectiveName | undefined => {
    let j = at - 1;
    while (j >= 0 && rawLines[j]!.trim() === '') j--;
    const m = j >= 0 ? rawLines[j]!.trim().match(DIRECTIVE_RE) : null;
    return m && ONE_LINE_DIRECTIVES.has(m[1] as DirectiveName) ? m[1] as DirectiveName : undefined;
  };
  /** Index in `containerStack` of the open composed page, or -1. */
  const openPageAt = (): number => {
    for (let k = containerStack.length - 1; k >= 0; k--) if (containerStack[k]!.colons !== undefined) return k;
    return -1;
  };
  /** `slot` as the module it is written in names it (#1062):
   *  `<module>.<slot>` inside a `:::module` of the open page. */
  const scopeSlot = (slot: BlockSlot | undefined): BlockSlot | undefined => {
    if (!slot) return slot;
    const pageAt = openPageAt();
    if (pageAt < 0) return slot;
    for (let k = containerStack.length - 1; k > pageAt; k--) {
      const m = containerStack[k]!.module;
      if (m !== undefined) return { ...slot, name: `${m}.${slot.name}` };
    }
    return slot;
  };
  /** The module a `:::module` of the open page opens (#1062), its name
   *  taken: `name` as written when it is free and valid, else
   *  `<template>[n]`. Recorded on the page's fence unless `nested`. */
  const openModule = (attrs: DirectiveAttrs, attrSources: Record<string, SourceRange>, sourceStart: number, sourceEnd: number, nested: boolean): ComposedModuleFence => {
    const template = attrs.template?.trim() ?? '';
    if (nested) return { template, name: '', nested: true, attrs, attrSources, sourceStart, sourceEnd };
    const n = (parse.moduleCounts.get(template) ?? 0) + 1;
    parse.moduleCounts.set(template, n);
    const asked = attrs.name?.trim();
    let rejected: ComposedModuleFence['rejected'];
    let name: string | undefined;
    if (asked !== undefined && asked !== '') {
      if (!MODULE_NAME_RE.test(asked)) rejected = { name: asked, reason: 'invalid' };
      else if (parse.moduleNames.has(asked)) rejected = { name: asked, reason: 'taken' };
      else name = asked;
    }
    if (name === undefined) {
      let k = n;
      while (parse.moduleNames.has(`${template}[${k}]`)) k++;
      name = `${template}[${k}]`;
    }
    parse.moduleNames.add(name);
    const module: ComposedModuleFence = { template, name, ...(rejected ? { rejected } : {}), attrs, attrSources, sourceStart, sourceEnd };
    if (parse.pageFence) (parse.pageFence.modules ??= []).push(module);
    return module;
  };
  /** Whether line `k` (trimmed `pl`) is a composed page fence: an opening
   *  one, or the bare fence that closes the open page. */
  const isPageFenceLine = (pl: string): boolean => {
    if (PAGE_FENCE_RE.test(pl)) return true;
    const close = LONG_CLOSE_RE.exec(pl);
    const at = close ? openPageAt() : -1;
    return at >= 0 && containerStack[at]!.colons === close![1]!.length;
  };

  /**
   * A `:::figure{resource="…" slot="…"}` whose fence is line `start`
   * (#854): its `::label[…]{…}` lines up to the closing `:::`, as one
   * `resourceBlock`. A line that is neither a label nor blank ends a figure
   * left open (`unclosedContainer`), and is read as usual.
   */
  const parseFigure = (start: number, attrsRaw: string): number => {
    const attrs = parseDirectiveAttrs(attrsRaw);
    const fenceLine = rawLines[start]!;
    const blobStart = lineOffsets[start]! + fenceLine.indexOf('{') + 1;
    const attrSources = attrsRaw ? attrSourcesOf(attrsRaw, blobStart) : {};
    const labels: FigureLabel[] = [];
    const lineWords: Partial<Record<FigureWordKind, FigureWord>> = {};
    let k = start + 1;
    let last = start;
    let closed = false;
    while (k < rawLines.length) {
      const t = rawLines[k]!.trim();
      if (CONTAINER_CLOSE_RE.test(t)) {
        closed = true;
        break;
      }
      if (t === '') {
        k++;
        continue;
      }
      const word = FIGURE_WORD_LINE_RE.test(t) ? parseFigureWord(k) : undefined;
      if (word) {
        lineWords[word.kind] = word.word;
        last = k;
        k++;
        continue;
      }
      // A label written over several lines (#1058): `:::label{at=…}` up to
      // its own `:::`, each line a line of the label.
      const multi = LABEL_CONTAINER_RE.test(t) ? parseLabelContainer(k) : undefined;
      if (multi) {
        labels.push(multi.label);
        last = multi.close;
        k = multi.close + 1;
        continue;
      }
      const label = LABEL_LINE_RE.test(t) ? parseLabel(k) : undefined;
      if (!label) break;
      labels.push(label);
      last = k;
      k++;
    }
    // The figure's own words (#935): lines win over attributes.
    const words: Partial<Record<FigureWordKind, FigureWord>> = {};
    for (const kind of ['alt', 'caption', 'note'] as const) {
      const fromLine = lineWords[kind];
      const value = attrs[kind];
      if (fromLine) words[kind] = fromLine;
      else if (value !== undefined && attrSources[kind]) words[kind] = { text: value, sourceStart: attrSources[kind]!.sourceStart, sourceEnd: attrSources[kind]!.sourceEnd };
    }
    const slot = scopeSlot(attrsRaw ? slotOf(attrs, attrsRaw, blobStart) : undefined);
    // Each label's anchor (`resourceId#anchorId`) and, on a composed page,
    // its stable id (#857): the slot is the figure's own, else the frame's
    // it stands in.
    const resourceId = attrs.resource?.trim() ?? '';
    const pageAt = openPageAt();
    let slotName = slot?.name;
    for (let k = containerStack.length - 1; slotName === undefined && k > pageAt && pageAt >= 0; k--) slotName = containerStack[k]!.slot;
    labels.forEach((label, n) => {
      const anchor = 'anchor' in label.at ? label.at.anchor : undefined;
      if (anchor && resourceId) label.anchorRef = `${resourceId}#${anchor}`;
      if (pageAt >= 0 && slotName !== undefined) label.id = labelElementId(parse.pageFences - 1, slotName, anchor ?? `@${n}`);
    });
    blocks.push({
      type: 'resourceBlock',
      text: '',
      spans: [],
      resourceId,
      figure: { attrs, attrSources, labels, ...(Object.keys(words).length > 0 ? { words } : {}) },
      ...(slot ? { slot } : {}),
      sourceStart: lineOffsets[start]!,
      sourceEnd: closed ? lineEndOffset(k) : lineEndOffset(last),
      sourceMap: [],
    });
    if (!closed) {
      issues.push({
        kind: 'unclosedContainer',
        delimiter: ':::',
        containerName: 'figure',
        containerId: parse.nextContainerId++,
        sourceStart: lineOffsets[start]!,
        sourceEnd: lineEndOffset(start),
      });
    }
    return closed ? k + 1 : last + 1;
  };

  /** The `::alt[…]`, `::caption[…]` or `::note[…]` on line `k` (#935): the
   *  text between the brackets, as written, or undefined when the line is
   *  not one (text after the bracket, an unclosed bracket). */
  const parseFigureWord = (k: number): { kind: FigureWordKind; word: FigureWord } | undefined => {
    const raw = rawLines[k]!;
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trimEnd();
    const kind = FIGURE_WORD_LINE_RE.exec(body.slice(lead))![1] as FigureWordKind;
    const open = lead + `::${kind}[`.length;
    const close = closingBracket(body, open);
    if (close < 0 || body.slice(close + 1).trim() !== '') return undefined;
    const lineStart = lineOffsets[k]!;
    return { kind, word: { text: body.slice(open, close), sourceStart: lineStart + open, sourceEnd: lineStart + close } };
  };

  /** The `::label[TEXT]{at=… style=…}` on line `k` (#854), or undefined
   *  when the line is not one (text after the attributes, an unclosed
   *  bracket). */
  const parseLabel = (k: number): FigureLabel | undefined => {
    const raw = rawLines[k]!;
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trimEnd();
    const open = lead + '::label['.length;
    const close = closingBracket(body, open);
    if (close < 0) return undefined;
    const rest = body.slice(close + 1);
    const attrsMatch = /^(?:\s*\{([^}]*)\})?\s*$/.exec(rest);
    if (!attrsMatch) return undefined;
    const lineStart = lineOffsets[k]!;
    const blob = attrsMatch[1] ?? '';
    const blobStart = lineStart + close + 1 + rest.indexOf('{') + 1;
    const attrs = parseDirectiveAttrs(blob);
    const attrSources = blob ? attrSourcesOf(blob, blobStart) : {};
    const textStart = lineStart + open;
    const textEnd = lineStart + close;
    const run = inlineRun(raw.slice(open, close), textStart, textEnd, false, true, true);
    return {
      text: run.text,
      spans: run.spans,
      sourceMap: run.sourceMap,
      ...labelAtStyle(attrs),
      textStart,
      textEnd,
      attrSources,
      sourceStart: lineStart + lead,
      sourceEnd: lineStart + body.length,
    };
  };

  /** Where a label stands and its style, from its attributes. */
  const labelAtStyle = (attrs: DirectiveAttrs): Pick<FigureLabel, 'at' | 'style' | 'leader'> => {
    const atRaw = attrs.at ?? '';
    const pct = LABEL_AT_PERCENT_RE.exec(atRaw);
    const at = pct ? { x: Number(pct[1]) / 100, y: Number(pct[2]) / 100 } : { anchor: atRaw.trim() };
    const style = attrs.style?.trim();
    // `leader` (#1057): a bare flag or any value turns the label's leader
    // on, `none` (or `false`, `off`) off.
    const leaderRaw = attrs.leader;
    const leader = leaderRaw === undefined ? undefined : !['none', 'false', 'off'].includes(leaderRaw.trim().toLowerCase());
    return { at, ...(style ? { style } : {}), ...(leader !== undefined ? { leader } : {}) };
  };

  /**
   * The `:::label{at=… style=…}` whose fence is line `k` (#1058), up to the
   * first `:::` after it: a label whose lines are kept as written, one line
   * of the label per non-blank source line (a map's key, a name over two
   * lines). A backslash or two spaces ending a line (Markdown's hard break)
   * say the same and are dropped; `\\` still breaks inside a line. Each
   * line is read as a one-line label's text is; the break between two is
   * one `BREAK_PLACEHOLDER`, at the end of the earlier line in the source.
   * Undefined when no `:::` closes it or it holds no text.
   */
  const parseLabelContainer = (k: number): { label: FigureLabel; close: number } | undefined => {
    let close = k + 1;
    while (close < rawLines.length && !CONTAINER_CLOSE_RE.test(rawLines[close]!.trim())) close++;
    if (close >= rawLines.length) return undefined;
    const fence = rawLines[k]!;
    const blob = LABEL_CONTAINER_RE.exec(fence.trim())![1] ?? '';
    const blobStart = lineOffsets[k]! + fence.indexOf('{') + 1;
    const attrs = parseDirectiveAttrs(blob);
    const attrSources = blob ? attrSourcesOf(blob, blobStart) : {};
    let text = '';
    const spans: ContentBlock['spans'] = [];
    const sourceMap: number[] = [];
    let textStart = -1;
    let textEnd = -1;
    for (let j = k + 1; j < close; j++) {
      const raw = rawLines[j]!;
      const lead = raw.length - raw.trimStart().length;
      // A hard break's mark ends the line: dropped, the line is kept.
      let body = raw.trimEnd();
      if (body.endsWith('\\') && !body.endsWith('\\\\')) body = body.slice(0, -1).trimEnd();
      if (body.length <= lead) continue;
      const start = lineOffsets[j]! + lead;
      const run = inlineRun(body.slice(lead), start, start + body.length - lead, false, true, true);
      if (run.text.trim() === '') continue;
      if (textStart >= 0) {
        text += BREAK_PLACEHOLDER;
        spans.push({ text: BREAK_PLACEHOLDER, bold: false, italic: false });
        sourceMap.push(textEnd);
      } else textStart = start;
      text += run.text;
      spans.push(...run.spans);
      sourceMap.push(...run.sourceMap);
      textEnd = start + body.length - lead;
    }
    if (textStart < 0) return undefined;
    return {
      label: {
        text,
        spans,
        sourceMap,
        ...labelAtStyle(attrs),
        textStart,
        textEnd,
        attrSources,
        sourceStart: lineOffsets[k]! + (fence.length - fence.trimStart().length),
        sourceEnd: lineEndOffset(close),
      },
      close,
    };
  };

  /** Index of the last source line of the latest display formula that
   *  interrupted a paragraph: a paragraph that starts on the next line
   *  continues the one the formula interrupted (see
   *  `ContentBlock.continuesParagraph`). A display set off from the text
   *  above it by a blank line (or following a list, a quotation, a heading)
   *  interrupts nothing, and the text under it is a new paragraph, as it
   *  was up to postext 1.4. */
  parse.lastDisplayEnd = -2;
  /** Index of the display line that ended the latest paragraph run. */
  parse.interruptingDisplayAt = -1;
  /** Whether a `$$` fence line at index `k` has a closing fence after it
   *  before the next blank line, so it can open a display inside a
   *  paragraph (a stray `$$` stays text, as it was up to postext 1.4). */
  const hasClosingFence = (k: number): boolean => {
    for (let j = k + 1; j < rawLines.length; j++) {
      const l = rawLines[j]!;
      if (l.trim() === '') return false;
      if (BLOCK_MATH_FENCE_RE.test(l)) return true;
    }
    return false;
  };
  /** Whether the display starting at line `k` belongs to a paragraph: it
   *  ended a paragraph run, or it follows such a display directly. */
  const displayInterrupts = (k: number): boolean => k === parse.interruptingDisplayAt || k === parse.lastDisplayEnd + 1;

  /** Marker columns of the list items open at the latest list item,
   *  outermost first (see `listNesting.ts`). A list continues across blank
   *  lines (the pipeline numbers adjacent items as one list); any other
   *  block closes it. */
  parse.openListItems = [];
  return {
    popContainer, oneLineDirectiveBefore, openPageAt, scopeSlot, openModule, isPageFenceLine,
    parseFigure, hasClosingFence, displayInterrupts
  };
}
