import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { resolveBodyTextConfig, stripBodyTextDefaults, resolveParagraphStylesConfig, stripParagraphStylesDefaults, stripConfigDefaults } from '../../defaults/index.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import type { BodyTextConfig, ParagraphStyleConfig, PostextConfig } from '../../types.js';
import type { VDTBlock, VDTDocument } from '../../vdt.js';
import { CONFIG_VERSION, migrateConfig, pinLegacyParagraphContainerSpacing } from '../../bundle/index.js';
import { migrateBundleConfig, pinLegacyBoxParagraphStyles, pinLegacyScriptContext, pinLegacyShapingLanguage, pinLegacySlashBreaks } from '../../bundle/configVersion.js';

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

// The Cookbook repros of EF-159 and EF-181, at 72 dpi so a point is a
// pixel: body 10 pt on a 14 pt grid, one line of paragraph spacing.
const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });
const GRID = 14;

const config = (style: Partial<ParagraphStyleConfig>, body: BodyTextConfig = {}): PostextConfig => ({
  page: { width: mm(120), height: mm(150), dpi: 72, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), paragraphSpacing: true, firstLineIndent: pt(0), ...body },
  paragraphStyles: [{ id: 's', ...style }],
  headings: { balancing: { enabled: false } },
});

const build = (md: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());
const byText = (doc: VDTDocument, start: string): VDTBlock =>
  doc.blocks.find((b) => b.lines[0]?.text.startsWith(start))!;
const top = (doc: VDTDocument, b: VDTBlock): number => b.bbox.y - doc.pages[b.pageIndex]!.columns[b.columnIndex]!.bbox.y;
/** Bottom of a block's text (its last line box), from the column top. */
const textBottom = (doc: VDTDocument, b: VDTBlock): number => {
  const last = b.lines[b.lines.length - 1]!;
  return last.bbox.y + last.bbox.height - doc.pages[b.pageIndex]!.columns[b.columnIndex]!.bbox.y;
};
const baseline = (b: VDTBlock, which: 'first' | 'last'): number =>
  (which === 'first' ? b.lines[0]! : b.lines[b.lines.length - 1]!).baseline;

const GROUP_THEN_HEADING = 'Intro.\n\n:::paragraphs{style="s"}\nOne.\n\nTwo.\n:::\n\n## Next\n\nText.';
const PLAIN_THEN_HEADING = 'Intro.\n\nOne.\n\nTwo.\n\n## Next\n\nText.';
const GROUP_THEN_TEXT = 'Intro.\n\n:::paragraphs{style="s"}\nOne.\n\nTwo.\n:::\n\nAfter.';
const BOXED = ':::callout\nIntro.\n\n:::paragraphs{style="s"}\nOne.\n\nTwo.\n:::\n\nAfter.\n:::';
const BOXED_PLAIN = ':::callout\nIntro.\n\nOne.\n\nTwo.\n\nAfter.\n:::';

