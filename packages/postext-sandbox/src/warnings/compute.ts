import type {
  PostextConfig,
  VDTBlock,
  VDTDocument,
  VDTLine,
  ResolvedDebugConfig,
  ContentBlock,
  ParseIssue,
  Resource,
  ResourceType,
  ResolvedDesignSlot,
  DesignContextKind,
} from 'postext';
import {
  spaceDirectiveLines,
  parseMarkdownWithIssues,
  collectContentWarnings,
  resolveDebugConfig,
  resolveHeaderFooterConfig,
  resolveHeadingsConfig,
  resolveDesignSlot,
  collectPlaceholderNames,
  isAllowedPlaceholder,
  isMetadataPlaceholder,
  extractFrontmatter,
  metadataText,
  collectConfigWarnings,
  collectHeadingDesignCuts,
  parseNumberFormat,
  isUnhyphenatedLanguage,
  matchHyphenationLocale,
  findLooseLines,
} from 'postext';
import {
  getConfigFontSpecs,
  getConfigFontFamilies,
  getCustomFontFamily,
  missingUsedVariants,
  hasLatinEmphasis,
  isKnownUnavailableGoogleFont,
  isRemovedCustomFontFamily,
} from '../controls/fontLoader';
import type { Warning, WarningPayload } from './types';
import type { PdfFontCheck } from '../controls/pdfFontWarnings';
import type { ComposedBook } from '../book/types';
import { fromBookLine, fromBookOffset } from '../book/compose';
import { frontmatterRange } from '../book/frontmatter';

