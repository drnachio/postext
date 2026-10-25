// A SCO's launch page (#1265, #1267): a small player that shows the SCO's
// content documents one at a time (a printed page fitted to the window, or a
// chapter of reflowable text scrolled), and the LMS adapter that keeps the
// reader's place and answers and reports the exercises.
//
// The adapter finds the LMS's API the way SCORM asks (the `API` object of
// SCORM 1.2 or the `API_1484_11` of SCORM 2004, up the chain of parent
// windows, then the opener's). Opened outside an LMS it finds none: the
// player still works and the exercises keep their answers in the browser,
// as an HTML or EPUB book's do.
//
// The content documents' exercise script asks the player (`PostextScorm`
// on the parent window) for the answers' store and tells it each result.
// Like the exercise runtime, the player is one function with nothing from
// outside it, written into the package as its source text.

import type { ScoData, ScormWords } from './types.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- the LMS API and the frames are untyped */
function scormPlayer(): void {
  'use strict';
  const doc = document;
  const win: any = window;
  const holder = doc.getElementById('pt-scorm');
  const data: ScoData = JSON.parse((holder && holder.textContent) || '{}');
  const v2004 = data.version === '2004';
  const words: ScormWords = data.words;

  // --- The LMS -----------------------------------------------------------------

  function findApi(): any {
    const name = v2004 ? 'API_1484_11' : 'API';
    const look = (start: any): any => {
      let w = start;
      for (let i = 0; w && i < 500; i++) {
        try { if (w[name]) return w[name]; } catch (e) { void e; return null; }
        if (!w.parent || w.parent === w) break;
        w = w.parent;
      }
      return null;
    };
    let api = look(win);
    if (!api) {
      try { if (win.opener) api = look(win.opener); } catch (e) { void e; api = null; }
    }
    return api;
  }

  const api = findApi();
  let live = false;
  function lmsCall(method12: string, method2004: string, a?: string, b?: string): string {
    if (!api) return '';
    try {
      const fn = api[v2004 ? method2004 : method12];
      if (typeof fn !== 'function') return '';
      const out = b === undefined ? (a === undefined ? fn.call(api, '') : fn.call(api, a)) : fn.call(api, a, b);
      return out === undefined || out === null ? '' : String(out);
    } catch (e) { void e; return ''; }
  }
  const get = (k: string): string => (live ? lmsCall('LMSGetValue', 'GetValue', k) : '');
  const set = (k: string, v: string | number): boolean => live && lmsCall('LMSSetValue', 'SetValue', k, String(v)) === 'true';
  const commit = (): void => { if (live) lmsCall('LMSCommit', 'Commit'); };
  if (api) live = lmsCall('LMSInitialize', 'Initialize') === 'true';

  const K = v2004
    ? { location: 'cmi.location', entry: 'cmi.entry', exit: 'cmi.exit', time: 'cmi.session_time', score: 'cmi.score.', mastery: 'cmi.scaled_passing_score', response: 'learner_response', when: 'timestamp' }
    : { location: 'cmi.core.lesson_location', entry: 'cmi.core.entry', exit: 'cmi.core.exit', time: 'cmi.core.session_time', score: 'cmi.core.score.', mastery: 'cmi.student_data.mastery_score', response: 'student_response', when: 'time' };
  const started = new Date().getTime();

  // What is kept in `cmi.suspend_data`: the documents seen (`s`), the
  // answers by exercise (`a`), each exercise's last check (`x`: right and
  // total) and, in SCORM 2004, the interaction each one writes (`i`).
  let st: any = { s: '', a: {}, x: {}, i: {} };
  if (live) {
    try {
      const kept = get('cmi.suspend_data');
      if (kept) {
        const parsed = JSON.parse(kept);
        if (parsed && typeof parsed === 'object') st = { s: parsed.s || '', a: parsed.a || {}, x: parsed.x || {}, i: parsed.i || {} };
      }
    } catch (e) { void e; }
  }
  const prefix = data.storageKey + ':';
  const short = (key: string): string => (key.indexOf(prefix) === 0 ? key.slice(prefix.length) : key);
  const owned: Record<string, { points: number; number: string; title?: string }> = {};
  for (let i = 0; i < data.exercises.length; i++) owned[data.exercises[i]!.key] = data.exercises[i]!;
  const limit = v2004 ? 64000 : 4096;

  function local(key: string, value?: string | null): string | null {
    try {
      if (value === undefined) return win.localStorage.getItem(key);
      if (value === null) win.localStorage.removeItem(key); else win.localStorage.setItem(key, value);
    } catch (e) { void e; }
    return null;
  }

  let saveTimer: any = null;
  function save(now?: boolean): void {
    if (!live) return;
    if (saveTimer) { win.clearTimeout(saveTimer); saveTimer = null; }
    const write = (): void => {
      let text = JSON.stringify(st);
      if (text.length > limit) {
        // The answers past the limit stay in this browser (each is also kept
        // there): the LMS keeps the counts of checks and fresh starts.
        const lean: any = {};
        for (const k in st.a) {
          let counts: any = {};
          try { const p = JSON.parse(st.a[k]); counts = { n: p.n, r: p.r, all: p.all, e: p.e, checked: p.checked, c: 1 }; } catch (e) { void e; }
          lean[k] = JSON.stringify(counts);
        }
        text = JSON.stringify({ s: st.s, a: lean, x: st.x, i: st.i });
        if (text.length > limit) text = JSON.stringify({ s: st.s, x: st.x, i: st.i });
      }
      set('cmi.suspend_data', text);
    };
    if (now) write(); else saveTimer = win.setTimeout(() => { saveTimer = null; write(); }, 400);
  }

  /** The answers' store the exercise script uses: the LMS's, with a copy
   *  in this browser. */
  const store = {
    getItem(key: string): string | null {
      const k = short(key);
      const mine = Object.prototype.hasOwnProperty.call(st.a, k) ? st.a[k] : null;
      const here = local(key);
      if (mine === null) return here;
      try {
        const p = JSON.parse(mine);
        // Only the counts reached the LMS: the answers are this browser's.
        if (p && p.c) {
          const h = here ? JSON.parse(here) : {};
          return JSON.stringify({ v: h.v || {}, checked: !!p.checked, n: p.n, r: p.r, all: p.all, e: p.e });
        }
      } catch (e) { void e; }
      return mine;
    },
    setItem(key: string, value: string): void { st.a[short(key)] = value; local(key, value); save(); },
    removeItem(key: string): void { delete st.a[short(key)]; local(key, null); save(); },
  };

  // --- Results -----------------------------------------------------------------

  const round = (v: number, d: number): number => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
  function totals(): { got: number; points: number; done: number; count: number } {
    let got = 0;
    let points = 0;
    let done = 0;
    let count = 0;
    for (const k in owned) {
      const p = owned[k]!.points;
      points += p;
      count++;
      const x = st.x[k];
      if (!x) continue;
      done++;
      if (x[1] > 0) got += (p * x[0]) / x[1];
    }
    return { got, points, done, count };
  }

  function passingScore(): number | null {
    const v = live ? get(K.mastery) : '';
    const n = v === '' ? NaN : parseFloat(v);
    if (!isNaN(n)) return v2004 ? n : n / 100;
    return typeof data.passing === 'number' ? data.passing : null;
  }

  function seenCount(): number {
    let n = 0;
    for (let i = 0; i < st.s.length; i++) if (st.s.charAt(i) === '1') n++;
    return n;
  }

  /** Score, completion and success, as the documents seen and the
   *  exercises checked stand. */
  function report(): void {
    if (!live) return;
    const t = totals();
    const scaled = t.points > 0 ? t.got / t.points : 0;
    if (t.points > 0 && t.done > 0) {
      if (v2004) {
        set('cmi.score.scaled', round(scaled, 4));
        set('cmi.score.raw', round(t.got, 2));
        set('cmi.score.min', 0);
        set('cmi.score.max', t.points);
      } else {
        set('cmi.core.score.raw', round(scaled * 100, 2));
        set('cmi.core.score.min', 0);
        set('cmi.core.score.max', 100);
      }
    }
    const seen = seenCount();
    const complete = seen >= data.docs.length && t.done >= t.count;
    const pass = passingScore();
    if (v2004) {
      set('cmi.completion_status', complete ? 'completed' : 'incomplete');
      set('cmi.success_status', complete && pass !== null && t.points > 0 ? (scaled >= pass ? 'passed' : 'failed') : 'unknown');
      const all = data.docs.length + t.count;
      set('cmi.progress_measure', all > 0 ? round(Math.min(1, (Math.min(seen, data.docs.length) + t.done) / all), 4) : 1);
    } else {
      set('cmi.core.lesson_status', complete ? (pass !== null && t.points > 0 ? (scaled >= pass ? 'passed' : 'failed') : 'completed') : 'incomplete');
    }
  }

  /** A response as the data model takes it. */
  function plain(v: any): string {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.join(' ');
    if (v === true) return 'true';
    if (v === false) return 'false';
    return String(v).replace(/\s+/g, ' ').trim();
  }
  const letter = (n: number): string => 'abcdefghijklmnopqrstuvwxyz'.charAt(n - 1);

  /** The type, response and right answer of an exercise's interaction. */
  function interaction(r: any): { type: string; response: string; pattern: string } {
    const slots = r.slots || [];
    const one = slots.length === 1 ? slots[0] : null;
    if (one && one.kind === 'truefalse') {
      const tf = (v: any): string => (v === 1 ? (v2004 ? 'true' : 't') : v === 2 ? (v2004 ? 'false' : 'f') : '');
      const given = typeof one.value === 'number' ? tf(one.value) : '';
      if (given || one.value === undefined) return { type: 'true-false', response: given, pattern: tf(one.solution) };
    }
    if (one && one.kind === 'choice' && Array.isArray(one.solution)) {
      const ids = (list: any): string => {
        const xs = Array.isArray(list) ? list.slice().sort() : [];
        const out: string[] = [];
        for (let i = 0; i < xs.length; i++) out.push(v2004 ? 'o' + xs[i] : letter(xs[i]));
        return out.join(v2004 ? '[,]' : ',');
      };
      if (v2004 || one.solution.length <= 26) return { type: 'choice', response: ids(one.value), pattern: ids(one.solution) };
    }
    const given: string[] = [];
    const right: string[] = [];
    for (let i = 0; i < slots.length; i++) {
      given.push(plain(slots[i].value).replace(/\[|\]/g, ''));
      right.push(plain(slots[i].solution).replace(/\[|\]/g, ''));
    }
    if (v2004) {
      if (slots.length > 0 && slots.length <= 10) {
        const cut = (xs: string[]): string => { const o: string[] = []; for (let i = 0; i < xs.length; i++) o.push(xs[i]!.slice(0, 250)); return o.join('[,]'); };
        return { type: 'fill-in', response: cut(given), pattern: cut(right) };
      }
      return { type: 'other', response: given.join('; ').slice(0, 4000), pattern: right.join('; ').slice(0, 4000) };
    }
    return { type: 'fill-in', response: given.join('; ').slice(0, 255), pattern: right.join('; ').slice(0, 255) };
  }

  const two = (n: number): string => (n < 10 ? '0' : '') + n;
  function stamp(d: Date): string {
    return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + 'T' + two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
  }

  /** The exercise's interaction, as checked: SCORM 2004 keeps one per
   *  exercise, updated; SCORM 1.2 appends one per check. */
  function record(k: string, r: any): void {
    const ex = owned[k]!;
    const it = interaction(r);
    let n: number;
    if (v2004 && typeof st.i[k] === 'number') n = st.i[k];
    else {
      n = parseInt(get('cmi.interactions._count'), 10);
      if (isNaN(n)) n = 0;
      if (v2004) st.i[k] = n;
    }
    const at = 'cmi.interactions.' + n + '.';
    const id = ('ex-' + k).replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 255);
    set(at + 'id', id);
    set(at + 'type', it.type);
    if (v2004) set(at + 'description', (ex.title ? ex.title : 'Exercise ' + ex.number).slice(0, 250));
    set(at + 'weighting', ex.points);
    if (it.pattern !== '') set(at + 'correct_responses.0.pattern', it.pattern);
    if (it.response !== '' || it.type !== 'true-false') set(at + K.response, it.response);
    set(at + 'result', r.right === r.total && r.total > 0 ? 'correct' : v2004 ? 'incorrect' : 'wrong');
    const now = new Date();
    set(at + K.when, v2004 ? stamp(now) : two(now.getHours()) + ':' + two(now.getMinutes()) + ':' + two(now.getSeconds()));
  }

  /** What the content documents' exercise script tells: an exercise
   *  checked, started again, its solution shown, or set up. */
  function result(r: any): void {
    if (!live) return;
    const k = short(r.key);
    if (!owned[k]) return;
    let changed = false;
    if (r.event === 'check') {
      st.x[k] = [r.right, r.total];
      record(k, r);
      changed = true;
    } else if ((r.event === 'open' && r.checked) || (r.event === 'solution' && r.locked)) {
      // A check made before (in this browser), or an attempt the solution
      // ended: its answers count as they stand.
      if (!st.x[k]) {
        st.x[k] = [r.right, r.total];
        record(k, r);
        changed = true;
      }
    }
    if (!changed) return;
    report();
    save(true);
    commit();
  }

  win.PostextScorm = { live, store, result };

  // --- The player --------------------------------------------------------------

  const fixed = data.layout === 'fixed';
  doc.documentElement.classList.add(fixed ? 'pt-sco-fixed' : 'pt-sco-flow');
  const bar = doc.createElement('div');
  bar.className = 'pt-sco-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', data.title);
  const title = doc.createElement('h1');
  title.className = 'pt-sco-title';
  title.textContent = data.title;
  const contents = doc.createElement('select');
  contents.className = 'pt-sco-toc';
  contents.setAttribute('aria-label', words.contents);
  const head = doc.createElement('option');
  head.value = '';
  head.textContent = words.contents;
  contents.appendChild(head);
  for (let i = 0; i < data.toc.length; i++) {
    const e = data.toc[i]!;
    const o = doc.createElement('option');
    o.value = String(i);
    o.textContent = new Array(e.depth + 1).join('\u00A0\u00A0') + e.label;
    contents.appendChild(o);
  }
  const button = (label: string, glyph: string): any => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'pt-sco-turn';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.textContent = glyph;
    return b;
  };
  // A right-bound book's next page is to the left.
  const flip = !!data.rtl;
  const prev = button(words.previous, flip ? '\u2192' : '\u2190');
  const next = button(words.next, flip ? '\u2190' : '\u2192');
  const where = doc.createElement('span');
  where.className = 'pt-sco-where';
  where.setAttribute('aria-live', 'polite');
  bar.appendChild(title);
  if (data.toc.length > 0) bar.appendChild(contents);
  const turns = doc.createElement('div');
  turns.className = 'pt-sco-turns';
  turns.appendChild(flip ? next : prev);
  turns.appendChild(where);
  turns.appendChild(flip ? prev : next);
  bar.appendChild(turns);
  const stage = doc.createElement('main');
  stage.className = 'pt-sco-stage';
  const sheet = doc.createElement('div');
  sheet.className = 'pt-sco-sheet';
  const frame: any = doc.createElement('iframe');
  frame.className = 'pt-sco-frame';
  frame.setAttribute('title', words.content);
  sheet.appendChild(frame);
  stage.appendChild(sheet);
  doc.body.appendChild(bar);
  doc.body.appendChild(stage);
  const fallback = doc.querySelector('.pt-sco-links');
  if (fallback && fallback.parentNode) fallback.parentNode.removeChild(fallback);

  let at = -1;
  function fit(): void {
    if (!fixed || !data.page) return;
    const w = data.page.width;
    const h = data.page.height;
    const k = Math.min((stage.clientWidth - 16) / w, (stage.clientHeight - 16) / h);
    const scale = k > 0 ? k : 1;
    frame.style.width = w + 'px';
    frame.style.height = h + 'px';
    frame.style.transform = 'scale(' + scale + ')';
    sheet.style.width = Math.floor(w * scale) + 'px';
    sheet.style.height = Math.floor(h * scale) + 'px';
  }

  function seen(i: number): void {
    let s = st.s;
    while (s.length < data.docs.length) s += '0';
    if (s.charAt(i) === '1') return;
    st.s = s.slice(0, i) + '1' + s.slice(i + 1);
    report();
    save(true);
    commit();
  }

  // The frame opens only the package's own documents: a path under
  // `content/` and a plain fragment, never an address of another kind.
  const DOC_PATH = /^content\/[\w\-./]+\.x?html$/;
  const FRAGMENT = /^#[\w\-.:]*$/;

  function show(i: number, hash?: string): void {
    if (i < 0 || i >= data.docs.length) return;
    const href = String(data.docs[i]!.href);
    const fragment = hash && FRAGMENT.test(hash) ? hash : '';
    if (!DOC_PATH.test(href) || href.indexOf('..') >= 0) return;
    const same = i === at && !fragment;
    at = i;
    if (!same) frame.setAttribute('src', href + fragment);
    paint();
  }

  function paint(): void {
    prev.disabled = at <= 0;
    next.disabled = at >= data.docs.length - 1;
    where.textContent = data.docs.length > 1
      ? String(words.position).replace('{n}', data.docs[at] ? data.docs[at]!.label : String(at + 1)).replace('{total}', String(fixed ? data.docs[data.docs.length - 1]!.label : data.docs.length))
      : '';
    if (at >= 0) {
      set(K.location, String(at));
      seen(at);
    }
  }

  prev.addEventListener('click', () => show(at - 1));
  next.addEventListener('click', () => show(at + 1));
  contents.addEventListener('change', () => {
    const e = data.toc[parseInt(contents.value, 10)];
    contents.value = '';
    if (!e) return;
    const hash = e.href.indexOf('#') >= 0 ? e.href.slice(e.href.indexOf('#')) : '';
    show(e.doc, hash);
  });

  function typing(target: any): boolean {
    if (!target || !target.closest) return false;
    return !!target.closest('input,textarea,select,button,[contenteditable],.pt-ex-ui');
  }
  function keys(e: any): void {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return;
    const forward = flip ? 'ArrowLeft' : 'ArrowRight';
    const back = flip ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === forward || (fixed && e.key === 'PageDown')) { show(at + 1); e.preventDefault(); }
    else if (e.key === back || (fixed && e.key === 'PageUp')) { show(at - 1); e.preventDefault(); }
  }
  doc.addEventListener('keydown', keys);
  frame.addEventListener('load', () => {
    // A link followed inside the content: the document it opened.
    let inner: any = null;
    try { inner = frame.contentWindow; } catch (e) { void e; }
    if (!inner) return;
    try {
      const path = String(inner.location.pathname);
      for (let i = 0; i < data.docs.length; i++) {
        const href = data.docs[i]!.href;
        if (path.slice(-href.length) === href && i !== at) { at = i; paint(); break; }
      }
      inner.document.addEventListener('keydown', keys);
    } catch (e) { void e; }
  });
  win.addEventListener('resize', fit);
  fit();

  // The place the reader left, on a return.
  let start = 0;
  if (live && get(K.entry) === (v2004 ? 'resume' : 'resume')) {
    const n = parseInt(get(K.location), 10);
    if (!isNaN(n) && n >= 0 && n < data.docs.length) start = n;
  }
  if (live && !v2004 && get('cmi.core.lesson_status') === 'not attempted') set('cmi.core.lesson_status', 'incomplete');
  show(start);

  // --- Leaving -----------------------------------------------------------------

  let finished = false;
  function duration(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (v2004) return 'PT' + h + 'H' + m + 'M' + r + 'S';
    const hh = h < 10 ? '000' + h : h < 100 ? '00' + h : h < 1000 ? '0' + h : String(Math.min(h, 9999));
    return hh + ':' + two(m) + ':' + two(r);
  }
  function finish(): void {
    if (finished || !live) return;
    finished = true;
    save(true);
    report();
    const t = totals();
    const complete = seenCount() >= data.docs.length && t.done >= t.count;
    set(K.exit, complete ? (v2004 ? 'normal' : '') : 'suspend');
    set(K.time, duration(new Date().getTime() - started));
    commit();
    lmsCall('LMSFinish', 'Terminate');
  }
  win.addEventListener('pagehide', finish);
  win.addEventListener('beforeunload', finish);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The player's script: what each SCO's launch page runs. */
