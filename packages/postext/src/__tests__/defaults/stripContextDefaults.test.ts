import { describe, it, expect } from 'vitest';
import { balancingOnByDefault, stripConfigDefaults, stripHeadingsDefaults, stripIndexDefaults, stripPageDefaults } from '../../defaults';
import * as configVersion from '../../bundle/configVersion';
import { resolveAllConfig } from '../../pipeline/config';
import { stableStringify } from '../../util/stableHash';
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
const roundTrips = (config: PostextConfig) =>
  expect(resolveAllConfig(stripConfigDefaults(config))).toEqual(resolveAllConfig(config));

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

describe('the other defaults that follow the configuration (#651)', () => {
  it('keeps the index separators and label italics that are no default in its language', () => {
    const arabic: PostextConfig = { locale: 'ar', index: { separator: ', ', locatorSeparator: ', ', see: { italic: true } } };
    expect(stripConfigDefaults(arabic)).toEqual(arabic);
    roundTrips(arabic);
    const japanese: PostextConfig = { locale: 'ja', index: { see: { italic: true } } };
    expect(stripConfigDefaults(japanese)).toEqual(japanese);
    roundTrips(japanese);
    // The index's own language decides before the document's.
    const arabicIndex: PostextConfig = { locale: 'en', index: { locale: 'ar', separator: ', ' } };
    expect(stripConfigDefaults(arabicIndex)).toEqual(arabicIndex);
    roundTrips(arabicIndex);
    // In any other language they are the defaults, as before.
    expect(stripConfigDefaults({ locale: 'es', index: { separator: ', ', see: { italic: true } } })).toEqual({ locale: 'es' });
    expect(stripIndexDefaults({ separator: ', ', see: { italic: true } })).toBeUndefined();
    expect(stripIndexDefaults({ separator: ', ', see: { italic: true } }, 'ar')).toEqual({ separator: ', ', see: { italic: true } });
    // What was kept before is kept still.
    expect(stripIndexDefaults({ separator: '، ', see: { italic: false } }, 'ar')).toEqual({ separator: '، ', see: { italic: false } });
  });

  it('reads the document language from the hyphenation locale when no locale is set', () => {
    // The Sandbox fills `bodyText.hyphenation.locale` from the app language.
    const japanese = (extra: PostextConfig): PostextConfig => ({ bodyText: { hyphenation: { locale: 'ja' } }, ...extra });
    const notes = japanese({ footnotes: { numbering: 'chapter' } });
    expect(resolveAllConfig(japanese({})).footnotes.numbering).toBe('page');
    expect(stripConfigDefaults(notes).footnotes).toEqual({ numbering: 'chapter' });
    roundTrips(notes);
    const captions = japanese({ captionStyle: { labelNumberGap: ' ', labelSeparator: '. ' } });
    expect(stripConfigDefaults(captions).captionStyle).toEqual({ labelNumberGap: ' ', labelSeparator: '. ' });
    roundTrips(captions);
    const index = japanese({ index: { see: { italic: true } } });
    expect(stripConfigDefaults(index).index).toEqual({ see: { italic: true } });
    roundTrips(index);
  });

  it('keeps hyphenation patterns named for another language than the document\'s', () => {
    const config: PostextConfig = { locale: 'es', bodyText: { hyphenation: { locale: 'en-us' } } };
    expect(resolveAllConfig({ locale: 'es' }).bodyText.hyphenation.locale).toBe('es');
    expect(stripConfigDefaults(config)).toEqual(config);
    roundTrips(config);
    // The document's own patterns, and a document that names no language.
    expect(stripConfigDefaults({ locale: 'en', bodyText: { hyphenation: { locale: 'en-us' } } })).toEqual({ locale: 'en' });
    expect(stripConfigDefaults({ bodyText: { hyphenation: { locale: 'en-us' } } })).toEqual({});
  });

  it('keeps a comics section left at its defaults where it binds the book on the right', () => {
    for (const locale of ['ja', 'zh-Hant']) {
      const manga: PostextConfig = { locale, comics: {} };
      expect(resolveAllConfig(manga).page.binding, locale).toBe('right');
      expect(resolveAllConfig({ locale }).page.binding, locale).toBe('left');
      expect(stripConfigDefaults(manga), locale).toEqual(manga);
      expect(resolveAllConfig(stripConfigDefaults({ locale, comics: { readingDirection: 'auto' } })).page.binding, locale).toBe('right');
    }
    // A comic read left to right is bound on the left with or without it.
    expect(stripConfigDefaults({ locale: 'en', comics: {} })).toEqual({ locale: 'en' });
    expect(stripConfigDefaults({ comics: { artDirection: 'ltr' } })).toEqual({});
  });

  it('keeps a page size that differs from its named preset', () => {
    const cm = (value: number) => ({ value, unit: 'cm' as const });
    const config: PostextConfig = { page: { sizePreset: '21x28', width: cm(17), height: cm(24) } };
    expect(resolveAllConfig(config).page.width).toEqual(cm(17));
    expect(stripConfigDefaults(config)).toEqual(config);
    roundTrips(config);
    // The default size under the default preset, or under none.
    expect(stripPageDefaults({ width: cm(17), height: cm(24) })).toBeUndefined();
    expect(stripPageDefaults({ sizePreset: '17x24', width: cm(17), height: cm(24) })).toBeUndefined();
    expect(stripPageDefaults({ sizePreset: 'custom', width: cm(17), height: cm(30) })).toEqual({ sizePreset: 'custom', height: cm(30) });
    // A preset's own size written out is kept as it always was.
    expect(stripPageDefaults({ sizePreset: '21x28', width: cm(21), height: cm(28) }))
      .toEqual({ sizePreset: '21x28', width: cm(21), height: cm(28) });
  });
});

