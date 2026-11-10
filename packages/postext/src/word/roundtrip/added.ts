// Paragraphs the user typed outside every bookmark (between two blocks, or
// at the start or end of a chapter) become new Markdown paragraphs at the
// source boundary of the neighbouring block. The paragraph's style says
// what it is: a `heading N` style (or an outline level) a heading of that
// level, a numbered paragraph or a list style a list item, anything else a
// plain paragraph.

import type { XmlElement } from '../xml.js';
import { attr, child, children } from '../xml.js';
import type { BlockView } from './blocks.js';
import type { SourceEdit } from './edits.js';
import { escapeTyped, makeKey, splitKey, wrapFlags } from './markup.js';
import { mathSource } from './math.js';
import type { AddedParagraph, ReadChar } from './read.js';
import { OBJECT_CHAR, type ParaProps } from './walk.js';

interface StyleInfo {
  name: string;
  basedOn?: string;
  numId?: string;
  outline?: number;
}

export interface ParaStyles {
  styles: Map<string, StyleInfo>;
  /** Level formats per numbering instance: `numFmt` by `ilvl`. */
  formats: Map<string, string[]>;
}

export function readParaStyles(files: Record<string, Uint8Array>, xmlOf: (path: string) => XmlElement | undefined): ParaStyles {
  const styles = new Map<string, StyleInfo>();
  const formats = new Map<string, string[]>();
  if (files['word/styles.xml']) {
    for (const s of children(xmlOf('word/styles.xml'), 'style')) {
      if (attr(s, 'type') !== 'paragraph') continue;
      const pPr = child(s, 'pPr');
      const info: StyleInfo = { name: attr(child(s, 'name'), 'val') ?? '' };
      const basedOn = attr(child(s, 'basedOn'), 'val');
      if (basedOn) info.basedOn = basedOn;
      const numId = attr(child(child(pPr, 'numPr'), 'numId'), 'val');
      if (numId && numId !== '0') info.numId = numId;
      const outline = attr(child(pPr, 'outlineLvl'), 'val');
      if (outline !== undefined) info.outline = Number(outline);
      styles.set(attr(s, 'styleId') ?? '', info);
    }
  }
  if (files['word/numbering.xml']) {
    const root = xmlOf('word/numbering.xml');
    const abstract = new Map<string, string[]>();
    for (const a of children(root, 'abstractNum')) {
      const lv: string[] = [];
      for (const l of children(a, 'lvl')) lv[Number(attr(l, 'ilvl') ?? 0)] = attr(child(l, 'numFmt'), 'val') ?? 'decimal';
      abstract.set(attr(a, 'abstractNumId') ?? '', lv);
    }
    for (const n of children(root, 'num')) {
      const lv = abstract.get(attr(child(n, 'abstractNumId'), 'val') ?? '');
      if (lv) formats.set(attr(n, 'numId') ?? '', lv);
    }
  }
  return { styles, formats };
}

export interface ParaRole {
  heading?: number;
  list?: { ordered: boolean; level: number };
}

/** What an added paragraph is, from its own properties and its style. */
export function roleOf(props: ParaProps | undefined, ps: ParaStyles): ParaRole {
  let numId = props?.numId;
  let outline = props?.outline;
  let listStyle = false;
  for (let id = props?.style, k = 0; id && k < 12; k++) {
    const s = ps.styles.get(id);
    if (!s) break;
    const h = /^heading ([1-6])$/i.exec(s.name);
    if (h) {
      outline ??= Number(h[1]) - 1;
      break;
    }
    outline ??= s.outline;
    numId ??= s.numId;
    if (/^list (bullet|number)/i.test(s.name)) listStyle = true;
    id = s.basedOn;
  }
  if (outline !== undefined && outline >= 0 && outline < 6) return { heading: outline + 1 };
  if (numId) {
    const fmt = ps.formats.get(numId)?.[props?.ilvl ?? 0] ?? 'bullet';
    return { list: { ordered: fmt !== 'bullet' && fmt !== 'none', level: props?.ilvl ?? 0 } };
  }
  if (listStyle) return { list: { ordered: /number/i.test(ps.styles.get(props?.style ?? '')?.name ?? ''), level: 0 } };
  return {};
}

/** The paragraph's text as Markdown: typed text escaped, formatting and
 *  links as inline markup, equations as `$…$`. */