describe('the space under a :::paragraphs container (EF-159, EF-181)', () => {
  it('collapses the style gap with a heading\'s top margin, as body paragraph spacing does (EF-159)', () => {
    const group = build(GROUP_THEN_HEADING, config({ spaceBetween: pt(14) }));
    const plain = build(PLAIN_THEN_HEADING, config({ spaceBetween: pt(14) }));
    // spaceBetween equals the paragraph spacing and the style keeps the body
    // leading, so the group must set exactly like plain paragraphs.
    expect(top(group, byText(group, 'Next'))).toBeCloseTo(top(plain, byText(plain, 'Next')), 5);
    expect(top(group, byText(group, 'Text'))).toBeCloseTo(top(plain, byText(plain, 'Text')), 5);
  });

  it('gives the paragraph after the group the text\'s paragraph spacing, on the grid (EF-181)', () => {
    const doc = build(GROUP_THEN_TEXT, config({ spaceBetween: pt(4) }));
    const two = byText(doc, 'Two');
    const after = byText(doc, 'After');
    // One at 28, Two at 46 (4 pt between), its text ends at 60.
    expect(textBottom(doc, two)).toBeCloseTo(60, 5);
    expect(top(doc, after) - textBottom(doc, two)).toBeGreaterThanOrEqual(GRID - 0.01);
    expect(top(doc, after) % GRID).toBeCloseTo(0, 5);
    expect(top(doc, after)).toBeCloseTo(84, 5);
  });

  it('gives the paragraph after the group the box\'s paragraph spacing inside a callout (EF-181)', () => {
    const doc = build(BOXED, config({ spaceBetween: pt(4) }));
    const plain = build(BOXED_PLAIN, config({ spaceBetween: pt(4) }));
    const step = (d: VDTDocument, a: string, b: string) => baseline(byText(d, b), 'first') - baseline(byText(d, a), 'last');
    expect(step(doc, 'One', 'Two')).toBeCloseTo(GRID + 4, 5);
    expect(step(doc, 'Two', 'After')).toBeCloseTo(step(plain, 'Two', 'After'), 5);
    expect(step(doc, 'Two', 'After')).toBeCloseTo(2 * GRID, 5);
  });

  it('a larger style gap still wins over the paragraph spacing', () => {
    const doc = build(GROUP_THEN_TEXT, config({ spaceBetween: pt(4), marginBottom: pt(30) }));
    const two = byText(doc, 'Two');
    const after = byText(doc, 'After');
    expect(top(doc, after) - textBottom(doc, two)).toBeGreaterThanOrEqual(30 - 0.01);
    expect(top(doc, after)).toBeCloseTo(Math.ceil((60 + 30) / GRID) * GRID, 5);
  });

  it('without paragraph spacing, the text after the group sets as in 1.4', () => {
    const body = { paragraphSpacing: false };
    const doc = build(GROUP_THEN_TEXT, config({ spaceBetween: pt(4) }, body));
    const legacy = build(GROUP_THEN_TEXT, config({ spaceBetween: pt(4) }, { ...body, paragraphContainerSpacing: 'add' }));
    expect(top(doc, byText(doc, 'After'))).toBeCloseTo(top(legacy, byText(legacy, 'After')), 5);
    // Two ends at 46: 46 + 4 snaps to 56.
    expect(top(doc, byText(doc, 'After'))).toBeCloseTo(56, 5);
  });

  it('a negative marginBottom still pulls the flow up, as in 1.4', () => {
    const style = { spaceBetween: pt(4), marginBottom: pt(-14) };
    const doc = build(GROUP_THEN_TEXT, config(style));
    const legacy = build(GROUP_THEN_TEXT, config(style, { paragraphContainerSpacing: 'add' }));
    expect(top(doc, byText(doc, 'After'))).toBeCloseTo(top(legacy, byText(legacy, 'After')), 5);
  });

  it('the heading after a group off the grid collapses its margin from the snapped foot', () => {
    // A 10 pt leading takes the group off the 14 pt grid.
    const doc = build(GROUP_THEN_HEADING, config({ lineHeight: pt(10), spaceBetween: pt(4), marginBottom: pt(30) }));
    const two = byText(doc, 'Two');
    const next = byText(doc, 'Next');
    // Two ends at 52: the flow snaps to 56, which leaves 26 of the 30 owed;
    // the H2's 22.5 (1.5 em of 15 pt) collapses into them.
    expect(textBottom(doc, two)).toBeCloseTo(52, 5);
    expect(top(doc, next)).toBeCloseTo(56 + 26, 5);
    // 1.4 baked the 30 into the snap (52 + 30 → 84) and added the 22.5.
    const legacy = build(GROUP_THEN_HEADING, config({ lineHeight: pt(10), spaceBetween: pt(4), marginBottom: pt(30) }, { paragraphContainerSpacing: 'add' }));
    expect(top(legacy, byText(legacy, 'Next'))).toBeCloseTo(84 + 22.5, 5);
  });

  it('paragraphContainerSpacing: \'add\' keeps 1.4\'s space (the style gap baked in, the heading margin added)', () => {
    const doc = build(GROUP_THEN_HEADING, config({ spaceBetween: pt(14) }, { paragraphContainerSpacing: 'add' }));
    // Two ends at 70; 70 + 14 = 84 is on the grid; the H2 adds 22.5 under it.
    expect(top(doc, byText(doc, 'Next'))).toBeCloseTo(84 + 22.5, 5);
    const text = build(GROUP_THEN_TEXT, config({ spaceBetween: pt(4) }, { paragraphContainerSpacing: 'add' }));
    expect(top(text, byText(text, 'After'))).toBeCloseTo(70, 5);
    const boxed = build(BOXED, config({ spaceBetween: pt(4) }, { paragraphContainerSpacing: 'add' }));
    expect(baseline(byText(boxed, 'After'), 'first') - baseline(byText(boxed, 'Two'), 'last')).toBeCloseTo(GRID + 4, 5);
  });

  it('a container that closes on a list sets as in 1.4 under either rule', () => {
    // The list keeps its own space in its snap, as outside a container, and
    // the container's marginBottom follows it (verifier probe of round 6).
    const LIST_THEN_TEXT = 'Intro.\n\n:::paragraphs{style="s"}\nOne.\n\n- a\n- b\n:::\n\nAfter.';
    const LIST_THEN_HEADING = 'Intro.\n\n:::paragraphs{style="s"}\nOne.\n\n- a\n- b\n:::\n\n## Head\n\nAfter.';
    const PLAIN_LIST_THEN_HEADING = 'Intro.\n\nOne.\n\n- a\n- b\n\n## Head\n\nAfter.';
    for (const style of [{ spaceBetween: pt(4) }, { spaceBetween: pt(4), marginBottom: pt(20) }, { spaceBetween: pt(4), marginBottom: pt(-10) }]) {
      for (const md of [LIST_THEN_TEXT, LIST_THEN_HEADING]) {
        const doc = build(md, config(style));
        const legacy = build(md, config(style, { paragraphContainerSpacing: 'add' }));
        const b = byText(doc, 'b');
        expect(b.bbox.height, JSON.stringify(style)).toBeCloseTo(byText(legacy, 'b').bbox.height, 5);
        expect(top(doc, byText(doc, 'After')), JSON.stringify(style)).toBeCloseTo(top(legacy, byText(legacy, 'After')), 5);
      }
    }
    const doc = build(LIST_THEN_HEADING, config({ spaceBetween: pt(4) }));
    const plain = build(PLAIN_LIST_THEN_HEADING, config({ spaceBetween: pt(4) }));
    expect(top(doc, byText(doc, 'Head'))).toBeCloseTo(top(plain, byText(plain, 'Head')), 5);
  });

  it('the heading after a group closing inside another container collapses as after a flat one', () => {
    const style = { spaceBetween: pt(4), lineHeight: pt(10), marginBottom: pt(30) };
    const NESTED = 'Intro.\n\n:::paragraphs{style="o"}\n:::paragraphs{style="s"}\nOne.\n\nTwo.\n:::\n:::\n\n## Next\n\nText.';
    const withOuter = (outer: Partial<ParagraphStyleConfig>): PostextConfig => ({ ...config(style), paragraphStyles: [{ id: 's', ...style }, { id: 'o', ...outer }] });
    const flat = build(GROUP_THEN_HEADING, config(style));
    const nested = build(NESTED, withOuter({}));
    expect(top(nested, byText(nested, 'Next'))).toBeCloseTo(top(flat, byText(flat, 'Next')), 5);
    expect(top(nested, byText(nested, 'Next'))).toBeCloseTo(56 + 26, 5);
    // The outer container's own space under it counts too, from the same
    // snapped foot: 27 is more than the 26 still owed, 36 more than the two
    // lines the text would get.
    const outer27 = build(NESTED, withOuter({ marginBottom: pt(27) }));
    expect(top(outer27, byText(outer27, 'Next'))).toBeCloseTo(56 + 27, 5);
    const outer36 = build(NESTED, withOuter({ marginBottom: pt(36) }));
    expect(top(outer36, byText(outer36, 'Next'))).toBeCloseTo(56 + 36, 5);
  });

  it('resolves to \'collapse\' and strips the default', () => {
    expect(resolveBodyTextConfig().paragraphContainerSpacing).toBe('collapse');
    expect(resolveBodyTextConfig({ paragraphContainerSpacing: 'add' }).paragraphContainerSpacing).toBe('add');
    expect(stripBodyTextDefaults(resolveBodyTextConfig())).toBeUndefined();
    expect(stripBodyTextDefaults(resolveBodyTextConfig({ paragraphContainerSpacing: 'add' }))).toEqual({ paragraphContainerSpacing: 'add' });
  });
});

