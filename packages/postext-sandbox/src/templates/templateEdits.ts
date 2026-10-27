/**
 * Edits of `config.pageTemplates` (#863), pure: every function takes the
 * list as stored and gives a new one, so the Design panel and the frame
 * editor on the page write through the same rules.
 *
 * A template is edited at a scope: its own fields (`'base'`) or one of its
 * variants (`'recto'`, `'verso'`, the patch applied on that side). A frame
 * or group the scope does not define (it comes from the template it
 * `extends`, or from the base when a variant is edited) gets a patch entry
 * of its own on the first change: `{ name, ...the fields changed }`, as the
 * engine merges frames by name. A patch entry left with nothing but its
 * name is dropped.
 */

import type { PageTemplate, PageTemplatePatch, DesignElement, DecorationRemoval, DesignSlot, FrameConfig, ResolvedPageTemplate } from 'postext';
import { type Rect, mmDim, pxToMm } from './frameGeometry.js';

export { frameEntry, frameInherited, updateFrame, newFrameFor, moveMember, addFrame, removeFrame, namesInUse, frameFamily, renameFrame, addGroup, updateGroup, removeGroup } from './templateEdits/frames.js';

export type TemplateScope = 'base' | 'recto' | 'verso';

export type Templates = readonly PageTemplate[];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A deep copy (the config holds plain JSON). */
export const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/** Free text turned into an id or a slot name: lowercase, dashes. */
export function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `base`, else `base-2`, `base-3`… whichever is not taken. */
export function uniqueName(taken: Iterable<string>, base: string): string {
  const set = new Set(taken);
  const root = base || 'item';
  if (!set.has(root)) return root;
  let n = 2;
  while (set.has(`${root}-${n}`)) n++;
  return `${root}-${n}`;
}

export function templateAt(templates: Templates, id: string): { template: PageTemplate; index: number } | undefined {
  const index = templates.findIndex((t) => isRecord(t) && t.id === id);
  return index < 0 ? undefined : { template: templates[index]!, index };
}

/** The ids of `id`'s ancestors (`extends`), nearest first; stops at a loop. */
export function ancestorsOf(templates: Templates, id: string): string[] {
  const out: string[] = [];
  const seen = new Set([id]);
  let at = templateAt(templates, id)?.template.extends;
  while (at && !seen.has(at)) {
    seen.add(at);
    out.push(at);
    at = templateAt(templates, at)?.template.extends;
  }
  return out;
}

/** The templates that extend `id`, at any depth. */
export function descendantsOf(templates: Templates, id: string): string[] {
  return templates.filter((t) => t.id !== id && ancestorsOf(templates, t.id).includes(id)).map((t) => t.id);
}

/** The patch a scope writes to. */
export function scopeEntry(template: PageTemplate, scope: TemplateScope): PageTemplatePatch | undefined {
  return scope === 'base' ? template : template.variants?.[scope];
}

export function withScope(template: PageTemplate, scope: TemplateScope, edit: (patch: PageTemplatePatch) => PageTemplatePatch): PageTemplate {
  if (scope === 'base') return edit({ ...template }) as PageTemplate;
  const variants = { ...(template.variants ?? {}) };
  const next = edit({ ...(variants[scope] ?? {}) });
  if (Object.keys(next).length === 0) delete variants[scope];
  else variants[scope] = next;
  const out: PageTemplate = { ...template };
  if (Object.keys(variants).length === 0) delete out.variants;
  else out.variants = variants;
  return out;
}

export function replaceTemplate(templates: Templates, id: string, edit: (t: PageTemplate) => PageTemplate): PageTemplate[] {
  return templates.map((t) => (t.id === id ? edit(t) : t));
}

/** `obj` with `patch` applied: an undefined value takes the key off. */
export function applyFields<T extends object>(obj: T, patch: Record<string, unknown>): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out as T;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/** A template made from scratch: one flow frame over the whole area, so
 *  the page shows its text before any frame is drawn. */
export function createTemplate(templates: Templates, name: string): { templates: PageTemplate[]; id: string } {
  const id = uniqueName(templates.map((t) => t.id), slugify(name) || 'template');
  return { templates: [...templates, { id, name, frames: [{ name: 'text', flow: true }] }], id };
}

