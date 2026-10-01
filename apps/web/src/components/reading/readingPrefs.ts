/**
 * Reading preferences (WCAG 1.4.8 Visual Presentation): the site is set
 * justified and book-like by default; a reader can switch to ragged text,
 * wider leading, a narrower measure and other colours. Each choice is a
 * `data-rp-*` attribute on `<html>`; globals.css ("Reading preferences")
 * does the rest.
 */

export const READING_KEY = "postext-reading";
/** Fired on `window` when this tab changes the preferences. */
export const READING_EVENT = "postext-reading-change";

export const READING_OPTIONS = {
  align: ["designed", "left"],
  spacing: ["designed", "wide"],
  width: ["designed", "narrow"],
  colors: ["theme", "contrast", "sepia"],
} as const;

export type ReadingKey = keyof typeof READING_OPTIONS;
export type ReadingPrefs = { [K in ReadingKey]: (typeof READING_OPTIONS)[K][number] };

export const DEFAULT_READING: ReadingPrefs = {
  align: "designed",
  spacing: "designed",
  width: "designed",
  colors: "theme",
};

export const READING_KEYS = Object.keys(READING_OPTIONS) as ReadingKey[];

export function parseReading(raw: string | null): ReadingPrefs {
  const out: ReadingPrefs = { ...DEFAULT_READING };
  if (!raw) return out;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    for (const key of READING_KEYS) {
      const value = data[key];
      if ((READING_OPTIONS[key] as readonly unknown[]).includes(value)) {
        (out as Record<ReadingKey, string>)[key] = value as string;
      }
    }
  } catch {
    // A malformed entry reads as the defaults.
  }
  return out;
}

/** Mirrors the prepaint script: one attribute per non-default choice. */
export function applyReading(prefs: ReadingPrefs) {
  const root = document.documentElement;
  for (const key of READING_KEYS) {
    if (prefs[key] === DEFAULT_READING[key]) root.removeAttribute(`data-rp-${key}`);
    else root.setAttribute(`data-rp-${key}`, prefs[key]);
  }
}

export function saveReading(prefs: ReadingPrefs) {
  const isDefault = READING_KEYS.every((k) => prefs[k] === DEFAULT_READING[k]);
  try {
    if (isDefault) localStorage.removeItem(READING_KEY);
    else localStorage.setItem(READING_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked: the choice still applies to this page.
  }
  applyReading(prefs);
  window.dispatchEvent(new Event(READING_EVENT));
}

/** Inline script emitted by the root layout, before the first paint: the
 *  stored reading preferences and the stored (or system) theme, so neither
 *  flashes the designed default first. */
export const READING_PREPAINT_SCRIPT = `(function(){try{var d=document.documentElement,o=${JSON.stringify(
  READING_OPTIONS,
)},f=${JSON.stringify(DEFAULT_READING)},r=localStorage.getItem(${JSON.stringify(
  READING_KEY,
)}),p={};try{p=r?JSON.parse(r)||{}:{}}catch(e){}for(var k in o){var v=p[k];if(v!==f[k]&&o[k].indexOf(v)>=0)d.setAttribute("data-rp-"+k,v);else d.removeAttribute("data-rp-"+k)}var t=localStorage.getItem("postext-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";d.classList.remove("dark","light");d.classList.add(t)}catch(e){}})();`;
