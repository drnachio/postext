import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { resolveHeadingsConfig, stripHeadingsDefaults } from '../../defaults/headings';
import { CONFIG_VERSION, migrateBundleConfig, migrateConfig, pinLegacyHeadingSplit } from '../../bundle/configVersion';
import type { BodyTextConfig, KeepWithNextSplit, PostextConfig, VDTBlock, VDTDocument } from '../../index';

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const words = 'the chapter runs on without a break and the next one starts on the same page under its own short title'.split(' ');
const text = (n: number, seed: number) => `${Array.from({ length: n }, (_, i) => words[(i * 5 + seed) % words.length]).join(' ')}.`;

const config = (keepWithNextSplit: KeepWithNextSplit | undefined, bodyText: BodyTextConfig = {}): PostextConfig => ({
  page: { width: mm(90), height: mm(80), dpi: 100, margins: { top: mm(8), bottom: mm(8), left: mm(8), right: mm(8) } },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(10), lineHeight: pt(12), firstLineIndent: pt(0), ...bodyText },
  headings: {
    ...(keepWithNextSplit ? { keepWithNextSplit } : {}),
    balancing: { enabled: false },
    levels: [{ level: 1, breakBefore: { enabled: false } }],
  },
  header: { elements: [] },
  footer: { elements: [] },
});

/** Filler of `filler` words, a heading, the paragraph kept with it
 *  (`kept` words) and more text. */
const build = (filler: number, kept: number, cfg: PostextConfig): VDTDocument =>
  buildDocument({ markdown: `${text(filler, 1)}\n\n## A short title\n\n${text(kept, 2)}\n\n${text(40, 3)}` }, cfg, createMeasurementCache());

/** The parts of the paragraph under the heading, in reading order. */
const keptParts = (doc: VDTDocument): VDTBlock[] => {
  const heading = doc.blocks.find((b) => b.type === 'heading')!;
  return doc.blocks.filter((b) => b.contentIndex === heading.contentIndex! + 1);
};

