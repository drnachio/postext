// A page written as a `::::page` fence of `:::frame` blocks, and the page
// templates built from the designs: frames, running heads, decoration
// (#1276: split out of textToMarkdown.ts).
import type { HeadingStyleConfig, DesignElement } from '../../types.js';
import type { PageSide, FrameConfig, PageTemplate, PageTemplatePatch } from '../../composed/types.js';
import { stableStringify } from '../../util/stableHash.js';
import type { HeadingLine } from '../markdownRuns.js';
import { type PlannedFrame, type TextPiece, joinLines, remapDecorationAnchors } from '../pageDesign.js';
import { type Design, freeId } from './types.js';

/** Attributes of the opening heading the page fence carries: those the
 *  template reads (`{attr.x}`). */
const FENCE_RESERVED = new Set(['style', 'id', 'toc', 'hidden', 'numbered', 'slot', 'template', 'spread', 'background']);

export function writePage(
  d: Design,
  template: string,
  p: { startLine: number; endLine: number; headings: HeadingLine[] },
  lines: readonly string[],
  side: PageSide | undefined,
  styleById: Map<string, HeadingStyleConfig>,
  paragraphStyleFor: (f: PlannedFrame) => string,
  anchorOf: (d: Design, piece: TextPiece) => string,
): { template: string; lines: string[]; frames: number; elements: number; chars: number; differences: string[]; dropped: number } {
  const differences = new Set<string>();
  const attrs: string[] = [`template="${template}"`];
  if (d.plan.background) attrs.push(`background="${d.plan.background.replace(/["\\]/g, '')}"`);
  const opening = p.headings[0];
  for (const name of d.attrNames ?? []) {
    if (FENCE_RESERVED.has(name)) continue;
    const token = opening?.attrTokens[name];
    if (token !== undefined) attrs.push(token);
  }
  // The page's own lines, without the hidden headings that only switched
  // the running head (no id, nothing in the contents, no words).
  const dropLines = new Set<number>();
  for (const h of p.headings) {
    const st = h.attrs.style !== undefined ? styleById.get(h.attrs.style) : undefined;
    if (h.attrs.id === undefined && st?.hidden === true && st.toc === false && !/[\p{L}\p{N}]/u.test(h.title)) dropLines.add(h.line);
  }
  const body: string[] = [];
  for (let i = p.startLine; i <= p.endLine; i++) if (!dropLines.has(i)) body.push(lines[i]!);
  while (body.length > 0 && body[body.length - 1]!.trim() === '') body.pop();
  while (body.length > 0 && body[0]!.trim() === '') body.shift();
  const flowText = body.some((l) => l.trim() !== '' && !/^#{1,6}[ \t]/.test(l.trim()));
  if (flowText) differences.add('flow');

  const out: string[] = [`::::page{${attrs.join(' ')}}`, ...body];
  let frames = 0;
  let elements = 0;
  let chars = 0;
  for (const f of d.plan.frames) {
    if (f.side && side && f.side !== side) continue;
    if (f.side && !side) differences.add('side');
    frames++;
    if (f.picture) {
      // A picture with its labels (#918): the figure in its frame.
      const pic = f.picture;
      out.push('', `:::figure{resource="${pic.element.resourceId.replace(/["\\]/g, '')}" slot="${f.name!}"}`);
      for (const l of pic.labels) {
        out.push(`::label[${l.lines[0]!}]{at="${anchorOf(d, l)}"}`);
        elements++;
        chars += l.chars;
      }
      out.push(':::');
      for (const n of pic.notes) differences.add(n);
      continue;
    }
    out.push('', `:::frame{slot="${f.name!}"}`, `:::paragraphs{style="${paragraphStyleFor(f)}"}`);
    f.pieces.forEach((piece, i) => {
      if (i > 0) out.push('');
      out.push(joinLines(piece.lines));
      elements++;
      chars += piece.chars;
      for (const n of piece.notes) differences.add(n);
    });
    out.push(':::', ':::');
  }
  if (d.pages > 1 && d.plan.frames.some((f) => !f.side)) differences.add('repeated');
  out.push('::::');
  return { template, lines: out, frames, elements, chars, differences: [...differences].sort(), dropped: dropLines.size };
}

/** A frame of the template, from a planned one. */
function frameConfig(f: PlannedFrame): FrameConfig {
  if (f.picture) {
    // The picture's box, over the decoration (below it when the design
    // painted decoration over the picture, #957) and under the text
    // frames; the picture keeps its size.
    const pic = f.picture;
    return {
      name: f.name!,
      placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: { value: round3(pic.x), unit: 'mm' }, y: { value: round3(pic.y), unit: 'mm' } } },
      width: { value: round3(pic.width), unit: 'mm' },
      height: { value: round3(pic.height), unit: 'mm' },
      layer: pic.layer ?? 0,
      fit: { scaleImages: false },
    };
  }
  const first = f.pieces[0]!;
  const el = first.element;
  const placement = first.x !== undefined && first.y !== undefined
    ? { anchor: { to: 'page' as const, edge: 'top-left' as const }, offset: { x: { value: round3(first.x), unit: 'mm' as const }, y: { value: round3(first.y), unit: 'mm' as const } } }
    : { anchor: el.placement.anchor, ...(el.placement.offset ? { offset: el.placement.offset } : {}) };
  const width = f.width !== undefined ? { value: round3(f.width), unit: 'mm' as const }
    : typeof el.placement.size?.width === 'object' && 'value' in el.placement.size.width ? el.placement.size.width : undefined;
  return {
    name: f.name!,
    placement,
    ...(width ? { width } : {}),
    ...(f.look.direction ? { direction: f.look.direction } : {}),
    ...(f.look.writingMode ? { writingMode: f.look.writingMode } : {}),
  };
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** The frames of a template, those of one side in its variant. */
function framesPatch(frames: readonly PlannedFrame[]): { frames: FrameConfig[]; variants?: PageTemplate['variants'] } {
  const own = frames.filter((f) => !f.side).map(frameConfig);
  const recto = frames.filter((f) => f.side === 'recto').map(frameConfig);
  const verso = frames.filter((f) => f.side === 'verso').map(frameConfig);
  const variants: PageTemplate['variants'] = {};
  if (recto.length > 0) variants.recto = { frames: recto };
  if (verso.length > 0) variants.verso = { frames: verso };
  return { frames: own, ...(recto.length > 0 || verso.length > 0 ? { variants } : {}) };
}

