// Edits of a template's frames and groups at a scope: update, add, move,
// remove and rename a frame with every anchor that names it (#1276:
// split out of templateEdits.ts).
import type { FrameConfig, PageTemplatePatch, PageTemplate, ResolvedPageTemplate, FrameGroupConfig } from 'postext';
import { mmDim } from '../frameGeometry.js';
import { type Templates, type TemplateScope, templateAt, scopeEntry, ancestorsOf, replaceTemplate, withScope, applyFields, clone, descendantsOf, isRemoval } from '../templateEdits.js';

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/** The frame entry `name` of a scope, as stored. */
export function frameEntry(templates: Templates, id: string, scope: TemplateScope, name: string): FrameConfig | undefined {
  const t = templateAt(templates, id)?.template;
  const p = t ? scopeEntry(t, scope) : undefined;
  return p?.frames?.find((f) => f.name === name);
}

/** Whether frame `name` reaches the scope from elsewhere: an ancestor
 *  template, or the base when a variant is edited. */
export function frameInherited(templates: Templates, id: string, scope: TemplateScope, name: string): boolean {
  const defines = (tid: string, s: TemplateScope): boolean => !!frameEntry(templates, tid, s, name) && !frameEntry(templates, tid, s, name)!.remove;
  if (scope !== 'base' && defines(id, 'base')) return true;
  return ancestorsOf(templates, id).some((a) => defines(a, 'base'));
}

function withFrames(p: PageTemplatePatch, edit: (frames: FrameConfig[]) => FrameConfig[]): PageTemplatePatch {
  const frames = edit([...(p.frames ?? [])]);
  const out = { ...p };
  if (frames.length === 0) delete out.frames;
  else out.frames = frames;
  return out;
}

/**
 * Fields of frame `name` set at a scope (an undefined value takes the
 * field off): the scope's entry, created as a patch when the frame comes
 * from elsewhere, dropped when only its name is left of a patch.
 */
export function updateFrame(templates: Templates, id: string, scope: TemplateScope, name: string, patch: Partial<Record<keyof FrameConfig, unknown>>): PageTemplate[] {
  const inherited = frameInherited(templates, id, scope, name);
  return replaceTemplate(templates, id, (t) =>
    withScope(t, scope, (p) =>
      withFrames(p, (frames) => {
        const i = frames.findIndex((f) => f.name === name);
        const base: FrameConfig = i >= 0 ? frames[i]! : { name };
        const next = applyFields(base, patch as Record<string, unknown>);
        const onlyName = Object.keys(next).every((k) => k === 'name');
        if (i >= 0) {
          if (onlyName && inherited) frames.splice(i, 1);
          else frames[i] = next;
        } else if (!onlyName) {
          frames.push(next);
        }
        return frames;
      }),
    ),
  );
}

/** The frame «Add frame» makes (#991). In a template whose groups already
 *  have members it is sized like the last member of the last such group
 *  (its width and height, as the template resolves them), so a frame added
 *  to a stack comes out as wide and as tall as the ones it joins instead
 *  of a 60 × 40 mm box that has to be changed field by field. A template
 *  with a stack but no member yet gives it the stack's sizes: up to the
 *  edge, as tall as its content. Without a group it is a box of 60 × 40 mm
 *  at the top left of the area. */
export function newFrameFor(name: string, resolved: Pick<ResolvedPageTemplate, 'frames' | 'groups'>): FrameConfig {
  const byName = new Map(resolved.frames.map((f) => [f.name, f]));
  for (const group of [...resolved.groups].reverse()) {
    const members = group.frames.flatMap((m) => byName.get(m) ?? []);
    const like = members[members.length - 1];
    if (like) return { name, width: clone(like.width), height: clone(like.height) };
  }
  if (resolved.groups.some((g) => g.kind === 'stack')) return { name, width: 'fill', height: 'auto' };
  const mm0 = mmDim(0);
  return {
    name,
    width: { value: 60, unit: 'mm' },
    height: { value: 40, unit: 'mm' },
    placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm0, y: mm0 } },
  };
}

/** The list `members` with `name` moved `by` places (negative: earlier),
 *  stopping at the ends; the same list when `name` is not in it. */
export function moveMember(members: readonly string[], name: string, by: number): string[] {
  const from = members.indexOf(name);
  if (from < 0) return [...members];
  const to = Math.max(0, Math.min(members.length - 1, from + by));
  const out = [...members];
  out.splice(from, 1);
  out.splice(to, 0, name);
  return out;
}

/** A new frame at a scope. */
export function addFrame(templates: Templates, id: string, scope: TemplateScope, frame: FrameConfig): PageTemplate[] {
  return replaceTemplate(templates, id, (t) => withScope(t, scope, (p) => withFrames(p, (frames) => [...frames.filter((f) => f.name !== frame.name), frame])));
}

/** Frame `name` taken off at a scope: its entry dropped, or a
 *  `{ name, remove: true }` patch when it comes from elsewhere. */
export function removeFrame(templates: Templates, id: string, scope: TemplateScope, name: string): PageTemplate[] {
  const inherited = frameInherited(templates, id, scope, name);
  let out = replaceTemplate(templates, id, (t) =>
    withScope(t, scope, (p) =>
      withFrames(p, (frames) => {
        const rest = frames.filter((f) => f.name !== name);
        return inherited ? [...rest, { name, remove: true }] : rest;
      }),
    ),
  );
  // Groups of the scope lose it as a member.
  out = replaceTemplate(out, id, (t) =>
    withScope(t, scope, (p) => (p.groups ? { ...p, groups: p.groups.map((g) => (g.frames?.includes(name) ? { ...g, frames: g.frames.filter((m) => m !== name) } : g)) } : p)),
  );
  return out;
}