// Every flag of the resolved configuration, set either way in each context,
// reads back the same after the strip: a default that comes to depend on
// the rest of the configuration shows up here.
describe('every flag survives the strip in every context (#651)', () => {
  const contexts: Record<string, PostextConfig> = {
    ...CONTEXTS,
    chinese: { locale: 'zh-Hans' },
    japanese: { locale: 'ja' },
    japaneseVertical: { locale: 'ja', layout: { writingMode: 'vertical-rl' } },
    japaneseByHyphenation: { bodyText: { hyphenation: { locale: 'ja' } } },
    arabic: { locale: 'ar' },
    spanish: { locale: 'es' },
    rightToLeft: { direction: 'rtl' },
    twoColumns: { layout: { layoutType: 'double' } },
    manga: { locale: 'ja', comics: { lettering: { fontSize: { value: 8, unit: 'pt' } } } },
  };
  const isFields = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const flags = (value: unknown, path: string[], out: string[][]): string[][] => {
    if (typeof value === 'boolean') out.push(path);
    else if (isFields(value)) for (const [k, v] of Object.entries(value)) flags(v, [...path, k], out);
    return out;
  };
  const merge = (a: unknown, b: unknown): unknown => {
    if (!isFields(a) || !isFields(b)) return b === undefined ? a : b;
    const out: Record<string, unknown> = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = merge(out[k], v);
    return out;
  };

  for (const [name, context] of Object.entries(contexts)) {
    it(name, () => {
      const paths = flags(JSON.parse(JSON.stringify(resolveAllConfig(context))), [], []);
      expect(paths.length).toBeGreaterThan(100);
      const lost: string[] = [];
      for (const path of paths) {
        for (const value of [true, false]) {
          const config = merge(context, path.reduceRight<unknown>((acc, key) => ({ [key]: acc }), value)) as PostextConfig;
          const before = stableStringify(resolveAllConfig(config));
          const after = stableStringify(resolveAllConfig(stripConfigDefaults(config)));
          if (before !== after) lost.push(`${path.join('.')}: ${value}`);
        }
      }
      expect(lost).toEqual([]);
    });
  }
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
