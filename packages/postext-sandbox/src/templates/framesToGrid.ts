/**
 * «Turn these frames into a grid» (#1065): one-off frames standing on a
 * lattice (cards of one width in rows and columns, each maybe with frames
 * hanging from it, a caption pill under a photo) become one grid group
 * that repeats the first card's frames (#1061, DESIGN §12.6), and every
 * page set with the template gets its pieces renamed into the grid's
 * items, in reading order, so the page looks as it did.
 *
 * The lattice is read off a laid page: rows by the cards' tops, columns
 * by their starts, the gaps between them, the cards' common width. The
 * grid's box starts where the first card's row starts (its anchor kept
 * when it hangs from a frame or the area's top-left) and is as wide as
 * the columns; `rowAlign: 'start'`, so a shorter card stays as tall as it
 * was.
 *
 * Pure: the caller hands the laid boxes and writes the result.
 */

import type { Dimension, ElementPlacement, FrameConfig, FrameGroupConfig, PageTemplate } from 'postext';
import type { TextChange } from '../book/textChanges.js';
import { dimensionToMm, mmDim, pxToMm, type Rect } from './frameGeometry.js';
import { frameParts, pagesOfTemplates, rewritePage, siteText, siteWithoutSlot } from './pagePieces.js';
import { retargetPatch } from './retarget.js';
import { namesInUse, templateAt, uniqueName } from './templateEdits.js';
import { sitesOf, type SlotSite } from '../viewport/composed/slotSource.js';

/** Millimetres two laid edges may differ by and still be one line. */
export const LATTICE_TOLERANCE_MM = 0.6;

export type GridRefusal =
  | 'tooFew'
  | 'unknown'
  | 'inherited'
  | 'notLaid'
  | 'flow'
  | 'repeated'
  | 'notLattice'
  | 'widths'
  | 'heights'
  | 'members';

export interface LaidTemplatePage {
  /** Page px of each frame, by name, on one page set with the template. */
  rects: ReadonlyMap<string, Rect>;
  /** The template's area on that page (page px). */
  area: Rect;
  dpi: number;
}

export interface GridChapter {
  chapterId: string;
  changes: TextChange[];
  baseLength: number;
}

export type GridPlan =
  | {
    ok: true;
    templates: PageTemplate[];
    chapters: GridChapter[];
    group: string;
    main: string;
    members: string[];
    columns: number;
    rows: number;
    columnGapMm: number;
    rowGapMm: number;
    /** Old name → instance name (`card2` → `card[2]`), for every frame
     *  turned into an instance. */
    instances: Record<string, string>;
    /** Composed pages rewritten. */
    pages: number;
    notes: GridNote[];
  }
  | { ok: false; reason: GridRefusal; frames?: string[] };

export type GridNote =
  | { kind: 'leftGroup'; group: string }
  | { kind: 'groupRemoved'; group: string }
  | { kind: 'extended'; templates: string[] }
  | { kind: 'variants' };

/** `card-2` → `card`; `foto3` → `foto`. */
export function stemOf(name: string): string {
  let end = name.length;
  while (end > 0 && name[end - 1]! >= '0' && name[end - 1]! <= '9') end--;
  while (end > 0 && (name[end - 1] === '-' || name[end - 1] === '_')) end--;
  return name.slice(0, end);
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const ABSOLUTE = new Set(['mm', 'cm', 'in', 'pt', 'px']);
const absMm = (d: Dimension | undefined): number | null => (d === undefined ? 0 : ABSOLUTE.has(d.unit) ? dimensionToMm(d) : null);

/** The anchors whose offset moves the box's top-left by as much (the box's
 *  width does not move it). */
const TOP_LEFT_EDGES = new Set(['below', 'right-of', 'align-top', 'align-left', 'top-left']);

/**
 * Where a box that starts `dx`, `dy` mm from where `frame` stands is
 * placed: `frame`'s own anchor with the offset shifted, when it hangs from
 * something by its top-left; else the area's top-left at `at` (mm from the
 * area's corner).
 */
export function placementLike(frame: FrameConfig, dx: number, dy: number, at: { x: number; y: number }, own: ReadonlySet<string>): ElementPlacement {
  const p = frame.placement;
  const to = p?.anchor?.to;
  const ox = absMm(p?.offset?.x);
  const oy = absMm(p?.offset?.y);
  const reusable = p && !frame.grid && typeof to === 'string' && TOP_LEFT_EDGES.has(p.anchor.edge)
    && (to.startsWith('#') ? !own.has(to.slice(1)) : p.anchor.edge === 'top-left')
    && ox !== null && oy !== null;
  if (reusable) return { anchor: { ...p!.anchor }, offset: { x: mmDim(ox! + dx), y: mmDim(oy! + dy) } };
  return { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mmDim(at.x), y: mmDim(at.y) } };
}

