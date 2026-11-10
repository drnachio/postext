// Word manuscripts: the import dialog of the Manuscript panel as a tool
// (the style mapping, the options, the quality report, where the text
// goes), and the import templates the browser keeps.

import { defaultResourceTypes } from 'postext';
import type { PostextConfig } from 'postext';
import {
  DocxReadError,
  analyzeDocx,
  calloutStylesOf,
  characterTargetOf,
  chipStylesOf,
  characterStylesOf,
  emptyTemplate,
  isExportedDocx,
  lookup,
  newTemplateId,
  parseTemplate,
  readDocx,
  templateFile,
  type CharacterTarget,
  type ParagraphTarget,
  type StyleTracking,
  type WordDocument,
  type WordImportOptions,
  type WordTemplate,
} from 'postext/word';
import { wordCount } from '../../book/chapterOps.js';
import type { SandboxLabels } from '../../types/index.js';
import type { SandboxAction } from '../../context/SandboxContext.js';
import { downloadBytes } from '../../storage/persistence.js';
import {
  FINDING_LABEL,
  convertWordDocument,
  counted,
  defaultWordDestination,
  importedResources,
  loadLastTemplateId,
  loadTemplates,
  materializedTemplate,
  paragraphTargetByName,
  removeTemplate,
  saveLastTemplateId,
  storeTemplate,
  trackingTargetName,
  wordImportActions,
  wordTrackingPlan,
  type WordTrackingPlan,
  type WordDestination,
} from '../../word/sandboxImport.js';
import { chapterText, editChapter } from '../chapterEdits.js';
import { chapterOf, dispatchAndWait, type SandboxToolHost } from '../host.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';
import { CHAPTER_PARAM, UNDO_HINT, WAIT_PARAM, fileParam, layoutAnswer } from './book.js';
import { readFileInput, type FileInput } from './resources.js';

/** Most of the converted Markdown a dry run hands back, as much as the
 *  dialog's preview shows. */
const PREVIEW_LIMIT = 6000;
const PREVIEW_DEFAULT = 2000;

const PARAGRAPH_KINDS = 'body, heading (level 1–6, style: a heading style id), paragraphs (style: a paragraph style id), verse (style optional), callout and calloutTitle (type: a callout type id), quote, caption, chapter (starts a chapter titled with the paragraph), markup (Postext Markdown kept as written) and drop';
const CHARACTER_KINDS = 'text, bold, italic, boldItalic, smallCaps, sup, sub, chip (style: a chip style id), markup and drop';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const describeTemplate = (t: WordTemplate): Record<string, unknown> => ({
  id: t.id,
  name: t.name,
  updated: new Date(t.updatedAt).toISOString(),
  paragraphStyles: Object.keys(t.paragraphs).length,
  characterStyles: Object.keys(t.characters).length,
});

const savedList = (list: readonly WordTemplate[]): string => list.map((t) => `${t.id} (${t.name})`).join(', ') || 'none';

/** The entries of `given` that {@link parseTemplate} did not keep. */
function refused(given: unknown, kept: Record<string, unknown>): string[] {
  return isRecord(given) ? Object.keys(given).filter((k) => !(k in kept)) : [];
}

/** A template handed over as JSON, read as the dialog reads an uploaded
 *  one; the entries it cannot use are named rather than dropped. */
function templateFrom(value: unknown, what: string): WordTemplate {
  const parsed = parseTemplate(value);
  if (!parsed) throw new ToolError(`${what} is not an import template: it needs "paragraphs" and/or "characters", each a map from a Word style name to what it becomes.`);
  const source = isRecord(value) && isRecord(value.postextWordTemplate) ? value.postextWordTemplate : value as Record<string, unknown>;
  const badParagraphs = refused(source.paragraphs, parsed.paragraphs);
  const badCharacters = refused(source.characters, parsed.characters);
  if (badParagraphs.length > 0) throw new ToolError(`${what}: the paragraph style(s) ${badParagraphs.map((n) => JSON.stringify(n)).join(', ')} map to nothing the import knows. A paragraph style becomes { kind } with kind one of ${PARAGRAPH_KINDS}.`);
  if (badCharacters.length > 0) throw new ToolError(`${what}: the character style(s) ${badCharacters.map((n) => JSON.stringify(n)).join(', ')} map to nothing the import knows. A character style becomes { kind } with kind one of ${CHARACTER_KINDS}.`);
  return parsed;
}

