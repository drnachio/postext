import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { FrameConfig, PageTemplate } from '../../../composed/types.js';
import type { ContentWarning, PostextConfig, VDTBlock, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';
import { page8Fixture } from '../fixtures/page8.js';
import { sourceAt } from '../../../composed/sourceMap.js';

// Findings of the composed-pages recipes (#882) on content that goes on to
// other pages: the ladder's order (#920), the frame that takes the content
// (#919), where a frame is cut (#913), what an added page keeps (#912) and
// a story that jumps to a later page (#917).

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
const MM = 300 / 25.4;
const BASE = page8Fixture('es').config;

const build = (markdown: string, templates: PageTemplate[], config: Partial<PostextConfig> = {}): VDTDocument =>
  buildDocument({ markdown, resources: page8Fixture('es').resources }, { ...BASE, ...config, pageTemplates: templates }, createMeasurementCache());
const composedPages = (doc: VDTDocument): VDTPage[] => doc.pages.filter((p) => p.composed);
const frameOn = (page: VDTPage, name: string): VDTFrame => page.composed!.frames.find((f) => f.name === name)!;
const blocksOf = (page: VDTPage, f: VDTFrame): VDTBlock[] => f.blockIds.map((id) => page.floats!.find((b) => b.id === id)!);
const textOf = (blocks: readonly VDTBlock[]): string => blocks.filter((b) => b.type !== 'callout').flatMap((b) => b.lines.map((l) => l.text)).join(' ');
const overlayOf = (box: VDTBlock | undefined): string[] =>
  (box?.designOverlay?.blocks ?? []).flatMap((d) => (d.kind === 'text' ? [d.lines.map((l) => l.text).join(' ')] : []));
const warningsOf = (doc: VDTDocument, ...kinds: string[]): ContentWarning[] => (doc.contentWarnings ?? []).filter((w) => kinds.includes(w.kind));
const para = (word: string, n: number): string => Array.from({ length: n }, (_, i) => `${word}${i}`).join(' ');
const count = (s: string, word: string): number => s.split(word).length - 1;

/** A page with one box held to `heightMm`, its text `words` long. */
const oneBox = (frame: Partial<FrameConfig>, extra: PageTemplate[] = []): PageTemplate[] => [
  { id: 'hoja', header: false, frames: [{ name: 'caja', style: 'caja-azul', width: mm(186), placement: { anchor: { to: 'container', edge: 'top-left' } }, ...frame }] },
  ...extra,
];
const boxPage = (words: number): string => ['::::page{template="hoja"}', ':::frame{slot="caja" label="Caja"}', para('palabra', words), ':::', '::::', ''].join('\n');

describe('the ladder goes on before it shrinks a frame that can continue (#920)', () => {
  // A box a few lines short: shrinking to 90 % would make it fit.
  const words = (() => {
    for (let n = 100; n < 2000; n += 20) {
      const doc = build(boxPage(n), oneBox({ height: mm(60), overflow: { continueIn: 'next-page' }, fit: { preferContinue: false } }));
      const first = composedPages(doc)[0]!;
      if (frameOn(first, 'caja').scale < 0.95) return n;
    }
    throw new Error('no length found');
  })();

  it('by default the box goes on at full size', () => {
    const doc = build(boxPage(words), oneBox({ height: mm(60), overflow: { continueIn: 'next-page' } }));
    const pages = composedPages(doc);
    expect(pages).toHaveLength(2);
    for (const p of pages) expect(frameOn(p, 'caja').scale).toBe(1);
    expect(pages[0]!.composed!.log.some((e) => e.kind === 'textScaled')).toBe(false);
    expect(pages[0]!.composed!.log.some((e) => e.kind === 'continued')).toBe(true);
    expect(warningsOf(doc, 'frameOverflow')).toEqual([]);
  });

  it('fit.preferContinue: false shrinks first and keeps the story on its page', () => {
    const doc = build(boxPage(words), oneBox({ height: mm(60), overflow: { continueIn: 'next-page' }, fit: { preferContinue: false } }));
    const pages = composedPages(doc);
    expect(pages).toHaveLength(1);
    expect(frameOn(pages[0]!, 'caja').scale).toBeLessThan(1);
    expect(pages[0]!.composed!.log.some((e) => e.kind === 'textScaled')).toBe(true);
  });

  it('a frame that cannot go on still shrinks', () => {
    const doc = build(boxPage(words), oneBox({ height: mm(60) }));
    expect(frameOn(composedPages(doc)[0]!, 'caja').scale).toBeLessThan(1);
  });

  it('on the last page continuation may add, the text shrinks again', () => {
    // The tiny receiver takes none of it: the step is reverted, and the
    // ladder shrinks the text before it warns.
    const tiny: PageTemplate = { id: 'diminuta', header: false, frames: [{ name: 'caja', style: 'caja-azul', width: mm(186), height: mm(4) }] };
    const doc = build(boxPage(words * 4), oneBox({ height: mm(60), overflow: { continueIn: 'template:diminuta' } }, [tiny]));
    const ws = warningsOf(doc, 'frameOverflow') as Extract<ContentWarning, { kind: 'frameOverflow' }>[];
    expect(ws).toHaveLength(1);
    expect(ws[0]!.stepsTried).toEqual(['free', 'continue', 'shrinkText']);
  });
});

describe('a threaded story goes on where its chain starts (#919)', () => {
  /** Three columns threaded a → b → c; c goes on as `rule`. */
  const columns = (id: string, prefix: string, rule: string): PageTemplate => ({
    id,
    header: false,
    frames: (['1', '2', '3'] as const).map((k, i) => ({
      name: `${prefix}-${k}`,
      width: mm(56),
      height: 'fill' as const,
      placement: { anchor: { to: 'container' as const, edge: 'top-left' as const }, offset: { x: mm(i * 62) } },
      ...(k === '1' ? { flow: true } : {}),
      ...(k !== '3' ? { next: `${prefix}-${Number(k) + 1}` } : { overflow: { continueIn: rule } }),
      fit: { shrinkText: false, scaleImages: false },
    })),
  });
  const story = ['::::page{template="cuerpo"}', ...Array.from({ length: 70 }, (_, i) => [para(`p${i}w`, 110), '']).flat(), '::::', ''].join('\n');

  for (const rule of ['template:cuerpo', 'next-page']) {
    it(`a template that goes on into itself fills every column of every added page (${rule})`, () => {
      const doc = build(story, [columns('cuerpo', 'col', rule)]);
      const pages = composedPages(doc);
      expect(pages.length).toBeGreaterThanOrEqual(4);
      // Every page but the last fills its three columns.
      for (const p of pages.slice(0, -1)) {
        for (const k of ['1', '2', '3']) expect(frameOn(p, `col-${k}`).blockIds.length, `p. ${p.index} col-${k}`).toBeGreaterThan(0);
      }
      expect(pages[pages.length - 1]!.composed!.frames.find((f) => f.name === 'col-1')!.blockIds.length).toBeGreaterThan(0);
      // The chain goes on from c to the next page's a.
      for (let k = 1; k < pages.length; k++) {
        expect(frameOn(pages[k]!, 'col-1').continuedFrom).toBe(frameOn(pages[k - 1]!, 'col-3').id);
      }
      expect(warningsOf(doc, 'frameOverflow', 'frameContinuationLimit')).toEqual([]);
      // Every word once.
      const all = pages.flatMap((p) => ['1', '2', '3'].map((k) => textOf(blocksOf(p, frameOn(p, `col-${k}`))))).join(' ');
      for (const i of [0, 17, 39, 69]) expect(count(all, `p${i}w5 `)).toBe(1);
    });
  }

  it('goes on in the flow frame of another template whose frames have other names', () => {
    const doc = build(story.replace('template="cuerpo"', 'template="primera"'), [columns('primera', 'col', 'template:seguido'), columns('seguido', 'sig', 'template:seguido')]);
    const pages = composedPages(doc);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    for (const p of pages.slice(1, -1)) {
      for (const k of ['1', '2', '3']) expect(frameOn(p, `sig-${k}`).blockIds.length).toBeGreaterThan(0);
    }
  });
});

describe('a frame is cut as the running text is (#913)', () => {
  const steps = (lead: number, items = 5): string => [
    '::::page{template="hoja"}',
    ':::frame{slot="caja" label="Pasos"}',
    para('intro', lead),
    '',
    '### Mi registro de la semana',
    '',
    ...Array.from({ length: items }, (_, i) => `- ${para(`item${i}w`, 12)}`),
    ':::',
    '::::',
    '',
  ].join('\n');
  /** The first piece of each length of introduction, and the second. */
  const cuts = (items: number) => Array.from({ length: 60 }, (_, k) => 40 + k * 6).map((lead) => {
    const doc = build(steps(lead, items), oneBox({ height: mm(70), overflow: { continueIn: 'next-page' } }));
    const pages = composedPages(doc);
    const piece = (p: VDTPage | undefined) => (p ? blocksOf(p, frameOn(p, 'caja')).filter((b) => b.type !== 'callout') : []);
    return { lead, first: piece(pages[0]), rest: piece(pages[1]), doc };
  });

  it('never leaves a heading at the foot of a piece', () => {
    let seen = 0;
    for (const { first, rest } of cuts(5)) {
      if (rest.length === 0) continue;
      seen++;
      expect(first[first.length - 1]!.type).not.toBe('heading');
    }
    expect(seen).toBeGreaterThan(10);
  });

  it('leaves at least two items of a list on each side of a cut between items', () => {
    let between = 0;
    for (const { first, rest } of cuts(5)) {
      const before = first.filter((b) => b.type === 'listItem').length;
      const after = rest.filter((b) => b.type === 'listItem').length;
      // A cut inside an item counts it on both sides.
      const split = before > 0 && after > 0 && before + after > 5;
      if (before === 0 || after === 0 || split) continue;
      between++;
      expect(before).toBeGreaterThanOrEqual(2);
      expect(after).toBeGreaterThanOrEqual(2);
    }
    expect(between).toBeGreaterThan(0);
  });

  it("a short list under shortListSplit: 'avoid' moves whole", () => {
    for (const lead of Array.from({ length: 40 }, (_, k) => 40 + k * 8)) {
      const doc = build(steps(lead, 3), oneBox({ height: mm(70), overflow: { continueIn: 'next-page' } }), { bodyText: { ...BASE.bodyText, shortListSplit: 'avoid' } as never });
      const pages = composedPages(doc);
      if (pages.length < 2) continue;
      const items = (p: VDTPage) => blocksOf(p, frameOn(p, 'caja')).filter((b) => b.type === 'listItem').length;
      const a = items(pages[0]!);
      const b = items(pages[1]!);
      // Whole on one side, or cut inside one item.
      expect(a === 0 || b === 0 || a + b === 4).toBe(true);
    }
  });
});

describe('an activity sheet whose last box goes on (#912)', () => {
  const at = (to: string, edge: string, y = 0) => ({ anchor: { to, edge }, offset: { y: mm(y) } }) as never;
  const ruled = (frame: string, lines: number) => Array.from({ length: lines }, (_, i) => ({ kind: 'rule', id: `${frame}-${i + 1}`, direction: 'horizontal', thickness: { value: 0.75, unit: 'pt' }, placement: { ...(at(`#${frame}`, 'top-left', 8 * (i + 1) - 1) as object), size: { width: mm(180) } } }));
  /** The sheet: a kicker, the running text, three boxes in a stack with
   *  answer lines under the first and the last. */
  const FICHA: PageTemplate = {
    id: 'ficha',
    header: false,
    decoration: { elements: [{ kind: 'text', id: 'tema', content: '{attr.tema}', fontSize: { value: 9, unit: 'pt' }, placement: at('container', 'top-left') }, ...ruled('lineas-1', 3), ...ruled('lineas-3', 2)] } as never,
    frames: [
      { name: 'texto', flow: true, width: mm(180), placement: at('container', 'top-left', 6) },
      { name: 'act-1', style: 'caja-azul', width: mm(180), minHeight: mm(22), placement: at('#texto', 'below', 6) },
      { name: 'lineas-1', optional: true, width: mm(180), height: mm(24), minHeight: mm(24) },
      { name: 'act-2', style: 'caja-azul', width: mm(180), minHeight: mm(22) },
      { name: 'act-3', style: 'caja-azul', width: mm(180), minHeight: mm(22), overflow: { continueIn: 'next-page' } },
      { name: 'lineas-3', optional: true, width: mm(180), height: mm(16), minHeight: mm(16) },
    ],
    groups: [{ name: 'actividades', kind: 'stack', gap: mm(4.5), frames: ['act-1', 'lineas-1', 'act-2', 'act-3', 'lineas-3'] }],
  };
  const sheet = (first: number, last: number): string => [
    '::::page{template="ficha" tema="Unidad 3 · Ficha 1"}',
    para('texto', 120), '',
    ':::frame{slot="act-1" label="1 · Lee"}', para('uno', first), ':::', '',
    ':::frame{slot="act-2" label="2 · Completa"}', para('dos', 60), ':::', '',
    ':::frame{slot="act-3" label="3 · Dibuja"}', para('tres', last), ':::', '',
    '::::', ''].join('\n');
  const decoBoxes = (p: VDTPage) => p.composed!.decoration?.blocks ?? [];

  it('the answer lines go with the end of the box to the added page, and keep their size there', () => {
    const doc = build(sheet(900, 700), [FICHA]);
    const [first, added] = composedPages(doc) as [VDTPage, VDTPage];
    expect(added).toBeDefined();
    expect(frameOn(first, 'act-3').continuesTo).toBe('cp0:act-3~1');
    // On the first page the box runs to the foot of the area, the lines left with the rest.
    expect(frameOn(first, 'lineas-3').collapsed).toBe(true);
    expect(frameOn(first, 'lineas-1').collapsed).toBeUndefined();
    // On the added page, under the rest of the box, at their size.
    const lines = frameOn(added, 'lineas-3');
    const rest = frameOn(added, 'act-3');
    expect(lines.collapsed).toBeUndefined();
    expect(lines.rect.height).toBeCloseTo(16 * MM, 3);
    expect(lines.rect.y).toBeGreaterThan(rest.rect.y + rest.rect.height);
    // Their rules are drawn on the added page only; the first sheet's
    // answer lines stay where they were, and not on the added page.
    const rulesOn = (p: VDTPage) => decoBoxes(p).filter((b) => b.kind === 'rule').length;
    expect(rulesOn(first)).toBe(3);
    expect(rulesOn(added)).toBe(2);
    for (const b of decoBoxes(added).filter((d) => d.kind === 'rule')) expect(b.bbox.y).toBeGreaterThan(lines.rect.y);
    expect(warningsOf(doc, 'frameOverflow')).toEqual([]);
  });

  it('the rest of the box starts where its group starts, clear of the kicker', () => {
    const doc = build(sheet(900, 700), [FICHA]);
    const added = composedPages(doc)[1]!;
    const kicker = decoBoxes(added).find((b) => b.kind === 'text')!;
    expect(kicker).toBeDefined();
    const rest = frameOn(added, 'act-3');
    expect(rest.rect.y).toBeGreaterThanOrEqual(kicker.bbox.y + kicker.bbox.height);
    // Where the template puts its group: under the running text's place.
    expect(rest.rect.y).toBeCloseTo(frameOn(added, 'texto').rect.y + 6 * MM, 3);
    // A click on the kicker comes back to it.
    const line = (kicker as { lines: { xOffset: number; baselineY: number; width: number }[] }).lines[0]!;
    const hit = sourceAt(doc, added.index, kicker.bbox.x + line.xOffset + line.width / 2, kicker.bbox.y + kicker.bbox.height / 2)[0];
    expect(hit?.id).toMatch(/^cp0:decoration:tema(@|$)/);
  });

  it('the answer lines keep their size on whichever page they land: the box goes on rather than squeeze them', () => {
    let wholeMoves = 0;
    for (let first = 560; first <= 900; first += 10) {
      const doc = build(sheet(first, 150), [FICHA]);
      const pages = composedPages(doc);
      const lines = pages.map((p) => frameOn(p, 'lineas-3')).filter((f) => !f.collapsed);
      expect(lines, `first ${first}`).toHaveLength(1);
      expect(lines[0]!.rect.height, `first ${first}`).toBeCloseTo(16 * MM, 3);
      // A box with no room for its lines under it goes on whole with them.
      if (pages.length > 1 && frameOn(pages[0]!, 'act-3').blockIds.length === 0) {
        wholeMoves++;
        // With its lines, it takes no room here.
        if (frameOn(pages[0]!, 'lineas-3').collapsed) expect(frameOn(pages[0]!, 'act-3').rect.height).toBe(0);
        expect(overlayOf(blocksOf(pages[1]!, frameOn(pages[1]!, 'act-3'))[0])).toContain('3 · Dibuja');
      }
    }
    expect(wholeMoves).toBeGreaterThan(0);
  });

  it('a box none of whose text fits on the page goes on whole: no tab and mark over an empty piece', () => {
    // A first box long enough to push the last one to the foot.
    let checked = 0;
    for (const n of [1250, 1300, 1350, 1400, 1450]) {
      const doc = build(sheet(n, 300), [FICHA]);
      const [first, added] = composedPages(doc) as [VDTPage, VDTPage | undefined];
      if (!added) continue;
      const piece = frameOn(first, 'act-3');
      const blocks = blocksOf(first, piece);
      if (blocks.length > 0) {
        // A piece holds text.
        expect(textOf(blocks).length).toBeGreaterThan(0);
        continue;
      }
      checked++;
      expect(piece.continuesTo).toBe('cp0:act-3~1');
      // The whole box, with its tab, on the added page.
      const whole = blocksOf(added, frameOn(added, 'act-3'));
      expect(overlayOf(whole[0])).toContain('3 · Dibuja');
      expect(textOf(whole)).toMatch(/^tres0 /);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('a story that jumps to a later page (#917)', () => {
  const top = { anchor: { to: 'container' as const, edge: 'top-left' as const } };
  const ARTICULO: PageTemplate = {
    id: 'articulo',
    header: false,
    frames: [{ name: 'cuerpo', style: 'caja-azul', flow: true, width: mm(186), height: mm(90), placement: top, overflow: { continueIn: 'page:{attr.sigue}', mark: 'Sigue en la página {page}', fromMark: 'Viene de la página {page}' }, fit: { shrinkText: false } }],
  };
  const OTRA: PageTemplate = { id: 'otra', header: false, frames: [{ name: 'texto', flow: true, width: mm(186), placement: top }] };
  const SALTO: PageTemplate = {
    id: 'salto',
    header: false,
    frames: [
      { name: 'breve', flow: true, width: mm(186), height: mm(40), placement: top },
      { name: 'resto', style: 'caja-azul', width: mm(186), placement: { anchor: { to: '#breve', edge: 'below' }, offset: { y: mm(10) } } },
      { name: 'vacio', optional: true, width: mm(40), height: mm(20), placement: { anchor: { to: 'container', edge: 'bottom-left' } } },
    ],
  };
  const TEMPLATES = [ARTICULO, OTRA, SALTO];
  const book = (sigue: string, order: 'after' | 'before' = 'after'): string => {
    const art = ['::::page{template="articulo" sigue="' + sigue + '"}', para('art', 900), '::::', ''];
    const other = ['::::page{template="otra"}', para('otra', 200), '::::', ''];
    const jump = ['::::page{template="salto" id="p-salto"}', para('breve', 60), '::::', ''];
    return (order === 'after' ? [...art, ...other, ...jump] : [...jump, ...art, ...other]).join('\n');
  };

  it('goes on in the frame the later page leaves empty, past the pages between', () => {
    const doc = build(book('p-salto'), TEMPLATES);
    const pages = composedPages(doc);
    expect(pages.map((p) => p.composed!.template)).toEqual(['articulo', 'otra', 'salto']);
    const [first, , jumpPage] = pages as [VDTPage, VDTPage, VDTPage];
    const from = frameOn(first, 'cuerpo');
    const to = frameOn(jumpPage, 'resto');
    expect(to.id).toBe('cp2:resto');
    expect(from.continuesTo).toBe('cp2:resto');
    expect(to.continuedFrom).toBe('cp0:cuerpo');
    expect(first.composed!.log).toContainEqual({ frame: 'cuerpo', kind: 'continued', toPage: jumpPage.index, toFrame: 'cp2:resto' });
    // The page's own content stays where it was.
    expect(textOf(blocksOf(jumpPage, frameOn(jumpPage, 'breve')))).toMatch(/^breve0 /);
    expect(frameOn(jumpPage, 'vacio').blockIds).toEqual([]);
    // Every word of the article once, across the two pages.
    const all = `${textOf(blocksOf(first, from))} ${textOf(blocksOf(jumpPage, to))}`;
    for (const w of ['art0 ', 'art450 ', 'art899']) expect(count(all, w)).toBe(1);
    expect(warningsOf(doc, 'frameOverflow', 'continueTargetMissing')).toEqual([]);
    // The pieces are one box.
    expect(blocksOf(jumpPage, to)[0]!.containerId).toBe(blocksOf(first, from)[0]!.containerId);
  });

  it('the frame a story jumps to is not reported empty; another empty frame is', () => {
    const strict: PageTemplate = { ...SALTO, frames: SALTO.frames!.map((f) => (f.name === 'vacio' ? { ...f, optional: false } : f)) };
    const doc = build(book('p-salto'), [ARTICULO, OTRA, strict]);
    expect(warningsOf(doc, 'slotEmpty').map((w) => (w as { frame: string }).frame)).toEqual(['vacio']);
  });

  it('marks say where the story goes on and where it comes from, with the printed page numbers', () => {
    const doc = build(book('p-salto'), TEMPLATES);
    const [first, , jumpPage] = composedPages(doc) as [VDTPage, VDTPage, VDTPage];
    const sent = overlayOf(blocksOf(first, frameOn(first, 'cuerpo'))[0]);
    expect(sent).toContain(`Sigue en la página ${jumpPage.pageLabel}`);
    const got = overlayOf(blocksOf(jumpPage, frameOn(jumpPage, 'resto'))[0]);
    expect(got).toContain(`Viene de la página ${first.pageLabel}`);
  });

  it("'page:<id>#<frame>' names the frame that takes it", () => {
    const named: PageTemplate = { ...ARTICULO, frames: [{ ...ARTICULO.frames![0]!, overflow: { continueIn: 'page:{attr.sigue}#vacio' } }] };
    const doc = build(book('p-salto'), [named, OTRA, SALTO]);
    const jumpPage = composedPages(doc)[2]!;
    expect(frameOn(jumpPage, 'vacio').continuedFrom).toBe('cp0:cuerpo');
    expect(frameOn(jumpPage, 'resto').blockIds).toEqual([]);
  });

  it('what the frame there cannot hold goes on on a page added after it', () => {
    const small: PageTemplate = { ...SALTO, frames: SALTO.frames!.map((f) => (f.name === 'resto' ? { ...f, height: mm(60) } : f)) };
    const doc = buildDocument({ markdown: book('p-salto').replace(para('art', 900), para('art', 2400)), resources: [] }, { ...BASE, pageTemplates: [ARTICULO, OTRA, small] }, createMeasurementCache());
    const pages = composedPages(doc);
    expect(pages.map((p) => p.composed!.template).slice(0, 3)).toEqual(['articulo', 'otra', 'salto']);
    expect(pages.length).toBeGreaterThanOrEqual(4);
    const added = pages[3]!;
    expect(added.composed!.continuationOf).toBe(pages[2]!.index);
    expect(frameOn(pages[2]!, 'resto').continuesTo).toBe(frameOn(added, 'resto').id);
    expect(frameOn(added, 'resto').id).toBe('cp2:resto~1');
    const all = pages.flatMap((p) => p.composed!.frames.filter((f) => f.name === 'cuerpo' || f.name === 'resto').map((f) => textOf(blocksOf(p, f)))).join(' ');
    for (const w of ['art0 ', 'art1200 ', 'art2399']) expect(count(all, w)).toBe(1);
  });

  it('a page id no later fence has: the rest goes on on the next page, and a warning says so', () => {
    for (const [sigue, order, before] of [['nada', 'after', false], ['p-salto', 'before', true]] as const) {
      const doc = build(book(sigue, order), TEMPLATES);
      const ws = warningsOf(doc, 'continueTargetMissing');
      expect(ws, `${sigue} ${order}`).toHaveLength(1);
      expect(ws[0]).toMatchObject({ kind: 'continueTargetMissing', template: 'articulo', frame: 'cuerpo', target: sigue, ...(before ? { before: true } : {}) });
      const pages = composedPages(doc);
      const at = pages.findIndex((p) => p.composed!.template === 'articulo');
      expect(pages[at + 1]!.composed!.continuationOf).toBe(pages[at]!.index);
    }
  });
});