export function markdownOf(chars: readonly ReadChar[]): string {
  let out = '';
  let run = '';
  let key: string | undefined;
  const flush = (): void => {
    if (!run) return;
    const { flags, href } = splitKey(key ?? '');
    out += wrapFlags(escapeTyped(run), flags, href);
    run = '';
  };
  for (const c of chars) {
    if (c.ch === OBJECT_CHAR) {
      flush();
      if (c.tex !== undefined) out += mathSource(c.tex);
      continue;
    }
    if (c.ch === '\n') {
      flush();
      out += '\\\n';
      continue;
    }
    const k = makeKey(c.flags, c.href);
    if (k !== key) {
      flush();
      key = k;
    }
    run += c.ch;
  }
  flush();
  return out.trim();
}

const LIST_HEAD_RE = /^([ \t]*)(?:([-*+])|(\d+)([.)]))[ \t]+/;

/** The marker and the break that set the paragraph next to `head` (the
 *  neighbouring block's first characters). */
function shapeOf(role: ParaRole, head: string, side: 'after' | 'before'): { lead: string; sep: string } {
  if (role.heading) return { lead: `${'#'.repeat(role.heading)} `, sep: '\n\n' };
  if (!role.list) return { lead: '', sep: '\n\n' };
  const m = LIST_HEAD_RE.exec(head);
  // Next to a list item: an item of the same list.
  if (m) return { lead: `${m[1]}${m[2] ?? `${Number(m[3]) + (side === 'after' ? 1 : 0)}${m[4]}`} `, sep: '\n' };
  return { lead: `${'  '.repeat(role.list.level)}${role.list.ordered ? '1.' : '-'} `, sep: '\n\n' };
}

/** The markdown block nearest to block `k` that new text can go beside. */
function anchorBlock(blocks: readonly BlockView[], k: number, side: 'after' | 'before'): { v: BlockView; side: 'after' | 'before' } | undefined {
  if (blocks[k]!.target.kind === 'markdown') return { v: blocks[k]!, side };
  // Beside a caption or a generated label: before the next text block,
  // else after the one before.
  for (let j = k + 1; j < blocks.length; j++) if (blocks[j]!.target.kind === 'markdown') return { v: blocks[j]!, side: 'before' };
  for (let j = k - 1; j >= 0; j--) if (blocks[j]!.target.kind === 'markdown') return { v: blocks[j]!, side: 'after' };
  return undefined;
}

/** Insertion edits for the added paragraphs, one per neighbouring block
 *  and side (consecutive paragraphs go in together, in their order). */
export function addedEdits(added: readonly AddedParagraph[], blocks: readonly BlockView[], baseOf: (v: BlockView) => string, ps: ParaStyles): SourceEdit[] {
  const blockOf = new Map<string, number>();
  blocks.forEach((b, k) => {
    for (const fid of b.starts.keys()) blockOf.set(fid, k);
  });
  const groups = new Map<string, { v: BlockView; side: 'after' | 'before'; texts: { role: ParaRole; text: string }[] }>();
  for (const a of added) {
    const k = blockOf.get(a.fid);
    if (k === undefined) continue;
    const at = anchorBlock(blocks, k, a.side);
    const text = markdownOf(a.chars);
    if (!at || !text) continue;
    const key = `${at.v.id}|${at.side}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { v: at.v, side: at.side, texts: [] }));
    g.texts.push({ role: roleOf(a.props, ps), text });
  }
  const out: SourceEdit[] = [];
  for (const { v, side, texts } of groups.values()) {
    const base = baseOf(v);
    if (side === 'after') {
      let pos = Math.min(v.range[1], base.length);
      if (pos > 0 && base[pos - 1] === '\n') pos--;
      else {
        const nl = base.indexOf('\n', pos);
        pos = nl < 0 ? base.length : nl;
      }
      // Each paragraph is shaped by the line before it.
      let head = base.slice(base.lastIndexOf('\n', Math.max(0, v.range[0] - 1)) + 1, v.range[0] + 40);
      let text = '';
      for (const t of texts) {
        const { lead, sep } = shapeOf(t.role, head, 'after');
        text += sep + lead + t.text;
        head = lead + t.text;
      }
      out.push({ target: v.target, start: pos, end: pos, text, kind: 'paragraph' });
    } else {
      const pos = base.lastIndexOf('\n', Math.max(0, v.range[0] - 1)) + 1;
      const head = base.slice(pos, pos + 40);
      let text = '';
      for (const t of texts) {
        const { lead, sep } = shapeOf(t.role, head, 'before');
        text += lead + t.text + sep;
      }
      out.push({ target: v.target, start: pos, end: pos, text, kind: 'paragraph' });
    }
  }
  return out;
}
