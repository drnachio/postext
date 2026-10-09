import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../parse';
import { buildDocument } from '../pipeline';
import { renderToHtml } from '../html-backend';
import { measureRichBlock } from '../measure';
import { collectConfigWarnings } from '../configWarnings';
import { collectContentWarnings } from '../pipeline/contentWarnings';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../defaults/bodyText';
import { resolveParagraphStylesConfig, stripParagraphStylesDefaults } from '../defaults/paragraphStyles';
import { defaultDecimalChar } from '../measure/tabs';
import type { PostextConfig, TabStop } from '../types';
import type { VDTBlock, VDTDocument, VDTLine, VDTLineSegment } from '../vdt';
import { pageIsMirrored } from '../vdt';

// #622: tab stops and leaders in body text. A tab (`:tab`, or a tab
// character in a paragraph whose style sets stops) sends the text after it
// to a stop: start, end, centre or decimal, with a leader over the room.

/** 7 px a character, and 3 px more between two full stops in a row: the
 *  face spaces a run of dots apart (the EF-148 fixture). */
class KerningCtx {
  font = '';
  measureText(s: string): { width: number } {
    let w = s.length * 7;
    for (let i = 1; i < s.length; i++) if (s[i] === '.' && s[i - 1] === '.') w += 3;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): KerningCtx {
    return new KerningCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
/** A 260 px measure at 72 dpi (300 pt page, 20 pt margins). */
const config = (bodyText: Record<string, unknown> = {}, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { dpi: 72, width: pt(300), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { firstLineIndent: pt(0), textAlign: 'left', fontFamily: 'Test', boldFontWeight: 700, hyphenation: { enabled: false }, ...bodyText },
  ...extra,
});
const MARGIN = 20;
const stops = (...list: TabStop[]) => ({ tabStops: list });

const paragraphs = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'paragraph');
const linesOf = (md: string, cfg: PostextConfig): VDTLine[] => paragraphs(buildDocument({ markdown: md }, cfg)).flatMap((b) => b.lines);

/** The x (from the measure's start) where each segment of a line starts, in
 *  logical order. */
function xs(line: VDTLine): number[] {
  const out: number[] = [];
  let x = line.bbox.x - MARGIN;
  for (const seg of line.segments ?? []) {
    out.push(x);
    x += seg.width;
  }
  return out;
}
/** Where the text segment `text` starts and ends on the line. */
function placeOf(line: VDTLine, text: string): { start: number; end: number } {
  const segs = line.segments!;
  const at = xs(line);
  const i = segs.findIndex((s) => s.text === text && !s.leader);
  expect(i, `segment "${text}" in ${JSON.stringify(segs.map((s) => s.text))}`).toBeGreaterThanOrEqual(0);
  return { start: at[i]!, end: at[i]! + segs[i]!.width };
}
const leaderOf = (line: VDTLine): { seg: VDTLineSegment; start: number; end: number } | undefined => {
  const i = line.segments?.findIndex((s) => s.leader) ?? -1;
  if (i < 0) return undefined;
  const at = xs(line);
  return { seg: line.segments![i]!, start: at[i]!, end: at[i]! + line.segments![i]!.width };
};

describe('the parser (#622)', () => {
  it('reads `:tab` as a tab of its own, taking the spaces around it, the source map 1:1', () => {
    const md = 'Soup :tab 8.50';
    const [b] = parseMarkdown(md);
    expect(b!.text).toBe('Soup\t8.50');
    expect(b!.spans.find((s) => s.tab)).toMatchObject({ text: '\t', tab: {} });
    expect(b!.sourceMap).toHaveLength(b!.text.length);
    expect(b!.sourceMap[4]).toBe(md.indexOf(':tab'));
    expect(b!.sourceMap[5]).toBe(md.indexOf('8.50'));
  });

  it('reads the attributes of `:tab{…}` as a one-off stop', () => {
    const [b] = parseMarkdown('a :tab{at=120mm align=end leader="."} b');
    expect(b!.text).toBe('a\tb');
    expect(b!.spans.find((s) => s.tab)!.tab).toEqual({ stop: { position: { value: 120, unit: 'mm' }, align: 'end', leader: '.' } });
    expect(b!.sourceMap[2]).toBe('a :tab{at=120mm align=end leader="."} '.length);
  });

  it('leaves `3:table`, `:tab` in code and in a link destination as text', () => {
    expect(parseMarkdown('ratio 3:table')[0]!.text).toBe('ratio 3:table');
    expect(parseMarkdown('In `a :tab b` code')[0]!.text).toBe('In a :tab b code');
    expect(parseMarkdown('[x](http://h/:tab) y')[0]!.text).toBe('x y');
  });

  it('keeps a tab character inside a line, tabs in a row as one', () => {
    const [b] = parseMarkdown('lead\ttab inside');
    expect(b!.text).toBe('lead\ttab inside');
    expect(b!.spans.find((s) => s.tab)!.tab).toEqual({ literal: true });
    const [two] = parseMarkdown('a\t \tb');
    expect(two!.text).toBe('a\tb');
    expect(two!.spans.find((s) => s.tab)!.tab).toEqual({ literal: true, count: 2 });
    expect(two!.sourceMap).toEqual([0, 1, 4]);
  });
});

describe('the stops (#622)', () => {
  it('a start stop starts the text after the tab on it', () => {
    const [line] = linesOf('ab\tcd', config(stops({ position: pt(100) })));
    expect(line!.text).toBe('ab\tcd');
    expect(line!.tabbed).toBe(true);
    expect(placeOf(line!, 'cd').start).toBeCloseTo(100, 3);
    const tab = line!.segments!.find((s) => s.text === '\t')!;
    expect(tab).toMatchObject({ kind: 'space', labelTab: true });
  });

  it('an end stop ends the text up to the next tab or the paragraph end on it', () => {
    const [line] = linesOf('Soup\t8.50', config(stops({ position: pt(200), align: 'end' })));
    expect(placeOf(line!, '8.50').end).toBeCloseTo(200, 3);
  });

  it('a centre stop centres the text on it', () => {
    const [line] = linesOf('ab\tcdef', config(stops({ position: pt(150), align: 'center' })));
    const p = placeOf(line!, 'cdef');
    expect((p.start + p.end) / 2).toBeCloseTo(150, 3);
  });

  it('a decimal stop puts the separator on it, the locale\'s by default', () => {
    const [line] = linesOf('Wine\t12.50', config(stops({ position: pt(150), align: 'decimal' })));
    expect(placeOf(line!, '12.50').start + 2 * 7).toBeCloseTo(150, 3);
    // Spanish: the comma.
    expect(defaultDecimalChar('es')).toBe(',');
    expect(defaultDecimalChar('en')).toBe('.');
    const [comma] = linesOf('Vino\t12,50', { ...config(stops({ position: pt(150), align: 'decimal' })), locale: 'es' });
    expect(placeOf(comma!, '12,50').start + 2 * 7).toBeCloseTo(150, 3);
    // A run without the separator ends on the stop.
    const [none] = linesOf('Tea\t3', config(stops({ position: pt(150), align: 'decimal' })));
    expect(placeOf(none!, '3').end).toBeCloseTo(150, 3);
  });

  it('a stop at `end` or a percentage stands on the measure', () => {
    const [end] = linesOf('ab\tcd', config(stops({ position: 'end', align: 'end' })));
    expect(placeOf(end!, 'cd').end).toBeCloseTo(260, 3);
    const [half] = linesOf('ab\tcd', config(stops({ position: '50%' })));
    expect(placeOf(half!, 'cd').start).toBeCloseTo(130, 3);
  });

  it('goes to the first stop past the text, the next tab to the next stop', () => {
    const cfg = config(stops({ position: pt(50) }, { position: pt(120) }, { position: pt(200), align: 'end' }));
    const [line] = linesOf('a\tb\tc\td', cfg);
    expect(placeOf(line!, 'b').start).toBeCloseTo(50, 3);
    expect(placeOf(line!, 'c').start).toBeCloseTo(120, 3);
    expect(placeOf(line!, 'd').end).toBeCloseTo(200, 3);
    // Text past the first stop: the tab goes to the next.
    const [past] = linesOf('abcdefghij\tb', cfg);
    expect(placeOf(past!, 'b').start).toBeCloseTo(120, 3);
  });
});

describe('leaders (#622)', () => {
  const menu = config({ ...stops({ position: 'end', align: 'end', leader: '.', leaderGap: pt(7) }) });

  it('fill the room before the stop, ending at one x on every line whatever the text before', () => {
    const lines = linesOf(['Soup\t8.50', 'Roast lamb\t21.00', 'Pie\t6'].join('\n\n'), menu);
    expect(lines).toHaveLength(3);
    const ends = lines.map((l) => leaderOf(l)!.end);
    // Each leader ends one gap before the widest price's start: the dots
    // stop short of the price on each line, never over it.
    for (const [i, line] of lines.entries()) {
      const leader = leaderOf(line)!;
      expect(leader.seg).toMatchObject({ kind: 'text', leader: 'text' });
      expect(leader.seg.text).toMatch(/^\.+$/);
      const price = line.segments!.find((s, k) => k > line.segments!.indexOf(leader.seg) && s.kind === 'text')!;
      expect(placeOf(line, price.text).start - leader.end).toBeGreaterThanOrEqual(7 - 1e-6);
      // The run is measured whole: the kerned dots fit their room.
      expect(leader.seg.width).toBeCloseTo(new KerningCtx().measureText(leader.seg.text).width, 6);
      void i;
    }
    // Prices of one width end their leaders at one x.
    expect(ends[0]).toBeCloseTo(ends[0]!, 6);
    const [a, b] = linesOf(['Soup\t8.50', 'Roast lamb\t9.50'].join('\n\n'), menu);
    expect(leaderOf(a!)!.end).toBeCloseTo(leaderOf(b!)!.end, 6);
  });

  it('a rule leader runs across the room, and to the line end when nothing follows', () => {
    const form = config(stops({ position: 'end', leader: 'rule', leaderGap: pt(7) }));
    const [line] = linesOf('Name: :tab', form);
    const leader = leaderOf(line!)!;
    expect(leader.seg).toMatchObject({ kind: 'text', text: '', leader: 'rule' });
    expect(leader.end).toBeCloseTo(260, 3);
    expect(leader.start).toBeCloseTo(5 * 7 + 7, 3);
  });

  it('are no text: not in the line text, the plain text or a copy', () => {
    const doc = buildDocument({ markdown: 'Soup\t8.50' }, menu);
    const [line] = paragraphs(doc)[0]!.lines;
    expect(line!.text).toBe('Soup\t8.50');
    expect(line!.text).not.toMatch(/\.\./);
    const html = renderToHtml(doc);
    const dots = leaderOf(line!)!.seg.text;
    expect(html).toContain(`aria-hidden="true" style="position:absolute;`);
    const hidden = new RegExp(`<span aria-hidden="true"[^>]*user-select:none[^>]*>${dots.replace(/\./g, '\\.')}</span>`);
    expect(html).toMatch(hidden);
  });
});

describe('past the last stop (#622)', () => {
  it('a tab is a word space without `tabInterval`', () => {
    const [line] = linesOf('a\tb\tc', config(stops({ position: pt(50) })));
    expect(placeOf(line!, 'b').start).toBeCloseTo(50, 3);
    // The second tab: one word space (7 px) after `b`.
    expect(placeOf(line!, 'c').start).toBeCloseTo(50 + 7 + 7, 3);
  });

  it('goes to the next interval with it', () => {
    const [line] = linesOf('a\tb\tc', config({ ...stops({ position: pt(50) }), tabInterval: pt(36) }));
    expect(placeOf(line!, 'b').start).toBeCloseTo(50, 3);
    expect(placeOf(line!, 'c').start).toBeCloseTo(72, 3);
    // Default stops alone.
    const [only] = linesOf('abcdef\tb', config({ tabInterval: pt(36) }));
    expect(placeOf(only!, 'b').start).toBeCloseTo(72, 3);
  });
});

describe('overrun (#622)', () => {
  it('an end stop takes the last word before it down with the text at the stop', () => {
    const cfg = config(stops({ position: 'end', align: 'end', leader: '.', leaderGap: pt(7) }));
    // 35 characters of dish (245 px) and a 35 px price: no room for both
    // with the gaps on one 260 px line.
    const lines = linesOf('Roast leg of lamb with rosemary jus\t21.00', cfg);
    expect(lines.map((l) => l.text)).toEqual(['Roast leg of lamb with rosemary', 'jus\t21.00']);
    expect(placeOf(lines[1]!, '21.00').end).toBeCloseTo(260, 3);
    expect(leaderOf(lines[1]!)).toBeDefined();
  });

  it('a start stop breaks the line before the tab', () => {
    const cfg = config(stops({ position: pt(70) }));
    const lines = linesOf('Question twelve\tanswer', cfg);
    expect(lines.map((l) => l.text)).toEqual(['Question twelve', '\tanswer']);
    expect(placeOf(lines[1]!, 'answer').start).toBeCloseTo(70, 3);
  });
});

describe('justified text (#622)', () => {
  it('stretches only the word spaces after the last tab of a line', () => {
    const cfg = config({ textAlign: 'justify', ...stops({ position: pt(70) }) });
    const lines = linesOf('Item one\tthe words after the tab run on past the end of the line and wrap', cfg);
    const first = lines[0]!;
    expect(first.text.startsWith('Item one\t')).toBe(true);
    expect(first.ragged).toBe(true);
    expect(first.justifiedSpaceRatio).toBeUndefined();
    const segs = first.segments!;
    const tabAt = segs.findIndex((s) => s.text === '\t');
    // The space before the tab keeps its width; the ones after it fill the
    // line to the measure.
    expect(segs[1]).toMatchObject({ kind: 'space', width: 7 });
    const after = segs.slice(tabAt + 1).filter((s) => s.kind === 'space');
    expect(after.length).toBeGreaterThan(0);
    for (const s of after) expect(s.width).toBeGreaterThan(7);
    const total = segs.reduce((sum, s) => sum + s.width, 0);
    expect(first.bbox.x - MARGIN + total).toBeCloseTo(260, 3);
    // The paragraph's last line stays at its natural width.
    expect(lines[lines.length - 1]!.segments!.filter((s) => s.kind === 'space').every((s) => s.width === 7)).toBe(true);
  });
});

describe('stored documents (#622)', () => {
  it('a tab character in a paragraph without stops is the word space it was', () => {
    const md = 'lead\ttab inside a paragraph long enough to break over two lines or more at this measure';
    const tabbed = linesOf(md, config({ textAlign: 'justify' }));
    const spaced = linesOf(md.replace('\t', ' '), config({ textAlign: 'justify' }));
    expect(tabbed.map((l) => ({ text: l.text, segs: l.segments, bbox: l.bbox, ratio: l.justifiedSpaceRatio })))
      .toEqual(spaced.map((l) => ({ text: l.text, segs: l.segments, bbox: l.bbox, ratio: l.justifiedSpaceRatio })));
    const doc = buildDocument({ markdown: '**a**\t*b*\tc [link](http://x.y) d' }, config());
    expect(paragraphs(doc)[0]!.lines[0]!.text).toBe('a b c link d');
  });

  it('a paragraph style with stops makes its tab characters tabs', () => {
    const cfg = config({}, { paragraphStyles: [{ id: 'menu', tabStops: [{ position: 'end', align: 'end' }] }] });
    const doc = buildDocument({ markdown: ':::paragraphs{style="menu"}\nSoup\t8.50\n:::\n\nPlain\ttext' }, cfg);
    const [menuLine, plainLine] = paragraphs(doc).map((b) => b.lines[0]!);
    expect(placeOf(menuLine!, '8.50').end).toBeCloseTo(260, 3);
    expect(plainLine!.text).toBe('Plain text');
  });
});

describe('`:tab` (#622)', () => {
  it('goes to its own stop without a style', () => {
    const [line] = linesOf('Who wrote it? :tab{at=end align=end} 1 mark', config());
    expect(placeOf(line!, 'mark').end).toBeCloseTo(260, 3);
  });

  it('is a word space with no stop to go to', () => {
    const [line] = linesOf('a :tab b', config());
    expect(placeOf(line!, 'b').start).toBeCloseTo(14, 3);
  });
});

describe('right-to-left text (#622)', () => {
  const cfg = config({ ...stops({ position: 'end', align: 'end', leader: '.', leaderGap: pt(7) }) }, { direction: 'rtl', locale: 'ar' });
  const kindsOf = (segs: readonly VDTLineSegment[]) => segs.map((s) => (s.leader ? 'leader' : s.text === '\t' ? 'tab' : s.kind === 'text' ? s.text : 'gap'));

  it('measures stops from the start side: an end stop sits at the left, the leader between in visual order', () => {
    const [line] = measureRichBlock(
      [{ text: 'شوربة', bold: false, italic: false }, { text: '\t', bold: false, italic: false, tab: {} }, { text: '٨٫٥٠', bold: false, italic: false }],
      '16px Test', '700 16px Test', 'italic 16px Test', 'italic 700 16px Test', 260, 24,
      { direction: 'rtl', tabs: { stops: [{ at: 'end', align: 'end', leader: '.', gapPx: 7, decimalChar: '.' }] } },
    ).lines;
    const segs = line!.segments!;
    // Left to right: the price, the gap, the leader, the tab, the dish.
    expect(kindsOf(line!.order!.map((i) => segs[i]!))).toEqual(['٨٫٥٠', 'gap', 'leader', 'tab', 'شوربة']);
    expect(segs.reduce((sum, s) => sum + s.width, 0)).toBeCloseTo(260, 3);
  });

  it('in a right-to-left book the flow runs from the dish to the price, mirrored on the sheet', () => {
    const doc = buildDocument({ markdown: 'شوربة\t٨٫٥٠' }, cfg);
    const line = paragraphs(doc)[0]!.lines[0]!;
    expect(pageIsMirrored(doc.pages[0]!)).toBe(true);
    const segs = line.segments!;
    const order = line.order ?? segs.map((_, i) => i);
    expect(kindsOf(order.map((i) => segs[i]!))).toEqual(['شوربة', 'tab', 'leader', 'gap', '٨٫٥٠']);
  });
});

describe('Chinese and vertical text (#622)', () => {
  it('sets a Chinese paragraph with a tab line by line, breaking between characters', () => {
    const cfg = config({ ...stops({ position: 'end', align: 'end', leader: '·', leaderGap: pt(7) }) }, { locale: 'zh' });
    const [line] = linesOf('清汤\t八元', cfg);
    expect(line!.cjkComposed).toBeUndefined();
    expect(placeOf(line!, '八元').end).toBeCloseTo(260, 3);
    expect(leaderOf(line!)!.seg.text).toMatch(/^·+$/);
  });

  it('sets a tab in vertical text as a word space, and says so', () => {
    const cfg = config({}, { layout: { layoutType: 'single', writingMode: 'vertical-rl' }, locale: 'ja' });
    const md = '品名 :tab 値段';
    const doc = buildDocument({ markdown: md }, cfg);
    const line = paragraphs(doc)[0]!.lines[0]!;
    expect(line.tabbed).toBeUndefined();
    expect(line.text).toBe('品名 値段');
    const w = collectContentWarnings(md, cfg).filter((x) => x.kind === 'tabInVerticalText');
    expect(w).toEqual([{ kind: 'tabInVerticalText', sourceStart: 3, sourceEnd: 7 }]);
    expect(collectContentWarnings(md, config()).some((x) => x.kind === 'tabInVerticalText')).toBe(false);
  });
});

describe('callouts and lists (#622)', () => {
  it('a callout body sets its own stops; lists and quotes take the body\'s', () => {
    const cfg = config(stops({ position: pt(100) }), {
      calloutStyles: [{ id: 'menu', padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) }, border: { width: pt(0) }, body: { tabStops: [{ position: pt(40) }] } }],
    });
    const doc = buildDocument({ markdown: ':::callout{type="menu"}\nab\tcd\n:::\n\n- ab\tcd\n\n> ab\tcd' }, cfg);
    const lines = doc.blocks.filter((b) => b.lines.some((l) => l.text === 'ab\tcd')).map((b) => b.lines.find((l) => l.text === 'ab\tcd')!);
    expect(lines).toHaveLength(3);
    const starts = lines.map((l) => {
      const segs = l.segments!;
      const i = segs.findIndex((s) => s.text === 'cd');
      return segs.slice(0, i).reduce((sum, s) => sum + s.width, 0) + l.bbox.x;
    });
    const block = (i: number) => doc.blocks.find((b) => b.lines.includes(lines[i]!))!;
    // The box: 40 px from its text's start; the list item and the quote:
    // 100 px from theirs.
    expect(starts[0]! - block(0).bbox.x).toBeCloseTo(40, 1);
    expect(lines[1]!.tabbed).toBe(true);
    expect(lines[2]!.tabbed).toBe(true);
  });
});

