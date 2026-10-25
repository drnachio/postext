/**
 * The exercise script (#1230, #1231): makes the exercises of an HTML or EPUB
 * output answerable, checks the answers and keeps them.
 *
 * The HTML output marks where an exercise is answered — its slots
 * (`.pt-ex-slot[data-pt-ex][data-pt-slot]`, the chips of blanks, options,
 * words) and its boxes (`.pt-ex-box[data-pt-box]`, the outer frame, the
 * writing areas and grids) — and writes the records once, in
 * `<script type="application/json" class="pt-exercises">`. The script lays
 * its controls over those places: an input in a blank or a grid cell, a
 * toggle on an option, lines between the dots of a match, a capsule in a
 * word search, a text area on a writing area, a chooser on a word to sort;
 * and a bar per exercise with Check, Show solution and Try again, a score
 * read out to assistive technology (`aria-live`) and right or wrong marks
 * that do not rest on colour alone (✓ and ✗).
 *
 * The whole runtime is one function with nothing from outside it, so the
 * same code runs from the package (`attachExercises`) and as a standalone
 * script (`EXERCISE_SCRIPT`, its source text). It keeps to syntax every
 * reading system and transpiler leaves as it is: no spread, no `for…of`,
 * no `async`.
 */

import type { ExerciseData } from './digital.js';
import type { ExerciseRecord, ExerciseSlot } from './record.js';

export interface AttachExercisesOptions {
  /** What the answers are kept under (with each exercise's anchor or id):
   *  a book and chapter, say. Default: the page's path. */
  storageKey?: string;
  /** Keep the answers in `localStorage`. Default: the document's
   *  `exercises.digital.persist`. */
  persist?: boolean;
  /** `'button'`: checked on demand; `'instant'`: as answered. Default: the
   *  document's `exercises.digital.check`. */
  check?: 'button' | 'instant';
  /** The exercise data, for a host that patches the pages and so holds
   *  it itself (`HtmlRenderIndex.exercises`); otherwise read from the
   *  `script.pt-exercises` elements under the root. */
  data?: ExerciseData;
}

/** What a reader answered in a slot: text typed, the options ticked
 *  (1-based), a true/false (1 or 2), a mark, a right item of a match, the
 *  ends of the words found in a word search (`r,c-r,c`). */
export type ExerciseValue = string | number | number[] | boolean | string[] | null | undefined;

