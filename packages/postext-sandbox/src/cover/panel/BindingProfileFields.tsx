'use client';

// One binding profile of the book's own (#1669): the printer's name for
// it, its style, the pages of a signature, the trims and spines it takes,
// and its measures by the part of the binding they belong to.

import { DEFAULT_BINDING_MEASURES, type BindingAccepts, type BindingProfile, type BindingStyle, type TrimMm } from 'postext/production';
import type { SandboxLabels } from '../../types/labels.js';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { CollapsibleSection, NumberInput, SelectInput, TextInput } from '../../controls/index.js';
import { MEASURE_GROUPS, setMeasure } from '../profiles.js';
import { LengthField } from './LengthField.js';

const STYLES: readonly BindingStyle[] = ['perfect', 'sewnSoftcover', 'caseFlat', 'caseRound'];
export const STYLE_LABEL: Record<BindingStyle, keyof SandboxLabels> = {
  perfect: 'coverProfilePerfect',
  sewnSoftcover: 'coverProfileSewn',
  caseFlat: 'coverProfileCaseFlat',
  caseRound: 'coverProfileCaseRound',
};
const GROUP_LABEL: Record<(typeof MEASURE_GROUPS)[number]['id'], keyof SandboxLabels> = {
  sheet: 'coverMeasuresSheet',
  softcover: 'coverMeasuresSoftcover',
  case: 'coverMeasuresCase',
  jacket: 'coverMeasuresJacket',
  endpapers: 'coverMeasuresEndpapers',
};
const isCase = (s: BindingStyle) => s === 'caseFlat' || s === 'caseRound';

export function BindingProfileFields({ profile, trim, onChange }: {
  profile: BindingProfile;
  trim: TrimMm;
  onChange: (patch: Partial<BindingProfile>) => void;
}) {
  const labels = useSandboxLabels();
  const accepts = (patch: BindingAccepts) => {
    const next: BindingAccepts = { ...profile.accepts, ...patch };
    for (const k of ['trim', 'spine'] as const) if (next[k] && Object.values(next[k]!).every((v) => v === undefined)) delete next[k];
    onChange({ accepts: Object.keys(next).length > 0 ? next : undefined });
  };
  const trimLimit = (end: 'min' | 'max', side: 'width' | 'height', v: number) => {
    const was = profile.accepts?.trim?.[end];
    const size: TrimMm = { width: was?.width ?? 0, height: was?.height ?? 0, [side]: v };
    accepts({ trim: { ...profile.accepts?.trim, [end]: size.width > 0 || size.height > 0 ? size : undefined } });
  };
  const defaults = DEFAULT_BINDING_MEASURES[profile.style];
  // The groups that apply to the style: no flaps' hinge on a case, no
  // boards on a soft cover.
  const groups = MEASURE_GROUPS.filter((g) => (isCase(profile.style) ? g.id !== 'softcover' : g.id !== 'case' && g.id !== 'jacket' && g.id !== 'endpapers'));
  return (
    <div className="flex flex-col">
      <TextInput label={labels.coverProfileName} value={profile.name} onChange={(name) => onChange({ name })} widthCh={18} />
      <TextInput label={labels.coverProfilePrinter} value={profile.printer ?? ''} onChange={(v) => onChange({ printer: v.trim() ? v : undefined })} widthCh={18} />
      <SelectInput
        label={labels.coverProfileStyle}
        value={profile.style}
        options={STYLES.map((s) => ({ value: s, label: labels[STYLE_LABEL[s]] }))}
        onChange={(style) => onChange({ style: style as BindingStyle })}
      />
      <NumberInput label={labels.coverProfileSignature} tooltip={labels.coverProfileSignatureTooltip} value={profile.signature ?? 0} min={0} max={64} step={4} suffix={labels.coverPagesUnit} onChange={(v) => onChange({ signature: v > 0 ? v : undefined })} />
      <CollapsibleSection title={labels.coverProfileAccepts} sectionId="cover-profile-accepts" variant="subsection">
        <p className="px-3 py-1 text-xs text-(--slate)">{labels.coverProfileAcceptsIntro}</p>
        <NumberInput label={labels.coverAcceptsTrimMinWidth} value={profile.accepts?.trim?.min?.width ?? 0} min={0} max={1000} step={1} suffix="mm" onChange={(v) => trimLimit('min', 'width', v)} />
        <NumberInput label={labels.coverAcceptsTrimMinHeight} value={profile.accepts?.trim?.min?.height ?? 0} min={0} max={1000} step={1} suffix="mm" onChange={(v) => trimLimit('min', 'height', v)} />
        <NumberInput label={labels.coverAcceptsTrimMaxWidth} value={profile.accepts?.trim?.max?.width ?? 0} min={0} max={1000} step={1} suffix="mm" onChange={(v) => trimLimit('max', 'width', v)} />
        <NumberInput label={labels.coverAcceptsTrimMaxHeight} value={profile.accepts?.trim?.max?.height ?? 0} min={0} max={1000} step={1} suffix="mm" onChange={(v) => trimLimit('max', 'height', v)} />
        <NumberInput label={labels.coverAcceptsSpineMin} value={profile.accepts?.spine?.min ?? 0} min={0} max={200} step={0.5} suffix="mm" onChange={(v) => accepts({ spine: { ...profile.accepts?.spine, min: v > 0 ? v : undefined } })} />
        <NumberInput label={labels.coverAcceptsSpineMax} value={profile.accepts?.spine?.max ?? 0} min={0} max={200} step={0.5} suffix="mm" onChange={(v) => accepts({ spine: { ...profile.accepts?.spine, max: v > 0 ? v : undefined } })} />
      </CollapsibleSection>
      {groups.map((g) => (
        <CollapsibleSection key={g.id} title={labels[GROUP_LABEL[g.id]]} sectionId={`cover-measures-${g.id}`} variant="subsection">
          {g.keys.filter((k) => k !== 'roundSpineAllowance' || profile.style === 'caseRound').map((k) => (
            <LengthField
              key={k}
              label={labels[`coverMeasure_${k}` as keyof SandboxLabels] as string}
              value={profile.measures?.[k]}
              fallback={defaults[k]}
              trim={trim}
              onChange={(length) => onChange(setMeasure(profile, k, length))}
            />
          ))}
        </CollapsibleSection>
      ))}
    </div>
  );
}
