import type { PdfFontWarning } from 'postext-pdf';

/** The font warnings of the last PDF the PDF tab generated (issue #196):
 *  characters a face lacks, a variable font set at its default weight, a
 *  large CFF face embedded whole. The Checks panel lists them until the
 *  next generation replaces them; once the book they came from is edited
 *  they are marked as from an earlier PDF, and another book drops them. A
 *  font fallback is left out: the provider's italic-to-upright stand-in is
 *  routine in the Sandbox. */
export type PdfFontCheck = Extract<PdfFontWarning, { kind: 'missingGlyph' | 'variableFontDefaultInstance' | 'cffEmbeddedWhole' }>;

/** The parts of the Sandbox state a PDF is generated from, as far as the
 *  font checks need them. */
export interface PdfFontCheckState {
  /** Bumped when another book (a preset, a project, a bundle) replaces the
   *  one open. */
  bookVersion: number;
  pdfScope: 'book' | 'chapter';
  activeChapterId: string;
  chapters: readonly { id: string }[];
  config: unknown;
  resources: unknown;
}

/** What a generation was made from: the book, and the inputs whose change
 *  leaves its PDF out of date (compared by identity, as the state is never
 *  edited in place). A chapter's PDF follows its own chapter only. */
export interface PdfFontChecksSource {
  bookVersion: number;
  scope: 'book' | 'chapter';
  text: unknown;
  config: unknown;
  resources: unknown;
}

/** The source of a PDF generated from `state`. */
export function pdfFontChecksSource(state: PdfFontCheckState): PdfFontChecksSource {
  return {
    bookVersion: state.bookVersion,
    scope: state.pdfScope,
    text: state.pdfScope === 'book' ? state.chapters : state.chapters.find((c) => c.id === state.activeChapterId) ?? state.chapters[0],
    config: state.config,
    resources: state.resources,
  };
}

let current: readonly PdfFontCheck[] = [];
let currentSource: PdfFontChecksSource | null = null;
const listeners = new Set<() => void>();

/** Whether a PDF warning is one the Checks panel lists. */
export function isPdfFontCheck(warning: { kind: string }): warning is PdfFontCheck {
  return warning.kind === 'missingGlyph' || warning.kind === 'variableFontDefaultInstance' || warning.kind === 'cffEmbeddedWhole';
}

/** The font warnings of the last PDF generated. */
export function pdfFontChecks(): readonly PdfFontCheck[] {
  return current;
}

/** The last PDF's font warnings as they stand for `state`: none when they
 *  came from another book; `stale` when the book, the settings or the
 *  resources changed since that PDF (or it rendered another scope or
 *  chapter). */
export function pdfFontChecksFor(state: PdfFontCheckState): { checks: readonly PdfFontCheck[]; stale: boolean } {
  if (current.length === 0 || !currentSource || currentSource.bookVersion !== state.bookVersion) return { checks: [], stale: false };
  const now = pdfFontChecksSource(state);
  const stale = now.scope !== currentSource.scope
    || now.text !== currentSource.text
    || now.config !== currentSource.config
    || now.resources !== currentSource.resources;
  return { checks: current, stale };
}

/** Replace the list with a new generation's warnings, and what that
 *  generation was made from. A failed generation passes none. */
export function setPdfFontChecks(checks: readonly PdfFontCheck[], source: PdfFontChecksSource | null = null): void {
  const unchanged = checks.length === 0 && current.length === 0;
  currentSource = source;
  if (unchanged) return;
  current = checks;
  for (const cb of listeners) cb();
}

/** Be told when {@link pdfFontChecks} changes; returns the unsubscribe
 *  function. */
export function onPdfFontChecksChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
