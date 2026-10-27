// The facts of composed pages: frames, pushed-out content, round trip (#869).
import { round } from './settle.js';

// ─── Composed pages (#869) ──────────────────────────────────────────────────

/** Content warnings of composed pages that C37 reads (with `tocGroupSplit`). */
export const COMPOSED_CONTENT_KINDS = ['frameOverflow', 'templateUnknown', 'slotUnknown', 'slotEmpty', 'pageFenceLength'];
/** A Markdown that declares a composed page: a four-colon page fence naming a template. */
export const COMPOSED_FENCE = /^::::\s*page\s*\{[^}\n]*\btemplate\s*=/m;

const mmOf = (px, dpi) => Math.round((px / dpi) * 254) / 10;

/** The points of a box a click may land on: its centre, then four points
 *  inside its corners (a picture of a higher layer may cover the centre). */
function probePoints(r) {
  const at = (fx, fy) => [r.x + r.width * fx, r.y + r.height * fy];
  return [at(0.5, 0.5), at(0.25, 0.5), at(0.75, 0.5), at(0.5, 0.25), at(0.5, 0.75), at(0.15, 0.5), at(0.85, 0.5)];
}

/** The Markdown range an element of the source map holds or comes from. */
function rangeOf(el) {
  const s = el?.source;
  if (s && (s.kind === 'markdown' || s.kind === 'attr')) return { start: s.start, end: s.end };
  return el?.content ? { start: el.content.start, end: el.content.end } : null;
}

/**
 * The source-map round trip of one document's composed pages (#857): for
 * every element the page fence laid out (`elementsForSource` over the
 * fence), a point inside it is given to `sourceAt`, and the element is
 * found again when the answer holds the same element (its stable id), or
 * an element of its level whose Markdown range holds its text. Elements
 * clipped at a frame's foot, shown on the facing page of a spread, turned,
 * or under a pixel wide are passed over. Null when the engine has no
 * source map.
 *
 * @param {any} engine
 * @param {any} doc
 * @param {{ pageOf?: (pageIndex: number) => number, markdown?: string }} [options]
 */
export function composedRoundTrip(engine, doc, { pageOf = (i) => i + 1, markdown = '' } = {}) {
  if (typeof engine?.sourceAt !== 'function' || typeof engine?.elementsForSource !== 'function') return null;
  const levels = {};
  const misses = [];
  for (const page of doc.pages ?? []) {
    const composed = page.composed;
    if (!composed) continue;
    let matches;
    try {
      matches = engine.elementsForSource(doc, composed.sourceStart, composed.sourceEnd).filter((m) => m.pageIndex === page.index);
    } catch (error) {
      misses.push({ page: pageOf(page.index), level: 'template', id: `cp${composed.fenceIndex}`, text: `elementsForSource threw: ${error?.message ?? error}` });
      continue;
    }
    for (const { element: el } of matches) {
      // A box in the flow frame of a right-to-left or vertical page (`flow`,
      // #929) is clicked where the sheet shows it.
      const r = el.rect && el.flow && typeof engine.flowRectToPage === 'function' ? engine.flowRectToPage(page, el.rect) : el.rect;
      if (!r || el.clipped || el.facing || el.rotate || r.width < 1 || r.height < 1) continue;
      const stat = (levels[el.level] ??= { checked: 0, missed: 0 });
      stat.checked++;
      // Every rect is upright on the sheet, a scaled frame's lines too (the
      // source map scales them back, #921), and sourceAt takes sheet points.
      const want = rangeOf(el);
      const found = probePoints(r).some(([x, y]) => {
        let chain = [];
        try {
          chain = engine.sourceAt(doc, page.index, x, y) ?? [];
        } catch {
          return false;
        }
        return chain.some((hit) => {
          if (hit.id === el.id) return true;
          const got = rangeOf(hit);
          return hit.level === el.level && want && got && got.start <= want.start && got.end >= want.end;
        });
      });
      if (found) continue;
      stat.missed++;
      const text = want ? markdown.slice(want.start, want.end).replace(/\s+/g, ' ').trim().slice(0, 48) : '';
      misses.push({ page: pageOf(page.index), level: el.level, id: String(el.id), text });
    }
  }
  return { levels, misses };
}

