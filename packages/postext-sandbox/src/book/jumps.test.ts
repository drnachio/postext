import { beforeAll, describe, expect, it } from 'vitest';
import { buildDocument, createMeasurementCache, resolveDebugConfig } from 'postext';
import type { PostextConfig, PostextContent, Resource, VDTDocument } from 'postext';
import { layOutBookChain } from './chain.js';
import { newChapter } from './chapterOps.js';
import { buildBookChapters } from './buildBook.js';
import { chapterLayoutFromDoc, createBookPlanner } from './pagination.js';
import { planContent } from './jumps.js';
import { buildBundle } from 'postext/bundle';
import { applyTarget } from '../selection/applySelection.js';
import { pickAt, selectionAtSource } from '../selection/pageSelection.js';
import { selectionTarget } from '../selection/selectionTargets.js';
import { setSelectionChapters } from '../selection/selectionStore.js';
import { findCaretBlockIdx, findCarriedCaretBlockIdx } from '../viewport/canvas/CanvasPreview/caret.js';
import { drawOverlay } from '../viewport/canvas/CanvasPreview/overlay.js';
import type { BookPlan, Chapter, ChapterLayout, ChapterPlan } from './types.js';

// #943: a story that jumps from one chapter file into a page of a later
// one, in the book layout. The chapter that sends it records the rest
// (`ChapterLayout.jumps`); the chapter that has the page is planned with it
// (`continuation.jumps`, in its key), and the chapters laid out in a chain
// hand it over as they are built.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

type Fixture = (locale: 'es' | 'en') => { markdown: string; config: PostextConfig; resources: Resource[] };
let config: PostextConfig;
let resources: Resource[];
beforeAll(async () => {
  const { page8Fixture } = (await import(/* @vite-ignore */ new URL('../../../postext/src/__tests__/composed/fixtures/page8.ts', import.meta.url).href)) as { page8Fixture: Fixture };
  const fixture = page8Fixture('es');
  const mm = (value: number) => ({ value, unit: 'mm' as const });
  const top = { anchor: { to: 'container' as const, edge: 'top-left' as const } };
  resources = fixture.resources;
  config = {
    ...fixture.config,
    pageTemplates: [
      { id: 'articulo', header: false, frames: [{ name: 'cuerpo', style: 'caja-azul', flow: true, width: mm(186), height: mm(90), placement: top, overflow: { continueIn: 'page:{attr.sigue}', mark: 'Sigue en la página {page}', fromMark: 'Viene de la página {page}' }, fit: { shrinkText: false } }] },
      { id: 'salto', header: false, frames: [{ name: 'breve', flow: true, width: mm(186), height: mm(40), placement: top }, { name: 'resto', style: 'caja-azul', width: mm(186), placement: { anchor: { to: '#breve', edge: 'below' }, offset: { y: mm(10) } } }] },
    ],
  };
});

const para = (word: string, n: number): string => Array.from({ length: n }, (_, i) => `${word}${i}`).join(' ');
const article = (words = 900): string => `::::page{template="articulo" sigue="p-salto"}\n${para('art', words)}\n::::\n`;
const book = (words = 900): Chapter[] => [
  newChapter('a', 'Artículo', article(words), 1),
  newChapter('b', 'Otro', '# Otro capítulo\n\nTexto del otro capítulo.\n', 1),
  newChapter('c', 'Salto', `::::page{template="salto" id="p-salto"}\n${para('breve', 60)}\n::::\n`, 1),
];

const content = (chapters: readonly Chapter[], plan: ChapterPlan): PostextContent => ({
  markdown: chapters.find((c) => c.id === plan.chapterId)!.markdown,
  resources,
  ...(plan.continuation ? { continuation: plan.continuation } : {}),
  ...planContent(plan),
});

/** Lay the book out as the paginator does: the chapter pending, record it, plan again. */
function paginate(chapters: Chapter[], layouts: Record<string, ChapterLayout> = {}): { plan: BookPlan; docs: Map<string, VDTDocument> } {
  const planner = createBookPlanner();
  const docs = new Map<string, VDTDocument>();
  const cache = createMeasurementCache();
  for (let guard = 0; guard < 20; guard++) {
    const plan = planner.plan(chapters, config, resources, layouts);
    if (plan.pendingChapterId === null) return { plan, docs };
    const chapterPlan = plan.byId[plan.pendingChapterId]!;
    const doc = buildDocument(content(chapters, chapterPlan), config, cache);
    docs.set(chapterPlan.chapterId, doc);
    const layout = chapterLayoutFromDoc(doc, chapterPlan, { markdown: chapters.find((c) => c.id === chapterPlan.chapterId)!.markdown, config, resources });
    if (!layout) throw new Error('not paginated');
    layouts[chapterPlan.chapterId] = layout;
  }
  throw new Error('the plan did not settle');
}

