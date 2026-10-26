import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { fillGalley, galleyBreaks, minFillHeight, type GalleyItem } from '../../../pipeline/columns/columnsGroup.js';
import { wrapFlowColumns, FLOW_COLUMNS_STYLE_ID, FLOW_COLUMNS_PAGE_STYLE_ID } from '../../../pipeline/columns/flowColumns.js';
import { parseMarkdown } from '../../../parse/index.js';
import { computeOutlineFor, outlineFromDoc } from '../../../pipeline/contents/outline.js';
import type { PostextConfig, VDTBlock, VDTDocument } from '../../../index.js';

// `:::columns` in the running text, and groups that split (#634).

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const page = (layoutType: 'single' | 'double', height = 300): PostextConfig => ({
  page: { width: pt(400), height: pt(height), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType, gutterWidth: pt(12) },
  bodyText: { fontSize: pt(10), lineHeight: pt(13) },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
  header: { elements: [] },
  footer: { elements: [] },
});
const item = (i: number) => `Item ${i} has a few words so that it takes two or three lines in a narrow sub-column of the group.`;
const items = (n: number, from = 0) => Array.from({ length: n }, (_, i) => item(from + i)).join('\n\n');
const build = (markdown: string, config: PostextConfig): VDTDocument => buildDocument({ markdown }, config);

const textBlocks = (doc: VDTDocument): { page: number; block: VDTBlock }[] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.filter((b) => b.type !== 'callout').map((block) => ({ page: p.index, block }))));
const frames = (doc: VDTDocument) => doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.filter((b) => b.type === 'callout').map((block) => ({ page: p.index, block }))));
const lefts = (blocks: VDTBlock[]) => [...new Set(blocks.map((b) => Math.round(b.bbox.x)))].sort((a, b) => a - b);
const bottomOf = (blocks: VDTBlock[]) => Math.max(...blocks.map((b) => b.bbox.y + b.bbox.height));
const startsWith = (b: VDTBlock, s: string) => (b.lines[0]?.text ?? '').startsWith(s);

