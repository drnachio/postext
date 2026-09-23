/**
 * Where the reader is, in the URL fragment — a permalink:
 *
 *     #preset=P&lang=L&view=V&chapter=C&page=N
 *     #project=ID&view=V&chapter=C&page=N
 *
 * The book on screen is a preset (its manifest id, plus the content locale
 * a bilingual bundle was opened in) or a local project (its storage id —
 * only the browser holding the project can follow such a link); `view` is
 * the viewer tab (canvas, html or pdf); the chapter is 1-based and the page
 * the number printed on it (the book's page number, as the chapter is laid
 * out continuing the chapters before it). A reload — or a shared link —
 * thus lands on the same page of the same chapter of the same book in the
 * same viewer. The provider opens the book the fragment names, the canvas
 * and HTML viewers write the page as the reader scrolls and jump to it once
 * their document is ready, and the PDF viewer opens its iframe at that
 * page. A part the fragment leaves out means "whatever is there": no book
 * keeps the one last open, no page lands on the chapter's first page.
 */

import type { ViewportTab } from '../types/props';

export interface ViewHash {
  /** Manifest id of the preset on screen, or null when absent / in project
   *  mode. */
  preset: string | null;
  /** Storage id of the local project on screen, or null. */
  project: string | null;
  /** Content locale the preset was opened in (`es`, `en`…), or null. */
  lang: string | null;
  /** Viewer tab, or null. */
  view: ViewportTab | null;
  /** 0-based chapter index, or null when absent/invalid. */
  chapter: number | null;
  /** Book page number (`VDTPage.pageNumberValue`), or null when absent /
   *  invalid. Never an index: the same page keeps its number whichever
   *  chapter's document it is read from. */
  page: number | null;
}

export const EMPTY_VIEW_HASH: ViewHash = { preset: null, project: null, lang: null, view: null, chapter: null, page: null };

const VIEWS: readonly ViewportTab[] = ['canvas', 'html', 'pdf'];
/** A BCP 47-ish tag: `es`, `en-US`, `pt-BR`. */
const LANG_RE = /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{1,8})*$/;
/** Ids are what a manifest or the id generator produced: no separators of
 *  the fragment's own syntax, nothing unreasonably long. */
const ID_RE = /^[^&#=\s]{1,128}$/;

function readParam(hash: string, key: string): string | null {
  const m = new RegExp(`(?:^|[#&])${key}=([^&]*)(?:&|$)`).exec(hash);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]!);
  } catch {
    return null;
  }
}

function readNumber(hash: string, key: string): number | null {
  const raw = readParam(hash, key);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

function readId(hash: string, key: string): string | null {
  const raw = readParam(hash, key);
  return raw !== null && ID_RE.test(raw) ? raw : null;
}

/** The view a fragment names (see the module comment); unknown or
 *  malformed parts read as null. A fragment naming both a preset and a
 *  project keeps the project (the more specific of the two). */
export function parseViewHash(hash: string): ViewHash {
  const project = readId(hash, 'project');
  const preset = project === null ? readId(hash, 'preset') : null;
  const lang = readParam(hash, 'lang');
  const view = readParam(hash, 'view');
  const chapter = readNumber(hash, 'chapter');
  return {
    preset,
    project,
    lang: preset !== null && lang !== null && LANG_RE.test(lang) ? lang.toLowerCase() : null,
    view: VIEWS.includes(view as ViewportTab) ? (view as ViewportTab) : null,
    chapter: chapter === null ? null : chapter - 1,
    page: readNumber(hash, 'page'),
  };
}

/** The view carried by the URL hash. */
export function readViewHash(): ViewHash {
  if (typeof window === 'undefined') return EMPTY_VIEW_HASH;
  return parseViewHash(window.location.hash);
}

/** Fragment for a view, every null (or missing) part left out. */
export function viewHashFragment(view: Partial<ViewHash>): string {
  const parts: string[] = [];
  if (view.project != null) parts.push(`project=${encodeURIComponent(view.project)}`);
  else if (view.preset != null) {
    parts.push(`preset=${encodeURIComponent(view.preset)}`);
    if (view.lang != null) parts.push(`lang=${encodeURIComponent(view.lang)}`);
  }
  if (view.view != null) parts.push(`view=${view.view}`);
  if (view.chapter != null) parts.push(`chapter=${view.chapter + 1}`);
  if (view.page != null) parts.push(`page=${view.page}`);
  return parts.length ? `#${parts.join('&')}` : '';
}

/** Store a view in the hash without adding a history entry. Only the
 *  parts given change: a viewer reporting its page leaves the book alone,
 *  the provider naming the book leaves the page alone. Null drops a part. */
export function writeViewHash(patch: Partial<ViewHash>): void {
  if (typeof window === 'undefined') return;
  const next = viewHashFragment({ ...readViewHash(), ...patch });
  if (window.location.hash === next) return;
  try {
    // An empty fragment still needs a target: `''` would keep the old hash.
    window.history.replaceState(window.history.state, '', next || window.location.pathname + window.location.search);
  } catch {
    // Some embedding contexts forbid history writes; the hash is a nicety.
  }
}

/** The book part of a view: which preset (in which locale) or project. */
export type ViewHashBook = Pick<ViewHash, 'preset' | 'project' | 'lang'>;

/** Whether two views name the same book. A view without a book names
 *  whatever is open; a preset without a locale names it in any locale. */
export function sameBook(wanted: ViewHashBook, actual: ViewHashBook): boolean {
  if (wanted.project !== null) return wanted.project === actual.project;
  if (wanted.preset !== null) {
    if (actual.project !== null || wanted.preset !== actual.preset) return false;
    return wanted.lang === null || wanted.lang === actual.lang;
  }
  return true;
}

/** `#page=N` fragment (1-based) for a PDF viewer URL, or '' when unset. */
export function pdfPageFragment(pageIndex: number | null): string {
  return pageIndex === null ? '' : `#page=${pageIndex + 1}`;
}