describe('a story that jumps to a later chapter, in the book plan (#943)', () => {
  it('the chapter that sends it knows the ids after it, and records the rest', () => {
    const chapters = book();
    const planner = createBookPlanner();
    const first = planner.plan(chapters, config, resources, {});
    expect(first.byId.a!.laterPageIds).toEqual({ 'p-salto': 2 });
    // A chapter with no composed page sends nothing.
    expect(first.byId.b!.laterPageIds).toBeUndefined();
    expect(first.byId.c!.laterPageIds).toBeUndefined();
    const { plan, docs } = paginate(chapters);
    expect(docs.get('a')!.pendingJumps).toHaveLength(1);
    expect(plan.byId.a!.layout!.jumps).toHaveLength(1);
    expect(plan.byId.a!.layout!.jumpsKey).toBeTruthy();
    expect(plan.byId.b!.layout!.jumps).toBeUndefined();
  });

  it('the chapter that has the page is planned with the rest, and its key says so', () => {
    const chapters = book();
    const planner = createBookPlanner();
    const layouts: Record<string, ChapterLayout> = {};
    const before = planner.plan(chapters, config, resources, layouts).byId.c!;
    expect(before.continuation?.jumps).toBeUndefined();
    const { plan } = paginate(chapters, layouts);
    const c = plan.byId.c!;
    expect(c.continuation?.jumps).toHaveLength(1);
    expect(c.continuation!.jumps![0]).toMatchObject({ target: 'p-salto', chapter: 0, fromChapter: 0 });
    expect(c.continuationKey).not.toBe(before.continuationKey);
    expect(c.layout).not.toBeNull();
  });

  it('editing the article lays the chapter with the page out again; editing the one between does not', () => {
    const layouts: Record<string, ChapterLayout> = {};
    const chapters = book();
    paginate(chapters, layouts);
    const planner = createBookPlanner();
    const keyOf = (cs: Chapter[], id: string) => planner.plan(cs, config, resources, layouts).byId[id]!;
    expect(keyOf(chapters, 'c').layout).not.toBeNull();
    // More words in the article: another rest, another record of the chapter with the page.
    const edited = book(1200);
    const afterEdit = planner.plan(edited, config, resources, layouts);
    expect(afterEdit.pendingChapterId).toBe('a');
    const again = paginate(edited, { ...layouts });
    expect(again.plan.byId.c!.continuationKey).not.toBe(keyOf(chapters, 'c').continuationKey);
    // A word in the chapter between lays that chapter out again, and the
    // chapter with the page stays as it was.
    const between = chapters.map((c) => (c.id === 'b' ? { ...c, markdown: `${c.markdown}\nUna palabra más.\n` } : c));
    const settled = paginate(between, { ...layouts });
    expect([...settled.docs.keys()]).toEqual(['b']);
  });

  it('a chapter that receives a story referring to anchors gets the book\'s outline', () => {
    const refs = [
      newChapter('a', 'Artículo', `::::page{template="articulo" sigue="p-salto"}\n${para('art', 900)}\n\nVer :ref{id="anc"} y [el ancla]{#anc}.\n::::\n`, 1),
      ...book().slice(1),
    ];
    const { plan } = paginate(refs);
    expect(plan.byId.c!.continuation?.jumps?.[0]?.outline).toBe(true);
    expect(plan.byId.c!.outline).toBeDefined();
    expect(paginate(book()).plan.byId.c!.outline).toBeUndefined();
  });

  it('the index and the contents list what is written in the rest where the rest is laid (#988)', () => {
    const marked = [
      newChapter('a', 'Artículo', `::::page{template="articulo" sigue="p-salto"}\n${para('art', 5)} :index[Temprano] ${para('mid', 880)} :index[Tardío] :anchor{#tardia}\n\n# Tarde {#tarde}\n\n${para('fin', 30)}\n::::\n`, 1),
      ...book().slice(1),
      newChapter('d', 'Índice', '# Indice\n\n:::index\n\n# Contenido\n\n:::toc\n\nVer :ref{#tardia}.\n', 1),
    ];
    const { plan, docs } = paginate(marked);
    const c = plan.byId.c!.layout!;
    // The chapter that has the page records where the carried marks landed.
    expect(c.carriedOutline?.map((e) => [e.chapter, e.kind, e.page.index]).sort()).toEqual([[0, 'anchor', 0], [0, 'heading', 0], [0, 'indexMark', 0]]);
    expect(plan.byId.a!.layout!.carriedOutline).toBeUndefined();
    const outline = plan.byId.d!.outline!;
    const label = (title: string): string | undefined => outline.find((e) => e.title === title)?.pageLabel;
    // The page of the chapter with the story's rest: the third chapter.
    const rest = docs.get('c')!.pages[0]!.pageLabel;
    expect(label('Tardío')).toBe(rest);
    expect(label('Tarde')).toBe(rest);
    expect(label('Temprano')).toBe('1');
  });

  it('a book without such stories keeps the keys it had', () => {
    const plain = [newChapter('a', 'A', '# A\n\ntexto\n', 1), newChapter('b', 'B', '# B\n\ntexto\n', 1)];
    const planner = createBookPlanner();
    const plan = planner.plan(plain, { ...config, pageTemplates: undefined }, resources, {});
    expect(plan.byId.b!.continuationKey).not.toContain('|j');
    expect(plan.byId.b!.continuationKey).not.toContain('|l');
    expect(plan.byId.a!.laterPageIds).toBeUndefined();
  });
});

