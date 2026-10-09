import { describe, it, expect } from 'vitest';
import { CONFIG_VERSION, migrateBundleConfig, migrateConfig, pinLegacyDesignOverflow } from '../../bundle/configVersion';
import { resolveAllConfig } from '../../pipeline/config';
import type { DesignElement, DesignSlot, PostextConfig, ResolvedDesignSlot, ResolvedDesignTextElement, TextOverflow } from '../../types';

// #628: a configuration stored before the heading and part designs wrapped
// by default (configVersion 9 or older, postext 1.23 or earlier) keeps the
// ellipsis on every such text element that sets no `overflow`.

const pt = (value: number) => ({ value, unit: 'pt' as const });
const text = (id: string, overflow?: TextOverflow): DesignElement => ({
  kind: 'text', id, content: '{titleText}', fontSize: pt(10),
  placement: { anchor: { to: 'container', edge: 'top-left' } },
  ...(overflow ? { overflow } : {}),
} as DesignElement);
const rule: DesignElement = { kind: 'rule', id: 'r', placement: { anchor: { to: 'container', edge: 'top' } } } as DesignElement;
const slot = (...elements: DesignElement[]): DesignSlot => ({ elements });

const stored = (): PostextConfig => ({
  header: slot(text('rh')),
  footer: slot(text('folio')),
  headings: { levels: [{ level: 1, advancedDesign: { enabled: true, slot: slot(text('title'), text('kicker', 'clip'), rule) } }, { level: 2 }] },
  headingStyles: [
    { id: 'appendix', advancedDesign: { enabled: true, slot: slot(text('title')) }, header: slot(text('styleHead')) },
    { id: 'plain' },
  ],
  parts: { design: slot(text('partTitle'), text('partNumber', 'wrap')), versoDesign: slot(text('verso')) },
  toc: { parts: { design: slot(text('rowTitle')) } },
  htmlViewer: { overrides: { headings: { levels: [{ level: 1, advancedDesign: { enabled: true, slot: slot(text('screenTitle')) } }] }, parts: { design: slot(text('screenPart')) } } },
});

const overflowOf = (s: DesignSlot | undefined, id: string) =>
  (s?.elements.find((e) => (e as { id?: string }).id === id) as { overflow?: string } | undefined)?.overflow;

describe('pinLegacyDesignOverflow (#628)', () => {
  it('writes the ellipsis on exactly the heading and part texts that set no overflow', () => {
    const config = stored();
    const out = migrateConfig(config, 9);
    const lvl = out.headings!.levels![0]!.advancedDesign!.slot;
    expect(overflowOf(lvl, 'title')).toBe('ellipsis-end');
    expect(overflowOf(lvl, 'kicker')).toBe('clip');
    expect(lvl!.elements[2]).toBe(rule);
    expect(overflowOf(out.headingStyles![0]!.advancedDesign!.slot, 'title')).toBe('ellipsis-end');
    expect(out.headingStyles![1]).toBe(config.headingStyles![1]);
    expect(overflowOf(out.parts!.design, 'partTitle')).toBe('ellipsis-end');
    expect(overflowOf(out.parts!.design, 'partNumber')).toBe('wrap');
    expect(overflowOf(out.parts!.versoDesign, 'verso')).toBe('ellipsis-end');
    expect(overflowOf(out.htmlViewer!.overrides!.headings!.levels![0]!.advancedDesign!.slot, 'screenTitle')).toBe('ellipsis-end');
    expect(overflowOf(out.htmlViewer!.overrides!.parts!.design, 'screenPart')).toBe('ellipsis-end');
    // Running heads, a style's own and the contents rows keep the ellipsis
    // by default: left as they were.
    expect(out.header).toBe(config.header);
    expect(out.footer).toBe(config.footer);
    expect(out.headingStyles![0]!.header).toBe(config.headingStyles![0]!.header);
    expect(out.toc).toBe(config.toc);
    // The stored configuration is not touched.
    expect(overflowOf(config.parts!.design, 'partTitle')).toBeUndefined();
  });

  it('resolves to the overflow 1.23 laid out', () => {
    const resolved = resolveAllConfig(migrateConfig(stored(), 8));
    const overflow = (s: ResolvedDesignSlot | undefined) => (s?.elements.filter((e) => e.kind === 'text') as ResolvedDesignTextElement[]).map((e) => e.overflow);
    expect(overflow(resolved.headings.levels[0]!.advancedDesign.slot)).toEqual(['ellipsis-end', 'clip']);
    expect(overflow(resolved.parts.design)).toEqual(['ellipsis-end', 'wrap']);
    expect(overflow(resolved.parts.versoDesign)).toEqual(['ellipsis-end']);
    expect(overflow(resolved.toc.parts.design)).toEqual(['ellipsis-end']);
    const fresh = resolveAllConfig(stored());
    expect(overflow(fresh.headings.levels[0]!.advancedDesign.slot)).toEqual(['wrap', 'clip']);
    expect(overflow(fresh.parts.design)).toEqual(['wrap', 'wrap']);
  });

  it('pins every version before 10, none from 10', () => {
    expect(CONFIG_VERSION).toBe(10);
    for (const v of [undefined, 1, 5, 8, 9]) {
      expect(overflowOf(migrateConfig(stored(), v).parts!.design, 'partTitle'), String(v)).toBe('ellipsis-end');
    }
    const current = stored();
    expect(migrateConfig(current, 10)).toBe(current);
  });

  it('returns the same object when nothing needs the pin', () => {
    const none: PostextConfig = {
      header: slot(text('rh')),
      headings: { levels: [{ level: 1, advancedDesign: { enabled: true, slot: slot(text('t', 'wrap')) } }] },
      parts: { design: slot(text('p', 'ellipsis-start')) },
      toc: { parts: { design: slot(text('row')) } },
    };
    expect(pinLegacyDesignOverflow(none)).toBe(none);
    expect(pinLegacyDesignOverflow({})).toEqual({});
  });

  it('pins the merged layers of a bundle', () => {
    const merged = migrateBundleConfig({}, [{ parts: { design: slot(text('a')) } }, { headings: { levels: [{ level: 1, advancedDesign: { enabled: true, slot: slot(text('b')) } }] } }], 9);
    expect(overflowOf(merged.parts!.design, 'a')).toBe('ellipsis-end');
    expect(overflowOf(merged.headings!.levels![0]!.advancedDesign!.slot, 'b')).toBe('ellipsis-end');
  });
});
