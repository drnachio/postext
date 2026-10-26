import { describe, it, expect } from 'vitest';
import { collectFontUsage } from '../../fonts/usage.js';
import { configFontFaces } from '../../fonts/prepare.js';
import type { PostextConfig } from '../../types.js';

// #741: `collectFontUsage` read no `boldFontWeight` but the code face's. A
// book whose bold is 600 was laid out by the command line with the 700 face
// standing in (the 600 was never fetched): wider bold runs, another wrap,
// 8 pages where the capture and the Sandbox give 7.

const has = (usage: Map<string, { weight: number; style: string }[]>, family: string, weight: number, style = 'normal') =>
  (usage.get(family) ?? []).some((u) => u.weight === weight && u.style === style);

describe('collectFontUsage: the bold weight a configuration names (#741)', () => {
  it('asks the body family for bodyText.boldFontWeight, upright and italic', () => {
    const usage = collectFontUsage({ bodyText: { fontFamily: 'Red Hat Text', boldFontWeight: 600 } });
    expect(usage.get('Red Hat Text')).toContainEqual({ weight: 600, style: 'normal' });
    expect(usage.get('Red Hat Text')).toContainEqual({ weight: 600, style: 'italic' });
    // The four standard variants stay.
    for (const [weight, style] of [[400, 'normal'], [700, 'normal'], [400, 'italic'], [700, 'italic']] as const) {
      expect(has(usage, 'Red Hat Text', weight, style)).toBe(true);
    }
  });

  it('follows the body\'s rule about italics', () => {
    // An Arabic document sets `*…*` in bold: no italics, of any weight.
    const arabic = collectFontUsage({ locale: 'ar', bodyText: { fontFamily: 'Amiri', boldFontWeight: 600 } });
    expect(has(arabic, 'Amiri', 600)).toBe(true);
    expect(has(arabic, 'Amiri', 600, 'italic')).toBe(false);
    // Chinese text whose emphasis holds no Latin letter: dots, no italics.
    const chinese = collectFontUsage({ locale: 'zh-Hans', bodyText: { fontFamily: 'Noto Serif SC', boldFontWeight: 900 } }, { latinEmphasis: false });
    expect(has(chinese, 'Noto Serif SC', 900)).toBe(true);
    expect(has(chinese, 'Noto Serif SC', 900, 'italic')).toBe(false);
  });

  it('asks the default body family when the configuration names the weight alone', () => {
    const usage = collectFontUsage({ bodyText: { boldFontWeight: 600 } });
    const families = [...usage.entries()].filter(([, uses]) => uses.some((u) => u.weight === 600));
    expect(families).toHaveLength(1);
  });

  it('asks a paragraph style for its own bold in its own family, else the body\'s', () => {
    const config: PostextConfig = {
      bodyText: { fontFamily: 'Lora', boldFontWeight: 600 },
      paragraphStyles: [
        { id: 'lead', name: 'Lead', fontFamily: 'Inter', boldFontWeight: 800 },
        { id: 'aside', name: 'Aside', fontFamily: 'Karla' },
        { id: 'note', name: 'Note', boldFontWeight: 500 },
        { id: 'slanted', name: 'Slanted', fontFamily: 'Cormorant', italic: true, boldFontWeight: 600 },
      ],
    };
    const usage = collectFontUsage(config);
    expect(has(usage, 'Inter', 800)).toBe(true);
    expect(has(usage, 'Inter', 600)).toBe(false);
    // No weight of its own: the body's bold, in the style's family.
    expect(has(usage, 'Karla', 600)).toBe(true);
    // No family of its own: its weight in the body's family.
    expect(has(usage, 'Lora', 500)).toBe(true);
    // A slanted text sets its bold runs slanted.
    expect(has(usage, 'Cormorant', 600, 'italic')).toBe(true);
  });

  it('asks a box body for its bold', () => {
    const usage = collectFontUsage({
      bodyText: { fontFamily: 'Lora' },
      calloutStyles: [
        { id: 'warning', name: 'Warning', body: { fontFamily: 'Red Hat Text', boldFontWeight: 600 } },
        { id: 'tip', name: 'Tip', body: { boldFontWeight: 800 } },
        { id: 'plain', name: 'Plain' },
      ],
    } as PostextConfig);
    expect(has(usage, 'Red Hat Text', 600)).toBe(true);
    expect(has(usage, 'Lora', 800)).toBe(true);
  });

  it('asks a table style\'s families for the body\'s bold, which sets their bold runs', () => {
    const usage = collectFontUsage({
      bodyText: { fontFamily: 'Lora', boldFontWeight: 600 },
      tableStyle: { bodyFontFamily: 'Inter' },
      tableStyles: [{ id: 'data', name: 'Data', headerFontFamily: 'Oswald' }],
    } as PostextConfig);
    expect(has(usage, 'Inter', 600)).toBe(true);
    expect(has(usage, 'Oswald', 600)).toBe(true);
  });

  it('asks a chip\'s own family for the body\'s bold, which a chip in a bold run is set in', () => {
    const usage = collectFontUsage({
      bodyText: { fontFamily: 'Red Hat Text', boldFontWeight: 600 },
      chipStyles: [{ id: 'key', name: 'Key', fontFamily: 'Red Hat Display' }],
    } as PostextConfig);
    expect(has(usage, 'Red Hat Display', 600)).toBe(true);
  });

  it('asks headings and contents entries for the heavier of their weight and the body\'s bold', () => {
    const usage = collectFontUsage({
      bodyText: { fontFamily: 'Lora', boldFontWeight: 600 },
      headings: { fontFamily: 'Oswald', fontWeight: 400, levels: [{ level: 2, fontFamily: 'Inter', fontWeight: 800 }] },
    });
    expect(has(usage, 'Oswald', 600)).toBe(true);
    // Already heavier than the body's bold: its own weight sets its bold.
    expect(has(usage, 'Inter', 600)).toBe(false);
  });

  it('adds nothing when the bold is 700', () => {
    const base: PostextConfig = {
      bodyText: { fontFamily: 'Lora' },
      paragraphStyles: [{ id: 'lead', name: 'Lead', fontFamily: 'Inter' }],
      calloutStyles: [{ id: 'warning', name: 'Warning', body: { fontFamily: 'Karla' } }],
      tableStyle: { bodyFontFamily: 'Oswald' },
      headings: { fontFamily: 'Oswald', fontWeight: 400 },
    } as PostextConfig;
    const explicit: PostextConfig = { ...base, bodyText: { fontFamily: 'Lora', boldFontWeight: 700 } };
    const flat = (config: PostextConfig) => [...collectFontUsage(config).entries()].map(([f, uses]) => [f, uses.map((u) => `${u.weight}${u.style[0]}`).sort()]);
    expect(flat(explicit)).toEqual(flat(base));
    for (const uses of collectFontUsage(base).values()) {
      // Only the weights the configuration spells out and the standard four.
      expect(uses.every((u) => u.weight === 400 || u.weight === 700)).toBe(true);
    }
  });

  it('reaches prepareFonts: configFontFaces requests the bold weight', () => {
    const faces = configFontFaces({ bodyText: { fontFamily: 'Red Hat Text', boldFontWeight: 600 } });
    expect(faces).toContainEqual({ family: 'Red Hat Text', weight: 600, style: 'normal' });
    expect(faces).toContainEqual({ family: 'Red Hat Text', weight: 600, style: 'italic' });
  });
});

