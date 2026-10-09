import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../parse';
import { buildDocument } from '../pipeline';
import { renderToHtml } from '../html-backend';
import { renderPageToCanvas } from '../index';
import { CONFIG_VERSION, migrateConfig, migrateBundleConfig, pinLegacyPairedIndents, pinLegacyVerseLayout, pinLegacyVerseTightening } from '../bundle/configVersion';
import { resolveVerseConfig, stripVerseDefaults, DEFAULT_VERSE_CONFIG } from '../defaults/verse';
import { stripBodyTextDefaults } from '../defaults/bodyText';
import type { PostextConfig } from '../types';
import type { VDTBlock, VDTDocument, VDTLine } from '../vdt';

// #620: verse line by line — kept line breaks, indents, stanzas and
// hanging turnovers. The stub font: 7 px a character, a space 4 px.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    let w = 0;
    for (const c of s) w += c === ' ' ? 4 : 7;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const em = (value: number) => ({ value, unit: 'em' as const });
// 72 dpi, a 20 pt body on 30 pt leading, a 360 pt measure from x = 20.
const config = (extra: PostextConfig = {}, width = 400, height = 600): PostextConfig => ({
  page: { dpi: 72, width: pt(width), height: pt(height), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  ...extra,
  bodyText: { fontSize: pt(20), lineHeight: { value: 1.5, unit: 'em' }, firstLineIndent: pt(0), hyphenation: { enabled: false }, ...extra.bodyText },
});
const verseLines = (doc: VDTDocument): VDTLine[] => doc.blocks.flatMap((b) => b.lines.filter((l) => l.verseLine));
const stanzaBlocks = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.lines.some((l) => l.verseLine));
const pageOf = (doc: VDTDocument, line: VDTLine): number => doc.pages.findIndex((p) => p.columns.some((c) => c.blocks.some((b) => b.lines.includes(line))));

const POEM = [
  'Before the poem.',
  '',
  ':::verse{align=start}',
  'Whose woods these are I think I know.',
  '  His house is in the village though;',
  '',
  '',
  'He will not see me *stopping* here',
  '\tTo watch his woods fill up with snow.',
  ':::',
  '',
  'After the poem.',
].join('\n');

