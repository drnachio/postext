// Warnings on the design: box, part and heading slots, break parity,
// config values, letter overflow and a list right after a heading
// (#1276: split out of compute.ts).
import { type PostextConfig, resolveHeadingsConfig, resolveHeaderFooterConfig, resolveDesignSlot, type ResolvedDesignSlot, type Resource, collectConfigWarnings, type VDTDocument, type ContentBlock } from 'postext';
import type { Warning, WarningPayload } from '../types.js';
import { detectAnchorIssues } from './content.js';
import { lineNumberForOffset } from './layout.js';

export function collectDesignWarnings(config: PostextConfig): Warning[] {
  const out: Warning[] = [];
  const headings = resolveHeadingsConfig(config.headings);

  // Header/footer anchor integrity
  for (const slot of ['header', 'footer'] as const) {
    const resolved = resolveHeaderFooterConfig(config[slot], slot);
    const { cyclic, dangling } = detectAnchorIssues(resolved.elements);
    for (const id of cyclic) {
      out.push({
        id: `design-cyclic-${slot}-${id}`,
        payload: { kind: 'designCyclicAnchor', slot, elementId: id },
      });
    }
    for (const d of dangling) {
      out.push({
        id: `design-dangling-${slot}-${d.id}-${d.target}`,
        payload: { kind: 'designDanglingAnchor', slot, elementId: d.id, referencedId: d.target },
      });
    }
  }

  // Part opener anchor integrity
  {
    const part = resolveDesignSlot(config.parts?.design, 'part');
    const { cyclic, dangling } = detectAnchorIssues(part.elements);
    for (const id of cyclic) {
      out.push({
        id: `design-cyclic-part-${id}`,
        payload: { kind: 'designCyclicAnchor', slot: 'part', elementId: id },
      });
    }
    for (const d of dangling) {
      out.push({
        id: `design-dangling-part-${d.id}-${d.target}`,
        payload: { kind: 'designDanglingAnchor', slot: 'part', elementId: d.id, referencedId: d.target },
      });
    }
  }

  // Heading-level warnings
  for (const lvl of headings.levels) {
    if (lvl.span === 'page' && !lvl.breakBefore.enabled) {
      out.push({
        id: `h-span-without-break-${lvl.level}`,
        payload: { kind: 'headingSpanWithoutBreak', level: lvl.level },
      });
    }
    if (lvl.advancedDesign.enabled) {
      const slot = lvl.advancedDesign.slot;
      const { cyclic, dangling } = detectAnchorIssues(slot.elements);
      for (const id of cyclic) {
        out.push({
          id: `design-cyclic-h${lvl.level}-${id}`,
          payload: { kind: 'designCyclicAnchor', slot: 'heading', level: lvl.level, elementId: id },
        });
      }
      for (const d of dangling) {
        out.push({
          id: `design-dangling-h${lvl.level}-${d.id}-${d.target}`,
          payload: {
            kind: 'designDanglingAnchor',
            slot: 'heading',
            level: lvl.level,
            elementId: d.id,
            referencedId: d.target,
          },
        });
      }
      const hasTitleText = slot.elements.some(
        (e) => e.kind === 'text' && e.content.includes('{titleText}'),
      );
      if (!hasTitleText) {
        out.push({
          id: `h-advanced-no-title-${lvl.level}`,
          payload: { kind: 'headingAdvancedWithoutTitleText', level: lvl.level },
        });
      }
    }
  }

  // The part's verso and the contents' part rows.
  for (const s of partRowSlots(config)) {
    const { cyclic, dangling } = detectAnchorIssues(s.elements);
    for (const id of cyclic) {
      out.push({
        id: `design-cyclic-${s.tag}-${id}`,
        payload: { kind: 'designCyclicAnchor', slot: 'part', configPath: s.configPath, elementId: id },
      });
    }
    for (const d of dangling) {
      out.push({
        id: `design-dangling-${s.tag}-${d.id}-${d.target}`,
        payload: { kind: 'designDanglingAnchor', slot: 'part', configPath: s.configPath, elementId: d.id, referencedId: d.target },
      });
    }
  }

  // Heading styles: their designs and their sections' running heads (EF-134).
  for (const s of headingStyleSlots(config)) {
    const { cyclic, dangling } = detectAnchorIssues(s.elements);
    const tag = `style-${s.styleId}-${s.slot}`;
    for (const id of cyclic) {
      out.push({
        id: `design-cyclic-${tag}-${id}`,
        payload: { kind: 'designCyclicAnchor', slot: s.slot, styleId: s.styleId, elementId: id },
      });
    }
    for (const d of dangling) {
      out.push({
        id: `design-dangling-${tag}-${d.id}-${d.target}`,
        payload: { kind: 'designDanglingAnchor', slot: s.slot, styleId: s.styleId, elementId: d.id, referencedId: d.target },
      });
    }
  }

  // Box styles' designs (#1014), drawn like a heading style's.
  for (const s of boxStyleSlots(config)) {
    const { cyclic, dangling } = detectAnchorIssues(s.elements);
    const tag = `box-style-${s.styleId}`;
    for (const id of cyclic) {
      out.push({
        id: `design-cyclic-${tag}-${id}`,
        payload: { kind: 'designCyclicAnchor', slot: 'box', styleId: s.styleId, elementId: id },
      });
    }
    for (const d of dangling) {
      out.push({
        id: `design-dangling-${tag}-${d.id}-${d.target}`,
        payload: { kind: 'designDanglingAnchor', slot: 'box', styleId: s.styleId, elementId: d.id, referencedId: d.target },
      });
    }
  }

  return out;
}

