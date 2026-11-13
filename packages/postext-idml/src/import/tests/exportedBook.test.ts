// A Postext book exported to IDML and read back (#1555): what the export
// writes as styles, boxes and stops comes back as the book had it, and
// what the page items need is reported for what it is.

import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { idmlDocument } from '../../export/index.js';
import { build, config, LOREM, mm } from '../../testing/kit.test-helper.js';
import { crossesSpine, emptyBoxFence, exactCover, paintOrder } from '../fidelity/pageItems.js';
import { idmlToPostext } from '../index.js';
import { renderSegs } from '../marks.js';
import { frameXml, mini, spreadXml, storyXml } from '../../read/fixture.test-helper.js';
import { readIdml } from '../../read/index.js';
import { plain } from './kit.test-helper.js';
import type { IdmlPage } from '../../model/document.js';
import type { GraphicCrop } from '../../resolve/geometry.js';

const roundTrip = (md: string, cfg: PostextConfig, layout: 'pages' | 'flow' = 'pages') => idmlToPostext(idmlDocument({ docs: [build(md, cfg)], text: 'frames' }).bytes, { layout });
const ids = (r: ReturnType<typeof roundTrip>) => r.report.findings.map((f) => f.id);
const markdown = (r: ReturnType<typeof roundTrip>) => r.chapters.map((c) => c.markdown).join('\n');
const value = (d: unknown) => (d as { value: number }).value;

describe('a character style', () => {
  it('comes back as one of the book’s, its words in a `:span`', () => {
    const cfg = config({ characterStyles: [{ id: 'key', fontFamily: 'Georgia', fontSize: { value: 14, unit: 'pt' } }] } as unknown as Partial<PostextConfig>);
    const r = roundTrip(`${LOREM}\n\nA key :span[Alfama]{style="key"} to the walks.`, cfg);
    expect(ids(r)).not.toContain('inlineFontFamily');
    expect(ids(r)).not.toContain('inlineFontSize');
    const styles = r.config.characterStyles ?? [];
    expect(styles).toHaveLength(1);
    expect(styles[0]!.fontFamily).toBe('Georgia');
    expect(value(styles[0]!.fontSize)).toBeCloseTo(14, 2);
    expect(markdown(r)).toContain(`:span[Alfama]{style="${styles[0]!.id}"}`);
  });

  it('keeps the fixed spaces it opens a paragraph with, held on the line', () => {
    const md = renderSegs([{ t: '  1 ', span: 'k' }, { t: ' Alfama' }]);
    expect(md).toBe(':span[⁠  1 ]{style="k"} Alfama');
    // Mid-line its fixed spaces stay inside too, with no joiner.
    expect(renderSegs([{ t: 'See ' }, { t: ' 2', span: 'k' }])).toBe('See :span[ 2]{style="k"}');
  });
});

describe('the paragraphs of an exported book', () => {
  it('come back in their styles with nothing formatted by hand', () => {
    const r = roundTrip(`# A chapter\n\n${LOREM}\n\n${LOREM}\n\n- one\n- two\n\n${LOREM}`, config(), 'flow');
    expect(ids(r)).not.toContain('localOverrides');
  });

  it('set bold and italic words in their paragraph’s colour', () => {
    const cfg = config({ paragraphStyles: [{ id: 'onward', color: { hex: '#a1432b', model: 'hex' } }] } as unknown as Partial<PostextConfig>);
    const r = roundTrip(`${LOREM} *An italic word.*\n\n:::paragraphs{style="onward"}\n**Walk 2.** It starts at the river.\n:::`, cfg, 'flow');
    const body = r.config.bodyText!;
    expect(body.italicColor).toEqual(body.color);
    expect(body.boldColor).toEqual(body.color);
    const onward = (r.config.paragraphStyles ?? []).find((s) => (s.color as { hex: string }).hex === '#a1432b');
    expect(onward).toBeDefined();
    expect(onward!.boldColor).toEqual(onward!.color);
  });

  it('keep a key set at tab stops as a paragraph with its stops, measured past its indent', () => {
    const cfg = config({
      paragraphStyles: [{ id: 'coverkey', fontSize: { value: 16, unit: 'pt' }, lineHeight: { value: 18, unit: 'pt' }, indent: mm(3), tabStops: [{ position: mm(30) }, { position: mm(60) }] }],
    } as unknown as Partial<PostextConfig>);
    const r = roundTrip(`${LOREM}\n\n${LOREM}\n\n:::paragraphs{style="coverkey"}\nAlfama\tBaixa\tBelém\n:::`, cfg, 'flow');
    expect(ids(r)).not.toContain('tabOutsideBody');
    const key = (r.config.paragraphStyles ?? []).find((s) => s.tabStops?.length);
    expect(key).toBeDefined();
    expect(value(key!.indent)).toBeCloseTo((3 * 72) / 25.4, 1);
    expect(key!.tabStops!.map((t) => value(t.position))).toEqual([expect.closeTo((30 * 72) / 25.4, 1), expect.closeTo((60 * 72) / 25.4, 1)]);
    expect(markdown(r)).toMatch(/Alfama ?:tab ?Baixa ?:tab ?Belém/);
    expect(r.config.headings?.levels ?? []).toEqual([]);
  });
});

