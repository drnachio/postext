export type WarningKind =
  | 'missingFont'
  | 'missingFontFamily'
  | 'missingFontVariant'
  | 'duplicateFontVariant'
  | 'looseLine'
  | 'headingHierarchy'
  | 'consecutiveHeadings'
  | 'listAfterHeading'
  | 'invalidMath'
  | 'unclosedMath'
  | 'headerFooterUnknownPlaceholder'
  | 'headerFooterMetadataMissing';

export type WarningPayload =
  | { kind: 'missingFont'; family: string }
  /** Referenced family is neither a loaded Google Font nor a custom
   *  family in `customFonts`. Silently falls back to a system font at
   *  render time; this warning makes the fall-through visible. */
  | { kind: 'missingFontFamily'; family: string }
  /** Custom family exists but at least one required weight/style variant
   *  has no uploaded file. Names the specific missing combinations. */
  | {
      kind: 'missingFontVariant';
      family: string;
      variants: Array<{ weight: number; style: 'normal' | 'italic' }>;
    }
  /** Two or more uploaded files share the same weight/style slot within
   *  a custom family. Only one of them will actually be used at render
   *  time; the warning nudges the user to retune the variant settings. */
  | {
      kind: 'duplicateFontVariant';
      family: string;
      variants: Array<{ weight: number; style: 'normal' | 'italic'; count: number }>;
    }
  | { kind: 'looseLine'; ratio: number; threshold: number }
  | { kind: 'headingHierarchy'; from: number; to: number }
  | { kind: 'consecutiveHeadings' }
  | { kind: 'listAfterHeading' }
  | { kind: 'invalidMath'; tex: string; message: string }
  | { kind: 'unclosedMath'; delimiter: '$' | '$$'; tex: string }
  | {
      kind: 'headerFooterUnknownPlaceholder';
      slot: 'header' | 'footer';
      elementIndex: number;
      name: string;
    }
  | {
      kind: 'headerFooterMetadataMissing';
      slot: 'header' | 'footer';
      elementIndex: number;
      name: string;
    };

export interface Warning {
  id: string;
  payload: WarningPayload;
  /** Absolute source offset to focus in the editor on click. Undefined for
   *  warnings that don't map to a specific markdown location (e.g. missing
   *  fonts sourced from the config). */
  sourceStart?: number;
  sourceEnd?: number;
  /** Approximate line number in the editor (1-based), when available. */
  line?: number;
}
