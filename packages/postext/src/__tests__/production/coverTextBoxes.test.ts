import { describe, it, expect } from 'vitest';
import { buildCover, coverPage, resolveCoverTextBoxes, resolveBindingMeasures, softcoverSheet, type BuiltCover } from '../../production/index.js';
import { buildDocument } from '../../pipeline/index.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import type { CoverTextFrame, PostextConfig } from '../../types.js';

// A cover's text boxes as composed-page frames (#1679): anchored to a zone
// or another box, continued in another box, grown and shrunk.

(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext() {
    return { font: '', measureText: (t: string) => ({ width: t.length * 7 }) };
  }
};

const trim = { width: 150, height: 230 };
const m = resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, trim);
const sheet = softcoverSheet(trim, 20, m, true);
const front = sheet.zones.find((z) => z.name === 'front')!;
// The layout's px: 300 dpi.
const PX_PER_MM = 300 / 25.4;

const LONG = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');

function laidOut(textBoxes: CoverTextFrame[], markdown: string, extra: Partial<PostextConfig> = {}) {
  const config = {
    page: { sizePreset: 'custom', width: { value: 150, unit: 'mm' }, height: { value: 230, unit: 'mm' } },
    production: { versions: [{ id: 'pb', name: 'P', binding: 'perfect' }] },
    cover: { textBoxes },
    ...extra,
  } as PostextConfig;
  const built = buildCover({ config, version: 'pb', pages: 200, markdown }) as BuiltCover;
  const page = buildDocument(built.content, built.config).pages[0]!;
  const frame = (name: string) => page.composed!.frames.find((f) => f.name === name)!;
  return { built, page, frame };
}

describe('where a text box stands', () => {
  it('stands on the point of a zone it is anchored to, moved by its offset', () => {
    const { rects, issues } = resolveCoverTextBoxes(sheet, [
      { name: 'foot', rect: { x: 0, y: 0, width: 40, height: 10 }, anchor: { to: 'front', edge: 'bottom', y: -5 } },
      { name: 'under', rect: { x: 0, y: 0, width: 20, height: 8 }, anchor: { to: 'foot', edge: 'above', x: 2 } },
    ]);
    expect(issues).toEqual([]);
    const foot = rects.get('foot')!;
    expect(foot.x + foot.width / 2).toBeCloseTo(front.safe.x + front.safe.width / 2, 6);
    expect(foot.y + foot.height).toBeCloseTo(front.safe.y + front.safe.height - 5, 6);
    const under = rects.get('under')!;
    expect(under.x).toBeCloseTo(foot.x + 2, 6);
    expect(under.y + under.height).toBeCloseTo(foot.y, 6);
  });

  it('keeps its rect when the anchor names nothing, itself, a loop or a point a zone has not', () => {
    const r = { x: 5, y: 6, width: 10, height: 10 };
    const { rects, issues, next } = resolveCoverTextBoxes(sheet, [
      { name: 'a', rect: r, anchor: { to: 'b', edge: 'below' }, next: 'a' },
      { name: 'b', rect: r, anchor: { to: 'a', edge: 'below' }, next: 'c' },
      { name: 'c', rect: r, anchor: { to: 'front', edge: 'below' }, next: 'b' },
      { name: 'd', rect: r, anchor: { to: 'nowhere', edge: 'top' } },
    ]);
    expect(issues.filter((i) => i.kind === 'coverTextBoxAnchor').map((i) => i.name).sort()).toEqual(['b', 'c', 'd']);
    expect(rects.get('c')).toEqual(r);
    // `b` closes the loop and stands on its rect, `a` hangs under it.
    expect(rects.get('a')!.y).toBeCloseTo(16, 6);
    expect(issues.filter((i) => i.kind === 'coverTextBoxNext').map((i) => i.name)).toEqual(['a', 'c']);
    expect([...next]).toEqual([['b', 'c']]);
  });

  it('writes the anchors as frame anchors, mirrored on a right-to-left sheet', () => {
    const boxes: CoverTextFrame[] = [
      { name: 'title', rect: { x: 0, y: 0, width: 60, height: 20 }, anchor: { to: 'front', edge: 'top-left', x: 4 } },
      { name: 'sub', rect: { x: 0, y: 0, width: 60, height: 10 }, anchor: { to: 'title', edge: 'below', y: 2 }, maxHeight: 30, fit: { minScale: 0.8 }, next: 'more' },
      { name: 'more', rect: { x: 0, y: 0, width: 60, height: 10 } },
    ];
    const ltr = coverPage(sheet, { cover: { textBoxes: boxes } }).template.frames!;
    const sub = ltr.find((f) => f.name === 'sub')!;
    expect(sub.placement!.anchor).toEqual({ to: '#title', edge: 'below' });
    expect(sub).toMatchObject({ maxHeight: { value: 30, unit: 'mm' }, fit: { minScale: 0.8 }, next: 'more' });
    const title = ltr.find((f) => f.name === 'title')!;
    expect(title.placement!.anchor).toEqual({ to: 'container', edge: 'top-left' });
    expect((title.placement!.offset!.x as { value: number }).value).toBeCloseTo(front.safe.x - sheet.trim.x + 4, 3);
    const rtl = coverPage(sheet, { cover: { textBoxes: boxes }, mirrored: true }).template.frames!;
    expect(rtl.find((f) => f.name === 'sub')!.placement!.anchor.edge).toBe('below');
    expect(rtl.find((f) => f.name === 'title')!.placement).toMatchObject({ anchor: { edge: 'top-right' }, offset: { x: { value: -(front.safe.x - sheet.trim.x + 4) } } });
  });
});

