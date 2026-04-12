'use client';

import { useRef } from 'react';
import { Download, Upload, RotateCcw } from 'lucide-react';
import { MarkdownEditor } from '../editor/MarkdownEditor';
import { useSandbox } from '../context/SandboxContext';
import { exportMarkdownToJson, importMarkdownFromJson } from '../storage/persistence';
import { Tooltip } from '../panels/Tooltip';
import { ConfirmPopover } from '../panels/ConfirmPopover';

interface MarkdownPanelProps {
  isDark?: boolean;
}

export function MarkdownPanel({ isDark }: MarkdownPanelProps) {
  const { state, dispatch } = useSandbox();
  const importRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importMarkdownFromJson(file);
      dispatch({ type: 'SET_MARKDOWN', payload: data.markdown });
    } catch {
      // Silently ignore invalid files
    }
    e.target.value = '';
  };

  const isDefault = state.markdown === state.defaultMarkdown;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderColor: 'var(--rule)' }}
      >
        <h2
          className="text-sm font-semibold"
          style={{ color: 'var(--foreground)' }}
        >
          {state.labels.markdownEditor}
        </h2>
        <div className="flex items-center gap-1">
          {!isDefault && (
            <ConfirmPopover
              message={state.labels.resetMarkdownConfirm}
              onConfirm={() => dispatch({ type: 'SET_MARKDOWN', payload: state.defaultMarkdown })}
            >
              {({ open }) => (
                <Tooltip content={state.labels.reset} side="bottom">
                  <button
                    type="button"
                    onClick={open}
                    aria-label={state.labels.reset}
                    className="flex h-6 w-6 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2"
                    style={{ color: 'var(--slate)', outlineColor: 'var(--accent-blue)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--slate)')}
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                  </button>
                </Tooltip>
              )}
            </ConfirmPopover>
          )}
          <Tooltip content={state.labels.exportFile} side="bottom">
            <button
              type="button"
              onClick={() => exportMarkdownToJson(state.markdown)}
              aria-label={state.labels.exportFile}
              className="flex h-6 w-6 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2"
              style={{ color: 'var(--slate)', outlineColor: 'var(--accent-blue)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--slate)')}
            >
              <Download size={14} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip content={state.labels.importFile} side="bottom">
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              aria-label={state.labels.importFile}
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
      <div style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column' as const }}>
        <MarkdownEditor isDark={isDark} />
      </div>
    </div>
  );
}
