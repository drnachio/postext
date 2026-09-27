// `<prefix>/[*]postext@<version>[/X-<options>]/<target>/…`: esm.sh's module
// URLs. `*` marks every dependency external (`https://esm.sh/*postext@…`)
// and the `X-…` segment carries `?deps=`, `?external=` or `?alias=`.
const CDN_MODULE_PATH = /^(.*\/)\*?(postext@[^/]+)(?:\/X-[^/]+)?\/(?:es\d{4}|esnext)\//;

/**
 * The URL of the worker entry (`postext/worker/entry`) when the worker
 * client itself was loaded from a CDN on another origin that serves package
 * subpaths at `<origin>/…/postext@<version>/<subpath>` and its built files
 * under a target folder — esm.sh: `https://esm.sh/postext@1.4.2/es2022/worker.mjs`
 * → `https://esm.sh/postext@1.4.2/worker/entry`. Null for anything else: a
 * bundled or same-origin client starts the worker file next to it, as
 * bundlers expect.
 *
 * The entry is always the plain build of that version: a module worker has
 * no import map to resolve the bare imports of an external-dependencies
 * build, and `?deps=` / `?alias=` pins only matter to the page.
 */
export function cdnWorkerEntryUrl(moduleUrl: string, pageOrigin: string | undefined): string | null {
  let url: URL;
  try {
    url = new URL(moduleUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (pageOrigin !== undefined && url.origin === pageOrigin) return null;
  const m = CDN_MODULE_PATH.exec(url.pathname);
  return m ? `${url.origin}${m[1]}${m[2]}/worker/entry` : null;
}