describe('paragraphStyles[].containerSpacing (#715)', () => {
  const step = (d: VDTDocument, a: string, b: string) => baseline(byText(d, b), 'first') - baseline(byText(d, a), 'last');

  it('\'add\' on a style in a \'collapse\' document: the style\'s own space under its groups', () => {
    // In the text: 1.4's rule for this container (Two ends at 60; 4 pt of
    // the style, snapped: the text after it starts at 70).
    const text = build(GROUP_THEN_TEXT, config({ spaceBetween: pt(4), containerSpacing: 'add' }));
    expect(top(text, byText(text, 'After'))).toBeCloseTo(70, 5);
    expect(JSON.stringify(text.pages)).toBe(JSON.stringify(build(GROUP_THEN_TEXT, config({ spaceBetween: pt(4) }, { paragraphContainerSpacing: 'add' })).pages));
    // Under a heading: the style gap baked in, the heading's margin added.
    const head = build(GROUP_THEN_HEADING, config({ spaceBetween: pt(14), containerSpacing: 'add' }));
    expect(top(head, byText(head, 'Next'))).toBeCloseTo(84 + 22.5, 5);
    // In a box: no floor of the box's paragraph spacing.
    const boxed = build(BOXED, config({ spaceBetween: pt(4), containerSpacing: 'add' }));
    expect(step(boxed, 'Two', 'After')).toBeCloseTo(GRID + 4, 5);
    // A style that does not set it keeps the document's rule: a line of space.
    expect(step(build(BOXED, config({ spaceBetween: pt(4) })), 'Two', 'After')).toBeCloseTo(2 * GRID, 5);
  });

  it('\'collapse\' on a style in an \'add\' document: the merged space with its floor', () => {
    const add = { paragraphContainerSpacing: 'add' as const };
    const text = build(GROUP_THEN_TEXT, config({ spaceBetween: pt(4), containerSpacing: 'collapse' }, add));
    expect(top(text, byText(text, 'After'))).toBeCloseTo(84, 5);
    expect(JSON.stringify(text.pages)).toBe(JSON.stringify(build(GROUP_THEN_TEXT, config({ spaceBetween: pt(4) })).pages));
    const boxed = build(BOXED, config({ spaceBetween: pt(4), containerSpacing: 'collapse' }, add));
    expect(step(boxed, 'Two', 'After')).toBeCloseTo(2 * GRID, 5);
  });

  it('two containers of different styles in one document each follow their own rule', () => {
    const md = ':::callout\nIntro.\n\n:::paragraphs{style="s"}\nOne.\n:::\n\nMiddle.\n\n:::paragraphs{style="t"}\nTwo.\n:::\n\nAfter.\n:::';
    const cfg = config({ spaceBetween: pt(4), containerSpacing: 'add' });
    cfg.paragraphStyles!.push({ id: 't', spaceBetween: pt(4) });
    const doc = build(md, cfg);
    expect(step(doc, 'One', 'Middle')).toBeCloseTo(GRID + 4, 5);
    expect(step(doc, 'Two', 'After')).toBeCloseTo(2 * GRID, 5);
  });

  it('an unset style follows the document, also under the 1.4 pin', () => {
    const stored: PostextConfig = { paragraphStyles: [{ id: 's', spaceBetween: pt(4) }] };
    const pinned = migrateConfig(stored, 7, { content: GROUP_THEN_TEXT });
    expect(pinned.bodyText?.paragraphContainerSpacing).toBe('add');
    expect(resolveAllConfig(pinned).paragraphStyles[0]!.containerSpacing).toBeUndefined();
    // A style that sets `'collapse'` keeps it in a pinned document.
    const own: PostextConfig = { paragraphStyles: [{ id: 's', spaceBetween: pt(4), containerSpacing: 'collapse' }] };
    expect(resolveAllConfig(migrateConfig(own, 7, { content: GROUP_THEN_TEXT })).paragraphStyles[0]!.containerSpacing).toBe('collapse');
  });

  it('resolves a written value, drops any other, and survives the strip either way', () => {
    for (const containerSpacing of ['add', 'collapse'] as const) {
      for (const paragraphContainerSpacing of ['add', 'collapse'] as const) {
        const c: PostextConfig = { bodyText: { paragraphContainerSpacing }, paragraphStyles: [{ id: 's', containerSpacing }] };
        expect(resolveAllConfig(c).paragraphStyles[0]!.containerSpacing).toBe(containerSpacing);
        // Kept even where it equals the document's, which can change.
        expect(stripConfigDefaults(c).paragraphStyles).toEqual([{ id: 's', containerSpacing }]);
        expect(resolveAllConfig(stripConfigDefaults(c))).toEqual(resolveAllConfig(c));
      }
    }
    expect(resolveAllConfig({ paragraphStyles: [{ id: 's', containerSpacing: 'merge' as never }] }).paragraphStyles[0]!.containerSpacing).toBeUndefined();
    expect(collectConfigWarnings({ paragraphStyles: [{ id: 's', containerSpacing: 'add' }] })).toEqual([]);
  });
});

