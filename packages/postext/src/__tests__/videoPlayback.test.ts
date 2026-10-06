import { describe, it, expect } from 'vitest';
import { videosToPause } from '../video/playback';
import { videoElementAttributes } from '../video/url';
import { resolveVideoPlayerOptions } from '../defaults/videoStyle';

const v = (name: string, paused: boolean, alongside: boolean) => ({ name, paused, alongside });
const pauseFor = (started: ReturnType<typeof v>, all: ReturnType<typeof v>[]) =>
  videosToPause(started, all, (x) => x.alongside).map((x) => x.name);

describe('video playback coordination (#507)', () => {
  it('an exclusive video pauses every other playing video', () => {
    const a = v('a', false, false);
    const all = [a, v('b', false, true), v('c', false, false), v('d', true, false)];
    expect(pauseFor(a, all)).toEqual(['b', 'c']);
  });

  it('a video that plays alongside pauses only the exclusive ones', () => {
    const a = v('a', false, true);
    const all = [a, v('b', false, true), v('c', false, false)];
    expect(pauseFor(a, all)).toEqual(['c']);
  });

  it('marks a non-exclusive player in the HTML attributes', () => {
    expect(videoElementAttributes(resolveVideoPlayerOptions()).some(([k]) => k === 'data-pt-alongside')).toBe(false);
    expect(videoElementAttributes(resolveVideoPlayerOptions({ exclusive: false }))).toContainEqual(['data-pt-alongside', true]);
    expect(resolveVideoPlayerOptions().exclusive).toBe(true);
  });
});
