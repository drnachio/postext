import { describe, expect, it } from 'vitest';
import { leafEntries } from '../configPaths.js';
import { chapter, harness } from './testHarness.js';
import { book, moved, text } from './settingsSweep.js';

// "Change any of the settings": the round trip of every setting with the
// value it has is in settingsRoundTrip.part*.test.ts (#1118); the setup and
// the hard case are described in settingsSweep.ts.

describe('every setting the engine resolves', () => {
  it('takes another value when it is a number or a switch, and the answer accounts for everything that moved', async () => {
    const before = leafEntries((await harness(book()).call('sandbox_get_config', { effective: true })).effective);
    const failures: string[] = [];
    let changed = 0;
    let limited = 0;
    for (const [path, value] of before) {
      if (path.startsWith('customFonts')) continue;
      // What names an item of a list is not a setting of the item.
      if (/\[(id|level)=[^\]]+\]\.(id|level)$/.test(path)) continue;
      let next: unknown;
      if (typeof value === 'boolean') next = !value;
      else if (typeof value === 'number') next = Number.isInteger(value) ? value + 1 : Math.round(value * 1.25 * 1000) / 1000;
      else continue;
      const { call } = harness(book());
      const done = await call('sandbox_set_config', { changes: [{ path, value: next }], wait: false });
      if (!done.ok) {
        failures.push(`${path}: ${done.error}`);
        continue;
      }
      const read = await call('sandbox_get_config', { effective: true });
      if (!read.ok) {
        failures.push(`${path}: ${read.error}`);
        continue;
      }
      const after = leafEntries(read.effective);
      const notes = (done.notes ?? []) as string[];
      if (text(after.get(path)) !== text(next)) {
        // A value past a limit, or a setting that only counts with
        // another one on: the answer has to say so.
        if (notes.some((note) => note.startsWith(`${path}: stored as`))) limited++;
        else failures.push(`${path}: asked ${text(next)}, resolves ${text(after.get(path))}, and no note says so`);
        continue;
      }
      changed++;
      const seeded = notes.map((note) => /^(\S+) was not among/.exec(note)?.[1]).filter(Boolean) as string[];
      const told = new Set<string>(((done.followed ?? []) as { path: string }[]).map((f) => f.path));
      const untold = done.followedMore ? [] : moved(before, after).filter((p) => p !== path && !told.has(p) && !(before.get(p) === undefined && seeded.some((at) => p.startsWith(at))));
      if (untold.length > 0) failures.push(`${path}: moved without a word ${untold.slice(0, 4).join(', ')}`);
    }
    expect(failures).toEqual([]);
    expect(changed).toBeGreaterThan(650);
    expect(limited).toBeLessThan(20);
  }, 300_000);
});

// #1081: a frame's overlap (C2), which the frame editor's «May overlap on
// purpose» switch writes, is a setting like any other: written with each
// value, read back, nothing else moving.
describe('a composed frame\'s overlap', () => {
  const composed = () => {
    const chapters = [chapter('a', 'Page', '::::page{template="card"}\n:::frame{slot="main"}\nWords.\n:::\n::::\n')];
    const config = { pageTemplates: [{ id: 'card', frames: [{ name: 'main', height: { value: 40, unit: 'mm' } }, { name: 'badge', width: { value: 10, unit: 'mm' }, height: { value: 10, unit: 'mm' } }] }] };
    return { chapters, markdown: chapters[0]!.markdown, config };
  };
  it.each(['allow', 'check'])('takes %s and nothing else moves', async (value) => {
    const { call } = harness(composed() as never);
    const before = leafEntries((await call('sandbox_get_config', { effective: true })).effective);
    const path = 'pageTemplates[id=card].frames[name=badge].overlap';
    const done = await call('sandbox_set_config', { changes: [{ path, value }], wait: false });
    expect(done.ok, text(done)).toBe(true);
    const after = leafEntries((await call('sandbox_get_config', { effective: true })).effective);
    // Read back by the frame's place in the list.
    const read = 'pageTemplates[id=card].frames[1].overlap';
    expect(after.get(read)).toBe(value);
    expect(moved(before, after).filter((p) => p !== read)).toEqual([]);
  });
});

