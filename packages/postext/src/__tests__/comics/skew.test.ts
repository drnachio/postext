import { describe, it, expect } from 'vitest';
import { buildDocument, comicBalloonMatrix, parseComicScript, renderToHtmlIndexed } from '../../index';
import type { Resource } from '../../types';

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

const resources: Resource[] = [
  { id: 'pic', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'pic-file', format: 'png', width: 2000, height: 1000 } },
];

const apply = (m: readonly number[], x: number, y: number) => ({ x: m[0]! * x + m[2]! * y + m[4]!, y: m[1]! * x + m[3]! * y + m[5]! });

describe('leaned lettering (skew)', () => {
  it('reads skew= on a script line', () => {
    const md = 'sfx{writing at="77% 14%" rotate=-11 skew=-8}: Incantations';
    const [item] = parseComicScript(md, [{ start: 0, text: md }]);
    expect(item).toMatchObject({ rotate: -11, skew: -8 });
  });

  it('builds the matrix about the box centre: a turn alone is a rotation, a lean moves the top forward', () => {
    const bbox = { x: 100, y: 50, width: 40, height: 20 };
    expect(comicBalloonMatrix({ bbox })).toBeUndefined();
    const turn = comicBalloonMatrix({ bbox, rotate: 90 })!;
    // The centre stays; (1, 0) from it goes to (0, 1) (clockwise on the sheet).
    expect(apply(turn, 120, 60).x).toBeCloseTo(120);
    expect(apply(turn, 120, 60).y).toBeCloseTo(60);
    expect(apply(turn, 121, 60).x).toBeCloseTo(120);
    expect(apply(turn, 121, 60).y).toBeCloseTo(61);
    const lean = comicBalloonMatrix({ bbox, skew: 45 })!;
    // A point 10 px above the centre goes 10 px forward (right), one below back.
    expect(apply(lean, 120, 50).x).toBeCloseTo(130);
    expect(apply(lean, 120, 70).x).toBeCloseTo(110);
    expect(apply(lean, 120, 50).y).toBeCloseTo(50);
  });

  it('carries the lean from the script and from a balloon style to the VDT and the HTML', () => {
    const md = ':::page\n::panel{art=pic}\nsfx{at="50% 20%" rotate=-11 skew=-8}: BOOK\nsfx{title at="50% 70%"}: TITLE\n:::';
    const doc = buildDocument({ markdown: md, resources }, { comics: { balloonStyles: [{ id: 'title', shape: 'none', tail: 'none', skew: 12 }] } });
    const page = doc.pages.find((p) => p.comic)!;
    const [book, title] = page.comic!.balloons;
    expect(book).toMatchObject({ rotate: -11, skew: -8 });
    expect(title!.skew).toBe(12);
    const html = renderToHtmlIndexed(doc, { resourceImageUrl: (id: string) => `https://img.test/${id}.png` }).pages[page.index]!.innerHtml;
    expect(html).toMatch(/transform-origin:0 0;transform:matrix\(/);
  });

  it('leans the box the placement keeps clear (its rim)', () => {
    const md = (skew: number) => `:::page\n::panel{art=pic}\nsfx{at="50% 50%" skew=${skew}}: WWWWWWWW\n:::`;
    const flat = buildDocument({ markdown: md(0), resources }, {}).pages.find((p) => p.comic)!.comic!.balloons[0]!;
    const leaned = buildDocument({ markdown: md(30), resources }, {}).pages.find((p) => p.comic)!.comic!.balloons[0]!;
    expect(leaned.skew).toBe(30);
    expect(flat.skew).toBeUndefined();
  });
});
