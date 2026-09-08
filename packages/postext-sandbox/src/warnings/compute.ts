import type {
  PostextConfig,
  VDTDocument,
  ResolvedDebugConfig,
  ContentBlock,
  ParseIssue,
  Resource,
  ResourceType,
  ResolvedDesignSlot,
  DesignContextKind,
} from 'postext';
import {
  KNOWN_CONTAINERS,
  KNOWN_DIRECTIVES,
  parseMarkdownWithIssues,
  resolveDebugConfig,
  resolveHeaderFooterConfig,
  resolveHeadingsConfig,
  resolveDesignSlot,
  collectPlaceholderNames,
  isAllowedPlaceholder,
  isMetadataPlaceholder,
} from 'postext';
import {
  getConfigFontSpecs,
  getConfigFontFamilies,
  getCustomFontFamily,
  missingStandardVariants,
  isKnownUnavailableGoogleFont,
  isRemovedCustomFontFamily,
} from '../controls/fontLoader';
import type { Warning } from './types';

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
  for (const block of doc.blocks) {
    for (const line of block.lines) {
      const ratio = line.justifiedSpaceRatio;
      if (ratio === undefined || ratio <= threshold) continue;
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
  }
  return out;
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

const DIRECTIVE_RE = /^:::\s*([a-z][a-z0-9-]*)\b/;
/** Every `:::name` the parser understands: leaf directives plus fenced
 *  containers (`callout`, `paragraphs`, `part`). Widened to `string` so
 *  arbitrary names scanned from the source can be tested. */
const KNOWN_FENCE_NAMES: ReadonlySet<string> = new Set<string>([
  ...KNOWN_DIRECTIVES,
  ...KNOWN_CONTAINERS,
]);
const ALLOWED_PAGE_FORMATS = new Set([
  'decimal',
  'lower-roman',
  'upper-roman',
  'lower-alpha',
  'upper-alpha',
]);

function collectDirectiveWarnings(
  markdown: string,
  blocks: ContentBlock[],
): Warning[] {
  const out: Warning[] = [];
  let idx = 0;

  // 1. Unknown directive-looking lines that didn't parse as a directive
  //    block. We scan the markdown for `:::name` lines and flag those whose
  //    `name` isn't recognized.
  const rawLines = markdown.split('\n');
  let offset = 0;
  for (const rawLine of rawLines) {
    const lineLen = rawLine.length;
    const m = rawLine.trim().match(DIRECTIVE_RE);
    if (m) {
      const name = m[1]!;
      if (!KNOWN_FENCE_NAMES.has(name)) {
        out.push({
          id: `directive-unknown-${idx++}-${offset}`,
          payload: { kind: 'unknownDirective', name },
          sourceStart: offset,
          sourceEnd: offset + lineLen,
          line: lineNumberForOffset(markdown, offset),
        });
      }
    }
    offset += lineLen + 1; // +1 for '\n'
  }

  // 2. Attribute-level validation on parsed directive blocks.
  for (const b of blocks) {
    if (b.type !== 'directive' || !b.directiveAttrs) continue;
    const attrs = b.directiveAttrs;
    if (b.directiveName === 'numbering') {
      if (attrs.format !== undefined && !ALLOWED_PAGE_FORMATS.has(attrs.format)) {
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
    }
  }
  return out;
}

/**
 * Fenced-container warnings:
 *   - unclosedContainer: a `:::name` fence still open at end of input (from
 *     the parser's issue list); points at the opening line.
 *   - unknownParagraphStyle: `:::paragraphs{style="x"}` where `x` is not a
 *     configured paragraph style id.
 *   - unknownCalloutType: `:::callout{type="x"}` where `x` is not a
 *     configured callout style id. Mirrors `pickCalloutStyle` in the engine:
 *     with no configured styles every type resolves to the built-in `note`
 *     look (nothing to warn about); with a non-empty list an unknown type
 *     silently falls back to the first style, which is worth flagging.
 */
function collectContainerWarnings(
  markdown: string,
  blocks: ContentBlock[],
  issues: ParseIssue[],
  config: PostextConfig,
): Warning[] {
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

  const paragraphStyleIds = new Set((config.paragraphStyles ?? []).map((s) => s.id));
  const calloutStyleIds = new Set((config.calloutStyles ?? []).map((s) => s.id));

  for (const b of blocks) {
    if (b.type !== 'containerStart') continue;
    const attrs = b.containerAttrs ?? {};
    if (b.containerName === 'paragraphs') {
      const style = attrs.style;
      if (style !== undefined && !paragraphStyleIds.has(style)) {
        out.push({
          id: `paragraphs-style-${idx++}-${b.sourceStart}`,
          payload: { kind: 'unknownParagraphStyle', style },
          sourceStart: b.sourceStart,
          sourceEnd: b.sourceEnd,
          line: lineNumberForOffset(markdown, b.sourceStart),
        });
      }
    } else if (b.containerName === 'callout' && calloutStyleIds.size > 0) {
      const type = attrs.type;
      if (type !== undefined && !calloutStyleIds.has(type)) {
        out.push({
          id: `callout-type-${idx++}-${b.sourceStart}`,
          payload: { kind: 'unknownCalloutType', type },
          sourceStart: b.sourceStart,
          sourceEnd: b.sourceEnd,
          line: lineNumberForOffset(markdown, b.sourceStart),
        });
      }
    }
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

/**
 * Resource integrity warnings (issue #49 §8):
 *   - unknownResourceId: an `::resource` embed or `:ref` inline reference whose
 *     id is not in `resources`.
 *   - unusedResource: a resource that is never embedded or referenced.
 *   - duplicateResourceId: two or more resources sharing the same id.
 *   - danglingTypeRef: a resource whose `typeId` is not a known `ResourceType`.
 *   - bitmapTooSmall: a bitmap rendered larger than 1.5× its natural width.
 */
function collectResourceWarnings(
  blocks: ContentBlock[],
  markdown: string,
  resources: Resource[],
  resourceTypes: ResourceType[],
  doc: VDTDocument | null,
  /** Resource ids consumed by the configuration itself (callout icons),
   *  which count as used even though the document never references them. */
  configUsedIds: ReadonlySet<string> = new Set(),
): Warning[] {
  const out: Warning[] = [];
  let idx = 0;

  // Map of id -> count to detect duplicates and existence.
  const idCounts = new Map<string, number>();
  for (const r of resources) {
    idCounts.set(r.id, (idCounts.get(r.id) ?? 0) + 1);
  }
  const knownIds = new Set(idCounts.keys());
  const knownTypeIds = new Set(resourceTypes.map((t) => t.id));

  // Track which resource ids are actually used (embedded, referenced, or
  // consumed by the configuration).
  const usedIds = new Set<string>(configUsedIds);

  // 1. Walk blocks for embeds (`::resource`) and inline `:ref`s, flagging
  //    unknown ids and recording usage with source positions for navigation.
  for (const b of blocks) {
    if (b.type === 'resourceBlock' && b.resourceId !== undefined) {
      usedIds.add(b.resourceId);
      if (!knownIds.has(b.resourceId)) {
        out.push({
          id: `resource-unknown-embed-${idx++}-${b.sourceStart}`,
          payload: { kind: 'unknownResourceId', resourceId: b.resourceId, usage: 'embed' },
          sourceStart: b.sourceStart,
          sourceEnd: b.sourceEnd,
          line: lineNumberForOffset(markdown, b.sourceStart),
        });
      }
    }
    for (const span of b.spans) {
      const ref = span.ref;
      if (!ref) continue;
      usedIds.add(ref.resourceId);
      if (!knownIds.has(ref.resourceId)) {
        out.push({
          id: `resource-unknown-ref-${idx++}-${b.sourceStart}-${ref.resourceId}`,
          payload: { kind: 'unknownResourceId', resourceId: ref.resourceId, usage: 'ref' },
          sourceStart: b.sourceStart,
          sourceEnd: b.sourceEnd,
          line: lineNumberForOffset(markdown, b.sourceStart),
        });
      }
    }
  }

  // 2. Per-resource integrity: duplicates, dangling type refs, unused.
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
    if (!usedIds.has(r.id)) {
      out.push({
        id: `resource-unused-${idx++}-${r.id}`,
        payload: { kind: 'unusedResource', resourceId: r.id, caption: r.caption },
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
      const bitmapWidth = rb.resource.bitmap?.width;
      if (!bitmapWidth || bitmapWidth <= 0) continue;
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
}): Warning[] {
  const { markdown, config, doc, resources = [], storageUnavailable = false } = params;
  const debug = resolveDebugConfig(config.debug);
  const toggles = debug.warnings;
  const warnings: Warning[] = [];

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
    for (const family of families) {
      const custom = getCustomFontFamily(family);
      if (custom) {
        // Custom family still declared: report specifically which
        // standard variants are missing (weight × style).
        const missingVariants = missingStandardVariants(custom);
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

  // Always parse so we can surface math issues (unclosed delimiters) even
  // when other toggles are off.
  const { blocks, issues } = parseMarkdownWithIssues(markdown);
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

  warnings.push(...collectHeaderFooterWarnings(config, doc));
  warnings.push(...collectDirectiveWarnings(markdown, blocks));
  warnings.push(...collectContainerWarnings(markdown, blocks, issues, config));
  warnings.push(...collectHeadingBreakParityWarnings(config));
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
      new Set(
        (config.calloutStyles ?? [])
          .map((style) => (style.icon?.kind === 'resource' ? style.icon.resourceId : undefined))
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ),
  );
  if (storageUnavailable) {
    warnings.push({ id: 'resource-storage-unavailable', payload: { kind: 'storageUnavailable' } });
  }

  return warnings;
}

function collectHeaderFooterWarnings(
  config: PostextConfig,
  doc: VDTDocument | null,
): Warning[] {
  const out: Warning[] = [];
  const metadata = doc?.metadata ?? {};
  const hasMetadata = (name: string): boolean => {
    if (!isMetadataPlaceholder(name)) return true;
    const val = (metadata as Record<string, unknown>)[name];
    return typeof val === 'string' && val.length > 0;
  };

  // Every design slot is validated against the engine allow-list for its
  // own kind (fixed names per kind plus the open-ended `attr.<key>`
  // namespace), so new placeholders never need a sandbox-side copy. Heading
  // and part slots accept the heading set (`{titleText}`, `{number}`…).
  const check = (slot: DesignContextKind, elements: ResolvedDesignSlot['elements'], level?: number) => {
    const tag = level !== undefined ? `${slot}${level}` : slot;
    elements.forEach((el, elementIndex) => {
      if (el.kind !== 'text') return;
      for (const name of collectPlaceholderNames(el.content)) {
        if (!isAllowedPlaceholder(name, slot)) {
          out.push({
            id: `hf-unknown-${tag}-${elementIndex}-${name}`,
            payload: { kind: 'headerFooterUnknownPlaceholder', slot, level, elementIndex, name },
          });
        } else if (!hasMetadata(name)) {
          out.push({
            id: `hf-metadata-${tag}-${elementIndex}-${name}`,
            payload: { kind: 'headerFooterMetadataMissing', slot, level, elementIndex, name },
          });
        }
      }
    });
  };
  check('header', resolveHeaderFooterConfig(config.header, 'header').elements);
  check('footer', resolveHeaderFooterConfig(config.footer, 'footer').elements);
  for (const lvl of resolveHeadingsConfig(config.headings).levels) {
    if (lvl.advancedDesign.enabled) check('heading', lvl.advancedDesign.slot.elements, lvl.level);
  }
  check('part', resolveDesignSlot(config.parts?.design, 'header').elements);

  return out;
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
