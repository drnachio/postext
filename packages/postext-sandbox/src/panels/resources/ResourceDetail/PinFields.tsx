'use client';

// A float set by hand (`placement.pin`, #1494), from the keyboard: the page
// after the citing one, the column and the slot, «Move in the canvas» (the
// drag a finger or a mouse does on the page) and «Back to automatic». The
// group opens with why a pin is not recommended and what to use instead.
import type { Resource, ResourcePin } from 'postext';
import { MAX_PIN_PAGE_OFFSET } from 'postext';
import { SelectInput } from '../../../controls/index.js';
import { Button } from '../../../ui/index.js';
import { MULTIPLE_COLUMNS_MAX } from '../../../sidebar/settings/multipleColumns.js';
import { armFloatMove, useArmedFloat } from '../../../editing/floatMove.js';
import { PIN_PAGE_OFFSETS, pinWithField, resourceWithPin } from '../pinEdits.js';
import type { SandboxLabels } from '../../../types/labels.js';

interface PinFieldsProps {
  resource: Resource;
  /** Whether a pin moves this resource (see `pinApplies`). */
  applies: boolean;
  labels: SandboxLabels;
  onChange: (next: Resource) => void;
}

const AUTO = 'auto';
const ANY = 'any';

export function PinFields({ resource, applies, labels, onChange }: PinFieldsProps) {
  const pin: ResourcePin | undefined = resource.placement?.pin;
  const armed = useArmedFloat() === resource.id;
  const groupId = `${resource.id}-pin`;
  const set = (next: ResourcePin | undefined) => onChange(resourceWithPin(resource, next));
  if (!applies && !pin) return null;
  return (
    <div role="group" aria-labelledby={groupId} className="flex flex-col gap-2 rounded border border-(--rule) px-2 py-2">
      <div id={groupId} className="text-xs leading-[1.3] text-(--slate)">
        {labels.resourcePinGroupLabel}
      </div>
      <p className="m-0 text-xs leading-[1.4] text-(--slate)">{labels.resourcePinNotRecommended}</p>
      {!applies && <p className="m-0 text-xs leading-[1.4] text-(--foreground)">{labels.resourcePinIgnored}</p>}
      <SelectInput
        stacked
        label={labels.resourcePinPageLabel}
        value={pin ? String(pin.page) : AUTO}
        options={[
          { value: AUTO, label: labels.resourcePinPageAuto },
          ...PIN_PAGE_OFFSETS.map((n) => ({
            value: String(n),
            label: n === 0 ? labels.resourcePinPageCiting : labels.resourcePinPageAfter.replace('__n__', String(n)),
          })),
        ]}
        onChange={(v) => set(v === AUTO ? undefined : pinWithField(pin, 'page', Math.min(MAX_PIN_PAGE_OFFSET, Number(v))))}
        isDefault={!pin}
        onReset={() => set(undefined)}
      />
      {pin && (
        <>
          <SelectInput
            stacked
            label={labels.resourcePinColumnLabel}
            value={pin.column === undefined ? ANY : String(pin.column)}
            options={[
              { value: ANY, label: labels.resourcePinColumnAny },
              ...Array.from({ length: MULTIPLE_COLUMNS_MAX }, (_, i) => ({ value: String(i), label: labels.resourcePinColumnN.replace('__n__', String(i + 1)) })),
            ]}
            onChange={(v) => set(pinWithField(pin, 'column', v === ANY ? undefined : Number(v)))}
          />
          <SelectInput
            stacked
            label={labels.resourcePinSlotLabel}
            value={pin.slot}
            options={[
              { value: 'top', label: labels.resourcePinSlotTop },
              { value: 'bottom', label: labels.resourcePinSlotBottom },
            ]}
            onChange={(v) => set(pinWithField(pin, 'slot', v === 'top' ? 'top' : 'bottom'))}
          />
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {applies && (
          <Button variant="outline" aria-pressed={armed} onClick={() => armFloatMove(armed ? null : resource.id)}>
            {armed ? labels.resourcePinMoveCancel : labels.resourcePinMove}
          </Button>
        )}
        {pin && (
          <Button variant="outline" onClick={() => set(undefined)}>
            {labels.resourcePinRelease}
          </Button>
        )}
      </div>
      {applies && (
        <p className="m-0 text-xs leading-[1.4] text-(--slate)" aria-live="polite">
          {armed ? labels.resourcePinMoveArmed : labels.resourcePinMoveHint}
        </p>
      )}
    </div>
  );
}