function lineNumberForOffset(markdown: string, offset: number): number {
  if (offset <= 0) return 1;
  let line = 1;
  const n = Math.min(offset, markdown.length);
  for (let i = 0; i < n; i++) {
    if (markdown.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Detect fonts referenced by the resolved config that the browser has not
 * successfully registered with `document.fonts.check`. Returns unique family
 * names. Safe to call server-side — returns [] when `document.fonts` is
 * unavailable.
 */
function detectMissingFonts(config: PostextConfig): string[] {
  if (typeof document === 'undefined' || !document.fonts) return [];
  const specs = getConfigFontSpecs(config);
  const missingSpecs = specs.filter((s) => !document.fonts.check(s));
  if (missingSpecs.length === 0) return [];
  const families = getConfigFontFamilies(config);
  const missing = families.filter((family) =>
    missingSpecs.some((spec) => spec.includes(`"${family}"`)),
  );
  return [...new Set(missing)];
}

function collectLooseLineWarnings(
  doc: VDTDocument,
  debug: ResolvedDebugConfig,
  markdown: string,
): Warning[] {
  const threshold = debug.looseLineHighlight.threshold;
  const out: Warning[] = [];
  let idx = 0;
  for (const { block, line, ratio } of findLooseLines(doc, { threshold })) {
    // A CJK line set short at its tracking cap has a warning of its own
    // (`cjkLooseLine`, from the layout).
    if (line.cjkLoose) continue;
    const sourceStart = line.sourceStart ?? block.sourceStart;
    const sourceEnd = line.sourceEnd ?? block.sourceEnd;
    out.push({
      id: `loose-${idx++}-${sourceStart ?? 'x'}`,
      payload: { kind: 'looseLine', ratio, threshold },
      sourceStart,
      sourceEnd,
      line: sourceStart !== undefined ? lineNumberForOffset(markdown, sourceStart) : undefined,
    });
  }
  return out;
}

/** Warnings the layout itself raised (`doc.warnings`): a box the engine
 *  had to place overflowing its column because no column could hold it.
 *  The content warnings the build lists in `doc.contentWarnings` (unknown
 *  ids, styles and directives) are read from the source by
 *  {@link collectEngineContentWarnings} — before the layout exists, too. */
function collectLayoutWarnings(doc: VDTDocument, markdown: string): Warning[] {
  const out: Warning[] = [];
  // What `:::index` raised: cross-references and ranges are only known
  // once the whole book's marks reach the index chapter.
  (doc.contentWarnings ?? []).forEach((w, i) => {
    // …the justified CJK lines set short at their tracking cap, the
    // paragraphs whose leading is too tight for their Chinese marks, ruby
    // readings, kanbun marks or Arabic vowel marks, the Arabic-script words
    // wider than their line and the styles whose letter-spacing such words
    // do not take.
    if (w.kind !== 'indexSeeUnknown' && w.kind !== 'indexRangeUnclosed' && w.kind !== 'indexReadingMissing' && w.kind !== 'cjkLooseLine'
      && w.kind !== 'cjkMarksExceedLeading' && w.kind !== 'rubyExceedsLeading' && w.kind !== 'kuntenExceedsLeading' && w.kind !== 'arabicMarksExceedLeading'
      && w.kind !== 'unbreakableWordOverflow' && w.kind !== 'joiningScriptLetterSpacing') return;
    const payload: Record<string, unknown> = { ...w };
    delete payload.sourceStart;
    delete payload.sourceEnd;
    delete payload.pageIndex;
    out.push({
      id: `index-${w.kind}-${i}`,
      payload: payload as unknown as WarningPayload,
      sourceStart: w.sourceStart,
      sourceEnd: w.sourceEnd,
      line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
    });
  });
  const pxPerMm = doc.config.page.dpi / 25.4;
  let idx = 0;
  for (const w of doc.warnings ?? []) {
    if (w.kind !== 'calloutOverflow') continue;
    out.push({
      id: `layout-${idx++}-${w.sourceStart ?? 'x'}`,
      payload: { kind: 'calloutOverflow', page: w.pageIndex + 1 + (doc.pageIndexOffset ?? 0), overflowMm: w.overflowPx / pxPerMm },
      sourceStart: w.sourceStart,
      sourceEnd: w.sourceEnd,
      line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
    });
  }
  return out;
}

/** Heading designs taller than their page can hold (EF-91), as the engine
 *  finds them (`collectHeadingDesignCuts`): text of the design laid out
 *  past the foot of the page (an opener, painted across the page) or past
 *  the foot of the heading's column (an in-column design, which canvas and
 *  PDF clip to its column). The heading then claims the rest of its page or
 *  column, so nothing runs under it, but that part of the design is lost —
 *  a long lead on a small screen page. */
function collectHeadingDesignCutWarnings(doc: VDTDocument, markdown: string): Warning[] {
  const pxPerMm = doc.config.page.dpi / 25.4;
  return collectHeadingDesignCuts(doc).map((cut, idx) => ({
    id: `heading-design-cut-${idx}-${cut.sourceStart ?? 'x'}`,
    payload: { kind: 'headingDesignCut', level: cut.level, page: cut.pageIndex + 1 + (doc.pageIndexOffset ?? 0), overflowMm: cut.overflowPx / pxPerMm },
    sourceStart: cut.sourceStart,
    sourceEnd: cut.sourceEnd,
    line: cut.sourceStart !== undefined ? lineNumberForOffset(markdown, cut.sourceStart) : undefined,
  }));
}

function collectHeadingHierarchyWarnings(blocks: ContentBlock[], markdown: string): Warning[] {
  const out: Warning[] = [];
  let prev: number | null = null;
  let idx = 0;
  for (const b of blocks) {
    if (b.type !== 'heading' || !b.level) continue;
    if (prev !== null && b.level > prev + 1) {
      out.push({
        id: `h-hier-${idx++}-${b.sourceStart}`,
        payload: { kind: 'headingHierarchy', from: prev, to: b.level },
        sourceStart: b.sourceStart,
        sourceEnd: b.sourceEnd,
        line: lineNumberForOffset(markdown, b.sourceStart),
      });
    }
    prev = b.level;
  }
  return out;
}

function collectConsecutiveHeadingsWarnings(blocks: ContentBlock[], markdown: string): Warning[] {
  const out: Warning[] = [];
  let idx = 0;
  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1]!;
    const curr = blocks[i]!;
    if (prev.type === 'heading' && curr.type === 'heading') {
      out.push({
        id: `h-consec-${idx++}-${curr.sourceStart}`,
        payload: { kind: 'consecutiveHeadings' },
        sourceStart: curr.sourceStart,
        sourceEnd: curr.sourceEnd,
        line: lineNumberForOffset(markdown, curr.sourceStart),
      });
    }
  }
  return out;
}

/** Attribute validation on parsed directive blocks. Unknown `:::name` lines
 *  are the engine's `unknownDirective` (see {@link collectEngineContentWarnings}). */
function collectDirectiveWarnings(
  markdown: string,
  blocks: ContentBlock[],
): Warning[] {
  const out: Warning[] = [];
  let idx = 0;

  for (const b of blocks) {
    if (b.type !== 'directive' || !b.directiveAttrs) continue;
    const attrs = b.directiveAttrs;
    if (b.directiveName === 'numbering') {
      // Any spelling the engine reads (`roman-lower`, `arabic`, `i`…) is fine.
      if (attrs.format !== undefined && parseNumberFormat(attrs.format) === undefined) {
        out.push({
          id: `numbering-format-${idx++}-${b.sourceStart}`,
          payload: { kind: 'numberingInvalidFormat', value: attrs.format },
          sourceStart: b.sourceStart,
          sourceEnd: b.sourceEnd,
          line: lineNumberForOffset(markdown, b.sourceStart),
        });
      }
      if (attrs.startAt !== undefined) {
        const n = Number(attrs.startAt);
        if (!Number.isInteger(n) || n < 1) {
          out.push({
            id: `numbering-startat-${idx++}-${b.sourceStart}`,
            payload: { kind: 'numberingInvalidStartAt', value: attrs.startAt },
            sourceStart: b.sourceStart,
            sourceEnd: b.sourceEnd,
            line: lineNumberForOffset(markdown, b.sourceStart),
          });
        }
      }
    } else if (b.directiveName === 'pagebreak') {
      if (
        attrs.parity !== undefined
        && attrs.parity !== 'odd'
        && attrs.parity !== 'even'
        && attrs.parity !== 'always-odd'
        && attrs.parity !== 'always-even'
      ) {
        out.push({
          id: `pagebreak-parity-${idx++}-${b.sourceStart}`,
          payload: { kind: 'pagebreakInvalidParity', value: attrs.parity },
          sourceStart: b.sourceStart,
          sourceEnd: b.sourceEnd,
          line: lineNumberForOffset(markdown, b.sourceStart),
        });
      }
    } else if (b.directiveName === 'space') {
      if (spaceDirectiveLines(attrs) === undefined) {
        out.push({
          id: `space-lines-${idx++}-${b.sourceStart}`,
          payload: { kind: 'spaceInvalidLines', value: attrs.lines ?? '' },
          sourceStart: b.sourceStart,
          sourceEnd: b.sourceEnd,
          line: lineNumberForOffset(markdown, b.sourceStart),
        });
      }
    }
  }
  return out;
}

/** Fenced containers still open at the end of the document (from the
 *  parser's issue list), pointing at the opening line. Unknown paragraph and
 *  callout style ids are the engine's (see {@link collectEngineContentWarnings}). */
function collectContainerWarnings(markdown: string, issues: ParseIssue[]): Warning[] {
  const out: Warning[] = [];
  let idx = 0;
  for (const issue of issues) {
    if (issue.kind !== 'unclosedContainer') continue;
    out.push({
      id: `container-unclosed-${idx++}-${issue.sourceStart}`,
      payload: { kind: 'unclosedContainer', name: issue.containerName },
      sourceStart: issue.sourceStart,
      sourceEnd: issue.sourceEnd,
      line: lineNumberForOffset(markdown, issue.sourceStart),
    });
  }
  return out;
}

/** A chip's box on the page, as the renderers draw it. */
interface ChipBox {
  styleId: string;
  line: VDTLine;
  block: VDTBlock;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The chips of one line where the renderers draw them: the segments laid
 *  end to end from the line's start, with the word spaces of a justified
 *  line widened (and a centred or right-aligned line shifted) the way the
 *  canvas, HTML and PDF backends set them. */
function chipBoxesOf(block: VDTBlock, line: VDTLine): ChipBox[] {
  const segments = line.segments ?? [];
  if (!segments.some((s) => s.chip)) return [];
  const effectiveWidth = block.bbox.width - (line.bbox.x - block.bbox.x);
  let natural = 0;
  let words = 0;
  let spaces = 0;
  for (const seg of segments) {
    natural += seg.width;
    if (seg.kind === 'space') spaces++;
    else words += seg.width;
  }
  let x = line.bbox.x;
  let spaceWidth: number | undefined;
  if (block.textAlign === 'justify' && spaces > 0 && ((!line.isLastLine && !line.ragged) || natural > effectiveWidth)) {
    spaceWidth = (effectiveWidth - words) / spaces;
  } else if (block.textAlign === 'center' || block.textAlign === 'right') {
    const slack = Math.max(0, effectiveWidth - natural);
    x += block.textAlign === 'center' ? slack / 2 : slack;
  }
  const out: ChipBox[] = [];
  for (const seg of segments) {
    if (seg.chip) {
      const left = x + seg.chip.marginLeft;
      out.push({
        styleId: seg.chip.styleId,
        line,
        block,
        left,
        right: left + seg.chip.boxWidth,
        top: line.baseline - seg.chip.ascent,
        bottom: line.baseline + seg.chip.descent,
      });
    }
    x += seg.kind === 'space' && spaceWidth !== undefined ? spaceWidth : seg.width;
  }
  return out;
}

/** Chips whose boxes run into a chip on another line: the vertical padding
 *  paints outside the line box by design, so a chip taller than the line
 *  pitch is fine until a chip on the line above or below stands in its
 *  way (EF-118). One warning per style, at its first such chip, with the
 *  largest overlap. Unknown chip styles are the engine's (see {@link
 *  collectEngineContentWarnings}). */
function collectChipOverlapWarnings(markdown: string, doc: VDTDocument | null): Warning[] {
  const out: Warning[] = [];
  if (!doc) return out;
  const ptPerPx = 72 / doc.config.page.dpi;
  const found = new Map<string, { box: ChipBox; overlapPx: number }>();
  const note = (box: ChipBox, overlapPx: number): void => {
    const seen = found.get(box.styleId);
    if (!seen) found.set(box.styleId, { box, overlapPx });
    else if (overlapPx > seen.overlapPx) seen.overlapPx = overlapPx;
  };
  for (const page of doc.pages) {
    const blocks = [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? []), ...(page.marginNotes ?? [])];
    const boxes = blocks.flatMap((block) => (block.hidden ? [] : block.lines.flatMap((line) => chipBoxesOf(block, line))));
    boxes.sort((a, b) => a.top - b.top);
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i]!;
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j]!;
        if (b.top >= a.bottom - 0.01) break;
        if (a.line === b.line) continue;
        const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        if (across <= 0.01) continue;
        const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlap <= 0.01) continue;
        note(a, overlap);
        note(b, overlap);
      }
    }
  }
  for (const [styleId, { box, overlapPx }] of found) {
    const src = box.line.sourceStart ?? box.block.sourceStart;
    out.push({
      id: `chip-overlap-${styleId}`,
      payload: { kind: 'chipOverlap', style: styleId, overlapPt: overlapPx * ptPerPx },
      sourceStart: src,
      sourceEnd: box.line.sourceEnd ?? box.block.sourceEnd,
      line: src !== undefined ? lineNumberForOffset(markdown, src) : undefined,
    });
  }
  return out;
}

