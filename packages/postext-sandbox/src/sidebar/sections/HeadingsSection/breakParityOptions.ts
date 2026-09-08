import type { HeadingBreakParity } from 'postext';
import type { useSandboxLabels } from '../../../context/SandboxContext';

type Labels = ReturnType<typeof useSandboxLabels>;

/** The five page-parity choices shared by heading break-before and the
 *  part opener/closer breaks. */
export function breakParityOptions(labels: Labels): { value: HeadingBreakParity; label: string }[] {
  return [
    { value: 'any', label: labels.headingBreakBeforeParityAny },
    { value: 'odd', label: labels.headingBreakBeforeParityOdd },
    { value: 'even', label: labels.headingBreakBeforeParityEven },
    { value: 'always-odd', label: labels.headingBreakBeforeParityAlwaysOdd },
    { value: 'always-even', label: labels.headingBreakBeforeParityAlwaysEven },
  ];
}