describe('a box that holds no text', () => {
  const top = (x: number, y: number) => ({ anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(x), y: mm(y) } });
  const plaque = { id: 'plaque', border: { enabled: true, width: { value: 1, unit: 'pt' }, color: { hex: '#1f4e9c', model: 'hex' } }, backgroundEnabled: true, background: { hex: '#fffdf8', model: 'hex' } };
  const bare = (id: string) => ({ id, border: { enabled: false }, backgroundEnabled: false });
  const cover = (frames: Record<string, unknown>[]) =>
    config({ calloutStyles: [plaque, bare('title'), bare('band')], pageTemplates: [{ id: 'cover', area: 'trim', header: false, footer: false, frames }] } as unknown as Partial<PostextConfig>);
  const PLAQUE = { name: 'plaque', style: 'plaque', placement: top(10, 40), width: mm(100), height: mm(50) };
  const TITLE = { name: 'title', style: 'title', placement: top(20, 50), width: mm(80), height: mm(20) };

  it('over another frame comes back as an empty frame in its style, so the plaque is drawn', () => {
    // A band of text under the plaque, as a cover's picture is.
    const BAND = { name: 'band', style: 'band', placement: top(0, 30), width: mm(140), height: mm(30) };
    const md = `::::page{template="cover"}\n:::frame{slot="band"}\n${LOREM.slice(0, 200)}\n:::\n\n:::frame{slot="plaque"}\n:::\n\n:::frame{slot="title"}\nLisbon on Foot\n:::\n::::\n`;
    const r = roundTrip(md, cover([BAND, PLAQUE, TITLE]));
    expect(markdown(r)).toMatch(/:::frame\{slot="[^"]+"\}\n:::/);
    const boxed = (r.config.calloutStyles ?? []).find((s) => s.backgroundEnabled);
    expect(boxed).toBeDefined();
    expect(boxed!.border?.enabled).toBe(true);
  });

  it('over nothing comes back as page decoration with its fill and stroke', () => {
    const r = roundTrip('::::page{template="cover"}\n:::frame{slot="plaque"}\n:::\n\n:::frame{slot="title"}\nLisbon on Foot\n:::\n::::\n', cover([PLAQUE, TITLE]));
    const boxes = (r.config.pageTemplates ?? []).flatMap((t) => t.decoration?.elements ?? []).filter((e) => 'kind' in e && e.kind === 'box');
    expect(boxes).toHaveLength(1);
    const style = (boxes[0] as { style: { backgroundColor: { hex: string }; borderColor: { hex: string } } }).style;
    expect(style.backgroundColor.hex).toBe('#fffdf8');
    expect(style.borderColor.hex).toBe('#1f4e9c');
  });
});

describe('page items', () => {
  const page = (side: IdmlPage['side']) => ({ side }) as IdmlPage;
  const box = (left: number, right: number) => ({ left, right, top: 0, bottom: 10 });

  it('cross the spine only past the binding edge of a spread of two pages', () => {
    // A thumb tab in the bleed past a right page's outer edge.
    expect(crossesSpine(page('right'), box(90, 106), 100, 2)).toBe(false);
    expect(crossesSpine(page('right'), box(-20, 30), 100, 2)).toBe(true);
    expect(crossesSpine(page('left'), box(-6, 10), 100, 2)).toBe(false);
    expect(crossesSpine(page('left'), box(80, 120), 100, 2)).toBe(true);
    expect(crossesSpine(page('right'), box(-20, 30), 100, 1)).toBe(false);
  });

  it('take a crop that fills its frame one way and is scaled evenly for a cover fit', () => {
    const crop = (o: Partial<GraphicCrop>) => ({ x: 0.06, y: 0, width: 0.94, height: 1, scaleX: 0.5, scaleY: 0.5, flipped: false, rotation: 0, ...o }) as GraphicCrop;
    expect(exactCover(crop({}))).toBe(true);
    expect(exactCover(crop({ height: 0.8 }))).toBe(false);
    expect(exactCover(crop({ scaleY: 0.6 }))).toBe(false);
    expect(exactCover(crop({ flipped: true }))).toBe(false);
  });

  it('write an empty fence only for a box slot with a style', () => {
    expect(emptyBoxFence('box', 'b1', 'plaque')).toBe(':::frame{slot="b1"}\n:::');
    expect(emptyBoxFence('box', 'b1', undefined)).toBeUndefined();
    expect(emptyBoxFence('text', 't1', 'plaque')).toBeUndefined();
  });

  it('paint in their stacking order, under the master’s', () => {
    const order = paintOrder([{ id: 'm1' }, { id: 's11' }, { id: 's11-edge' }, { id: 'm2' }, { id: 's10' }, { id: 's3' }]);
    expect(order.map((e) => e.id)).toEqual(['m1', 'm2', 's3', 's10', 's11', 's11-edge']);
  });
});

describe('a page with margins of its own', () => {
  // Three pages of body text side by side, the third with wider margins.
  const bytes = (): Uint8Array => {
    const story = (self: string) => storyXml(self, plain(LOREM));
    const items = [0, 1, 2].map((n) => frameXml(`f${n}`, `s${n}`, [n * 612 + 36, 36, n * 612 + 576, 756])).join('');
    const spread = spreadXml('us', items, 3).replace(/(<Page Self="usp2"[^>]*><MarginPreference) Top="36" Bottom="36" Left="36" Right="36"/, '$1 Top="72" Bottom="72" Left="72" Right="72"');
    return mini({ stories: { s0: story('s0'), s1: story('s1'), s2: story('s2') }, files: { 'Spreads/Spread_us.xml': spread } });
  };

  it('keeps its frames where they stand in composed pages, and says so', () => {
    const r = idmlToPostext(readIdml(bytes()), { layout: 'pages' });
    expect(r.report.findings.find((f) => f.id === 'mixedMarginsComposed')).toMatchObject({ severity: 'info', examples: ['3'] });
    expect(ids(r)).not.toContain('mixedMargins');
  });

  it('takes the common margins in a flowing book, which is a warning', () => {
    const r = idmlToPostext(readIdml(bytes()), { layout: 'flow' });
    expect(r.report.findings.find((f) => f.id === 'mixedMargins')).toMatchObject({ severity: 'warning', examples: ['3'] });
  });
});
