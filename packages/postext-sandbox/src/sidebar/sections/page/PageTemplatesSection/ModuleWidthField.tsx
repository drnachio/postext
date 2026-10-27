'use client';

import type { ModuleWidth } from 'postext';
import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { DimensionInput, NumberInput, SelectInput } from '../../../../controls/index.js';

/** A module's width in its group (#1088): a share of what the row's other
 *  modules leave (unset, `'fill'`), a length, or a percentage of the
 *  group's width. */
export function ModuleWidthField({ value, isDefault, onChange }: { value: ModuleWidth | undefined; isDefault: boolean; onChange: (v: ModuleWidth | undefined) => void }) {
  const labels = useSandboxLabels();
  const mode = value === undefined || value === 'fill' ? 'fill' : 'percent' in value ? 'percent' : 'length';
  return (
    <>
      <SelectInput
        label={labels.pageTemplatesModuleWidth}
        tooltip={labels.pageTemplatesModuleWidthTooltip}
        value={mode}
        options={[
          { value: 'fill', label: labels.pageTemplatesModuleWidthFill },
          { value: 'length', label: labels.pageTemplatesModuleWidthLength },
          { value: 'percent', label: labels.pageTemplatesModuleWidthPercent },
        ]}
        onChange={(m) => onChange(m === 'length' ? { value: 80, unit: 'mm' } : m === 'percent' ? { percent: 50 } : undefined)}
        isDefault={isDefault}
        onReset={() => onChange(undefined)}
      />
      {value !== undefined && value !== 'fill' && ('percent' in value ? (
        <NumberInput
          label={labels.pageTemplatesModuleWidthPercentValue}
          value={value.percent}
          min={1}
          max={100}
          onChange={(n) => onChange({ percent: n })}
        />
      ) : (
        <DimensionInput label={labels.pageTemplatesSizeValue} value={value} onChange={(d) => onChange(d)} />
      ))}
    </>
  );
}

/** A module's `grow` and `shrink` in a row of modules (#1095): its share of
 *  the room the widths leave (a module without a width takes 1 at least),
 *  and how much width it gives back, by its width, when the row is short. */
export function ModuleShareFields({ width, grow, shrink, growSet, shrinkSet, onChange }: {
  width: ModuleWidth | undefined;
  grow: number | undefined;
  shrink: number | undefined;
  growSet: boolean;
  shrinkSet: boolean;
  onChange: (patch: { grow?: number | undefined; shrink?: number | undefined }) => void;
}) {
  const labels = useSandboxLabels();
  const sized = width !== undefined && width !== 'fill';
  return (
    <>
      <NumberInput
        label={labels.pageTemplatesModuleGrow}
        tooltip={labels.pageTemplatesModuleGrowTooltip}
        value={grow ?? (sized ? 0 : 1)}
        min={0}
        max={100}
        step={1}
        onChange={(n) => onChange({ grow: n })}
        isDefault={!growSet}
        onReset={() => onChange({ grow: undefined })}
      />
      {sized && (
        <NumberInput
          label={labels.pageTemplatesModuleShrink}
          tooltip={labels.pageTemplatesModuleShrinkTooltip}
          value={shrink ?? 0}
          min={0}
          max={100}
          step={1}
          onChange={(n) => onChange({ shrink: n })}
          isDefault={!shrinkSet}
          onReset={() => onChange({ shrink: undefined })}
        />
      )}
    </>
  );
}

/** «48%», «80 mm», or the words for a share (#1088): the module library's
 *  note of a module's width. */
export function moduleWidthText(width: ModuleWidth | undefined, share: string): string {
  if (width === undefined || width === 'fill') return share;
  if ('percent' in width) return `${width.percent}%`;
  return `${width.value} ${width.unit}`;
}
