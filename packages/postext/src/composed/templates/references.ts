// References between frames: continue-in chains, repeated frames,
// anchors to groups and containers, and loops among them (#1276: split
// out of templates.ts).
import type { ElementPlacement, DesignElement } from '../../types.js';
import type { ResolvedPageTemplate, ResolvedFrameGroup, ResolvedFrame } from '../types.js';
import { isRecord } from './defaults.js';
import type { TemplateIssue } from './merging.js';

/** The id an anchor names (`'#dinero'` → `'dinero'`), or undefined. */
export function anchorTarget(placement: ElementPlacement | undefined): string | undefined {
  const to = isRecord(placement) && isRecord(placement.anchor) ? placement.anchor.to : undefined;
  return typeof to === 'string' && to.startsWith('#') && to.length > 1 ? to.slice(1) : undefined;
}

/** The frame a `continueIn` of the form `'#frame'` names. */
export function continueInFrame(continueIn: unknown): string | undefined {
  return typeof continueIn === 'string' && continueIn.startsWith('#') && continueIn.length > 1 ? continueIn.slice(1) : undefined;
}

/** The template a `continueIn` of the form `'template:<id>'` names. */
export function continueInTemplate(continueIn: unknown): string | undefined {
  return typeof continueIn === 'string' && continueIn.startsWith('template:') && continueIn.length > 9 ? continueIn.slice(9) : undefined;
}

/** The later page fence `'page:<id>'` names, and the frame of it
 *  `'page:<id>#<frame>'` names (#917): a story that jumps there. `<id>`
 *  may be `{attr.name}`, the fence's attribute (`resolveContinueIn`). */
export function continueInPage(continueIn: unknown): { page: string; frame?: string } | undefined {
  if (typeof continueIn !== 'string' || !continueIn.startsWith('page:')) return undefined;
  const rest = continueIn.slice(5);
  const hash = rest.indexOf('#');
  const page = (hash >= 0 ? rest.slice(0, hash) : rest).trim();
  const frame = hash >= 0 ? rest.slice(hash + 1).trim() : '';
  return page.length > 0 ? { page, ...(frame.length > 0 ? { frame } : {}) } : undefined;
}

/** `continueIn` with each `{attr.name}` read from the page fence's
 *  attributes (#917): `'page:{attr.sigue}'` with `sigue="p47"` is
 *  `'page:p47'`. An attribute the fence lacks reads as nothing. */
export function resolveContinueIn(continueIn: string, attrs: Readonly<Record<string, string>>): string {
  return continueIn.includes('{attr.') ? continueIn.replace(/\{attr\.([A-Za-z0-9_-]+)\}/g, (_, k: string) => attrs[k] ?? '') : continueIn;
}

/** `name` read as an instance of a repeated frame (#1061): `card[2]` is
 *  item 2 of frame `card`. Undefined for any other name. */
export function repeatInstance(name: string): { frame: string; item: number } | undefined {
  const open = name.lastIndexOf('[');
  if (open <= 0 || !name.endsWith(']')) return undefined;
  const digits = name.slice(open + 1, -1);
  if (digits.length === 0 || digits.length > 6) return undefined;
  for (const ch of digits) if (ch < '0' || ch > '9') return undefined;
  const item = Number(digits);
  return item >= 1 ? { frame: name.slice(0, open), item } : undefined;
}

/** The name of item `item`'s instance of frame `frame` (#1061). */
export function repeatInstanceName(frame: string, item: number): string {
  return `${frame}[${item}]`;
}

/** The frames a template's grids repeat (#1061), each with its grid. */
export function repeatedFrames(template: Pick<ResolvedPageTemplate, 'groups'>): Map<string, ResolvedFrameGroup> {
  const out = new Map<string, ResolvedFrameGroup>();
  for (const g of template.groups) for (const f of g.repeat?.frames ?? []) if (!out.has(f)) out.set(f, g);
  return out;
}

