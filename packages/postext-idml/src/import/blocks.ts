// The paragraphs of a story as blocks of Postext Markdown: headings,
// paragraphs, lists, quotations, groups in a named paragraph style, and
// the tables, pictures and boxes anchored in them.

import type { IdmlParagraph } from '../model/document.js';
import type { Context } from './context.js';
import { guardBlockStart, WORD_JOINER } from './escape.js';
import { inlineOf, type InlineEnv, type InlineHooks } from './inline.js';
import { ownText, type Look } from './looks.js';
import { withInlineBreaks, withLineBreaks } from './marks.js';
import { nestedLeadIn } from './nested.js';
import { captionLabel } from './pictures.js';

export interface Chunk {
  kind: 'block' | 'list' | 'heading' | 'break';
  text: string;
  /** Heading level, and its plain title. */
  level?: number;
  title?: string;
}

export interface BlockEnv {
  /** Footnote definitions of the chapter. */
  notes: string[];
  carry: string[];
  hooks: InlineHooks;
  pageName?: string;
  /** `flow`: breaks between paragraphs become directives. `frame`: the
   *  frames of a composed page decide where text breaks. */
  target: 'flow' | 'frame' | 'box';
  /** Numbers of the lists that run through the story. */
  counters?: Map<string, number[]>;
  /** Blocks set after a paragraph of the story, by its index: what
   *  stands beside it on the page. `-1`: before the first. */
  insert?: Map<number, string[]>;
  /** Attributes every level-1 heading carries (the words of the running
   *  heads). */
  headingAttrs?: string[];
}

export function joinChunks(chunks: readonly Chunk[]): string {
  let out = '';
  chunks.forEach((c, n) => {
    if (n > 0) out += chunks[n - 1]!.kind === 'list' && c.kind === 'list' ? '\n' : '\n\n';
    out += c.text;
  });
  return out;
}

const isEmpty = (para: IdmlParagraph): boolean => {
  for (const r of para.runs) for (const i of r.content) if (i.kind !== 'text' ? i.kind !== 'special' || i.char === 'pageNumber' : i.text.trim() !== '') return false;
  return true;
};

/** `key="value"` attributes of a fence or a heading. */
const attrs = (pairs: (string | undefined)[]): string => {
  const list = pairs.filter((p): p is string => !!p);
  return list.length ? `{${list.join(' ')}}` : '';
};

const hattrs = (pairs: (string | undefined)[]): string => {
  const a = attrs(pairs);
  return a ? ` ${a}` : '';
};

/** A heading's text may not end in `{…}`: the dialect reads it as
 *  attributes. */
const closeHeading = (text: string): string => (/\}\s*$/.test(text) ? text + WORD_JOINER : text);

const BREAKS: Record<string, string> = {
  NextColumn: ':::columnbreak',
  NextFrame: ':::columnbreak',
  NextPage: ':::pagebreak',
  NextOddPage: ':::pagebreak{parity="odd"}',
  NextEvenPage: ':::pagebreak{parity="even"}',
};

/** The paragraphs of a story, a note, a cell or an anchored frame as
 *  blocks. */
