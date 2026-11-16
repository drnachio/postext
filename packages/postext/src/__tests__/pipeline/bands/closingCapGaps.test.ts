import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, VDTBlock, VDTColumn, VDTDocument, VDTPage } from '../../../index.js';

// Deterministic text measurement stub (no DOM in the node test env).
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

// Closing pages cut level by a trailing cap (#1600): the room the levers
// add there must be room a column really lacks, never a line every column
// takes because the cut stands too low, nor a hole of a line or more above
// a box that closes the page.

const mm = (value: number) => ({ value, unit: 'mm' as const });
const SENT = 'The lantern of the lighthouse must stay lit all night to guide the ships that cross the bay. ';
const sentences = (n: number): string => SENT.repeat(n).trim();
const words = (n: number): string => 'and the keeper climbs the stairs once more'.split(' ').slice(0, n).join(' ');

const config: PostextConfig = {
  page: { width: mm(160), height: mm(160), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
};

const build = (md: string): VDTDocument => buildDocument({ markdown: md }, config, createMeasurementCache());

const textColumns = (page: VDTPage): VDTColumn[] =>
  page.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side' && c.blocks.some((b) => !b.hidden));

/** The box frame closing `col` (its frame and children end the column). */
const closingFrame = (col: VDTColumn): VDTBlock | undefined => {
  const visible = col.blocks.filter((b) => !b.hidden);
  const last = visible[visible.length - 1];
  if (!last || last.containerId === undefined) return undefined;
  return visible.find((b) => b.type === 'callout' && b.containerId === last.containerId);
};

/** Foot of the last line of `col` outside a box (or of the box frame). */
const columnFoot = (col: VDTColumn): number => {
  let foot = -Infinity;
  for (const b of col.blocks) {
    if (b.hidden) continue;
    if (b.type === 'callout') foot = Math.max(foot, b.bbox.y + b.bbox.height);
    else if (b.containerId === undefined) {
      const line = b.lines[b.lines.length - 1];
      if (line) foot = Math.max(foot, line.bbox.y + line.bbox.height);
    }
  }
  return foot;
};

const lastPage = (doc: VDTDocument): VDTPage => {
  const pages = doc.pages.filter((p) => p.columns.some((c) => c.blocks.some((b) => !b.hidden)));
  return pages[pages.length - 1]!;
};

describe('a box closing a levelled closing page (#1600)', () => {
  it('moves down by less than a line: the column ends a line short instead of opening a hole above the box', () => {
    let capped = 0;
    let short = 0;
    for (let n = 30; n <= 44; n++) {
      for (const extra of [0, 4]) {
        const md = ['# Chapter', '', sentences(n), ' ' + words(extra), '', ':::callout{title="Try it"}', sentences(3), ':::'].join('\n');
        const doc = build(md);
        const page = lastPage(doc);
        const cols = textColumns(page);
        if (cols.length < 2) continue;
        const col = cols[cols.length - 1]!;
        const frame = closingFrame(col);
        if (!frame) continue;
        if (col.trailingCap) capped++;
        const pushed = frame.balancing?.levers.includes('trailingCallout') ? frame.balancing.spaceAbove : 0;
        expect(pushed, `n=${n}+${extra}`).toBeLessThan(doc.baselineGrid - 0.01);
        // The box column ends level with the text beside it, or one line
        // above it — never lower.
        const others = Math.max(...cols.slice(0, -1).map(columnFoot));
        const foot = frame.bbox.y + frame.bbox.height;
        expect(foot, `n=${n}+${extra}`).toBeLessThanOrEqual(others + doc.baselineGrid * 0.25);
        expect(others - foot, `n=${n}+${extra}`).toBeLessThan(doc.baselineGrid + 0.5);
        if (others - foot > doc.baselineGrid * 0.5) short++;
      }
    }
    // The sweep reaches capped closing pages of both line-count parities.
    expect(capped).toBeGreaterThan(4);
    expect(short).toBeGreaterThan(0);
  }, 120_000);
});

describe('the level cut of a closing page (#1600)', () => {
  it('stands no lower than the columns need: no line goes into every column at once', () => {
    let capped = 0;
    for (let n = 15; n <= 30; n++) {
      for (const m of [n - 11, n - 9]) {
        // A page of text, then text, a box, a heading and its text on the
        // closing page: the box closes the first column and the heading
        // opens the second, so the margins between them vanish at the cut.
        const md = [
          '# Chapter', '', sentences(66), '', sentences(n), '',
          ':::callout{title="Try it"}', sentences(3), ':::', '',
          '## A last section', '', sentences(m), '', sentences(4),
        ].join('\n');
        const doc = build(md);
        const page = lastPage(doc);
        const cols = textColumns(page);
        if (cols.length < 2 || !cols.every((c) => c.trailingCap)) continue;
        capped++;
        const stretched = cols.map((c) => c.blocks.some((b) => {
          const rec = b.balancing;
          if (!rec) return false;
          return rec.spaceAbove >= doc.baselineGrid - 0.01 || (rec.extraLines ?? 0) > 0;
        }) || (() => {
          const frame = closingFrame(c);
          return frame?.balancing !== undefined && frame.balancing.spaceAbove >= doc.baselineGrid - 0.01;
        })());
        expect(stretched.every(Boolean), `n=${n} m=${m}: every column took a line`).toBe(false);
        // Nor does every column leave a line empty under the cut: the cut
        // then stands a line higher.
        const free = cols.map((c) => {
          const lever = c.blocks.reduce((px, b) => px + (b.balancing && b.containerId === undefined
            ? b.balancing.spaceAbove + Math.max(0, b.balancing.extraLines ?? 0) * doc.baselineGrid : 0), 0)
            + (closingFrame(c)?.balancing?.spaceAbove ?? 0);
          return Math.floor((c.bbox.y + c.bbox.height - columnFoot(c) + lever + 0.01) / doc.baselineGrid);
        });
        expect(Math.min(...free), `n=${n} m=${m}: the cut stands a line low`).toBe(0);
      }
    }
    expect(capped).toBeGreaterThan(10);
  }, 120_000);
});

describe('a bottom-floated box on a levelled closing page (#1600)', () => {
  it('keeps its page, and the cut leaves no hole of lines above a heading', () => {
    let cases = 0;
    for (let n = 20; n <= 32; n++) {
      for (const m of [20, 28]) {
        const md = [
          '# Chapter', '', sentences(66), '', sentences(n), '',
          ':::callout{title="Aside" placement="bottom"}', sentences(3), ':::', '',
          sentences(m), '', '## A last section', '', sentences(4),
        ].join('\n');
        const doc = build(md);
        const page = lastPage(doc);
        // The box lies on the closing page, not on a page of its own.
        expect(page.floats?.some((f) => f.type === 'callout'), `n=${n} m=${m}: the box left its page`).toBe(true);
        expect(page.columns.some((c) => c.blocks.some((b) => !b.hidden && b.type === 'heading')), `n=${n} m=${m}`).toBe(true);
        for (const b of doc.blocks) {
          if (b.pageIndex !== page.index || !b.balancing) continue;
          expect(b.balancing.spaceAbove, `n=${n} m=${m}: ${b.type} pushed down`).toBeLessThan(doc.baselineGrid * 1.5);
        }
        cases++;
      }
    }
    expect(cases).toBeGreaterThan(20);
  }, 120_000);
});