describe('main-flow :::columns (#634)', () => {
  it('sets its blocks in three balanced sub-columns across a single-column page', () => {
    const doc = build(`Intro paragraph.\n\n:::columns{count=3}\n${items(6)}\n:::\n\nAfter the group.`, page('single'));
    const all = textBlocks(doc).map((t) => t.block);
    const group = all.filter((b) => startsWith(b, 'Item'));
    expect(group).toHaveLength(6);
    const xs = lefts(group);
    expect(xs).toHaveLength(3);
    const col = doc.pages[0]!.columns[0]!;
    // Three sub-columns across the text width, a body line apart.
    const width = group[0]!.bbox.width;
    expect(width * 3 + 2 * (xs[1]! - xs[0]! - width)).toBeCloseTo(col.bbox.width, 0);
    // Balanced: two items a column, columns level.
    for (const x of xs) expect(group.filter((b) => Math.round(b.bbox.x) === x)).toHaveLength(2);
    // The text after the group follows it at the full measure.
    const after = all.find((b) => startsWith(b, 'After'))!;
    expect(after.bbox.y).toBeGreaterThanOrEqual(bottomOf(group) - 0.5);
    expect(after.bbox.x).toBeCloseTo(col.bbox.x, 6);
    // The group's frameless box carries no decoration.
    const [frame] = frames(doc);
    expect(frame!.block.callout!.styleId).toBe(FLOW_COLUMNS_STYLE_ID);
    expect(frame!.block.designOverlay!.blocks).toEqual([]);
  });

  it('keeps the body typography: the same lines as a paragraph of the text at that width', () => {
    const doc = build(`:::columns{count=2}\n${items(2)}\n:::`, page('single'));
    const group = textBlocks(doc).map((t) => t.block);
    const plain = build(items(1), { ...page('single'), page: { ...page('single').page, width: pt(400 / 2 + 20 - 6.5) } });
    expect(group[0]!.fontString).toBe(textBlocks(plain)[0]!.block.fontString);
  });

  it('span="page" cuts a two-column page into a band of three columns, the text resuming in two', () => {
    const md = `${items(2, 100)}\n\n:::columns{count=3 span="page"}\n${items(6)}\n:::\n\n${items(40, 200)}`;
    const doc = build(md, page('double', 500));
    const p0 = doc.pages[0]!;
    const span = p0.columns.find((c) => c.kind === 'span');
    expect(span).toBeDefined();
    const group = span!.blocks.filter((b) => b.type !== 'callout');
    expect(lefts(group)).toHaveLength(3);
    expect(span!.blocks[0]!.callout!.styleId).toBe(FLOW_COLUMNS_PAGE_STYLE_ID);
    // Below the band, the text runs in two columns again.
    const below = p0.columns.filter((c) => c.kind !== 'span' && c.bbox.y >= span!.bbox.y + span!.bbox.height - 0.5);
    expect(below.length).toBe(2);
    expect(below.every((c) => c.blocks.length > 0)).toBe(true);
  });

  it('a snake group taller than the room fills its sub-columns and goes on, the last part balanced', () => {
    const doc = build(`Intro paragraph.\n\n:::columns{count=3}\n${items(60)}\n:::\n\nAfter the group.`, page('single'));
    const fr = frames(doc);
    expect(fr.length).toBeGreaterThan(1);
    fr.forEach(({ block }, i) => {
      expect(block.callout!.part).toBe(i);
      expect(block.callout!.continued).toBe(i < fr.length - 1);
    });
    // Every item once, in reading order.
    const texts = textBlocks(doc).map((t) => t.block).filter((b) => startsWith(b, 'Item')).map((b) => Number(b.lines[0]!.text.split(' ')[1]));
    expect(texts).toEqual(Array.from({ length: 60 }, (_, i) => i));
    // A fragment that goes on fills the page down to its foot (within a line).
    const first = fr[0]!;
    const col = doc.pages[first.page]!.columns[0]!;
    expect(col.bbox.y + col.bbox.height - (first.block.bbox.y + first.block.bbox.height)).toBeLessThan(13 * 300 / 72 * 2);
    // The last fragment's sub-columns are balanced: within two items.
    const last = fr[fr.length - 1]!;
    const lastBlocks = doc.pages[last.page]!.columns[0]!.blocks.filter((b) => b.containerId === last.block.containerId && b.type !== 'callout' && b.bbox.y >= last.block.bbox.y - 0.5);
    const xs = lefts(lastBlocks);
    expect(xs.length).toBe(3);
    const heights = xs.map((x) => bottomOf(lastBlocks.filter((b) => Math.round(b.bbox.x) === x)));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(13 * 300 / 72 * 3);
    // The text after the group follows its last part.
    const after = textBlocks(doc).find((t) => startsWith(t.block, 'After'))!;
    expect(after.page).toBe(last.page);
  });

  it('a parallel group (breaks) goes on stream by stream, each in its own sub-column, stanzas whole', () => {
    const en = Array.from({ length: 14 }, (_, i) => `English stanza ${i} line one\\\nline two of the stanza\\\nline three ends it.`).join('\n\n');
    const es = Array.from({ length: 14 }, (_, i) => `Estrofa ${i} verso uno\\\nverso dos de la estrofa\\\nverso tres la cierra.`).join('\n\n');
    const doc = build(`Intro.\n\n:::columns{count=2 breaks="15"}\n${en}\n\n${es}\n:::\n\nAfter.`, page('single'));
    const fr = frames(doc);
    expect(fr.length).toBeGreaterThan(1);
    for (const { page: pi, block: frame } of fr) {
      const blocks = doc.pages[pi]!.columns[0]!.blocks.filter((b) => b.type !== 'callout' && b.containerId === frame.containerId && b.bbox.y >= frame.bbox.y - 0.5 && b.bbox.y < frame.bbox.y + frame.bbox.height);
      const left = blocks.filter((b) => Math.round(b.bbox.x) === lefts(blocks)[0]);
      const right = blocks.filter((b) => Math.round(b.bbox.x) !== lefts(blocks)[0]);
      // The English stream on the left, the Spanish on the right, level.
      expect(left.every((b) => startsWith(b, 'English'))).toBe(true);
      expect(right.every((b) => startsWith(b, 'Estrofa'))).toBe(true);
      expect(left.map((b) => b.lines[0]!.text.split(' ')[2])).toEqual(right.map((b) => b.lines[0]!.text.split(' ')[1]));
      // Stanzas are never cut.
      for (const b of blocks) expect(b.lines).toHaveLength(3);
    }
  });

  it('splits with a keepTogether: false box, a nested box inside it staying whole', () => {
    const config: PostextConfig = {
      ...page('single'),
      calloutStyles: [
        { id: 'panel', keepTogether: false, title: 'Panel', backgroundEnabled: true },
        { id: 'inner', keepTogether: true, title: 'Inner' },
      ],
    };
    const nested = ':::callout{type="inner"}\nA nested box that never splits, with a line or two of its own text.\n:::';
    const md = `:::callout{type="panel"}\n:::columns{count=2}\n${items(14)}\n\n${nested}\n\n${items(14, 14)}\n:::\n:::`;
    const doc = build(md, config);
    const outer = frames(doc).filter((f) => f.block.callout!.styleId === 'panel');
    expect(outer.length).toBeGreaterThan(1);
    // The nested box sits whole in one fragment.
    const inner = doc.blocks.filter((b) => b.type === 'callout' && b.callout?.styleId === 'inner');
    expect(inner).toHaveLength(1);
    const items28 = doc.blocks.filter((b) => b.type !== 'callout' && startsWith(b, 'Item')).map((b) => Number(b.lines[0]!.text.split(' ')[1]));
    expect(items28).toEqual(Array.from({ length: 28 }, (_, i) => i));
  });

  it('headings inside a group take their numbers, outline entries and pages', () => {
    const config: PostextConfig = { ...page('single', 260), headings: { ...page('single').headings, levels: [{ level: 1, breakBefore: { enabled: false } }, { level: 2, numberingTemplate: '{h2}' }] } };
    const md = `# Part\n\n:::columns{count=2}\n## First\n\n${items(40)}\n\n## Second\n\n${items(12, 40)}\n:::`;
    const doc = build(md, config);
    const heads = doc.blocks.filter((b) => b.type === 'heading' && b.headingLevel === 2);
    expect(heads.map((h) => h.lines[0]!.text)).toEqual([expect.stringContaining('First'), expect.stringContaining('Second')]);
    expect(heads[0]!.headingNumber).toBe(1);
    expect(heads[1]!.headingNumber).toBe(2);
    // The outline (and so a :::toc) points at the pages they landed on.
    const outline = outlineFromDoc(doc, computeOutlineFor(parseMarkdown(md), config));
    const entries = outline.filter((e) => e.kind !== 'part' && e.level === 2);
    expect(entries.map((e) => e.pageIndex)).toEqual(heads.map((h) => h.pageIndex));
    expect(heads[1]!.pageIndex).toBeGreaterThan(heads[0]!.pageIndex);
  });

  it('footnotes cited in a group go to the foot of the text column', () => {
    const config: PostextConfig = { ...page('single'), footnotes: { placement: 'column' } };
    const md = `:::columns{count=2}\n${items(2)}\n\nA cited line[^n].\n:::\n\nAfter.\n\n[^n]: The note.`;
    const doc = build(md, config);
    const note = doc.blocks.find((b) => b.footnoteNote === 'n');
    expect(note).toBeDefined();
    const col = doc.pages[note!.pageIndex]!.columns[note!.columnIndex]!;
    expect(note!.bbox.x).toBeCloseTo(col.bbox.x, 6);
    expect(note!.pageIndex).toBe(0);
  });

  it('gap and rule: sub-columns that far apart, a rule down each gutter', () => {
    const doc = build(`:::columns{count=3 gap=24pt rule}\n${items(6)}\n:::`, { ...page('single'), layout: { layoutType: 'single', columnRule: { color: { hex: '#ff0000', model: 'hex' }, lineWidth: pt(1) } } });
    const group = textBlocks(doc).map((t) => t.block);
    const xs = [...new Set(group.map((b) => b.bbox.x))].sort((a, b) => a - b);
    const gapPx = 24 * (doc.config.page.dpi / 72);
    expect(xs[1]! - xs[0]! - group[0]!.bbox.width).toBeCloseTo(gapPx, 3);
    const rules = frames(doc)[0]!.block.designOverlay!.blocks.filter((b) => b.kind === 'rule');
    expect(rules).toHaveLength(2);
    expect(rules.every((r) => r.kind === 'rule' && r.direction === 'vertical' && r.color === '#ff0000')).toBe(true);
  });

  it('layout.flowColumns: false ignores the fence outside a box, as postext 1.24 did', () => {
    const md = `Intro.\n\n:::columns{count=3}\n${items(6)}\n:::\n\nAfter.`;
    const doc = build(md, { ...page('single'), layout: { layoutType: 'single', flowColumns: false } });
    expect(frames(doc)).toHaveLength(0);
    expect(lefts(textBlocks(doc).map((t) => t.block))).toHaveLength(1);
  });

  it('a group in a box that fits lays out as before; one that does not is cut only under the new rules', () => {
    const config: PostextConfig = { ...page('single'), calloutStyles: [{ id: 'panel', keepTogether: false, title: 'Panel' }] };
    const fits = `:::callout{type="panel"}\n:::columns{count=2}\n${items(6)}\n:::\n:::`;
    const a = build(fits, config);
    const b = build(fits, { ...config, layout: { layoutType: 'single', flowColumns: false } });
    expect(JSON.stringify(a.pages)).toBe(JSON.stringify(b.pages));
    const tall = `:::callout{type="panel"}\nOpening line of the box.\n\n:::columns{count=2}\n${items(40)}\n:::\n:::`;
    const cut = build(tall, config);
    const whole = build(tall, { ...config, layout: { layoutType: 'single', flowColumns: false } });
    // Today: the box goes on over several pages, each fragment within its
    // column.
    expect(frames(cut).length).toBeGreaterThan(1);
    for (const { page: pi, block } of frames(cut)) {
      const col = cut.pages[pi]!.columns[0]!;
      expect(block.bbox.y + block.bbox.height).toBeLessThanOrEqual(col.bbox.y + col.bbox.height + 0.5);
    }
    // 1.24: no cut inside the group, so the box is set whole, running past
    // the page.
    expect(frames(whole)).toHaveLength(1);
    expect(whole.warnings?.some((w) => w.kind === 'calloutOverflow')).toBe(true);
  });

  it('builds twice to the same pages, balancing on', () => {
    const config: PostextConfig = { ...page('double'), headings: { balancing: { enabled: true }, levels: [{ level: 1, breakBefore: { enabled: false } }] } };
    const md = `# Title\n\n${items(3, 100)}\n\n:::columns{count=2}\n${items(30)}\n:::\n\n${items(5, 200)}`;
    expect(JSON.stringify(build(md, config).pages)).toBe(JSON.stringify(build(md, config).pages));
  });

  it('reports sub-columns narrower than six ems, and an unknown flow', () => {
    const doc = build(`:::columns{count=6 flow=zigzag}\n${items(6)}\n:::`, { ...page('single'), page: { width: pt(200), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } } });
    const kinds = (doc.contentWarnings ?? []).map((w) => w.kind);
    expect(kinds).toContain('columnsTooNarrow');
    expect(kinds).toContain('columnsFlowUnknown');
  });
});

