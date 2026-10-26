// resolvePageTemplate (memoised per template list), label styles, and the
// stripping of defaults before the Sandbox saves (#1276: split out of
// templates.ts).
import { modulesGroupRoot, expandModules } from '../modules.js';
import type { DesignSlot } from '../../types.js';
import type { PageTemplate, ResolvePageTemplateOptions, ResolvedPageTemplate, PageSide, LabelStyle, ResolvedLabelStyle } from '../types.js';
import { isRecord, MODULE_ROLE, oneOf, TEMPLATE_AREAS, DEFAULT_PAGE_TEMPLATE, isModuleTemplate, LABEL_FONT_STYLES, LABEL_TEXT_TRANSFORMS, DEFAULT_LABEL_STYLE } from './defaults.js';
import { idTable, templateChain, type TemplateIssue, type Merged, mergePatch, INHERITED_KEYS, templateIndex } from './merging.js';
import { normalizeGrid, normalizeFrame, normalizeGroup, dim, moduleWidth, moduleFactor, scale } from './normalize.js';
import { settleReferences } from './references.js';

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** What `resolvePageTemplate` reads of a configuration: the raw or the
 *  resolved one alike. */
export interface PageTemplateSource {
  pageTemplates?: readonly PageTemplate[];
  /** The callout style ids frames may name. Unset: not checked. */
  calloutStyles?: readonly { id: string }[];
}

/** The usable template ids: the first of each id, chains that do not loop. */
function usableIds(templates: readonly PageTemplate[]): Set<string> {
  const ids = new Set<string>();
  const byId = idTable(templates);
  for (const [id, index] of byId) if (templateChain(templates, index, byId)) ids.add(id);
  return ids;
}

/**
 * Resolve the template at `index` of `templates` (see
 * {@link resolvePageTemplate}), with the issues met on the way. `prefix`
 * is the JSON pointer of the list (`/pageTemplates`).
 * @internal the validator's; hosts call `resolvePageTemplate`.
 */
