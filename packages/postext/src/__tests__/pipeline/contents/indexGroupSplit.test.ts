import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { OutlineEntry, PostextConfig, VDTDocument } from '../../../index.js';

// #712, `index.groups.splitMinEntries`: when a column ends inside a group
// of a `:::index`, at least two of its entries stay at the foot of the
// column and at least two open the next one; a group too short for that
// moves whole.

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
const mark = (path: string[], pageIndex: number): OutlineEntry => ({
  kind: 'indexMark', level: 0, title: path.join('!'), number: '', numbered: false, listed: false,
  indexMark: { index: '', path, sourceStart: pageIndex * 100 + path.length },
  pageIndex, pageLabel: String(pageIndex + 1), pageFormat: 'decimal',
} as OutlineEntry);

/** Groups of `sizes` entries each, one per letter from A. */
const outlineOf = (sizes: number[]): OutlineEntry[] =>
  sizes.flatMap((n, g) => Array.from({ length: n }, (_, i) => mark([`${String.fromCharCode(97 + g)}${String.fromCharCode(97 + i)} term`], i + 1)));

/** Two columns of `lines` 12 pt lines, a blank line above each group. */
const config = (lines: number, extra: PostextConfig = {}): PostextConfig => ({
  page: { dpi: 72, width: pt(400), height: pt(40 + lines * 12), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'double', gutterWidth: pt(20) },
  bodyText: { fontSize: pt(10), lineHeight: pt(12) },
  header: { elements: [] },
  footer: { elements: [] },
  headings: { balancing: { enabled: false } },
  ...extra,
  index: { groups: { marginTop: pt(12), ...extra.index?.groups } },
});
const build = (sizes: number[], cfg: PostextConfig): VDTDocument =>
  buildDocument({ markdown: ':::index', outline: outlineOf(sizes) }, cfg, createMeasurementCache());

/** The entries of each column: the letter of its group, then the entry's
 *  own letter (`ca` is the first entry of C). */
const columns = (doc: VDTDocument): string[][] =>
  doc.pages.flatMap((p) => p.columns.filter((c) => c.blocks.length > 0).map((c) =>
    c.blocks.map((b) => b.lines[b.lines.length - 1]!.text.slice(0, 2))));

/** For every column end inside a group: entries of the group left behind
 *  and entries carried on. */
const cuts = (doc: VDTDocument): [number, number][] => {
  const cols = columns(doc);
  const out: [number, number][] = [];
  for (let i = 0; i < cols.length - 1; i++) {
    const last = cols[i]![cols[i]!.length - 1]!;
    const next = cols[i + 1]![0]!;
    if (last[0] !== next[0]) continue;
    out.push([cols[i]!.filter((e) => e[0] === last[0]).length, cols[i + 1]!.filter((e) => e[0] === next[0]).length]);
  }
  return out;
};

// Groups A to G of 3, 2, 4, 1, 3, 2 and 3 entries.
const SIZES = [3, 2, 4, 1, 3, 2, 3];

