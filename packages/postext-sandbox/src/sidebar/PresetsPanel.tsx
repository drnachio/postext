'use client';

import { Check, RotateCcw } from 'lucide-react';
import { useSandboxLabels, useSandboxPresets } from '../context/SandboxContext';
import { ConfirmPopover } from '../panels/ConfirmPopover';
import { Tooltip } from '../panels/Tooltip';
import type { PresetSummary } from '../presets';

const TAG_STYLE: React.CSSProperties = {
  display: 'inline-block',
  padding: '0 5px',
  borderRadius: 3,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'var(--rule)',
  color: 'var(--slate)',
  fontSize: 10,
  lineHeight: '16px',
  whiteSpace: 'nowrap',
};

function Tag({ children }: { children: React.ReactNode }) {
  return <span style={TAG_STYLE}>{children}</span>;
}

export function PresetsPanel() {
  const labels = useSandboxLabels();
  const { presets, activePresetId, status, error, load, reload } = useSandboxPresets();

  const loading = status === 'loading';
  const active = presets.find((p) => p.id === activePresetId);
  const canReload = !loading && (active?.available ?? false);

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex shrink-0 items-center justify-between border-b px-3 py-2"
        style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--background)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
          {labels.presets}
        </h2>
        <div className="flex items-center gap-1">
          <ConfirmPopover
            message={labels.presetReloadConfirm}
            onConfirm={() => { void reload('all'); }}
          >
            {({ open }) => (
              <Tooltip content={labels.presetReload} side="bottom">
                <button
                  type="button"
                  onClick={open}
                  disabled={!canReload}
                  aria-label={labels.presetReload}
                  className="flex h-6 w-6 items-center justify-center rounded transition-colors focus-visible:outline-1 focus-visible:outline-offset-1 disabled:opacity-40"
                  style={{ color: 'var(--slate)', outlineColor: 'var(--gilt-hover)' }}
                  onMouseEnter={(e) => { if (canReload) e.currentTarget.style.color = 'var(--foreground)'; }}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--slate)')}
                >
                  <RotateCcw size={13} aria-hidden="true" />
                </button>
              </Tooltip>
            )}
          </ConfirmPopover>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading && (
          <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }} role="status">
            {labels.presetLoading}
          </p>
        )}
        {status === 'error' && (
          <p className="mb-2 text-xs" style={{ color: 'var(--destructive)' }} role="alert">
            {labels.presetLoadError}
            {error ? ` (${error})` : ''}
          </p>
        )}
        <ul className="m-0 list-none p-0" aria-label={labels.presets}>
          {presets.map((preset) => (
            <PresetRow
              key={preset.id}
              preset={preset}
              isActive={preset.id === activePresetId}
              disabled={loading || !preset.available}
              onLoad={() => { void load(preset.id); }}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

interface PresetRowProps {
  preset: PresetSummary;
  isActive: boolean;
  disabled: boolean;
  onLoad: () => void;
}

function PresetRow({ preset, isActive, disabled, onLoad }: PresetRowProps) {
  const labels = useSandboxLabels();
  const confirmMessage = labels.presetLoadConfirm.replace('__name__', preset.name);

  const body = (open?: () => void) => (
    <button
      type="button"
      onClick={open}
      disabled={disabled || isActive}
      aria-current={isActive ? 'true' : undefined}
      aria-label={isActive ? `${preset.name} (${labels.presetActive})` : `${labels.presetLoad}: ${preset.name}`}
      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors focus-visible:outline-1 focus-visible:outline-offset-1"
      style={{
        background: 'none',
        border: 'none',
        cursor: disabled || isActive ? 'default' : 'pointer',
        opacity: preset.available ? 1 : 0.5,
        outlineColor: 'var(--gilt-hover)',
      }}
      onMouseEnter={(e) => {
        if (!disabled && !isActive) e.currentTarget.style.backgroundColor = 'var(--surface)';
      }}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center"
        style={{ color: 'var(--gilt)', marginTop: 1 }}
        aria-hidden="true"
      >
        {isActive && <Check size={13} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1">
          <span
            className="truncate text-xs font-medium"
            style={{ color: 'var(--foreground)' }}
            title={preset.name}
          >
            {preset.name}
          </span>
          {preset.locale && <Tag>{preset.locale}</Tag>}
          {preset.source === 'private' && <Tag>{labels.presetPrivate}</Tag>}
          {preset.default && <Tag>{labels.presetDefault}</Tag>}
        </span>
        {preset.description && (
          <span className="mt-0.5 block text-xs" style={{ color: 'var(--slate)' }}>
            {preset.description}
          </span>
        )}
        {!preset.available && (
          <span className="mt-0.5 block text-xs" style={{ color: 'var(--slate)' }}>
            {labels.presetUnavailable}
          </span>
        )}
      </span>
    </button>
  );

  return (
    <li className="mb-1 rounded border" style={{ borderColor: isActive ? 'var(--gilt)' : 'var(--rule)' }}>
      {isActive || disabled ? (
        body()
      ) : (
        <ConfirmPopover message={confirmMessage} onConfirm={onLoad}>
          {({ open }) => body(open)}
        </ConfirmPopover>
      )}
    </li>
  );
}
