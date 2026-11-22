'use client';

// The rest of an element's fields (#1669): the effects a box or a shape
// can carry (rounded corners, a border, a gradient, a shadow), what it does
// past a mirror bleed, whether it scales with its panel and the panels its
// edges follow, and the shapes it was given by tracing or drawing (an
// outline, a path, a picture's clip), shown and taken off here and drawn
// on the sheet.

import type { ColorValue } from 'postext';
import type { CoverElement, CoverPath, CoverPlacement, ProductionSheet } from 'postext/production';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { ColorPicker, NestedGroup, NumberInput, SelectInput, ToggleSwitch } from '../../controls/index.js';
import { Button } from '../../ui/index.js';
import { ZONE_LABEL } from '../panel/coverLabels.js';

const SHADE: ColorValue = { hex: '#000000', model: 'hex' };
const LIGHT: ColorValue = { hex: '#ffffff', model: 'hex' };

export function ElementExtras({ e, sheet, patch }: { e: CoverElement; sheet: ProductionSheet; patch: (p: Record<string, unknown>) => void }) {
  const labels = useSandboxLabels();
  const zoneName = (z: string) => (ZONE_LABEL[z] ? String(labels[ZONE_LABEL[z]]) : z);
  const zone = sheet.zones.find((z) => z.name === e.zone);
  const painted = e.kind !== 'image';
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const place = (p: Partial<CoverPlacement>) => patch(p);

  return (
    <>
      {painted && (
        <>
          <NumberInput label={labels.coverItemRadius} value={e.radius ?? 0} min={0} max={100} step={0.5} suffix="mm" isDefault={e.radius === undefined} onReset={() => patch({ radius: undefined })} onChange={(radius) => patch({ radius: radius > 0 ? radius : undefined })} />
          <ToggleSwitch label={labels.coverItemStroke} checked={!!e.stroke} onChange={(on) => patch({ stroke: on ? { color: e.color ?? SHADE, width: 0.5 } : undefined })} />
          {e.stroke && (
            <NestedGroup>
              <ColorPicker label={labels.coverItemStrokeColor} value={e.stroke.color} onChange={(color) => patch({ stroke: { ...e.stroke!, color } })} fieldId={`cover-item-stroke-${e.id}`} />
              <NumberInput label={labels.coverItemStrokeWidth} value={e.stroke.width} min={0.1} max={20} step={0.1} suffix="mm" onChange={(width) => patch({ stroke: { ...e.stroke!, width } })} />
            </NestedGroup>
          )}
          <ToggleSwitch label={labels.coverItemGradient} tooltip={labels.coverItemPictureTooltip} checked={!!e.gradient} onChange={(on) => patch({ gradient: on ? { to: LIGHT, angle: 90 } : undefined })} />
          {e.gradient && (
            <NestedGroup>
              <ColorPicker label={labels.coverItemGradientTo} value={e.gradient.to} onChange={(to) => patch({ gradient: { ...e.gradient!, to } })} fieldId={`cover-item-gradient-${e.id}`} />
              <NumberInput label={labels.coverItemGradientAngle} tooltip={labels.coverItemGradientAngleTooltip} value={e.gradient.angle} min={0} max={359} step={15} suffix="°" onChange={(angle) => patch({ gradient: { ...e.gradient!, angle } })} />
            </NestedGroup>
          )}
          <ToggleSwitch label={labels.coverItemShadow} tooltip={labels.coverItemPictureTooltip} checked={!!e.shadow} onChange={(on) => patch({ shadow: on ? { color: SHADE, opacity: 0.35, x: 1, y: 1.5, blur: 3 } : undefined })} />
          {e.shadow && (
            <NestedGroup>
              <ColorPicker label={labels.coverItemShadowColor} value={e.shadow.color} onChange={(color) => patch({ shadow: { ...e.shadow!, color } })} fieldId={`cover-item-shadow-${e.id}`} />
              <NumberInput label={labels.coverItemShadowOpacity} value={Math.round(e.shadow.opacity * 100)} min={0} max={100} step={5} suffix="%" onChange={(v) => patch({ shadow: { ...e.shadow!, opacity: v / 100 } })} />
              <NumberInput label={labels.coverItemShadowX} value={e.shadow.x} min={-50} max={50} step={0.5} suffix="mm" onChange={(x) => patch({ shadow: { ...e.shadow!, x } })} />
              <NumberInput label={labels.coverItemShadowY} value={e.shadow.y} min={-50} max={50} step={0.5} suffix="mm" onChange={(y) => patch({ shadow: { ...e.shadow!, y } })} />
              <NumberInput label={labels.coverItemShadowBlur} value={e.shadow.blur} min={0} max={50} step={0.5} suffix="mm" onChange={(blur) => patch({ shadow: { ...e.shadow!, blur } })} />
            </NestedGroup>
          )}
        </>
      )}
      <SelectInput
        label={labels.coverItemBleed}
        tooltip={labels.coverItemBleedTooltip}
        value={e.bleed ?? 'mirror'}
        variant="segmented"
        isDefault={e.bleed === undefined}
        onReset={() => patch({ bleed: undefined })}
        options={[{ value: 'mirror', label: labels.coverItemBleedMirror }, { value: 'own', label: labels.coverItemBleedOwn }]}
        onChange={(v) => patch({ bleed: v === 'own' ? 'own' : undefined })}
      />
      <ToggleSwitch
        label={labels.coverItemScale}
        tooltip={labels.coverItemScaleTooltip}
        checked={!!e.basis}
        onChange={(on) => place({ basis: on && zone ? { width: r2(zone.rect.width), height: r2(zone.rect.height) } : undefined })}
      />
      {e.to && (
        <div className="flex flex-col gap-1 px-3 py-1">
          <p className="m-0 text-xs text-(--slate)">{labels.coverItemRunsTo.replace('__from__', zoneName(e.zone)).replace('__to__', zoneName(e.to.zone))}</p>
          <div><Button variant="outline" size="sm" onClick={() => place({ to: undefined })}>{labels.coverItemOneZone}</Button></div>
        </div>
      )}
      {e.path && <PathFields path={e.path} patch={patch} />}
      {e.outline && (
        <Shape text={labels.coverItemOutline.replace('__n__', String(e.outline.length))} action={labels.coverItemRemoveOutline} onClick={() => patch({ outline: undefined })} />
      )}
      {e.clip && (
        <Shape text={labels.coverItemClip.replace('__n__', String(e.clip.length))} action={labels.coverItemRemoveClip} onClick={() => patch({ clip: undefined })} />
      )}
    </>
  );
}

