// Designs as tools (#1523): the gallery of the Design panel (saved
// designs, the designs the Sandbox ships, the sample books' designs), and
// saving, trying, applying, importing and exporting one. The work is done
// by the same module as the panel's (`designs/designActions.ts`).

import { DESIGN_PARTS, isDesignPart, type DesignPart, type MissingStyle } from 'postext';
import {
  CHAPTER_STYLE_PARTS,
  applyDesignNow,
  deleteDesign,
  designAsChapterStyle,
  discardDesign,
  exportDesign,
  importDesign,
  keepDesign,
  saveDesign,
  tryDesign,
} from '../../designs/designActions.js';
import { designHostOf } from '../../designs/designHost.js';
import { listDesignEntries, type DesignEntry } from '../../designs/designSources.js';
import { designTrialOf, type DesignTrial } from '../../designs/designTrial.js';
import { downloadBytes } from '../../storage/persistence.js';
import { FILE_PARAM, readFileInput, type FileInput } from '../fileInput.js';
import { whenSettled, type SandboxToolHost } from '../host.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';

/** Largest design file handed back inside a result, in bytes. */
const MAX_DATA_BYTES = 12 * 1024 * 1024;

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const DESIGN_PARAM = {
  type: 'string',
  description: 'The design, by the id sandbox_list_designs gives it: saved:<id> (one the reader saved or imported), builtin:<id> (shipped with the Sandbox) or sample:<id> (the design of a sample book).',
} as const;

const PARTS_PARAM = {
  type: 'array',
  items: { type: 'string', enum: [...DESIGN_PARTS] },
  description: 'The parts of the design to take, named as the Design panel\'s groups. Left out: every part the design holds.',
} as const;

/** The parts asked for, checked. */
function partsOf(value: unknown): DesignPart[] | undefined {
  if (value === undefined) return undefined;
  const list = value as unknown[];
  const unknown = list.filter((p) => !isDesignPart(p));
  if (unknown.length > 0) throw new ToolError(`No part ${unknown.map((p) => JSON.stringify(p)).join(', ')}. The parts: ${DESIGN_PARTS.join(', ')}.`);
  if (list.length === 0) throw new ToolError('"parts" names no part; leave it out to take every part.');
  return list as DesignPart[];
}

function trialAnswer(t: DesignTrial): Record<string, unknown> {
  return { design: t.entryId, name: t.name, parts: t.parts, missingStyles: t.missing };
}

function missingNote(missing: readonly MissingStyle[]): Record<string, unknown> {
  return missing.length === 0 ? {} : {
    missingStyles: missing,
    note: 'The text names styles the book had and the design has not: they are set in the default style until the design or the text gets them.',
  };
}

/** Run a design action, its failures as the agent's errors. */
async function attempt<T>(run: () => Promise<T> | T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ToolError) throw err;
    throw new ToolError(messageOf(err));
  }
}

