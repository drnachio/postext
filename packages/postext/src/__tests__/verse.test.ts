import { describe, it, expect } from 'vitest';
import { joinsWithNext } from '../bidi';
import { parseMarkdown } from '../parse';
import { buildDocument } from '../pipeline';
import { collectContentWarnings } from '../pipeline/contentWarnings';
import { verseSettings } from '../pipeline/verse';
import { writtenText } from '../measure/kashida';
import type { PostextConfig } from '../types';
import type { VDTBlock, VDTDocument, VDTLine, VDTLineSegment } from '../vdt';

// #378: classical verse, each bayt in two hemistichs on one line. Arabic
// fixtures carry Latin marker words so order and placement can be checked.

/** The stub font: 7 px a character, marks nothing, 2 px less for every
 *  joined pair, a space 4 px, a tatweel 5 px. */
function stubWidth(s: string): number {
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ' ') w += 4;
    else if (s[i] === 'ـ') w += 5;
    else if (!/\p{M}/u.test(s[i]!)) w += 7;
    if (s[i] !== 'ـ' && joinsWithNext(s, i)) w -= 2;
  }
  return w;
}
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: stubWidth(s) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (extra: PostextConfig = {}, width = 400, height = 600): PostextConfig => ({
  page: { dpi: 72, width: pt(width), height: pt(height), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  ...extra,
  bodyText: { fontSize: pt(20), lineHeight: { value: 1.5, unit: 'em' }, ...extra.bodyText },
});
const verseLines = (doc: VDTDocument): VDTLine[] => doc.blocks.flatMap((b) => b.lines.filter((l) => l.verse));
const verseBlocks = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.lines.some((l) => l.verse));
const sum = (segs: readonly VDTLineSegment[]) => segs.reduce((s, x) => s + x.width, 0);
/** A bayt line's ṣadr and ʿajuz segments, split at the gap. */
function halves(line: VDTLine): { sadr: VDTLineSegment[]; gap: VDTLineSegment[]; ajuz: VDTLineSegment[] } {
  const segs = line.segments!;
  const g = segs.findIndex((s) => s.labelTab);
  let end = g;
  while (end < segs.length && (segs[end]!.labelTab || segs[end]!.inserted)) end++;
  return { sadr: segs.slice(0, g), gap: segs.slice(g, end), ajuz: segs.slice(end) };
}

const QASIDA = [
  'قال AAA شعرا:',
  '',
  ':::verse',
  'يا حرقة الدهر كفي || إن لم تكفي فعفي',
  'فلا بحظي أعطي || ولا بصنعة كفي',
  'خرجت أطلب رزقي || وجدت رزقي توفي',
  'كم جاهل في ظهور || وعالم متخف',
  ':::',
  '',
  'ثم BBB رمى.',
].join('\n');

describe(':::verse markup', () => {
  it('reads one bayt a line, the hemistichs joined by a tab and the bayts by a line feed', () => {
    const blocks = parseMarkdown('Intro:\n\n:::verse{gap=3em ornament="*"}\nOne *two* || three\n\nfour five \\\\ six\nalone\n:::\n\nAfter.');
    const verse = blocks.find((b) => b.verse)!;
    expect(verse.type).toBe('paragraph');
    expect(verse.text).toBe('One two\tthree\nfour five\tsix\nalone');
    expect(verse.verse!.attrs).toEqual({ gap: '3em', ornament: '*' });
    expect(verse.spans.find((s) => s.italic)?.text).toBe('two');
    const md = 'Intro:\n\n:::verse{gap=3em ornament="*"}\nOne *two* || three\n\nfour five \\\\ six\nalone\n:::\n\nAfter.';
    // Every character maps to its source; the tab to the separator.
    for (let i = 0; i < verse.text.length; i++) {
      const c = verse.text[i]!;
      const at = verse.sourceMap[i]!;
      if (c === '\t') expect(['||', '\\\\']).toContain(md.slice(at, at + 2));
      else if (c === '\n') expect(md[at]).toBe('\n');
      else expect(md[at]).toBe(c);
    }
    expect(blocks.map((b) => b.text)).toEqual(['Intro:', verse.text, 'After.']);
    expect(verse.sourceEnd).toBe(md.indexOf(':::\n\nAfter') + 3);
  });

  it('takes its direction from the fence, drops an empty poem and runs an unclosed one to the end', () => {
    expect(parseMarkdown(':::verse{dir=rtl}\nA || B\n:::')[0]!.direction).toBe('rtl');
    expect(parseMarkdown(':::paragraphs{dir=rtl}\n:::verse\nA || B\n:::\n:::').find((b) => b.verse)!.direction).toBe('rtl');
    expect(parseMarkdown(':::verse\n\n:::\n\nText.').map((b) => b.text)).toEqual(['Text.']);
    expect(parseMarkdown(':::verse\nA || B\nC || D').find((b) => b.verse)!.text).toBe('A\tB\nC\tD');
  });

  it('reads the fence settings', () => {
    expect(verseSettings({}, 72, 20)).toEqual({ gapPx: 40, align: 'center' });
    expect(verseSettings({ gap: '1.5', width: '50mm', align: 'start', ornament: ' ٭ ' }, 72, 20)).toEqual({
      gapPx: 30, widthPx: (50 / 25.4) * 72, align: 'start', ornament: '٭',
    });
    expect(verseSettings({ gap: 'wide' }, 72, 20).gapPx).toBe(40);
  });
});