const MM_BLEED = { value: 3, unit: 'mm' };
const MM_MARK_LENGTH = { value: 5, unit: 'mm' };
const MM_MARK_OFFSET = { value: 3, unit: 'mm' };

/**
 * The boxes a composed page's frames are measured against, in the frame
 * their rects are in (the flow frame on a vertical page): the type area
 * (`area`) and the bleed box (`bleed`; the trim when the sheet has no cut
 * lines). On a page of a spread the boxes are those of the whole spread,
 * seen from this page: the template's area spans both pages, so a frame of
 * the left page may run to the right edge of the right one, and the sheet's
 * outer edges, not the spine, are the limits (#948).
 *
 * @param {any} engine
 * @param {any} doc
 * @param {any} page
 * @param {number} dpi
 * @returns {{ area: any, bleed: any } | null}
 */
function frameLimits(engine, doc, page, dpi) {
  const area = page.contentArea;
  if (!area) return null;
  const px = (d) => (typeof engine?.dimensionToPx === 'function' ? engine.dimensionToPx(d, dpi) : 0);
  const cut = doc.config?.page?.cutLines;
  const bleedPx = cut?.enabled ? px(cut.bleed ?? MM_BLEED) : 0;
  const offset = cut?.enabled ? bleedPx + px(cut.markOffset ?? MM_MARK_OFFSET) + px(cut.markLength ?? MM_MARK_LENGTH) : 0;
  const vertical = page.flow?.writingMode === 'vertical-rl';
  const width = vertical ? page.height : page.width;
  const height = vertical ? page.width : page.height;
  if (!(width > 0) || !(height > 0)) return { area, bleed: { x: 0, y: 0, width: area.x + area.width, height: area.y + area.height } };
  const trim = { x: offset, y: offset, width: width - 2 * offset, height: height - 2 * offset };
  const bleed = { x: offset - bleedPx, y: offset - bleedPx, width: trim.width + 2 * bleedPx, height: trim.height + 2 * bleedPx };
  const c = page.composed;
  const facing = c?.spread && c.facingPage !== undefined ? (doc.pages ?? []).find((q) => q.index === c.facingPage) : undefined;
  if (!facing?.contentArea) return { area, bleed };
  // The second page of the spread follows the first along the flow's x (its y
  // on a vertical page); the shift is a trim's extent along that axis.
  const along = vertical ? 'y' : 'x';
  const span = vertical ? 'height' : 'width';
  const first = page.index < facing.index;
  const shift = trim[span];
  const move = (r, by) => ({ ...r, [along]: r[along] + by });
  const mine = first ? 0 : -shift;
  const other = first ? shift : -shift;
  const own = move(area, 0);
  const far = move(facing.contentArea, other);
  const x = Math.min(own.x, far.x);
  const y = Math.min(own.y, far.y);
  const union = { x, y, width: Math.max(own.x + own.width, far.x + far.width) - x, height: Math.max(own.y + own.height, far.y + far.height) - y };
  const sheet = { ...bleed, [span]: bleed[span] + shift };
  return { area: union, bleed: move(sheet, mine) };
}

/**
 * How far a composed frame's box runs past an edge of its page's type area
 * when the template's box for it (`declaredRect`) did not (#911, #948), in
 * mm, and which edge: the reflow pushed it off. On an edge where the
 * template already placed the frame outside the area (a band to the bleed, a
 * note in the margin) the limit is the bleed box instead, with `of:
 * 'bleed'`. The foot, the head, the left edge and the right edge are
 * checked; the largest push is the one reported. Nothing for a frame the
 * reflow left as drawn.
 *
 * @param {any} f
 * @param {{ area: any, bleed: any } | null} limits
 * @param {number} dpi
 * @returns {{ mm: number, edge: 'head' | 'foot' | 'left' | 'right', of: 'area' | 'bleed' } | null}
 */
