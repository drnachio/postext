import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import * as nodeFs from 'node:fs';

const fs = nodeFs as {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: 'utf8') => string;
};

const SRC = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// Runtime edges only: `import type` / `export type` vanish when the package compiles.
const EDGE = /(?:^|\n)\s*(?:import|export)\s+(?!type\s)[^'";]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)|new URL\(\s*['"](\.[^'"]+)['"]/g;

function resolve(from: string, spec: string): string | null {
  const parts = `${from.slice(0, from.lastIndexOf('/'))}/${spec.replace(/\.js$/, '')}`.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.') out.push(part);
  }
  const base = out.join('/');
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) if (fs.existsSync(base + ext)) return base + ext;
  return null;
}

/** Every module the compile worker loads, each mapped to the module that pulled it in. */
function workerGraph(): Map<string, string | null> {
  const start = `${SRC}/export/compile.worker.ts`;
  const seen = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const file = queue.shift() as string;
    for (const m of fs.readFileSync(file, 'utf8').matchAll(EDGE)) {
      const next = resolve(file, (m[1] ?? m[2] ?? m[3]) as string);
      if (next && !seen.has(next)) {
        seen.set(next, file);
        queue.push(next);
      }
    }
  }
  return seen;
}

function chain(graph: Map<string, string | null>, file: string): string {
  const steps: string[] = [];
  for (let at: string | null | undefined = file; at; at = graph.get(at)) steps.unshift(at.slice(SRC.length + 1));
  return steps.join(' → ');
}

describe('compile worker module graph', () => {
  // A worker that reaches the module constructing it makes Turbopack's production
  // build loop forever (#1551), and React context has no place in a worker.
  it('never reaches the main-thread worker clients or the React context', () => {
    const graph = workerGraph();
    const banned = ['export/compileClient.ts', 'export/compileStore.ts', 'context/SandboxContext.tsx', 'editor/find/findClient.ts'];
    const hits = banned.map((rel) => `${SRC}/${rel}`).filter((file) => graph.has(file)).map((file) => chain(graph, file));
    expect(hits).toEqual([]);
  });

  it('still loads the book compiler and the layout service', () => {
    const graph = workerGraph();
    expect(graph.has(`${SRC}/export/compileBook.ts`)).toBe(true);
    expect(graph.has(`${SRC}/worker/LayoutService.ts`)).toBe(true);
  });

  // The EPUB's cover is painted in the worker (#1548), by the paint the
  // EPUB tab makes.
  it('loads the cover painter and the EPUB tab\'s paint', () => {
    const graph = workerGraph();
    for (const rel of ['export/compileCover.ts', 'epub/cover.ts', 'covers/renderCover.ts', 'controls/media/resourceImages.ts']) {
      expect(graph.has(`${SRC}/${rel}`), rel).toBe(true);
    }
  });
});
