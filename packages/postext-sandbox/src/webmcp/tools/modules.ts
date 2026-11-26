import { resolvePageTemplate } from 'postext';
import { applyTemplateRewrite, bookChapters } from '../../templates/applyTemplateRewrite.js';
import { planFramesToGrid, type GridRefusal } from '../../templates/framesToGrid.js';
import { createModule, moduleTemplates, moduleUsage, planExtractModule, planInsertModule, planRenameModule, type ExtractRefusal } from '../../templates/moduleEdits.js';
import { laidTemplatePage } from '../../templates/pagePieces.js';
import { templateFences } from '../../templates/templateUsage.js';
import { slugify } from '../../templates/templateEdits.js';
import type { SandboxToolHost } from '../host.js';
import { chapterOf, designScopeAnswer, designWriter, layOutChapter } from '../host.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';
import { layoutAnswer } from './book.js';

const WAIT = { type: 'boolean', description: 'Wait for the book to be laid out again (default true).' } as const;
const CHAPTER = { type: ['number', 'string'], description: 'Chapter (1-based position, id or title) whose pages are read for the frames\' boxes; default: the first chapter with a page set with the template.' } as const;

/** Why a reshape was refused, in words an agent can act on. */
const REFUSALS: Record<GridRefusal | ExtractRefusal, string> = {
  tooFew: 'Give at least two cards (frames of one width standing in rows and columns).',
  unknown: 'The template has no such frame.',
  inherited: 'These frames come from the template it extends: reshape that template.',
  notLaid: 'These frames are not laid on the page read (collapsed or empty and optional).',
  flow: 'The flow frame and frames that take headings cannot move.',
  repeated: 'These frames are already repeated by a grid.',
  notLattice: 'The cards do not stand on one lattice: equal columns with one gap, full rows but the last, rows one gap apart.',
  widths: 'The cards are not all as wide.',
  heights: 'The cards are not all as tall and the first one has a set height: the taller ones would lose their text. Give the cards one height, or let the first one grow with its content.',
  members: 'The cards do not all have the same frames hanging from them (a caption under each, for instance).',
  splitsGrid: 'Give every frame of the grid, or none.',
  hasModules: 'The template already has a modules group: extract into it is not done; move these frames by hand.',
  isModule: 'The template is a module already.',
  empty: 'Give the frames to move.',
};

/** The chapter whose laid pages are read for a template's boxes. */
function chapterFor(host: SandboxToolHost, templateId: string, ref: unknown) {
  const s = host.store.getSnapshot();
  if (ref !== undefined && ref !== null && ref !== '') return chapterOf(s, ref).chapter;
  const texts = bookChapters(s);
  const hit = texts.find((c) => templateFences(c.markdown).some((f) => f.template === templateId));
  if (!hit) throw new ToolError(`No page of the book is set with template ${JSON.stringify(templateId)}: the frames' boxes are read off one.`);
  return s.chapters.find((c) => c.id === hit.id)!;
}

/** The module library (#1065) and the template reshapes for agents: the
 *  same as Design › Page & columns › Modules and the page-template editor's
 *  «Turn into a grid» / «Extract a module». */
