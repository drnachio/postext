'use client';

import { memo } from 'react';
import { FOLIO_MAX_TILT, FOLIO_PAPER_STOCKS, resolveFolioConfig } from 'postext';
import type {
  ColorValue,
  FolioBindingConfig,
  FolioBindingType,
  FolioConfig,
  FolioCoverMaterial,
  FolioEnvironment,
  FolioLightingConfig,
  FolioPaperConfig,
  FolioPaperFinish,
  FolioPaperTexture,
  FolioPaperType,
  FolioSurfaceConfig,
  FolioSurfaceType,
} from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import type { SandboxLabels } from '../../types/labels';
import { CollapsibleSection, ColorPicker, FieldGroup, NumberInput, SelectInput, ToggleSwitch } from '../../controls';

const PAPER_TYPES: readonly [FolioPaperType, keyof SandboxLabels][] = [
  ['uncoated', 'folioPaperUncoated'],
  ['bookWove', 'folioPaperBookWove'],
  ['coatedMatte', 'folioPaperCoatedMatte'],
  ['coatedSilk', 'folioPaperCoatedSilk'],
  ['coatedGloss', 'folioPaperCoatedGloss'],
  ['bible', 'folioPaperBible'],
  ['newsprint', 'folioPaperNewsprint'],
  ['cardStock', 'folioPaperCardStock'],
  ['board', 'folioPaperBoard'],
];

const FINISHES: readonly [Exclude<FolioPaperFinish, 'auto'>, keyof SandboxLabels][] = [
  ['uncoated', 'folioFinishUncoated'],
  ['matte', 'folioFinishMatte'],
  ['silk', 'folioFinishSilk'],
  ['gloss', 'folioFinishGloss'],
];

const TEXTURES: readonly [Exclude<FolioPaperTexture, 'auto'>, keyof SandboxLabels][] = [
  ['smooth', 'folioTextureSmooth'],
  ['vellum', 'folioTextureVellum'],
  ['wove', 'folioTextureWove'],
  ['laid', 'folioTextureLaid'],
  ['linen', 'folioTextureLinen'],
  ['felt', 'folioTextureFelt'],
];

const BINDINGS: readonly [FolioBindingType, keyof SandboxLabels][] = [
  ['hardcover', 'folioBindingHardcover'],
  ['paperback', 'folioBindingPaperback'],
  ['sewn', 'folioBindingSewn'],
  ['layflat', 'folioBindingLayflat'],
  ['saddleStitch', 'folioBindingSaddleStitch'],
  ['folded', 'folioBindingFolded'],
];

const COVER_MATERIALS: readonly [Exclude<FolioCoverMaterial, 'auto'>, keyof SandboxLabels][] = [
  ['cloth', 'folioCoverCloth'],
  ['paper', 'folioCoverPaper'],
  ['leather', 'folioCoverLeather'],
];

const SURFACES: readonly [FolioSurfaceType, keyof SandboxLabels][] = [
  ['oak', 'folioSurfaceOak'],
  ['walnut', 'folioSurfaceWalnut'],
  ['linen', 'folioSurfaceLinen'],
  ['felt', 'folioSurfaceFelt'],
  ['leather', 'folioSurfaceLeather'],
  ['marble', 'folioSurfaceMarble'],
  ['plain', 'folioSurfacePlain'],
  ['none', 'folioSurfaceNone'],
];

const ENVIRONMENTS: readonly [FolioEnvironment, keyof SandboxLabels][] = [
  ['studio', 'folioEnvironmentStudio'],
  ['daylight', 'folioEnvironmentDaylight'],
  ['lamp', 'folioEnvironmentLamp'],
  ['overcast', 'folioEnvironmentOvercast'],
  ['night', 'folioEnvironmentNight'],
];

/** The surface tint shown while none is set: white leaves the surface's own
 *  colours as they are. */
const NO_TINT: ColorValue = { hex: '#ffffff', model: 'hex' };

