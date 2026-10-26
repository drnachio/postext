import { applyTextChanges, type TextChange } from '../../book/textChanges.js';
import { setLabelLeader, iconDirective, type IconSpec, type LabelLeaderChoice } from '../../editor/syntax/labelAttrs.js';
import { labelsInChapters, type MarkdownLabel } from '../../panels/resources/marks/figureLabels.js';
import { pointersOf, removePointer, setPointer } from '../../templates/pointerEdits.js';
import { chapterText, editChapter } from '../chapterEdits.js';
import type { SandboxToolHost } from '../host.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';
import { layoutAnswer } from './book.js';

// The leaders and legends of a figure's labels for agents (#1064): what the
// anchor editor, the text editor's symbol picker and the frame's pointers
// do, through the same modules (editor/labelAttrs.ts, templates/pointerEdits.ts).
// A label's own words and attributes are the chapter's Markdown; where a
// label stands away from its point (labelAt) and an anchor's leader are the
// resource's marks (sandbox_save_resource); a label style's leader look is
// the design (sandbox_set_config, labelStyles[id=…].leader).

const LEADERS: readonly LabelLeaderChoice[] = ['anchor', 'on', 'off'];

/** The labels of the book a call names: those of `resource`, at `anchor`
 *  or whose text is `text`. */
function pickLabels(host: SandboxToolHost, args: Record<string, unknown>): MarkdownLabel[] {
  const s = host.store.getSnapshot();
  const resource = typeof args.resource === 'string' ? args.resource : '';
  if (!resource) throw new ToolError('Name the picture: resource is the id of the :::figure{resource="…"} the labels belong to.');
  const all = labelsInChapters(s.chapters.map((c) => ({ id: c.id, markdown: chapterText(s, c.id) ?? c.markdown })), resource);
  if (all.length === 0) throw new ToolError(`No ::label of a :::figure{resource="${resource}"} in the book.`);
  const anchor = typeof args.anchor === 'string' ? args.anchor : undefined;
  const text = typeof args.text === 'string' ? args.text : undefined;
  if (anchor === undefined && text === undefined) throw new ToolError('Say which labels: anchor (the at="…" they stand at) or text (their words).');
  const picked = all.filter((l) => (anchor === undefined || l.anchor === anchor) && (text === undefined || l.text === text));
  if (picked.length === 0) {
    const names = [...new Set(all.map((l) => l.anchor).filter(Boolean))].join(', ');
    throw new ToolError(`No label of ${resource} ${anchor !== undefined ? `at ${JSON.stringify(anchor)}` : ''}${text !== undefined ? ` reading ${JSON.stringify(text)}` : ''}. Its labels stand at: ${names || '(percentages only)'}.`);
  }
  return picked;
}

/** Apply one change per label, chapter by chapter (each chapter one step of
 *  the history); the number of labels changed. */
async function writeLabelChanges(host: SandboxToolHost, labels: readonly MarkdownLabel[], change: (text: string, label: MarkdownLabel) => TextChange | null): Promise<number> {
  const byChapter = new Map<string, MarkdownLabel[]>();
  for (const l of labels) byChapter.set(l.chapterId, [...(byChapter.get(l.chapterId) ?? []), l]);
  let changed = 0;
  for (const [chapterId, list] of byChapter) {
    const before = chapterText(host.store.getSnapshot(), chapterId);
    if (before === null) continue;
    const changes = list.map((l) => change(before, l)).filter((c): c is TextChange => c !== null);
    if (changes.length === 0) continue;
    if (await editChapter(host, chapterId, before, applyTextChanges(before, changes))) changed += changes.length;
  }
  return changed;
}

function iconSpecOf(raw: unknown): IconSpec {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (typeof o.resource === 'string' && o.resource) return { kind: 'resource', resource: o.resource };
  if (typeof o.glyph === 'string' && o.glyph) return { kind: 'glyph', glyph: o.glyph, ...(typeof o.font === 'string' && o.font ? { font: o.font } : {}) };
  if (o.line === 'solid' || o.line === 'dashed' || o.line === 'dotted') return { kind: 'line', line: o.line };
  throw new ToolError('icon needs one of resource (a picture id), glyph (with an optional font) or line (solid, dashed or dotted).');
}

