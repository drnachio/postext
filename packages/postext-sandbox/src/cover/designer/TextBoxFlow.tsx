'use client';

// What a text box does as a frame of the cover's page (#1679): where it is
// anchored (a panel or another box, the point, the offset), the box its
// text continues in, how far it grows with its text and how small its text
// may shrink. Each writes the box's own fields; the engine lays them out
// as a composed page's frames.

import type { CoverAnchorEdge, CoverConfig, CoverTextFrame, ProductionSheet } from 'postext/production';
import { COVER_BESIDE_EDGES, COVER_GRID_EDGES } from 'postext/production';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { NumberInput, SelectInput, ToggleSwitch } from '../../controls/index.js';
import type { SandboxLabels } from '../../types/labels.js';
import { ZONE_LABEL } from '../panel/coverLabels.js';
import { textBoxRects } from './designerModel.js';

const EDGE_LABEL: Record<CoverAnchorEdge, keyof SandboxLabels> = {
  'top-left': 'headerFooterFrameEdgeTopLeft',
  top: 'headerFooterFrameEdgeTop',
  'top-right': 'headerFooterFrameEdgeTopRight',
  left: 'headerFooterFrameEdgeLeft',
  center: 'headerFooterFrameEdgeCenter',
  right: 'headerFooterFrameEdgeRight',
  'bottom-left': 'headerFooterFrameEdgeBottomLeft',
  bottom: 'headerFooterFrameEdgeBottom',
  'bottom-right': 'headerFooterFrameEdgeBottomRight',
  below: 'headerFooterElementEdgeBelow',
  above: 'headerFooterElementEdgeAbove',
  'right-of': 'headerFooterElementEdgeRightOf',
  'left-of': 'headerFooterElementEdgeLeftOf',
};

const r1 = (v: number) => Math.round(v * 10) / 10;

/** The boxes `name` may hang from: any other but those hung from it, so
 *  no loop is offered. */
function anchorable(cover: CoverConfig, name: string): string[] {
  const boxes = cover.textBoxes ?? [];
  const hangsFrom = (n: string, seen = new Set<string>()): boolean => {
    if (n === name) return true;
    if (seen.has(n)) return false;
    seen.add(n);
    const to = boxes.find((b) => b.name === n)?.anchor?.to;
    return to !== undefined && hangsFrom(to, seen);
  };
  return boxes.map((b) => b.name).filter((n) => n !== name && !hangsFrom(n));
}

/** The boxes `name`'s text may continue in: any other that no other box's
 *  text continues in already and that does not lead back to it. */
function continuable(cover: CoverConfig, name: string): string[] {
  const boxes = cover.textBoxes ?? [];
  const nextOf = new Map(boxes.filter((b) => b.next).map((b) => [b.name, b.next!]));
  const taken = new Set(boxes.filter((b) => b.name !== name && b.next).map((b) => b.next!));
  const leadsBack = (n: string): boolean => {
    for (let at: string | undefined = n, i = 0; at !== undefined && i <= boxes.length; at = nextOf.get(at), i++) if (at === name) return true;
    return false;
  };
  return boxes.map((b) => b.name).filter((n) => n !== name && !taken.has(n) && !leadsBack(n));
}

export function TextBoxFlow({ t, cover, sheet, patch }: { t: CoverTextFrame; cover: CoverConfig; sheet: ProductionSheet; patch: (p: Record<string, unknown>) => void }) {
  const labels = useSandboxLabels();
  const zones = sheet.zones.map((z) => z.name as string);
  const anchor = t.anchor;
  const toZone = anchor ? zones.includes(anchor.to) : false;
  const edges = toZone ? COVER_GRID_EDGES : [...COVER_GRID_EDGES, ...COVER_BESIDE_EDGES];
  const zoneName = (z: string) => (ZONE_LABEL[z] ? String(labels[ZONE_LABEL[z]!]) : z);
  const setAnchor = (to: string) => {
    if (!to) {
      // Unanchored, the box stays where it stands.
      const at = textBoxRects(cover, sheet).get(t.name);
      patch({ anchor: undefined, ...(at ? { rect: { ...at, x: r1(at.x), y: r1(at.y) } } : {}) });
      return;
    }
    const zone = zones.includes(to);
    const edge = anchor && (zone ? COVER_GRID_EDGES.includes(anchor.edge) : true) ? anchor.edge : zone ? 'top-left' : 'below';
    patch({ anchor: { to, edge } });
  };
  const offset = (k: 'x' | 'y', v: number) => anchor && patch({ anchor: { ...anchor, [k]: v || undefined } });
  const growing = typeof t.maxHeight === 'number';
  const shrinks = t.fit?.shrinkText !== false;
  const setFit = (f: Partial<NonNullable<CoverTextFrame['fit']>>) => {
    const next = { ...t.fit, ...f };
    for (const k of Object.keys(next) as (keyof typeof next)[]) if (next[k] === undefined) delete next[k];
    patch({ fit: Object.keys(next).length ? next : undefined });
  };
  return (
    <>
      <SelectInput
        label={labels.coverTextAnchor}
        tooltip={labels.coverTextAnchorTooltip}
        value={anchor?.to ?? ''}
        options={[
          { value: '', label: labels.coverTextAnchorNone },
          ...zones.map((z) => ({ value: z, label: zoneName(z) })),
          ...anchorable(cover, t.name).map((n) => ({ value: n, label: n })),
        ]}
        onChange={setAnchor}
      />
      {anchor && (
        <>
          <SelectInput
            label={labels.coverTextAnchorEdge}
            value={anchor.edge}
            options={edges.map((e) => ({ value: e, label: String(labels[EDGE_LABEL[e]]) }))}
            onChange={(edge) => patch({ anchor: { ...anchor, edge } })}
          />
          <NumberInput label={labels.coverTextAnchorX} value={anchor.x ?? 0} min={-500} max={500} step={0.5} suffix="mm" onChange={(v) => offset('x', v)} />
          <NumberInput label={labels.coverTextAnchorY} value={anchor.y ?? 0} min={-500} max={500} step={0.5} suffix="mm" onChange={(v) => offset('y', v)} />
        </>
      )}
      <SelectInput
        label={labels.coverTextNext}
        tooltip={labels.coverTextNextTooltip}
        value={t.next ?? ''}
        options={[{ value: '', label: labels.coverTextNextNone }, ...continuable(cover, t.name).map((n) => ({ value: n, label: n }))]}
        onChange={(next) => patch({ next: next || undefined })}
      />
      {!t.rotate && (
        <>
          <ToggleSwitch
            label={labels.coverTextGrow}
            tooltip={labels.coverTextGrowTooltip}
            checked={growing}
            onChange={(on) => patch({ maxHeight: on ? r1(Math.max(t.rect.height * 2, t.rect.height + 10)) : undefined })}
          />
          {growing && (
            <NumberInput label={labels.coverTextMaxHeight} value={t.maxHeight!} min={r1(t.rect.height)} max={sheet.height} step={1} suffix="mm" onChange={(maxHeight) => patch({ maxHeight })} />
          )}
        </>
      )}
      <ToggleSwitch label={labels.coverTextShrink} tooltip={labels.coverTextShrinkTooltip} checked={shrinks} onChange={(on) => setFit({ shrinkText: on ? undefined : false })} />
      {shrinks && (
        <NumberInput
          label={labels.coverTextMinScale}
          value={Math.round((t.fit?.minScale ?? 0.9) * 100)}
          min={30}
          max={100}
          step={5}
          suffix="%"
          onChange={(v) => setFit({ minScale: v === 90 ? undefined : v / 100 })}
        />
      )}
    </>
  );
}
