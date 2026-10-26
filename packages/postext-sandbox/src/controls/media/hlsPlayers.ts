import { attachVideoSource } from 'postext-folio';

/**
 * Video players in the HTML viewer (#476): the HTML output marks a `<video>`
 * playing an `.m3u8` address with `data-pt-hls`. Safari and recent Chrome
 * play it as it is; other browsers get hls.js, attached on demand and
 * loading nothing before the player is played. A player set to start on its
 * own (`autoplay`) starts the first time it comes into view (with sound once
 * the reader has interacted with the page, muted before that) rather
 * than when the chapter is rendered (#478).
 */
const attached = new Map<HTMLVideoElement, Promise<(() => void) | null>>();
const watched = new WeakSet<HTMLVideoElement>();
let observer: IntersectionObserver | null = null;

function viewObserver(): IntersectionObserver | null {
  if (observer || typeof IntersectionObserver === 'undefined') return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLVideoElement;
        observer?.unobserve(el);
        // With its sound once the reader has interacted with the page;
        // muted otherwise (or when the browser still refuses).
        const activated = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? false;
        el.muted = !activated;
        void el.play().catch(() => {
          if (el.muted) return;
          el.muted = true;
          void el.play().catch(() => {});
        });
      }
    },
    { threshold: 0.5 },
  );
  return observer;
}

/** Gives every HLS player under `root` its stream, starts the autoplaying
 *  ones when they come into view, and lets go of the players no longer in
 *  the document. */
export function attachHlsPlayers(root: ParentNode): void {
  for (const [el, release] of attached) {
    if (el.isConnected) continue;
    attached.delete(el);
    void release.then((r) => r?.());
  }
  for (const el of root.querySelectorAll<HTMLVideoElement>('video.pt-video[autoplay]')) {
    if (watched.has(el)) continue;
    watched.add(el);
    // The browser would start it now, off screen: it waits to be seen.
    el.autoplay = false;
    el.removeAttribute('autoplay');
    viewObserver()?.observe(el);
  }
  for (const el of root.querySelectorAll<HTMLVideoElement>('video[data-pt-hls]')) {
    if (attached.has(el)) continue;
    const url = el.getAttribute('src');
    if (!url || el.canPlayType('application/vnd.apple.mpegurl')) continue;
    // The markup's address is no source this browser plays: hls.js takes it.
    el.removeAttribute('src');
    attached.set(el, attachVideoSource(el, url, { hls: true, lazy: true }).catch(() => null));
  }
}
