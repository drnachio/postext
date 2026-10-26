// Font requests on the network: the timeout a fetch is given, the requests
// still unanswered, the stall watch and the loader's state as the status
// bar shows it (#1276: split out of fontLoader.ts).
import { fontsourceId } from '../../../viewport/pdf/fontsourceSlices.js';
import { metadataInFlight } from './catalogue.js';
import { loadingPromises } from './loading.js';

export const FONT_LOAD_TIMEOUT_MS = 3000;

/** The requests for a family's record, its style sheets and its files are
 *  given up when none of them has received anything for this long (#757):
 *  `fetch` has no bound of its own, and a connection that stalls would
 *  hold the layout that waits for the file. The clock is the loader's, not
 *  a request's: a book of some hundred files on a slow line has most of
 *  them waiting their turn while the others arrive, and each is alive as
 *  long as bytes come in for any, a face the page loads for itself
 *  included. A request given up counts as one that failed, asked again
 *  after a while. */
export const FONT_STALL_MS = 15_000;

/** The requests the network did not answer (an error, the bound above),
 *  by URL: not the ones a server answered with a status, which a later
 *  request would get again. */
const unanswered = new Set<string>();

/** The font requests the network has not answered since the page loaded
 *  and that no later request made good. */
export function unansweredFontRequests(): string[] {
  return [...unanswered];
}

/**
 * True when the network did not answer for a file of `urls`, or for what
 * says which files `family` has (its record, its package's style sheet,
 * Google's): the family may have files a later request brings.
 */
export function fontRequestsUnanswered(family: string, urls: readonly string[]): boolean {
  if (unanswered.size === 0) return false;
  if (urls.some((url) => unanswered.has(url))) return true;
  const id = fontsourceId(family);
  const google = `family=${encodeURIComponent(family)}`;
  for (const url of unanswered) {
    if (url.endsWith('.woff2')) continue;
    if (url.endsWith(`/v1/fonts/${id}`) || url.includes(`/@fontsource/${id}@`) || url.includes(`${google}:`) || url.endsWith(google)) return true;
  }
  return false;
}

/** What the loader is waiting for, for a check that asks a page why its
 *  layout does not come (#757). */
export function fontLoaderState(): {
  requestsOut: number; sinceProgressMs: number | null; stallClockArmed: boolean;
  unanswered: string[]; recordsInFlight: string[]; pageLoadsInFlight: string[];
} {
  return {
    requestsOut: requestsOut.size,
    sinceProgressMs: lastFontProgress ? Date.now() - lastFontProgress : null,
    stallClockArmed: stallTimer !== null,
    unanswered: [...unanswered],
    recordsInFlight: [...metadataInFlight.keys()],
    pageLoadsInFlight: [...loadingPromises.keys()],
  };
}

/** The requests out, and when one of them last received something. */
const requestsOut = new Set<AbortController>();
let lastFontProgress = 0;
let stallTimer: ReturnType<typeof setTimeout> | null = null;

export function fontProgress(): void {
  lastFontProgress = Date.now();
}

/** Give the requests out up once `FONT_STALL_MS` pass without a byte. */
function watchForStall(): void {
  if (stallTimer !== null || requestsOut.size === 0) return;
  stallTimer = setTimeout(() => {
    stallTimer = null;
    if (requestsOut.size === 0) return;
    if (Date.now() - lastFontProgress >= FONT_STALL_MS) {
      for (const controller of [...requestsOut]) controller.abort();
      return;
    }
    watchForStall();
  }, Math.max(0, lastFontProgress + FONT_STALL_MS - Date.now()));
}

/** The response with its body read, each chunk counted as progress. A
 *  response without a stream (a test's) is returned as it is. */
async function received(res: Response): Promise<Response> {
  const reader = typeof Response === 'undefined' ? undefined : res.body?.getReader?.();
  if (!reader) return res;
  const chunks: BlobPart[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    fontProgress();
  }
  return new Response(new Blob(chunks), { status: res.status, statusText: res.statusText, headers: res.headers });
}

/** `fetch` and the reading of its body, given up when the loader's
 *  requests stall (`FONT_STALL_MS`). Rejects as `fetch` does. */
export async function fetchWithin<T>(url: string, read: (res: Response) => Promise<T>, init?: RequestInit): Promise<T> {
  if (typeof AbortController === 'undefined') return read(await fetch(url, init));
  const controller = new AbortController();
  // A request sent has the bound to itself at least: the clock starts
  // again, whatever the requests already out have waited.
  fontProgress();
  requestsOut.add(controller);
  watchForStall();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    fontProgress();
    const value = await read(await received(res));
    fontProgress();
    unanswered.delete(url);
    return value;
  } catch (err) {
    unanswered.add(url);
    throw err;
  } finally {
    requestsOut.delete(controller);
    if (requestsOut.size === 0 && stallTimer !== null) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  }
}
