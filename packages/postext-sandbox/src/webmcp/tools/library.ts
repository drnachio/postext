// The books: the samples the Sandbox ships and the reader's own projects,
// and the files a book is exported to.

import { isBundleManifest, pickBundleMeta } from 'postext/bundle';
import { canonicalLocaleTag } from 'postext';
import type { DuplicateSource, SandboxState } from '../../context/SandboxContext.js';
import { slugify } from '../../panels/resources/slugify.js';
import { isDocumentUntouched } from '../../presets/index.js';
import { bundleContentLocales, choosePresetOpen, isEditionOnScreen, sameLocaleTag } from '../../presets/locale.js';
import { readBundleZipManifest } from '../../presets/zip.js';
import { downloadBytes, exportConfigToJson, exportMarkdownFile } from '../../storage/persistence.js';
import type { ViewportTab } from '../../types/index.js';
import { stateReaches } from '../chapterEdits.js';
import { bookPagesSummary, chapterOf, dispatchAndWait, isSettled, whenSettled, type SandboxToolHost } from '../host.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';
import { bookIdentity, fileParam, pendingQuestion } from './book.js';
import { readFileInput, type FileInput } from './resources.js';
import { controlsOf } from './view.js';
import { VARIANT_PARAM, exportWordFile } from './wordEdits.js';
import { IDML_EXPORT_PARAMS, exportIdmlFile } from './idml.js';
import { compileFromLibrary, compilesFromLibrary } from './compiledBook.js';

/** Largest file handed back inside a result, in bytes; larger ones are
 *  downloaded. */
const MAX_DATA_BYTES = 12 * 1024 * 1024;
/** How long a PDF or an EPUB may take to write. */
const GENERATE_TIMEOUT_MS = 10 * 60_000;

/** How long a cover may take to show in the list of projects. */
const COVER_MS = 800;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** The language the sample on screen is open in, when `presetId` is that
 *  sample; null otherwise, or while it is not known. */
function languageOnScreen(s: SandboxState, presetId: string): string | null {
  if (s.activeProjectId !== null || s.activePresetId !== presetId) return null;
  return s.presetApplied?.presetId === presetId ? s.presetApplied.locale ?? null : null;
}

/** The languages a `.postext` file carries and the one it is written in,
 *  read from its manifest alone (what the Books panel asks about before
 *  it imports a file in several). */
