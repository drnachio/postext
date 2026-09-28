import { describe, expect, it } from 'vitest';
import type { NumeralStyle, PostextConfig, Resource, VDTDocument } from 'postext';
import { chapterLayoutFromDoc, chapterPageLabels, createBookPlanner, sameChapterLayout, sameLayoutInputs } from './pagination';
import { ENGINE_KEY, configKeyOf, resourcesKeyOf } from './layoutKeys';
import { newChapter } from './chapterOps';
import type { Chapter, ChapterLayout, ChapterPlan } from './types';

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

function layoutFor(plan: ChapterPlan, over: Partial<ChapterLayout> & { pageCount: number }, book: readonly Chapter[] = chapters): ChapterLayout {
  const chapter = book.find((c) => c.id === plan.chapterId)!;
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
    outlinePages: [],
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

  it('numbers a chapter whose heading restarts the count with its startAt', () => {
    const config: PostextConfig = { headingStyles: [{ id: 'appendix', numberingTemplate: 'Appendix {1:A}' }] };
    const book = [
      newChapter('one', 'One', '# One\n\n# Two', 1),
      newChapter('a', 'A', 'Lead-in.\n\n# Survey {style="appendix" startAt=1}\n\n# Data {style="appendix"}', 1),
      newChapter('b', 'B', '# Tables {style="appendix"}', 1),
      newChapter('bad', 'Bad', '# Index {startAt=0}', 1),
    ];
    const plan = createBookPlanner().plan(book, config, resources, {});
    expect(plan.chapters.map((c) => c.number)).toEqual([1, 1, 3, 4]);
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

  it('keeps the pages of a chapter printing the contents when only the outline changed', () => {
    const book = [
      newChapter('front', 'Front', '# Contents {style="front"}\n\n:::toc\n:::', 1),
      ...chapters,
    ];
    const cfg: PostextConfig = { headingStyles: [{ id: 'front', numbered: false }] };
    const layoutIn = (plan: ChapterPlan, over: Partial<ChapterLayout> & { pageCount: number }): ChapterLayout => ({
      ...layoutFor(plan, over, book), configKey: configKeyOf(cfg),
    });
    const planner = createBookPlanner();
    const p0 = planner.plan(book, cfg, resources, {});
    expect(p0.byId.front!.outline).toBeDefined();
    expect(p0.byId.a!.outline).toBeUndefined();
    expect(p0.byId.front!.outlineKey).not.toBe('');
    // The front matter laid out with the outline as it stood (no page
    // labels yet): its own heading's label enters the outline, so it is
    // stale at once — but paginated, and a is next.
    const front0 = layoutIn(p0.byId.front!, { pageCount: 2, outlineKey: p0.byId.front!.outlineKey, outlinePages: [{ index: 0, number: { delta: 0 }, format: 'decimal' }] });
    const p1 = planner.plan(book, cfg, resources, { front: front0 });
    expect(p1.byId.front!.outlineStale).toBe(true);
    expect(p1.byId.a!.paginated).toBe(true);
    expect(p1.pendingChapterId).toBe('a');
    // Laid out again with that outline; then chapter a lands and its
    // labels enter the book outline.
    const front = { ...front0, outlineKey: p1.byId.front!.outlineKey };
    expect(planner.plan(book, cfg, resources, { front }).byId.front!.outlineStale).toBe(false);
    const a = layoutIn(p1.byId.a!, { pageCount: 3, outlinePages: [{ index: 0, number: { delta: 0 }, format: 'decimal' }] });
    const p2 = planner.plan(book, cfg, resources, { front, a });
    // The contents are stale, the front matter's pages are not: b is
    // paginated and next in line; the contents wait for the book.
    expect(p2.byId.front!.layout).toBe(front);
    expect(p2.byId.front!.outlineStale).toBe(true);
    expect(p2.byId.front!.outlineKey).not.toBe(front.outlineKey);
    expect(p2.byId.a!.outlineStale).toBe(false);
    expect(p2.byId.b!.paginated).toBe(true);
    expect(p2.byId.b!.continuation?.pageIndexOffset).toBe(5);
    expect(p2.pendingChapterId).toBe('b');
    expect(p2.byId.front!.outline!.find((e) => e.title === 'One')).toMatchObject({ pageLabel: '3', pageIndex: 2 });
    const b = layoutIn(p2.byId.b!, { pageCount: 2 });
    const c = layoutIn(planner.plan(book, cfg, resources, { front, a, b }).byId.c!, { pageCount: 1 });
    const p3 = planner.plan(book, cfg, resources, { front, a, b, c });
    expect(p3.pendingChapterId).toBe('front');
    expect(sameLayoutInputs(p2.byId.b!, p3.byId.b!)).toBe(true);
    // Laid out again with the current outline: nothing is left, and the
    // chapters after it saw no change in their inputs.
    const front2 = { ...front, outlineKey: p3.byId.front!.outlineKey };
    const p4 = planner.plan(book, cfg, resources, { front: front2, a, b, c });
    expect(p4.byId.front!.outlineStale).toBe(false);
    expect(p4.pendingChapterId).toBeNull();
    expect(sameLayoutInputs(p3.byId.a!, p4.byId.a!)).toBe(true);
    expect(p4.byId.front!.outlineKey).toBe(p3.byId.front!.outlineKey);
  });

  it('places outline entries on the current page chain', () => {
    const planner = createBookPlanner();
    const book = [newChapter('front', 'Front', ':::toc\n:::', 1), ...chapters];
    const layoutIn = (plan: ChapterPlan, over: Partial<ChapterLayout> & { pageCount: number }): ChapterLayout => layoutFor(plan, over, book);
    const p0 = planner.plan(book, config, resources, {});
    const front = layoutIn(p0.byId.front!, { pageCount: 2, firstContentPageFormat: 'lower-roman', lastPageFormat: 'lower-roman' });
    const p1 = planner.plan(book, config, resources, { front });
    // Chapter a restarts the numbering at 1 on its first page; its heading
    // sits there, a sub-entry of b on b's second page.
    const a = layoutIn(p1.byId.a!, { pageCount: 3, firstContentPageNumber: { value: 1 }, lastPageNumber: { value: 3 }, outlinePages: [{ index: 0, number: { value: 1 }, format: 'decimal' }] });
    const p2 = planner.plan(book, config, resources, { front, a });
    const b = layoutIn(p2.byId.b!, { pageCount: 2, outlinePages: [{ index: 0, number: { delta: 0 }, format: 'decimal' }, { index: 1, number: { delta: 1 }, format: 'decimal' }] });
    const p3 = planner.plan(book, config, resources, { front, a, b });
    const titles = (plan: ChapterPlan) => plan.outline!.map((e) => `${e.title}@${e.pageLabel ?? '?'}/${e.pageIndex ?? '?'}`);
    expect(titles(p3.byId.front!)).toEqual(['One@1/2', 'Two@4/5', 'Detail@5/6', 'Three@?/?']);
    // The front matter growing by two pages keeps every record (same
    // parity) and moves the labels with the chain.
    const front2 = { ...front, pageCount: 4, lastPageNumber: { delta: 3 } };
    const p4 = planner.plan(book, config, resources, { front: front2, a, b });
    expect(p4.byId.a!.layout).toBe(a);
    expect(p4.byId.b!.layout).toBe(b);
    expect(titles(p4.byId.front!)).toEqual(['One@1/4', 'Two@4/7', 'Detail@5/8', 'Three@?/?']);
    // A record whose entry count no longer matches the text is left out.
    const p5 = planner.plan(book, config, resources, { front, a, b: { ...b, outlinePages: [] } });
    expect(titles(p5.byId.front!)).toEqual(['One@1/2', 'Two@?/?', 'Detail@?/?', 'Three@?/?']);
  });

  it('points a part row without a page at the next chapter\'s first content page', () => {
    // `parts.page: false` and a fence closing chapter a: the part reaches
    // no page of a; its content (and running heads) start with chapter c,
    // after its parity blank.
    const noPage: PostextConfig = { parts: { page: false } };
    const planner = createBookPlanner();
    const book = [
      newChapter('front', 'Front', ':::toc\n:::', 1),
      newChapter('a', 'A', '# One\n\n:::part{number="I" title="Mud"}\n:::', 1),
      newChapter('empty', 'Empty', '', 1),
      newChapter('c', 'C', '# Two', 1),
    ];
    const layoutIn = (plan: ChapterPlan, over: Partial<ChapterLayout> & { pageCount: number }): ChapterLayout =>
      layoutFor(plan, { configKey: configKeyOf(noPage), ...over }, book);
    const p0 = planner.plan(book, noPage, resources, {});
    const front = layoutIn(p0.byId.front!, { pageCount: 2 });
    const p1 = planner.plan(book, noPage, resources, { front });
    const a = layoutIn(p1.byId.a!, { pageCount: 1, outlinePages: [{ index: 0, number: { delta: 0 }, format: 'decimal' }, null] });
    const p2 = planner.plan(book, noPage, resources, { front, a });
    // An empty chapter holds no content page: the row looks past it.
    const empty = layoutIn(p2.byId.empty!, { pageCount: 1, leadingBlankPages: 1, firstContentPageNumber: { delta: 0 } });
    const p3 = planner.plan(book, noPage, resources, { front, a, empty });
    const titles = (plan: ChapterPlan) => plan.outline!.map((e) => `${e.title}@${e.pageLabel ?? '?'}/${e.pageIndex ?? '?'}`);
    // Chapter c's pages are not known yet: the row waits.
    expect(titles(p3.byId.front!)).toEqual(['One@3/2', 'Mud@?/?', 'Two@?/?']);
    const c = layoutIn(p3.byId.c!, { pageCount: 2, leadingBlankPages: 1, firstContentPageNumber: { delta: 1 }, lastPageNumber: { delta: 1 }, outlinePages: [{ index: 1, number: { delta: 1 }, format: 'decimal' }] });
    const p4 = planner.plan(book, noPage, resources, { front, a, empty, c });
    expect(titles(p4.byId.front!)).toEqual(['One@3/2', 'Mud@6/5', 'Two@6/5']);
  });

  it('hands the part break a chapter closing on its part page owes to the next chapter', () => {
    const planner = createBookPlanner();
    const book = [
      newChapter('a', 'A', '# One', 1),
      newChapter('part', 'Part', ':::part{number="I" title="Mud"}\n:::', 1),
      newChapter('c', 'C', '# Two', 1),
      newChapter('d', 'D', '# Three', 1),
    ];
    const p0 = planner.plan(book, config, resources, {});
    expect(p0.byId.c!.continuation?.afterPartPage).toBe(true);
    expect(p0.byId.d!.continuation?.afterPartPage).toBeUndefined();
    // It can move the chapter's pages (`breakAfter.parity`): the record is
    // keyed on it. Chapters that follow no part keep the keys they had.
    const same = [book[0]!, { ...book[1]!, markdown: ':::part{number="I" title="Mud"}\n:::\n\nMore.' }, book[2]!, book[3]!];
    const p1 = planner.plan(same, config, resources, {});
    expect(p1.byId.c!.continuation?.afterPartPage).toBeUndefined();
    expect(p0.byId.c!.continuationKey).not.toBe(p1.byId.c!.continuationKey);
    expect(p0.byId.c!.continuationKey).toContain('after-part');
    expect(p1.byId.c!.continuationKey).not.toContain('after-part');
    expect(p0.byId.d!.continuationKey).not.toContain('after-part');
  });

  it('keys records on the resource set, not its order', () => {
    const planner = createBookPlanner();
    const p0 = planner.plan(chapters, config, resources, {});
    const a = layoutFor(p0.byId.a!, { pageCount: 3 });
    // Storage hands the resources back sorted by id; a preset applies them
    // in manifest order. Either way the record holds.
    const reversed = [...resources].reverse();
    expect(resourcesKeyOf(reversed)).toBe(resourcesKeyOf(resources));
    expect(planner.plan(chapters, config, reversed, { a }).byId.a!.layout).toBe(a);
    expect(resourcesKeyOf([resources[0]!])).not.toBe(resourcesKeyOf(resources));
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
  const plan = (paginated: boolean): ChapterPlan => ({ chapterId: 'b', index: 1, number: 2, continuation: undefined, paginated, continuationKey: 'k', outlineKey: '', layout: null, outlineStale: false });
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
  it('hands every chapter the book\'s page count once paginated, when the configuration prints it', () => {
    const counting: PostextConfig = {
      footer: {
        elements: [{
          kind: 'text', id: 'folio', content: '{pageNumber} / {bookTotalPages}', fontSize: { value: 8, unit: 'pt' }, overflow: 'wrap',
          placement: { anchor: { to: 'container', edge: 'top' }, size: { width: 'auto', height: 'auto' } },
        }],
      },
    };
    const record = (p: ChapterPlan, pageCount: number): ChapterLayout => ({ ...layoutFor(p, { pageCount }), configKey: configKeyOf(counting) });
    const book = createBookPlanner();
    const p0 = book.plan(chapters, counting, resources, {});
    const a = record(p0.byId.a!, 3);
    const p1 = book.plan(chapters, counting, resources, { a });
    const b = record(p1.byId.b!, 5);
    const p2 = book.plan(chapters, counting, resources, { a, b });
    // Not every chapter has pages yet: no count to hand out.
    expect(p2.chapters.map((c) => c.continuation?.bookPageCount)).toEqual([undefined, undefined, undefined]);
    const c = record(p2.byId.c!, 2);
    const p3 = book.plan(chapters, counting, resources, { a, b, c });
    expect(p3.chapters.map((ch) => ch.continuation?.bookPageCount)).toEqual([10, 10, 10]);
    // The first chapter inherits the count alone; the records stay current.
    expect(p3.byId.a!.continuation).toEqual({ bookPageCount: 10 });
    expect(p3.chapters.map((ch) => ch.layout)).toEqual([a, b, c]);
    expect(p3.byId.b!.continuationKey).toBe(p2.byId.b!.continuationKey);
    // A chapter growing two pages (the parity after it holds, so the
    // records do) changes every chapter's inputs.
    const p4 = book.plan(chapters, counting, resources, { a, b: { ...b, pageCount: 7, lastPageNumber: { delta: 6 } }, c });
    expect(p4.chapters.map((ch) => ch.continuation?.bookPageCount)).toEqual([12, 12, 12]);
    expect(sameLayoutInputs(p3.byId.a!, p4.byId.a!)).toBe(false);
    // A configuration that does not print it hands out nothing.
    const plain = planner.plan(chapters, config, resources, {
      a: layoutFor(p0.byId.a!, { pageCount: 3 }),
    });
    expect(plain.byId.a!.continuation).toBeUndefined();
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

describe('createBookPlanner counter cache', () => {
  it('re-counts only the edited chapter while what the next one inherits is unchanged', () => {
    const planner = createBookPlanner();
    const first = planner.plan(chapters, config, resources, {});
    const edited = chapters.map((c) => (c.id === 'a' ? { ...c, markdown: `${c.markdown}\n\nMore text, no new heading.` } : c));
    const second = planner.plan(edited, config, resources, {});
    // Chapter b inherits equal counters (a fresh object): its entry is a
    // cache hit, so chapter c inherits the very same object as before.
    expect(second.byId.b!.continuation?.headings).toEqual(first.byId.b!.continuation?.headings);
    expect(second.byId.c!.continuation?.headings).toBe(first.byId.c!.continuation?.headings);
    expect(second.byId.c!.continuation?.resourceNumbers).toBe(first.byId.c!.continuation?.resourceNumbers);
  });

  it('re-counts the chapters after an edit that moves the counters', () => {
    const planner = createBookPlanner();
    const first = planner.plan(chapters, config, resources, {});
    const edited = chapters.map((c) => (c.id === 'a' ? { ...c, markdown: `${c.markdown}\n\n# Extra` } : c));
    const second = planner.plan(edited, config, resources, {});
    expect(second.byId.b!.continuation?.headings?.h1).toBe(2);
    expect(second.byId.c!.continuation?.headings?.h1).toBe(3);
    expect(second.byId.c!.continuation?.headings).not.toBe(first.byId.c!.continuation?.headings);
  });
});

describe('createBookPlanner: the index', () => {
  const book = (mark: string) => [
    newChapter('front', 'Front', '# Contents {style="front"}\n\n:::toc', 1),
    newChapter('a', 'A', `# One\n\nThe :index[heart] beats.${mark}`, 1),
    newChapter('ix', 'Index', '# Index {style="front"}\n\n:::index', 1),
  ];
  const cfg: PostextConfig = { headingStyles: [{ id: 'front', numbered: false }] };

  it('hands the index chapter the marks and the contents the headings', () => {
    const plan = createBookPlanner().plan(book(''), cfg, resources, {});
    expect(plan.byId.ix!.outline!.map((e) => e.kind)).toEqual(['indexMark']);
    expect(plan.byId.front!.outline!.every((e) => e.kind !== 'indexMark')).toBe(true);
    expect(plan.byId.a!.outline).toBeUndefined();
  });

  it('moves the index key, not the contents key, when only a mark changes', () => {
    const planner = createBookPlanner();
    const before = planner.plan(book(''), cfg, resources, {});
    const after = planner.plan(book(' :index{term="Pulse"}'), cfg, resources, {});
    expect(after.byId.front!.outlineKey).toBe(before.byId.front!.outlineKey);
    expect(after.byId.ix!.outlineKey).not.toBe(before.byId.ix!.outlineKey);
  });
});
