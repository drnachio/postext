'use client';

import { DESIGN_PARTS, type DesignPart } from 'postext';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { SETTINGS_GROUPS } from '../sections/registry.js';

/** The parts of a design to choose from, named as the Design panel's
 *  groups are. */
export function PartChoice({ legend, available, value, onChange }: {
  legend: string;
  available: readonly DesignPart[];
  value: readonly DesignPart[];
  onChange: (parts: DesignPart[]) => void;
}) {
  const labels = useSandboxLabels();
  const all = available.length > 0 && available.every((p) => value.includes(p));
  return (
    <fieldset className="m-0 flex flex-col gap-1 border-0 p-0 text-xs">
      <legend className="mb-1 flex w-full items-center justify-between gap-2 p-0 text-(--slate)">
        <span>{legend}</span>
        <button
          type="button"
          className="cursor-pointer rounded px-1 text-(--brand) underline-offset-2 hover:underline focus-visible:outline-2 outline-(--brand)"
          onClick={() => onChange(all ? [] : [...available])}
        >
          {all ? labels.designsPartsNone : labels.designsPartsAll}
        </button>
      </legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {available.map((p) => {
          const group = SETTINGS_GROUPS.find((g) => g.id === p);
          return (
            <label key={p} className="flex min-h-6 pt-large:min-h-11 cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                checked={value.includes(p)}
                onChange={(e) => onChange(e.target.checked ? DESIGN_PARTS.filter((x) => x === p || value.includes(x)) : value.filter((x) => x !== p))}
              />
              {group ? String(labels[group.labelKey]) : p}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