/** Every name a template's frames and groups use, in every scope and in
 *  its ancestors. */
export function namesInUse(templates: Templates, id: string): Set<string> {
  const names = new Set<string>();
  for (const tid of [id, ...ancestorsOf(templates, id), ...descendantsOf(templates, id)]) {
    const t = templateAt(templates, tid)?.template;
    if (!t) continue;
    for (const p of [t, t.variants?.recto, t.variants?.verso]) {
      for (const f of p?.frames ?? []) names.add(f.name);
      for (const g of p?.groups ?? []) names.add(g.name);
    }
  }
  return names;
}

/** The templates that share frame `name` as seen from template `id`: the
 *  nearest-to-the-root template of its `extends` chain that defines the
 *  frame (in its base or a variant), and everything that extends that one,
 *  siblings of `id` included. A rename applied to this set (and to the page
 *  fences that name those templates) leaves no template reading the old
 *  name. */
export function frameFamily(templates: Templates, id: string, name: string): string[] {
  const defines = (tid: string): boolean => {
    const t = templateAt(templates, tid)?.template;
    return !!t && [t, t.variants?.recto, t.variants?.verso].some((p) => p?.frames?.some((f) => f.name === name));
  };
  const chain = [id, ...ancestorsOf(templates, id)];
  const definer = [...chain].reverse().find(defines) ?? id;
  return [definer, ...descendantsOf(templates, definer)];
}

/** `#from` read as `#to` in an anchor. */
const renameAnchor = <T extends { placement?: FrameConfig['placement'] }>(item: T, from: string, to: string): T =>
  item.placement?.anchor.to === `#${from}` ? { ...item, placement: { ...item.placement, anchor: { ...item.placement.anchor, to: `#${to}` } } } : item;

/**
 * Frame (or group) `from` renamed `to` in template `id`, its variants and
 * the templates that share it (`frameFamily`), with every reference in them: `next`,
 * `overflow.continueIn: '#…'`, anchors, group members and decoration
 * anchors. The Markdown's `slot="…"` names are left alone (the caller
 * says so).
 */
export function renameFrame(templates: Templates, id: string, from: string, to: string): PageTemplate[] {
  if (from === to || namesInUse(templates, id).has(to)) return [...templates];
  const scopeIds = new Set(frameFamily(templates, id, from));
  const fixPatch = (p: PageTemplatePatch): PageTemplatePatch => {
    const out: PageTemplatePatch = { ...p };
    if (p.frames) {
      out.frames = p.frames.map((f) => {
        let g = renameAnchor(f, from, to);
        if (g.name === from) g = { ...g, name: to };
        if (g.next === from) g = { ...g, next: to };
        if (g.overflow?.continueIn === `#${from}`) g = { ...g, overflow: { ...g.overflow, continueIn: `#${to}` } };
        return g;
      });
    }
    if (p.groups) {
      out.groups = p.groups.map((gr) => {
        let g = renameAnchor(gr, from, to);
        if (g.name === from) g = { ...g, name: to };
        if (g.frames?.includes(from)) g = { ...g, frames: g.frames.map((m) => (m === from ? to : m)) };
        return g;
      });
    }
    if (p.decoration?.elements) {
      // A connector's ends (#1056) follow the rename too.
      const end = <T extends { to?: unknown }>(c: T): T => (c && c.to === `#${from}` ? { ...c, to: `#${to}` } : c);
      out.decoration = {
        elements: p.decoration.elements.map((el) => {
          if (isRemoval(el)) return el;
          if (el.kind === 'connector') return { ...el, from: end(el.from), to: Array.isArray(el.to) ? el.to.map(end) : end(el.to) };
          return el.placement?.anchor.to === `#${from}` ? { ...el, placement: { ...el.placement, anchor: { ...el.placement.anchor, to: `#${to}` } } } : el;
        }),
      };
    }
    return out;
  };
  return templates.map((t) => {
    if (!scopeIds.has(t.id)) return t;
    const out = fixPatch(t) as PageTemplate;
    if (t.variants) {
      out.variants = {
        ...(t.variants.recto ? { recto: fixPatch(t.variants.recto) } : {}),
        ...(t.variants.verso ? { verso: fixPatch(t.variants.verso) } : {}),
      };
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

function withGroups(p: PageTemplatePatch, edit: (groups: FrameGroupConfig[]) => FrameGroupConfig[]): PageTemplatePatch {
  const groups = edit([...(p.groups ?? [])]);
  const out = { ...p };
  if (groups.length === 0) delete out.groups;
  else out.groups = groups;
  return out;
}

export function addGroup(templates: Templates, id: string, scope: TemplateScope, group: FrameGroupConfig): PageTemplate[] {
  return replaceTemplate(templates, id, (t) => withScope(t, scope, (p) => withGroups(p, (groups) => [...groups.filter((g) => g.name !== group.name), group])));
}

export function updateGroup(templates: Templates, id: string, scope: TemplateScope, name: string, patch: Partial<Record<keyof FrameGroupConfig, unknown>>): PageTemplate[] {
  return replaceTemplate(templates, id, (t) =>
    withScope(t, scope, (p) =>
      withGroups(p, (groups) => {
        const i = groups.findIndex((g) => g.name === name);
        const next = applyFields(i >= 0 ? groups[i]! : { name }, patch as Record<string, unknown>);
        if (i >= 0) groups[i] = next;
        else groups.push(next);
        return groups;
      }),
    ),
  );
}

export function removeGroup(templates: Templates, id: string, scope: TemplateScope, name: string): PageTemplate[] {
  return replaceTemplate(templates, id, (t) => withScope(t, scope, (p) => withGroups(p, (groups) => groups.filter((g) => g.name !== name))));
}
