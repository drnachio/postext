import { describe, it, expect, beforeAll } from 'vitest';
import { buildDocument } from '../../pipeline';
import { installStubMeasure } from '../../comics/lettering/__tests__/stubMeasure';
import { comicArtPointToPage, pointInPolygon } from '../../comics';
import type { PostextConfig, Resource } from '../../types';
import type { VDTComicBalloon, VDTComicPage, VDTDocument } from '../../vdt';

// The lettering of comic pages in the build (#559–#561): balloons set from
// each panel's script around the speakers the pictures mark, in four
// languages.

beforeAll(() => installStubMeasure());

const picture = (id: string, width: number, height: number, extra: Partial<Resource> = {}): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `file-${id}`, format: 'png', width, height },
  ...extra,
});

// Two characters facing each other, mouths at a third and two thirds of
// the width, faces marked; a lamp to keep clear.
const resources: Resource[] = [
  picture('room', 1600, 1000, {
    anchors: [
      { id: 'ana', x: 0.3, y: 0.62, head: { x: 0.3, y: 0.52 }, face: { x: 0.24, y: 0.5, width: 0.12, height: 0.18 } },
      { id: 'ben', x: 0.7, y: 0.64, head: { x: 0.7, y: 0.54 }, face: { x: 0.64, y: 0.52, width: 0.12, height: 0.18 } },
    ],
    avoid: [{ x: 0.46, y: 0.3, width: 0.08, height: 0.5 }],
  }),
  picture('door', 1000, 1000, { anchors: [{ id: 'sfx', x: 0.5, y: 0.4 }, { id: 'ben', x: 0.8, y: 0.7 }] }),
];

const scripts: Record<string, { a1: string; b1: string; a2: string; cap: string; sfx: string }> = {
  en: { a1: 'Did you hear that?', b1: 'It is nothing. Go back to sleep.', a2: 'Nothing, he says…', cap: 'Lyon, 1943.', sfx: 'KRAK' },
  es: { a1: '¿Has oído eso?', b1: 'No es nada. Vuelve a dormir.', a2: 'Nada, dice…', cap: 'Lyon, 1943.', sfx: 'CRAC' },
  ja: { a1: '今の聞こえた？', b1: '何でもないよ。もう寝なさい。', a2: '何でもない、だって……', cap: '一九四三年、リヨン。', sfx: 'バキッ' },
  ar: { a1: 'هل سمعت ذلك؟', b1: 'لا شيء. عودي إلى النوم.', a2: 'لا شيء، يقول…', cap: 'ليون، ١٩٤٣.', sfx: 'طاخ' },
};

const markdown = (s: (typeof scripts)['en']) => `:::page{split="60 / *"}
::panel{art=room}
caption: ${s.cap}
ana: ${s.a1}
ben: ${s.b1}
::panel{art=door}
sfx: ${s.sfx}
ben{whisper}: ${s.a2}
:::
`;

const config = (locale: string): PostextConfig => ({ page: { sizePreset: '17x24' }, locale });

function comicOf(doc: VDTDocument): VDTComicPage {
  return doc.pages.find((p) => p.comic)!.comic!;
}

