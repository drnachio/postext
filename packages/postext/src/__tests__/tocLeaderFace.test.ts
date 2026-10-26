import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline/index.js';
import { findPxSize, parseFontString } from '../measure/fontString.js';
import { resolveTocConfig, stripTocDefaults } from '../defaults/structure/toc.js';
import { resolveBodyTextConfig } from '../defaults/text/bodyText.js';
import { renderToHtml } from '../html-backend/html-backend.js';
import type { DesignSlot, PostextConfig } from '../types.js';
import type { VDTBlock, VDTDesignTextBlock, VDTDocument, VDTLineSegment } from '../vdt.js';

// #1121: the contents' leader in a colour, face, size and weight of its
// own, on the entry rows (`toc.leader`) and the part rows (`{leader}`,
// `toc.parts.leader` over `toc.leader`); a part row of three elements whose
// leader stops before a page number set in its own element.

const sizeOf = (font: string): number => Number(findPxSize(font)?.value ?? NaN);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    // Wider letters in a bigger face, so a leader's size shows in its count.
    const size = sizeOf(this.font) || 10;
    return { width: s.length * size * 0.6 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

const book = `:::toc

:::part{number="I" title="Foundations"}
:::

# One

Text.

# Two

Text.`;

const config = (toc: NonNullable<PostextConfig['toc']>): PostextConfig => ({
  page: { width: pt(360), height: pt(300), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  layout: { layoutType: 'single' },
  toc: { ...toc, parts: { enabled: true, ...toc.parts } },
});

const entryLeader = (doc: VDTDocument): VDTLineSegment | undefined => doc.blocks
  .flatMap((b) => b.lines.flatMap((l) => l.segments ?? []))
  .find((s) => s.leader === 'text');
const partRow = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.tocPart !== undefined && b.pageIndex === 0)!;
const texts = (b: VDTBlock): VDTDesignTextBlock[] => b.designOverlay!.blocks.filter((x): x is VDTDesignTextBlock => x.kind === 'text');

describe('the contents leader face (#1121)', () => {
  it('resolves only what is set and strips it back', () => {
    const body = resolveBodyTextConfig();
    const plain = resolveTocConfig({}, body);
    expect(plain.leader).toEqual({ enabled: true, char: '.', gap: { value: 0.5, unit: 'em' } });
    expect(plain.parts.leader).toBeUndefined();
    const own = { leader: { color: hex('#c0392b'), fontSize: pt(7) }, parts: { leader: { fontWeight: 700 } } };
    const r = resolveTocConfig(own, body);
    expect(r.leader).toMatchObject({ color: hex('#c0392b'), fontSize: pt(7) });
    expect(r.parts.leader).toEqual({ fontWeight: 700 });
    expect(stripTocDefaults(own)).toEqual(own);
  });

  it('sets an entry row\'s leader in the page number\'s face when it has none of its own', () => {
    const doc = buildDocument({ markdown: book }, config({ pageNumber: { fontFamily: 'Lora', color: hex('#222222') } }));
    const dots = entryLeader(doc)!;
    expect(dots).toBeDefined();
    expect(dots.color).toBe('#222222');
    expect(dots.fontString).toContain('Lora');
  });

  it('sets an entry row\'s leader in its own colour, face, size and weight', () => {
    const doc = buildDocument({ markdown: book }, config({
      pageNumber: { fontFamily: 'Lora', fontSize: pt(10) },
      leader: { color: hex('#c0392b'), fontFamily: 'Inter', fontSize: pt(6), fontWeight: 700 },
    }));
    const dots = entryLeader(doc)!;
    expect(dots.color).toBe('#c0392b');
    const face = parseFontString(dots.fontString!)!;
    expect(face.family).toContain('Inter');
    expect(face.weight).toBe(700);
    expect(sizeOf(dots.fontString!)).toBeCloseTo(6 * (doc.config.page.dpi / 72), 3);
    // Smaller dots: more of them over the same room.
    const plain = entryLeader(buildDocument({ markdown: book }, config({ pageNumber: { fontFamily: 'Lora', fontSize: pt(10) } })))!;
    expect(dots.text.length).toBeGreaterThan(plain.text.length);
  });

  const row = (content: string): DesignSlot => ({
    elements: [{ kind: 'text', id: 'row', content, fontSize: pt(10), color: hex('#333333'), align: 'left', verticalAlign: 'middle', placement: { anchor: { to: 'container', edge: 'left' }, size: { width: 'fill' } } }],
  });

  it('sets a part row\'s {leader} in the element\'s face, else in toc.leader\'s, else in toc.parts.leader\'s', () => {
    const dotsOf = (toc: NonNullable<PostextConfig['toc']>) => {
      const line = texts(partRow(buildDocument({ markdown: book }, config(toc))))[0]!.lines[0]!;
      return line.runs!.find((r) => /^\.{3,}$/.test(r.text))!;
    };
    const plain = dotsOf({ parts: { design: row('{titleText}{leader}{pageNumber}') } });
    expect(plain.color).toBeUndefined();
    const fromToc = dotsOf({ leader: { color: hex('#c0392b') }, parts: { design: row('{titleText}{leader}{pageNumber}') } });
    expect(fromToc.color).toBe('#c0392b');
    const own = dotsOf({ leader: { color: hex('#c0392b') }, parts: { design: row('{titleText}{leader}{pageNumber}'), leader: { color: hex('#2471a3'), fontSize: { value: 0.6, unit: 'em' }, fontWeight: 300 } } });
    expect(own.color).toBe('#2471a3');
    const face = parseFontString(own.fontString)!;
    expect(face.weight).toBe(300);
    expect(sizeOf(own.fontString)).toBeCloseTo(0.6 * sizeOf(plain.fontString), 3);
  });

  it('paints a part row leader\'s own colour in the HTML', () => {
    const doc = buildDocument({ markdown: book }, config({ parts: { design: row('{titleText}{leader}{pageNumber}'), leader: { color: hex('#2471a3') } } }));
    const html = renderToHtml(doc);
    expect(html).toContain('color:#2471a3');
  });

  // The three-element part row: the title, the leader in an element of its
  // own, sized up to the left edge of the page number element.
  it('stops a {leader} element sized { to: "#page", edge: "left" } before the page number element', () => {
    const design: DesignSlot = {
      elements: [
        { kind: 'text', id: 'title', content: '{number} {titleText}', fontSize: pt(10), verticalAlign: 'middle', placement: { anchor: { to: 'container', edge: 'left' } } },
        { kind: 'text', id: 'page', content: '{pageNumber}', fontSize: pt(10), fontWeight: 700, verticalAlign: 'middle', placement: { anchor: { to: 'container', edge: 'right' } } },
        { kind: 'text', id: 'dots', content: '{leader}', fontSize: pt(10), verticalAlign: 'middle', placement: { anchor: { to: '#title', edge: 'right-of' }, size: { width: { to: '#page', edge: 'left' } } } },
      ],
    };
    const doc = buildDocument({ markdown: book }, config({ leader: { color: hex('#c0392b') }, parts: { design } }));
    const blocks = texts(partRow(doc));
    const byText = (pred: (t: string) => boolean) => blocks.find((b) => pred(b.lines[0]?.text ?? ''))!;
    const title = byText((t) => t.includes('Foundations'));
    const page = byText((t) => /^\d+$/.test(t.trim()));
    const dots = byText((t) => /\.{3,}/.test(t));
    expect(title && page && dots).toBeTruthy();
    // The leader runs from the title to the page number, and stops before it.
    expect(dots.bbox.x).toBeGreaterThanOrEqual(title.bbox.x + title.lines[0]!.width - 0.5);
    expect(dots.bbox.x + dots.bbox.width).toBeLessThanOrEqual(page.bbox.x + 0.5);
    const run = dots.lines[0]!.runs!.find((r) => /^\.{3,}$/.test(r.text))!;
    expect(run.color).toBe('#c0392b');
    // The dots keep the leader's gap (0.5em of 10 pt) from either element.
    const runs = dots.lines[0]!.runs!;
    expect(runs.reduce((s, r) => s + r.width, 0)).toBeCloseTo(dots.bbox.width, 3);
    const gapPx = 5 * (doc.config.page.dpi / 72);
    expect(runs.at(-1)!.text).toBe('');
    expect(runs.at(-1)!.width).toBeCloseTo(gapPx, 3);
    expect(runs[0]!.width).toBeGreaterThanOrEqual(gapPx - 1e-6);
    expect(doc.contentWarnings?.some((w) => w.kind === 'designTextTruncated') ?? false).toBe(false);
  });
});