describe('paragraphStyles[].snapToGrid (EF-184)', () => {
  it('is on by default and stripped when on', () => {
    const body = resolveBodyTextConfig();
    expect(resolveParagraphStylesConfig([{ id: 's' }], body)[0]!.snapToGrid).toBe(true);
    expect(stripParagraphStylesDefaults([{ id: 's', snapToGrid: true }])).toEqual([{ id: 's' }]);
    expect(stripParagraphStylesDefaults([{ id: 's', snapToGrid: false }])).toEqual([{ id: 's', snapToGrid: false }]);
  });

  it('with snapToGrid false the flow keeps the exact gap under the group', () => {
    const doc = build(GROUP_THEN_TEXT, config({ spaceBetween: pt(4), snapToGrid: false }, { paragraphSpacing: false }));
    const two = byText(doc, 'Two');
    expect(two.snappedToGrid).toBe(false);
    // Two ends at 46 and After starts 4 pt under it, off the grid.
    expect(top(doc, byText(doc, 'After'))).toBeCloseTo(50, 5);
  });

  it('with snapToGrid false a heading after the group sits its own margin below it', () => {
    const doc = build(GROUP_THEN_HEADING, config({ lineHeight: pt(10), spaceBetween: pt(4), snapToGrid: false }, { paragraphSpacing: false }));
    const two = byText(doc, 'Two');
    expect(top(doc, byText(doc, 'Next')) - textBottom(doc, two)).toBeCloseTo(22.5, 5);
  });

  it('snaps as before when on', () => {
    const doc = build(GROUP_THEN_TEXT, config({ spaceBetween: pt(4) }, { paragraphSpacing: false }));
    expect(byText(doc, 'Two').snappedToGrid).toBe(true);
    expect(top(doc, byText(doc, 'After')) % GRID).toBeCloseTo(0, 5);
  });
});

