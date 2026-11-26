import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { PLAYER_SCRIPT, scormWords } from './player.js';
import type { ScoData } from './types.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- a fake DOM, just enough for the player */

/** An element that keeps what the player sets on it. */
class El {
  className = '';
  textContent = '';
  value = '';
  type = '';
  title = '';
  disabled = false;
  style: Record<string, string> = {};
  children: El[] = [];
  parentNode: El | null = null;
  attrs: Record<string, string> = {};
  listeners: Record<string, ((e?: any) => void)[]> = {};
  classList = { add: (): void => undefined };
  contentWindow = null;
  constructor(readonly tag: string) {}
  setAttribute(k: string, v: string): void { this.attrs[k] = v; }
  getAttribute(k: string): string | null { return this.attrs[k] ?? null; }
  appendChild(c: El): El { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c: El): El { this.children = this.children.filter((x) => x !== c); return c; }
  addEventListener(t: string, f: (e?: any) => void): void { (this.listeners[t] ??= []).push(f); }
  get clientWidth(): number { return 800; }
  get clientHeight(): number { return 600; }
  getBoundingClientRect(): { width: number; height: number } { return { width: 800, height: 600 }; }
}

/** Runs the player on `data` and returns its position readout and its
 *  "next" button. */
function play(data: ScoData): { where: () => string; next: () => void } {
  const all: El[] = [];
  const body = new El('body');
  const holder = new El('script');
  holder.textContent = JSON.stringify(data);
  const doc: any = {
    documentElement: new El('html'),
    body,
    createElement: (tag: string) => { const e = new El(tag); all.push(e); return e; },
    getElementById: (id: string) => (id === 'pt-scorm' ? holder : null),
    querySelector: () => null,
    addEventListener: () => undefined,
  };
  const store = new Map<string, string>();
  const win: any = {
    document: doc,
    addEventListener: () => undefined,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    innerWidth: 800,
    innerHeight: 600,
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  win.window = win;
  win.parent = win;
  win.self = win;
  runInNewContext(PLAYER_SCRIPT, { window: win, document: doc, JSON, Math, Date, String, parseInt, isNaN });
  const where = all.find((e) => e.className === 'pt-sco-where')!;
  const turns = all.filter((e) => e.className === 'pt-sco-turn');
  return { where: () => where.textContent, next: () => turns[1]!.listeners.click![0]!() };
}

function sco(layout: ScoData['layout'], labels: string[]): ScoData {
  return {
    version: '2004',
    layout,
    title: 'Unit',
    book: 'Book',
    lang: 'en',
    dir: 'ltr',
    docs: labels.map((label, i) => ({ href: `content/text/doc-${i + 1}.xhtml`, label })),
    toc: [],
    page: layout === 'fixed' ? { width: 595, height: 842 } : undefined,
    storageKey: 'test',
    exercises: [],
    words: scormWords('en'),
  } as ScoData;
}

describe('the player position (#1721)', () => {
  it('reads a fixed unit as a printed page over its last page', () => {
    const p = play(sco('fixed', ['4', '5', '6']));
    expect(p.where()).toBe('4 of 6');
    p.next();
    expect(p.where()).toBe('5 of 6');
  });

  it('reads a reflowable unit as a section over its count of sections, not its start page', () => {
    // The labels are the pages each section starts on, as the guide's
    // chapter 1 unit carries them.
    const p = play(sco('reflowable', ['5', '10']));
    expect(p.where()).toBe('1 of 2');
    p.next();
    expect(p.where()).toBe('2 of 2');
  });
});
