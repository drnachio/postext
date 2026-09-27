import { describe, it, expect } from 'vitest';
import { resolveHeadingsConfig, stripHeadingsDefaults } from '../../defaults/headings';
import { resolveAllConfig } from '../../pipeline/config';
import { createHeadingLevelResolver } from '../../pipeline/headingStyles';
import { buildDocument } from '../../pipeline';
import type { PostextConfig } from '../../types';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });

describe('heading breakBefore defaults (EF-05)', () => {
  it('keeps the H1 always-odd break when a headings object sets other fields', () => {
    expect(resolveHeadingsConfig({ fontFamily: 'Merriweather' }).levels[0]!.breakBefore)
      .toEqual({ enabled: true, parity: 'always-odd' });
    expect(resolveHeadingsConfig({ levels: [{ level: 1, fontSize: pt(24) }] }).levels[0]!.breakBefore)
      .toEqual({ enabled: true, parity: 'always-odd' });
    expect(resolveHeadingsConfig({}).levels[0]!.breakBefore)
      .toEqual({ enabled: true, parity: 'always-odd' });
  });

  it('merges a partial breakBefore onto the level default, field by field', () => {
    const levels = resolveHeadingsConfig({
      levels: [
        { level: 1, breakBefore: { parity: 'odd' } },
        { level: 2, breakBefore: { enabled: true } },
      ],
    }).levels;
    expect(levels[0]!.breakBefore).toEqual({ enabled: true, parity: 'odd' });
    expect(levels[1]!.breakBefore).toEqual({ enabled: true, parity: 'any' });
    expect(resolveHeadingsConfig({ levels: [{ level: 1, breakBefore: { enabled: false } }] }).levels[0]!.breakBefore)
      .toEqual({ enabled: false, parity: 'always-odd' });
  });

  it('keeps an explicit H1 break switched off when stripping defaults', () => {
    const stripped = stripHeadingsDefaults({ levels: [{ level: 1, breakBefore: { enabled: false } }] });
    expect(stripped).toEqual({ levels: [{ level: 1, breakBefore: { enabled: false } }] });
    expect(resolveHeadingsConfig(stripped).levels[0]!.breakBefore.enabled).toBe(false);
  });

  it('strips H2–H6 breaks exactly as before and keeps an H1 break that restates its default', () => {
    expect(stripHeadingsDefaults({ levels: [{ level: 2, breakBefore: { enabled: false, parity: 'any' } }] })).toBeUndefined();
    // Saved configs restate the H1 break; they strip (and hash) as they did.
    expect(stripHeadingsDefaults({ levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] }))
      .toEqual({ levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] });
  });

  it('merges a heading style breakBefore onto the level break', () => {
    const resolved = resolveAllConfig({
      headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] },
      headingStyles: [
        { id: 'parity-only', breakBefore: { parity: 'even' } },
        { id: 'enabled-only', breakBefore: { enabled: true } },
        { id: 'off', breakBefore: { enabled: false } },
      ],
    });
    const levels = createHeadingLevelResolver(resolved);
    expect(levels.forLevel(1, 'parity-only')!.breakBefore).toEqual({ enabled: true, parity: 'even' });
    expect(levels.forLevel(1, 'enabled-only')!.breakBefore).toEqual({ enabled: true, parity: 'odd' });
    expect(levels.forLevel(1, 'off')!.breakBefore).toEqual({ enabled: false, parity: 'odd' });
    expect(levels.forLevel(2, 'enabled-only')!.breakBefore).toEqual({ enabled: true, parity: 'any' });
  });

  it('opens every chapter on a recto when the config carries a headings object', () => {
    const config: PostextConfig = {
      page: { width: pt(360), height: pt(240), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
      headings: { fontFamily: 'Merriweather' },
    };
    const doc = buildDocument({ markdown: '# One\n\nShort text.\n\n# Two\n\nMore text.' }, config);
    const twoPage = doc.blocks.find((b) => b.type === 'heading' && b.lines.some((l) => l.text.includes('Two')))!.pageIndex;
    // always-odd: a mandatory blank after chapter one, then a recto.
    expect(twoPage).toBe(2);
    expect(doc.pages[1]!.blankForForce || doc.pages[1]!.blankForParity).toBe(true);
  });
});
