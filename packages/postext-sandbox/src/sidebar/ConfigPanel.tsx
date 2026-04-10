'use client';

import { useRef } from 'react';
import { Download, Upload } from 'lucide-react';
import { useSandbox } from '../context/SandboxContext';
import type { PostextConfig, PlacementStrategy } from 'postext';
import { exportConfigToJson, importConfigFromJson } from '../storage/persistence';
import { Tooltip } from '../panels/Tooltip';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider first:mt-0"
      style={{ color: 'var(--gilt)' }}
    >
      {children}
    </h3>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <label className="text-xs shrink-0" style={{ color: 'var(--slate)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      className="w-16 rounded border px-2 py-1 text-xs"
      style={{
        borderColor: 'var(--rule)',
        backgroundColor: 'var(--surface)',
        color: 'var(--foreground)',
      }}
    />
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-24 rounded border px-2 py-1 text-xs"
      style={{
        borderColor: 'var(--rule)',
        backgroundColor: 'var(--surface)',
        color: 'var(--foreground)',
      }}
    />
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean | undefined;
  onChange: (v: boolean) => void;
}) {
  const isOn = checked ?? false;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      onClick={() => onChange(!isOn)}
      className="relative h-5 w-9 rounded-full transition-colors"
      style={{ backgroundColor: isOn ? 'var(--gilt)' : 'var(--rule)' }}
    >
      <span
        className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full transition-transform"
        style={{
          backgroundColor: 'var(--background)',
          transform: isOn ? 'translateX(16px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}

function SelectInput<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value ?? options[0]?.value}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-28 rounded border px-2 py-1 text-xs"
      style={{
        borderColor: 'var(--rule)',
        backgroundColor: 'var(--surface)',
        color: 'var(--foreground)',
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function ConfigPanel() {
  const { state, dispatch } = useSandbox();
  const { config, labels } = state;
  const importRef = useRef<HTMLInputElement>(null);

  const update = (partial: Partial<PostextConfig>) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: partial });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importConfigFromJson(file);
      dispatch({ type: 'SET_CONFIG', payload: data.config });
    } catch {
      // Silently ignore invalid files
    }
    e.target.value = '';
  };

  return (
    <div className="p-3">
      <div className="mb-3 flex items-center justify-between">
        <h2
          className="text-sm font-semibold"
          style={{ color: 'var(--foreground)' }}
        >
          {labels.configuration}
        </h2>
        <div className="flex items-center gap-1">
          <Tooltip content={labels.exportFile} side="bottom">
            <button
              type="button"
              onClick={() => exportConfigToJson(config)}
              aria-label={labels.exportFile}
              className="flex h-6 w-6 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2"
              style={{ color: 'var(--slate)', outlineColor: 'var(--accent-blue)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--slate)')}
            >
              <Download size={14} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip content={labels.importFile} side="bottom">
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              aria-label={labels.importFile}
              className="flex h-6 w-6 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2"
              style={{ color: 'var(--slate)', outlineColor: 'var(--accent-blue)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--slate)')}
            >
              <Upload size={14} aria-hidden="true" />
            </button>
          </Tooltip>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Columns */}
      <SectionTitle>{labels.columns}</SectionTitle>
      <FieldRow label={labels.columns}>
        <NumberInput
          value={config.columns}
          onChange={(v) => update({ columns: v })}
          min={1}
          max={6}
        />
      </FieldRow>
      <FieldRow label={labels.gutter}>
        <TextInput
          value={config.gutter}
          onChange={(v) => update({ gutter: v })}
          placeholder="24px"
        />
      </FieldRow>
      <FieldRow label={labels.columnBalancing}>
        <Toggle
          checked={config.columnConfig?.balancing}
          onChange={(v) =>
            update({ columnConfig: { ...config.columnConfig, balancing: v } })
          }
        />
      </FieldRow>

      {/* Typography */}
      <SectionTitle>{labels.typography}</SectionTitle>
      <FieldRow label={labels.orphans}>
        <NumberInput
          value={config.typography?.orphans}
          onChange={(v) =>
            update({ typography: { ...config.typography, orphans: v } })
          }
          min={1}
          max={5}
        />
      </FieldRow>
      <FieldRow label={labels.widows}>
        <NumberInput
          value={config.typography?.widows}
          onChange={(v) =>
            update({ typography: { ...config.typography, widows: v } })
          }
          min={1}
          max={5}
        />
      </FieldRow>
      <FieldRow label={labels.hyphenation}>
        <Toggle
          checked={config.typography?.hyphenation}
          onChange={(v) =>
            update({ typography: { ...config.typography, hyphenation: v } })
          }
        />
      </FieldRow>
      <FieldRow label={labels.ragOptimization}>
        <Toggle
          checked={config.typography?.ragOptimization}
          onChange={(v) =>
            update({ typography: { ...config.typography, ragOptimization: v } })
          }
        />
      </FieldRow>

      {/* References */}
      <SectionTitle>{labels.references}</SectionTitle>
      <FieldRow label={labels.footnotePlacement}>
        <SelectInput
          value={config.references?.footnotes?.placement}
          options={[
            { value: 'columnBottom', label: 'Column Bottom' },
            { value: 'pageBottom', label: 'Page Bottom' },
            { value: 'endOfSection', label: 'End of Section' },
          ]}
          onChange={(v) =>
            update({
              references: {
                ...config.references,
                footnotes: { ...config.references?.footnotes, placement: v },
              },
            })
          }
        />
      </FieldRow>
      <FieldRow label={labels.footnoteMarker}>
        <SelectInput
          value={config.references?.footnotes?.marker}
          options={[
            { value: 'number', label: 'Number' },
            { value: 'symbol', label: 'Symbol' },
            { value: 'custom', label: 'Custom' },
          ]}
          onChange={(v) =>
            update({
              references: {
                ...config.references,
                footnotes: { ...config.references?.footnotes, marker: v },
              },
            })
          }
        />
      </FieldRow>
      <FieldRow label={labels.figureNumbering}>
        <Toggle
          checked={config.references?.figureNumbering}
          onChange={(v) =>
            update({ references: { ...config.references, figureNumbering: v } })
          }
        />
      </FieldRow>
      <FieldRow label={labels.tableNumbering}>
        <Toggle
          checked={config.references?.tableNumbering}
          onChange={(v) =>
            update({ references: { ...config.references, tableNumbering: v } })
          }
        />
      </FieldRow>
      <FieldRow label={labels.marginNotes}>
        <Toggle
          checked={config.references?.marginNotes}
          onChange={(v) =>
            update({ references: { ...config.references, marginNotes: v } })
          }
        />
      </FieldRow>

      {/* Resource Placement */}
      <SectionTitle>{labels.resourcePlacement}</SectionTitle>
      <FieldRow label={labels.defaultStrategy}>
        <SelectInput<PlacementStrategy>
          value={config.resourcePlacement?.defaultStrategy}
          options={[
            { value: 'inline', label: 'Inline' },
            { value: 'topOfColumn', label: 'Top of Column' },
            { value: 'floatLeft', label: 'Float Left' },
            { value: 'floatRight', label: 'Float Right' },
            { value: 'fullWidthBreak', label: 'Full Width' },
            { value: 'margin', label: 'Margin' },
          ]}
          onChange={(v) =>
            update({
              resourcePlacement: { ...config.resourcePlacement, defaultStrategy: v },
            })
          }
        />
      </FieldRow>
      <FieldRow label={labels.deferPlacement}>
        <Toggle
          checked={config.resourcePlacement?.deferPlacement}
          onChange={(v) =>
            update({
              resourcePlacement: { ...config.resourcePlacement, deferPlacement: v },
            })
          }
        />
      </FieldRow>
      <FieldRow label={labels.preserveAspectRatio}>
        <Toggle
          checked={config.resourcePlacement?.preserveAspectRatio}
          onChange={(v) =>
            update({
              resourcePlacement: { ...config.resourcePlacement, preserveAspectRatio: v },
            })
          }
        />
      </FieldRow>

      {/* Renderer */}
      <SectionTitle>{labels.renderer}</SectionTitle>
      <FieldRow label={labels.renderer}>
        <SelectInput
          value={config.renderer}
          options={[
            { value: 'web', label: 'Web' },
            { value: 'pdf', label: 'PDF' },
          ]}
          onChange={(v) => update({ renderer: v as 'web' | 'pdf' })}
        />
      </FieldRow>
    </div>
  );
}