describe('configurations stored before rules 8 keep the 1.4 space under containers', () => {
  const stored: PostextConfig = { bodyText: { fontFamily: 'Georgia' }, paragraphStyles: [{ id: 's' }] };

  it('pins \'add\' when the book holds a :::paragraphs container', () => {
    expect(CONFIG_VERSION).toBe(21);
    for (const version of [undefined, 3, 5, 6, 7]) {
      expect(migrateConfig(stored, version, { content: GROUP_THEN_HEADING }).bodyText?.paragraphContainerSpacing, `${version}`).toBe('add');
    }
    // Unknown content may hold one; a list of chapters is read as a whole.
    expect(migrateConfig(stored, 7).bodyText?.paragraphContainerSpacing).toBe('add');
    expect(migrateConfig(stored, 7, { content: ['No container.', '  :::paragraphs{style="s"}\nA.\n:::'] }).bodyText?.paragraphContainerSpacing).toBe('add');
    // The pinned configuration lays the book out as 1.4 did.
    const pinned = migrateConfig(config({ spaceBetween: pt(14) }), undefined, { content: GROUP_THEN_HEADING });
    const doc = build(GROUP_THEN_HEADING, pinned);
    expect(top(doc, byText(doc, 'Next'))).toBeCloseTo(84 + 22.5, 5);
  });

  it('leaves a book with no container, no paragraph style, a named value or today\'s rules as it is', () => {
    expect(migrateConfig(stored, 7, { content: 'Just text, and a mention of :::paragraphs in a line.' })).toEqual(pinLegacyBoxParagraphStyles(pinLegacySlashBreaks(pinLegacyShapingLanguage(pinLegacyScriptContext(stored)))));
    const noStyles: PostextConfig = { bodyText: { fontFamily: 'Georgia' } };
    // (GROUP_THEN_TEXT: a heading or a compound would bring the other
    // version-8 pins.)
    // (The fence brings the version-12 pin of the level cut's unit, #711,
    // on the headings.)
    expect(migrateConfig(noStyles, 7, { content: GROUP_THEN_TEXT }).bodyText).toEqual({ ...noStyles.bodyText, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false });
    expect(migrateConfig(stored, CONFIG_VERSION, { content: GROUP_THEN_HEADING })).toBe(stored);
    const named: PostextConfig = { ...stored, bodyText: { paragraphContainerSpacing: 'collapse' } };
    expect(pinLegacyParagraphContainerSpacing(named)).toBe(named);
    expect(migrateConfig(named, undefined, { content: GROUP_THEN_TEXT }).bodyText).toEqual({ ...named.bodyText, scriptContext: false, shapingLanguage: 'host', paragraphStylesInBoxes: 'document', breakAfterSlashes: false });
  });

  it('counts the paragraph styles of the HTML viewer\'s overrides', () => {
    const viewer: PostextConfig = { htmlViewer: { overrides: { paragraphStyles: [{ id: 's' }] } } };
    expect(pinLegacyParagraphContainerSpacing(viewer).bodyText?.paragraphContainerSpacing).toBe('add');
  });

  it('pins the bodyText in force in a bundle', () => {
    const merged = migrateBundleConfig({}, [{ paragraphStyles: [{ id: 's' }] }, { bodyText: { fontFamily: 'Georgia' } }], 7, { content: GROUP_THEN_TEXT });
    expect(merged.bodyText).toEqual({ fontFamily: 'Georgia', paragraphContainerSpacing: 'add', scriptContext: false, shapingLanguage: 'host', paragraphStylesInBoxes: 'document', breakAfterSlashes: false });
    expect(migrateBundleConfig({}, [{ paragraphStyles: [{ id: 's' }] }], 8, { content: GROUP_THEN_TEXT }).bodyText).toEqual({ scriptContext: false, shapingLanguage: 'host', paragraphStylesInBoxes: 'document', breakAfterSlashes: false });
  });
});
