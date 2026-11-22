'use client';

/**
 * The design's `cover` part (#1667, #1669): what every version of the book
 * and every book of a collection shares on its cover — the sheet's ground
 * and picture, a ground per zone, where each zone's text sits, the
 * barcode's size and the mirrored bleed. The versions, the texts and the
 * printer's files are the book's, in the Cover panel.
 */

import { memo } from 'react';
import { BookMarked } from 'lucide-react';
import type { ColorValue } from 'postext';
import type { CoverConfig, CoverZoneName } from 'postext/production';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { CollapsibleSection, ColorPicker, NumberInput, SelectInput, ToggleSwitch } from '../../../controls/index.js';
import { Button } from '../../../ui/index.js';
import type { SandboxLabels } from '../../../types/labels.js';

const ZONES: readonly [CoverZoneName, keyof SandboxLabels][] = [
  ['front', 'coverZoneFront'],
  ['spine', 'coverZoneSpine'],
  ['back', 'coverZoneBack'],
  ['flapFront', 'coverZoneFlapFront'],
  ['flapBack', 'coverZoneFlapBack'],
];

const WHITE: ColorValue = { hex: '#ffffff', model: 'hex' };

/** A cover design without its empty fields; undefined when nothing is left. */
function prune(c: CoverConfig): CoverConfig | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (v === undefined) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? (out as CoverConfig) : undefined;
}

export const CoverDesignSection = memo(function CoverDesignSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.cover);
  const resources = useSandboxSelector((s) => s.resources);
  const cover = raw ?? {};
  const commit = (next: CoverConfig) => dispatch({ type: 'UPDATE_CONFIG', payload: { cover: prune(next) } });
  const setZone = (zone: CoverZoneName, color: ColorValue | undefined) => {
    const zones: Partial<Record<CoverZoneName, ColorValue>> = { ...cover.zones };
    if (color === undefined) delete zones[zone];
    else zones[zone] = color;
    commit({ ...cover, zones });
  };
  const setAlign = (zone: CoverZoneName, align: 'top' | 'middle' | 'bottom' | undefined) => {
    const verticalAlign: Partial<Record<CoverZoneName, 'top' | 'middle' | 'bottom'>> = { ...cover.verticalAlign };
    if (align === undefined) delete verticalAlign[zone];
    else verticalAlign[zone] = align;
    commit({ ...cover, verticalAlign });
  };
  const pictures = resources.filter((r) => r.kind === 'bitmap' || r.kind === 'svg');
  const zoneName = (key: keyof SandboxLabels) => String(labels[key]);

  return (
    <CollapsibleSection
      title={labels.coverDesignSection}
      sectionId="cover"
      defaultOpen
      hasOverrides={raw !== undefined}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { cover: undefined } })}
    >
      <p className="px-3 py-1 text-xs text-(--slate)">{labels.coverDesignIntro}</p>
      <div className="px-3 py-1.5">
        <Button variant="outline" size="sm" icon={<BookMarked size={13} />} onClick={() => dispatch({ type: 'SET_PANEL', payload: 'cover' })}>
          {labels.coverDesignOpenPanel}
        </Button>
      </div>
      <ColorPicker
        label={labels.coverDesignBackground}
        value={cover.background ?? WHITE}
        onChange={(background) => commit({ ...cover, background })}
        isDefault={cover.background === undefined}
        onReset={() => commit({ ...cover, background: undefined })}
        fieldId="cover-background"
      />
      <SelectInput
        label={labels.coverDesignImage}
        value={cover.image?.resourceId ?? ''}
        options={[{ value: '', label: labels.coverDesignImageNone }, ...pictures.map((r) => ({ value: r.id, label: r.id }))]}
        onChange={(id) => commit({ ...cover, image: id ? { ...cover.image, resourceId: id } : undefined })}
        isDefault={cover.image === undefined}
      />
      {cover.image && (
        <SelectInput
          label={labels.coverDesignImageArea}
          value={cover.image.area ?? 'sheet'}
          variant="segmented"
          options={[{ value: 'sheet', label: labels.coverDesignImageSheet }, { value: 'front', label: labels.coverDesignImageFront }]}
          onChange={(area) => commit({ ...cover, image: { ...cover.image!, area: area === 'front' ? 'front' : 'sheet' } })}
          isDefault={cover.image.area === undefined}
        />
      )}
      {ZONES.map(([zone, key]) => (
        <ColorPicker
          key={zone}
          label={labels.coverDesignZoneGround.replace('__zone__', zoneName(key))}
          value={cover.zones?.[zone] ?? cover.background ?? WHITE}
          onChange={(c) => setZone(zone, c)}
          isDefault={cover.zones?.[zone] === undefined}
          onReset={() => setZone(zone, undefined)}
          fieldId={`cover-zone-${zone}`}
        />
      ))}
      {ZONES.filter(([zone]) => zone !== 'spine').map(([zone, key]) => (
        <SelectInput
          key={zone}
          label={labels.coverDesignAlign.replace('__zone__', zoneName(key))}
          value={cover.verticalAlign?.[zone] ?? 'top'}
          variant="segmented"
          options={[
            { value: 'top', label: labels.coverDesignAlignTop },
            { value: 'middle', label: labels.coverDesignAlignMiddle },
            { value: 'bottom', label: labels.coverDesignAlignBottom },
          ]}
          onChange={(v) => setAlign(zone, v === 'top' ? undefined : (v as 'middle' | 'bottom'))}
          isDefault={cover.verticalAlign?.[zone] === undefined}
          onReset={() => setAlign(zone, undefined)}
        />
      ))}
      <NumberInput
        label={labels.coverDesignBarcodeSize}
        tooltip={labels.coverDesignBarcodeSizeTooltip}
        value={Math.round((cover.barcodeMagnification ?? 1) * 100)}
        min={80}
        max={200}
        step={5}
        suffix="%"
        onChange={(v) => commit({ ...cover, barcodeMagnification: v === 100 ? undefined : v / 100 })}
        isDefault={cover.barcodeMagnification === undefined}
        onReset={() => commit({ ...cover, barcodeMagnification: undefined })}
      />
      <ToggleSwitch
        label={labels.coverDesignMirror}
        tooltip={labels.coverDesignMirrorTooltip}
        checked={cover.mirrorMargin !== undefined}
        onChange={(on) => commit({ ...cover, mirrorMargin: on ? 3 : undefined })}
        isDefault={cover.mirrorMargin === undefined}
      />
      {cover.mirrorMargin !== undefined && (
        <NumberInput
          label={labels.coverDesignMirrorMargin}
          value={cover.mirrorMargin}
          min={2}
          max={20}
          step={0.5}
          suffix="mm"
          onChange={(mirrorMargin) => commit({ ...cover, mirrorMargin })}
        />
      )}
    </CollapsibleSection>
  );
});