describe('a text box laid out', () => {
  it('grows with its text up to its maxHeight and takes the box hung under it down', () => {
    const boxes = (maxHeight?: number): CoverTextFrame[] => [
      { name: 'blurb', rect: { x: 0, y: 0, width: 60, height: 10 }, anchor: { to: 'front', edge: 'top' }, fit: { shrinkText: false }, ...(maxHeight ? { maxHeight } : {}) },
      { name: 'sign', rect: { x: 0, y: 0, width: 60, height: 8 }, anchor: { to: 'blurb', edge: 'below', y: 3 } },
    ];
    const md = `:::frame{slot="blurb"}\n${LONG}\n:::\n\n:::frame{slot="sign"}\nA. N.\n:::`;
    const fixed = laidOut(boxes(), md);
    const grown = laidOut(boxes(120), md);
    expect(fixed.frame('blurb').rect.height).toBeCloseTo(10 * PX_PER_MM, 0);
    expect(fixed.frame('blurb').overflowPx).toBeGreaterThan(0);
    const h = grown.frame('blurb').rect.height;
    expect(h).toBeGreaterThan(10 * PX_PER_MM + 1);
    expect(h).toBeLessThanOrEqual(120 * PX_PER_MM + 0.5);
    expect(grown.frame('blurb').overflowPx).toBe(0);
    // The box hung under it moved down with it.
    const sign = grown.frame('sign').rect;
    expect(sign.y).toBeCloseTo(grown.frame('blurb').rect.y + h + 3 * PX_PER_MM, 0);
  });

  it('continues its text in the box it names, and shrinks it when told', () => {
    const md = `:::frame{slot="one"}\n${LONG}\n:::`;
    const chained = laidOut([
      { name: 'one', rect: { x: 0, y: 0, width: 50, height: 12 }, anchor: { to: 'back', edge: 'top-left' }, next: 'two', fit: { shrinkText: false } },
      { name: 'two', rect: { x: 0, y: 0, width: 50, height: 80 }, anchor: { to: 'front', edge: 'top-left' } },
    ], md);
    expect(chained.frame('one').continuesTo).toBe(chained.frame('two').id);
    const words = (name: string) => chained.frame(name).blockIds.length;
    expect(words('two')).toBeGreaterThan(0);
    expect(chained.frame('one').overflowPx).toBe(0);
    expect(chained.built.issues.filter((i) => i.kind.startsWith('coverTextBox'))).toEqual([]);
    const shrunk = laidOut([{ name: 'one', rect: { x: 0, y: 0, width: 50, height: 25 }, fit: { minScale: 0.5 } }], md);
    expect(shrunk.frame('one').scale).toBeLessThan(1);
  });
});

describe('the config checks of a text box', () => {
  it('names an anchor, a continuation, a height and a scale the cover cannot follow', () => {
    const config = { cover: { textBoxes: [
      { name: 'a', rect: { x: 0, y: 0, width: 10, height: 10 }, anchor: { to: 'front', edge: 'below' }, next: 'a', maxHeight: 5, fit: { minScale: 2 } },
      { name: 'b', rect: { x: 0, y: 0, width: 10, height: 10 }, anchor: { to: 'nowhere', edge: 'top' }, grow: true },
      { name: 'c', rect: { x: 0, y: 0, width: 10, height: 10 }, anchor: { to: 'a', edge: 'below' }, next: 'a', maxHeight: 30, fit: { shrinkText: false } },
    ] } } as unknown as PostextConfig;
    const paths = collectConfigWarnings(config).map((w) => w.path);
    expect(paths).toEqual(expect.arrayContaining([
      'cover.textBoxes[0].anchor.edge', 'cover.textBoxes[0].next', 'cover.textBoxes[0].maxHeight', 'cover.textBoxes[0].fit.minScale',
      'cover.textBoxes[1].anchor.to', 'cover.textBoxes[1].grow',
    ]));
    expect(paths.filter((p) => p.startsWith('cover.textBoxes[2]'))).toEqual([]);
  });
});