// #770: the summaries of the contents are set slanted by default
// (`resolveTocConfig`: `subtitle.italic ?? true`), and the reading of the
// configuration as written gave the upright face. The Arabic guide sets them
// in Amiri, a family its body asks for no italics of: no host had the italic
// before the first layout named it, and the Sandbox's page set the summaries
// in a fallback face until the file came (at 39.58 px, «والصفحة» painted
// 121.44 px wide in a box of 111.02).
describe('collectFontUsage: the summaries of the contents (#770)', () => {
  const arabic = (subtitle: NonNullable<PostextConfig['toc']>['subtitle']): PostextConfig => ({
    locale: 'ar',
    bodyText: { fontFamily: 'Amiri' },
    toc: { levels: [{ level: 1, fontFamily: 'Noto Kufi Arabic', fontWeight: 600 }], subtitle },
  });

  it('asks the summaries\' family for its italic when the configuration does not say upright', () => {
    const usage = collectFontUsage(arabic({ enabled: true, attr: 'summary', fontFamily: 'Amiri' }));
    expect(has(usage, 'Amiri', 400, 'italic')).toBe(true);
    // Nothing else of an Arabic book asks the family for an italic.
    expect((usage.get('Amiri') ?? []).filter((u) => u.style === 'italic')).toEqual([{ weight: 400, style: 'italic' }]);
    expect(configFontFaces(arabic({ enabled: true, fontFamily: 'Amiri' }))).toContainEqual({ family: 'Amiri', weight: 400, style: 'italic' });
  });

  it('asks for the weight the summaries are set at', () => {
    expect(has(collectFontUsage(arabic({ enabled: true, fontFamily: 'Amiri', fontWeight: 700 })), 'Amiri', 700, 'italic')).toBe(true);
    // No weight of their own: the body's.
    const light = collectFontUsage({ ...arabic({ enabled: true, fontFamily: 'Amiri' }), bodyText: { fontFamily: 'Amiri', fontWeight: 300 } });
    expect(has(light, 'Amiri', 300, 'italic')).toBe(true);
  });

  it('asks the first level\'s family, else the body\'s, when the summaries name none', () => {
    expect(has(collectFontUsage(arabic({ enabled: true })), 'Noto Kufi Arabic', 400, 'italic')).toBe(true);
    const body = collectFontUsage({ locale: 'ar', bodyText: { fontFamily: 'Amiri' }, toc: { subtitle: { enabled: true } } });
    expect(has(body, 'Amiri', 400, 'italic')).toBe(true);
  });

  it('asks for no italic of summaries set upright, nor of summaries the contents leave out', () => {
    const upright = collectFontUsage(arabic({ enabled: true, fontFamily: 'Amiri', italic: false }));
    expect((upright.get('Amiri') ?? []).some((u) => u.style === 'italic')).toBe(false);
    expect(has(upright, 'Amiri', 400)).toBe(true);
    for (const off of [arabic({ fontFamily: 'Amiri' }), arabic({ enabled: false, fontFamily: 'Amiri' }), arabic(undefined)]) {
      expect((collectFontUsage(off).get('Amiri') ?? []).some((u) => u.style === 'italic')).toBe(false);
    }
  });
});

