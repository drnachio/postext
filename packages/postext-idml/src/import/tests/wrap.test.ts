// Text wrap that jumps an object (#1554): Jump Object and Jump to Next
// Column cut the text frame behind the object into chained bands.

import { describe, expect, it } from 'vitest';
import { frameXml, mini, storyXml } from '../../read/fixture.test-helper.js';
import { idmlToPostext } from '../index.js';
import { freeBands, type JumpObject } from '../jumps.js';
import type { IdmlPageItem } from '../../model/document.js';
import { finding, markdownOf, plain } from './kit.test-helper.js';

const TEXT = 'Running text that ends in a full stop, long enough to fill a few lines of the frame. ';
const wrapXml = (mode: string, offset: [number, number, number, number]): string =>
  `<TextWrapPreference TextWrapMode="${mode}" TextWrapSide="BothSides" Inverse="false"><Properties><TextWrapOffset Top="${offset[0]}" Left="${offset[1]}" Bottom="${offset[2]}" Right="${offset[3]}"/></Properties></TextWrapPreference>`;
/** A box (a text frame of its own) with a wrap, over the body frame. */
const boxWithWrap = (mode: string, box: [number, number, number, number], offset: [number, number, number, number] = [3, 0, 9, 0]): string =>
  frameXml('box', 'sbox', box, 'FillColor="Color/Black"').replace('</TextFrame>', `${wrapXml(mode, offset)}</TextFrame>`);

function book(mode: string, box: [number, number, number, number], bodyAttrs = '', offset?: [number, number, number, number]): ReturnType<typeof idmlToPostext> {
  return idmlToPostext(
    mini({
      stories: { sbody: storyXml('sbody', plain(TEXT.repeat(20))), sbox: storyXml('sbox', plain('Do not miss the view.')) },
      items: frameXml('body', 'sbody', [36, 36, 576, 756], bodyAttrs) + boxWithWrap(mode, box, offset),
    }),
    { layout: 'pages' },
  );
}

const framesOf = (r: ReturnType<typeof idmlToPostext>) => r.config.pageTemplates![0]!.frames as { name: string; next?: string; exclude?: string; placement: { offset: { y: { value: number } }; size: { height: { value: number } } } }[];

type Frame = ReturnType<typeof framesOf>[number];
const y = (f: Frame): number => f.placement.offset.y.value;
const foot = (f: Frame): number => y(f) + f.placement.size.height.value;
/** The body frame's bands: the frames that are not the box (which has a
 *  fill, so a style). */
const bands = (r: ReturnType<typeof idmlToPostext>): Frame[] => framesOf(r).filter((f) => !(f as { style?: string }).style);

describe('Jump Object text wrap (#1554)', () => {
  it('cuts the frame behind the object into a band above and a band below, chained', () => {
    const r = book('JumpObjectTextWrap', [36, 200, 300, 300]);
    const [top, below, ...rest] = bands(r);
    expect(rest).toEqual([]);
    // The band above ends at the box less its top offset (plus the room
    // under the last line every plain frame gets); the band below starts
    // past its bottom offset (the first line's place moves it a little).
    expect(foot(top!)).toBeLessThanOrEqual(200 - 3 + 4);
    expect(y(below!)).toBeGreaterThan(300);
    expect(y(below!)).toBeLessThanOrEqual(309);
    expect(top!.next).toBe(below!.name);
    // The box no longer pushes: the bands keep clear of it.
    expect(framesOf(r).some((f) => f.exclude === 'push')).toBe(false);
    expect(finding(r, 'jumpWrap')).toBeDefined();
    // The story is written once, in the first band.
    expect(markdownOf(r).match(/Running text/g)!.length).toBe(20);
  });

  it('starts the frame below an object that covers its top', () => {
    const r = book('JumpObjectTextWrap', [36, 36, 300, 120]);
    const body = bands(r);
    expect(body.length).toBe(1);
    expect(y(body[0]!)).toBeGreaterThan(120);
  });

  it('stops the frame above a Jump to Next Column object', () => {
    const r = book('NextColumnTextWrap', [36, 400, 300, 500]);
    const body = bands(r);
    expect(body.length).toBe(1);
    expect(foot(body[0]!)).toBeLessThanOrEqual(400);
  });

  it('leaves a frame that ignores text wrap whole', () => {
    const ignoring = idmlToPostext(
      mini({
        stories: { sbody: storyXml('sbody', plain(TEXT.repeat(20))), sbox: storyXml('sbox', plain('Box.')) },
        items: frameXml('body', 'sbody', [36, 36, 576, 756]).replace('</TextFrame>', '<TextFramePreference IgnoreWrap="true"/></TextFrame>') + boxWithWrap('JumpObjectTextWrap', [36, 200, 300, 300]),
      }),
      { layout: 'pages' },
    );
    expect(finding(ignoring, 'jumpWrap')).toBeUndefined();
    expect(bands(ignoring).length).toBe(1);
  });
});

describe('freeBands', () => {
  const item = {} as IdmlPageItem;
  const j = (top: number, bottom: number, mode: 'jump' | 'next' = 'jump', offset: [number, number, number, number] = [0, 0, 0, 0]): JumpObject => ({ item, box: { left: 0, right: 100, top, bottom }, mode, offset });
  const frame = { left: 10, right: 90, top: 0, bottom: 300 };

  it('returns the frame itself when no object meets it', () => {
    expect(freeBands(frame, [{ ...j(50, 80), box: { left: 200, right: 300, top: 50, bottom: 80 } }], 10)).toEqual([frame]);
  });
  it('leaves the bands between several objects, offsets kept', () => {
    expect(freeBands(frame, [j(150, 200, 'jump', [5, 0, 5, 0]), j(50, 80)], 10)).toEqual([
      { ...frame, top: 0, bottom: 50 },
      { ...frame, top: 80, bottom: 145 },
      { ...frame, top: 205, bottom: 300 },
    ]);
  });
  it('drops a band too short for a line, and gives none when nothing is left', () => {
    expect(freeBands(frame, [j(5, 100)], 10)).toEqual([{ ...frame, top: 100, bottom: 300 }]);
    expect(freeBands(frame, [j(-10, 400)], 10)).toBeUndefined();
  });
});
