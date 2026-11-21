'use client';

/**
 * An element, effect, logo or finish selected in the cover designer: its
 * place and size, its colour and effects, its mask or outline, and its
 * order in its layer.
 */

import { ArrowDown, ArrowUp, Copy, PenTool, Trash2 } from 'lucide-react';
import { type CoverFinishKind } from 'postext';
import { Button, IconButton, NumberField, Select, Switch } from '../../ui/index.js';
import { fill } from '../../print/fillTokens.js';
import {
  FINISH_KINDS,
  type CoverElementSetting,
  type CoverFinishSetting,
  type ItemLayer,
} from '../model/coverLayers.js';
import { CoverEffectsFields } from './CoverEffectsFields.js';
import { type GalleryPicture, type GalleryTrace } from '../library/coverGallery.js';
import type { Labels } from '../productionUi.js';
import { round1 } from './designerLabels.js';


/** An item's own name, kept when the field is left (empty: none). */
export function NameField({ value, label, onChange }: { value: string | undefined; label: string; onChange: (name: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      {label}
      <input
        type="text"
        defaultValue={value ?? ''}
        onBlur={(e) => { const name = e.target.value.trim(); if (name !== (value ?? '')) onChange(name); }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="rounded border border-(--pt-control-border) bg-(--background) px-2 py-1 text-xs text-(--foreground)"
      />
    </label>
  );
}
/** The value of an outline the design keeps whose trace was deleted since. */
export const KEPT = '__kept__';
/** The selected item's place, size and colour (an effect's opacity, a
 *  logo's clear space), and its order. A picture's height follows its
 *  width (its proportions). */
export function ElementProperties({ el, layer, zone, aspect, clearance, traces, masks, mask, onMask, points, onPoints, canForward, canBackward, labels, onChange, onClearance, onSize, onRestack, onDelete, onDuplicate }: {
  /** The gallery's masks, the one the picture is masked with, and how to
   *  mask it (none for a picture that is not the gallery's). */
  masks: readonly GalleryPicture[];
  mask: { mask: string; invert: boolean } | undefined;
  onMask: ((mask: string | undefined, invert: boolean) => void) | undefined;
  points: boolean;
  onPoints: (on: boolean) => void;
  el: CoverElementSetting;
  traces: readonly GalleryTrace[];
  layer: ItemLayer;
  zone: string;
  aspect: number | undefined;
  clearance: number | undefined;
  canForward: boolean;
  canBackward: boolean;
  labels: Labels;
  onChange: (el: CoverElementSetting) => void;
  onClearance: (mm: number) => void;
  onSize: (width: number, height: number) => void;
  onRestack: (step: 1 | -1) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const row = (label: string, value: number, set: (v: number) => void, min?: number, max?: number, step = 0.5) => (
    <label className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <NumberField value={round1(value)} onValueChange={set} step={step} widthCh={6} ariaLabel={label} {...(min !== undefined ? { min } : {})} {...(max !== undefined ? { max } : {})} />
    </label>
  );
  const title = layer === 'logos' ? labels.coverItemLogo : layer === 'effects' ? labels.coverItemEffect : el.kind === 'image' ? labels.coverElementPicture : el.kind === 'shape' ? labels.coverElementShape : labels.coverElementBox;
  return (
    <>
      <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-(--slate)">{title}</h3>
      <NameField key={el.id} value={el.name} label={labels.productionGalleryName} onChange={(name) => { const next = { ...el }; if (name) next.name = name; else delete next.name; onChange(next); }} />
      <p className="m-0 text-(--slate)">{fill(labels.coverElementZone, { zone })}</p>
      {row(labels.coverElementX, el.x, (x) => onChange({ ...el, x }))}
      {row(labels.coverElementY, el.y, (y) => onChange({ ...el, y }))}
      {row(labels.coverElementWidth, el.width, (w) => onSize(w, aspect ? w / aspect : el.height), 2)}
      {row(labels.coverElementHeight, el.height, (h) => onSize(aspect ? h * aspect : el.width, h), 2)}
      {el.kind !== 'image' && (
        <label className="flex items-center justify-between gap-2">
          <span>{labels.coverElementColor}</span>
          <input
            type="color"
            aria-label={labels.coverElementColor}
            value={el.color ?? '#808080'}
            onChange={(e) => onChange({ ...el, color: e.target.value })}
            className="h-6 w-9 cursor-pointer rounded border border-(--pt-control-border) bg-transparent p-0"
          />
        </label>
      )}
      {layer === 'effects' && el.kind !== 'image' && row(labels.coverElementOpacity, (el.opacity ?? 1) * 100, (v) => {
        const o = Math.max(0, Math.min(100, v)) / 100;
        const next = { ...el };
        if (o >= 1) delete next.opacity;
        else next.opacity = o;
        onChange(next);
      }, 0, 100, 5)}
      {layer === 'elements' && (
        <label className="flex items-center justify-between gap-2">
          <span>{labels.coverElementMirror}</span>
          <Switch
            checked={el.bleed !== 'own'}
            onCheckedChange={(on) => {
              const next = { ...el };
              if (on) delete next.bleed;
              else next.bleed = 'own';
              onChange(next);
            }}
            ariaLabel={labels.coverElementMirror}
          />
        </label>
      )}
      {layer === 'elements' && <p className="m-0 text-(--slate)">{el.bleed === 'own' ? labels.coverElementMirrorOff : labels.coverElementMirrorOn}</p>}
      {(layer === 'elements' || layer === 'effects') && el.kind === 'image' && onMask && (masks.length > 0 || mask) && (
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1">
            {labels.coverElementMask}
            <Select
              size="sm"
              value={mask?.mask ?? ''}
              onValueChange={(id) => onMask(id || undefined, mask?.invert ?? false)}
              options={[{ value: '', label: labels.coverElementMaskNone }, ...masks.map((m) => ({ value: m.id, label: m.name }))]}
              ariaLabel={labels.coverElementMask}
            />
          </label>
          {mask && (
            <label className="flex items-center justify-between gap-2">
              <span>{labels.coverElementMaskInvert}</span>
              <Switch checked={mask.invert} onCheckedChange={(on) => onMask(mask.mask, on)} ariaLabel={labels.coverElementMaskInvert} />
            </label>
          )}
        </div>
      )}
      {(layer === 'elements' || layer === 'effects') && el.kind === 'image' && (traces.length > 0 || el.clip) && (
        <label className="flex flex-col gap-1">
          {labels.coverElementClip}
          <Select
            size="sm"
            value={el.clip ? (traces.find((t) => JSON.stringify(t.outline) === JSON.stringify(el.clip))?.id ?? KEPT) : ''}
            onValueChange={(id) => {
              const next = { ...el };
              const t = traces.find((x) => x.id === id);
              if (t) next.clip = t.outline;
              else if (id === '') delete next.clip;
              onChange(next);
            }}
            options={[
              { value: '', label: labels.coverElementClipNone },
              ...(el.clip && !traces.some((t) => JSON.stringify(t.outline) === JSON.stringify(el.clip)) ? [{ value: KEPT, label: labels.coverFinishShapeOutline }] : []),
              ...traces.map((t) => ({ value: t.id, label: t.name })),
            ]}
            ariaLabel={labels.coverElementClip}
          />
        </label>
      )}
      {el.kind === 'shape' && (
        <div className="flex flex-col gap-1">
          <Button variant={points ? 'primary' : 'outline'} size="sm" icon={<PenTool size={13} />} onClick={() => onPoints(!points)}>
            {points ? labels.coverPointsDone : labels.coverPointsEdit}
          </Button>
          {points && <p className="m-0 text-(--slate)">{labels.coverPointsHint}</p>}
        </div>
      )}
      {(layer === 'elements' || layer === 'effects') && el.kind !== 'image' && <CoverEffectsFields el={el} labels={labels} onChange={onChange} />}
      {layer === 'logos' && clearance !== undefined && row(labels.coverLogoClearance, clearance, (v) => onClearance(Math.max(0, v)), 0)}
      <div className="flex items-center gap-1">
        <IconButton label={labels.coverElementForward} icon={<ArrowUp size={14} aria-hidden="true" />} disabled={!canForward} onClick={() => onRestack(1)} />
        <IconButton label={labels.coverElementBackward} icon={<ArrowDown size={14} aria-hidden="true" />} disabled={!canBackward} onClick={() => onRestack(-1)} />
        <IconButton label={labels.coverElementDuplicate} icon={<Copy size={14} aria-hidden="true" />} onClick={onDuplicate} />
        <IconButton label={labels.coverElementDelete} icon={<Trash2 size={14} aria-hidden="true" />} onClick={onDelete} />
      </div>
    </>
  );
}
/** A finish's kind, the ink its plate is named after, and its shape: a box
 *  of its own (moved on the canvas) or an element's. */
export function FinishProperties({ finish, targets, traces, zone, labels, finishLabel, onChange, onBox, onTrace, canForward, canBackward, onRestack, onDelete, onDuplicate }: {
  finish: CoverFinishSetting;
  targets: { value: string; label: string }[];
  traces: readonly GalleryTrace[];
  onTrace: (t: GalleryTrace) => void;
  zone?: string;
  labels: Labels;
  finishLabel: (k: CoverFinishKind) => string;
  onChange: (f: CoverFinishSetting) => void;
  onBox: () => void;
  canForward: boolean;
  canBackward: boolean;
  onRestack: (step: 1 | -1) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const ofElement = 'element' in finish.shape;
  const ofOutline = 'outline' in finish.shape;
  // The saved outline the finish lies on (by its points: the design keeps
  // a copy of them, not the trace).
  const laidOn = ofOutline ? traces.find((t) => JSON.stringify(t.outline) === JSON.stringify((finish.shape as { outline: unknown }).outline)) : undefined;
  return (
    <>
      <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-(--slate)">{labels.coverItemFinish}</h3>
      <NameField key={finish.id} value={finish.name} label={labels.productionGalleryName} onChange={(name) => { const next = { ...finish }; if (name) next.name = name; else delete next.name; onChange(next); }} />
      <label className="flex flex-col gap-1">
        {labels.coverFinishKind}
        <Select
          size="sm"
          value={finish.kind}
          onValueChange={(kind) => onChange({ ...finish, kind: kind as CoverFinishKind })}
          options={FINISH_KINDS.map((k) => ({ value: k, label: finishLabel(k) }))}
          ariaLabel={labels.coverFinishKind}
        />
      </label>
      <label className="flex flex-col gap-1">
        {labels.coverFinishInk}
        <input
          type="text"
          value={finish.ink}
          onChange={(e) => onChange({ ...finish, ink: e.target.value })}
          className="rounded border border-(--pt-control-border) bg-(--background) px-2 py-1 text-xs text-(--foreground)"
        />
      </label>
      <div className="flex flex-col gap-1">
        {labels.coverFinishShape}
        <Select
          size="sm"
          value={ofElement ? 'element' : ofOutline ? 'outline' : 'box'}
          onValueChange={(v) => {
            if (v === 'box') onBox();
            else if (v === 'outline') { if (traces[0]) onTrace(traces[0]); }
            else if (targets[0]) onChange({ ...finish, shape: { element: targets[0].value } });
          }}
          options={[
            { value: 'box', label: labels.coverFinishShapeBox },
            ...(targets.length > 0 ? [{ value: 'element', label: labels.coverFinishShapeElement }] : []),
            ...(traces.length > 0 ? [{ value: 'outline', label: labels.coverFinishShapeOutline }] : []),
          ]}
          ariaLabel={labels.coverFinishShape}
        />
      </div>
      {ofElement ? (
        <Select
          size="sm"
          value={(finish.shape as { element: string }).element}
          onValueChange={(id) => onChange({ ...finish, shape: { element: id } })}
          options={targets}
          ariaLabel={labels.coverFinishShapeElement}
        />
      ) : zone ? (
        <p className="m-0 text-(--slate)">{fill(labels.coverElementZone, { zone })}</p>
      ) : null}
      {ofOutline && (
        <Select
          size="sm"
          value={laidOn?.id ?? ''}
          onValueChange={(id) => { const t = traces.find((x) => x.id === id); if (t) onTrace(t); }}
          options={[...(laidOn ? [] : [{ value: '', label: labels.coverFinishShapeOutline }]), ...traces.map((t) => ({ value: t.id, label: t.name }))]}
          ariaLabel={labels.coverFinishShapeOutline}
        />
      )}
      <p className="m-0 text-(--slate)">{labels.coverFinishPlateHint}</p>
      <div className="flex items-center gap-1">
        <IconButton label={labels.coverElementForward} icon={<ArrowUp size={14} aria-hidden="true" />} disabled={!canForward} onClick={() => onRestack(1)} />
        <IconButton label={labels.coverElementBackward} icon={<ArrowDown size={14} aria-hidden="true" />} disabled={!canBackward} onClick={() => onRestack(-1)} />
        <IconButton label={labels.coverElementDuplicate} icon={<Copy size={14} aria-hidden="true" />} onClick={onDuplicate} />
        <IconButton label={labels.coverElementDelete} icon={<Trash2 size={14} aria-hidden="true" />} onClick={onDelete} />
      </div>
    </>
  );
}
