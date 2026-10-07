import { describe, expect, it } from 'vitest';
import type { VDTComicArt, VDTComicBalloon, VDTComicPage, VDTComicPanel, VDTDesignTextBlock } from 'postext';
import { comicArtAt, comicPressAt, type ArtOpacity } from './comicHit';

const art = (resourceId: string, box: VDTComicArt['box']): VDTComicArt => ({
  resourceId,
  kind: 'bitmap',
  fileId: `file-${resourceId}`,
  box,
  source: { x: 0, y: 0, width: 1, height: 1 },
  mirrored: false,
  letterbox: false,
});

const rect = (x: number, y: number, w: number, h: number) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

// Two panels side by side with a 10 px gutter (x 290–300): the first shows
// `street` and a pop-out cut-out `cat` that breaks its right border into
// the gutter and the second panel; the second shows `door`; a third, under
// them, has no picture.
const panel = (index: number, x: number, y: number, w: number, h: number, extra: Partial<VDTComicPanel> = {}): VDTComicPanel => ({
  index,
  sourceStart: index * 10,
  sourceEnd: index * 10 + 9,
  polygon: rect(x, y, w, h),
  bbox: { x, y, width: w, height: h },
  radius: 0,
  border: { width: 1, color: '#000', style: 'solid' },
  ...extra,
});

const words: VDTDesignTextBlock = {
  kind: 'text',
  bbox: { x: 120, y: 120, width: 60, height: 14 },
  fontString: '10px Test',
  color: '#000',
  clip: false,
  lines: [{ text: 'HI ANA', xOffset: 0, baselineY: 130, width: 60 }],
  sourceStart: 100,
  sourceEnd: 112,
  sourceText: 'HI ANA',
  sourceMap: [106, 107, 108, 109, 110, 111],
};

const balloon: VDTComicBalloon = {
  id: '0:0',
  panelIndex: 0,
  order: 0,
  kind: 'balloon',
  style: 'speech',
  sourceStart: 100,
  sourceEnd: 112,
  group: 0,
  text: [words],
  bbox: { x: 110, y: 110, width: 80, height: 34 },
  tailTip: { x: 150, y: 200 },
};

const comic: VDTComicPage = {
  sourceStart: 0,
  sourceEnd: 200,
  frame: { x: 100, y: 100, width: 400, height: 400 },
  direction: 'ltr',
  panels: [
    panel(0, 100, 100, 190, 190, { art: art('street', { x: 100, y: 100, width: 190, height: 190 }), pop: art('cat', { x: 200, y: 150, width: 140, height: 100 }) }),
    panel(1, 300, 100, 200, 190, { art: art('door', { x: 300, y: 100, width: 200, height: 190 }) }),
    panel(2, 100, 300, 400, 200),
  ],
  splitters: [{
    path: [0],
    boundary: 0,
    axis: 'columns',
    a: { x: 295, y: 100 },
    b: { x: 295, y: 290 },
    gutter: 10,
    parent: { x: 100, y: 100, width: 400, height: 190 },
    startPercent: 48.75,
    endPercent: 48.75,
    min: 5,
    max: 95,
    sourceStart: 0,
    sourceEnd: 0,
  }],
  balloons: [balloon],
};

describe('a panel picture under the pointer (#594)', () => {
  it('finds the art of the panel pressed', () => {
    expect(comicArtAt([comic], 150, 260)).toMatchObject({ which: 'art', art: { resourceId: 'street' }, panel: { index: 0 } });
    expect(comicArtAt([comic], 450, 120)).toMatchObject({ which: 'art', art: { resourceId: 'door' } });
  });

  it('finds nothing in a gutter, on a panel with no picture or off the comic', () => {
    expect(comicArtAt([comic], 295, 120)).toBeNull();
    expect(comicArtAt([comic], 200, 400)).toBeNull();
    expect(comicArtAt([comic], 50, 50)).toBeNull();
    expect(comicArtAt([], 150, 260)).toBeNull();
  });

  it('finds the cut-out where it breaks the border, not under a later panel', () => {
    // In the gutter, over the border.
    expect(comicArtAt([comic], 295, 200)).toMatchObject({ which: 'pop', art: { resourceId: 'cat' } });
    // Inside its own panel, the panel's art (nothing tells the cut-out's
    // clear pixels from its ink).
    expect(comicArtAt([comic], 250, 200)).toMatchObject({ which: 'art', art: { resourceId: 'street' } });
    // The second panel is painted over the first panel's cut-out.
    expect(comicArtAt([comic], 320, 200)).toMatchObject({ which: 'art', art: { resourceId: 'door' } });
  });

  it('reads the cut-out by its ink when the picture can be read', () => {
    // Ink in the cut-out's left half only.
    const opaque: ArtOpacity = (a, x) => (a.resourceId === 'cat' ? x < a.box.x + a.box.width / 2 : null);
    expect(comicArtAt([comic], 250, 200, opaque)).toMatchObject({ which: 'pop', art: { resourceId: 'cat' } });
    // Clear in the gutter: nothing there.
    expect(comicArtAt([comic], 295, 200, opaque)).toBeNull();
    // Clear over its own panel: the panel's art.
    expect(comicArtAt([comic], 210, 160, (a) => (a.resourceId === 'cat' ? false : null))).toMatchObject({ which: 'art', art: { resourceId: 'street' } });
  });
});

describe('what a press on a comic does (#594, #595)', () => {
  const opts = { band: 6, tipRadius: 5, text: { measure: () => null } };

  it('selects text on a balloon\'s words, grabs the balloon round them', () => {
    expect(comicPressAt([comic], 122, 128, opts)).toMatchObject({ kind: 'text', offset: 106 });
    expect(comicPressAt([comic], 112, 140, opts)).toMatchObject({ kind: 'balloon', balloon: { id: '0:0' } });
  });

  it('grabs the tail tip and the split line before the pictures', () => {
    expect(comicPressAt([comic], 151, 201, opts)?.kind).toBe('tail');
    expect(comicPressAt([comic], 295, 150, opts)?.kind).toBe('splitter');
  });

  it('opens the panel\'s picture off the balloons and the lines', () => {
    expect(comicPressAt([comic], 150, 260, opts)).toMatchObject({ kind: 'art', art: { resourceId: 'street' } });
    // Never the picture under a balloon.
    expect(comicPressAt([comic], 112, 140, opts)?.kind).not.toBe('art');
    // A cut-out over the gutter, below the split line's band.
    expect(comicPressAt([comic], 320, 240, opts)).toMatchObject({ kind: 'art', art: { resourceId: 'door' } });
  });

  it('leaves a panel with no picture to the panel tools', () => {
    expect(comicPressAt([comic], 200, 400, opts)).toMatchObject({ kind: 'panel', panel: { index: 2 } });
  });
});
