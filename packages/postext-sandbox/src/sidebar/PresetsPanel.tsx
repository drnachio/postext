'use client';

import { Check, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
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

/** Wraps `children` in a confirm popover only when confirmation is wanted;
 *  otherwise the trigger fires `onConfirm` directly. Reloading an untouched
 *  preset is idempotent, so it needs no confirmation. */
function MaybeConfirm({
  confirm,
  message,
  onConfirm,
  children,
}: {
  confirm: boolean;
  message: ReactNode;
  onConfirm: () => void;
  children: (open: () => void) => ReactNode;
}) {
  if (!confirm) return <>{children(onConfirm)}</>;
  return (
    <ConfirmPopover message={message} onConfirm={onConfirm}>
      {({ open }) => children(open)}
    </ConfirmPopover>
  );
}

export function PresetsPanel() {
  const labels = useSandboxLabels();
  const { presets, activePresetId, status, error, untouched, stale, updatedAt, load, reload } = useSandboxPresets();

  const loading = status === 'loading';
  const active = presets.find((p) => p.id === activePresetId);
  const canReload = !loading && (active?.available ?? false);
  const reloadAll = () => { void reload('all'); };

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
          <MaybeConfirm confirm={!untouched} message={labels.presetReloadConfirm} onConfirm={reloadAll}>
            {(open) => (
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
          </MaybeConfirm>
        </div>
      </div>
      {stale && (
        <div
          role="status"
          className="flex shrink-0 items-start gap-2 border-b px-3 py-2 text-xs"
          style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--surface)', color: 'var(--foreground)' }}
        >
          <span className="min-w-0 flex-1">{labels.presetStaleBanner}</span>
          <button
            type="button"
            onClick={reloadAll}
            disabled={!canReload}
            className="shrink-0 rounded border px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-1 focus-visible:outline-offset-1 disabled:opacity-40"
            style={{ borderColor: 'var(--gilt)', color: 'var(--gilt)', background: 'none', outlineColor: 'var(--gilt-hover)' }}
            onMouseEnter={(e) => { if (canReload) e.currentTarget.style.backgroundColor = 'var(--background)'; }}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {labels.presetStaleReload}
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading && (
          <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }} role="status">
            {labels.presetLoading}
          </p>
        )}
        {!loading && updatedAt !== null && (
          <p className="mb-2 text-xs" style={{ color: 'var(--gilt)' }} role="status" aria-live="polite">
            {labels.presetUpdatedFromDisk}
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
              untouched={untouched}
              onLoad={() => { void load(preset.id); }}
              onReload={reloadAll}
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
  untouched: boolean;
  onLoad: () => void;
  onReload: () => void;
}

function PresetRow({ preset, isActive, disabled, untouched, onLoad, onReload }: PresetRowProps) {
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

  // Loading a *different* preset always asks; reloading the active one only
  // when there are local edits to lose.
  const content = isActive || disabled ? (
    body()
  ) : (
    <ConfirmPopover message={confirmMessage} onConfirm={onLoad}>
      {({ open }) => body(open)}
    </ConfirmPopover>
  );

  return (
    <li className="mb-1 rounded border" style={{ borderColor: isActive ? 'var(--gilt)' : 'var(--rule)' }}>
      {content}
      {isActive && preset.available && (
        <div className="flex justify-end px-2 pb-1.5">
          <MaybeConfirm confirm={!untouched} message={labels.presetReloadConfirm} onConfirm={onReload}>
            {(open) => (
              <button
                type="button"
                onClick={open}
                disabled={disabled}
                aria-label={`${labels.presetReloadActive}: ${preset.name}`}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors focus-visible:outline-1 focus-visible:outline-offset-1 disabled:opacity-40"
                style={{ color: 'var(--slate)', background: 'none', border: 'none', outlineColor: 'var(--gilt-hover)' }}
                onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.color = 'var(--foreground)'; }}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--slate)')}
              >
                <RotateCcw size={11} aria-hidden="true" />
                {labels.presetReloadActive}
              </button>
            )}
          </MaybeConfirm>
        </div>
      )}
    </li>
  );
}
