'use client';

import { forwardRef, useId, useMemo, useState, type ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { cn } from '../ui/cn';
import { HighlightedText } from '../ui/highlight';
import { Tooltip } from '../ui/tooltip';
import { useSandboxLabels } from '../context/SandboxContext';
import { useFieldMatch } from '../sidebar/search/MatchScope';
import { normalizeText } from '../sidebar/search/normalize';
import { FieldIdsContext, useHelpMode, type FieldIds } from './fieldContext';
import { ResetButton } from './ResetButton';

export interface FieldRowProps {
  label: string;
  /** Plain-language explanation. Reachable by screen readers as the
   *  control's description; sighted users expand it with the ? button. */
  tooltip?: string;
  /** Value equals the engine default: label stays muted, no reset button. */
  isDefault?: boolean;
  onReset?: () => void;
  /** Label above the control instead of beside it (wide inputs). */
  stacked?: boolean;
  /** Hint under a stacked control. */
  hint?: ReactNode;
  /** Extra words the settings search should match (units, aliases). */
  extraTerms?: string[];
  /** id of the control when the caller renders its own input. */
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

/** The one field row used by every settings control: label (with a dot
 *  when the value was changed) and an optional help toggle on the left,
 *  reset + control on the right. The control is named by the label and
 *  described by the help text through `FieldIdsContext`. The row takes part
 *  in the settings search (hides itself when filtered out, highlights hits)
 *  and forwards its ref so popovers can anchor to the whole row. */
export const FieldRow = forwardRef<HTMLDivElement, FieldRowProps>(function FieldRow(
  { label, tooltip, isDefault, onReset, stacked, hint, extraTerms, htmlFor, className, children },
  ref,
) {
  const labels = useSandboxLabels();
  const extra = extraTerms?.join(' ') ?? '';
  const haystack = useMemo(
    () => normalizeText(`${label} ${tooltip ?? ''} ${extra}`),
    [label, tooltip, extra],
  );
  const { visible, tokens } = useFieldMatch(haystack, isDefault === false);
  const showReset = !isDefault && !!onReset;
  const modified = isDefault === false;

  const autoId = useId();
  const ids = useMemo<FieldIds>(() => ({
    controlId: htmlFor ?? `${autoId}-control`,
    labelId: `${autoId}-label`,
    descriptionId: tooltip ? `${autoId}-help` : undefined,
  }), [autoId, htmlFor, tooltip]);

  const helpMode = useHelpMode();
  const [helpToggle, setHelpToggle] = useState<boolean | null>(null);
  const helpOpen = helpToggle ?? helpMode;

  const labelEl = (
    <label
      id={ids.labelId}
      htmlFor={ids.controlId}
      className={cn(
        'min-w-0 text-xs leading-[1.3] [text-wrap:pretty]',
        modified ? 'text-(--foreground)' : 'text-(--slate)',
      )}
    >
      {modified && (
        <span
          aria-hidden="true"
          className="mr-1.5 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-(--brand) align-middle"
        />
      )}
      <HighlightedText text={label} tokens={tokens} />
      {modified && <span className="sr-only"> ({labels.settingsModifiedField})</span>}
    </label>
  );

  const helpButton = tooltip ? (
    <Tooltip content={tooltip} side="right">
      <button
        type="button"
        aria-label={labels.fieldHelp.replace('__label__', label)}
        aria-expanded={helpOpen}
        aria-controls={ids.descriptionId}
        onClick={() => setHelpToggle(!helpOpen)}
        className={cn(
          'inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand)',
          helpOpen ? 'text-(--brand)' : 'text-(--slate) opacity-60 hover:opacity-100',
        )}
      >
        <CircleHelp size={12} aria-hidden="true" />
      </button>
    </Tooltip>
  ) : null;

  return (
    <FieldIdsContext value={ids}>
      <div
        ref={ref}
        data-field-row=""
        className={cn('mb-1.5 flex flex-col', className)}
        style={visible ? undefined : { display: 'none' }}
      >
        {/* Side by side when the row is wide enough; label above the
            control in a narrow panel or a deeply nested group. */}
        <div
          className={cn(
            'flex gap-1',
            stacked
              ? 'flex-col items-stretch'
              : 'min-h-7 flex-col items-start @[260px]:flex-row @[260px]:items-center @[260px]:justify-between @[260px]:gap-2',
          )}
        >
          <div className={cn('flex min-w-0 items-center gap-1', stacked ? 'justify-between' : 'w-full @[260px]:w-auto @[260px]:flex-1')}>
            <span className="flex min-w-0 items-center gap-1">
              {labelEl}
              {helpButton}
            </span>
            {stacked && showReset && <ResetButton onClick={onReset} />}
          </div>
          <div className={cn('flex items-center gap-1', stacked ? 'w-full min-w-0' : 'shrink-0 self-end @[260px]:self-auto')}>
            {!stacked && showReset && <ResetButton onClick={onReset} />}
            {children}
          </div>
        </div>
        {stacked && hint && (
          <div className="mt-1 text-[0.66rem] leading-[1.35] text-(--slate)">{hint}</div>
        )}
        {tooltip && (
          <p
            id={ids.descriptionId}
            className={helpOpen
              ? 'mt-1 mb-1 rounded-md bg-(--surface) px-2 py-1.5 text-[0.68rem] leading-[1.4] text-(--slate) [text-wrap:pretty]'
              : 'sr-only'}
          >
            {tooltip}
          </p>
        )}
      </div>
    </FieldIdsContext>
  );
});