// #1047: the configuration as written reads an unset weight as 400, but the
// engine sets headings at 700 and a balloon style at 700 when its `bold`
// resolves true. A one-cut face named there was asked for its regular only,
// and the 700 the layout then used was synthesized with no warning first.
describe('collectFontUsage: resolved heading and comic weights (#1047)', () => {
  it('asks a heading family named with no weight for the heading bold', () => {
    const usage = collectFontUsage({ headings: { fontFamily: 'Bangers' } });
    expect(has(usage, 'Bangers', 700)).toBe(true);
    expect(has(usage, 'Bangers', 400)).toBe(false);
  });

  it('reads a level and a heading style over the headings they inherit from', () => {
    const usage = collectFontUsage({
      headings: { fontFamily: 'Head', fontWeight: 600, levels: [{ level: 2, fontFamily: 'Level', italic: true }] },
      headingStyles: [{ id: 'opener', fontFamily: 'Opener' }, { id: 'light', fontWeight: 300 }],
    });
    expect(has(usage, 'Head', 600)).toBe(true);
    expect(has(usage, 'Level', 600, 'italic')).toBe(true);
    expect(has(usage, 'Level', 600)).toBe(false);
    // A style with no weight takes the level's; one with no face, the level's face.
    expect(has(usage, 'Opener', 600)).toBe(true);
    expect(has(usage, 'Head', 300)).toBe(true);
  });

  it('asks a heading family for the body bold only when it is heavier than the heading weight', () => {
    const usage = collectFontUsage({ bodyText: { fontFamily: 'Body', boldFontWeight: 600 }, headings: { fontFamily: 'Head' } });
    expect(has(usage, 'Head', 600)).toBe(false);
    expect(has(usage, 'Head', 700)).toBe(true);
  });

  it('asks a default-face sound effect for 400 and a shout for the lettering bold', () => {
    const markdown = ':::page\n::panel\nana{shout}: Hey!\nsfx: BOOM\n:::\n';
    const usage = collectFontUsage({ locale: 'en' }, { markdown });
    expect(has(usage, 'Bangers', 400)).toBe(true);
    expect(has(usage, 'Bangers', 700)).toBe(false);
    expect(has(usage, 'Comic Neue', 700)).toBe(true);
  });

  it('counts the bold a balloon style sets in its own face, built-in styles included', () => {
    const usage = collectFontUsage({
      locale: 'en',
      comics: { balloonStyles: [{ id: 'sfx', fontFamily: 'Anton' }, { id: 'roar', fontFamily: 'Roar', bold: true }], lettering: { fontFamily: 'Hand' } },
    });
    // No text: every style. A sound effect in a face of its own keeps its bold.
    expect(has(usage, 'Anton', 700)).toBe(true);
    expect(has(usage, 'Roar', 700)).toBe(true);
    expect(has(usage, 'Hand', 700)).toBe(true); // the built-in shout
    expect(has(usage, 'Hand', 400)).toBe(true);
  });
});
