// The book's design: reading and writing its configuration.

import { collectConfigWarnings, overridePaths, stripConfigDefaults } from 'postext';
import type { PostextConfig } from 'postext';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from '../../sidebar/sections/registry.js';
import { tokenize } from '../../sidebar/search/normalize.js';
import { buildSectionSearchIndex, planSettingsSearch } from '../../sidebar/search/sectionIndex.js';
import { configFromExport, type ConfigExport } from '../../storage/persistence.js';
import { isColor, isDimension, resolveEffectiveConfig } from '../configEffective.js';
import { canonicalSteps, formatPath, getAtPath, leafEntries, parsePath, patchPaths } from '../configPaths.js';
import { planWrite, stableText } from '../configWrite.js';
import { bookPagesSummary, dispatchAndWait, whenSettled, type SandboxToolHost } from '../host.js';
import { readBitmapResolutions } from './designItems.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';
import { editionOverride, generalSettingsFrom, generalSettingsView, ownPathsAt, rebaseEdition, recordSharedConfig, type ConfigScope } from '../../editions/configLayers.js';
import { getProject } from '../../storage/projects.js';
import type { SandboxState } from '../../context/SandboxContext.js';

/** The editions of the book on screen that set one of `paths` themselves,
 *  and so keep their value when the general settings change there. */
async function editionsKeeping(state: SandboxState, paths: readonly string[]): Promise<string[]> {
  const layers = state.configLayers;
  if (!layers) return [];
  const out: string[] = [];
  const project = state.projects.find((p) => p.id === state.activeProjectId);
  const here = project?.locale ?? state.config.locale;
  if (here && ownPathsAt(editionOverride(layers.shared, state.config), paths).length > 0) out.push(here);
  if (!state.activeProjectId) return out;
  const record = await getProject(state.activeProjectId).catch(() => null);
  const base = record ? recordSharedConfig(record) : null;
  if (!record?.editions || !base) return out;
  for (const [tag, e] of Object.entries(record.editions)) {
    if (tag !== here && ownPathsAt(editionOverride(base, e.config), paths).length > 0) out.push(tag);
  }
  return out;
}

/** Every top-level key a configuration has: a path outside them is
 *  refused. */
const CONFIG_KEYS = [
  'page', 'layout', 'bodyText', 'headings', 'tableStyle', 'tableStyles', 'captionStyle', 'diagramStyle', 'scoreStyle', 'scoreStyles', 'videoStyle',
  'paragraphStyles', 'calloutStyles', 'chipStyles', 'markStyles', 'parts', 'headingStyles', 'toc', 'index', 'unorderedLists',
  'orderedLists', 'math', 'footnotes', 'links', 'crossRefs', 'citations', 'cjk', 'lineNumbers', 'codeStyle', 'header', 'footer',
  'locale', 'direction', 'numerals', 'debug', 'htmlViewer', 'canvasViewer', 'folio', 'comics', 'pdfGeneration', 'print', 'contrast', 'checks',
  'colorPalette', 'customFonts', 'resourceTypes', 'pageTemplates', 'labelStyles', 'frameLooks', 'exerciseStyles', 'exercises',
] as const satisfies readonly (keyof PostextConfig)[];

/** Keys a host sets for one layout and a book never stores: the leaf the
 *  HTML viewer lays composed pages out on (#1045). */
type HostOnlyKey = 'composedViewerLeaf';

// A section the engine gains must be added above (or, set by hosts only,
// to HostOnlyKey): this line stops compiling until it is.
const everySection: Exclude<keyof PostextConfig, (typeof CONFIG_KEYS)[number] | HostOnlyKey> extends never ? true : never = true;
void everySection;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const same = (a: unknown, b: unknown): boolean => stableText(a) === stableText(b);

/** Most settings an answer lists as having followed a change. */
const MAX_FOLLOWED = 40;