/** A copy of template `id` (its variants and `extends` too), after it. */
export function duplicateTemplate(templates: Templates, id: string, name: string): { templates: PageTemplate[]; id: string } {
  const at = templateAt(templates, id);
  if (!at) return { templates: [...templates], id };
  const nextId = uniqueName(templates.map((t) => t.id), `${id}-copy`);
  const copy: PageTemplate = { ...clone(at.template), id: nextId, name };
  const out = [...templates];
  out.splice(at.index + 1, 0, copy);
  return { templates: out, id: nextId };
}

/** Template `id` taken out; the templates that extend it keep what they
 *  inherited (its fields merged into theirs), so their pages do not move. */
export function removeTemplate(templates: Templates, id: string): PageTemplate[] {
  const at = templateAt(templates, id);
  if (!at) return [...templates];
  const parent = at.template;
  return templates
    .filter((t) => t.id !== id)
    .map((t) => {
      if (t.extends !== id) return t;
      const merged = mergeTemplatePatch(parent, t);
      if (parent.extends) merged.extends = parent.extends;
      else delete merged.extends;
      return merged;
    });
}

/** `child` laid over `parent` the way the engine merges an `extends`. */
function mergeTemplatePatch(parent: PageTemplate, child: PageTemplate): PageTemplate {
  const out: PageTemplate = { ...clone(parent), ...clone(child) };
  const byName = <T extends { name: string; remove?: boolean }>(a: T[] | undefined, b: T[] | undefined): T[] | undefined => {
    if (!a && !b) return undefined;
    const list: T[] = clone(a ?? []);
    for (const e of b ?? []) {
      const i = list.findIndex((x) => x.name === e.name);
      if (e.remove) {
        if (i >= 0) list.splice(i, 1);
        continue;
      }
      if (i >= 0) list[i] = { ...list[i]!, ...clone(e) };
      else list.push(clone(e));
    }
    return list;
  };
  const frames = byName(parent.frames, child.frames);
  const groups = byName(parent.groups, child.groups);
  if (frames) out.frames = frames;
  if (groups) out.groups = groups;
  if (parent.grid || child.grid) out.grid = { ...(parent.grid ?? {}), ...(child.grid ?? {}) } as PageTemplate['grid'];
  if (parent.decoration || child.decoration) {
    const elements = clone(parent.decoration?.elements ?? []);
    for (const el of child.decoration?.elements ?? []) {
      const i = isElementId(el) ? elements.findIndex((x) => x.id === el.id) : -1;
      // A removal (#975) takes the inherited element out.
      if (isRemoval(el)) {
        if (i >= 0) elements.splice(i, 1);
        continue;
      }
      if (i >= 0) elements[i] = { ...elements[i]!, ...clone(el) } as typeof el;
      else elements.push(clone(el));
    }
    out.decoration = { elements };
  }
  return out;
}

/** Template `id` renamed `next`, with every reference to it: `extends`,
 *  `overflowTemplate` and `continueIn: 'template:…'`. */
export function renameTemplate(templates: Templates, id: string, next: string): PageTemplate[] {
  if (id === next || templates.some((t) => t.id === next)) return [...templates];
  const fixPatch = <P extends PageTemplatePatch>(p: P): P => {
    const out = { ...p };
    if (out.overflowTemplate === id) out.overflowTemplate = next;
    if (out.frames) {
      out.frames = out.frames.map((f) => (f.overflow?.continueIn === `template:${id}` ? { ...f, overflow: { ...f.overflow, continueIn: `template:${next}` } } : f));
    }
    return out;
  };
  return templates.map((t) => {
    let out = fixPatch(t);
    if (out.id === id) out = { ...out, id: next };
    if (out.extends === id) out = { ...out, extends: next };
    if (out.variants) {
      out = {
        ...out,
        variants: {
          ...(out.variants.recto ? { recto: fixPatch(out.variants.recto) } : {}),
          ...(out.variants.verso ? { verso: fixPatch(out.variants.verso) } : {}),
        },
      };
    }
    return out;
  });
}

