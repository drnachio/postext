'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { InfoTip } from './InfoTip';
import { ResetButton } from './ResetButton';
import { loadFont } from './fontLoader';

interface FontPickerProps {
  label: string;
  value: string;
  onChange: (font: string) => void;
  tooltip?: string;
  isDefault?: boolean;
  onReset?: () => void;
  searchPlaceholder?: string;
  noResultsLabel?: string;
}

// Fallback list in case API is unavailable
const FALLBACK_FONTS = [
  'EB Garamond', 'Alegreya', 'Bitter', 'Cormorant Garamond', 'Crimson Text',
  'Domine', 'Gentium Book Plus', 'IBM Plex Serif', 'Libre Baskerville', 'Lora',
  'Merriweather', 'Noto Serif', 'Playfair Display', 'PT Serif', 'Source Serif 4',
  'Spectral', 'Vollkorn', 'Alegreya Sans', 'Archivo', 'DM Sans', 'Fira Sans',
  'IBM Plex Sans', 'Inter', 'Karla', 'Lato', 'Montserrat', 'Noto Sans', 'Nunito',
  'Open Sans', 'Outfit', 'Poppins', 'PT Sans', 'Raleway', 'Roboto', 'Rubik',
  'Source Sans 3', 'Work Sans', 'Fira Code', 'IBM Plex Mono', 'JetBrains Mono',
  'Roboto Mono', 'Source Code Pro', 'Space Mono',
];

let cachedFonts: string[] | null = null;
let fetchPromise: Promise<string[]> | null = null;

async function fetchGoogleFonts(): Promise<string[]> {
  if (cachedFonts) return cachedFonts;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch('https://api.fontsource.org/v1/fonts?type=google')
    .then((res) => {
      if (!res.ok) throw new Error('Failed to fetch fonts');
      return res.json();
    })
    .then((data: { family: string }[]) => {
      cachedFonts = data.map((item) => item.family);
      return cachedFonts;
    })
    .catch(() => {
      cachedFonts = FALLBACK_FONTS;
      return FALLBACK_FONTS;
    });

  return fetchPromise;
}

function FontListItem({
  font,
  selected,
  onClick,
}: {
  font: string;
  selected: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadFont(font);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [font]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-sm transition-colors"
      style={{
        fontFamily: `"${font}", sans-serif`,
        backgroundColor: selected ? 'var(--gilt)' : 'transparent',
        color: selected ? 'var(--background)' : 'var(--foreground)',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.backgroundColor = 'var(--surface)';
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {font}
    </button>
  );
}

const POPOVER_WIDTH = 260;
const POPOVER_HEIGHT = 320;
const POPOVER_GAP = 6;

export function FontPicker({ label, value, onChange, tooltip, isDefault, onReset, searchPlaceholder, noResultsLabel }: FontPickerProps) {
  const muted = isDefault ?? false;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [fonts, setFonts] = useState<string[]>(cachedFonts ?? FALLBACK_FONTS);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const openPopover = useCallback(() => {
    if (buttonRef.current) {
      setAnchorRect(buttonRef.current.getBoundingClientRect());
    }
    setSearch('');
    setOpen(true);
    fetchGoogleFonts().then(setFonts);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  // Load the currently selected font
  useEffect(() => {
    loadFont(value);
  }, [value]);

  const filtered = search
    ? fonts.filter((f) => f.toLowerCase().includes(search.toLowerCase()))
    : fonts;

  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        {tooltip && <InfoTip text={tooltip} />}
        <label className="text-xs shrink-0" style={{ color: 'var(--slate)' }}>
          {label}
        </label>
      </div>
      <div className="flex items-center gap-1">
        {!muted && onReset && <ResetButton onClick={onReset} />}
        <button
          ref={buttonRef}
          type="button"
          onClick={openPopover}
          className="rounded border px-2 py-1 text-xs text-right truncate"
          style={{
            maxWidth: '140px',
            borderColor: 'var(--rule)',
            backgroundColor: 'var(--surface)',
            color: muted ? 'var(--slate)' : 'var(--foreground)',
            fontFamily: `"${value}", sans-serif`,
          }}
        >
          {value}
        </button>
      </div>

      {open && anchorRect && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={label}
          style={{
            position: 'fixed',
            zIndex: 50,
            top: (anchorRect.bottom + POPOVER_GAP + POPOVER_HEIGHT + 50 < window.innerHeight)
              ? anchorRect.bottom + POPOVER_GAP
              : Math.max(8, anchorRect.top - POPOVER_GAP - POPOVER_HEIGHT - 50),
            left: Math.max(8, anchorRect.right - POPOVER_WIDTH),
            width: POPOVER_WIDTH,
            backgroundColor: 'var(--background)',
            border: '1px solid var(--rule)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '8px 8px 4px' }}>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder ?? 'Search fonts...'}
              className="w-full rounded border px-2 py-1 text-xs"
              style={{
                borderColor: 'var(--rule)',
                backgroundColor: 'var(--surface)',
                color: 'var(--foreground)',
                outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gilt)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--rule)'; }}
            />
          </div>
          <div
            style={{
              height: POPOVER_HEIGHT,
              overflowY: 'auto',
              paddingBottom: 4,
            }}
          >
            {filtered.length === 0 && (
              <div
                className="px-3 py-2 text-xs"
                style={{ color: 'var(--slate)' }}
              >
                {noResultsLabel ?? 'No fonts found'}
              </div>
            )}
            {filtered.map((font) => (
              <FontListItem
                key={font}
                font={font}
                selected={font === value}
                onClick={() => {
                  onChange(font);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
