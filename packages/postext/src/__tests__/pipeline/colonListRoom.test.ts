import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { CONFIG_VERSION, migrateBundleConfig, migrateConfig, pinLegacyColonListRoom } from '../../bundle/configVersion';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../../defaults/bodyText';
import type { ColonListRoom, PostextConfig } from '../../types';
import type { VDTBlock, VDTDocument } from '../../vdt';

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

// The EF-110 repro (section-heads-field-manual): a page of ten lines, one
// column; one-line filler paragraphs, a colon lead-in, then a list whose
// first item runs to two lines.
const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const LEAD = 13.2;
const config = (keepColonWithList = true, colonListRoom?: ColonListRoom): PostextConfig => ({
  page: {
    dpi: 96,
    width: mm(100),
    height: { value: 20 + (10 * LEAD * 25.4) / 72, unit: 'mm' },
    margins: { top: mm(10), bottom: mm(10), left: mm(15), right: mm(15) },
  },
  layout: { layoutType: 'single' },
  bodyText: {
    fontSize: pt(9.4), lineHeight: pt(LEAD), textAlign: 'left', firstLineIndent: pt(0), keepColonWithList,
    ...(colonListRoom ? { colonListRoom } : {}),
  },
  unorderedLists: { marginTop: pt(0), marginBottom: pt(0) },
  headings: { levels: [] },
});
const markdown = (fillers: number, firstItem: string): string => [
  ...Array.from({ length: fillers }, (_, i) => `Filler line ${i + 1}.`),
  'Look for these signs:',
  `- ${firstItem}`,
  '- a second item',
].join('\n\n');
const TWO_LINES = 'a first item that is long enough to run onto a second line';
const ONE_LINE = 'a short first item';

const blockWith = (doc: VDTDocument, text: string): VDTBlock =>
  doc.blocks.find((b) => b.lines.some((l) => l.text.includes(text)))!;

describe('keepColonWithList keeps room for the first item the list can start with (EF-110)', () => {
  it('moves the colon line on when the first item cannot start under it', () => {
    const doc = buildDocument({ markdown: markdown(8, TWO_LINES) }, config(), createMeasurementCache());
    const colon = blockWith(doc, 'Look for these signs:');
    const item = blockWith(doc, 'a first item');
    // Non-vacuous: the item runs to two lines and the page holds ten.
    expect(item.lines).toHaveLength(2);
    expect(colon.pageIndex).toBe(item.pageIndex);
    expect(item.pageIndex).toBe(1);
  });

  it('leaves the colon line where it is when the item fits under it', () => {
    for (const [fillers, first] of [[7, TWO_LINES], [8, ONE_LINE]] as const) {
      const doc = buildDocument({ markdown: markdown(fillers, first) }, config(), createMeasurementCache());
      const colon = blockWith(doc, 'Look for these signs:');
      const item = blockWith(doc, first.slice(0, 12));
      expect(colon.pageIndex, `${fillers} fillers`).toBe(0);
      expect(item.pageIndex, `${fillers} fillers`).toBe(0);
    }
  });

  it('does nothing with keepColonWithList off', () => {
    const doc = buildDocument({ markdown: markdown(8, TWO_LINES) }, config(false), createMeasurementCache());
    expect(blockWith(doc, 'Look for these signs:').pageIndex).toBe(0);
    expect(blockWith(doc, 'a first item').pageIndex).toBe(1);
  });
});

describe('keepColonWithList reads the full-width colon of Chinese text (#211)', () => {
  const chinese = (fillers: number): string => [
    ...Array.from({ length: fillers }, (_, i) => `填充文字第${i + 1}行。`),
    '请注意以下几点：',
    `- ${TWO_LINES}`,
    '- 第二项',
  ].join('\n\n');

  it('moves a lead-in ending in ： on with the list it introduces', () => {
    const doc = buildDocument({ markdown: chinese(8) }, { ...config(), locale: 'zh-Hans' }, createMeasurementCache());
    const colon = blockWith(doc, '请注意以下几点：');
    const item = blockWith(doc, 'a first item');
    expect(item.lines).toHaveLength(2);
    expect(colon.pageIndex).toBe(item.pageIndex);
    expect(item.pageIndex).toBe(1);
  });

  it('leaves it alone with keepColonWithList off', () => {
    const doc = buildDocument({ markdown: chinese(8) }, { ...config(false), locale: 'zh-Hans' }, createMeasurementCache());
    expect(blockWith(doc, '请注意以下几点：').pageIndex).toBe(0);
  });
});

