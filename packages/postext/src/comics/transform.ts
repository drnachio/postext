/**
 * Moving a laid-out comic (#566, #567): a strip's comic, laid out in its
 * block's box, onto the sheet; the halves of a two-page spread, laid out
 * across both sheets, onto the sheet of their page. Pure: every function
 * returns a new comic and leaves its input as it was.
 */

import type { BoundingBox, VDTBlock, VDTComicArt, VDTComicBalloon, VDTComicPage, VDTComicPanel, VDTComicSplitter, VDTDesignTextBlock, VDTPage, VDTPoint } from '../vdt';
import { flowRectToPage } from '../vdt';

/** Numbers a command of an SVG path takes, and which of them are x (`x`) or
 *  y (`y`) coordinates. */
const PATH_ARGS: Record<string, readonly ('x' | 'y' | '-')[]> = {
  M: ['x', 'y'],
  L: ['x', 'y'],
  T: ['x', 'y'],
  H: ['x'],
  V: ['y'],
  C: ['x', 'y', 'x', 'y', 'x', 'y'],
  S: ['x', 'y', 'x', 'y'],
  Q: ['x', 'y', 'x', 'y'],
  A: ['-', '-', '-', '-', '-', 'x', 'y'],
  Z: [],
};

const PATH_TOKEN_RE = /([MLTHVCSQAZmlthvcsqaz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

/** Round to 1/1000 px and print without trailing zeros. */
function num(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
}

/**
 * An SVG path moved by `(dx, dy)`: the absolute commands' coordinates are
 * shifted; relative commands are kept, except a relative `m` that opens
 * the path (it is absolute there). Arc radii, rotations and flags stay.
 */
export function translateSvgPath(d: string, dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return d;
  const out: string[] = [];
  let cmd = '';
  let argIndex = 0;
  /** Commands read so far (the first one opens the path). */
  let commands = 0;
  let match: RegExpExecArray | null;
  PATH_TOKEN_RE.lastIndex = 0;
  while ((match = PATH_TOKEN_RE.exec(d)) !== null) {
    if (match[1] !== undefined) {
      cmd = match[1];
      argIndex = 0;
      commands++;
      out.push(cmd);
      continue;
    }
    const upper = cmd.toUpperCase();
    const args = PATH_ARGS[upper] ?? [];
    const absolute = cmd === upper || (cmd === 'm' && commands === 1 && argIndex < 2);
    // Pairs after a moveto's first are linetos of the same kind.
    const role = args.length > 0 ? args[argIndex % args.length]! : '-';
    let v = Number(match[2]);
    if (absolute && role === 'x') v += dx;
    else if (absolute && role === 'y') v += dy;
    out.push(num(v));
    argIndex++;
  }
  // Commands and numbers separated by single spaces.
  return out.join(' ');
}

const movePoint = (p: VDTPoint, dx: number, dy: number): VDTPoint => ({ x: p.x + dx, y: p.y + dy });
const moveRect = (r: BoundingBox, dx: number, dy: number): BoundingBox => ({ x: r.x + dx, y: r.y + dy, width: r.width, height: r.height });

function moveArt(art: VDTComicArt, dx: number, dy: number): VDTComicArt {
  return { ...art, box: moveRect(art.box, dx, dy), source: { ...art.source } };
}

/** A panel moved by `(dx, dy)`. */
export function translateComicPanel(panel: VDTComicPanel, dx: number, dy: number): VDTComicPanel {
  return {
    ...panel,
    polygon: panel.polygon.map((p) => movePoint(p, dx, dy)),
    bbox: moveRect(panel.bbox, dx, dy),
    border: { ...panel.border },
    ...(panel.art ? { art: moveArt(panel.art, dx, dy) } : {}),
    ...(panel.pop ? { pop: moveArt(panel.pop, dx, dy) } : {}),
  };
}

/** A split line moved by `(dx, dy)` (its percentages stay: they are read
 *  against `parent`, which moves with it). */
export function translateComicSplitter(s: VDTComicSplitter, dx: number, dy: number): VDTComicSplitter {
  return { ...s, path: [...s.path], a: movePoint(s.a, dx, dy), b: movePoint(s.b, dx, dy), parent: moveRect(s.parent, dx, dy) };
}

/** A design text block moved by `(dx, dy)`: its box, and the baselines of
 *  a horizontal block (those of a vertical block are relative to its box). */
function moveDesignText(t: VDTDesignTextBlock, dx: number, dy: number): VDTDesignTextBlock {
  return {
    ...t,
    bbox: moveRect(t.bbox, dx, dy),
    lines: t.vertical ? t.lines.map((l) => ({ ...l })) : t.lines.map((l) => ({ ...l, baselineY: l.baselineY + dy })),
  };
}

/** A balloon moved by `(dx, dy)`: its outline, box, tail tip and lines. */
export function translateComicBalloon(b: VDTComicBalloon, dx: number, dy: number): VDTComicBalloon {
  return {
    ...b,
    ...(b.shape ? { shape: { ...b.shape, d: translateSvgPath(b.shape.d, dx, dy) } } : {}),
    text: b.text.map((t) => moveDesignText(t, dx, dy)),
    bbox: moveRect(b.bbox, dx, dy),
    ...(b.tailTip ? { tailTip: movePoint(b.tailTip, dx, dy) } : {}),
  };
}

/** A comic moved by `(dx, dy)`: frame, panels, split lines and balloons. */
export function translateComicPage(comic: VDTComicPage, dx: number, dy: number): VDTComicPage {
  return {
    ...comic,
    frame: moveRect(comic.frame, dx, dy),
    panels: comic.panels.map((p) => translateComicPanel(p, dx, dy)),
    splitters: comic.splitters.map((s) => translateComicSplitter(s, dx, dy)),
    balloons: comic.balloons.map((b) => translateComicBalloon(b, dx, dy)),
  };
}

/** Strip comics moved onto the sheet, kept while their block stays put. */
const onSheet = new WeakMap<VDTComicPage, { x: number; y: number; comic: VDTComicPage }>();

/**
 * The comic of a strip block (`VDTBlock.comic`, #566) on the sheet of
 * `page`: moved from the block's box to where the block sits on the sheet
 * (its flow box turned or mirrored onto the sheet, `flowRectToPage`).
 * Undefined for a block that carries no comic.
 */
export function comicBlockOnSheet(page: Pick<VDTPage, 'flow'>, block: Pick<VDTBlock, 'bbox' | 'comic'>): VDTComicPage | undefined {
  const comic = block.comic;
  if (!comic) return undefined;
  const box = flowRectToPage(page, block.bbox);
  const memo = onSheet.get(comic);
  if (memo && memo.x === box.x && memo.y === box.y) return memo.comic;
  const moved = translateComicPage(comic, box.x, box.y);
  onSheet.set(comic, { x: box.x, y: box.y, comic: moved });
  return moved;
}

/**
 * Every comic a page shows, on its sheet, in reading order: the comic page
 * (or the page's half of a spread) first, then the strips its columns hold,
 * then the strips floated to its bands. What the renderers paint and the
 * Sandbox hit-tests (panels, split lines, balloons) on that page.
 */
export function pageComics(page: Pick<VDTPage, 'comic' | 'columns' | 'floats' | 'flow'>): VDTComicPage[] {
  const out: VDTComicPage[] = [];
  if (page.comic) out.push(page.comic);
  const seen = new Set<VDTComicPage>();
  const add = (b: VDTBlock): void => {
    if (!b.comic || b.hidden || seen.has(b.comic)) return;
    seen.add(b.comic);
    out.push(comicBlockOnSheet(page, b)!);
  };
  for (const col of page.columns) for (const b of col.blocks) add(b);
  for (const b of page.floats ?? []) add(b);
  return out;
}