function Shape({ text, action, onClick }: { text: string; action: string; onClick: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-1">
      <p className="m-0 flex-1 text-xs text-(--slate)">{text}</p>
      <Button variant="outline" size="sm" onClick={onClick}>{action}</Button>
    </div>
  );
}

/** A drawn path: its nodes counted, each part closed or open. */
function PathFields({ path, patch }: { path: CoverPath; patch: (p: Record<string, unknown>) => void }) {
  const labels = useSandboxLabels();
  const nodes = path.reduce((n, part) => n + part.nodes.length, 0);
  return (
    <>
      <Shape text={labels.coverItemPath.replace('__n__', String(nodes))} action={labels.coverItemRemovePath} onClick={() => patch({ path: undefined })} />
      {path.map((part, i) => (
        <ToggleSwitch
          key={i}
          label={path.length > 1 ? labels.coverItemPathPartClosed.replace('__n__', String(i + 1)) : labels.coverItemPathClosed}
          checked={part.closed}
          onChange={(on) => patch({ path: path.map((p, j) => (j === i ? { ...p, closed: on } : p)) })}
        />
      ))}
      {path.some((part) => part.nodes.some((n) => n.in || n.out)) && (
        <div className="px-3 py-1">
          <Button variant="outline" size="sm" onClick={() => patch({ path: path.map((p) => ({ ...p, nodes: p.nodes.map(({ x, y }) => ({ x, y })) })) })}>{labels.coverItemPathStraighten}</Button>
        </div>
      )}
    </>
  );
}
