import { beforeAll, describe, expect, it } from 'vitest';
import { buildDocument } from 'postext';
import type { VDTDocument } from 'postext';
import { layOutEdition, type EditionLayout } from './editionLayout.js';
import { FIXTURE_LOCALES, threeEditionsBook, type FixtureLocale } from './threeEditions.fixture.js';
import { frameJumpFragment } from './frameJump.js';
import { selectFrameOnPage } from './useFrameJumpRunner.js';
import { pageSelectionNow, resetPageSelection } from '../selection/selectionStore.js';
import { selectedElement } from '../selection/pageSelection.js';
import {
  composedChecksOf, composedPageIndex, filterComposedChecks, frameKeyOf, groupComposedChecks, jumpFor, pageKeyOf,
  resolveJump, sameComposedPage, type ComposedCheck,
} from '../warnings/composedChecks.js';
import { fitMarksFor } from '../viewport/composed/fitMarks.js';
import { matchingPage, syncedScrollTop } from '../viewport/composed/compareSync.js';
import { EMPTY_VIEW_HASH } from '../storage/viewHash.js';
import type { Chapter } from '../book/types.js';
import { fontPx } from '../__tests__/fontPx.js';

// Text measured at about the width of a book face (0.42 em a character).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const px = Number(fontPx(this.font)?.[1] ?? 16);
    return { width: s.length * px * 0.42 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx { return new StubCtx(); }
};

const LABELS = { overflow: '__mm__ mm short', scaled: 'text at __percent__ %', imageScaled: 'pictures at __percent__ %' };

function chaptersOf(locale: FixtureLocale): Chapter[] {
  return threeEditionsBook(locale).chapters.map((c, i) => ({ id: `${locale}-ch${i + 1}`, title: c.title, markdown: c.markdown }) as Chapter);
}

const layouts = new Map<FixtureLocale, EditionLayout>();
const checks: ComposedCheck[] = [];
/** The overlap checks (#1053, #1066): the stand-in's photos hang a
 *  millimetre or two past their boxes in every edition. Asserted on their
 *  own; the other tests read the rest. */
const overlapChecks: ComposedCheck[] = [];

beforeAll(async () => {
  for (const locale of FIXTURE_LOCALES) {
    const book = threeEditionsBook(locale);
    const layout = await layOutEdition(
      { locale, chapters: chaptersOf(locale), config: book.config, resources: book.resources },
      async (content, config) => buildDocument(content, config),
    );
    layouts.set(locale, layout);
    for (const c of composedChecksOf(locale, layout.chapters)) {
      (c.warning.payload.kind === 'frameOutsideArea' || c.warning.payload.kind === 'frameCovered' ? overlapChecks : checks).push(c);
    }
  }
}, 120_000);

function doc(locale: FixtureLocale, chapter: number): VDTDocument {
  return layouts.get(locale)!.chapters[chapter]!.doc!;
}

function frameOf(d: VDTDocument, fence: number, name: string) {
  const i = composedPageIndex(d, fence, name);
  return d.pages[i]!.composed!.frames.find((f) => f.name === name)!;
}

