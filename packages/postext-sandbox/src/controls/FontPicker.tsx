'use client';

import { useState, useRef, useEffect, useCallback, useId, useSyncExternalStore, type RefObject } from 'react';
import { chineseScriptOf, cjkRegionOf } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../context/SandboxContext';
import { Popover, type PopoverCloseReason } from '../ui';
import { FieldRow } from './FieldRow';
import { useFieldIds } from './fieldContext';
import { cn } from '../ui/cn';
import { ChevronsUpDown } from 'lucide-react';
import { listCustomFontFamilies, loadFont, onCustomFontsChanged } from './fontLoader';
import { defaultDocumentLocale } from './hyphenation';

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

/** A Google family and the character subsets Fontsource lists for it
 *  (`latin`, `chinese-simplified`, `chinese-traditional`…). */
export interface FontEntry {
  family: string;
  subsets: readonly string[];
}

const LATIN = ['latin'] as const;

// Fallback list in case API is unavailable
const FALLBACK_FONTS: FontEntry[] = [
  'EB Garamond', 'Alegreya', 'Bitter', 'Cormorant Garamond', 'Crimson Text',
  'Domine', 'Gentium Book Plus', 'IBM Plex Serif', 'Libre Baskerville', 'Lora',
  'Merriweather', 'Noto Serif', 'Playfair Display', 'PT Serif', 'Source Serif 4',
  'Spectral', 'Vollkorn', 'Alegreya Sans', 'Archivo', 'DM Sans', 'Fira Sans',
  'IBM Plex Sans', 'Inter', 'Karla', 'Lato', 'Montserrat', 'Noto Sans', 'Nunito',
  'Open Sans', 'Outfit', 'Poppins', 'PT Sans', 'Raleway', 'Roboto', 'Rubik',
  'Source Sans 3', 'Work Sans', 'Fira Code', 'IBM Plex Mono', 'JetBrains Mono',
  'Roboto Mono', 'Source Code Pro', 'Space Mono',
].map((family) => ({ family, subsets: LATIN }));
FALLBACK_FONTS.push(
  { family: 'Noto Serif SC', subsets: ['chinese-simplified', 'latin'] },
  { family: 'Noto Sans SC', subsets: ['chinese-simplified', 'latin'] },
  { family: 'Noto Serif TC', subsets: ['chinese-traditional', 'latin'] },
  { family: 'Noto Sans TC', subsets: ['chinese-traditional', 'latin'] },
  { family: 'Noto Serif HK', subsets: ['chinese-hongkong', 'latin'] },
  { family: 'Noto Sans HK', subsets: ['chinese-hongkong', 'latin'] },
  { family: 'LXGW WenKai TC', subsets: ['chinese-traditional', 'latin'] },
);

let cachedFonts: FontEntry[] | null = null;
let fetchPromise: Promise<FontEntry[]> | null = null;

async function fetchGoogleFonts(): Promise<FontEntry[]> {
  if (cachedFonts) return cachedFonts;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch('https://api.fontsource.org/v1/fonts?type=google')
    .then((res) => {
      if (!res.ok) throw new Error('Failed to fetch fonts');
      return res.json();
    })
    .then((data: { family: string; subsets?: string[] }[]) => {
      cachedFonts = data.map((item) => ({ family: item.family, subsets: item.subsets ?? [] }));
      return cachedFonts;
    })
    .catch(() => {
      cachedFonts = FALLBACK_FONTS;
      return FALLBACK_FONTS;
    });

  return fetchPromise;
}

/** The Fontsource subsets that hold a Chinese document's characters, best
 *  first: `chinese-simplified` for zh-Hans; `chinese-traditional` (then
 *  Hong Kong's) for zh-Hant; Hong Kong's first for zh-HK. None otherwise. */
export function chineseSubsetsFor(locale: string | undefined): string[] {
  const script = chineseScriptOf(locale);
  if (!script) return [];
  if (script === 'Hans') return ['chinese-simplified'];
  return cjkRegionOf(locale) === 'hongkong'
    ? ['chinese-hongkong', 'chinese-traditional']
    : ['chinese-traditional', 'chinese-hongkong'];
}

/** The families first that cover the document's Chinese characters (in
 *  the order of `subsets`, then by name as listed), and the rest. */
