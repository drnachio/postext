'use client';

/**
 * Shape fields shared by callout and frame styles and by decoration boxes
 * (#1063): a radius per corner and a border per side, each linked (one
 * value) or unlinked (one per corner or side), and a typed field checked as
 * it is written (dash patterns, path data).
 */

import { useEffect, useId, useState } from 'react';
import { isCornerRadii, type BorderSides, type ColorValue, type CornerRadius, type Dimension, type DimensionUnit } from 'postext';
import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { ColorPicker, DimensionInput, NestedGroup, ToggleSwitch } from '../../../../controls/index.js';
import { FieldRow } from '../../../../controls/FieldRow.js';
import { useFieldIds } from '../../../../controls/fieldContext.js';
import { cn } from '../../../../ui/index.js';
import { CORNERS, SIDES, cornerValues, formatDash, linkCorners, parseDash, setCorner, setSideField, sideValue, unlinkCorners, type Corner, type Side } from './shapeEdits.js';

interface CornerRadiusFieldsProps {
  /** The radius the style resolves to. */
  value: CornerRadius | undefined;
  /** What an unset radius shows. */
  fallback: Dimension;
  label: string;
  tooltip?: string;
  units?: DimensionUnit[];
  step?: number;
  isDefault?: boolean;
  onReset?: () => void;
  onChange: (next: CornerRadius) => void;
}

/** One radius for the four corners, or (unlinked) one per corner. */
export function CornerRadiusFields({ value, fallback, label, tooltip, units, step = 0.5, isDefault, onReset, onChange }: CornerRadiusFieldsProps) {
  const labels = useSandboxLabels();
  const linked = !(value && isCornerRadii(value));
  const corners = cornerValues(value, fallback);
  const cornerLabel: Record<Corner, string> = {
    topLeft: labels.shapeCornerTopLeft,
    topRight: labels.shapeCornerTopRight,
    bottomRight: labels.shapeCornerBottomRight,
    bottomLeft: labels.shapeCornerBottomLeft,
  };
  return (
    <>
      <ToggleSwitch
        label={labels.shapeCornersLinked}
        tooltip={labels.shapeCornersLinkedTooltip}
        checked={linked}
        onChange={(on) => onChange(on ? linkCorners(value, fallback) : unlinkCorners(value, fallback))}
        isDefault={linked}
        onReset={() => onChange(linkCorners(value, fallback))}
      />
      {linked ? (
        <DimensionInput label={label} tooltip={tooltip} value={corners.topLeft} onChange={(d) => onChange(d)} min={0} step={step} units={units} isDefault={isDefault} onReset={onReset} />
      ) : (
        <NestedGroup>
          {CORNERS.map((corner) => (
            <DimensionInput
              key={corner}
              label={cornerLabel[corner]}
              value={corners[corner]}
              onChange={(d) => onChange(setCorner(value, fallback, corner, d))}
              min={0}
              step={step}
              units={units}
              isDefault={corners[corner].value === 0}
              onReset={() => onChange(setCorner(value, fallback, corner, { value: 0, unit: corners[corner].unit }))}
            />
          ))}
        </NestedGroup>
      )}
    </>
  );
}

interface BorderSidesFieldsProps {
  /** The sides as stored (undefined: the whole border on every side). */
  sides: BorderSides | undefined;
  /** The whole border's values, which each side reads unless it sets its
   *  own. */
  whole: { enabled: boolean; color: ColorValue; width: Dimension };
  units?: DimensionUnit[];
  /** A prefix for the colour fields' ids. */
  fieldId: string;
  onChange: (next: BorderSides | undefined) => void;
}

/** The same border on every side, or (unlinked) each side on or off with
 *  its own colour and width over the whole border's. */
