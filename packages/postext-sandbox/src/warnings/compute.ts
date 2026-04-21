import type {
  PostextConfig,
  VDTDocument,
  ResolvedDebugConfig,
  ContentBlock,
} from 'postext';
import { parseMarkdown, resolveDebugConfig } from 'postext';
import { getConfigFontSpecs, getConfigFontFamilies } from '../controls/fontLoader';
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
    for (const family of detectMissingFonts(config)) {
      warnings.push({
        id: `missing-font-${family}`,
        payload: { kind: 'missingFont', family },
      });
    }
  }

  const needsParse =
    toggles.headingHierarchy ||
    toggles.consecutiveHeadings ||
    toggles.listAfterHeading;
  if (needsParse) {
    const blocks = parseMarkdown(markdown);
    if (toggles.headingHierarchy) {
      warnings.push(...collectHeadingHierarchyWarnings(blocks, markdown));
    }
    if (toggles.consecutiveHeadings) {
      warnings.push(...collectConsecutiveHeadingsWarnings(blocks, markdown));
    }
    if (toggles.listAfterHeading) {
      warnings.push(...collectListAfterHeadingWarnings(blocks, markdown));
    }
  }

  if (toggles.looseLines && doc) {
    warnings.push(...collectLooseLineWarnings(doc, debug, markdown));
  }

  return warnings;
}