function detectAnchorIssues(
  elements: Array<{ id: string; placement: { anchor: { to: string } } }>,
): { cyclic: string[]; dangling: Array<{ id: string; target: string }> } {
  const ids = new Set(elements.map((e) => e.id));
  const edges = new Map<string, string | null>();
  const dangling: Array<{ id: string; target: string }> = [];
  for (const el of elements) {
    const to = el.placement.anchor.to;
    if (to === 'container') {
      edges.set(el.id, null);
    } else if (to.startsWith('#')) {
      const tgt = to.slice(1);
      if (!ids.has(tgt)) {
        dangling.push({ id: el.id, target: tgt });
        edges.set(el.id, null);
      } else {
        edges.set(el.id, tgt);
      }
    } else {
      edges.set(el.id, null);
    }
  }
  const cyclic = new Set<string>();
  for (const start of ids) {
    const visited = new Set<string>();
    let cur: string | undefined = start;
    while (cur) {
      if (visited.has(cur)) {
        cyclic.add(start);
        break;
      }
      visited.add(cur);
      const nxt = edges.get(cur);
      cur = nxt ?? undefined;
    }
  }
  return { cyclic: [...cyclic], dangling };
}

function collectDesignWarnings(config: PostextConfig): Warning[] {
  const out: Warning[] = [];
  const headings = resolveHeadingsConfig(config.headings);

  // Header/footer anchor integrity
  for (const slot of ['header', 'footer'] as const) {
    const resolved = resolveHeaderFooterConfig(config[slot], slot);
    const { cyclic, dangling } = detectAnchorIssues(resolved.elements);
    for (const id of cyclic) {
      out.push({
        id: `design-cyclic-${slot}-${id}`,
        payload: { kind: 'designCyclicAnchor', slot, elementId: id },
      });
    }
    for (const d of dangling) {
      out.push({
        id: `design-dangling-${slot}-${d.id}-${d.target}`,
        payload: { kind: 'designDanglingAnchor', slot, elementId: d.id, referencedId: d.target },
      });
    }
  }

  // Part opener anchor integrity
  {
    const part = resolveDesignSlot(config.parts?.design, 'header');
    const { cyclic, dangling } = detectAnchorIssues(part.elements);
    for (const id of cyclic) {
      out.push({
        id: `design-cyclic-part-${id}`,
        payload: { kind: 'designCyclicAnchor', slot: 'part', elementId: id },
      });
    }
    for (const d of dangling) {
      out.push({
        id: `design-dangling-part-${d.id}-${d.target}`,
        payload: { kind: 'designDanglingAnchor', slot: 'part', elementId: d.id, referencedId: d.target },
      });
    }
  }

  // Heading-level warnings
  for (const lvl of headings.levels) {
    if (lvl.span === 'page' && !lvl.breakBefore.enabled) {
      out.push({
        id: `h-span-without-break-${lvl.level}`,
        payload: { kind: 'headingSpanWithoutBreak', level: lvl.level },
      });
    }
    if (lvl.advancedDesign.enabled) {
      const slot = lvl.advancedDesign.slot;
      const { cyclic, dangling } = detectAnchorIssues(slot.elements);
      for (const id of cyclic) {
        out.push({
          id: `design-cyclic-h${lvl.level}-${id}`,
          payload: { kind: 'designCyclicAnchor', slot: 'heading', level: lvl.level, elementId: id },
        });
      }
      for (const d of dangling) {
        out.push({
          id: `design-dangling-h${lvl.level}-${d.id}-${d.target}`,
          payload: {
            kind: 'designDanglingAnchor',
            slot: 'heading',
            level: lvl.level,
            elementId: d.id,
            referencedId: d.target,
          },
        });
      }
      const hasTitleText = slot.elements.some(
        (e) => e.kind === 'text' && e.content.includes('{titleText}'),
      );
      if (!hasTitleText) {
        out.push({
          id: `h-advanced-no-title-${lvl.level}`,
          payload: { kind: 'headingAdvancedWithoutTitleText', level: lvl.level },
        });
      }
    }
  }

  // The part's verso and the contents' part rows.
  for (const s of partRowSlots(config)) {
    const { cyclic, dangling } = detectAnchorIssues(s.elements);
    for (const id of cyclic) {
      out.push({
        id: `design-cyclic-${s.tag}-${id}`,
        payload: { kind: 'designCyclicAnchor', slot: 'part', configPath: s.configPath, elementId: id },
      });
    }
    for (const d of dangling) {
      out.push({
        id: `design-dangling-${s.tag}-${d.id}-${d.target}`,
        payload: { kind: 'designDanglingAnchor', slot: 'part', configPath: s.configPath, elementId: d.id, referencedId: d.target },
      });
    }
  }

  // Heading styles: their designs and their sections' running heads (EF-134).
  for (const s of headingStyleSlots(config)) {
    const { cyclic, dangling } = detectAnchorIssues(s.elements);
    const tag = `style-${s.styleId}-${s.slot}`;
    for (const id of cyclic) {
      out.push({
        id: `design-cyclic-${tag}-${id}`,
        payload: { kind: 'designCyclicAnchor', slot: s.slot, styleId: s.styleId, elementId: id },
      });
    }
    for (const d of dangling) {
      out.push({
        id: `design-dangling-${tag}-${d.id}-${d.target}`,
        payload: { kind: 'designDanglingAnchor', slot: s.slot, styleId: s.styleId, elementId: d.id, referencedId: d.target },
      });
    }
  }

  return out;
}

