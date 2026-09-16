import { describe, expect, it } from 'vitest';
import type { NumeralStyle, PostextConfig, Resource, VDTDocument } from 'postext';
import { chapterLayoutFromDoc, chapterPageLabels, createBookPlanner, sameChapterLayout, sameLayoutInputs } from './pagination';
import { ENGINE_KEY, configKeyOf, resourcesKeyOf } from './layoutKeys';
import { newChapter } from './chapterOps';
import type { ChapterLayout, ChapterPlan } from './types';

const figure = (id: string): Resource => ({
  id, typeId: 'figure', kind: 'bitmap', caption: `Figure ${id}.`, createdAt: 0, updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 400, height: 300 },
});

const chapters = [
  newChapter('a', 'A', '# One\n\nSee :ref{id=f1}.', 1),
  newChapter('b', 'B', '# Two\n\n## Detail\n\nSee :ref{id=f2} and :ref{id=f1}.', 1),
  newChapter('c', 'C', '# Three', 1),
];
const config: PostextConfig = {};
const resources = [figure('f1'), figure('f2')];

function layoutFor(plan: ChapterPlan, over: Partial<ChapterLayout> & { pageCount: number }): ChapterLayout {
  const chapter = chapters.find((c) => c.id === plan.chapterId)!;
  return {
    chapterId: plan.chapterId,
    markdown: chapter.markdown,
    configKey: configKeyOf(config),
    resourcesKey: resourcesKeyOf(resources),
    engine: ENGINE_KEY,
    continuationKey: plan.continuationKey,
    leadingBlankPages: 0,
    firstContentPageNumber: { delta: over.leadingBlankPages ?? 0 },
    firstContentPageFormat: 'decimal',
    lastPageNumber: { delta: over.pageCount - 1 },
    lastPageFormat: 'decimal',
    outline: [],
    outlineKey: '',
    ...over,
  };
}

