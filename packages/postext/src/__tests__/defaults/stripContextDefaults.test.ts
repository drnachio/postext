import { describe, it, expect } from 'vitest';
import { balancingOnByDefault, stripConfigDefaults, stripHeadingsDefaults } from '../../defaults';
import * as configVersion from '../../bundle/configVersion';
import { resolveAllConfig } from '../../pipeline/config';
import type { DesignElement, DesignSlot, PostextConfig } from '../../types';

// #651: a default that depends on the rest of the configuration is the
// default of that configuration. `stripConfigDefaults` dropped every value
// equal to the default of a plain document, so the one value that turned
// column balancing on for a character grid or for vertical text was lost
// on the way to a bundle or to the Sandbox's storage.

const GRID = { enabled: true, charsPerLine: 26, linesPerPage: 24 };
const CONTEXTS: Record<string, PostextConfig> = {
  horizontal: {},
  grid: { cjk: { grid: GRID } },
  vertical: { layout: { writingMode: 'vertical-rl' } },
  verticalGrid: { layout: { writingMode: 'vertical-rl' }, cjk: { grid: GRID } },
};
const withBalancing = (context: PostextConfig, balancing: NonNullable<PostextConfig['headings']>['balancing']): PostextConfig => ({
  ...context,
  headings: { balancing },
});

describe('stripConfigDefaults and the balancing default of the document (#651)', () => {
  it('keeps balancing turned on where it is off by default', () => {
    for (const name of ['grid', 'vertical', 'verticalGrid']) {
      const config = withBalancing(CONTEXTS[name]!, { enabled: true });
      expect(balancingOnByDefault(config), name).toBe(false);
      expect(stripConfigDefaults(config), name).toEqual(config);
      expect(resolveAllConfig(stripConfigDefaults(config)).headings.balancing.enabled, name).toBe(true);
    }
  });

  it('drops it on a plain horizontal page, where it is the default', () => {
    expect(stripConfigDefaults(withBalancing({}, { enabled: true }))).toEqual({});
    expect(stripConfigDefaults({ cjk: { grid: { ...GRID, enabled: false } }, headings: { balancing: { enabled: true } } }).headings).toBeUndefined();
  });

  it('keeps balancing turned off where it is on by default, and drops it where it is off', () => {
    const horizontal = withBalancing({}, { enabled: false });
    expect(stripConfigDefaults(horizontal)).toEqual(horizontal);
    for (const name of ['grid', 'vertical', 'verticalGrid']) {
      const context = CONTEXTS[name]!;
      expect(stripConfigDefaults(withBalancing(context, { enabled: false })), name).toEqual(context);
    }
  });

  it('keeps the other balancing settings beside the one it drops', () => {
    const stripped = stripConfigDefaults(withBalancing(CONTEXTS.grid!, { enabled: false, maxTracking: 40, trailing: true }));
    expect(stripped.headings).toEqual({ balancing: { maxTracking: 40 } });
    expect(stripConfigDefaults(withBalancing(CONTEXTS.grid!, { enabled: true, maxTracking: 40 })).headings)
      .toEqual({ balancing: { enabled: true, maxTracking: 40 } });
  });

  it('keeps gridLines off, in every context', () => {
    for (const [name, context] of Object.entries(CONTEXTS)) {
      const config = withBalancing(context, { gridLines: 'off' });
      expect(stripConfigDefaults(config).headings, name).toEqual({ balancing: { gridLines: 'off' } });
    }
    expect(stripConfigDefaults(withBalancing(CONTEXTS.grid!, { enabled: true, gridLines: 'off' })).headings)
      .toEqual({ balancing: { enabled: true, gridLines: 'off' } });
    // `'allow'` is the default.
    expect(stripConfigDefaults(withBalancing(CONTEXTS.grid!, { gridLines: 'allow' })).headings).toBeUndefined();
  });

  it('resolves the stripped configuration like the one it was given', () => {
    for (const [name, context] of Object.entries(CONTEXTS)) {
      for (const enabled of [true, false, undefined]) {
        for (const gridLines of ['off', 'allow', undefined] as const) {
          const config = withBalancing(context, {
            ...(enabled !== undefined ? { enabled } : {}),
            ...(gridLines ? { gridLines } : {}),
            maxLinesPerHeading: 2,
          });
          const stripped = stripConfigDefaults(config);
          expect(resolveAllConfig(stripped), `${name} ${enabled} ${gridLines}`).toEqual(resolveAllConfig(config));
          // The strip does not change what the default is, and a second
          // pass changes nothing.
          expect(balancingOnByDefault(stripped), name).toBe(balancingOnByDefault(config));
          expect(stripConfigDefaults(stripped), name).toEqual(stripped);
        }
      }
    }
  });

  it('stripHeadingsDefaults takes the default of the document, on unless told', () => {
    expect(stripHeadingsDefaults({ balancing: { enabled: true } })).toBeUndefined();
    expect(stripHeadingsDefaults({ balancing: { enabled: false } })).toEqual({ balancing: { enabled: false } });
    expect(stripHeadingsDefaults({ balancing: { enabled: true } }, false)).toEqual({ balancing: { enabled: true } });
    expect(stripHeadingsDefaults({ balancing: { enabled: false } }, false)).toBeUndefined();
    expect(stripHeadingsDefaults({ balancing: { enabled: true } }, true)).toBeUndefined();
  });
});