/** The design slots laid out with a part's placeholders besides the part
 *  opener (`parts.design`): the blank verso after a part page and the part
 *  rows of the contents. Only those that are set: an empty slot draws
 *  nothing (the verso) or the engine's own default row. */
function partRowSlots(config: PostextConfig): Array<{
  configPath: 'parts.versoDesign' | 'toc.parts.design';
  tag: string;
  elements: ResolvedDesignSlot['elements'];
}> {
  const out: ReturnType<typeof partRowSlots> = [];
  if (config.parts?.versoDesign) {
    out.push({ configPath: 'parts.versoDesign', tag: 'part-verso', elements: resolveDesignSlot(config.parts.versoDesign, 'header').elements });
  }
  if (config.toc?.parts?.design) {
    out.push({ configPath: 'toc.parts.design', tag: 'toc-part', elements: resolveDesignSlot(config.toc.parts.design, 'header').elements });
  }
  return out;
}

/** The design slots of the heading styles, as the engine resolves them: a
 *  style's design when it is switched on (drawn like a heading level's),
 *  and the running heads of the section the style opens. */
function headingStyleSlots(config: PostextConfig): Array<{
  styleId: string;
  slot: 'heading' | 'header' | 'footer';
  elements: ResolvedDesignSlot['elements'];
}> {
  const out: ReturnType<typeof headingStyleSlots> = [];
  for (const style of config.headingStyles ?? []) {
    if (!style || typeof style.id !== 'string') continue;
    if (style.advancedDesign?.enabled) {
      out.push({ styleId: style.id, slot: 'heading', elements: resolveDesignSlot(style.advancedDesign.slot, 'header').elements });
    }
    if (style.header) out.push({ styleId: style.id, slot: 'header', elements: resolveDesignSlot(style.header, 'header').elements });
    if (style.footer) out.push({ styleId: style.id, slot: 'footer', elements: resolveDesignSlot(style.footer, 'footer').elements });
  }
  return out;
}

function collectHeadingBreakParityWarnings(config: PostextConfig): Warning[] {
  const out: Warning[] = [];
  const headings = resolveHeadingsConfig(config.headings);
  for (const lvl of headings.levels) {
    const parity = lvl.breakBefore.parity;
    if (parity !== 'any' && parity !== 'odd' && parity !== 'even' && parity !== 'always-odd' && parity !== 'always-even') {
      out.push({
        id: `h-break-parity-${lvl.level}`,
        payload: { kind: 'headingBreakInvalidParity', level: lvl.level, value: String(parity) },
      });
    }
  }
  return out;
}

/** Config values the engine replaces (see `collectConfigWarnings`): a CSS
 *  font stack in a font-family field, an unknown numbering format, a
 *  one-and-a-half layout's side column that leaves a column with no width,
 *  a heading setting the engine does not know. */
function collectConfigValueWarnings(config: PostextConfig): Warning[] {
  return collectConfigWarnings(config).map((w) => ({
    id: `config-${w.kind}-${w.path}`,
    payload: { kind: w.kind, path: w.path, value: w.value, used: w.used, ...(w.suggestion ? { suggestion: w.suggestion } : {}) },
  }));
}

function collectParityCascadeWarnings(doc: VDTDocument | null): Warning[] {
  if (!doc) return [];
  const out: Warning[] = [];
  let run = 0;
  let runStartIndex = -1;
  let idx = 0;
  for (let i = 0; i < doc.pages.length; i++) {
    if (doc.pages[i]!.blankForParity) {
      if (run === 0) runStartIndex = i;
      run++;
    } else {
      if (run > 2) {
        out.push({
          id: `parity-cascade-${idx++}-${runStartIndex}`,
          payload: { kind: 'parityCascade', runLength: run },
        });
      }
      run = 0;
    }
  }
  if (run > 2) {
    out.push({
      id: `parity-cascade-${idx++}-${runStartIndex}`,
      payload: { kind: 'parityCascade', runLength: run },
    });
  }
  return out;
}

function collectAlphaOverflowWarnings(doc: VDTDocument | null): Warning[] {
  if (!doc) return [];
  const hasOverflow = doc.pages.some(
    (p) =>
      (p.pageNumberFormat === 'upper-alpha' || p.pageNumberFormat === 'lower-alpha')
      && p.pageNumberValue > 26,
  );
  return hasOverflow
    ? [{ id: 'alpha-pdf-overflow', payload: { kind: 'alphaPdfOverflow' } }]
    : [];
}

function collectListAfterHeadingWarnings(blocks: ContentBlock[], markdown: string): Warning[] {
  const out: Warning[] = [];
  let idx = 0;
  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1]!;
    const curr = blocks[i]!;
    if (prev.type === 'heading' && curr.type === 'listItem') {
      out.push({
        id: `list-after-h-${idx++}-${curr.sourceStart}`,
        payload: { kind: 'listAfterHeading' },
        sourceStart: curr.sourceStart,
        sourceEnd: curr.sourceEnd,
        line: lineNumberForOffset(markdown, curr.sourceStart),
      });
    }
  }
  return out;
}

