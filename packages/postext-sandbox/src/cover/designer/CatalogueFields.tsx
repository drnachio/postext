'use client';

// A catalogue item's fields (#1673): the grid its titles' pictures are
// laid in (columns, the gap between them), which titles it takes (the
// first and the last by their place, to share the list between two
// panels), how a picture fills its cell and the outline that marks this
// book among them.

import type { ColorValue } from 'postext';
import type { CoverElement } from 'postext/production';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { ColorPicker, NestedGroup, NumberInput, SelectInput, ToggleSwitch } from '../../controls/index.js';

const INK: ColorValue = { hex: '#1f3a5f', model: 'hex' };

export function CatalogueFields({ e, patch }: { e: CoverElement; patch: (p: Record<string, unknown>) => void }) {
  const labels = useSandboxLabels();
  const titles = useSandboxSelector((s) => s.config.production?.collection?.catalogue?.length ?? 0);
  const top = Math.max(1, titles);
  const first = e.first ?? 1;
  const last = e.last ?? top;
  return (
    <>
      {titles === 0 && <p className="px-3 py-1 text-xs text-(--slate)">{labels.coverCatalogueNoTitles}</p>}
      <NumberInput
        label={labels.coverCatalogueColumns}
        tooltip={labels.coverCatalogueColumnsTooltip}
        value={e.columns ?? Math.max(1, last - first + 1)}
        min={1}
        max={Math.max(12, top)}
        step={1}
        isDefault={e.columns === undefined}
        onReset={() => patch({ columns: undefined })}
        onChange={(columns) => patch({ columns })}
      />
      <NumberInput
        label={labels.coverCatalogueGap}
        value={e.gap ?? 3}
        min={0}
        max={50}
        step={0.5}
        suffix="mm"
        isDefault={e.gap === undefined}
        onReset={() => patch({ gap: undefined })}
        onChange={(gap) => patch({ gap })}
      />
      <NumberInput
        label={labels.coverCatalogueFirst}
        tooltip={labels.coverCatalogueRangeTooltip}
        value={first}
        min={1}
        max={top}
        step={1}
        isDefault={e.first === undefined}
        onReset={() => patch({ first: undefined })}
        onChange={(n) => patch({ first: n > 1 ? n : undefined, ...(e.last !== undefined && e.last < n ? { last: n } : {}) })}
      />
      <NumberInput
        label={labels.coverCatalogueLast}
        tooltip={labels.coverCatalogueRangeTooltip}
        value={last}
        min={1}
        max={top}
        step={1}
        isDefault={e.last === undefined}
        onReset={() => patch({ last: undefined })}
        onChange={(n) => patch({ last: n, ...(first > n ? { first: n > 1 ? n : undefined } : {}) })}
      />
      <SelectInput
        label={labels.coverItemFit}
        value={e.fit ?? 'cover'}
        variant="segmented"
        options={[{ value: 'contain', label: labels.coverItemFitContain }, { value: 'cover', label: labels.coverItemFitCover }]}
        onChange={(v) => patch({ fit: v === 'contain' ? 'contain' : undefined })}
      />
      <ToggleSwitch
        label={labels.coverCatalogueMark}
        tooltip={labels.coverCatalogueMarkTooltip}
        checked={!!e.stroke}
        onChange={(on) => patch({ stroke: on ? { color: INK, width: 0.6 } : undefined })}
      />
      {e.stroke && (
        <NestedGroup>
          <ColorPicker label={labels.coverItemStrokeColor} value={e.stroke.color} onChange={(color) => patch({ stroke: { ...e.stroke!, color } })} fieldId={`cover-catalogue-mark-${e.id}`} />
          <NumberInput label={labels.coverItemStrokeWidth} value={e.stroke.width} min={0.1} max={20} step={0.1} suffix="mm" onChange={(width) => patch({ stroke: { ...e.stroke!, width } })} />
          <NumberInput label={labels.coverItemRadius} value={e.radius ?? 0} min={0} max={100} step={0.5} suffix="mm" isDefault={e.radius === undefined} onReset={() => patch({ radius: undefined })} onChange={(radius) => patch({ radius: radius > 0 ? radius : undefined })} />
        </NestedGroup>
      )}
    </>
  );
}
