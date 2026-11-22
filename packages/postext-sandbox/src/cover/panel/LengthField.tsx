'use client';

// One measure of a binding profile (#1669): a length in millimetres, a
// share of the trim's width or height kept between a least and a most, or
// steps by trim size (up to a size, so many millimetres), as printers give
// them. Left unset, the style's default shows and is used.

import { Minus, Plus } from 'lucide-react';
import { resolveLength, type ProductionLength, type ProductionLengthStep, type TrimMm } from 'postext/production';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { NumberInput, SelectInput } from '../../controls/index.js';
import { ShowingDefaultsContext } from '../../controls/fieldContext.js';
import { Button, IconButton } from '../../ui/index.js';

type Mode = 'fixed' | 'ratio' | 'steps';

const modeOf = (l: ProductionLength): Mode => (typeof l === 'number' ? 'fixed' : Array.isArray(l) ? 'steps' : 'ratio');
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export function LengthField({ label, value, fallback, trim, onChange }: {
  label: string;
  /** The profile's own; undefined while the style's default is used. */
  value: ProductionLength | undefined;
  fallback: ProductionLength;
  trim: TrimMm;
  onChange: (next: ProductionLength | undefined) => void;
}) {
  const labels = useSandboxLabels();
  const shown = value ?? fallback;
  const mode = modeOf(shown);
  const mm = resolveLength(shown, trim);
  // A value the same as the style's default (a copied profile carries
  // them all) is not marked as changed.
  const same = value === undefined || JSON.stringify(value) === JSON.stringify(fallback);
  const reset = same ? undefined : () => onChange(undefined);
  const switchTo = (m: string) => {
    if (m === mode) return;
    if (m === 'fixed') onChange(round(mm));
    else if (m === 'ratio') onChange({ ratio: round(mm / trim.width, 4), of: 'width' });
    else onChange([{ mm: round(mm) }]);
  };
  // A profile's own value against its style's default: marked and reset,
  // though the profile's other fields (its name, printer) are not.
  return (
    <ShowingDefaultsContext.Provider value={false}>
    <div className="flex flex-col border-b border-(--rule)/40 pb-1">
      <SelectInput
        label={label}
        value={mode}
        isDefault={same}
        {...(reset ? { onReset: reset } : {})}
        options={[
          { value: 'fixed', label: labels.coverMeasureFixed },
          { value: 'ratio', label: labels.coverMeasureRatio },
          { value: 'steps', label: labels.coverMeasureSteps },
        ]}
        onChange={switchTo}
      />
      {typeof shown === 'number' && (
        <NumberInput isDefault={same} label={labels.coverMeasureMm} value={shown} min={0} max={200} step={0.5} suffix="mm" onChange={(v) => onChange(v)} />
      )}
      {mode === 'ratio' && typeof shown === 'object' && !Array.isArray(shown) && (
        <>
          <NumberInput isDefault={same} label={labels.coverMeasureShare} value={round(shown.ratio * 100, 2)} min={0} max={100} step={0.5} suffix="%" onChange={(v) => onChange({ ...shown, ratio: v / 100 })} />
          <SelectInput
            label={labels.coverMeasureOf}
            isDefault={same}
            value={shown.of ?? 'width'}
            variant="segmented"
            options={[{ value: 'width', label: labels.coverMeasureOfWidth }, { value: 'height', label: labels.coverMeasureOfHeight }]}
            onChange={(of) => onChange({ ...shown, of: of === 'height' ? 'height' : 'width' })}
          />
          <NumberInput isDefault={same} label={labels.coverMeasureMin} tooltip={labels.coverMeasureNoLimit} value={shown.min ?? 0} min={0} max={500} step={1} suffix="mm" onChange={(v) => onChange({ ...shown, min: v > 0 ? v : undefined })} />
          <NumberInput isDefault={same} label={labels.coverMeasureMax} tooltip={labels.coverMeasureNoLimit} value={shown.max ?? 0} min={0} max={500} step={1} suffix="mm" onChange={(v) => onChange({ ...shown, max: v > 0 ? v : undefined })} />
        </>
      )}
      {Array.isArray(shown) && <Steps steps={shown} same={same} onChange={onChange} />}
      <p className="px-3 pb-1 text-xs text-(--slate)">{labels.coverMeasureHere.replace('__mm__', String(round(mm, 1)))}</p>
    </div>
    </ShowingDefaultsContext.Provider>
  );
}

function Steps({ steps, same, onChange }: { steps: ProductionLengthStep[]; same: boolean; onChange: (next: ProductionLength) => void }) {
  const labels = useSandboxLabels();
  const set = (i: number, patch: Partial<ProductionLengthStep>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const upTo = (s: ProductionLengthStep, side: 'width' | 'height', v: number): Partial<ProductionLengthStep> => {
    const next = { width: s.upTo?.width ?? 0, height: s.upTo?.height ?? 0, [side]: v };
    return { upTo: next.width > 0 || next.height > 0 ? next : undefined };
  };
  return (
    <ol className="flex flex-col" aria-label={labels.coverMeasureSteps}>
      {steps.map((s, i) => (
        <li key={i} className="flex flex-col border-s-2 border-(--rule) ms-3">
          <NumberInput isDefault={same} label={labels.coverMeasureUpToWidth} tooltip={labels.coverMeasureAnySize} value={s.upTo?.width ?? 0} min={0} max={1000} step={1} suffix="mm" onChange={(v) => set(i, upTo(s, 'width', v))} />
          <NumberInput isDefault={same} label={labels.coverMeasureUpToHeight} tooltip={labels.coverMeasureAnySize} value={s.upTo?.height ?? 0} min={0} max={1000} step={1} suffix="mm" onChange={(v) => set(i, upTo(s, 'height', v))} />
          <div className="flex items-center">
            <div className="flex-1"><NumberInput isDefault={same} label={labels.coverMeasureMm} value={s.mm} min={0} max={200} step={0.5} suffix="mm" onChange={(v) => set(i, { mm: v })} /></div>
            {steps.length > 1 && (
              <IconButton label={labels.coverMeasureRemoveStep} icon={<Minus size={13} />} onClick={() => onChange(steps.filter((_, j) => j !== i))} />
            )}
          </div>
        </li>
      ))}
      <li className="px-3 py-1">
        <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={() => onChange([...steps, { mm: steps[steps.length - 1]?.mm ?? 0 }])}>{labels.coverMeasureAddStep}</Button>
      </li>
    </ol>
  );
}