describe(':::columns marginTop and marginBottom (#714)', () => {
  // 72 dpi (1 pt = 1 px), 13 pt lines from y = 20, a line of space between
  // paragraphs. A one-line group after a one-line paragraph stands at 46.
  const cfg = (layoutType: 'single' | 'double', paragraphSpacing = true): PostextConfig => ({
    page: { dpi: 72, width: pt(400), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    layout: { layoutType, gutterWidth: pt(12) },
    bodyText: { fontSize: pt(10), lineHeight: pt(13), paragraphSpacing, firstLineIndent: pt(0) },
    headings: { balancing: { enabled: false } },
    calloutStyles: [
      // A frameless box: no padding, no margins.
      { id: 'plain', title: '', padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) }, border: { enabled: false }, backgroundEnabled: false, stripe: { enabled: false }, icon: { kind: 'none' }, marginTop: pt(0), marginBottom: pt(0) },
      // The same with the default margins of a box.
      { id: 'grid', title: '', span: 'page', padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) }, border: { enabled: false }, backgroundEnabled: false, stripe: { enabled: false }, icon: { kind: 'none' } },
    ],
    header: { elements: [] },
    footer: { elements: [] },
  } as PostextConfig);
  const group = (attrs: string, n = 2): string =>
    `Intro paragraph.\n\n:::columns{count=2${attrs}}\n${Array.from({ length: n }, (_, i) => `G${i} one.`).join('\n\n')}\n:::\n\nAfter the group.`;
  const yOf = (doc: VDTDocument, text: string): number => textBlocks(doc).find((t) => startsWith(t.block, text))!.block.bbox.y;
  /** Where every block and line stands (the fences differ in length, so
   *  the source offsets do). */
  const shape = (cols: VDTDocument['pages'][number]['columns']): string =>
    JSON.stringify(cols.map((c) => [c.bbox, c.blocks.map((b) => [b.type, b.bbox, b.lines.map((l) => [l.text, l.bbox])])]));
  const shapeOf = (doc: VDTDocument): string => doc.pages.map((p) => shape(p.columns)).join('\n');
  const at = (attrs: string, layoutType: 'single' | 'double' = 'single', spacing = true) => {
    const doc = build(group(attrs), cfg(layoutType, spacing));
    return { group: yOf(doc, 'G0'), after: yOf(doc, 'After') };
  };

  it('marginBottom sets the space under a group in the text, a minimum on the grid', () => {
    // Without it: the body's paragraph spacing, a line.
    expect(at('')).toEqual({ group: 46, after: 72 });
    expect(at(' marginBottom="0"')).toEqual({ group: 46, after: 59 });
    // Less than a line is rounded up by the snap; two lines are two lines.
    expect(at(' marginBottom="0.75em"')).toEqual({ group: 46, after: 72 });
    expect(at(' marginBottom="26pt"')).toEqual({ group: 46, after: 85 });
    // With no paragraph spacing the text followed the group with no space.
    expect(at('', 'single', false)).toEqual({ group: 33, after: 46 });
    expect(at(' marginBottom="13pt"', 'single', false)).toEqual({ group: 33, after: 59 });
  });

  it('holds for a group across a two-column page', () => {
    expect(at(' span="page"', 'double')).toEqual({ group: 46, after: 72 });
    expect(at(' span="page" marginBottom="0"', 'double')).toEqual({ group: 46, after: 59 });
    expect(at(' span="page" marginBottom="26pt"', 'double')).toEqual({ group: 46, after: 85 });
    expect(at(' span="page" marginTop="26pt"', 'double')).toEqual({ group: 59, after: 85 });
    // 0.75 em under the group is what a frameless box round it leaves.
    const boxed = build(`Intro paragraph.\n\n:::callout{type="grid"}\n:::columns{count=2}\nG0 one.\n\nG1 one.\n:::\n:::\n\nAfter the group.`, cfg('double'));
    expect(at(' span="page" marginBottom="0.75em"', 'double').after).toBe(yOf(boxed, 'After'));
  });

  it('marginTop merges with the space pending above the group, and gives way at a column head', () => {
    expect(at(' marginTop="6pt"')).toEqual({ group: 46, after: 72 });
    expect(at(' marginTop="26pt"')).toEqual({ group: 59, after: 85 });
    const head = (attrs: string) => yOf(build(`:::columns{count=2${attrs}}\nG0 one.\n\nG1 one.\n:::\n\nAfter.`, cfg('single')), 'G0');
    expect(head(' marginTop="26pt"')).toBe(head(''));
    expect(head('')).toBe(20);
  });

  it('works on a group inside a box', () => {
    const box = (attrs: string) => {
      const doc = build(`:::callout{type="plain"}\nIntro.\n\n:::columns{count=2${attrs}}\nG0 one.\n\nG1 one.\n:::\n\nAfter.\n:::\n\nUnder the box.`, cfg('single'));
      return { group: yOf(doc, 'G0'), after: yOf(doc, 'After'), box: frames(doc)[0]!.block.bbox.height };
    };
    // Without them: the space pending above (a line), none under.
    expect(box('')).toEqual({ group: 46, after: 59, box: 52 });
    expect(box(' marginTop="20pt" marginBottom="9pt"')).toEqual({ group: 53, after: 75, box: 68 });
    // A top margin smaller than the space pending changes nothing above.
    expect(box(' marginTop="5pt" marginBottom="30pt"')).toEqual({ group: 46, after: 89, box: 82 });
    // The box's only child: no space above, and its bottom margin is
    // dropped at the box's foot.
    const alone = (attrs: string) => shapeOf(build(`:::callout{type="plain"}\n:::columns{count=2${attrs}}\nG0 one.\n\nG1 one.\n:::\n:::\n\nUnder the box.`, cfg('single')));
    expect(alone(' marginTop="20pt" marginBottom="9pt"')).toBe(alone(''));
  });

  it('a group that splits keeps its cuts, and its last part takes the space under', () => {
    const split = (attrs: string) => build(group(attrs, 60), cfg('single'));
    const plain = split('');
    const none = split(' marginBottom="0"');
    expect(none.pages).toHaveLength(plain.pages.length);
    const last = plain.pages.length - 1;
    for (let p = 0; p < last; p++) expect(shape(none.pages[p]!.columns)).toBe(shape(plain.pages[p]!.columns));
    expect(yOf(plain, 'After')).toBe(46);
    expect(yOf(none, 'After')).toBe(33);
    // A top margin moves the first part only: the parts that go on open
    // their pages at the head.
    const top = split(' marginTop="39pt"');
    expect(yOf(top, 'G0')).toBe(72);
    for (const page of top.pages.slice(1)) expect(page.columns[0]!.blocks[0]!.bbox.y).toBe(20);
  });

  it('ignores a value that does not parse and a negative one', () => {
    const plain = shapeOf(build(group(''), cfg('single')));
    for (const attrs of [' marginBottom="wide"', ' marginBottom="-6pt"', ' marginTop="-1em"', ' marginTop=""']) {
      expect(shapeOf(build(group(attrs), cfg('single'))), attrs).toBe(plain);
    }
    // And the two that parse do move it.
    expect(shapeOf(build(group(' marginBottom="0"'), cfg('single')))).not.toBe(plain);
  });
});