describe(':::verse line by line: the markup', () => {
  const blocks = parseMarkdown(POEM);
  const stanzas = blocks.filter((b) => b.verse);

  it('reads a stanza a block, a line of verse a line, the indent out of the text', () => {
    expect(stanzas.map((b) => b.text)).toEqual([
      'Whose woods these are I think I know.\nHis house is in the village though;',
      'He will not see me stopping here\nTo watch his woods fill up with snow.',
    ]);
    expect(stanzas.map((b) => b.verse!.stanza!.lines.map((l) => l.indent))).toEqual([[0, 2], [0, 4]]);
    expect(stanzas.map((b) => [b.verse!.stanza!.index, b.verse!.stanza!.last, b.verse!.stanza!.firstLine])).toEqual([[0, false, 0], [1, true, 2]]);
    expect(stanzas.every((b) => b.verse!.stanza!.poem === stanzas[0]!.verse!.stanza!.poem && b.verse!.stanza!.auto)).toBe(true);
    expect(stanzas[1]!.spans.find((s) => s.italic)?.text).toBe('stopping');
    expect(blocks.map((b) => b.text)).toEqual(['Before the poem.', stanzas[0]!.text, stanzas[1]!.text, 'After the poem.']);
  });

  it('maps every character to its source, a line feed to the line end, the first stanza from the fence and the last to its close', () => {
    for (const b of stanzas) {
      for (let i = 0; i < b.text.length; i++) {
        const at = b.sourceMap[i]!;
        expect(POEM[at], `${b.text[i]} at ${i}`).toBe(b.text[i]);
      }
    }
    expect(stanzas[0]!.sourceStart).toBe(POEM.indexOf(':::verse'));
    expect(stanzas[1]!.sourceStart).toBe(POEM.indexOf('He will'));
    expect(stanzas[0]!.sourceEnd).toBe(POEM.indexOf(' though;') + ' though;'.length);
    expect(stanzas[1]!.sourceEnd).toBe(POEM.indexOf(':::\n\nAfter') + 3);
    // The poem as written: a line feed between lines, two between stanzas.
    expect(stanzas.map((b) => b.text).join('\n\n')).toBe(
      'Whose woods these are I think I know.\nHis house is in the village though;\n\nHe will not see me stopping here\nTo watch his woods fill up with snow.',
    );
  });

  it('keeps the bayt layout when a line carries a separator, and follows the fence', () => {
    const bayts = parseMarkdown(':::verse\nOne line || its half\nA single line\n:::').filter((b) => b.verse);
    expect(bayts).toHaveLength(1);
    expect(bayts[0]!.verse!.stanza).toBeUndefined();
    expect(bayts[0]!.text).toBe('One line\tits half\nA single line');
    const forced = parseMarkdown(':::verse{layout=bayt}\nA single line\n:::').filter((b) => b.verse);
    expect(forced[0]!.verse!.stanza).toBeUndefined();
    const lines = parseMarkdown(':::verse{layout=lines}\nA || B\n:::').filter((b) => b.verse);
    expect(lines[0]!.verse!.stanza).toBeDefined();
    expect(lines[0]!.verse!.stanza!.auto).toBeUndefined();
    expect(lines[0]!.text).toBe('A || B');
  });

  it('reads a stepped line, an ideographic indent and a caesura kept with keepSpaces', () => {
    const [st] = parseMarkdown(':::verse{keepSpaces}\nWho is there?\n+ Nay, answer me.\n　　Stand,   and unfold\n:::').filter((b) => b.verse);
    expect(st!.verse!.stanza!.lines).toEqual([{ indent: 0 }, { indent: 0, stepped: true }, { indent: 4 }]);
    expect(st!.text).toBe('Who is there?\nNay, answer me.\nStand,   and unfold');
    const gap = st!.spans.find((s) => s.fixedSpace)!;
    expect(gap.text).toBe('   ');
    // Without keepSpaces a run of spaces collapses.
    const [plain] = parseMarkdown(':::verse\nStand,   and unfold\n:::').filter((b) => b.verse);
    expect(plain!.text).toBe('Stand, and unfold');
  });

  it('drops an empty poem and runs an unclosed one to the end', () => {
    expect(parseMarkdown(':::verse\n\n\n:::\n\nText.').map((b) => b.text)).toEqual(['Text.']);
    const open = parseMarkdown(':::verse\nOne\n\nTwo');
    expect(open.map((b) => b.text)).toEqual(['One', 'Two']);
    expect(open[1]!.verse!.stanza!.last).toBe(true);
  });
});