function pushedOut(f, limits, dpi, engine) {
  if (!f.declaredRect || !limits) return null;
  const { area, bleed } = limits;
  // A frame set in its own writing mode (#944) is laid out in its box turned
  // a quarter turn: the page's box is that turned back.
  const d = pageBox(engine, f.declaredRect, f);
  const r = pageBox(engine, f.rect, f);
  const tol = 0.5;
  /** @type {{ past: number, edge: 'head' | 'foot' | 'left' | 'right', of: 'area' | 'bleed' }[]} */
  const found = [];
  const test = (edge, declaredInside, past, pastBleed) => {
    if (declaredInside) found.push({ past, edge, of: 'area' });
    else found.push({ past: pastBleed, edge, of: 'bleed' });
  };
  test('foot', d.y + d.height <= area.y + area.height + tol, r.y + r.height - (area.y + area.height), r.y + r.height - (bleed.y + bleed.height));
  test('head', d.y >= area.y - tol, area.y - r.y, bleed.y - r.y);
  test('right', d.x + d.width <= area.x + area.width + tol, r.x + r.width - (area.x + area.width), r.x + r.width - (bleed.x + bleed.width));
  test('left', d.x >= area.x - tol, area.x - r.x, bleed.x - r.x);
  const worst = found.sort((a, b) => b.past - a.past)[0];
  return worst && worst.past > tol ? { mm: mmOf(worst.past, dpi), edge: worst.edge, of: worst.of } : null;
}

/**
 * `rect` (a frame's `rect` or `declaredRect`) as the page gives it: the
 * frame's own, or, for a frame set in its own writing mode, turned back
 * (`framePageRect`, #960).
 * @param {any} engine @param {{ x: number, y: number, width: number, height: number }} rect @param {any} f
 */
function pageBox(engine, rect, f) {
  return f.writingMode && typeof engine?.framePageRect === 'function' ? engine.framePageRect({ rect, writingMode: f.writingMode }) : rect;
}

/** @param {any} f @param {any} limits @param {number} dpi @param {any} [engine] */
function pushedFacts(f, limits, dpi, engine) {
  const out = pushedOut(f, limits, dpi, engine);
  return out ? { pushedOutMm: out.mm, pushedOutEdge: out.edge, ...(out.of === 'bleed' ? { pushedOutOf: 'bleed' } : {}) } : {};
}

/**
 * What the composed pages of a build did (C37, C38, C40): each composed
 * page with its template, its frames (the height each was given, what did
 * not fit, the scale its text and pictures were left at, where it goes
 * on) and the reflow log; the composed-page content warnings with their
 * steps and proposals, in words when the engine says them; the contents
 * blocks cut between columns (`tocGroupSplit`); and the source-map round
 * trip, or `roundTrip: null` when the engine has none. `declared`: a
 * Markdown of the build has a `::::page{template=…}` fence.
 *
 * @param {any} engine
 * @param {any[]} docs
 * @param {{ nOf?: (doc: any, pageIndex: number) => number, markdowns?: string[] }} [options]
 */
