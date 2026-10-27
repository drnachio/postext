import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { fitLeader, MIN_LEADER_REPEATS } from '../../measure/leader.js';
import type { PostextConfig } from '../../types.js';
import type { VDTBlock, VDTDocument, VDTLine, VDTLineSegment } from '../../vdt.js';

// #666: a leader with room for one or two repeats printed them: a lone dot
// between a title and its page number, which reads as a full stop
// ("Punzones, matrices y el nombre de Garamond . 9"). A leader is set with
// three repeats or more, or not at all.

/** 7 px a character. */
class Ctx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): Ctx {
    return new Ctx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const seven = (text: string): number => text.length * 7;

describe('fitLeader (#666)', () => {
  it('sets three repeats or more', () => {
    expect(MIN_LEADER_REPEATS).toBe(3);
    expect(fitLeader('.', 21, seven)).toEqual({ text: '...', width: 21 });
    expect(fitLeader('.', 70.5, seven)).toEqual({ text: '.'.repeat(10), width: 70 });
    expect(fitLeader('. ', 42, seven)).toEqual({ text: '. . . ', width: 42 });
  });

  it('sets none in a room for one or two', () => {
    expect(fitLeader('.', 7, seven)).toBeNull();
    expect(fitLeader('.', 20.9, seven)).toBeNull();
    expect(fitLeader('. ', 41, seven)).toBeNull();
    expect(fitLeader('.', 6, seven)).toBeNull();
  });

  it('counts the repeats that fit as a run, not one by one', () => {
    // A face that spaces its dots apart: three dots at 7 px each fit 27 px
    // counted one by one, and take 27 px as a run of three.
    const kerned = (text: string): number => text.length * 7 + Math.max(0, text.length - 1) * 3;
    expect(fitLeader('.', 27, kerned)).toEqual({ text: '...', width: 27 });
    expect(fitLeader('.', 26, kerned)).toBeNull();
  });
});

// A 260 px measure at 72 dpi.
const config = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { dpi: 72, width: pt(300), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { firstLineIndent: pt(0), textAlign: 'left', fontFamily: 'Test', hyphenation: { enabled: false } },
  ...extra,
});
const leaderOf = (line: VDTLine): VDTLineSegment | undefined => line.segments?.find((s) => s.leader !== undefined);
const widthOf = (line: VDTLine): number => line.segments!.reduce((w, s) => w + s.width, 0);

describe('a contents row (#666)', () => {
  const toc: PostextConfig = config({
    headings: { levels: [{ level: 1, breakBefore: { enabled: false, parity: 'any' } }] },
    headingStyles: [{ id: 'front', numbered: false }],
    toc: { leader: { char: '.', gap: pt(7) } },
  });
  const rows = (titles: string[]): { doc: VDTDocument; lines: VDTLine[] } => {
    const markdown = ['# Contents {style="front" toc="false"}', ':::toc', ...titles.flatMap((t) => [`# ${t}`, 'Some text.'])].join('\n\n');
    const doc = buildDocument({ markdown }, toc);
    const blocks = doc.blocks.filter((b: VDTBlock) => b.tocEntry && b.pageIndex === 0);
    return { doc, lines: blocks.map((b) => b.lines[b.lines.length - 1]!) };
  };

  it('a title that leaves room for one or two dots is set without leader, its page number where it was', () => {
    // The row holds the number, the title, the gap, the leader, the gap and
    // the page number: titles one character apart walk the leader's room
    // down a dot at a time.
    const base = 'A title of the contents';
    const titles = Array.from({ length: 9 }, (_, i) => base + 'x'.repeat(i));
    const { doc, lines } = rows(titles);
    expect(lines).toHaveLength(titles.length);
    const col = doc.pages[0]!.columns[0]!;
    const counts = lines.map((l) => leaderOf(l)?.text.length ?? 0);
    // One line each: no title wraps.
    lines.forEach((l, i) => expect(l.text.startsWith(titles[i]!)).toBe(true));
    // Longer titles, shorter leaders, and never one of one or two dots.
    expect(counts.some((n) => n >= MIN_LEADER_REPEATS)).toBe(true);
    expect(counts.some((n) => n === 0)).toBe(true);
    expect(counts.every((n) => n === 0 || n >= MIN_LEADER_REPEATS)).toBe(true);
    for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
    // The first row without leader had room for two dots.
    const first = counts.indexOf(0);
    expect(counts[first - 1]).toBe(MIN_LEADER_REPEATS);
    // Every row still ends on the column's edge, on its page number.
    for (const line of lines) {
      expect(line.bbox.x + widthOf(line)).toBeCloseTo(col.bbox.x + col.bbox.width, 3);
      expect(line.segments!.at(-1)!.text).toMatch(/^\d+$/);
    }
  });
});

describe('a tab stop (#666)', () => {
  const menu = config({ bodyText: { firstLineIndent: pt(0), textAlign: 'left', fontFamily: 'Test', hyphenation: { enabled: false }, tabStops: [{ position: 'end', align: 'end', leader: '.', leaderGap: pt(7) }] } });
  const line = (dish: string): VDTLine => buildDocument({ markdown: `${dish}\t9` }, menu).blocks.find((b) => b.type === 'paragraph')!.lines[0]!;

  it('sets a leader of three dots and none of two, the price at the stop either way', () => {
    // 260 px: the dish, 7 px, the dots, 7 px, the price (7 px).
    const three = line('x'.repeat(31)); // 217 + 7 + 21 + 7 + 7 = 259
    const two = line('x'.repeat(32));
    expect(leaderOf(three)?.text).toBe('...');
    expect(leaderOf(two)).toBeUndefined();
    for (const l of [three, two]) {
      expect(l.segments!.at(-1)!.text).toBe('9');
      expect(l.bbox.x + widthOf(l)).toBeCloseTo(20 + 260, 3);
    }
  });
});
