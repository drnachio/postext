'use client';

import { FileCode, Settings2, FolderOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSandbox } from '../context/SandboxContext';
import type { PanelId } from '../types';
import { Tooltip } from '../panels/Tooltip';

interface ActivityBarProps {
  themeToggle?: ReactNode;
  languageSwitcher?: ReactNode;
  homeUrl?: string;
  homeLink?: ReactNode;
}

const PANEL_ICONS: { id: PanelId; Icon: typeof FileCode; labelKey: 'markdownEditor' | 'configuration' | 'resources' }[] = [
  { id: 'markdown', Icon: FileCode, labelKey: 'markdownEditor' },
  { id: 'resources', Icon: FolderOpen, labelKey: 'resources' },
  { id: 'config', Icon: Settings2, labelKey: 'configuration' },
];

export function ActivityBar({ themeToggle, languageSwitcher, homeUrl, homeLink }: ActivityBarProps) {
  const { state, dispatch } = useSandbox();

  return (
    <div
      className="flex h-full w-14 flex-col items-center border-r px-2 py-3"
      style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--background)' }}
      role="toolbar"
      aria-label="Activity bar"
      aria-orientation="vertical"
    >
      {/* Home logo */}
      {homeLink ? (
        <div className="mt-1 mb-2 flex h-10 w-10 items-center justify-center">
          {homeLink}
        </div>
      ) : homeUrl ? (
        <Tooltip content="Postext" side="right">
          <a
            href={homeUrl}
            className="mt-1 mb-2 flex h-10 w-10 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
            style={{ color: 'var(--gilt)', outlineColor: 'var(--accent-blue)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--surface)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span className="text-2xl font-black leading-none" style={{ fontFamily: 'var(--font-logo, var(--font-cormorant, "Cormorant Garamond", Georgia, serif))' }}>P</span>
          </a>
        </Tooltip>
      ) : null}

      {/* Panel toggle icons */}
      <nav className="flex flex-col items-center gap-2" aria-label="Panels">
        {PANEL_ICONS.map(({ id, Icon, labelKey }) => {
          const isActive = state.activePanel === id;
          const label = state.labels[labelKey];
          return (
            <Tooltip key={id} content={label} side="right">
              <button
                type="button"
                onClick={() => dispatch({ type: 'TOGGLE_PANEL', payload: id })}
                aria-label={label}
                aria-pressed={isActive}
                className="flex h-10 w-10 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
                style={{
                  color: isActive ? 'var(--gilt)' : 'var(--slate)',
                  backgroundColor: isActive ? 'var(--surface)' : 'transparent',
                  outlineColor: 'var(--accent-blue)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget.style.color = 'var(--foreground)');
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget.style.color = 'var(--slate)');
                }}
              >
                <Icon size={22} aria-hidden="true" />
              </button>
            </Tooltip>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom controls */}
      <div className="flex flex-col items-center gap-2">
        {/* Theme toggle slot */}
        {themeToggle && (
          <div className="flex h-10 w-10 items-center justify-center">
            {themeToggle}
          </div>
        )}

        {/* Language switcher slot */}
        {languageSwitcher && (
          <div className="flex h-10 w-10 items-center justify-center">
            {languageSwitcher}
          </div>
        )}
      </div>
    </div>
  );
}