describe('the chain hands the rest over as the chapters are built (#943)', () => {
  it('lays the rest in the chapter that has the page, with the printed page numbers in the marks', async () => {
    const chapters = book();
    const { plan } = paginate(chapters);
    const seen: (number | undefined)[] = [];
    const docs = await layOutBookChain(
      plan.chapters,
      async (chapterPlan, continuation) => {
        seen.push(continuation?.jumps?.length);
        return buildDocument(content(chapters, { ...chapterPlan, continuation }), config, createMeasurementCache());
      },
      false,
    );
    expect(seen).toEqual([undefined, undefined, 1]);
    const last = docs[2]!;
    const resto = last.pages.flatMap((p) => p.composed?.frames ?? []).find((f) => f.name === 'resto')!;
    expect(resto.continuedFromChapter).toBe(0);
    const firstPage = docs[0]!.pages[0]!;
    const mark = (page: typeof firstPage): string[] =>
      (page.floats ?? []).filter((b) => b.type === 'callout').flatMap((b) => (b.designOverlay?.blocks ?? []).flatMap((d) => (d.kind === 'text' ? [d.lines.map((l) => l.text).join(' ')] : [])));
    expect(mark(firstPage)).toContain(`Sigue en la página ${last.pages[0]!.pageLabel}`);
  });

  it('buildBookChapters (the canvas) does the same and records the chapters', async () => {
    const chapters = book();
    const { plan } = paginate(chapters);
    const cache = createMeasurementCache();
    const result = await buildBookChapters({
      chapters,
      plan,
      config,
      rawConfig: config,
      resources,
      held: new Map(),
      build: async (c, cfg) => buildDocument(c, cfg, cache),
      cancelled: () => false,
    });
    expect(result).not.toBeNull();
    const docs = result!.built.map((b) => b.doc);
    const resto = docs[2]!.pages.flatMap((p) => p.composed?.frames ?? []).find((f) => f.name === 'resto')!;
    expect(resto.continuedFromChapter).toBe(0);
    expect(resto.sourceChapter).toBe(0);
    // The records of a book as it stands keep the rest of the article.
    expect(result!.records.find((r) => r.chapterId === 'a')!.jumps).toHaveLength(1);
  });
});

describe('the text carried to a page of a later chapter belongs to its own chapter in the editor (#943)', () => {
  const chapters = book();
  let doc: VDTDocument;
  let page: VDTDocument['pages'][number];
  let block: VDTDocument['blocks'][number];
  let x: number;
  let y: number;
  beforeAll(() => {
    const docs = buildBundle({ chapters, config, resources }, { cache: createMeasurementCache() });
    doc = docs[2]!;
    page = doc.pages.find((p) => p.composed?.template === 'salto')!;
    const frame = page.composed!.frames.find((f) => f.name === 'resto')!;
    block = page.floats!.find((b) => b.id === frame.blockIds[1])!;
    const line = block.lines[0]!;
    x = block.bbox.x + 4;
    y = line.bbox.y + line.bbox.height / 2;
  });

  it('a click on it leads to the sending chapter\'s Markdown', () => {
    const sel = pickAt(doc, page.index, x, y, null, { chapterFile: (c) => chapters[c]!.id })!;
    const target = selectionTarget(doc, sel, 'content');
    expect(target).toMatchObject({ kind: 'caret', chapter: 0 });
    const dispatched: unknown[] = [];
    setSelectionChapters(() => chapters);
    const ok = applyTarget(target, sel, doc, {
      dispatch: () => ((a: unknown) => { dispatched.push(a); }) as never,
      activePanel: () => 'markdown',
      sourceOfPage: () => null,
    });
    expect(ok).toBe(true);
    const focus = dispatched.find((a) => (a as { type: string }).type === 'SET_PENDING_EDITOR_FOCUS') as { payload: { chapterId: string; anchor: number } };
    expect(focus.payload.chapterId).toBe('a');
    // An offset in the article's file: the word the click is on.
    const word = chapters[0]!.markdown.slice(focus.payload.anchor, focus.payload.anchor + 3);
    expect(word).toBe('art');
    setSelectionChapters(null);
  });

  it('the caret of the chapter that holds it finds it on the later chapter\'s page', () => {
    // The caret in the chapter being edited, at the start of the rest.
    const at = block.sourceStart! + 1;
    expect(selectionAtSource(doc, at, undefined)).toBeNull();
    const found = selectionAtSource(doc, at, { chapter: 0 });
    expect(found?.pageIndex).toBe(page.index);
    // And the later chapter's own caret does not take it.
    expect(findCaretBlockIdx(doc, at)).not.toBe(doc.blocks.indexOf(doc.blocks.find((b) => b.id === block.id)!));
  });
});

