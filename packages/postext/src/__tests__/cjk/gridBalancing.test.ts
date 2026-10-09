import { describe, it, expect } from 'vitest';
import { buildDocument, balancingOnByDefault } from '../../index';
import { resolveAllConfig } from '../../pipeline/config';
import { cjkGridGeometry } from '../../pipeline/cjkGrid';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig } from '../../types';
import type { VDTBlock, VDTDocument } from '../../vdt';

// CJK characters one em wide, anything else half.
const adv = (s: string, size: number): number => {
  let w = 0;
  for (const ch of s) w += ch.codePointAt(0)! >= 0x2e80 ? size : size / 2;
  return w;
};
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    const m = /(\d*\.?\d+)px/.exec(this.font);
    return { width: adv(s, m ? parseFloat(m[1]!) : 16) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const em = (value: number) => ({ value, unit: 'em' as const });

const HAN = '此开卷第一回也作者自云因曾历过一番梦幻之后故将真事隐去而借通灵之说撰此石头记一书也故曰甄士隐云云但书中所记何事何人自又云今风尘碌碌一事无成忽念及当日所有之女子一一细考较去觉其行止见识皆出于我之上何我堂堂须眉诚不若彼裙钗哉实愧则有余悔又无益之大无可如何之日也';
let seed = 7;
const rand = (): number => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const sentence = (): string => {
  const n = 6 + Math.floor(rand() * 18);
  let s = '';
  for (let i = 0; i < n; i++) s += HAN[Math.floor(rand() * HAN.length)];
  return s;
};
const paragraph = (sentences: number): string => {
  let p = '';
  for (let i = 0; i < sentences; i++) p += sentence() + (i === sentences - 1 ? '。' : rand() < 0.5 ? '，' : '。');
  return p;
};

const BODY = 15.75;
const LEAD = 29;
const MMPT = 25.4 / 72;
const AREA = { w: 28 * BODY * MMPT, h: 22 * LEAD * MMPT };

/** A GB/T 9704 page as `chinese-official-document` sets it: A4, 28 × 22
 *  cells of 三号 on 29 pt lines, full-width marks, 144 dpi. Runts are let
 *  be: the 孤字 push-out spreads a line of the plain setting, which is no
 *  part of balancing. */
const gbConfig = (balancing?: NonNullable<PostextConfig['headings']>['balancing']): PostextConfig => ({
  locale: 'zh-Hans',
  page: {
    width: mm(210), height: mm(297), dpi: 144,
    margins: { top: mm(37), bottom: mm(297 - 37 - AREA.h - 0.02), left: mm(28), right: mm(210 - 28 - AREA.w - 0.02) },
  },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  cjk: {
    grid: { enabled: true, charsPerLine: 28, linesPerPage: 22 },
    punctuationWidth: 'fullwidth', compressAdjacent: false, trimLineStart: false, hangingPunctuation: 'allow', latinSpacing: em(0),
  },
  bodyText: { fontSize: pt(BODY), lineHeight: pt(LEAD), textAlign: 'justify', firstLineIndent: em(2), indentAfterHeading: true, avoidRunts: false, hyphenation: { enabled: false } },
  headings: {
    levels: [2, 3].map((level) => ({ level, fontSize: pt(BODY), lineHeight: pt(LEAD), marginTop: pt(0), marginBottom: pt(0), numberingTemplate: '　　', numberSeparator: '' })),
    ...(balancing ? { balancing } : {}),
  },
});

const prose = (start: number): string => {
  seed = start;
  const parts: string[] = [];
  for (let i = 0; i < 24; i++) parts.push(paragraph(2 + Math.floor(rand() * 7)), '');
  return parts.join('\n');
};

const markdown = (start = 7): string => {
  seed = start;
  const parts: string[] = [];
  for (let s = 1; s <= 14; s++) {
    parts.push(`## ${'一二三四五六七八九十'[s % 10]}、${sentence().slice(0, 6)}`, '');
    const n = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) parts.push(paragraph(2 + Math.floor(rand() * 7)), '');
  }
  return parts.join('\n');
};