interface Cell {
  main: string;
  rect: Rect;
  /** The frames hanging from it (anchored to it, or to one of them), in
   *  template order. */
  members: string[];
}

/**
 * The selected frames split in cards and what hangs from each. Frames are
 * told apart by their names without the number (`foto1`, `foto2` are one
 * kind; `pie1`, `pie2` another): the cards are the kind none of whose
 * frames hangs from a frame of another kind (the first such kind in
 * template order); a member goes with the card of its own number, else the
 * card it hangs from, else the nearest card. Null when the kinds do not
 * come in equal numbers.
 */
function cellsOf(frames: readonly FrameConfig[], selected: ReadonlySet<string>, rects: ReadonlyMap<string, Rect>): Cell[] | null {
  const byName = new Map(frames.map((f) => [f.name, f]));
  const chosen = frames.filter((f) => selected.has(f.name));
  const kinds = new Map<string, string[]>();
  for (const f of chosen) {
    const stem = stemOf(f.name) || f.name;
    (kinds.get(stem) ?? kinds.set(stem, []).get(stem)!).push(f.name);
  }
  const kindOf = new Map<string, string>();
  for (const [k, names] of kinds) for (const n of names) kindOf.set(n, k);
  const targetOf = (name: string): string | undefined => {
    const f = byName.get(name);
    const to = f?.placement?.anchor?.to;
    const t = typeof to === 'string' && to.startsWith('#') ? to.slice(1) : undefined;
    return t !== undefined && selected.has(t) && !f?.grid ? t : undefined;
  };
  const free = [...kinds.keys()].filter((k) => kinds.get(k)!.every((n) => {
    const t = targetOf(n);
    return t === undefined || kindOf.get(t) === k;
  }));
  // One kind only, or names that say nothing: every frame is a card.
  if (kinds.size === 1 || free.length === 0 || [...kinds.values()].every((v) => v.length === 1)) {
    return chosen.map((f) => ({ main: f.name, rect: rects.get(f.name)!, members: [] }));
  }
  const mainKind = free[0]!;
  const mains = kinds.get(mainKind)!;
  if ([...kinds.values()].some((v) => v.length !== mains.length)) return null;
  const cells = new Map<string, Cell>(mains.map((m) => [m, { main: m, rect: rects.get(m)!, members: [] }]));
  const numberOf = (n: string): string => n.slice((stemOf(n) || n).length).replace(/^[-_]+/, '');
  const byNumber = new Map(mains.map((m) => [numberOf(m), m]));
  const centre = (r: Rect): { x: number; y: number } => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  for (const f of chosen) {
    if (kindOf.get(f.name) === mainKind) continue;
    let owner: string | undefined = numberOf(f.name) !== '' ? byNumber.get(numberOf(f.name)) : undefined;
    if (!owner) {
      const seen = new Set<string>();
      for (let t = targetOf(f.name); t !== undefined && !seen.has(t); t = targetOf(t)) {
        seen.add(t);
        if (cells.has(t)) {
          owner = t;
          break;
        }
      }
    }
    if (!owner) {
      const c = centre(rects.get(f.name)!);
      let best = Infinity;
      for (const m of mains) {
        const d = centre(rects.get(m)!);
        const dist = (d.x - c.x) ** 2 + (d.y - c.y) ** 2;
        if (dist < best) {
          best = dist;
          owner = m;
        }
      }
    }
    cells.get(owner!)!.members.push(f.name);
  }
  return [...cells.values()];
}