export function labelTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;
  const edit: WebMcpTool = {
    name: 'sandbox_edit_labels',
    title: 'Sandbox: leaders, symbols and pointers of a figure\'s labels',
    description: 'What the anchor editor, the text editor\'s symbol picker and a frame\'s pointers do. action "leader": write the own leader attribute of the ::label / :::label lines of a picture (resource) at an anchor or with a text: on (leader), off (leader="none") or anchor (none written: the anchor and the label style decide). action "icon": write an inline symbol :icon[alt]{…} at the start or end of those labels\' text (a picture resource, a glyph with an optional font, or a line sample solid/dashed/dotted; color a hex or palette id, size in ems), as a map\'s key row. action "pointer": a line from frame `from` of page template `template` to anchor `anchor` of the picture frame `toFrame` holds (a connector of the template\'s decoration ending at that anchor, painted over the frames); with id, that pointer is changed; with remove: true and id, taken off. Where a label stands away from its point (labelAt) and an anchor\'s leader are the picture\'s marks (sandbox_save_resource); a style\'s leader look is labelStyles[id=…].leader (sandbox_set_config). Every change is one step of the undo history.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['leader', 'icon', 'pointer'] },
        resource: { type: 'string', description: 'leader, icon: the picture the labels belong to.' },
        anchor: { type: 'string', description: 'leader, icon: the anchor the labels stand at. pointer: the anchor of the picture in toFrame.' },
        text: { type: 'string', description: 'leader, icon: the labels whose text is this.' },
        leader: { type: 'string', enum: LEADERS as string[], description: 'leader: on, off or anchor.' },
        icon: {
          type: 'object',
          description: 'icon: the symbol.',
          properties: { resource: { type: 'string' }, glyph: { type: 'string' }, font: { type: 'string' }, line: { type: 'string', enum: ['solid', 'dashed', 'dotted'] } },
          additionalProperties: false,
        },
        alt: { type: 'string', description: 'icon: what a reader hears for the symbol (default empty: read as nothing).' },
        color: { type: 'string', description: 'icon: its colour, a hex or a palette id.' },
        size: { type: 'number', description: 'icon: its height in ems (default 0.75, the cap height; beside a shaped number, the shape\'s height).' },
        position: { type: 'string', enum: ['start', 'end'], description: 'icon: before the label\'s words (default, a key\'s row) or after them.' },
        template: { type: 'string', description: 'pointer: the page template id.' },
        from: { type: 'string', description: 'pointer: the frame the line leaves (a note).' },
        toFrame: { type: 'string', description: 'pointer: the frame holding the picture.' },
        id: { type: 'string', description: 'pointer: the pointer (connector id) to change or remove.' },
        remove: { type: 'boolean', description: 'pointer: take the pointer id off.' },
        wait: { type: 'boolean', description: 'Wait for the book to be laid out again (default true).' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      if (args.action === 'leader') {
        const choice = args.leader as LabelLeaderChoice;
        if (!LEADERS.includes(choice)) throw new ToolError('leader is on, off or anchor.');
        const labels = pickLabels(host, args);
        const changed = await writeLabelChanges(host, labels, (text, l) => setLabelLeader(text, l, choice));
        return { labels: labels.length, changed, ...(await layoutAnswer(host, args.wait, signal)) };
      }
      if (args.action === 'icon') {
        const spec = iconSpecOf(args.icon);
        const directive = iconDirective(spec, typeof args.alt === 'string' ? args.alt : '', {
          ...(typeof args.color === 'string' ? { color: args.color } : {}),
          ...(typeof args.size === 'number' ? { size: args.size } : {}),
        });
        const labels = pickLabels(host, args);
        const atEnd = args.position === 'end';
        const changed = await writeLabelChanges(host, labels, (_text, l) => (atEnd ? { from: l.textEnd, to: l.textEnd, insert: ` ${directive}`, expect: '' } : { from: l.textStart, to: l.textStart, insert: `${directive} `, expect: '' }));
        return { labels: labels.length, changed, directive, ...(await layoutAnswer(host, args.wait, signal)) };
      }
      if (args.action === 'pointer') {
        const s = store.getSnapshot();
        const templateId = typeof args.template === 'string' ? args.template : '';
        const templates = s.config.pageTemplates ?? [];
        if (!templates.some((t) => t.id === templateId)) throw new ToolError(`No page template ${JSON.stringify(templateId)}. The book has: ${templates.map((t) => t.id).join(', ') || 'none'}.`);
        const id = typeof args.id === 'string' ? args.id : undefined;
        let next;
        let pointer: string | undefined;
        if (args.remove === true) {
          if (!id) throw new ToolError('remove needs the id of the pointer.');
          next = removePointer(templates, templateId, id);
          if (!next) throw new ToolError(`No pointer ${JSON.stringify(id)} on ${templateId}. Its pointers: ${pointersOf(templates, templateId).map((p) => p.id).join(', ') || 'none'}.`);
        } else {
          const from = typeof args.from === 'string' ? args.from : '';
          const toFrame = typeof args.toFrame === 'string' ? args.toFrame : '';
          const anchor = typeof args.anchor === 'string' ? args.anchor : '';
          const out = setPointer(templates, templateId, { from, toFrame, anchor, ...(id ? { id } : {}) });
          if (!out) throw new ToolError('A pointer needs from (a frame), toFrame (another frame) and anchor; with id, a pointer of the template.');
          next = out.templates;
          pointer = out.id;
        }
        store.dispatch({ type: 'UPDATE_CONFIG', payload: { pageTemplates: next.length > 0 ? next : undefined }, history: { merge: false } });
        return { ...(pointer ? { pointer } : {}), pointers: pointersOf(next, templateId).map((p) => ({ id: p.id, from: p.from, toFrame: p.toFrame, anchor: p.anchor })), ...(await layoutAnswer(host, args.wait, signal)) };
      }
      throw new ToolError('action is leader, icon or pointer.');
    },
  };
  return [edit];
}
