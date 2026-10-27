'use client';

/**
 * The editor of a connector of a page template's decoration (#1063): the
 * box it starts at and the boxes it goes to (a list worked by keyboard, or
 * picked on the page in Design mode), each end's side, point and gap, and
 * the line's routing, bends, colour, width, dash and end marks.
 */

import { useEffect } from 'react';
import { DEFAULT_CONNECTOR_WIDTH, DEFAULT_MAIN_COLOR, connectorPaintsOver, type ConnectorEnd, type DesignConnectorElement, type Dimension, type LineCap, type PageParity } from 'postext';
import { useSandboxDocRef, useSandboxLabels, useSandboxSelector } from '../../../../context/SandboxContext.js';
import { anchorsOfTemplateFrame } from '../../../../viewport/composed/labelAnchorGeometry.js';
import { ColorPicker, DimensionInput, NestedGroup, NumberInput, SelectInput, ToggleSwitch } from '../../../../controls/index.js';
import { FieldRow } from '../../../../controls/FieldRow.js';
import { useFieldIds } from '../../../../controls/fieldContext.js';
import { Button, cn } from '../../../../ui/index.js';
import { templateEditor, useTemplateEditor } from '../../../../templates/editorStore.js';
import { connectorTargets, connectorToEnds, setConnectorFrom, toggleConnectorTo, updateConnectorEnd, type ConnectorFrameInput, type ConnectorTarget } from '../../../../templates/connectorEdits.js';
import type { TemplateScope } from '../../../../templates/templateEdits.js';
import { PagesSelect, type Sibling } from './PlacementFields.js';
import { DashField } from './shapeFields.js';
import { SidePointFields } from './sidePoint.js';
import { elementKindLabel } from './elementKind.js';

const ZERO: Dimension = { value: 0, unit: 'pt' };
const STROKE_UNITS: Dimension['unit'][] = ['pt', 'mm', 'px'];

/** Where the connector lives, so the canvas can pick its ends. */
export interface ConnectorHost {
  templateId: string;
  scope: TemplateScope;
}

interface Props {
  raw: DesignConnectorElement;
  siblings?: Sibling[];
  frames?: ConnectorFrameInput[];
  host?: ConnectorHost;
  onChange: (next: DesignConnectorElement) => void;
}