/** Turn `frames` of template `templateId` (its own frames) into a grid. */
export function planFramesToGrid(input: {
  templates: readonly PageTemplate[];
  templateId: string;
  frames: readonly string[];
  laid: LaidTemplatePage;
  chapters: readonly { id: string; markdown: string }[];
}): GridPlan {
  const { templates, templateId, laid } = input;
  const at = templateAt(templates, templateId);
  if (!at) return { ok: false, reason: 'unknown' };
  const template = at.template;
  const own = template.frames ?? [];
  const selected = new Set(input.frames);
  const missing = input.frames.filter((n) => !own.some((f) => f.name === n && !f.remove));
  if (missing.length > 0) {
    // Frames of the template it extends are not this template's to change.
    const known = namesInUse(templates, templateId);
    return { ok: false, reason: missing.some((n) => known.has(n)) ? 'inherited' : 'unknown', frames: missing };
  }
  const unlaid = input.frames.filter((n) => !laid.rects.has(n));
  if (unlaid.length > 0) return { ok: false, reason: 'notLaid', frames: unlaid };
  const flow = own.filter((f) => selected.has(f.name) && (f.flow || f.takes));
  if (flow.length > 0) return { ok: false, reason: 'flow', frames: flow.map((f) => f.name) };
  const repeated = new Set((template.groups ?? []).flatMap((g) => (g.kind === 'grid' && g.repeat ? g.repeat.frames : [])));
  const inGrid = input.frames.filter((n) => repeated.has(n));
  if (inGrid.length > 0) return { ok: false, reason: 'repeated', frames: inGrid };

  const px = (mm: number): number => (mm * laid.dpi) / 25.4;
  const tol = px(LATTICE_TOLERANCE_MM);
  const cells = cellsOf(own, selected, laid.rects);
  if (!cells) return { ok: false, reason: 'members', frames: [...input.frames] };
  if (cells.length < 2) return { ok: false, reason: 'tooFew' };

  // Rows by the cards' tops, top to bottom; cards in a row start to end.
  const byTop = [...cells].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  const rows: Cell[][] = [];
  for (const c of byTop) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0]!.rect.y - c.rect.y) <= tol) row.push(c);
    else rows.push([c]);
  }
  for (const row of rows) row.sort((a, b) => a.rect.x - b.rect.x);
  const columns = rows[0]!.length;
  const xs = rows[0]!.map((c) => c.rect.x);
  const off = cells.map((c) => c.main);
  if (rows.some((r, i) => (i < rows.length - 1 ? r.length !== columns : r.length > columns))) return { ok: false, reason: 'notLattice', frames: off };
  if (rows.some((r) => r.some((c, k) => Math.abs(c.rect.x - xs[k]!) > tol))) return { ok: false, reason: 'notLattice', frames: off };
  const width = cells[0]!.rect.width;
  const odd = cells.filter((c) => Math.abs(c.rect.width - width) > tol).map((c) => c.main);
  if (odd.length > 0) return { ok: false, reason: 'widths', frames: odd };
  // Every card takes the first card's frame (#1723): cards that differ in
  // height keep their look only when that frame grows with its content
  // and every card did too. A fixed height would cut the taller cards.
  const height = cells[0]!.rect.height;
  const grows = (name: string): boolean => {
    const f = own.find((x) => x.name === name)!;
    return (f.height ?? f.placement?.size?.height ?? 'auto') === 'auto';
  };
  const unlike = cells.filter((c) => Math.abs(c.rect.height - height) > tol).map((c) => c.main);
  if (unlike.length > 0 && !cells.every((c) => grows(c.main))) return { ok: false, reason: 'heights', frames: [cells[0]!.main, ...unlike] };
  const colGaps = xs.slice(1).map((x, k) => x - xs[k]! - width);
  const colGap = colGaps.length > 0 ? colGaps.reduce((a, b) => a + b, 0) / colGaps.length : 0;
  if (colGaps.some((g) => Math.abs(g - colGap) > tol) || colGap < -tol) return { ok: false, reason: 'notLattice', frames: off };

  // What hangs from each card, as the first card has it.
  const ordered = rows.flat();
  const first = ordered[0]!;
  const shape = (c: Cell): Rect[] => c.members.map((m) => {
    const r = laid.rects.get(m)!;
    return { x: r.x - c.rect.x, y: r.y - c.rect.y, width: r.width, height: r.height };
  });
  const firstShape = shape(first);
  const sortKey = (r: Rect): number => r.y * 100000 + r.x;
  const firstSorted = first.members.map((m, i) => ({ m, r: firstShape[i]! })).sort((a, b) => sortKey(a.r) - sortKey(b.r));
  /** Each card's members in the first card's order. */
  const membersOf = new Map<string, string[]>();
  for (const c of ordered) {
    if (c.members.length !== first.members.length) return { ok: false, reason: 'members', frames: [c.main] };
    const mine = c.members.map((m, i) => ({ m, r: shape(c)[i]! })).sort((a, b) => sortKey(a.r) - sortKey(b.r));
    // Members hang the same way (their sizes may differ: a caption is as
    // wide as its words).
    for (let i = 0; i < mine.length; i++) {
      const a = mine[i]!.r;
      const b = firstSorted[i]!.r;
      if (Math.abs(a.y - b.y) > tol && Math.abs(a.y + a.height - (b.y + b.height)) > tol) return { ok: false, reason: 'members', frames: [c.main] };
    }
    const order = new Map(firstSorted.map((e, i) => [e.m, i]));
    const list = new Array<string>(mine.length);
    mine.forEach((e, i) => { list[order.get(firstSorted[i]!.m)!] = e.m; });
    membersOf.set(c.main, list);
  }

  // The rows' extents: how far a cell reaches above its card and below
  // its top (the engine's row height), and the gaps between rows.
  const extent = (c: Cell): { above: number; below: number } => {
    const rs = [c.rect, ...(membersOf.get(c.main) ?? []).map((m) => laid.rects.get(m)!)];
    return { above: c.rect.y - Math.min(...rs.map((r) => r.y)), below: Math.max(...rs.map((r) => r.y + r.height)) - c.rect.y };
  };
  const rowBox = rows.map((r) => {
    const top = r[0]!.rect.y;
    const above = Math.max(...r.map((c) => extent(c).above));
    const below = Math.max(...r.map((c) => extent(c).below));
    return { cursor: top - above, height: above + below };
  });
  const rowGaps = rowBox.slice(1).map((b, i) => b.cursor - (rowBox[i]!.cursor + rowBox[i]!.height));
  const rowGap = rowGaps.length > 0 ? rowGaps.reduce((a, b) => a + b, 0) / rowGaps.length : colGap;
  if (rowGaps.some((g) => Math.abs(g - rowGap) > tol)) return { ok: false, reason: 'notLattice', frames: off };

  // Names: the first card's, without its number, when free.
  const taken = new Set([...namesInUse(templates, templateId)].filter((n) => !selected.has(n)));
  const nameFor = (n: string): string => {
    const stem = stemOf(n);
    return stem && stem !== n && !taken.has(stem) ? stem : n;
  };
  const main = nameFor(first.main);
  const memberNames: string[] = [];
  for (const m of membersOf.get(first.main)!) {
    let n = nameFor(m);
    if (n === main || memberNames.includes(n)) n = m;
    memberNames.push(n);
  }
  taken.add(main);
  for (const m of memberNames) taken.add(m);
  const group = uniqueName([...taken, ...input.frames], 'grid');

  // Every frame of the selection, as the instance it becomes.
  const instances: Record<string, string> = {};
  ordered.forEach((c, k) => {
    instances[c.main] = `${main}[${k + 1}]`;
    membersOf.get(c.main)!.forEach((m, j) => { instances[m] = `${memberNames[j]}[${k + 1}]`; });
  });
  const firstMembers = new Map(membersOf.get(first.main)!.map((m, j) => [m, memberNames[j]!]));
  const toSet = (n: string): string | undefined => (n === first.main ? main : firstMembers.get(n));

  // The frames: the first card's set, renamed, where the first card stood.
  const mainFrame = own.find((f) => f.name === first.main)!;
  const mmOf = (v: number): number => pxToMm(v, laid.dpi);
  const fixedHeight = (f: FrameConfig, r: Rect): FrameConfig => {
    const h = f.height;
    if (h === 'fill' || (typeof h === 'object' && h !== null && 'percent' in h)) return { ...f, height: mmDim(mmOf(r.height)) };
    return f;
  };
  const setFrames: FrameConfig[] = [];
  {
    const f = fixedHeight(clone(mainFrame), first.rect);
    delete f.grid;
    delete (f as { width?: unknown }).width;
    setFrames.push({ ...f, name: main });
  }
  for (const m of membersOf.get(first.main)!) {
    const f = clone(own.find((x) => x.name === m)!);
    const renamed = retargetPatch({ frames: [f] }, (n) => toSet(n)).frames![0]!;
    setFrames.push({ ...renamed, name: firstMembers.get(m)! });
  }

  // The grid's box: from the first row's start, as wide as the columns.
  const boxX = first.rect.x;
  const boxY = rowBox[0]!.cursor;
  const boxW = columns * width + (columns - 1) * colGap;
  const placement = placementLike(mainFrame, mmOf(boxX - first.rect.x), mmOf(boxY - first.rect.y), { x: mmOf(boxX - laid.area.x), y: mmOf(boxY - laid.area.y) }, selected);
  const grid: FrameGroupConfig = {
    name: group,
    kind: 'grid',
    columns,
    columnGap: mmDim(mmOf(Math.max(0, colGap))),
    rowGap: mmDim(mmOf(Math.max(0, rowGap))),
    rowAlign: 'start',
    repeat: { frames: [main, ...memberNames] },
    placement: { ...placement, size: { width: mmDim(mmOf(boxW)), height: 'fill' } },
  };

  // What else hung from a frame of the selection points at its instance.
  const rename = (n: string): string | undefined => instances[n];
  const notes: GridNote[] = [];
  const firstIndex = own.findIndex((f) => f.name === first.main);
  const frames: FrameConfig[] = [];
  own.forEach((f, i) => {
    if (i === firstIndex) frames.push(...setFrames);
    if (selected.has(f.name)) return;
    frames.push(retargetPatch({ frames: [f] }, rename).frames![0]!);
  });
  const groups: FrameGroupConfig[] = [];
  for (const g of template.groups ?? []) {
    const next = retargetPatch({ groups: [g] }, rename).groups![0]!;
    if (g.frames?.some((m) => selected.has(m))) {
      next.frames = g.frames.filter((m) => !selected.has(m));
      if (next.frames.length === 0 && !g.modules) {
        notes.push({ kind: 'groupRemoved', group: g.name });
        continue;
      }
      notes.push({ kind: 'leftGroup', group: g.name });
    }
    groups.push(next);
  }
  groups.push(grid);
  const decoration = template.decoration ? retargetPatch({ decoration: template.decoration }, rename).decoration : undefined;
  const next: PageTemplate = { ...template, frames, groups, ...(decoration ? { decoration } : {}) };
  if (template.variants) {
    notes.push({ kind: 'variants' });
    next.variants = {
      ...(template.variants.recto ? { recto: retargetPatch(template.variants.recto, rename) } : {}),
      ...(template.variants.verso ? { verso: retargetPatch(template.variants.verso, rename) } : {}),
    };
  }
  const extended = templates.filter((t) => t.extends === templateId).map((t) => t.id);
  if (extended.length > 0) notes.push({ kind: 'extended', templates: extended });
  const out = templates.map((t) => (t.id === templateId ? next : t));

  // The pages: each card's pieces become its item, in reading order.
  const chapters: GridChapter[] = [];
  let pages = 0;
  for (const ch of input.chapters) {
    const changes: TextChange[] = [];
    for (const page of pagesOfTemplates(ch.markdown, new Set([templateId]))) {
      const sites = page.sites;
      const items: string[] = [];
      const used: SlotSite[] = [];
      let last = -1;
      ordered.forEach((c, k) => {
        const own = sitesOf(sites, c.main)[0];
        const mems = membersOf.get(c.main)!.map((m, j) => ({ site: sitesOf(sites, m)[0], name: memberNames[j]! }));
        if (own) used.push(own);
        for (const m of mems) if (m.site) used.push(m.site);
        items.push(itemText(ch.markdown, own, mems, main));
        if (own || mems.some((m) => m.site)) last = k;
      });
      if (used.length === 0) continue;
      changes.push(rewritePage(ch.markdown, sites, used, items.slice(0, last + 1).join('\n')));
      pages++;
    }
    if (changes.length > 0) chapters.push({ chapterId: ch.id, changes, baseLength: ch.markdown.length });
  }

  return {
    ok: true,
    templates: out,
    chapters,
    group,
    main,
    members: memberNames,
    columns,
    rows: rows.length,
    columnGapMm: Math.round(mmOf(colGap) * 10) / 10,
    rowGapMm: Math.round(mmOf(rowGap) * 10) / 10,
    instances,
    pages,
    notes,
  };
}

/** One item of the grid: the card's piece renamed, its members written
 *  inside it (a `:::frame` made for a card written as a block when it has
 *  members, or when it has none written). */
function itemText(markdown: string, own: SlotSite | undefined, members: readonly { site: SlotSite | undefined; name: string }[], main: string): string {
  const inner = members.filter((m) => m.site).map((m) => siteText(markdown, m.site!, m.name));
  if (own && inner.length === 0) return `${siteText(markdown, own, main)}\n`;
  const body = inner.map((t) => `${t}\n`).join('\n');
  if (own && own.kind === 'frame') {
    const parts = frameParts(markdown, own);
    const r = own.slotRange;
    const opener = r && r.end - own.start <= parts.opener.length
      ? parts.opener.slice(0, r.start - own.start) + main + parts.opener.slice(r.end - own.start)
      : parts.opener;
    return `${opener}\n${parts.content}${parts.content ? '\n' : ''}${body}${parts.closer}\n`;
  }
  const lead = own ? `${siteWithoutSlot(markdown, own)}\n\n` : '';
  return `:::frame{slot="${main}"}\n${lead}${body}:::\n`;
}
