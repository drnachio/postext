// moveTextToMarkdown: each page design planned, its text turned into
// paragraph styles (the book's own when one matches), the pages written
// and the styles merged and renamed (#1276: split out of textToMarkdown.ts).
import type { PostextConfig, DocumentMetadata, DesignSlot, ParagraphStyleConfig, DesignElement, ChipStyleConfig, HeadingStyleConfig } from '../../types.js';
import type { LabelStyle, PageSide } from '../../composed/types.js';
import { collectConfigWarnings, contentInConfigRule } from '../../checks/configWarnings.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import { stableStringify } from '../../util/stableHash.js';
import { type HeadingLine, scanChapter, type DesignRun } from '../markdownRuns.js';
import { type TextLook, toMm, planDesign, type PlannedFrame } from '../pageDesign.js';
import { placeLabels } from './labels.js';
import { buildTemplates, writePage } from './templates.js';
import { type ContentInConfigCount, type TextMigrationInput, type TextMigrationOptions, type TextMigrationResult, type Design, type TextMigrationReport, emptyReport, freeId, slug, type MigratedPage } from './types.js';

const ENCODER = new TextEncoder();
const bytes = (v: unknown): number => ENCODER.encode(JSON.stringify(v ?? {})).length;

function countContent(config: PostextConfig, metadata: DocumentMetadata | undefined): ContentInConfigCount {
  const ws = collectConfigWarnings({ ...config, checks: { ...config.checks, contentInConfig: { ...config.checks?.contentInConfig, enabled: true } } }, metadata ? { metadata } : {})
    .filter((w) => w.kind === 'contentInConfig');
  return { warnings: ws.length, elements: ws.reduce((n, w) => n + (w.count ?? 0), 0), chars: ws.reduce((n, w) => n + (w.chars ?? 0), 0) };
}

const slotOf = (v: unknown): DesignSlot | undefined =>
  v && typeof v === 'object' && Array.isArray((v as DesignSlot).elements) ? (v as DesignSlot) : undefined;

const ALIGN: Record<TextLook['align'], ParagraphStyleConfig['textAlign']> = { left: 'left', center: 'center', right: 'right', justify: 'justify', start: 'start', end: 'end' };

/** The paragraph style of a look and spacing, as the migration writes it. */
function styleFields(look: TextLook, gap: number): Omit<ParagraphStyleConfig, 'id' | 'name'> {
  return {
    ...(look.fontFamily ? { fontFamily: look.fontFamily } : {}),
    fontSize: look.fontSize,
    lineHeight: { value: look.lineHeight, unit: 'em' },
    ...(look.color ? { color: look.color, boldColor: look.color, italicColor: look.color } : {}),
    textAlign: ALIGN[look.align],
    fontWeight: look.fontWeight,
    boldFontWeight: Math.max(700, look.fontWeight),
    ...(look.italic ? { italic: true } : {}),
    ...(look.uppercase ? { textTransform: 'uppercase' as const } : {}),
    // The text's tracking, which paragraph styles carry since #907.
    ...(look.letterSpacing ? { letterSpacing: look.letterSpacing } : {}),
    hyphenation: look.hyphenate,
    firstLineIndent: { value: 0, unit: 'mm' },
    spaceBetween: { value: gap, unit: 'mm' },
    marginTop: { value: 0, unit: 'mm' },
    marginBottom: { value: 0, unit: 'mm' },
    snapToGrid: false,
  };
}

/** Whether a book's paragraph style sets a look exactly (the fields the
 *  migration writes, and nothing that would change the lines). */