function bundleLanguages(bytes: Uint8Array): { manifest: Record<string, unknown>; languages: string[]; own: string | null } {
  let manifest: unknown;
  try {
    manifest = readBundleZipManifest(bytes);
  } catch (err) {
    throw new ToolError(`The file is not a .postext book: ${messageOf(err)}.`);
  }
  const { locales, own } = bundleContentLocales(manifest);
  return {
    manifest: typeof manifest === 'object' && manifest !== null ? manifest as Record<string, unknown> : {},
    languages: locales.length > 0 ? locales : own ? [own] : [],
    own,
  };
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function libraryTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;
  const projects = store.projectActions;

  const bookName = (): string => {
    const identity = bookIdentity(host);
    return (identity.name as string | null) ?? 'document';
  };

  const listBooks: WebMcpTool = {
    name: 'sandbox_list_books',
    title: 'Sandbox: the books',
    description: "The books the Sandbox can open: the samples it ships (each in one or more languages; one the reader edited keeps their version, and editedLanguages says in which languages) and the reader's own projects, stored in this browser (cover: true on those with a cover picture; languages on those that keep a book in several languages, language being the one that opens). Says which one is on screen.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => {
      const s = store.getSnapshot();
      return {
        onScreen: bookIdentity(host),
        samples: s.presetSummaries.map((p) => {
          const drafts = s.presetDrafts.filter((d) => d.presetId === p.id);
          // A draft kept before its language was recorded names none.
          const editedLanguages = drafts.map((d) => d.locale).filter((l) => l !== '');
          return {
            id: p.id,
            name: p.name,
            ...(p.description ? { description: p.description } : {}),
            ...(p.locales?.length ? { languages: p.locales } : p.locale ? { languages: [p.locale] } : {}),
            ...(p.available ? {} : { available: false }),
            ...(s.hiddenPresetIds.includes(p.id) ? { hidden: true } : {}),
            ...(drafts.length > 0 ? { edited: true, ...(editedLanguages.length > 0 ? { editedLanguages } : {}) } : {}),
          };
        }),
        projects: s.projects.map((p) => ({
          id: p.id,
          name: p.name,
          ...(p.description ? { description: p.description } : {}),
          ...(p.locale ? { language: p.locale } : {}),
          // A book imported in several languages keeps them all (#903).
          ...(p.locales ? { languages: p.locales } : {}),
          chapters: p.chapterCount,
          ...(p.thumbnail ? { cover: true } : {}),
          updated: new Date(p.updatedAt).toISOString(),
          ...(p.sourcePresetId ? { madeFrom: p.sourcePresetId } : {}),
        })),
      };
    },
  };

  const openBook: WebMcpTool = {
    name: 'sandbox_open_book',
    title: 'Sandbox: open a book',
    description: "Open another book in the Sandbox: a sample (in one of its languages) or one of the reader's projects. The book on screen is saved first. Answers once the new book is laid out, with its chapters and pages.",
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['sample', 'project'] },
        id: { type: 'string', description: 'The id, as sandbox_list_books gives it.' },
        language: { type: 'string', description: 'A sample or project in several languages: the one to open (en, es, zh-Hans…). A sample opens in the language of the interface when left out; a project in the language it was left in.' },
      },
      required: ['kind', 'id'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      if (args.kind === 'sample') {
        const preset = s.presetSummaries.find((p) => p.id === args.id);
        if (!preset) throw new ToolError(`No sample with id ${JSON.stringify(args.id)}. The samples: ${s.presetSummaries.map((p) => p.id).join(', ')}.`);
        if (!preset.available) throw new ToolError('That sample cannot be loaded right now (its files did not answer).');
        const opened = await store.loadPreset(preset.id, args.language as string | undefined);
        if (!opened) throw new ToolError(store.getSnapshot().presetError ?? 'The sample did not open.');
      } else {
        if (!s.projects.some((p) => p.id === args.id)) throw new ToolError(`No project with id ${JSON.stringify(args.id)}. The projects: ${s.projects.map((p) => `${p.id} (${p.name})`).join(', ') || 'none'}.`);
        const language = args.language as string | undefined;
        const project = s.projects.find((p) => p.id === args.id)!;
        if (language && project.locales) {
          if (!project.locales.some((l) => sameLocaleTag(l, language))) throw new ToolError(`That project has no ${language} edition. Its languages: ${project.locales.join(', ')}.`);
          await projects.switchEdition(project.id, language);
        } else {
          await projects.activate(args.id as string);
        }
      }
      await sleep(50);
      const laidOut = await whenSettled(host, { signal });
      return { opened: bookIdentity(host), laidOut, book: bookPagesSummary(host) };
    },
  };

  const saveBook: WebMcpTool = {
    name: 'sandbox_save_book',
    title: 'Sandbox: make, copy or rename a book',
    description: "Make a project — the reader's own book, kept in this browser — or tend the list of books: new_blank starts an empty book; copy_current keeps the book on screen as a new project (how a sample becomes the reader's own); duplicate copies a sample or a project without opening the original (a sample the reader edited is copied with their edits, unless from says original); rename changes a project's name or description (on a book in several languages the name is the book's in every language, unless thisLanguageOnly); add_language adds a language to a project: the edition on screen is copied into a new edition whose document language is the one in the language field, and that edition is opened, still in the old language's words until translated; set_cover gives a project a cover picture and remove_cover takes it away; hide_sample and show_sample take a sample off the list and put it back. A new book is opened at once.",
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['new_blank', 'copy_current', 'duplicate', 'rename', 'add_language', 'set_cover', 'remove_cover', 'hide_sample', 'show_sample'] },
        kind: { type: 'string', enum: ['sample', 'project'], description: 'duplicate: what the id names.' },
        id: { type: 'string', description: 'duplicate, rename, hide_sample, show_sample: the book. add_language, set_cover, remove_cover: the project (the one on screen when left out).' },
        thisLanguageOnly: { type: 'boolean', description: 'rename a project in several languages: give the name and description to the language on screen only; the others keep the title they show.' },
        language: { type: 'string', description: 'add_language: the tag of the new language (en, es, fr, zh-Hant, ar…), one the book does not have. duplicate a sample: the language to copy. Left out, the one a click on the sample would open: the one on screen, else the interface language, else the language the reader last edited.' },
        from: { type: 'string', enum: ['edited', 'original'], description: 'duplicate a sample: copy the reader\'s edited version in that language (edited; refused when there is none) or the sample as it ships (original). Left out, the edited version when there is one, as the Books panel does.' },
        name: { type: 'string', description: 'new_blank, copy_current, rename: the name.' },
        description: { type: 'string', description: 'rename: the description (empty clears it).' },
        file: fileParam('set_cover: the picture (PNG, JPEG, WebP, GIF or SVG): where to fetch it (url) or its bytes (base64).'),
      },
      required: ['action'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      const name = (args.name as string | undefined)?.trim();
      switch (args.action) {
        case 'new_blank':
        case 'copy_current': {
          const id = await projects.create({ from: args.action === 'new_blank' ? 'blank' : 'current', ...(name ? { name } : {}) });
          await sleep(50);
          const laidOut = await whenSettled(host, { signal });
          return { project: id, opened: bookIdentity(host), laidOut };
        }
        case 'duplicate': {
          if (args.id === undefined || args.kind === undefined) throw new ToolError('duplicate needs the kind and the id of the book to copy.');
          const language = args.language as string | undefined;
          let copied: 'edited' | 'original' | undefined;
          let copy: () => Promise<string>;
          if (args.kind === 'project') {
            if (!s.projects.some((p) => p.id === args.id)) throw new ToolError(`No project with id ${JSON.stringify(args.id)}. The projects: ${s.projects.map((p) => `${p.id} (${p.name})`).join(', ') || 'none'}.`);
            copy = () => projects.duplicate({ kind: 'project', id: args.id as string });
          } else {
            const preset = s.presetSummaries.find((p) => p.id === args.id);
            if (!preset) throw new ToolError(`No sample with id ${JSON.stringify(args.id)}. The samples: ${s.presetSummaries.map((p) => p.id).join(', ')}.`);
            // What the Books panel copies: the sample as it stands on
            // screen when it is there with edits, else the saved draft a
            // click on it would open, else the original.
            const onScreen = s.activeProjectId === null && preset.id === s.activePresetId;
            const current = languageOnScreen(s, preset.id);
            const drafts = s.presetDrafts.filter((d) => d.presetId === preset.id);
            const choice = choosePresetOpen({ summary: preset, ...(language ? { requested: language } : {}), current: onScreen ? current : null, viewer: s.locale, drafts });
            const editedOnScreen = onScreen && s.storeReady && !isDocumentUntouched(s, s.presetApplied) && (!language || isEditionOnScreen(preset, language, current));
            const original: DuplicateSource = { kind: 'preset', id: preset.id, ...(language ?? current ? { locale: (language ?? current)! } : {}) };
            if (args.from === 'original') {
              copied = 'original';
              copy = () => projects.duplicate(original);
            } else if (editedOnScreen) {
              copied = 'edited';
              copy = () => projects.create({ from: 'current' });
            } else if (choice.draft) {
              const draft = choice.draft;
              copied = 'edited';
              copy = () => projects.duplicate({ ...original, ...(draft.locale ? { locale: draft.locale } : {}), draftKey: draft.key });
            } else if (args.from === 'edited') {
              const edited = drafts.map((d) => d.locale).filter((l) => l !== '');
              throw new ToolError(`The reader has no edited version of ${JSON.stringify(preset.id)}${language ? ` in ${language}` : ''}${edited.length > 0 ? ` (edited: ${edited.join(', ')})` : ''}. from: "original" copies the sample as it ships.`);
            } else {
              copied = 'original';
              copy = () => projects.duplicate(original);
            }
          }
          let id: string;
          try {
            id = await copy();
          } catch (err) {
            throw new ToolError(`The book could not be copied: ${messageOf(err)}`);
          }
          await sleep(50);
          const laidOut = await whenSettled(host, { signal });
          return { project: id, ...(copied ? { copied } : {}), opened: bookIdentity(host), laidOut };
        }
        case 'rename': {
          const id = (args.id as string | undefined) ?? s.activeProjectId;
          if (!id || !s.projects.some((p) => p.id === id)) throw new ToolError('rename works on a project: give its id, or open one (a sample becomes a project with copy_current).');
          const current = s.projects.find((p) => p.id === id)!;
          await projects.rename(id, name ?? current.name, args.description as string | undefined, args.thisLanguageOnly === true ? { edition: true } : undefined);
          return { project: id, name: name ?? current.name, ...(args.thisLanguageOnly === true && current.locales ? { language: current.locale } : {}) };
        }
        case 'add_language': {
          const id = (args.id as string | undefined) ?? s.activeProjectId;
          const project = id ? s.projects.find((p) => p.id === id) : undefined;
          if (!project) {
            throw new ToolError(args.id !== undefined
              ? `No project with id ${JSON.stringify(args.id)}. The projects: ${s.projects.map((p) => `${p.id} (${p.name})`).join(', ') || 'none'}.`
              : 'add_language works on a project: give its id, or open one (a sample becomes a project with copy_current).');
          }
          const language = (args.language as string | undefined)?.trim();
          if (!language || !canonicalLocaleTag(language)) throw new ToolError('add_language needs "language": the tag of the new language, such as "fr", "zh-Hant" or "ar".');
          let added: boolean;
          try {
            added = await projects.addEdition(project.id, language);
          } catch (err) {
            throw new ToolError(`The language could not be added: ${messageOf(err)}`);
          }
          if (!added) throw new ToolError(`The book already has an edition in ${language}${project.locales ? ` (${project.locales.join(', ')})` : ''}.`);
          await sleep(50);
          const laidOut = await whenSettled(host, { signal });
          return { project: project.id, language, opened: bookIdentity(host), laidOut };
        }
        case 'set_cover':
        case 'remove_cover': {
          const id = (args.id as string | undefined) ?? s.activeProjectId;
          const project = id ? s.projects.find((p) => p.id === id) : undefined;
          if (!project) {
            throw new ToolError(args.id !== undefined
              ? `No project with id ${JSON.stringify(args.id)}. The projects: ${s.projects.map((p) => `${p.id} (${p.name})`).join(', ') || 'none'}.`
              : 'A cover belongs to a project: give its id, or open one (a sample becomes a project with copy_current).');
          }
          const coverOf = (): string | undefined => store.getSnapshot().projects.find((p) => p.id === project.id)?.thumbnail?.fileId;
          const before = project.thumbnail?.fileId;
          if (args.action === 'remove_cover') {
            if (before === undefined) return { project: project.id, cover: false, changed: false };
            try {
              await projects.setThumbnail(project.id, null);
            } catch (err) {
              throw new ToolError(`The cover could not be removed: ${messageOf(err)}`);
            }
            await stateReaches(host, () => coverOf() === undefined, COVER_MS);
            return { project: project.id, cover: coverOf() !== undefined, changed: coverOf() === undefined };
          }
          if (args.file === undefined) throw new ToolError('set_cover needs the picture as "file" (a url, or its bytes as base64): PNG, JPEG, WebP, GIF or SVG.');
          const file = await readFileInput(args.file as FileInput, signal);
          try {
            await projects.setThumbnail(project.id, file);
          } catch (err) {
            throw new ToolError(`The cover could not be set: ${messageOf(err)}`);
          }
          // A picture the Sandbox does not take leaves the cover as it was
          // and says why in the Books panel's notice.
          if (!(await stateReaches(host, () => coverOf() !== before, COVER_MS))) {
            const notice = store.getSnapshot().projectNotice;
            throw new ToolError(`The picture was not taken as the cover (${file.type || 'unknown type'}): a cover is a PNG, JPEG, WebP, GIF or SVG file.${notice ? ` The Books panel says: ${notice}` : ''}`, notice ? { notice } : undefined);
          }
          return { project: project.id, cover: true, changed: true };
        }
        case 'hide_sample':
        case 'show_sample': {
          if (!s.presetSummaries.some((p) => p.id === args.id)) throw new ToolError(`No sample with id ${JSON.stringify(args.id)}.`);
          await dispatchAndWait(host, { type: args.action === 'hide_sample' ? 'HIDE_PRESET' : 'UNHIDE_PRESET', payload: args.id as string });
          return { sample: args.id, hidden: store.getSnapshot().hiddenPresetIds.includes(args.id as string) };
        }
        default:
          throw new ToolError(`Unknown action ${JSON.stringify(args.action)}.`);
      }
    },
  };

  const deleteBook: WebMcpTool = {
    name: 'sandbox_delete_book',
    title: 'Sandbox: delete a project',
    description: "Delete one of the reader's projects from this browser, with its chapters, resources and fonts. It cannot be undone (export it first to keep a copy). A sample cannot be deleted, only hidden.",
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The project\'s id.' } },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { consequentialHint: true },
    execute: async (args) => {
      const project = store.getSnapshot().projects.find((p) => p.id === args.id);
      if (!project) throw new ToolError(`No project with id ${JSON.stringify(args.id)}.`);
      await projects.remove(project.id);
      await sleep(50);
      return { deleted: project.id, name: project.name, onScreen: bookIdentity(host) };
    },
  };

  const importBook: WebMcpTool = {
    name: 'sandbox_import_book',
    title: 'Sandbox: import a .postext book',
    description: 'Import a .postext file (a book with its chapters, design, resources and fonts in one archive) as a new project, and open it. A file may carry the book in several languages: the project keeps every one of them (the checks, the language switcher and the side-by-side view of composed pages work on it), and language says which opens first. inspect: true reads the file and answers with them without importing.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'object',
          description: 'The .postext file: where to fetch it (url) or its bytes (base64).',
          properties: { url: { type: 'string' }, base64: { type: 'string' }, fileName: { type: 'string' } },
          additionalProperties: false,
        },
        language: { type: 'string', description: 'A file in several languages: the one to open first (all are kept). The interface language when left out.' },
        inspect: { type: 'boolean', description: 'Read the file and answer with its name and the languages it carries, without importing it.' },
      },
      required: ['file'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const file = await readFileInput(args.file as FileInput, signal);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (args.inspect) {
        const { manifest, languages, own } = bundleLanguages(bytes);
        return {
          imported: false,
          file: file.name,
          ...(typeof manifest.id === 'string' && manifest.id ? { id: manifest.id } : {}),
          ...(typeof manifest.name === 'string' && manifest.name ? { name: manifest.name } : {}),
          ...(typeof manifest.description === 'string' && manifest.description ? { description: manifest.description } : {}),
          languages,
          // Each edition's own title (`localized.<lang>.name`, #891).
          ...(isBundleManifest(manifest) && Object.values(manifest.localized ?? {}).some((l) => l.name)
            ? { names: Object.fromEntries(languages.map((l) => [l, pickBundleMeta(manifest, l).name])) }
            : {}),
          ...(own ? { writtenIn: own } : {}),
          ...(languages.length > 1 ? { note: 'Import it with language set to one of these.' } : {}),
        };
      }
      let id: string;
      try {
        id = await projects.importBundleBytes(bytes, file.name, args.language ? { locale: args.language as string } : undefined);
      } catch (err) {
        throw new ToolError(`The file could not be imported: ${messageOf(err)}`);
      }
      // The languages the reader could have been asked about.
      let languages: string[] = [];
      try {
        languages = bundleLanguages(bytes).languages;
      } catch {
        // The import read the archive its own way.
      }
      await sleep(50);
      const laidOut = await whenSettled(host, { signal });
      return { project: id, opened: bookIdentity(host), ...(languages.length > 1 ? { languages } : {}), laidOut, book: bookPagesSummary(host) };
    },
  };

  /** The PDF or the EPUB of the book as it is now: the tab is shown, and
   *  its file written again when the book changed since. */
  const generated = async (tab: Extract<ViewportTab, 'pdf' | 'epub'>, signal?: AbortSignal): Promise<{ bytes: Uint8Array; name: string; mime: string }> => {
    if (store.getSnapshot().activeViewport !== tab) await dispatchAndWait(host, { type: 'SET_VIEWPORT', payload: tab });
    const controls = await controlsOf(tab);
    const deadline = Date.now() + GENERATE_TIMEOUT_MS;
    const idle = async (): Promise<void> => {
      // The tab's state follows its last render.
      await sleep(80);
      while (controls.status().generating) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (Date.now() > deadline) throw new ToolError(`The ${tab.toUpperCase()} is taking more than ${GENERATE_TIMEOUT_MS / 60_000} minutes; it is still being written in the ${tab} tab.`);
        await sleep(200);
      }
    };
    await whenSettled(host, { signal });
    await idle();
    let status = controls.status();
    if (status.stale || status.error || !controls.file?.()) {
      await controls.regenerate();
      await idle();
      status = controls.status();
    }
    if (status.error) throw new ToolError(`The ${tab.toUpperCase()} could not be written: ${status.error}`);
    const file = controls.file?.();
    if (!file) throw new ToolError(`The ${tab.toUpperCase()} was not written.`);
    return file;
  };

  const exportBook: WebMcpTool = {
    name: 'sandbox_export',
    title: 'Sandbox: export the book',
    description: "Write the book on screen to a file: pdf (the chapter on screen or the whole book, print-ready), epub (reflowable, or fixed to the printed pages), postext (the whole project in one archive, to open again or hand to the postext command line), docx (Word or Google Docs, editable flowing text: semantic, content only in plain styles, or formatted, the same text with the book's design; edited there, it comes back through sandbox_apply_word_edits), idml (the whole book as an InDesign Markup package, laid out as the PDF is: lines kept or left to InDesign, pictures embedded or linked, the fonts beside it on request), html (the whole book as one page, its pictures and fonts inside), markdown (the chapter's source) or config (the design settings as JSON). A postext archive can also be written of a book that is not on screen (book): a project as it was last saved, or a sample as it ships, in one of its languages. A pdf, an epub or an html of a project (book, or the project on screen for an html) is written as its row of the Books panel writes it (postext 1.81): the whole book, in the language asked for, laid out apart from the book on screen, which is saved first and left as it is. The file is downloaded by the reader's browser, or — pdf, epub, html, docx and idml — handed back base64-encoded with deliver: \"data\". Exporting a pdf or an epub of the book on screen shows that viewer tab.",
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['pdf', 'epub', 'html', 'postext', 'docx', 'idml', 'markdown', 'config'] },
        scope: { type: 'string', enum: ['chapter', 'book'], description: 'pdf, docx: the chapter on screen or the whole book (default: as the PDF tab stands; docx: book).' },
        epubLayout: { type: 'string', enum: ['reflowable', 'fixed'], description: 'epub: the rendition (default: as the EPUB tab stands).' },
        chapter: { type: ['integer', 'string'], description: 'markdown: the chapter (position from 1, title or id); the one on screen when left out.' },
        deliver: { type: 'string', enum: ['download', 'data'], description: 'download (default) saves the file through the browser; data hands a pdf, an epub, an html, a docx or an idml back in the result.' },
        book: {
          type: 'object',
          description: 'postext, pdf, epub, html: another book than the one on screen, exported without opening it, as its row of the Books panel does. A sample is exported as it ships, not with the reader\'s edits (open it, or duplicate it, to export those); a pdf, an epub or an html is written of a project only.',
          properties: {
            kind: { type: 'string', enum: ['sample', 'project'] },
            id: { type: 'string', description: 'The id, as sandbox_list_books gives it.' },
            language: { type: 'string', description: 'postext: a sample in several languages, the one to export (the one on screen when the sample is on screen, else the interface language). pdf, epub, html: the edition of the project to write (the one it opens with by default).' },
          },
          required: ['kind', 'id'],
          additionalProperties: false,
        },
        variant: VARIANT_PARAM,
        ...IDML_EXPORT_PARAMS,
      },
      required: ['format'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      const format = args.format as string;
      const deliver = (args.deliver as string | undefined) ?? 'download';
      if (deliver === 'data' && format !== 'pdf' && format !== 'epub' && format !== 'html' && format !== 'docx' && format !== 'idml') {
        throw new ToolError(`Only a pdf, an epub, an html, a docx or an idml is handed back as data. The ${format} is downloaded; its content is also at hand through ${format === 'markdown' ? 'sandbox_read_text' : format === 'config' ? 'sandbox_get_config' : 'the download'}.`);
      }
      if (args.book !== undefined && format !== 'postext' && !compilesFromLibrary(format, args)) {
        throw new ToolError(`"book" goes with format "postext", "pdf", "epub" or "html". A ${format} is written of the book on screen: open the other one first with sandbox_open_book.`);
      }
      if (args.variant !== undefined && format !== 'docx') throw new ToolError('"variant" goes with format "docx".');
      const stray = format === 'idml' ? undefined : Object.keys(IDML_EXPORT_PARAMS).find((k) => args[k] !== undefined);
      if (stray) throw new ToolError(`"${stray}" goes with format "idml".`);
      if (compilesFromLibrary(format, args) || format === 'pdf' || format === 'epub') {
        let file: { name: string; bytes: Uint8Array; mime: string };
        let about = {};
        if (compilesFromLibrary(format, args)) {
          ({ file, about } = await compileFromLibrary(host, args, format));
        } else {
          if (format === 'pdf' && args.scope !== undefined && args.scope !== s.pdfScope) await dispatchAndWait(host, { type: 'SET_PDF_SCOPE', payload: args.scope as 'chapter' | 'book' });
          if (format === 'epub' && args.epubLayout !== undefined && args.epubLayout !== s.epubLayout) await dispatchAndWait(host, { type: 'SET_EPUB_LAYOUT', payload: args.epubLayout as 'fixed' | 'reflowable' });
          file = await generated(format as 'pdf' | 'epub', signal);
        }
        const answer = { format, file: file.name, bytes: file.bytes.byteLength, mimeType: file.mime, ...about };
        if (deliver === 'data') {
          if (file.bytes.byteLength > MAX_DATA_BYTES) throw new ToolError(`The ${format} is ${Math.round(file.bytes.byteLength / 1048576)} MB, too large to hand back in a result; ask for it as a download.`);
          return { ...answer, base64: toBase64(file.bytes) };
        }
        downloadBytes(file.bytes, file.name, file.mime);
        return { ...answer, downloaded: true };
      }
      switch (format) {
        case 'postext': {
          const other = args.book as { kind: 'sample' | 'project'; id: string; language?: string } | undefined;
          let target: DuplicateSource | undefined;
          let name = bookName();
          if (other?.kind === 'project') {
            const project = s.projects.find((p) => p.id === other.id);
            if (!project) throw new ToolError(`No project with id ${JSON.stringify(other.id)}. The projects: ${s.projects.map((p) => `${p.id} (${p.name})`).join(', ') || 'none'}.`);
            if (other.language !== undefined) throw new ToolError('A project exports all its languages in one archive; "language" picks among those of a sample.');
            target = { kind: 'project', id: project.id };
            name = project.name;
          } else if (other) {
            const preset = s.presetSummaries.find((p) => p.id === other.id);
            if (!preset) throw new ToolError(`No sample with id ${JSON.stringify(other.id)}. The samples: ${s.presetSummaries.map((p) => p.id).join(', ')}.`);
            if (!preset.available) throw new ToolError('That sample cannot be loaded right now (its files did not answer).');
            const language = other.language ?? languageOnScreen(s, preset.id) ?? undefined;
            target = { kind: 'preset', id: preset.id, ...(language ? { locale: language } : {}) };
            name = preset.name;
          }
          try {
            await projects.exportProject(target);
          } catch (err) {
            throw new ToolError(`The book could not be exported: ${messageOf(err)}`);
          }
          // What the archive had to leave out is said in the Books panel's notice.
          await sleep(50);
          const notice = store.getSnapshot().projectNotice;
          return {
            format,
            downloaded: true,
            file: `${slugify(name) || 'project'}.postext`,
            ...(other ? { book: other } : {}),
            ...(notice ? { notice } : {}),
          };
        }
        case 'docx':
          return exportWordFile(host, args, bookName(), MAX_DATA_BYTES);
        case 'idml':
          return exportIdmlFile(host, args, bookName(), MAX_DATA_BYTES, signal);
        case 'markdown': {
          const { chapter } = chapterOf(s, args.chapter);
          const file = `${slugify(chapter.title) || 'document'}.md`;
          exportMarkdownFile(chapter.id === s.activeChapterId ? s.markdown : chapter.markdown, file);
          return { format, downloaded: true, file };
        }
        case 'config':
          exportConfigToJson(s.config);
          return { format, downloaded: true, file: 'postext-config.json' };
        default:
          throw new ToolError(`Unknown format ${JSON.stringify(format)}.`);
      }
    },
  };

  return [listBooks, openBook, saveBook, deleteBook, importBook, exportBook];
}