export function blocksOf(ctx: Context, paragraphs: readonly IdmlParagraph[], env: BlockEnv): Chunk[] {
  const out: Chunk[] = [];
  const counters = env.counters ?? new Map<string, number[]>();
  // A run of paragraphs in one named style stands in one fence.
  let group: { look: Look; items: string[] } | undefined;
  const close = (): void => {
    if (!group) return;
    const g = group;
    group = undefined;
    if (!g.items.length) return;
    out.push({ kind: 'block', text: `:::paragraphs${attrs([g.look.id ? `style="${g.look.id}"` : undefined])}\n${g.items.join('\n\n')}\n:::` });
  };
  // Note definitions stand under the block that cites them, once a list
  // or a group has ended.
  const flushNotes = (): void => {
    for (const n of env.notes.splice(0)) out.push({ kind: 'block', text: n });
  };
  const push = (c: Chunk): void => {
    close();
    out.push(c);
    flushNotes();
  };
  for (const b of env.insert?.get(-1) ?? []) push({ kind: 'block', text: b });
  // Empty paragraphs are space the designer typed.
  let empties = 0;
  let started = false;
  const space = (): void => {
    if (empties && started) {
      push({ kind: 'block', text: `:::space{lines=${Math.min(20, empties)}}` });
      ctx.rep.add('emptyParagraphs', 'info', 'Empty paragraphs between text are set as vertical space (:::space)', undefined, empties);
    }
    empties = 0;
  };
  // Indents of the bullet lists met, to tell their levels apart.
  const bulletIndents: number[] = [];

  paragraphs.forEach((para, index) => {
    const placed = (): void => {
      for (const b of env.insert?.get(index) ?? []) push({ kind: 'block', text: b });
    };
    const look = ctx.looks.of(para);
    if (isEmpty(para) && !para.runs.some((r) => r.content.some((i) => i.kind === 'table' || i.kind === 'item' || i.kind === 'footnote' || i.kind === 'endnote'))) {
      empties++;
      if (para.breakAfter && env.target === 'flow' && BREAKS[para.breakAfter]) push({ kind: 'break', text: BREAKS[para.breakAfter]! });
      placed();
      return;
    }
    ctx.counts.paragraphs++;
    ctx.counts.characters += ownText(para).length;
    const start = look.pf.startParagraph;
    if (start && env.target === 'flow' && look.role !== 'heading' && BREAKS[start]) push({ kind: 'break', text: BREAKS[start]! });
    const inline: InlineEnv = { where: look.role === 'heading' ? 'heading' : 'body', look, notes: env.notes, after: [], before: [], carry: env.carry, hooks: env.hooks, ...(env.pageName !== undefined ? { pageName: env.pageName } : {}) };
    const leadIn = nestedLeadIn(ctx, para, look);
    if (leadIn) inline.leadIn = leadIn;
    // Marks carried from a heading or a table stand at the start of the
    // first paragraph that can hold them.
    const carried = look.role === 'heading' ? '' : env.carry.splice(0).join('');
    const r = inlineOf(ctx, para, inline);
    const text = r.text.trim();
    if (inline.before?.length) {
      space();
      started = true;
      for (const b of inline.before) push({ kind: 'block', text: b });
    }
    // A paragraph in a caption style right under a picture or a table of
    // the text is that resource's caption.
    const last = out[out.length - 1];
    const under = look.role === 'caption' && !group && last ? /^::resource\{id="([^"]+)"\}$/.exec(last.text) : null;
    const resource = under ? ctx.resources.find((x) => x.id === under[1]) : undefined;
    if (resource && !resource.caption && text && !carried) {
      const plainText = ownText(para).trim();
      const label = captionLabel(plainText);
      const lead = label ? plainText.slice(0, plainText.length - label.rest.length) : '';
      // The label goes only when the Markdown opens with the same words.
      if (label && text.startsWith(lead)) {
        resource.caption = withInlineBreaks(text.slice(lead.length).trim());
        resource.typeId = resource.kind === 'table' ? 'table' : 'figure';
        if (!ctx.labelWords.has(label.kind)) ctx.labelWords.set(label.kind, label.word.replace(/\.$/, ''));
        ctx.rep.add('captionLabels', 'info', 'A caption\'s typed label ("Figure 3.") is replaced by Postext\'s own numbering of the resource', plainText.slice(0, 40));
      } else resource.caption = withInlineBreaks(text);
      if (!resource.caption) delete resource.caption;
      started = true;
      placed();
      return;
    }
    if (text || carried) {
      space();
      started = true;
      switch (look.role) {
        case 'heading': {
          const level = look.level ?? 1;
          const line = closeHeading(withInlineBreaks(text).replace(/\s+/g, ' '));
          push({ kind: 'heading', level, title: ownText(para).replace(/\s+/g, ' ').trim(), text: `${'#'.repeat(level)} ${line}${hattrs([look.id ? `style="${look.id}"` : undefined, inline.headingId ? `id="${inline.headingId}"` : undefined, ...(level === 1 ? (env.headingAttrs ?? []) : [])])}` });
          break;
        }
        case 'list': {
          const list = look.pf.list!;
          let depth = list.level;
          let marker = '-';
          if (list.type === 'numbered') {
            const key = list.numberingList ?? 'default';
            let c = counters.get(key);
            if (!c) counters.set(key, (c = []));
            if (!list.continues || c[depth] === undefined) c[depth] = list.startAt - 1;
            c[depth]!++;
            c.length = depth + 1;
            marker = `${c[depth]}.`;
          } else {
            const indent = Math.round(look.pf.leftIndent);
            if (!bulletIndents.includes(indent)) bulletIndents.push(indent);
            bulletIndents.sort((a, b) => a - b);
            depth = Math.max(depth, bulletIndents.indexOf(indent) + 1);
          }
          close();
          out.push({ kind: 'list', text: `${'    '.repeat(Math.max(0, Math.min(5, depth) - 1))}${marker} ${carried}${withInlineBreaks(text)}` });
          break;
        }
        case 'quote':
          push({ kind: 'block', text: `> ${carried}${withInlineBreaks(text)}` });
          break;
        case 'body':
          push({ kind: 'block', text: guardBlockStart(withLineBreaks(carried + text, guardBlockStart)) });
          break;
        default: {
          if (group && group.look !== look) close();
          group ??= { look, items: [] };
          group.items.push(guardBlockStart(withLineBreaks(carried + text, guardBlockStart)));
        }
      }
    }
    if (inline.after.length) {
      space();
      started = true;
      for (const b of inline.after) push({ kind: 'block', text: b });
    }
    if (para.breakAfter && env.target === 'flow' && BREAKS[para.breakAfter]) push({ kind: 'break', text: BREAKS[para.breakAfter]! });
    else if (para.breakAfter && env.target !== 'flow') ctx.rep.add('breakInFrame', 'info', 'A column, frame or page break typed in the text of a placed frame is left to the frames', para.breakAfter);
    placed();
  });
  close();
  flushNotes();
  return out;
}