export function resolveTemplateAt(
  templates: readonly PageTemplate[],
  index: number,
  options: ResolvePageTemplateOptions & { calloutStyleIds?: ReadonlySet<string>; prefix?: string } = {},
): { template: ResolvedPageTemplate; issues: TemplateIssue[] } | undefined {
  const chain = templateChain(templates, index);
  const own = templates[index];
  if (!chain || !isRecord(own) || typeof own.id !== 'string') return undefined;
  const prefix = options.prefix ?? '/pageTemplates';
  const issues: TemplateIssue[] = [];
  const merged: Merged = { fields: {}, fieldPaths: {}, frames: [], groups: [], elements: [] };
  const inherited: Record<string, unknown> = {};
  for (const i of [...chain].reverse()) {
    const t = templates[i]!;
    mergePatch(merged, t, `${prefix}/${i}`, issues);
    for (const key of INHERITED_KEYS) if (t[key] !== undefined) inherited[key] = t[key];
  }
  const spread = inherited.spread === true;
  const side: PageSide | undefined = spread || options.spread ? undefined : options.parity;
  let variant: PageSide | undefined;
  if (side) {
    for (const i of [...chain].reverse()) {
      const patch = templates[i]!.variants?.[side];
      if (isRecord(patch)) {
        mergePatch(merged, patch, `${prefix}/${i}/variants/${side}`, issues);
        variant = side;
      }
    }
  }
  const grid = normalizeGrid(merged.fields.grid);
  const frames = merged.frames.map((e) => normalizeFrame(e.value, grid, { configPath: e.configPath, fieldPaths: e.fieldPaths }));
  const groups = merged.groups.map((e) => normalizeGroup(e, grid));
  const settled = settleReferences(
    frames,
    groups,
    merged.elements,
    { templateIds: usableIds(templates), calloutStyleIds: options.calloutStyleIds, module: inherited.role === MODULE_ROLE },
    merged.fields.overflowTemplate !== undefined ? { value: merged.fields.overflowTemplate, path: merged.fieldPaths.overflowTemplate! } : undefined,
    issues,
  );
  const f = merged.fields;
  const template: ResolvedPageTemplate = {
    id: own.id,
    ...(typeof own.name === 'string' ? { name: own.name } : {}),
    area: oneOf(TEMPLATE_AREAS, f.area) ? f.area : DEFAULT_PAGE_TEMPLATE.area,
    ...(grid ? { grid } : {}),
    frames,
    groups,
    decoration: { elements: merged.elements.map((e) => e.value) },
    decorationPaths: merged.elements.map((e) => e.configPath),
    ...(f.header === false || isRecord(f.header) ? { header: f.header as DesignSlot | false } : {}),
    ...(f.footer === false || isRecord(f.footer) ? { footer: f.footer as DesignSlot | false } : {}),
    ...(isRecord(f.header) && merged.fieldPaths.header ? { headerPath: merged.fieldPaths.header } : {}),
    ...(isRecord(f.footer) && merged.fieldPaths.footer ? { footerPath: merged.fieldPaths.footer } : {}),
    ...settled,
    ...(typeof f.bodyStyle === 'string' ? { bodyStyle: f.bodyStyle } : {}),
    ...(typeof f.palette === 'string' ? { palette: f.palette } : {}),
    spread,
    gutter: dim(inherited.gutter) ?? DEFAULT_PAGE_TEMPLATE.gutter,
    role: typeof inherited.role === 'string' && inherited.role !== '' ? inherited.role : DEFAULT_PAGE_TEMPLATE.role,
    ...(variant ? { variant } : {}),
    ...(inherited.role === MODULE_ROLE && moduleWidth(inherited.width) ? { width: moduleWidth(inherited.width)! } : {}),
    ...(inherited.role === MODULE_ROLE && moduleFactor(inherited.grow) !== undefined ? { grow: moduleFactor(inherited.grow)! } : {}),
    ...(inherited.role === MODULE_ROLE && moduleFactor(inherited.shrink) !== undefined ? { shrink: moduleFactor(inherited.shrink)! } : {}),
    chain: chain.map((i) => templates[i]!.id),
    configPath: `${prefix}/${index}`,
  };
  // A module (#1062) holds no modules of its own (`moduleNested`): its
  // modules groups are plain groups.
  if (template.role === MODULE_ROLE) {
    template.groups = template.groups.map((g) => {
      if (!g.modules) return g;
      const out = { ...g };
      delete out.modules;
      delete out.overflow;
      delete out.within;
      delete out.templates;
      return out;
    });
  } else {
    // A modules group inside another (#1088) names a modules group of the
    // template, from which `within` leads out to one inside no other
    // (#1095: to any depth); else it is a modules group of its own.
    const groups = template.groups;
    template.groups = groups.map((g) => {
      if (!g.within) return g;
      if (modulesGroupRoot(groups, g) !== undefined) return g;
      // (Reported by the validator.)
      const out = { ...g };
      delete out.within;
      delete out.templates;
      return out;
    });
  }
  return { template, issues };
}

const resolvedCache = new WeakMap<readonly PageTemplate[], Map<string, ResolvedPageTemplate | null>>();

/**
 * The template `id` of `config.pageTemplates`, ready to lay out: its
 * `extends` chain merged (scalar fields replace, `grid` merges key by key,
 * frames and groups merge by `name` with `remove: true` dropping one,
 * decoration elements merge by `id`), then the variant of the page's side
 * (`options.parity`; none on a spread), then every default filled in and
 * every reference settled (see `validatePageTemplates` for what is fixed
 * and reported). Undefined when no template has that id, or its chain
 * loops. The first template with an id is the one it means.
 *
 * Memoised per `pageTemplates` array (the resolved configuration holds a
 * copy of its own): treat the result as read-only, and give a changed list
 * as a new array.
 */