describe('the editor selection of the sending chapter over the carried words (#988)', () => {
  // A stand-in for the SVG overlay: the groups, and the rects put in them.
  class FakeEl {
    attrs = new Map<string, string>();
    children: FakeEl[] = [];
    style: Record<string, string> = {};
    firstElementChild: FakeEl | null = null;
    constructor(public tag: string) {}
    setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
    removeAttribute(k: string): void { this.attrs.delete(k); }
    appendChild(c: FakeEl): FakeEl { this.children.push(c); this.firstElementChild ??= c; return c; }
    removeChild(c: FakeEl): void { this.children = this.children.filter((x) => x !== c); this.firstElementChild = this.children[0] ?? null; }
    get firstChild(): FakeEl | null { return this.children[0] ?? null; }
  }
  const overlay = (): { svg: SVGSVGElement; selection: FakeEl; cursor: FakeEl } => {
    const selection = new FakeEl('g');
    const cursor = new FakeEl('g');
    const caret = new FakeEl('rect');
    cursor.appendChild(caret);
    const loose = new FakeEl('g');
    const svg = { querySelector: (q: string) => (q.includes('selection') ? selection : q.includes('cursor') ? cursor : q.includes('looseLines') ? loose : null) };
    return { svg: svg as unknown as SVGSVGElement, selection, cursor };
  };
  const debug = resolveDebugConfig(undefined);
  let doc: VDTDocument;
  let page: VDTDocument['pages'][number];
  let carriedBlock: VDTDocument['blocks'][number];
  let range: { from: number; to: number; head: number };
  beforeAll(() => {
    const docs = buildBundle({ chapters: book(), config, resources }, { cache: createMeasurementCache() });
    doc = docs[2]!;
    page = doc.pages.find((p) => p.composed?.template === 'salto')!;
    carriedBlock = doc.blocks.find((b) => b.pageIndex === page.index && b.sourceChapter === 0 && b.lines.length > 0)!;
    range = { from: carriedBlock.sourceStart!, to: carriedBlock.sourceStart! + 9, head: carriedBlock.sourceStart! + 9 };
  });

  it('paints the words of the story that the sending chapter\'s selection covers', () => {
    (globalThis as unknown as { document: unknown }).document = { createElementNS: (_ns: string, tag: string) => new FakeEl(tag) };
    try {
      const { svg, selection } = overlay();
      drawOverlay(svg, doc, page.index, range, debug, true, -1, null, { chapter: 0, only: true });
      expect(selection.children.length).toBeGreaterThan(0);
      for (const r of selection.children) expect(Number(r.attrs.get('width'))).toBeGreaterThan(0);
      // Another chapter's selection, and a selection with no chapter to claim the
      // words, leave them alone.
      const other = overlay();
      drawOverlay(other.svg, doc, page.index, range, debug, true, -1, null, { chapter: 1, only: true });
      expect(other.selection.children).toHaveLength(0);
      const own = overlay();
      drawOverlay(own.svg, doc, page.index, range, debug, true, -1, null);
      expect(own.selection.children).toHaveLength(0);
    } finally {
      delete (globalThis as unknown as { document?: unknown }).document;
    }
  });

  it('puts the caret on the carried block that holds it', () => {
    (globalThis as unknown as { document: unknown }).document = { createElementNS: (_ns: string, tag: string) => new FakeEl(tag) };
    try {
      const at = carriedBlock.sourceStart! + 2;
      const idx = findCarriedCaretBlockIdx(doc, at, 0, page.index);
      expect(doc.blocks[idx]!.id).toBe(carriedBlock.id);
      expect(findCarriedCaretBlockIdx(doc, at, 1, page.index)).toBe(-1);
      const { svg, cursor } = overlay();
      const rect = drawOverlay(svg, doc, page.index, { from: at, to: at, head: at }, debug, true, idx, null, { chapter: 0, only: true });
      expect(rect).not.toBeNull();
      expect(cursor.firstElementChild!.style.visibility).toBe('');
    } finally {
      delete (globalThis as unknown as { document?: unknown }).document;
    }
  });
});
