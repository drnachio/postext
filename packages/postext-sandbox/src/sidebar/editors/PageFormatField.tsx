'use client';

import type { KeyboardEvent } from 'react';
import { PAGE_SIZE_PRESETS } from 'postext';
import type { PageSizePreset } from 'postext';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { FieldRow, useFieldIds } from '../../controls/index.js';
import { toPt } from '../../controls/inputs/units.js';
import { cn, useUiRtl } from '../../ui/index.js';

type Preset = Exclude<PageSizePreset, 'custom'>;

/** The formats by family, each family drawn on a scale of its own: a
 *  newspaper beside a pocket book would leave the book a speck. */
const BOOKS: readonly Preset[] = ['11x17', '12x19', '17x24', '21x28'];
const PRESS: readonly Preset[] = ['compact', 'tabloid', 'berliner', 'broadsheet'];
const ORDER: readonly PageSizePreset[] = [...BOOKS, ...PRESS, 'custom'];

/** Height of the tallest page of a family, in CSS px. */
const DRAWN = 38;

interface PageFormatFieldProps {
  value: PageSizePreset;
  onChange: (preset: PageSizePreset) => void;
  isDefault: boolean;
  onReset: () => void;
}

/** The page format as a gallery: every trim size drawn to proportion,
 *  the books on one scale and the newspapers on another, and the custom
 *  size last. A radio group with roving focus, in a field row like any
 *  other setting (search, help, reset, per-language mark). */
export function PageFormatField({ value, onChange, isDefault, onReset }: PageFormatFieldProps) {
  const labels = useSandboxLabels();
  const names: Partial<Record<PageSizePreset, string>> = {
    broadsheet: labels.pageSizeBroadsheet,
    berliner: labels.pageSizeBerliner,
    tabloid: labels.pageSizeTabloid,
    compact: labels.pageSizeCompact,
    custom: labels.custom,
  };
  return (
    <FieldRow
      label={labels.pageSize}
      tooltip={labels.pageSizeTooltip}
      isDefault={isDefault}
      onReset={onReset}
      stacked
      extraTerms={[...ORDER.map((p) => (p === 'custom' ? labels.custom : sizeText(p))), ...Object.values(names), labels.pageFormatBooks, labels.pageFormatPress]}
    >
      <Gallery value={value} onChange={onChange} names={names} />
    </FieldRow>
  );
}

/** `17 × 24 cm`, in the unit the format is defined in. */
function sizeText(preset: Preset): string {
  const { width, height } = PAGE_SIZE_PRESETS[preset];
  return `${width.value} × ${height.value} ${width.unit}`;
}

function Gallery({ value, onChange, names }: { value: PageSizePreset; onChange: (preset: PageSizePreset) => void; names: Partial<Record<PageSizePreset, string>> }) {
  const labels = useSandboxLabels();
  const ids = useFieldIds();
  const rtl = useUiRtl();
  const descriptions: Record<PageSizePreset, string> = {
    '11x17': labels.pageSize11x17,
    '12x19': labels.pageSize12x19,
    '17x24': labels.pageSize17x24,
    '21x28': labels.pageSize21x28,
    broadsheet: labels.pageSizeBroadsheetDescription,
    berliner: labels.pageSizeBerlinerDescription,
    tabloid: labels.pageSizeTabloidDescription,
    compact: labels.pageSizeCompactDescription,
    custom: labels.pageSizeCustomDescription,
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = ORDER.indexOf(value);
    let next: number | null = null;
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight') || e.key === 'ArrowDown') next = (index + 1) % ORDER.length;
    else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft') || e.key === 'ArrowUp') next = (index - 1 + ORDER.length) % ORDER.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ORDER.length - 1;
    if (next === null) return;
    e.preventDefault();
    onChange(ORDER[next]!);
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };

  const radio = (preset: PageSizePreset, selected: boolean) => ({
    type: 'button' as const,
    role: 'radio' as const,
    'aria-checked': selected,
    'aria-description': descriptions[preset],
    title: descriptions[preset],
    tabIndex: selected ? 0 : -1,
    onClick: () => { if (!selected) onChange(preset); },
  });

  const card = (preset: Preset, scale: number) => {
    const selected = preset === value;
    const size = PAGE_SIZE_PRESETS[preset];
    const w = toPt(size.width) * scale;
    const h = toPt(size.height) * scale;
    return (
      <button
        key={preset}
        {...radio(preset, selected)}
        className={cn(
          'flex min-w-0 pt-large:min-h-11 cursor-pointer flex-col items-center justify-end gap-1 rounded-md border px-0.5 pt-1.5 pb-1 transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand)',
          selected
            ? 'border-(--brand) bg-(--brand-soft,var(--surface)) text-(--foreground)'
            : 'border-transparent text-(--slate) hover:border-(--pt-control-border) hover:text-(--foreground)',
        )}
      >
        <span aria-hidden="true" className="flex items-end justify-center" style={{ height: DRAWN }}>
          <span
            className={cn('block rounded-[1px] border', selected ? 'border-(--brand) bg-(--brand)/20' : 'border-current bg-current/8')}
            style={{ width: w, height: h }}
          />
        </span>
        <span className="flex w-full flex-col items-center text-center leading-[1.2]">
          <span className="w-full truncate text-[0.64rem] font-medium tabular-nums">
            {names[preset] ?? `${size.width.value} × ${size.height.value}`}
          </span>
          <span className="w-full truncate text-[0.56rem] tabular-nums opacity-80">
            {names[preset] ? `${size.width.value} × ${size.height.value}` : size.width.unit}
          </span>
        </span>
      </button>
    );
  };

  const scaleOf = (family: readonly Preset[]) => DRAWN / Math.max(...family.map((p) => toPt(PAGE_SIZE_PRESETS[p].height)));
  const family = (title: string, presets: readonly Preset[]) => (
    <div className="flex flex-col gap-0.5">
      <span aria-hidden="true" className="text-[0.6rem] tracking-[0.1em] text-(--slate) pt-caps">{title}</span>
      <div className="grid grid-cols-4 gap-0.5">{presets.map((p) => card(p, scaleOf(presets)))}</div>
    </div>
  );
  const custom = value === 'custom';

  return (
    <div
      role="radiogroup"
      aria-labelledby={ids?.labelId}
      aria-describedby={ids?.descriptionId}
      onKeyDown={onKeyDown}
      className="flex w-full flex-col gap-1.5 rounded-md border border-(--rule) p-1.5"
    >
      {family(labels.pageFormatBooks, BOOKS)}
      {family(labels.pageFormatPress, PRESS)}
      <button
        {...radio('custom', custom)}
        className={cn(
          'flex min-h-7 pt-large:min-h-11 w-full cursor-pointer items-center gap-2 rounded-md border px-2 text-start text-[0.68rem] transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand)',
          custom
            ? 'border-(--brand) bg-(--brand-soft,var(--surface)) font-medium text-(--foreground)'
            : 'border-transparent text-(--slate) hover:border-(--pt-control-border) hover:text-(--foreground)',
        )}
      >
        <span aria-hidden="true" className={cn('block h-3.5 w-2.5 shrink-0 rounded-[1px] border border-dashed', custom ? 'border-(--brand)' : 'border-current')} />
        {names.custom}
      </button>
    </div>
  );
}