describe('colonListRoom: \'line\' keeps the postext 1.4 room check (EF-110)', () => {
  it('leaves the colon line alone at the foot, as 1.4 did', () => {
    const doc = buildDocument({ markdown: markdown(8, TWO_LINES) }, config(true, 'line'), createMeasurementCache());
    expect(blockWith(doc, 'Look for these signs:').pageIndex).toBe(0);
    expect(blockWith(doc, 'a first item').pageIndex).toBe(1);
    // With one line of room missing, both checks move it.
    const short = buildDocument({ markdown: markdown(9, ONE_LINE) }, config(true, 'line'), createMeasurementCache());
    expect(blockWith(short, 'Look for these signs:').pageIndex).toBe(blockWith(short, 'a short first').pageIndex);
  });

  it('resolves to \'item\' and strips the default', () => {
    expect(resolveBodyTextConfig(undefined).colonListRoom).toBe('item');
    expect(resolveBodyTextConfig({ colonListRoom: 'line' }).colonListRoom).toBe('line');
    expect(resolveBodyTextConfig({ colonListRoom: 'lines' as ColonListRoom }).colonListRoom).toBe('item');
    expect(stripBodyTextDefaults({ colonListRoom: 'item' })).toBeUndefined();
    expect(stripBodyTextDefaults({ colonListRoom: 'line' })).toEqual({ colonListRoom: 'line' });
  });
});

describe('configurations stored before rules 6 keep the 1.4 colon-list room', () => {
  const LIST = 'Look for these signs:\n\n- one\n- two';
  it('pins a configuration older than 6 whose book introduces a list with a colon, once', () => {
    expect(CONFIG_VERSION).toBe(10);
    const stored: PostextConfig = { bodyText: { fontFamily: 'Georgia' } };
    for (const version of [undefined, 3, 4, 5]) {
      expect(migrateConfig(stored, version, { content: LIST }).bodyText, `${version}`)
        .toEqual({ fontFamily: 'Georgia', colonListRoom: 'line' });
    }
    const once = migrateConfig(stored, 5, { content: LIST });
    expect(migrateConfig(once, CONFIG_VERSION, { content: LIST })).toBe(once);
    expect(migrateConfig(stored, CONFIG_VERSION, { content: LIST })).toBe(stored);
    // Unknown content may introduce one.
    expect(migrateConfig(stored, 5).bodyText?.colonListRoom).toBe('line');
    // The bundle reader pins the `bodyText` the layers leave in force.
    expect(migrateBundleConfig({ bodyText: { fontFamily: 'Base' } }, [{}], undefined, { content: [LIST] }).bodyText)
      .toEqual({ fontFamily: 'Base', colonListRoom: 'line' });
  });

  it('reads a lead-in as the parser does: a colon closing its line, a list item next', () => {
    const stored: PostextConfig = {};
    const pinned = (content: string) => migrateConfig(stored, 5, { content }) !== stored;
    expect(pinned(LIST)).toBe(true);
    expect(pinned('**Note:**\n1. first')).toBe(true);
    expect(pinned('Steps:\n\n\n  + indented')).toBe(true);
    expect(pinned('A list:\n2) second')).toBe(true);
    expect(pinned('Time: 10:30 today.\n\nNo list here.')).toBe(false);
    expect(pinned('- a list\n- with no line to lead it in')).toBe(false);
    expect(pinned('Ends with a colon:\n\nA paragraph, not a list.')).toBe(false);
  });

  it('leaves a configuration that names the room, or keeps no colon with its list', () => {
    const named: PostextConfig = { bodyText: { colonListRoom: 'item' } };
    expect(pinLegacyColonListRoom(named)).toBe(named);
    const off: PostextConfig = { bodyText: { keepColonWithList: false } };
    expect(pinLegacyColonListRoom(off)).toBe(off);
    expect(pinLegacyColonListRoom({} as PostextConfig).bodyText).toEqual({ colonListRoom: 'line' });
  });
});
