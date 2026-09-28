import { describe, it, expect, beforeEach } from 'vitest';
import { onPdfFontChecksChange, pdfFontChecksFor, pdfFontChecksSource, setPdfFontChecks, type PdfFontCheck, type PdfFontCheckState } from './pdfFontWarnings';
import { computeWarnings } from '../warnings/compute';

// Issue #196 review: the Checks panel kept the last PDF's font warnings
// after another book was opened, after the book was edited, and after a
// generation failed.

const MISSING: PdfFontCheck = { kind: 'missingGlyph', family: 'Open Sans', weight: 400, style: 'normal', characters: ['紅', '樓'], message: '' };

function book(): PdfFontCheckState {
  return {
    bookVersion: 3,
    pdfScope: 'book',
    activeChapterId: 'c1',
    chapters: [{ id: 'c1' }, { id: 'c2' }],
    config: {},
    resources: [],
  };
}

describe('the last PDF\'s font checks', () => {
  beforeEach(() => setPdfFontChecks([]));

  it('stand for the book and inputs they were generated from', () => {
    const state = book();
    setPdfFontChecks([MISSING], pdfFontChecksSource(state));
    expect(pdfFontChecksFor(state)).toEqual({ checks: [MISSING], stale: false });
    // A state object rebuilt around the same inputs (another slice changed).
    expect(pdfFontChecksFor({ ...state })).toEqual({ checks: [MISSING], stale: false });
  });

  it('are marked stale once the book, the settings or the resources change', () => {
    const state = book();
    setPdfFontChecks([MISSING], pdfFontChecksSource(state));
    expect(pdfFontChecksFor({ ...state, chapters: [...state.chapters] }).stale).toBe(true);
    expect(pdfFontChecksFor({ ...state, config: { bodyText: {} } }).stale).toBe(true);
    expect(pdfFontChecksFor({ ...state, resources: [] }).stale).toBe(true);
    expect(pdfFontChecksFor({ ...state, pdfScope: 'chapter' }).stale).toBe(true);
  });

  it('follow the rendered chapter only, for a chapter\'s PDF', () => {
    const c1 = { id: 'c1' };
    const state: PdfFontCheckState = { ...book(), pdfScope: 'chapter', chapters: [c1, { id: 'c2' }] };
    setPdfFontChecks([MISSING], pdfFontChecksSource(state));
    // Another chapter edited: the chapter's PDF is still the one on screen.
    expect(pdfFontChecksFor({ ...state, chapters: [c1, { id: 'c2' }] }).stale).toBe(false);
    // The chapter itself edited, or another chapter opened.
    expect(pdfFontChecksFor({ ...state, chapters: [{ id: 'c1' }, { id: 'c2' }] }).stale).toBe(true);
    expect(pdfFontChecksFor({ ...state, activeChapterId: 'c2' }).stale).toBe(true);
  });

  it('are dropped when another book is opened', () => {
    const state = book();
    setPdfFontChecks([MISSING], pdfFontChecksSource(state));
    expect(pdfFontChecksFor({ ...state, bookVersion: 4 })).toEqual({ checks: [], stale: false });
  });

  it('are cleared by a generation that failed', () => {
    const state = book();
    setPdfFontChecks([MISSING], pdfFontChecksSource(state));
    let told = 0;
    const off = onPdfFontChecksChange(() => told++);
    setPdfFontChecks([]);
    off();
    expect(told).toBe(1);
    expect(pdfFontChecksFor(state)).toEqual({ checks: [], stale: false });
  });

  it('say so in the Checks panel when stale', () => {
    const state = book();
    setPdfFontChecks([MISSING], pdfFontChecksSource(state));
    const { checks, stale } = pdfFontChecksFor({ ...state, config: { bodyText: {} } });
    const warnings = computeWarnings({ markdown: '', config: {}, doc: null, pdfFontChecks: checks, pdfFontChecksStale: stale });
    expect(warnings.find((w) => w.id.startsWith('pdf-'))?.payload).toEqual({
      kind: 'missingGlyph',
      family: 'Open Sans',
      weight: 400,
      style: 'normal',
      characters: ['紅', '樓'],
      stale: true,
    });
  });
});