export function designTools(host: SandboxToolHost): WebMcpTool[] {
  const designs = designHostOf(host.store);
  const entryOf = async (id: string): Promise<DesignEntry> => {
    const entry = (await listDesignEntries(designs.sources())).find((e) => e.id === id);
    if (!entry) throw new ToolError(`No design "${id}". sandbox_list_designs lists them.`);
    return entry;
  };

  return [
    {
      name: 'sandbox_list_designs',
      title: 'List the designs',
      description: 'The designs the Design panel offers: the ones the reader saved or imported, the ones the Sandbox ships and the designs of the sample books, each with the parts it holds (the Design panel\'s groups: page, writing, colors, text, headings…). Also says which design is being tried on the book on screen, and the parts a chapter style can take.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const entries = await attempt(() => listDesignEntries(designs.sources()));
        const trial = designTrialOf(host.store.getSnapshot());
        return {
          designs: entries.map((e) => ({ id: e.id, kind: e.kind, name: e.name, ...(e.description ? { description: e.description } : {}), ...(e.source ? { savedFrom: e.source } : {}), parts: e.parts })),
          parts: DESIGN_PARTS,
          chapterStyleParts: CHAPTER_STYLE_PARTS,
          trying: trial ? trialAnswer(trial) : null,
        };
      },
    },
    {
      name: 'sandbox_save_design',
      title: 'Save a design',
      description: 'Save the design of the book on screen (or of a stored project, from) to the reader\'s designs: the parts asked for, with the font files and colour profiles they name. The text, the resources and the settings that belong to the book as a whole (language, direction, numerals, resource types, checks) are not part of a design.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name the design is listed under.' },
          description: { type: 'string', description: 'A line on what the design is for.' },
          parts: PARTS_PARAM,
          from: { type: 'string', description: 'The id of a stored project to take the design from, as sandbox_list_books gives it. Left out: the book on screen.' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      execute: async (args) => {
        const parts = partsOf(args.parts);
        const { entry, warnings } = await attempt(() => saveDesign(designs, {
          name: String(args.name),
          ...(typeof args.description === 'string' ? { description: args.description } : {}),
          ...(parts ? { parts } : {}),
          ...(typeof args.from === 'string' ? { from: args.from } : {}),
        }));
        return { saved: entry.id, name: entry.name, parts: entry.parts, ...(warnings.length > 0 ? { warnings } : {}) };
      },
    },
    {
      name: 'sandbox_try_design',
      title: 'Try a design',
      description: 'Try a design on the book on screen: its parts replace the book\'s settings of those parts, and the book lays out again. Trying another design replaces this one. End the trial with sandbox_end_design_trial: keep it, or discard it, which brings back only the settings the design replaced and keeps every other edit made meanwhile. Opening another book drops the trial (the design stays). In a book in several languages the design goes to the general settings. Named styles merge by id; the answer lists the styles the text names that the design lacks.',
      inputSchema: {
        type: 'object',
        properties: { design: DESIGN_PARAM, parts: PARTS_PARAM },
        required: ['design'],
        additionalProperties: false,
      },
      execute: async (args) => {
        const id = String(args.design);
        await entryOf(id);
        const trial = await attempt(() => tryDesign(designs, id, partsOf(args.parts)));
        return { trying: trialAnswer(trial), ...missingNote(trial.missing) };
      },
    },
    {
      name: 'sandbox_end_design_trial',
      title: 'Keep or discard the design being tried',
      description: 'End the trial of a design on the book on screen: keep leaves the design on the book; discard takes it off, bringing back only the settings it replaced (every other edit stays). Either step can be taken back with sandbox_undo.',
      inputSchema: {
        type: 'object',
        properties: { outcome: { type: 'string', enum: ['keep', 'discard'], description: 'keep or discard.' } },
        required: ['outcome'],
        additionalProperties: false,
      },
      execute: (args) => {
        const t = args.outcome === 'discard' ? discardDesign(designs) : keepDesign(designs);
        if (!t) throw new ToolError('No design is being tried on the book on screen.');
        return { [args.outcome === 'discard' ? 'discarded' : 'kept']: t.entryId, name: t.name, parts: t.parts };
      },
    },
    {
      name: 'sandbox_apply_design',
      title: 'Apply a design',
      description: 'Apply a design to the book on screen at once, without a trial (a design being tried is kept first), as one step sandbox_undo takes back. With asChapterStyle the design becomes a chapter style instead (an existing one by id, or a new one by name): the chapters that name it (chapterStyle: in their front matter) or a part (:::part{style="…"}) are set in it, and the rest of the book is not. A chapter style takes only the parts a chapter may set apart (chapterStyleParts in sandbox_list_designs).',
      inputSchema: {
        type: 'object',
        properties: {
          design: DESIGN_PARAM,
          parts: PARTS_PARAM,
          asChapterStyle: {
            type: 'object',
            description: 'Keep the design as a chapter style: id names one the book has, name makes a new one. Give one of the two.',
            properties: { id: { type: 'string' }, name: { type: 'string' } },
            additionalProperties: false,
          },
        },
        required: ['design'],
        additionalProperties: false,
      },
      execute: async (args) => {
        const id = String(args.design);
        await entryOf(id);
        const parts = partsOf(args.parts);
        const style = args.asChapterStyle as { id?: string; name?: string } | undefined;
        if (style) {
          if ((style.id === undefined) === (style.name === undefined)) throw new ToolError('asChapterStyle takes an id (a style the book has) or a name (a new style): one of the two.');
          const made = await attempt(() => designAsChapterStyle(designs, id, parts, style.id !== undefined ? { id: style.id } : { name: style.name! }));
          return { chapterStyle: made.id, name: made.name, created: made.created };
        }
        const done = await attempt(() => applyDesignNow(designs, id, parts));
        return { applied: done.entry.id, name: done.entry.name, parts: done.parts, ...missingNote(done.missing) };
      },
    },
    {
      name: 'sandbox_import_design',
      title: 'Import a design',
      description: 'Add a design file to the reader\'s designs: a .postext design (made by the Design panel, sandbox_export_design or `postext design`), the design of a whole book\'s .postext, a configuration exported as .json, or a design template saved by postext 1.78 (.postext-template.json). The file is read with the limits of a design file (size, fonts and profiles only).',
      inputSchema: {
        type: 'object',
        properties: { file: { ...FILE_PARAM, description: 'The design file: where to fetch it (url) or its bytes (base64).' } },
        required: ['file'],
        additionalProperties: false,
      },
      execute: async (args, { signal }) => {
        const file = await readFileInput(args.file as FileInput, signal);
        const { entry, warnings } = await attempt(async () => importDesign(designs, new Uint8Array(await file.arrayBuffer()), file.name || 'design.postext'));
        return { imported: entry.id, name: entry.name, parts: entry.parts, ...(warnings.length > 0 ? { warnings } : {}) };
      },
    },
    {
      name: 'sandbox_export_design',
      title: 'Export a design',
      description: 'Write a design file (.postext with no chapters): a design of the gallery, or the design of the book on screen when design is left out, cut down to the parts asked for, with the font files and colour profiles it names (a font marked as not redistributable is left out). The file opens in the Design panel of any Sandbox and in `postext <book> --design <file>`. Downloaded by the reader\'s browser, or handed back base64-encoded with deliver: "data".',
      inputSchema: {
        type: 'object',
        properties: {
          design: { ...DESIGN_PARAM, description: `${DESIGN_PARAM.description} Left out: the design of the book on screen.` },
          parts: PARTS_PARAM,
          name: { type: 'string', description: 'The name written in the file. Left out: the design\'s or the book\'s.' },
          deliver: { type: 'string', enum: ['download', 'data'], description: 'download (default) saves the file through the browser; data hands it back in the result.' },
        },
        additionalProperties: false,
      },
      execute: async (args) => {
        if (args.design === undefined) await whenSettled(host);
        else await entryOf(String(args.design));
        const parts = partsOf(args.parts);
        const made = await attempt(() => exportDesign(designs, {
          ...(typeof args.design === 'string' ? { entryId: args.design } : {}),
          ...(parts ? { parts } : {}),
          ...(typeof args.name === 'string' ? { name: args.name } : {}),
        }));
        const answer = { file: made.fileName, bytes: made.bytes.byteLength, parts: made.parts, ...(made.warnings.length > 0 ? { warnings: made.warnings } : {}) };
        if (args.deliver === 'data') {
          if (made.bytes.byteLength > MAX_DATA_BYTES) throw new ToolError(`The design file is ${Math.round(made.bytes.byteLength / 1048576)} MB, too large to hand back in a result; ask for it as a download.`);
          return { ...answer, base64: toBase64(made.bytes) };
        }
        downloadBytes(made.bytes, made.fileName, 'application/zip');
        return { ...answer, downloaded: true };
      },
    },
    {
      name: 'sandbox_delete_design',
      title: 'Delete a saved design',
      description: 'Delete one of the reader\'s saved designs (saved:<id>). The designs the Sandbox ships and the sample books\' cannot be deleted. Books that used the design keep their settings.',
      inputSchema: { type: 'object', properties: { design: DESIGN_PARAM }, required: ['design'], additionalProperties: false },
      annotations: { consequentialHint: true },
      execute: async (args) => {
        const id = String(args.design);
        await entryOf(id);
        await attempt(() => deleteDesign(id));
        return { deleted: id };
      },
    },
  ];
}
