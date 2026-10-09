import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { renderToHtml } from '../html-backend';
import { createMeasurementCache } from '../measure';
import { collectConfigWarnings } from '../configWarnings';
import { resolveBodyTextConfig } from '../defaults/bodyText';
import { resolveParagraphStylesConfig, stripParagraphStylesDefaults } from '../defaults/paragraphStyles';
import { resolveHeadingsConfig, stripHeadingsDefaults } from '../defaults/headings';
import { resolveHeadingStylesConfig } from '../defaults/headingStyles';
import { collectFontUsage } from '../fonts/usage';
import { documentFontFamilies } from '../worker/fonts';
import type { ParagraphDropCap, PostextConfig, Resource } from '../types';
import type { ContentWarning, VDTBlock, VDTDocument, VDTLine } from '../vdt';

// #623: drop caps in body paragraphs. The initial comes out of the text the
// measurers break; the paragraph's first `sink` lines are indented by its
// width and the gap, and the block carries the letter for the renderers.

/** Characters half an em wide in any face; capitals 0.7 of the size in
 *  Alpha, 0.66 in Beta, no ink metrics at all in NoInk. */
class StubCtx {
  font = '';
  measureText(s: string): { width: number; actualBoundingBoxAscent?: number; actualBoundingBoxDescent?: number } {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
    const ratio = /Beta/.test(this.font) ? 0.66 : /NoInk/.test(this.font) ? undefined : 0.7;
    return { width: s.length * size * 0.5, ...(ratio !== undefined ? { actualBoundingBoxAscent: ratio * size, actualBoundingBoxDescent: 0.2 * size } : {}) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
/** A 260 px measure at 72 dpi; 10 px text on 14 px lines. */
const config = (extra: Partial<PostextConfig> = {}, body: Record<string, unknown> = {}): PostextConfig => ({
  page: { dpi: 72, width: pt(300), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Alpha', fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(10), textAlign: 'justify', boldFontWeight: 700, hyphenation: { enabled: false }, ...body },
  ...extra,
});
const MARGIN = 20;
const MEASURE = 260;
const LINE = 14;
const withCap = (cap: ParagraphDropCap | false, extra: Partial<PostextConfig> = {}, body: Record<string, unknown> = {}): PostextConfig =>
  config({ headings: { levels: [{ level: 1, dropCap: cap }] }, ...extra }, body);

const TEXT = 'Long before there were title pages there were readers of the scrolls who kept their place with a finger and a lamp, and the first letter of a chapter was painted large in red so the eye could find it again across the whole width of the reading room.';
const SECOND = 'The second paragraph goes on in the same voice, set as any other paragraph of the chapter, with its first line indented as the body asks.';

const build = (md: string, cfg: PostextConfig, resources: Resource[] = []): VDTDocument =>
  buildDocument({ markdown: md, resources }, cfg, createMeasurementCache());
const paragraphs = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'paragraph');
const first = (doc: VDTDocument): VDTBlock => paragraphs(doc)[0]!;
const capWarnings = (doc: VDTDocument): Extract<ContentWarning, { kind: 'dropCap' }>[] =>
  (doc.contentWarnings ?? []).filter((w): w is Extract<ContentWarning, { kind: 'dropCap' }> => w.kind === 'dropCap');
const indent = (line: VDTLine): number => line.bbox.x - MARGIN;

describe('the lines a drop cap shortens (#623)', () => {
  it('a 3-line drop cap shortens exactly the first 3 lines by its width and the gap, on the start side', () => {
    const p = first(build(`# One\n\n${TEXT}`, withCap({ lines: 3 })));
    const cap = p.dropCap!;
    expect(cap).toBeDefined();
    expect(cap.text).toBe('L');
    expect(cap.x).toBe(MARGIN);
    // 0.15 em of the text: the default gap.
    const room = cap.width + 1.5;
    expect(p.lines.length).toBeGreaterThan(4);
    for (const line of p.lines.slice(0, 3)) expect(indent(line)).toBeCloseTo(room, 6);
    for (const line of p.lines.slice(3)) expect(indent(line)).toBe(0);
    // The paragraph's own first-line indent is dropped.
    expect(p.lines[0]!.text.startsWith('ong ')).toBe(true);
  });

  it('the initial stands on the baseline of line 3, its capitals level with those of line 1', () => {
    const p = first(build(`# One\n\n${TEXT}`, withCap({ lines: 3 })));
    const cap = p.dropCap!;
    expect(cap.baselineY).toBeCloseTo(p.lines[2]!.baseline, 6);
    expect(cap.lines).toBe(3);
    expect(cap.sink).toBe(3);
    // Alpha's capitals are 0.7 of the size, for the text and the initial.
    const capTop = cap.baselineY - 0.7 * cap.fontSizePx;
    expect(Math.abs(capTop - (p.lines[0]!.baseline - 7))).toBeLessThan(0.5);
  });

  it('measures both cap heights from their faces (two faces), and falls back to 0.72 without ink metrics', () => {
    // The initial in Beta (capitals 0.66) over Alpha text (0.7).
    const beta = first(build(`# One\n\n${TEXT}`, withCap({ lines: 3, fontFamily: 'Beta' }))).dropCap!;
    expect(Math.abs(beta.baselineY - 0.66 * beta.fontSizePx - (first(build(`# One\n\n${TEXT}`, withCap({ lines: 3 }))).lines[0]!.baseline - 7))).toBeLessThan(0.5);
    // Beta text under an Alpha initial.
    const betaText = first(build(`# One\n\n${TEXT}`, withCap({ lines: 3, fontFamily: 'Alpha' }, {}, { fontFamily: 'Beta' })));
    const top = betaText.dropCap!.baselineY - 0.7 * betaText.dropCap!.fontSizePx;
    expect(Math.abs(top - (betaText.lines[0]!.baseline - 6.6))).toBeLessThan(0.5);
    // No ink metrics: capitals taken as 0.72 of the size.
    const noInk = first(build(`# One\n\n${TEXT}`, withCap({ lines: 3, fontFamily: 'NoInk' }))).dropCap!;
    expect(noInk.fontSizePx).toBeCloseTo((7 + 2 * LINE) / 0.72, 6);
  });

  it('a raised initial (lines: 1, a larger size) keeps its rise clear above the paragraph; the block below is not moved further', () => {
    const md = `# One\n\n${TEXT}\n\n${SECOND}`;
    const plain = paragraphs(build(md, withCap(false)));
    const raised = paragraphs(build(md, withCap({ lines: 1, fontSize: pt(30) })));
    const cap = raised[0]!.dropCap!;
    expect(cap.sink).toBe(1);
    expect(cap.baselineY).toBeCloseTo(raised[0]!.lines[0]!.baseline, 6);
    // Capitals of 21 px over text capitals of 7: a rise of 14, one grid line.
    expect(raised[0]!.bbox.y - plain[0]!.bbox.y).toBeCloseTo(LINE, 6);
    expect(cap.baselineY - 0.7 * cap.fontSizePx).toBeGreaterThanOrEqual(raised[0]!.bbox.y - LINE - 0.01);
    // Only the first line is shortened; the paragraph is as tall as its
    // lines, and the next one follows it as it follows a paragraph.
    expect(indent(raised[0]!.lines[1]!)).toBe(0);
    expect(raised[0]!.bbox.height).toBeCloseTo(raised[0]!.lines.length * LINE, 6);
    const gap = (ps: VDTBlock[]) => ps[1]!.bbox.y - (ps[0]!.bbox.y + ps[0]!.bbox.height);
    expect(gap(raised)).toBeCloseTo(gap(plain), 6);
  });

  it('a sink under the lines raises the initial: 3 lines tall, sunk 2', () => {
    const p = first(build(`# One\n\n${TEXT}`, withCap({ lines: 3, sink: 2 })));
    expect(p.dropCap!.sink).toBe(2);
    expect(p.dropCap!.baselineY).toBeCloseTo(p.lines[1]!.baseline, 6);
    expect(indent(p.lines[1]!)).toBeGreaterThan(0);
    expect(indent(p.lines[2]!)).toBe(0);
  });

  it('Knuth–Plass and the line-by-line breaker both honour the shortened lines; justified, they fill the measure', () => {
    for (const optimal of [true, false]) {
      const p = first(build(`# One\n\n${TEXT}`, withCap({ lines: 3 }, {}, { optimalLineBreaking: optimal })));
      const room = p.dropCap!.width + 1.5;
      p.lines.slice(0, 3).forEach((line, i) => {
        expect(indent(line), `${optimal} ${i}`).toBeCloseTo(room, 6);
        // Justified to the measure the line was given: not ragged, not the
        // last line, and its words fit in it.
        expect(line.ragged, `${optimal} ${i}`).toBeFalsy();
        expect(line.isLastLine).toBeFalsy();
        const words = (line.segments ?? []).filter((s) => s.kind !== 'space').reduce((a, s) => a + s.width, 0);
        expect(words).toBeLessThan(MEASURE - room);
      });
      expect(indent(p.lines[3]!)).toBe(0);
    }
  });

  it('a ragged paragraph is shortened the same way', () => {
    const p = first(build(`# One\n\n${TEXT}`, withCap({ lines: 2 }, {}, { textAlign: 'left' })));
    const room = p.dropCap!.width + 1.5;
    expect(indent(p.lines[0]!)).toBeCloseTo(room, 6);
    expect(indent(p.lines[1]!)).toBeCloseTo(room, 6);
    expect(indent(p.lines[2]!)).toBe(0);
    for (const line of p.lines.slice(0, 2)) expect(line.bbox.width).toBeLessThanOrEqual(MEASURE - room + 0.01);
  });
});

describe('what the initial takes (#623)', () => {
  const opening = `# One\n\n“${TEXT}”`;
  it('punctuation `with-cap` sets an opening quote at the initial’s size, with it', () => {
    const p = first(build(opening, withCap({ lines: 3 })));
    expect(p.dropCap!.text).toBe('“L');
    expect(p.dropCap!.hang).toBeUndefined();
    expect(p.lines[0]!.text.startsWith('ong ')).toBe(true);
  });

  it('`hang` sets it at text size outside the measure, before the initial', () => {
    const p = first(build(opening, withCap({ lines: 3, punctuation: 'hang' })));
    const cap = p.dropCap!;
    expect(cap.text).toBe('L');
    expect(cap.hang).toMatchObject({ text: '“', width: 5 });
    expect(cap.hang!.x).toBeCloseTo(cap.x - 5, 6);
    expect(cap.hang!.baselineY).toBeCloseTo(p.lines[0]!.baseline, 6);
    expect(p.lines[0]!.text.startsWith('ong ')).toBe(true);
  });

  it('`text` sets it at text size at the start of line 1, after the initial', () => {
    const p = first(build(opening, withCap({ lines: 3, punctuation: 'text' })));
    expect(p.dropCap!.text).toBe('L');
    expect(p.lines[0]!.text.startsWith('“ong ')).toBe(true);
    expect(p.dropCap!.plainStart).toBe(1);
  });

  it('takes a grapheme with a combining mark whole, and `characters` counts graphemes', () => {
    const p = first(build(`# One\n\nÉste es ${TEXT}`, withCap({ lines: 3 })));
    expect(p.dropCap!.text).toBe('É');
    expect(p.lines[0]!.text.startsWith('ste es')).toBe(true);
    const two = first(build(`# One\n\n${TEXT}`, withCap({ lines: 3, characters: 2 })));
    expect(two.dropCap!.text).toBe('Lo');
    expect(two.lines[0]!.text.startsWith('ng ')).toBe(true);
  });

  it('a one-letter word keeps its word space on the first line', () => {
    const p = first(build(`# One\n\nA ${TEXT}`, withCap({ lines: 3 })));
    const cap = p.dropCap!;
    expect(cap.text).toBe('A');
    expect(cap.wordRest).toBe(0);
    expect(p.lines[0]!.text.startsWith('Long ')).toBe(true);
    expect(indent(p.lines[0]!)).toBeCloseTo(cap.width + 1.5 + 5, 6);
    expect(indent(p.lines[1]!)).toBeCloseTo(cap.width + 1.5, 6);
  });

  it('`leadIn.words: 3` sets those words in small capitals', () => {
    const p = first(build(`# One\n\n${TEXT}`, withCap({ lines: 3, leadIn: { words: 3 } })));
    const words = p.lines[0]!.segments!.filter((s) => s.kind === 'text');
    expect(words.slice(0, 3).map((s) => s.text)).toEqual(['ONG', 'BEFORE', 'THERE']);
    expect(words[3]!.text).toBe('were');
    // Capitals at the small-caps size.
    expect(words[0]!.fontString).toContain('7px');
  });

  it('`leadIn.uppercase` sets them in capitals; `words: \'line\'` takes the first line', () => {
    const up = first(build(`# One\n\n${TEXT}`, withCap({ lines: 3, leadIn: { words: 2, uppercase: true } })));
    expect(up.lines[0]!.text.startsWith('ONG BEFORE there')).toBe(true);
    const line = first(build(`# One\n\n${TEXT}`, withCap({ lines: 3, leadIn: { words: 'line' } })));
    // The words the first setting put on the first line (two settings at
    // most): in small capitals the line may hold a word or two more.
    const plain = first(build(`# One\n\n${TEXT}`, withCap({ lines: 3 })));
    const counted = plain.lines[0]!.text.split(' ').length;
    const segs = line.lines[0]!.segments!.filter((s) => s.kind === 'text');
    expect(segs.slice(0, counted).every((s) => s.text === s.text.toUpperCase())).toBe(true);
    // The lines after it are set as written.
    expect(line.lines[1]!.text).toBe(line.lines[1]!.text.toLowerCase());
  });
});

describe('a paragraph shorter than the initial (#623)', () => {
  const SHORT = 'A brief paragraph that runs to two lines of this narrow measure here.';
  const md = `# One\n\n${SHORT}\n\n${SECOND}`;

  it('is two lines long (fixture)', () => {
    expect(first(build(md, withCap({ lines: 3 }))).lines).toHaveLength(2);
  });

  it('`reserve` (default) keeps the block 3 lines tall and warns', () => {
    const doc = build(md, withCap({ lines: 3 }));
    const p = first(doc);
    expect(p.dropCap!.lines).toBe(3);
    expect(p.bbox.height).toBeCloseTo(3 * LINE, 6);
    expect(paragraphs(doc)[1]!.bbox.y).toBeGreaterThanOrEqual(p.dropCap!.baselineY);
    expect(capWarnings(doc)).toEqual([expect.objectContaining({ reason: 'shortParagraph', handling: 'reserve' })]);
  });

  it('`shrink` sets the initial over its 2 lines and warns', () => {
    const doc = build(md, withCap({ lines: 3, shortParagraph: 'shrink' }));
    const p = first(doc);
    expect(p.dropCap!.lines).toBe(2);
    expect(p.dropCap!.baselineY).toBeCloseTo(p.lines[1]!.baseline, 6);
    expect(p.dropCap!.fontSizePx).toBeCloseTo((7 + LINE) / 0.7, 6);
    expect(capWarnings(doc)).toEqual([expect.objectContaining({ reason: 'shortParagraph', handling: 'shrink', lines: 2 })]);
  });

  it('`skip` sets the paragraph without one and warns', () => {
    const doc = build(md, withCap({ lines: 3, shortParagraph: 'skip' }));
    expect(first(doc).dropCap).toBeUndefined();
    expect(first(doc).lines[0]!.text.startsWith('A brief')).toBe(true);
    expect(capWarnings(doc)).toEqual([expect.objectContaining({ reason: 'shortParagraph', handling: 'skip' })]);
  });
});

describe('breaking a paragraph a drop cap opens (#623)', () => {
  /** A column of `lines` lines. */
  const short = (lines: number, extra: Partial<PostextConfig> = {}): PostextConfig => ({
    ...config(extra, { avoidOrphans: false, avoidWidows: false }),
    page: { dpi: 72, width: pt(300), height: pt(40 + lines * LINE), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  });
  const styles = (cap?: ParagraphDropCap): Partial<PostextConfig> => ({ paragraphStyles: [{ id: 'cap', ...(cap ? { dropCap: cap } : {}) }] });
  /** Five lines of filler, then the paragraph in a group of the style. */
  const FILLER = 'Filler text set before the paragraph that the drop cap opens, long enough to take several lines of the column, so that the next paragraph starts two lines above its foot and would break there.';
  const md = `${FILLER}\n\n:::paragraphs{style="cap"}\n${TEXT} ${TEXT}\n:::`;

  it('never breaks before line `sink`: it moves on whole; the continuation has no initial and full lines', () => {
    const fillerLines = first(build(FILLER, short(20))).lines.length;
    const cfg = (cap?: ParagraphDropCap) => short(fillerLines + 2, styles(cap));
    // Without a drop cap it breaks after 2 lines.
    const plain = paragraphs(build(md, cfg()));
    expect(plain[1]!.pageIndex).toBe(0);
    expect(plain[1]!.lines).toHaveLength(2);
    const doc = build(md, cfg({ lines: 3 }));
    const ps = paragraphs(doc);
    const head = ps.find((b) => b.dropCap)!;
    expect(head.pageIndex).toBe(1);
    expect(head.lines.length).toBeGreaterThanOrEqual(3);
    const cont = ps.filter((b) => b.id.startsWith(`${head.id}-cont-`));
    expect(cont.length).toBeGreaterThan(0);
    for (const b of cont) {
      expect(b.dropCap).toBeUndefined();
      for (const line of b.lines) expect(indent(line)).toBe(0);
    }
    expect(capWarnings(doc)).toEqual([]);
  });

  it('alone in an empty column too short for the initial, it breaks all the same and warns', () => {
    const doc = build(`:::paragraphs{style="cap"}\n${TEXT}\n:::`, short(2, styles({ lines: 3 })));
    const head = paragraphs(doc).find((b) => b.dropCap)!;
    expect(head.lines).toHaveLength(2);
    expect(capWarnings(doc)).toEqual([expect.objectContaining({ reason: 'split' })]);
  });

  it('a heading kept with its text keeps the initial’s lines under it', () => {
    // The heading fits with two lines under it, not three: it moves on with
    // its paragraph.
    const fillerLines = first(build(FILLER, short(20))).lines.length;
    const cfg = short(fillerLines + 4, { headings: { marginTop: pt(0), marginBottom: pt(0), levels: [{ level: 2, fontSize: pt(10), lineHeight: pt(14), dropCap: { lines: 3 } }] } });
    const doc = build(`${FILLER}\n\n## Two\n\n${TEXT}`, cfg);
    const heading = doc.blocks.find((b) => b.type === 'heading')!;
    const p = paragraphs(doc).find((b) => b.dropCap)!;
    expect(p.pageIndex).toBe(heading.pageIndex);
    expect(p.lines.length).toBeGreaterThanOrEqual(3);
  });
});

describe('which paragraphs open with one (#623)', () => {
  it('a heading level’s drop cap opens the first paragraph after the heading only', () => {
    const ps = paragraphs(build(`# One\n\n${TEXT}\n\n${SECOND}\n\n# Two\n\n${SECOND}`, withCap({ lines: 3 })));
    expect(ps.map((p) => p.dropCap?.text ?? '')).toEqual(['L', '', 'T']);
  });

  it('looks past markers and a floated figure', () => {
    const figure: Resource = {
      id: 'fig', typeId: 'figure', kind: 'bitmap', caption: 'A figure.', createdAt: 0, updatedAt: 0,
      bitmap: { fileId: 'fig.png', format: 'png', width: 1000, height: 400 }, placement: { position: 'top', span: 'page' },
    };
    const cfg = withCap({ lines: 3 }, { paragraphStyles: [{ id: 'plain' }] });
    expect(first(build(`# One\n\n::resource{id="fig"}\n\n${TEXT}`, cfg, [figure])).dropCap?.text).toBe('L');
    expect(first(build(`# One\n\n:::paragraphs{style="plain"}\n${TEXT}\n:::`, cfg)).dropCap?.text).toBe('L');
  });

  it('`{dropcap=false}` on the heading turns it off; `{dropcap=2}` sets its lines; `{dropcap}` turns one on', () => {
    expect(first(build(`# One {dropcap=false}\n\n${TEXT}`, withCap({ lines: 3 }))).dropCap).toBeUndefined();
    expect(first(build(`# One {dropcap=2}\n\n${TEXT}`, withCap({ lines: 3 }))).dropCap!.lines).toBe(2);
    expect(first(build(`# One {dropcap}\n\n${TEXT}`, config())).dropCap!.lines).toBe(3);
  });

  it('a heading style sets its own, or `false` takes the level’s off', () => {
    const cfg = withCap({ lines: 3 }, { headingStyles: [{ id: 'five', dropCap: { lines: 5 } }, { id: 'none', dropCap: false }] });
    expect(first(build(`# One {style="five"}\n\n${TEXT}`, cfg)).dropCap!.lines).toBe(5);
    expect(first(build(`# One {style="none"}\n\n${TEXT}`, cfg)).dropCap).toBeUndefined();
  });

  it('a paragraph style opens the first paragraph of each group, or each one with `each`', () => {
    const md = `:::paragraphs{style="entry"}\n${TEXT}\n\n${SECOND}\n:::\n\n:::paragraphs{style="entry"}\n${SECOND}\n:::`;
    const one = paragraphs(build(md, config({ paragraphStyles: [{ id: 'entry', dropCap: { lines: 2 } }] })));
    expect(one.map((p) => p.dropCap?.lines ?? 0)).toEqual([2, 0, 2]);
    const each = paragraphs(build(md, config({ paragraphStyles: [{ id: 'entry', dropCap: { lines: 2, each: true } }] })));
    expect(each.map((p) => p.dropCap?.lines ?? 0)).toEqual([2, 2, 2]);
  });

  it('the group’s fence switches it: `{dropcap}`, `{dropcap=false}`, `{dropcap=2}`', () => {
    const cfg = config({ paragraphStyles: [{ id: 'entry', dropCap: { lines: 3 } }] });
    expect(first(build(`:::paragraphs{dropcap}\n${TEXT}\n:::`, config())).dropCap!.lines).toBe(3);
    expect(first(build(`:::paragraphs{style="entry" dropcap=false}\n${TEXT}\n:::`, cfg)).dropCap).toBeUndefined();
    expect(first(build(`:::paragraphs{style="entry" dropcap=2}\n${TEXT}\n:::`, cfg)).dropCap!.lines).toBe(2);
  });

  it('never in a box, a list or a quotation', () => {
    const cfg = withCap({ lines: 3 }, { calloutStyles: [{ id: 'box', title: 'Box' }] });
    const doc = build(`# One\n\n:::callout{type="box"}\n${TEXT}\n:::\n\n${SECOND}`, cfg);
    expect(doc.blocks.filter((b) => b.dropCap)).toHaveLength(0);
    expect(build(`# One\n\n- ${TEXT}`, cfg).blocks.filter((b) => b.dropCap)).toHaveLength(0);
    expect(build(`# One\n\n> ${TEXT}`, cfg).blocks.filter((b) => b.dropCap)).toHaveLength(0);
  });
});

describe('scripts (#623)', () => {
  it('an Arabic letter that joins the next gets no initial, and a warning', () => {
    const doc = build('# One\n\nبسم الله الرحمن الرحيم، هذا كتاب يقرأ من اليمين إلى اليسار في سطور كثيرة.', withCap({ lines: 3 }, { direction: 'rtl', locale: 'ar' }));
    expect(first(doc).dropCap).toBeUndefined();
    expect(capWarnings(doc)).toEqual([expect.objectContaining({ reason: 'joiningScript' })]);
  });

  it('a Hebrew paragraph takes one on its start side (the flow’s left, mirrored on the page)', () => {
    const doc = build('# One\n\nבראשית ברא אלהים את השמים ואת הארץ והארץ היתה תהו ובהו וחשך על פני תהום ורוח אלהים מרחפת על פני המים ויאמר אלהים יהי אור ויהי אור.', withCap({ lines: 2 }, { direction: 'rtl', locale: 'he' }));
    const p = first(doc);
    expect(p.dropCap!.text).toBe('ב');
    expect(p.dropCap!.x).toBe(MARGIN);
    expect(indent(p.lines[0]!)).toBeCloseTo(p.dropCap!.width + 1.5, 6);
  });

  it('a paragraph opening with no letter (a formula, a note mark) takes none and says so', () => {
    const doc = build(`# One\n\n[^n] ${TEXT}\n\n[^n]: A note.`, withCap({ lines: 3 }));
    expect(first(doc).dropCap).toBeUndefined();
    expect(capWarnings(doc)).toEqual([expect.objectContaining({ reason: 'noLetter' })]);
  });

  it('vertical text sets none and says so', () => {
    const doc = build('# 一\n\n天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏闰余成岁律吕调阳云腾致雨露结为霜金生丽水玉出昆冈。', withCap({ lines: 2 }, { layout: { layoutType: 'single', writingMode: 'vertical-rl' }, locale: 'zh' }));
    expect(doc.blocks.filter((b) => b.dropCap)).toHaveLength(0);
    expect(capWarnings(doc)).toEqual([expect.objectContaining({ reason: 'verticalText' })]);
  });

  it('horizontal Chinese takes a one-character initial (首字下沉)', () => {
    const p = first(build('# 一\n\n天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏闰余成岁律吕调阳云腾致雨露结为霜金生丽水玉出昆冈剑号巨阙珠称夜光果珍李柰菜重芥姜海咸河淡鳞潜羽翔。', withCap({ lines: 2 }, { locale: 'zh' })));
    expect(p.dropCap!.text).toBe('天');
    expect(p.dropCap!.wordRest).toBe(0);
    expect(p.lines[0]!.text.startsWith('地玄黄')).toBe(true);
    expect(indent(p.lines[0]!)).toBeCloseTo(p.dropCap!.width + 1.5, 1);
  });
});

describe('the paragraph’s text stays whole (#623)', () => {
  it('the plain text and source map of the block are those of the paragraph without a drop cap', () => {
    const md = `# One\n\n**${TEXT.slice(0, 4)}**${TEXT.slice(4)}`;
    const plain = first(build(md, withCap(false)));
    const doc = build(md, withCap({ lines: 3 }));
    const p = first(doc);
    const cap = p.dropCap!;
    expect(p.sourceMap).toEqual(plain.sourceMap);
    expect(p.sourceStart).toBe(plain.sourceStart);
    expect(p.sourceEnd).toBe(plain.sourceEnd);
    // The initial holds plain [0, 1) and its source (from the block's
    // start, its markup included); the first line counts past it.
    expect(cap.plainStart).toBe(0);
    expect(cap.plainEnd).toBe(1);
    expect(md.slice(cap.sourceStart!, cap.sourceEnd!)).toBe('**L');
    expect(p.lines[0]!.plainStart).toBe(1);
    expect(md.slice(p.lines[0]!.sourceStart!, p.lines[0]!.sourceStart! + 3)).toBe('ong');
    // The initial and the lines read the paragraph as written.
    expect(cap.text + p.lines.map((l) => l.text).join(' ')).toBe(TEXT);
    expect(cap.word).toBe('Long');
    expect(cap.wordRest).toBe(3);
    for (const line of p.lines) {
      expect(p.sourceMap![line.plainStart!]).toBe(line.sourceStart);
    }
  });
});

describe('outputs (#623)', () => {
  it('HTML: the initial and the rest of its word are adjacent in the first line’s box, with no whitespace', () => {
    const html = renderToHtml(build(`# One\n\n${TEXT}`, withCap({ lines: 3 })));
    expect(html).toMatch(/<span class="pt-dropcap"[^>]*><span[^>]*>L<\/span><\/span><span[^>]*>(?:<span[^>]*>)?ong</);
  });

  it('the initial’s face is collected for loading and embedding', () => {
    const cfg = withCap({ lines: 3, fontFamily: 'Display', fontWeight: 700 });
    expect(collectFontUsage(cfg).get('Display')).toEqual([{ weight: 700, style: 'normal' }]);
    expect(documentFontFamilies(build(`# One\n\n${TEXT}`, cfg))).toContain('Display');
    // No face of its own: the body's, in its weight.
    const bodyFace = collectFontUsage(withCap({ lines: 3, fontWeight: 800 })).get('Alpha') ?? [];
    expect(bodyFace).toContainEqual({ weight: 800, style: 'normal' });
  });

  it('a palette-linked colour follows the part palette', () => {
    const accent = { hex: '#8c1c13', model: 'hex' as const, paletteId: 'accent' };
    const cfg = withCap({ lines: 3, color: accent }, { colorPalette: [{ id: 'accent', name: 'accent', value: { hex: '#8c1c13', model: 'hex' } }] });
    expect(first(build(`# One\n\n${TEXT}`, cfg)).dropCap!.color).toBe('#8c1c13');
    const part = first(build(`:::part{palette="accent=#24427a"}\n# One\n\n${TEXT}\n:::`, cfg));
    expect(part.dropCap!.color.toLowerCase()).toBe('#24427a');
  });

  it('line numbers count the paragraph’s lines, on their baselines, not the initial', () => {
    const doc = build(`# One\n\n${TEXT}`, withCap({ lines: 3 }, { lineNumbers: { enabled: true, count: 'all', interval: 1 } }));
    const p = first(doc);
    const marks = doc.pages[0]!.lineNumberMarks ?? [];
    expect(marks.filter((m) => m.blockId === p.id).map((m) => m.lineIndex)).toEqual(p.lines.map((_, i) => i));
  });
});

describe('settings (#623)', () => {
  it('resolve and strip as written', () => {
    const body = resolveBodyTextConfig(undefined);
    const cap: ParagraphDropCap = { lines: 2, punctuation: 'hang' };
    expect(resolveParagraphStylesConfig([{ id: 's', dropCap: cap }], body)[0]!.dropCap).toEqual(cap);
    expect(stripParagraphStylesDefaults([{ id: 's', dropCap: cap }])).toEqual([{ id: 's', dropCap: cap }]);
    expect(resolveHeadingsConfig({ levels: [{ level: 1, dropCap: cap }] }).levels[0]!.dropCap).toEqual(cap);
    expect(stripHeadingsDefaults({ levels: [{ level: 1, dropCap: cap }] })?.levels?.[0]).toEqual({ level: 1, dropCap: cap });
    expect(resolveHeadingsConfig(undefined).levels[0]!.dropCap).toBeUndefined();
    const styles = resolveHeadingStylesConfig([{ id: 'x', dropCap: false }], { width: pt(300), height: pt(500), dpi: 72 } as never, body, undefined as never, undefined as never);
    expect('dropCap' in styles[0]!.overrides).toBe(true);
    expect(styles[0]!.overrides.dropCap).toBeUndefined();
  });

  it('unknown keys and words are reported', () => {
    const warnings = collectConfigWarnings({
      paragraphStyles: [{ id: 's', dropCap: { line: 3, punctuation: 'hnag', shortParagraph: 'skipp', leadIn: { word: 2 } } as unknown as ParagraphDropCap }],
      headings: { levels: [{ level: 1, dropCap: { lines: 0 } }] },
    });
    expect(warnings.map((w) => [w.kind, w.path, w.suggestion ?? ''])).toEqual(expect.arrayContaining([
      ['unknownConfigKey', 'paragraphStyles[0].dropCap.line', 'lines'],
      ['unknownConfigKey', 'paragraphStyles[0].dropCap.leadIn.word', 'words'],
      ['unknownConfigValue', 'paragraphStyles[0].dropCap.punctuation', 'hang'],
      ['unknownConfigValue', 'paragraphStyles[0].dropCap.shortParagraph', 'skip'],
      ['unknownConfigValue', 'headings.levels[0].dropCap.lines', ''],
    ]));
  });

  it('a document without drop caps lays out as before (no indent table, no field)', () => {
    const doc = build(`# One\n\n${TEXT}`, config());
    expect(doc.blocks.some((b) => b.dropCap)).toBe(false);
    // The body's first-line indent after a heading (`indentAfterHeading`).
    expect(indent(first(doc).lines[0]!)).toBe(10);
  });
});
