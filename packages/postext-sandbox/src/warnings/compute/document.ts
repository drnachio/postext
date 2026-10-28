// Warnings on the whole document before layout: the engine's content
// findings, hyphenation locales, running heads, frontmatter metadata and
// maths that does not render (#1276: split out of compute.ts).
import { type PostextConfig, type PostextContent, type Resource, anchorOutline, collectContentWarnings, type VDTDocument, type SvgFontFaceReport, resolveDebugConfig, parseMarkdownWithIssues, extractFrontmatter, matchHyphenationLocale, isUnhyphenatedLanguage, isMetadataPlaceholder, metadataText, type ResolvedDesignSlot, collectPlaceholderNames, isAllowedPlaceholder, resolveHeaderFooterConfig, resolveHeadingsConfig, resolveDesignSlot } from 'postext';
import { getConfigFontFamilies, hasLatinEmphasis, getCustomFontFamily, missingUsedVariants, isRemovedCustomFontFamily, isKnownUnavailableGoogleFont } from '../../controls/fonts/fontLoader.js';
import type { Warning, WarningPayload, WarningSlotKind } from '../types.js';
import { collectHeadingHierarchyWarnings, collectConsecutiveHeadingsWarnings, collectHeadingDesignCutWarnings, collectDirectiveWarnings, collectContainerWarnings, collectChipOverlapWarnings, collectDesignTruncationWarnings } from './content.js';
import { collectListAfterHeadingWarnings, collectHeadingBreakParityWarnings, collectConfigValueWarnings, collectParityCascadeWarnings, collectAlphaOverflowWarnings, collectDesignWarnings, partRowSlots, headingStyleSlots, boxStyleSlots } from './design.js';
import { lineNumberForOffset, detectMissingFonts, collectLooseLineWarnings, collectLayoutWarnings } from './layout.js';
import { collectResourceWarnings, configImageResourceIds } from './resources.js';

/** What a chapter's build is handed of the rest of its book: the outline
 *  (every heading with an id and every anchor) and the citations. */
export type BookContent = Pick<PostextContent, 'outline' | 'citations'>;

/**
 * The engine's content warnings (`collectContentWarnings`, what the build
 * lists in `doc.contentWarnings`): unknown resource ids, `:::name` lines,
 * paragraph, callout, chip, heading and table style ids, and ragged table
 * grids. Read from the source here — so they show before the first layout —
 * rather than from the document, so each is listed once. `bookContent` is
 * what the chapter's build is handed of the rest of its book (its plan's
 * outline and citations): a reference to a heading, an anchor or a source
 * of another chapter names something that exists (#1300).
 */