// #1088: a modules group's kind (row, grid), the modules a group inside the
// stack takes, and a module's width, which the group editor and the
// template editor write, are settings like any other.
describe('modules side by side', () => {
  const composed = () => {
    const chapters = [chapter('a', 'Page', '::::page{template="shell"}\n:::module{template="box"}\n:::frame{slot="text"}\nWords.\n:::\n:::\n::::\n')];
    const config = {
      pageTemplates: [
        { id: 'shell', frames: [], groups: [{ name: 'body', modules: true }, { name: 'pair', modules: true, within: 'body' }] },
        { id: 'box', role: 'module', frames: [{ name: 'text' }] },
      ],
    };
    return { chapters, markdown: chapters[0]!.markdown, config };
  };
  it.each([
    ['pageTemplates[id=shell].groups[name=pair].kind', 'row', 'pageTemplates[id=shell].groups[1].kind', 'row'],
    ['pageTemplates[id=shell].groups[name=pair].templates', ['box'], 'pageTemplates[id=shell].groups[1].templates[0]', 'box'],
    ['pageTemplates[id=box].width', { percent: 40 }, 'pageTemplates[id=box].width.percent', 40],
  ] as const)('writes %s and nothing else moves', async (path, value, read, want) => {
    const { call } = harness(composed() as never);
    const before = leafEntries((await call('sandbox_get_config', { effective: true })).effective);
    const done = await call('sandbox_set_config', { changes: [{ path, value }], wait: false });
    expect(done.ok, text(done)).toBe(true);
    const after = leafEntries((await call('sandbox_get_config', { effective: true })).effective);
    expect(after.get(read)).toBe(want);
    expect(moved(before, after).filter((p) => p !== read)).toEqual([]);
  });
});

// #1087: a design element's page-fence condition, which the element card's
// «Drawn when / Not drawn when the page says» fields write, is a setting
// like any other: written, read back, nothing else moving.
describe('a design element\'s page-fence condition', () => {
  const composed = () => {
    const chapters = [chapter('a', 'Page', '::::page{template="shell" frontmatter}\nWords.\n::::\n')];
    const folio = { kind: 'text', id: 'folio', content: '{pageNumber}', placement: { anchor: { to: 'page', edge: 'bottom-center' } } };
    const config = {
      pageTemplates: [{ id: 'shell', frames: [{ name: 'main', flow: true }], decoration: { elements: [folio] }, footer: { elements: [{ ...folio, id: 'foot' }] } }],
    };
    return { chapters, markdown: chapters[0]!.markdown, config };
  };
  it.each([
    ['pageTemplates[id=shell].decoration.elements[id=folio].when', 'folio'],
    ['pageTemplates[id=shell].decoration.elements[id=folio].unless', 'frontmatter'],
    ['pageTemplates[id=shell].footer.elements[id=foot].unless', 'frontmatter'],
  ])('%s takes a value and nothing else moves', async (path, value) => {
    const { call } = harness(composed() as never);
    const before = leafEntries((await call('sandbox_get_config', { effective: true })).effective);
    const done = await call('sandbox_set_config', { changes: [{ path, value }], wait: false });
    expect(done.ok, text(done)).toBe(true);
    const after = leafEntries((await call('sandbox_get_config', { effective: true })).effective);
    const added = moved(before, after);
    expect(added).toHaveLength(1);
    expect(added[0]!.endsWith(path.slice(path.lastIndexOf('.')))).toBe(true);
    expect(after.get(added[0]!)).toBe(value);
  });
});

