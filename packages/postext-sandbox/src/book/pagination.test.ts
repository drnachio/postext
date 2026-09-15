import { describe, expect, it } from 'vitest';
import type { PostextConfig, Resource, VDTDocument } from 'postext';
import { chapterLayoutFromDoc, createBookPlanner, sameChapterLayout, sameLayoutInputs } from './pagination';
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
    config,
    resources,
    continuationKey: plan.continuationKey,
    leadingBlankPages: 0,
    lastPageDelta: over.pageCount - 1,
    lastPageFormat: 'decimal',
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
    expect(p1.bookPages.a).toEqual({ pageIndex: 0, pageNumberValue: 1, pageCount: 13 });
    expect(p1.byId.b!.paginated).toBe(true);
    expect(p1.byId.b!.continuation?.pageIndexOffset).toBe(13);
    expect(p1.byId.b!.continuation?.pageNumbering).toEqual({ format: 'decimal', startAt: 14 });
    expect(p1.pendingChapterId).toBe('b');
    expect(p1.bookPages.b).toBeUndefined();
    // Chapter b: one blank parity page, then two content pages (15–16).
    const b = layoutFor(p1.byId.b!, { pageCount: 3, leadingBlankPages: 1, lastPageDelta: 2 });
    const p2 = planner.plan(chapters, config, resources, { a, b });
    expect(p2.bookPages.b).toEqual({ pageIndex: 14, pageNumberValue: 15, pageCount: 2 });
    expect(p2.byId.c!.continuation?.pageIndexOffset).toBe(16);
    expect(p2.byId.c!.continuation?.pageNumbering?.startAt).toBe(17);
    expect(p2.pendingChapterId).toBe('c');
    const c = layoutFor(p2.byId.c!, { pageCount: 1 });
    const p3 = planner.plan(chapters, config, resources, { a, b, c });
    expect(p3.pendingChapterId).toBeNull();
    expect(p3.bookPages.c).toEqual({ pageIndex: 16, pageNumberValue: 17, pageCount: 1 });
  });

  it('follows a numbering change inside a chapter', () => {
    const planner = createBookPlanner();
    const p0 = planner.plan(chapters, config, resources, {});
    // Roman front matter restarting at 1 on its second page: pages i, 1, 2.
    const a = layoutFor(p0.byId.a!, { pageCount: 3, lastPageDelta: 1, lastPageFormat: 'decimal' });
    const p1 = planner.plan(chapters, config, resources, { a });
    expect(p1.byId.b!.continuation?.pageNumbering).toEqual({ format: 'decimal', startAt: 3 });
  });

  it('ignores a layout whose inputs changed and re-keys the chapters after a parity shift', () => {
    const planner = createBookPlanner();
    const p0 = planner.plan(chapters, config, resources, {});
    const a = layoutFor(p0.byId.a!, { pageCount: 13 });
    const p1 = planner.plan(chapters, config, resources, { a });
    const b = layoutFor(p1.byId.b!, { pageCount: 3 });
    // A different config object invalidates every record.
    const other = planner.plan(chapters, { ...config }, resources, { a, b });
    expect(other.byId.a!.layout).toBeNull();
    expect(other.pendingChapterId).toBe('a');
    // Chapter a grew by one page: b now starts on the other side of the
    // spread, so its record (keyed on parity) no longer applies.
    const a2 = { ...a, pageCount: 14, lastPageDelta: 13 };
    const shifted = planner.plan(chapters, config, resources, { a: a2, b });
    expect(shifted.byId.a!.layout).toBe(a2);
    expect(shifted.byId.b!.layout).toBeNull();
    expect(shifted.byId.b!.continuationKey).not.toBe(p1.byId.b!.continuationKey);
    // Growing by two pages keeps the parity: b's record is still current.
    const a3 = { ...a, pageCount: 15, lastPageDelta: 14 };
    const same = planner.plan(chapters, config, resources, { a: a3, b });
    expect(same.byId.b!.layout).toBe(b);
    expect(same.byId.b!.continuation?.pageNumbering?.startAt).toBe(16);
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
  const doc = (pages: Array<{ value: number; format?: 'decimal' | 'lower-roman' }>, blockPages: number[]): VDTDocument => ({
    pages: pages.map((p, index) => ({ index, pageNumberValue: p.value, pageNumberFormat: p.format ?? 'decimal' })),
    blocks: blockPages.map((pageIndex) => ({ pageIndex })),
  } as unknown as VDTDocument);
  const plan = (paginated: boolean): ChapterPlan => ({ chapterId: 'b', index: 1, continuation: undefined, paginated, continuationKey: 'k', layout: null });
  const inputs = { markdown: '# B', config, resources };

  it('records page count, leading blanks and how the numbering ends', () => {
    const layout = chapterLayoutFromDoc(doc([{ value: 14 }, { value: 15 }, { value: 16 }], [1, 2, 2]), plan(true), inputs)!;
    expect(layout).toMatchObject({ chapterId: 'b', continuationKey: 'k', pageCount: 3, leadingBlankPages: 1, lastPageDelta: 2, lastPageFormat: 'decimal', markdown: '# B' });
    expect(layout.config).toBe(config);
    expect(layout.resources).toBe(resources);
    const roman = chapterLayoutFromDoc(doc([{ value: 1, format: 'lower-roman' }, { value: 1 }], [0, 1]), plan(true), inputs)!;
    expect(roman.lastPageDelta).toBe(0);
    expect(roman.lastPageFormat).toBe('decimal');
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
    const p5 = planner.plan(chapters, config, resources, { a: { ...layoutFor(p1.byId.a!, { pageCount: 3 }), lastPageDelta: 5 } });
    expect(sameLayoutInputs(b, p5.byId.b!)).toBe(false);
  });
  it('sameChapterLayout compares inputs by identity and the page outcome by value', () => {
    const plan = planner.plan(chapters, config, resources, {}).byId.a!;
    const l = layoutFor(plan, { pageCount: 3 });
    expect(sameChapterLayout(undefined, l)).toBe(false);
    expect(sameChapterLayout(l, { ...l })).toBe(true);
    expect(sameChapterLayout(l, { ...l, pageCount: 4 })).toBe(false);
    expect(sameChapterLayout(l, { ...l, leadingBlankPages: 1 })).toBe(false);
    expect(sameChapterLayout(l, { ...l, config: { ...config } })).toBe(false);
    expect(sameChapterLayout(l, { ...l, markdown: l.markdown + ' ' })).toBe(false);
  });
});
