import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { formatWarning } from '../../../pipeline/contentWarnings.js';
import { describeFitStep, describeFrameOverflowProposal, describeReflowEvent } from '../../../composed/reflowLog.js';
import { frameBounds, frameContentRect, frameMatrix } from '../../../composed/paint.js';
import { clearComposedPageMemo, composedPageMemoStats, setComposedPageMemo } from '../../../composed/pageMemo.js';
import { elementsForSource, sourceAt } from '../../../composed/sourceMap.js';
import type { FrameConfig, PageTemplate } from '../../../composed/types.js';
import type { ContentWarning, FrameOverflowProposal, PostextConfig, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';
import { page8Fixture } from '../fixtures/page8.js';

// Deterministic text measurement stub (no DOM in the node test env): seven
// px per character, whatever the face.
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
const toMm = (v: number): number => v / MM;

type Locale = 'es' | 'en';
type Overflow = Extract<ContentWarning, { kind: 'frameOverflow' }>;

/** The stand-in (#855) with its frames patched, its Markdown changed, and
 *  other templates added after its own. */
function standIn(opts: {
  locale?: Locale;
  frames?: Record<string, Partial<FrameConfig>>;
  groups?: PageTemplate['groups'];
  markdown?: (md: string) => string;
  more?: PageTemplate[];
} = {}): { markdown: string; config: PostextConfig; resources: ReturnType<typeof page8Fixture>['resources'] } {
  const { markdown, config, resources } = page8Fixture(opts.locale ?? 'es');
  const base = config.pageTemplates![0]! as PageTemplate;
  const patch = opts.frames ?? {};
  const tpl: PageTemplate = {
    ...base,
    frames: base.frames!.map((f) => (patch[f.name] ? { ...f, ...patch[f.name] } : f)),
    ...(opts.groups ? { groups: opts.groups } : {}),
  };
  return { markdown: (opts.markdown ?? ((m) => m))(markdown), config: { ...config, pageTemplates: [tpl, ...(opts.more ?? [])] }, resources };
}
const build = (f: ReturnType<typeof standIn>): VDTDocument => buildDocument({ markdown: f.markdown, resources: f.resources }, f.config, createMeasurementCache());
const page0 = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frameOf = (doc: VDTDocument, name: string): VDTFrame => page0(doc).composed!.frames.find((f) => f.name === name)!;
const overflowsOf = (doc: VDTDocument): Overflow[] => (doc.contentWarnings ?? []).filter((w): w is Overflow => w.kind === 'frameOverflow');
const eventsOf = (doc: VDTDocument, frame?: string): string[] =>
  page0(doc).composed!.log.filter((e) => !frame || e.frame === frame).map((e) => `${e.frame} ${e.kind}`);

/** `n` more paragraphs at the head of the first box (`dinero`). */
const moreMoney = (n: number, word = 'Más dinero') => (md: string): string =>
  md.replace(/(:::frame\{slot="dinero"[^\n]*\n)/, `$1${Array.from({ length: n }, (_, i) => `${word} ${i} `.repeat(30).trim()).join('\n\n')}\n\n`);
/** `k` more words at the head of the first box (one short paragraph). */
const moreWords = (k: number) => (md: string): string =>
  md.replace(/(:::frame\{slot="dinero"[^\n]*\n)/, `$1${'Más dinero '.repeat(k).trim()}\n\n`);
/** The first box's photo set inside the box (its story) instead of in a
 *  frame of its own. */
const photoInBox = (md: string): string => md.replace('slot="dinero-fotos"', 'slot="dinero"');

describe('the reflow ladder on the page-8 stand-in (#858)', () => {
  it('1. free space: a fixed height grows to its maxHeight, and the ladder stops there', () => {
    const fixed = { height: mm(36), minHeight: undefined };
    const capped = build(standIn({ frames: { dinero: fixed }, markdown: moreMoney(3) }));
    // Without a maximum the height is the template's: the text shrinks.
    expect(frameOf(capped, 'dinero').rect.height).toBeCloseTo(36 * MM, 3);
    expect(frameOf(capped, 'dinero').scale).toBeLessThan(1);
    const free = build(standIn({ frames: { dinero: { ...fixed, maxHeight: mm(90) } }, markdown: moreMoney(3) }));
    const d = frameOf(free, 'dinero');
    expect(toMm(d.rect.height)).toBeGreaterThan(36.5);
    expect(toMm(d.rect.height)).toBeLessThanOrEqual(90);
    expect(d.scale).toBe(1);
    expect(d.overflowPx).toBe(0);
    expect(eventsOf(free, 'dinero')).toEqual(['dinero grew']);
    expect(eventsOf(free)).toContain('gasto moved');
    expect(overflowsOf(free)).toEqual([]);
  });

  it('2. push siblings: a longer box moves the boxes below; nothing is scaled', () => {
    const doc = build(standIn({ markdown: moreMoney(3) }));
    expect(eventsOf(doc).some((e) => /imageScaled|textScaled/.test(e))).toBe(false);
    expect(eventsOf(doc)).toContain('gasto moved');
    for (const f of page0(doc).composed!.frames) expect(f.scale).toBe(1);
    expect(overflowsOf(doc)).toEqual([]);
  });

  it('3. pictures: the box’s photo is set smaller, the largest 2.5 % step that fits, within imageMinScale', () => {
    const atNatural = build(standIn({ markdown: photoInBox }));
    const natural = frameOf(atNatural, 'dinero').rect.height;
    // The box 4 mm shorter than its text and photo need.
    const height = mm(Math.floor(toMm(natural)) - 4);
    const doc = build(standIn({ frames: { dinero: { height, minHeight: undefined } }, markdown: photoInBox }));
    const d = frameOf(doc, 'dinero');
    expect(d.overflowPx).toBe(0);
    expect(d.scale).toBe(1);
    expect(d.imageScale).toBeGreaterThanOrEqual(0.8);
    expect(d.imageScale).toBeLessThan(1);
    expect(Math.round(((1 - d.imageScale!) / 0.025) * 1e6) % 1e6).toBe(0);
    expect(page0(doc).composed!.log).toContainEqual({ frame: 'dinero', kind: 'imageScaled', scale: d.imageScale });
    // One step larger does not fit: the box would overflow at imageMinScale + 2.5 %.
    const larger = build(standIn({ frames: { dinero: { height, minHeight: undefined, fit: { imageMinScale: d.imageScale! + 0.025, shrinkText: false } } }, markdown: photoInBox }));
    expect(frameOf(larger, 'dinero').overflowPx).toBeGreaterThan(0);
    // With scaleImages off, the text shrinks instead.
    const off = build(standIn({ frames: { dinero: { height, minHeight: undefined, fit: { scaleImages: false } } }, markdown: photoInBox }));
    expect(frameOf(off, 'dinero').imageScale).toBeUndefined();
    expect(frameOf(off, 'dinero').scale).toBeLessThan(1);
  });

  it('4. redistribute: a sibling above its minimum gives space back, down to its minimum', () => {
    const gasto = { height: mm(62), minHeight: mm(40) };
    const doc = build(standIn({ frames: { gasto }, markdown: moreMoney(6) }));
    expect(overflowsOf(doc)).toEqual([]);
    expect(toMm(frameOf(doc, 'gasto').rect.height)).toBeLessThan(62);
    expect(toMm(frameOf(doc, 'gasto').rect.height)).toBeGreaterThanOrEqual(40 - 1e-6);
    expect(frameOf(doc, 'ahorro').scale).toBe(1);
    expect(eventsOf(doc, 'gasto')).toContain('gasto resized');
    // Without the step (a fixed height of 62 with nothing under it), the
    // boxes would not fit: the same text with the minimum at the height
    // does not. ahorro keeps its minimum; dinero, which grew, gives way
    // (#911).
    const rigid = build(standIn({ frames: { gasto: { height: mm(62), minHeight: mm(62) } }, markdown: moreMoney(6) }));
    const short = (n: string): boolean => frameOf(rigid, n).scale < 1 || frameOf(rigid, n).overflowPx > 0;
    expect(short('dinero') || short('ahorro')).toBe(true);
    expect(toMm(frameOf(rigid, 'ahorro').rect.height)).toBeGreaterThanOrEqual(30 - 1e-6);
  });

  it('5. shrink text: down to fit.minScale in 2.5 % steps, the largest that fits; shrinkText: false turns it off', () => {
    const fixed = { height: mm(36), minHeight: undefined };
    const doc = build(standIn({ frames: { dinero: fixed }, markdown: moreWords(40) }));
    const d = frameOf(doc, 'dinero');
    expect(d.overflowPx).toBe(0);
    expect(d.scale).toBeLessThan(1);
    expect(d.scale).toBeGreaterThanOrEqual(0.9);
    expect(Math.round(((1 - d.scale) / 0.025) * 1e6) % 1e6).toBe(0);
    expect(page0(doc).composed!.log).toContainEqual({ frame: 'dinero', kind: 'textScaled', scale: d.scale });
    // Laid out larger and painted at the scale: the matrix maps its content box onto its box.
    expect(frameContentRect(d).width).toBeCloseTo(d.rect.width / d.scale, 6);
    expect(frameBounds(d).x).toBeCloseTo(d.rect.x, 6);
    expect(frameBounds(d).y).toBeCloseTo(d.rect.y, 6);
    expect(frameBounds(d).width).toBeCloseTo(d.rect.width, 6);
    expect(frameBounds(d).height).toBeCloseTo(d.rect.height, 6);
    expect(frameMatrix(d)).toEqual([d.scale, 0, 0, d.scale, d.rect.x * (1 - d.scale), d.rect.y * (1 - d.scale)]);
    // The box keeps its drawn padding: the text stays clear of the photos
    // set over the box's right 62 mm, whatever the scale.
    const blocks = d.blockIds.map((id) => page0(doc).floats!.find((b) => b.id === id)!);
    const rightOnSheet = Math.max(...blocks.flatMap((b) => b.lines.filter((l) => l.text.length > 0).map((l) => d.rect.x + (l.bbox.x + l.bbox.width - d.rect.x) * d.scale)));
    // (A line's box may carry its trailing space: about one stub character.)
    expect(rightOnSheet).toBeLessThanOrEqual(d.rect.x + d.rect.width - 62 * MM + 8 * d.scale);
    expect(rightOnSheet).toBeGreaterThan(d.rect.x + d.rect.width - 62 * MM - 10 * MM);
    // One step larger overflows.
    if (d.scale < 0.975) {
      const larger = build(standIn({ frames: { dinero: { ...fixed, fit: { minScale: d.scale + 0.025 } } }, markdown: moreWords(40) }));
      expect(frameOf(larger, 'dinero').overflowPx).toBeGreaterThan(0);
    }
    const off = build(standIn({ frames: { dinero: { ...fixed, fit: { shrinkText: false } } }, markdown: moreWords(40) }));
    expect(frameOf(off, 'dinero').scale).toBe(1);
    expect(frameOf(off, 'dinero').overflowPx).toBeGreaterThan(0);
    expect(overflowsOf(off)[0]!.stepsTried).not.toContain('shrinkText');
  });

  it('6. continuation: a frame that continues on another page is cut there, at full size, and warns no more (#859)', () => {
    const doc = build(standIn({ frames: { dinero: { height: mm(36), minHeight: undefined, overflow: { continueIn: 'next-page' } } }, markdown: moreMoney(4) }));
    expect(overflowsOf(doc)).toEqual([]);
    const d = frameOf(doc, 'dinero');
    expect(d.overflowPx).toBe(0);
    expect(d.scale).toBe(1);
    expect(d.continuesTo).toBe('cp0:dinero~1');
    expect(eventsOf(doc, 'dinero')).toEqual(['dinero continued']);
    expect(doc.pages.filter((p) => p.composed).length).toBeGreaterThan(1);
  });
});

describe('frameOverflow: the steps tried and the proposals (#858)', () => {
  const tooLong = { frames: { dinero: { height: mm(36), minHeight: undefined } }, markdown: moreMoney(4) };
  const proposal = <K extends FrameOverflowProposal['kind']>(w: Overflow, kind: K) =>
    w.proposals.find((p): p is Extract<FrameOverflowProposal, { kind: K }> => p.kind === kind);

  for (const locale of ['es', 'en'] as const) {
    it(`${locale}: names page, template, frame and locale, the steps tried and the final scale`, () => {
      const doc = build(standIn({ ...tooLong, locale, markdown: moreMoney(4, locale === 'es' ? 'Más dinero' : 'More money') }));
      const ws = overflowsOf(doc);
      expect(ws).toHaveLength(1);
      const w = ws[0]!;
      expect(w).toMatchObject({ kind: 'frameOverflow', template: 'tema-cajas', frame: 'dinero', fenceIndex: 0, pageIndex: 0, locale, scale: 0.9, configPath: '/pageTemplates/0/frames/2' });
      expect(w.stepsTried).toEqual(['free', 'push', 'redistribute', 'shrinkText']);
      expect(w.overflowMm).toBeCloseTo(toMm(frameOf(doc, 'dinero').overflowPx), 1);
      expect(w.sourceStart).toBeGreaterThan(0);
      const text = formatWarning(w);
      expect(text).toContain(`Frame "dinero" of template "tema-cajas" (${locale})`);
      expect(text).toContain('text down to 90 %');
      expect(text).toContain('to fit:');
      // (The overlap checks' events, #1053, come after the ladder's.)
      expect(page0(doc).composed!.log.filter((e) => e.kind !== 'covered' && e.kind !== 'outside').slice(-2)).toEqual([{ frame: 'dinero', kind: 'textScaled', scale: 0.9 }, { frame: 'dinero', kind: 'overflow', toMm: w.overflowMm }]);
    });
  }

  it('allowShrink: the largest text scale that fits, worked out on the page', () => {
    const w = overflowsOf(build(standIn(tooLong)))[0]!;
    const p = proposal(w, 'allowShrink')!;
    expect(p.path).toBe('/pageTemplates/0/frames/2/fit/minScale');
    expect(p.value).toBeLessThan(0.9);
    const fitted = build(standIn({ ...tooLong, frames: { dinero: { ...tooLong.frames.dinero, fit: { minScale: p.value } } } }));
    expect(overflowsOf(fitted)).toEqual([]);
    expect(frameOf(fitted, 'dinero').scale).toBe(p.value);
    const short = build(standIn({ ...tooLong, frames: { dinero: { ...tooLong.frames.dinero, fit: { minScale: p.value + 0.025 } } } }));
    expect(overflowsOf(short)).toHaveLength(1);
    // With shrinkText off, the proposal turns it on as well.
    const off = overflowsOf(build(standIn({ ...tooLong, frames: { dinero: { ...tooLong.frames.dinero, fit: { shrinkText: false } } } })))[0]!;
    expect(proposal(off, 'allowShrink')!.also).toEqual([{ path: '/pageTemplates/0/frames/2/fit/shrinkText', value: true }]);
  });

  it('raiseMax: the frame’s height plus the shortfall, in whole millimetres, and it fits', () => {
    const w = overflowsOf(build(standIn(tooLong)))[0]!;
    const p = proposal(w, 'raiseMax')!;
    expect(p.path).toBe('/pageTemplates/0/frames/2/maxHeight');
    expect(p.value.unit).toBe('mm');
    expect(Number.isInteger(p.value.value)).toBe(true);
    expect(p.value.value).toBe(Math.ceil(36 + w.overflowMm - 0.05));
    const fitted = build(standIn({ ...tooLong, frames: { dinero: { ...tooLong.frames.dinero, maxHeight: p.value } } }));
    expect(overflowsOf(fitted)).toEqual([]);
  });

  it('lowerMin: a sibling at its minimum with less content gives the shortfall; fits once applied', () => {
    // An own-box stack: the three boxes share 140 mm; gasto stands at its 62 mm minimum.
    const groups: PageTemplate['groups'] = [{ name: 'cajas', kind: 'stack', frames: ['dinero', 'gasto', 'ahorro'], gap: mm(12), placement: { anchor: { to: '#texto', edge: 'below' }, offset: { y: mm(9) }, size: { width: mm(186), height: mm(150) } } }];
    const opts = { groups, frames: { dinero: { minHeight: mm(36) }, gasto: { minHeight: mm(62) }, ahorro: { minHeight: mm(30), fit: { shrinkText: false } } }, markdown: moreMoney(2) };
    // ahorro, the last box, keeps its minimum (#911) and is still short of
    // its text.
    const w = overflowsOf(build(standIn(opts))).find((x) => x.frame === 'ahorro');
    expect(w).toBeDefined();
    const p = proposal(w!, 'lowerMin')!;
    expect(p).toMatchObject({ frame: 'gasto', path: '/pageTemplates/0/frames/4/minHeight' });
    expect(p.value.value).toBeLessThan(62);
    const fitted = build(standIn({ ...opts, frames: { ...opts.frames, gasto: { minHeight: p.value } } }));
    expect(overflowsOf(fitted).filter((x) => x.frame === w!.frame)).toEqual([]);
  });

  it('useTemplate: another template of the book where the page fits once set with it', () => {
    // A full copy of the template whose `dinero` takes the height its text
    // needs: the page fits there.
    const base = standIn().config.pageTemplates![0]! as PageTemplate;
    const auto: PageTemplate = { ...base, id: 'tema-auto', frames: base.frames!.map((f) => (f.name === 'dinero' ? { ...f, height: 'auto' as const } : f)) };
    const tight: PageTemplate = { id: 'otra', frames: [{ name: 'dinero', height: mm(10) }] };
    const w = overflowsOf(build(standIn({ ...tooLong, more: [tight, auto] })))[0]!;
    expect(proposal(w, 'useTemplate')).toMatchObject({ kind: 'useTemplate', value: 'tema-auto' });
    const at = proposal(w, 'useTemplate')!;
    const md = standIn(tooLong).markdown;
    expect(md.slice(at.sourceStart!, at.sourceEnd!)).toBe('tema-cajas');
    // Applied, the page fits.
    const applied = build(standIn({ ...tooLong, more: [tight, auto], markdown: (m) => moreMoney(4)(m).replace('template="tema-cajas"', 'template="tema-auto"') }));
    expect(overflowsOf(applied)).toEqual([]);
  });

  it('useTemplate is not proposed for a template where the page overflows once its slots are regrouped (#937)', () => {
    // Only titulo, texto (flow) and dinero: the page's other slots (gasto,
    // ahorro, the photos) would go to texto, which grows and pushes dinero
    // off the page.
    const roomy: PageTemplate = {
      id: 'tema-amplio',
      frames: [
        { name: 'titulo', takes: 'h1' },
        { name: 'texto', flow: true, placement: { anchor: { to: '#titulo', edge: 'below' } } },
        { name: 'dinero', placement: { anchor: { to: '#texto', edge: 'below' } } },
      ],
    };
    const w = overflowsOf(build(standIn({ ...tooLong, more: [roomy] })))[0]!;
    expect(proposal(w, 'useTemplate')).toBeUndefined();
    // Applied all the same, it overflows: the proposal was right to stay out.
    const applied = build(standIn({ ...tooLong, more: [roomy], markdown: (m) => moreMoney(4)(m).replace('template="tema-cajas"', 'template="tema-amplio"') }));
    expect(overflowsOf(applied).length).toBeGreaterThan(0);
  });

  it('the useTemplate trial sets a merged story\'s paragraph groups as the build does (#953)', () => {
    // A template whose flow frame takes every slot of the page: the
    // `:::paragraphs` group in `ahorro` goes to `texto` after the text
    // there. Set in the group's style (30 pt) the page overflows; set in
    // the body style it fits, which is what the trial used to measure.
    const roomy: PageTemplate = {
      id: 'tema-amplio',
      frames: [
        { name: 'titulo', takes: 'h1' },
        { name: 'texto', flow: true, placement: { anchor: { to: '#titulo', edge: 'below' } } },
        { name: 'dinero', height: 'auto', placement: { anchor: { to: '#texto', edge: 'below' } } },
      ],
    };
    const group = `:::paragraphs{style="gran"}\n${'Palabras de relleno que ocupan sitio. '.repeat(50)}\n\n${'Otro párrafo de relleno que ocupa sitio. '.repeat(40)}\n:::\n\n`;
    const run = (fontSize: number) => {
      const f = standIn({
        frames: { dinero: { height: mm(14), minHeight: undefined } },
        more: [roomy],
        markdown: (md) => md.replace(/::resource\{[^}]*\}\n/g, '').replace(/(:::frame\{slot="ahorro"[^\n]*\n)/, `$1${group}`),
      });
      const config: PostextConfig = { ...f.config, paragraphStyles: [{ id: 'gran', fontSize: { value: fontSize, unit: 'pt' }, lineHeight: { value: fontSize * 1.15, unit: 'pt' } }] };
      const w = overflowsOf(build({ ...f, config }))[0]!;
      const applied = build({ ...f, config, markdown: f.markdown.replace('template="tema-cajas"', 'template="tema-amplio"') });
      return { proposed: proposal(w, 'useTemplate'), appliedOverflows: overflowsOf(applied).length };
    };
    // Control: the group at the body's size fits once set with the template.
    const small = run(12);
    expect(small.appliedOverflows).toBe(0);
    expect(small.proposed).toMatchObject({ kind: 'useTemplate', value: 'tema-amplio' });
    // Set in its own style the page overflows, and the template is not proposed.
    const big = run(30);
    expect(big.appliedOverflows).toBeGreaterThan(0);
    expect(big.proposed).toBeUndefined();
  });

  describe('the useTemplate trial of a regrouped page reads what is keyed by content index (#953)', () => {
    // Only titulo, texto (flow) and dinero: every other slot of the page
    // goes to texto, as appended boxes past the page's blocks.
    const flowing: PageTemplate = {
      id: 'tema-amplio',
      frames: [
        { name: 'titulo', takes: 'h1' },
        { name: 'texto', flow: true, placement: { anchor: { to: '#titulo', edge: 'below' } } },
        { name: 'dinero', height: 'auto', placement: { anchor: { to: '#texto', edge: 'below' } } },
      ],
    };
    const page = (patch: (c: PostextConfig) => PostextConfig) => {
      const f = standIn({
        frames: { dinero: { height: mm(14), minHeight: undefined } },
        more: [flowing],
        markdown: (md) => md.replace(/::resource\{[^}]*\}\n/g, ''),
      });
      const config = patch(f.config);
      const w = overflowsOf(build({ ...f, config }))[0]!;
      const applied = build({ ...f, config, markdown: f.markdown.replace('template="tema-cajas"', 'template="tema-amplio"') });
      return { proposed: proposal2(w, 'useTemplate'), appliedOverflows: overflowsOf(applied).length };
    };
    const proposal2 = (w: Overflow | undefined, kind: FrameOverflowProposal['kind']) => w?.proposals.find((p) => p.kind === kind);
    const dropCap = (lines: number) => (c: PostextConfig): PostextConfig => ({
      ...c,
      headings: { ...c.headings, levels: [c.headings!.levels![0]!, { ...c.headings!.levels![1]!, dropCap: { lines } }] } as never,
    });

    it('a heading level\'s drop cap opens the merged story\'s paragraph as it opens it in the build', () => {
      // Control: a small initial leaves room.
      const small = page(dropCap(6));
      expect(small.appliedOverflows).toBe(0);
      expect(small.proposed).toMatchObject({ kind: 'useTemplate', value: 'tema-amplio' });
      // A 26-line initial reserves lines the page does not have.
      const tall = page(dropCap(26));
      expect(tall.appliedOverflows).toBeGreaterThan(0);
      expect(tall.proposed).toBeUndefined();
    });

    it('a paragraph after a heading is set flush where indentAfterHeading is off, and the trial runs', () => {
      const r = page((c) => ({ ...c, bodyText: { ...c.bodyText, indentAfterHeading: false, firstLineIndent: mm(6) } as never }));
      expect(r.appliedOverflows).toBe(0);
      expect(r.proposed).toMatchObject({ kind: 'useTemplate', value: 'tema-amplio' });
    });
  });

  it('shortenText: about the characters of the lines that do not fit; cutting them makes it fit', () => {
    const f = standIn(tooLong);
    const w = overflowsOf(build(f))[0]!;
    const p = proposal(w, 'shortenText')!;
    expect(p.value).toBeGreaterThan(0);
    expect(p.sourceStart).toBe(w.sourceStart);
    // The same box with that many characters cut from the end of its added text.
    const added = Array.from({ length: 4 }, (_, i) => `Más dinero ${i} `.repeat(30).trim()).join('\n\n');
    const cut = added.slice(0, added.length - p.value).trim();
    const after = build(standIn({ ...tooLong, markdown: (md) => md.replace(/(:::frame\{slot="dinero"[^\n]*\n)/, `$1${cut}\n\n`) }));
    expect(overflowsOf(after)).toEqual([]);
  });

  it('continueNextPage: overflow.continueIn of the frame', () => {
    const w = overflowsOf(build(standIn(tooLong)))[0]!;
    expect(proposal(w, 'continueNextPage')).toEqual({ kind: 'continueNextPage', path: '/pageTemplates/0/frames/2/overflow/continueIn', value: 'next-page' });
  });

  it('words every step and proposal', () => {
    expect(describeFitStep('shrinkText', { scale: 0.9 })).toBe('text down to 90 %');
    expect(describeFitStep('scaleImages', { imageScale: 0.825 })).toBe('pictures down to 82.5 %');
    expect(describeFitStep('free')).toBe('free space');
    expect(describeReflowEvent({ frame: 'a', kind: 'textScaled', scale: 0.925 })).toBe('a: text at 92.5 %');
    expect(describeReflowEvent({ frame: 'a', kind: 'imageScaled', scale: 0.8 })).toBe('a: picture at 80 %');
    expect(describeFitStep('redistribute')).toBe('the other frames of its group down to their minimum');
    expect(describeFitStep('continue')).toContain('another page');
    expect(describeFrameOverflowProposal({ kind: 'allowShrink', path: '/x', value: 0.85 })).toBe('let its text shrink to 85 % (fit.minScale: 0.85)');
    expect(describeFrameOverflowProposal({ kind: 'raiseMax', path: '/x', value: mm(64) })).toBe('raise maxHeight to 64 mm');
    expect(describeFrameOverflowProposal({ kind: 'lowerMin', path: '/x', value: mm(40), frame: 'gasto' })).toBe('lower the minHeight of "gasto" to 40 mm');
    expect(describeFrameOverflowProposal({ kind: 'continueNextPage', path: '/x', value: 'next-page' })).toBe('continue on the next page (overflow.continueIn: "next-page")');
    expect(describeFrameOverflowProposal({ kind: 'useTemplate', value: 'b' })).toBe('set the page with template "b"');
    expect(describeFrameOverflowProposal({ kind: 'shortenText', value: 120 })).toBe('cut about 120 characters');
  });
});

describe('the ladder is deterministic and stays on its page (#858)', () => {
  it('the same input gives the same VDT, scales included', () => {
    const f = standIn({ frames: { dinero: { height: mm(36), minHeight: undefined } }, markdown: moreWords(40) });
    const a = build(f);
    const b = build(f);
    expect(frameOf(a, 'dinero').scale).toBeLessThan(1);
    expect(JSON.stringify(b.pages)).toBe(JSON.stringify(a.pages));
    expect(JSON.stringify(b.contentWarnings)).toBe(JSON.stringify(a.contentWarnings));
  });

  it('frames that overflow are taken in template order', () => {
    // Two frames that both overflow: the warnings follow the template.
    const t: PageTemplate = {
      id: 'two',
      frames: [
        { name: 'b', height: mm(10), width: mm(60), placement: { anchor: { to: 'container', edge: 'top-right' } } },
        { name: 'a', height: mm(10), width: mm(60), placement: { anchor: { to: 'container', edge: 'top-left' } } },
      ],
    };
    const long = 'word '.repeat(300);
    const md = `::::page{template="two"}\n:::frame{slot="a"}\n${long}\n:::\n\n:::frame{slot="b"}\n${long}\n:::\n::::`;
    const doc = buildDocument({ markdown: md }, { page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never, pageTemplates: [t] }, createMeasurementCache());
    expect(overflowsOf(doc).map((w) => w.frame)).toEqual(['b', 'a']);
  });

  it('what one composed page scales leaves the next one as it was', () => {
    const one = standIn({ frames: { dinero: { height: mm(36), minHeight: undefined } } });
    const page = one.markdown;
    const longer = moreWords(40)(page);
    const twice = (first: string) => ({ ...one, markdown: `${first}\n\n${page}` });
    const before = build(twice(page));
    const after = build(twice(longer));
    const pages = (d: VDTDocument) => d.pages.filter((p) => p.composed);
    expect(pages(before)).toHaveLength(2);
    expect(pages(after)).toHaveLength(2);
    expect(pages(after)[0]!.composed!.frames.find((f) => f.name === 'dinero')!.scale).toBeLessThan(1);
    const boxes = (p: VDTPage) => p.composed!.frames.map((f) => ({ name: f.name, rect: f.rect, scale: f.scale, imageScale: f.imageScale, overflowPx: f.overflowPx }));
    expect(boxes(pages(after)[1]!)).toEqual(boxes(pages(before)[1]!));
    expect(pages(after)[1]!.composed!.log).toEqual(pages(before)[1]!.composed!.log);
  });
});

describe('slot warnings carry their location (#858)', () => {
  it('slotUnknown names the flow frame that takes the content; both have page, frame and source range', () => {
    const t: PageTemplate = { id: 't', frames: [{ name: 'a', flow: true }, { name: 'b' }, { name: 'c' }] };
    const md = `# Intro\n\n${'Some text. '.repeat(400)}\n\n::::page{template="t"}\nflow\n\n:::frame{slot="nope"}\nStray.\n:::\n\n:::frame{slot="b"}\nB.\n:::\n::::\n`;
    const doc = buildDocument({ markdown: md }, { page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never, pageTemplates: [t] }, createMeasurementCache());
    const composed = doc.pages.find((p) => p.composed)!;
    expect(composed.index).toBeGreaterThan(0);
    const unknown = doc.contentWarnings!.find((w) => w.kind === 'slotUnknown')!;
    expect(unknown).toMatchObject({ kind: 'slotUnknown', slot: 'nope', frame: 'a', template: 't', pageIndex: composed.index });
    expect(md.slice(unknown.sourceStart!, unknown.sourceEnd!)).toBe('nope');
    const empty = doc.contentWarnings!.find((w) => w.kind === 'slotEmpty')!;
    expect(empty).toMatchObject({ kind: 'slotEmpty', frame: 'c', template: 't', pageIndex: composed.index });
    expect(md.slice(empty.sourceStart!, empty.sourceEnd!)).toMatch(/^::::page\{template="t"\}/);
    expect(formatWarning(unknown)).toContain('the flow frame "a"');
  });
});

describe('the ladder with spreads, the page memo and the source map (#858)', () => {
  const PAGE: PostextConfig = {
    page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
    headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
  };
  const W = 200 * MM;
  const buildWith = (md: string, templates: PageTemplate[]): VDTDocument => buildDocument({ markdown: md }, { ...PAGE, pageTemplates: templates }, createMeasurementCache());
  const words = (n: number, w = 'word'): string => Array.from({ length: n }, (_, i) => `${w}${i}`).join(' ');

  it('a spread: the gutter cut narrows a frame, the ladder shrinks its text; a frame of the second page is scaled on its own sheet', () => {
    const t: PageTemplate = {
      id: 'sp', spread: true, gutter: mm(20),
      frames: [
        // Centred on the spine: cut at the band's edge, on the first page.
        { name: 'cut', height: mm(40), placement: { anchor: { to: 'container', edge: 'top-left' } } },
        { name: 'right', width: mm(60), height: mm(30), placement: { anchor: { to: 'container', edge: 'bottom-right' } } },
      ],
    };
    const md = (cut: number, right: number) => `::::page{template="sp" spread}\n:::frame{slot="cut"}\n${words(cut, 'cut')}\n:::\n\n:::frame{slot="right"}\n${words(right, 'right')}\n:::\n::::\n`;
    const doc = buildWith(md(400, 94), [t]);
    const [verso, recto] = doc.pages.filter((p) => p.composed?.spread) as [VDTPage, VDTPage];
    const cut = verso.composed!.frames.find((f) => f.name === 'cut' && f.blockIds.length > 0)!;
    expect(verso.composed!.log.find((e) => e.frame === 'cut' && e.cause === 'gutter')).toMatchObject({ kind: 'resized' });
    expect(cut.scale).toBeLessThan(1);
    expect(cut.overflowPx).toBe(0);
    expect(frameBounds(cut).x + frameBounds(cut).width).toBeLessThanOrEqual(W - 10 * MM + 1e-6);
    expect(verso.composed!.log).toContainEqual({ frame: 'cut', kind: 'textScaled', scale: cut.scale });
    const right = recto.composed!.frames.find((f) => f.name === 'right')!;
    expect(right.scale).toBeLessThan(1);
    expect(right.overflowPx).toBe(0);
    const b = frameBounds(right);
    expect(b.x).toBeGreaterThan(0);
    expect(b.x + b.width).toBeLessThanOrEqual(W + 1e-6);
    // Its blocks are on its own page, laid out in its larger content box.
    const content = frameContentRect(right);
    for (const id of right.blockIds) {
      const blk = recto.floats!.find((x) => x.id === id)!;
      expect(blk.pageIndex).toBe(recto.index);
      expect(blk.bbox.x).toBeGreaterThanOrEqual(content.x - 0.5);
      expect(blk.bbox.x + blk.bbox.width).toBeLessThanOrEqual(content.x + content.width + 0.5);
    }
  });

  it('the page memo keys the ladder: a reused page with scaled frames and a warning is the page laid out afresh', () => {
    const f = standIn({ frames: { dinero: { height: mm(36), minHeight: undefined }, gasto: { height: mm(30), minHeight: undefined } }, markdown: moreWords(40) });
    const md = `${f.markdown}\n${f.markdown.replace('tema="Retos del planeta"', 'tema="Otro"')}`;
    const shape = (doc: VDTDocument): string => JSON.stringify({ pages: doc.pages, blocks: doc.blocks, warnings: doc.contentWarnings ?? [] }, (k, v: unknown) => (k === 'layoutKey' ? undefined : v));
    const run = (text: string) => buildDocument({ markdown: text, resources: f.resources }, f.config, createMeasurementCache());
    setComposedPageMemo(false);
    let expected: string;
    try {
      expected = shape(run(md));
    } finally {
      setComposedPageMemo(true);
    }
    clearComposedPageMemo();
    // Laid out first where every offset is elsewhere, then met again.
    run(`Una línea antes.\n\n:::pagebreak\n\nOtra línea.\n\n${md}`);
    const before = composedPageMemoStats().hits;
    const doc = run(md);
    expect(composedPageMemoStats().hits).toBeGreaterThan(before);
    expect(shape(doc)).toBe(expected);
    const pages = doc.pages.filter((p) => p.composed);
    expect(pages[0]!.composed!.frames.find((x) => x.name === 'dinero')!.scale).toBeLessThan(1);
    const w = overflowsOf(doc).find((x) => x.frame === 'gasto')!;
    expect(w.proposals.find((p) => p.kind === 'shortenText')!.sourceStart).toBe(w.sourceStart);
    expect(md.slice(w.sourceStart!, w.sourceStart! + 3)).toBe(md.slice(frameOf(doc, 'gasto').sourceStart!, frameOf(doc, 'gasto').sourceStart! + 3));
    clearComposedPageMemo();
  });

  it('the source map reads a scaled frame where it is painted', () => {
    const doc = build(standIn({ frames: { dinero: { height: mm(36), minHeight: undefined } }, markdown: moreWords(40) }));
    const page = page0(doc);
    const d = frameOf(doc, 'dinero');
    expect(d.scale).toBeLessThan(1);
    const para = d.blockIds.map((id) => page.floats!.find((b) => b.id === id)!).find((b) => b.type === 'paragraph' && b.lines.length > 1)!;
    const line = para.lines[para.lines.length - 1]!;
    // Where the line is painted: its laid box scaled about the frame's top-left.
    const painted = { x: d.rect.x + (line.bbox.x + 10 - d.rect.x) * d.scale, y: d.rect.y + (line.bbox.y + line.bbox.height / 2 - d.rect.y) * d.scale };
    const hit = sourceAt(doc, page.index, painted.x, painted.y);
    const lineHit = hit.find((e) => e.level === 'line')!;
    expect(lineHit).toBeDefined();
    expect(lineHit.rect!.x).toBeLessThanOrEqual(painted.x);
    expect(lineHit.rect!.x + lineHit.rect!.width).toBeGreaterThanOrEqual(painted.x);
    expect(lineHit.rect!.y).toBeLessThanOrEqual(painted.y);
    expect(lineHit.rect!.y + lineHit.rect!.height).toBeGreaterThanOrEqual(painted.y);
    expect(lineHit.rect!.height).toBeCloseTo(line.bbox.height * d.scale, 6);
    expect(hit.find((e) => e.level === 'frame')!.id).toBe(d.id);
    // The same line found from its Markdown has the same box.
    const found = elementsForSource(doc, lineHit.source.kind === 'markdown' ? lineHit.source.start : 0, lineHit.source.kind === 'markdown' ? lineHit.source.start : 0).find((m) => m.element.id === lineHit.id)!;
    expect(found.element.rect).toEqual(lineHit.rect);
    // Under the painted box, nothing of the frame's content: the frame's foot is its rect's.
    const below = sourceAt(doc, page.index, d.rect.x + 20, d.rect.y + d.rect.height + 2);
    expect(below.find((e) => e.id === d.id)).toBeUndefined();
  });
});