describe('a qaṣīda in an Arabic book', () => {
  const doc = buildDocument({ markdown: QASIDA }, config({ locale: 'ar' }));
  const lines = verseLines(doc);

  it('sets each bayt on one line, every hemistich to one width, the poem centred', () => {
    expect(lines.map((l) => l.verse)).toEqual([0, 1, 2, 3].map((bayt) => ({ bayt, part: 'bayt' })));
    const [block] = verseBlocks(doc);
    expect(block!.textAlign).toBe('left');
    const width = sum(halves(lines[0]!).sadr);
    for (const line of lines) {
      const { sadr, gap, ajuz } = halves(line);
      // A hemistich short of the width leaves the rest in the gap.
      expect(sum(sadr)).toBeLessThanOrEqual(width + 1e-6);
      expect(sum(ajuz)).toBeLessThanOrEqual(width + 1e-6);
      expect(sum(sadr) + sum(gap) + sum(ajuz)).toBeCloseTo(line.bbox.width, 6);
      expect(line.bbox.width).toBeCloseTo(lines[0]!.bbox.width, 6);
      expect(line.bbox.x).toBeCloseTo(lines[0]!.bbox.x, 6);
      expect(gap[0]!.text).toBe('\t');
    }
    // Centred in the measure (360 pt from the 20 pt margin).
    expect((lines[0]!.bbox.x - 20) * 2 + lines[0]!.bbox.width).toBeCloseTo(360, 6);
    expect(sum(halves(lines[0]!).gap)).toBeGreaterThanOrEqual(40 - 1e-6);
  });

  it('elongates the hemistichs with kashidas, and reads them as written', () => {
    expect(lines.some((l) => l.kashida)).toBe(true);
    const [block] = verseBlocks(doc);
    for (const line of block!.lines) {
      expect(line.segments!.map((s) => (s.inserted ? '' : writtenText(s))).join('')).toBe(line.text);
      // The first line opens on the fence, the last closes on it.
      const source = QASIDA.slice(line.sourceStart, line.sourceEnd).replace(/^:::verse\n/, '').replace(/\n:::$/, '');
      expect(source.replace(' || ', '\t')).toBe(line.text);
    }
  });

  it('puts the ṣadr on the right of a mirrored page, the ʿajuz on the left', () => {
    const line = lines[0]!;
    const n = halves(line).sadr.length;
    // The flow order of a mirrored page: the ṣadr first, from the right.
    const order = line.order ?? line.segments!.map((_, i) => i);
    expect(order.slice(0, n).every((i) => i < n)).toBe(true);
    expect(doc.pages[0]!.flow).toBeDefined();
  });

  it('keeps the paragraph that introduces the poem with its first bayt', () => {
    // A page whose foot falls under the introducer's last line.
    const text = `${'كلمة نص طويل '.repeat(60)}قال:\n\n:::verse\nيا حرقة الدهر كفي || إن لم تكفي فعفي\nفلا بحظي أعطي || ولا بصنعة كفي\n:::`;
    for (let height = 260; height <= 330; height += 10) {
      const d = buildDocument({ markdown: text }, config({ locale: 'ar' }, 400, height));
      const page = (l: VDTLine) => d.pages.findIndex((p) => p.columns.some((c) => c.blocks.some((b) => b.lines.includes(l))));
      const intro = d.blocks.filter((b) => !b.lines.some((l) => l.verse) && b.type === 'paragraph').at(-1)!;
      expect(page(intro.lines.at(-1)!)).toBe(page(verseLines(d)[0]!));
    }
  });

  it('counts the space its paragraph style puts above the poem when it keeps the introducer with it', () => {
    const text = `${'كلمة نص طويل '.repeat(60)}قال:\n\n:::verse{style=poem}\nيا حرقة الدهر كفي || إن لم تكفي فعفي\nفلا بحظي أعطي || ولا بصنعة كفي\n:::`;
    const styles = { paragraphStyles: [{ id: 'poem', name: 'Poem', marginTop: pt(40) }] };
    for (let height = 240; height <= 420; height += 4) {
      const d = buildDocument({ markdown: text }, config({ locale: 'ar', ...styles }, 400, height));
      const page = (l: VDTLine) => d.pages.findIndex((p) => p.columns.some((c) => c.blocks.some((b) => b.lines.includes(l))));
      const intro = d.blocks.filter((b) => !b.lines.some((l) => l.verse) && b.type === 'paragraph').at(-1)!;
      expect(page(intro.lines.at(-1)!), `${height}`).toBe(page(verseLines(d)[0]!));
    }
  });
});

