// Die-cut outlines as canvas paths (#1565): traced on any context or
// `Path2D`, and a `Path2D` of them where the browser has one.

import type { VDTPathCommand } from '../vdt.js';

/** The calls a canvas path takes (a context, a `Path2D`). */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
  quadraticCurveTo(x1: number, y1: number, x: number, y: number): void;
  closePath(): void;
}

/** Traces `paths` on `sink`, each subpath after the last (no
 *  `beginPath`). */
export function traceDiePaths(sink: PathSink, paths: readonly (readonly VDTPathCommand[])[]): void {
  for (const path of paths) {
    for (const c of path) {
      switch (c.op) {
        case 'M':
          sink.moveTo(c.x, c.y);
          break;
        case 'L':
          sink.lineTo(c.x, c.y);
          break;
        case 'C':
          sink.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
          break;
        case 'Q':
          sink.quadraticCurveTo(c.x1, c.y1, c.x, c.y);
          break;
        case 'Z':
          sink.closePath();
          break;
      }
    }
  }
}

/** A `Path2D` of `paths` (a page's `dieCut.holes`, or its `outline`);
 *  `undefined` where there is no `Path2D` (Node, a worker without one). */
export function dieCutPath2D(paths: readonly (readonly VDTPathCommand[])[]): Path2D | undefined {
  if (typeof Path2D === 'undefined') return undefined;
  const p = new Path2D();
  traceDiePaths(p, paths);
  return p;
}
