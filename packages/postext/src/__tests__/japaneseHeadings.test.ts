import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { resolveHeadingsConfig, stripHeadingsDefaults } from '../defaults/headings';
import { resolveParagraphStylesConfig, stripParagraphStylesDefaults } from '../defaults/paragraphStyles';
import { resolveBodyTextConfig } from '../defaults/bodyText';
import { resolveAllConfig } from '../pipeline/config';
import type { HeadingLevelConfig, PostextConfig } from '../types';
import type { VDTBlock, VDTDocument, VDTLine } from '../vdt';
import { renderToHtml } from '../html-backend';
import { installSizedStub } from './vertical/stub';

// Japanese headings and blocks (#424): 行取り (`lineSpan`), 字下げ (a
// heading's `indent` in body ems), 字取り (`jidori`), 地付き / 地からN字上げ
// (`endIndent`, `:::paragraphs{align=end endIndent=N}`), ページの左右中央
// (`:::pagebreak{center}`) and the even-page exception to keep-with-next
// (`headings.keepWithNextSpread`). The stub measures kana and kanji 1 em,
// Latin ½ em; the ideographic centre of every face sits 0.38 em above the
// baseline.
installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
const em = (value: number) => ({ value, unit: 'em' as const });

/** 72 dpi: a 10 px body on a 17.5 px pitch (1.75 em, the bunko pitch), a
 *  measure of 20 characters and 10 lines a page. */
const PITCH = 17.5;
const BODY = 10;
const config = (extra: Partial<PostextConfig> = {}, levels: HeadingLevelConfig[] = []): PostextConfig => ({
  locale: 'ja',
  page: { width: pt(240), height: pt(215), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(BODY), lineHeight: pt(PITCH), textAlign: 'justify', firstLineIndent: pt(0) },
  headings: {
    levels: ([
      { level: 1, breakBefore: { enabled: false } },
      { level: 2, fontSize: pt(14), lineHeight: pt(21), marginTop: pt(7), marginBottom: pt(3) },
    ] as HeadingLevelConfig[]).filter((l) => !levels.some((o) => o.level === l.level)).concat(levels),
  },
  ...extra,
});
/** `c` with its headings changed by `patch`. */
const headingsWith = (c: PostextConfig, patch: Partial<NonNullable<PostextConfig['headings']>>): PostextConfig => ({ ...c, headings: { ...c.headings, ...patch } });
/** The same type area set vertically: the sheet turned, so a line still
 *  holds 20 characters and a page 10 lines. */
const vertical = (extra: Partial<PostextConfig> = {}, levels: HeadingLevelConfig[] = []): PostextConfig => {
  const c = config(extra, levels);
  return { ...c, page: { ...c.page, width: pt(215), height: pt(240) }, layout: { ...c.layout, writingMode: 'vertical-rl' } };
};

/** 20 kana: one full line of the measure. */
const LINE = 'あいうえおかきくけこさしすせそたちつてと';
const heading = (doc: VDTDocument, text?: string): VDTBlock =>
  doc.blocks.find((b) => b.type === 'heading' && (text === undefined || b.lines.some((l) => l.text.includes(text))))!;
const paragraphs = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'paragraph');
const firstLine = (b: VDTBlock): VDTLine => b.lines[0]!;
const columnTop = (doc: VDTDocument, b: VDTBlock): number => doc.pages[b.pageIndex!]!.columns[b.columnIndex ?? 0]!.bbox.y;

/** The centre of a horizontal line's characters: its baseline less the
 *  face's ideographic centre (0.38 em of the stub). */
const axis = (line: VDTLine, sizePx: number): number => line.baseline - 0.38 * sizePx;

