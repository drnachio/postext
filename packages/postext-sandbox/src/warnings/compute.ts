import type {
  PostextConfig,
  VDTDocument,
  ResolvedDebugConfig,
  ContentBlock,
} from 'postext';
import {
  parseMarkdownWithIssues,
  resolveDebugConfig,
  resolveHeaderFooterConfig,
  resolveHeadingsConfig,
  collectPlaceholderNames,
  isKnownPlaceholder,
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
      if (name !== 'pagebreak' && name !== 'numbering') {
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
      if (attrs.parity !== undefined && attrs.parity !== 'odd' && attrs.parity !== 'even') {
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

function collectHeadingBreakParityWarnings(config: PostextConfig): Warning[] {
  const out: Warning[] = [];
  const headings = resolveHeadingsConfig(config.headings);
  for (const lvl of headings.levels) {
    const parity = lvl.breakBefore.parity;
    if (parity !== 'any' && parity !== 'odd' && parity !== 'even') {
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

export function computeWarnings(params: {
  markdown: string;
  config: PostextConfig;
  doc: VDTDocument | null;
}): Warning[] {
  const { markdown, config, doc } = params;
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
  warnings.push(...collectHeadingBreakParityWarnings(config));
  warnings.push(...collectParityCascadeWarnings(doc));
  warnings.push(...collectAlphaOverflowWarnings(doc));

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

  const check = (slot: 'header' | 'footer', raw: PostextConfig['header'] | PostextConfig['footer']) => {
    const resolved = resolveHeaderFooterConfig(raw, slot);
    resolved.elements.forEach((el, elementIndex) => {
      if (el.kind !== 'text') return;
      const names = collectPlaceholderNames(el.content);
      for (const name of names) {
        if (!isKnownPlaceholder(name)) {
          out.push({
            id: `hf-unknown-${slot}-${elementIndex}-${name}`,
            payload: { kind: 'headerFooterUnknownPlaceholder', slot, elementIndex, name },
          });
        } else if (!hasMetadata(name)) {
          out.push({
            id: `hf-metadata-${slot}-${elementIndex}-${name}`,
            payload: { kind: 'headerFooterMetadataMissing', slot, elementIndex, name },
          });
        }
      }
    });
  };
  check('header', config.header);
  check('footer', config.footer);

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