const CELL = (BODY * 144) / 72;
const PITCH = (LEAD * 144) / 72;

/** Body characters off a cell — x not a whole number of ems from the
 *  column's left edge — and lines off the grid — a baseline not a whole
 *  number of pitches under the page's first. */
function offGrid(doc: VDTDocument): string[] {
  const out: string[] = [];
  doc.pages.forEach((page, p) => {
    let first: number | undefined;
    for (const col of page.columns) {
      for (const b of col.blocks) {
        if (b.type !== 'paragraph' && b.type !== 'heading') continue;
        for (const line of b.lines) {
          first ??= line.baseline;
          const rows = (line.baseline - first) / PITCH;
          if (Math.abs(rows - Math.round(rows)) > 1e-6) out.push(`p${p} line ${line.text} at ${rows.toFixed(4)} rows`);
          let x = line.bbox.x;
          for (const seg of line.segments ?? []) {
            const chars = [...seg.text];
            const step = chars.length > 0 ? seg.width / chars.length : 0;
            chars.forEach((ch, i) => {
              const at = (x + i * step - col.bbox.x) / CELL;
              if (Math.abs(at - Math.round(at)) > 1e-6) out.push(`p${p} ${ch} at ${at.toFixed(4)} ems`);
            });
            x += seg.width;
          }
        }
      }
    }
  });
  return out;
}

const levered = (doc: VDTDocument, lever: string): VDTBlock[] =>
  doc.blocks.filter((b) => b.balancing?.levers.includes(lever as never));