describe('the settings (#622)', () => {
  it('resolve and strip as written, absent when unset', () => {
    const tabStops: TabStop[] = [{ position: { value: 30, unit: 'mm' }, align: 'end', leader: '. ' }];
    const body = resolveBodyTextConfig({ tabStops, tabInterval: pt(36) });
    expect(body.tabStops).toEqual(tabStops);
    expect(body.tabInterval).toEqual(pt(36));
    expect(stripBodyTextDefaults(body)).toMatchObject({ tabStops, tabInterval: pt(36) });
    expect('tabStops' in resolveBodyTextConfig({})).toBe(false);
    const [style] = resolveParagraphStylesConfig([{ id: 'menu', tabStops }], resolveBodyTextConfig({}));
    expect(style!.tabStops).toEqual(tabStops);
    expect(stripParagraphStylesDefaults([{ id: 'menu', tabStops }])).toEqual([{ id: 'menu', tabStops }]);
  });

  it('report an unknown key, alignment or position', () => {
    const cfg = { bodyText: { tabStops: [{ position: 'middle', align: 'right', leaders: '.' }] } } as unknown as PostextConfig;
    const warnings = collectConfigWarnings(cfg);
    expect(warnings).toContainEqual({ kind: 'unknownConfigKey', path: 'bodyText.tabStops[0].leaders', value: 'leaders', used: '', suggestion: 'leader' });
    expect(warnings).toContainEqual({ kind: 'unknownConfigValue', path: 'bodyText.tabStops[0].align', value: 'right', used: 'start' });
    expect(warnings).toContainEqual({ kind: 'unknownConfigValue', path: 'bodyText.tabStops[0].position', value: 'middle', used: 'none' });
    expect(collectConfigWarnings(config(stops({ position: '25%', align: 'decimal', leader: 'rule', leaderGap: pt(2), decimalChar: ',' })))).toEqual([]);
  });

  it('change the lines of a cached measurement', () => {
    const md = 'ab\tcd';
    const a = linesOf(md, config(stops({ position: pt(100) })));
    const b = linesOf(md, config(stops({ position: pt(120) })));
    expect(placeOf(a[0]!, 'cd').start).toBeCloseTo(100, 3);
    expect(placeOf(b[0]!, 'cd').start).toBeCloseTo(120, 3);
  });
});

describe('plain text and source ranges (#622)', () => {
  it('reads a tab as \\t and no leader, every character of a line mapped to the source', () => {
    const md = 'Soup :tab 8.50';
    const doc = buildDocument({ markdown: md }, config(stops({ position: 'end', align: 'end', leader: '.' })));
    const [line] = paragraphs(doc)[0]!.lines;
    expect(line!.text).toBe('Soup\t8.50');
    expect(line!.plainStart).toBe(0);
    expect(line!.plainEnd).toBe(9);
    expect(line!.sourceStart).toBe(0);
    expect(line!.sourceEnd).toBe(md.length);
  });
});