describe('a paragraph kept with the heading above it splits by the orphan rule too (EF-185)', () => {
  // Paragraph lengths under the heading: 30 words set 4 lines, 45 words 6,
  // 22 words 3 and 38 words 5 on this page.
  const cases: [string, BodyTextConfig, number, number[]][] = [
    ['widowMinLines 3 (the Cookbook case)', { widowMinLines: 3 }, 3, [30, 45]],
    ['the default minimums', {}, 2, [22, 38]],
  ];
  for (const [label, bodyText, widowMin, lengths] of cases) {
    it(`${label}: no split under a heading leaves fewer than orphanMinLines behind`, () => {
      let splitUnder = 0;
      let moved = 0;
      let legacyOrphans = 0;
      for (const kept of lengths) {
        for (let filler = 20; filler <= 200; filler += 2) {
          const doc = build(filler, kept, config(undefined, bodyText));
          const parts = keptParts(doc);
          const heading = doc.blocks.find((b) => b.type === 'heading')!;
          const first = parts[0]!;
          if (parts.length > 1 && first.pageIndex === heading.pageIndex && first.columnIndex === heading.columnIndex) {
            // Split right under the heading: the widow minimum stays, the
            // orphan minimum goes on.
            splitUnder++;
            expect(first.lines.length, `${kept}/${filler}`).toBeGreaterThanOrEqual(widowMin);
            expect(parts[1]!.lines.length, `${kept}/${filler}`).toBeGreaterThanOrEqual(2);
          }
          // The heading never closes a column.
          const col = doc.pages[heading.pageIndex!]!.columns[heading.columnIndex!]!;
          expect(col.blocks[col.blocks.length - 1], `${kept}/${filler}`).not.toBe(heading);
          // 1.4's rule on the same text, for contrast: where it strands a
          // line, the new rule moves the heading on with its paragraph.
          const legacy = keptParts(build(filler, kept, config('fill', bodyText)));
          if (legacy.length > 1 && legacy[legacy.length - 1]!.lines.length < 2) {
            legacyOrphans++;
            if (col.blocks[0] === heading) moved++;
          }
        }
      }
      // Non-vacuous: the sweep splits under the heading, and where 1.4's
      // rule strands a line the heading moves on instead.
      expect(splitUnder).toBeGreaterThan(0);
      expect(legacyOrphans).toBeGreaterThan(0);
      expect(moved).toBe(legacyOrphans);
    });
  }

  it("'fill' keeps postext 1.4's split", () => {
    // A four-line paragraph with room for three under the heading.
    const fill = keptParts(build(62, 30, config('fill', { widowMinLines: 3 })));
    expect(fill.map((p) => p.lines.length)).toEqual([3, 1]);
    const rules = keptParts(build(62, 30, config('rules', { widowMinLines: 3 })));
    expect(rules.map((p) => p.lines.length)).toEqual([4]);
  });

  it('lays a configuration stored before rules 8 out as postext 1.4 did', () => {
    const stored: PostextConfig = { ...config(undefined, { widowMinLines: 3 }) };
    delete (stored.headings as Record<string, unknown>).keepWithNextSplit;
    const markdown = `${text(62, 1)}\n\n## A short title\n\n${text(30, 2)}\n\n${text(40, 3)}`;
    for (const version of [undefined, 3, 6, 7]) {
      const migrated = migrateConfig(stored, version, { content: markdown });
      expect(migrated.headings?.keepWithNextSplit, `${version}`).toBe('fill');
      const doc = buildDocument({ markdown }, migrated, createMeasurementCache());
      expect(keptParts(doc).map((p) => p.lines.length)).toEqual([3, 1]);
    }
    // Stored under today's rules, it is read as it is.
    expect(migrateConfig(stored, CONFIG_VERSION, { content: markdown })).toBe(stored);
    expect(CONFIG_VERSION).toBe(8);
  });

  it('pins only what the setting changes', () => {
    const plain: PostextConfig = { bodyText: { fontFamily: 'Georgia' } };
    // No heading in the text: nothing is kept with one.
    expect(migrateConfig(plain, 7, { content: 'Prose only, no heading.' })).toBe(plain);
    // Unknown content may hold one.
    expect(migrateConfig(plain, 7).headings).toEqual({ keepWithNextSplit: 'fill' });
    // Keep-with-next or orphan control off: the setting changes nothing.
    const noKeep: PostextConfig = { headings: { keepWithNext: false } };
    expect(pinLegacyHeadingSplit(noKeep)).toBe(noKeep);
    const noOrphans: PostextConfig = { bodyText: { avoidOrphans: false } };
    expect(pinLegacyHeadingSplit(noOrphans)).toBe(noOrphans);
    // A value the configuration names is kept.
    const named: PostextConfig = { headings: { keepWithNextSplit: 'rules' } };
    expect(pinLegacyHeadingSplit(named)).toBe(named);
    // A bundle pins the `headings` its layers leave in force.
    const merged = migrateBundleConfig({ headings: { fontFamily: 'Georgia' } }, [{ bodyText: { fontSize: pt(11) } }], undefined, { content: '# T\n\nText.' });
    expect(merged.headings).toEqual({ fontFamily: 'Georgia', keepWithNextSplit: 'fill' });
  });

  it('resolves and strips the setting', () => {
    expect(resolveHeadingsConfig({}).keepWithNextSplit).toBe('rules');
    expect(resolveHeadingsConfig({ keepWithNextSplit: 'fill' }).keepWithNextSplit).toBe('fill');
    expect(resolveHeadingsConfig({ keepWithNextSplit: 'bogus' as KeepWithNextSplit }).keepWithNextSplit).toBe('rules');
    expect(stripHeadingsDefaults({ keepWithNextSplit: 'rules' })).toBeUndefined();
    expect(stripHeadingsDefaults({ keepWithNextSplit: 'fill' })).toEqual({ keepWithNextSplit: 'fill' });
  });
});