/** Template-level fields set (undefined: taken off) at a scope. `id`,
 *  `name`, `extends`, `spread`, `gutter` and `role` are the template's
 *  own and always go to the base. */
export function updateTemplate(templates: Templates, id: string, scope: TemplateScope, patch: Partial<PageTemplate>): PageTemplate[] {
  const own: Record<string, unknown> = {};
  const scoped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'name' || k === 'extends' || k === 'spread' || k === 'gutter' || k === 'role' || k === 'variants') own[k] = v;
    else scoped[k] = v;
  }
  return replaceTemplate(templates, id, (t) => {
    let out = applyFields(t, own);
    if (Object.keys(scoped).length > 0) out = withScope(out, scope, (p) => applyFields(p, scoped));
    return out;
  });
}

// ---------------------------------------------------------------------------
// Decoration inherited from another template (#975)
// ---------------------------------------------------------------------------

/** Whether a decoration entry takes the inherited element of its `id` out
 *  (`{ id, remove: true }`) instead of drawing one. */
export function isRemoval(el: DesignElement | DecorationRemoval): el is DecorationRemoval {
  return (el as { remove?: unknown }).remove === true;
}

const isElementId = (el: DesignElement | DecorationRemoval): boolean => typeof el.id === 'string' && el.id !== '';

/** A scope's decoration split in the elements it draws and the ids it
 *  hides, so the slot editor shows only the first and writes them back
 *  with the second kept ({@link joinDecoration}). */
export function splitDecoration(decoration: { elements: (DesignElement | DecorationRemoval)[] } | undefined): { slot: DesignSlot; hidden: string[] } {
  const slot: DesignSlot = { elements: [] };
  const hidden: string[] = [];
  for (const el of decoration?.elements ?? []) {
    if (isRemoval(el)) hidden.push(el.id);
    else slot.elements.push(el);
  }
  return { slot, hidden };
}

/** The inverse of {@link splitDecoration}: the elements drawn, then the
 *  removals; undefined when both are empty. */
export function joinDecoration(slot: DesignSlot | undefined, hidden: readonly string[]): { elements: (DesignElement | DecorationRemoval)[] } | undefined {
  const elements: (DesignElement | DecorationRemoval)[] = [...(slot?.elements ?? []), ...hidden.map((id): DecorationRemoval => ({ id, remove: true }))];
  return elements.length > 0 ? { elements } : undefined;
}

/** The decoration elements a scope inherits: those of the templates it
 *  `extends` (root first) and, for a variant, of its own base, less what
 *  later patches took out; not the ones the scope redefines by `id` (they
 *  are its own). With the ids the scope hides. */
export function inheritedDecoration(templates: Templates, id: string, scope: TemplateScope): { elements: DesignElement[]; hidden: string[] } {
  const own = templateAt(templates, id)?.template;
  if (!own) return { elements: [], hidden: [] };
  const elements: DesignElement[] = [];
  const apply = (patch: PageTemplatePatch | undefined): void => {
    for (const el of patch?.decoration?.elements ?? []) {
      const i = isElementId(el) ? elements.findIndex((x) => x.id === el.id) : -1;
      if (isRemoval(el)) {
        if (i >= 0) elements.splice(i, 1);
      } else if (i >= 0) elements[i] = { ...elements[i]!, ...el } as DesignElement;
      else elements.push(el);
    }
  };
  for (const ancestor of ancestorsOf(templates, id).reverse()) apply(templateAt(templates, ancestor)?.template);
  if (scope !== 'base') apply(own);
  const scoped = scopeEntry(own, scope);
  const ownIds = new Set((scoped?.decoration?.elements ?? []).filter((e) => !isRemoval(e)).map((e) => e.id));
  const hidden = (scoped?.decoration?.elements ?? []).filter(isRemoval).map((e) => e.id);
  // What the scope hides stays in the list (to show it again): the
  // elements as they stood before this scope's own removals.
  return { elements: elements.filter((el) => !ownIds.has(el.id)), hidden };
}

/** Hide (`hidden: true`) or show again the inherited decoration element
 *  `elementId` on one template or variant: a `{ id, remove: true }` entry
 *  in its decoration, taken off to show it. */
