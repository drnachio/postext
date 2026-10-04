// Accessibility metadata (EPUB Accessibility 1.1, schema.org vocabulary)
// both renditions declare, from what the book holds.

import type { EpubAccessibility, EpubLayout } from '../types';

export interface AccessibilityFacts {
  layout: EpubLayout;
  /** Pictures (figures, design images) the book places. */
  hasImages: boolean;
  /** Formulas, set as SVG. */
  hasMath: boolean;
  /** Every picture that is content carries a text alternative. */
  imagesDescribed: boolean;
  hasPageList: boolean;
  hasToc: boolean;
  hasTables: boolean;
}

/** The accessibility metadata of a book. Postext text is real text (never
 *  pictures of text) in reading order, so `textual` access suffices unless
 *  pictures lack alternatives. Claims no WCAG conformance by default: a
 *  fixed layout keeps the print line breaks and sizes, which reflow
 *  criteria (1.4.10) do not allow. */
export function defaultAccessibility(facts: AccessibilityFacts): EpubAccessibility {
  const accessModes = ['textual', ...(facts.hasImages ? ['visual'] : [])];
  const textualSuffices = !facts.hasImages || facts.imagesDescribed;
  const accessModesSufficient = textualSuffices
    ? ['textual', ...(facts.hasImages ? ['textual,visual'] : [])]
    : ['textual,visual'];
  const features = [
    'readingOrder',
    'structuralNavigation',
    ...(facts.hasToc ? ['tableOfContents'] : []),
    ...(facts.hasPageList ? ['pageNavigation', 'printPageNumbers'] : []),
    ...(facts.hasImages && facts.imagesDescribed ? ['alternativeText'] : []),
    ...(facts.hasTables ? ['table'] : []),
    ...(facts.layout === 'reflowable' ? ['displayTransformability'] : []),
  ];
  const summary = facts.layout === 'fixed'
    ? 'Fixed-layout edition: each page reproduces the printed page with selectable text in reading order, a navigable table of contents and print page numbers. Text does not reflow; readers can zoom.' +
      (facts.hasMath ? ' Formulas are drawn as vector pictures.' : '')
    : 'Reflowable edition with semantic headings, lists and tables, a navigable table of contents and print page numbers where the book has them. Text reflows and follows the reader\'s settings.' +
      (facts.hasMath ? ' Formulas are drawn as vector pictures.' : '');
  return { accessModes, accessModesSufficient, features, hazards: ['none'], summary };
}