describe('createBookPlanner', () => {
  it('treats the first chapter as self-contained and makes the rest wait for its pages', () => {
    const plan = createBookPlanner().plan(chapters, config, resources, {});
    expect(plan.chapters.map((c) => c.chapterId)).toEqual(['a', 'b', 'c']);
    expect(plan.byId.a!.continuation).toBeUndefined();
    expect(plan.byId.a!.paginated).toBe(true);
    expect(plan.byId.a!.continuationKey).toBe('first');
    // Counters are known without any layout; pages are not.
    expect(plan.byId.b!.continuation?.headings).toEqual({ h1: 1, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 });
    expect(plan.byId.b!.continuation?.resourceNumbers?.f1?.number).toBe('1.1');
    expect(plan.byId.b!.continuation?.pageIndexOffset).toBeUndefined();
    expect(plan.byId.b!.paginated).toBe(false);
    expect(plan.byId.c!.continuation?.headings?.h1).toBe(2);
    expect(plan.byId.c!.continuation?.headings?.h2).toBe(1);
    expect(plan.byId.c!.continuation?.resourceNumbers?.f2?.number).toBe('2.1');
    expect(plan.byId.c!.continuation?.resourceNumbers?.f1?.number).toBe('1.1');
    expect(plan.bookPages).toEqual({});
    expect(plan.pendingChapterId).toBe('a');
  });

  it('chains page offsets and numbering through the recorded layouts', () => {
    const planner = createBookPlanner();
    const p0 = planner.plan(chapters, config, resources, {});
    const a = layoutFor(p0.byId.a!, { pageCount: 13 });
    const p1 = planner.plan(chapters, config, resources, { a });
    expect(p1.byId.a!.layout).toBe(a);
    expect(p1.bookPages.a).toEqual({ pageIndex: 0, pageNumberValue: 1, pageNumberFormat: 'decimal', lastPageNumberValue: 13, lastPageNumberFormat: 'decimal', pageCount: 13 });
    expect(p1.byId.b!.paginated).toBe(true);
    expect(p1.byId.b!.continuation?.pageIndexOffset).toBe(13);
    expect(p1.byId.b!.continuation?.pageNumbering).toEqual({ format: 'decimal', startAt: 14 });
    expect(p1.pendingChapterId).toBe('b');
    expect(p1.bookPages.b).toBeUndefined();
    // Chapter b: one blank parity page, then two content pages (15–16).
    const b = layoutFor(p1.byId.b!, { pageCount: 3, leadingBlankPages: 1, lastPageNumber: { delta: 2 } });
    const p2 = planner.plan(chapters, config, resources, { a, b });
    expect(p2.bookPages.b).toEqual({ pageIndex: 14, pageNumberValue: 15, pageNumberFormat: 'decimal', lastPageNumberValue: 16, lastPageNumberFormat: 'decimal', pageCount: 2 });
    expect(p2.byId.c!.continuation?.pageIndexOffset).toBe(16);
    expect(p2.byId.c!.continuation?.pageNumbering?.startAt).toBe(17);
    expect(p2.pendingChapterId).toBe('c');
    const c = layoutFor(p2.byId.c!, { pageCount: 1 });
    const p3 = planner.plan(chapters, config, resources, { a, b, c });
    expect(p3.pendingChapterId).toBeNull();
    expect(p3.bookPages.c).toEqual({ pageIndex: 16, pageNumberValue: 17, pageNumberFormat: 'decimal', lastPageNumberValue: 17, lastPageNumberFormat: 'decimal', pageCount: 1 });
  });

  it('follows a numbering change inside a chapter', () => {
    const planner = createBookPlanner();
    const p0 = planner.plan(chapters, config, resources, {});
    // Roman front matter restarting at 1 on its second page: pages i, 1, 2.
    const a = layoutFor(p0.byId.a!, { pageCount: 3, lastPageNumber: { value: 2 }, lastPageFormat: 'decimal' });
    const p1 = planner.plan(chapters, config, resources, { a });
    expect(p1.byId.b!.continuation?.pageNumbering).toEqual({ format: 'decimal', startAt: 3 });
  });

  it('places a chapter restarting the numbering at its head where its own pages say', () => {
    const planner = createBookPlanner();
    const p0 = planner.plan(chapters, config, resources, {});
    // Roman front matter: pages i–iii.
    const a = layoutFor(p0.byId.a!, { pageCount: 3, firstContentPageFormat: 'lower-roman', lastPageFormat: 'lower-roman' });
    const p1 = planner.plan(chapters, config, resources, { a });
    expect(p1.bookPages.a).toMatchObject({ pageNumberValue: 1, pageNumberFormat: 'lower-roman', lastPageNumberValue: 3, lastPageNumberFormat: 'lower-roman' });
    expect(chapterPageLabels(p1.bookPages.a!)).toEqual({ from: 'i', to: 'iii' });
    expect(p1.byId.b!.continuation?.pageNumbering).toEqual({ format: 'lower-roman', startAt: 4 });
    // Chapter b opens on a recto: a blank page iv, then pages 1–2 after a
    // `:::numbering{format="decimal" startAt=1}` at its head.
    const b = layoutFor(p1.byId.b!, { pageCount: 3, leadingBlankPages: 1, firstContentPageNumber: { value: 1 }, firstContentPageFormat: 'decimal', lastPageNumber: { value: 2 }, lastPageFormat: 'decimal' });
    const p2 = planner.plan(chapters, config, resources, { a, b });
    expect(p2.bookPages.b).toEqual({ pageIndex: 4, pageNumberValue: 1, pageNumberFormat: 'decimal', lastPageNumberValue: 2, lastPageNumberFormat: 'decimal', pageCount: 2 });
    expect(chapterPageLabels(p2.bookPages.b!)).toEqual({ from: '1', to: '2' });
    expect(p2.byId.c!.continuation?.pageNumbering).toEqual({ format: 'decimal', startAt: 3 });
    // The front matter growing by two pages (same parity) keeps b's record
    // and its restarted numbers.
    const a2 = { ...a, pageCount: 5, lastPageNumber: { delta: 4 } };
    const p3 = planner.plan(chapters, config, resources, { a: a2, b });
    expect(p3.byId.b!.layout).toBe(b);
    expect(p3.bookPages.b).toMatchObject({ pageIndex: 6, pageNumberValue: 1, lastPageNumberValue: 2 });
    expect(p3.byId.c!.continuation?.pageNumbering).toEqual({ format: 'decimal', startAt: 3 });
  });

  it('numbers a chapter by its first numbered level-1 heading', () => {
    const config: PostextConfig = { headingStyles: [{ id: 'front', numbered: false }] };
    const book = [
      newChapter('cover', 'Cover', '# Title {style="front"}\n\n# Preface {style="front"}', 1),
      newChapter('one', 'One', '# One', 1),
      newChapter('tail', 'Tail', 'No heading here.', 1),
      newChapter('two', 'Two', '# Two\n\n# Three', 1),
    ];
    const plan = createBookPlanner().plan(book, config, resources, {});
    expect(plan.chapters.map((c) => c.number)).toEqual([null, 1, null, 2]);
  });

  it('ignores a layout whose inputs changed and re-keys the chapters after a parity shift', () => {
    const planner = createBookPlanner();
    const p0 = planner.plan(chapters, config, resources, {});
    const a = layoutFor(p0.byId.a!, { pageCount: 13 });
    const p1 = planner.plan(chapters, config, resources, { a });
    const b = layoutFor(p1.byId.b!, { pageCount: 3 });
    // An equal config in another object keeps every record; a different
    // one (or another engine) invalidates them.
    const same = planner.plan(chapters, { ...config }, resources, { a, b });
    expect(same.byId.a!.layout).toBe(a);
    const other = planner.plan(chapters, { ...config, bodyText: { fontSize: { value: 12, unit: 'pt' } } }, resources, { a, b });
    expect(other.byId.a!.layout).toBeNull();
    expect(other.pendingChapterId).toBe('a');
    const older = planner.plan(chapters, config, resources, { a: { ...a, engine: '0.0.0' }, b });
    expect(older.byId.a!.layout).toBeNull();
    // Chapter a grew by one page: b now starts on the other side of the
    // spread, so its record (keyed on parity) no longer applies.
    const a2 = { ...a, pageCount: 14, lastPageNumber: { delta: 13 } };
    const shifted = planner.plan(chapters, config, resources, { a: a2, b });
    expect(shifted.byId.a!.layout).toBe(a2);
    expect(shifted.byId.b!.layout).toBeNull();
    expect(shifted.byId.b!.continuationKey).not.toBe(p1.byId.b!.continuationKey);
    // Growing by two pages keeps the parity: b's record is still current.
    const a3 = { ...a, pageCount: 15, lastPageNumber: { delta: 14 } };
    const kept = planner.plan(chapters, config, resources, { a: a3, b });
    expect(kept.byId.b!.layout).toBe(b);
    expect(kept.byId.b!.continuation?.pageNumbering?.startAt).toBe(16);
    // Editing the chapter's own text invalidates only its record.
    const edited = chapters.map((c) => (c.id === 'a' ? { ...c, markdown: '# One\n\nchanged' } : c));
    const p = planner.plan(edited, config, resources, { a, b });
    expect(p.byId.a!.layout).toBeNull();
    expect(p.pendingChapterId).toBe('a');
  });

  it('reuses the counter chain across plans', () => {
    const planner = createBookPlanner();
    const p1 = planner.plan(chapters, config, resources, {});
    const p2 = planner.plan(chapters, config, resources, {});
    expect(p2.byId.c!.continuation?.headings).toBe(p1.byId.c!.continuation?.headings);
    expect(p2.byId.c!.continuation?.resourceNumbers).toBe(p1.byId.c!.continuation?.resourceNumbers);
  });
});

