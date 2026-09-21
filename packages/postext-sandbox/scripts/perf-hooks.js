/**
 * Browser-side measurement hooks for the sandbox. Not part of the build.
 *
 * Paste into the DevTools console (works after load: only workers created
 * from then on are named), or better, run it before any page script — e.g.
 * as the `initScript` of a chrome-devtools MCP `navigate_page`, or a
 * DevTools "Sources → Snippets" run right after a hard reload with the
 * debugger paused on the first statement.
 *
 * What it records (all on `window`):
 *   __perfLog    every layout-worker message: {t, dir:'send'|'recv'|'new', worker, kind, id, ms, pages, kb}
 *                (`ms` on a `built` is post→receive; `kb` is the serialized size, computed only for `built`)
 *   __longTasks  `long-animation-frame` entries > 50 ms with their top script attributions
 *   __idb        counts of indexedDB.open and object-store get/getAll/put/add/delete
 *   __fetches    every fetch with its duration
 *   __marks      first canvas paint / editor mount timestamps (ms since navigation)
 *
 * Typical session (from the console or evaluate_script):
 *   __perfLog.length = 0; __longTasks.length = 0; location.hash = '#chapter=35';
 *   // wait for the paint, then:
 *   __perfLog.filter(l => l.kind === 'built');  __longTasks.filter(l => l.ms > 50)
 *
 * The sandbox's own marks (`localStorage.postextPerf = '1'`, see
 * src/perf/marks.ts) complement these with edit→paint and PDF phase spans.
 */
(function () {
  if (window.__perfHooked) return;
  window.__perfHooked = true;
  const log = (window.__perfLog = []);
  const workers = (window.__workers = []);
  window.__marks = { t0: performance.now() };
  const NativeWorker = window.Worker;
  const origPost = NativeWorker.prototype.postMessage;
  const desc = Object.getOwnPropertyDescriptor(NativeWorker.prototype, 'onmessage');
  const pending = new Map();
  function wrapReply(w, fn) {
    return function (ev) {
      const d = ev.data || {};
      const key = w.__name + ':' + (d.id ?? '?');
      const t0 = pending.get(key);
      let kb = 0;
      if (d.kind === 'built') {
        try { kb = Math.round(JSON.stringify(d).length / 1024); } catch {}
      }
      if (d.kind !== 'progress') {
        log.push({
          t: Math.round(performance.now()), dir: 'recv', worker: w.__name, kind: d.kind, id: d.id,
          ms: t0 != null ? Math.round(performance.now() - t0) : null, kb,
          pages: d.doc && d.doc.pages ? d.doc.pages.length : undefined,
          stats: d.stats,
        });
        if (t0 != null) pending.delete(key);
      }
      return fn.call(this, ev);
    };
  }
  window.Worker = class extends NativeWorker {
    constructor(url, opts) {
      super(url, opts);
      this.__name = 'w' + workers.length;
      workers.push(this);
      log.push({ t: Math.round(performance.now()), dir: 'new', worker: this.__name });
    }
  };
  NativeWorker.prototype.postMessage = function (msg, ...rest) {
    const d = msg || {};
    const key = (this.__name || '?') + ':' + (d.id ?? '?');
    pending.set(key, performance.now());
    log.push({ t: Math.round(performance.now()), dir: 'send', worker: this.__name, kind: d.kind, id: d.id });
    return origPost.call(this, msg, ...rest);
  };
  Object.defineProperty(NativeWorker.prototype, 'onmessage', {
    configurable: true,
    get() { return desc.get.call(this); },
    set(fn) { desc.set.call(this, fn ? wrapReply(this, fn) : fn); },
  });
  const origAdd = NativeWorker.prototype.addEventListener;
  NativeWorker.prototype.addEventListener = function (type, fn, ...rest) {
    if (type === 'message' && typeof fn === 'function') fn = wrapReply(this, fn);
    return origAdd.call(this, type, fn, ...rest);
  };

  window.__longTasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__longTasks.push({
          t: Math.round(e.startTime), ms: Math.round(e.duration), block: Math.round(e.blockingDuration || 0),
          scripts: (e.scripts || []).map((s) => (s.invoker || '') + '|' + (s.sourceFunctionName || '') + '|' + Math.round(s.duration)).slice(0, 3),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {}

  window.__idb = { opens: 0 };
  const origOpen = indexedDB.open.bind(indexedDB);
  indexedDB.open = function (...a) { window.__idb.opens++; return origOpen(...a); };
  const OS = window.IDBObjectStore && window.IDBObjectStore.prototype;
  if (OS) {
    for (const m of ['get', 'getAll', 'put', 'add', 'delete']) {
      const o = OS[m];
      OS[m] = function (...a) { window.__idb[m] = (window.__idb[m] || 0) + 1; return o.apply(this, a); };
    }
  }

  const origFetch = window.fetch;
  window.__fetches = [];
  window.fetch = function (...a) {
    const u = String((a[0] && a[0].url) || a[0]);
    const t = performance.now();
    return origFetch.apply(this, a).then((r) => { window.__fetches.push({ u: u.slice(-80), ms: Math.round(performance.now() - t) }); return r; });
  };

  const mo = new MutationObserver(() => {
    const c = document.querySelector('canvas');
    if (c && c.width > 1 && !window.__marks.firstCanvasPaint) window.__marks.firstCanvasPaint = Math.round(performance.now());
    if (document.querySelector('.cm-content') && !window.__marks.editorMounted) window.__marks.editorMounted = Math.round(performance.now());
  });
  const observe = () => mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['width'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe);
  else observe();
})();