export function moduleTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;
  // The modules are the design's: written where the Design panel's scope
  // says (#1700).
  const design = designWriter(host);

  const list: WebMcpTool = {
    name: 'sandbox_modules',
    title: 'Sandbox: the module templates and where they are used',
    description: 'The book\'s module templates (pageTemplates entries with role "module", stacked in a page by :::module{template="…"} blocks inside a ::::page fence) with their frames and groups, and where they are used: blocks, composed pages and chapters (1-based); and the page templates with the group that takes modules (modules: true). Create one with sandbox_create_module, write one into a page with sandbox_insert_module, rename with sandbox_rename_module, make one from a page\'s frames with sandbox_extract_module.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: () => {
      const s = store.getSnapshot();
      const templates = s.config.pageTemplates ?? [];
      const usage = moduleUsage(templates, bookChapters(s));
      return {
        modules: moduleTemplates(templates).map((t) => {
          const r = resolvePageTemplate({ pageTemplates: templates }, t.id);
          const u = usage.get(t.id)!;
          return {
            id: t.id,
            ...(t.name && t.name !== t.id ? { name: t.name } : {}),
            frames: r?.frames.map((f) => f.name) ?? [],
            ...(r && r.groups.length > 0 ? { groups: r.groups.map((g) => ({ name: g.name, kind: g.kind, ...(g.repeat ? { repeat: g.repeat.frames } : {}) })) } : {}),
            blocks: u.blocks,
            pages: u.pages,
            ...(u.chapters.length > 0 ? { byChapter: u.chapters.map((c) => ({ chapter: c.chapterIndex + 1, blocks: c.blocks })) } : {}),
            ...(u.pageTemplates.length > 0 ? { inPageTemplates: u.pageTemplates } : {}),
          };
        }),
        pageTemplates: templates.filter((t) => t.role !== 'module').map((t) => {
          const g = resolvePageTemplate({ pageTemplates: templates }, t.id)?.groups.find((x) => x.modules);
          return { id: t.id, ...(g ? { modulesGroup: g.name } : {}) };
        }),
      };
    },
  };

  const create: WebMcpTool = {
    name: 'sandbox_create_module',
    title: 'Sandbox: a new module template',
    description: 'Add a module template (role "module") with one text frame, named from name (its id made from it). Shape it with sandbox_set_config at pageTemplates[id=…], or reshape a page\'s frames into one with sandbox_extract_module. One step of the undo history.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false },
    execute: (args) => {
      if (typeof args.name !== 'string' || args.name.trim() === '') throw new ToolError('Give the module a name.');
      const s = store.getSnapshot();
      const out = createModule(s.config.pageTemplates ?? [], args.name.trim());
      applyTemplateRewrite(design, { templates: out.templates, chapters: [] }, s.activeChapterId);
      return { ...designScopeAnswer(host), id: out.id, undoSteps: 1 };
    },
  };

  const rename: WebMcpTool = {
    name: 'sandbox_rename_module',
    title: 'Sandbox: rename a module template',
    description: 'Give module template module the id to, with every use: the :::module{template} blocks of every chapter and the templates that extend it. One step per chapter rewritten and one for the design (undoSteps).',
    inputSchema: { type: 'object', properties: { module: { type: 'string' }, to: { type: 'string' }, wait: WAIT }, required: ['module', 'to'], additionalProperties: false },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      const templates = s.config.pageTemplates ?? [];
      const from = String(args.module ?? '');
      if (!moduleTemplates(templates).some((t) => t.id === from)) throw new ToolError(`No module template ${JSON.stringify(from)}. Read them with sandbox_modules.`);
      const plan = planRenameModule(templates, bookChapters(s), from, String(args.to ?? ''));
      if (!plan) throw new ToolError('The new id is empty, the same, or taken by another template.');
      const record = applyTemplateRewrite(design, plan, s.activeChapterId);
      return { ...designScopeAnswer(host), renamed: from, to: slugify(String(args.to)), blocksRewritten: plan.chapters.reduce((n, c) => n + c.changes.length, 0), undoSteps: record.steps, ...(await layoutAnswer(host, args.wait, signal)) };
    },
  };

  const insert: WebMcpTool = {
    name: 'sandbox_insert_module',
    title: 'Sandbox: write a module into a composed page',
    description: 'Write a :::module{template="module"} block into a composed page of a chapter, before its closing fence, with an empty :::frame{slot} for each of the module\'s frames to write in (the text stays in the Markdown). page is the ::::page fence\'s ordinal in the chapter (1-based; default 1). When the page\'s template has no group that takes modules, one is added (groupAdded): under its last frame, as wide as the area. Steps for sandbox_undo: the text, and the design when a group was added.',
    inputSchema: {
      type: 'object',
      properties: { module: { type: 'string' }, chapter: { type: ['number', 'string'] }, page: { type: 'number' }, wait: WAIT },
      required: ['module'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      const { chapter, index } = chapterOf(s, args.chapter);
      const text = bookChapters(s)[index]!;
      const fence = typeof args.page === 'number' ? Math.round(args.page) - 1 : 0;
      const plan = planInsertModule(s.config.pageTemplates ?? [], text, fence, String(args.module ?? ''));
      if (!plan.ok) {
        throw new ToolError(plan.reason === 'unknownModule'
          ? `No module template ${JSON.stringify(args.module)}. Read them with sandbox_modules.`
          : plan.reason === 'noPage'
            ? `Chapter ${index + 1} has ${templateFences(text.markdown).length} composed page(s); page ${fence + 1} is not one of them.`
            : 'The page names no template that can take modules (none, or a module).');
      }
      const record = applyTemplateRewrite(design, plan, s.activeChapterId);
      return { ...designScopeAnswer(host), chapter: index + 1, chapterTitle: chapter.title, page: fence + 1, pageTemplate: plan.pageTemplate, group: plan.group, groupAdded: plan.added, undoSteps: record.steps, ...(await layoutAnswer(host, args.wait, signal)) };
    },
  };

  const toGrid: WebMcpTool = {
    name: 'sandbox_frames_to_grid',
    title: 'Sandbox: turn one-off frames into a grid',
    description: 'Turn frames of a page template that stand on a lattice (cards of one width in rows and columns, each maybe with frames hanging from it: foto1, pie1, foto2, pie2…) into one grid group that repeats the first card\'s frames (kind "grid", columns, gaps, repeat). The lattice is read off a laid page set with the template; every page set with it gets its pieces renamed into the grid\'s items in reading order, so the pages look as they did. Answers the grid, its names, and instances (old frame name → instance name, foto2 → foto[2]). Steps for sandbox_undo: one per chapter rewritten and one for the design (undoSteps).',
    inputSchema: {
      type: 'object',
      properties: { template: { type: 'string' }, frames: { type: 'array', items: { type: 'string' } }, chapter: CHAPTER, wait: WAIT },
      required: ['template', 'frames'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const templateId = String(args.template ?? '');
      const frames = Array.isArray(args.frames) ? args.frames.map(String) : [];
      const ch = chapterFor(host, templateId, args.chapter);
      const { doc, state } = await layOutChapter(host, ch.id, signal);
      const laid = laidTemplatePage(doc, templateId);
      if (!laid) throw new ToolError(`No page of chapter "${ch.title}" is set with template ${JSON.stringify(templateId)} on one page (spreads are not read).`);
      const plan = planFramesToGrid({ templates: state.config.pageTemplates ?? [], templateId, frames, laid, chapters: bookChapters(state) });
      if (!plan.ok) throw new ToolError(REFUSALS[plan.reason], plan.frames ? { frames: plan.frames } : undefined);
      const record = applyTemplateRewrite(design, plan, state.activeChapterId);
      return {
        ...designScopeAnswer(host),
        group: plan.group,
        main: plan.main,
        members: plan.members,
        columns: plan.columns,
        rows: plan.rows,
        columnGapMm: plan.columnGapMm,
        rowGapMm: plan.rowGapMm,
        instances: plan.instances,
        pagesRewritten: plan.pages,
        ...(plan.notes.length > 0 ? { notes: plan.notes } : {}),
        undoSteps: record.steps,
        ...(await layoutAnswer(host, args.wait, signal)),
      };
    },
  };

  const extract: WebMcpTool = {
    name: 'sandbox_extract_module',
    title: 'Sandbox: make a module from a page template\'s frames',
    description: 'Move frames of a page template (and the decoration hanging from them, and a grid or group all of whose frames move) into a new module template named name; the page template gets a modules group where they stood (a box as wide as they were), and every page set with it gets the pieces for those frames wrapped in a :::module{template} block, so the pages look as they did. Frames that hung from a moved frame hang from the modules group, shifted to stay where they were. Answers the module id, the group and names (frame on the page before → after: nota → caja[1].nota). Steps for sandbox_undo: one per chapter rewritten and one for the design.',
    inputSchema: {
      type: 'object',
      properties: { template: { type: 'string' }, frames: { type: 'array', items: { type: 'string' } }, name: { type: 'string' }, chapter: CHAPTER, wait: WAIT },
      required: ['template', 'frames', 'name'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const templateId = String(args.template ?? '');
      const frames = Array.isArray(args.frames) ? args.frames.map(String) : [];
      const ch = chapterFor(host, templateId, args.chapter);
      const { doc, state } = await layOutChapter(host, ch.id, signal);
      const laid = laidTemplatePage(doc, templateId);
      if (!laid) throw new ToolError(`No page of chapter "${ch.title}" is set with template ${JSON.stringify(templateId)} on one page (spreads are not read).`);
      const plan = planExtractModule({ templates: state.config.pageTemplates ?? [], templateId, frames, name: String(args.name ?? ''), laid, chapters: bookChapters(state) });
      if (!plan.ok) throw new ToolError(REFUSALS[plan.reason], plan.frames ? { frames: plan.frames } : undefined);
      const record = applyTemplateRewrite(design, plan, state.activeChapterId);
      return {
        ...designScopeAnswer(host),
        module: plan.module,
        group: plan.group,
        frames: plan.frames,
        ...(plan.decoration.length > 0 ? { decoration: plan.decoration } : {}),
        ...(plan.groups.length > 0 ? { groups: plan.groups } : {}),
        names: plan.names,
        pagesRewritten: plan.pages,
        ...(plan.notes.length > 0 ? { notes: plan.notes } : {}),
        undoSteps: record.steps,
        ...(await layoutAnswer(host, args.wait, signal)),
      };
    },
  };

  return [list, create, rename, insert, toGrid, extract];
}