export function configTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;

  /** The configuration with every default filled in — what each setting
   *  comes to when the book does not set it. */
  const effectiveOf = (config: PostextConfig): Record<string, unknown> => {
    const s = store.getSnapshot();
    return resolveEffectiveConfig(config, s.locale, s.resources);
  };
  const effectiveConfig = (): Record<string, unknown> => {
    try {
      return effectiveOf(store.getSnapshot().config);
    } catch (err) {
      throw new ToolError(`The engine cannot resolve the book's configuration as it stands (${err instanceof Error ? err.message : String(err)}). sandbox_get_config without "effective" shows what the book stores; removing the setting at fault (a null value in sandbox_set_config) brings its default back.`);
    }
  };

  /** `path` with its list positions read against the resolved
   *  configuration and turned into what tells the items apart, and the
   *  section it starts with checked. */
  const settingPath = (path: string, effective: Record<string, unknown> | null): string => {
    const steps = parsePath(path);
    const top = steps[0];
    if (!top || !('key' in top)) throw new ToolError(`"${path}" is not a setting path.`);
    if (!(CONFIG_KEYS as readonly string[]).includes(top.key)) {
      throw new ToolError(`"${top.key}" is not a section of the configuration. The sections: ${CONFIG_KEYS.join(', ')}.`);
    }
    return effective ? formatPath(canonicalSteps(effective, steps)) : path;
  };

  const getConfig: WebMcpTool = {
    name: 'sandbox_get_config',
    title: 'Sandbox: read the design settings',
    description: "The book's configuration — page size and margins, columns, body text, headings, lists, figures, running heads, notes, colours, print and so on. A book stores only what departs from the defaults: \"set\" is what it stores at the path, \"effective\" what the setting comes to with the defaults filled in (which also shows every setting that exists there). Paths look like page.margins.top, bodyText.hyphenation, headings.levels[level=2].fontSize, header.elements[id=titleOdd], calloutStyles[id=note].title; an item of a list can also be named by its position in the effective list ([0]), and the answer gives the path by what tells the item apart. Without a path: everything the book sets, and the names of the top-level sections. The settings are documented at /docs/configuration.",
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The setting, or the section, to read.' },
        effective: { type: 'boolean', description: 'Include the value with defaults filled in (default true when a path is given).' },
        scope: { type: 'string', enum: ['all', 'edition'], description: 'A book in several languages: all reads the general settings every edition reads, edition the edition on screen (its own fields over the general ones). Default: the scope the Design panel is in.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: (args) => {
      const state = store.getSnapshot();
      const layers = state.configLayers;
      const scope = (args.scope as ConfigScope | undefined) ?? layers?.scope ?? 'edition';
      const config = scope === 'all' && layers ? generalSettingsView(layers.shared, state.config) : state.config;
      const set = scope === 'all' && layers ? layers.shared : stripConfigDefaults(config);
      // A book in several languages: which settings the edition on screen
      // sets of its own (#1209).
      const layered = layers ? { scope, ownFields: overridePaths(editionOverride(layers.shared, state.config)) } : {};
      const asked = ((args.path as string | undefined) ?? '').trim();
      if (asked === '') {
        return {
          ...layered,
          set,
          sections: CONFIG_KEYS,
          ...(args.effective ? { effective: effectiveConfig() } : {}),
        };
      }
      if (args.effective === false) {
        const path = settingPath(asked, null);
        return { path, set: getAtPath(set, path) ?? null };
      }
      const resolved = effectiveConfig();
      const path = settingPath(asked, resolved);
      const answer: Record<string, unknown> = { path, set: getAtPath(set, path) ?? null };
      const effective = getAtPath(resolved, path);
      if (effective === undefined && answer.set === null) {
        const parentPath = formatPath(parsePath(path).slice(0, -1));
        const parent = parentPath !== '' ? getAtPath(resolved, parentPath) : undefined;
        answer.note = isRecord(parent)
          ? `Nothing is set or resolved at this path. The settings under ${parentPath}: ${Object.keys(parent).join(', ')}.`
          : Array.isArray(parent)
            ? `Nothing is set or resolved at this path. The items of ${parentPath}: ${[...leafEntries(parent, 1).keys()].join(', ') || 'none'}.`
            : 'Nothing is set or resolved at this path.';
      }
      answer.effective = effective ?? null;
      return answer;
    },
  };

  const setConfig: WebMcpTool = {
    name: 'sandbox_set_config',
    title: 'Sandbox: change the design settings',
    description: "Change the book's configuration, then lay the book out again. changes sets one value per path, any path sandbox_get_config or sandbox_find_setting gives (page.margins.top, bodyText.fontSize, headings.levels[level=2].fontSize, header.elements[id=titleOdd].fontSize, calloutStyles[id=note].title); a null value removes the setting, which brings its default back. patch merges an object into the configuration (objects merge, null removes, lists are replaced whole). replace puts a whole configuration in place of the book's (a postext-config.json export, or a configuration object). A length is { \"value\": 2, \"unit\": \"cm\" }, a number in the setting's unit, or \"2cm\"; a colour is \"#1f3a5f\" or { \"hex\", \"model\" }. A value of the wrong shape is refused, and so is a configuration the engine cannot resolve: nothing is changed then. Answers with each setting's stored value before and after — which is how to take a change back — and what it resolves to, a note when the engine resolved something else than what was asked (a limit, a setting that depends on another), the other settings that followed, any warning the new values raise, and the pages every chapter came to before and after.",
    inputSchema: {
      type: 'object',
      properties: {
        changes: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'The setting, as a path from the top of the configuration.' },
              value: { description: 'Its new value; null (or left out) removes the setting.' },
            },
            required: ['path'],
            additionalProperties: false,
          },
        },
        patch: { type: 'object', description: 'An object merged into the configuration.' },
        replace: { type: 'object', description: 'A whole configuration (or a postext-config.json export) that takes the place of the book\'s. Not with changes or patch.' },
        wait: { type: 'boolean', description: 'Wait for the book to be laid out again and answer with its pages (default true).' },
        scope: { type: 'string', enum: ['all', 'edition'], description: 'A book in several languages: all writes the general settings every edition reads (an edition that sets the field itself keeps its value, and the answer names it in keptBy); edition writes the edition on screen only, as a value of its own. Default: the scope the Design panel is in. A book in one language has only its own settings.' },
      },
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const changes = (args.changes as { path: string; value?: unknown }[] | undefined) ?? [];
      const patch = args.patch as Record<string, unknown> | undefined;
      const replace = args.replace as Record<string, unknown> | undefined;
      if (changes.length === 0 && !patch && !replace) throw new ToolError('Give "changes" (a list of { path, value }), "patch" (an object to merge in) or "replace" (a whole configuration).');
      if (replace && (changes.length > 0 || patch)) throw new ToolError('"replace" puts a whole configuration in place: give it alone, then change settings in another call.');
      const before = store.getSnapshot();
      const layers = before.configLayers;
      const scope = (args.scope as ConfigScope | undefined) ?? layers?.scope ?? 'edition';
      if (scope === 'all' && !layers) throw new ToolError('This book is in one language: its settings are its own, there are no general settings apart from them. Leave scope out.');
      // The settings written: the general ones (as the Design panel shows
      // them beside this edition), or the edition's.
      const base = scope === 'all' && layers ? generalSettingsView(layers.shared, before.config) : before.config;
      // A book whose configuration the engine cannot resolve can still be
      // mended: its settings are then written as given.
      let effectiveBefore: Record<string, unknown> | null = null;
      try {
        effectiveBefore = effectiveOf(base);
      } catch {
        effectiveBefore = null;
      }
      const refuse = (what: string, err: unknown): never => {
        throw new ToolError(`${what}: the engine cannot resolve the configuration with it (${err instanceof Error ? err.message : String(err)}). Nothing was changed.`);
      };

      let next: PostextConfig = base;
      let effective = effectiveBefore;
      const paths: string[] = [];
      const notes: string[] = [];
      const asked = new Map<string, unknown>();
      const seeded: string[] = [];

      if (replace) {
        const whole = replace.type === 'postext-config' && isRecord(replace.config) ? configFromExport(replace as unknown as ConfigExport) : (replace as PostextConfig);
        for (const key of Object.keys(whole)) settingPath(key, null);
        next = whole;
        try {
          effective = effectiveOf(next);
        } catch (err) {
          refuse('The configuration given', err);
        }
        for (const key of CONFIG_KEYS) if (!same(base[key], next[key])) paths.push(key);
      } else {
        // A patch is its leaves, each written like a change.
        const writes: { path: string; value: unknown; merged?: boolean }[] = [];
        if (patch) for (const path of patchPaths(patch)) writes.push({ path, value: getAtPath(patch, path), merged: true });
        for (const change of changes) writes.push({ path: change.path, value: change.value });
        for (const write of writes) {
          settingPath(write.path, null);
          const removing = write.value === null || write.value === undefined;
          // An empty object in a patch merges nothing into what is there.
          if (write.merged && isRecord(write.value) && Object.keys(write.value).length === 0 && getAtPath(next, write.path) !== undefined) continue;
          const plan = effective
            ? planWrite(next, effective, write.path, removing ? undefined : write.value, effectiveOf)
            : { next: planWrite(next, {}, write.path, removing ? undefined : write.value, () => ({})).next, path: write.path, notes: [] as string[] };
          next = plan.next;
          notes.push(...plan.notes);
          if ('seeded' in plan && plan.seeded) seeded.push(...plan.seeded);
          paths.push(plan.path);
          if (!removing) asked.set(plan.path, getAtPath(next, plan.path));
          if (effective) {
            // A name the engine does not know is read as nothing at all:
            // say so rather than let the change pass for one.
            const steps = parsePath(plan.path);
            const last = steps[steps.length - 1]!;
            const parentPath = formatPath(steps.slice(0, -1));
            const parent = parentPath !== '' ? getAtPath(effective, parentPath) : undefined;
            if (!removing && 'key' in last && isRecord(parent) && !(last.key in parent) && Object.keys(parent).length > 0) {
              notes.push(`${plan.path}: "${last.key}" is not among the settings the engine resolves under ${parentPath} (${Object.keys(parent).join(', ')}). It is stored, but check the name.`);
            }
          }
          try {
            effective = effectiveOf(next);
          } catch (err) {
            if (effectiveBefore) refuse(plan.path, err);
            effective = null;
          }
        }
      }

      const unique = [...new Set(paths)];
      const changed = unique
        .map((path) => {
          const entry: Record<string, unknown> = { path, from: getAtPath(base, path) ?? null, to: getAtPath(next, path) ?? null };
          if (effectiveBefore && effective) {
            const was = getAtPath(effectiveBefore, path) ?? null;
            const is = getAtPath(effective, path) ?? null;
            if (!replace) entry.effective = same(was, is) ? is : { from: was, to: is };
            // The engine keeps a setting within its limits, and some only
            // count once another is on: the answer says what it made of
            // the value.
            const wanted = asked.get(path);
            if (wanted !== undefined && (isDimension(wanted) || (!isRecord(wanted) && !Array.isArray(wanted))) && !same(is, wanted)) {
              const holder = getAtPath(effective, formatPath(parsePath(path).slice(0, -1)));
              notes.push(isColor(holder) && holder.paletteId
                ? `${path}: stored as ${JSON.stringify(wanted)}, but this colour follows the palette entry "${holder.paletteId}" and resolves to ${JSON.stringify(is)}. Change colorPalette[id=${holder.paletteId}].value, or set the whole colour (a hex text) to stop following it.`
                : `${path}: stored as ${JSON.stringify(wanted)}, but the engine resolves ${JSON.stringify(is)} there — a limit of the setting, or a setting that only counts once another one is on.`);
            }
          }
          return entry;
        })
        .filter((c) => !same(c.from, c.to));
      if (changed.length === 0) return { changed: [], ...(notes.length > 0 ? { notes } : {}), note: 'Every setting already had that value.' };
      // A whole configuration put in place: the sections that differ, by
      // name (sandbox_get_config shows what each one stores).
      const reported = replace ? changed.map((c) => ({ path: c.path })) : changed;

      // What else moved: the settings that take their value from the ones
      // changed (a heading level from the headings, a callout's text from
      // the body text).
      let followed: { path: string; from: unknown; to: unknown }[] = [];
      if (effectiveBefore && effective && !replace) {
        const was = leafEntries(effectiveBefore);
        const is = leafEntries(effective);
        const own = (path: string) => unique.some((p) => path === p || path.startsWith(`${p}.`) || path.startsWith(`${p}[`) || p.startsWith(`${path}.`));
        for (const path of new Set([...was.keys(), ...is.keys()])) {
          if (own(path) || same(was.get(path), is.get(path))) continue;
          // Not a change of the design: the palette link the engine drops
          // from a resolved colour, and a default the engine spells out
          // in a list once the book stores it.
          if (path.endsWith('.paletteId')) continue;
          if (was.get(path) === undefined && seeded.some((at) => path.startsWith(`${at}.`) || path.startsWith(`${at}[`))) continue;
          followed.push({ path, from: was.get(path) ?? null, to: is.get(path) ?? null });
        }
      }
      const followedMore = Math.max(0, followed.length - MAX_FOLLOWED);
      followed = followed.slice(0, MAX_FOLLOWED);

      let warnings: unknown[] = [];
      try {
        const warningsBefore = new Set(collectConfigWarnings(base).map((w) => JSON.stringify(w)));
        warnings = collectConfigWarnings(next).filter((w) => !warningsBefore.has(JSON.stringify(w)));
      } catch {
        warnings = [];
      }
      const pagesBefore = bookPagesSummary(host, before);
      let keptBy: string[] = [];
      if (scope === 'all' && layers) {
        const shared = generalSettingsFrom(next, before.config);
        await dispatchAndWait(host, { type: 'SET_CONFIG', payload: rebaseEdition(layers.shared, shared, before.config), shared, history: { merge: false } });
        // Editions that set a changed field themselves keep their value.
        keptBy = await editionsKeeping(before, unique);
      } else {
        await dispatchAndWait(host, { type: 'SET_CONFIG', payload: next, history: { merge: false } });
      }
      // Bitmaps by their file's resolution: the files stored before it was
      // kept are read, as the Layout section reads them (#631).
      const bitmapResolutions = next.layout?.bitmapResolution === 'file' && base.layout?.bitmapResolution !== 'file'
        ? await readBitmapResolutions(host)
        : 0;
      const answer: Record<string, unknown> = {
        ...(layers ? { scope } : {}),
        ...(keptBy.length > 0 ? { keptBy, keptByNote: `These editions set a changed setting themselves and keep their value; write it with scope "edition" while each is on screen, or drop their own value, to change them too.` } : {}),
        ...(bitmapResolutions > 0 ? { bitmapResolutionsRead: bitmapResolutions } : {}),
        changed: reported,
        ...(followed.length > 0 ? { followed, ...(followedMore > 0 ? { followedMore } : {}) } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
        ...(notes.length > 0 ? { notes: [...new Set(notes)] } : {}),
      };
      if (args.wait === false) return { ...answer, laidOut: false };
      const laidOut = await whenSettled(host, { signal });
      const pagesAfter = bookPagesSummary(host);
      return {
        ...answer,
        laidOut,
        pagesBefore: pagesBefore.pages,
        pagesAfter: pagesAfter.pages,
        chapters: pagesAfter.chapters.map((c, i) => ({ ...c, ...(pagesBefore.chapters[i] && pagesBefore.chapters[i]!.pages !== c.pages ? { pagesBefore: pagesBefore.chapters[i]!.pages } : {}) })),
      };
    },
  };

  const findSetting: WebMcpTool = {
    name: 'sandbox_find_setting',
    title: 'Sandbox: find a design setting',
    description: 'Find where a design setting lives from a few words ("orphans", "margin", "drop cap", "baseline grid"): the configuration paths whose names match, with their current effective values, and the sections of the Design panel that mention the words, with the top-level configuration keys each one edits. The words are matched against the setting names (English, camelCase) and against the panel in the language of the interface.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'One or more words describing the setting.' } },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: (args) => {
      const s = store.getSnapshot();
      const tokens = tokenize(args.query as string);
      if (tokens.length === 0) throw new ToolError('Give at least one word to look for.');
      const effective = effectiveConfig();
      const paths = [...leafEntries(effective, 8).keys()]
        .filter((path) => {
          // `minWordLength` answers to "word length": camelCase is split.
          const words = path.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
          return tokens.every((t) => words.includes(t) || path.toLowerCase().includes(t));
        })
        .slice(0, 60)
        .map((path) => ({ path, effective: getAtPath(effective, path) ?? null }));
      const index = buildSectionSearchIndex(s.labels, s.config, s.resources);
      const sections = planSettingsSearch(index, tokens, false, s.config).flatMap((group) => group.sections.map((id) => {
        const entry = SETTINGS_SECTIONS.find((e) => e.id === id)!;
        const groupEntry = SETTINGS_GROUPS.find((g) => g.id === group.id)!;
        return { section: s.labels[entry.labelKey] as string, group: s.labels[groupEntry.labelKey] as string, settingsGroup: group.id, configKeys: entry.configKeys };
      })).slice(0, 12);
      return {
        paths,
        sections,
        ...(paths.length === 0 && sections.length === 0 ? { note: 'Nothing matched. Try one word, in English for setting names, or read a section whole with sandbox_get_config.' } : {}),
      };
    },
  };

  const resetBook: WebMcpTool = {
    name: 'sandbox_reset_to_original',
    title: 'Sandbox: put the original back',
    description: "Put back what the book started from — the sample it is, or the sample a project was made from: its design settings only (config), its text and resources (document), its resources only, or all of it. With sample, another sample than the one on screen is put back whole, in every language the reader edited it in. The reader's edits to that part are discarded and cannot be recovered. One setting or one section goes back to the design's with a null value in sandbox_set_config.",
    inputSchema: {
      type: 'object',
      properties: {
        part: { type: 'string', enum: ['config', 'document', 'resources', 'all'], description: 'What to put back.' },
        sample: { type: 'string', description: 'With part "all": the sample to put back (its id, as sandbox_list_books gives it) instead of the book on screen. It need not be open.' },
      },
      required: ['part'],
      additionalProperties: false,
    },
    annotations: { consequentialHint: true },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      if (args.sample !== undefined) {
        if (args.part !== 'all') throw new ToolError('A sample that is not on screen is put back whole: give part "all" with it.');
        if (!s.presetSummaries.some((p) => p.id === args.sample)) {
          throw new ToolError(`No sample with id ${JSON.stringify(args.sample)}. The samples: ${s.presetSummaries.map((p) => p.id).join(', ')}.`);
        }
        const edited = s.presetDrafts.filter((d) => d.presetId === args.sample).length;
        await store.restorePresetOriginal(args.sample as string);
        const laidOut = await whenSettled(host, { signal });
        return { reset: 'all', sample: args.sample, editionsDiscarded: edited, laidOut, book: bookPagesSummary(host) };
      }
      if (s.activeProjectId !== null) {
        const source = s.projects.find((p) => p.id === s.activeProjectId)?.sourcePresetId;
        if (!source || !s.presetSummaries.some((p) => p.id === source && p.available)) {
          throw new ToolError('This project was not made from a sample that is still available, so there is no original to put back.');
        }
      }
      await store.reloadPreset(args.part as 'config' | 'document' | 'resources' | 'all');
      const laidOut = await whenSettled(host, { signal });
      return { reset: args.part, laidOut, book: bookPagesSummary(host) };
    },
  };

  return [getConfig, setConfig, findSetting, resetBook];
}