describe('wrapFlowColumns', () => {
  it('boxes a group outside a box and leaves one inside a box alone', () => {
    const blocks = parseMarkdown(':::columns{count=2 span="page"}\nA.\n:::\n\n:::callout\n:::columns{count=2}\nB.\n:::\n:::');
    const out = wrapFlowColumns(blocks);
    expect(out.wrapped).toBe(true);
    const boxes = out.blocks.filter((b) => b.type === 'containerStart' && b.containerName === 'callout');
    expect(boxes.map((b) => b.containerAttrs?.type)).toEqual([FLOW_COLUMNS_PAGE_STYLE_ID, undefined]);
    expect(wrapFlowColumns(parseMarkdown('No groups.')).wrapped).toBe(false);
  });

  it('hands the fence\'s margins to the group\'s box, and nothing else (#714)', () => {
    const boxOf = (md: string) => wrapFlowColumns(parseMarkdown(md)).blocks.find((b) => b.type === 'containerStart' && b.containerName === 'callout')!.containerAttrs;
    expect(boxOf(':::columns{count=3 gap="2em" marginTop="1em" marginBottom="0"}\nA.\n:::')).toEqual({ type: FLOW_COLUMNS_STYLE_ID, span: 'column', placement: 'here', marginTop: '1em', marginBottom: '0' });
    expect(boxOf(':::columns{count=3 gap="2em"}\nA.\n:::')).toEqual({ type: FLOW_COLUMNS_STYLE_ID, span: 'column', placement: 'here' });
  });
});

