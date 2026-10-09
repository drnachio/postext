'use client';

import { Ban, Plus, Trash2 } from 'lucide-react';
import type { Dimension, DimensionUnit, TabStop, TabStopAlign, TabStopPosition } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { DimensionInput, NumberInput, SelectInput, TextInput } from '../../controls';
import { FieldRow } from '../../controls/FieldRow';
import { defaultDocumentLocale } from '../../controls/hyphenation';
import { Button, IconButton } from '../../ui';
import { SearchScope } from '../search/SearchScope';

/**
 * The tab stops of body text, a paragraph style or a callout's body
 * (#622): a list of stops (where each stands, how the text after the tab
 * sits on it, its leader) and the default interval past the last one.
 */

const POSITION_UNITS: DimensionUnit[] = ['mm', 'cm', 'in', 'pt', 'em'];
const GAP_UNITS: DimensionUnit[] = ['em', 'pt', 'mm'];
/** The engine's `DEFAULT_TAB_LEADER_GAP` (the contents' `leader.gap`). */
const DEFAULT_LEADER_GAP: Dimension = { value: 0.5, unit: 'em' };
const NO_INTERVAL: Dimension = { value: 0, unit: 'cm' };

/** The leaders the list offers; any other text is `custom`. */
const LEADER_PRESETS = ['.', '. ', '·', '-', '_', 'rule'] as const;
/** What choosing "Other text" writes, to be edited. */
const CUSTOM_LEADER_SEED = '•';
const MAX_LEADER_LENGTH = 4;

type PositionKind = 'length' | 'end' | 'percent';

function positionKind(position: TabStopPosition): PositionKind {
  if (position === 'end') return 'end';
  return typeof position === 'string' ? 'percent' : 'length';
}

/** Where a new stop goes: 2 cm past the last stop set as a length in cm,
 *  else 2 cm per stop already there. */
function nextPosition(stops: readonly TabStop[]): Dimension {
  const last = [...stops].reverse().find((s) => typeof s.position === 'object' && s.position.unit === 'cm');
  if (last && typeof last.position === 'object') return { value: last.position.value + 2, unit: 'cm' };
  return { value: 2 * (stops.length + 1), unit: 'cm' };
}

/** The decimal separator the engine takes for a language (Latin digits),
 *  as its `defaultDecimalChar`. */
function decimalCharFor(locale: string): string {
  try {
    const parts = new Intl.NumberFormat(locale, { numberingSystem: 'latn' } as Intl.NumberFormatOptions).formatToParts(1.5);
    return parts.find((p) => p.type === 'decimal')?.value ?? '.';
  } catch {
    return '.';
  }
}

/** A stop with `field` left out. */
function without(stop: TabStop, field: Exclude<keyof TabStop, 'position'>): TabStop {
  const next = { ...stop };
  delete next[field];
  return next;
}

interface TabStopsFieldProps {
  /** The stops as stored here; undefined when unset. */
  stops: TabStop[] | undefined;
  /** The default interval as stored here; undefined when unset. */
  interval: Dimension | undefined;
  /** Undefined unsets the key; `[]` is kept only from the None button. */
  onStopsChange: (next: TabStop[] | undefined) => void;
  onIntervalChange: (next: Dimension | undefined) => void;
  /** A paragraph style or a callout body: unset, it takes the body
   *  text's stops and interval (shown as `inheritedInterval`), and an
   *  empty list sets none. */
  inherits?: boolean;
  inheritedInterval?: Dimension;
}

