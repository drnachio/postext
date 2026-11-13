// The styles of the export (#1555): runs in a named or another look take a
// character style, paragraphs alike share one paragraph style and set
// nothing of their own, a design's centred text is centred, and an SVG is
// placed at its size in pt.

import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { PostextConfig, Resource } from 'postext';
import { build, config, mm, LOREM } from '../testing/kit.test-helper.js';
import { descendants, parseXml, str as attr } from '../xml/read.js';
import { idmlDocument } from './index.js';
import { alignedItem } from './paragraphs.js';
import type { TextItem } from './writer.js';

type Files = Record<string, Uint8Array>;
const unzip = (md: string, cfg: PostextConfig, resources?: Resource[], bytes?: Record<string, Uint8Array>): Files =>
  unzipSync(idmlDocument({ docs: [build(md, cfg, resources)], ...(bytes ? { resourceBytes: (id: string) => bytes[id] } : {}) }).bytes);
const text = (f: Files, path: string) => strFromU8(f[path]!);
const stories = (f: Files) => Object.keys(f).filter((p) => p.startsWith('Stories/')).map((p) => text(f, p));

describe('character styles', () => {
  const cfg = config({
    characterStyles: [{ id: 'key', fontFamily: 'Georgia', fontSize: { value: 14, unit: 'pt' } }],
  } as unknown as Partial<PostextConfig>);

  it('writes a `:span` style as a character style its runs apply', () => {
    const f = unzip('A key :span[Alfama]{style="key"} to the walks.', cfg);
    const styles = text(f, 'Resources/Styles.xml');
    const cs = descendants(parseXml(styles), 'CharacterStyle').find((s) => attr(s, 'Name') === 'key');
    expect(cs).toBeDefined();
    expect(attr(cs!, 'PointSize')).toBe('14');
    const ranges = stories(f).flatMap((s) => descendants(parseXml(s), 'CharacterStyleRange'));
    const keyed = ranges.filter((r) => attr(r, 'AppliedCharacterStyle') === attr(cs!, 'Self'));
    expect(keyed.map((r) => descendants(r, 'Content').map((c) => c.children.join('')).join(''))).toEqual(['Alfama']);
    // The run sets nothing over its character style.
    expect(attr(keyed[0]!, 'PointSize')).toBeUndefined();
    // The words around it are in no character style.
    expect(ranges.filter((r) => attr(r, 'AppliedCharacterStyle') !== attr(cs!, 'Self')).every((r) => attr(r, 'AppliedCharacterStyle') === 'CharacterStyle/$ID/[No character style]')).toBe(true);
  });
});

describe('paragraph styles', () => {
  it('gives paragraphs alike one style and nothing of their own', () => {
    const md = `# A chapter\n\n${LOREM}\n\n${LOREM.slice(0, 120)}\n\n- one\n- two\n\n${LOREM}`;
    const f = unzip(md, config());
    const paras = stories(f).flatMap((s) => descendants(parseXml(s), 'ParagraphStyleRange'));
    expect(paras.length).toBeGreaterThan(4);
    for (const p of paras) for (const a of ['LeftIndent', 'FirstLineIndent', 'RightIndent', 'SpaceAfter', 'Justification', 'PointSize', 'AppliedFont']) expect(attr(p, a), `${attr(p, 'AppliedParagraphStyle')} ${a}`).toBeUndefined();
  });

  it('names a paragraph set in a paragraph style after it, apart from the body', () => {
    const cfg = config({ paragraphStyles: [{ id: 'note', fontSize: { value: 8, unit: 'pt' } }] } as unknown as Partial<PostextConfig>);
    const f = unzip(`${LOREM}\n\n:::paragraphs{style="note"}\nA note.\n:::`, cfg);
    const applied = stories(f).flatMap((s) => descendants(parseXml(s), 'ParagraphStyleRange').map((p) => attr(p, 'AppliedParagraphStyle')));
    expect(applied).toContain('ParagraphStyle/note');
    expect(applied).toContain('ParagraphStyle/Body');
  });
});

describe('the lines of a design’s text', () => {
  const line = (x: number, width: number) => ({ x, y: 0, width, lineHeight: 12, baseline: 10, align: 'left', runs: [] });
  const item = (role: string, lines: ReturnType<typeof line>[]) => ({ kind: 'text', role, bbox: { x: 0, y: 0, width: 100, height: 12 * lines.length }, lines }) as unknown as TextItem;

  it('are centred when each leaves the same room on both sides', () => {
    const out = alignedItem(item('heading', [line(30, 40), line(20, 60)]));
    expect(out.lines.map((l) => [l.align, l.x, l.width])).toEqual([['center', 0, 100], ['center', 0, 100]]);
  });

  it('are set right when each leaves no room at the right', () => {
    expect(alignedItem(item('heading', [line(60, 40), line(40, 60)])).lines.every((l) => l.align === 'right')).toBe(true);
  });

  it('are left as they stand when they disagree, or when they carry their measure', () => {
    const mixed = item('heading', [line(30, 40), line(0, 60)]);
    expect(alignedItem(mixed)).toBe(mixed);
    const body = item('body', [line(30, 40)]);
    expect(alignedItem(body)).toBe(body);
  });
});

describe('an SVG picture', () => {
  it('is placed at its size in pt (its px at 72/96)', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="48" viewBox="0 0 96 48"><rect width="96" height="48"/></svg>');
    const resources = [{ id: 'map', typeId: 'figure', kind: 'svg', svg: { fileId: 'f-map', width: 96, height: 48 }, createdAt: 0, updatedAt: 0 }] as unknown as Resource[];
    const cfg = config({ page: { dpi: 72, width: mm(140), height: mm(200), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } } } as unknown as Partial<PostextConfig>);
    const f = unzip('Text.\n\n::resource{id="map"}\n\nText.', cfg, resources, { 'f-map': svg });
    const spreads = Object.keys(f).filter((p) => p.startsWith('Spreads/')).map((p) => text(f, p)).join('');
    const bounds = /<Image [^>]*><Properties>(?:<Contents>[^]*?<\/Contents>)?<GraphicBounds Left="0" Top="0" Right="([\d.]+)" Bottom="([\d.]+)"/.exec(spreads);
    expect(bounds).not.toBeNull();
    expect(Number(bounds![1])).toBeCloseTo(72, 2);
    expect(Number(bounds![2])).toBeCloseTo(36, 2);
  });
});
