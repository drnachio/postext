import type {
  Dimension,
  ResolvedBodyTextConfig,
  ResolvedTocConfig,
  ResolvedTocEntryStyleConfig,
  ResolvedTocLevelConfig,
  TocConfig,
  TocEntryStyleConfig,
  TocLevelConfig,
} from '../types';
import { resolveDesignSlot, stripDesignSlotDefaults } from './headerFooter';

const ZERO: Dimension = { value: 0, unit: 'em' };
const NUMBER_WIDTH: Dimension = { value: 2, unit: 'em' };
const HALF_EM: Dimension = { value: 0.5, unit: 'em' };
const PART_HEIGHT: Dimension = { value: 2, unit: 'em' };

/** Static defaults of the `toc` section. Typography inherits the body text
 *  at resolve time; the part row height defaults to two body lines. */
export const DEFAULT_TOC_CONFIG = {
  levels: [1],
  leader: { enabled: true, char: '.', gap: HALF_EM },
  pageNumber: { width: NUMBER_WIDTH },
  subtitle: { enabled: false, attr: 'author' },
  parts: { enabled: true, breakBefore: false },
};

function resolveEntryStyle(
  partial: TocEntryStyleConfig | undefined,
  bodyText: ResolvedBodyTextConfig,
): ResolvedTocEntryStyleConfig {
  const fontFamily = partial?.fontFamily ?? bodyText.fontFamily;
  const fontSize = partial?.fontSize ?? bodyText.fontSize;
  return {
    fontFamily,
    fontSize,
    lineHeight: partial?.lineHeight ?? bodyText.lineHeight,
    fontWeight: partial?.fontWeight ?? bodyText.fontWeight,
    italic: partial?.italic ?? false,
    color: partial?.color ?? bodyText.color,
    indent: partial?.indent ?? ZERO,
    numberWidth: partial?.numberWidth ?? NUMBER_WIDTH,
    numberGap: partial?.numberGap ?? HALF_EM,
    numberFontFamily: partial?.numberFontFamily ?? fontFamily,
    numberFontSize: partial?.numberFontSize ?? fontSize,
    numberFontWeight: partial?.numberFontWeight ?? partial?.fontWeight ?? bodyText.boldFontWeight,
    numberColor: partial?.numberColor ?? partial?.color ?? bodyText.color,
    marginTop: partial?.marginTop ?? ZERO,
    marginBottom: partial?.marginBottom ?? ZERO,
  };
}

/** The fields of an entry style a partial sets (for `unnumbered`, applied
 *  over the level's resolved style). */