export const PLAYER_SCRIPT = `(${scormPlayer.toString()})();\n`;

/** The player's style sheet. */
export const PLAYER_CSS = `@charset "UTF-8";
html, body { margin: 0; height: 100%; }
body { display: flex; flex-direction: column; background: #e9e9ec; color: #1d1d1f; font: 400 16px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
.pt-sco-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 6px 12px; background: #fff; border-bottom: 1px solid #d2d2d7; }
.pt-sco-title { flex: 1 1 12em; margin: 0; font-size: 1rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-sco-toc { min-height: 44px; max-width: 100%; padding: 0 8px; font: inherit; border: 1px solid #86868b; border-radius: 8px; background: #fff; color: inherit; }
.pt-sco-turns { display: flex; align-items: center; gap: 8px; }
.pt-sco-turn { min-width: 44px; min-height: 44px; font: inherit; font-size: 1.2rem; border: 1px solid #86868b; border-radius: 8px; background: #fff; color: inherit; cursor: pointer; }
.pt-sco-turn:disabled { opacity: .4; cursor: default; }
.pt-sco-turn:focus-visible, .pt-sco-toc:focus-visible { outline: 3px solid #1a5fb4; outline-offset: 2px; }
.pt-sco-where { min-width: 5em; text-align: center; font-variant-numeric: tabular-nums; }
.pt-sco-stage { position: relative; flex: 1 1 auto; min-height: 0; overflow: auto; }
.pt-sco-sheet { position: relative; }
.pt-sco-frame { display: block; border: 0; background: #fff; }
.pt-sco-fixed .pt-sco-stage { display: flex; align-items: center; justify-content: center; overflow: hidden; }
.pt-sco-fixed .pt-sco-sheet { overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.18); }
.pt-sco-fixed .pt-sco-frame { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.pt-sco-flow .pt-sco-stage { overflow: hidden; }
.pt-sco-flow .pt-sco-sheet, .pt-sco-flow .pt-sco-frame { width: 100%; height: 100%; }
.pt-sco-links { padding: 16px 24px; }
@media (prefers-color-scheme: dark) {
  body { background: #1c1c1e; color: #f5f5f7; }
  .pt-sco-bar { background: #2c2c2e; border-color: #3a3a3c; }
  .pt-sco-toc, .pt-sco-turn { background: #3a3a3c; border-color: #636366; }
}
`;

