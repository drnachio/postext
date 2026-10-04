import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { resolveHeadingsConfig, stripHeadingsDefaults } from '../defaults/headings';
import { stripHeadingStylesDefaults } from '../defaults/headingStyles';
import { collectConfigWarnings } from '../configWarnings';
import { formatWarning } from '../pipeline/contentWarnings';
import { renderToHtml } from '../html-backend';
import type { HeadingLevelConfig, PostextConfig } from '../types';
import type { VDTBlock, VDTDesignTextBlock, VDTDocument } from '../vdt';

// Deterministic text measurement stub (no DOM in the node test env): every
// character is 7px wide whatever the font, so widths read as char counts.
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

const config = (extra: PostextConfig = {}): PostextConfig => ({
  page: { dpi: 72, width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  ...extra,
  headings: {
    ...extra.headings,
    levels: (extra.headings?.levels ?? []).some((l) => l.level === 1)
      ? extra.headings!.levels!
      : [{ level: 1, breakBefore: { enabled: false } }, ...(extra.headings?.levels ?? [])],
  },
});

const headingOf = (doc: VDTDocument, text: string): VDTBlock =>
  doc.blocks.find((b) => b.type === 'heading' && b.lines.some((l) => l.text.includes(text)))!;
const lineWidth = (b: VDTBlock): number => b.lines[0]!.bbox.width;

describe('heading letterSpacing (EF-83)', () => {
  it('resolves to 0 on every level, and a level keeps its own', () => {
    const plain = resolveHeadingsConfig({});
    for (const l of plain.levels) expect(l.letterSpacing).toEqual({ value: 0, unit: 'pt' });
    const set = resolveHeadingsConfig({ levels: [{ level: 2, letterSpacing: pt(1.5) }] });
    expect(set.levels.find((l) => l.level === 2)!.letterSpacing).toEqual(pt(1.5));
    expect(set.levels.find((l) => l.level === 3)!.letterSpacing).toEqual({ value: 0, unit: 'pt' });
  });

  it('strips a zero tracking and keeps any other', () => {
    expect(stripHeadingsDefaults({ levels: [{ level: 2, letterSpacing: pt(0) }] })).toBeUndefined();
    expect(stripHeadingsDefaults({ levels: [{ level: 2, letterSpacing: pt(-0.5) }] })).toEqual({ levels: [{ level: 2, letterSpacing: pt(-0.5) }] });
    expect(stripHeadingStylesDefaults([{ id: 'back', letterSpacing: pt(1.35) }])).toEqual([{ id: 'back', letterSpacing: pt(1.35) }]);
  });

  it('tracks a level\'s heading: measured into its lines and stamped on the block', () => {
    const doc = buildDocument({ markdown: '## Methods\n\nText.' }, config({ headings: { levels: [{ level: 2, letterSpacing: pt(2) }] } }));
    const plain = buildDocument({ markdown: '## Methods\n\nText.' }, config());
    const tracked = headingOf(doc, 'Methods');
    expect(tracked.letterSpacing).toBeCloseTo(2, 5);
    expect(headingOf(plain, 'Methods').letterSpacing).toBeUndefined();
    // Seven letters, 2px each.
    expect(lineWidth(tracked)).toBeCloseTo(lineWidth(headingOf(plain, 'Methods')) + 7 * 2, 5);
  });

  it('an em tracking is relative to the level size; a negative one tightens', () => {
    // H2 is 15pt by default: 0.1em = 1.5px.
    const em = headingOf(buildDocument({ markdown: '## Methods' }, config({ headings: { levels: [{ level: 2, letterSpacing: { value: 0.1, unit: 'em' } }] } })), 'Methods');
    expect(em.letterSpacing).toBeCloseTo(1.5, 5);
    const tight = headingOf(buildDocument({ markdown: '## Methods' }, config({ headings: { levels: [{ level: 2, letterSpacing: pt(-0.5) }] } })), 'Methods');
    expect(tight.letterSpacing).toBeCloseTo(-0.5, 5);
  });

  it('a heading style sets it, uppercase back matter included (the reported case)', () => {
    const doc = buildDocument(
      { markdown: '## Methods\n\nText.\n\n## References {style="back"}\n\nText.' },
      config({ headingStyles: [{ id: 'back', fontSize: pt(7.5), letterSpacing: pt(1.35), textTransform: 'uppercase' }] }),
    );
    const back = headingOf(doc, 'REFERENCES');
    expect(back.letterSpacing).toBeCloseTo(1.35, 5);
    // The level's own headings stay untracked.
    expect(headingOf(doc, 'Methods').letterSpacing).toBeUndefined();
  });

  it('HTML paints the heading with the letter-spacing it was measured with', () => {
    const doc = buildDocument({ markdown: '## Methods' }, config({ headings: { levels: [{ level: 2, letterSpacing: pt(2) }] } }));
    expect(renderToHtml(doc)).toContain('letter-spacing:2px;');
  });

  it('a page-spanning opener without a design paints its title with the tracking', () => {
    const doc = buildDocument(
      { markdown: '# Opening\n\nText.' },
      config({ layout: { layoutType: 'double' }, headings: { levels: [{ level: 1, span: 'page', breakBefore: { enabled: false }, letterSpacing: pt(3) }] } }),
    );
    const band = doc.pages[0]!.openerBand!;
    expect((band.blocks[0] as VDTDesignTextBlock).letterSpacingPx).toBeCloseTo(3, 5);
  });
});

describe('unknown heading settings are reported (EF-83)', () => {
  it('flags a key a heading level, a heading style or the headings section does not have', () => {
    const warnings = collectConfigWarnings({
      headings: {
        levels: [{ level: 2, tracking: pt(1) } as HeadingLevelConfig],
        spacing: 3,
      } as PostextConfig['headings'],
      headingStyles: [{ id: 'back', letterSpacng: pt(1.35) } as unknown as NonNullable<PostextConfig['headingStyles']>[number]],
    });
    expect(warnings).toEqual([
      { kind: 'unknownConfigKey', path: 'headings.spacing', value: 'spacing', used: '' },
      { kind: 'unknownConfigKey', path: 'headings.levels[0].tracking', value: 'tracking', used: '' },
      { kind: 'unknownConfigKey', path: 'headingStyles[0].letterSpacng', value: 'letterSpacng', used: '', suggestion: 'letterSpacing' },
    ]);
    expect(formatWarning(warnings[2]!)).toBe('headingStyles[0].letterSpacng: unknown setting "letterSpacng" — ignored (did you mean "letterSpacing"?)');
    expect(formatWarning(warnings[1]!)).toBe('headings.levels[0].tracking: unknown setting "tracking" — ignored');
  });

  it('a style may not set `level`; the balancing settings are checked too; so are the HTML viewer overrides', () => {
    const warnings = collectConfigWarnings({
      headings: { balancing: { maxLinesPerHeadings: 2 } } as unknown as PostextConfig['headings'],
      headingStyles: [{ id: 'x', level: 2 } as unknown as NonNullable<PostextConfig['headingStyles']>[number]],
      htmlViewer: { overrides: { headings: { levels: [{ level: 1, colour: '#000' } as unknown as HeadingLevelConfig] } } },
    });
    expect(warnings.map((w) => w.path)).toEqual([
      'headings.balancing.maxLinesPerHeadings',
      'headingStyles[0].level',
      'htmlViewer.overrides.headings.levels[0].colour',
    ]);
    expect(warnings[0]!.suggestion).toBe('maxLinesPerHeading');
    expect(warnings[2]!.suggestion).toBe('color');
  });

  it('a clean heading config — every documented key — reports nothing', () => {
    const level: Required<HeadingLevelConfig> = {
      level: 1, fontSize: pt(18), lineHeight: pt(22), fontFamily: 'Lora', color: { hex: '#000000', model: 'hex' },
      fontWeight: 700, marginTop: pt(10), marginBottom: pt(5), numberingTemplate: '', numberSeparator: ' ', numberPosition: 'before', italic: false,
      letterSpacing: pt(0), breakBefore: { enabled: true }, span: 'column',
      advancedDesign: { enabled: false, slot: { elements: [] } }, textTransform: 'none', hidden: false, snapToGrid: true,
    };
    expect(collectConfigWarnings({
      headings: {
        fontFamily: 'Lora', lineHeight: pt(20), color: { hex: '#000000', model: 'hex' }, textAlign: 'left', fontWeight: 700,
        marginTop: pt(1), marginBottom: pt(1), keepWithNext: true, snapToGrid: true, balancing: { enabled: true }, levels: [level],
      },
      headingStyles: [{ id: 'a', name: 'A', numbered: false, toc: false, numberingTemplate: '', palette: {}, letterSpacing: pt(1) }],
    })).toEqual([]);
  });

  it('the build lists them in doc.configWarnings', () => {
    const doc = buildDocument({ markdown: '## Methods' }, config({ headings: { levels: [{ level: 2, tracking: pt(1) } as HeadingLevelConfig] } }));
    expect(doc.configWarnings?.map((w) => w.path)).toEqual(['headings.levels[1].tracking']);
  });
});
