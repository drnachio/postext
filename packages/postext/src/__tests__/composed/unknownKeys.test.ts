import { describe, it, expect } from 'vitest';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import type { PostextConfig } from '../../index.js';

// #1122: a key written at the wrong level (a group's `size` instead of its
// placement's) or misspelt in a decoration element, a connector, a
// placement or at the top of the config is reported with its path.

const mm = (value: number) => ({ value, unit: 'mm' as const });
const unknown = (config: unknown) =>
  collectConfigWarnings(config as PostextConfig)
    .filter((w) => w.kind === 'unknownConfigKey')
    .map((w) => [w.path, w.value, w.suggestion]);

const at = { anchor: { to: 'container', edge: 'top-left' } };
const template = (extra: Record<string, unknown>) => ({ pageTemplates: [{ id: 'ficha', frames: [{ name: 'texto', flow: true, placement: at }], ...extra }] });

describe('unknown keys of composed objects and design elements (#1122)', () => {
  it('a group’s size written beside its placement', () => {
    const config = template({ groups: [{ name: 'banda', frames: ['texto'], placement: at, size: { width: mm(50) } }] });
    expect(unknown(config)).toEqual([['/pageTemplates/0/groups/0/size', 'size', undefined]]);
  });

  it('a frame’s placement, anchor, offset, size and size-to objects', () => {
    const config = { pageTemplates: [{ id: 'ficha', frames: [{
      name: 'texto', flow: true,
      placement: {
        anchor: { to: 'container', edge: 'top-left', att: 'start' },
        offset: { x: mm(1), z: mm(2) },
        size: { widht: mm(10), height: { to: '#otro', edge: 'bottom', gap: mm(1) } },
        sise: {},
      },
    }] }] };
    expect(unknown(config)).toEqual([
      ['/pageTemplates/0/frames/0/placement/sise', 'sise', 'size'],
      ['/pageTemplates/0/frames/0/placement/anchor/att', 'att', 'at'],
      ['/pageTemplates/0/frames/0/placement/offset/z', 'z', 'x'],
      ['/pageTemplates/0/frames/0/placement/size/widht', 'widht', 'width'],
      ['/pageTemplates/0/frames/0/placement/size/height/gap', 'gap', undefined],
    ]);
  });

  it('a group’s placement', () => {
    const config = template({ groups: [{ name: 'banda', frames: ['texto'], placement: { ...at, sizes: {} } }] });
    expect(unknown(config)).toEqual([['/pageTemplates/0/groups/0/placement/sizes', 'sizes', 'size']]);
  });

  it('a decoration’s own keys and an inherited element taken out', () => {
    const config = template({ decoration: { elements: [{ id: 'banda', remove: true, kind2: 'x' }], element: [] } });
    expect(unknown(config)).toEqual([
      ['/pageTemplates/0/decoration/element', 'element', 'elements'],
      ['pageTemplates[0].decoration.elements[0].kind2', 'kind2', undefined],
    ]);
  });

  it('a misspelt key of each element kind', () => {
    const elements = [
      { kind: 'text', id: 't', placement: at, content: '{page}', fontSize: mm(3), fontSise: mm(4), box: { bacgroundColor: '#fff', padding: { topp: mm(1) } }, stroke: { width: mm(1), colour: '#000' } },
      { kind: 'rule', id: 'r', placement: { ...at, size: { width: 'fill' } }, thicknes: mm(1) },
      { kind: 'box', id: 'b', placement: at, style: { backgroundColour: '#fff' } },
      { kind: 'image', id: 'i', placement: at, resourceId: 'x', fitt: 'cover' },
      { kind: 'path', id: 'p', placement: at, d: 'M0 0L1 1', strok: '#000' },
    ];
    expect(unknown(template({ decoration: { elements } }))).toEqual([
      ['pageTemplates[0].decoration.elements[0].fontSise', 'fontSise', 'fontSize'],
      ['pageTemplates[0].decoration.elements[0].box.bacgroundColor', 'bacgroundColor', 'backgroundColor'],
      ['pageTemplates[0].decoration.elements[0].box.padding.topp', 'topp', 'top'],
      ['pageTemplates[0].decoration.elements[0].stroke.colour', 'colour', 'color'],
      ['pageTemplates[0].decoration.elements[1].thicknes', 'thicknes', 'thickness'],
      ['pageTemplates[0].decoration.elements[2].style.backgroundColour', 'backgroundColour', 'backgroundColor'],
      ['pageTemplates[0].decoration.elements[3].fitt', 'fitt', 'fit'],
      ['pageTemplates[0].decoration.elements[4].strok', 'strok', 'stroke'],
    ]);
  });

  it('a connector and its ends', () => {
    const elements = [{ kind: 'connector', id: 'c', from: { to: '#texto', sid: 'bottom' }, to: [{ to: '#a' }, { to: '#b', gapp: mm(1) }], colour: '#000', placement: at }];
    expect(unknown(template({ decoration: { elements } }))).toEqual([
      ['pageTemplates[0].decoration.elements[0].colour', 'colour', 'color'],
      ['pageTemplates[0].decoration.elements[0].placement', 'placement', undefined],
      ['pageTemplates[0].decoration.elements[0].from.sid', 'sid', 'side'],
      ['pageTemplates[0].decoration.elements[0].to[1].gapp', 'gapp', 'gap'],
    ]);
  });

  it('elements of a running head too', () => {
    const config = { header: { elements: [{ kind: 'text', id: 'h', content: '{chapter}', fontSize: mm(3), placement: { ...at, offest: {} } }] } };
    expect(unknown(config)).toEqual([['header.elements[0].placement.offest', 'offest', 'offset']]);
  });

  it('top-level keys of the config and of the HTML viewer’s overrides', () => {
    const config = { pageTemplate: [], htmlViewer: { overrides: { calloutStyle: [], htmlViewer: {} } } };
    expect(unknown(config)).toEqual([
      ['pageTemplate', 'pageTemplate', 'pageTemplates'],
      ['htmlViewer.overrides.calloutStyle', 'calloutStyle', 'calloutStyles'],
      ['htmlViewer.overrides.htmlViewer', 'htmlViewer', undefined],
    ]);
  });

  it('a config with known keys only raises none', () => {
    const elements = [
      { kind: 'text', id: 't', placement: { anchor: { to: '#texto', edge: 'below', at: 'start' }, offset: { y: mm(1) }, size: { width: { to: 'page', edge: 'right' }, maxWidth: mm(40) } }, content: '{page}', fontSize: mm(3) },
      { kind: 'connector', id: 'c', from: { to: '#texto', side: 'bottom' }, to: { to: '#a', at: 0.5 } },
      { id: 'old', remove: true },
    ];
    expect(unknown({ page: {}, ...template({ decoration: { elements } }) })).toEqual([]);
  });
});
