import type {
  PostextConfig,
  VDTDocument,
  ResolvedDebugConfig,
  ContentBlock,
} from 'postext';
import { parseMarkdownWithIssues, resolveDebugConfig } from 'postext';
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

  return warnings;
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