export function ConnectorElementEditor({ raw, siblings = [], frames = [], host, onChange }: Props) {
  const labels = useSandboxLabels();
  const editor = useTemplateEditor();
  const targets = connectorTargets(frames, siblings.map((s) => ({ id: s.id, kind: s.kind })));
  const ends = connectorToEnds(raw);
  const focus = editor.connector;
  const focused = !!host && focus?.templateId === host.templateId && focus.scope === host.scope && focus.elementId === raw.id;
  const picking = focused ? focus!.phase : null;
  // The anchors of the picture an end's frame holds on the laid pages
  // (#1064): an end may stop at one of them (`ConnectorEnd.anchor`).
  const docRef = useSandboxDocRef();
  const resources = useSandboxSelector((s) => s.resources);
  const anchorsOf = (ref: string | undefined): string[] => {
    if (!host || !ref?.startsWith('#') || ref.includes('[')) return [];
    return anchorsOfTemplateFrame(docRef?.current ?? null, host.templateId, ref.slice(1), (id) => resources?.find((r) => r.id === id)?.anchors).map((a) => a.anchorId);
  };

  // The canvas shows the ends of the connector being worked on: the one
  // whose fields were last touched (a card's fields stay mounted while it
  // is folded, so mounting is no sign of it), until its editor goes.
  const show = () => {
    if (!host || focused) return;
    templateEditor.focusConnector({ templateId: host.templateId, scope: host.scope, elementId: raw.id, phase: null });
  };
  useEffect(() => () => {
    const at = templateEditor.getSnapshot().connector;
    if (host && at?.elementId === raw.id && at.templateId === host.templateId) templateEditor.focusConnector(null);
  }, [host?.templateId, raw.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (partial: Partial<DesignConnectorElement>) => {
    const next = { ...raw, ...partial } as Record<string, unknown>;
    for (const [k, v] of Object.entries(partial)) if (v === undefined) delete next[k];
    onChange(next as unknown as DesignConnectorElement);
  };

  const targetLabel = (t: Pick<ConnectorTarget, 'kind' | 'name'>): string => {
    switch (t.kind) {
      case 'frame': return labels.headerFooterSizeToFrame.replace('__name__', t.name);
      case 'group': return labels.headerFooterSizeToGroup.replace('__name__', t.name);
      case 'instances': return labels.connectorTargetInstances.replace('__name__', t.name);
      default: {
        const s = siblings.find((x) => x.id === t.name);
        return s ? `${elementKindLabel(labels, s.kind)} #${s.index + 1}` : t.name;
      }
    }
  };
  /** A name an end holds that the template has not (a frame taken out). */
  const endLabel = (ref: string): string => {
    const t = targets.find((x) => x.value === ref);
    if (t) return targetLabel(t);
    const inst = /^#(.+)\[(\d+)\]$/.exec(ref);
    if (inst && targets.some((x) => x.value === `#${inst[1]}`)) return labels.connectorTargetInstance.replace('__name__', inst[1]!).replace('__n__', inst[2]!);
    return labels.connectorEndMissing.replace('__name__', ref.replace(/^#/, ''));
  };

  const fromOptions = [
    ...(targets.some((t) => t.value === raw.from?.to) ? [] : [{ value: raw.from?.to ?? '', label: endLabel(raw.from?.to ?? '#') }]),
    ...targets.filter((t) => t.kind !== 'instances').map((t) => ({ value: t.value, label: targetLabel(t) })),
  ];

  const pick = () => {
    if (!host) return;
    templateEditor.focusConnector({ templateId: host.templateId, scope: host.scope, elementId: raw.id, phase: picking ? null : 'from' });
  };

  const routing = raw.routing ?? 'elbow';
  const width = raw.width ?? DEFAULT_CONNECTOR_WIDTH;
  const capOptions = [
    { value: 'none', label: labels.connectorCapNone },
    { value: 'dot', label: labels.connectorCapDot },
    { value: 'arrow', label: labels.connectorCapArrow },
    { value: 'ring', label: labels.connectorCapRing },
    { value: 'bar', label: labels.connectorCapBar },
  ];

  return (
    <div onFocusCapture={show} onPointerDownCapture={show} data-connector-editor={raw.id}>
      <SelectInput
        label={labels.connectorFrom}
        tooltip={labels.connectorFromTooltip}
        value={raw.from?.to ?? ''}
        options={fromOptions}
        onChange={(v) => onChange(setConnectorFrom(raw, v))}
      />
      <FieldRow stacked label={labels.connectorTo} tooltip={labels.connectorToTooltip}>
        <EndToggles
          label={labels.connectorTo}
          options={targets.filter((t) => t.value !== raw.from?.to).map((t) => ({ value: t.value, label: targetLabel(t), name: labels.connectorToUse.replace('__name__', targetLabel(t)) }))}
          // Ends on names the list lacks (an instance, a frame taken out)
          // stay listed, so they can be taken out too.
          extra={ends.filter((e) => !targets.some((t) => t.value === e.to)).map((e) => ({ value: e.to, label: endLabel(e.to), name: labels.connectorToUse.replace('__name__', endLabel(e.to)) }))}
          selected={new Set(ends.map((e) => e.to))}
          onToggle={(v) => onChange(toggleConnectorTo(raw, v))}
        />
      </FieldRow>
      {ends.length === 0 && <p className="mb-1 text-[0.7rem] text-(--slate)">{labels.connectorNoEnds}</p>}
      {host && (
        <div className="mb-2">
          <Button variant={picking ? 'primary' : 'outline'} size="xs" aria-pressed={!!picking} onClick={pick} title={labels.connectorPickTooltip}>
            {labels.connectorPick}
          </Button>
          <p role="status" aria-live="polite" className="mt-1 text-[0.7rem] text-(--slate)">
            {picking === 'from' ? labels.connectorPickFrom : picking === 'to' ? labels.connectorPickTo : ''}
          </p>
        </div>
      )}

      <EndFields
        title={labels.connectorEndFrom.replace('__name__', endLabel(raw.from?.to ?? '#'))}
        end={raw.from}
        anchors={anchorsOf(raw.from?.to)}
        onChange={(patch) => onChange(updateConnectorEnd(raw, 'from', patch))}
      />
      {ends.map((e, i) => (
        <EndFields
          key={`${e.to}-${i}`}
          title={labels.connectorEndTo.replace('__n__', String(i + 1)).replace('__name__', endLabel(e.to))}
          end={e}
          anchors={anchorsOf(e.to)}
          onChange={(patch) => onChange(updateConnectorEnd(raw, i, patch))}
        />
      ))}

      <SelectInput
        variant="segmented"
        label={labels.connectorRouting}
        tooltip={labels.connectorRoutingTooltip}
        value={routing}
        options={[
          { value: 'straight', label: labels.connectorRoutingStraight },
          { value: 'elbow', label: labels.connectorRoutingElbow },
          { value: 'tree', label: labels.connectorRoutingTree },
        ]}
        onChange={(v) => update({ routing: v as DesignConnectorElement['routing'] })}
        isDefault={raw.routing === undefined}
        onReset={() => update({ routing: undefined })}
      />
      {routing !== 'straight' && (
        <>
          <DimensionInput
            label={labels.connectorRadius}
            value={raw.radius ?? ZERO}
            onChange={(d) => update({ radius: d })}
            min={0}
            step={0.5}
            units={STROKE_UNITS}
            isDefault={raw.radius === undefined}
            onReset={() => update({ radius: undefined })}
          />
          <NumberInput
            label={labels.connectorTrunk}
            tooltip={labels.connectorTrunkTooltip}
            value={raw.trunk ?? 0.5}
            onChange={(v) => update({ trunk: Math.max(0, Math.min(1, v)) })}
            min={0}
            max={1}
            step={0.05}
            isDefault={raw.trunk === undefined}
            onReset={() => update({ trunk: undefined })}
          />
        </>
      )}
      <ColorPicker
        label={labels.connectorColor}
        value={raw.color ?? DEFAULT_MAIN_COLOR}
        onChange={(c) => update({ color: c })}
        isDefault={raw.color === undefined}
        onReset={() => update({ color: undefined })}
        fieldId={`connector-color-${raw.id}`}
      />
      <NumberInput
        label={labels.connectorOpacity}
        tooltip={labels.connectorOpacityTooltip}
        value={Math.round((raw.opacity ?? 1) * 100)}
        min={0}
        max={100}
        step={5}
        suffix="%"
        onChange={(v) => {
          const o = Math.max(0, Math.min(100, v)) / 100;
          update({ opacity: o >= 1 ? undefined : o });
        }}
        isDefault={raw.opacity === undefined}
        onReset={() => update({ opacity: undefined })}
      />
      <DimensionInput
        label={labels.connectorWidth}
        value={width}
        onChange={(d) => update({ width: d })}
        min={0}
        step={0.05}
        units={STROKE_UNITS}
        isDefault={raw.width === undefined}
        onReset={() => update({ width: undefined })}
      />
      <DashField label={labels.connectorDash} tooltip={labels.connectorDashTooltip} value={raw.dash} onChange={(dash) => update({ dash })} />
      <SelectInput
        label={labels.connectorStartCap}
        value={raw.startCap ?? 'none'}
        options={capOptions}
        onChange={(v) => update({ startCap: v === 'none' ? undefined : (v as LineCap) })}
        isDefault={raw.startCap === undefined}
        onReset={() => update({ startCap: undefined })}
      />
      <SelectInput
        label={labels.connectorEndCap}
        value={raw.endCap ?? 'none'}
        options={capOptions}
        onChange={(v) => update({ endCap: v === 'none' ? undefined : (v as LineCap) })}
        isDefault={raw.endCap === undefined}
        onReset={() => update({ endCap: undefined })}
      />
      {(raw.startCap && raw.startCap !== 'none') || (raw.endCap && raw.endCap !== 'none') ? (
        <DimensionInput
          label={labels.connectorCapSize}
          tooltip={labels.connectorCapSizeTooltip}
          value={raw.capSize ?? { value: Math.round(width.value * 3 * 100) / 100, unit: width.unit }}
          onChange={(d) => update({ capSize: d })}
          min={0}
          step={0.25}
          units={STROKE_UNITS}
          isDefault={raw.capSize === undefined}
          onReset={() => update({ capSize: undefined })}
        />
      ) : null}
      {/* Over the frames (#1076): by default a line with an end at a
          picture's anchor paints over the frames, any other under them. */}
      <ToggleSwitch
        label={labels.connectorOver}
        tooltip={labels.connectorOverTooltip}
        checked={raw.over ?? connectorPaintsOver(raw)}
        onChange={(v) => update({ over: v })}
        isDefault={raw.over === undefined}
        onReset={() => update({ over: undefined })}
      />
      {raw.over === undefined && (
        <p className="mb-2 text-[0.7rem] text-(--slate)" data-connector-over-default="">
          {connectorPaintsOver(raw) ? labels.connectorOverDefaultOn : labels.connectorOverDefaultOff}
        </p>
      )}
      <ToggleSwitch
        label={labels.connectorPin}
        tooltip={labels.connectorPinTooltip}
        checked={raw.pin === true}
        onChange={(v) => update({ pin: v ? true : undefined })}
        isDefault={raw.pin === undefined}
        onReset={() => update({ pin: undefined })}
      />
      <SelectInput
        label={labels.headerFooterElementParity}
        value={raw.parity ?? 'all'}
        options={[
          { value: 'all', label: labels.headerFooterElementParityAll },
          { value: 'odd', label: labels.headerFooterElementParityOdd },
          { value: 'even', label: labels.headerFooterElementParityEven },
        ]}
        onChange={(v) => update({ parity: v === 'all' ? undefined : (v as PageParity) })}
        tooltip={labels.headerFooterElementParityTooltip}
        isDefault={raw.parity === undefined}
        onReset={() => update({ parity: undefined })}
      />
      <PagesSelect value={raw.pages} onChange={(pages) => update({ pages })} />
    </div>
  );
}

interface EndToggleOption {
  value: string;
  label: string;
  /** The button's accessible name («Line to Frame title»). */
  name: string;
}

/** The boxes a line can go to, each a toggle button (pressed: an end of the
 *  line): the keyboard's way to pick what a click on the page picks. */
function EndToggles({ label, options, extra, selected, onToggle }: { label: string; options: EndToggleOption[]; extra: EndToggleOption[]; selected: ReadonlySet<string>; onToggle: (value: string) => void }) {
  const ids = useFieldIds();
  return (
    <div id={ids?.controlId} role="group" aria-label={label} className="flex flex-wrap gap-1" data-connector-ends="">
      {[...extra, ...options].map((o) => (
        <button
          key={o.value}
          type="button"
          aria-label={o.name}
          aria-pressed={selected.has(o.value)}
          onClick={() => onToggle(o.value)}
          className={cn(
            'inline-flex min-h-7 cursor-pointer items-center rounded border px-2 text-xs transition-colors pt-large:min-h-11',
            'focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
            selected.has(o.value) ? 'border-(--brand) bg-(--brand) text-(--background)' : 'border-(--rule) bg-transparent text-(--foreground) hover:bg-(--surface)',
          )}
        >
          <span dir="auto">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** The side, point and gap of one end. */
function EndFields({ title, end, anchors = [], onChange }: { title: string; end: ConnectorEnd | undefined; anchors?: readonly string[]; onChange: (patch: Partial<Omit<ConnectorEnd, 'to'>>) => void }) {
  const labels = useSandboxLabels();
  if (!end) return null;
  // An end at an anchor of the frame's picture (#1064): offered when the
  // frame holds a picture with anchors, or when the end names one already.
  const anchorOptions = [
    { value: '', label: labels.connectorAnchorNone },
    ...anchors.map((a) => ({ value: a, label: a })),
    ...(end.anchor && !anchors.includes(end.anchor) ? [{ value: end.anchor, label: labels.pointersAnchorMissing.replace('__anchor__', end.anchor) }] : []),
  ];
  return (
    <>
      <p className="mt-2 mb-1 text-[0.75rem] font-medium" dir="auto">{title}</p>
      <NestedGroup>
        <SelectInput
          label={labels.connectorSide}
          tooltip={labels.connectorSideTooltip}
          value={end.side ?? ''}
          options={[
            { value: '', label: labels.connectorSideAuto },
            { value: 'top', label: labels.headerFooterFrameEdgeTop },
            { value: 'bottom', label: labels.headerFooterFrameEdgeBottom },
            { value: 'left', label: labels.headerFooterFrameEdgeLeft },
            { value: 'right', label: labels.headerFooterFrameEdgeRight },
            { value: 'start', label: labels.headerFooterFrameEdgeStart },
            { value: 'end', label: labels.headerFooterFrameEdgeEnd },
          ]}
          onChange={(v) => onChange({ side: v === '' ? undefined : (v as ConnectorEnd['side']) })}
          isDefault={end.side === undefined}
          onReset={() => onChange({ side: undefined })}
        />
        {anchorOptions.length > 1 && (
          <SelectInput
            label={labels.connectorAnchor}
            tooltip={labels.connectorAnchorTooltip}
            value={end.anchor ?? ''}
            options={anchorOptions}
            onChange={(v) => onChange({ anchor: v === '' ? undefined : v })}
            isDefault={end.anchor === undefined}
            onReset={() => onChange({ anchor: undefined })}
          />
        )}
        {!end.anchor && <SidePointFields
          label={labels.connectorAt}
          tooltip={labels.connectorAtTooltip}
          value={end.at}
          onChange={(at) => onChange({ at })}
        />}
        <DimensionInput
          label={labels.connectorGap}
          tooltip={labels.connectorGapTooltip}
          value={end.gap ?? ZERO}
          onChange={(d) => onChange({ gap: d })}
          min={0}
          step={0.5}
          units={STROKE_UNITS}
          isDefault={end.gap === undefined}
          onReset={() => onChange({ gap: undefined })}
        />
      </NestedGroup>
    </>
  );
}
