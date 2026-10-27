// The Settings panel's actions that change more than one setting, or
// something outside the configuration (#1181): renaming and removing a
// named item with its uses, the language defaults, the print profile and a
// template saved from a laid page.

import {
  DEFAULT_CALLOUT_STYLES,
  DEFAULT_CHIP_STYLES,
  DEFAULT_EXERCISE_STYLES,
  DEFAULT_MARK_STYLES,
  parseIccProfile,
  resolveComicsConfig,
  resolvePageTemplate,
} from 'postext';
import type { ComicsConfig, PostextConfig, Resource } from 'postext';
import { arabicDefaults, isArabicScriptLanguage } from '../../context/arabicDefaults.js';
import { chineseDefaults } from '../../context/chineseDefaults.js';
import { japaneseDefaults } from '../../context/japaneseDefaults.js';
import { unlinkPaletteRefs } from '../../context/paletteUtils.js';
import { fetchGoogleFonts } from '../../controls/fonts/FontPicker.js';
import { applyStyleRewrite } from '../../frameStyles/applyRewrite.js';
import { planRename } from '../../frameStyles/styleMerge.js';
import { applyExerciseStyleRename, planExerciseStyleRename } from '../../frameStyles/exerciseRefs.js';
import { removeCalloutStyle } from '../../frameStyles/styleRemove.js';
import { applyLabelStyleRename } from '../../labelStyles/applyRename.js';
import { applyFileResolutions, readFileResolutions } from '../../panels/resources/uploads/fileResolutions.js';
import { pruneComics, removeById, renameById, retargetCast, sanitizeSpeakerId, setComicsField, slugifyStyleId } from '../../sidebar/sections/comics/comicsConfig.js';
import { putBlob } from '../../storage/blobStore.js';
import { pageAreas, templateAreaRect } from '../../templates/frameGeometry.js';
import { renameLookChanges } from '../../templates/frameLooks.js';
import { applyTemplateRewrite, bookChapters } from '../../templates/applyTemplateRewrite.js';
import { planRenameModule } from '../../templates/moduleEdits.js';
import { frameFamily, namesInUse, renameFrame, renameTemplate, slugify, templateAt, templateFromLayout } from '../../templates/templateEdits.js';
import { renameSlotChanges, renameTemplateChanges } from '../../templates/templateUsage.js';
import { FILE_PARAM, readFileInput, type FileInput } from '../fileInput.js';
import { chapterOf, dispatchAndWait, layOutChapter, pageIndexOf, type SandboxToolHost } from '../host.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';
import { CHAPTER_PARAM, WAIT_PARAM, layoutAnswer } from './book.js';

/** The named lists of the design an item is renamed or removed in. */
const LISTS = [
  'calloutStyles', 'labelStyles', 'tableStyles', 'scoreStyles', 'paragraphStyles', 'headingStyles', 'chipStyles', 'markStyles',
  'frameLooks', 'colorPalette', 'pageTemplates', 'templateFrames', 'comics.balloonStyles', 'comics.panelStyles', 'comics.cast', 'exerciseStyles',
] as const;
type DesignList = (typeof LISTS)[number];

/** Lists kept in the configuration as a plain array of `{ id }` items. */
type PlainList = 'paragraphStyles' | 'headingStyles' | 'chipStyles' | 'markStyles' | 'tableStyles' | 'scoreStyles' | 'labelStyles' | 'frameLooks' | 'exerciseStyles';

/** A list as the panel shows it: what the book stores, or the design's
 *  own list when it stores none. */
function listOf(config: PostextConfig, list: PlainList | 'calloutStyles'): { id: string }[] {
  switch (list) {
    case 'calloutStyles': return config.calloutStyles ?? DEFAULT_CALLOUT_STYLES;
    case 'chipStyles': return config.chipStyles ?? DEFAULT_CHIP_STYLES;
    case 'markStyles': return config.markStyles ?? DEFAULT_MARK_STYLES;
    case 'exerciseStyles': return config.exerciseStyles ?? DEFAULT_EXERCISE_STYLES;
    default: return (config[list] as { id: string }[] | undefined) ?? [];
  }
}

function listParam(description: string) {
  return { type: 'string', enum: [...LISTS], description } as const;
}

