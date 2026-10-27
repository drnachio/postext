// The video players of the HTML preview's pages (`<video class="pt-video">`,
// set by the HTML output for a self-hosted video), found and played from
// outside the pages: each with the resource it plays and its page.

import type { VDTDocument } from 'postext';
import type { PlayableVideo, PreviewVideo, PreviewVideoResult } from '../../viewerVideos.js';

/** The players under `scroll`, the pages of `doc` rendered there. */
export function htmlVideoPlayers(scroll: ParentNode, doc: VDTDocument): PlayableVideo<HTMLVideoElement>[] {
  // A player sits in the wrapper of the block that places its resource.
  const resourceOf = new Map<string, string>();
  for (const block of doc.blocks) if (block.resourceBlock) resourceOf.set(block.id, block.resourceBlock.resource.id);
  for (const page of doc.pages) for (const block of page.floats ?? []) if (block.resourceBlock) resourceOf.set(block.id, block.resourceBlock.resource.id);
  const out: PlayableVideo<HTMLVideoElement>[] = [];
  for (const el of scroll.querySelectorAll<HTMLVideoElement>('video.pt-video')) {
    const pageEl = el.closest<HTMLElement>('.pt-page[data-page]');
    const resource = resourceOf.get(el.closest('.pt-block[data-block-id]')?.getAttribute('data-block-id') ?? '');
    if (!pageEl || resource === undefined) continue;
    out.push({
      resource,
      pageIndex: Number(pageEl.dataset.page),
      contains: (x, y) => {
        const page = pageEl.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        const px = page.left + x * page.width;
        const py = page.top + y * page.height;
        return px >= box.left && px <= box.right && py >= box.top && py <= box.bottom;
      },
      item: el,
    });
  }
  return out;
}

/** Whether a player plays, waits where it was paused, or shows its poster. */
export function htmlVideoState(el: HTMLVideoElement): PreviewVideo['state'] {
  if (!el.paused && !el.ended) return 'playing';
  return el.currentTime > 0 && !el.ended ? 'paused' : 'stopped';
}

/** How long a player is given to start before it is answered for as
 *  still loading (a stream that buffers, a file on a slow server). */
const START_WAIT_MS = 2500;

/** Asks a player to play: `started` once it does, `loading` when it has
 *  taken the request and is still fetching, else the browser's refusal. */
async function start(el: HTMLVideoElement): Promise<'started' | 'loading' | { refused: string }> {
  let timer = 0;
  const waited = new Promise<'loading'>((resolve) => { timer = window.setTimeout(() => resolve('loading'), START_WAIT_MS); });
  try {
    return await Promise.race([el.play().then(() => 'started' as const), waited]);
  } catch (err) {
    return { refused: (err as { name?: string } | null)?.name ?? 'Error' };
  } finally {
    window.clearTimeout(timer);
  }
}

/** Starts a player (or lets it go on). A browser that lets no sound start
 *  without a gesture of the reader's gets it muted, as Folio does. */
export async function playHtmlVideo(el: HTMLVideoElement): Promise<Pick<PreviewVideoResult, 'played' | 'already' | 'muted' | 'loading' | 'reason'>> {
  if (htmlVideoState(el) === 'playing') return { played: true, already: true };
  let outcome = await start(el);
  let muted = false;
  if (typeof outcome === 'object' && outcome.refused === 'NotAllowedError' && !el.muted) {
    el.muted = true;
    muted = true;
    outcome = await start(el);
  }
  if (typeof outcome === 'object') return { played: false, reason: 'refused' };
  return { played: true, ...(muted ? { muted } : {}), ...(outcome === 'loading' ? { loading: true } : {}) };
}