export function rankFontsForScript(fonts: readonly FontEntry[], subsets: readonly string[]): { script: FontEntry[]; other: FontEntry[] } {
  if (subsets.length === 0) return { script: [], other: [...fonts] };
  const rank = (f: FontEntry) => {
    const i = subsets.findIndex((s) => f.subsets.includes(s));
    return i === -1 ? Infinity : i;
  };
  const script = fonts.filter((f) => rank(f) !== Infinity).sort((a, b) => rank(a) - rank(b));
  return { script, other: fonts.filter((f) => rank(f) === Infinity) };
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
      className="px-3 py-1 text-[0.72rem] font-semibold pt-caps tracking-wide"
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
  const [fonts, setFonts] = useState<FontEntry[]>(cachedFonts ?? FALLBACK_FONTS);
  // A Chinese document lists the families with its characters first; one
  // that names no language is in the interface's.
  const documentLocale = useSandboxSelector((s) => s.config.locale ?? s.config.bodyText?.hyphenation?.locale ?? defaultDocumentLocale(s.locale));
  const scriptSubsets = chineseSubsetsFor(documentLocale);
  const customFonts = useSyncExternalStore(
    subscribeCustomFonts,
    getCustomFontSnapshot,
    getCustomFontSnapshot,
  );
  const rowRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
  const ranked = rankFontsForScript(fonts.filter((f) => !customSet.has(f.family) && matches(f.family)), scriptSubsets);
  const filteredScript = ranked.script.map((f) => f.family);
  const filteredGoogle = ranked.other.map((f) => f.family);
  const hasAny = filteredCustom.length > 0 || filteredScript.length > 0 || filteredGoogle.length > 0;
  const scriptGroupLabel = scriptSubsets[0] === 'chinese-simplified'
    ? labels.fontPickerChineseSimplifiedGroup
    : labels.fontPickerChineseTraditionalGroup;

  const pick = (font: string) => {
    onChange(font);
    setOpen(false);
  };

  // Arrow keys walk the options; ArrowUp on the first one returns to search.
  const onListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const options = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    const idx = options.indexOf(document.activeElement as HTMLButtonElement);
    e.preventDefault();
    if (e.key === 'Home') options[0]?.focus();
    else if (e.key === 'End') options[options.length - 1]?.focus();
    else if (e.key === 'ArrowDown') options[Math.min(idx + 1, options.length - 1)]?.focus();
    else if (idx <= 0) searchRef.current?.focus();
    else options[idx - 1]?.focus();
  };

  return (
    <FieldRow ref={rowRef} label={label} tooltip={tooltip ?? labels.fontFieldHelp} isDefault={muted} onReset={onReset} extraTerms={[value]}>
      <FontTrigger
        buttonRef={buttonRef}
        value={value}
        open={open}
        muted={muted}
        onClick={() => (open ? setOpen(false) : openPopover())}
      />

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
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                listRef.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus();
              } else if (e.key === 'Enter') {
                const first = filteredCustom[0] ?? filteredScript[0] ?? filteredGoogle[0];
                if (first) { e.preventDefault(); pick(first); }
              }
            }}
            placeholder={searchPlaceholder ?? labels.fontPickerSearch}
            aria-label={searchPlaceholder ?? labels.fontPickerSearch}
            className="min-h-11 w-full rounded border px-2 py-1 text-xs focus:border-(--brand) focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-(--brand)"
            style={{
              borderColor: 'var(--pt-control-border)',
              backgroundColor: 'var(--surface)',
              color: 'var(--foreground)',
            }}
          />
        </div>
        <div ref={listRef} role="listbox" aria-label={label} onKeyDown={onListKeyDown} style={{ height: LIST_HEIGHT, maxHeight: 'calc(var(--available-height) - 48px)', overflowY: 'auto', paddingBottom: 4 }}>
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
          {filteredScript.length > 0 && (
            <>
              <GroupHeader>{scriptGroupLabel}</GroupHeader>
              {filteredScript.map((font) => (
                <FontListItem key={`script-${font}`} font={font} selected={font === value} onClick={() => pick(font)} />
              ))}
            </>
          )}
          {filteredGoogle.length > 0 && (
            <>
              {(filteredCustom.length > 0 || filteredScript.length > 0) && (
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

function FontTrigger({ buttonRef, value, open, muted, onClick }: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  value: string;
  open: boolean;
  muted: boolean;
  onClick: () => void;
}) {
  const ids = useFieldIds();
  const valueId = useId();
  return (
    <button
      ref={buttonRef}
      id={ids?.controlId}
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-labelledby={ids ? `${ids.labelId} ${valueId}` : undefined}
      aria-describedby={ids?.descriptionId}
      className={cn(
        'inline-flex h-11 max-w-[10.5rem] cursor-pointer items-center gap-1.5 rounded-md border border-(--pt-control-border) bg-(--surface) pr-1.5 pl-2 transition-colors',
        'hover:border-(--rule-strong,var(--slate)) focus-visible:outline-2 focus-visible:outline-offset-0 outline-(--brand)',
        open && 'border-(--brand)',
        muted ? 'text-(--slate)' : 'text-(--foreground)',
      )}
    >
      <span id={valueId} className="min-w-0 truncate text-[0.8rem]" style={{ fontFamily: `"${value}", sans-serif` }}>{value}</span>
      <ChevronsUpDown size={12} aria-hidden="true" className="shrink-0 text-(--slate)" />
    </button>
  );
}
