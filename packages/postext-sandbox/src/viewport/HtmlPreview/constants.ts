import type { HyphenationLocale } from 'postext';

export type ColumnMode = 'single' | 'multi';

export const LOCALE_TO_HYPHENATION: Record<string, HyphenationLocale> = {
  en: 'en-us', es: 'es', fr: 'fr', de: 'de', it: 'it', pt: 'pt', ca: 'ca', nl: 'nl',
};

// Prose sample used to measure the target column width for a given body font.
// Proportional fonts make "N × average glyph width" unreliable, so we measure
// actual representative text. The sample is sliced / padded to the configured
// maxCharsPerLine.
const COLUMN_WIDTH_BASE_SAMPLE =
  'The quick brown fox jumps over the lazy dog. Sphinx of black quartz, judge my vow. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump.';

export function buildColumnWidthSample(chars: number): string {
  const n = Math.max(1, Math.floor(chars));
  let s = COLUMN_WIDTH_BASE_SAMPLE;
  while (s.length < n) s += ' ' + COLUMN_WIDTH_BASE_SAMPLE;
  return s.slice(0, n);
}

// Debounce delay for resize-driven relayouts (ms).
export const RESIZE_DEBOUNCE_MS = 100;

// Screen-friendly DPI. At 144 DPI, a default 8pt body size resolves to 16px,
// matching the conventional web body size at fontScale=1.
export const HTML_DPI = 144;

export const PADDING_PX = 24;

export const SHADOW_CSS = `
  :host {
    display: block;
    height: 100%;
    width: 100%;
  }
  .pt-scroll {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    background: #ffffff;
    user-select: none;
    -webkit-user-select: none;
  }
  .pt-scroll[data-mode='single'] { overflow-y: auto; overflow-x: hidden; }
  .pt-scroll[data-mode='multi']  {
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x proximity;
    scroll-padding-inline: 24px;
  }
  .pt-scroll[data-mode='multi'] .pt-page { scroll-snap-align: start; }
  .pt-doc { min-height: 100%; }
  .pt-page { cursor: text; }
  @keyframes cursor-blink {
    0%, 49% { opacity: 1; }
    50%, 100% { opacity: 0; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .cursor-blink {
      animation: cursor-blink 1.06s steps(1, end) infinite;
    }
  }
`;

/**
 * Compose a CSS background value for the page reading area. A transparent
 * (or undefined) page colour means "no paper tint" → pure white. Any other
 * colour is layered over white via linear-gradient so that semi-transparent
 * values (e.g. rgba / 8-digit hex) composite correctly instead of letting
 * the host's surface colour bleed through.
 */
export function composePageBackground(hex: string | undefined | null): string {
  if (!hex || hex === 'transparent') return '#ffffff';
  return `linear-gradient(${hex}, ${hex}), #ffffff`;
}
