'use client';

import { useRef } from 'react';
import { Download, Upload, RotateCcw } from 'lucide-react';
import { useSandbox } from '../context/SandboxContext';
import { exportConfigToJson, importConfigFromJson } from '../storage/persistence';
import { Tooltip } from '../panels/Tooltip';
import { ConfirmPopover } from '../panels/ConfirmPopover';
import { ColorPaletteSection } from './sections/ColorPaletteSection';
import { PageSection } from './sections/PageSection';
import { LayoutSection } from './sections/LayoutSection';
import { BodyTextSection } from './sections/BodyTextSection';
import { HeadingsSection } from './sections/HeadingsSection';
import { UnorderedListsSection } from './sections/UnorderedListsSection';
import { OrderedListsSection } from './sections/OrderedListsSection';
import { HtmlViewerSection } from './sections/HtmlViewerSection';
import { DebugSection } from './sections/DebugSection';

export function ConfigPanel() {
  const { state, dispatch } = useSandbox();
  const { config, labels } = state;
  const importRef = useRef<HTMLInputElement>(null);

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

  const hasAnyOverrides = Object.keys(config).length > 0;

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex shrink-0 items-center justify-between border-b px-3 py-2"
        style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--background)' }}
      >
        <h2
          className="text-sm font-semibold"
          style={{ color: 'var(--foreground)' }}
        >
          {labels.configuration}
        </h2>
        <div className="flex items-center gap-1">
          {hasAnyOverrides && (
            <ConfirmPopover
              message={labels.resetConfigConfirm}
              onConfirm={() => dispatch({ type: 'SET_CONFIG', payload: {} })}
            >
              {({ open }) => (
                <Tooltip content={labels.reset} side="bottom">
                  <button
                    type="button"
                    onClick={open}
                    aria-label={labels.reset}
                    className="flex h-6 w-6 items-center justify-center rounded transition-colors focus-visible:outline-1 focus-visible:outline-offset-1"
                    style={{ color: 'var(--slate)', outlineColor: 'var(--gilt-hover)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--slate)')}
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                  </button>
                </Tooltip>
              )}
            </ConfirmPopover>
          )}
          <Tooltip content={labels.exportFile} side="bottom">
            <button
              type="button"
              onClick={() => exportConfigToJson(config)}
              aria-label={labels.exportFile}
              className="flex h-6 w-6 items-center justify-center rounded transition-colors focus-visible:outline-1 focus-visible:outline-offset-1"
              style={{ color: 'var(--slate)', outlineColor: 'var(--gilt-hover)' }}
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
              className="flex h-6 w-6 items-center justify-center rounded transition-colors focus-visible:outline-1 focus-visible:outline-offset-1"
              style={{ color: 'var(--slate)', outlineColor: 'var(--gilt-hover)' }}
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
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ColorPaletteSection />
        <PageSection />
        <LayoutSection />
        <BodyTextSection />
        <HeadingsSection />
        <UnorderedListsSection />
        <OrderedListsSection />
        <HtmlViewerSection />
        <DebugSection />
      </div>
    </div>
  );
}