function partialEntryStyle(partial: TocEntryStyleConfig | undefined): Partial<ResolvedTocEntryStyleConfig> {
  const out: Partial<ResolvedTocEntryStyleConfig> = {};
  if (!partial) return out;
  for (const [k, v] of Object.entries(partial)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function resolveTocConfig(
  partial: TocConfig | undefined,
  bodyText: ResolvedBodyTextConfig,
): ResolvedTocConfig {
  const d = DEFAULT_TOC_CONFIG;
  const levelsIn: TocLevelConfig[] = partial?.levels && partial.levels.length > 0
    ? partial.levels
    : d.levels.map((level) => ({ level }));
  const levels: ResolvedTocLevelConfig[] = levelsIn.map((l) => ({ level: l.level, ...resolveEntryStyle(l, bodyText) }));
  const first = levels[0] ?? { level: 1, ...resolveEntryStyle(undefined, bodyText) };
  const pn = partial?.pageNumber;
  const sub = partial?.subtitle;
  const parts = partial?.parts;
  return {
    levels,
    unnumbered: partialEntryStyle(partial?.unnumbered),
    pageNumber: {
      fontFamily: pn?.fontFamily ?? first.fontFamily,
      fontSize: pn?.fontSize ?? first.fontSize,
      fontWeight: pn?.fontWeight ?? bodyText.fontWeight,
      italic: pn?.italic ?? false,
      color: pn?.color ?? bodyText.color,
      width: pn?.width ?? d.pageNumber.width,
    },
    leader: {
      enabled: partial?.leader?.enabled ?? d.leader.enabled,
      char: partial?.leader?.char ?? d.leader.char,
      gap: partial?.leader?.gap ?? d.leader.gap,
    },
    subtitle: {
      enabled: sub?.enabled ?? d.subtitle.enabled,
      attr: sub?.attr ?? d.subtitle.attr,
      fontFamily: sub?.fontFamily ?? first.fontFamily,
      fontSize: sub?.fontSize ?? first.fontSize,
      fontWeight: sub?.fontWeight ?? bodyText.fontWeight,
      italic: sub?.italic ?? true,
      color: sub?.color ?? bodyText.color,
      indent: sub?.indent ?? ZERO,
    },
    parts: {
      enabled: parts?.enabled ?? d.parts.enabled,
      breakBefore: parts?.breakBefore ?? d.parts.breakBefore,
      design: parts?.design ? resolveDesignSlot(parts.design, 'header') : { elements: [] },
      height: parts?.height ?? PART_HEIGHT,
      marginTop: parts?.marginTop ?? ZERO,
      marginBottom: parts?.marginBottom ?? ZERO,
    },
  };
}

function stripObject<T extends object>(obj: T): T | undefined {
  return Object.keys(obj).length > 0 ? obj : undefined;
}

function definedFields<T extends object>(obj: T | undefined): T | undefined {
  if (!obj) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return stripObject(out as T);
}

/** Drop unset fields and the static defaults. Inherited typography is kept
 *  whenever set. Returns `undefined` when nothing remains. */
export function stripTocDefaults(toc: TocConfig | undefined): TocConfig | undefined {
  if (!toc) return undefined;
  const d = DEFAULT_TOC_CONFIG;
  const r: TocConfig = {};
  if (toc.levels) {
    const levels = toc.levels.map((l) => definedFields(l)).filter((l): l is NonNullable<typeof l> => !!l);
    const isDefault = levels.length === 1 && levels[0]!.level === 1 && Object.keys(levels[0]!).length === 1;
    if (levels.length > 0 && !isDefault) r.levels = levels;
  }
  const unnumbered = definedFields(toc.unnumbered);
  if (unnumbered) r.unnumbered = unnumbered;
  const pn = definedFields(toc.pageNumber);
  if (pn) r.pageNumber = pn;
  if (toc.leader) {
    const l: NonNullable<TocConfig['leader']> = {};
    if (toc.leader.enabled !== undefined && toc.leader.enabled !== d.leader.enabled) l.enabled = toc.leader.enabled;
    if (toc.leader.char !== undefined && toc.leader.char !== d.leader.char) l.char = toc.leader.char;
    if (toc.leader.gap !== undefined) l.gap = toc.leader.gap;
    const kept = stripObject(l);
    if (kept) r.leader = kept;
  }
  if (toc.subtitle) {
    const s = definedFields(toc.subtitle) ?? {};
    if (s.enabled === d.subtitle.enabled) delete s.enabled;
    if (s.attr === d.subtitle.attr) delete s.attr;
    const kept = stripObject(s);
    if (kept) r.subtitle = kept;
  }
  if (toc.parts) {
    const p: NonNullable<TocConfig['parts']> = {};
    if (toc.parts.enabled !== undefined && toc.parts.enabled !== d.parts.enabled) p.enabled = toc.parts.enabled;
    if (toc.parts.breakBefore !== undefined && toc.parts.breakBefore !== d.parts.breakBefore) p.breakBefore = toc.parts.breakBefore;
    if (toc.parts.design) {
      const slot = stripDesignSlotDefaults(toc.parts.design, 'header');
      if (slot && slot.elements && slot.elements.length > 0) p.design = slot;
    }
    if (toc.parts.height !== undefined) p.height = toc.parts.height;
    if (toc.parts.marginTop !== undefined) p.marginTop = toc.parts.marginTop;
    if (toc.parts.marginBottom !== undefined) p.marginBottom = toc.parts.marginBottom;
    const kept = stripObject(p);
    if (kept) r.parts = kept;
  }
  return stripObject(r);
}