describe('行取り: a heading takes N body lines (lineSpan)', () => {
  const span3: HeadingLevelConfig = { level: 2, fontSize: pt(14), lineHeight: pt(21), marginTop: pt(7), marginBottom: pt(3), lineSpan: 3 };

  it('holds three grid lines in horizontal text, its characters centred across them', () => {
    const doc = buildDocument({ markdown: `${LINE}${LINE}\n\n## 第一章\n\n${LINE}` }, config({}, [span3]));
    const h = heading(doc);
    const [before, after] = paragraphs(doc);
    const top = columnTop(doc, h);
    // The band opens on the grid line under the paragraph and is three
    // lines tall: the text under it is back on the grid.
    expect(h.bbox.y - top).toBeCloseTo(2 * PITCH, 6);
    expect(h.bbox.height).toBeCloseTo(3 * PITCH, 6);
    expect(firstLine(after!).bbox.y - top).toBeCloseTo(5 * PITCH, 6);
    expect(before!.lines).toHaveLength(2);
    // Centred as JLReq measures it: the heading's characters halfway
    // between the first and the last body character of the band.
    const bandCentre = h.bbox.y + 0.8 * PITCH - 0.38 * BODY + PITCH;
    expect(axis(firstLine(h), 14)).toBeCloseTo(bandCentre, 6);
  });

  it('keeps its band at the head of a column, where margins vanish', () => {
    const doc = buildDocument({ markdown: `## 第一章\n\n${LINE}` }, config({}, [span3]));
    const h = heading(doc);
    expect(h.bbox.y).toBeCloseTo(columnTop(doc, h), 6);
    expect(firstLine(paragraphs(doc)[0]!).bbox.y - h.bbox.y).toBeCloseTo(3 * PITCH, 6);
    expect(axis(firstLine(h), 14)).toBeCloseTo(h.bbox.y + 0.8 * PITCH - 0.38 * BODY + PITCH, 6);
  });

  it('grows to the next whole number of lines when its lines need more room', () => {
    // Two lines of 21 px do not fit one 17.5 px line: three lines.
    const two: HeadingLevelConfig = { ...span3, lineSpan: 1 };
    const title = 'ながいながいみだしのぶんしょうがつづきますよ';
    const doc = buildDocument({ markdown: `${LINE}\n\n## ${title}\n\n${LINE}` }, config({}, [two]));
    const h = heading(doc);
    expect(h.lines).toHaveLength(2);
    expect(h.bbox.height).toBeCloseTo(3 * PITCH, 6);
    expect(firstLine(paragraphs(doc)[1]!).bbox.y - h.bbox.y).toBeCloseTo(3 * PITCH, 6);
    // Its two lines stay together, centred as a block.
    expect(h.lines[1]!.bbox.y - h.lines[0]!.bbox.y).toBeCloseTo(21, 6);
  });

  it('centres a vertical heading across its band', () => {
    const doc = buildDocument({ markdown: `${LINE}\n\n## 第一章\n\n${LINE}` }, vertical({}, [span3]));
    const h = heading(doc);
    const top = columnTop(doc, h);
    expect(h.bbox.y - top).toBeCloseTo(PITCH, 6);
    expect(h.bbox.height).toBeCloseTo(3 * PITCH, 6);
    // A vertical line's characters stand in the middle of its line box.
    const line = firstLine(h);
    expect(line.bbox.y + line.bbox.height / 2).toBeCloseTo(h.bbox.y + 1.5 * PITCH, 6);
    expect(firstLine(paragraphs(doc)[1]!).bbox.y - top).toBeCloseTo(4 * PITCH, 6);
  });

  it('keeps the character grid (cjk.grid)', () => {
    const grid = { cjk: { grid: { enabled: true, charsPerLine: 20, linesPerPage: 10 } } };
    for (const c of [config(grid, [span3]), vertical(grid, [span3])]) {
      const doc = buildDocument({ markdown: `${LINE}\n\n## 序\n\n${LINE}${LINE}` }, c);
      const h = heading(doc);
      const top = columnTop(doc, h);
      const pitch = 17.5;
      expect((h.bbox.y - top) / pitch).toBeCloseTo(1, 6);
      expect(h.bbox.height / pitch).toBeCloseTo(3, 6);
      for (const line of paragraphs(doc)[1]!.lines) expect(((line.bbox.y - top) / pitch) % 1).toBeCloseTo(0, 6);
    }
  });

  it('starts where the flow is when the heading does not snap to the grid', () => {
    const off: HeadingLevelConfig = { ...span3, snapToGrid: false };
    const doc = buildDocument({ markdown: `:::paragraphs{style="tight"}\n${LINE}\n:::\n\n## 第一章\n\n${LINE}` }, config({
      paragraphStyles: [{ id: 'tight', lineHeight: pt(15), snapToGrid: false }],
    }, [off]));
    const h = heading(doc);
    expect(h.bbox.y - columnTop(doc, h)).toBeCloseTo(15, 6);
    expect(h.bbox.height).toBeCloseTo(3 * PITCH, 6);
  });

  it('is not read by a page opener or a hidden heading, and leaves other headings as they were', () => {
    const plain = buildDocument({ markdown: `${LINE}\n\n## 第一章\n\n${LINE}` }, config());
    const h = heading(plain);
    expect(h.bbox.y - columnTop(plain, h)).toBeCloseTo(PITCH + 7, 6);
    const opener = buildDocument({ markdown: `# 序\n\n${LINE}` }, config({}, [{ level: 1, span: 'page', breakBefore: { enabled: true }, lineSpan: 3, fontSize: pt(14), lineHeight: pt(21) }]));
    expect(heading(opener).bbox.height).not.toBeCloseTo(3 * PITCH, 3);
  });

  it('resolves and strips only when set', () => {
    expect('lineSpan' in resolveHeadingsConfig({}).levels[1]!).toBe(false);
    const r = resolveHeadingsConfig({ levels: [{ level: 2, lineSpan: 3, indent: em(4), jidori: 3 }, { level: 3, lineSpan: 0, jidori: 1 }] });
    expect(r.levels[1]).toMatchObject({ lineSpan: 3, indent: em(4), jidori: 3 });
    expect('lineSpan' in r.levels[2]! || 'jidori' in r.levels[2]!).toBe(false);
    expect(stripHeadingsDefaults({ levels: [{ level: 2, lineSpan: 3, indent: em(0) }] })).toEqual({ levels: [{ level: 2, lineSpan: 3 }] });
    expect(stripHeadingsDefaults({ keepWithNextSpread: false })).toBeUndefined();
    expect(stripHeadingsDefaults({ keepWithNextSpread: true })).toEqual({ keepWithNextSpread: true });
    expect('keepWithNextSpread' in resolveAllConfig(config()).headings).toBe(false);
  });

  it('is set by a heading style, which may take it off', () => {
    const cfg = config({
      headingStyles: [{ id: 'gyo', lineSpan: 2 }, { id: 'none', lineSpan: 0 }],
    }, [span3]);
    const markdown = `## 甲 {style="gyo"}\n\n${LINE}\n\n## 乙 {style="none"}\n\n${LINE}`;
    const doc = buildDocument({ markdown }, cfg);
    const plain = buildDocument({ markdown }, { ...config(), headingStyles: [{ id: 'gyo' }, { id: 'none' }] });
    expect(heading(doc, '甲').bbox.height).toBeCloseTo(2 * PITCH, 6);
    expect(heading(doc, '乙').bbox).toEqual(heading(plain, '乙').bbox);
    expect(heading(doc, '乙').lines[0]!.baseline).toBeCloseTo(heading(plain, '乙').lines[0]!.baseline, 6);
  });
});

