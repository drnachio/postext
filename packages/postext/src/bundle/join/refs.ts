// Where a book names a resource by its id, so that a renamed resource can
// take its references along: in the text (`::resource{id="…"}`, `:ref{…}`,
// `\ref{…}`, a comic panel's `art=…`), in the captions and notes of the
// other resources, and in the cells of tables that show it. What is a
// reference is the engine's parser's call, not a text search: a `:ref`
// quoted in a code block is left as written.

import { parseMarkdown } from '../../parse/index.js';
import type { PostextConfig, Resource } from '../../types.js';

/** One replacement in a text: `[from, to)` becomes `insert`; `expect` is
 *  the text `[from, to)` held when the change was computed. */
export interface ResourceRefChange {
  from: number;
  to: number;
  insert: string;
  expect: string;
}

/** The fields of a resource that can name another one: what
 *  {@link renameResourceInResources} reads, so that it works on a bundle's
 *  resource specs as well as on loaded resources. */
export type ResourceRefFields = Pick<Resource, 'id' | 'caption' | 'note' | 'table'>;

/** The id of an `id=…` or `#…` token of an attribute blob, in the forms
 *  the engine's attribute grammar reads: `"…"`, `'…'`, `“…”`, `「…」` or
 *  bare, after `=` or the fullwidth `＝`. */
const ID_TOKEN_RE = /(?:^|\s)(?:id\s*[=＝]\s*(?:"([^"]*)"|'([^']*)'|“([^”]*)”|「([^」]*)」|([^\s]+))|#([\p{L}\p{N}_][\p{L}\p{N}_.:-]*))/gu;

/** Where the id a `:ref{…}` names sits in `blob` (its attributes): the
 *  last id token, which is the one the engine keeps. */
function idRangeInAttrs(blob: string): { from: number; to: number; value: string } | null {
  let found: { from: number; to: number; value: string } | null = null;
  ID_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ID_TOKEN_RE.exec(blob)) !== null) {
    const value = m.slice(1).find((g) => g !== undefined)!;
    // The value ends the match, before its closing quote when it has one.
    const quoted = m[1] !== undefined || m[2] !== undefined || m[3] !== undefined || m[4] !== undefined;
    const to = m.index + m[0].length - (quoted ? 1 : 0);
    found = { from: to - value.length, to, value };
  }
  return found;
}

/** The `[from, to)` ranges of `markdown` that hold the id `id` as a
 *  reference to a resource, in reading order. */
export function resourceIdRanges(markdown: string, id: string): { from: number; to: number }[] {
  if (!id || !markdown.includes(id)) return [];
  const ranges: { from: number; to: number }[] = [];
  const add = (from: number, to: number): void => {
    if (markdown.slice(from, to) === id && !ranges.some((r) => r.from === from)) ranges.push({ from, to });
  };
  for (const block of parseMarkdown(markdown)) {
    if (block.type === 'resourceBlock' && block.resourceId === id) {
      const at = markdown.indexOf(`"${id}"`, block.sourceStart);
      if (at >= 0 && at < block.sourceEnd) add(at + 1, at + 1 + id.length);
    }
    for (const panel of block.comic?.panels ?? []) {
      const art = panel.attrSources.art;
      if (art && panel.attrs.art?.trim() === id) {
        const lead = markdown.slice(art.start, art.end).indexOf(id);
        if (lead >= 0) add(art.start + lead, art.start + lead + id.length);
      }
    }
    // A reference is one placeholder character of the block's text, mapped
    // to where its mark starts in the source.
    let plain = 0;
    for (const span of block.spans) {
      const start = span.ref?.resourceId === id ? block.sourceMap[plain] : undefined;
      plain += span.text.length;
      if (start === undefined) continue;
      const rest = markdown.slice(start, block.sourceEnd);
      const directive = /^:ref\{([^}]*)\}/.exec(rest);
      if (directive) {
        const token = idRangeInAttrs(directive[1]!);
        if (token && token.value === id) add(start + 5 + token.from, start + 5 + token.to);
        continue;
      }
      const latex = /^~?\\(?:eq)?ref\{/.exec(rest);
      if (latex) add(start + latex[0].length, start + latex[0].length + id.length);
    }
  }
  return ranges.sort((a, b) => a.from - b.from);
}

/** The changes that turn every reference to the resource `from` in
 *  `markdown` into one to `to`. */
export function renameResourceInText(markdown: string, from: string, to: string): ResourceRefChange[] {
  return resourceIdRanges(markdown, from).map((r) => ({ from: r.from, to: r.to, insert: to, expect: from }));
}

/** `markdown` with every reference to the resource `from` renamed `to`. */
export function withResourceRenamed(markdown: string, from: string, to: string): string {
  let out = markdown;
  for (const r of resourceIdRanges(markdown, from).reverse()) out = out.slice(0, r.from) + to + out.slice(r.to);
  return out;
}

/** The ids of `ids` that `markdown` refers to as resources. */
export function resourcesNamedIn(markdown: string, ids: Iterable<string>): string[] {
  const out: string[] = [];
  for (const id of ids) if (resourceIdRanges(markdown, id).length > 0) out.push(id);
  return out;
}

/** `text` (a caption, a note, a cell) with its references to `from`
 *  renamed, and how many there were. */
function renameInSnippet(text: string | undefined, from: string, to: string): { text: string | undefined; count: number } {
  if (!text || !text.includes(from)) return { text, count: 0 };
  const ranges = resourceIdRanges(text, from);
  let out = text;
  for (const r of [...ranges].reverse()) out = out.slice(0, r.from) + to + out.slice(r.to);
  return { text: out, count: ranges.length };
}

/** The resources that name the resource `from` — in a caption or a note's
 *  `:ref`, in a table cell's text or as a cell's picture — rewritten to
 *  name `to`, with how many references each held. Resources that do not
 *  name it are left out. */
export function renameResourceInResources<R extends ResourceRefFields>(resources: readonly R[], from: string, to: string): { resource: R; count: number }[] {
  const out: { resource: R; count: number }[] = [];
  for (const r of resources) {
    if (r.id === from) continue;
    let count = 0;
    const next: R = { ...r };
    for (const key of ['caption', 'note'] as const) {
      const renamed = renameInSnippet(r[key], from, to);
      if (renamed.count > 0) next[key] = renamed.text;
      count += renamed.count;
    }
    if (r.table) {
      let touched = false;
      const rows = r.table.model.rows.map((row) => row.map((cell) => {
        const text = renameInSnippet(cell.content, from, to);
        const picture = cell.image?.resourceId === from;
        if (text.count === 0 && !picture) return cell;
        touched = true;
        count += text.count + (picture ? 1 : 0);
        return { ...cell, content: text.text ?? '', ...(picture ? { image: { ...cell.image!, resourceId: to } } : {}) };
      }));
      if (touched) next.table = { ...r.table, model: { ...r.table.model, rows } };
    }
    if (count > 0) out.push({ resource: next, count });
  }
  return out;
}

/** The paths of the configuration that name the resource `id` (a design's
 *  image element, a callout's icon): `resourceId` members holding it. */
export function configPathsNaming(config: PostextConfig, id: string): string[] {
  const paths: string[] = [];
  const visit = (node: unknown, path: string): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item, i) => visit(item, `${path}[${i}]`));
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      const at = path ? `${path}.${key}` : key;
      if (key === 'resourceId' && value === id) paths.push(at);
      else visit(value, at);
    }
  };
  visit(config, '');
  return paths;
}
