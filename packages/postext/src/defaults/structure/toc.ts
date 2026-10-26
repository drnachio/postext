import type {
  Dimension,
  ResolvedBodyTextConfig,
  ResolvedTocConfig,
  ResolvedTocEntryStyleConfig,
  ResolvedTocLevelConfig,
  TocConfig,
  TocEntryStyleConfig,
  TocGroupHead,
  TocLeaderFaceConfig,
  TocLevelConfig,
} from '../../types.js';
import { presentTag } from '../../hyphenation/locale.js';
import { resolveDesignSlot, stripDesignSlotDefaults } from './headerFooter.js';
import { defaultTableContinuationStrings } from '../resources/tableStyle.js';

const ZERO: Dimension = { value: 0, unit: 'em' };
const NUMBER_WIDTH: Dimension = { value: 2, unit: 'em' };
const HALF_EM: Dimension = { value: 0.5, unit: 'em' };
const PART_HEIGHT: Dimension = { value: 2, unit: 'em' };

/** Static defaults of the `toc` section. Typography inherits the body text
 *  at resolve time; the part row height defaults to `2em` of the body size
 *  (EF-119), not two body lines. */
export const DEFAULT_TOC_CONFIG = {
  levels: [1],
  leader: { enabled: true, char: '.', gap: HALF_EM },
  pageNumber: { width: NUMBER_WIDTH },
  subtitle: { enabled: false, attr: 'author' },
  parts: { enabled: true, breakBefore: false },
  groups: { keepTogether: false, head: 'part' as TocGroupHead, minEntriesAfterHead: 2, continuation: { enabled: true } },
};

/** A `toc.groups.head` value as written (`'part'`, `1`…`6`, or the same as
 *  a string: a directive's `keep="2"`), else undefined. */
export function parseTocGroupHead(value: unknown): TocGroupHead | undefined {
  if (value === 'part') return 'part';
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\s*[1-6]\s*$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 6 ? (n as TocGroupHead) : undefined;
}

/** The default continuation mark of a contents block in `locale`: the
 *  continued-table suffix of that language ("(cont.)", "(suite)",
 *  "（续）"…). */
export function defaultTocContinuationMark(locale?: string): string {
  return defaultTableContinuationStrings(locale).continuedSuffix;
}

/** The face fields of a leader that are set (#1121); undefined when none. */
function leaderFace(partial: TocLeaderFaceConfig | undefined): TocLeaderFaceConfig | undefined {
  if (!partial) return undefined;
  const out: TocLeaderFaceConfig = {};
  if (partial.color !== undefined) out.color = partial.color;
  if (typeof partial.fontFamily === 'string' && partial.fontFamily) out.fontFamily = partial.fontFamily;
  if (partial.fontSize !== undefined) out.fontSize = partial.fontSize;
  if (typeof partial.fontWeight === 'number' && Number.isFinite(partial.fontWeight)) out.fontWeight = partial.fontWeight;
  return Object.keys(out).length > 0 ? out : undefined;
}

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
  locale?: string,
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
  const groups = partial?.groups;
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
      ...leaderFace(partial?.leader),
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
      design: parts?.design ? resolveDesignSlot(parts.design, 'tocRow') : { elements: [] },
      ...(leaderFace(parts?.leader) ? { leader: leaderFace(parts?.leader) } : {}),
      height: parts?.height ?? PART_HEIGHT,
      marginTop: parts?.marginTop ?? ZERO,
      marginBottom: parts?.marginBottom ?? ZERO,
    },
    groups: {
      keepTogether: groups?.keepTogether ?? d.groups.keepTogether,
      head: parseTocGroupHead(groups?.head) ?? d.groups.head,
      minEntriesAfterHead: Math.max(0, Math.floor(groups?.minEntriesAfterHead ?? d.groups.minEntriesAfterHead)),
      continuation: {
        enabled: groups?.continuation?.enabled ?? d.groups.continuation.enabled,
        // The document's language, as a continued table's (#850).
        mark: groups?.continuation?.mark ?? defaultTocContinuationMark(presentTag(locale) ?? bodyText.hyphenation.tag ?? bodyText.hyphenation.locale),
      },
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
    Object.assign(l, leaderFace(toc.leader));
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
      const slot = stripDesignSlotDefaults(toc.parts.design, 'tocRow');
      if (slot && slot.elements && slot.elements.length > 0) p.design = slot;
    }
    const partLeader = leaderFace(toc.parts.leader);
    if (partLeader) p.leader = partLeader;
    if (toc.parts.height !== undefined) p.height = toc.parts.height;
    if (toc.parts.marginTop !== undefined) p.marginTop = toc.parts.marginTop;
    if (toc.parts.marginBottom !== undefined) p.marginBottom = toc.parts.marginBottom;
    const kept = stripObject(p);
    if (kept) r.parts = kept;
  }
  if (toc.groups) {
    const g: NonNullable<TocConfig['groups']> = {};
    const gd = d.groups;
    if (toc.groups.keepTogether !== undefined && toc.groups.keepTogether !== gd.keepTogether) g.keepTogether = toc.groups.keepTogether;
    if (toc.groups.head !== undefined && toc.groups.head !== gd.head) g.head = toc.groups.head;
    if (toc.groups.minEntriesAfterHead !== undefined && toc.groups.minEntriesAfterHead !== gd.minEntriesAfterHead) g.minEntriesAfterHead = toc.groups.minEntriesAfterHead;
    if (toc.groups.continuation) {
      const c: NonNullable<NonNullable<TocConfig['groups']>['continuation']> = {};
      if (toc.groups.continuation.enabled !== undefined && toc.groups.continuation.enabled !== gd.continuation.enabled) c.enabled = toc.groups.continuation.enabled;
      // The default mark follows the language: an explicit one is kept.
      if (toc.groups.continuation.mark !== undefined) c.mark = toc.groups.continuation.mark;
      const kept = stripObject(c);
      if (kept) g.continuation = kept;
    }
    const kept = stripObject(g);
    if (kept) r.groups = kept;
  }
  return stripObject(r);
}
