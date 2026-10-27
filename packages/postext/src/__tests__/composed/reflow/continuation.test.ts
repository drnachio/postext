import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { formatWarning } from '../../../pipeline/contentWarnings.js';
import { defaultTableContinuationStrings } from '../../../defaults/index.js';
import { composedReflowLog, describeReflowEvent } from '../../../composed/reflowLog.js';
import { clearComposedPageMemo, composedPageMemoStats, setComposedPageMemo } from '../../../composed/pageMemo.js';
import { assignReceivers, continuationTarget, MAX_CONTINUATION_PAGES } from '../../../composed/continuation.js';
import { findElement } from '../../../composed/sourceMap.js';
import type { FrameConfig, PageTemplate } from '../../../composed/types.js';
import type { ContentWarning, PostextConfig, VDTBlock, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';
import { page8Fixture } from '../fixtures/page8.js';

// #859: content that no longer fits a frame goes on on pages added after
// the composed page, built from the page's overflow template (or the same
// template with only that frame filled, or a template named for it), with
// a continuation mark at the end of the cut piece.

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const DPI = 300;
const MM = DPI / 25.4;

type Locale = 'es' | 'en';

/** The page an overflowing box of the stand-in goes on on: the stand-in's
 *  background and white card, and a box of the same style down the card. */
const SIGUE: PageTemplate = {
  id: 'tema-sigue',
  header: false,
  decoration: {
    elements: [
      { kind: 'image', id: 'fondo', resourceId: '{attr.fondo}', decorative: true, placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill', height: 'fill' } } },
      { kind: 'box', id: 'tarjeta', placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(-6), y: mm(-4) }, size: { width: mm(198), height: mm(250) } }, style: { backgroundColor: { hex: '#ffffff', model: 'hex' }, borderRadius: mm(4) } },
    ],
  } as never,
  frames: [{ name: 'dinero', style: 'caja-azul', width: mm(186), placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(8) } } }],
};

/** The stand-in (#855) with its frames patched, its template's fields
 *  patched, its Markdown changed and other templates after its own. */
function standIn(opts: {
  locale?: Locale;
  configLocale?: string;
  frames?: Record<string, Partial<FrameConfig>>;
  template?: Partial<PageTemplate>;
  markdown?: (md: string) => string;
  more?: PageTemplate[];
  config?: Partial<PostextConfig>;
} = {}): { markdown: string; config: PostextConfig; resources: ReturnType<typeof page8Fixture>['resources'] } {
  const { markdown, config, resources } = page8Fixture(opts.locale ?? 'es');
  const base = config.pageTemplates![0]! as PageTemplate;
  const patch = opts.frames ?? {};
  const tpl: PageTemplate = {
    ...base,
    ...opts.template,
    frames: base.frames!.map((f) => (patch[f.name] ? { ...f, ...patch[f.name] } : f)),
  };
  return {
    markdown: (opts.markdown ?? ((m) => m))(markdown),
    config: { ...config, ...opts.config, ...(opts.configLocale ? { locale: opts.configLocale } : {}), pageTemplates: [tpl, ...(opts.more ?? [])] },
    resources,
  };
}
const build = (f: ReturnType<typeof standIn>): VDTDocument => buildDocument({ markdown: f.markdown, resources: f.resources }, f.config, createMeasurementCache());

