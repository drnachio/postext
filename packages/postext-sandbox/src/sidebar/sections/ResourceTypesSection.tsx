'use client';

import { memo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  ResourceType,
  ResourceCounterFormat,
  ResourceCounterReset,
} from 'postext';
import { defaultResourceTypes, formatNumeral } from 'postext';
import {
  useSandboxDispatch,
  useSandboxLabels,
  useSandboxSelector,
  useSandboxResources,
} from '../../context/SandboxContext';
import type { SandboxLabels } from '../../types/labels';
import { CollapsibleSection } from '../../controls';
import { ConfirmPopover } from '../../panels/ConfirmPopover';

function newTypeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `restype-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Sample heading numbers used solely to render the live preview. */
const PREVIEW_HEADING: Record<string, number> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

function counterFormatOptions(labels: SandboxLabels): { value: ResourceCounterFormat; label: string }[] {
  return [
    { value: 'decimal', label: labels.counterFormatDecimal },
    { value: 'roman-lower', label: labels.counterFormatRomanLower },
    { value: 'roman-upper', label: labels.counterFormatRomanUpper },
    { value: 'alpha-lower', label: labels.counterFormatAlphaLower },
    { value: 'alpha-upper', label: labels.counterFormatAlphaUpper },
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

function counterFormatToNumeralStyle(format: ResourceCounterFormat) {
  switch (format) {
    case 'decimal':
      return 'decimal' as const;
    case 'roman-lower':
      return 'lower-roman' as const;
    case 'roman-upper':
      return 'upper-roman' as const;
    case 'alpha-lower':
      return 'lower-alpha' as const;
    case 'alpha-upper':
      return 'upper-alpha' as const;
  }
}

/** Render a sample number for a type using a fixed sample counter (7) and the
 *  sample heading context above. Mirrors the runtime template syntax (`{n}`,
 *  `{h1}`..`{h6}`) but is intentionally lightweight for preview purposes. */
function renderPreviewNumber(type: ResourceType): string {
  const style = counterFormatToNumeralStyle(type.counterFormat);
  return type.numberingTemplate.replace(/\{([^}]+)\}/g, (_match, body: string) => {
    const key = body.trim();
    if (key === 'n') return formatNumeral(7, style);
    const h = PREVIEW_HEADING[key];
    if (h !== undefined) return formatNumeral(h, 'decimal');
    return _match;
  });
}

/** Builds the full preview string, e.g. "Fig. 1.7" or "Figure 1.7". */
function renderPreview(type: ResourceType): string {
  const number = renderPreviewNumber(type);
  const prefix = type.shortLabel || type.captionPrefix || type.name;
  return [prefix, number].filter(Boolean).join(' ');
}

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
const inputStyle = { borderColor: 'var(--rule)', color: 'var(--foreground)' } as const;
const labelStyle = { color: 'var(--slate)', fontSize: 11, lineHeight: '14px' } as const;

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-0.5">
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

export const ResourceTypesSection = memo(function ResourceTypesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const locale = useSandboxSelector((s) => s.locale);
  const resources = useSandboxResources();
  const types: ResourceType[] = config.resourceTypes ?? defaultResourceTypes(locale);
  const isDefault = config.resourceTypes === undefined;
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
          <div
            key={type.id}
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
                  <button
                    type="button"
                    onClick={open}
                    aria-label={labels.resourceTypeDelete}
                    title={labels.resourceTypeDelete}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                    style={{ color: 'var(--destructive)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                )}
              </ConfirmPopover>
            </div>

            <div className="flex flex-col gap-2">
              <Field label={labels.idLabel}>
                <input
                  type="text"
                  value={type.id}
                  readOnly
                  disabled
                  aria-label={labels.resourceTypeIdAria}
                  className={inputClass}
                  style={{ ...inputStyle, color: 'var(--slate)', cursor: 'not-allowed' }}
                />
              </Field>
              <Field label={labels.resourceTypeNameLabel}>
                <input
                  type="text"
                  value={type.name}
                  onChange={(e) => updateType(type.id, { name: e.target.value })}
                  aria-label={labels.resourceTypeNameAria}
                  className={inputClass}
                  style={inputStyle}
                />
              </Field>
              <Field label={labels.resourceTypeNamePluralLabel}>
                <input
                  type="text"
                  value={type.namePlural ?? ''}
                  onChange={(e) => updateType(type.id, { namePlural: e.target.value })}
                  aria-label={labels.resourceTypeNamePluralAria}
                  className={inputClass}
                  style={inputStyle}
                />
              </Field>
              <Field label={labels.resourceTypeShortLabelLabel}>
                <input
                  type="text"
                  value={type.shortLabel}
                  onChange={(e) => updateType(type.id, { shortLabel: e.target.value })}
                  aria-label={labels.resourceTypeShortLabelAria}
                  className={inputClass}
                  style={inputStyle}
                />
              </Field>
              <Field label={labels.resourceTypeNumberingLabel}>
                <input
                  type="text"
                  value={type.numberingTemplate}
                  onChange={(e) => updateType(type.id, { numberingTemplate: e.target.value })}
                  aria-label={labels.resourceTypeNumberingAria}
                  placeholder="{h1}.{n}"
                  className={inputClass}
                  style={inputStyle}
                />
              </Field>
              <Field label={labels.resourceTypeResetCounterLabel}>
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
              <Field label={labels.resourceTypeCounterFormatLabel}>
                <select
                  value={type.counterFormat}
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
              <Field label={labels.resourceTypeCaptionPrefixLabel}>
                <input
                  type="text"
                  value={type.captionPrefix}
                  onChange={(e) => updateType(type.id, { captionPrefix: e.target.value })}
                  aria-label={labels.resourceTypeCaptionPrefixAria}
                  className={inputClass}
                  style={inputStyle}
                />
              </Field>
            </div>

            <div
              className="mt-2 flex items-center gap-1.5 text-xs"
              style={{ color: 'var(--slate)' }}
            >
              <span style={labelStyle}>{labels.previewLabel}</span>
              <span
                className="rounded px-1.5 py-0.5"
                style={{ backgroundColor: 'var(--surface)', color: 'var(--foreground)' }}
              >
                {renderPreview(type)}
              </span>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addType}
        className="mt-1 flex items-center gap-1 rounded border px-2 py-1 text-xs"
        style={{
          borderColor: 'var(--rule)',
          backgroundColor: 'var(--surface)',
          color: 'var(--foreground)',
          cursor: 'pointer',
        }}
      >
        <Plus size={12} aria-hidden="true" />
        {labels.resourceTypeAdd}
      </button>
    </CollapsibleSection>
  );
});
