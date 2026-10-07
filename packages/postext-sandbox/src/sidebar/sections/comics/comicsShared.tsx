'use client';

import { useMemo } from 'react';
import type { ComicsConfig, DimensionUnit, PanelStyleConfig, ResolvedComicsConfig, ResolvedPanelStyleConfig } from 'postext';
import { resolveComicsConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext';
import { ColorPicker, DimensionInput, SelectInput, ToggleSwitch } from '../../../controls';
import { pruneComics } from './comicsConfig';

export const BORDER_UNITS: DimensionUnit[] = ['pt', 'mm', 'px'];
export const GUTTER_UNITS: DimensionUnit[] = ['mm', 'pt', 'cm', 'in'];
export const EM_UNITS: DimensionUnit[] = ['em', 'pt', 'mm'];

export const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
export const inputStyle = { borderColor: 'var(--pt-control-border)', color: 'var(--foreground)' } as const;

/** The comics settings as written, resolved against the document language
 *  (the default lettering faces follow it), and a writer that stores a
 *  whole new `comics` value (pruned, so an emptied section leaves no key). */
export function useComics(): {
  raw: ComicsConfig | undefined;
  resolved: ResolvedComicsConfig;
  locale: string | undefined;
  write: (next: ComicsConfig | undefined) => void;
} {
  const dispatch = useSandboxDispatch();
  const raw = useSandboxSelector((s) => s.config.comics);
  const locale = useSandboxSelector((s) => s.config.locale ?? s.config.bodyText?.hyphenation?.locale ?? s.locale);
  const resolved = useMemo(() => resolveComicsConfig(raw, locale), [raw, locale]);
  const write = (next: ComicsConfig | undefined) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { comics: pruneComics(next) } });
  };
  return { raw, resolved, locale, write };
}

interface PanelStyleFieldsProps {
  /** What the style sets itself. */
  raw: PanelStyleConfig | undefined;
  /** The style resolved (its unset fields show what they inherit). */
  resolved: ResolvedPanelStyleConfig;
  onChange: (partial: Partial<PanelStyleConfig>) => void;
  onResetField: (field: keyof PanelStyleConfig) => void;
  /** Prefix of the colour pickers' field ids (unique per style). */
  fieldIdPrefix: string;
}

/** The fields of a panel style: border, ground, picture fit and bleed.
 *  Shared by the default panel style and the named ones. */
export function PanelStyleFields({ raw, resolved, onChange, onResetField, fieldIdPrefix }: PanelStyleFieldsProps) {
  const labels = useSandboxLabels();
  const unset = (field: keyof PanelStyleConfig) => raw?.[field] === undefined;
  return (
    <>
      <SelectInput
        label={labels.comicsBorderStyle}
        tooltip={labels.comicsBorderStyleHelp}
        value={resolved.borderStyle}
        options={[
          { value: 'solid', label: labels.comicsBorderStyleSolid },
          { value: 'rough', label: labels.comicsBorderStyleRough },
          { value: 'none', label: labels.comicsBorderStyleNone },
        ]}
        onChange={(v) => onChange({ borderStyle: v as PanelStyleConfig['borderStyle'] })}
        variant="segmented"
        isDefault={unset('borderStyle')}
        onReset={() => onResetField('borderStyle')}
      />
      {resolved.borderStyle !== 'none' && (
        <>
          <DimensionInput
            label={labels.comicsBorderWidth}
            tooltip={labels.comicsBorderWidthHelp}
            value={resolved.borderWidth}
            onChange={(v) => onChange({ borderWidth: v })}
            min={0}
            step={0.25}
            units={BORDER_UNITS}
            isDefault={unset('borderWidth')}
            onReset={() => onResetField('borderWidth')}
          />
          <ColorPicker
            label={labels.comicsBorderColor}
            value={resolved.borderColor}
            onChange={(v) => onChange({ borderColor: v })}
            isDefault={unset('borderColor')}
            onReset={() => onResetField('borderColor')}
            fieldId={`${fieldIdPrefix}-borderColor`}
          />
        </>
      )}
      <DimensionInput
        label={labels.comicsBorderRadius}
        tooltip={labels.comicsBorderRadiusHelp}
        value={resolved.borderRadius}
        onChange={(v) => onChange({ borderRadius: v })}
        min={0}
        step={0.5}
        units={BORDER_UNITS}
        isDefault={unset('borderRadius')}
        onReset={() => onResetField('borderRadius')}
      />
      <ColorPicker
        label={labels.comicsPanelBackground}
        tooltip={labels.comicsPanelBackgroundHelp}
        value={resolved.background}
        onChange={(v) => onChange({ background: v })}
        isDefault={unset('background')}
        onReset={() => onResetField('background')}
        fieldId={`${fieldIdPrefix}-background`}
      />
      <SelectInput
        label={labels.comicsPanelFit}
        tooltip={labels.comicsPanelFitHelp}
        value={resolved.fit}
        options={[
          { value: 'cover', label: labels.comicsPanelFitCover },
          { value: 'contain', label: labels.comicsPanelFitContain },
        ]}
        onChange={(v) => onChange({ fit: v as PanelStyleConfig['fit'] })}
        variant="segmented"
        isDefault={unset('fit')}
        onReset={() => onResetField('fit')}
      />
      <ToggleSwitch
        label={labels.comicsPanelBleed}
        tooltip={labels.comicsPanelBleedHelp}
        checked={resolved.bleed}
        onChange={(v) => onChange({ bleed: v })}
        isDefault={unset('bleed')}
        onReset={() => onResetField('bleed')}
      />
    </>
  );
}