describe('galley fill', () => {
  const galley = (heights: number[], lines?: number): GalleyItem[] => {
    let y = 0;
    return heights.map((h, i) => {
      const it: GalleyItem = { child: i, lineBase: 0, y, height: h, ...(lines ? { lineBottoms: Array.from({ length: h / lines }, (_, l) => (l + 1) * lines) } : {}) };
      y += h;
      return it;
    });
  };

  it('fills the columns in turn and stops where the next item does not fit', () => {
    const g = galley([30, 30, 30, 30, 30, 30]);
    const b = galleyBreaks(g, 2);
    const f = fillGalley(g, b, 2, 70);
    expect(f.end).toBe(false);
    expect(f.cuts.map((j) => b[j]!.item)).toEqual([2, 4]);
    expect(f.used).toBe(60);
    expect(fillGalley(g, b, 3, 60).end).toBe(true);
  });

  it('cuts inside a text item, never leaving fewer than the minimum lines', () => {
    const g = galley([100], 10);
    const b = galleyBreaks(g, 3);
    expect(b.map((x) => x.line)).toEqual([3, 4, 5, 6, 7]);
    const f = fillGalley(g, b, 2, 25);
    expect(f.end).toBe(false);
    expect(f.cuts).toHaveLength(0);
  });

  it('finds the lowest height that holds the galley', () => {
    const g = galley([30, 30, 30, 30], 10);
    const b = galleyBreaks(g, 1);
    expect(minFillHeight(g, b, 2)).toBeCloseTo(60, 1);
    expect(minFillHeight(g, b, 3)).toBeCloseTo(40, 1);
  });

  it('offers no cut right after an item that keeps with the next (a heading, #1019)', () => {
    const g = galley([40, 20, 40]);
    g[1]!.keepWithNext = true;
    const b = galleyBreaks(g, 1);
    expect(b.map((x) => x.item)).toEqual([1]);
    // The balanced fill takes the heading on with its text.
    expect(fillGalley(g, b, 2, minFillHeight(g, b, 2)).cuts.map((j) => b[j]!.item)).toEqual([1]);
  });
});