/** The first box's text twice over. */
const doubled = (md: string): string => md.replace(/(:::frame\{slot="dinero"[^\n]*\n)([\s\S]*?)(\n:::\n)/, (_, open: string, body: string, close: string) => `${open}${body}\n\n${body}${close}`);
/** `n` long paragraphs at the head of the first box. */
const moreMoney = (n: number) => (md: string): string =>
  md.replace(/(:::frame\{slot="dinero"[^\n]*\n)/, `$1${Array.from({ length: n }, (_, i) => `Más dinero ${i} `.repeat(30).trim()).join('\n\n')}\n\n`);

/** The first box drawn round its text as written: no minimum, a maximum
 *  of the height that text takes (whole mm). */
const TIGHT_MM = (() => {
  const doc = build(standIn({ frames: { dinero: { minHeight: undefined } } }));
  return Math.ceil(doc.pages[0]!.composed!.frames.find((f) => f.name === 'dinero')!.rect.height / MM);
})();
/** The box held to that drawing, with room for its mark (6 mm), and sent
 *  on to the next page. */
const BOX_MM = TIGHT_MM + 6;
const capped = (overflow: FrameConfig['overflow'] = { continueIn: 'next-page' }): Record<string, Partial<FrameConfig>> => ({ dinero: { minHeight: undefined, maxHeight: mm(BOX_MM), overflow } });

const composedPages = (doc: VDTDocument): VDTPage[] => doc.pages.filter((p) => p.composed);
const frameOn = (page: VDTPage, name: string): VDTFrame => page.composed!.frames.find((f) => f.name === name)!;
const blocksOf = (page: VDTPage, f: VDTFrame): VDTBlock[] => f.blockIds.map((id) => page.floats!.find((b) => b.id === id)!);
const textOf = (blocks: readonly VDTBlock[]): string => blocks.filter((b) => b.type !== 'callout').flatMap((b) => b.lines.map((l) => l.text)).join(' ');
/** The words a box draws itself (its tab, its mark). */
const overlayOf = (box: VDTBlock): string[] =>
  (box.designOverlay?.blocks ?? []).flatMap((d) => (d.kind === 'text' ? [d.lines.map((l) => l.text).join(' ')] : []));
const warningsOf = (doc: VDTDocument): ContentWarning[] => (doc.contentWarnings ?? []).filter((w) => w.kind === 'frameOverflow' || w.kind === 'frameContinuationLimit');
/** The box's words, in reading order across the pages. */
const allText = (doc: VDTDocument, slot = 'dinero'): string =>
  composedPages(doc).flatMap((p) => p.composed!.frames.filter((f) => f.id === `cp0:${slot}` || f.id.startsWith(`cp0:${slot}~`)).map((f) => textOf(blocksOf(p, f)))).join(' ');
const count = (s: string, word: string): number => s.split(word).length - 1;

describe('a box whose text doubles goes on on a page of the overflow template (#859, done when)', () => {
  const doc = build(standIn({ frames: capped(), template: { overflowTemplate: 'tema-sigue' }, more: [SIGUE], markdown: doubled }));
  const [first, added] = composedPages(doc) as [VDTPage, VDTPage];

  it('adds one page, built from the overflow template, right after the composed page', () => {
    expect(composedPages(doc)).toHaveLength(2);
    expect(first.composed!.template).toBe('tema-cajas');
    expect(added.index).toBe(first.index + 1);
    expect(added.composed!.template).toBe('tema-sigue');
    expect(added.composed!.continuationOf).toBe(first.index);
    expect(added.role).toBe('composed');
    // The fence's attributes still feed the decoration.
    expect(added.composed!.attrs.fondo).toBe('banda-tema');
    expect(added.composed!.decoration?.blocks.length).toBeGreaterThan(0);
  });

  it('ends the cut piece with the localized mark, and raises no warning', () => {
    expect(warningsOf(doc)).toEqual([]);
    const box = blocksOf(first, frameOn(first, 'dinero'))[0]!;
    expect(overlayOf(box)).toContain('Continúa');
    expect(frameOn(first, 'dinero').overflowPx).toBe(0);
    expect(frameOn(first, 'dinero').rect.height).toBeLessThanOrEqual(BOX_MM * MM + 0.01);
    // The piece on the added page closes the box: no mark, and no tab.
    const rest = blocksOf(added, frameOn(added, 'dinero'))[0]!;
    expect(overlayOf(rest)).toEqual([]);
  });

  it('resumes the text where it was cut: every word once, in order', () => {
    const md = standIn({ markdown: doubled }).markdown;
    const words = ['efectivo', 'tarjetas', 'transferencia', 'valor'];
    for (const w of words) expect(count(allText(doc), w)).toBe(count(md.slice(md.indexOf('slot="dinero"'), md.indexOf('slot="dinero-fotos"')), w));
    expect(textOf(blocksOf(first, frameOn(first, 'dinero')))).toMatch(/^El dinero nos deja/);
  });

  it('links the two pieces and logs where the box went on', () => {
    const from = frameOn(first, 'dinero');
    const to = frameOn(added, 'dinero');
    expect(from.id).toBe('cp0:dinero');
    expect(to.id).toBe('cp0:dinero~1');
    expect(from.continuesTo).toBe('cp0:dinero~1');
    expect(to.continuedFrom).toBe('cp0:dinero');
    expect(first.composed!.log).toContainEqual({ frame: 'dinero', kind: 'continued', toPage: added.index, toFrame: 'cp0:dinero~1' });
    expect(composedReflowLog(doc)[0]!.lines).toContain(`dinero continued on page ${added.pageLabel ?? 2}`);
    // The pieces are one box: the story's container, the head's block ids.
    const head = blocksOf(first, from)[0]!;
    const rest = blocksOf(added, to)[0]!;
    expect(rest.containerId).toBe(head.containerId);
    expect(rest.id).toMatch(/^cp0:dinero-cont-\d+$/);
    // The source map finds the piece by its stable id.
    expect(findElement(doc, 'cp0:dinero~1')).toMatchObject({ pageIndex: added.index, element: { level: 'frame', id: 'cp0:dinero~1' } });
  });

  it('keeps the rest of the book: content after the fence starts on a new page after the added one', () => {
    const md = standIn({ markdown: (m) => `${doubled(m)}\nAfter the page.\n` });
    const after = build({ ...md, config: { ...md.config, pageTemplates: [{ ...(md.config.pageTemplates![0] as PageTemplate), overflowTemplate: 'tema-sigue', frames: (md.config.pageTemplates![0] as PageTemplate).frames!.map((f) => (f.name === 'dinero' ? { ...f, ...capped().dinero } : f)) }, SIGUE] } });
    const pages = composedPages(after);
    expect(pages).toHaveLength(2);
    const flow = after.pages.find((p) => p.columns.some((c) => c.blocks.some((b) => b.lines.some((l) => l.text.includes('After')))));
    expect(flow!.index).toBe(pages[1]!.index + 1);
  });
});

describe('next-page without an overflow template (#859)', () => {
  const doc = build(standIn({ frames: capped(), markdown: doubled }));
  const [first, added] = composedPages(doc) as [VDTPage, VDTPage];

  it('lays the same template again with only that frame filled; the others take no room', () => {
    expect(added.composed!.template).toBe('tema-cajas');
    const filled = added.composed!.frames.filter((f) => f.blockIds.length > 0).map((f) => f.id);
    expect(filled).toEqual(['cp0:dinero~1']);
    for (const f of added.composed!.frames) if (f.name !== 'dinero') expect(f.rect.height).toBeCloseTo(0, 6);
    // The box keeps its width and starts near the card's top, not where
    // the title and the running text pushed it on the first page.
    expect(frameOn(added, 'dinero').rect.width).toBeCloseTo(frameOn(first, 'dinero').rect.width, 6);
    expect(frameOn(added, 'dinero').rect.y).toBeLessThan(frameOn(first, 'dinero').rect.y);
    expect(warningsOf(doc)).toEqual([]);
  });
});

describe("'template:<id>' (#859)", () => {
  it('goes on on a page of that template, in its frame of the same name', () => {
    const doc = build(standIn({ frames: capped({ continueIn: 'template:tema-sigue' }), more: [SIGUE], markdown: doubled }));
    const pages = composedPages(doc);
    expect(pages.map((p) => p.composed!.template)).toEqual(['tema-cajas', 'tema-sigue']);
    expect(frameOn(pages[1]!, 'dinero').blockIds.length).toBeGreaterThan(0);
    expect(warningsOf(doc)).toEqual([]);
  });

  it("goes on in the template's flow frame when it has no frame of that name", () => {
    const other: PageTemplate = { id: 'notas', frames: [{ name: 'foto', width: mm(40), height: mm(30), optional: true }, { name: 'cuerpo', flow: true }] };
    const doc = build(standIn({ frames: capped({ continueIn: 'template:notas' }), more: [other], markdown: doubled }));
    const added = composedPages(doc)[1]!;
    expect(frameOn(added, 'cuerpo').id).toBe('cp0:dinero~1');
    expect(frameOn(added, 'cuerpo').blockIds.length).toBeGreaterThan(0);
    expect(frameOn(added, 'foto').blockIds).toEqual([]);
  });

  it('several frames that go on to one template share one added page', () => {
    const both: PageTemplate = { ...SIGUE, id: 'dos', frames: [...SIGUE.frames!, { name: 'gasto', style: 'caja-verde', width: mm(186), placement: { anchor: { to: '#dinero', edge: 'below' }, offset: { y: mm(10) } } }] };
    const doc = build(standIn({
      frames: { ...capped({ continueIn: 'template:dos' }), gasto: { minHeight: undefined, maxHeight: mm(30), overflow: { continueIn: 'template:dos' } } },
      more: [both],
      markdown: (m) => doubled(m).replace(/(:::frame\{slot="gasto"[^\n]*\n)([\s\S]*?)(\n:::\n)/, (_, o: string, b: string, c: string) => `${o}${b}\n\n${b}${c}`),
    }));
    const pages = composedPages(doc);
    expect(pages).toHaveLength(2);
    expect(frameOn(pages[1]!, 'dinero').id).toBe('cp0:dinero~1');
    expect(frameOn(pages[1]!, 'gasto').id).toBe('cp0:gasto~1');
    expect(pages[0]!.composed!.log.filter((e) => e.kind === 'continued').map((e) => e.frame)).toEqual(['dinero', 'gasto']);
    expect(warningsOf(doc)).toEqual([]);
  });
});

describe('a continuation that goes on again (#859)', () => {
  // A fixed 36 mm box, four long paragraphs more: three pages of it.
  const doc = build(standIn({ frames: { dinero: { height: mm(36), minHeight: undefined, overflow: { continueIn: 'next-page' } } }, markdown: moreMoney(4) }));

  it('adds a chain of pages, each piece linked to the next', () => {
    const pages = composedPages(doc);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    const ids = pages.map((p) => frameOn(p, 'dinero').id);
    expect(ids).toEqual(['cp0:dinero', ...pages.slice(1).map((_, k) => `cp0:dinero~${k + 1}`)]);
    for (let k = 0; k < pages.length - 1; k++) {
      expect(frameOn(pages[k]!, 'dinero').continuesTo).toBe(ids[k + 1]);
      expect(frameOn(pages[k + 1]!, 'dinero').continuedFrom).toBe(ids[k]);
      expect(pages[k + 1]!.index).toBe(pages[k]!.index + 1);
      expect(pages[k + 1]!.composed!.continuationOf).toBe(pages[0]!.index);
    }
    expect(frameOn(pages[pages.length - 1]!, 'dinero').continuesTo).toBeUndefined();
    expect(warningsOf(doc)).toEqual([]);
    for (let i = 0; i < 4; i++) expect(count(allText(doc), `dinero ${i}`)).toBe(30);
  });

  it(`stops after ${MAX_CONTINUATION_PAGES} added pages and says so`, () => {
    const huge = build(standIn({ frames: { dinero: { height: mm(30), minHeight: undefined, overflow: { continueIn: 'next-page' } } }, markdown: moreMoney(40) }));
    const pages = composedPages(huge);
    expect(pages).toHaveLength(1 + MAX_CONTINUATION_PAGES);
    const ws = warningsOf(huge);
    expect(ws).toHaveLength(1);
    expect(ws[0]).toMatchObject({ kind: 'frameContinuationLimit', template: 'tema-cajas', frame: 'dinero', pages: MAX_CONTINUATION_PAGES, pageIndex: pages[pages.length - 1]!.index });
    expect(formatWarning(ws[0]!)).toContain(`went on to ${MAX_CONTINUATION_PAGES} added pages`);
  });

  it('a frame on the added page that takes none of it warns instead of adding pages for ever', () => {
    const tiny: PageTemplate = { id: 'diminuta', frames: [{ name: 'dinero', style: 'caja-azul', width: mm(186), height: mm(4) }] };
    const doc2 = build(standIn({ frames: capped({ continueIn: 'template:diminuta' }), more: [tiny], markdown: doubled }));
    const pages = composedPages(doc2);
    expect(pages).toHaveLength(2);
    const ws = warningsOf(doc2);
    expect(ws.map((w) => w.kind)).toEqual(['frameOverflow']);
    expect(ws[0]).toMatchObject({ template: 'diminuta', frame: 'dinero', pageIndex: pages[1]!.index });
    expect((ws[0] as Extract<ContentWarning, { kind: 'frameOverflow' }>).stepsTried).toContain('continue');
  });
});

describe('continuation marks (#859)', () => {
  const LOCALES = ['en', 'es', 'ca', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ar'] as const;
  for (const locale of LOCALES) {
    it(`unset: the document's words for "continued" (${locale})`, () => {
      const doc = build(standIn({ frames: capped(), markdown: doubled, configLocale: locale }));
      const first = composedPages(doc)[0]!;
      const box = blocksOf(first, frameOn(first, 'dinero'))[0]!;
      const words = defaultTableContinuationStrings(locale).continuesMarker;
      expect(words.length).toBeGreaterThan(0);
      expect(overlayOf(box)).toContain(words);
    });
  }

  it('a string of its own', () => {
    const doc = build(standIn({ frames: capped({ continueIn: 'next-page', mark: 'sigue en la página siguiente' }), markdown: doubled }));
    const first = composedPages(doc)[0]!;
    expect(overlayOf(blocksOf(first, frameOn(first, 'dinero'))[0]!)).toContain('sigue en la página siguiente');
  });

  it('false: no mark, and the piece holds more', () => {
    const marked = build(standIn({ frames: capped(), markdown: doubled }));
    const bare = build(standIn({ frames: capped({ continueIn: 'next-page', mark: false }), markdown: doubled }));
    const m = composedPages(marked)[0]!;
    const b = composedPages(bare)[0]!;
    expect(overlayOf(blocksOf(b, frameOn(b, 'dinero'))[0]!)).not.toContain('Continúa');
    expect(textOf(blocksOf(b, frameOn(b, 'dinero'))).length).toBeGreaterThanOrEqual(textOf(blocksOf(m, frameOn(m, 'dinero'))).length);
  });

  it('a frame chained on the same page (next) carries no mark', () => {
    const doc = build(standIn({ frames: { dinero: { minHeight: undefined, maxHeight: mm(BOX_MM), next: 'ahorro' } }, markdown: doubled }));
    const first = composedPages(doc)[0]!;
    expect(overlayOf(blocksOf(first, frameOn(first, 'dinero'))[0]!)).not.toContain('Continúa');
  });

  it('the text goes on at full size: a scale the ladder tried is dropped', () => {
    const doc = build(standIn({ frames: capped(), markdown: doubled }));
    for (const p of composedPages(doc)) expect(frameOn(p, 'dinero').scale).toBe(1);
    expect(composedPages(doc)[0]!.composed!.log.some((e) => e.kind === 'textScaled')).toBe(false);
  });
});

describe('added pages are pages of the book (#859)', () => {
  const RUNNING = { header: { elements: [{ kind: 'text', id: 'cabeza', content: 'Folio {pageNumber}', placement: { anchor: { to: 'container', edge: 'top-right' } } }] } as never };

  it('keep the numbering and the running heads', () => {
    const doc = build(standIn({ frames: capped(), template: { header: undefined }, markdown: doubled, config: RUNNING }));
    const [first, added] = composedPages(doc) as [VDTPage, VDTPage];
    expect(added.pageNumberValue).toBe((first.pageNumberValue ?? 0) + 1);
    const headText = (p: VDTPage): string => (p.header?.blocks ?? []).flatMap((b) => (b.kind === 'text' ? b.lines.map((l) => l.text) : [])).join(' ');
    expect(headText(added)).toContain(`Folio ${added.pageLabel ?? added.pageNumberValue}`);
    const footText = (p: VDTPage): string => (p.footer?.blocks ?? []).flatMap((b) => (b.kind === 'text' ? b.lines.map((l) => l.text) : [])).join(' ');
    expect(footText(added)).toContain(String(added.pageLabel ?? added.pageNumberValue));
  });

  it("take the variant of their side", () => {
    const sides: PageTemplate = { ...SIGUE, variants: { verso: { frames: [{ name: 'dinero', width: mm(150) }] }, recto: { frames: [{ name: 'dinero', width: mm(170) }] } } };
    const doc = build(standIn({ frames: capped(), template: { overflowTemplate: 'tema-sigue' }, more: [sides], markdown: doubled }));
    const added = composedPages(doc)[1]!;
    // Page 2 (an even folio) is a verso.
    expect(added.composed!.variant).toBe('verso');
    expect(frameOn(added, 'dinero').rect.width).toBeCloseTo(150 * MM, 3);
  });

  it('a spread overflow template opens on the next verso, both pages of it', () => {
    const sheet: PageTemplate = { id: 'pliego', spread: true, gutter: mm(10), frames: [{ name: 'dinero', style: 'caja-azul', placement: { anchor: { to: 'container', edge: 'top-left' } }, width: mm(160) }, { name: 'otro', optional: true, width: mm(100), height: mm(20), placement: { anchor: { to: 'container', edge: 'top-right' } } }] };
    const doc = build(standIn({ frames: capped(), template: { overflowTemplate: 'pliego' }, more: [sheet], markdown: doubled }));
    const pages = composedPages(doc);
    expect(pages.map((p) => p.composed!.spread)).toEqual([undefined, 'left', 'right']);
    expect(pages[1]!.index).toBe(pages[0]!.index + 1);
    expect(pages[1]!.composed!.continuationOf).toBe(pages[0]!.index);
    expect(frameOn(pages[1]!, 'dinero').id).toBe('cp0:dinero~1');
    expect(warningsOf(doc)).toEqual([]);
  });

  it("a spread's continuation follows its overflow template: single pages", () => {
    const sheet: PageTemplate = {
      id: 'pliego',
      spread: true,
      gutter: mm(10),
      overflowTemplate: 'suelta',
      frames: [{ name: 'texto', style: 'caja-azul', width: mm(160), height: mm(40), placement: { anchor: { to: 'container', edge: 'top-left' } }, overflow: { continueIn: 'next-page' } }],
    };
    const single: PageTemplate = { id: 'suelta', frames: [{ name: 'texto', style: 'caja-azul' }] };
    const md = ['::::page{template="pliego" spread}', ':::frame{slot="texto"}', ...Array.from({ length: 8 }, (_, i) => `Párrafo ${i} `.repeat(30).trim()).flatMap((p) => [p, '']), ':::', '::::', ''].join('\n');
    const doc = buildDocument({ markdown: md }, { ...page8Fixture('es').config, pageTemplates: [sheet, single] }, createMeasurementCache());
    const pages = composedPages(doc);
    expect(pages.slice(0, 2).map((p) => p.composed!.spread)).toEqual(['left', 'right']);
    expect(pages[2]!.composed!.template).toBe('suelta');
    expect(pages[2]!.composed!.spread).toBeUndefined();
    expect(frameOn(pages[2]!, 'texto').continuedFrom).toBe('cp0:texto');
  });
});

describe('the page memo and continuation (#859)', () => {
  beforeEach(() => {
    clearComposedPageMemo();
    setComposedPageMemo(true);
  });
  afterEach(() => clearComposedPageMemo());

  it('a page whose content goes on is laid afresh with its added pages, and the same each time', () => {
    const f = standIn({ frames: capped(), template: { overflowTemplate: 'tema-sigue' }, more: [SIGUE], markdown: doubled });
    const a = build(f);
    const b = build(f);
    expect(composedPageMemoStats().hits).toBe(0);
    const strip = (d: VDTDocument) => JSON.stringify(composedPages(d).map((p) => ({ composed: p.composed, floats: p.floats })));
    expect(strip(b)).toBe(strip(a));
    expect(composedPages(a)[0]!.composed!.layoutKey).toBeUndefined();
  });

  it('a page that fits again is kept again', () => {
    const f = standIn({ frames: capped(), more: [SIGUE] });
    build(f);
    build(f);
    expect(composedPageMemoStats().hits).toBe(1);
  });
});

describe('helpers (#859)', () => {
  it('continuationTarget reads the overflow template, a named template, or the template again', () => {
    const over = (id: string) => (id === 'a' ? 'b' : undefined);
    expect(continuationTarget({ rule: 'next-page', template: 'a', collapsed: false }, over)).toEqual({ template: 'b', collapse: false });
    expect(continuationTarget({ rule: 'next-page', template: 'c', collapsed: false }, over)).toEqual({ template: 'c', collapse: true });
    expect(continuationTarget({ rule: 'template:z', template: 'a', collapsed: false }, over)).toEqual({ template: 'z', collapse: false });
  });

  it('assignReceivers: the frame of the name, else the flow frame, else the first free; none left over', () => {
    const c = (frame: string) => ({ frame }) as never;
    const t = { frames: [{ name: 'x', flow: false }, { name: 'y', flow: true }] } as never;
    const { receivers, left } = assignReceivers(t, [c('x'), c('q'), c('r'), c('s')]);
    expect([...receivers.keys()]).toEqual(['x', 'y']);
    expect(left.map((l) => (l as { frame: string }).frame)).toEqual(['r', 's']);
  });

  it('describeReflowEvent names the page', () => {
    expect(describeReflowEvent({ frame: 'dinero', kind: 'continued', toPage: 4 })).toBe('dinero continued on page 5');

  });
});