// #1089: named frame looks are settings like any other: a look's colour is
// written by its id and read back, nothing else moving, and a book with
// none takes a first one.
describe('named frame looks', () => {
  const hex = (h: string) => ({ hex: h, model: 'hex' });
  const looked = () => {
    const chapters = [chapter('a', 'Page', '::::page{template="card"}\n:::frame{slot="main" look="pill"}\nWords.\n:::\n::::\n')];
    const config = {
      pageTemplates: [{ id: 'card', frames: [{ name: 'main', height: { value: 40, unit: 'mm' } }] }],
      frameLooks: [{ id: 'pill', background: hex('#e63946') }],
    };
    return { chapters, markdown: chapters[0]!.markdown, config };
  };
  it('writes a look\'s colour by its id', async () => {
    const { call } = harness(looked() as never);
    const before = leafEntries((await call('sandbox_get_config', { effective: true })).effective);
    expect(before.get('frameLooks[id=pill].background.hex')).toBe('#e63946');
    const done = await call('sandbox_set_config', { changes: [{ path: 'frameLooks[id=pill].background', value: hex('#2a9d8f') }], wait: false });
    expect(done.ok, text(done)).toBe(true);
    const after = leafEntries((await call('sandbox_get_config', { effective: true })).effective);
    expect(after.get('frameLooks[id=pill].background.hex')).toBe('#2a9d8f');
    expect(moved(before, after).filter((p) => !p.startsWith('frameLooks[id=pill].background'))).toEqual([]);
  });
  it('adds a first look to a book with none', async () => {
    const { call } = harness(book());
    const done = await call('sandbox_set_config', { changes: [{ path: 'frameLooks', value: [{ id: 'teal', border: { color: hex('#008080') } }] }], wait: false });
    expect(done.ok, text(done)).toBe(true);
    const read = await call('sandbox_get_config', { path: 'frameLooks' });
    expect(read.set).toEqual([{ id: 'teal', border: { color: hex('#008080') } }]);
  });
});

// #1095: a modules group inside a row of modules (two levels), and a
// module's grow and shrink, which the group editor and the template editor
// write, are settings like any other.
describe('modules nested and sharing a row', () => {
  const composed = () => {
    const chapters = [chapter('a', 'Page', '::::page{template="shell"}\n:::module{template="box"}\n:::frame{slot="text"}\nWords.\n:::\n:::\n::::\n')];
    const config = {
      pageTemplates: [
        { id: 'shell', frames: [], groups: [{ name: 'body', modules: true }, { name: 'band', modules: true, kind: 'row', within: 'body' }, { name: 'column', modules: true }] },
        { id: 'box', role: 'module', width: { value: 40, unit: 'mm' }, frames: [{ name: 'text' }] },
      ],
    };
    return { chapters, markdown: chapters[0]!.markdown, config };
  };
  it.each([
    ['pageTemplates[id=shell].groups[name=column].within', 'band', 'pageTemplates[id=shell].groups[2].within', 'band'],
    ['pageTemplates[id=box].grow', 2, 'pageTemplates[id=box].grow', 2],
    ['pageTemplates[id=box].shrink', 1, 'pageTemplates[id=box].shrink', 1],
  ] as const)('writes %s and nothing else moves', async (path, value, read, want) => {
    const { call } = harness(composed() as never);
    const before = leafEntries((await call('sandbox_get_config', { effective: true })).effective);
    const done = await call('sandbox_set_config', { changes: [{ path, value }], wait: false });
    expect(done.ok, text(done)).toBe(true);
    const after = leafEntries((await call('sandbox_get_config', { effective: true })).effective);
    expect(after.get(read)).toBe(want);
    expect(moved(before, after).filter((p) => p !== read)).toEqual([]);
  });
});

