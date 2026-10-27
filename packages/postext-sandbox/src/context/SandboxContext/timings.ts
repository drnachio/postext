// The sandbox provider's polling and debounce intervals (#1276: split out
// of SandboxContext.tsx).

/** How often the active remote preset's fingerprint is polled while the
 *  page is visible. */
export const PRESET_WATCH_INTERVAL_MS = 3000;
/** How long the "preset updated from disk" notice stays up. */
export const PRESET_NOTICE_MS = 4000;
/** Debounce for the working-state save (localStorage + active project). */
export const WORKING_SAVE_MS = 1000;
/** Debounce of the chapter layout records' write to storage. */
export const LAYOUTS_SAVE_MS = 400;
/** Pause after the last change before the warnings are recomputed. */
export const WARNINGS_DEBOUNCE_MS = 400;
/** Debounce for the blob/font garbage collection sweep. */
export const GC_DEBOUNCE_MS = 2000;