export function setInheritedElementHidden(templates: Templates, id: string, scope: TemplateScope, elementId: string, hidden: boolean): PageTemplate[] {
  return replaceTemplate(templates, id, (t) =>
    withScope(t, scope, (p) => {
      const { slot, hidden: ids } = splitDecoration(p.decoration);
      const next = hidden ? (ids.includes(elementId) ? ids : [...ids, elementId]) : ids.filter((x) => x !== elementId);
      const decoration = joinDecoration(slot, next);
      const out = { ...p };
      if (decoration) out.decoration = decoration;
      else delete out.decoration;
      return out;
    }));
}

// ---------------------------------------------------------------------------
// From a page
// ---------------------------------------------------------------------------

/**
 * A variant of template `baseId` for one page: a new template that
 * extends it and patches one frame. The caller points the page's fence at
 * it (`fenceTemplateChange`).
 */
export function variantForPage(templates: Templates, baseId: string, name: string, frame: FrameConfig): { templates: PageTemplate[]; id: string } {
  const at = templateAt(templates, baseId);
  const id = uniqueName(templates.map((t) => t.id), `${baseId}-page`);
  const child: PageTemplate = { id, name, extends: baseId, frames: [frame] };
  const out = [...templates];
  out.splice(at ? at.index + 1 : out.length, 0, child);
  return { templates: out, id };
}

/** The frame fields «Save layout as template» keeps from the page's
 *  template: everything but where the frame stands and how big it is. */
const KEPT_FRAME_FIELDS = [
  'style', 'layer', 'rotate', 'verticalAlign', 'columns', 'columnGap', 'padding', 'exclude', 'flow', 'next', 'takes',
  'pin', 'grow', 'shrink', 'priority', 'fit', 'overflow', 'optional', 'crossGutter', 'writingMode', 'direction',
] as const;

/**
 * «Save layout as template»: a new template whose frames stand where the
 * page `rects` shows them (page px, measured from the template's area) at
 * fixed sizes in millimetres, with the rest of each frame, the decoration,
 * the running heads and the area of the page's template (`resolved`).
 */
export function templateFromLayout(
  templates: Templates,
  resolved: ResolvedPageTemplate,
  rects: ReadonlyMap<string, Rect>,
  area: Rect,
  dpi: number,
  name: string,
): { templates: PageTemplate[]; id: string } {
  const id = uniqueName(templates.map((t) => t.id), `${resolved.id}-layout`);
  const frames: FrameConfig[] = resolved.frames.flatMap((f) => {
    const rect = rects.get(f.name);
    if (!rect) return [];
    const out: Record<string, unknown> = {
      name: f.name,
      placement: {
        anchor: { to: 'container', edge: 'top-left' },
        offset: { x: mmDim(pxToMm(rect.x - area.x, dpi)), y: mmDim(pxToMm(rect.y - area.y, dpi)) },
      },
      width: mmDim(pxToMm(rect.width, dpi)),
      height: mmDim(pxToMm(rect.height, dpi)),
    };
    const src = f as unknown as Record<string, unknown>;
    for (const key of KEPT_FRAME_FIELDS) {
      // Only what the template wrote: defaults stay unset.
      if (f.fieldPaths[key] !== undefined && src[key] !== undefined) out[key] = clone(src[key]);
    }
    return [out as unknown as FrameConfig];
  });
  const template: PageTemplate = {
    id,
    name,
    ...(resolved.area !== 'content' ? { area: resolved.area } : {}),
    frames,
    ...(resolved.decoration.elements.length > 0 ? { decoration: clone(resolved.decoration) } : {}),
    ...(resolved.header !== undefined ? { header: clone(resolved.header) } : {}),
    ...(resolved.footer !== undefined ? { footer: clone(resolved.footer) } : {}),
    ...(resolved.bodyStyle ? { bodyStyle: resolved.bodyStyle } : {}),
    ...(resolved.palette ? { palette: resolved.palette } : {}),
    ...(resolved.role !== 'composed' ? { role: resolved.role } : {}),
  };
  return { templates: [...templates, template], id };
}
