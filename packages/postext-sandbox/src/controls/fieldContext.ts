import { createContext, useContext } from 'react';

/** ids a field row hands to the control inside it, so the control can be
 *  named by the row's visible label and described by its help text
 *  (`aria-labelledby` / `aria-describedby`) whatever element it renders. */
export interface FieldIds {
  controlId: string;
  labelId: string;
  descriptionId?: string;
}

export const FieldIdsContext = createContext<FieldIds | null>(null);

export function useFieldIds(): FieldIds | null {
  return useContext(FieldIdsContext);
}

/** "Show every explanation" switch in the settings header. Rows start with
 *  their help text expanded while it is on. */
export const HelpModeContext = createContext(false);

export function useHelpMode(): boolean {
  return useContext(HelpModeContext);
}