function noItem(list: string, id: string, ids: readonly string[]): ToolError {
  return new ToolError(`${list} has no item ${JSON.stringify(id)}. Its ids: ${ids.join(', ') || 'none'}.`);
}

/** The file the page fetched or decoded, as bytes. */
async function bytesOf(input: FileInput, signal?: AbortSignal): Promise<{ bytes: ArrayBuffer; name: string }> {
  const file = await readFileInput(input, signal);
  return { bytes: await file.arrayBuffer(), name: file.name };
}

/** The Fontsource subsets of each family, as the font picker lists them
 *  (which design texts a Japanese or Arabic book sets in a face without its
 *  letters); undefined when the list does not come in time. */
async function fontSubsets(): Promise<((family: string) => readonly string[] | undefined) | undefined> {
  const list = await Promise.race([fetchGoogleFonts(), new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
  if (!list) return undefined;
  const byFamily = new Map(list.map((f) => [f.family, f.subsets]));
  return (family) => byFamily.get(family);
}

export function designItemTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;
  const write = (payload: Partial<PostextConfig>) => store.dispatch({ type: 'UPDATE_CONFIG', payload, history: { merge: false } });

  const rename: WebMcpTool = {
    name: 'sandbox_rename_design_item',
    title: 'Sandbox: rename a style, template or frame with its uses',
    description: 'Give a named item of the design another id, and everything that names it the new one, as the Settings panel does: calloutStyles (the :::callout{type} fences, template frames, styles based on it and the box, bank.box and solutions.box of the exercise styles), labelStyles (picture anchors and ::label lines), tableStyles and scoreStyles (the table and score resources that use it), frameLooks (the pieces that name the look), pageTemplates (the ::::page fences; a module: its :::module blocks), templateFrames (a frame or group of template: the slot names of the pages, and the editions a local book keeps aside), comics.balloonStyles (the cast members who speak in it); exerciseStyles (the :::exercise{style} fences and the styles based on it); paragraphStyles, headingStyles, chipStyles, markStyles, comics.panelStyles and comics.cast rename the item only. Through sandbox_set_config the uses would be left naming an item that is gone. The new id is made safe the way the panel makes it (lowercase letters, digits, _ and -). Answers what was rewritten and undoSteps (sandbox_undo that many times takes it back).',
    inputSchema: {
      type: 'object',
      properties: {
        list: listParam('The list the item is in. colorPalette entries keep their id (rename them with sandbox_set_config colorPalette[id=…].name).'),
        id: { type: 'string', description: 'The item\'s id (for templateFrames: the frame or group name).' },
        to: { type: 'string', description: 'The new id.' },
        template: { type: 'string', description: 'For templateFrames: the page template the frame or group belongs to.' },
        wait: WAIT_PARAM,
      },
      required: ['list', 'id', 'to'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const list = String(args.list ?? '') as DesignList;
      if (!(LISTS as readonly string[]).includes(list)) throw new ToolError(`"${list}" is not a list. The lists: ${LISTS.join(', ')}.`);
      const from = String(args.id ?? '');
      const s = store.getSnapshot();
      const { config } = s;
      const chapters = bookChapters(s);
      let answer: Record<string, unknown>;

      const taken = (ids: readonly string[], next: string) => {
        if (!next) throw new ToolError('The new id is empty once made safe (lowercase letters, digits, _ and -).');
        if (next === from) throw new ToolError('The new id is the one it has.');
        if (ids.includes(next)) throw new ToolError(`${JSON.stringify(next)} is taken by another item of ${list}.`);
      };

      if (list === 'colorPalette') {
        throw new ToolError('A palette colour keeps its id: give it another name with sandbox_set_config (colorPalette[id=…].name).');
      } else if (list === 'pageTemplates') {
        const templates = config.pageTemplates ?? [];
        const own = templateAt(templates, from)?.template;
        if (!own) throw noItem(list, from, templates.map((t) => t.id));
        const to = slugify(String(args.to ?? ''));
        taken(templates.map((t) => t.id), to);
        if (own.role === 'module') {
          const plan = planRenameModule(templates, chapters, from, to);
          if (!plan) throw new ToolError('The new id is empty, the same, or taken by another template.');
          const record = applyTemplateRewrite(store.dispatch, plan, s.activeChapterId);
          answer = { renamed: from, to, module: true, blocksRewritten: plan.chapters.reduce((n, c) => n + c.changes.length, 0), undoSteps: record.steps };
        } else {
          const rewrites = chapters.map((c) => ({ chapterId: c.id, changes: renameTemplateChanges(c.markdown, from, to), baseLength: c.markdown.length }));
          const record = applyTemplateRewrite(store.dispatch, { templates: renameTemplate(templates, from, to), chapters: rewrites }, s.activeChapterId);
          answer = { renamed: from, to, pagesRewritten: rewrites.reduce((n, c) => n + c.changes.length, 0), undoSteps: record.steps };
        }
      } else if (list === 'templateFrames') {
        const templates = config.pageTemplates ?? [];
        const templateId = String(args.template ?? '');
        const own = templateAt(templates, templateId)?.template;
        if (!own) throw new ToolError(`Name the page template the frame belongs to (template). The templates: ${templates.map((t) => t.id).join(', ') || 'none'}.`);
        const names = namesInUse(templates, templateId);
        if (!names.has(from)) throw noItem(`Template ${templateId}`, from, [...names]);
        const to = slugify(String(args.to ?? ''));
        taken([...names], to);
        const isGroup = [own, own.variants?.recto, own.variants?.verso].some((p) => p?.groups?.some((g) => g.name === from));
        // A frame's slot names on the pages follow it (#979); a group has none.
        const family = new Set(isGroup ? [] : frameFamily(templates, templateId, from));
        const rewrites = isGroup ? [] : chapters.map((c) => ({ chapterId: c.id, changes: renameSlotChanges(c.markdown, family, from, to), baseLength: c.markdown.length }));
        const record = applyTemplateRewrite(store.dispatch, { templates: renameFrame(templates, templateId, from, to), chapters: rewrites }, s.activeChapterId);
        const editions = !isGroup && s.activeProjectId !== null && store.projectActions
          ? await store.projectActions.renameFrameInEditions(s.activeProjectId, templateId, from, to)
          : 0;
        answer = { renamed: from, to, template: templateId, kind: isGroup ? 'group' : 'frame', slotsRewritten: rewrites.reduce((n, c) => n + c.changes.length, 0), ...(editions ? { editionsRewritten: editions } : {}), undoSteps: record.steps };
      } else if (list.startsWith('comics.')) {
        const raw: ComicsConfig | undefined = config.comics;
        const to = list === 'comics.cast' ? sanitizeSpeakerId(String(args.to ?? '')) : slugifyStyleId(String(args.to ?? ''));
        let next: ComicsConfig | undefined;
        if (list === 'comics.balloonStyles') {
          const ids = resolveComicsConfig(raw, config.locale ?? s.locale).balloonStyles.map((b) => b.id);
          const own = raw?.balloonStyles ?? [];
          if (!own.some((b) => b.id === from)) {
            throw new ToolError(ids.includes(from) ? `${from} is a built-in balloon kind: its id stays.` : noItem(list, from, ids).message);
          }
          taken(ids, to);
          next = setComicsField(setComicsField(raw, 'balloonStyles', renameById(own, from, to)), 'cast', retargetCast(raw?.cast, from, to));
        } else {
          const key = list === 'comics.cast' ? 'cast' : 'panelStyles';
          const items: { id: string }[] = raw?.[key] ?? [];
          if (!items.some((i) => i.id === from)) throw noItem(list, from, items.map((i) => i.id));
          taken(items.map((i) => i.id), to);
          next = setComicsField(raw, key, renameById(items as never[], from, to));
        }
        write({ comics: pruneComics(next) });
        answer = { renamed: from, to, undoSteps: 1 };
      } else {
        const styles = listOf(config, list as PlainList | 'calloutStyles');
        if (!styles.some((i) => i.id === from)) throw noItem(list, from, styles.map((i) => i.id));
        const to = slugifyStyleId(String(args.to ?? ''));
        taken(styles.map((i) => i.id), to);
        if (list === 'calloutStyles') {
          const plan = planRename({ calloutStyles: config.calloutStyles, pageTemplates: config.pageTemplates, exerciseStyles: config.exerciseStyles, exercises: config.exercises }, styles as NonNullable<PostextConfig['calloutStyles']>, chapters, from, to);
          const record = applyStyleRewrite(store.dispatch, { calloutStyles: config.calloutStyles, pageTemplates: config.pageTemplates }, plan, `${from} → ${to}`, s.activeChapterId);
          answer = { renamed: from, to, fencesRewritten: plan.fenceCount, framesRewritten: plan.frames.length, ...('exerciseStyles' in plan || 'exercises' in plan ? { exerciseBoxesRewritten: true } : {}), undoSteps: record.steps };
        } else if (list === 'exerciseStyles') {
          // Every `:::exercise{style}` fence that names it (#1244).
          const plan = planExerciseStyleRename(styles as NonNullable<PostextConfig['exerciseStyles']>, chapters, from, to);
          const steps = applyExerciseStyleRename(store.dispatch, plan, s.activeChapterId);
          answer = { renamed: from, to, fencesRewritten: plan.fenceCount, undoSteps: steps };
        } else if (list === 'labelStyles') {
          const done = applyLabelStyleRename(store.dispatch, config.labelStyles ?? [], from, to, { chapters, resources: s.resources, activeChapterId: s.activeChapterId });
          answer = { renamed: from, to, anchorsRewritten: done.anchors, labelLinesRewritten: done.lines, undoSteps: done.chapters + done.resources + 1 };
        } else {
          const renamed = styles.map((i) => (i.id === from ? { ...i, id: to } : i));
          let steps = 0;
          let uses = 0;
          if (list === 'frameLooks') {
            const rewrites = chapters.map((c) => ({ chapterId: c.id, changes: renameLookChanges(c.markdown, from, to), baseLength: c.markdown.length }));
            steps += applyTemplateRewrite(store.dispatch, { chapters: rewrites }, s.activeChapterId).steps;
            uses = rewrites.reduce((n, c) => n + c.changes.length, 0);
          }
          write({ [list]: renamed } as Partial<PostextConfig>);
          steps++;
          if (list === 'tableStyles' || list === 'scoreStyles') {
            const kind = list === 'tableStyles' ? 'table' : 'score';
            for (const r of s.resources) {
              const own = r[kind] as { styleId?: string } | undefined;
              if (own?.styleId !== from) continue;
              store.dispatch({ type: 'UPSERT_RESOURCE', payload: { ...r, [kind]: { ...own, styleId: to }, updatedAt: Date.now() } as Resource, history: { merge: false } });
              uses++;
              steps++;
            }
          }
          answer = { renamed: from, to, ...(list === 'frameLooks' ? { piecesRewritten: uses } : list === 'tableStyles' || list === 'scoreStyles' ? { resourcesRewritten: uses } : {}), undoSteps: steps };
        }
      }
      return { ...answer, ...(await layoutAnswer(host, args.wait, signal)) };
    },
  };

  const remove: WebMcpTool = {
    name: 'sandbox_remove_design_item',
    title: 'Sandbox: remove a style or palette colour as the panel does',
    description: 'Take an item out of a named list of the design, with what the Settings panel does to its uses: a callout style\'s children take its look over (and its parent, if it had one), so no box changes; a palette colour\'s settings keep the colour it gave them, no longer linked to the palette; a comics balloon style leaves the cast members who spoke in it with the default balloon. The other lists (labelStyles, tableStyles, scoreStyles, paragraphStyles, headingStyles, chipStyles, markStyles, frameLooks, exerciseStyles, comics.panelStyles, comics.cast) lose the item only: what names it falls back as the panel says. Page templates, frames and groups are removed with sandbox_set_config (a null value). One step for sandbox_undo.',
    inputSchema: {
      type: 'object',
      properties: {
        list: listParam('The list the item is in (not pageTemplates or templateFrames).'),
        id: { type: 'string', description: 'The item\'s id.' },
        wait: WAIT_PARAM,
      },
      required: ['list', 'id'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const list = String(args.list ?? '') as DesignList;
      if (!(LISTS as readonly string[]).includes(list)) throw new ToolError(`"${list}" is not a list. The lists: ${LISTS.join(', ')}.`);
      if (list === 'pageTemplates' || list === 'templateFrames') throw new ToolError('Remove a page template, frame or group with sandbox_set_config, a null value at its path (pageTemplates[id=…], pageTemplates[id=…].frames[name=…]).');
      const id = String(args.id ?? '');
      const s = store.getSnapshot();
      const { config } = s;
      let answer: Record<string, unknown> = { removed: id, list };
      if (list === 'colorPalette') {
        const palette = config.colorPalette ?? [];
        if (!palette.some((e) => e.id === id)) throw noItem(list, id, palette.map((e) => e.id));
        const unlinked = unlinkPaletteRefs(config, id);
        const next = palette.filter((e) => e.id !== id);
        store.dispatch({ type: 'SET_CONFIG', payload: { ...unlinked, colorPalette: next.length > 0 ? next : undefined }, history: { merge: false } });
      } else if (list.startsWith('comics.')) {
        const raw = config.comics;
        const key = list === 'comics.cast' ? 'cast' : list === 'comics.panelStyles' ? 'panelStyles' : 'balloonStyles';
        const items: { id: string }[] = raw?.[key] ?? [];
        if (!items.some((i) => i.id === id)) {
          if (key === 'balloonStyles' && resolveComicsConfig(raw, config.locale ?? s.locale).balloonStyles.some((b) => b.id === id)) {
            throw new ToolError(`${id} is a built-in balloon kind: it cannot be removed (sandbox_set_config with a null value at comics.balloonStyles[id=${id}] restores it if it was changed).`);
          }
          throw noItem(list, id, items.map((i) => i.id));
        }
        let next = setComicsField(raw, key, removeById(items as never[], id));
        if (key === 'balloonStyles') next = setComicsField(next, 'cast', retargetCast(raw?.cast, id, undefined));
        write({ comics: pruneComics(next) });
      } else {
        const styles = listOf(config, list as PlainList | 'calloutStyles');
        if (!styles.some((i) => i.id === id)) throw noItem(list, id, styles.map((i) => i.id));
        const next = list === 'calloutStyles'
          ? removeCalloutStyle(styles as NonNullable<PostextConfig['calloutStyles']>, id)
          : styles.filter((i) => i.id !== id);
        const children = list === 'calloutStyles' ? (styles as NonNullable<PostextConfig['calloutStyles']>).filter((c) => c.extends === id).map((c) => c.id) : [];
        if (children.length > 0) answer = { ...answer, childrenTookItsLook: children };
        write({ [list]: next.length > 0 || list === 'calloutStyles' || list === 'chipStyles' || list === 'markStyles' ? next : undefined } as Partial<PostextConfig>);
      }
      return { ...answer, undoSteps: 1, ...(await layoutAnswer(host, args.wait, signal)) };
    },
  };

  const languageDefaults: WebMcpTool = {
    name: 'sandbox_language_defaults',
    title: 'Sandbox: the Chinese, Japanese or Arabic defaults',
    description: 'The list the Body text section offers a Chinese, Japanese or Arabic book (Design › Text › Language): the settings such a book is usually set with — document language, writing mode and binding, typefaces, alignment, indent, notes, chapter numbering, punctuation rules — each with the value it has and the one it would take. Without apply it only lists them: required rows always apply; optional ones apply unless the author set a value of their own (customised), and include names exactly the optional rows to apply. With apply: true the rows are written as one step (sandbox_undo takes it back). chinese takes locale (zh-Hans, zh-Hant, zh-HK…) and vertical; japanese takes book (vertical: a bunko or tankōbon novel; horizontal: a technical book); arabic takes faces (classical or modern) and the document language must be in the Arabic script.',
    inputSchema: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['chinese', 'japanese', 'arabic'] },
        locale: { type: 'string', description: 'chinese: zh-Hans or zh-Hant (any Chinese tag; default the book\'s, else zh-Hans). arabic: an Arabic-script tag (default the book\'s).' },
        vertical: { type: 'boolean', description: 'chinese: vertical lines bound on the right, or horizontal (default: the direction a Chinese book has, else vertical for Traditional).' },
        book: { type: 'string', enum: ['vertical', 'horizontal'], description: 'japanese: default vertical.' },
        faces: { type: 'string', enum: ['classical', 'modern'], description: 'arabic: default classical.' },
        include: { type: 'array', items: { type: 'string' }, description: 'The optional rows to apply, by id (default: every row the author has not customised).' },
        apply: { type: 'boolean', description: 'Write the rows (default false: list them).' },
        wait: WAIT_PARAM,
      },
      required: ['language'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      const { config } = s;
      const include = Array.isArray(args.include) ? args.include.map(String) : undefined;
      const fallbackLocale = s.locale ?? 'en';
      let result: { changes: { id: string; from: unknown; to: unknown; customised: boolean; required: boolean; applied: boolean }[]; config: PostextConfig; locale?: string };
      if (args.language === 'chinese') {
        const locale = typeof args.locale === 'string' ? args.locale : config.locale && /^zh\b/i.test(config.locale) ? config.locale : 'zh-Hans';
        const vertical = typeof args.vertical === 'boolean' ? args.vertical : undefined;
        result = chineseDefaults(config, { locale, ...(vertical !== undefined ? { vertical } : {}), fallbackLocale, ...(include ? { include: include as never[] } : {}) });
      } else if (args.language === 'japanese') {
        result = japaneseDefaults(config, { book: args.book === 'horizontal' ? 'horizontal' : 'vertical', fallbackLocale, fontSubsets: await fontSubsets(), ...(include ? { include: include as never[] } : {}) });
      } else if (args.language === 'arabic') {
        const locale = typeof args.locale === 'string' ? args.locale : config.locale ?? '';
        if (!isArabicScriptLanguage(locale)) throw new ToolError(`The Arabic list is for a book in an Arabic-script language; ${locale ? `"${locale}" is not one` : 'the book names no language'}. Give locale (ar, ar-EG…) or set the book's language first.`);
        result = arabicDefaults(config, { locale, faces: args.faces === 'modern' ? 'modern' : 'classical', fontSubsets: await fontSubsets(), ...(include ? { include: include as never[] } : {}) });
      } else {
        throw new ToolError('language is chinese, japanese or arabic.');
      }
      const rows = result.changes.map((c) => ({ id: c.id, from: c.from, to: c.to, required: c.required, customised: c.customised, applies: c.applied }));
      if (!args.apply) return { ...(result.locale ? { locale: result.locale } : {}), rows, note: 'Nothing was changed: apply: true writes the rows marked applies.' };
      const count = result.changes.filter((c) => c.applied).length;
      if (count > 0) store.dispatch({ type: 'SET_CONFIG', payload: result.config, history: { merge: false } });
      return { applied: rows.filter((r) => r.applies).map((r) => r.id), undoSteps: count > 0 ? 1 : 0, ...(await layoutAnswer(host, args.wait, signal)) };
    },
  };

  const printProfile: WebMcpTool = {
    name: 'sandbox_print_profile',
    title: 'Sandbox: upload or remove the custom print profile',
    description: 'The Print section\'s own output condition: an ICC profile file (a CMYK output profile, .icc or .icm) the PDF/X export converts colours with and names as its output intent. Upload one (file, by url or base64): it is stored with the book and print.outputProfile becomes "custom"; name gives it another name than the one it states. remove: true takes it away (back to the default condition). The registry name and the other print settings are set with sandbox_set_config (print.customProfile.registryName).',
    inputSchema: {
      type: 'object',
      properties: {
        file: FILE_PARAM,
        name: { type: 'string' },
        remove: { type: 'boolean' },
        wait: WAIT_PARAM,
      },
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const raw = store.getSnapshot().config.print ?? {};
      if (args.remove) {
        const next = { ...raw };
        delete next.customProfile;
        if (next.outputProfile === 'custom') delete next.outputProfile;
        write({ print: Object.keys(next).length > 0 ? next : undefined });
        return { removed: true, undoSteps: 1, ...(await layoutAnswer(host, args.wait, signal)) };
      }
      if (!args.file) throw new ToolError('Give the profile file (file), or remove: true.');
      const { bytes, name: fileName } = await bytesOf(args.file as FileInput, signal);
      let profile: ReturnType<typeof parseIccProfile>;
      try {
        profile = parseIccProfile(new Uint8Array(bytes));
      } catch (err) {
        throw new ToolError(`The file is not an ICC profile (${err instanceof Error ? err.message : String(err)}).`);
      }
      if (profile.colorSpace !== 'CMYK' || (!profile.bToA[1] && !profile.bToA[0])) {
        throw new ToolError(`The profile is not a CMYK output profile (its colour space: ${profile.colorSpace}): a press condition converts to CMYK.`);
      }
      const fileId = await putBlob(bytes, 'application/vnd.iccprofile');
      const name = typeof args.name === 'string' && args.name.trim() ? args.name.trim() : profile.description || fileName.replace(/\.(icc|icm)$/i, '') || 'Custom profile';
      write({ print: { ...raw, outputProfile: 'custom', customProfile: { ...raw.customProfile, name, fileId } } });
      return { profile: { name, fileId, colorSpace: profile.colorSpace }, undoSteps: 1, ...(await layoutAnswer(host, args.wait, signal)) };
    },
  };

  const layoutTemplate: WebMcpTool = {
    name: 'sandbox_save_layout_as_template',
    title: 'Sandbox: save a composed page\'s layout as a template',
    description: 'The Page templates section\'s «Save layout as template»: a new page template whose frames stand where they stand on a laid composed page, at fixed sizes in millimetres, with the rest of each frame, the decoration, the running heads and the area of the page\'s template. page is the page\'s position in the chapter (1-based) or its folio (number); default: the chapter\'s first composed page. Answers the new template\'s id. One step for sandbox_undo.',
    inputSchema: {
      type: 'object',
      properties: {
        chapter: CHAPTER_PARAM,
        page: { type: 'integer', description: 'The page\'s position in the chapter, from 1.' },
        number: { type: 'integer', description: 'The page\'s folio, in place of page.' },
        name: { type: 'string', description: 'The template\'s name (default: «<template> layout»).' },
      },
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const s0 = store.getSnapshot();
      const { chapter } = chapterOf(s0, args.chapter);
      const { doc, state } = await layOutChapter(host, chapter.id, signal);
      const asked = typeof args.page === 'number' || typeof args.number === 'number';
      const index = asked ? pageIndexOf(doc, { position: args.page as number | undefined, number: args.number as number | undefined }) : doc.pages.findIndex((p) => p.composed);
      const page = doc.pages[index];
      if (!page?.composed) {
        throw new ToolError(asked ? 'That page is not a composed page (set with a page template).' : `Chapter "${chapter.title}" has no composed page.`);
      }
      const composed = page.composed;
      const resolved = resolvePageTemplate(state.config, composed.template, composed.variant ? { parity: composed.variant } : {});
      if (!resolved) throw new ToolError(`The page's template ${JSON.stringify(composed.template)} is not in the design any more.`);
      const area = templateAreaRect(resolved.area, pageAreas(page, doc.trimOffset));
      const rects = new Map(composed.frames.map((f) => [f.name, f.rect]));
      const name = typeof args.name === 'string' && args.name.trim()
        ? args.name.trim()
        : state.labels.pageTemplatesLayoutName.replace('__name__', resolved.name || resolved.id);
      const out = templateFromLayout(state.config.pageTemplates ?? [], resolved, rects, area, doc.config.page.dpi, name);
      const record = applyTemplateRewrite(store.dispatch, { templates: out.templates, chapters: [] }, state.activeChapterId);
      return { template: out.id, name, from: composed.template, page: index + 1, undoSteps: record.steps };
    },
  };

  return [rename, remove, languageDefaults, printProfile, layoutTemplate];
}

/** After a write that switched layout.bitmapResolution to "file": the
 *  resolutions the stored bitmaps' files state, read in as the Layout
 *  section reads them (#631). The number of pictures that took one. */
export async function readBitmapResolutions(host: SandboxToolHost): Promise<number> {
  const s = host.store.getSnapshot();
  const found = await readFileResolutions(s.resources);
  const next = found.size > 0 ? applyFileResolutions(host.store.getSnapshot().resources, found) : null;
  if (!next) return 0;
  await dispatchAndWait(host, { type: 'SET_RESOURCES', payload: next });
  return found.size;
}