describe('index.groups.splitMinEntries (#712)', () => {
  it('up to 1.27 a column could end after the first entry of a group, or before its last', () => {
    const old = (lines: number) => columns(build(SIZES, config(lines, { index: { groups: { splitMinEntries: 1 } } })));
    // 11 lines: the head C and one entry close the first column.
    expect(old(11)[0]).toEqual(['aa', 'ab', 'ac', 'ba', 'bb', 'ca']);
    // 13 lines: the last entry of C opens the second column alone.
    expect(old(13)[0]!.slice(-3)).toEqual(['ca', 'cb', 'cc']);
    expect(old(13)[1]![0]).toBe('cd');
  });

  it('moves the entries the rule does not let stay, or carries one more on', () => {
    // 11 lines: one entry of C would stay; the group opens the next column.
    const eleven = columns(build(SIZES, config(11)));
    expect(eleven[0]).toEqual(['aa', 'ab', 'ac', 'ba', 'bb']);
    expect(eleven[1]!.slice(0, 4)).toEqual(['ca', 'cb', 'cc', 'cd']);
    // 13 lines: one entry of C would go on alone; two stay and two go.
    const thirteen = columns(build(SIZES, config(13)));
    expect(thirteen[0]!.slice(-2)).toEqual(['ca', 'cb']);
    expect(thirteen[1]!.slice(0, 2)).toEqual(['cc', 'cd']);
  });

  it('never divides a group 1 + n or n + 1, and never a group of two or three, at any column height', () => {
    for (let lines = 6; lines <= 20; lines++) {
      const doc = build(SIZES, config(lines));
      for (const [behind, ahead] of cuts(doc)) {
        expect(behind, `${lines} lines`).toBeGreaterThanOrEqual(2);
        expect(ahead, `${lines} lines`).toBeGreaterThanOrEqual(2);
      }
      // Every entry is placed once, in order.
      expect(columns(doc).flat()).toEqual(columns(build(SIZES, config(lines, { index: { groups: { splitMinEntries: 1 } } }))).flat());
    }
    // A group of five is divided 3 + 2 or 2 + 3, never 4 + 1 or 1 + 4.
    for (let lines = 5; lines <= 12; lines++) {
      for (const [behind, ahead] of cuts(build([2, 5, 2], config(lines)))) {
        expect(Math.min(behind, ahead), `${lines} lines`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('still divides a group taller than a column, and lays the same document out twice the same way', () => {
    const doc = build([14], config(6));
    const cols = columns(doc);
    expect(cols.flat()).toHaveLength(14);
    expect(cols.length).toBeGreaterThanOrEqual(3);
    for (const c of cols) expect(c.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(build(SIZES, config(11)).pages)).toBe(JSON.stringify(build(SIZES, config(11)).pages));
  });

  it('holds for sub-entries (one block, one entry) and with the heads off', () => {
    const sub: OutlineEntry[] = [
      mark(['alpha'], 1), mark(['beta'], 1), mark(['beta', 'first'], 2), mark(['beta', 'second'], 3),
      mark(['cedar'], 1), mark(['delta'], 2), mark(['delta', 'one'], 2), mark(['echo'], 3), mark(['fig'], 4),
    ];
    for (const groups of [{}, { enabled: false }]) {
      for (let lines = 4; lines <= 12; lines++) {
        const doc = buildDocument({ markdown: ':::index', outline: sub }, config(lines, { index: { groups } }), createMeasurementCache());
        const cols = doc.pages.flatMap((p) => p.columns.filter((c) => c.blocks.length > 0).map((c) => c.blocks.map((b) => b.lines[b.lines.length - 1]!.text.trim()[0]!.toLowerCase())));
        // Sub-entries file under their main entry's letter: b, b, b; d, d.
        const letterOf = (e: string): string => (e === 'f' || e === 's' ? 'b' : e === 'o' ? 'd' : e);
        for (let i = 0; i < cols.length - 1; i++) {
          const last = letterOf(cols[i]![cols[i]!.length - 1]!);
          const next = letterOf(cols[i + 1]![0]!);
          if (last !== next) continue;
          expect(cols[i]!.filter((e) => letterOf(e) === last).length, `${lines} lines`).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('holds for a Chinese index by strokes and a Japanese one by kana rows', () => {
    // Read off the pages: a group opens with the block that carries its
    // head (two lines, the head first).
    const check = (outline: OutlineEntry[], locale: string): number => {
      let seen = 0;
      for (let lines = 5; lines <= 14; lines++) {
        const doc = buildDocument({ markdown: ':::index', outline }, config(lines, { locale }), createMeasurementCache());
        const cols = doc.pages.flatMap((p) => p.columns.filter((c) => c.blocks.length > 0).map((c) => c.blocks));
        // Entries of the group at the foot of column i and at the head of
        // column i + 1, when the column ends inside a group.
        for (let i = 0; i < cols.length - 1; i++) {
          if (cols[i + 1]![0]!.lines.length > 1) continue;
          let behind = 0;
          for (let j = cols[i]!.length - 1; j >= 0; j--) { behind++; if (cols[i]![j]!.lines.length > 1) break; }
          let ahead = 0;
          for (const b of cols[i + 1]!) { if (b.lines.length > 1) break; ahead++; }
          // A group that fills its column cannot leave two behind a head it does not hold.
          if (behind === cols[i]!.length && cols[i]![0]!.lines.length === 1) continue;
          seen++;
          expect(Math.min(behind, ahead), `${locale}, ${lines} lines`).toBeGreaterThanOrEqual(2);
        }
      }
      return seen;
    };
    const han = ['丁一', '丁二', '丁三', '丁四', '王一', '王二', '王三', '王五', '王六', '林一', '林二', '林三', '林四', '林五', '張一', '張二', '張三'];
    expect(check(han.map((name, i) => mark([name], i + 1)), 'zh-Hant')).toBeGreaterThan(0);
    const kana = ['あい', 'あお', 'あか', 'あき', 'かい', 'かお', 'かき', 'かく', 'かけ', 'さい', 'さお', 'さか', 'さき', 'たい', 'たか', 'たき'];
    expect(check(kana.map((name, i) => mark([name], i + 1)), 'ja')).toBeGreaterThan(0);
  });

  it('refuses the level cut of a closing band that would divide a group of two', () => {
    // Eight lines per column, balancing on: E (3) and F (2) share the last
    // page with G (3). The level cut of 1.27 put one entry of F on each
    // side; now F stays whole.
    const balanced = (splitMinEntries: number) => build(SIZES, config(8, { headings: { balancing: { enabled: true } }, index: { groups: { splitMinEntries } } }));
    const old = columns(balanced(1));
    expect(old.some((c, i) => i < old.length - 1 && c[c.length - 1] === 'fa' && old[i + 1]![0] === 'fb')).toBe(true);
    for (const [behind, ahead] of cuts(balanced(2))) {
      expect(Math.min(behind, ahead)).toBeGreaterThanOrEqual(2);
    }
  });
});
