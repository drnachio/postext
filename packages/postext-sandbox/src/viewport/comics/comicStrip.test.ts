import { describe, expect, it } from 'vitest';
import { buildDocument, flowRectToPage, pageComics, type PostextConfig, type Resource, type VDTComicPage, type VDTDocument, type VDTPage } from 'postext';
import { applyTextChanges, changesApply, invertTextChanges } from '../../book/textChanges';
import { comicBySource, comicHitAt, panelKeyAction } from './comicHit';
import { mergePanelChanges, moveSplitterChanges, splitPanelChanges } from './comicSource';
import { comicBalloonItem, pinBalloonChanges, tailLineChanges, untailLineChanges } from './balloonSource';
import { boxCentre, pageToTailTarget, pinToPage } from './balloonDrag';

class StubCtx {
  font = '';
  measureText(s: string): { width: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
    return { width: s.length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const picture = (id: string, extra: Partial<Resource> = {}): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `file-${id}`, format: 'png', width: 1600, height: 1000 },
  ...extra,
});
const resources = [picture('room', { anchors: [{ id: 'ana', x: 0.3, y: 0.7 }] })];
const config: PostextConfig = { page: { sizePreset: '17x24' } };

const para = (n: number, tag = 'Paragraph'): string =>
  Array.from({ length: n }, (_, i) => `${tag} ${i} lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.`).join('\n\n');

const STRIP = ':::strip{split="40 | * | *" aspect=3}\n::panel{art=room}\nana: Did you hear that?\n::panel\nben: Nothing.\n::panel\n:::';

/** The page holding the strip, and the strip on its sheet. */
function stripOf(doc: VDTDocument): { page: VDTPage; comic: VDTComicPage } {
  for (const page of doc.pages) {
    const comic = pageComics(page).find((c) => !page.comic || c !== page.comic);
    if (comic) return { page, comic };
  }
  throw new Error('no strip');
}

const layouts: [string, PostextConfig, (s: string) => string][] = [
  ['a column of a two-column page', { ...config, layout: { layoutType: 'double' } }, (s) => `${para(4)}\n\n${s}\n\n${para(6, 'After')}`],
  ['a float at the head of the page', { ...config, layout: { layoutType: 'double' } }, (s) => `${para(2)}\n\n${s.replace('aspect=3', 'aspect=5 span=page placement=top')}\n\n${para(20, 'After')}`],
  ['a right-to-left page', { ...config, locale: 'ar' }, (s) => `نص.\n\n${s}\n\nنص.`],
  ['a vertical page', { ...config, locale: 'ja', layout: { writingMode: 'vertical-rl' } }, (s) => `本文。\n\n${s.replace('40 | * | *', '40 / * / *').replace('aspect=3', 'aspect=0.4')}\n\n本文。`],
];

describe('comic tools on strips (#580)', () => {
  for (const [name, cfg, wrap] of layouts) {
    describe(`a strip in ${name}`, () => {
      const md = wrap(STRIP);
      const layout = (text: string) => stripOf(buildDocument({ markdown: text, resources }, cfg));
      const { page, comic } = layout(md);

      it('lies on the sheet where its block is, and is found by its fence', () => {
        const block = [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])].find((b) => b.comic)!;
        const box = flowRectToPage(page, block.bbox);
        expect(comic.frame.x).toBeCloseTo(box.x, 3);
        expect(comic.frame.y).toBeCloseTo(box.y, 3);
        expect(comic.sourceStart).toBe(md.indexOf(':::strip'));
        expect(comicBySource(pageComics(page), comic.sourceStart)).toBe(comic);
      });

      it('finds its split lines, panels and balloons at sheet points', () => {
        const s = comic.splitters[0]!;
        const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
        const hitS = comicHitAt(pageComics(page), mid.x, mid.y, { band: 8 });
        expect(hitS?.kind).toBe('splitter');
        expect(hitS?.comic).toBe(comic);
        const ana = comic.balloons.find((b) => b.speaker === 'ana')!;
        const c = boxCentre(ana.bbox);
        const hitB = comicHitAt(pageComics(page), c.x, c.y, { band: 8 });
        expect(hitB).toMatchObject({ kind: 'balloon', balloon: ana });
        const empty = comic.panels[2]!.bbox;
        const hitP = comicHitAt(pageComics(page), empty.x + empty.width / 2, empty.y + empty.height / 2, { band: 8 });
        expect(hitP).toMatchObject({ kind: 'panel', panel: comic.panels[2] });
        // Off the strip: nothing.
        expect(comicHitAt(pageComics(page), comic.frame.x - 40, comic.frame.y - 40, { band: 8 })).toBeNull();
      });

      it('writes a moved line into the strip\'s own split', () => {
        const changes = moveSplitterChanges(md, comic, comic.splitters[0]!, 30)!;
        expect(changesApply(md, changes)).toBe(true);
        const next = applyTextChanges(md, changes);
        // The next line stays where it was (70 %).
        const sep = cfg.layout?.writingMode === 'vertical-rl' ? '/' : '|';
        expect(next).toContain(`:::strip{split="30 ${sep} 40 ${sep} *"`);
        const again = layout(next).comic;
        expect(again.splitters[0]!.startPercent).toBeCloseTo(30, 3);
        expect(applyTextChanges(next, invertTextChanges(changes))).toBe(md);
      });

      it('splits and merges the strip\'s panels', () => {
        const split = applyTextChanges(md, splitPanelChanges(md, comic, 1, 'rows')!);
        expect(layout(split).comic.panels).toHaveLength(4);
        const merged = applyTextChanges(md, mergePanelChanges(md, comic, 1)!);
        const after = layout(merged).comic;
        expect(after.panels).toHaveLength(2);
        expect(merged).toContain('ben: Nothing.\n:::');
      });

      it('pins a balloon of the strip where it is dropped', () => {
        const ana = comic.balloons.find((b) => b.speaker === 'ana')!;
        const at = { x: 0.55, y: 0.4 };
        const next = applyTextChanges(md, pinBalloonChanges(md, comic, ana.sourceStart, at)!);
        expect(next).toContain('ana{at="55% 40%"}: Did you hear that?');
        const again = layout(next).comic;
        const moved = again.balloons.find((b) => b.speaker === 'ana')!;
        const target = pinToPage(again.panels[0]!, at);
        expect(Math.hypot(boxCentre(moved.bbox).x - target.x, boxCentre(moved.bbox).y - target.y)).toBeLessThan(1.5);
      });
    });
  }
});