function sameStyle(own: ParagraphStyleConfig, want: Omit<ParagraphStyleConfig, 'id' | 'name'>): boolean {
  const harmless = new Set(['id', 'name']);
  const ownKeys = Object.keys(own).filter((k) => !harmless.has(k));
  const wantKeys = Object.keys(want);
  if (ownKeys.some((k) => !wantKeys.includes(k))) return false;
  const norm = (v: unknown): string => stableStringify(v, new Set(['paletteId', 'model']));
  return wantKeys.every((k) => {
    const a = (own as unknown as Record<string, unknown>)[k];
    const b = (want as Record<string, unknown>)[k];
    if (a === undefined) {
      // Unset values the migration only spells out.
      return (k === 'italic' && b === undefined) || (k === 'spaceBetween' && (b as { value: number }).value === 0)
        || ((k === 'marginTop' || k === 'marginBottom') && (b as { value: number }).value === 0);
    }
    return norm(a) === norm(b);
  });
}

/** Run the migration. */
export function moveTextToMarkdown(input: TextMigrationInput, options: TextMigrationOptions = {}): TextMigrationResult {
  const config = input.config;
  const merge = options.merge !== false;
  const share = options.shareTemplates !== false;
  const highlights = options.highlightsToChips !== false;
  const metadata = input.metadata;
  const verdict = contentInConfigRule(config, metadata ? { metadata } : {});
  const isContent = (c: string) => verdict(c).content;
  /** Text worth moving once a slot is migrated: any with a letter left
   *  after the allowed phrases. */
  const movable = (c: string) => /\p{L}/u.test(verdict(c).rest);
  const resolved = resolveAllConfig(config);
  const page = { width: toMm(resolved.page.width) ?? 0, height: toMm(resolved.page.height) ?? 0 };
  const before = countContent(config, metadata);
  const bodyMm = toMm(resolved.bodyText.fontSize) ?? 4.2;
  const labelOpt = options.labelsOnPictures;
  const labelMaxMm = !labelOpt ? undefined : (typeof labelOpt === 'object' && labelOpt.maxFontSize ? toMm(labelOpt.maxFontSize, bodyMm) : undefined) ?? bodyMm * 0.75;
  const resourceById = new Map((input.resources ?? []).map((r) => [r.id, r] as const));
  const pictureSize = (id: string): { width: number; height: number } | undefined => {
    const r = resourceById.get(id);
    if (!r || (r.kind !== 'bitmap' && r.kind !== 'svg')) return undefined;
    const dims = r.kind === 'bitmap' ? r.bitmap : r.svg;
    return { width: dims?.width ?? 0, height: dims?.height ?? 0 };
  };

  // 1. Page designs: heading styles whose running heads hold content,
  // grouped by what those running heads draw.
  const styles = Array.isArray(config.headingStyles) ? config.headingStyles : [];
  const designs = new Map<string, Design>();
  const designOfStyle = new Map<string, Design>();
  const left: TextMigrationReport['left'] = [];
  styles.forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    const header = slotOf(s.header);
    const footer = slotOf(s.footer);
    const holds = (slot: DesignSlot | undefined) => !!slot && slot.elements.some((e) => e?.kind === 'text' && typeof e.content === 'string' && isContent(e.content));
    if (!holds(header) && !holds(footer)) {
      if (slotOf(s.advancedDesign?.slot) && holds(slotOf(s.advancedDesign?.slot))) left.push({ path: `headingStyles[${i}].advancedDesign.slot`, reason: 'notPage' });
      return;
    }
    const key = stableStringify({ header: header ?? null, footer: footer ?? null });
    let d = designs.get(key);
    if (!d) {
      const headerEls = header?.elements ?? [];
      const headerIds = new Set(headerEls.map((e) => e.id));
      // Footer elements whose id the header already uses are renamed.
      const footerEls = (footer?.elements ?? []).map((e) => (headerIds.has(e.id) ? ({ ...e, id: `${e.id}-footer` } as DesignElement) : e));
      const plan = planDesign({
        key,
        elements: [...headerEls, ...footerEls],
        origins: [...headerEls.map(() => 'header' as const), ...footerEls.map(() => 'footer' as const)],
        page,
        isContent: movable,
        chipStyles: config.chipStyles ?? [],
        highlightsToChips: highlights,
        merge,
        ...(labelMaxMm !== undefined ? { labelsOnPictures: { maxSizeMm: labelMaxMm, pictureSize } } : {}),
      });
      const roleFiltered = [...headerEls, ...footerEls].some((e) => typeof e.pages === 'string' && e.pages !== 'all');
      d = { key, styleIds: [], ownHeader: !!header, ownFooter: !!footer, plan, pages: 0, ...(roleFiltered ? { roleFiltered } : {}) };
      designs.set(key, d);
      for (const k of plan.kept) left.push({ path: `headingStyles[${i}] #${k.id}`, reason: k.reason });
    }
    d.styleIds.push(s.id);
    designOfStyle.set(s.id, d);
  });

  const styleById = new Map(styles.map((s) => [s.id, s] as const));
  const breakBefore = (h: HeadingLine): { enabled: boolean; parity: string } => {
    const st = h.attrs.style !== undefined ? styleById.get(h.attrs.style) : undefined;
    const level = resolved.headings.levels[h.level - 1];
    const own = st?.breakBefore;
    return {
      enabled: own?.enabled ?? level?.breakBefore.enabled ?? h.level === 1,
      parity: own?.parity ?? level?.breakBefore.parity ?? 'any',
    };
  };

  // 2. The runs of each chapter.
  const scans = input.chapters.map((ch) => ({
    chapter: ch,
    scan: scanChapter(ch.markdown, {
      designOf: (id) => designOfStyle.get(id)?.key,
      breaksPage: (h) => breakBefore(h).enabled,
    }),
  }));
  for (const { scan } of scans) for (const r of scan.runs) designs.get(r.design)!.pages += r.pages.length;

  const unused = [...designOfStyle.entries()].filter(([, d]) => d.pages === 0).map(([id]) => id);
  const usedDesigns = [...designs.values()].filter((d) => d.pages > 0);
  if (usedDesigns.length === 0 && (unused.length === 0 || options.unusedStyles !== 'remove')) {
    return {
      config,
      chapters: input.chapters.map((c) => ({ ...c })),
      unchanged: true,
      report: emptyReport(before, bytes(config), left, unused),
      ...(input.resources ? { resources: input.resources.map((r) => ({ ...r })) } : {}),
    };
  }

  // 3. Templates.
  const takenTemplates = new Set((config.pageTemplates ?? []).map((t) => t.id));
  const templates = buildTemplates(usedDesigns, share, takenTemplates);
  // A design whose elements show on some page roles only (`pages:
  // 'opener'`) keeps showing them where they showed: its pages' templates
  // report the role each page had (a composed page reports `'composed'`).
  const pageRole = (p: { startLine: number; headings: HeadingLine[] }): 'opener' | 'body' => {
    const h = p.headings[0];
    if (!h || h.line !== p.startLine) return 'body';
    const st = h.attrs.style !== undefined ? styleById.get(h.attrs.style) : undefined;
    const span = st?.span ?? resolved.headings.levels[h.level - 1]?.span;
    return span === 'page' || breakBefore(h).enabled ? 'opener' : 'body';
  };
  const roleTemplate = new Map<string, string>();
  const templateFor = (d: Design, p: { startLine: number; headings: HeadingLine[] }): string => {
    if (!d.roleFiltered) return d.template!;
    const role = pageRole(p);
    const key = `${d.template!}\n${role}`;
    const hit = roleTemplate.get(key);
    if (hit) return hit;
    const own = templates.list.find((t) => t.id === d.template)!;
    const sharedBy = usedDesigns.filter((x) => x.template === d.template).length;
    const extended = templates.list.some((t) => t.extends === d.template);
    let id: string;
    if (own.role === undefined && sharedBy === 1 && !extended && ![...roleTemplate.keys()].some((k) => k.startsWith(`${d.template!}\n`))) {
      own.role = role;
      id = own.id;
    } else if (own.role === role) {
      id = own.id;
    } else {
      id = freeId(`${own.id}-${role}`, takenTemplates);
      templates.list.push({ id, name: `${own.id} (${role})`, extends: own.id, role });
    }
    roleTemplate.set(key, id);
    return id;
  };

  // 4. Paragraph and chip styles.
  const paragraphStyles = (config.paragraphStyles ?? []).slice();
  const takenParagraph = new Set(paragraphStyles.map((p) => p.id));
  const createdParagraph: string[] = [];
  const reusedParagraph = new Set<string>();
  const styleCache = new Map<string, string>();
  const bodyColour = (config.bodyText?.color as { hex?: string } | undefined)?.hex?.toLowerCase();
  const paragraphStyleFor = (f: PlannedFrame): string => {
    const want = styleFields(f.look, f.gap);
    const key = stableStringify(want);
    const hit = styleCache.get(key);
    if (hit) return hit;
    const own = paragraphStyles.find((p) => sameStyle(p, want));
    if (own) {
      reusedParagraph.add(own.id);
      styleCache.set(key, own.id);
      return own.id;
    }
    const size = toMm(f.look.fontSize);
    const pt = size !== undefined ? Math.round((size * 72) / 25.4 * 10) / 10 : undefined;
    const hex = (f.look.color as { hex?: string } | undefined)?.hex?.toLowerCase();
    const parts = [
      slug(f.look.fontFamily ?? 'text') || 'text',
      pt !== undefined ? String(pt).replace('.', '-') : '',
      f.look.fontWeight >= 600 ? 'bold' : '',
      f.look.italic ? 'italic' : '',
      f.look.align !== 'left' && f.look.align !== 'start' ? f.look.align : '',
      hex && hex !== bodyColour ? hex.replace('#', '') : '',
    ].filter(Boolean);
    const id = freeId(parts.join('-'), takenParagraph);
    const name = [f.look.fontFamily ?? '', pt !== undefined ? `${pt} pt` : '', f.look.fontWeight >= 600 ? 'bold' : '', f.look.italic ? 'italic' : '', f.look.align, hex ?? '']
      .filter(Boolean).join(' ');
    paragraphStyles.push({ id, name, ...want });
    createdParagraph.push(id);
    styleCache.set(key, id);
    return id;
  };
  const chipStyles: ChipStyleConfig[] = (config.chipStyles ?? []).slice();
  const createdChips: string[] = [];
  for (const d of usedDesigns) {
    for (const [id, st] of d.plan.newChipStyles) {
      if (chipStyles.some((c) => c.id === id)) continue;
      chipStyles.push(st);
      createdChips.push(id);
    }
  }

  // 4b. Labels (#918): each label an anchor of its picture's resource, its
  // look a label style.
  const labelStyles: LabelStyle[] = (config.labelStyles ?? []).slice();
  const labels = placeLabels(usedDesigns, input.resources ?? [], labelStyles, resolved.page.dpi);

  // 5. The Markdown.
  const pages: MigratedPage[] = [];
  let headingsDropped = 0;
  const chapters = scans.map(({ chapter, scan }) => {
    const { lines } = scan;
    const lineStart: number[] = [];
    for (let i = 0, at = 0; i < lines.length; i++) {
      lineStart[i] = at;
      at += lines[i]!.length + 1;
    }
    const drop = new Set(scan.dropBreaks);
    const out: string[] = [];
    let fence = 0;
    let cursor = 0;
    const runsAt = new Map<number, DesignRun>(scan.runs.map((r) => [r.startLine, r]));
    while (cursor < lines.length) {
      const run = runsAt.get(cursor);
      if (!run) {
        if (!drop.has(cursor)) out.push(lines[cursor]!);
        cursor++;
        continue;
      }
      const d = designs.get(run.design)!;
      const firstBreak = breakBefore(run.pages[0]!.headings[0]!);
      run.pages.forEach((p, pi) => {
        const side = options.sideOf?.(chapter.id, lineStart[p.startLine]!) ?? heuristicSide(firstBreak.parity, pi);
        const written = writePage(d, templateFor(d, p), p, lines, side, styleById, paragraphStyleFor, labels.anchorOf);
        headingsDropped += written.dropped;
        if (out.length > 0 && out[out.length - 1]!.trim() !== '') out.push('');
        // A composed page starts a page but reads no heading's parity: the
        // side the opening heading asked for is a page break's.
        const parity = pi === 0 && firstBreak.enabled ? sideParity(firstBreak.parity) : undefined;
        if (parity) out.push(`:::pagebreak{parity="${parity}"}`, '');
        out.push(...written.lines, '');
        pages.push({
          chapterId: chapter.id,
          fence: fence++,
          template: written.template,
          styles: [...new Set(p.headings.map((h) => h.attrs.style).filter((s): s is string => s !== undefined))],
          ...(side ? { side } : {}),
          frames: written.frames,
          elements: written.elements,
          chars: written.chars,
          differences: written.differences,
        });
      });
      cursor = run.endLine + 1;
      // The blank line after the fence is written; skip the source's.
      while (cursor < lines.length && lines[cursor]!.trim() === '' && out[out.length - 1] === '') cursor++;
    }
    return { id: chapter.id, markdown: out.join('\n') };
  });

  // 6. Heading styles: the running heads are gone; styles left the same
  // are merged; unused ones go when asked.
  const migrated = new Set(usedDesigns.flatMap((d) => d.styleIds));
  const removeUnused = options.unusedStyles === 'remove';
  const removed: string[] = [];
  const stripped: HeadingStyleConfig[] = [];
  for (const s of styles) {
    if (removeUnused && unused.includes(s.id)) {
      removed.push(s.id);
      continue;
    }
    if (!migrated.has(s.id)) {
      stripped.push(s);
      continue;
    }
    const d = designOfStyle.get(s.id)!;
    const copy = { ...s };
    if (d.ownHeader) delete copy.header;
    if (d.ownFooter) delete copy.footer;
    stripped.push(copy);
  }
  const { styles: mergedStyles, renames, merged } = mergeStyles(stripped, migrated);
  const finalChapters = chapters.map((c) => ({ ...c, markdown: renameStyles(c.markdown, renames) }));
  for (const p of pages) p.styles = p.styles.map((s) => renames.get(s) ?? s);

  const next: PostextConfig = {
    ...config,
    headingStyles: mergedStyles,
    paragraphStyles,
    ...(chipStyles.length > 0 ? { chipStyles } : {}),
    ...(labelStyles.length > 0 ? { labelStyles } : {}),
    pageTemplates: [...(config.pageTemplates ?? []), ...templates.list],
  };
  for (const id of unused) if (!removeUnused) left.push({ path: `headingStyles[id=${id}]`, reason: 'unused' });

  const report: TextMigrationReport = {
    pages,
    templates: templates.list.map((t) => ({
      id: t.id,
      ...(t.extends ? { extends: t.extends } : {}),
      frames: (t.frames?.length ?? 0) + (t.variants?.recto?.frames?.length ?? 0) + (t.variants?.verso?.frames?.length ?? 0),
      pages: pages.filter((p) => p.template === t.id).length,
    })),
    movedElements: usedDesigns.reduce((n, d) => n + d.plan.movedElements, 0),
    movedChars: usedDesigns.reduce((n, d) => n + d.plan.movedChars, 0),
    chips: usedDesigns.reduce((n, d) => n + d.plan.chips, 0),
    frames: usedDesigns.reduce((n, d) => n + d.plan.frames.length, 0),
    paragraphStylesCreated: createdParagraph,
    paragraphStylesReused: [...reusedParagraph],
    chipStylesCreated: createdChips,
    headingStylesMerged: merged,
    headingStylesRemoved: removed,
    unusedStyles: unused,
    headingsDropped,
    left,
    configBytesBefore: bytes(config),
    configBytesAfter: bytes(next),
    contentInConfigBefore: before,
    contentInConfigAfter: countContent(next, metadata),
    labels: labels.report,
  };
  return {
    config: next, chapters: finalChapters, report, unchanged: false,
    ...(input.resources ? { resources: labels.resources } : {}),
  };
}