/** Refuse a mapping that names a style the book does not have: the
 *  dialog offers the book's own styles only. */
function checkTargets(mapping: Pick<WordTemplate, 'paragraphs' | 'characters'>, config: PostextConfig): void {
  const ids = (list: readonly { id: string }[] | undefined): string[] => (list ?? []).map((x) => x.id);
  const need = (name: string, id: string | undefined, known: string[], what: string): void => {
    if (id === undefined || known.includes(id)) return;
    throw new ToolError(`mapping: ${JSON.stringify(name)} names the ${what} ${JSON.stringify(id)}, which the book does not have. Its ${what}s: ${known.join(', ') || 'none'}.`);
  };
  for (const [name, t] of Object.entries(mapping.paragraphs)) {
    if (t.kind === 'heading') need(name, t.style, ids(config.headingStyles), 'heading style');
    if (t.kind === 'paragraphs' || t.kind === 'verse') need(name, t.style, ids(config.paragraphStyles), 'paragraph style');
    if (t.kind === 'callout' || t.kind === 'calloutTitle') need(name, t.type, ids(calloutStylesOf(config)), 'callout type');
  }
  for (const [name, t] of Object.entries(mapping.characters)) {
    if (t.kind === 'chip') need(name, t.style, ids(chipStylesOf(config)), 'chip style');
    if (t.kind === 'charStyle') need(name, t.style, ids(characterStylesOf(config)), 'character style');
  }
}

/** `base` with `over` laid on top; style names are compared without case,
 *  so an entry of `over` takes the place of the one it names. */
function overlaid<T>(base: Record<string, T>, over: Record<string, T>): Record<string, T> {
  const names = new Set(Object.keys(over).map((k) => k.trim().toLowerCase()));
  const kept = Object.entries(base).filter(([k]) => !names.has(k.trim().toLowerCase()));
  return { ...Object.fromEntries(kept), ...over };
}

/** What the character spacing of the Word styles does (or would): the
 *  styles it is set on and the ones the book keeps as they are. */
function spacingAnswer(plan: WordTrackingPlan, on: boolean, config: PostextConfig, labels: SandboxLabels): Record<string, unknown> {
  if (plan.applied.length + plan.skipped.length === 0) return {};
  const entry = (t: StyleTracking) => ({ style: t.style, goesTo: trackingTargetName(t, config, labels), em: t.letterSpacing.value });
  return {
    characterSpacing: {
      taken: on && plan.applied.length > 0,
      ...(plan.applied.length > 0 ? { setOn: plan.applied.map(entry) } : {}),
      ...(plan.skipped.length > 0 ? { leftAsTheBookHasIt: plan.skipped.map(entry) } : {}),
    },
  };
}

