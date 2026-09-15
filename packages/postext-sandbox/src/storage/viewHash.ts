/**
 * Where the reader is, in the URL fragment: `#chapter=C&page=P` (both
 * 1-based; the page counts the chapter's own pages, parity blanks included),
 * so a reload — or a shared link — lands on the same page of the same
 * chapter in whichever viewer is active. The canvas and HTML viewers write
 * it as the reader scrolls and jump to it once their document is ready; the
 * PDF viewer opens its iframe at that page.
 */

export interface ViewHash {
  /** 0-based chapter index, or null when absent/invalid. */
  chapter: number | null;
  /** 0-based page index within the chapter, or null when absent/invalid. */
  page: number | null;
}

const CHAPTER_RE = /(?:^|[#&])chapter=(\d+)(?:&|$)/;
const PAGE_RE = /(?:^|[#&])page=(\d+)(?:&|$)/;

function readIndex(re: RegExp, hash: string): number | null {
  const m = re.exec(hash);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 ? n - 1 : null;
}

/** Chapter and page carried by the URL hash. */
export function readViewHash(): ViewHash {
  if (typeof window === 'undefined') return { chapter: null, page: null };
  const hash = window.location.hash;
  return { chapter: readIndex(CHAPTER_RE, hash), page: readIndex(PAGE_RE, hash) };
}

/** Fragment for a view: `#chapter=C&page=P`, either part left out when null. */
export function viewHashFragment({ chapter, page }: ViewHash): string {
  const parts: string[] = [];
  if (chapter !== null) parts.push(`chapter=${chapter + 1}`);
  if (page !== null) parts.push(`page=${page + 1}`);
  return parts.length ? `#${parts.join('&')}` : '';
}

/** Store a view (0-based indices) in the hash without adding a history
 *  entry. */
export function writeViewHash(view: ViewHash): void {
  if (typeof window === 'undefined') return;
  const next = viewHashFragment(view);
  if (window.location.hash === next) return;
  try {
    // An empty fragment still needs a target: `''` would keep the old hash.
    window.history.replaceState(window.history.state, '', next || window.location.pathname + window.location.search);
  } catch {
    // Some embedding contexts forbid history writes; the hash is a nicety.
  }
}

/** `#page=N` fragment (1-based) for a PDF viewer URL, or '' when unset. */
export function pdfPageFragment(pageIndex: number | null): string {
  return pageIndex === null ? '' : `#page=${pageIndex + 1}`;
}
