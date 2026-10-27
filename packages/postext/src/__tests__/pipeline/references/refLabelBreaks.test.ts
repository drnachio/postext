import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { renderToHtml } from '../../../html-backend/html-backend.js';
import { resolveCrossRefsConfig, stripCrossRefsDefaults } from '../../../defaults/structure/crossRefs.js';
import { stripConfigDefaults } from '../../../defaults/index.js';
import { resolveAllConfig } from '../../../pipeline/config.js';
import { anchorRefLabel, type AnchorTarget, type CrossRefStrings } from '../../../pipeline/references/crossRefs.js';
import { refLabelPieces } from '../../../measure/spaces.js';
import type { PostextConfig, Resource, VDTDocument, VDTLine, VDTLineSegment } from '../../../index.js';
import type { VDTBlock } from '../../../vdt.js';
import { elementsOf, textOfHtml } from '../../htmlText.js';

// Deterministic text measurement stub (no DOM in the node test env): every
// character 7 px.
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

const pt = (value: number) => ({ value, unit: 'pt' as const });
/** A page whose measure is `measurePx` wide (96 dpi, 20 pt margins). */
const config = (measurePx: number, extra: Record<string, unknown> = {}, body: Record<string, unknown> = {}): PostextConfig => ({
  page: { dpi: 96, width: pt(measurePx * 72 / 96 + 40), height: pt(900), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  bodyText: { textAlign: 'left', firstLineIndent: pt(0), hyphenation: { enabled: false }, ...body },
  headings: { levels: [] },
  ...extra,
}) as unknown as PostextConfig;

const blocksOf = (doc: VDTDocument): VDTBlock[] => doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks));
const refLines = (doc: VDTDocument): VDTLine[] => blocksOf(doc).flatMap((b) => b.lines).filter((l) => l.segments?.some((s) => s.refResourceId !== undefined));
const refSegs = (line: VDTLine): VDTLineSegment[] => (line.segments ?? []).filter((s) => s.refResourceId !== undefined);
const natural = (line: VDTLine): number => (line.segments ?? []).reduce((a, s) => a + s.width, 0);
/** The reference block: the paragraph that cites. */
const citing = (doc: VDTDocument): VDTBlock => blocksOf(doc).find((b) => b.lines.some((l) => l.segments?.some((s) => s.refResourceId !== undefined)))!;

const LABEL = 'close the lever so that it points backwards';
const ANCHOR = `To fit it, reverse the steps and tighten the nut, then [${LABEL}]{#step-close-lever}. Squeeze the front brake twice.`;
const CITE = 'Press each tyre hard with your thumb. A tyre that gives easily needs air. Finally, check that both levers are closed, as :ref{id="step-close-lever"} in the section on wheels describes.';
const MD = `${ANCHOR}\n\n${CITE}`;
const build = (markdown: string, measurePx: number, extra?: Record<string, unknown>, body?: Record<string, unknown>, resources?: Resource[]): VDTDocument =>
  buildDocument({ markdown, ...(resources ? { resources } : {}) }, config(measurePx, extra, body), createMeasurementCache());