export function TabStopsField({ stops, interval, onStopsChange, onIntervalChange, inherits = false, inheritedInterval }: TabStopsFieldProps) {
  const labels = useSandboxLabels();
  const locale = useSandboxSelector((s) => s.config.locale ?? s.config.bodyText?.hyphenation?.locale ?? defaultDocumentLocale(s.locale));
  const list = stops ?? [];

  const write = (next: TabStop[]) => onStopsChange(next.length > 0 ? next : undefined);
  const update = (i: number, next: TabStop) => write(list.map((s, k) => (k === i ? next : s)));
  const add = () => write([...list, { position: nextPosition(list) }]);
  const remove = (i: number) => write(list.filter((_, k) => k !== i));

  const hint = inherits
    ? stops === undefined
      ? labels.tabStopsInherited
      : stops.length === 0 ? labels.tabStopsNoneSet : undefined
    : undefined;

  const shownInterval = interval ?? (inherits ? inheritedInterval : undefined) ?? NO_INTERVAL;
  const writeInterval = (d: Dimension) => {
    // 0 sets no default stops: unset, unless it overrides the body's.
    if (d.value > 0 || (inherits && inheritedInterval && inheritedInterval.value > 0)) onIntervalChange(d);
    else onIntervalChange(undefined);
  };

  return (
    <>
      <FieldRow
        stacked
        label={labels.tabStops}
        tooltip={labels.tabStopsTooltip}
        hint={hint}
        isDefault={stops === undefined}
        onReset={() => onStopsChange(undefined)}
      >
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={add}>
            {labels.tabStopsAdd}
          </Button>
          {inherits && stops === undefined && (
            <Button variant="ghost" size="xs" icon={<Ban size={12} />} onClick={() => onStopsChange([])}>
              {labels.tabStopsNone}
            </Button>
          )}
        </div>
      </FieldRow>
      {list.map((stop, i) => (
        <TabStopCard
          // Stops have no id; their place in the list names them.
          key={i}
          index={i}
          stop={stop}
          decimalDefault={decimalCharFor(locale)}
          onChange={(next) => update(i, next)}
          onRemove={() => remove(i)}
        />
      ))}
      <DimensionInput
        label={labels.tabInterval}
        value={shownInterval}
        onChange={writeInterval}
        min={0}
        step={0.1}
        units={POSITION_UNITS}
        tooltip={labels.tabIntervalTooltip}
        isDefault={interval === undefined}
        onReset={() => onIntervalChange(undefined)}
      />
    </>
  );
}

interface TabStopCardProps {
  index: number;
  stop: TabStop;
  decimalDefault: string;
  onChange: (next: TabStop) => void;
  onRemove: () => void;
}