export function composedFacts(engine, docs, { nOf = (_doc, i) => i + 1, markdowns = [] } = {}) {
  const pages = [];
  const warnings = [];
  const tocSplits = [];
  let roundTrip = null;
  const say = (fn, value) => {
    try {
      return typeof engine?.[fn] === 'function' ? String(engine[fn](value)) : undefined;
    } catch {
      return undefined;
    }
  };
  docs.forEach((doc, d) => {
    const dpi = doc.config?.page?.dpi ?? 300;
    const pageOf = (i) => nOf(doc, i);
    for (const page of doc.pages ?? []) {
      const c = page.composed;
      if (!c) continue;
      const limits = frameLimits(engine, doc, page, dpi);
      pages.push({
        n: pageOf(page.index),
        ...(docs.length > 1 ? { doc: d } : {}),
        template: c.template,
        fenceIndex: c.fenceIndex,
        frames: (c.frames ?? []).map((f) => ({
          name: f.name,
          ...(f.id ? { id: f.id } : {}),
          heightMm: mmOf(pageBox(engine, f.rect, f).height, dpi),
          // Its box in mm (x, y, width, height): C38 compares it with the
          // run on the text as written (#925).
          box: (({ x, y, width, height }) => [mmOf(x, dpi), mmOf(y, dpi), mmOf(width, dpi), mmOf(height, dpi)])(pageBox(engine, f.rect, f)),
          ...(f.overflowPx > 0 ? { overflowMm: mmOf(f.overflowPx, dpi) } : {}),
          ...(f.scale !== undefined && f.scale !== 1 ? { scale: round(f.scale, 0.001) } : {}),
          ...(f.imageScale !== undefined ? { imageScale: round(f.imageScale, 0.001) } : {}),
          ...(f.continuesTo ? { continuesTo: f.continuesTo } : {}),
          ...(f.continuedFrom ? { continuedFrom: f.continuedFrom } : {}),
          ...(f.sourceStart !== undefined ? { filled: true } : {}),
          // A frame the reflow pushed past an edge of the type area (or of
          // the bleed) where the template had it inside (#911, #948): an
          // answer space pushed off the foot, a row grown past the right edge.
          ...pushedFacts(f, limits, dpi, engine),
        })),
        events: (c.log ?? []).map((e) => ({
          frame: e.frame, kind: e.kind,
          ...(e.fromMm !== undefined ? { fromMm: e.fromMm } : {}),
          ...(e.toMm !== undefined ? { toMm: e.toMm } : {}),
          ...(e.axis ? { axis: e.axis } : {}),
          ...(e.scale !== undefined ? { scale: e.scale } : {}),
          ...(e.cause ? { cause: e.cause } : {}),
          ...(say('describeReflowEvent', e) ? { text: say('describeReflowEvent', e) } : {}),
        })),
      });
    }
    for (const w of doc.contentWarnings ?? []) {
      const page = w.pageIndex === undefined ? null : pageOf(w.pageIndex);
      if (w.kind === 'tocGroupSplit') {
        tocSplits.push({ page, title: w.title ?? '', columns: w.columns ?? 0 });
        continue;
      }
      if (!COMPOSED_CONTENT_KINDS.includes(w.kind)) continue;
      warnings.push({
        kind: w.kind, page,
        ...(w.template !== undefined ? { template: w.template } : {}),
        ...(w.frame !== undefined ? { frame: w.frame } : {}),
        ...(w.slot !== undefined ? { slot: w.slot } : {}),
        ...(w.overflowMm !== undefined ? { overflowMm: w.overflowMm } : {}),
        ...(w.locale ? { locale: w.locale } : {}),
        ...(w.kind === 'frameOverflow'
          ? {
              steps: [...(w.stepsTried ?? [])],
              proposals: (w.proposals ?? []).map((p) => ({ kind: p.kind, ...(p.path !== undefined ? { path: p.path } : {}), value: p.value, ...(say('describeFrameOverflowProposal', p) ? { text: say('describeFrameOverflowProposal', p) } : {}) })),
            }
          : {}),
        ...(say('formatWarning', w) ? { text: say('formatWarning', w) } : {}),
      });
    }
    const trip = composedRoundTrip(engine, doc, { pageOf, markdown: markdowns[d] ?? markdowns[0] ?? '' });
    if (trip) {
      roundTrip ??= { levels: {}, misses: [] };
      for (const [level, s] of Object.entries(trip.levels)) {
        const into = (roundTrip.levels[level] ??= { checked: 0, missed: 0 });
        into.checked += s.checked;
        into.missed += s.missed;
      }
      roundTrip.misses.push(...trip.misses);
    }
  });
  return {
    declared: markdowns.some((md) => COMPOSED_FENCE.test(md)),
    pages, warnings, tocSplits,
    roundTrip: roundTrip ?? (typeof engine?.sourceAt === 'function' ? { levels: {}, misses: [] } : null),
  };
}