describe('column balancing on a character grid (#632)', () => {
  it('is off by default on a grid, horizontal or vertical, and on when the config says so', () => {
    expect(resolveAllConfig(gbConfig()).headings.balancing.enabled).toBe(false);
    expect(balancingOnByDefault(gbConfig())).toBe(false);
    expect(resolveAllConfig(gbConfig({ enabled: true })).headings.balancing.enabled).toBe(true);
    expect(resolveAllConfig(gbConfig({ maxTracking: 20 })).headings.balancing.enabled).toBe(false);
    const vertical = { ...gbConfig(), layout: { layoutType: 'single' as const, writingMode: 'vertical-rl' as const } };
    expect(resolveAllConfig(vertical).headings.balancing.enabled).toBe(false);
    // Off the grid nothing changes.
    const plain = { ...gbConfig(), cjk: { grid: { enabled: false } } };
    expect(balancingOnByDefault(plain)).toBe(true);
    expect(resolveAllConfig(plain).headings.balancing.enabled).toBe(true);
    expect(balancingOnByDefault(undefined)).toBe(true);
    // `gridLines` resolves only when off, so other configs hash as before.
    expect('gridLines' in resolveAllConfig(gbConfig({ enabled: true })).headings.balancing).toBe(false);
    expect(resolveAllConfig(gbConfig({ enabled: true, gridLines: 'off' })).headings.balancing.gridLines).toBe('off');
  });

  it('adds lines in whole pitches: the baseline grid is the grid of lines', () => {
    const config = gbConfig({ enabled: true });
    const doc = buildDocument({ markdown: 'text' }, config, createMeasurementCache());
    expect(doc.baselineGrid).toBeCloseTo(cjkGridGeometry(config)!.pitch, 9);
    expect(doc.baselineGrid).toBeCloseTo(PITCH, 9);
  });

  it('keeps every character in its cell and every line on the grid with the default levers', () => {
    // Prose only: the loose paragraph is the one lever, and today's engine
    // spread the paragraphs it ran long off their cells.
    for (const start of [4, 8, 12]) {
      const doc = buildDocument({ markdown: prose(start) }, gbConfig({ enabled: true }), createMeasurementCache());
      expect(offGrid(doc)).toEqual([]);
      expect(levered(doc, 'looseParagraph')).toEqual([]);
      // The columns left short say why.
      const refused = doc.pages.flatMap((p) => p.columns).filter((c) => c.gridRefused);
      expect(refused.length).toBeGreaterThan(0);
      for (const c of refused) expect(c.gridRefused).toEqual(['looseParagraph']);
    }
    // Headings and paragraphs: rows above the heads, in whole pitches.
    for (const start of [7, 21]) {
      const doc = buildDocument({ markdown: markdown(start) }, gbConfig({ enabled: true }), createMeasurementCache());
      expect(offGrid(doc)).toEqual([]);
      const heads = levered(doc, 'heading');
      expect(heads.length).toBeGreaterThan(0);
      for (const h of heads) {
        const rows = h.balancing!.spaceAbove / PITCH;
        expect(Math.abs(rows - Math.round(rows))).toBeLessThan(1e-9);
        expect(rows).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('spreads a loose paragraph no more than maxTracking between two characters', () => {
    // 50‰ lets a line a character short spread its em over 27 gaps (37‰).
    const doc = buildDocument({ markdown: prose(4) }, gbConfig({ enabled: true, maxTracking: 50 }), createMeasurementCache());
    const loose = levered(doc, 'looseParagraph');
    expect(loose.length).toBeGreaterThan(0);
    for (const b of loose) {
      // No letter-spacing: the characters keep their em.
      expect(b.balancing!.tracking).toBe(0);
      for (const line of b.lines) {
        for (const seg of line.segments ?? []) expect(seg.tracking ?? 0).toBeLessThanOrEqual(0.05 * CELL + 1e-9);
      }
    }
  });

  it('leaves a heading at the page foot where it is with gridLines off, or by default', () => {
    for (const start of [7, 21]) {
      const md = markdown(start);
      const off = buildDocument({ markdown: md }, gbConfig({ enabled: true, gridLines: 'off' }), createMeasurementCache());
      expect(offGrid(off)).toEqual([]);
      for (const lever of ['heading', 'listEnd', 'afterDisplay', 'afterFloat']) expect(levered(off, lever)).toEqual([]);
      expect(off.gridBalancing).toEqual({ gridLines: 'off' });
      const short = off.pages.flatMap((p) => p.columns).filter((c) => c.gridRefused);
      expect(short.some((c) => c.gridRefused!.includes('heading'))).toBe(true);

      const plain = buildDocument({ markdown: md }, gbConfig(), createMeasurementCache());
      expect(plain.gridBalancing).toEqual({ off: true });
      expect(plain.blocks.filter((b) => b.balancing)).toEqual([]);
      expect(offGrid(plain)).toEqual([]);
      // The same layout as balancing turned off by hand.
      const byHand = buildDocument({ markdown: md }, gbConfig({ enabled: false }), createMeasurementCache());
      expect(byHand.gridBalancing).toBeUndefined();
      expect(plain.pages.map((p) => p.columns.map((c) => c.blocks.map((b) => `${b.id}@${b.bbox.y}`))))
        .toEqual(byHand.pages.map((p) => p.columns.map((c) => c.blocks.map((b) => `${b.id}@${b.bbox.y}`))));
    }
  });

  it('records nothing off the grid', () => {
    const config = { ...gbConfig({ enabled: true }), cjk: { grid: { enabled: false } } };
    const doc = buildDocument({ markdown: prose(4) }, config, createMeasurementCache());
    expect(doc.gridBalancing).toBeUndefined();
    expect(doc.pages.flatMap((p) => p.columns).some((c) => c.gridRefused)).toBe(false);
  });

  it('leaves a vertical grid as it was: balancing off by the vertical rule, nothing recorded', () => {
    const config: PostextConfig = { ...gbConfig(), layout: { layoutType: 'single', writingMode: 'vertical-rl' } };
    const doc = buildDocument({ markdown: prose(4) }, config, createMeasurementCache());
    expect(doc.config.headings.balancing.enabled).toBe(false);
    expect(doc.gridBalancing).toBeUndefined();
    expect(doc.blocks.filter((b) => b.balancing)).toEqual([]);
  });
});
