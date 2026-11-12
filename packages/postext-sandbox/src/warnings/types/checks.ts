// The print and contrast findings as the Checks panel lists them
// (split out of warnings/types.ts).
import type { ContrastIssue, PreflightIssue, PreflightSeverity } from 'postext';

/** `Omit` over each member of a union. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** One contrast finding as the Checks panel lists it. */
export type ContrastCheck = DistributiveOmit<ContrastIssue, 'rect' | 'sourceStart' | 'sourceEnd' | 'pageIndex'>;

/** One preflight finding as the Checks panel lists it. */
export type PreflightCheck =
  | DistributiveOmit<PreflightIssue, 'rect' | 'sourceStart' | 'sourceEnd' | 'pageIndex'>
  | { kind: 'masterFonts'; severity: PreflightSeverity; name: string; fonts: string[] }
  | { kind: 'masterRgb'; severity: PreflightSeverity; name: string }
  | { kind: 'masterTransparency'; severity: PreflightSeverity; name: string; x1a: boolean }
  /** Spot inks of a placed PDF (an Illustrator file) the job does not print
   *  as they are named (`placedInkProblems`). */
  | { kind: 'masterInks'; severity: PreflightSeverity; name: string; problem: 'offPlates' | 'renamed' | 'unknown'; inks: string[] };

/** Where in a resource a stack, a citation or an operator break lies
 *  (#1542): its caption, its note or a table cell (row and column from 0).
 *  Absent on a warning of the running text. */
export interface SnippetPlace {
  resourceId: string;
  part: 'caption' | 'note' | 'cell';
  cell?: { row: number; col: number };
}
