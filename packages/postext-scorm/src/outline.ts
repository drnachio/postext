// The book's spine as a tree to pick from (#1266), and the organization a
// pick makes (#1265).
//
// The tree lists the chapters and, inside each, its headings down to the
// third level. Each heading stands for the text from its line to the next
// heading of its level or above; the first heading under a chapter (or
// under a heading) takes the text before it too (a chapter's title and
// opening lines go with its first section).

import { contentOutline, extractFrontmatter } from 'postext';
import type { PostextConfig } from 'postext';
import type { ScormItem, ScormRange } from './types.js';

export interface ScormTreeNode {
  /** `c<chapter>` for a chapter, `c<chapter>:<offset>` for a heading. */
  id: string;
  title: string;
  /** `0` for a chapter, else the heading's level. */
  level: number;
  /** The chapter's index in the book. */
  doc: number;
  /** The part of the chapter it stands for; absent for a chapter. */
  range?: ScormRange;
  children: ScormTreeNode[];
}

/** The deepest heading level the tree lists. */
export const SCORM_TREE_DEPTH = 3;

/**
 * The book's tree: one node per chapter (`title` its first heading when
 * the chapter opens with a level-1 heading, else `fallbackTitle`) with its
 * headings of levels 1 to {@link SCORM_TREE_DEPTH} nested under it. Ranges
 * are offsets in each chapter's Markdown as written (front matter
 * included), as the laid-out blocks give them.
 */
export function scormTree(chapters: readonly { markdown: string; title?: string }[], config?: PostextConfig): ScormTreeNode[] {
  return chapters.map((chapter, doc) => {
    const body = extractFrontmatter(chapter.markdown).content;
    const shift = chapter.markdown.endsWith(body) ? chapter.markdown.length - body.length : 0;
    const headings = contentOutline({ markdown: chapter.markdown }, config).outline
      .filter((e) => e.kind === 'heading' && e.level >= 1 && e.level <= SCORM_TREE_DEPTH && e.headingSource !== undefined)
      .map((e) => ({ level: e.level, title: e.title, at: e.headingSource! + shift }));
    // A level-1 heading at the chapter's head is its title.
    const lead = headings[0];
    const titled = lead !== undefined && lead.level === 1 && body.slice(0, lead.at - shift).trim() === '';
    const listed = titled ? headings.slice(1) : headings;
    const root: ScormTreeNode = {
      id: `c${doc}`,
      title: (titled ? lead.title : '') || chapter.title || `${doc + 1}`,
      level: 0,
      doc,
      children: [],
    };
    const stack: ScormTreeNode[] = [root];
    listed.forEach((h, i) => {
      const next = listed.slice(i + 1).find((o) => o.level <= h.level);
      while (stack.length > 1 && stack[stack.length - 1]!.level >= h.level) stack.pop();
      const parent = stack[stack.length - 1]!;
      // The first heading under a node takes the text before it.
      const start = parent.children.length === 0 ? parent.range?.start ?? 0 : h.at;
      const node: ScormTreeNode = {
        id: `c${doc}:${h.at}`,
        title: h.title,
        level: h.level,
        doc,
        range: { start, ...(next ? { end: next.at } : parent.range?.end !== undefined ? { end: parent.range.end } : {}) },
        children: [],
      };
      parent.children.push(node);
      stack.push(node);
    });
    return root;
  });
}

/** The leaves under a node (the node itself when it has none): what a
 *  selection is made of. */
export function treeLeaves(node: ScormTreeNode): ScormTreeNode[] {
  return node.children.length === 0 ? [node] : node.children.flatMap(treeLeaves);
}

/** `'all'`, `'some'` or `'none'` of a node's leaves picked. */
export function pickState(node: ScormTreeNode, picked: ReadonlySet<string>): 'all' | 'some' | 'none' {
  const leaves = treeLeaves(node);
  const n = leaves.filter((l) => picked.has(l.id)).length;
  return n === 0 ? 'none' : n === leaves.length ? 'all' : 'some';
}

/**
 * The organization a pick makes: a node picked whole is one SCO (a chapter
 * whole, or a heading's range); a node picked in part groups the items of
 * its children that are picked. `picked` holds leaf ids.
 */
export function scormOrganization(tree: readonly ScormTreeNode[], picked: ReadonlySet<string>): ScormItem[] {
  const item = (node: ScormTreeNode): ScormItem | null => {
    const state = pickState(node, picked);
    if (state === 'none') return null;
    if (state === 'all') return { title: node.title, doc: node.doc, ...(node.range ? { range: node.range } : {}) };
    return { title: node.title, children: node.children.map(item).filter((i): i is ScormItem => i !== null) };
  };
  return tree.map(item).filter((i): i is ScormItem => i !== null);
}

/** The SCOs of an organization, in order. */
export function scormLeaves(items: readonly ScormItem[]): ScormItem[] {
  return items.flatMap((i) => (i.children ? scormLeaves(i.children) : [i]));
}