describe('字下げ: a heading indented in body ems (indent)', () => {
  it('moves the heading off the line start by body characters, in both writing modes', () => {
    const lvl: HeadingLevelConfig = { level: 2, fontSize: pt(14), lineHeight: pt(21), indent: em(4) };
    for (const c of [config({}, [lvl]), vertical({}, [lvl])]) {
      const doc = buildDocument({ markdown: `## 上　先生と私\n\n${LINE}` }, c);
      const h = heading(doc);
      // 4 body ems (40 px), not 4 heading ems (56 px).
      expect(firstLine(h).bbox.x - h.bbox.x).toBeCloseTo(4 * BODY, 6);
    }
  });

  it('narrows the measure: a centred heading centres in what is left', () => {
    const lvl: HeadingLevelConfig = { level: 2, fontSize: pt(14), lineHeight: pt(21), indent: em(4) };
    const doc = buildDocument({ markdown: `## 一\n\n${LINE}` }, headingsWith(config({}, [lvl]), { textAlign: 'center' }));
    const h = heading(doc);
    // The renderers centre a line in the room from its start to the end of
    // its block: from the indent on.
    expect(h.textAlign).toBe('center');
    expect(firstLine(h).bbox.x - h.bbox.x).toBeCloseTo(4 * BODY, 6);
    const html = renderToHtml(doc);
    const left = Number(/left:([\d.]+)px;[^"]*">一</.exec(html)?.[1]);
    expect(left).toBeCloseTo((h.bbox.width - 4 * BODY - 14) / 2, 2);
    // 14 characters of 14 px fit what is left of the 20-character measure.
    const long = buildDocument({ markdown: `## ${'見'.repeat(12)}\n\n${LINE}` }, config({}, [lvl]));
    expect(heading(long).lines).toHaveLength(2);
  });
});

describe('字取り: a short heading spaced to a width (jidori)', () => {
  const lvl: HeadingLevelConfig = { level: 2, fontSize: pt(14), lineHeight: pt(21), jidori: 3 };

  it('spaces 序章 to three characters: 序　章', () => {
    for (const c of [config({}, [lvl]), vertical({}, [lvl])]) {
      const doc = buildDocument({ markdown: `## 序章\n\n${LINE}` }, c);
      const h = heading(doc);
      // Two characters, one gap of a whole heading em between them.
      expect(h.letterSpacing).toBeCloseTo(14, 6);
      // The advance holds the tracking after the last character, which the
      // renderers leave out of the alignment (EF-153): 28 + 2 × 14.
      expect(firstLine(h).bbox.width).toBeCloseTo(56, 6);
    }
  });

  it('spreads four characters to five with a third of an em between them, a heading attribute overriding the level', () => {
    const doc = buildDocument({ markdown: `## 終わりに {jidori=5}\n\n${LINE}` }, config({}, [lvl]));
    const h = heading(doc);
    // 4 characters to 5 ems: three gaps of a third of an em.
    expect(h.letterSpacing).toBeCloseTo(14 / 3, 6);
  });

  it('leaves a heading as wide as the width or wider, and one the attribute turns off', () => {
    const doc = buildDocument({ markdown: `## 第一章\n\n${LINE}\n\n## 序章 {jidori=0}\n\n${LINE}` }, config({}, [lvl]));
    expect(heading(doc, '第一章').letterSpacing).toBeUndefined();
    expect(heading(doc, '序章').letterSpacing).toBeUndefined();
  });

  it('counts a numbering prefix as part of the heading', () => {
    const doc = buildDocument({ markdown: `## 序\n\n${LINE}` }, config({}, [{ ...lvl, numberingTemplate: '{2}', numberSeparator: '' }]));
    // "1序": a half-em digit, the quarter em set between a Latin digit and
    // a kanji, and the kanji: 24.5 px, spread to 42 px in one gap.
    expect(heading(doc).letterSpacing).toBeCloseTo(17.5, 6);
  });
});

describe('地付き and 地からN字上げ: lines set to the end, raised from it', () => {
  /** How far short of the column's end side a block's box stops: the
   *  renderers align and justify its lines against that box. */
  const lineEnd = (doc: VDTDocument, b: VDTBlock): number => {
    const col = doc.pages[b.pageIndex!]!.columns[0]!;
    return col.bbox.x + col.bbox.width - (b.bbox.x + b.bbox.width);
  };

  it('a fence attribute sets the date flush with the foot, the signature a character above it', () => {
    for (const c of [config(), vertical()]) {
      const doc = buildDocument({ markdown: `${LINE}\n\n:::paragraphs{align=end}\n十月五日\n:::\n\n:::paragraphs{align=end endIndent=1}\n先生より\n:::` }, c);
      const [, date, signature] = paragraphs(doc);
      expect(date!.textAlign).toBe('right');
      expect(lineEnd(doc, date!)).toBeCloseTo(0, 6);
      expect(lineEnd(doc, signature!)).toBeCloseTo(BODY, 6);
      expect(signature!.textAlign).toBe('right');
      // The text after the fences is back on the grid.
      expect((firstLine(signature!).bbox.y - columnTop(doc, signature!)) / PITCH % 1).toBeCloseTo(0, 6);
    }
  });

  it('a paragraph style does the same with endIndent, which narrows the measure', () => {
    const doc = buildDocument({ markdown: `:::paragraphs{style="sign"}\n${LINE}${LINE}\n:::` }, config({
      paragraphStyles: [{ id: 'sign', endIndent: em(2), textAlign: 'end' }],
    }));
    const [p] = paragraphs(doc);
    // 18 characters a line: 40 characters take three lines.
    expect(p!.lines).toHaveLength(3);
    expect(lineEnd(doc, p!)).toBeCloseTo(2 * BODY, 6);
    // Painted: the last line, set ragged, ends 2 characters short of the
    // column's end.
    const tail = p!.lines.at(-1)!.text;
    const left = Number(new RegExp(`left:([\\d.]+)px;[^"]*">${tail}<`).exec(renderToHtml(doc))?.[1]);
    expect(left).toBeCloseTo(200 - 2 * BODY - BODY * tail.length, 2);
  });

  it('an inner fence takes the enclosing style (a letter indented 1字, its signature raised 2字)', () => {
    const doc = buildDocument({ markdown: `:::paragraphs{style="letter"}\n${LINE}\n\n:::paragraphs{align=end endIndent=2}\nＫより\n:::\n:::` }, config({
      paragraphStyles: [{ id: 'letter', indent: em(1), color: { hex: '#333333', model: 'hex' } }],
    }));
    const [body, sign] = paragraphs(doc);
    expect(firstLine(body!).bbox.x - body!.bbox.x).toBeCloseTo(BODY, 6);
    expect(sign!.color).toBe('#333333');
    expect(sign!.paragraphStyleId).toBe('letter');
    expect(lineEnd(doc, sign!)).toBeCloseTo(2 * BODY, 6);
  });

  it('resolves endIndent only when set', () => {
    const body = resolveBodyTextConfig(undefined);
    const [plain, raised] = resolveParagraphStylesConfig([{ id: 'a' }, { id: 'b', endIndent: em(1) }], body);
    expect('endIndent' in plain!).toBe(false);
    expect(raised!.endIndent).toEqual(em(1));
    expect(stripParagraphStylesDefaults([{ id: 'a', endIndent: em(0) }, { id: 'b', endIndent: em(1) }])).toEqual([{ id: 'a' }, { id: 'b', endIndent: em(1) }]);
  });
});

describe('ページの左右中央: a page centred in the block direction (:::pagebreak{center})', () => {
  it('centres the text of the page the break opens, in both writing modes', () => {
    for (const c of [config(), vertical()]) {
      const doc = buildDocument({ markdown: `${LINE}\n\n:::pagebreak{center}\n\n亡き友に\n\n:::pagebreak\n\n${LINE}` }, c);
      const dedication = paragraphs(doc)[1]!;
      expect(dedication.pageIndex).toBe(1);
      const col = doc.pages[1]!.columns[0]!;
      const line = firstLine(dedication);
      expect(line.bbox.y + line.bbox.height / 2).toBeCloseTo(col.bbox.y + col.bbox.height / 2, 6);
      // The other pages keep their text at the head.
      expect(firstLine(paragraphs(doc)[2]!).bbox.y).toBeCloseTo(doc.pages[2]!.columns[0]!.bbox.y, 6);
    }
  });

  it('moves a page of several blocks as one, and leaves a full page alone', () => {
    const doc = buildDocument({ markdown: `:::pagebreak{center}\n\n## 献辞\n\n亡き友に\n\nこの書を捧ぐ` }, config());
    const [h, a, b] = [heading(doc), ...paragraphs(doc)];
    const col = doc.pages[0]!.columns[0]!;
    const top = firstLine(h).bbox.y;
    const bottom = firstLine(b!).bbox.y + PITCH;
    expect((top + bottom) / 2).toBeCloseTo(col.bbox.y + col.bbox.height / 2, 6);
    expect(firstLine(b!).bbox.y - firstLine(a!).bbox.y).toBeCloseTo(PITCH, 6);
    const full = buildDocument({ markdown: `:::pagebreak{center}\n\n${LINE.repeat(10)}` }, config());
    expect(firstLine(paragraphs(full)[0]!).bbox.y).toBeCloseTo(full.pages[0]!.columns[0]!.bbox.y, 6);
  });

  it('is off without the attribute and with center=false', () => {
    for (const md of [`${LINE}\n\n:::pagebreak\n\n亡き友に`, `${LINE}\n\n:::pagebreak{center=false}\n\n亡き友に`]) {
      const doc = buildDocument({ markdown: md }, config());
      expect(firstLine(paragraphs(doc)[1]!).bbox.y).toBeCloseTo(doc.pages[1]!.columns[0]!.bbox.y, 6);
    }
  });
});

describe('a heading never ends a page, except at the foot of an even page (keepWithNextSpread)', () => {
  /** A one-line heading, no margins: it takes exactly one grid line. */
  const flat: HeadingLevelConfig = { level: 2, fontSize: pt(BODY), lineHeight: pt(PITCH), marginTop: pt(0), marginBottom: pt(0) };
  /** `lines` lines of text, then a heading and its text: the heading falls
   *  on line `lines + 1` of the flow. */
  const markdown = (lines: number) => `${LINE.repeat(lines)}\n\n## 二\n\n${LINE.repeat(4)}`;
  const both = [config({}, [flat]), vertical({}, [flat])].map((c) => headingsWith(c, { balancing: { enabled: false } }));
  const withSpread = (c: PostextConfig): PostextConfig => headingsWith(c, { keepWithNextSpread: true });

  it('moves a heading off the foot of a page by default', () => {
    for (const c of both) expect(heading(buildDocument({ markdown: markdown(19) }, c)).pageIndex).toBe(2);
  });

  it('lets it close an even page with keepWithNextSpread: its text opens the facing page', () => {
    for (const c of both) {
      const doc = buildDocument({ markdown: markdown(19) }, withSpread(c));
      const h = heading(doc);
      expect(h.pageIndex).toBe(1);
      expect(h.bbox.y - columnTop(doc, h)).toBeCloseTo(9 * PITCH, 6);
      expect(paragraphs(doc).at(-1)!.pageIndex).toBe(2);
    }
  });

  it('still moves it off an odd page', () => {
    for (const c of both) expect(heading(buildDocument({ markdown: markdown(29) }, withSpread(c))).pageIndex).toBe(3);
  });
});