/** The player's words in the book's language. */
const WORDS: Record<string, ScormWords> = {
  en: { previous: 'Previous', next: 'Next', contents: 'Contents', position: '{n} of {total}', content: 'Content' },
  es: { previous: 'Anterior', next: 'Siguiente', contents: 'Índice', position: '{n} de {total}', content: 'Contenido' },
  ca: { previous: 'Anterior', next: 'Següent', contents: 'Índex', position: '{n} de {total}', content: 'Contingut' },
  fr: { previous: 'Précédent', next: 'Suivant', contents: 'Sommaire', position: '{n} sur {total}', content: 'Contenu' },
  de: { previous: 'Zurück', next: 'Weiter', contents: 'Inhalt', position: '{n} von {total}', content: 'Inhalt' },
  it: { previous: 'Precedente', next: 'Successivo', contents: 'Indice', position: '{n} di {total}', content: 'Contenuto' },
  pt: { previous: 'Anterior', next: 'Próximo', contents: 'Sumário', position: '{n} de {total}', content: 'Conteúdo' },
  zh: { previous: '上一页', next: '下一页', contents: '目录', position: '{n} / {total}', content: '内容' },
  ja: { previous: '前へ', next: '次へ', contents: '目次', position: '{n} / {total}', content: '本文' },
  ar: { previous: 'السابق', next: 'التالي', contents: 'المحتويات', position: '{n} من {total}', content: 'المحتوى' },
};

/** The player's words for a BCP 47 language tag. */
export function scormWords(language: string): ScormWords {
  return WORDS[language.toLowerCase().split('-')[0]!] ?? WORDS.en!;
}

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The JSON of a data block, safe inside a `<script>`. */
const scriptJson = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** A SCO's launch page: the player over its documents. `base` is the way
 *  from the page to the package's root (`''` at the root). Without script,
 *  the page lists links to its documents. */
export function scoPage(data: ScoData, base = ''): string {
  return `<!DOCTYPE html>
<html lang="${escapeHtml(data.lang)}" dir="${data.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(data.title === data.book ? data.title : `${data.title} · ${data.book}`)}</title>
<link rel="stylesheet" href="${base}player/player.css">
<script type="application/json" id="pt-scorm">${scriptJson(data)}</script>
<script src="${base}player/player.js" defer></script>
</head>
<body>
<nav class="pt-sco-links"><h1>${escapeHtml(data.title)}</h1><ol>
${data.docs.map((d) => `<li><a href="${escapeHtml(d.href)}">${escapeHtml(d.label)}</a></li>`).join('\n')}
</ol></nav>
</body>
</html>
`;
}