export function BorderSidesFields({ sides, whole, units, fieldId, onChange }: BorderSidesFieldsProps) {
  const labels = useSandboxLabels();
  const linked = sides === undefined;
  const sideName: Record<Side, string> = {
    top: labels.shapeSideTop,
    right: labels.shapeSideRight,
    bottom: labels.shapeSideBottom,
    left: labels.shapeSideLeft,
  };
  const name = (template: string, side: Side) => template.replace('__side__', sideName[side]);
  return (
    <>
      <ToggleSwitch
        label={labels.shapeSidesLinked}
        tooltip={labels.shapeSidesLinkedTooltip}
        checked={linked}
        onChange={(on) => onChange(on ? undefined : {})}
        isDefault={linked}
        onReset={() => onChange(undefined)}
      />
      {!linked && (
        <NestedGroup>
          {SIDES.map((side) => {
            const v = sideValue(sides, side, whole);
            const own = sides?.[side];
            return (
              <div key={side} data-border-side={side}>
                <ToggleSwitch
                  label={name(labels.shapeSideShow, side)}
                  checked={v.enabled}
                  onChange={(on) => onChange(setSideField(sides, side, 'enabled', on === whole.enabled ? undefined : on))}
                  isDefault={own?.enabled === undefined}
                  onReset={() => onChange(setSideField(sides, side, 'enabled', undefined))}
                />
                {v.enabled && (
                  <>
                    <ColorPicker
                      label={name(labels.shapeSideColor, side)}
                      value={v.color ?? whole.color}
                      onChange={(c) => onChange(setSideField(sides, side, 'color', c))}
                      isDefault={own?.color === undefined}
                      onReset={() => onChange(setSideField(sides, side, 'color', undefined))}
                      fieldId={`${fieldId}-side-${side}`}
                    />
                    <DimensionInput
                      label={name(labels.shapeSideWidth, side)}
                      value={v.width}
                      onChange={(d) => onChange(setSideField(sides, side, 'width', d))}
                      min={0}
                      step={0.1}
                      units={units}
                      isDefault={own?.width === undefined}
                      onReset={() => onChange(setSideField(sides, side, 'width', undefined))}
                    />
                  </>
                )}
              </div>
            );
          })}
        </NestedGroup>
      )}
    </>
  );
}

interface CheckedTextFieldProps {
  label: string;
  tooltip?: string;
  value: string;
  /** null: the text is fine (it is committed); a string: what is wrong
   *  with it (it is not). */
  check: (text: string) => string | null;
  onCommit: (text: string) => void;
  isDefault?: boolean;
  onReset?: () => void;
  placeholder?: string;
  monospace?: boolean;
}

/** A text field whose value is written only when it reads right; while it
 *  does not, the field says why (announced, and named as its description). */
export function CheckedTextField({ label, tooltip, value, check, onCommit, isDefault, onReset, placeholder, monospace }: CheckedTextFieldProps) {
  const [draft, setDraft] = useState(value);
  // A value changed elsewhere (a preset, an undo) replaces the draft.
  useEffect(() => setDraft(value), [value]);
  const problem = check(draft);
  const errorId = useId();
  return (
    <FieldRow stacked label={label} tooltip={tooltip} isDefault={isDefault} onReset={onReset} hint={problem ? <span id={errorId} role="alert" className="text-(--destructive)">{problem}</span> : undefined}>
      <CheckedTextControl
        value={draft}
        invalid={!!problem}
        errorId={problem ? errorId : undefined}
        placeholder={placeholder}
        monospace={monospace}
        onChange={(text) => {
          setDraft(text);
          if (check(text) === null && text !== value) onCommit(text);
        }}
      />
    </FieldRow>
  );
}

function CheckedTextControl({ value, invalid, errorId, placeholder, monospace, onChange }: { value: string; invalid: boolean; errorId?: string; placeholder?: string; monospace?: boolean; onChange: (text: string) => void }) {
  const ids = useFieldIds();
  const described = [ids?.descriptionId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <input
      dir="ltr"
      type="text"
      id={ids?.controlId}
      aria-describedby={described}
      aria-invalid={invalid || undefined}
      spellCheck={false}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-7 w-full pt-large:h-11 rounded-md border bg-(--surface) px-2 text-xs text-(--foreground) transition-colors outline-none',
        'placeholder:text-(--slate) hover:border-(--slate) focus:border-(--brand) focus:outline-2 focus:outline-offset-1 focus:outline-(--brand)',
        invalid ? 'border-(--destructive)' : 'border-(--pt-control-border)',
        monospace && 'font-mono',
      )}
    />
  );
}

/** A dash pattern (on, off, … in points unless a unit is written). */
export function DashField({ label, tooltip, value, onChange }: { label: string; tooltip?: string; value: readonly Dimension[] | undefined; onChange: (dash: Dimension[] | undefined) => void }) {
  const labels = useSandboxLabels();
  return (
    <CheckedTextField
      label={label}
      tooltip={tooltip}
      value={formatDash(value)}
      placeholder="3 2"
      check={(text) => (parseDash(text) === null ? labels.connectorDashInvalid : null)}
      onCommit={(text) => onChange(parseDash(text) ?? undefined)}
      isDefault={!value || value.length === 0}
      onReset={() => onChange(undefined)}
    />
  );
}