describe('verse in a left-to-right book', () => {
  it('sets the ṣadr on the left, and an Arabic poem with {dir=rtl} on the right', () => {
    const latin = buildDocument({ markdown: ':::verse\nqifa nabki min dhikra || habibin wa manzili\n:::' }, config());
    const [line] = verseLines(latin);
    expect(line!.order).toBeUndefined();
    expect(halves(line!).sadr.map((s) => s.text).join('')).toBe('qifa nabki min dhikra');
    const arabic = buildDocument({ markdown: ':::verse{dir=rtl}\nقفا AAA نبك || من ذكرى BBB\n:::' }, config());
    const [rtl] = verseLines(arabic);
    const n = halves(rtl!).sadr.length;
    // Visual order, left to right: the ʿajuz first, the ṣadr last.
    expect(rtl!.order!.slice(-n).every((i) => i < n)).toBe(true);
    expect(rtl!.order![0]).toBeGreaterThan(n);
  });

  it('centres a line of one hemistich on the poem, and prints an ornament in the gap', () => {
    const doc = buildDocument({ markdown: ':::verse{ornament="*"}\nfirst half here || second half\nsingle line\n:::' }, config());
    const [bayt, single] = verseLines(doc);
    expect(single!.verse).toEqual({ bayt: 1, part: 'single' });
    expect(single!.bbox.x + single!.bbox.width / 2).toBeCloseTo(bayt!.bbox.x + bayt!.bbox.width / 2, 6);
    const { gap } = halves(bayt!);
    expect(gap.map((s) => s.text)).toEqual(['\t', '*', '']);
    expect(gap[1]!.inserted).toBe(true);
    expect(bayt!.text).toBe('first half here\tsecond half');
  });

  it('staggers a bayt too wide for the measure, ṣadr at the start and ʿajuz at the end, never split', () => {
    const md = `:::verse\n${Array.from({ length: 12 }, (_, i) => `the long first half of line ${i} || and the long second half ${i}`).join('\n')}\n:::`;
    const doc = buildDocument({ markdown: md }, config({}, 300, 260));
    const lines = verseLines(doc);
    expect(lines.length).toBe(24);
    expect(lines[0]!.verse).toEqual({ bayt: 0, part: 'sadr' });
    expect(lines[1]!.verse).toEqual({ bayt: 0, part: 'ajuz' });
    expect(lines[0]!.bbox.x).toBeCloseTo(20, 6);
    expect(lines[1]!.bbox.x + lines[1]!.bbox.width).toBeCloseTo(280, 6);
    expect(doc.pages.length).toBeGreaterThan(1);
    // No column ends between the two lines of a bayt.
    for (const b of verseBlocks(doc)) expect(b.lines.at(-1)!.verse!.part).not.toBe('sadr');
  });

  it('takes a paragraph style from the fence, and reports an unknown one', () => {
    const cfg = config({ paragraphStyles: [{ id: 'poem', name: 'Poem', fontSize: pt(10), lineHeight: { value: 2, unit: 'em' } }] });
    const doc = buildDocument({ markdown: ':::verse{style=poem}\nA b || C d\nE f || G h\n:::' }, cfg);
    const [a, b] = verseLines(doc);
    expect(b!.baseline - a!.baseline).toBeCloseTo(20, 6);
    const warnings = collectContentWarnings(':::verse{style=nope}\nA || B\n:::', cfg);
    expect(warnings.some((w) => w.kind === 'unknownParagraphStyle' && w.style === 'nope')).toBe(true);
  });

  it('sets the space a paragraph style asks above and below the poem, the text after it back on the grid', () => {
    const md = 'Before AAA.\n\n:::verse{style=poem}\nA b || C d\nE f || G h\n:::\n\nAfter BBB.';
    const at = (margins: object) => {
      const doc = buildDocument({ markdown: md }, config({ paragraphStyles: [{ id: 'poem', name: 'Poem', ...margins }] }));
      const lines = doc.blocks.flatMap((b) => b.lines);
      const before = lines.find((l) => l.text?.includes('AAA'))!;
      const after = lines.find((l) => l.text?.includes('BBB'))!;
      return { poem: verseLines(doc)[0]!.baseline, after: after.baseline, onGrid: (after.baseline - before.baseline) / 30 };
    };
    const plain = at({});
    const spaced = at({ marginTop: pt(15), marginBottom: pt(15) });
    expect(spaced.poem - plain.poem).toBeGreaterThanOrEqual(15 - 1e-6);
    expect(spaced.after - plain.after).toBeGreaterThanOrEqual(30 - 1e-6);
    // Half a line above and below: the text after the poem is a whole line
    // lower, on the grid (30 pt here).
    expect(spaced.onGrid).toBeCloseTo(Math.round(spaced.onGrid), 6);
    expect(spaced.after - plain.after).toBeCloseTo(30, 6);
  });
});
