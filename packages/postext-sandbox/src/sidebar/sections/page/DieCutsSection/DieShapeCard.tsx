'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { dimensionsEqual, type DieShape, type Dimension } from 'postext';
import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { DimensionInput, FieldRow, ItemCard, NestedGroup, NumberInput, SelectInput, TextInput, ToggleSwitch } from '../../../../controls/index.js';
import { ConfirmPopover, IconButton } from '../../../../ui/index.js';
import { SearchScope } from '../../../search/SearchScope.js';
import { CheckedTextField } from './CheckedTextField.js';
import { DieShapePreview } from './DieShapePreview.js';
import { slugifyDieId, validPathData } from './dieCutEdits.js';

export const SHAPES_LIST = 'dieShapes';

const DEFAULT_RADIUS: Dimension = { value: 3, unit: 'mm' };
const DEFAULT_GAP: Dimension = { value: 3, unit: 'mm' };
const VIEWBOX_MAX = 100000;

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';

interface Props {
  shape: DieShape;
  index: number;
  otherIds: ReadonlySet<string>;
  onChange: (partial: Partial<Omit<DieShape, 'id'>>) => void;
  onRename: (id: string) => void;
  onRemove: () => void;
}

/** One die shape (`dieCuts.shapes[]`): its id (renamed on blur or Enter,
 *  never to one another shape has), its name, its shape and box on the
 *  trim, a corner radius or SVG path, a live preview, how many leaves it
 *  goes through and whether text keeps clear of it. */