/** The tool that answers what the Sandbox asks or tells the reader about
 *  their books. */
export function answerTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;

  const answer: WebMcpTool = {
    name: 'sandbox_answer',
    title: 'Sandbox: answer a question or a notice',
    description: "Answer the dialog the Sandbox opens when a link names a book the reader already has their own version of (sandbox_get_state reports it as question, and ready stays false until it is answered): replaceCopy: false opens the reader's version, as closing the dialog does; replaceCopy: true replaces it with the published one, which deletes their copy and its changes for good — ask the reader first. dismissNotice: true clears the message of the Books panel (notice in sandbox_get_state). Answers with the book on screen afterwards and its pages.",
    inputSchema: {
      type: 'object',
      properties: {
        replaceCopy: { type: 'boolean', description: 'The answer to the pending question: true replaces the reader\'s version with the published book, false keeps theirs.' },
        dismissNotice: { type: 'boolean', description: 'Clear the notice of the Books panel.' },
      },
      additionalProperties: false,
    },
    annotations: { consequentialHint: true },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      if (args.replaceCopy === undefined && args.dismissNotice !== true) {
        throw new ToolError('Nothing to answer: give replaceCopy (true or false) for a pending question, or dismissNotice: true for the notice.');
      }
      const out: Record<string, unknown> = {};
      const question = pendingQuestion(s);
      if (args.replaceCopy !== undefined) {
        if (!question) throw new ToolError('The Sandbox is not asking anything. sandbox_get_state reports a pending question as "question".');
        out.answered = { about: question.about, id: question.id, name: question.name, replaced: args.replaceCopy === true };
      }
      if (args.dismissNotice === true) {
        out.dismissed = s.projectNotice;
        if (s.projectNotice !== null) await dispatchAndWait(host, { type: 'SET_PROJECT_NOTICE', payload: null });
      }
      if (args.replaceCopy !== undefined) {
        store.answerBundleReplace(args.replaceCopy === true);
        // The book the link names opens once the question is answered.
        await sleep(50);
        const laidOut = await whenSettled(host, { signal });
        return { ...out, onScreen: bookIdentity(host), laidOut, book: bookPagesSummary(host) };
      }
      return { ...out, onScreen: bookIdentity(host), laidOut: isSettled(host) };
    },
  };

  return [answer];
}
