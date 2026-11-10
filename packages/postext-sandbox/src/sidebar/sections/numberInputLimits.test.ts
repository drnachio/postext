import { describe, expect, it } from 'vitest';
import * as postext from 'postext';
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
// (the stack penalty's field once stopped below its default, #1463).

const SECTIONS = new URL('.', import.meta.url).pathname;

function files(dir: string, ext: string): string[] {
  return fs.readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return fs.statSync(path).isDirectory() ? files(path, ext) : path.endsWith(ext) ? [path] : [];
  });
}

/** The engine's numeric defaults, by key (a key may have several): every
 *  number in the `DEFAULT_*` objects the engine exports, at any depth. */
function numericDefaults(): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const walk = (value: unknown, seen: Set<unknown>): void => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const [key, v] of Object.entries(value)) {
      if (typeof v === 'number') out.set(key, [...(out.get(key) ?? []), v]);
      else walk(v, seen);
    }
  };
  const seen = new Set<unknown>();
  for (const [name, value] of Object.entries(postext)) if (name.startsWith('DEFAULT_')) walk(value, seen);
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
        // A field that shows the value scaled (a fraction as a percentage)
        // is held against its own range, not the engine's.
        if (!new RegExp(`\\bvalue=\\{[\\w.?]*\\.${key}\\}`).test(block)) continue;
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
