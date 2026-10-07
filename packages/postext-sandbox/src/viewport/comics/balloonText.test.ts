import { describe, expect, it } from 'vitest';
import { buildDocument, pageComics, type PostextConfig, type Resource, type VDTComicBalloon, type VDTComicPage, type VDTDesignTextBlock } from 'postext';
import { balloonTextAt, balloonTextNearest, type TextMeasure } from './balloonText';
import { comicPressAt } from './comicHit';
import { boxCentre, rotateAbout } from './balloonDrag';

// Nothing measures in the node tests: a run's characters share its advance
// evenly (the Sandbox measures them with the font in the browser).
const even: TextMeasure = () => null;
const opts = { measure: even };

const balloonOf = (text: VDTDesignTextBlock[], extra: Partial<VDTComicBalloon> = {}): VDTComicBalloon => ({
  id: '0:0',
  panelIndex: 0,
  order: 0,
  kind: 'balloon',
  style: 'speech',
  sourceStart: 5,
  sourceEnd: 21,
  group: 0,
  text,
  bbox: { x: 90, y: 90, width: 80, height: 45 },
  ...extra,
});

// `ana: Hello world` set in capitals on two lines, ten px a character:
// HELLO from x 105 to 155 (baseline 110), WORLD under it (baseline 122).
const horizontal = (extra: Partial<VDTDesignTextBlock> = {}): VDTDesignTextBlock => ({
  kind: 'text',
  bbox: { x: 100, y: 100, width: 60, height: 26 },
  fontString: '10px Test',
  color: '#000',
  clip: false,
  lines: [
    { text: 'HELLO', xOffset: 5, baselineY: 110, width: 50 },
    { text: 'WORLD', xOffset: 5, baselineY: 122, width: 50 },
  ],
  sourceStart: 5,
  sourceEnd: 21,
  sourceText: 'HELLO\nWORLD',
  // The line break maps to the next line's start (the space is not printed).
  sourceMap: [10, 11, 12, 13, 14, 16, 16, 17, 18, 19, 20],
  ...extra,
});

