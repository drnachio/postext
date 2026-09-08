/**
 * Current page in the URL fragment (`#page=3`, 1-based), so a reload — or a
 * shared link — lands on the same page in whichever viewer is active. The
 * canvas and HTML viewers write it as the reader scrolls and jump to it once
 * their document is ready; the PDF viewer opens its iframe at that page.
 */

const PAGE_HASH_RE = /(?:^|[#&])page=(\d+)(?:&|$)/;

/** 0-based page index carried by the URL hash, or null when absent/invalid. */
export function readPageHash(): number | null {
  if (typeof window === 'undefined') return null;
  const m = PAGE_HASH_RE.exec(window.location.hash);
  if (!m) return null;
  const page = Number(m[1]);
  return Number.isFinite(page) && page >= 1 ? page - 1 : null;
}

/** Store a 0-based page index in the hash without adding a history entry. */
export function writePageHash(pageIndex: number): void {
  if (typeof window === 'undefined') return;
  const next = `#page=${pageIndex + 1}`;
  if (window.location.hash === next) return;
  try {
    window.history.replaceState(window.history.state, '', next);
  } catch {
    // Some embedding contexts forbid history writes; the hash is a nicety.
  }
}

/** `#page=N` fragment (1-based) for a PDF viewer URL, or '' when unset. */
export function pdfPageFragment(pageIndex: number | null): string {
  return pageIndex === null ? '' : `#page=${pageIndex + 1}`;
}