export function DieShapeCard({ shape, index, otherIds, onChange, onRename, onRemove }: Props) {
  const labels = useSandboxLabels();
  const [idDraft, setIdDraft] = useState(shape.id);
  const [seenId, setSeenId] = useState(shape.id);
  if (seenId !== shape.id) {
    setSeenId(shape.id);
    setIdDraft(shape.id);
  }
  const slug = slugifyDieId(idDraft);
  const idTaken = slug.length > 0 && slug !== shape.id && otherIds.has(slug);
  const idEmpty = slug.length === 0;
  const commitId = () => {
    if (idEmpty || idTaken) {
      setIdDraft(shape.id);
      return;
    }
    setIdDraft(slug);
    if (slug !== shape.id) onRename(slug);
  };

  const shapeOptions = [
    { value: 'rect', label: labels.dieCutsShapeRect },
    { value: 'roundRect', label: labels.dieCutsShapeRoundRect },
    { value: 'circle', label: labels.dieCutsShapeCircle },
    { value: 'ellipse', label: labels.dieCutsShapeEllipse },
    { value: 'path', label: labels.dieCutsShapePath },
  ];
  const title = shape.name?.trim() || shape.id;
  const wrapOn = shape.wrap !== false;
  const gap = shape.wrap ? shape.wrap.gap ?? DEFAULT_GAP : DEFAULT_GAP;
  const viewBox = shape.viewBox ?? [1, 1];
  const setViewBox = (i: 0 | 1, v: number) => {
    const next: [number, number] = [viewBox[0], viewBox[1]];
    next[i] = v > 0 ? v : 1;
    onChange({ viewBox: next });
  };
  const setShape = (v: string) => {
    const kind = v as DieShape['shape'];
    // A path starts as an ellipse-like curve in a unit box, for the
    // reader to replace with their own.
    onChange(kind === 'path' && !shape.d ? { shape: kind, d: 'M0.5 0 C0.9 0 1 0.4 1 0.5 C1 0.9 0.6 1 0.5 1 C0.1 1 0 0.6 0 0.5 C0 0.1 0.4 0 0.5 0 Z', viewBox: [1, 1] } : { shape: kind });
  };

  return (
    <SearchScope title={`${shape.name ?? ''} ${shape.id}`} overridden>
      <ItemCard
        list={SHAPES_LIST}
        id={String(index)}
        title={title}
        subtitle={shape.name?.trim() && shape.name.trim() !== shape.id ? shape.id : undefined}
        configPath={`dieCuts.shapes[${index}]`}
        actions={
          <ConfirmPopover message={labels.dieCutsShapeRemoveConfirm} onConfirm={onRemove}>
            {({ open }) => <IconButton label={`${labels.dieCutsShapeRemove}: ${title}`} icon={<Trash2 size={13} />} destructive onClick={open} />}
          </ConfirmPopover>
        }
      >
        <DieShapePreview shape={shape} label={labels.dieCutsPreview.replace('__id__', shape.id)} />
        <FieldRow stacked label={labels.dieCutsShapeId} tooltip={labels.dieCutsShapeIdTooltip} isDefault={false}
          hint={idTaken ? <span role="alert" style={{ color: 'var(--destructive)' }}>{labels.dieCutsShapeIdTaken}</span> : labels.dieCutsShapeIdHint.replace('__id__', shape.id)}>
          <input
            dir="ltr"
            type="text"
            value={idDraft}
            onChange={(e) => setIdDraft(e.target.value)}
            onBlur={commitId}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            aria-label={labels.dieCutsShapeId}
            className={inputClass}
            style={{ color: 'var(--foreground)', borderColor: idEmpty || idTaken ? 'var(--destructive)' : 'var(--pt-control-border)' }}
          />
        </FieldRow>
        <TextInput label={labels.dieCutsShapeName} value={shape.name ?? ''} onChange={(v) => onChange({ name: v.length > 0 ? v : undefined })}
          placeholder={shape.id} tooltip={labels.dieCutsShapeNameTooltip} isDefault={shape.name === undefined} onReset={() => onChange({ name: undefined })} />
        <SelectInput stacked label={labels.dieCutsShape} value={shape.shape} options={shapeOptions} onChange={setShape}
          tooltip={labels.dieCutsShapeTooltip} isDefault={false} />
        <DimensionInput label={labels.dieCutsX} value={shape.x} onChange={(x) => onChange({ x })} step={0.5} tooltip={labels.dieCutsXTooltip} isDefault={false} />
        <DimensionInput label={labels.dieCutsY} value={shape.y} onChange={(y) => onChange({ y })} step={0.5} tooltip={labels.dieCutsYTooltip} isDefault={false} />
        <DimensionInput label={labels.dieCutsWidth} value={shape.width} onChange={(width) => onChange({ width })} min={0.1} step={0.5} tooltip={labels.dieCutsSizeTooltip} isDefault={false} />
        <DimensionInput label={labels.dieCutsHeight} value={shape.height} onChange={(height) => onChange({ height })} min={0.1} step={0.5} tooltip={labels.dieCutsSizeTooltip} isDefault={false} />
        {shape.shape === 'roundRect' && (
          <DimensionInput label={labels.dieCutsRadius} value={shape.radius ?? DEFAULT_RADIUS} onChange={(radius) => onChange({ radius })} step={0.5}
            tooltip={labels.dieCutsRadiusTooltip} isDefault={shape.radius === undefined || dimensionsEqual(shape.radius, DEFAULT_RADIUS)} onReset={() => onChange({ radius: undefined })} />
        )}
        {shape.shape === 'path' && (
          <>
            <CheckedTextField label={labels.dieCutsPathD} tooltip={labels.dieCutsPathDTooltip} value={shape.d ?? ''} valid={validPathData}
              invalidHint={labels.dieCutsPathDInvalid} onChange={(d) => onChange({ d: d.trim() })} placeholder="M0 0 L1 0 L1 1 Z" isDefault={false} />
            <NumberInput label={labels.dieCutsViewBoxWidth} value={viewBox[0]} onChange={(v) => setViewBox(0, v)} min={0.001} max={VIEWBOX_MAX} step={1}
              tooltip={labels.dieCutsViewBoxTooltip} isDefault={shape.viewBox === undefined} onReset={() => onChange({ viewBox: undefined })} />
            <NumberInput label={labels.dieCutsViewBoxHeight} value={viewBox[1]} onChange={(v) => setViewBox(1, v)} min={0.001} max={VIEWBOX_MAX} step={1}
              tooltip={labels.dieCutsViewBoxTooltip} isDefault={shape.viewBox === undefined} onReset={() => onChange({ viewBox: undefined })} />
          </>
        )}
        <NumberInput label={labels.dieCutsLeaves} value={shape.leaves ?? 1} onChange={(v) => onChange({ leaves: v > 1 ? Math.floor(v) : undefined })} min={1} max={999} step={1}
          tooltip={labels.dieCutsLeavesTooltip} isDefault={shape.leaves === undefined || shape.leaves === 1} onReset={() => onChange({ leaves: undefined })} />
        <ToggleSwitch label={labels.dieCutsWrap} checked={wrapOn} onChange={(on) => onChange({ wrap: on ? undefined : false })}
          tooltip={labels.dieCutsWrapTooltip} isDefault={shape.wrap === undefined} onReset={() => onChange({ wrap: undefined })} />
        {wrapOn && (
          <NestedGroup>
            <DimensionInput label={labels.dieCutsWrapGap} value={gap} onChange={(g) => onChange({ wrap: { gap: g } })} step={0.5}
              tooltip={labels.dieCutsWrapGapTooltip} isDefault={!shape.wrap || shape.wrap.gap === undefined || dimensionsEqual(gap, DEFAULT_GAP)}
              onReset={() => onChange({ wrap: undefined })} />
          </NestedGroup>
        )}
      </ItemCard>
    </SearchScope>
  );
}
