'use client';

// One version's fields: its name, binding, ISBNs, flaps or jacket, the
// case's material and the spine as the printer gives it.

import { BUILT_IN_BINDING_PROFILES, DEFAULT_SPINE_TEXT, parseIsbn, type BindingMeasures, type ProductionConfig, type ProductionVersion, type ResolvedBindingMeasures } from 'postext/production';
import type { SandboxLabels } from '../../types/labels.js';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { ShowingDefaultsContext } from '../../controls/fieldContext.js';
import { CollapsibleSection, NumberInput, SelectInput, TextInput, ToggleSwitch } from '../../controls/index.js';
import { MEASURE_GROUPS } from '../profiles.js';
import { bindingProfiles, versionProfile } from '../versions.js';
import { profileName } from './coverLabels.js';

export function VersionFields({ production, version, measures, onChange }: {
  production: ProductionConfig | undefined;
  version: ProductionVersion;
  /** The version's measures as worked out for its trim. */
  measures?: ResolvedBindingMeasures | undefined;
  onChange: (patch: Partial<ProductionVersion>) => void;
}) {
  const labels = useSandboxLabels();
  const profiles = bindingProfiles(production);
  const profile = versionProfile(production, version);
  const isCase = profile?.style === 'caseFlat' || profile?.style === 'caseRound';
  const bindingId = typeof version.binding === 'string' ? version.binding : version.binding.id;
  const isbnBad = !!version.isbn && !parseIsbn(version.isbn).ok;
  const workBad = !!version.workIsbn && !parseIsbn(version.workIsbn).ok;
  const text = (v: string) => (v.trim() ? v : undefined);
  return (
    <div className="flex flex-col">
      <TextInput label={labels.coverVersionName} value={version.name} onChange={(name) => onChange({ name })} widthCh={18} />
      <SelectInput
        label={labels.coverBinding}
        value={bindingId}
        options={profiles.map((p) => ({ value: p.id, label: profileName(labels, p, BUILT_IN_BINDING_PROFILES.some((b) => b.id === p.id) && !(production?.bindings ?? []).some((b) => b.id === p.id)) }))}
        onChange={(binding) => onChange({ binding })}
      />
      <TextInput label={labels.coverIsbn} value={version.isbn ?? ''} onChange={(v) => onChange({ isbn: text(v) })} placeholder="978-…" widthCh={18} />
      {isbnBad && <p role="alert" className="px-3 pb-1 text-xs text-(--destructive)">{labels.coverIsbnInvalid}</p>}
      <TextInput label={labels.coverIsbnAddOn} tooltip={labels.coverIsbnAddOnTooltip} value={version.isbnAddOn ?? ''} onChange={(v) => onChange({ isbnAddOn: text(v.replace(/\D/g, '').slice(0, 5)) })} placeholder="90000" widthCh={8} />
      <TextInput label={labels.coverWorkIsbn} tooltip={labels.coverWorkIsbnTooltip} value={version.workIsbn ?? ''} onChange={(v) => onChange({ workIsbn: text(v) })} widthCh={18} />
      {workBad && <p role="alert" className="px-3 pb-1 text-xs text-(--destructive)">{labels.coverIsbnInvalid}</p>}
      <ToggleSwitch label={isCase ? labels.coverJacket : labels.coverFlaps} checked={!!version.flaps} onChange={(flaps) => onChange({ flaps: flaps || undefined })} />
      {isCase && (
        <SelectInput
          label={labels.coverCaseMaterial}
          value={version.caseMaterial ?? 'printed'}
          variant="segmented"
          options={[{ value: 'printed', label: labels.coverCasePrinted }, { value: 'cloth', label: labels.coverCaseCloth }]}
          onChange={(m) => onChange({ caseMaterial: m === 'cloth' ? 'cloth' : 'printed' })}
        />
      )}
      <ToggleSwitch
        label={labels.coverSpineOverride}
        tooltip={labels.coverSpineOverrideTooltip}
        checked={version.spineOverride !== undefined}
        onChange={(on) => onChange({ spineOverride: on ? 10 : undefined })}
      />
      {version.spineOverride !== undefined && (
        <NumberInput label={labels.coverSpineWidth} value={version.spineOverride} min={0} max={120} step={0.1} suffix="mm" onChange={(spineOverride) => onChange({ spineOverride })} />
      )}
      <SelectInput
        label={labels.coverSpineDirection}
        value={version.spineText?.direction ?? 'bottomToTop'}
        variant="segmented"
        options={[{ value: 'bottomToTop', label: labels.coverSpineUp }, { value: 'topToBottom', label: labels.coverSpineDown }]}
        onChange={(d) => onChange({ spineText: { ...version.spineText, direction: d === 'topToBottom' ? 'topToBottom' : 'bottomToTop' } })}
      />
      {/* Values against a default: marked and reset, unlike the book's data above. */}
      <ShowingDefaultsContext.Provider value={false}>
      <NumberInput
        label={labels.coverSpineMinText}
        tooltip={labels.coverSpineMinTextTooltip}
        value={version.spineText?.minSpine ?? DEFAULT_SPINE_TEXT.minSpine}
        isDefault={version.spineText?.minSpine === undefined}
        onReset={() => onChange({ spineText: spineTextWithout(version, 'minSpine') })}
        min={0}
        max={60}
        step={0.5}
        suffix="mm"
        onChange={(minSpine) => onChange({ spineText: { ...version.spineText, minSpine } })}
      />
      {measures && (
        <CollapsibleSection title={labels.coverVersionMeasures} sectionId="cover-version-measures" variant="subsection">
          <p className="px-3 py-1 text-xs text-(--slate)">{labels.coverVersionMeasuresIntro}</p>
          {MEASURE_GROUPS.filter((g) => (isCase ? g.id !== 'softcover' : g.id !== 'case' && g.id !== 'jacket' && g.id !== 'endpapers'))
            .flatMap((g) => g.keys)
            .filter((k) => k !== 'roundSpineAllowance' || profile?.style === 'caseRound')
            .map((k) => (
              <NumberInput
                key={k}
                label={labels[`coverMeasure_${k}` as keyof SandboxLabels] as string}
                value={Math.round((version.overrides?.[k] ?? measures[k]) * 100) / 100}
                isDefault={version.overrides?.[k] === undefined}
                onReset={() => onChange({ overrides: overridesWith(version, k, undefined) })}
                min={0}
                max={200}
                step={0.5}
                suffix="mm"
                onChange={(v) => onChange({ overrides: overridesWith(version, k, v) })}
              />
            ))}
        </CollapsibleSection>
      )}
      </ShowingDefaultsContext.Provider>
    </div>
  );
}

function overridesWith(version: ProductionVersion, key: keyof BindingMeasures, mm: number | undefined): ProductionVersion['overrides'] {
  const next = { ...version.overrides };
  if (mm === undefined) delete next[key];
  else next[key] = mm;
  return Object.keys(next).length > 0 ? next : undefined;
}

function spineTextWithout(version: ProductionVersion, key: 'minSpine' | 'direction'): ProductionVersion['spineText'] {
  const next = { ...version.spineText };
  delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}
