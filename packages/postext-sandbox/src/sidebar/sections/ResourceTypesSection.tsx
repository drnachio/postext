'use client';

import { memo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  CaptionStyleConfig,
  ResourceType,
  ResourceCounterFormat,
  ResourceCounterReset,
  ResourcePlacement,
} from 'postext';
import {
  defaultResourceTypes,
  mergeCaptionStyle,
  resolveBodyTextConfig,
  resolveCaptionStyleConfig,
} from 'postext';
import {
  useSandboxDispatch,
  useSandboxLabels,
  useSandboxSelector,
  useSandboxResources,
} from '../../context/SandboxContext';
import type { SandboxLabels } from '../../types/labels';
import { arabicNumberFormatOptions, eastAsianNumberFormatOptions } from '../settings/eastAsianOptions';
import { CollapsibleSection, NumberInput, SelectInput, ToggleSwitch } from '../../controls';
import { Button, ConfirmPopover, IconButton } from '../../ui';
import { FieldRow } from '../../controls/FieldRow';
import { SearchScope } from '../search/SearchScope';
import { CaptionStyleFields } from './CaptionStyleFields';
import { renderResourceTypePreview, resourceCounterFormat } from './resourceTypePreview';
import { documentDigits, documentLanguage } from '../../context/documentDirection';
import { flowSideLabels, useRightToLeftFlow } from '../settings/flowSides';
import { MULTIPLE_COLUMNS_MAX } from '../settings/multipleColumns';

function newTypeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `restype-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function counterFormatOptions(labels: SandboxLabels): { value: ResourceCounterFormat; label: string }[] {
  return [
    { value: 'decimal', label: labels.counterFormatDecimal },
    { value: 'roman-lower', label: labels.counterFormatRomanLower },
    { value: 'roman-upper', label: labels.counterFormatRomanUpper },
    { value: 'alpha-lower', label: labels.counterFormatAlphaLower },
    { value: 'alpha-upper', label: labels.counterFormatAlphaUpper },
    ...eastAsianNumberFormatOptions(labels),
    ...arabicNumberFormatOptions(labels),
  ];
}

function resetOnOptions(labels: SandboxLabels): { value: ResourceCounterReset; label: string }[] {
  return [
    { value: 'never', label: labels.resetOnNever },
    { value: 'h1', label: labels.resetOnH1 },
    { value: 'h2', label: labels.resetOnH2 },
    { value: 'h3', label: labels.resetOnH3 },
    { value: 'h4', label: labels.resetOnH4 },
    { value: 'h5', label: labels.resetOnH5 },
    { value: 'h6', label: labels.resetOnH6 },
  ];
}

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
const inputStyle = { borderColor: 'var(--pt-control-border)', color: 'var(--foreground)' } as const;
const labelStyle = { color: 'var(--slate)', fontSize: 11, lineHeight: '14px' } as const;

interface FieldProps {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}

function Field({ label, tooltip, children }: FieldProps) {
  return (
    <FieldRow stacked label={label} tooltip={tooltip} className="mb-0">
      {children}
    </FieldRow>
  );
}

export const ResourceTypesSection = memo(function ResourceTypesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const locale = useSandboxSelector((s) => s.locale);
  const resources = useSandboxResources();
  const floatSide = flowSideLabels(useRightToLeftFlow(), labels.headerFooterElementAlignLeft, labels.headerFooterElementAlignRight);
  const types: ResourceType[] = config.resourceTypes ?? defaultResourceTypes(locale);
  // The previews number in the document's digits, as the pages do.
  const language = documentLanguage(config, locale ?? 'en');
  const digits = documentDigits(config.numerals, language);
  const isDefault = config.resourceTypes === undefined;
  // Per-type caption overrides are shown merged over the resolved global
  // caption style so every control displays the value that will render.
  const globalCaption = resolveCaptionStyleConfig(
    config.captionStyle,
    resolveBodyTextConfig(config.bodyText),
    language,
  );
  const counterFormats = counterFormatOptions(labels);
  const resetOns = resetOnOptions(labels);

  const writeTypes = (next: ResourceType[]) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { resourceTypes: next },
    });
  };

  const addType = () => {
    const type: ResourceType = {
      id: newTypeId(),
      name: labels.resourceTypeNewName,
      namePlural: '',
      shortLabel: '',
      numberingTemplate: '{h1}.{n}',
      resetOn: 'h1',
      counterFormat: 'decimal',
      captionPrefix: '',
    };
    writeTypes([...types, type]);
  };

  const updateType = (id: string, partial: Partial<ResourceType>) => {
    const next = types.map((t) => (t.id === id ? { ...t, ...partial } : t));
    writeTypes(next);
  };

  const removeType = (id: string) => {
    const next = types.filter((t) => t.id !== id);
    writeTypes(next);
  };

  /** Merge into a type's `defaultPlacement`; an empty value drops the key. */
  const updateTypePlacement = (type: ResourceType, partial: Partial<ResourcePlacement>) => {
    const next: ResourcePlacement = { ...type.defaultPlacement };
    for (const [k, v] of Object.entries(partial) as [keyof ResourcePlacement, ResourcePlacement[keyof ResourcePlacement]][]) {
      if (v === undefined || (v as unknown) === '') delete next[k];
      else (next as Record<string, unknown>)[k] = v;
    }
    updateType(type.id, { defaultPlacement: Object.keys(next).length > 0 ? next : undefined });
  };

  /** Merge into a type's partial `captionStyle`, keeping untouched keys unset. */
  const updateTypeCaptionStyle = (type: ResourceType, partial: Partial<CaptionStyleConfig>) => {
    updateType(type.id, { captionStyle: { ...type.captionStyle, ...partial } });
  };
  const resetTypeCaptionField = (type: ResourceType, field: keyof CaptionStyleConfig) => {
    if (!type.captionStyle) return;
    const next = { ...type.captionStyle };
    delete next[field];
    updateType(type.id, { captionStyle: Object.keys(next).length > 0 ? next : undefined });
  };

  return (
    <CollapsibleSection
      title={labels.resourceTypesSection}
      sectionId="resource-types"
      hasOverrides={!isDefault}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { resourceTypes: undefined } })}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resourceTypesResetConfirm}
    >
      {types.length === 0 && (
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.resourceTypesEmpty}
        </p>
      )}
      {types.map((type) => {
        const usageCount = resources.filter((r) => r.typeId === type.id).length;
        const confirmMessage = (
          <>
            <div style={{ fontWeight: 500, marginBottom: usageCount > 0 ? 6 : 0 }}>
              {labels.resourceTypeDeleteConfirm}
            </div>
            {usageCount > 0 && (
              <div style={{ color: 'var(--slate)', fontSize: 11, lineHeight: '14px' }}>
                {usageCount === 1
                  ? labels.resourceTypeDeleteUsageOne
                  : labels.resourceTypeDeleteUsageMany.replace('__count__', String(usageCount))}
              </div>
            )}
          </>
        );

        return (
          <SearchScope key={type.id} title={`${type.name} ${type.id}`} overridden={!isDefault}>
          <div
            className="mb-3 rounded border p-2"
            style={{ borderColor: 'var(--rule)' }}
          >
            <div className="mb-2 flex items-center justify-between gap-1">
              <span
                className="truncate text-xs font-medium"
                style={{ color: 'var(--foreground)' }}
                title={type.name}
              >
                {type.name || type.id}
              </span>
              <ConfirmPopover message={confirmMessage} onConfirm={() => removeType(type.id)}>
                {({ open }) => (
                  <IconButton label={labels.resourceTypeDelete} icon={<Trash2 size={13} />} destructive onClick={open} />
                )}
              </ConfirmPopover>
            </div>

            <div className="flex flex-col gap-2">
              <Field label={labels.idLabel} tooltip={labels.styleIdHelp}>
                <input
                  dir="ltr"
                  type="text"
                  value={type.id}
                  readOnly
                  disabled
                  aria-label={labels.resourceTypeIdAria}
                  className={inputClass}
                  style={{ ...inputStyle, color: 'var(--slate)', cursor: 'not-allowed' }}
                />
              </Field>
              <Field label={labels.resourceTypeNameLabel} tooltip={labels.resourceTypeNameTooltip}>
                <input
                  dir="auto"
                  type="text"
                  value={type.name}
                  onChange={(e) => updateType(type.id, { name: e.target.value })}
                  aria-label={labels.resourceTypeNameAria}
                  className={inputClass}
                  style={inputStyle}
                />
              </Field>
              <Field label={labels.resourceTypeNamePluralLabel} tooltip={labels.resourceTypeNamePluralTooltip}>
                <input
                  dir="auto"
                  type="text"
                  value={type.namePlural ?? ''}
                  onChange={(e) => updateType(type.id, { namePlural: e.target.value })}
                  aria-label={labels.resourceTypeNamePluralAria}
                  className={inputClass}
                  style={inputStyle}
                />
              </Field>
              <Field label={labels.resourceTypeShortLabelLabel} tooltip={labels.resourceTypeShortLabelTooltip}>
                <input
                  dir="auto"
                  type="text"
                  value={type.shortLabel}
                  onChange={(e) => updateType(type.id, { shortLabel: e.target.value })}
                  aria-label={labels.resourceTypeShortLabelAria}
                  className={inputClass}
                  style={inputStyle}
                />
              </Field>
              <Field label={labels.resourceTypeNumberingLabel} tooltip={labels.resourceTypeNumberingTooltip}>
                <input
                  dir="ltr"
                  type="text"
                  value={type.numberingTemplate}
                  onChange={(e) => updateType(type.id, { numberingTemplate: e.target.value })}
                  aria-label={labels.resourceTypeNumberingAria}
                  placeholder="{h1}.{n}"
                  className={inputClass}
                  style={inputStyle}
                />
              </Field>
              <Field label={labels.resourceTypeResetCounterLabel} tooltip={labels.resourceTypeResetCounterTooltip}>
                <select
                  value={type.resetOn}
                  onChange={(e) =>
                    updateType(type.id, { resetOn: e.target.value as ResourceCounterReset })
                  }
                  aria-label={labels.resourceTypeResetCounterAria}
                  className={inputClass}
                  style={inputStyle}
                >
                  {resetOns.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={labels.resourceTypeCounterFormatLabel} tooltip={labels.resourceTypeCounterFormatTooltip}>
                <select
                  value={resourceCounterFormat(type.counterFormat, language)}
                  onChange={(e) =>
                    updateType(type.id, { counterFormat: e.target.value as ResourceCounterFormat })
                  }
                  aria-label={labels.resourceTypeCounterFormatAria}
                  className={inputClass}
                  style={inputStyle}
                >
                  {counterFormats.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={labels.resourceTypeCaptionPrefixLabel} tooltip={labels.resourceTypeCaptionPrefixTooltip}>
                <input
                  dir="auto"
                  type="text"
                  value={type.captionPrefix}
                  onChange={(e) => updateType(type.id, { captionPrefix: e.target.value })}
                  aria-label={labels.resourceTypeCaptionPrefixAria}
                  className={inputClass}
                  style={inputStyle}
                />
              </Field>
            </div>

            <div className="mt-2">
              <CollapsibleSection
                title={labels.resourceTypePlacementGroup}
                sectionId={`resource-types.${type.id}.placement`}
                variant="subsection"
                hasOverrides={type.defaultPlacement !== undefined && Object.keys(type.defaultPlacement).length > 0}
                onReset={() => updateType(type.id, { defaultPlacement: undefined })}
                resetLabel={labels.reset}
                resetConfirmMessage={labels.resourceTypePlacementResetConfirm}
              >
                <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
                  {labels.resourceTypePlacementHint}
                </p>
                <div className="flex flex-col gap-2">
                  <Field label={labels.resourceTypePlacementPosition} tooltip={labels.resourceTypePlacementPositionTooltip}>
                    <select
                      value={type.defaultPlacement?.position ?? ''}
                      onChange={(e) => updateTypePlacement(type, { position: (e.target.value || undefined) as ResourcePlacement['position'] })}
                      aria-label={labels.resourceTypePlacementPosition}
                      className={inputClass}
                      style={inputStyle}
                    >
                      <option value="">{labels.resourceTypePlacementInherit}</option>
                      <option value="auto">{labels.resourceTypePlacementPositionAuto}</option>
                      <option value="top">{labels.resourceTypePlacementPositionTop}</option>
                      <option value="bottom">{labels.resourceTypePlacementPositionBottom}</option>
                      <option value="here">{labels.resourceTypePlacementPositionHere}</option>
                    </select>
                  </Field>
                  <Field label={labels.resourceTypePlacementSpan} tooltip={labels.resourceTypePlacementSpanTooltip}>
                    <select
                      value={type.defaultPlacement?.span ?? ''}
                      onChange={(e) => updateTypePlacement(type, { span: (e.target.value || undefined) as ResourcePlacement['span'] })}
                      aria-label={labels.resourceTypePlacementSpan}
                      className={inputClass}
                      style={inputStyle}
                    >
                      <option value="">{labels.resourceTypePlacementInherit}</option>
                      <option value="column">{labels.headingSpanColumn}</option>
                      <option value="page">{labels.resourceTypePlacementSpanPage}</option>
                      <option value="side">{labels.resourceSpanSide}</option>
                    </select>
                  </Field>
                  {(type.defaultPlacement?.span ?? 'column') === 'column' && (
                    <NumberInput
                      label={labels.resourceTypePlacementColumns}
                      value={type.defaultPlacement?.columns ?? 1}
                      onChange={(v) => updateTypePlacement(type, { columns: v <= 1 ? undefined : Math.round(v) })}
                      min={1}
                      max={MULTIPLE_COLUMNS_MAX}
                      step={1}
                      tooltip={labels.resourceTypePlacementColumnsTooltip}
                      isDefault={type.defaultPlacement?.columns === undefined}
                      onReset={() => updateTypePlacement(type, { columns: undefined })}
                    />
                  )}
                  <NumberInput
                    label={labels.resourceTypePlacementWidth}
                    value={Math.round((type.defaultPlacement?.width ?? 1) * 100)}
                    onChange={(v) => updateTypePlacement(type, { width: v >= 100 ? undefined : Math.max(1, v) / 100 })}
                    min={10}
                    max={100}
                    step={5}
                    suffix="%"
                    tooltip={labels.resourceTypePlacementWidthTooltip}
                    isDefault={type.defaultPlacement?.width === undefined}
                    onReset={() => updateTypePlacement(type, { width: undefined })}
                  />
                  <SelectInput
                    label={labels.resourceTypePlacementAlign}
                    value={type.defaultPlacement?.align === 'start' ? 'left' : type.defaultPlacement?.align === 'end' ? 'right' : type.defaultPlacement?.align ?? 'left'}
                    options={[
                      { value: 'left', label: floatSide.left },
                      { value: 'center', label: labels.headerFooterElementAlignCenter },
                      { value: 'right', label: floatSide.right },
                    ]}
                    onChange={(v) => updateTypePlacement(type, { align: v as ResourcePlacement['align'] })}
                    tooltip={labels.resourceTypePlacementAlignTooltip}
                    isDefault={type.defaultPlacement?.align === undefined}
                    onReset={() => updateTypePlacement(type, { align: undefined })}
                  />
                  <ToggleSwitch
                    label={labels.resourceTypePlacementCaptionSide}
                    checked={type.defaultPlacement?.captionSide ?? false}
                    onChange={(v) => updateTypePlacement(type, { captionSide: v || undefined })}
                    tooltip={labels.resourceTypePlacementCaptionSideTooltip}
                    isDefault={type.defaultPlacement?.captionSide === undefined}
                    onReset={() => updateTypePlacement(type, { captionSide: undefined })}
                  />
                  <Field label={labels.resourceTypePlacementRotate} tooltip={labels.resourceTypePlacementRotateTooltip}>
                    <select
                      value={type.defaultPlacement?.rotate ?? ''}
                      onChange={(e) => updateTypePlacement(type, { rotate: (e.target.value || undefined) as ResourcePlacement['rotate'] })}
                      aria-label={labels.resourceTypePlacementRotate}
                      className={inputClass}
                      style={inputStyle}
                    >
                      <option value="">{labels.resourceTypePlacementRotateNone}</option>
                      <option value="ccw">{labels.resourceTypePlacementRotateCcw}</option>
                      <option value="cw">{labels.resourceTypePlacementRotateCw}</option>
                    </select>
                  </Field>
                </div>
              </CollapsibleSection>
            </div>

            <div className="mt-2">
              <CollapsibleSection
                title={labels.resourceTypeCaptionStyleGroup}
                sectionId={`resource-types.${type.id}.captionStyle`}
                variant="subsection"
                hasOverrides={type.captionStyle !== undefined && Object.keys(type.captionStyle).length > 0}
                onReset={() => updateType(type.id, { captionStyle: undefined })}
                resetLabel={labels.reset}
                resetConfirmMessage={labels.resourceTypeCaptionStyleResetConfirm}
              >
                <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
                  {labels.resourceTypeCaptionStyleHint}
                </p>
                <CaptionStyleFields
                  raw={type.captionStyle}
                  resolved={mergeCaptionStyle(globalCaption, type.captionStyle, config.colorPalette)}
                  update={(partial) => updateTypeCaptionStyle(type, partial)}
                  resetField={(field) => resetTypeCaptionField(type, field)}
                  sectionIdPrefix={`resource-types.${type.id}.captionStyle`}
                  fieldIdPrefix={`resourceType-${type.id}-caption`}
                />
              </CollapsibleSection>
            </div>

            <div
              className="mt-2 flex items-center gap-1.5 text-xs"
              style={{ color: 'var(--slate)' }}
            >
              <span style={labelStyle}>{labels.previewLabel}</span>
              <span
                className="rounded px-1.5 py-0.5"
                dir="auto"
                style={{ backgroundColor: 'var(--surface)', color: 'var(--foreground)' }}
              >
                {renderResourceTypePreview(type, digits, language)}
              </span>
            </div>
          </div>
          </SearchScope>
        );
      })}
      <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={addType} className="mt-1">
        {labels.resourceTypeAdd}
      </Button>
    </CollapsibleSection>
  );
});