interface Runtime {
  normalizeAnswer(text: string): string;
  isGraded(slot: ExerciseSlot, record: Pick<ExerciseRecord, 'kind'>): boolean;
  checkSlot(slot: ExerciseSlot, value: ExerciseValue, record: Pick<ExerciseRecord, 'kind'>, trueFalse?: [string, string]): boolean | null;
  solutionValue(slot: ExerciseSlot, record: Pick<ExerciseRecord, 'kind'>, trueFalse?: [string, string]): ExerciseValue;
  actionsOf(record: Pick<ExerciseRecord, 'kind' | 'slots' | 'key' | 'solution'>): { check: boolean; solution: boolean; reset: boolean };
  attach(root: Element | ShadowRoot | Document, options?: AttachExercisesOptions): () => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the DOM side works on untyped JSON and elements of any document */
function exerciseRuntime(): Runtime {
  'use strict';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  // Answers kept here when there is no storage (a private window, a reader
  // that blocks it, `persist: false`).
  const memory: Record<string, string> = {};

  // --- Answers -----------------------------------------------------------------

  /** An answer as compared: compatibility forms folded (full-width
   *  letters and digits), Arabic-Indic digits read as ASCII, curly quotes
   *  straight, spaces collapsed, opening and final punctuation dropped,
   *  lower case. */
  function normalizeAnswer(text: string): string {
    let s = String(text == null ? '' : text);
    if (typeof s.normalize === 'function') s = s.normalize('NFKC');
    s = s.replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660));
    s = s.replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0));
    s = s.replace(/[\u2018\u2019\u02BC\u0060\u00B4]/g, '\'').replace(/[\u201C\u201D\u00AB\u00BB\u201E]/g, '"');
    s = s.split(/\s+/).join(' ');
    // Opening and final punctuation, trimmed one character at a time.
    const lead = ' \u00A1\u00BF';
    const tail = ' .,;:!?\u3002\uFF0E\u3001\uFF01\uFF1F\u2026\u061F\u060C';
    let a = 0;
    let b = s.length;
    while (a < b && lead.indexOf(s.charAt(a)) >= 0) a++;
    while (b > a && tail.indexOf(s.charAt(b - 1)) >= 0) b--;
    return s.slice(a, b).toLowerCase();
  }

  function same(a: string, accept: string[] | undefined): boolean {
    if (!accept) return false;
    const n = normalizeAnswer(a);
    for (let i = 0; i < accept.length; i++) if (normalizeAnswer(accept[i]!) === n) return true;
    return false;
  }

  /** Whether a slot is right or wrong when checked: an open question's
   *  area is only shown its model, and a sort exercise's columns are
   *  filled from the words sorted. */
  function isGraded(slot: ExerciseSlot, record: Pick<ExerciseRecord, 'kind'>): boolean {
    if (slot.kind === 'text') return record.kind !== 'open' && record.kind !== 'sort' && !!slot.accept && slot.accept.length > 0;
    return true;
  }

  /** A true/false answer as 1 (true) or 2 (false), typed or ticked. */
  function truthOf(value: ExerciseValue, labels: [string, string] | undefined): number | null {
    if (value === 1 || value === 2) return value;
    if (typeof value !== 'string' || value.trim() === '') return null;
    if (labels && same(value, [labels[0]])) return 1;
    if (labels && same(value, [labels[1]])) return 2;
    const n = normalizeAnswer(value);
    if (n === '1' || n === 't' || n === 'true' || n === 'v' || n === '\u2713' || n === '\u221A' || n === '\u25CB') return 1;
    if (n === '2' || n === 'f' || n === 'false' || n === '\u2717' || n === '\u00D7' || n === 'x') return 2;
    return 0;
  }

  /** `true` right, `false` wrong, `null` not answered (or not graded). */
  function checkSlot(slot: ExerciseSlot, value: ExerciseValue, record: Pick<ExerciseRecord, 'kind'>, trueFalse?: [string, string]): boolean | null {
    if (!isGraded(slot, record)) return null;
    switch (slot.kind) {
      case 'choice': {
        if (!Array.isArray(value) || value.length === 0) return null;
        const want = (slot.correct || []).slice().sort();
        const got = (value as number[]).slice().sort();
        if (want.length !== got.length) return false;
        for (let i = 0; i < want.length; i++) if (want[i] !== got[i]) return false;
        return true;
      }
      case 'truefalse': {
        const t = truthOf(value, trueFalse);
        if (t === null) return null;
        return t === (slot.correct || [])[0];
      }
      case 'mark':
        if (value !== true) return null;
        return (slot.correct || []).indexOf(1) >= 0;
      case 'pair': {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'number') return value === (slot.correct || [])[0];
        if (typeof value !== 'string') return null;
        if (same(value, slot.accept)) return true;
        return normalizeAnswer(value) === String((slot.correct || [])[0]);
      }
      case 'word': {
        const found = Array.isArray(value) ? (value as string[]) : typeof value === 'string' ? [value] : [];
        if (found.length === 0) return null;
        for (let i = 0; i < found.length; i++) if ((slot.accept || []).indexOf(found[i]!) >= 0) return true;
        return null;
      }
      default: {
        if (typeof value !== 'string' || value.trim() === '') return null;
        if (same(value, slot.accept)) return true;
        // A number written in other digits or with a leading zero.
        if (slot.kind === 'rank' || slot.kind === 'cell') {
          const n = parseInt(normalizeAnswer(value), 10);
          const accept = slot.accept || [];
          for (let i = 0; i < accept.length; i++) if (!isNaN(n) && parseInt(accept[i]!, 10) === n && /^\d+$/.test(accept[i]!)) return true;
        }
        return false;
      }
    }
  }

  /** What a slot holds when its solution is shown. */
  function solutionValue(slot: ExerciseSlot, record: Pick<ExerciseRecord, 'kind'>, trueFalse?: [string, string]): ExerciseValue {
    const accept = slot.accept || [];
    switch (slot.kind) {
      case 'choice': return (slot.correct || []).slice();
      case 'truefalse': return (slot.correct || [])[0];
      case 'mark': return (slot.correct || []).indexOf(1) >= 0;
      case 'pair': return accept.length > 0 ? accept[0] : (slot.correct || [])[0];
      case 'word': return accept.length > 0 ? [accept[0]!] : [];
      case 'text': return record.kind === 'sort' ? accept.join('\n') : accept[0] || '';
      default: {
        void trueFalse;
        return accept[0] || '';
      }
    }
  }

  /** The buttons an exercise's bar needs: a check where an answer is known
   *  for a slot the reader fills, the solution where there is one to show,
   *  a fresh start where there is anything to answer. */
  function actionsOf(record: Pick<ExerciseRecord, 'kind' | 'slots' | 'key' | 'solution'>): { check: boolean; solution: boolean; reset: boolean } {
    let anyMarkRight = false;
    for (let i = 0; i < record.slots.length; i++) if (record.slots[i]!.kind === 'mark' && (record.slots[i]!.correct || []).indexOf(1) >= 0) anyMarkRight = true;
    let check = false;
    let solution = !!record.key || (!!record.solution && record.solution.length > 0);
    let reset = false;
    for (let i = 0; i < record.slots.length; i++) {
      const slot = record.slots[i]!;
      // Room on the printed page only.
      if (slot.bare) continue;
      reset = true;
      const known = slot.kind === 'mark' ? anyMarkRight : (!!slot.correct && slot.correct.length > 0) || (!!slot.accept && slot.accept.length > 0);
      if (!known) continue;
      solution = true;
      if (isGraded(slot, record)) check = true;
    }
    return { check, solution, reset };
  }

  // --- Storage -----------------------------------------------------------------

  function load(key: string, persist: boolean): any {
    let text: string | null = null;
    if (persist) {
      try { text = window.localStorage.getItem(key); } catch (e) { void e; text = null; }
    }
    if (text === null && Object.prototype.hasOwnProperty.call(memory, key)) text = memory[key]!;
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { void e; return null; }
  }

  function save(key: string, persist: boolean, state: any): void {
    const text = JSON.stringify(state);
    memory[key] = text;
    if (!persist) return;
    try { window.localStorage.setItem(key, text); } catch (e) { void e; }
  }

  function forget(key: string, persist: boolean): void {
    delete memory[key];
    if (!persist) return;
    try { window.localStorage.removeItem(key); } catch (e) { void e; }
  }

  // --- The page ----------------------------------------------------------------

  const CSS =
    '.pt-ex-ui{pointer-events:auto;box-sizing:border-box;z-index:1;}' +
    '.pt-ex-field{position:absolute;display:block;}' +
    '.pt-ex-input{position:absolute;left:0;top:0;width:100%;height:100%;margin:0;padding:0 .15em;border:0;border-radius:.15em;background:transparent;color:var(--pt-ex-text,#1d1d1f);font:inherit;line-height:1;text-align:center;box-sizing:border-box;}' +
    // Focus rings, ticks and rings are drawn inside the slot: a page that
    // clips at its edge (the Sandbox's HTML tab) cuts nothing.
    '.pt-ex-input:focus{background:rgba(255,255,255,.9);outline:2px solid #1a5fb4;outline-offset:-2px;}' +
    'textarea.pt-ex-input{text-align:start;resize:none;overflow:hidden;background:transparent;padding:0 .2em;color:var(--pt-ex-text,#1d1d1f);}' +
    'textarea.pt-ex-input:focus{background:rgba(255,255,255,.35);}' +
    '.pt-ex-cell{text-transform:uppercase;}' +
    '.pt-ex-toggle{cursor:pointer;pointer-events:auto;}' +
    '.pt-ex-toggle:focus-visible{outline:2px solid #1a5fb4;outline-offset:-2px;}' +
    '.pt-ex-on.pt-ex-ring,.pt-ex-on.pt-ex-mk-circle{box-shadow:inset 0 0 0 .1em var(--pt-ex-ring,currentColor);border-radius:999px;}' +
    '.pt-ex-on.pt-ex-mk-box{box-shadow:inset 0 0 0 .09em var(--pt-ex-ring,currentColor);}' +
    '.pt-ex-on.pt-ex-mk-underline{box-shadow:inset 0 -.12em 0 var(--pt-ex-ring,currentColor);}' +
    '.pt-ex-on.pt-ex-mk-highlight{background:rgba(255,214,0,.45);}' +
    '.pt-ex-on.pt-ex-mk-strike{background:linear-gradient(transparent 46%,currentColor 46%,currentColor 56%,transparent 56%);}' +
    '.pt-ex-on.pt-ex-tick::after{content:"\\2713";position:absolute;left:0;right:0;top:50%;transform:translateY(-55%);text-align:center;line-height:1;font-weight:700;}' +
    '.pt-ex-revealed,.pt-ex-revealed .pt-ex-input{color:var(--pt-ex-answer,#d6246e);}' +
    '.pt-ex-right{--pt-ex-ring:var(--pt-ex-right,#1e8e3e);outline-color:var(--pt-ex-right,#1e8e3e)!important;}' +
    '.pt-ex-wrong{--pt-ex-ring:var(--pt-ex-wrong,#c5221f);outline-color:var(--pt-ex-wrong,#c5221f)!important;}' +
    '.pt-ex-field.pt-ex-right .pt-ex-input,textarea.pt-ex-right{box-shadow:inset 0 -.12em 0 var(--pt-ex-right,#1e8e3e);}' +
    '.pt-ex-field.pt-ex-wrong .pt-ex-input,textarea.pt-ex-wrong{box-shadow:inset 0 -.12em 0 var(--pt-ex-wrong,#c5221f);}' +
    // A right or wrong mark stands on its slot's top corner, over the line
    // gap rather than the next word, slid onto the page at its edge (see
    // `placeMark`).
    '.pt-ex-mark{position:absolute;left:100%;top:0;transform:translate(-55%,-60%);font:700 .62em/1 system-ui,sans-serif;padding:.12em .2em;border-radius:999px;color:#fff;pointer-events:none;z-index:2;white-space:nowrap;}' +
    '.pt-ex-mark.pt-ex-ok{background:var(--pt-ex-right,#1e8e3e);}' +
    '.pt-ex-mark.pt-ex-no{background:var(--pt-ex-wrong,#c5221f);}' +
    '.pt-ex-bar{position:absolute;right:0;top:100%;margin-top:.2em;display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:.35em;font:400 1em/1.2 system-ui,sans-serif;color:#1d1d1f;z-index:3;}' +
    '.pt-ex-bar:not(.pt-ex-flow){padding:.15em;border-radius:999px;background:rgba(255,255,255,.85);}' +
    '.pt-ex-bar button{font:inherit;margin:0;padding:.18em .6em;border:1px solid rgba(0,0,0,.35);border-radius:999px;background:#fff;color:#1d1d1f;cursor:pointer;}' +
    '.pt-ex-bar button:hover{background:#f1f1f3;}' +
    '.pt-ex-bar button:focus-visible{outline:2px solid #1a5fb4;outline-offset:2px;}' +
    '.pt-ex-score{padding:.18em .5em;font-weight:600;border-radius:999px;background:rgba(255,255,255,.9);}' +
    '.pt-ex-score:empty{display:none;}' +
    '.pt-ex-panel{position:absolute;left:0;right:0;top:100%;margin-top:2.1em;padding:.6em .8em;background:#fff;color:#1d1d1f;border:1px solid rgba(0,0,0,.2);border-radius:.4em;box-shadow:0 .3em 1em rgba(0,0,0,.15);font:400 1em/1.35 system-ui,sans-serif;z-index:4;}' +
    '.pt-ex-panel p{margin:.2em 0;}' +
    '.pt-ex-panel .pt-ex-key{font-weight:600;color:var(--pt-ex-answer,#d6246e);}' +
    '.pt-ex-menu{position:absolute;left:0;top:100%;margin-top:.2em;display:flex;flex-direction:column;min-width:8em;padding:.2em;background:#fff;border:1px solid rgba(0,0,0,.25);border-radius:.3em;box-shadow:0 .2em .6em rgba(0,0,0,.18);font:400 .8em/1.2 system-ui,sans-serif;z-index:5;}' +
    '.pt-ex-menu button{font:inherit;text-align:start;padding:.3em .5em;border:0;background:none;color:#1d1d1f;cursor:pointer;border-radius:.2em;}' +
    '.pt-ex-menu button:hover,.pt-ex-menu button:focus{background:#eef2fb;}' +
    // A sort exercise: a word sorted fades in the bank and stands in its
    // column; words are dragged from the bank to a column and back.
    '.pt-ex-drag{touch-action:none;user-select:none;-webkit-user-select:none;}' +
    // The word is painted under its slot: a veil fades it.
    '.pt-ex-sorted{background:rgba(255,255,255,.62);border-radius:.25em;}' +
    // A chip set in a flow holds its own text, which a veil would not cover.
    '.pt-ex-faded{opacity:.42;}' +
    '.pt-ex-col{position:absolute;left:0;top:0;width:100%;height:100%;box-sizing:border-box;padding:0 .2em;color:var(--pt-ex-text,#1d1d1f);border-radius:.2em;}' +
    '.pt-ex-placed{display:table;cursor:grab;white-space:nowrap;}' +
    '.pt-ex-placed.pt-ex-right{color:var(--pt-ex-right,#1e8e3e);}' +
    '.pt-ex-placed.pt-ex-wrong{color:var(--pt-ex-wrong,#c5221f);}' +
    '.pt-ex-col.pt-ex-revealed,.pt-ex-col.pt-ex-revealed .pt-ex-placed{color:var(--pt-ex-answer,#d6246e);cursor:default;}' +
    '.pt-ex-drop{background:rgba(26,95,180,.08);box-shadow:inset 0 0 0 2px rgba(26,95,180,.55);}' +
    '.pt-ex-svg{position:absolute;left:0;top:0;overflow:visible;}' +
    '.pt-ex-layer{position:absolute;left:0;top:0;transform-origin:0 0;}' +
    // The controls of a mirrored flow (a right-to-left page of the HTML
    // viewer) turn back about their own centres, as its text does (#1244).
    '.pt-flow-mirrored .pt-ex-ui:not(svg){transform:scaleX(-1);}' +
    '.pt-ex-dot{fill:transparent;stroke:transparent;cursor:pointer;pointer-events:all;touch-action:none;user-select:none;-webkit-user-select:none;}' +
    '.pt-ex-dot:hover{fill:rgba(26,95,180,.12);}' +
    '.pt-ex-dot.pt-ex-pending{fill:rgba(26,95,180,.2);stroke:#1a5fb4;stroke-width:2.5;}' +
    '.pt-ex-dot:focus{outline:none;stroke:#1a5fb4;stroke-width:2.5;}' +
    '.pt-ex-bar.pt-ex-flow{position:static;justify-content:flex-start;margin-top:.6em;font-size:.8em;}' +
    '.pt-ex-panel.pt-ex-flow{position:static;margin-top:.5em;box-shadow:none;font-size:.9em;}' +
    '.pt-ex-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}';

  function addStyle(root: any): () => void {
    const doc: Document = root.nodeType === 9 ? root : root.ownerDocument;
    // An element in a shadow tree (the Sandbox's HTML tab draws its pages
    // in one, #1249) takes the rules in that tree: the document's head
    // doesn't reach it.
    const top: any = root.nodeType === 1 && typeof root.getRootNode === 'function' ? root.getRootNode() : root;
    const host: any = top.nodeType === 11 ? top : doc.head || doc.documentElement;
    if (!host || (host.querySelector && host.querySelector('style.pt-ex-style'))) return () => undefined;
    const style = doc.createElement('style');
    style.setAttribute('class', 'pt-ex-style');
    style.textContent = CSS;
    host.appendChild(style);
    return () => { if (style.parentNode) style.parentNode.removeChild(style); };
  }

  function attach(root: any, options?: AttachExercisesOptions): () => void {
    const opts = options || {};
    const doc: Document = root.nodeType === 9 ? root : root.ownerDocument;
    const cleanups: Array<() => void> = [];
    cleanups.push(addStyle(root));
    const scopes: Array<{ scope: any; data: ExerciseData; key?: string }> = [];
    if (opts.data) {
      scopes.push({ scope: root, data: opts.data });
    } else {
      const scripts = root.querySelectorAll('script.pt-exercises');
      for (let i = 0; i < scripts.length; i++) {
        let data: ExerciseData | null = null;
        try { data = JSON.parse(scripts[i].textContent || ''); } catch (e) { void e; data = null; }
        if (!data || !data.exercises) continue;
        const holder = scripts[i].parentNode;
        // The output may say what the answers are kept under (an EPUB:
        // the book, so an exercise split over two page files is one).
        const key = scripts[i].getAttribute('data-storage-key');
        scopes.push({ scope: holder && holder !== root && holder.nodeType === 1 ? holder : root, data, ...(key ? { key } : {}) });
      }
    }
    const base = opts.storageKey || ('pt-ex:' + (typeof location !== 'undefined' ? location.pathname : ''));
    for (let k = 0; k < scopes.length; k++) {
      const data = scopes[k]!.data;
      if (data.interactive === false) continue;
      // Several documents on one page (a book's chapters): each keeps its
      // answers apart, as their exercise ids may meet.
      const own = scopes[k]!.key;
      const scopeKey = opts.storageKey ? base + (scopes.length > 1 ? ':' + k : '') : own || base + (scopes.length > 1 ? ':' + k : '');
      for (let j = 0; j < data.exercises.length; j++) setUp(scopes[k]!.scope, data, data.exercises[j]!, scopeKey, opts, doc, cleanups);
      const scope = scopes[k]!.scope;
      cleanups.push(() => {
        const left = scope.querySelectorAll('.pt-ex-mark,.pt-ex-menu');
        for (let i = 0; i < left.length; i++) if (left[i].parentNode) left[i].parentNode.removeChild(left[i]);
      });
    }
    let done = false;
    return () => {
      if (done) return;
      done = true;
      for (let i = cleanups.length - 1; i >= 0; i--) {
        try { cleanups[i]!(); } catch (e) { void e; }
      }
    };
  }

  /** The text of the line an element stands on (a paragraph or a list
   *  item in a reflowable book), for its accessible name. */
  function lineText(el: any): string {
    let line = el.parentNode;
    while (line && line.nodeType === 1 && !line.classList.contains('pt-line') && !/^(p|li|td|th|dd|dt)$/i.test(line.localName || '')) line = line.parentNode;
    if (line && line.nodeType !== 1) line = null;
    const text = String((line || el).textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > 80 ? text.slice(0, 79) + '\u2026' : text;
  }

  /** The text a chip shows: the runs right after its slot, inside its box;
   *  in a flow (a reflowable book), the chip's own text (#1263). */
  function chipText(el: any): string {
    const own = String(el.textContent || '').replace(/\s+/g, ' ').trim();
    if (own) return own;
    const right = parseFloat(el.style.left || '0') + parseFloat(el.style.width || '0');
    let text = '';
    let n = el.nextSibling;
    while (n) {
      if (n.nodeType === 1) {
        if (n.classList && n.classList.contains('pt-ex-slot')) break;
        const left = parseFloat(n.style && n.style.left ? n.style.left : 'NaN');
        if (!isNaN(left) && left >= right - 0.5) break;
        text += n.textContent || '';
      }
      n = n.nextSibling;
    }
    return text.replace(/\s+/g, ' ').trim();
  }

  function px(v: number): string { return (Math.round(v * 1000) / 1000) + 'px'; }

  function setUp(scope: any, data: ExerciseData, rec: ExerciseRecord, base: string, opts: AttachExercisesOptions, doc: Document, cleanups: Array<() => void>): any {
    const id = String(rec.id);
    const outers = scope.querySelectorAll('.pt-ex-box[data-pt-exercise="' + id + '"]');
    const slotEls: Record<string, any> = {};
    const found = scope.querySelectorAll('.pt-ex-slot[data-pt-ex="' + id + '"]');
    for (let i = 0; i < found.length; i++) slotEls[found[i].getAttribute('data-pt-slot')] = found[i];
    const boxEls: Record<string, any> = {};
    const boxes = scope.querySelectorAll('.pt-ex-box[data-pt-ex="' + id + '"]');
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i].getAttribute('data-pt-box');
      if (!boxEls[b]) boxEls[b] = boxes[i];
    }
    if (outers.length === 0 && found.length === 0) return null;
    const persist = opts.persist !== undefined ? opts.persist : data.persist !== false;
    const instant = (opts.check || data.check) === 'instant';
    const words: any = data.words || {};
    const look = (data.styles && data.styles[rec.style]) || { correct: '#1e8e3e', wrong: '#c5221f', answer: '#d6246e', ink: 'currentColor', marker: 'none', trueFalse: words.trueFalse || ['T', 'F'] };
    const tf: [string, string] = look.trueFalse;
    const exName = (words.exercise || 'Exercise') + ' ' + rec.number;
    const key = base + ':' + (rec.anchor || '#' + rec.ordinal + '.' + rec.id);
    const saved = load(key, persist) || {};
    const state: any = { v: saved.v || {}, checked: !!saved.checked, revealed: false };
    const ppt = data.pxPerPt || 1;
    const body = data.bodyPx || 16;
    const flow = data.flow === true;
    // A right-to-left page the HTML viewer paints as a mirrored flow (#1244).
    const mirroredFlow = !!(outers[0] || found[0] || { closest: () => null }).closest('.pt-flow-mirrored');
    // The answer key written for a reader with no script: the bar's own
    // takes its place.
    const statics = scope.querySelectorAll('.pt-ex-static[data-pt-ex="' + id + '"]');
    for (let i = 0; i < statics.length; i++) setAttr(statics[i], 'hidden', 'hidden');
    // The font of the exercise's text, for what is written on its areas.
    const firstLine = scope.querySelector('.pt-line');
    const textFont = firstLine && firstLine.style ? firstLine.style.fontFamily : '';
    // A drawn box of a reflowable book is set in ems (#1244): its controls
    // go on a layer of the size it prints (`data-pt-w`, `data-pt-h`),
    // scaled to the box as the reader sizes the text.
    if (flow) {
      for (const b in boxEls) {
        const box = boxEls[b];
        const w = parseFloat(box.getAttribute('data-pt-w') || '');
        const h = parseFloat(box.getAttribute('data-pt-h') || '');
        if (!(w > 0) || !(h > 0)) continue;
        const layer = own(el('div', 'pt-ex-layer', box));
        layer.style.width = px(w);
        layer.style.height = px(h);
        const fit = (): void => {
          const k = box.clientWidth / w;
          layer.style.transform = k > 0 && Math.abs(k - 1) > 0.001 ? 'scale(' + k + ')' : '';
        };
        fit();
        const view: any = doc.defaultView;
        if (view && view.ResizeObserver) {
          const ro = new view.ResizeObserver(fit);
          ro.observe(box);
          cleanups.push(() => ro.disconnect());
        } else if (view) {
          view.addEventListener('resize', fit);
          cleanups.push(() => view.removeEventListener('resize', fit));
        }
        boxEls[b] = layer;
      }
    }

    function el(tag: string, cls: string, parent?: any): any {
      const e = doc.createElement(tag);
      e.setAttribute('class', cls);
      if (parent) parent.appendChild(e);
      return e;
    }
    function svg(tag: string, attrs: Record<string, string | number>, parent?: any): any {
      const e = doc.createElementNS(SVG_NS, tag);
      for (const a in attrs) if (Object.prototype.hasOwnProperty.call(attrs, a)) e.setAttribute(a, String(attrs[a]));
      if (parent) parent.appendChild(e);
      return e;
    }
    function colours(e: any): void {
      if (data.text) e.style.setProperty('--pt-ex-text', data.text);
      e.style.setProperty('--pt-ex-right', look.correct);
      e.style.setProperty('--pt-ex-wrong', look.wrong);
      e.style.setProperty('--pt-ex-answer', look.answer);
    }
    function own(e: any): any {
      cleanups.push(() => { if (e.parentNode) e.parentNode.removeChild(e); });
      return e;
    }
    /** Changes an attribute of a page element, put back on detach. */
    function setAttr(e: any, name: string, value: string | null): void {
      const before = e.getAttribute(name);
      if (value === null) e.removeAttribute(name); else e.setAttribute(name, value);
      cleanups.push(() => { if (before === null) e.removeAttribute(name); else e.setAttribute(name, before); });
    }
    function addClass(e: any, cls: string): void {
      if (e.classList.contains(cls)) return;
      e.classList.add(cls);
      cleanups.push(() => e.classList.remove(cls));
    }
    function badge(holder: any, ok: boolean | null): void {
      const old = holder.querySelector(':scope > .pt-ex-mark');
      if (old) old.parentNode.removeChild(old);
      holder.classList.remove('pt-ex-right', 'pt-ex-wrong');
      if (ok === null) return;
      holder.classList.add(ok ? 'pt-ex-right' : 'pt-ex-wrong');
      const m = el('span', 'pt-ex-mark ' + (ok ? 'pt-ex-ok' : 'pt-ex-no'), holder);
      m.setAttribute('aria-hidden', 'true');
      m.textContent = ok ? '\u2713' : '\u2717';
      placeMark(m, holder);
    }

    /** A mark slid onto the page where its corner place would cross the
     *  page's edge (a page that clips, as the Sandbox's does). */
    function placeMark(m: any, holder: any): void {
      const page = typeof holder.closest === 'function' ? holder.closest('.pt-page') : null;
      if (!page || typeof m.getBoundingClientRect !== 'function') return;
      const pr = page.getBoundingClientRect();
      const r = m.getBoundingClientRect();
      if (r.width === 0) return;
      // Screen pixels per CSS pixel of the page (a page shown scaled).
      const k = m.offsetWidth > 0 ? r.width / m.offsetWidth : 1;
      const dx = r.right > pr.right - 1 ? pr.right - 1 - r.right : r.left < pr.left + 1 ? pr.left + 1 - r.left : 0;
      const dy = r.top < pr.top + 1 ? pr.top + 1 - r.top : 0;
      if (dx !== 0 || dy !== 0) m.style.transform = 'translate(calc(-55% + ' + (dx / k).toFixed(1) + 'px),calc(-60% + ' + (dy / k).toFixed(1) + 'px))';
    }

    const widgets: any[] = [];
    let blankN = 0;

    /** An input over a slot's box: a blank, an order number, a letter of a
     *  match or a true/false bracket. */
    function inputOn(slot: ExerciseSlot, target: any): void {
      blankN++;
      setAttr(target, 'role', null);
      setAttr(target, 'aria-label', null);
      addClass(target, 'pt-ex-ui');
      // A blank may bring its input (a reflowable book's, typed into with
      // no script): it is used as it is.
      const given = target.querySelector('input');
      const input = given || own(el('input', 'pt-ex-input pt-ex-ui', target));
      if (given) addClass(given, 'pt-ex-ui');
      input.setAttribute('type', 'text');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('spellcheck', 'false');
      input.setAttribute('aria-label', (words.blank || 'blank') + ' ' + blankN + ', ' + exName);
      if (slot.kind === 'rank') input.setAttribute('inputmode', 'numeric');
      colours(target);
      input.addEventListener('input', () => changed(slot, input.value));
      widgets.push({
        slot,
        paint(v: ExerciseValue) { input.value = typeof v === 'string' ? v : v === undefined || v === null ? '' : slot.kind === 'truefalse' ? tf[(v as number) - 1] || '' : String(v); },
        lock(on: boolean) { input.readOnly = on; target.classList.toggle('pt-ex-revealed', on); },
        mark(ok: boolean | null) { badge(target, ok); if (ok === false) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); },
      });
    }

    /** Toggles on the option chips of a choice (or the boxes of a
     *  true/false): one at a time unless several are right. */
    function toggles(slot: ExerciseSlot, targets: any[], values: number[], cls: string, multiple: boolean): void {
      const role = multiple ? 'checkbox' : 'radio';
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const value = values[i]!;
        setAttr(t, 'role', role);
        setAttr(t, 'tabindex', '0');
        setAttr(t, 'aria-checked', 'false');
        // A word of its own (an inline choice) names it; a bare label or
        // box, the line it stands on.
        const word = chipText(t);
        setAttr(t, 'aria-label', (slot.kind === 'truefalse' ? tf[value - 1] + ' \u2014 ' : '') + (word.length > 2 ? word : lineText(t)));
        addClass(t, 'pt-ex-toggle');
        addClass(t, 'pt-ex-ui');
        addClass(t, cls);
        colours(t);
        const flip = (): void => {
          if (state.revealed) return;
          const cur = state.v[slot.key];
          let next: ExerciseValue;
          if (slot.kind === 'truefalse') next = cur === value ? null : value;
          else {
            const list: number[] = Array.isArray(cur) ? (cur as number[]).slice() : [];
            const at = list.indexOf(value);
            if (at >= 0) list.splice(at, 1);
            else if (multiple) list.push(value);
            else { list.length = 0; list.push(value); }
            next = list;
          }
          changed(slot, next);
        };
        const onKey = (e: KeyboardEvent): void => {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
        };
        t.addEventListener('click', flip);
        t.addEventListener('keydown', onKey);
        cleanups.push(() => { t.removeEventListener('click', flip); t.removeEventListener('keydown', onKey); });
      }
      const on = (v: ExerciseValue, value: number): boolean => (slot.kind === 'truefalse' ? v === value : Array.isArray(v) && (v as number[]).indexOf(value) >= 0);
      widgets.push({
        slot,
        paint(v: ExerciseValue) {
          for (let i = 0; i < targets.length; i++) {
            const sel = on(v, values[i]!);
            targets[i].classList.toggle('pt-ex-on', sel);
            targets[i].setAttribute('aria-checked', sel ? 'true' : 'false');
          }
        },
        lock(lock: boolean) { for (let i = 0; i < targets.length; i++) targets[i].classList.toggle('pt-ex-revealed', lock); },
        mark(ok: boolean | null) {
          const v = state.v[slot.key];
          for (let i = 0; i < targets.length; i++) {
            if (ok === null || !on(v, values[i]!)) { badge(targets[i], null); continue; }
            // Each option ticked says whether it is one of the right ones
            // (the score says whether the question is answered whole).
            badge(targets[i], slot.kind === 'truefalse' ? ok : (slot.correct || []).indexOf(values[i]!) >= 0);
          }
        },
      });
    }

    /** A word to mark: a toggle in the exercise's mark. */
    function markToggle(slot: ExerciseSlot, t: any): void {
      setAttr(t, 'role', 'checkbox');
      setAttr(t, 'tabindex', '0');
      setAttr(t, 'aria-checked', 'false');
      setAttr(t, 'aria-label', chipText(t) || lineText(t));
      addClass(t, 'pt-ex-toggle');
      addClass(t, 'pt-ex-ui');
      addClass(t, 'pt-ex-mk-' + (rec.mark || 'circle'));
      colours(t);
      const flip = (): void => { if (!state.revealed) changed(slot, state.v[slot.key] === true ? null : true); };
      const onKey = (e: KeyboardEvent): void => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } };
      t.addEventListener('click', flip);
      t.addEventListener('keydown', onKey);
      cleanups.push(() => { t.removeEventListener('click', flip); t.removeEventListener('keydown', onKey); });
      widgets.push({
        slot,
        paint(v: ExerciseValue) { t.classList.toggle('pt-ex-on', v === true); t.setAttribute('aria-checked', v === true ? 'true' : 'false'); },
        lock(on: boolean) { t.classList.toggle('pt-ex-revealed', on); },
        mark(ok: boolean | null) { badge(t, ok); },
      });
    }

    /** The categories of a sort exercise, in the order of its columns. */
    const categories: string[] = [];
    for (let i = 0; i < rec.slots.length; i++) {
      const s = rec.slots[i]!;
      if (s.kind === 'category' && s.accept && s.accept[0] !== undefined && categories.indexOf(s.accept[0]) < 0) categories.push(s.accept[0]);
    }
    const columnWidgets: any[] = [];
    function refreshColumns(): void {
      if (columnWidgets.length === 0) return;
      const lists: any[][] = categories.map(() => []);
      for (let i = 0; i < widgets.length; i++) {
        const w = widgets[i];
        if (w.slot.kind !== 'category') continue;
        const v = state.revealed ? solutionValue(w.slot, rec) : state.v[w.slot.key];
        const at = typeof v === 'string' ? categories.indexOf(v) : -1;
        if (at >= 0 && w.word) lists[at]!.push(w);
      }
      for (let i = 0; i < columnWidgets.length; i++) columnWidgets[i].show(lists[i] || []);
    }

    /** The category of the column under a point of the screen: `undefined`
     *  off every column. The words set above a column's area (its heading)
     *  count as the column. */
    function columnAt(x: number, y: number): number | undefined {
      for (let i = 0; i < columnWidgets.length; i++) {
        const r = columnWidgets[i].col.getBoundingClientRect();
        const above = Math.min(r.height, body * 3 * (r.height / (columnWidgets[i].col.offsetHeight || r.height || 1)));
        if (x >= r.left && x <= r.right && y >= r.top - above && y <= r.bottom) return i;
      }
      return undefined;
    }

    /** Dragging a word of a sort exercise (from the bank or from a column)
     *  onto a column sorts it there; a word dragged out of its column goes
     *  back to the bank. A press with no drag is left to the click. Returns
     *  whether the click that follows a drag is to be ignored. */
    function dragWord(t: any, slot: ExerciseSlot, word: string, fromColumn: boolean): () => boolean {
      let start: [number, number] | null = null;
      let ghost: any = null;
      let over = -1;
      let dragged = false;
      // Where the ghost's left and top of 0 stand on the screen, and screen
      // pixels per CSS pixel: the document may be zoomed.
      let origin: [number, number] = [0, 0];
      let scale = 1;
      addClass(t, 'pt-ex-drag');
      const highlight = (i: number): void => {
        if (i === over) return;
        if (over >= 0 && columnWidgets[over]) columnWidgets[over].col.classList.remove('pt-ex-drop');
        over = i;
        if (over >= 0 && columnWidgets[over]) columnWidgets[over].col.classList.add('pt-ex-drop');
      };
      const end = (): void => {
        start = null;
        if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
        ghost = null;
        highlight(-1);
      };
      const down = (e: PointerEvent): void => {
        if (state.revealed || e.button > 0) return;
        start = [e.clientX, e.clientY];
        dragged = false;
        // The pointer's moves come here wherever it goes.
        if (typeof t.setPointerCapture === 'function') { try { t.setPointerCapture(e.pointerId); } catch { /* a pointer gone */ } }
      };
      const move = (e: PointerEvent): void => {
        if (!start) return;
        if (!ghost) {
          if (Math.abs(e.clientX - start[0]) + Math.abs(e.clientY - start[1]) < 6) return;
          // The word follows the pointer, set at the size the page shows it
          // (the page may be scaled, and the ghost lives outside it).
          const r = t.getBoundingClientRect();
          ghost = doc.createElement('span');
          ghost.textContent = word;
          ghost.setAttribute('aria-hidden', 'true');
          const st = ghost.style;
          st.position = 'fixed';
          st.zIndex = '2147483647';
          st.pointerEvents = 'none';
          st.transform = 'translate(-50%,-50%)';
          st.padding = '.1em .4em';
          st.borderRadius = '.3em';
          st.border = '1px solid rgba(0,0,0,.35)';
          st.background = '#fff';
          st.color = data.text || '#1d1d1f';
          st.boxShadow = '0 .2em .6em rgba(0,0,0,.25)';
          st.whiteSpace = 'nowrap';
          st.fontFamily = textFont || 'system-ui,sans-serif';
          st.left = '0';
          st.top = '0';
          (doc.body || doc.documentElement).appendChild(ghost);
          const g0 = ghost.getBoundingClientRect();
          st.left = '100px';
          const g1 = ghost.getBoundingClientRect();
          scale = (g1.left - g0.left) / 100 || 1;
          origin = [g0.left + g0.width / 2, g0.top + g0.height / 2];
          st.fontSize = px(Math.max(12, r.height * (fromColumn ? 0.75 : 0.62)) / scale);
          dragged = true;
        }
        e.preventDefault();
        ghost.style.left = px((e.clientX - origin[0]) / scale);
        ghost.style.top = px((e.clientY - origin[1]) / scale);
        const at = columnAt(e.clientX, e.clientY);
        highlight(at === undefined ? -1 : at);
      };
      const up = (e: PointerEvent): void => {
        if (!start) return;
        const was = !!ghost;
        const at = was ? columnAt(e.clientX, e.clientY) : undefined;
        end();
        if (!was) return;
        if (at !== undefined) changed(slot, categories[at]!);
        else if (fromColumn) changed(slot, null);
      };
      t.addEventListener('pointerdown', down);
      t.addEventListener('pointermove', move);
      t.addEventListener('pointerup', up);
      t.addEventListener('pointercancel', end);
      cleanups.push(() => {
        end();
        t.removeEventListener('pointerdown', down);
        t.removeEventListener('pointermove', move);
        t.removeEventListener('pointerup', up);
        t.removeEventListener('pointercancel', end);
      });
      return () => { const d = dragged; dragged = false; return d; };
    }

    /** A word of a sort exercise's bank: dragged to a column, or a chooser
     *  of the categories. */
    function chooser(slot: ExerciseSlot, t: any): void {
      const word = chipText(t);
      setAttr(t, 'role', 'button');
      setAttr(t, 'tabindex', '0');
      setAttr(t, 'aria-haspopup', 'true');
      setAttr(t, 'aria-label', word || lineText(t));
      addClass(t, 'pt-ex-toggle');
      addClass(t, 'pt-ex-ui');
      colours(t);
      const wasDrag = dragWord(t, slot, word, false);
      let menu: any = null;
      // A click anywhere else closes the menu.
      const outside = (e: Event): void => { if (menu && !t.contains(e.target)) close(); };
      const close = (): void => {
        if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
        menu = null;
        t.style.zIndex = '';
        doc.removeEventListener('click', outside, true);
      };
      const open = (): void => {
        if (state.revealed) return;
        if (menu) { close(); return; }
        // Over the controls laid after the word (the columns' areas).
        t.style.zIndex = '6';
        doc.addEventListener('click', outside, true);
        menu = el('span', 'pt-ex-menu pt-ex-ui', t);
        menu.setAttribute('role', 'menu');
        const options = categories.concat(['\u2014']);
        for (let i = 0; i < options.length; i++) {
          const b = el('button', '', menu);
          b.setAttribute('type', 'button');
          b.setAttribute('role', 'menuitem');
          b.textContent = options[i];
          const value = i < categories.length ? categories[i] : null;
          b.addEventListener('click', (e: Event) => { e.stopPropagation(); close(); changed(slot, value); t.focus(); });
        }
        const first = menu.querySelector('button');
        if (first) first.focus();
      };
      const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') { close(); t.focus(); return; }
        if ((e.key === ' ' || e.key === 'Enter') && e.target === t) { e.preventDefault(); open(); }
      };
      const onClick = (e: Event): void => {
        if (wasDrag()) return;
        if (!menu || !menu.contains(e.target)) open();
      };
      t.addEventListener('click', onClick);
      t.addEventListener('keydown', onKey);
      cleanups.push(() => { close(); t.removeEventListener('click', onClick); t.removeEventListener('keydown', onKey); });
      const w: any = {
        slot,
        word,
        ok: null as boolean | null,
        paint(v: ExerciseValue) {
          const at = typeof v === 'string' ? categories.indexOf(v) : -1;
          // Sorted: the word stands in its column, and fades in the bank.
          t.classList.toggle(flow ? 'pt-ex-faded' : 'pt-ex-sorted', at >= 0 && columnWidgets.length > 0);
          t.setAttribute('aria-label', (word || lineText(t)) + (at >= 0 ? ', ' + categories[at] : ''));
          refreshColumns();
        },
        lock(on: boolean) { t.classList.toggle('pt-ex-revealed', on); },
        mark(ok: boolean | null) { w.ok = ok; badge(t, ok); refreshColumns(); },
      };
      widgets.push(w);
    }

    /** A sort exercise's column over its writing area: the words sorted in
     *  it, one a line, each dragged to another column or back to the bank
     *  (or sent back with a click). */
    function sortColumn(slot: ExerciseSlot, box: any): void {
      const name = categories[columnWidgets.length];
      const col = own(el('div', 'pt-ex-col pt-ex-ui', box));
      col.setAttribute('role', 'list');
      col.setAttribute('aria-label', (name !== undefined ? name + ', ' : '') + exName);
      const line = (slot.linePt || 0) * ppt || body * 1.35;
      col.style.fontSize = px(body);
      col.style.lineHeight = px(line);
      col.style.paddingTop = px(Math.max(0, line * 0.12));
      if (textFont) col.style.fontFamily = textFont;
      colours(col);
      const w = {
        slot,
        col,
        show(list: any[]) {
          while (col.firstChild) col.removeChild(col.firstChild);
          for (let i = 0; i < list.length; i++) {
            const src = list[i];
            const p = el('span', 'pt-ex-placed', col);
            p.setAttribute('role', 'listitem');
            p.textContent = src.word;
            if (state.revealed) continue;
            if (src.ok !== null && src.ok !== undefined) p.classList.add(src.ok ? 'pt-ex-right' : 'pt-ex-wrong');
            const wasDrag = dragWord(p, src.slot, src.word, true);
            p.addEventListener('click', () => { if (!wasDrag()) changed(src.slot, null); });
          }
        },
        paint() { /* filled from the words sorted */ },
        lock(on: boolean) { col.classList.toggle('pt-ex-revealed', on); },
        mark() { /* the words say it */ },
      };
      columnWidgets.push(w);
      widgets.push(w);
    }

    /** A text area on a writing area: an open answer, a sentence put in
     *  order. */
    function area(slot: ExerciseSlot, box: any): void {
      const ta = own(el('textarea', 'pt-ex-input pt-ex-ui', box));
      ta.setAttribute('aria-label', (words.blank || 'blank') + ' ' + (++blankN) + ', ' + exName);
      ta.setAttribute('spellcheck', 'false');
      const line = (slot.linePt || 0) * ppt || body * 1.35;
      ta.style.fontSize = px(body);
      ta.style.lineHeight = px(line);
      ta.style.paddingTop = px(Math.max(0, line * 0.12));
      if (textFont) ta.style.fontFamily = textFont;
      colours(ta);
      ta.addEventListener('input', () => changed(slot, ta.value));
      const w = {
        slot,
        paint(v: ExerciseValue) { ta.value = typeof v === 'string' ? v : ''; },
        lock(on: boolean) { ta.readOnly = on; ta.classList.toggle('pt-ex-revealed', on); },
        mark(ok: boolean | null) {
          ta.classList.remove('pt-ex-right', 'pt-ex-wrong');
          const old = box.querySelector(':scope > .pt-ex-mark');
          if (old) old.parentNode.removeChild(old);
          if (ok === null) return;
          ta.classList.add(ok ? 'pt-ex-right' : 'pt-ex-wrong');
          const m = el('span', 'pt-ex-mark ' + (ok ? 'pt-ex-ok' : 'pt-ex-no'), box);
          m.setAttribute('aria-hidden', 'true');
          m.textContent = ok ? '\u2713' : '\u2717';
          m.style.fontSize = px(body * 0.62);
          colours(m);
          placeMark(m, box);
        },
      };
      widgets.push(w);
    }

    /** One-character inputs over the cells of a crossword or an operation. */
    const cellInputs: Record<string, any> = {};
    function cell(slot: ExerciseSlot, box: any, grid: any): void {
      const r = slot.cell ? slot.cell[0] : 0;
      const c = slot.cell ? slot.cell[1] : 0;
      const size = grid.cellPt * ppt;
      const f = own(el('span', 'pt-ex-field pt-ex-ui', box));
      // A right-to-left page's grid is mirrored: its columns count from the
      // box's right edge. In a flow the page mirrors as a whole (the HTML
      // viewer's), the flow's left is that edge already.
      f.style[grid.rtl && !mirroredFlow ? 'right' : 'left'] = px((grid.xPt + c * grid.cellPt) * ppt);
      f.style.top = px((grid.yPt + r * grid.cellPt) * ppt);
      f.style.width = px(size);
      f.style.height = px(size);
      f.style.fontSize = px(size * 0.56);
      if (textFont) f.style.fontFamily = textFont;
      colours(f);
      const input = el('input', 'pt-ex-input' + (grid.kind === 'crossword' ? ' pt-ex-cell' : ''), f);
      input.setAttribute('type', 'text');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('spellcheck', 'false');
      input.setAttribute('maxlength', '2');
      input.style.background = 'transparent';
      if (grid.kind === 'arithmetic') input.setAttribute('inputmode', 'numeric');
      input.setAttribute('aria-label', exName + ', ' + (r + 1) + '\u00B7' + (c + 1));
      cellInputs[slot.box + ':' + r + ',' + c] = input;
      input.addEventListener('input', () => {
        // One character: the last typed.
        const chars = Array.from ? Array.from(input.value as string) : String(input.value).split('');
        if (chars.length > 1) input.value = chars[chars.length - 1];
        changed(slot, input.value);
        if (input.value && grid.kind === 'crossword') {
          const next = cellInputs[slot.box + ':' + r + ',' + (c + 1)] || cellInputs[slot.box + ':' + (r + 1) + ',' + c];
          if (next) next.focus();
        }
      });
      widgets.push({
        slot,
        paint(v: ExerciseValue) { input.value = typeof v === 'string' ? v : ''; },
        lock(on: boolean) { input.readOnly = on; f.classList.toggle('pt-ex-revealed', on); },
        mark(ok: boolean | null) { badge(f, ok); },
      });
    }

    /** The dots of a match: a left dot then a right one (or the other way
     *  round) join them with a line, clicked one after the other or dragged
     *  from one to the other. */
    function matchDots(box: any, grid: any, slots: ExerciseSlot[]): void {
      const w = parseFloat(box.style.width) || 0;
      const h = parseFloat(box.style.height) || 0;
      const s = own(svg('svg', { class: 'pt-ex-svg pt-ex-ui', width: w, height: h, viewBox: '0 0 ' + w + ' ' + h }, box));
      const lines = svg('g', {}, s);
      const marks = svg('g', {}, s);
      const ink = look.ink || 'currentColor';
      const stroke = Math.max(2.5, body * 0.13);
      // The line being drawn: from the dot picked to the pointer.
      const rubber = svg('line', { stroke: ink, 'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-dasharray': stroke * 1.5 + ' ' + stroke * 1.5, 'pointer-events': 'none', visibility: 'hidden' }, s);
      // Mirrored on a right-to-left page: the left items stand on the right.
      const lx = grid.rtl ? w - grid.dotsPt[0] * ppt : grid.dotsPt[0] * ppt;
      const rx = grid.rtl ? w - grid.dotsPt[1] * ppt : grid.dotsPt[1] * ppt;
      const rows: number[] = grid.rowsPt.map((y: number) => y * ppt);
      const radius = Math.max(body * 0.55, 6);
      let pendingLeft = -1;
      let pendingRight = -1;
      const leftDots: any[] = [];
      const rightDots: any[] = [];
      const refresh = (): void => {
        for (let i = 0; i < leftDots.length; i++) leftDots[i].classList.toggle('pt-ex-pending', i === pendingLeft);
        for (let i = 0; i < rightDots.length; i++) rightDots[i].classList.toggle('pt-ex-pending', i === pendingRight);
        if (pendingLeft < 0 && pendingRight < 0) rubber.setAttribute('visibility', 'hidden');
      };
      /** A point of the screen in the drawing's own units. */
      const local = (x: number, y: number): [number, number] => {
        const m = typeof s.getScreenCTM === 'function' ? s.getScreenCTM() : null;
        if (!m) return [x, y];
        const p = new DOMPoint(x, y).matrixTransform(m.inverse());
        return [p.x, p.y];
      };
      const follow = (x: number, y: number): void => {
        const from = pendingLeft >= 0 ? [lx, rows[pendingLeft]!] : pendingRight >= 0 ? [rx, rows[pendingRight]!] : null;
        if (!from) return;
        const to = local(x, y);
        rubber.setAttribute('x1', String(from[0]));
        rubber.setAttribute('y1', String(from[1]));
        rubber.setAttribute('x2', String(to[0]));
        rubber.setAttribute('y2', String(to[1]));
        rubber.setAttribute('visibility', 'visible');
      };
      /** The dot of a side nearest a screen point, if the point is on it. */
      const dotAt = (side: number, x: number, y: number): number => {
        const p = local(x, y);
        const dx = side === 0 ? lx : rx;
        let best = -1;
        let bestD = radius * 1.8;
        const n = side === 0 ? leftDots.length : rightDots.length;
        for (let i = 0; i < n; i++) {
          const d = Math.hypot(p[0] - dx, p[1] - rows[i]!);
          if (d < bestD) { best = i; bestD = d; }
        }
        return best;
      };
      const onMove = (e: PointerEvent): void => { if (!state.revealed) follow(e.clientX, e.clientY); };
      s.addEventListener('pointermove', onMove);
      let dragFrom: [number, number] | null = null;
      let dragging = false;
      let skipClick = false;
      const join = (li: number, ri: number): void => {
        pendingLeft = -1; pendingRight = -1;
        refresh();
        // A right item takes one left item: an earlier line to it goes.
        for (let i = 0; i < slots.length; i++) if (i !== li && state.v[slots[i]!.key] === ri + 1) changed(slots[i]!, null);
        changed(slots[li]!, state.v[slots[li]!.key] === ri + 1 ? null : ri + 1);
      };
      const label = (side: number, i: number): string => exName + ', ' + (side === 0 ? String(i + 1) : String.fromCharCode(97 + i));
      for (let i = 0; i < rows.length; i++) {
        for (let side = 0; side < 2; side++) {
          if (side === 0 && i >= slots.length) continue;
          const dot = svg('circle', { class: 'pt-ex-dot', cx: side === 0 ? lx : rx, cy: rows[i]!, r: radius, tabindex: 0, role: 'button', 'aria-label': label(side, i) }, s);
          (side === 0 ? leftDots : rightDots).push(dot);
          const pick = (): void => {
            if (state.revealed) return;
            if (side === 0) {
              if (pendingRight >= 0) join(i, pendingRight);
              else { pendingLeft = pendingLeft === i ? -1 : i; pendingRight = -1; refresh(); }
            } else if (pendingLeft >= 0) join(pendingLeft, i);
            else { pendingRight = pendingRight === i ? -1 : i; pendingLeft = -1; refresh(); }
          };
          // A drag from a dot to one of the other side joins them; a press
          // with no drag is a click.
          dot.addEventListener('pointerdown', (e: PointerEvent) => {
            if (state.revealed || e.button > 0) return;
            dragFrom = [e.clientX, e.clientY];
            dragging = false;
            if (typeof dot.setPointerCapture === 'function') { try { dot.setPointerCapture(e.pointerId); } catch { /* a pointer gone */ } }
          });
          dot.addEventListener('pointermove', (e: PointerEvent) => {
            if (!dragFrom) return;
            if (!dragging) {
              if (Math.abs(e.clientX - dragFrom[0]) + Math.abs(e.clientY - dragFrom[1]) < 6) return;
              dragging = true;
              pendingLeft = side === 0 ? i : -1;
              pendingRight = side === 0 ? -1 : i;
              refresh();
            }
            e.preventDefault();
            follow(e.clientX, e.clientY);
          });
          const drop = (e: PointerEvent): void => {
            if (!dragFrom) return;
            dragFrom = null;
            if (!dragging) return;
            dragging = false;
            skipClick = true;
            const other = e.type === 'pointerup' ? dotAt(1 - side, e.clientX, e.clientY) : -1;
            if (other >= 0) join(side === 0 ? i : other, side === 0 ? other : i);
            else { pendingLeft = -1; pendingRight = -1; refresh(); }
          };
          dot.addEventListener('pointerup', drop);
          dot.addEventListener('pointercancel', drop);
          dot.addEventListener('click', () => { if (skipClick) { skipClick = false; return; } pick(); });
          dot.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); pick(); } });
        }
      }
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i]!;
        const li = i;
        let line: any = null;
        let mark: any = null;
        widgets.push({
          slot,
          paint(v: ExerciseValue) {
            if (line) { lines.removeChild(line); line = null; }
            if (typeof v === 'number' && rows[v - 1] !== undefined) {
              line = svg('line', { x1: lx, y1: rows[li]!, x2: rx, y2: rows[v - 1]!, stroke: ink, 'stroke-width': stroke, 'stroke-linecap': 'round' }, lines);
              if (state.revealed) line.setAttribute('stroke', look.answer);
            }
          },
          lock() { /* repainted with the solution */ },
          mark(ok: boolean | null) {
            if (mark) { marks.removeChild(mark); mark = null; }
            if (line) line.setAttribute('stroke', ok === null ? (state.revealed ? look.answer : ink) : ok ? look.correct : look.wrong);
            if (ok === null) return;
            mark = svg('text', { x: lx + radius * (grid.rtl ? -2.2 : 2.2), y: rows[li]! - body * 0.25, 'font-size': body * 0.8, 'font-weight': 700, fill: ok ? look.correct : look.wrong, 'text-anchor': 'middle', 'aria-hidden': 'true' }, marks);
            mark.textContent = ok ? '\u2713' : '\u2717';
          },
        });
      }
    }

    /** A word search: a cell then another in a line with it mark a word. */
    function wordSearch(box: any, grid: any, slots: ExerciseSlot[]): void {
      const w = parseFloat(box.style.width) || 0;
      const h = parseFloat(box.style.height) || 0;
      const cellPx = grid.cellPt * ppt;
      const y0 = grid.yPt * ppt;
      // Where column `c` (a fraction in it) stands: from the box's right edge
      // on a right-to-left page, whose grid is mirrored.
      const colX = (c: number): number => (grid.rtl ? w - grid.xPt * ppt - c * cellPx : grid.xPt * ppt + c * cellPx);
      const s = own(svg('svg', { class: 'pt-ex-svg pt-ex-ui', width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, role: 'group', 'aria-label': exName }, box));
      const paintG = svg('g', {}, s);
      const hit = svg('rect', { x: Math.min(colX(0), colX(grid.cols)), y: y0, width: grid.cols * cellPx, height: grid.rows * cellPx, fill: 'transparent', style: 'cursor:pointer;pointer-events:all' }, s);
      let start: [number, number] | null = null;
      let startMark: any = null;
      const capsule = (sel: string, color: string): any => {
        const ends = sel.split('-');
        const a = ends[0]!.split(',').map(Number);
        const b = ends[1]!.split(',').map(Number);
        return svg('line', {
          x1: colX(a[1]! + 0.5), y1: y0 + (a[0]! + 0.5) * cellPx, x2: colX(b[1]! + 0.5), y2: y0 + (b[0]! + 0.5) * cellPx,
          stroke: color, 'stroke-opacity': 0.75, 'stroke-width': cellPx * 0.78, 'stroke-linecap': 'round', fill: 'none', 'pointer-events': 'none',
        }, paintG);
      };
      const onClick = (e: MouseEvent): void => {
        if (state.revealed) return;
        const r = hit.getBoundingClientRect();
        const sx = r.width / (grid.cols * cellPx) || 1;
        const sy = r.height / (grid.rows * cellPx) || 1;
        const c = Math.floor((grid.rtl ? r.right - e.clientX : e.clientX - r.left) / sx / cellPx);
        const rr = Math.floor((e.clientY - r.top) / sy / cellPx);
        if (rr < 0 || c < 0 || rr >= grid.rows || c >= grid.cols) return;
        if (!start) {
          start = [rr, c];
          startMark = svg('circle', { cx: colX(c + 0.5), cy: y0 + (rr + 0.5) * cellPx, r: cellPx * 0.39, fill: 'none', stroke: '#1a5fb4', 'stroke-width': 2, 'pointer-events': 'none' }, s);
          return;
        }
        const dr = rr - start[0];
        const dc = c - start[1];
        const a = start;
        start = null;
        if (startMark) { s.removeChild(startMark); startMark = null; }
        if ((dr === 0 && dc === 0) || !(dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) return;
        const sel = a[0] + ',' + a[1] + '-' + rr + ',' + c;
        const back = rr + ',' + c + '-' + a[0] + ',' + a[1];
        const list: string[] = Array.isArray(state.v._found) ? state.v._found.slice() : [];
        const at = list.indexOf(sel) >= 0 ? list.indexOf(sel) : list.indexOf(back);
        if (at >= 0) list.splice(at, 1); else list.push(sel);
        if (list.length > 0) state.v._found = list; else delete state.v._found;
        verdicts = null;
        repaint();
        persistNow();
        afterChange(null);
      };
      hit.addEventListener('click', onClick);
      let painted: any[] = [];
      let verdicts: Record<string, boolean | null> | null = null;
      const repaint = (): void => {
        for (let i = 0; i < painted.length; i++) if (painted[i].parentNode) painted[i].parentNode.removeChild(painted[i]);
        painted = [];
        const list: string[] = state.revealed ? slots.map((sl) => (sl.accept || [])[0]!).filter(Boolean) : Array.isArray(state.v._found) ? state.v._found : [];
        for (let i = 0; i < list.length; i++) {
          let ok: boolean | null = null;
          if (verdicts) {
            ok = false;
            for (let j = 0; j < slots.length; j++) {
              const acc = slots[j]!.accept || [];
              if (acc.indexOf(list[i]!) >= 0) ok = true;
            }
          }
          painted.push(capsule(list[i]!, state.revealed ? look.answer : ok === null ? '#9ec5ff' : ok ? look.correct : look.wrong));
          if (ok !== null) {
            const ends = list[i]!.split('-')[1]!.split(',').map(Number);
            const t = svg('text', { x: colX(ends[1]! + 1), ...(grid.rtl ? { 'text-anchor': 'end' } : {}), y: y0 + ends[0]! * cellPx + cellPx * 0.3, 'font-size': cellPx * 0.5, 'font-weight': 700, fill: ok ? look.correct : look.wrong, 'aria-hidden': 'true' }, paintG);
            t.textContent = ok ? '\u2713' : '\u2717';
            painted.push(t);
          }
        }
      };
      for (let i = 0; i < slots.length; i++) {
        widgets.push({
          slot: slots[i],
          paint() { verdicts = null; repaint(); },
          lock() { /* repainted */ },
          // Every word shares the capsules: they show right and wrong while
          // the exercise is checked, whatever this word's own verdict.
          mark(ok: boolean | null, checking?: boolean) { void ok; verdicts = checking ? {} : null; repaint(); },
        });
      }
    }

    // The slots, each on its place.
    const pairSlots: ExerciseSlot[] = [];
    const wordSlots: ExerciseSlot[] = [];
    for (let i = 0; i < rec.slots.length; i++) {
      const slot = rec.slots[i]!;
      const target = slotEls[slot.key];
      if (slot.kind === 'choice') {
        const targets: any[] = [];
        const values: number[] = [];
        for (let n = 1; n <= (slot.options || 0); n++) {
          const t = slotEls[slot.key + 'o' + n];
          if (t) { targets.push(t); values.push(n); }
        }
        const marker = /^g\d+$/.test(slot.key) ? 'none' : look.marker;
        if (targets.length > 0) toggles(slot, targets, values, marker === 'none' ? 'pt-ex-ring' : 'pt-ex-tick', !!slot.multiple);
      } else if (slot.kind === 'truefalse') {
        const t = slotEls[slot.key + 't'];
        const f = slotEls[slot.key + 'f'];
        if (t && f) toggles(slot, [t, f], [1, 2], 'pt-ex-tick', false);
        else if (target) inputOn(slot, target);
      } else if (slot.kind === 'mark') {
        if (target) markToggle(slot, target);
      } else if (slot.kind === 'category') {
        if (target) chooser(slot, target);
      } else if (slot.kind === 'pair') {
        if (target) inputOn(slot, target); else pairSlots.push(slot);
      } else if (slot.kind === 'word') {
        wordSlots.push(slot);
      } else if (slot.kind === 'text') {
        const box = slot.box !== undefined ? boxEls[String(slot.box)] : null;
        if (box && rec.kind === 'sort') sortColumn(slot, box);
        else if (box && !slot.bare) area(slot, box);
      } else if (slot.kind === 'cell') {
        const box = slot.box !== undefined ? boxEls[String(slot.box)] : null;
        const grid = (rec.grids || []).filter((g) => g.box === slot.box)[0];
        if (box && grid) cell(slot, box, grid);
      } else if (target) {
        inputOn(slot, target);
      }
    }
    const grids = rec.grids || [];
    for (let i = 0; i < grids.length; i++) {
      const g = grids[i]!;
      const box = boxEls[String(g.box)];
      if (!box) continue;
      if (g.kind === 'match' && pairSlots.length > 0 && g.rowsPt && g.dotsPt) matchDots(box, g, pairSlots);
      if (g.kind === 'wordsearch' && wordSlots.length > 0) wordSearch(box, g, wordSlots);
    }

    // An exercise with nothing to check, show or answer (a talk with a
    // classmate) has no bar.
    const actions = actionsOf(rec);
    const checkable = actions.check;
    const solvable = actions.solution;
    const resettable = actions.reset && widgets.length > 0;
    const hasHints = !!rec.hints && rec.hints.length > 0;

    // The bar: on the last part of the exercise's outer box.
    const outer = outers.length > 0 && (resettable || solvable || hasHints) ? outers[outers.length - 1] : null;
    let scoreEl: any = null;
    let panel: any = null;
    let solutionBtn: any = null;
    let hintBtn: any = null;
    if (outer) {
      const bar = own(el('div', 'pt-ex-bar pt-ex-ui' + (flow ? ' pt-ex-flow' : ''), outer));
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', exName);
      if (!flow) bar.style.fontSize = px(Math.max(body * 0.62, 9));
      colours(bar);
      const button = (text: string, fn: () => void): any => {
        const b = el('button', '', bar);
        b.setAttribute('type', 'button');
        b.textContent = text;
        b.addEventListener('click', fn);
        return b;
      };
      scoreEl = el('span', 'pt-ex-score', bar);
      scoreEl.setAttribute('aria-live', 'polite');
      scoreEl.setAttribute('role', 'status');
      if (hasHints) hintBtn = button(words.hint || 'Hint', () => showPanel(panel && panel.getAttribute('data-show') === 'hint' ? null : 'hint'));
      if (!instant && checkable) button(words.check || 'Check', () => { state.checked = true; persistNow(); feedback(); });
      if (solvable) solutionBtn = button(words.showSolution || 'Show solution', () => reveal(!state.revealed));
      if (resettable) button(words.reset || 'Try again', reset);
      panel = el('div', 'pt-ex-panel pt-ex-ui' + (flow ? ' pt-ex-flow' : ''), outer);
      own(panel);
      panel.hidden = true;
      if (!flow) panel.style.fontSize = px(Math.max(body * 0.72, 10));
      colours(panel);
      if (!flow) {
        liftOntoPage(bar);
        const view: any = doc.defaultView;
        // Again once the fonts have set the bar's size.
        if (view && view.requestAnimationFrame) view.requestAnimationFrame(() => liftOntoPage(bar));
      }
    }

    /** Lifts a control laid under the exercise back onto its page where it
     *  would cross the page's foot (a page that clips, as the Sandbox's
     *  short screen pages do). */
    function liftOntoPage(e: any): void {
      e.style.transform = '';
      const page = typeof e.closest === 'function' ? e.closest('.pt-page') : null;
      if (!page || typeof e.getBoundingClientRect !== 'function') return;
      const pr = page.getBoundingClientRect();
      const r = e.getBoundingClientRect();
      if (r.height === 0) return;
      const k = e.offsetHeight > 0 ? r.height / e.offsetHeight : 1;
      let up = r.bottom - (pr.bottom - 2);
      // Never above the page's head.
      if (up > r.top - pr.top) up = r.top - pr.top;
      if (up > 0) e.style.transform = 'translateY(' + (-up / k).toFixed(1) + 'px)';
    }
    void hintBtn;

    function showPanel(what: string | null): void {
      if (!panel) return;
      while (panel.firstChild) panel.removeChild(panel.firstChild);
      panel.hidden = what === null;
      panel.setAttribute('data-show', what || '');
      if (what === 'hint') {
        const hints = rec.hints || [];
        for (let i = 0; i < hints.length; i++) el('p', '', panel).textContent = hints[i];
      } else if (what === 'solution') {
        if (rec.key) el('p', 'pt-ex-key', panel).textContent = rec.key;
        const sol = rec.solution || [];
        for (let i = 0; i < sol.length; i++) el('p', '', panel).textContent = sol[i];
      }
      // A solution shown in its slots alone needs no panel.
      if (!panel.firstChild) panel.hidden = true;
      if (!panel.hidden && !flow) liftOntoPage(panel);
    }

    function valueOf(w: any): ExerciseValue {
      if (state.revealed) return w.slot.kind === 'word' ? undefined : solutionValue(w.slot, rec, tf);
      return w.slot.kind === 'word' ? state.v._found : state.v[w.slot.key];
    }

    function paintAll(): void {
      for (let i = 0; i < widgets.length; i++) {
        widgets[i].paint(valueOf(widgets[i]));
        widgets[i].lock(state.revealed);
      }
      refreshColumns();
    }

    function verdict(slot: ExerciseSlot): boolean | null {
      const v = slot.kind === 'word' ? state.v._found : state.v[slot.key];
      return checkSlot(slot, v, rec, tf);
    }

    /** Right and wrong on every slot, and the score. */
    function feedback(): void {
      let right = 0;
      let total = 0;
      for (let i = 0; i < rec.slots.length; i++) {
        const s = rec.slots[i]!;
        if (!isGraded(s, rec)) continue;
        // A word of a mark exercise not to be marked counts only when it is
        // marked: a wrong answer that keeps the score short of the total.
        if (s.kind === 'mark' && (s.correct || []).indexOf(1) < 0) {
          if (verdict(s) === false) total++;
          continue;
        }
        total++;
        if (verdict(s) === true) right++;
      }
      for (let i = 0; i < widgets.length; i++) widgets[i].mark(state.revealed ? null : verdict(widgets[i].slot), !state.revealed);
      if (scoreEl) {
        const score = String(words.score || '{right} of {total} right').replace('{right}', String(right)).replace('{total}', String(total));
        scoreEl.textContent = total === 0 ? '' : (right === total ? (words.correct || '') + ' ' : '') + score;
      }
    }

    function clearFeedback(): void {
      for (let i = 0; i < widgets.length; i++) widgets[i].mark(null);
      if (scoreEl) scoreEl.textContent = '';
    }

    function persistNow(): void {
      save(key, persist, { v: state.v, checked: state.checked });
    }

    function afterChange(slot: ExerciseSlot | null): void {
      if (instant) { feedback(); return; }
      if (state.checked) {
        state.checked = false;
        persistNow();
      }
      if (slot) {
        for (let i = 0; i < widgets.length; i++) if (widgets[i].slot === slot) widgets[i].mark(null);
      }
      if (scoreEl) scoreEl.textContent = '';
    }

    /** A slot answered: kept, repainted, checked when checking is instant. */
    function changed(slot: ExerciseSlot, value: ExerciseValue): void {
      if (state.revealed) return;
      if (slot.kind !== 'word') {
        if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) delete state.v[slot.key];
        else state.v[slot.key] = value;
      }
      for (let i = 0; i < widgets.length; i++) if (widgets[i].slot === slot) widgets[i].paint(valueOf(widgets[i]));
      if (slot.kind === 'category') refreshColumns();
      persistNow();
      afterChange(slot);
    }

    function reveal(on: boolean): void {
      state.revealed = on;
      if (solutionBtn) solutionBtn.textContent = on ? words.hideSolution || 'Hide solution' : words.showSolution || 'Show solution';
      if (solutionBtn) solutionBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
      paintAll();
      if (on) { clearFeedback(); showPanel('solution'); } else {
        showPanel(null);
        if (state.checked || instant) feedback();
      }
    }

    function reset(): void {
      state.v = {};
      state.checked = false;
      forget(key, persist);
      if (state.revealed) reveal(false);
      paintAll();
      clearFeedback();
      showPanel(null);
      if (instant) feedback();
    }

    paintAll();
    if (state.checked || instant) feedback();
    if (solutionBtn) solutionBtn.setAttribute('aria-expanded', 'false');
    return { record: rec, state, reveal, reset, feedback };
  }

  return { normalizeAnswer, isGraded, checkSlot, solutionValue, actionsOf, attach };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const runtime = exerciseRuntime();

