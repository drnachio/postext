'use client';

import { Link2Off } from 'lucide-react';
import type { ColorPaletteEntry } from 'postext';

interface Props {
  palette: ColorPaletteEntry[];
  linkedPaletteId?: string;
  onLinkPalette?: (entryId: string) => void;
  onUnlinkPalette?: () => void;
  unlinkLabel?: string;
}

export function PaletteChips({ palette, linkedPaletteId, onLinkPalette, onUnlinkPalette, unlinkLabel }: Props) {
  return (
    <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {palette.map((entry) => {
        const selected = entry.id === linkedPaletteId;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onLinkPalette?.(entry.id)}
            title={entry.name}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px 2px 2px',
              borderRadius: 10,
              border: '1px solid var(--rule)',
              backgroundColor: selected ? 'var(--surface)' : 'var(--background)',
              color: 'var(--foreground)',
              fontSize: 10,
              cursor: 'pointer',
              maxWidth: '100%',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                borderRadius: 6,
                border: '1px solid var(--rule)',
                backgroundColor: entry.value.hex,
              }}
            />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 100 }}>
              {entry.name}
            </span>
          </button>
        );
      })}
      {linkedPaletteId && onUnlinkPalette && (
        <button
          type="button"
          onClick={onUnlinkPalette}
          title={unlinkLabel}
          aria-label={unlinkLabel}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 6px',
            borderRadius: 10,
            border: '1px solid var(--rule)',
            backgroundColor: 'var(--background)',
            color: 'var(--slate)',
            cursor: 'pointer',
          }}
        >
          <Link2Off size={11} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
