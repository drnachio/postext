// What `pnpm cookbook sandbox --site` runs in the Sandbox's page before the
// page's own scripts, to read the documents its layout workers send.

/** Every layout worker's `build` requests and `built` answers are kept, the
 *  newest document per text built (a chapter is built again when the ones
 *  before it move its start, or when a face arrives late).
 *
 *  The chapter the Sandbox has open is built with tapes (every one since
 *  #1650), and from its second build on the worker sends it as a patch
 *  against the document it sent before (#1642): `doc` is null, and `patch`
 *  names the pages and blocks kept from that document by their place in
 *  it. The document is put together here as the worker's client does. Read
 *  without that, an open chapter stayed at its first build: the one from
 *  before the book's plan settled, or from before a late face (#1682).
 *
 *  The client moves the places in the source of the pages it keeps, in
 *  place. A message's data is one object for every listener, so the pages
 *  held here are the ones it moves. */
export const SITE_HOOK = `(() => {
  const state = (window.__sbSite = { chapters: new Map(), errors: [], lastBuiltAt: 0, seq: 0 });
  const Real = window.Worker;
  window.Worker = class extends Real {
    constructor(url, options) {
      super(url, options);
      const asked = new Map();
      // The document last sent under a number (docSeq), for the patch after it.
      let held = null;
      const post = this.postMessage.bind(this);
      this.postMessage = (data, transfer) => {
        if (data && data.kind === 'build' && data.content) asked.set(data.id, String(data.content.markdown ?? ''));
        return post(data, transfer);
      };
      this.addEventListener('message', (event) => {
        const data = event.data || {};
        if (data.kind === 'built' && asked.has(data.id)) {
          let doc = data.doc;
          if (!doc && data.patch) {
            const base = held && held.seq === data.patch.base ? held.doc : null;
            const from = (list, before) => list.map((item) => (typeof item === 'number' ? before[item] : item));
            if (base) doc = { ...data.patch.rest, pages: from(data.patch.pages, base.pages), blocks: from(data.patch.blocks, base.blocks) };
            else state.errors.push('worker patch: against document ' + data.patch.base + ', which the probe does not hold');
          }
          if (doc) {
            if (data.docSeq !== undefined) held = { seq: data.docSeq, doc };
            state.chapters.set(asked.get(data.id), { doc, seq: state.seq++ });
            state.lastBuiltAt = performance.now();
          }
        }
        if (data.kind === 'error') state.errors.push('worker error: ' + String(data.message ?? data.error ?? '').slice(0, 300));
      });
      this.addEventListener('error', (event) => state.errors.push('worker error: ' + String(event.message ?? 'the layout worker failed').slice(0, 300)));
    }
  };
})()`;
