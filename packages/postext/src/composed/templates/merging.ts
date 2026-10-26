// The template table (which template an id means, its `extends` chain)
// and the merging of `extends` and `variants` (#1276: split out of
// templates.ts).
import type { DesignElement } from '../../types.js';
import type { PageTemplate, FrameConfig, FrameGroupConfig, PageTemplatePatch } from '../types.js';
import { isRecord } from './defaults.js';
import { mergeLook } from './normalize.js';

// ---------------------------------------------------------------------------
// The template table: which template each id means
// ---------------------------------------------------------------------------

/** id → index of the first template with it. */
export function idTable(templates: readonly PageTemplate[]): Map<string, number> {
  const byId = new Map<string, number>();
  templates.forEach((t, i) => {
    if (isRecord(t) && typeof t.id === 'string' && t.id !== '' && !byId.has(t.id)) byId.set(t.id, i);
  });
  return byId;
}

/** The chain of template indices from `index` up to its root, nearest
 *  first; `null` when it loops back on itself. A parent that does not
 *  exist ends the chain (the template stands alone). */
export function templateChain(templates: readonly PageTemplate[], index: number, byId = idTable(templates)): number[] | null {
  const chain: number[] = [];
  const seen = new Set<number>();
  let at: number | undefined = index;
  while (at !== undefined) {
    if (seen.has(at)) return null;
    seen.add(at);
    chain.push(at);
    const parent: unknown = templates[at]?.extends;
    at = typeof parent === 'string' ? byId.get(parent) : undefined;
  }
  return chain;
}

/** The index of the template `id` means: the first with that id. */
export function templateIndex(templates: readonly PageTemplate[] | undefined, id: string): number | undefined {
  return templates ? idTable(templates).get(id) : undefined;
}

// ---------------------------------------------------------------------------
// Merging (`extends`, `variants`)
// ---------------------------------------------------------------------------

/** An entry of a named list being merged, with where each field came from. */
export interface NamedEntry<T> {
  value: T;
  configPath: string;
  fieldPaths: Record<string, string>;
}

export interface Merged {
  fields: Record<string, unknown>;
  fieldPaths: Record<string, string>;
  frames: NamedEntry<FrameConfig>[];
  groups: NamedEntry<FrameGroupConfig>[];
  elements: { value: DesignElement; configPath: string }[];
}

/** The template-level keys a child or a variant inherits and overrides. */
const SCALAR_KEYS = ['area', 'overflowTemplate', 'bodyStyle', 'palette', 'header', 'footer'] as const;
export const INHERITED_KEYS = ['spread', 'gutter', 'role', 'width', 'grow', 'shrink'] as const;
/** Frame fields merged key by key rather than replaced. */
const MERGED_OBJECT_KEYS = new Set(['fit', 'overflow', 'padding', 'rules']);

/** A problem resolution met, with the JSON pointer of the field at fault.
 *  `validatePageTemplates` reports them as config warnings. */
export interface TemplateIssue {
  kind:
    | 'frameDuplicate'
    | 'frameStyleUnknown'
    | 'frameAnchorUnknown'
    | 'groupFrameUnknown'
    | 'groupFrameTwice'
    | 'frameChainLoop'
    | 'overflowTargetUnknown';
  path: string;
  value: string;
  used: string;
  /** For a name that does not exist: the closest that does (filled by the
   *  validator). */
  known?: readonly string[];
}

function mergeNamed<T extends { name?: unknown; remove?: unknown }>(
  list: NamedEntry<T>[],
  entries: unknown,
  basePath: string,
  issues: TemplateIssue[],
): void {
  if (!Array.isArray(entries)) return;
  const seen = new Set<string>();
  entries.forEach((raw, j) => {
    if (!isRecord(raw) || typeof raw.name !== 'string' || raw.name === '') return;
    const name = raw.name;
    const path = `${basePath}/${j}`;
    if (seen.has(name)) {
      issues.push({ kind: 'frameDuplicate', path, value: name, used: '' });
      return;
    }
    seen.add(name);
    const at = list.findIndex((e) => e.value.name === name);
    if (raw.remove === true) {
      if (at >= 0) list.splice(at, 1);
      return;
    }
    const entry: NamedEntry<T> = at >= 0
      ? { value: { ...list[at]!.value }, configPath: path, fieldPaths: { ...list[at]!.fieldPaths } }
      : { value: { name } as T, configPath: path, fieldPaths: {} };
    for (const [key, value] of Object.entries(raw)) {
      if (key === 'name' || key === 'remove' || value === undefined) continue;
      const target = entry.value as Record<string, unknown>;
      if (key === 'look' && isRecord(value)) {
        target.look = mergeLook(target.look, value);
        entry.fieldPaths.look = `${path}/look`;
        continue;
      }
      if (MERGED_OBJECT_KEYS.has(key) && isRecord(value)) {
        const before = target[key];
        const merged: Record<string, unknown> = isRecord(before) ? { ...before } : {};
        for (const [sub, v] of Object.entries(value)) {
          if (v === undefined) continue;
          merged[sub] = v;
          entry.fieldPaths[`${key}/${sub}`] = `${path}/${key}/${sub}`;
        }
        target[key] = merged;
      } else {
        target[key] = value;
      }
      entry.fieldPaths[key] = `${path}/${key}`;
    }
    if (at >= 0) list[at] = entry;
    else list.push(entry);
  });
}

export function mergePatch(target: Merged, patch: PageTemplatePatch, path: string, issues: TemplateIssue[]): void {
  if (!isRecord(patch)) return;
  for (const key of SCALAR_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    target.fields[key] = value;
    target.fieldPaths[key] = `${path}/${key}`;
  }
  if (isRecord(patch.grid)) {
    const before = target.fields.grid;
    const merged: Record<string, unknown> = isRecord(before) ? { ...before } : {};
    for (const [k, v] of Object.entries(patch.grid)) if (v !== undefined) merged[k] = v;
    target.fields.grid = merged;
    target.fieldPaths.grid = `${path}/grid`;
  }
  mergeNamed(target.frames, patch.frames, `${path}/frames`, issues);
  mergeNamed(target.groups, patch.groups, `${path}/groups`, issues);
  const elements = isRecord(patch.decoration) ? patch.decoration.elements : undefined;
  if (Array.isArray(elements)) {
    elements.forEach((el, j) => {
      if (!isRecord(el)) return;
      const element = el as unknown as DesignElement;
      const elementPath = `${path}/decoration/elements/${j}`;
      const id = typeof el.id === 'string' && el.id !== '' ? el.id : undefined;
      const at = id === undefined ? -1 : target.elements.findIndex((e) => e.value.id === id);
      // `remove: true` takes the inherited element out (#975); a removal
      // naming nothing inherited changes nothing.
      if (el.remove === true) {
        if (at >= 0) target.elements.splice(at, 1);
        return;
      }
      if (at >= 0) {
        const merged = { ...target.elements[at]!.value } as Record<string, unknown>;
        for (const [k, v] of Object.entries(el)) if (v !== undefined) merged[k] = v;
        target.elements[at] = { value: merged as unknown as DesignElement, configPath: elementPath };
      } else {
        target.elements.push({ value: element, configPath: elementPath });
      }
    });
  }
}