/** Bitmaps rendered wider than this multiple of their natural pixel width are
 *  flagged as upscaled (blurry). Mirrors issue #49 §8. */
const BITMAP_UPSCALE_THRESHOLD = 1.5;

/** The source range of every resource's first embed or inline `:ref`, in
 *  reading order: what a resource-level warning points at. */
function firstResourceUses(blocks: ContentBlock[], markdown: string): Map<string, { start: number; end: number }> {
  const uses = new Map<string, { start: number; end: number }>();
  for (const b of blocks) {
    if (b.type === 'resourceBlock' && b.resourceId !== undefined && !uses.has(b.resourceId)) {
      uses.set(b.resourceId, { start: b.sourceStart, end: b.sourceEnd });
    }
    let plain = 0;
    for (const span of b.spans) {
      const id = span.ref?.resourceId;
      if (id !== undefined && !uses.has(id)) {
        const start = b.sourceMap[plain] ?? b.sourceStart;
        const close = markdown.indexOf('}', start);
        uses.set(id, { start, end: close >= 0 && close < b.sourceEnd ? close + 1 : b.sourceEnd });
      }
      plain += span.text.length;
    }
  }
  return uses;
}

/** The payload a bitmap / SVG resource paints from. */
function imageFileId(r: Resource): string | undefined {
  if (r.kind === 'bitmap') return r.bitmap?.fileId;
  if (r.kind === 'svg') return r.svg?.fileId;
  if (r.kind === 'video') return r.video?.poster?.fileId;
  return undefined;
}

/**
 * The resource ids of the pictures the configuration itself draws: every
 * design element of `kind: 'image'` — in the header and footer, a heading
 * level's or heading style's design, a part's design or verso design, the
 * contents' part rows —, every callout icon of `kind: 'resource'` and every
 * callout label-tab icon. Walked generically, like the font collector, so a
 * new design slot is covered without a change here. A subtree switched off
 * (`enabled: false`) draws nothing and is skipped. An image id with
 * `{attr.<key>}` placeholders stands for every id the `blocks`' attributes
 * fill it with.
 */
export function configImageResourceIds(config: PostextConfig, blocks: readonly ContentBlock[] = []): Set<string> {
  const ids = new Set<string>();
  // A templated id (`'{attr.art}'`, `'map-{attr.n}'`) names the pictures
  // the document's headings and parts give it: one id per attribute value.
  const ATTR = /\{attr\.([A-Za-z_][A-Za-z0-9_-]*)\}/g;
  const addTemplated = (template: string): void => {
    const keys = [...template.matchAll(ATTR)].map((m) => m[1]!);
    for (const b of blocks) {
      const attrs = b.attrs;
      if (!attrs || !keys.some((k) => attrs[k] !== undefined)) continue;
      const id = template.replace(ATTR, (_, k: string) => attrs[k] ?? '').trim();
      if (id && !id.includes('{')) ids.add(id);
    }
  };
  const visit = (node: unknown, key: string, parentKey: string): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, key, parentKey);
      return;
    }
    const rec = node as Record<string, unknown>;
    if (rec.enabled === false) return;
    const id = rec.resourceId;
    if (typeof id === 'string' && id.length > 0) {
      // A design image element, a callout icon set to a resource, or a
      // label tab's icon (which has no kind).
      if (rec.kind === 'image' && id.includes('{')) addTemplated(id);
      else if (rec.kind === 'image' || rec.kind === 'resource' || (rec.kind === undefined && key === 'icon' && parentKey === 'label')) {
        ids.add(id);
      }
    }
    for (const [k, value] of Object.entries(rec)) {
      if (value && typeof value === 'object') visit(value, k, key);
    }
  };
  visit(config, '', '');
  return ids;
}

/**
 * Resource integrity warnings (issue #49 §8):
 *   - duplicateResourceId: two or more resources sharing the same id.
 *   - danglingTypeRef: a resource whose `typeId` is not a known `ResourceType`.
 *   - bitmapTooSmall: a bitmap rendered larger than 1.5× its natural width.
 *   - missingImage: an image the document uses (embedded, referenced, in a
 *     used table's cells, or drawn by the configuration: see
 *     {@link configImageResourceIds}) whose payload the previews could not
 *     read (`unavailableImages`), so it paints as a placeholder.
 * Unknown ids, table style ids and ragged grids are the engine's (see
 * {@link collectEngineContentWarnings}).
 */
function collectResourceWarnings(
  blocks: ContentBlock[],
  markdown: string,
  resources: Resource[],
  resourceTypes: ResourceType[],
  doc: VDTDocument | null,
  /** Resource ids the configuration itself draws (see
   *  {@link configImageResourceIds}), which count as used even though the
   *  document never references them. */
  configUsedIds: ReadonlySet<string> = new Set(),
  /** File ids whose payload could not be read or decoded. */
  unavailableImages: ReadonlySet<string> = new Set(),
): Warning[] {
  const out: Warning[] = [];
  let idx = 0;

  // Map of id -> count to detect duplicates and existence.
  const idCounts = new Map<string, number>();
  for (const r of resources) {
    idCounts.set(r.id, (idCounts.get(r.id) ?? 0) + 1);
  }
  const knownTypeIds = new Set(resourceTypes.map((t) => t.id));

  // 1. Images the document uses with no readable payload.
  if (unavailableImages.size > 0) {
    const uses = firstResourceUses(blocks, markdown);
    const byId = new Map(resources.map((r) => [r.id, r]));
    // Cell images count where their table is used.
    const cellUses = new Map<string, { start: number; end: number }>();
    for (const [id, at] of uses) {
      for (const row of byId.get(id)?.table?.model.rows ?? []) {
        for (const cell of row) {
          const image = cell.image?.resourceId;
          if (image !== undefined && !uses.has(image) && !cellUses.has(image)) cellUses.set(image, at);
        }
      }
    }
    const reported = new Set<string>();
    for (const r of resources) {
      const fileId = imageFileId(r);
      if (fileId === undefined || !unavailableImages.has(fileId) || reported.has(r.id)) continue;
      const at = uses.get(r.id) ?? cellUses.get(r.id);
      if (!at && !configUsedIds.has(r.id)) continue;
      reported.add(r.id);
      out.push({
        id: `resource-missing-image-${r.id}`,
        payload: { kind: 'missingImage', resourceId: r.id, fileId },
        ...(at ? { sourceStart: at.start, sourceEnd: at.end, line: lineNumberForOffset(markdown, at.start) } : {}),
      });
    }
  }

  // 2. Per-resource integrity: duplicates and dangling type refs. A resource
  //    nobody embeds or references is not a problem: resources are shared by
  //    every chapter and are often uploaded before the text that uses them.
  //    Duplicates are reported once per colliding id.
  const reportedDuplicate = new Set<string>();
  for (const r of resources) {
    const count = idCounts.get(r.id) ?? 1;
    if (count > 1 && !reportedDuplicate.has(r.id)) {
      reportedDuplicate.add(r.id);
      out.push({
        id: `resource-duplicate-${r.id}`,
        payload: { kind: 'duplicateResourceId', resourceId: r.id, count },
      });
    }
    if (!knownTypeIds.has(r.typeId)) {
      out.push({
        id: `resource-dangling-type-${idx++}-${r.id}`,
        payload: { kind: 'danglingTypeRef', resourceId: r.id, typeId: r.typeId },
      });
    }
  }

  // 3. bitmapTooSmall: compare rendered body width against the bitmap's
  //    natural pixel width from the measured VDT.
  if (doc) {
    const seen = new Set<string>();
    for (const block of doc.blocks) {
      const rb = block.resourceBlock;
      if (!rb || rb.kind !== 'bitmap') continue;
      // A picture cropped within its safe area shows only part of its
      // pixels across the body.
      const naturalWidth = rb.resource.bitmap?.width;
      if (!naturalWidth || naturalWidth <= 0) continue;
      const bitmapWidth = Math.round(naturalWidth * (rb.bodySource?.width ?? 1));
      const renderedWidth = rb.bodyRect.width;
      if (renderedWidth > bitmapWidth * BITMAP_UPSCALE_THRESHOLD) {
        const key = rb.resource.id;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: `resource-bitmap-small-${key}`,
          payload: {
            kind: 'bitmapTooSmall',
            resourceId: key,
            renderedWidth: Math.round(renderedWidth),
            bitmapWidth,
          },
        });
      }
    }
  }

  return out;
}