describe('tail targets written and laid out again (#580)', () => {
  const layout = (md: string): VDTComicPage => buildDocument({ markdown: md, resources }, config).pages.find((p) => p.comic)!.comic!;
  for (const mirror of [false, true]) {
    it(`points the tail at the spot it was dropped on${mirror ? ' (mirrored art)' : ''}`, () => {
      const md = `:::page\n::panel{art=room${mirror ? ' mirror' : ''}}\nana{at="50% 25%"}: Did you hear that?\n:::\n`;
      const comic = layout(md);
      const ana = comic.balloons[0]!;
      expect(ana.tailTip).toBeDefined();
      const panel = comic.panels[0]!;
      // Dropped low on the right of the page.
      const drop = { x: panel.bbox.x + panel.bbox.width * 0.85, y: panel.bbox.y + panel.bbox.height * 0.8 };
      const to = pageToTailTarget(panel, drop);
      const item = comicBalloonItem(md, comic, ana.sourceStart)!;
      const changes = tailLineChanges(md, item, to);
      const next = applyTextChanges(md, changes);
      expect(next).toMatch(/ana\{at="50% 25%" to="[\d.]+% [\d.]+%"\}: Did you hear that\?/);
      const again = layout(next).balloons[0]!;
      // The tail now runs from the balloon toward the drop point.
      const c = boxCentre(again.bbox);
      const want = Math.atan2(drop.y - c.y, drop.x - c.x);
      const got = Math.atan2(again.tailTip!.y - c.y, again.tailTip!.x - c.x);
      expect(Math.abs(want - got)).toBeLessThan(0.15);
      // Taken off again: the line as it was.
      const back = untailLineChanges(next, comicBalloonItem(next, comic, ana.sourceStart)!)!;
      expect(applyTextChanges(next, back)).toBe(md);
      expect(applyTextChanges(next, invertTextChanges(changes))).toBe(md);
    });
  }

  it('does nothing to a line that has no tail target', () => {
    const md = ':::page\n::panel{art=room}\nana: Hi.\n:::\n';
    const comic = layout(md);
    expect(untailLineChanges(md, comicBalloonItem(md, comic, comic.balloons[0]!.sourceStart)!)).toBeNull();
  });
});

describe('panel keys (#580)', () => {
  const key = (k: string, extra: Partial<KeyboardEvent> & { code?: string } = {}) => panelKeyAction({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...extra });
  it('reads H, V and M in either case', () => {
    expect(key('h')).toBe('rows');
    expect(key('H')).toBe('rows');
    expect(key('v')).toBe('columns');
    expect(key('m')).toBe('merge');
    expect(key('x')).toBeNull();
    expect(key('Enter')).toBeNull();
  });
  it('reads the physical key on another layout, and leaves shortcuts alone', () => {
    expect(key('ا', { code: 'KeyH' })).toBe('rows');
    expect(key('ر', { code: 'KeyV' })).toBe('columns');
    expect(key('h', { metaKey: true })).toBeNull();
    expect(key('v', { ctrlKey: true })).toBeNull();
  });
});