describe('a composed book in three editions', () => {
  it('lays every edition out, chapter after chapter', () => {
    for (const locale of FIXTURE_LOCALES) {
      const layout = layouts.get(locale)!;
      expect(layout.settled).toBe(true);
      expect(layout.chapters.map((c) => c.doc !== null)).toEqual([true, true]);
      // Chapter 2 is numbered after chapter 1.
      expect(doc(locale, 1).pages[0]!.pageNumberValue).toBeGreaterThan(doc(locale, 0).pages.at(-1)!.pageNumberValue);
    }
  });

  it('finds the frame that does not fit in Catalan only, and the shrunk one in English', () => {
    const overflow = checks.filter((c) => c.warning.payload.kind === 'frameOverflow');
    expect(overflow.map((c) => `${c.locale}:${c.chapterIndex}:${c.fenceIndex}:${c.frame}`)).toEqual(['ca:1:0:dinero']);
    expect(frameOf(doc('ca', 1), 0, 'dinero').overflowPx).toBeGreaterThan(0);
    expect(frameOf(doc('es', 1), 0, 'dinero').overflowPx).toBe(0);
    expect(frameOf(doc('en', 1), 0, 'dinero').overflowPx).toBe(0);
    const en = frameOf(doc('en', 0), 0, 'dinero');
    expect(en.overflowPx).toBe(0);
    expect(en.scale).toBeLessThan(1);
    expect(frameOf(doc('es', 0), 0, 'dinero').scale).toBe(1);
  });

  it('places every check of every edition on its page and frame', () => {
    const kinds = checks.map((c) => `${c.locale}:${c.warning.payload.kind}:${c.chapterIndex}:${c.fenceIndex}:${c.frame ?? ''}`).sort();
    expect(kinds).toEqual([
      'ca:frameOverflow:1:0:dinero',
      'en:slotEmpty:0:1:ahorro',
      'es:slotUnknown:0:1:texto',
    ]);
    // The photos past their boxes, in the first chapter of every edition.
    expect([...new Set(overlapChecks.map((c) => `${c.warning.payload.kind}:${c.chapterIndex}:${c.fenceIndex}:${c.frame}`))].sort())
      .toEqual(['frameOutsideArea:0:0:dinero-fotos', 'frameOutsideArea:0:0:gasto-fotos']);
    expect(new Set(overlapChecks.map((c) => c.locale))).toEqual(new Set(['es', 'en', 'ca']));
    for (const c of [...checks, ...overlapChecks]) {
      expect(c.page).not.toBeNull();
      expect(c.frameId).toBe(`cp${c.fenceIndex}:${c.frame}`);
      const d = doc(c.locale as FixtureLocale, c.chapterIndex!);
      expect(d.pages[c.pageIndex!]!.pageNumberValue).toBe(c.page);
      expect(d.pages[c.pageIndex!]!.composed!.fenceIndex).toBe(c.fenceIndex);
    }
  });

  it('groups by page, by frame and by language, and filters by any', () => {
    const order = ['es', 'en', 'ca'];
    const byPage = groupComposedChecks(checks, 'page', order);
    expect(byPage.map((g) => [g.key, g.items.map((c) => c.locale)])).toEqual([
      ['c0:f1', ['es', 'en']],
      ['c1:f0', ['ca']],
    ]);
    const byFrame = groupComposedChecks(checks, 'frame', order);
    expect(byFrame.map((g) => g.key)).toEqual(['c0:f1:texto', 'c0:f1:ahorro', 'c1:f0:dinero']);
    const byLocale = groupComposedChecks(checks, 'locale', order);
    expect(byLocale.map((g) => g.locale)).toEqual(['es', 'en', 'ca']);
    expect(filterComposedChecks(checks, { locale: 'ca' }).map((c) => c.warning.payload.kind)).toEqual(['frameOverflow']);
    const ca = checks.find((c) => c.locale === 'ca')!;
    expect(filterComposedChecks(checks, { page: pageKeyOf(ca) })).toEqual([ca]);
    expect(filterComposedChecks(checks, { frame: frameKeyOf(ca), locale: 'en' })).toEqual([]);
  });

  it('each check jumps to its frame in its edition: the page, the frame, its slot', () => {
    for (const c of checks) {
      const jump = jumpFor(c);
      expect(jump.locale).toBe(c.locale);
      expect(jump.chapterIndex).toBe(c.chapterIndex);
      const d = doc(c.locale as FixtureLocale, c.chapterIndex!);
      const resolved = resolveJump(d, jump)!;
      expect(resolved.pageIndex).toBe(c.pageIndex);
      expect(resolved.frame?.id).toBe(c.frameId);
    }
    // The overflow lands with the caret in the box's text.
    const ca = checks.find((c) => c.locale === 'ca')!;
    const resolved = resolveJump(doc('ca', 1), jumpFor(ca))!;
    const md = layouts.get('ca')!.chapters[1]!.book.markdown;
    expect(md.slice(resolved.sourceStart, resolved.sourceStart! + 29)).toBe('El mateix producte pot costar');
    // The fragment opens the edition, the canvas, the chapter and the page.
    expect(frameJumpFragment({ ...EMPTY_VIEW_HASH, preset: 'tres', lang: 'es', view: 'pdf', chapter: 0, page: 1 }, { ...jumpFor(ca), presetId: 'tres' }))
      .toBe(`#preset=tres&lang=ca&view=canvas&chapter=2&page=${ca.page}`);
  });

  it('switching edition keeps the composed page and its frames', () => {
    for (const chapter of [0, 1]) {
      const es = doc('es', chapter);
      es.pages.forEach((p, i) => {
        if (!p.composed) return;
        for (const other of ['en', 'ca'] as const) {
          const d = doc(other, chapter);
          const j = sameComposedPage(es, i, d);
          expect(d.pages[j]!.composed!.fenceIndex).toBe(p.composed.fenceIndex);
          expect(d.pages[j]!.composed!.frames.map((f) => f.id)).toEqual(p.composed.frames.map((f) => f.id));
          // The jump of the switcher (fence, no page) lands there.
          expect(resolveJump(d, { fenceIndex: p.composed.fenceIndex, frame: 'dinero', page: null })!.pageIndex).toBe(j);
        }
      });
    }
  });

  it('marks the overflow and the shrunk text on the canvas overlay', () => {
    const ca = doc('ca', 1);
    const caMarks = fitMarksFor(ca, ca.pages[composedPageIndex(ca, 0)]!, LABELS);
    expect(caMarks.map((m) => `${m.kind}:${m.frame.name}`)).toEqual(['overflow:dinero']);
    expect(caMarks[0]!.text).toMatch(/^\d+(\.\d)? mm short$/);
    const en = doc('en', 0);
    const enMarks = fitMarksFor(en, en.pages[composedPageIndex(en, 0)]!, LABELS, { targetFrameId: 'cp0:gasto' });
    expect(enMarks.map((m) => `${m.kind}:${m.frame.name}`)).toEqual(['target:gasto', 'scaled:dinero']);
    expect(enMarks[1]!.text).toMatch(/^text at \d+(\.\d)? %$/);
    const es = doc('es', 0);
    expect(fitMarksFor(es, es.pages[composedPageIndex(es, 0)]!, LABELS)).toEqual([]);
  });

  it('keeps the two columns of the side-by-side view on the same page', () => {
    const es = doc('es', 1);
    const ca = doc('ca', 1);
    const fence = composedPageIndex(ca, 0);
    expect(matchingPage(es, composedPageIndex(es, 0), ca)).toBe(fence);
    const tops = (d: VDTDocument) => d.pages.map((_, i) => i * 1000);
    const heights = (d: VDTDocument) => d.pages.map(() => 990);
    const at = composedPageIndex(es, 0) * 1000 + 495;
    expect(syncedScrollTop({ doc: es, tops: tops(es), heights: heights(es), scrollTop: at }, { doc: ca, tops: tops(ca), heights: heights(ca) }))
      .toBe(fence * 1000 + 495);
  });

  it('places the warning of a template where the edition first sets the template, once per edition', async () => {
    const book = threeEditionsBook('es');
    const config = structuredClone(book.config) as typeof book.config;
    const frames = config.pageTemplates![0]!.frames as unknown as { style?: string }[];
    frames[2]!.style = 'caja-roja';
    const layout = await layOutEdition({ locale: 'es', chapters: chaptersOf('es'), config, resources: book.resources }, async (content, cfg) => buildDocument(content, cfg));
    const found = composedChecksOf('es', layout.chapters).filter((c) => c.warning.payload.kind === 'frameStyleUnknown');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ chapterIndex: 0, fenceIndex: 0, template: 'tema-cajas', frame: 'dinero', frameId: 'cp0:dinero' });
    expect(jumpFor(found[0]!).panel).toBe('markdown');
    // In a project (one edition), the fragment keeps the book on screen.
    expect(frameJumpFragment({ ...EMPTY_VIEW_HASH, project: 'p1', chapter: 1 }, { presetId: null, locale: 'es', chapterIndex: 0, page: 3 }))
      .toBe('#project=p1&view=canvas&chapter=1&page=3');
    // A project that keeps several editions opens the one a check is in (#903).
    expect(frameJumpFragment({ ...EMPTY_VIEW_HASH, project: 'p1', lang: 'es', chapter: 1 }, { presetId: null, projectId: 'p1', locale: 'ca', chapterIndex: 1, page: 4 }))
      .toBe('#project=p1&lang=ca&view=canvas&chapter=2&page=4');
  });

  it('picks the frame a check reaches as the page selection, at frame level', () => {
    resetPageSelection();
    const ca = doc('ca', 1);
    const i = composedPageIndex(ca, 0, 'dinero');
    expect(selectFrameOnPage(ca, i, 'cp0:dinero', 'ca-ch2')).toBe(true);
    const sel = pageSelectionNow()!.selection;
    expect(sel.pageIndex).toBe(i);
    expect(selectedElement(sel)).toMatchObject({ level: 'frame', id: 'cp0:dinero' });
    expect(sel.chapter).toBe('ca-ch2');
    expect(selectFrameOnPage(ca, i, 'cp9:nada')).toBe(false);
    resetPageSelection();
  });
});