/** The designs of the box styles (`calloutStyles[].design`, #1014) that are
 *  drawn: set, not switched off, as the engine resolves them. A style that
 *  inherits its design (`extends`) is checked once, in its parent. */
export function boxStyleSlots(config: PostextConfig): Array<{ styleId: string; elements: ResolvedDesignSlot['elements'] }> {
  const out: ReturnType<typeof boxStyleSlots> = [];
  for (const style of config.calloutStyles ?? []) {
    if (!style || typeof style.id !== 'string' || !style.design || style.design.enabled === false) continue;
    out.push({ styleId: style.id, elements: resolveDesignSlot(style.design.slot ?? { elements: [] }, 'box').elements });
  }
  return out;
}

/** The design slots laid out with a part's placeholders besides the part
 *  opener (`parts.design`): the blank verso after a part page and the part
 *  rows of the contents. Only those that are set: an empty slot draws
 *  nothing (the verso) or the engine's own default row. */
export function partRowSlots(config: PostextConfig): Array<{
  configPath: 'parts.versoDesign' | 'toc.parts.design';
  tag: string;
  elements: ResolvedDesignSlot['elements'];
}> {
  const out: ReturnType<typeof partRowSlots> = [];
  if (config.parts?.versoDesign) {
    out.push({ configPath: 'parts.versoDesign', tag: 'part-verso', elements: resolveDesignSlot(config.parts.versoDesign, 'part').elements });
  }
  if (config.toc?.parts?.design) {
    out.push({ configPath: 'toc.parts.design', tag: 'toc-part', elements: resolveDesignSlot(config.toc.parts.design, 'tocRow').elements });
  }
  return out;
}

/** The design slots of the heading styles, as the engine resolves them: a
 *  style's design when it is switched on (drawn like a heading level's),
 *  and the running heads of the section the style opens. */
export function headingStyleSlots(config: PostextConfig): Array<{
  styleId: string;
  slot: 'heading' | 'header' | 'footer';
  elements: ResolvedDesignSlot['elements'];
}> {
  const out: ReturnType<typeof headingStyleSlots> = [];
  for (const style of config.headingStyles ?? []) {
    if (!style || typeof style.id !== 'string') continue;
    if (style.advancedDesign?.enabled) {
      out.push({ styleId: style.id, slot: 'heading', elements: resolveDesignSlot(style.advancedDesign.slot, style.advancedDesign.slot === undefined ? 'header' : 'heading').elements });
    }
    if (style.header) out.push({ styleId: style.id, slot: 'header', elements: resolveDesignSlot(style.header, 'header').elements });
    if (style.footer) out.push({ styleId: style.id, slot: 'footer', elements: resolveDesignSlot(style.footer, 'footer').elements });
  }
  return out;
}

