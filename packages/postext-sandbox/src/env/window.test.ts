import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import * as nodeFs from 'node:fs';
import { hasWindow } from './window.js';

const fs = nodeFs as {
  readdirSync: (path: string) => string[];
  readFileSync: (path: string, encoding: 'utf8') => string;
  statSync: (path: string) => { isDirectory: () => boolean };
};

const SRC = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function sources(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (fs.statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('hasWindow', () => {
  it('says whether a window is there', () => {
    expect(hasWindow()).toBe(typeof (globalThis as { window?: unknown }).window !== 'undefined');
  });

  it('is the only window guard in the sources (Next.js folds a bare one, #1526)', () => {
    const folded = sources(SRC)
      .filter((path) => /\btypeof window\b/.test(fs.readFileSync(path, 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')))
      .map((path) => path.slice(SRC.length + 1));
    expect(folded).toEqual([]);
  });
});