describe('balloon words under the pointer (#595)', () => {
  describe('horizontal lettering', () => {
    const b = balloonOf([horizontal()]);

    it('puts the caret before or after the character pressed, by its half', () => {
      expect(balloonTextAt(b, 107, 108, opts)).toBe(10);
      expect(balloonTextAt(b, 113, 108, opts)).toBe(11);
      expect(balloonTextAt(b, 127, 120, opts)).toBe(18);
    });

    it('puts the caret after the last character of a line, not at the next line', () => {
      expect(balloonTextAt(b, 154, 108, opts)).toBe(15);
      expect(balloonTextAt(b, 154, 120, opts)).toBe(21);
    });

    it('is off the glyphs round the words (the balloon drags from there)', () => {
      expect(balloonTextAt(b, 102, 108, opts)).toBeNull();
      expect(balloonTextAt(b, 160, 108, opts)).toBeNull();
      expect(balloonTextAt(b, 130, 95, opts)).toBeNull();
      expect(balloonTextAt(b, 130, 130, opts)).toBeNull();
      // A little slop past a line's ends still counts.
      expect(balloonTextAt(b, 103, 108, { ...opts, slop: 3 })).toBe(10);
    });

    it('takes the characters as the font measures them', () => {
      // An H three times as wide as the other letters: it runs from 105 to
      // 105 + 50 × 3 / 7 ≈ 126.4, the E after it to ≈ 133.6.
      const measure: TextMeasure = (text) => [...text].reduce((w, ch) => w + (ch === 'H' ? 3 : 1), 0);
      expect(balloonTextAt(b, 112, 108, { measure })).toBe(10);
      expect(balloonTextAt(b, 124, 108, { measure })).toBe(11);
      expect(balloonTextAt(b, 129, 108, { measure })).toBe(11);
      // Spread evenly, 124 is past the middle of the second letter.
      expect(balloonTextAt(b, 124, 108, opts)).toBe(12);
    });

    it('holds a dragged head to the nearest line and end of the words', () => {
      expect(balloonTextNearest(b, 300, 300, opts)).toBe(21);
      expect(balloonTextNearest(b, 0, 0, opts)).toBe(10);
      expect(balloonTextNearest(b, 127, 60, opts)).toBe(12);
    });

    it('leaves out words that do not map back, and ruby readings', () => {
      const unmapped = horizontal();
      delete unmapped.sourceMap;
      delete unmapped.sourceText;
      expect(balloonTextAt(balloonOf([unmapped]), 107, 108, opts)).toBeNull();
      expect(balloonTextNearest(balloonOf([unmapped]), 107, 108, opts)).toBeNull();
      expect(balloonTextAt(balloonOf([horizontal({ artifact: true })]), 107, 108, opts)).toBeNull();
    });

    it('turns a sound effect back before it looks', () => {
      const sfx = balloonOf([horizontal()], { kind: 'sfx', rotate: -30, bbox: { x: 100, y: 100, width: 60, height: 26 } });
      const c = boxCentre(sfx.bbox);
      const at = (x: number, y: number) => rotateAbout({ x, y }, c, -30);
      expect(balloonTextAt(sfx, at(107, 108).x, at(107, 108).y, opts)).toBe(10);
      expect(balloonTextAt(sfx, at(127, 120).x, at(127, 120).y, opts)).toBe(18);
    });
  });

  describe('right-to-left lettering', () => {
    // سلام, painted right to left from 130 to 100.
    const rtl: VDTDesignTextBlock = {
      kind: 'text',
      bbox: { x: 100, y: 100, width: 40, height: 14 },
      fontString: '10px Test',
      color: '#000',
      clip: false,
      direction: 'rtl',
      lines: [{ text: 'سلام', xOffset: 0, baselineY: 110, width: 40, runs: [{ text: 'سلام', fontString: '10px Test', width: 40, rtl: true }] }],
      sourceStart: 0,
      sourceEnd: 10,
      sourceText: 'سلام',
      sourceMap: [6, 7, 8, 9],
    };
    const b = balloonOf([rtl]);

    it('starts at the right: the first letter is the rightmost', () => {
      expect(balloonTextAt(b, 138, 108, opts)).toBe(6);
      expect(balloonTextAt(b, 132, 108, opts)).toBe(7);
      expect(balloonTextAt(b, 108, 108, opts)).toBe(9);
      expect(balloonTextAt(b, 102, 108, opts)).toBe(10);
    });

    it('finds a left-to-right word inside a right-to-left line where it is painted', () => {
      // سلم OK يا: three runs, painted in the order 2, 1, 0 from the left.
      const mixed: VDTDesignTextBlock = {
        ...rtl,
        bbox: { x: 100, y: 100, width: 90, height: 14 },
        lines: [{
          text: 'سلم OK يا',
          xOffset: 0,
          baselineY: 110,
          width: 90,
          order: [2, 1, 0],
          runs: [
            { text: 'سلم ', fontString: '10px Test', width: 40, rtl: true },
            { text: 'OK', fontString: '10px Test', width: 20 },
            { text: ' يا', fontString: '10px Test', width: 30, rtl: true },
          ],
        }],
        sourceText: 'سلم OK يا',
        sourceMap: [20, 21, 22, 23, 24, 25, 26, 27, 28],
      };
      const m = balloonOf([mixed]);
      // O is painted from 130 to 140, K from 140 to 150.
      expect(balloonTextAt(m, 132, 108, opts)).toBe(24);
      expect(balloonTextAt(m, 146, 108, opts)).toBe(26);
      // The first Arabic letter is at the right end.
      expect(balloonTextAt(m, 188, 108, opts)).toBe(20);
      // The last one is at the left end.
      expect(balloonTextAt(m, 102, 108, opts)).toBe(29);
    });
  });

  describe('vertical lettering', () => {
    // Two columns, right to left, each running down from y 50: あいう
    // (axis at x 219) and えお (axis at x 207); ten px a character.
    const vertical: VDTDesignTextBlock = {
      kind: 'text',
      bbox: { x: 200, y: 50, width: 24, height: 30 },
      fontString: '10px Test',
      color: '#000',
      clip: false,
      vertical: { region: 'japan', uprightDigits: 2, centralBaselines: { Test: 0.38 } },
      lines: [
        { text: 'あいう', xOffset: 0, baselineY: 8.8, width: 30 },
        { text: 'えお', xOffset: 0, baselineY: 20.8, width: 20 },
      ],
      sourceStart: 30,
      sourceEnd: 36,
      sourceText: 'あいう\nえお',
      sourceMap: [30, 31, 32, 33, 33, 34],
    };
    const b = balloonOf([vertical]);

    it('reads the columns from the right, each from the top', () => {
      expect(balloonTextAt(b, 219, 52, opts)).toBe(30);
      expect(balloonTextAt(b, 219, 66, opts)).toBe(32);
      expect(balloonTextAt(b, 207, 55, opts)).toBe(34);
      expect(balloonTextAt(b, 207, 69, opts)).toBe(35);
      // After the last character of the first column.
      expect(balloonTextAt(b, 219, 79, opts)).toBe(33);
    });

    it('is off the glyphs beside and below the columns', () => {
      expect(balloonTextAt(b, 230, 52, opts)).toBeNull();
      expect(balloonTextAt(b, 219, 85, opts)).toBeNull();
      expect(balloonTextAt(b, 207, 75, opts)).toBeNull();
    });

    it('holds a dragged head to the nearest column', () => {
      expect(balloonTextNearest(b, 100, 300, opts)).toBe(35);
      expect(balloonTextNearest(b, 400, 0, opts)).toBe(30);
    });
  });
});

