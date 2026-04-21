export type WarningKind =
  | 'missingFont'
  | 'looseLine'
  | 'headingHierarchy'
  | 'consecutiveHeadings'
  | 'listAfterHeading';

export type WarningPayload =
  | { kind: 'missingFont'; family: string }
  | { kind: 'looseLine'; ratio: number; threshold: number }
  | { kind: 'headingHierarchy'; from: number; to: number }
  | { kind: 'consecutiveHeadings' }
  | { kind: 'listAfterHeading' };

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