export function computeWarnings(params: {
  markdown: string;
  config: PostextConfig;
  doc: VDTDocument | null;
  resources?: Resource[];
  /** True when IndexedDB is unavailable, so binary resource payloads cannot
   *  be persisted or resolved. Surfaces the `storageUnavailable` warning. */
  storageUnavailable?: boolean;
  /** File ids of image payloads the previews could not read or decode
   *  (see `unavailableResourceImages`). Surfaces `missingImage`. */
  unavailableImages?: ReadonlySet<string>;
  /** The composed book `markdown` came from. When given, every located
   *  warning also carries its chapter and chapter-local line/offsets. */
  book?: ComposedBook;
  /** Chapter titles by id (for `chapterFrontmatterIgnored`). */
  chapterTitles?: ReadonlyMap<string, string>;
  /** The font warnings of the last PDF generated (see `pdfFontChecksFor`):
   *  `missingGlyph`, `variableFontDefaultInstance`, `cffEmbeddedWhole`. */
  pdfFontChecks?: readonly PdfFontCheck[];
  /** The book has changed since that PDF: its warnings are marked so. */
  pdfFontChecksStale?: boolean;
}): Warning[] {
  const { markdown, config, doc, resources = [], storageUnavailable = false, unavailableImages, book, chapterTitles, pdfFontChecks = [], pdfFontChecksStale = false } = params;
  const warnings = computeDocumentWarnings({ markdown, config, doc, resources, storageUnavailable, unavailableImages, bookMetadata: book?.metadata });
  warnings.push(...pdfFontWarnings(pdfFontChecks, pdfFontChecksStale));
  if (!book) return warnings;
  return attributeToChapters(warnings, book, chapterTitles);
}

/** The Checks-panel entries of the last PDF's font warnings, one per face
 *  and kind. They point at no place in the text. `stale`: the book has
 *  changed since that PDF, and each entry says so. */