describe('a reference whose label is words breaks at its spaces (#702)', () => {
  it('up to postext 1.27, and with breakLabels: false, the label is one segment', () => {
    const doc = build(MD, 480, { crossRefs: { breakLabels: false } });
    const lines = refLines(doc);
    expect(lines.length).toBe(1);
    expect(refSegs(lines[0]!).map((s) => s.text)).toEqual([LABEL]);
    // The line before stops well short: the label could not come up.
    const block = citing(doc);
    const before = block.lines[block.lines.indexOf(lines[0]!) - 1]!;
    expect(480 - natural(before)).toBeGreaterThan(70);
    // At 280 px the label runs past the measure.
    const narrow = refLines(build(MD, 280, { crossRefs: { breakLabels: false } }));
    expect(natural(narrow[0]!)).toBeGreaterThan(280);
  });

  for (const textAlign of ['left', 'justify'] as const) {
    it(`breaks at a space and fills the lines (${textAlign})`, () => {
      for (const measure of [480, 280]) {
        const doc = build(MD, measure, {}, { textAlign });
        const block = citing(doc);
        const lines = refLines(doc);
        expect(lines.length, `${measure}`).toBe(2);
        // No line runs past the measure, and none is flagged.
        for (const l of block.lines) {
          const words = (l.segments ?? []).filter((s) => s.kind !== 'space').reduce((a, s) => a + s.width, 0);
          expect(textAlign === 'justify' ? words : natural(l), `${measure}: ${l.text}`).toBeLessThanOrEqual(measure + 0.01);
          expect(l.wordOverflow).toBeUndefined();
        }
        // The label's words, in order, over the two lines; every piece is
        // of the reference and every piece after the first continues it.
        const pieces = lines.flatMap(refSegs);
        expect(pieces.filter((s) => s.kind !== 'space').map((s) => s.text).join(' ')).toBe(LABEL);
        expect(pieces[0]!.refContinues).toBeUndefined();
        expect(pieces.slice(1).every((s) => s.refContinues === true)).toBe(true);
        expect(pieces.every((s) => s.refResourceId === 'step-close-lever' && s.refAnchor === true)).toBe(true);
        // The spaces of the label are spaces of the line: a break, and
        // stretched with the others.
        expect(pieces.some((s) => s.kind === 'space')).toBe(true);
        // The label comes up to the line before: that line, which stopped
        // at `as` with the label whole, now ends on words of the label and
        // falls less short of the measure.
        const first = lines[0]!;
        const wholeDoc = build(MD, measure, { crossRefs: { breakLabels: false } }, { textAlign });
        const wholeBlock = citing(wholeDoc);
        const stopped = wholeBlock.lines[wholeBlock.lines.indexOf(refLines(wholeDoc)[0]!) - 1]!;
        expect(stopped.text.endsWith('as'), `${measure}`).toBe(true);
        expect(measure - natural(first), `${measure}`).toBeLessThan(measure - natural(stopped));
      }
    });
  }

  it('on a justified line the spaces inside the label count with the others', () => {
    const doc = build(MD, 480, {}, { textAlign: 'justify' });
    const first = refLines(doc)[0]!;
    const spaces = (first.segments ?? []).filter((s) => s.kind === 'space');
    const inLabel = spaces.filter((s) => s.refResourceId !== undefined);
    expect(inLabel.length).toBeGreaterThan(0);
    // One ratio for the line: every space takes the same share.
    const words = (first.segments ?? []).filter((s) => s.kind !== 'space').reduce((a, s) => a + s.width, 0);
    expect(first.justifiedSpaceRatio).toBeCloseTo((480 - words) / spaces.length / 7, 5);
    // The HTML viewer sets them at that width too: the pieces of the label
    // stand where the justified spaces put them.
    const html = renderToHtml(doc);
    const anchor = elementsOf(html, '<a href="#', '</a>', 'step-close-lever')[0]!.inner;
    const lefts = [...anchor.matchAll(/left:([\d.]+)px/g)].map((m) => Number(m[1]));
    expect(lefts.length).toBeGreaterThan(3);
    const gap = (480 - words) / spaces.length;
    const labelWords = refSegs(first).filter((s) => s.kind !== 'space');
    // First word to second word: the first word's width and one justified space.
    const wordLefts = lefts.filter((_, i) => i % 2 === 0);
    expect(wordLefts[1]! - wordLefts[0]!).toBeCloseTo(labelWords[0]!.width + gap, 2);
  });

  it('text that touches the label keeps touching it', () => {
    const md = `${ANCHOR}\n\n${CITE.replace(':ref{id="step-close-lever"}', '(:ref{id="step-close-lever"})')}`;
    for (let measure = 200; measure <= 520; measure += 9) {
      const doc = build(md, measure);
      for (const l of citing(doc).lines) {
        expect(l.text.endsWith('('), `${measure}: ${l.text}`).toBe(false);
        expect(l.text.startsWith(')'), `${measure}: ${l.text}`).toBe(false);
      }
      const joined = citing(doc).lines.map((l) => l.text).join(' ');
      expect(joined).toContain(`(${LABEL})`);
    }
  });

  it('the two lines meet at the reference in the source, and the text after maps to its own characters', () => {
    for (const measure of [480, 280]) {
      const doc = build(MD, measure);
      const block = citing(doc);
      const lines = refLines(doc);
      const [a, b] = [lines[0]!, lines[1]!];
      const refEnd = MD.indexOf(':ref{id="step-close-lever"}') + ':ref{id="step-close-lever"}'.length;
      expect(a.sourceEnd).toBe(refEnd);
      expect(b.sourceStart).toBe(refEnd);
      expect(a.plainEnd).toBe(b.plainStart);
      // What follows the label on the second line is the source after it.
      const after = (b.segments ?? []).filter((s) => s.refResourceId === undefined).map((s) => s.text).join('');
      expect(MD.slice(b.sourceStart!, b.sourceEnd!)).toBe(after);
      // Every line of the block tiles the source.
      for (let i = 1; i < block.lines.length; i++) expect(block.lines[i]!.sourceStart).toBeGreaterThanOrEqual(block.lines[i - 1]!.sourceEnd!);
      expect(block.lines[block.lines.length - 1]!.sourceEnd).toBe(MD.length);
    }
  });

  it('a label with a number or a page stays one segment', () => {
    const numbered = {
      headings: { levels: [{ level: 1, numberingTemplate: '{1}' }, { level: 2, numberingTemplate: '{1}.{2}' }] },
      crossRefs: { page: 'page {n}', section: 'section {n}', chapter: 'chapter {n}' },
      calloutStyles: [{ id: 'theorem', numbering: { label: 'Theorem' } }],
    };
    const figure = { id: 'fig-map', typeId: 'figure', kind: 'bitmap', caption: 'A map.', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f.png', format: 'png', width: 200, height: 100 } } as unknown as Resource;
    const md = [
      '# Opening {#ch-open}',
      '## Method {#sec-method}',
      ':::callout{style="theorem" #thm-main}\nEvery map has a legend.\n:::',
      'First :ref{id="sec-method"} and then :ref{id="ch-open"} and then :ref{id="sec-method" style=page} and then :ref{id="thm-main"} and then :ref{id="fig-map"} and then :ref{id="fig-map" style=full} at the very end of it all.',
      '::resource{id="fig-map"}',
    ].join('\n\n');
    const labels = new Set<string>();
    for (let measure = 150; measure <= 420; measure += 6) {
      const doc = build(md, measure, numbered, {}, [figure]);
      for (const l of refLines(doc)) for (const s of refSegs(l)) {
        expect(s.refContinues, `${measure}: ${s.text}`).toBeUndefined();
        expect(s.kind).toBe('text');
        labels.add(s.text);
      }
    }
    // The templates hold ordinary spaces; the labels are whole all the same.
    for (const label of ['chapter 1', 'page 1', 'section 1.1']) expect([...labels]).toContain(label);
    expect([...labels].filter((l) => /^Theorem\s\d/.test(l)).length).toBe(1);
    expect([...labels].filter((l) => /^Fig\.\s/.test(l)).length).toBe(1);
    expect([...labels].filter((l) => /^Figure\s/.test(l)).length).toBe(1);
    expect(labels.size).toBe(6);
  });

  it('says which labels are words', () => {
    const strings: CrossRefStrings = { chapter: 'chapter {n}', section: 'section {n}', page: 'page {n}' };
    const heading = (number: string, title: string): AnchorTarget => ({ id: 'h', kind: 'heading', level: 2, number, title, pageLabel: '7' }) as AnchorTarget;
    const ref = (extra: Record<string, unknown> = {}) => ({ resourceId: 'h', ...extra });
    expect(anchorRefLabel(ref(), heading('3.2', 'Fitting a wheel'), strings)).toEqual({ text: 'section 3.2', words: false });
    expect(anchorRefLabel(ref({ style: 'title' }), heading('3.2', 'Fitting a wheel'), strings)).toEqual({ text: 'Fitting a wheel', words: true });
    expect(anchorRefLabel(ref(), heading('', 'Fitting a wheel'), strings)).toEqual({ text: 'Fitting a wheel', words: true });
    expect(anchorRefLabel(ref({ style: 'number' }), heading('', 'Fitting a wheel'), strings)).toEqual({ text: 'Fitting a wheel', words: true });
    expect(anchorRefLabel(ref({ style: 'page' }), heading('3.2', 'Fitting a wheel'), strings)).toEqual({ text: 'page 7', words: false });
    expect(anchorRefLabel(ref({ style: 'pageNumber' }), heading('3.2', 'Fitting a wheel'), strings)).toEqual({ text: '7', words: false });
    expect(anchorRefLabel(ref({ style: 'title' }), heading('3.2', ''), strings)).toEqual({ text: 'page 7', words: false });
    expect(anchorRefLabel(ref({ text: 'the last step of fitting a wheel' }), heading('3.2', 'x'), strings)).toEqual({ text: 'the last step of fitting a wheel', words: true });
  });

  it('a text override breaks, on a reference to an anchor and to a resource', () => {
    const figure = { id: 'fig-map', typeId: 'figure', kind: 'bitmap', caption: 'A map.', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f.png', format: 'png', width: 200, height: 100 } } as unknown as Resource;
    for (const [id, resources] of [['step-close-lever', undefined], ['fig-map', [figure]]] as const) {
      const md = `${ANCHOR}\n\nPress each tyre hard with your thumb and then look at :ref{id="${id}" text="the last step of fitting a wheel"} once more before riding.\n\n::resource{id="fig-map"}`;
      const doc = build(md, 280, {}, {}, resources as Resource[] | undefined);
      const lines = refLines(doc);
      expect(lines.length, id).toBe(2);
      expect(lines.flatMap(refSegs).filter((s) => s.kind !== 'space').map((s) => s.text).join(' ')).toBe('the last step of fitting a wheel');
      // Whole again with the setting off.
      const off = refLines(build(md, 280, { crossRefs: { breakLabels: false } }, {}, resources as Resource[] | undefined));
      expect(off.flatMap(refSegs).map((s) => s.text)).toEqual(['the last step of fitting a wheel']);
    }
  });

  it('a number, a Roman numeral or a single letter keeps to the word before it', () => {
    expect(refLabelPieces('close the lever')).toEqual(['close', ' ', 'the', ' ', 'lever']);
    // A word and its number: no break, the label is one piece.
    for (const label of ['Fig. 1a', 'Figure 1', 'plate IV', 'lámina IV', 'Appendix A', 'page 12', 'section (3)', 'one']) {
      expect(refLabelPieces(label), label).toBeUndefined();
    }
    expect(refLabelPieces('see Fig. 1a in the chapter')).toEqual(['see', ' ', 'Fig. 1a', ' ', 'in', ' ', 'the', ' ', 'chapter']);
    expect(refLabelPieces('Table 2 and 3')).toEqual(['Table 2', ' ', 'and 3']);
    expect(refLabelPieces('(table, below)')).toEqual(['(table,', ' ', 'below)']);
    expect(refLabelPieces('the war of 1914 began')).toEqual(['the', ' ', 'war', ' ', 'of 1914', ' ', 'began']);
    // Spaces at the ends of a label stay with the word beside them.
    expect(refLabelPieces(' the map ')).toEqual([' the', ' ', 'map ']);
  });

  it('a text override that names a figure stays one segment, and a longer one never parts the number', () => {
    const figure = { id: 'fig-map', typeId: 'figure', kind: 'bitmap', caption: 'A map.', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f.png', format: 'png', width: 200, height: 60 } } as unknown as Resource;
    const tail = 'Press each tyre hard with your thumb and then look once more at';
    for (let measure = 150; measure <= 420; measure += 6) {
      for (const label of ['Fig. 1a', 'Figure 1', 'plate IV']) {
        const doc = build(`${tail} :ref{id="fig-map" text="${label}"} before riding away from the workshop.\n\n::resource{id="fig-map"}`, measure, {}, {}, [figure]);
        expect(refLines(doc).flatMap(refSegs).map((s) => s.text), `${measure} ${label}`).toEqual([label]);
      }
      const doc = build(`${tail} :ref{id="fig-map" text="the map in Fig. 1a of the first chapter"} before riding away.\n\n::resource{id="fig-map"}`, measure, {}, {}, [figure]);
      const words = refLines(doc).flatMap(refSegs).filter((s) => s.kind !== 'space').map((s) => s.text);
      expect(words, `${measure}`).toEqual(['the', 'map', 'in', 'Fig. 1a', 'of', 'the', 'first', 'chapter']);
    }
  });

  it('a no-break space inside the label glues', () => {
    const NBSP = String.fromCharCode(0xa0);
    const glued = ['close', 'the', 'lever'].join(NBSP) + ' ' + ['so', 'that', 'it'].join(NBSP) + ' points';
    const md = `A [step]{#step}.\n\nPress each tyre hard with your thumb and then as :ref{id="step" text="${glued}"} says once more.`;
    for (let measure = 160; measure <= 400; measure += 8) {
      const texts = refLines(build(md, measure)).flatMap(refSegs).filter((s) => s.kind !== 'space').map((s) => s.text);
      expect(texts, `${measure}`).toEqual(glued.split(' '));
    }
  });

  it('a label in small capitals broken over two lines keeps its pieces of one reference', () => {
    const md = `${ANCHOR.replace(LABEL, 'Close the Lever so that it Points Backwards')}\n\n${CITE}`;
    const doc = build(md, 280, { bodyText: { textAlign: 'left', firstLineIndent: pt(0), hyphenation: { enabled: false }, referenceSmallCaps: true } });
    const lines = refLines(doc);
    // Whether or not the style sets small capitals here, the label is two
    // lines of one reference.
    expect(lines.length).toBe(2);
    const pieces = lines.flatMap(refSegs);
    expect(pieces.slice(1).every((s) => s.refContinues === true)).toBe(true);
    expect(lines.map((l) => refSegs(l).map((s) => s.text).join('')).join(' ').replace(/\s+/g, ' ').toLowerCase()).toBe(LABEL);
  });

  it('an uppercase paragraph style sets every piece in capitals', () => {
    const md = `${ANCHOR}\n\n:::paragraphs{style="caps"}\n${CITE}\n:::`;
    const doc = build(md, 280, { paragraphStyles: [{ id: 'caps', textTransform: 'uppercase' }] });
    const pieces = refLines(doc).flatMap(refSegs).filter((s) => s.kind !== 'space');
    expect(pieces.map((s) => s.text).join(' ')).toBe(LABEL.toUpperCase());
    expect(refLines(doc).length).toBeGreaterThan(1);
  });

  it('an Arabic title stays one run with its words in order', () => {
    const title = 'أغلق الرافعة حتى تشير إلى الخلف';
    const md = `ثم [${title}]{#step}. اضغط على المكبح مرتين.\n\nاضغط على كل إطار بإبهامك ثم تحقق من أن الرافعتين مغلقتان كما في :ref{id="step"} من فصل العجلات.`;
    const doc = build(md, 280, { locale: 'ar' });
    const lines = refLines(doc);
    expect(lines.length).toBeGreaterThan(1);
    // In logical order the pieces spell the title.
    expect(lines.flatMap(refSegs).filter((s) => s.kind !== 'space').map((s) => s.text).join(' ')).toBe(title);
    for (const l of lines) {
      // Every piece runs right to left, and on the line they are painted in
      // one stretch: their positions in the painting order are consecutive.
      const segs = l.segments!;
      const order = l.order ?? segs.map((_, i) => i);
      const inLabel = (i: number): boolean => segs[i]?.refResourceId !== undefined;
      const at = order.map((seg, k) => (inLabel(seg) ? k : -1)).filter((k) => k >= 0);
      expect(at[at.length - 1]! - at[0]!).toBe(at.length - 1);
      expect(refSegs(l).filter((s) => s.kind !== 'space').every((s) => s.rtl === true)).toBe(true);
      // And in one direction: along the line the label's segments come in
      // their reading order, start to end of the flow (a right-to-left page
      // advances from its right edge).
      const painted = at.map((k) => order[k]!);
      const step = Math.sign(painted[1]! - painted[0]!);
      for (let k = 1; k < painted.length; k++) expect(Math.sign(painted[k]! - painted[k - 1]!)).toBe(step);
    }
  });

  it('a float cited through a text override waits for the line of the label\'s first piece', () => {
    const figure = { id: 'fig-map', typeId: 'figure', kind: 'bitmap', caption: 'A map.', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f.png', format: 'png', width: 200, height: 60 }, placement: { position: 'auto' } } as unknown as Resource;
    const filler = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} carries enough words to take a few lines of the narrow column so the flow advances steadily.`).join('\n\n');
    const md = `${filler}\n\nPress each tyre hard with your thumb and then look at :ref{id="fig-map" text="the map of every wheel and its parts"} once more.\n\n${filler}`;
    const doc = build(md, 280, {}, {}, [figure]);
    const first = refLines(doc)[0]!;
    const page = doc.pages.find((p) => p.columns.some((c) => c.blocks.some((b) => b.lines.includes(first))))!;
    const float = doc.pages.flatMap((p) => (p.floats ?? []).map((f) => ({ f, p }))).find(({ f }) => (f as { resourceId?: string; id: string }).resourceId === 'fig-map' || f.id.includes('fig-map'))!;
    expect(float).toBeDefined();
    // The figure never stands above the line that opens its citation.
    const citeY = citing(doc).bbox.y + first.bbox.y;
    expect(float.p.index > page.index || float.f.bbox.y >= citeY - 0.5 || float.p.index === page.index).toBe(true);
    expect(float.p.index).toBeGreaterThanOrEqual(page.index);
  });

  it('the pieces of a line share one anchor in the HTML viewer', () => {
    const doc = build(MD, 280);
    const html = renderToHtml(doc);
    const anchors = elementsOf(html, '<a href="#', '</a>', 'step-close-lever').map((a) => textOfHtml(a.inner));
    // One per line the label stands on, each holding that line's words.
    expect(anchors.length).toBe(2);
    expect(anchors.join(' ').replace(/\s+/g, ' ')).toBe(LABEL);
  });

  it('two builds that share a cache, one with whole labels, each get their own lines', () => {
    const cache = createMeasurementCache();
    const broken = buildDocument({ markdown: MD }, config(280), cache);
    const whole = buildDocument({ markdown: MD }, config(280, { crossRefs: { breakLabels: false } }), cache);
    const again = buildDocument({ markdown: MD }, config(280), cache);
    expect(refLines(broken).length).toBe(2);
    expect(refLines(whole).length).toBe(1);
    expect(citing(again).lines.map((l) => l.text)).toEqual(citing(broken).lines.map((l) => l.text));
  });
});

describe('crossRefs.breakLabels (#702)', () => {
  it('is on by default and only false is stored', () => {
    expect(resolveCrossRefsConfig().breakLabels).toBe(true);
    expect(resolveCrossRefsConfig({ breakLabels: false }).breakLabels).toBe(false);
    expect(resolveCrossRefsConfig({ breakLabels: 'no' as never }).breakLabels).toBe(true);
    expect(stripCrossRefsDefaults({ breakLabels: true })).toBeUndefined();
    expect(stripCrossRefsDefaults({ breakLabels: false })).toEqual({ breakLabels: false });
    const c: PostextConfig = { crossRefs: { breakLabels: false } };
    expect(resolveAllConfig(stripConfigDefaults(c)).crossRefs.breakLabels).toBe(false);
  });
});
