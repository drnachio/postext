'use client';

import { useId } from 'react';
import { useSandboxLabels } from '../../../context/SandboxContext.js';
import { NumberField, Switch } from '../../../ui/index.js';

/** «Overprint in print» (`ColorValue.overprint`): a colour that is not a
 *  palette link nor an ink of its own. Built on the Sandbox's own switch
 *  (44 px with large targets on). */
export function OverprintField({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  const labels = useSandboxLabels();
  const id = useId();
  const labelId = useId();
  const hintId = useId();
  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Switch id={id} checked={checked} onCheckedChange={onChange} ariaLabelledBy={labelId} />
        <label id={labelId} htmlFor={id} aria-describedby={hintId} className="cursor-pointer text-xs text-(--foreground)">{labels.colorOverprint}</label>
      </div>
      <p id={hintId} className="m-0 text-xs text-(--slate) [text-wrap:pretty]">{labels.colorOverprintHint}</p>
    </div>
  );
}

/** «Tint» (`ColorValue.tint`): the strength of the linked palette entry,
 *  percent; 100 is the entry itself. */
export function PaletteTintField({ tint, onChange }: { tint: number; onChange: (next: number) => void }) {
  const labels = useSandboxLabels();
  const hintId = useId();
  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span aria-hidden="true" className="text-xs text-(--slate)">{labels.colorPaletteTint}</span>
        <NumberField
          value={tint}
          onValueChange={(v) => onChange(v)}
          min={0}
          max={100}
          steppers={false}
          widthCh={4}
          ariaLabel={labels.colorPaletteTint}
          ariaDescribedBy={hintId}
        />
        <span aria-hidden="true" className="text-xs text-(--slate)">%</span>
      </div>
      <p id={hintId} className="m-0 text-xs text-(--slate) [text-wrap:pretty]">{labels.colorPaletteTintHint}</p>
    </div>
  );
}