describe('chapterLayoutFromDoc', () => {
  const doc = (pages: Array<{ value: number; format?: NumeralStyle }>, blockPages: number[], restarts?: number[]): VDTDocument => ({
    pages: pages.map((p, index) => ({ index, pageNumberValue: p.value, pageNumberFormat: p.format ?? 'decimal' })),
    blocks: blockPages.map((pageIndex) => ({ pageIndex })),
    ...(restarts ? { pageNumberRestarts: restarts } : {}),
  } as unknown as VDTDocument);
  const plan = (paginated: boolean): ChapterPlan => ({ chapterId: 'b', index: 1, number: 2, continuation: undefined, paginated, continuationKey: 'k', outlineKey: '', layout: null });
  const inputs = { markdown: '# B', config, resources };

  it('records page count, leading blanks and how the numbering ends', () => {
    const layout = chapterLayoutFromDoc(doc([{ value: 14 }, { value: 15 }, { value: 16 }], [1, 2, 2]), plan(true), inputs)!;
    expect(layout).toMatchObject({ chapterId: 'b', continuationKey: 'k', pageCount: 3, leadingBlankPages: 1, firstContentPageNumber: { delta: 1 }, firstContentPageFormat: 'decimal', lastPageNumber: { delta: 2 }, lastPageFormat: 'decimal', markdown: '# B' });
    expect(layout.configKey).toBe(configKeyOf(config));
    expect(layout.resourcesKey).toBe(resourcesKeyOf(resources));
    expect(layout.engine).toBe(ENGINE_KEY);
    const roman = chapterLayoutFromDoc(doc([{ value: 1, format: 'lower-roman' }, { value: 1 }], [0, 1], [1]), plan(true), inputs)!;
    expect(roman.lastPageNumber).toEqual({ value: 1 });
    expect(roman.lastPageFormat).toBe('decimal');
    expect(roman.firstContentPageNumber).toEqual({ delta: 0 });
    expect(roman.firstContentPageFormat).toBe('lower-roman');
    // A restart on the first content page after a blank parity page: the
    // restarted pages keep their absolute numbers.
    const restarted = chapterLayoutFromDoc(doc([{ value: 16, format: 'upper-roman' }, { value: 1 }, { value: 2 }], [1, 2], [1]), plan(true), inputs)!;
    expect(restarted).toMatchObject({ leadingBlankPages: 1, firstContentPageNumber: { value: 1 }, firstContentPageFormat: 'decimal', lastPageNumber: { value: 2 } });
  });

  it('records nothing for an unpaginated plan or an empty document', () => {
    expect(chapterLayoutFromDoc(doc([{ value: 1 }], [0]), plan(false), inputs)).toBeNull();
    expect(chapterLayoutFromDoc(doc([], []), plan(true), inputs)).toBeNull();
  });
});