/** The page break parity of a heading's `breakBefore.parity`. */
function sideParity(parity: string): 'even' | 'odd' | undefined {
  return parity === 'even' || parity === 'always-even' ? 'even' : parity === 'odd' || parity === 'always-odd' ? 'odd' : undefined;
}

/** The side of a run's `index`-th page from its opening heading's parity. */
function heuristicSide(parity: string, index: number): PageSide | undefined {
  const first: PageSide | undefined = parity === 'even' || parity === 'always-even' ? 'verso' : parity === 'odd' || parity === 'always-odd' ? 'recto' : undefined;
  if (!first) return undefined;
  return index % 2 === 0 ? first : first === 'recto' ? 'verso' : 'recto';
}

/** Migrated heading styles that came out the same are one: the id their
 *  ids share before `--` when it is free (`tema--p04`, `tema--p05` →
 *  `tema`), else the first one's. */
function mergeStyles(styles: HeadingStyleConfig[], migrated: Set<string>): { styles: HeadingStyleConfig[]; renames: Map<string, string>; merged: { into: string; from: string[] }[] } {
  const groups = new Map<string, HeadingStyleConfig[]>();
  for (const s of styles) {
    if (!migrated.has(s.id)) continue;
    const prefix = s.id.includes('--') ? s.id.slice(0, s.id.lastIndexOf('--')) : s.id;
    const key = `${prefix}\n${stableStringify(s, new Set(['id', 'name']))}`;
    const g = groups.get(key) ?? [];
    g.push(s);
    groups.set(key, g);
  }
  const ids = new Set(styles.map((s) => s.id));
  const renames = new Map<string, string>();
  const merged: { into: string; from: string[] }[] = [];
  const keepAs = new Map<string, HeadingStyleConfig>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const prefixes = new Set(g.map((s) => (s.id.includes('--') ? s.id.slice(0, s.id.lastIndexOf('--')) : null)));
    const prefix = prefixes.size === 1 ? [...prefixes][0] : null;
    const into = prefix && (!ids.has(prefix) || g.some((s) => s.id === prefix)) ? prefix : g[0]!.id;
    ids.add(into);
    const kept: HeadingStyleConfig = { ...g[0]!, id: into, name: into === g[0]!.id ? (g[0]!.name ?? into) : into };
    keepAs.set(g[0]!.id, kept);
    const from = g.map((s) => s.id).filter((id) => id !== into);
    for (const s of g) if (s.id !== into) renames.set(s.id, into);
    merged.push({ into, from });
  }
  const grouped = new Set(merged.flatMap((m) => [m.into, ...m.from]));
  const out: HeadingStyleConfig[] = [];
  for (const s of styles) {
    const kept = keepAs.get(s.id);
    if (kept) out.push(kept);
    else if (!grouped.has(s.id)) out.push(s);
  }
  return { styles: out, renames, merged };
}

/** `style="old"` on a heading line names the merged style. */
function renameStyles(markdown: string, renames: Map<string, string>): string {
  if (renames.size === 0) return markdown;
  return markdown.split('\n').map((line) => {
    if (!/^#{1,6}[ \t]/.test(line) || !line.trimEnd().endsWith('}')) return line;
    return line.replace(/(\bstyle\s*=\s*)("([^"]*)"|'([^']*)'|([^\s}"']+))/, (m, pre: string, _v: string, a?: string, b?: string, c?: string) => {
      const id = a ?? b ?? c ?? '';
      const to = renames.get(id);
      return to ? `${pre}"${to}"` : m;
    });
  }).join('\n');
}
