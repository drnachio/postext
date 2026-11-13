// Whether the code runs on a page (#1526). Next.js compiles the Sandbox as
// client code and folds `typeof window` to "object", so a guard written
// that way says a window is there even in a worker: the compile worker
// loads page modules (the layout service, the font loader, the stores),
// and a folded guard broke it as it loaded. Reading `window` off
// `globalThis` is not folded. Bare `typeof window` is kept out of the
// Sandbox's sources by `window.test.ts`.

/** Whether there is a window (not in a worker, nor on a server). */
export const hasWindow = (): boolean => typeof (globalThis as { window?: unknown }).window !== 'undefined';
