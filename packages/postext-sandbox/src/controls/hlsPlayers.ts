import { attachVideoSource } from 'postext-folio';

/**
 * HLS streams in the HTML viewer (#476): the HTML output marks a `<video>`
 * playing an `.m3u8` address with `data-pt-hls`. Safari plays it as it
 * is; other browsers get hls.js, attached on demand and loading nothing
 * before the reader presses play.
 */
const attached = new Map<HTMLVideoElement, Promise<(() => void) | null>>();

/** Gives every HLS player under `root` its stream, and lets go of the
 *  players no longer in the document. */
export function attachHlsPlayers(root: ParentNode): void {
  for (const [el, release] of attached) {
    if (el.isConnected) continue;
    attached.delete(el);
    void release.then((r) => r?.());
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