// ---------------------------------------------------------------------------
// References: groups, anchors, chains
// ---------------------------------------------------------------------------

/** Where a placement's anchor sits among a frame's or group's fields. */
const ANCHOR_FIELD = 'placement/anchor/to';

function withContainerAnchor(placement: ElementPlacement): ElementPlacement {
  return { ...placement, anchor: { ...placement.anchor, to: 'container' } };
}

/** The first loop of `edges` reachable in `order`, as the node list from
 *  the node it closes on back to it, or undefined. */
function findLoop(order: readonly string[], edges: Map<string, string[]>): string[] | undefined {
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (n: string): string[] | undefined => {
    state.set(n, 1);
    stack.push(n);
    for (const m of edges.get(n) ?? []) {
      const s = state.get(m);
      if (s === 1) return [...stack.slice(stack.indexOf(m)), m];
      if (s === undefined) {
        const found = visit(m);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(n, 2);
    return undefined;
  };
  for (const n of order) {
    if (state.has(n)) continue;
    const found = visit(n);
    if (found) return found;
  }
  return undefined;
}

/** Settle the references of a merged template: group members that do not
 *  exist or are claimed twice are skipped, anchors to nothing (or in a
 *  loop) read as `'container'`, `next`/`continueIn` links to nothing (or
 *  closing a loop) are dropped. Each fix is an issue. */
export function settleReferences(
  frames: ResolvedFrame[],
  groups: ResolvedFrameGroup[],
  decoration: { value: DesignElement; configPath: string }[],
  context: { templateIds: ReadonlySet<string>; calloutStyleIds?: ReadonlySet<string>; module?: boolean },
  overflowTemplate: { value: unknown; path: string } | undefined,
  issues: TemplateIssue[],
): { overflowTemplate?: string } {
  const frameNames = frames.map((f) => f.name);
  const frameSet = new Set(frameNames);
  // A group named like a frame: anchors read the frame.
  for (const g of groups) {
    if (frameSet.has(g.name)) issues.push({ kind: 'frameDuplicate', path: g.configPath, value: g.name, used: '' });
  }
  const boxNames = [...frameNames, ...groups.map((g) => g.name).filter((n) => !frameSet.has(n))];
  const boxSet = new Set(boxNames);

  // Styles.
  if (context.calloutStyleIds) {
    for (const f of frames) {
      if (f.style !== undefined && !context.calloutStyleIds.has(f.style)) {
        issues.push({ kind: 'frameStyleUnknown', path: f.fieldPaths.style ?? `${f.configPath}/style`, value: f.style, used: '', known: [...context.calloutStyleIds] });
        delete f.style;
      }
    }
  }

  // Group members. A grid's repeated frames (#1061) are claimed first:
  // another group that lists one of them loses it.
  const claimed = new Set<string>();
  const claimOrder = [...groups.filter((g) => g.repeat), ...groups.filter((g) => !g.repeat)];
  for (const g of claimOrder) {
    const raw = g.frames;
    const kept: string[] = [];
    raw.forEach((name, k) => {
      const path = g.repeat ? `${g.fieldPaths.repeat ?? `${g.configPath}/repeat`}/frames/${k}` : `${g.fieldPaths.frames ?? `${g.configPath}/frames`}/${k}`;
      if (!frameSet.has(name)) {
        issues.push({ kind: 'groupFrameUnknown', path, value: name, used: '', known: frameNames });
      } else if (claimed.has(name)) {
        issues.push({ kind: 'groupFrameTwice', path, value: name, used: '' });
      } else {
        claimed.add(name);
        kept.push(name);
      }
    });
    g.frames = kept;
    if (g.repeat) {
      if (kept.length > 0) g.repeat = { ...g.repeat, frames: kept };
      else delete g.repeat;
    }
  }
  /** `card[2]` names an instance of a repeated frame (#1061): decoration
   *  and other frames may anchor to it. */
  const repeated = new Set(groups.flatMap((g) => g.repeat?.frames ?? []));
  const isInstance = (name: string): boolean => {
    const at = repeatInstance(name);
    return at !== undefined && repeated.has(at.frame);
  };

  // Anchors: unknown targets first, then loops.
  type Box = ResolvedFrame | ResolvedFrameGroup;
  const boxes = new Map<string, Box>();
  for (const f of frames) if (!boxes.has(f.name)) boxes.set(f.name, f);
  for (const g of groups) if (!boxes.has(g.name)) boxes.set(g.name, g);
  const anchorPath = (b: Box) => b.fieldPaths.placement ? `${b.fieldPaths.placement}/anchor/to` : `${b.configPath}/${ANCHOR_FIELD}`;
  const anchored = (b: Box): string | undefined => (b.grid ? undefined : anchorTarget(b.placement));
  for (const b of boxes.values()) {
    const target = anchored(b);
    if (target !== undefined && !boxSet.has(target) && !isInstance(target)) {
      issues.push({ kind: 'frameAnchorUnknown', path: anchorPath(b), value: `#${target}`, used: 'container', known: boxNames.map((n) => `#${n}`) });
      b.placement = withContainerAnchor(b.placement!);
    }
  }
  for (;;) {
    const edges = new Map<string, string[]>();
    for (const [name, b] of boxes) {
      const out: string[] = [];
      const target = anchored(b);
      if (target !== undefined) out.push(target);
      // A group with no box of its own is the union of its frames' boxes.
      if ('kind' in b && !b.placement && !b.grid) out.push(...b.frames);
      edges.set(name, out);
    }
    const loop = findLoop(boxNames, edges);
    if (!loop) break;
    // Drop the explicit anchor of the loop set latest in template order.
    let drop: Box | undefined;
    for (let k = 0; k < loop.length - 1; k++) {
      const b = boxes.get(loop[k]!)!;
      if (anchored(b) === loop[k + 1] && (!drop || boxNames.indexOf(b.name) > boxNames.indexOf(drop.name))) drop = b;
    }
    if (!drop) break; // cannot happen: a group's members never loop by themselves
    issues.push({ kind: 'frameAnchorUnknown', path: anchorPath(drop), value: loop.join(' → '), used: 'container' });
    drop.placement = withContainerAnchor(drop.placement!);
  }

  // Decoration anchors: another element of the decoration, or a box.
  const elementIds = new Set(decoration.map((e) => e.value.id).filter((id): id is string => typeof id === 'string'));
  decoration.forEach((e) => {
    if (e.value.kind === 'connector') {
      // A connector's ends (#1056): a box, an instance (`#card[2]`), every
      // instance (`#card[*]`, in `to` only) or another element. An end on
      // nothing is left out; a connector left with no `from` or no `to` is
      // not drawn.
      const known = (to: unknown, many: boolean): boolean => {
        if (typeof to !== 'string' || !to.startsWith('#')) return false;
        const name = to.slice(1);
        if (elementIds.has(name) || boxSet.has(name) || isInstance(name)) return true;
        if (many && name.endsWith('[*]') && repeated.has(name.slice(0, -3))) return true;
        // A module's connector may end on a frame of the page that stacks
        // it (an org chart's head, #1069): the module does not know the
        // page, so the end is kept and laid when the page has that frame,
        // else dropped there (`connectorDropped`).
        return context.module === true && name !== '';
      };
      const report = (to: unknown, path: string) => issues.push({ kind: 'frameAnchorUnknown', path, value: String(to), used: '', known: [...boxNames, ...elementIds].map((n) => `#${n}`) });
      const c = e.value;
      const fromTo = (c.from as { to?: unknown } | undefined)?.to;
      let from = c.from;
      if (!known(fromTo, false)) {
        report(fromTo, `${e.configPath}/from/to`);
        from = undefined as unknown as typeof c.from;
      }
      const list = Array.isArray(c.to) ? c.to : [c.to];
      const kept = list.filter((end, k) => {
        const to = (end as { to?: unknown } | undefined)?.to;
        if (known(to, true)) return true;
        report(to, Array.isArray(c.to) ? `${e.configPath}/to/${k}/to` : `${e.configPath}/to/to`);
        return false;
      });
      if (from !== c.from || kept.length !== list.length) e.value = { ...c, from, to: kept };
      return;
    }
    const target = anchorTarget(e.value.placement);
    if (target !== undefined && !elementIds.has(target) && !boxSet.has(target) && !isInstance(target)) {
      issues.push({ kind: 'frameAnchorUnknown', path: `${e.configPath}/${ANCHOR_FIELD}`, value: `#${target}`, used: 'container', known: [...boxNames, ...elementIds].map((n) => `#${n}`) });
      e.value = { ...e.value, placement: withContainerAnchor(e.value.placement) } as DesignElement;
    }
  });

  // Chains: `next` and `overflow.continueIn`.
  for (const f of frames) {
    if (f.next !== undefined && !frameSet.has(f.next)) {
      issues.push({ kind: 'overflowTargetUnknown', path: f.fieldPaths.next ?? `${f.configPath}/next`, value: f.next, used: '', known: frameNames });
      delete f.next;
    }
    const continueIn = f.overflow.continueIn;
    if (continueIn !== undefined) {
      const frameTarget = continueInFrame(continueIn);
      const templateTarget = continueInTemplate(continueIn);
      const ok = continueIn === 'next-page'
        || continueInPage(continueIn) !== undefined
        || (frameTarget !== undefined && frameSet.has(frameTarget))
        || (templateTarget !== undefined && context.templateIds.has(templateTarget));
      if (!ok) {
        const known = frameTarget !== undefined ? frameNames.map((n) => `#${n}`)
          : templateTarget !== undefined ? [...context.templateIds].map((id) => `template:${id}`)
            : ['next-page', 'page:<id>'];
        issues.push({ kind: 'overflowTargetUnknown', path: f.fieldPaths['overflow/continueIn'] ?? `${f.configPath}/overflow/continueIn`, value: continueIn, used: '', known });
        f.overflow = { ...f.overflow };
        delete f.overflow.continueIn;
      }
    }
  }
  const byName = new Map(frames.map((f) => [f.name, f] as const));
  for (;;) {
    const edges = new Map<string, string[]>();
    for (const f of frames) {
      const out: string[] = [];
      if (f.next !== undefined) out.push(f.next);
      const target = continueInFrame(f.overflow.continueIn);
      if (target !== undefined) out.push(target);
      edges.set(f.name, out);
    }
    const loop = findLoop(frameNames, edges);
    if (!loop) break;
    // The link that closes the loop: from its last frame back to its first.
    const from = byName.get(loop[loop.length - 2]!)!;
    const to = loop[loop.length - 1]!;
    if (from.next === to) {
      issues.push({ kind: 'frameChainLoop', path: from.fieldPaths.next ?? `${from.configPath}/next`, value: loop.join(' → '), used: '' });
      delete from.next;
    } else {
      issues.push({ kind: 'frameChainLoop', path: from.fieldPaths['overflow/continueIn'] ?? `${from.configPath}/overflow/continueIn`, value: loop.join(' → '), used: '' });
      from.overflow = { ...from.overflow };
      delete from.overflow.continueIn;
    }
  }

  if (overflowTemplate && overflowTemplate.value !== undefined) {
    const id = overflowTemplate.value;
    if (typeof id === 'string' && context.templateIds.has(id)) return { overflowTemplate: id };
    issues.push({ kind: 'overflowTargetUnknown', path: overflowTemplate.path, value: String(id), used: '', known: [...context.templateIds] });
  }
  return {};
}