export function collectHeadingBreakParityWarnings(config: PostextConfig): Warning[] {
  const out: Warning[] = [];
  const headings = resolveHeadingsConfig(config.headings);
  for (const lvl of headings.levels) {
    const parity = lvl.breakBefore.parity;
    if (parity !== 'any' && parity !== 'odd' && parity !== 'even' && parity !== 'always-odd' && parity !== 'always-even') {
      out.push({
        id: `h-break-parity-${lvl.level}`,
        payload: { kind: 'headingBreakInvalidParity', level: lvl.level, value: String(parity) },
      });
    }
  }
  return out;
}

/** Config values the engine replaces (see `collectConfigWarnings`): a CSS
 *  font stack in a font-family field, an unknown numbering format, a
 *  one-and-a-half layout's side column that leaves a column with no width,
 *  a heading setting the engine does not know. */
export function collectConfigValueWarnings(config: PostextConfig, resources: readonly Resource[], metadata?: Record<string, unknown>): Warning[] {
  return collectConfigWarnings(config, { resources, ...(metadata ? { metadata } : {}) }).map((w): Warning => ({
    id: `config-${w.kind}-${w.path}`,
    // Text held in a design (#849): the setting, its texts and a sample.
    payload: w.kind === 'contentInConfig'
      ? { kind: 'contentInConfig', path: w.path, ...(w.ownerId !== undefined ? { ownerId: w.ownerId } : {}), count: w.count ?? 1, chars: w.chars ?? 0, elements: w.elements ?? [], sample: w.value }
      : { kind: w.kind, path: w.path, value: w.value, used: w.used, ...(w.suggestion ? { suggestion: w.suggestion } : {}), ...(w.resourceId !== undefined ? { resourceId: w.resourceId } : {}) } as WarningPayload,
  }));
}

export function collectParityCascadeWarnings(doc: VDTDocument | null): Warning[] {
  if (!doc) return [];
  const out: Warning[] = [];
  let run = 0;
  let runStartIndex = -1;
  let idx = 0;
  for (let i = 0; i < doc.pages.length; i++) {
    if (doc.pages[i]!.blankForParity) {
      if (run === 0) runStartIndex = i;
      run++;
    } else {
      if (run > 2) {
        out.push({
          id: `parity-cascade-${idx++}-${runStartIndex}`,
          payload: { kind: 'parityCascade', runLength: run },
        });
      }
      run = 0;
    }
  }
  if (run > 2) {
    out.push({
      id: `parity-cascade-${idx++}-${runStartIndex}`,
      payload: { kind: 'parityCascade', runLength: run },
    });
  }
  return out;
}

export function collectAlphaOverflowWarnings(doc: VDTDocument | null): Warning[] {
  if (!doc) return [];
  const hasOverflow = doc.pages.some(
    (p) =>
      (p.pageNumberFormat === 'upper-alpha' || p.pageNumberFormat === 'lower-alpha')
      && p.pageNumberValue > 26,
  );
  return hasOverflow
    ? [{ id: 'alpha-pdf-overflow', payload: { kind: 'alphaPdfOverflow' } }]
    : [];
}

export function collectListAfterHeadingWarnings(blocks: ContentBlock[], markdown: string): Warning[] {
  const out: Warning[] = [];
  let idx = 0;
  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1]!;
    const curr = blocks[i]!;
    if (prev.type === 'heading' && curr.type === 'listItem') {
      out.push({
        id: `list-after-h-${idx++}-${curr.sourceStart}`,
        payload: { kind: 'listAfterHeading' },
        sourceStart: curr.sourceStart,
        sourceEnd: curr.sourceEnd,
        line: lineNumberForOffset(markdown, curr.sourceStart),
      });
    }
  }
  return out;
}