/** An answer as the exercise script compares it (see `attachExercises`). */
export const normalizeAnswer: (text: string) => string = runtime.normalizeAnswer;

/** Whether a slot counts in an exercise's score. */
export const isGradedSlot: (slot: ExerciseSlot, record: Pick<ExerciseRecord, 'kind'>) => boolean = runtime.isGraded;

/** Whether `value` answers `slot` rightly (`true`), wrongly (`false`), or
 *  is no answer or not graded (`null`). `trueFalse` are the style's true
 *  and false labels, for a typed true/false. */
export const checkExerciseSlot: (slot: ExerciseSlot, value: ExerciseValue, record: Pick<ExerciseRecord, 'kind'>, trueFalse?: [string, string]) => boolean | null = runtime.checkSlot;

/** The buttons an exercise's bar offers: Check, Show solution, Try again. */
export const exerciseActions: (record: Pick<ExerciseRecord, 'kind' | 'slots' | 'key' | 'solution'>) => { check: boolean; solution: boolean; reset: boolean } = runtime.actionsOf;

/** What a slot shows when the solution is shown. */
export const exerciseSolutionValue: (slot: ExerciseSlot, record: Pick<ExerciseRecord, 'kind'>, trueFalse?: [string, string]) => ExerciseValue = runtime.solutionValue;

/** Makes the exercises of the HTML output under `root` answerable (see the
 *  module comment). Call it once the markup is in place, again after the
 *  markup changes (calling the previous call's return value first).
 *  Returns a function that takes every control off and puts the page's
 *  markup back as it was. */
export function attachExercises(root: Element | ShadowRoot | Document, options?: AttachExercisesOptions): () => void {
  return runtime.attach(root, options);
}

/** The exercise script as a standalone script, for an output with no host
 *  page to call `attachExercises`: the HTML file of the command line, an
 *  EPUB content document. It attaches to the document once it is parsed;
 *  the answers are kept under the page's path. */
export const EXERCISE_SCRIPT = `(function () {
  var runtime = (${exerciseRuntime.toString()})();
  function go() { runtime.attach(document, {}); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
})();
`;