/** The running text's frame: the content area, under the decoration as
 *  the running text was under the running head that drew the page. */
const FLOW_FRAME: FrameConfig = { name: 'flow', flow: true, optional: true, layer: -1 };

/** The running heads a design's template sets: its styles' own (what
 *  stayed in them), hidden when nothing did; unset when the styles had
 *  none of their own. */
function runningHeads(d: Design): Pick<PageTemplatePatch, 'header' | 'footer'> {
  return {
    ...(d.ownHeader ? { header: d.plan.header.length > 0 ? { elements: d.plan.header } : false } : {}),
    ...(d.ownFooter ? { footer: d.plan.footer.length > 0 ? { elements: d.plan.footer } : false } : {}),
  };
}

/** `{attr.x}` names a template's decoration and running heads read. */
function attrNamesOf(t: Pick<PageTemplatePatch, 'decoration' | 'header' | 'footer'>[]): Set<string> {
  const names = new Set<string>();
  const text = stableStringify(t);
  for (const m of text.matchAll(/\{attr\.([\w-]+)\}/g)) names.add(m[1]!);
  return names;
}

/** Templates for the designs: one each, or (sharing) a base per family of
 *  designs whose frames stand in the same places, with the pages' own
 *  templates extending it. Names frames on the way. */
export function buildTemplates(designs: Design[], share: boolean, taken: Set<string>): { list: PageTemplate[] } {
  const list: PageTemplate[] = [];
  const idFor = (d: Design): string => {
    const first = d.styleIds[0]!;
    const cut = first.lastIndexOf('--');
    return freeId(cut >= 0 ? first.slice(cut + 2) : first, taken);
  };
  // Keys of frames that more than one design has.
  const occurrences = new Map<string, Set<string>>();
  const keysOf = (d: Design): string[] => {
    const seen = new Map<string, number>();
    return d.plan.frames.map((f) => {
      const n = (seen.get(f.key) ?? 0) + 1;
      seen.set(f.key, n);
      return `${f.key}#${n}`;
    });
  };
  const designKeys = new Map(designs.map((d) => [d, keysOf(d)]));
  for (const d of designs) for (const k of designKeys.get(d)!) {
    const set = occurrences.get(k) ?? new Set<string>();
    set.add(d.key);
    occurrences.set(k, set);
  }
  const families = new Map<string, Design[]>();
  for (const d of designs) {
    const common = share ? designKeys.get(d)!.filter((k) => occurrences.get(k)!.size > 1).sort().join('\n') : '';
    const fam = common ? `${common}\n${stableStringify(runningHeads(d))}` : `solo:${d.key}`;
    const arr = families.get(fam) ?? [];
    arr.push(d);
    families.set(fam, arr);
  }
  let baseCount = 0;
  const childBySpec = new Map<string, string>();
  for (const [fam, members] of families) {
    if (fam.startsWith('solo:') || members.length < 2) {
      for (const d of members) {
        let n = 0;
        let pics = 0;
        for (const f of d.plan.frames.slice().sort(byPosition)) f.name = f.picture ? `picture-${++pics}` : `text-${++n}`;
        const id = idFor(d);
        const decoration = remapDecorationAnchors(d.plan.decoration, d.plan.movedTo, d.plan.frames);
        const { frames, variants } = framesPatch(d.plan.frames);
        const t: PageTemplate = {
          id,
          name: `${id} (${d.styleIds.join(', ')})`,
          ...runningHeads(d),
          decoration: { elements: decoration },
          frames: [FLOW_FRAME, ...frames],
          ...(variants ? { variants } : {}),
        };
        list.push(t);
        d.template = id;
        d.attrNames = attrNamesOf([t]);
      }
      continue;
    }
    // A base with the shared frames and the decoration every member has.
    const sharedKeys = new Set(fam.split('\n').slice(0, -1));
    const first = members[0]!;
    const firstKeys = designKeys.get(first)!;
    const baseFrames = first.plan.frames.filter((_, i) => sharedKeys.has(firstKeys[i]!)).slice().sort(byPosition);
    const nameOfKey = new Map<string, string>();
    baseFrames.forEach((f, i) => nameOfKey.set(firstKeys[first.plan.frames.indexOf(f)]!, `shared-${i + 1}`));
    for (const d of members) {
      const keys = designKeys.get(d)!;
      d.plan.frames.forEach((f, i) => {
        const shared = nameOfKey.get(keys[i]!);
        if (shared) f.name = shared;
      });
      let n = 0;
      let pics = 0;
      for (const f of d.plan.frames.slice().sort(byPosition)) if (!f.name) f.name = f.picture ? `picture-${++pics}` : `text-${++n}`;
    }
    // Decoration every member draws (ids aside): the base's, under the
    // first member's ids.
    const NO_ID = new Set(['id']);
    const decos = members.map((d) => remapDecorationAnchors(d.plan.decoration, d.plan.movedTo, d.plan.frames));
    const decoStrings = decos.map((list) => list.map((e) => stableStringify(e, NO_ID)));
    const countOf = (list: string[]) => list.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>());
    const counts = decoStrings.map(countOf);
    const shared = new Map<string, number>();
    for (const [k, n] of counts[0]!) shared.set(k, Math.min(n, ...counts.slice(1).map((c) => c.get(k) ?? 0)));
    const commonIdx: Set<number>[] = decoStrings.map((list) => {
      const left = new Map(shared);
      const picked = new Set<number>();
      list.forEach((k, i) => {
        const n = left.get(k) ?? 0;
        if (n > 0) { picked.add(i); left.set(k, n - 1); }
      });
      return picked;
    });
    const common = decos[0]!.filter((_, i) => commonIdx[0]!.has(i));
    const baseId = freeId(baseCount++ === 0 ? 'page-base' : `page-base-${baseCount}`, taken);
    const baseFramesCfg = framesPatch(baseFrames);
    const base: PageTemplate = {
      id: baseId,
      name: `Shared frames (${members.length} pages)`,
      ...runningHeads(first),
      decoration: { elements: common },
      frames: [FLOW_FRAME, ...baseFramesCfg.frames],
      ...(baseFramesCfg.variants ? { variants: baseFramesCfg.variants } : {}),
    };
    list.push(base);
    members.forEach((d, mi) => {
      const keys = designKeys.get(d)!;
      const own = d.plan.frames.filter((_, i) => !sharedKeys.has(keys[i]!));
      // A shared element goes by the base's id: anchors to it follow.
      const renamed = new Map<string, string>();
      const firstShared = decos[0]!.filter((_, i) => commonIdx[0]!.has(i));
      decos[mi]!.filter((_, i) => commonIdx[mi]!.has(i)).forEach((e, j) => { if (firstShared[j] && firstShared[j]!.id !== e.id) renamed.set(e.id, firstShared[j]!.id); });
      const ownDeco = decos[mi]!.filter((_, i) => !commonIdx[mi]!.has(i)).map((e) => {
        if (e.kind === 'connector') return e;
        const to = e.placement?.anchor?.to;
        const target = typeof to === 'string' && to.startsWith('#') ? renamed.get(to.slice(1)) : undefined;
        return target ?({ ...e, placement: { ...e.placement, anchor: { ...e.placement.anchor, to: `#${target}` } } } as DesignElement) : e;
      });
      if (own.length === 0 && ownDeco.length === 0) {
        d.template = baseId;
        d.attrNames = attrNamesOf([base]);
        return;
      }
      const patch = framesPatch(own);
      const spec = stableStringify({ patch, ownDeco, own: own.map((f) => f.key) });
      const known = childBySpec.get(spec);
      if (known) {
        d.template = known;
        d.attrNames = attrNamesOf([base, list.find((t) => t.id === known)!]);
        return;
      }
      const id = idFor(d);
      const child: PageTemplate = {
        id,
        name: `${id} (${d.styleIds.join(', ')})`,
        extends: baseId,
        ...(ownDeco.length > 0 ? { decoration: { elements: ownDeco } } : {}),
        ...(patch.frames.length > 0 ? { frames: patch.frames } : {}),
        ...(patch.variants ? { variants: patch.variants } : {}),
      };
      list.push(child);
      childBySpec.set(spec, id);
      d.template = id;
      d.attrNames = attrNamesOf([base, child]);
    });
  }
  return { list };
}

function byPosition(a: PlannedFrame, b: PlannedFrame): number {
  const at = (f: PlannedFrame) => (f.picture ? { x: f.picture.x, y: f.picture.y } : { x: f.pieces[0]!.x ?? 0, y: f.pieces[0]!.y ?? Infinity });
  const pa = at(a);
  const pb = at(b);
  return pa.y - pb.y || pa.x - pb.x;
}