// The engine's own lettering: a press on the first character of a balloon
// lands on that character of its script line, in each writing mode.
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

const room: Resource = {
  id: 'room',
  typeId: 'figure',
  kind: 'bitmap',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'file-room', format: 'png', width: 1600, height: 1000 },
};

const cases: { name: string; config: PostextConfig; lines: [string, string] }[] = [
  { name: 'horizontal', config: { page: { sizePreset: '17x24' } }, lines: ['Did you hear that? Something is moving.', 'Nothing at all.'] },
  { name: 'right to left', config: { page: { sizePreset: '17x24' }, locale: 'ar' }, lines: ['هل سمعت ذلك؟ شيء ما يتحرك في القبو.', 'لا شيء.'] },
  { name: 'vertical', config: { page: { sizePreset: '17x24' }, locale: 'ja', layout: { writingMode: 'vertical-rl' } }, lines: ['いまの音、聞こえた？地下室で何かが動いてる。', 'なんでもないよ。'] },
];

describe('balloon words of a laid-out comic page (#595)', () => {
  for (const { name, config, lines } of cases) {
    describe(name, () => {
      const md = `Text.\n\n:::page\n::panel{art=room}\nana: ${lines[0]}\nben: ${lines[1]}\n:::\n`;
      const doc = buildDocument({ markdown: md, resources: [room] }, config);
      const comic = doc.pages.flatMap((p) => pageComics(p))[0] as VDTComicPage;

      it('lays the balloons out with words that map back', () => {
        expect(comic.balloons.length).toBe(2);
        for (const b of comic.balloons) expect(b.text[0]!.sourceMap?.length).toBeGreaterThan(0);
        if (name === 'vertical') expect(comic.balloons[0]!.text[0]!.vertical).toBeDefined();
        if (name === 'right to left') expect(comic.balloons[0]!.text[0]!.direction).toBe('rtl');
      });

      it('maps a press on the first character to its place in the script', () => {
        comic.balloons.forEach((b, i) => {
          const t = b.text[0]!;
          const line = t.lines[0]!;
          const em = Number(/(\d+(?:\.\d+)?)px/.exec(t.fontString)![1]);
          const step = line.width / line.text.length;
          let x: number;
          let y: number;
          if (t.vertical) {
            x = t.bbox.x + t.bbox.width - (line.baselineY - 0.38 * em);
            y = t.bbox.y + line.xOffset + 0.25 * step;
          } else {
            const rtl = line.runs?.[0]?.rtl === true;
            x = t.bbox.x + line.xOffset + (rtl ? line.width - 0.25 * step : 0.25 * step);
            y = line.baselineY - 0.3 * em;
          }
          const at = md.indexOf(lines[i]!);
          expect(balloonTextAt(b, x, y, opts)).toBe(at);
          // The same press, through the page's tools: text, not a grab.
          const press = comicPressAt([comic], x, y, { band: 4, tipRadius: 4, text: opts });
          expect(press?.kind).toBe('text');
          // A press on the balloon's corner, off the words, grabs it.
          const corner = { x: b.bbox.x + 1, y: b.bbox.y + 1 };
          expect(balloonTextAt(b, corner.x, corner.y, opts)).toBeNull();
          expect(comicPressAt([comic], corner.x, corner.y, { band: 4, tipRadius: 0, text: opts })?.kind).toBe('balloon');
        });
      });
    });
  }
});