describe(':::verse line by line: the layout', () => {
  const doc = buildDocument({ markdown: POEM }, config());
  const lines = verseLines(doc);

  it('sets one line a line of verse, a stanza space at the blank lines', () => {
    expect(lines.map((l) => l.text)).toEqual([
      'Whose woods these are I think I know.',
      'His house is in the village though;',
      'He will not see me stopping here',
      'To watch his woods fill up with snow.',
    ]);
    expect(lines.map((l) => l.verseLine)).toEqual([
      { stanza: 0, line: 0, turnover: false },
      { stanza: 0, line: 1, turnover: false, indent: 20, stanzaEnd: true },
      { stanza: 1, line: 2, turnover: false },
      { stanza: 1, line: 3, turnover: false, indent: 40 },
    ]);
    expect(lines[1]!.baseline - lines[0]!.baseline).toBeCloseTo(30, 6);
    // One line of the poem's leading between the stanzas.
    expect(lines[2]!.baseline - lines[1]!.baseline).toBeCloseTo(60, 6);
    expect(stanzaBlocks(doc)).toHaveLength(2);
  });

  it('indents a line by its leading spaces: two spaces one em, a tab four spaces', () => {
    expect(lines[0]!.bbox.x).toBeCloseTo(20, 6);
    expect(lines[1]!.bbox.x - lines[0]!.bbox.x).toBeCloseTo(20, 6);
    expect(lines[3]!.bbox.x - lines[2]!.bbox.x).toBeCloseTo(40, 6);
    const step = verseLines(buildDocument({ markdown: POEM.replace('{align=start}', '{align=start indentStep=1em}') }, config()));
    expect(step[1]!.bbox.x - step[0]!.bbox.x).toBeCloseTo(40, 6);
    const cfg = verseLines(buildDocument({ markdown: POEM }, config({ bodyText: { verse: { indentStep: pt(5) } } })));
    expect(cfg[1]!.bbox.x - cfg[0]!.bbox.x).toBeCloseTo(10, 6);
  });

  it('centres the poem on its longest line, every line flush with its start', () => {
    const centred = verseLines(buildDocument({ markdown: POEM.replace('{align=start}', '') }, config()));
    const right = Math.max(...centred.map((l) => l.bbox.x + l.bbox.width));
    const left = Math.min(...centred.map((l) => l.bbox.x));
    expect(left - 20).toBeCloseTo(380 - right, 6);
    expect(centred[0]!.bbox.x).toBeCloseTo(centred[2]!.bbox.x, 6);
  });

  it('copies line by line: a newline after a line, a blank line between stanzas', () => {
    const html = renderToHtml(doc);
    const text = html.replace(/<[^>]+>/g, '').replace(/&#39;/g, "'");
    expect(text).toContain('I think I know.\nHis house is in the village though;\n\nHe will not see me stopping here\nTo watch');
  });

  it('maps each line to its source line', () => {
    for (const line of lines) {
      const source = POEM.slice(line.sourceStart, line.sourceEnd).replace(/^:::verse\{align=start\}\n/, '').replace(/\n:::$/, '');
      expect(source.trim().replace(/\*/g, '')).toBe(line.text);
    }
  });

  it('sets a poem with no separator as single hemistichs under a configuration stored before #620', () => {
    const legacy = buildDocument({ markdown: POEM }, config({ bodyText: { verse: { layout: 'bayt' } } }));
    expect(verseLines(legacy)).toHaveLength(0);
    const bayts = legacy.blocks.flatMap((b) => b.lines.filter((l) => l.verse));
    expect(bayts).toHaveLength(4);
    // Centred in the measure, no space between the stanzas, as 1.22 set it.
    for (const l of bayts) expect((l.bbox.x - 20) * 2 + l.bbox.width).toBeCloseTo(360, 6);
    for (let i = 1; i < 4; i++) expect(bayts[i]!.baseline - bayts[i - 1]!.baseline).toBeCloseTo(30, 6);
    // A layout named on the fence is read as written.
    expect(verseLines(buildDocument({ markdown: POEM.replace('{align=start}', '{layout=lines}') }, config({ bodyText: { verse: { layout: 'bayt' } } })))).toHaveLength(4);
  });

  it('takes a paragraph style: its face, leading, indent and margins', () => {
    const cfg = config({ paragraphStyles: [{ id: 'poem', name: 'Poem', fontSize: pt(10), lineHeight: pt(20), indent: pt(30), marginTop: pt(15) }] });
    const styled = buildDocument({ markdown: POEM.replace('{align=start}', '{style=poem align=start}') }, cfg);
    const ls = verseLines(styled);
    expect(ls[1]!.baseline - ls[0]!.baseline).toBeCloseTo(20, 6);
    expect(ls[0]!.bbox.x).toBeCloseTo(50, 6);
    // Half an em of the style's size a space.
    expect(ls[1]!.bbox.x - ls[0]!.bbox.x).toBeCloseTo(10, 6);
    expect(ls[2]!.baseline - ls[1]!.baseline).toBeGreaterThanOrEqual(40 - 1e-6);
  });
});

describe(':::verse line by line: turnovers', () => {
  const LONG = 'And miles to go before I sleep, and miles to go before I sleep again tonight';
  const md = (attrs: string, line = LONG) => `:::verse{align=start ${attrs}}\nShort line.\n  ${line}\nShort again.\n:::`;

  it('hangs a turnover two ems in from its line\'s own start', () => {
    const ls = verseLines(buildDocument({ markdown: md('') }, config()));
    const turn = ls.filter((l) => l.verseLine!.turnover);
    expect(turn.length).toBeGreaterThan(0);
    const [first] = ls.filter((l) => l.verseLine!.line === 1);
    expect(first!.bbox.x).toBeCloseTo(40, 6);
    for (const l of turn) {
      expect(l.bbox.x).toBeCloseTo(80, 6);
      expect(l.verseLine!.line).toBe(1);
      expect(l.bbox.x + l.bbox.width).toBeLessThanOrEqual(380 + 0.01);
    }
    // The line and its turnover read as one line when copied.
    const html = renderToHtml(buildDocument({ markdown: md('') }, config())).replace(/<[^>]+>/g, '');
    expect(html).toContain(`${LONG}\nShort again.`);
  });

  it('takes the hang from the fence, the paragraph style, or bodyText.verse.hang', () => {
    const at = (markdown: string, extra: PostextConfig = {}) => verseLines(buildDocument({ markdown }, config(extra))).find((l) => l.verseLine!.turnover)!.bbox.x;
    expect(at(md('hang=1em'))).toBeCloseTo(60, 6);
    expect(at(md('style=v'), { paragraphStyles: [{ id: 'v', hangingIndent: em(3) }] })).toBeCloseTo(100, 6);
    expect(at(md(''), { bodyText: { verse: { hang: em(4) } } })).toBeCloseTo(120, 6);
  });

  it('sets a turnover flush right behind a bracket with turnover=right', () => {
    const ls = verseLines(buildDocument({ markdown: md('turnover=right') }, config()));
    const turn = ls.filter((l) => l.verseLine!.turnover);
    expect(turn.length).toBeGreaterThan(0);
    for (const l of turn) {
      expect(l.bbox.x + l.bbox.width).toBeCloseTo(380, 6);
      expect(l.segments![0]!.text).toBe('[');
      expect(l.segments![0]!.inserted).toBe(true);
      expect(l.text.startsWith('[')).toBe(false);
    }
    const mark = verseLines(buildDocument({ markdown: md('turnover=right turnoverMark="⟨"') }, config())).find((l) => l.verseLine!.turnover)!;
    expect(mark.segments![0]!.text).toBe('⟨');
  });

  it('turns over at word spaces, never hyphenated unless the style asks itself', () => {
    const word = 'Unimaginably incomprehensibly uncharacteristically overcomplicated';
    const hyph = { bodyText: { hyphenation: { enabled: true, ragged: true } } } as PostextConfig;
    const ls = verseLines(buildDocument({ markdown: md('', word) }, config(hyph)));
    expect(ls.some((l) => l.hyphenated)).toBe(false);
  });

  it('starts a stepped line where the line above ended', () => {
    const ls = verseLines(buildDocument({ markdown: ':::verse{align=start}\nWho is there?\n+ Nay, answer me.\n:::' }, config()));
    expect(ls[1]!.bbox.x).toBeCloseTo(ls[0]!.bbox.x + ls[0]!.bbox.width + 4, 6);
  });

  it('keeps a caesura at the width of its spaces', () => {
    const [kept] = verseLines(buildDocument({ markdown: ':::verse{align=start keepSpaces}\nStand,    and unfold\n:::' }, config()));
    const [plain] = verseLines(buildDocument({ markdown: ':::verse{align=start}\nStand,    and unfold\n:::' }, config()));
    expect(kept!.bbox.width - plain!.bbox.width).toBeCloseTo(12, 6);
  });
});

describe(':::verse line by line: a line a little too wide tightens its spaces', () => {
  // 46 letters and 10 spaces: 362 px, 2 px past the 360 px measure; its
  // spaces can give 1.6 px each at the default minWordSpacing (0.6).
  const NEAR = 'Aaaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaaa';
  // 52 letters and 4 spaces: 380 px, 20 px past; its spaces give 6.4 px.
  const FAR = 'Aaaaaaaaaaaaa aaaaaaaaaa aaaaaaaaaa aaaaaaaaa aaaaaaaaaa';
  const poem = (line: string, attrs = '') => `:::verse{${attrs}}
Short line.
${line}
Short again.
:::`;
  const spaces = (l: VDTLine) => l.segments!.filter((s) => s.kind === 'space');

  it('measures the fixtures as described', () => {
    expect(NEAR.length * 7 - (NEAR.split(' ').length - 1) * 3).toBe(362);
    expect(FAR.length * 7 - (FAR.split(' ').length - 1) * 3).toBe(380);
  });

  it('keeps a line 2 pt too long on one line, its word spaces tightened to fit the measure', () => {
    const ls = verseLines(buildDocument({ markdown: poem(NEAR) }, config()));
    expect(ls).toHaveLength(3);
    expect(ls.some((l) => l.verseLine!.turnover)).toBe(false);
    const near = ls[1]!;
    expect(near.text).toBe(NEAR);
    expect(near.bbox.width).toBeCloseTo(360, 6);
    // The poem is as wide as the measure: every line starts at its left.
    expect(near.bbox.x).toBeCloseTo(20, 6);
    expect(ls[0]!.bbox.x).toBeCloseTo(20, 6);
    expect(near.segments!.reduce((s, seg) => s + seg.width, 0)).toBeCloseTo(360, 6);
    for (const sp of spaces(near)) expect(sp.width).toBeCloseTo(3.8, 6);
    expect(near.verseLine!.spaceRatio).toBeCloseTo(0.95, 6);
    expect(ls[0]!.verseLine!.spaceRatio).toBeUndefined();
  });

  it('never tightens a space below minWordSpacing of its width', () => {
    for (const minWordSpacing of [0.6, 0.85]) {
      const ls = verseLines(buildDocument({ markdown: poem(NEAR) }, config({ bodyText: { minWordSpacing } })));
      const near = ls.find((l) => l.verseLine!.spaceRatio !== undefined)!;
      expect(near.verseLine!.spaceRatio!).toBeGreaterThanOrEqual(minWordSpacing - 1e-9);
      for (const sp of spaces(near)) expect(sp.width).toBeGreaterThanOrEqual(4 * minWordSpacing - 1e-9);
    }
    // At 0.96 the ten spaces give 1.6 px, short of the 2 px: it turns over.
    const tight = verseLines(buildDocument({ markdown: poem(NEAR) }, config({ bodyText: { minWordSpacing: 0.96 } })));
    expect(tight.some((l) => l.verseLine!.turnover)).toBe(true);
  });

  it('turns over a line 20 pt too long, at its natural spacing', () => {
    const ls = verseLines(buildDocument({ markdown: poem(FAR) }, config()));
    const lines = ls.filter((l) => l.verseLine!.line === 1);
    expect(lines.length).toBe(2);
    expect(lines[1]!.verseLine!.turnover).toBe(true);
    for (const l of lines) {
      expect(l.verseLine!.spaceRatio).toBeUndefined();
      for (const sp of spaces(l)) expect(sp.width).toBe(4);
    }
  });

  it('turns the line over with tighten=false on the fence or bodyText.verse.tighten: false', () => {
    const turned = (markdown: string, extra: PostextConfig = {}) => verseLines(buildDocument({ markdown }, config(extra))).some((l) => l.verseLine!.turnover);
    expect(turned(poem(NEAR, 'tighten=false'))).toBe(true);
    expect(turned(poem(NEAR), { bodyText: { verse: { tighten: false } } })).toBe(true);
    expect(turned(poem(NEAR, 'tighten=true'), { bodyText: { verse: { tighten: false } } })).toBe(false);
  });

  it('tightens an indented line against the room its indent leaves', () => {
    // Two leading spaces indent 20 px: 342 px of letters and spaces fill
    // 340 px with the spaces tightened.
    const line = 'Aaaa aaaa aaaa aaa aaa aaa aaa aaa aaa aaa aaa aaa aaa';
    expect(line.length * 7 - (line.split(' ').length - 1) * 3).toBe(342);
    const [, l] = verseLines(buildDocument({ markdown: poem(`  ${line}`) }, config()));
    expect(l!.verseLine!.turnover).toBe(false);
    expect(l!.bbox.x).toBeCloseTo(40, 6);
    expect(l!.bbox.x + l!.bbox.width).toBeCloseTo(380, 6);
  });

  it('paints the tightened spaces on canvas: the last word ends on the measure', () => {
    const doc = buildDocument({ markdown: poem(NEAR) }, config());
    const texts: { text: string; x: number }[] = [];
    const ctx: Record<string | symbol, unknown> = new Proxy({}, {
      get(target: Record<string | symbol, unknown>, key) {
        if (key === 'fillText') return (text: string, x: number) => { texts.push({ text, x }); };
        if (key === 'measureText') return (str: string) => new StubCtx().measureText(str);
        if (key in target) return target[key];
        return () => undefined;
      },
      set(target, key, value) { target[key] = value; return true; },
    });
    renderPageToCanvas(doc.pages[0]!, doc, { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement);
    const last = texts.filter((t) => t.text === 'aaaaa').at(-1)!;
    expect(last.x + 35).toBeCloseTo(380, 6);
    expect(texts.some((t) => t.text === NEAR)).toBe(false);
  });

  it('paints the tightened spaces in the HTML viewer', () => {
    const html = renderToHtml(buildDocument({ markdown: poem(NEAR) }, config()));
    // The last word ends on the measure's right edge, 380 − 20 px into the
    // line's box: its left is 360 − 35.
    expect(html).toContain('left:325.000px');
  });
});

describe(':::verse line by line: columns and pages', () => {
  const page = (stanza: string[], n: number) => `${'Some words of running text here. '.repeat(n)}\n\n:::verse\n${stanza.join('\n')}\n:::`;
  const TANKA = ['the first line', 'the second line', 'the third line', 'the fourth line', 'the fifth line'];

  it('keeps a stanza keepStanzas covers whole', () => {
    let moved = 0;
    for (let n = 30; n <= 60; n += 2) {
      const split = buildDocument({ markdown: page(TANKA, n) }, config({}, 400, 300));
      const kept = buildDocument({ markdown: page(TANKA, n).replace(':::verse', ':::verse{keepStanzas=5}') }, config({}, 400, 300));
      const pagesOf = (d: VDTDocument) => new Set(verseLines(d).map((l) => pageOf(d, l)));
      expect(pagesOf(kept).size, `${n}`).toBe(1);
      if (pagesOf(split).size > 1) moved++;
    }
    // Without it the stanza splits at some foot (by the orphan and widow rules).
    expect(moved).toBeGreaterThan(0);
    const cfg = buildDocument({ markdown: page(TANKA, 40) }, config({ bodyText: { verse: { keepStanzas: 5 } } }, 400, 300));
    expect(new Set(verseLines(cfg).map((l) => pageOf(cfg, l))).size).toBe(1);
  });

  it('splits inside a stanza leaving at least two lines on each side', () => {
    const STANZA = Array.from({ length: 6 }, (_, i) => `line number ${i} of it`);
    for (let n = 30; n <= 60; n += 2) {
      const d = buildDocument({ markdown: page(STANZA, n) }, config({}, 400, 300));
      const counts = new Map<number, number>();
      for (const l of verseLines(d)) counts.set(pageOf(d, l), (counts.get(pageOf(d, l)) ?? 0) + 1);
      for (const c of counts.values()) expect(c, `${n}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('never parts a line from its turnover', () => {
    const LONG = 'and this line of verse runs far past the measure of the column it is set in';
    const lines = Array.from({ length: 12 }, (_, i) => (i % 2 ? `${LONG} ${i}` : `short ${i}`));
    for (let height = 200; height <= 320; height += 10) {
      const d = buildDocument({ markdown: `:::verse\n${lines.join('\n')}\n:::` }, config({}, 300, height));
      for (const b of stanzaBlocks(d)) {
        const next = d.blocks[d.blocks.indexOf(b) + 1];
        if (next?.lines[0]?.verseLine) expect(next.lines[0]!.verseLine!.turnover, `${height}`).toBe(false);
      }
    }
  });

  it('breaks between stanzas, the space between them dropped at the top of a page', () => {
    const stanza = (k: number) => [`stanza ${k} line one`, `stanza ${k} line two`, `stanza ${k} line three`].join('\n');
    const d = buildDocument({ markdown: `:::verse{align=start}\n${[0, 1, 2, 3, 4, 5].map(stanza).join('\n\n')}\n:::` }, config({}, 400, 300));
    expect(d.pages.length).toBeGreaterThan(1);
    for (const p of d.pages) {
      const first = p.columns[0]!.blocks[0]!.lines[0]!;
      expect(first.bbox.y).toBeCloseTo(20, 6);
    }
  });

  it('keeps the paragraph that introduces the poem with its first lines', () => {
    for (let height = 220; height <= 330; height += 10) {
      const text = `${'Running words here. '.repeat(40)}He said:\n\n:::verse\nthe first line of it\nthe second line of it\nthe third\n:::`;
      const d = buildDocument({ markdown: text }, config({}, 400, height));
      const intro = d.blocks.filter((b) => b.type === 'paragraph' && !b.lines.some((l) => l.verseLine)).at(-1)!;
      expect(pageOf(d, intro.lines.at(-1)!), `${height}`).toBe(pageOf(d, verseLines(d)[0]!));
    }
  });
});

describe(':::verse line by line: directions and writing modes', () => {
  it('measures a Latin poem in an Arabic book from its own start side', () => {
    const md = 'نص عربي قبل القصيدة.\n\n:::verse{dir=ltr lang=en align=start}\nFirst line here\n  Indented line\n:::';
    const doc = buildDocument({ markdown: md }, config({ locale: 'ar' }));
    const [a, b] = verseLines(doc);
    // The flow frame of a right-to-left page runs from the right: a
    // left-to-right poem starts at its far end.
    expect(a!.bbox.x + a!.bbox.width).toBeCloseTo(380, 6);
    expect(b!.bbox.x + b!.bbox.width).toBeCloseTo(360, 6);
    expect(stanzaBlocks(doc)[0]!.lines.length).toBe(2);
  });

  it('indents an Arabic poem from its start in an Arabic book', () => {
    const doc = buildDocument({ markdown: ':::verse{align=start}\nسطر أول هنا\n  سطر ثان\n:::' }, config({ locale: 'ar' }));
    const [a, b] = verseLines(doc);
    expect(a!.bbox.x).toBeCloseTo(20, 6);
    expect(b!.bbox.x).toBeCloseTo(40, 6);
  });

  it('indents a vertical Japanese poem from the head', () => {
    const md = ':::verse\n古池や\n　　蛙飛び込む\n  水の音\n:::';
    const cfg = config({ locale: 'ja', layout: { layoutType: 'single', writingMode: 'vertical-rl' } });
    const ls = verseLines(buildDocument({ markdown: md }, cfg));
    expect(ls).toHaveLength(3);
    // An ideographic space counts two leading spaces, one em at the
    // default step; two spaces are one em too.
    expect(ls[1]!.bbox.x - ls[0]!.bbox.x).toBeCloseTo(40, 6);
    expect(ls[2]!.bbox.x - ls[0]!.bbox.x).toBeCloseTo(20, 6);
  });

  it('indents a vertical Traditional Chinese poem from the head', () => {
    const md = ':::verse\n床前明月光\n  疑是地上霜\n:::';
    const cfg = config({ locale: 'zh-Hant', layout: { layoutType: 'single', writingMode: 'vertical-rl' } });
    const ls = verseLines(buildDocument({ markdown: md }, cfg));
    expect(ls).toHaveLength(2);
    expect(ls[1]!.bbox.x - ls[0]!.bbox.x).toBeCloseTo(20, 6);
  });
});

describe('bodyText.verse and the configurations stored before #620', () => {
  it('resolves and strips its defaults', () => {
    expect(resolveVerseConfig()).toEqual(DEFAULT_VERSE_CONFIG);
    expect(resolveVerseConfig({ turnover: 'right', keepStanzas: 5.7, stanzaSpace: -1 })).toEqual({ ...DEFAULT_VERSE_CONFIG, turnover: 'right', keepStanzas: 5 });
    expect(stripVerseDefaults({ ...DEFAULT_VERSE_CONFIG })).toBeUndefined();
    expect(stripVerseDefaults({ indentStep: em(0.5), stanzaSpace: 2 })).toEqual({ stanzaSpace: 2 });
    expect(resolveVerseConfig({ tighten: false }).tighten).toBe(false);
    expect(stripVerseDefaults({ tighten: true })).toBeUndefined();
    expect(stripVerseDefaults({ tighten: false })).toEqual({ tighten: false });
    expect(stripBodyTextDefaults({ verse: { turnover: 'hang', keepStanzas: 3 } })).toEqual({ verse: { keepStanzas: 3 } });
  });

  const PLAIN = ':::verse\nA line\nAnother\n:::';
  const BAYT = ':::verse\nA || B\n:::';
  it('pins the 1.22 verse layout when the text holds a poem with no separator', () => {
    expect(CONFIG_VERSION).toBe(10);
    const stored: PostextConfig = { bodyText: { fontFamily: 'Georgia' } };
    for (const version of [undefined, 3, 7, 8]) {
      expect(migrateConfig(stored, version, { content: PLAIN }).bodyText?.verse, `${version}`).toEqual({ layout: 'bayt' });
    }
    // Unknown content: the verse layout and the 1.23 turnovers.
    expect(migrateConfig(stored, 8).bodyText?.verse).toEqual({ layout: 'bayt', tighten: false });
    for (const content of [BAYT, 'No poem.', [BAYT, 'Text.']]) {
      expect(migrateConfig(stored, 8, { content }), JSON.stringify(content)).toBe(stored);
    }
    expect(migrateConfig(stored, CONFIG_VERSION, { content: PLAIN })).toBe(stored);
    const named: PostextConfig = { bodyText: { verse: { layout: 'auto' } } };
    expect(pinLegacyVerseLayout(named)).toBe(named);
    const merged = migrateBundleConfig({}, [{ bodyText: { fontFamily: 'Georgia' } }], 8, { content: [PLAIN] });
    expect(merged.bodyText).toEqual({ fontFamily: 'Georgia', verse: { layout: 'bayt' } });
  });

  it('pins the 1.23 turnovers when the text holds a poem set line by line', () => {
    const stored: PostextConfig = { bodyText: { fontFamily: 'Georgia' } };
    const LINES = ':::verse{layout=lines}\nA line\n:::';
    for (const content of [PLAIN, LINES, ':::verse{layout="lines" align=start}\nA || B\n:::', [BAYT, PLAIN]]) {
      expect(migrateConfig(stored, 9, { content }).bodyText, JSON.stringify(content)).toEqual({ fontFamily: 'Georgia', verse: { tighten: false } });
    }
    expect(migrateConfig(stored, 9).bodyText?.verse).toEqual({ tighten: false });
    for (const content of [BAYT, 'No poem.', ':::verse{layout=bayt}\nA line\n:::', [BAYT, 'Text.']]) {
      expect(migrateConfig(stored, 9, { content }), JSON.stringify(content)).toBe(stored);
    }
    // Before 1.23 a plain poem is pinned to the bayt layout, which never
    // turned over; a poem that names the line layout is set line by line.
    expect(migrateConfig(stored, 8, { content: LINES }).bodyText?.verse).toEqual({ tighten: false });
    expect(migrateConfig(stored, 8, { content: [PLAIN, LINES] }).bodyText?.verse).toEqual({ layout: 'bayt', tighten: false });
    const bayts: PostextConfig = { bodyText: { verse: { layout: 'bayt' } } };
    expect(migrateConfig(bayts, 9, { content: PLAIN })).toBe(bayts);
    expect(migrateConfig(stored, CONFIG_VERSION, { content: PLAIN })).toBe(stored);
    const named: PostextConfig = { bodyText: { verse: { tighten: true } } };
    expect(pinLegacyVerseTightening(named)).toBe(named);
    const merged = migrateBundleConfig({}, [{ bodyText: { fontFamily: 'Georgia' } }], 9, { content: [PLAIN] });
    expect(merged.bodyText).toEqual({ fontFamily: 'Georgia', verse: { tighten: false } });
    // The pinned configuration lays the line out as 1.23 did.
    const near = ':::verse\nShort line.\nAaaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaaa\n:::';
    const pinned = migrateConfig(config(), 9, { content: near });
    expect(verseLines(buildDocument({ markdown: near }, pinned)).some((l) => l.verseLine!.turnover)).toBe(true);
    expect(verseLines(buildDocument({ markdown: near }, config())).some((l) => l.verseLine!.turnover)).toBe(false);
  });

  it('pins a style\'s first-line indent away when it sets a hanging one too', () => {
    const stored: PostextConfig = {
      paragraphStyles: [
        { id: 'both', firstLineIndent: em(1), hangingIndent: em(3) },
        { id: 'first', firstLineIndent: em(1) },
        { id: 'zero', firstLineIndent: em(1), hangingIndent: em(0) },
      ],
    };
    const pinned = migrateConfig(stored, 8, { content: 'Text.' });
    expect(pinned.paragraphStyles).toEqual([
      { id: 'both', hangingIndent: em(3) },
      { id: 'first', firstLineIndent: em(1) },
      { id: 'zero', firstLineIndent: em(1), hangingIndent: em(0) },
    ]);
    const none: PostextConfig = { paragraphStyles: [{ id: 'first', firstLineIndent: em(1) }] };
    expect(pinLegacyPairedIndents(none)).toBe(none);
    expect(migrateConfig(stored, CONFIG_VERSION)).toBe(stored);
    const viewer = pinLegacyPairedIndents({ htmlViewer: { overrides: { paragraphStyles: [{ id: 'b', firstLineIndent: em(1), hangingIndent: em(2) }] } } } as PostextConfig);
    expect((viewer as { htmlViewer: { overrides: { paragraphStyles: unknown[] } } }).htmlViewer.overrides.paragraphStyles).toEqual([{ id: 'b', hangingIndent: em(2) }]);
  });
});