describe('plan and layout equivalence', () => {
  const planner = createBookPlanner();
  it('sameLayoutInputs ignores the layout record but not the page fields', () => {
    const p1 = planner.plan(chapters, config, resources, {});
    const a = p1.byId.b!;
    // Recording chapter a's layout re-derives the plans as new objects;
    // chapter b now inherits pages, so its inputs did change.
    const p2 = planner.plan(chapters, config, resources, { a: layoutFor(p1.byId.a!, { pageCount: 3 }) });
    const b = p2.byId.b!;
    expect(b).not.toBe(a);
    expect(sameLayoutInputs(a, b)).toBe(false);
    // Recording b's own layout changes b's plan object, not its inputs.
    const p3 = planner.plan(chapters, config, resources, { a: p2.byId.a!.layout!, b: layoutFor(b, { pageCount: 5 }) });
    const b2 = p3.byId.b!;
    expect(b2).not.toBe(b);
    expect(b2.layout).not.toBeNull();
    expect(sameLayoutInputs(b, b2)).toBe(true);
    // A different page count before b moves its first page: not the same.
    const p4 = planner.plan(chapters, config, resources, { a: layoutFor(p1.byId.a!, { pageCount: 4 }) });
    expect(sameLayoutInputs(b, p4.byId.b!)).toBe(false);
    // Same parity but a different first page number: not the same either.
    const p5 = planner.plan(chapters, config, resources, { a: { ...layoutFor(p1.byId.a!, { pageCount: 3 }), lastPageNumber: { delta: 5 } } });
    expect(sameLayoutInputs(b, p5.byId.b!)).toBe(false);
  });
  it('sameChapterLayout compares inputs by identity and the page outcome by value', () => {
    const plan = planner.plan(chapters, config, resources, {}).byId.a!;
    const l = layoutFor(plan, { pageCount: 3 });
    expect(sameChapterLayout(undefined, l)).toBe(false);
    expect(sameChapterLayout(l, { ...l })).toBe(true);
    expect(sameChapterLayout(l, { ...l, pageCount: 4 })).toBe(false);
    expect(sameChapterLayout(l, { ...l, leadingBlankPages: 1 })).toBe(false);
    expect(sameChapterLayout(l, { ...l, configKey: 'other' })).toBe(false);
    expect(sameChapterLayout(l, { ...l, markdown: l.markdown + ' ' })).toBe(false);
  });
});