export function resolvePageTemplate(
  config: PageTemplateSource | undefined,
  id: string,
  options: ResolvePageTemplateOptions = {},
): ResolvedPageTemplate | undefined {
  const templates = config?.pageTemplates;
  if (!Array.isArray(templates)) return undefined;
  const index = templateIndex(templates, id);
  if (index === undefined) return undefined;
  const styleIds = config?.calloutStyles ? config.calloutStyles.map((s) => s.id).join('\u0000') : '';
  const key = `${index}|${options.parity ?? ''}|${options.spread ? 1 : 0}|${config?.calloutStyles ? 1 : 0}|${styleIds}`;
  // The page's modules (#1062): the template with them laid in its modules
  // group, kept by the list as well.
  if (options.modules && options.modules.length > 0) {
    const uses = options.modules;
    const moduleKey = `${key}|m|${uses.map((u) => `${u.name}\u0001${u.template}`).join('\u0000')}`;
    let cache = resolvedCache.get(templates);
    if (!cache) {
      cache = new Map();
      resolvedCache.set(templates, cache);
    }
    if (cache.has(moduleKey)) return cache.get(moduleKey) ?? undefined;
    const rest: ResolvePageTemplateOptions = { ...options };
    delete rest.modules;
    const base = resolvePageTemplate(config, id, rest);
    const out = base && !isModuleTemplate(base)
      ? expandModules(base, uses, (moduleId) => resolvePageTemplate(config, moduleId))
      : base;
    cache.set(moduleKey, out ?? null);
    return out;
  }
  let cache = resolvedCache.get(templates);
  if (!cache) {
    cache = new Map();
    resolvedCache.set(templates, cache);
  }
  if (cache.has(key)) return cache.get(key) ?? undefined;
  const calloutStyleIds = config?.calloutStyles ? new Set(config.calloutStyles.map((s) => s.id)) : undefined;
  const result = resolveTemplateAt(templates, index, { ...options, calloutStyleIds })?.template;
  cache.set(key, result ?? null);
  return result;
}

// ---------------------------------------------------------------------------
// Label styles
// ---------------------------------------------------------------------------

/** The label styles with their defaults filled in. */
export function resolveLabelStyles(styles: readonly LabelStyle[] | undefined): ResolvedLabelStyle[] {
  if (!Array.isArray(styles)) return [];
  return styles.filter((s) => isRecord(s) && typeof s.id === 'string').map((s) => ({
    ...s,
    // Left unset when the style does not say (or says something unknown):
    // "normal" written is a choice that overrides a borrowed paragraph
    // style's italics, not the same thing as nothing (#955).
    fontStyle: oneOf(LABEL_FONT_STYLES, s.fontStyle) ? s.fontStyle : undefined,
    textTransform: oneOf(LABEL_TEXT_TRANSFORMS, s.textTransform) ? s.textTransform : undefined,
    minScale: scale(s.minScale, DEFAULT_LABEL_STYLE.minScale),
  }));
}

// ---------------------------------------------------------------------------
// Stripping defaults (what the Sandbox saves)
// ---------------------------------------------------------------------------

/** A deep copy of `value` with the keys set to `undefined` left out. */
function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutUndefined) as T;
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = withoutUndefined(v);
  return out as T;
}

/**
 * The page templates as stored. Every field is kept as written, a value
 * equal to its default included: in a template that `extends` another, or
 * in a variant, it overrides the parent's, so it is never a restated
 * default. Keys set to `undefined` are left out, and an empty list is no
 * list.
 */
export function stripPageTemplatesDefaults(templates: readonly PageTemplate[] | undefined): PageTemplate[] | undefined {
  if (!Array.isArray(templates) || templates.length === 0) return undefined;
  return withoutUndefined([...templates]);
}

/** The label styles without the values that restate a default (and `name`
 *  equal to `id`); an empty list is no list. */
export function stripLabelStylesDefaults(styles: readonly LabelStyle[] | undefined): LabelStyle[] | undefined {
  if (!Array.isArray(styles) || styles.length === 0) return undefined;
  return styles.map((s) => {
    const out = withoutUndefined({ ...s }) as LabelStyle & Record<string, unknown>;
    if (out.name === out.id) delete out.name;
    // With a paragraph style to borrow from, `'normal'` / `'none'` turn its
    // slant and capitals off: they are not a restated default (#955).
    if (!out.paragraphStyle && out.fontStyle === DEFAULT_LABEL_STYLE.fontStyle) delete out.fontStyle;
    if (!out.paragraphStyle && out.textTransform === DEFAULT_LABEL_STYLE.textTransform) delete out.textTransform;
    if (out.minScale === DEFAULT_LABEL_STYLE.minScale) delete out.minScale;
    if (out.overlap === 'check') delete out.overlap;
    return out;
  });
}