export function wordTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;

  const importWord: WebMcpTool = {
    name: 'sandbox_import_word',
    title: 'Sandbox: import a Word document',
    description: "Bring a Word manuscript (.docx) into the book, as the Manuscript panel's Word import does: each Word style becomes a Postext construct (headings, paragraph styles, callouts, quotes, verse, captions; bold, italic, chips…), lists and footnotes are kept, pictures and tables become resources placed where they were. Run it first with dryRun: true — it changes nothing and answers with the quality report of the document, every style it uses with what each would become, the chapters and resources it would make, and the start of the Markdown; then correct what a style becomes with mapping, or the options, and run it for real. destination says where the text goes: chapter replaces a chapter's text (taken back with sandbox_undo_text), append adds new chapters after a chapter, book replaces every chapter of the book, which cannot be undone. Left out, the destination is book for a document the Sandbox exported as a whole book and chapter otherwise. A .docx exported from the Sandbox (sandbox_export, format docx) and edited in Word comes back through sandbox_apply_word_edits instead. For Markdown text, sandbox_write_text; for a .postext book, sandbox_import_book.",
    inputSchema: {
      type: 'object',
      properties: {
        file: fileParam('The .docx file: where to fetch it (url) or its bytes (base64). A .doc file must be saved as .docx first.'),
        dryRun: { type: 'boolean', description: 'Change nothing: answer with the report, the mapping of every style, and what the import would make.' },
        destination: { type: 'string', enum: ['chapter', 'append', 'book'], description: 'chapter: the whole document replaces one chapter\'s text. append: new chapters after one chapter, a new chapter at every level-1 heading, the first one shown. book: every chapter of the book is replaced, a new chapter at every level-1 heading.' },
        chapter: { ...CHAPTER_PARAM, description: 'chapter, append: the chapter to replace, or the one the new chapters follow (position from 1, title or id). The chapter on screen when left out.' },
        template: { type: ['string', 'object'], description: 'The mapping to start from: the id of a saved template (sandbox_word_templates lists them), "embedded" (the one a .docx exported by earlier versions of the Sandbox carries), "auto" (none: every style is guessed from its name and its Word role) or a template object { paragraphs, characters, options }. Left out, as the dialog opens: the embedded one, else the template last used, else auto.' },
        mapping: {
          type: 'object',
          description: `What Word styles become, by style name, on top of the template. paragraphs: { "<style name>": { kind, … } } with kind one of ${PARAGRAPH_KINDS}. characters: { "<style name>": { kind, … } } with kind one of ${CHARACTER_KINDS}. The dry run lists the names and what each becomes, in this shape.`,
          properties: { paragraphs: { type: 'object' }, characters: { type: 'object' } },
          additionalProperties: false,
        },
        lineBreaks: { type: 'string', enum: ['break', 'space', 'paragraph'], description: 'Soft returns (Shift+Enter) inside a paragraph: a forced line break (the default), a space, or a new paragraph.' },
        directFormatting: { type: 'string', enum: ['keep', 'ignore'], description: 'Bold, italic, small caps and scripts set by hand on runs: kept (the default) or left out.' },
        manualHeadings: { type: 'integer', minimum: 0, maximum: 6, description: 'Short bold paragraphs in body text (headings typed by hand) become headings of this level; 0 (the default) keeps them as paragraphs.' },
        pageBreaks: { type: 'string', enum: ['drop', 'keep'], description: 'Page breaks typed in Word: dropped (the default; the design decides where pages turn) or kept as :::pagebreak.' },
        images: { type: 'boolean', description: 'Pictures become resources placed where they were (default true).' },
        tables: { type: 'boolean', description: 'Tables become table resources placed where they were (default true).' },
        characterSpacing: { type: 'boolean', description: "The character spacing (letter-spacing) of the Word styles in use is put, in em, on the book's paragraph styles, heading styles, heading levels and callout titles they map to, where the book sets none (what it sets itself stays). Default true when there is something to put; the dry run lists it under characterSpacing." },
        saveTemplateAs: { type: 'string', description: 'Also keep the mapping used, with every style of the document written out, as a saved template of this name (the dialog\'s "Save as"); it becomes the template last used. Not on a dry run.' },
        previewCharacters: { type: 'integer', minimum: 0, maximum: PREVIEW_LIMIT, description: `dryRun: how much of the converted Markdown to answer with (default ${PREVIEW_DEFAULT}).` },
        wait: WAIT_PARAM,
      },
      required: ['file'],
      additionalProperties: false,
    },
    annotations: { consequentialHint: true, untrustedContentHint: true },
    execute: async (args, { signal }) => {
      const dryRun = args.dryRun === true;
      const saveAs = (args.saveTemplateAs as string | undefined)?.trim();
      if (dryRun && args.saveTemplateAs !== undefined) throw new ToolError('A dry run changes nothing: leave saveTemplateAs for the real run.');
      if (args.saveTemplateAs !== undefined && !saveAs) throw new ToolError('saveTemplateAs needs a name.');

      const file = await readFileInput(args.file as FileInput, signal);
      const bytes = new Uint8Array(await file.arrayBuffer());
      // A document the Sandbox exported comes back by its marks (#1397).
      if (isExportedDocx(bytes)) {
        throw new ToolError(`${file.name} was exported from the Sandbox: sandbox_apply_word_edits takes the changes made in it back into the book, each where it belongs.`);
      }
      let doc: WordDocument;
      try {
        doc = readDocx(bytes);
      } catch (err) {
        if (!(err instanceof DocxReadError)) console.error(err);
        throw new ToolError(`${file.name} could not be read as a Word document${err instanceof DocxReadError ? ` (${err.message})` : ''}. It must be a .docx file: a .doc is saved as .docx from Word first.`);
      }

      const s = store.getSnapshot();
      const { config, labels } = s;

      // The mapping the dialog would open on, then what the call changes of it.
      const saved = loadTemplates();
      const embedded = parseTemplate(doc.embeddedTemplate);
      let base: WordTemplate;
      let from: Record<string, unknown>;
      let savedId: string | null = null;
      const wanted = args.template;
      if (isRecord(wanted)) {
        base = templateFrom(wanted, 'template');
        from = { source: 'given' };
      } else if (wanted === 'auto') {
        base = emptyTemplate();
        from = { source: 'auto' };
      } else if (wanted === 'embedded' || (wanted === undefined && embedded)) {
        if (!embedded) throw new ToolError(`${file.name} carries no template: only a .docx exported by an earlier version of the Sandbox does. Name a saved template (${savedList(saved)}), or "auto".`);
        base = { ...embedded, id: '', name: labels.wordTemplateEmbedded };
        from = { source: 'embedded' };
      } else {
        const id = (wanted as string | undefined) ?? loadLastTemplateId();
        const found = id ? saved.find((t) => t.id === id) : undefined;
        if (!found && wanted !== undefined) throw new ToolError(`No saved Word template with id ${JSON.stringify(wanted)}. The saved ones: ${savedList(saved)}. "auto" guesses every style, "embedded" takes the one the document carries.`);
        base = found ?? emptyTemplate();
        from = found ? { source: 'saved', id: found.id, name: found.name } : { source: 'auto' };
        savedId = found?.id ?? null;
      }
      const mapping = args.mapping === undefined
        ? { paragraphs: {}, characters: {} }
        : templateFrom({ paragraphs: {}, characters: {}, ...(args.mapping as object) }, 'mapping');
      checkTargets(mapping, config);
      const options: WordImportOptions = { ...base.options };
      if (args.lineBreaks !== undefined) options.lineBreaks = args.lineBreaks as WordImportOptions['lineBreaks'];
      if (args.directFormatting !== undefined) options.directFormatting = args.directFormatting as WordImportOptions['directFormatting'];
      if (args.manualHeadings !== undefined) options.manualHeadings = args.manualHeadings as number;
      if (args.pageBreaks !== undefined) options.pageBreaks = args.pageBreaks as WordImportOptions['pageBreaks'];
      if (args.images !== undefined) options.images = args.images as boolean;
      if (args.tables !== undefined) options.tables = args.tables as boolean;
      const working: WordTemplate = {
        ...base,
        paragraphs: overlaid<ParagraphTarget>(base.paragraphs, mapping.paragraphs),
        characters: overlaid<CharacterTarget>(base.characters, mapping.characters),
        options,
      };

      const destination = (args.destination as WordDestination | undefined) ?? defaultWordDestination(doc, working, config);
      if (destination === 'book' && args.chapter !== undefined) throw new ToolError('destination "book" replaces every chapter: "chapter" goes with chapter or append.');
      const target = destination === 'book' ? null : chapterOf(s, args.chapter);

      const report = analyzeDocx(doc, working, config);
      const spacing = wordTrackingPlan(doc, working, config);
      const takeSpacing = (args.characterSpacing as boolean | undefined) ?? spacing.applied.length > 0;
      const spacingPatch = takeSpacing ? spacing.patch : {};
      const result = convertWordDocument(doc, {
        template: working,
        config,
        destination,
        existingIds: new Set(s.resources.map((r) => r.id)),
        untitledChapter: labels.wordUntitledChapter,
      });
      if (result.chapters.length === 0) throw new ToolError(`${file.name} holds no text to import.`);

      // Mapped styles the document does not use: most likely a name mistyped.
      const unused = [
        ...Object.keys(mapping.paragraphs).filter((n) => lookup(Object.fromEntries(report.paragraphStyles.map((u) => [u.name, true])), n) === undefined),
        ...Object.keys(mapping.characters).filter((n) => lookup(Object.fromEntries(report.characterStyles.map((u) => [u.name, true])), n) === undefined),
      ];
      const about = {
        file: file.name,
        ...(doc.title ? { title: doc.title } : {}),
        template: from,
        destination,
        ...(target ? { chapter: target.index + 1 } : {}),
        ...(unused.length > 0 ? { notes: [`mapping names ${unused.map((n) => JSON.stringify(n)).join(', ')}, which the document does not use: nothing changed for ${unused.length === 1 ? 'it' : 'them'}.`] } : {}),
      };
      const quality = {
        verdict: report.verdict,
        says: report.verdict === 'clean' ? labels.wordVerdictClean : report.verdict === 'mixed' ? labels.wordVerdictMixed : labels.wordVerdictPlain,
        paragraphs: report.paragraphs,
        styledParagraphs: report.styled,
        pictures: report.pictures,
        tables: report.tables,
        footnotes: report.footnotes,
        findings: report.findings.map((f) => ({
          id: f.id,
          severity: f.severity,
          count: f.count,
          says: counted(labels, FINDING_LABEL[f.id], f.count),
          ...(f.examples.length > 0 ? { examples: f.examples } : {}),
        })),
      };
      const made = {
        chapters: result.chapters.map((c) => ({ title: c.title, characters: c.markdown.length, words: wordCount(c.markdown) })),
        resources: [
          ...result.pictures.map((p) => ({ id: p.id, kind: 'picture', mediaType: p.media.contentType, ...(p.caption ? { caption: p.caption } : {}) })),
          ...result.tables.map((t) => ({ id: t.id, kind: 'table', rows: t.model.rows.length, ...(t.caption ? { caption: t.caption } : {}) })),
        ],
        ...(result.skippedPictures.length > 0 ? { skippedPictures: result.skippedPictures } : {}),
        ...(result.droppedHeadingNotes > 0 ? { droppedHeadingNotes: result.droppedHeadingNotes } : {}),
      };

      if (dryRun) {
        const limit = (args.previewCharacters as number | undefined) ?? PREVIEW_DEFAULT;
        const markdown = result.chapters.map((c) => c.markdown).join('\n\n');
        return {
          dryRun: true,
          ...about,
          options,
          quality,
          paragraphStyles: report.paragraphStyles.map((u) => ({ name: u.name, uses: u.count, ...(u.sample ? { sample: u.sample } : {}), becomes: paragraphTargetByName(doc, u.name, working, config) })),
          characterStyles: report.characterStyles.map((u) => ({ name: u.name, uses: u.count, ...(u.sample ? { sample: u.sample } : {}), becomes: characterTargetOf(doc, u.name, working, config) })),
          ...made,
          ...spacingAnswer(spacing, takeSpacing, config, labels),
          preview: markdown.slice(0, limit),
          ...(markdown.length > limit ? { previewOf: markdown.length } : {}),
        };
      }

      // The import itself, as the dialog's Import button runs it: the
      // resources first, then the text where it goes.
      const types = config.resourceTypes ?? defaultResourceTypes(s.locale);
      const created = await importedResources(result, types);
      const resources: SandboxAction[] = created.map((r) => ({ type: 'UPSERT_RESOURCE', payload: r }));
      const styles: SandboxAction[] = Object.keys(spacingPatch).length > 0 ? [{ type: 'UPDATE_CONFIG', payload: spacingPatch }] : [];
      let chapters: Record<string, unknown>[];
      let changed = true;
      if (destination === 'chapter') {
        if (resources.length + styles.length > 0) await dispatchAndWait(host, [...styles, ...resources]);
        const before = chapterText(store.getSnapshot(), target!.chapter.id);
        if (before === null) throw new ToolError('That chapter is no longer in the book.');
        const markdown = result.chapters[0]!.markdown;
        // One edit, so that sandbox_undo_text puts the chapter's text back.
        changed = await editChapter(host, target!.chapter.id, before, markdown);
        chapters = [{ chapter: target!.index + 1, title: target!.chapter.title, characters: markdown.length }];
      } else {
        const now = store.getSnapshot();
        const placed = wordImportActions(result, destination, { chapters: now.chapters, activeChapterId: target?.chapter.id ?? now.activeChapterId }, spacingPatch);
        const after = await dispatchAndWait(host, [...resources, ...placed]);
        const ids = placed.flatMap((a) => (a.type === 'ADD_CHAPTER' ? [a.payload.chapter.id] : a.type === 'SET_BOOK' ? a.payload.chapters.map((c) => c.id) : []));
        chapters = after.chapters.flatMap((c, i) => (ids.includes(c.id) ? [{ chapter: i + 1, id: c.id, title: c.title, characters: c.markdown.length }] : []));
      }
      if (savedId) saveLastTemplateId(savedId);
      let templateSaved: Record<string, unknown> | undefined;
      if (saveAs) {
        const template: WordTemplate = { ...materializedTemplate(doc, working, report, config), id: newTemplateId(), name: saveAs, updatedAt: Date.now() };
        const { kept } = storeTemplate(template);
        saveLastTemplateId(template.id);
        templateSaved = { id: template.id, name: template.name, ...(kept ? {} : { kept: false, note: labels.wordTemplateStorageFailed }) };
      }
      return {
        imported: true,
        ...about,
        changed,
        chapters,
        resources: created.map((r) => r.id),
        ...(made.skippedPictures ? { skippedPictures: made.skippedPictures } : {}),
        ...(made.droppedHeadingNotes ? { droppedHeadingNotes: made.droppedHeadingNotes } : {}),
        verdict: report.verdict,
        ...(Object.keys(spacingPatch).length > 0 ? spacingAnswer(spacing, true, config, labels) : {}),
        ...(templateSaved ? { templateSaved } : {}),
        ...(destination === 'chapter' && changed ? { undo: UNDO_HINT } : {}),
        ...(await layoutAnswer(host, args.wait, signal)),
      };
    },
  };

  const templates: WebMcpTool = {
    name: 'sandbox_word_templates',
    title: 'Sandbox: the Word import templates',
    description: "The Word import templates kept in this browser, the ones the import dialog offers: a template says what each Word style becomes ({ name, paragraphs: { \"<style name>\": { kind, … } }, characters: { … }, options }) and is used by sandbox_import_word. list names them and says which was used last; get answers with one whole (and, with download, saves it as a .postext-word.json file through the browser); save keeps a template — the one whose id it carries is replaced, any other is added under a new id and becomes the one last used; delete removes one and answers with it, so it can be saved back.",
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'get', 'save', 'delete'] },
        id: { type: 'string', description: 'get, delete: the template.' },
        template: { type: 'object', description: `save: the template, as get gives it or as a .postext-word.json file holds it. paragraphs maps a Word style name to { kind } with kind one of ${PARAGRAPH_KINDS}; characters to { kind } with kind one of ${CHARACTER_KINDS}; options takes lineBreaks, directFormatting, manualHeadings, pageBreaks, images and tables.` },
        name: { type: 'string', description: 'save: the name to keep it under, when the template carries none or another is wanted.' },
        download: { type: 'boolean', description: 'get: also save the template as a JSON file through the browser, as the dialog\'s download does.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    annotations: { untrustedContentHint: true },
    execute: (args) => {
      const saved = loadTemplates();
      const byId = (): WordTemplate => {
        if (args.id === undefined) throw new ToolError(`${args.action as string} needs the id of a template. The saved ones: ${savedList(saved)}.`);
        const found = saved.find((t) => t.id === args.id);
        if (!found) throw new ToolError(`No saved Word template with id ${JSON.stringify(args.id)}. The saved ones: ${savedList(saved)}.`);
        return found;
      };
      switch (args.action) {
        case 'list': {
          const last = loadLastTemplateId();
          return { templates: saved.map(describeTemplate), ...(last && saved.some((t) => t.id === last) ? { lastUsed: last } : {}) };
        }
        case 'get': {
          const template = byId();
          if (args.download === true) {
            const file = `${template.name.replace(/[^\p{L}\p{N}._-]+/gu, '-') || 'template'}.postext-word.json`;
            downloadBytes(templateFile(template), file, 'application/json');
            return { template, downloaded: file };
          }
          return { template };
        }
        case 'save': {
          if (args.template === undefined) throw new ToolError('save needs the template: { name, paragraphs, characters, options }.');
          const parsed = templateFrom(args.template, 'template');
          const existing = parsed.id ? saved.find((t) => t.id === parsed.id) : undefined;
          const name = (args.name as string | undefined)?.trim() || parsed.name.trim() || existing?.name;
          if (!name) throw new ToolError('The template has no name: give one as "name".');
          const template: WordTemplate = { ...parsed, id: existing ? existing.id : newTemplateId(), name, updatedAt: Date.now() };
          const { kept } = storeTemplate(template);
          if (!kept) throw new ToolError('The browser did not keep the template (its storage is full or closed to this page).');
          if (!existing) saveLastTemplateId(template.id);
          return { saved: describeTemplate(template), replaced: existing !== undefined };
        }
        case 'delete': {
          const template = byId();
          const { kept } = removeTemplate(template.id);
          if (!kept) throw new ToolError('The browser did not let the template go (its storage is closed to this page).');
          if (loadLastTemplateId() === template.id) saveLastTemplateId(null);
          return { deleted: template };
        }
        default:
          throw new ToolError(`Unknown action ${JSON.stringify(args.action)}.`);
      }
    },
  };

  return [importWord, templates];
}
