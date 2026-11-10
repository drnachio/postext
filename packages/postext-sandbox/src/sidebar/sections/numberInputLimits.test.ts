import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import * as nodeFs from 'node:fs';

const fs = nodeFs as {
  readdirSync: (path: string) => string[];
  readFileSync: (path: string, encoding: 'utf8') => string;
  statSync: (path: string) => { isDirectory: () => boolean };
};
const join = (dir: string, name: string): string => `${dir.replace(/\/$/, '')}/${name}`;

// A number field clamps its value to its range: one whose default lies
// outside it shows another value, and saves it as soon as it is touched
// (the stack penalty's field stopped at 3000 while the default is 100000).

const SECTIONS = new URL('.', import.meta.url).pathname;
const DEFAULTS = new URL('../../../../postext/src/defaults/', import.meta.url).pathname;

function files(dir: string, ext: string): string[] {
  return fs.readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return fs.statSync(path).isDirectory() ? files(path, ext) : path.endsWith(ext) ? [path] : [];
  });
}

/** The engine's numeric defaults, by key (a key may have several). */
function numericDefaults(): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const file of files(DEFAULTS, '.ts')) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/^\s+(\w+): (-?\d+(?:\.\d+)?),/gm)) {
      out.set(m[1]!, [...(out.get(m[1]!) ?? []), Number(m[2])]);
    }
  }
  return out;
}

describe('number fields', () => {
  it('reach the default of the setting they edit', () => {
    const defaults = numericDefaults();
    const outside: string[] = [];
    for (const file of files(SECTIONS, '.tsx')) {
      for (const m of fs.readFileSync(file, 'utf8').matchAll(/<NumberInput\b([\s\S]*?)\/>/g)) {
        const block = m[1]!;
        const key = /isDefault=\{[^}]*?\.\w+ === \w+\.(\w+)/.exec(block)?.[1];
        if (!key) continue;
        const max = /\bmax=\{(-?\d+(?:\.\d+)?)\}/.exec(block)?.[1];
        const min = /\bmin=\{(-?\d+(?:\.\d+)?)\}/.exec(block)?.[1];
        for (const d of defaults.get(key) ?? []) {
          if (max !== undefined && d > Number(max)) outside.push(`${key}: default ${d} > max ${max}`);
          if (min !== undefined && d < Number(min)) outside.push(`${key}: default ${d} < min ${min}`);
        }
      }
    }
    expect(outside).toEqual([]);
  });
});
