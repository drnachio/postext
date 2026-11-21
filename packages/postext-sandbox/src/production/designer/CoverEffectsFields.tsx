'use client';

/**
 * The basic effects of a box or a shape in the designer: its corners (a
 * box's), a border, a gradient from its colour to another, and a soft
 * shadow. Each switches on with sensible values and shows its own fields
 * only while on.
 */

import type { ReactNode } from 'react';
import { NumberField, Switch } from '../../ui/index.js';
import type { CoverElementSetting } from '../model/coverLayers.js';
import type { Labels } from '../productionUi.js';

const round1 = (v: number) => Math.round(v * 10) / 10;

function Colour({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-9 cursor-pointer rounded border border-(--pt-control-border) bg-transparent p-0"
      />
    </label>
  );
}

function Num({ label, value, onChange, min, max, step = 0.5 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <NumberField value={round1(value)} onValueChange={onChange} step={step} widthCh={6} ariaLabel={label} {...(min !== undefined ? { min } : {})} {...(max !== undefined ? { max } : {})} />
    </label>
  );
}

/** One effect: its switch, and its fields while it is on. */
function Effect({ label, on, onToggle, children }: { label: string; on: boolean; onToggle: (on: boolean) => void; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center justify-between gap-2 font-medium">
        <span>{label}</span>
        <Switch checked={on} onCheckedChange={onToggle} ariaLabel={label} />
      </label>
      {on && <div className="flex flex-col gap-1.5 border-s-2 border-(--rule) ps-2">{children}</div>}
    </div>
  );
}

export function CoverEffectsFields({ el, labels, onChange }: { el: CoverElementSetting; labels: Labels; onChange: (el: CoverElementSetting) => void }) {
  const set = <K extends 'radius' | 'stroke' | 'gradient' | 'shadow'>(key: K, value: CoverElementSetting[K] | undefined) => {
    const next = { ...el };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(next);
  };
  const closed = el.kind === 'box' || (el.path ? el.path.some((p) => p.closed) : true);
  return (
    <div className="flex flex-col gap-2 border-t border-(--rule) pt-2">
      <h4 className="m-0 text-xs font-semibold">{labels.coverEffects}</h4>
      {el.kind === 'box' && (
        <Num label={labels.coverEffectRadius} value={el.radius ?? 0} min={0} onChange={(v) => set('radius', v > 0 ? v : undefined)} />
      )}
      <Effect label={labels.coverEffectStroke} on={!!el.stroke} onToggle={(on) => set('stroke', on ? { color: '#000000', width: 0.5 } : undefined)}>
        {el.stroke && (
          <>
            <Colour label={labels.coverElementColor} value={el.stroke.color} onChange={(color) => set('stroke', { ...el.stroke!, color })} />
            <Num label={labels.coverEffectWidth} value={el.stroke.width} min={0.1} step={0.25} onChange={(width) => set('stroke', { ...el.stroke!, width: Math.max(0.1, width) })} />
          </>
        )}
      </Effect>
      {closed && (
        <Effect label={labels.coverEffectGradient} on={!!el.gradient} onToggle={(on) => set('gradient', on ? { to: '#ffffff', angle: 90 } : undefined)}>
          {el.gradient && (
            <>
              <p className="m-0 text-(--slate)">{labels.coverEffectGradientHint}</p>
              <Colour label={labels.coverEffectGradientTo} value={el.gradient.to} onChange={(to) => set('gradient', { ...el.gradient!, to })} />
              <Num label={labels.coverEffectAngle} value={el.gradient.angle} step={15} onChange={(angle) => set('gradient', { ...el.gradient!, angle: ((angle % 360) + 360) % 360 })} />
            </>
          )}
        </Effect>
      )}
      {closed && (
        <Effect label={labels.coverEffectShadow} on={!!el.shadow} onToggle={(on) => set('shadow', on ? { color: '#000000', opacity: 0.35, x: 1.5, y: 1.5, blur: 3 } : undefined)}>
          {el.shadow && (
            <>
              <Colour label={labels.coverElementColor} value={el.shadow.color} onChange={(color) => set('shadow', { ...el.shadow!, color })} />
              <Num label={labels.coverElementOpacity} value={el.shadow.opacity * 100} min={0} max={100} step={5} onChange={(v) => set('shadow', { ...el.shadow!, opacity: Math.max(0, Math.min(100, v)) / 100 })} />
              <Num label={labels.coverEffectShadowX} value={el.shadow.x} onChange={(x) => set('shadow', { ...el.shadow!, x })} />
              <Num label={labels.coverEffectShadowY} value={el.shadow.y} onChange={(y) => set('shadow', { ...el.shadow!, y })} />
              <Num label={labels.coverEffectBlur} value={el.shadow.blur} min={0} onChange={(blur) => set('shadow', { ...el.shadow!, blur: Math.max(0, blur) })} />
            </>
          )}
        </Effect>
      )}
    </div>
  );
}
