'use client';

import { useState, useRef, useEffect, useCallback, useSyncExternalStore } from 'react';
import { useSandboxLabels } from '../context/SandboxContext';
import { Popover, type PopoverCloseReason } from '../ui';
import { FieldRow } from './FieldRow';
import { listCustomFontFamilies, loadFont, onCustomFontsChanged } from './fontLoader';

interface FontPickerProps {
  label: string;
  value: string;
  onChange: (font: string) => void;
  tooltip?: string;
  isDefault?: boolean;
  onReset?: () => void;
  searchPlaceholder?: string;
  noResultsLabel?: string;
  customGroupLabel?: string;
  googleGroupLabel?: string;
}

/** Snapshot of the custom-font registry — exposed to React via
 *  `useSyncExternalStore` so the picker re-renders when a family is added
 *  or removed via the CustomFontsSection. The snapshot is cached until a
 *  change listener fires so React's referential-stability check passes. */
let customSnapshot: readonly string[] = Object.freeze(
  listCustomFontFamilies().map((f) => f.name),
);
let customSnapshotDirty = false;
onCustomFontsChanged(() => { customSnapshotDirty = true; });
function subscribeCustomFonts(cb: () => void): () => void {
  return onCustomFontsChanged(() => cb());
}
function getCustomFontSnapshot(): readonly string[] {
  if (customSnapshotDirty) {
    customSnapshot = Object.freeze(listCustomFontFamilies().map((f) => f.name));
    customSnapshotDirty = false;
  }
  return customSnapshot;
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
      aria-selected={selected}
      role="option"
      className={selected
        ? 'w-full px-3 py-1.5 text-left text-sm transition-colors'
        : 'w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-(--background)'}
      style={{
        fontFamily: `"${font}", sans-serif`,
        backgroundColor: selected ? 'var(--brand)' : undefined,
        color: selected ? 'var(--background)' : 'var(--foreground)',
      }}
    >
      {font}
    </button>
  );
}

const POPOVER_WIDTH = 260;
const LIST_HEIGHT = 320;

function GroupHeader({ children }: { children: string }) {
  return (
    <div
      className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide"
      style={{ color: 'var(--slate)', backgroundColor: 'var(--background)', borderBottom: '1px solid var(--rule)' }}
    >
      {children}
    </div>
  );
}

export function FontPicker({
  label,
  value,
  onChange,
  tooltip,
  isDefault,
  onReset,
  searchPlaceholder,
  noResultsLabel,
  customGroupLabel,
  googleGroupLabel,
}: FontPickerProps) {
  const labels = useSandboxLabels();
  const muted = isDefault ?? false;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [fonts, setFonts] = useState<string[]>(cachedFonts ?? FALLBACK_FONTS);
  const customFonts = useSyncExternalStore(
    subscribeCustomFonts,
    getCustomFontSnapshot,
    getCustomFontSnapshot,
  );
  const rowRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const openPopover = useCallback(() => {
    setSearch('');
    setOpen(true);
    fetchGoogleFonts().then(setFonts);
  }, []);

  const handleOpenChange = (next: boolean, reason: PopoverCloseReason, event: Event | undefined) => {
    if (!next && reason === 'outside-press' && event && buttonRef.current?.contains(event.target as Node)) return;
    setOpen(next);
  };

  // Load the currently selected font
  useEffect(() => {
    loadFont(value);
  }, [value]);

  const matches = (f: string) =>
    !search || f.toLowerCase().includes(search.toLowerCase());
  // Exclude custom-font names from the Google list so a user-chosen name
  // collision doesn't render the same family twice.
  const customSet = new Set(customFonts);
  const filteredCustom = customFonts.filter(matches);
  const filteredGoogle = fonts.filter((f) => !customSet.has(f) && matches(f));
  const hasAny = filteredCustom.length > 0 || filteredGoogle.length > 0;

  const pick = (font: string) => {
    onChange(font);
    setOpen(false);
  };

  return (
    <FieldRow ref={rowRef} label={label} tooltip={tooltip} isDefault={muted} onReset={onReset} extraTerms={[value]}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPopover())}
        aria-haspopup="dialog"
        aria-expanded={open}
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

      <Popover
        open={open}
        onOpenChange={handleOpenChange}
        anchor={rowRef}
        width={POPOVER_WIDTH}
        initialFocus={searchRef}
        ariaLabel={label}
        style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--background)' }}
      >
        <div style={{ padding: '8px 8px 4px' }}>
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder ?? labels.fontPickerSearch}
            aria-label={searchPlaceholder ?? labels.fontPickerSearch}
            className="w-full rounded border px-2 py-1 text-xs focus:border-(--brand)"
            style={{
              borderColor: 'var(--rule)',
              backgroundColor: 'var(--surface)',
              color: 'var(--foreground)',
              outline: 'none',
            }}
          />
        </div>
        <div role="listbox" aria-label={label} style={{ height: LIST_HEIGHT, maxHeight: 'calc(var(--available-height) - 48px)', overflowY: 'auto', paddingBottom: 4 }}>
          {!hasAny && (
            <div className="px-3 py-2 text-xs" style={{ color: 'var(--slate)' }}>
              {noResultsLabel ?? labels.fontPickerNoResults}
            </div>
          )}
          {filteredCustom.length > 0 && (
            <>
              <GroupHeader>{customGroupLabel ?? labels.fontPickerCustomGroup}</GroupHeader>
              {filteredCustom.map((font) => (
                <FontListItem key={`custom-${font}`} font={font} selected={font === value} onClick={() => pick(font)} />
              ))}
            </>
          )}
          {filteredGoogle.length > 0 && (
            <>
              {filteredCustom.length > 0 && (
                <GroupHeader>{googleGroupLabel ?? labels.fontPickerGoogleGroup}</GroupHeader>
              )}
              {filteredGoogle.map((font) => (
                <FontListItem key={`google-${font}`} font={font} selected={font === value} onClick={() => pick(font)} />
              ))}
            </>
          )}
        </div>
      </Popover>
    </FieldRow>
  );
}