function TabStopCard({ index, stop, decimalDefault, onChange, onRemove }: TabStopCardProps) {
  const labels = useSandboxLabels();
  const n = String(index + 1);
  const kind = positionKind(stop.position);
  const align: TabStopAlign = stop.align ?? 'start';
  const leader = stop.leader;
  const leaderValue = leader === undefined || leader === ''
    ? 'none'
    : (LEADER_PRESETS as readonly string[]).includes(leader) ? leader : 'custom';

  const setKind = (next: string) => {
    if (next === kind) return;
    const position: TabStopPosition = next === 'end' ? 'end' : next === 'percent' ? '50%' : { value: 2 * (index + 1), unit: 'cm' };
    onChange({ ...stop, position });
  };

  const setLeader = (value: string) => {
    if (value === 'none') onChange(without(stop, 'leader'));
    else if (value === 'custom') onChange({ ...stop, leader: CUSTOM_LEADER_SEED });
    else onChange({ ...stop, leader: value });
  };

  const title = labels.tabStopItem.replace('__n__', n);
  return (
    <SearchScope title={`${labels.tabStops} ${title}`} overridden>
    <div className="@container mb-2 ms-1 rounded border border-(--rule) p-2">
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="text-xs font-medium text-(--foreground)">{title}</span>
        <IconButton label={labels.tabStopRemove.replace('__n__', n)} icon={<Trash2 size={13} />} destructive onClick={onRemove} />
      </div>
      <SelectInput
        label={labels.tabStopPosition}
        value={kind}
        options={[
          { value: 'length', label: labels.tabStopPositionLength },
          { value: 'end', label: labels.tabStopPositionEnd },
          { value: 'percent', label: labels.tabStopPositionPercent },
        ]}
        onChange={setKind}
        tooltip={labels.tabStopPositionTooltip}
      />
      {kind === 'length' && typeof stop.position === 'object' && (
        <DimensionInput
          label={labels.tabStopDistance}
          value={stop.position}
          onChange={(position) => onChange({ ...stop, position })}
          min={0}
          step={0.1}
          units={POSITION_UNITS}
        />
      )}
      {kind === 'percent' && (
        <NumberInput
          label={labels.tabStopPercent}
          value={parseFloat(String(stop.position)) || 0}
          onChange={(v) => onChange({ ...stop, position: `${v}%` })}
          min={0}
          max={100}
          step={1}
          suffix="%"
        />
      )}
      <SelectInput
        label={labels.tabStopAlign}
        value={align}
        variant="segmented"
        options={[
          { value: 'start', label: labels.tabStopAlignStart },
          { value: 'end', label: labels.tabStopAlignEnd },
          { value: 'center', label: labels.tabStopAlignCenter },
          { value: 'decimal', label: labels.tabStopAlignDecimal },
        ]}
        onChange={(v) => onChange(v === 'start' ? without(stop, 'align') : { ...stop, align: v as TabStopAlign })}
        tooltip={labels.tabStopAlignTooltip}
        isDefault={stop.align === undefined}
        onReset={() => onChange(without(stop, 'align'))}
      />
      {align === 'decimal' && (
        <TextInput
          label={labels.tabStopDecimalChar}
          value={stop.decimalChar ?? ''}
          placeholder={decimalDefault}
          onChange={(v) => {
            const ch = Array.from(v.trim())[0];
            onChange(ch ? { ...stop, decimalChar: ch } : without(stop, 'decimalChar'));
          }}
          widthCh={4}
          tooltip={labels.tabStopDecimalCharTooltip}
          isDefault={stop.decimalChar === undefined}
          onReset={() => onChange(without(stop, 'decimalChar'))}
        />
      )}
      <SelectInput
        label={labels.tabStopLeader}
        value={leaderValue}
        options={[
          { value: 'none', label: labels.tabStopLeaderNone },
          { value: '.', label: labels.tabStopLeaderDots, description: '.........' },
          { value: '. ', label: labels.tabStopLeaderSpacedDots, description: '. . . . .' },
          { value: '·', label: labels.tabStopLeaderMiddleDots, description: '·········' },
          { value: '-', label: labels.tabStopLeaderHyphens, description: '---------' },
          { value: '_', label: labels.tabStopLeaderUnderscores, description: '_________' },
          { value: 'rule', label: labels.tabStopLeaderRule },
          { value: 'custom', label: labels.tabStopLeaderCustom },
        ]}
        onChange={setLeader}
        tooltip={labels.tabStopLeaderTooltip}
        isDefault={leader === undefined}
        onReset={() => onChange(without(stop, 'leader'))}
      />
      {leaderValue === 'custom' && (
        <TextInput
          label={labels.tabStopLeaderText}
          value={leader ?? ''}
          onChange={(v) => {
            const text = Array.from(v).slice(0, MAX_LEADER_LENGTH).join('');
            onChange(text.trim().length > 0 ? { ...stop, leader: text } : without(stop, 'leader'));
          }}
          widthCh={6}
        />
      )}
      {leaderValue !== 'none' && (
        <DimensionInput
          label={labels.tabStopLeaderGap}
          value={stop.leaderGap ?? DEFAULT_LEADER_GAP}
          onChange={(leaderGap) => onChange({ ...stop, leaderGap })}
          min={0}
          step={0.1}
          units={GAP_UNITS}
          tooltip={labels.tabStopLeaderGapTooltip}
          isDefault={stop.leaderGap === undefined}
          onReset={() => onChange(without(stop, 'leaderGap'))}
        />
      )}
    </div>
    </SearchScope>
  );
}