const centre = (b: VDTComicBalloon) => ({ x: b.bbox.x + b.bbox.width / 2, y: b.bbox.y + b.bbox.height / 2 });
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('comic lettering in the build', () => {
  for (const locale of ['en', 'es', 'ja', 'ar']) {
    describe(locale, () => {
      const doc = () => buildDocument({ markdown: markdown(scripts[locale]!), resources }, config(locale));

      it('letters every script line once, in reading order, inside its panel', () => {
        const comic = comicOf(doc());
        expect(comic.balloons.map((b) => [b.panelIndex, b.kind, b.style])).toEqual([
          [0, 'caption', 'caption'],
          [0, 'balloon', 'speech'],
          [0, 'balloon', 'speech'],
          [1, 'sfx', 'sfx'],
          [1, 'balloon', 'whisper'],
        ]);
        for (const b of comic.balloons) {
          const panel = comic.panels[b.panelIndex]!;
          expect(pointInPolygon(panel.polygon, centre(b))).toBe(true);
          expect(b.bbox.x).toBeGreaterThanOrEqual(panel.bbox.x - 1);
          expect(b.bbox.y).toBeGreaterThanOrEqual(panel.bbox.y - 1);
          expect(b.bbox.x + b.bbox.width).toBeLessThanOrEqual(panel.bbox.x + panel.bbox.width + 1);
          expect(b.bbox.y + b.bbox.height).toBeLessThanOrEqual(panel.bbox.y + panel.bbox.height + 1);
          expect(b.text.length).toBeGreaterThan(0);
        }
        // Speech balloons stay off the two faces.
        const room = comic.panels[0]!;
        const faces = resources[0]!.anchors!.map((a) => a.face!).map((f) => ({
          a: comicArtPointToPage(room.art!, f.x, f.y),
          b: comicArtPointToPage(room.art!, f.x + f.width, f.y + f.height),
        }));
        for (const b of comic.balloons.filter((x) => x.panelIndex === 0)) {
          for (const f of faces) {
            const apart = b.bbox.x + b.bbox.width <= Math.min(f.a.x, f.b.x) + 1 || b.bbox.x >= Math.max(f.a.x, f.b.x) - 1
              || b.bbox.y + b.bbox.height <= f.a.y + 1 || b.bbox.y >= f.b.y - 1;
            expect(apart).toBe(true);
          }
        }
      });

      it('points each tail toward its speaker', () => {
        const comic = comicOf(doc());
        const room = comic.panels[0]!;
        for (const b of comic.balloons.filter((x) => x.panelIndex === 0 && x.kind === 'balloon')) {
          const a = resources[0]!.anchors!.find((x) => x.id === b.speaker)!;
          const mouth = comicArtPointToPage(room.art!, a.x, a.y);
          expect(b.tailTip).toBeDefined();
          expect(b.shape).toBeDefined();
          expect(dist(b.tailTip!, mouth)).toBeLessThan(dist(centre(b), mouth));
        }
        // The sound effect: no outline, no tail, a halo.
        const sfx = comic.balloons.find((b) => b.kind === 'sfx')!;
        expect(sfx.shape).toBeUndefined();
        expect(sfx.tailTip).toBeUndefined();
        expect(sfx.halo?.width).toBeGreaterThan(0);
      });

      it('is deterministic', () => {
        expect(JSON.stringify(comicOf(doc()))).toBe(JSON.stringify(comicOf(doc())));
      });
    });
  }

  it('sets Japanese balloons in columns and Arabic ones right to left', () => {
    const ja = comicOf(buildDocument({ markdown: markdown(scripts.ja!), resources }, config('ja')));
    for (const b of ja.balloons) expect(b.text[0]!.vertical).toBeDefined();
    const en = comicOf(buildDocument({ markdown: markdown(scripts.en!), resources }, config('en')));
    for (const b of en.balloons) expect(b.text[0]!.vertical).toBeUndefined();
    const ar = comicOf(buildDocument({ markdown: markdown(scripts.ar!), resources }, config('ar')));
    expect(ar.direction).toBe('rtl');
    for (const b of ar.balloons) expect(b.text[0]!.direction).toBe('rtl');
    // Read from the right: the caption takes the top right corner, and the
    // first speech balloon is not after the second one in reading order
    // (higher, or level and to its right).
    const cap = ar.balloons[0]!;
    const room = ar.panels[0]!;
    // (Butted against the inner edge of the panel's border.)
    expect(cap.bbox.x + cap.bbox.width).toBeGreaterThan(room.bbox.x + room.bbox.width - room.border.width / 2 - 2);
    const [b1, b2] = ar.balloons.filter((b) => b.kind === 'balloon' && b.panelIndex === 0) as [VDTComicBalloon, VDTComicBalloon];
    expect(b1.bbox.y < b2.bbox.y + 1 || centre(b1).x > centre(b2).x).toBe(true);
  });

  it('keeps the source ranges of every line (click to source)', () => {
    const md = markdown(scripts.en!);
    const comic = comicOf(buildDocument({ markdown: md, resources }, config('en')));
    for (const b of comic.balloons) {
      const line = md.slice(b.sourceStart, b.sourceEnd);
      expect(line).toMatch(/^(caption|ana|ben|sfx)(\{[^}]*\})?:/);
      for (const t of b.text) if (t.sourceMap) for (const o of t.sourceMap) expect(o).toBeGreaterThanOrEqual(b.sourceStart);
    }
  });

  it('warns when a balloon cannot be placed cleanly, without shrinking it', () => {
    const long = 'This is a very long line of dialogue that will never fit inside such a small panel, however hard the lettering tries to place it somewhere.';
    const md = `:::page{split="8 [12 | *] / *"}\n::panel{art=room}\nana: ${long}\nben: ${long}\n::panel\n::panel\n:::\n`;
    const doc = buildDocument({ markdown: md, resources }, config('en'));
    const w = (doc.contentWarnings ?? []).filter((x) => x.kind === 'comicBalloonOverflow');
    expect(w.length).toBeGreaterThan(0);
    const first = w[0]!;
    expect(md.slice(first.sourceStart!, first.sourceEnd!)).toMatch(/^(ana|ben): This is/);
    expect(first.pageIndex).toBe(doc.pages.find((p) => p.comic)!.index);
    // One lettering size: the text keeps the size of a roomy page.
    const roomy = comicOf(buildDocument({ markdown: markdown(scripts.en!), resources }, config('en')));
    const crowded = comicOf(doc);
    expect(crowded.balloons[0]!.text[0]!.fontString).toBe(roomy.balloons[1]!.text[0]!.fontString);
  });

  it('reports speakers no picture of the page marks (only on pages that mark some)', () => {
    const md = ':::page\n::panel{art=room}\nana: Hello.\nzed: Who is there?\n:::\n\n:::page\n::panel\nbob: Hi.\n:::\n';
    const doc = buildDocument({ markdown: md, resources }, config('en'));
    const unknown = (doc.contentWarnings ?? []).filter((w) => w.kind === 'comicUnknownSpeaker');
    expect(unknown.map((w) => (w as { speaker: string }).speaker)).toEqual(['zed']);
    // A cast entry makes the speaker known; its tail points off the panel.
    const cast = buildDocument({ markdown: md, resources }, { ...config('en'), comics: { cast: [{ id: 'zed', fill: { hex: '#eeeeee', model: 'hex' } }] } });
    expect((cast.contentWarnings ?? []).some((w) => w.kind === 'comicUnknownSpeaker')).toBe(false);
    const zed = comicOf(cast).balloons.find((b) => b.speaker === 'zed')!;
    expect(zed.shape?.fill).toBe('#eeeeee');
    const panel = comicOf(cast).panels[0]!;
    const tip = zed.tailTip!;
    const onBorder = Math.min(Math.abs(tip.x - panel.bbox.x), Math.abs(tip.x - panel.bbox.x - panel.bbox.width), Math.abs(tip.y - panel.bbox.y), Math.abs(tip.y - panel.bbox.y - panel.bbox.height));
    expect(onBorder).toBeLessThan(2);
  });

  it('honours pins in picture fractions and per-line tail and join attributes', () => {
    const md = ':::page\n::panel{art=room}\nana{at="45% 20%"}: Pinned here.\nben: One.\nben: Two.\nben{join=false}: Three.\n:::\n';
    const comic = comicOf(buildDocument({ markdown: md, resources }, config('en')));
    const room = comic.panels[0]!;
    const pin = comicArtPointToPage(room.art!, 0.45, 0.2);
    expect(pointInPolygon(room.polygon, pin)).toBe(true);
    const ana = comic.balloons[0]!;
    expect(dist(centre(ana), pin)).toBeLessThan(ana.bbox.height);
    const bens = comic.balloons.filter((b) => b.speaker === 'ben');
    // The first two join (one outline, carried by the first); the third
    // stands alone.
    expect(bens[0]!.group).toBe(bens[1]!.group);
    expect(bens[1]!.shape).toBeUndefined();
    expect(bens[2]!.group).not.toBe(bens[0]!.group);
    expect(bens[2]!.shape).toBeDefined();
  });

  it('keeps a joined group whole when its first line is pinned, that balloon on the pin (#571)', () => {
    const md = ':::page\n::panel{art=room}\nben{at="62% 22%"}: Listen to me.\nben: We leave tonight. Pack only what you can carry.\n:::\n';
    const comic = comicOf(buildDocument({ markdown: md, resources }, config('en')));
    const [first, second] = comic.balloons;
    expect(first!.group).toBe(second!.group);
    expect(first!.shape).toBeDefined();
    expect(second!.shape).toBeUndefined();
    const pin = comicArtPointToPage(comic.panels[0]!.art!, 0.62, 0.22);
    expect(dist(centre(first!), pin)).toBeLessThan(1);
  });

  it('keeps balloons off a hat: the face grown upward, and a head guard from mouth and head', () => {
    // A tall hat over a marked face; a second speaker marked by mouth and
    // head only (no face): neither head is covered.
    const hats: Resource[] = [picture('hats', 1600, 1000, {
      anchors: [
        { id: 'ana', x: 0.3, y: 0.7, face: { x: 0.24, y: 0.55, width: 0.12, height: 0.2 } },
        { id: 'ben', x: 0.72, y: 0.72, head: { x: 0.72, y: 0.6 } },
      ],
    })];
    const md = ':::page\n::panel{art=hats}\nana: The tallest hat in the whole valley, and it is mine.\nben: It suits you, I suppose.\n:::\n';
    const comic = comicOf(buildDocument({ markdown: md, resources: hats }, config('en')));
    const art = comic.panels[0]!.art!;
    const a = comicArtPointToPage(art, 0.24, 0.55);
    const a2 = comicArtPointToPage(art, 0.36, 0.75);
    // The hat: 0.4 of the face's height above it.
    const hat = { x: a.x, y: a.y - 0.4 * (a2.y - a.y), width: a2.x - a.x, height: 0.4 * (a2.y - a.y) };
    const head = comicArtPointToPage(art, 0.72, 0.6);
    const em = (7.5 / 72) * 300;
    const benHead = { x: head.x - 1.2 * em, y: head.y - 2 * em, width: 2.4 * em, height: 2 * em };
    const hits = (r: { x: number; y: number; width: number; height: number }, b: VDTComicBalloon) =>
      Math.min(r.x + r.width, b.bbox.x + 0.9 * b.bbox.width) > Math.max(r.x, b.bbox.x + 0.1 * b.bbox.width)
      && Math.min(r.y + r.height, b.bbox.y + 0.9 * b.bbox.height) > Math.max(r.y, b.bbox.y + 0.1 * b.bbox.height);
    for (const b of comic.balloons) {
      expect(hits(hat, b)).toBe(false);
      expect(hits(benHead, b)).toBe(false);
    }
  });

  it('gives text set on the art with no balloon a halo, and butted captions the border\'s weight', () => {
    const md = ':::page\n::panel{art=room}\ncaption{at=top-start}: Lyon, 1943.\nsfx{writing at="50% 20%"}: Invitation\n:::\n';
    const cfg: PostextConfig = { ...config('en'), comics: { balloonStyles: [{ id: 'writing', shape: 'none', tail: 'none', color: { hex: '#3b2a1e', model: 'hex' } }] } };
    const comic = comicOf(buildDocument({ markdown: md, resources }, cfg));
    const writing = comic.balloons.find((b) => b.style === 'writing')!;
    expect(writing.halo?.color).toBe('#ffffff');
    expect(writing.halo!.width).toBeGreaterThan(0);
    const cap = comic.balloons.find((b) => b.kind === 'caption')!;
    expect(cap.shape!.strokeWidth).toBeCloseTo(comic.panels[0]!.border.width, 6);
    // A style with an explicit halo of 0 keeps none.
    const none = comicOf(buildDocument({ markdown: md, resources }, { ...cfg, comics: { balloonStyles: [{ id: 'writing', shape: 'none', tail: 'none', halo: { value: 0, unit: 'pt' } }] } }));
    expect(none.balloons.find((b) => b.style === 'writing')!.halo).toBeUndefined();
  });

  it('lays out documents without comics exactly as before (no balloons anywhere)', () => {
    const doc = buildDocument({ markdown: '# Title\n\nSome text.\n' }, config('en'));
    expect(doc.pages.every((p) => p.comic === undefined)).toBe(true);
  });
});