// #1117: what a box grows with, which the frame editor's «Grows with the
// frames inside» writes, is a setting like any other: `'children'` or a
// list of names.
describe('a box that grows with the frames inside it', () => {
  const composed = () => {
    const chapters = [chapter('a', 'Page', '::::page{template="card"}\n:::frame{slot="box" label="Tab"}\n:::\n\n:::frame{slot="note"}\nWords.\n:::\n::::\n')];
    const config = { pageTemplates: [{ id: 'card', frames: [
      { name: 'box', style: 'note' },
      { name: 'note', placement: { anchor: { to: '#box', edge: 'top-left' } } },
    ] }] };
    return { chapters, markdown: chapters[0]!.markdown, config };
  };
  it.each([
    ['pageTemplates[id=card].frames[name=box].growWith', 'children', 'pageTemplates[id=card].frames[0].growWith', 'children'],
    ['pageTemplates[id=card].frames[name=box].growWith', ['note'], 'pageTemplates[id=card].frames[0].growWith[0]', 'note'],
  ] as const)('writes %s = %j and nothing else moves', async (path, value, read, want) => {
    const { call } = harness(composed() as never);
    const before = leafEntries((await call('sandbox_get_config', { effective: true })).effective);
    const done = await call('sandbox_set_config', { changes: [{ path, value }], wait: false });
    expect(done.ok, text(done)).toBe(true);
    const after = leafEntries((await call('sandbox_get_config', { effective: true })).effective);
    expect(after.get(read)).toBe(want);
    expect(moved(before, after).filter((p) => p !== read)).toEqual([]);
  });
});

// #1115: paragraph spacing takes a length as well as a switch, in the body
// text and in a box's body, and reads back as written.
describe('paragraph spacing as a length', () => {
  it.each([
    'bodyText.paragraphSpacing',
    'calloutStyles[id=note].body.paragraphSpacing',
  ])('%s takes 2 mm and nothing else moves', async (path) => {
    const { call } = harness(book());
    const before = leafEntries((await call('sandbox_get_config', { effective: true })).effective);
    const done = await call('sandbox_set_config', { changes: [{ path, value: { value: 2, unit: 'mm' } }], wait: false });
    expect(done.ok, text(done)).toBe(true);
    const after = leafEntries((await call('sandbox_get_config', { effective: true })).effective);
    expect(after.get(`${path}.value`)).toBe(2);
    expect(after.get(`${path}.unit`)).toBe('mm');
    // The switch's leaf gives way to the length's two, and boxes that
    // leave their body's spacing unset follow the body text's.
    expect(moved(before, after).filter((p) => !p.startsWith(path) && !/\.body\.paragraphSpacing(\.value|\.unit)?$/.test(p))).toEqual([]);
  });
});

// #1237: a style's figures are stored only; the resolved configuration
// names them in the style's family (`Lora@onum`).
describe('a text style\'s figures', () => {
  const styled = () => ({ ...book(), config: { paragraphStyles: [{ id: 'lead' }] } });
  it.each([
    ['bodyText.figureStyle', 'oldstyle', 'bodyText.fontFamily', '@onum'],
    ['tableStyle.figureStyle', 'lining-tabular', 'tableStyle.bodyFontFamily', '@lnum+tnum'],
    ['paragraphStyles[id=lead].figureStyle', 'tabular', 'paragraphStyles[id=lead].fontFamily', '@tnum'],
  ])('writes %s and reads it back', async (path, value, family, tail) => {
    const { call } = harness(styled() as never);
    const done = await call('sandbox_set_config', { changes: [{ path, value }], wait: false });
    expect(done.ok, text(done)).toBe(true);
    const read = await call('sandbox_get_config', { path, effective: false });
    expect(read.set).toBe(value);
    const resolved = await call('sandbox_get_config', { path: family });
    expect(String(resolved.effective).endsWith(tail), text(resolved)).toBe(true);
    const cleared = await call('sandbox_set_config', { changes: [{ path, value: null }], wait: false });
    expect(cleared.ok, text(cleared)).toBe(true);
    expect((await call('sandbox_get_config', { path, effective: false })).set).toBe(null);
  });
  it('refuses a value that is not a figure style', async () => {
    const { call } = harness(book());
    const done = await call('sandbox_set_config', { changes: [{ path: 'bodyText.figureStyle', value: 'fancy' }], wait: false });
    expect(done.ok).toBe(false);
    expect(String(done.error)).toContain('"oldstyle"');
  });
});
