import { describe, it, expect, vi, afterEach } from 'vitest';
import { coordinateVideoPlayback, videosToPause, VIDEO_PLAYBACK_SCRIPT } from '../video/playback';
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

// Stand-ins for the DOM (the package tests run in node): a media element
// with `paused`, `play()` (which fires `play` at the root in the capture
// phase, as a browser does for a non-bubbling media event) and `pause()`,
// and a root that keeps capture listeners and finds its videos.
class FakeMedia {
  paused = true;
  pauses = 0;
  constructor(
    readonly root: FakeRoot,
    readonly tagName: string,
    readonly attrs: Record<string, string> = {},
  ) {}
  hasAttribute(name: string): boolean {
    return name in this.attrs;
  }
  play(): void {
    this.paused = false;
    this.root.fire('play', this);
  }
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.pauses++;
  }
}

class FakeRoot {
  readonly media: FakeMedia[] = [];
  private listeners = new Map<string, Set<(e: { type: string; target: unknown }) => void>>();
  add(tagName: string, alongside = false): FakeMedia {
    const m = new FakeMedia(this, tagName, alongside ? { 'data-pt-alongside': '' } : {});
    this.media.push(m);
    return m;
  }
  addEventListener(type: string, fn: (e: { type: string; target: unknown }) => void, capture?: boolean): void {
    expect(capture).toBe(true);
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: (e: { type: string; target: unknown }) => void): void {
    this.listeners.get(type)?.delete(fn);
  }
  querySelectorAll(selector: string): FakeMedia[] {
    expect(selector).toBe('video');
    return this.media.filter((m) => m.tagName.toLowerCase() === 'video');
  }
  getElementsByTagName(name: string): FakeMedia[] {
    return this.querySelectorAll(name);
  }
  fire(type: string, target: FakeMedia): void {
    for (const fn of this.listeners.get(type) ?? []) fn({ type, target });
  }
  playing(): number[] {
    return this.media.flatMap((m, i) => (m.paused ? [] : [i]));
  }
}

/** Each way of keeping the rule: the host-page function and the script an
 *  EPUB links, run against a root of fake media elements. */
const coordinators: Array<[string, (root: FakeRoot) => () => void]> = [
  ['coordinateVideoPlayback', (root) => coordinateVideoPlayback(root as unknown as HTMLElement)],
  ['VIDEO_PLAYBACK_SCRIPT', (root) => {
    new Function('document', VIDEO_PLAYBACK_SCRIPT)(root);
    return () => {};
  }],
];

describe.each(coordinators)('video playback on the page (#507): %s', (_name, coordinate) => {
  afterEach(() => vi.unstubAllGlobals());

  const setUp = () => {
    // `coordinateVideoPlayback` tells a media element by its class.
    vi.stubGlobal('HTMLMediaElement', FakeMedia);
    const root = new FakeRoot();
    const stop = coordinate(root);
    return { root, stop };
  };

  it('starting an exclusive video pauses the others', () => {
    const { root } = setUp();
    const [a, b, c] = [root.add('video'), root.add('video', true), root.add('video', true)];
    b.play();
    c.play();
    expect(root.playing()).toEqual([1, 2]);
    a.play();
    expect(root.playing()).toEqual([0]);
    expect([b.pauses, c.pauses]).toEqual([1, 1]);
  });

  it('videos that play alongside run together and pause the exclusive one', () => {
    const { root } = setUp();
    const [a, b, c] = [root.add('video'), root.add('video', true), root.add('video', true)];
    a.play();
    b.play();
    expect(root.playing()).toEqual([1]);
    c.play();
    expect(root.playing()).toEqual([1, 2]);
  });

  it('leaves audio and paused videos alone', () => {
    const { root } = setUp();
    // Tag names as an HTML document gives them (an XHTML one, lower case).
    const [sound, a, b] = [root.add('AUDIO'), root.add('VIDEO'), root.add('VIDEO')];
    sound.play();
    a.play();
    expect(root.playing()).toEqual([0, 1]);
    b.play();
    expect(root.playing()).toEqual([0, 2]);
    expect(a.pauses).toBe(1);
  });
});

it('coordinateVideoPlayback stops when asked (#507)', () => {
  vi.stubGlobal('HTMLMediaElement', FakeMedia);
  try {
    const root = new FakeRoot();
    const stop = coordinateVideoPlayback(root as unknown as HTMLElement);
    const [a, b] = [root.add('VIDEO'), root.add('VIDEO')];
    a.play();
    stop();
    b.play();
    expect(root.playing()).toEqual([0, 1]);
  } finally {
    vi.unstubAllGlobals();
  }
});