/** `obj` without its undefined fields; undefined when nothing is left. */
function prune<T extends object>(obj: T): T | undefined {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
}

/** Design-panel section for `config.folio`: how the Folio viewer shows the
 *  printed book in 3D. Unset paper fields show the stock's values. */
export const FolioSection = memo(function FolioSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.folio);
  const resources = useSandboxSelector((s) => s.resources);
  const cfg = resolveFolioConfig(raw);
  const stock = FOLIO_PAPER_STOCKS[cfg.paper.type];

  const commit = (next: FolioConfig) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { folio: prune(next) } });
  };
  const writeTop = (partial: Pick<FolioConfig, 'tilt' | 'yaw'>) => commit({ ...raw, ...partial });
  const writePaper = (partial: Partial<FolioPaperConfig>) =>
    commit({ ...raw, paper: prune({ ...raw?.paper, ...partial }) });
  const writeBinding = (partial: Partial<FolioBindingConfig>) =>
    commit({ ...raw, binding: prune({ ...raw?.binding, ...partial }) });
  const writeSurface = (partial: Partial<FolioSurfaceConfig>) =>
    commit({ ...raw, surface: prune({ ...raw?.surface, ...partial }) });
  const writeLighting = (partial: Partial<FolioLightingConfig>) =>
    commit({ ...raw, lighting: prune({ ...raw?.lighting, ...partial }) });
  const resetSection = () => dispatch({ type: 'UPDATE_CONFIG', payload: { folio: undefined } });

  const options = <V extends string>(list: readonly [V, keyof SandboxLabels][]) =>
    list.map(([value, key]) => ({ value, label: labels[key] as string }));
  const nameOf = <V extends string>(list: readonly [V, keyof SandboxLabels][], value: V) =>
    labels[list.find(([v]) => v === value)![1]] as string;
  const auto = (name: string) => labels.folioAuto.replace('__value__', name);

  const p = raw?.paper;
  const b = raw?.binding;
  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  const caliper = Math.round(cfg.paper.grammage * cfg.paper.bulk);

  return (
    <CollapsibleSection
      title={labels.folioSection}
      sectionId="folio"
      onReset={resetSection}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <FieldGroup title={labels.folioGroupView}>
        <NumberInput
          label={labels.folioTilt}
          value={cfg.tilt}
          onChange={(v) => writeTop({ tilt: v })}
          min={0}
          max={FOLIO_MAX_TILT}
          step={1}
          suffix="°"
          tooltip={labels.folioTiltTooltip}
          isDefault={raw?.tilt === undefined}
          onReset={() => writeTop({ tilt: undefined })}
        />
        <NumberInput
          label={labels.folioYaw}
          value={cfg.yaw}
          onChange={(v) => writeTop({ yaw: v })}
          min={-180}
          max={180}
          step={1}
          suffix="°"
          tooltip={labels.folioYawTooltip}
          isDefault={raw?.yaw === undefined}
          onReset={() => writeTop({ yaw: undefined })}
        />
      </FieldGroup>

      <FieldGroup title={labels.folioGroupPaper}>
        <SelectInput
          label={labels.folioPaperType}
          value={cfg.paper.type}
          options={options(PAPER_TYPES)}
          onChange={(v) => writePaper({ type: v as FolioPaperType })}
          tooltip={labels.folioPaperTypeTooltip}
          isDefault={p?.type === undefined}
          onReset={() => writePaper({ type: undefined })}
        />
        <NumberInput
          label={labels.folioGrammage}
          value={cfg.paper.grammage}
          onChange={(v) => writePaper({ grammage: v })}
          min={20}
          max={2500}
          step={1}
          suffix="g/m²"
          tooltip={labels.folioGrammageTooltip}
          isDefault={p?.grammage === undefined}
          onReset={() => writePaper({ grammage: undefined })}
        />
        <NumberInput
          label={labels.folioBulk}
          value={cfg.paper.bulk}
          onChange={(v) => writePaper({ bulk: v })}
          min={0.5}
          max={3}
          step={0.05}
          suffix="cm³/g"
          tooltip={labels.folioBulkTooltip}
          isDefault={p?.bulk === undefined}
          onReset={() => writePaper({ bulk: undefined })}
        />
        <p className="mb-2 mt-0.5 text-[0.66rem] leading-[1.35] text-(--slate) [text-wrap:pretty]">
          {labels.folioCaliper.replace('__value__', String(caliper))}
        </p>
        <SelectInput
          label={labels.folioFinish}
          value={p?.finish ?? 'auto'}
          options={[{ value: 'auto', label: auto(nameOf(FINISHES, stock.finish)) }, ...options(FINISHES)]}
          onChange={(v) => writePaper({ finish: v === 'auto' ? undefined : (v as FolioPaperFinish) })}
          tooltip={labels.folioFinishTooltip}
          isDefault={p?.finish === undefined || p.finish === 'auto'}
          onReset={() => writePaper({ finish: undefined })}
        />
        <SelectInput
          label={labels.folioTexture}
          value={p?.texture ?? 'auto'}
          options={[{ value: 'auto', label: auto(nameOf(TEXTURES, stock.texture)) }, ...options(TEXTURES)]}
          onChange={(v) => writePaper({ texture: v === 'auto' ? undefined : (v as FolioPaperTexture) })}
          tooltip={labels.folioTextureTooltip}
          isDefault={p?.texture === undefined || p.texture === 'auto'}
          onReset={() => writePaper({ texture: undefined })}
        />
        <NumberInput
          label={labels.folioTextureStrength}
          value={cfg.paper.textureStrength}
          onChange={(v) => writePaper({ textureStrength: v })}
          min={0}
          max={2}
          step={0.1}
          tooltip={labels.folioTextureStrengthTooltip}
          isDefault={p?.textureStrength === undefined}
          onReset={() => writePaper({ textureStrength: undefined })}
        />
        <ColorPicker
          label={labels.folioShade}
          value={cfg.paper.shade}
          onChange={(v) => writePaper({ shade: v })}
          tooltip={labels.folioShadeTooltip}
          isDefault={p?.shade === undefined}
          onReset={() => writePaper({ shade: undefined })}
          fieldId="folio-paper-shade"
        />
        <ToggleSwitch
          label={labels.folioShowThrough}
          checked={cfg.paper.showThrough}
          onChange={(v) => writePaper({ showThrough: v })}
          tooltip={labels.folioShowThroughTooltip}
          isDefault={p?.showThrough === undefined}
          onReset={() => writePaper({ showThrough: undefined })}
        />
      </FieldGroup>

      <FieldGroup title={labels.folioGroupBinding}>
        <SelectInput
          label={labels.folioBindingType}
          value={cfg.binding.type}
          options={options(BINDINGS)}
          onChange={(v) => writeBinding({ type: v as FolioBindingType })}
          tooltip={labels.folioBindingTypeTooltip}
          isDefault={b?.type === undefined}
          onReset={() => writeBinding({ type: undefined })}
        />
        <SelectInput
          label={labels.folioCoverSource}
          value={cfg.binding.cover}
          options={[
            { value: 'case', label: labels.folioCoverSourceCase },
            { value: 'pages', label: labels.folioCoverSourcePages },
          ]}
          onChange={(v) => writeBinding({ cover: v === 'pages' ? 'pages' : undefined })}
          tooltip={labels.folioCoverSourceTooltip}
          isDefault={b?.cover === undefined}
          onReset={() => writeBinding({ cover: undefined })}
        />
        <SelectInput
          label={labels.folioCoverMaterial}
          value={b?.coverMaterial ?? 'auto'}
          options={[
            { value: 'auto', label: auto(nameOf(COVER_MATERIALS, cfg.binding.type === 'hardcover' ? 'cloth' : 'paper')) },
            ...options(COVER_MATERIALS),
          ]}
          onChange={(v) => writeBinding({ coverMaterial: v === 'auto' ? undefined : (v as FolioCoverMaterial) })}
          tooltip={labels.folioCoverMaterialTooltip}
          isDefault={b?.coverMaterial === undefined || b.coverMaterial === 'auto'}
          onReset={() => writeBinding({ coverMaterial: undefined })}
        />
        <ColorPicker
          label={labels.folioCoverColor}
          value={cfg.binding.coverColor}
          onChange={(v) => writeBinding({ coverColor: v })}
          tooltip={labels.folioCoverColorTooltip}
          isDefault={b?.coverColor === undefined}
          onReset={() => writeBinding({ coverColor: undefined })}
          fieldId="folio-binding-coverColor"
        />
        {/* A saddle stitch and a folded newspaper have no flat spine to
            print on. */}
        {cfg.binding.type !== 'saddleStitch' && cfg.binding.type !== 'folded' && (
          <SelectInput
            label={labels.folioSpineImage}
            value={b?.spineImage ?? ''}
            options={[
              { value: '', label: labels.folioSpineImageNone },
              ...resources
                .filter((r) => r.kind === 'bitmap' || r.kind === 'svg')
                .map((r) => ({ value: r.id, label: r.id })),
            ]}
            onChange={(v) => writeBinding({ spineImage: v || undefined })}
            tooltip={labels.folioSpineImageTooltip}
            isDefault={!b?.spineImage}
            onReset={() => writeBinding({ spineImage: undefined })}
          />
        )}
      </FieldGroup>

      <FieldGroup title={labels.folioGroupSurface}>
        <SelectInput
          label={labels.folioSurfaceType}
          value={cfg.surface.type}
          options={options(SURFACES)}
          onChange={(v) => writeSurface({ type: v as FolioSurfaceType })}
          tooltip={labels.folioSurfaceTypeTooltip}
          isDefault={raw?.surface?.type === undefined}
          onReset={() => writeSurface({ type: undefined })}
        />
        {cfg.surface.type !== 'none' && (
          <ColorPicker
            label={labels.folioSurfaceColor}
            value={cfg.surface.color ?? NO_TINT}
            onChange={(v) => writeSurface({ color: v })}
            tooltip={labels.folioSurfaceColorTooltip}
            isDefault={raw?.surface?.color === undefined}
            onReset={() => writeSurface({ color: undefined })}
            fieldId="folio-surface-color"
          />
        )}
      </FieldGroup>

      <FieldGroup title={labels.folioGroupLighting}>
        <SelectInput
          label={labels.folioEnvironment}
          value={cfg.lighting.environment}
          options={options(ENVIRONMENTS)}
          onChange={(v) => writeLighting({ environment: v as FolioEnvironment })}
          tooltip={labels.folioEnvironmentTooltip}
          isDefault={raw?.lighting?.environment === undefined}
          onReset={() => writeLighting({ environment: undefined })}
        />
        <NumberInput
          label={labels.folioIntensity}
          value={cfg.lighting.intensity}
          onChange={(v) => writeLighting({ intensity: v })}
          min={0.25}
          max={2}
          step={0.05}
          tooltip={labels.folioIntensityTooltip}
          isDefault={raw?.lighting?.intensity === undefined}
          onReset={() => writeLighting({ intensity: undefined })}
        />
        <ToggleSwitch
          label={labels.folioShadows}
          checked={cfg.lighting.shadows}
          onChange={(v) => writeLighting({ shadows: v })}
          tooltip={labels.folioShadowsTooltip}
          isDefault={raw?.lighting?.shadows === undefined}
          onReset={() => writeLighting({ shadows: undefined })}
        />
      </FieldGroup>
    </CollapsibleSection>
  );
});