export function collectEngineContentWarnings(markdown: string, config: PostextConfig, resources: Resource[], bookContent?: BookContent): Warning[] {
  let found: ReturnType<typeof collectContentWarnings>;
  try {
    const bookAnchors = bookContent?.outline ? new Set(anchorOutline(bookContent.outline).map((e) => e.anchorId!)) : undefined;
    const bookCitationKeys = bookContent?.citations ? new Set(bookContent.citations.items.map((i) => i.id)) : undefined;
    found = collectContentWarnings(markdown, config, resources, bookAnchors, bookCitationKeys);
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

export function computeDocumentWarnings(params: {
  markdown: string;
  config: PostextConfig;
  doc: VDTDocument | null;
  resources: Resource[];
  storageUnavailable: boolean;
  unavailableImages?: ReadonlySet<string>;
  /** SVG pictures whose fonts could not all be inlined (#630). */
  svgFontIssues?: ReadonlyMap<string, readonly SvgFontFaceReport[]>;
  /** The book's metadata (`ComposedBook.metadata`), handed to the engine
   *  beside `markdown`. */
  bookMetadata?: Record<string, unknown>;
  /** The outline and citations of the book the chapter is laid out in
   *  (its plan's), so references into other chapters resolve. */
  bookContent?: BookContent;
}): Warning[] {
  const { markdown, config, doc, resources, storageUnavailable, unavailableImages, svgFontIssues, bookMetadata, bookContent } = params;
  const debug = resolveDebugConfig(config.debug);
  const toggles = debug.warnings;
  const warnings: Warning[] = [];
  // Always parse so we can surface math issues (unclosed delimiters) even
  // when other toggles are off.
  // Code fences as the configuration reads them (#624): a book stored
  // before them reads their lines as Markdown.
  const code = config.codeStyle;
  const { blocks, issues } = parseMarkdownWithIssues(markdown, code && (code.blocks === false || code.indentedCode === true)
    ? { fences: code.blocks !== false, indentedCode: code.indentedCode === true }
    : undefined);

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
    // With a layout, the engine's `fontFallback` says which faces it
    // measured with a fallback (#629); this probe covers the time before
    // the first one.
    const specMissing = new Set(doc ? [] : detectMissingFonts(config));
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
  if (doc) {
    // A family the Sandbox already names as unknown or short of files is
    // not reported again as a fallback.
    const named = new Set(warnings.flatMap((w) => (w.payload.kind === 'missingFontFamily' || w.payload.kind === 'missingFontVariant' ? [w.payload.family.toLowerCase()] : [])));
    warnings.push(...collectLayoutWarnings(doc, markdown).filter((w) => (w.payload.kind === 'glyphFallback'
      ? toggles.missingFont && !named.has(w.payload.family.toLowerCase())
      : w.payload.kind !== 'fontFallback'
        || (toggles.missingFont && !(w.payload.reason === 'missing' && named.has(w.payload.family.toLowerCase()))))));
  }
  if (doc) warnings.push(...collectHeadingDesignCutWarnings(doc, markdown));

  warnings.push(...collectHeaderFooterWarnings(config, doc, markdown, bookMetadata));
  warnings.push(...collectEngineContentWarnings(markdown, config, resources, bookContent));
  warnings.push(...collectDirectiveWarnings(markdown, blocks));
  warnings.push(...collectContainerWarnings(markdown, issues));
  warnings.push(...collectChipOverlapWarnings(markdown, doc));
  warnings.push(...collectHeadingBreakParityWarnings(config));
  // The book's title and author may stand in a design (#849): the book's
  // metadata, else this chapter's own front matter.
  warnings.push(...collectConfigValueWarnings(config, resources, bookMetadata ?? (extractFrontmatter(markdown).metadata as Record<string, unknown> | undefined)));
  warnings.push(...collectHyphenationLocaleWarnings(config));
  warnings.push(...collectParityCascadeWarnings(doc));
  warnings.push(...collectAlphaOverflowWarnings(doc));
  if (toggles.designIssues) {
    warnings.push(...collectDesignWarnings(config));
    if (doc) warnings.push(...collectDesignTruncationWarnings(doc, markdown));
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
      svgFontIssues,
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
    slot: WarningSlotKind,
    elements: ResolvedDesignSlot['elements'],
    where: { level?: number; styleId?: string; configPath?: 'parts.versoDesign' | 'toc.parts.design'; tag?: string } = {},
  ) => {
    const { level, styleId, configPath } = where;
    const tag = where.tag ?? (styleId !== undefined ? `style-${styleId}-${slot}` : level !== undefined ? `${slot}${level}` : slot);
    const owner = { ...(styleId !== undefined ? { styleId } : {}), ...(configPath !== undefined ? { configPath } : {}) };
    elements.forEach((el, elementIndex) => {
      if (el.kind !== 'text') return;
      for (const name of collectPlaceholderNames(el.content)) {
        // A box design reads the heading set plus its content (#1014).
        if (!isAllowedPlaceholder(name, slot === 'box' ? 'heading' : slot)) {
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
  check('part', resolveDesignSlot(config.parts?.design, 'part').elements);
  for (const s of partRowSlots(config)) check('part', s.elements, { configPath: s.configPath, tag: s.tag });
  for (const s of headingStyleSlots(config)) check(s.slot, s.elements, { styleId: s.styleId });
  for (const s of boxStyleSlots(config)) check('box', s.elements, { styleId: s.styleId, tag: `box-style-${s.styleId}` });

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