export function pdfFontWarnings(checks: readonly PdfFontCheck[], stale = false): Warning[] {
  const out: Warning[] = [];
  const seen = new Set<string>();
  for (const check of checks) {
    const id = `pdf-${check.kind}-${check.family}-${check.weight}-${check.style}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const face = { family: check.family, weight: check.weight, style: check.style, ...(stale ? { stale: true as const } : {}) };
    const payload: WarningPayload = check.kind === 'missingGlyph'
      ? { kind: 'missingGlyph', ...face, characters: [...check.characters] }
      : check.kind === 'variableFontDefaultInstance'
        ? { kind: 'variableFontDefaultInstance', ...face, defaultWeight: check.defaultWeight }
        : { kind: 'cffEmbeddedWhole', ...face, bytes: check.bytes };
    out.push({ id, payload });
  }
  return out;
}

/** Add chapter attribution to every located warning and flag later chapters
 *  whose text starts with a front-matter block (the book ignores it). */
export function attributeToChapters(
  warnings: Warning[],
  book: ComposedBook,
  chapterTitles?: ReadonlyMap<string, string>,
): Warning[] {
  const out: Warning[] = warnings.map((w) => {
    if (w.sourceStart === undefined) return w;
    const start = fromBookOffset(book, w.sourceStart);
    const end = w.sourceEnd !== undefined ? fromBookOffset(book, w.sourceEnd) : start;
    const seg = book.segments.find((s) => s.chapterId === start.chapterId)!;
    const chapterLine = w.line !== undefined ? fromBookLine(book, w.line).line : undefined;
    return {
      ...w,
      chapterId: start.chapterId,
      chapterIndex: seg.index,
      chapterLine,
      chapterStart: start.offset,
      chapterEnd: end.chapterId === start.chapterId ? end.offset : seg.end - seg.start,
    };
  });
  if (book.scope === 'book') {
    book.segments.forEach((seg, i) => {
      if (i === 0) return;
      const text = book.markdown.slice(seg.start, seg.end);
      // The composed text has the block blanked; detect it by the first line
      // being all spaces of width 3 followed by a newline (`---` blanked).
      if (!/^ {3}\r?\n/.test(text)) return;
      const original = chapterTitles?.get(seg.chapterId) ?? String(i + 1);
      out.push({
        id: `chapter-frontmatter-${seg.chapterId}`,
        payload: { kind: 'chapterFrontmatterIgnored', chapterTitle: original },
        sourceStart: seg.start,
        sourceEnd: seg.start,
        line: seg.lineStart + 1,
        chapterId: seg.chapterId,
        chapterIndex: seg.index,
        chapterLine: 1,
        chapterStart: 0,
        chapterEnd: 0,
      });
    });
  }
  return out;
}

/** True when `markdown` begins with a front-matter block. */
export function hasFrontmatter(markdown: string): boolean {
  return frontmatterRange(markdown) !== null;
}

/**
 * The engine's content warnings (`collectContentWarnings`, what the build
 * lists in `doc.contentWarnings`): unknown resource ids, `:::name` lines,
 * paragraph, callout, chip, heading and table style ids, and ragged table
 * grids. Read from the source here — so they show before the first layout —
 * rather than from the document, so each is listed once.
 */
function collectEngineContentWarnings(markdown: string, config: PostextConfig, resources: Resource[]): Warning[] {
  let found: ReturnType<typeof collectContentWarnings>;
  try {
    found = collectContentWarnings(markdown, config, resources);
  } catch {
    return [];
  }
  // The Sandbox's layout worker loads the citation engine itself: a page
  // without it on the main thread is no reason to warn.
  return found.filter((w) => w.kind !== 'citationsUnavailable').map((w, idx) => {
    const { sourceStart, sourceEnd } = w;
    // The payload is the warning without its location (no page: the
    // source may not have been laid out yet).
    const payload: Record<string, unknown> = { ...w };
    delete payload.sourceStart;
    delete payload.sourceEnd;
    delete payload.pageIndex;
    return {
      id: `content-${w.kind}-${idx}-${sourceStart ?? 'x'}`,
      payload: payload as unknown as WarningPayload,
      ...(sourceStart !== undefined
        ? { sourceStart, sourceEnd, line: lineNumberForOffset(markdown, sourceStart) }
        : {}),
    };
  });
}

function computeDocumentWarnings(params: {
  markdown: string;
  config: PostextConfig;
  doc: VDTDocument | null;
  resources: Resource[];
  storageUnavailable: boolean;
  unavailableImages?: ReadonlySet<string>;
  /** The book's metadata (`ComposedBook.metadata`), handed to the engine
   *  beside `markdown`. */
  bookMetadata?: Record<string, unknown>;
}): Warning[] {
  const { markdown, config, doc, resources, storageUnavailable, unavailableImages, bookMetadata } = params;
  const debug = resolveDebugConfig(config.debug);
  const toggles = debug.warnings;
  const warnings: Warning[] = [];
  // Always parse so we can surface math issues (unclosed delimiters) even
  // when other toggles are off.
  const { blocks, issues } = parseMarkdownWithIssues(markdown);

  if (toggles.missingFont) {
    // Duplicate (weight, style) slots apply to every declared custom
    // family, used or not — the user wants a reminder to retune the
    // variant settings regardless of where the family is referenced.
    for (const family of config.customFonts ?? []) {
      const slotCounts = new Map<string, { weight: number; style: 'normal' | 'italic'; count: number }>();
      for (const v of family.variants) {
        const key = `${v.weight}|${v.style}`;
        const entry = slotCounts.get(key);
        if (entry) entry.count++;
        else slotCounts.set(key, { weight: v.weight, style: v.style, count: 1 });
      }
      const duplicates = [...slotCounts.values()].filter((s) => s.count > 1);
      if (duplicates.length > 0) {
        warnings.push({
          id: `duplicate-font-variant-${family.name}`,
          payload: { kind: 'duplicateFontVariant', family: family.name, variants: duplicates },
        });
      }
    }

    const families = getConfigFontFamilies(config);
    const specMissing = new Set(detectMissingFonts(config));
    // Where emphasis is set as dots, only the Latin letters and digits of
    // `*…*` ask the body family for its italics.
    const text = { latinEmphasis: hasLatinEmphasis(blocks) };
    for (const family of families) {
      const custom = getCustomFontFamily(family);
      if (custom) {
        // Custom family still declared: report the variants the
        // configuration asks of it (weight × style) that have no file.
        const missingVariants = missingUsedVariants(custom, config, text);
        if (missingVariants.length > 0) {
          warnings.push({
            id: `missing-font-variant-${family}`,
            payload: { kind: 'missingFontVariant', family, variants: missingVariants },
          });
        }
        continue;
      }
      // Family referenced but no current custom match. Three sub-cases:
      //   1) User deleted a custom family that is still referenced — fire
      //      immediately, don't wait for document.fonts to notice.
      //   2) Fontsource metadata fetch proved the name is not a Google
      //      Font — treat as unknown family.
      //   3) document.fonts.check failed for at least one spec — generic
      //      "not loaded" (may be transient/network).
      if (isRemovedCustomFontFamily(family) || isKnownUnavailableGoogleFont(family)) {
        warnings.push({
          id: `missing-font-family-${family}`,
          payload: { kind: 'missingFontFamily', family },
        });
      } else if (specMissing.has(family)) {
        warnings.push({
          id: `missing-font-${family}`,
          payload: { kind: 'missingFont', family },
        });
      }
    }
  }

  if (toggles.headingHierarchy) {
    warnings.push(...collectHeadingHierarchyWarnings(blocks, markdown));
  }
  if (toggles.consecutiveHeadings) {
    warnings.push(...collectConsecutiveHeadingsWarnings(blocks, markdown));
  }
  if (toggles.listAfterHeading) {
    warnings.push(...collectListAfterHeadingWarnings(blocks, markdown));
  }

  // Math: parser-level unclosed issues, plus engine errors harvested from
  // the built VDT (see collectMathWarnings below).
  let mathIdx = 0;
  for (const issue of issues) {
    if (issue.kind === 'unclosedMath' || issue.kind === 'unclosedMathBlock') {
      warnings.push({
        id: `math-unclosed-${mathIdx++}-${issue.sourceStart}`,
        payload: { kind: 'unclosedMath', delimiter: issue.delimiter, tex: issue.tex.slice(0, 80) },
        sourceStart: issue.sourceStart,
        sourceEnd: issue.sourceEnd,
        line: lineNumberForOffset(markdown, issue.sourceStart),
      });
    }
  }
  if (doc) {
    warnings.push(...collectMathRenderWarnings(doc, markdown));
  }

  if (toggles.looseLines && doc) {
    warnings.push(...collectLooseLineWarnings(doc, debug, markdown));
  }
  if (doc) warnings.push(...collectLayoutWarnings(doc, markdown));
  if (doc) warnings.push(...collectHeadingDesignCutWarnings(doc, markdown));

  warnings.push(...collectHeaderFooterWarnings(config, doc, markdown, bookMetadata));
  warnings.push(...collectEngineContentWarnings(markdown, config, resources));
  warnings.push(...collectDirectiveWarnings(markdown, blocks));
  warnings.push(...collectContainerWarnings(markdown, issues));
  warnings.push(...collectChipOverlapWarnings(markdown, doc));
  warnings.push(...collectHeadingBreakParityWarnings(config));
  warnings.push(...collectConfigValueWarnings(config));
  warnings.push(...collectHyphenationLocaleWarnings(config));
  warnings.push(...collectParityCascadeWarnings(doc));
  warnings.push(...collectAlphaOverflowWarnings(doc));
  if (toggles.designIssues) {
    warnings.push(...collectDesignWarnings(config));
  }

  warnings.push(
    ...collectResourceWarnings(
      blocks,
      markdown,
      resources,
      config.resourceTypes ?? [],
      doc,
      configImageResourceIds(config, blocks),
      // With no storage every payload is unreadable: `storageUnavailable`
      // says so once instead.
      storageUnavailable ? undefined : unavailableImages,
    ),
  );
  if (storageUnavailable) {
    warnings.push({ id: 'resource-storage-unavailable', payload: { kind: 'storageUnavailable' } });
  }

  return warnings;
}

/** The document's hyphenation language — its hyphenation locale, else its
 *  `locale` — when no patterns ship for it: the engine falls back to en-us
 *  (and says so only on the console). Not while hyphenation is switched
 *  off, which is the remedy, nor for Chinese, Japanese, Korean or a
 *  right-to-left language (Arabic, Persian, Hebrew…), which are set
 *  without hyphenation (see `isUnhyphenatedLanguage`). */
export function collectHyphenationLocaleWarnings(config: PostextConfig): Warning[] {
  if (config.bodyText?.hyphenation?.enabled === false) return [];
  const tag = config.bodyText?.hyphenation?.locale?.trim() || config.locale?.trim();
  if (!tag || matchHyphenationLocale(tag) || isUnhyphenatedLanguage(tag)) return [];
  return [{ id: `unsupported-hyphenation-locale-${tag}`, payload: { kind: 'unsupportedHyphenationLocale', locale: tag } }];
}

function collectHeaderFooterWarnings(
  config: PostextConfig,
  doc: VDTDocument | null,
  markdown: string,
  bookMetadata: Record<string, unknown> | undefined,
): Warning[] {
  const out: Warning[] = [];
  // With no laid-out document (the PDF view opened first), the fields are
  // read as the engine will read them: the book's metadata (the first
  // chapter's front matter), then the text's own front matter.
  const metadata: Record<string, unknown> = doc?.metadata ?? { ...bookMetadata, ...frontmatterMetadata(markdown) };
  const hasMetadata = (name: string): boolean => {
    if (!isMetadataPlaceholder(name)) return true;
    const val = metadataText(metadata[name]);
    return val !== undefined && val.length > 0;
  };

  // Every design slot is validated against the engine allow-list for its
  // own kind (fixed names per kind plus the open-ended `attr.<key>`
  // namespace), so new placeholders never need a sandbox-side copy. Heading
  // and part slots accept the heading set (`{titleText}`, `{number}`…).
  const check = (
    slot: DesignContextKind,
    elements: ResolvedDesignSlot['elements'],
    where: { level?: number; styleId?: string; configPath?: 'parts.versoDesign' | 'toc.parts.design'; tag?: string } = {},
  ) => {
    const { level, styleId, configPath } = where;
    const tag = where.tag ?? (styleId !== undefined ? `style-${styleId}-${slot}` : level !== undefined ? `${slot}${level}` : slot);
    const owner = { ...(styleId !== undefined ? { styleId } : {}), ...(configPath !== undefined ? { configPath } : {}) };
    elements.forEach((el, elementIndex) => {
      if (el.kind !== 'text') return;
      for (const name of collectPlaceholderNames(el.content)) {
        if (!isAllowedPlaceholder(name, slot)) {
          out.push({
            id: `hf-unknown-${tag}-${elementIndex}-${name}`,
            payload: { kind: 'headerFooterUnknownPlaceholder', slot, level, ...owner, elementIndex, name },
          });
        } else if (!hasMetadata(name)) {
          out.push({
            id: `hf-metadata-${tag}-${elementIndex}-${name}`,
            payload: { kind: 'headerFooterMetadataMissing', slot, level, ...owner, elementIndex, name },
          });
        }
      }
    });
  };
  check('header', resolveHeaderFooterConfig(config.header, 'header').elements);
  check('footer', resolveHeaderFooterConfig(config.footer, 'footer').elements);
  for (const lvl of resolveHeadingsConfig(config.headings).levels) {
    if (lvl.advancedDesign.enabled) check('heading', lvl.advancedDesign.slot.elements, { level: lvl.level });
  }
  check('part', resolveDesignSlot(config.parts?.design, 'header').elements);
  for (const s of partRowSlots(config)) check('part', s.elements, { configPath: s.configPath, tag: s.tag });
  for (const s of headingStyleSlots(config)) check(s.slot, s.elements, { styleId: s.styleId });

  return out;
}

/** The front matter's fields, or none when it does not parse. */
function frontmatterMetadata(markdown: string): Record<string, unknown> {
  try {
    return extractFrontmatter(markdown).metadata as Record<string, unknown>;
  } catch {
    return {};
  }
}

function collectMathRenderWarnings(doc: VDTDocument, markdown: string): Warning[] {
  const out: Warning[] = [];
  let idx = 0;
  for (const block of doc.blocks) {
    if (block.mathRender?.error) {
      out.push({
        id: `math-err-${idx++}-${block.sourceStart ?? 'x'}`,
        payload: { kind: 'invalidMath', tex: block.mathRender.tex, message: block.mathRender.error },
        sourceStart: block.sourceStart,
        sourceEnd: block.sourceEnd,
        line: block.sourceStart !== undefined ? lineNumberForOffset(markdown, block.sourceStart) : undefined,
      });
    }
    for (const line of block.lines) {
      if (!line.segments) continue;
      for (const seg of line.segments) {
        if (seg.kind === 'math' && seg.mathRender?.error) {
          const src = line.sourceStart ?? block.sourceStart;
          out.push({
            id: `math-err-${idx++}-${src ?? 'x'}`,
            payload: { kind: 'invalidMath', tex: seg.mathRender.tex, message: seg.mathRender.error },
            sourceStart: src,
            sourceEnd: line.sourceEnd ?? block.sourceEnd,
            line: src !== undefined ? lineNumberForOffset(markdown, src) : undefined,
          });
        }
      }
    }
  }
  return out;
}
