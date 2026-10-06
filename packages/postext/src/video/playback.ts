/**
 * One video at a time, or several together (#507): the HTML output marks a
 * video that plays alongside the others (`player.exclusive: false`) with
 * `data-pt-alongside`. Starting any other (exclusive) video pauses every
 * video playing under the same root; starting one that plays alongside
 * pauses only the exclusive ones, so the silent loops of a page run on
 * together.
 */

/** Whether a `<video>` plays alongside the others. */
export function playsAlongside(el: Element): boolean {
  return el.hasAttribute('data-pt-alongside');
}

/** The videos to pause when `started` starts: every other playing video
 *  when it is exclusive, the exclusive ones when it plays alongside. */
export function videosToPause<T extends { paused: boolean }>(
  started: T,
  videos: Iterable<T>,
  alongside: (v: T) => boolean,
): T[] {
  const together = alongside(started);
  const out: T[] = [];
  for (const v of videos) {
    if (v === started || v.paused) continue;
    if (together && alongside(v)) continue;
    out.push(v);
  }
  return out;
}

/** Keeps the players under `root` to the rule above: listens for `play`
 *  (in the capture phase, as media events do not bubble) and pauses what
 *  the started video does not play alongside. Returns a function that
 *  stops listening. Call it once on the element that holds the HTML
 *  output (`renderToHtml`). */
export function coordinateVideoPlayback(root: Pick<HTMLElement, 'addEventListener' | 'removeEventListener' | 'querySelectorAll'>): () => void {
  const onPlay = (e: Event): void => {
    const started = e.target;
    if (!(started instanceof HTMLMediaElement) || started.tagName !== 'VIDEO') return;
    const videos = root.querySelectorAll<HTMLVideoElement>('video');
    for (const v of videosToPause(started as HTMLVideoElement, videos, playsAlongside)) v.pause();
  };
  root.addEventListener('play', onPlay, true);
  return () => root.removeEventListener('play', onPlay, true);
}