// A pin writes the value an older version laid a document out with; the
// first save strips the configuration and stamps it current, so a pin the
// strip drops is lost for good.
describe('every legacy pin survives the strip (#651)', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const text = (id: string): DesignElement => ({
    kind: 'text', id, content: '{titleText}', fontSize: pt(10),
    placement: { anchor: { to: 'container', edge: 'top-left' } },
  } as DesignElement);
  const slot = (...elements: DesignElement[]): DesignSlot => ({ elements });
  const stored = (context: PostextConfig): PostextConfig => ({
    header: slot(text('rh')),
    headings: { levels: [{ level: 1, span: 'page', advancedDesign: { enabled: true, slot: slot(text('title')) } }, { level: 2 }] },
    headingStyles: [{ id: 'appendix', advancedDesign: { enabled: true, slot: slot(text('title')) } }],
    parts: { design: slot(text('partTitle')), versoDesign: slot(text('verso')) },
    paragraphStyles: [{ id: 'hang', name: 'Hang', firstLineIndent: pt(10), hangingIndent: pt(12) }, { id: 'ragged', name: 'Ragged', textAlign: 'left' }],
    math: { enabled: true },
    bodyText: { textAlign: 'left', verse: {} },
    ...context,
  } as PostextConfig);
  const pins = Object.entries(configVersion)
    .filter((entry): entry is [string, (config: PostextConfig) => PostextConfig] => entry[0].startsWith('pinLegacy') && typeof entry[1] === 'function');
  const contexts: Record<string, PostextConfig> = {
    horizontal: {},
    grid: { locale: 'zh-Hans', cjk: { grid: GRID } },
    vertical: { locale: 'zh-Hant', layout: { writingMode: 'vertical-rl' } },
    japanese: { locale: 'ja' },
    arabic: { locale: 'ar' },
  };

  it('finds the pins', () => {
    expect(pins.length).toBeGreaterThanOrEqual(24);
    expect(pins.map(([name]) => name)).toContain('pinLegacyGridBalancing');
  });

  for (const [name, context] of Object.entries(contexts)) {
    it(`each pin alone, ${name}`, () => {
      for (const base of [stored(context), context]) {
        for (const [pinName, pin] of pins) {
          const pinned = pin(base);
          if (pinned === base) continue;
          expect(resolveAllConfig(stripConfigDefaults(pinned)), pinName).toEqual(resolveAllConfig(pinned));
        }
      }
    });

    it(`a stored configuration of every version, ${name}`, () => {
      for (const base of [stored(context), context]) {
        for (const version of [undefined, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
          const migrated = configVersion.migrateConfig(base, version);
          const saved = stripConfigDefaults(migrated);
          // Read back under the current stamp: nothing pins it again.
          const reloaded = configVersion.migrateConfig(saved, configVersion.CONFIG_VERSION);
          expect(reloaded).toBe(saved);
          expect(resolveAllConfig(reloaded), String(version)).toEqual(resolveAllConfig(migrated));
        }
      }
    });
  }
});
