import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FRAME_FIT,
  normalizeFrameSize,
  resolveLabelStyles,
  resolvePageTemplate,
  stripLabelStylesDefaults,
  stripPageTemplatesDefaults,
} from '../composed/templates.js';
import { validatePageTemplates } from '../composed/validate.js';
import { collectConfigWarnings } from '../checks/configWarnings.js';
import { formatWarning } from '../pipeline/contentWarnings.js';
import { stripConfigDefaults } from '../defaults/index.js';
import { resolveAllConfig } from '../pipeline/config.js';
import { CONFIG_VERSION, migrateBundleConfig, migrateConfig, pinLegacySlashBreaks } from '../bundle/configVersion.js';
import { configFingerprint } from '../util/stableHash.js';
import type { PageTemplate, PostextConfig, Resource } from '../types.js';

// Composed pages, configuration side (#853): page templates with frames,
// groups and variants resolve and validate; invalid ones give warnings
// with JSON-pointer paths.

const mm = (value: number) => ({ value, unit: 'mm' as const });

/** The textbook page of DESIGN §3.4, trimmed. */
const TEMA: PageTemplate = {
  id: 'tema-cajas',
  area: 'content',
  decoration: {
    elements: [
      { kind: 'image', id: 'fondo', resourceId: '{attr.fondo}', decorative: true, placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill', height: 'fill' } } } as never,
    ],
  },
  frames: [
    { name: 'titulo', takes: 'h1', style: 'tab', height: 'auto' },
    { name: 'texto', flow: true },
    { name: 'dinero', style: 'caja', padding: { right: mm(62) } },
    { name: 'dinero-fotos', layer: 2, width: mm(60), placement: { anchor: { to: '#dinero', edge: 'top-right' }, offset: { y: mm(-4) } } },
  ],
  groups: [{ name: 'pagina', kind: 'stack', gap: mm(6), frames: ['titulo', 'texto', 'dinero'] }],
};

const STYLES = [{ id: 'tab' }, { id: 'caja' }, { id: 'caja-verde' }];

const config = (pageTemplates: PageTemplate[], extra: PostextConfig = {}): PostextConfig => ({ calloutStyles: STYLES, pageTemplates, ...extra });

const kinds = (c: PostextConfig, resources?: Resource[]) => collectConfigWarnings(c, { resources }).map((w) => `${w.kind} ${w.path} ${w.value}`);

describe('resolvePageTemplate', () => {
  it('fills the defaults of a template, its frames and groups', () => {
    const t = resolvePageTemplate(config([TEMA]), 'tema-cajas')!;
    expect(t.id).toBe('tema-cajas');
    expect(t.area).toBe('content');
    expect(t.role).toBe('composed');
    expect(t.spread).toBe(false);
    expect(t.gutter).toEqual(mm(0));
    expect(t.chain).toEqual(['tema-cajas']);
    expect(t.configPath).toBe('/pageTemplates/0');
    expect(t.frames.map((f) => f.name)).toEqual(['titulo', 'texto', 'dinero', 'dinero-fotos']);
    const texto = t.frames[1]!;
    expect(texto).toMatchObject({
      width: 'fill', height: 'auto', layer: 1, rotate: 0, verticalAlign: 'top', columns: 1, exclude: 'none',
      flow: true, pin: false, grow: 0, shrink: 0, priority: 0, optional: false, crossGutter: false,
      configPath: '/pageTemplates/0/frames/1',
    });
    expect(texto.fit).toEqual(DEFAULT_FRAME_FIT);
    expect(t.frames[0]!.takes).toBe('h1');
    expect(t.frames[3]!.width).toEqual(mm(60));
    expect(t.groups).toEqual([expect.objectContaining({ name: 'pagina', kind: 'stack', gap: mm(6), align: 'start', frames: ['titulo', 'texto', 'dinero'] })]);
    expect(t.decorationPaths).toEqual(['/pageTemplates/0/decoration/elements/0']);
    expect(t.variant).toBeUndefined();
  });

  it('is undefined for an id no template has, and memoises per list', () => {
    const c = config([TEMA]);
    expect(resolvePageTemplate(c, 'nope')).toBeUndefined();
    expect(resolvePageTemplate({}, 'tema-cajas')).toBeUndefined();
    expect(resolvePageTemplate(c, 'tema-cajas')).toBe(resolvePageTemplate(c, 'tema-cajas'));
    expect(resolvePageTemplate(c, 'tema-cajas', { parity: 'recto' })).toBe(resolvePageTemplate(c, 'tema-cajas', { parity: 'recto' }));
  });

  it('reads sizes from placement.size, clamps percentages and drops what it cannot use', () => {
    const t = resolvePageTemplate({ pageTemplates: [{ id: 't', frames: [
      { name: 'a', placement: { anchor: { to: 'container', edge: 'top' }, size: { width: mm(40), height: 'fill' } } },
      { name: 'b', width: { percent: 140 }, height: { percent: -5 } },
      { name: 'c', width: { value: Number.NaN, unit: 'mm' }, height: { value: -3, unit: 'mm' }, minHeight: { value: 2, unit: 'furlong' as never }, columns: 2.6, layer: 'top' as never, fit: { minScale: 3, imageMinScale: 0 } },
    ] }] }, 't')!;
    expect(t.frames[0]).toMatchObject({ width: mm(40), height: 'fill' });
    expect(t.frames[1]).toMatchObject({ width: { percent: 100 }, height: { percent: 0 } });
    expect(t.frames[2]).toMatchObject({ width: 'fill', height: 'auto', columns: 3, layer: 1 });
    expect(t.frames[2]!.minHeight).toBeUndefined();
    expect(t.frames[2]!.fit).toEqual({ ...DEFAULT_FRAME_FIT, minScale: 1 });
    expect(normalizeFrameSize('auto')).toBe('auto');
    expect(normalizeFrameSize({ percent: 33 })).toEqual({ percent: 33 });
    expect(normalizeFrameSize('half')).toBeUndefined();
  });

  it('places frames by grid cell, clamped to the grid', () => {
    const t = resolvePageTemplate({ pageTemplates: [{ id: 'g', grid: { columns: 3, rows: 4 }, frames: [
      { name: 'a', grid: { col: 2, row: 1, cols: 5 } },
      { name: 'b', grid: { col: 9, row: 0 } },
    ] }, { id: 'nogrid', frames: [{ name: 'a', grid: { col: 1, row: 1 } }] }] }, 'g')!;
    expect(t.grid).toEqual({ columns: 3, rows: 4, columnGap: mm(0), rowGap: mm(0) });
    expect(t.frames[0]!.grid).toEqual({ col: 2, row: 1, cols: 2, rows: 1 });
    expect(t.frames[1]!.grid).toEqual({ col: 3, row: 1, cols: 1, rows: 1 });
    // Without a grid the cell is ignored.
    expect(resolvePageTemplate({ pageTemplates: [{ id: 'nogrid', frames: [{ name: 'a', grid: { col: 1, row: 1 } }] }] }, 'nogrid')!.frames[0]!.grid).toBeUndefined();
  });

  it('merges extends: scalars replace, frames and groups by name with remove, decoration by id', () => {
    const child: PageTemplate = {
      id: 'tema-verde',
      extends: 'tema-cajas',
      area: 'trim',
      frames: [
        { name: 'dinero', style: 'caja-verde', fit: { minScale: 0.8 } },
        { name: 'dinero-fotos', remove: true },
        { name: 'nota', style: 'caja' },
      ],
      groups: [{ name: 'pagina', frames: ['titulo', 'dinero', 'texto'] }],
      decoration: { elements: [{ kind: 'image', id: 'fondo', resourceId: 'verde' } as never, { kind: 'rule', id: 'linea' } as never] },
    };
    const t = resolvePageTemplate(config([TEMA, child]), 'tema-verde')!;
    expect(t.chain).toEqual(['tema-verde', 'tema-cajas']);
    expect(t.area).toBe('trim');
    expect(t.frames.map((f) => f.name)).toEqual(['titulo', 'texto', 'dinero', 'nota']);
    const dinero = t.frames[2]!;
    expect(dinero.style).toBe('caja-verde');
    // Fields the child leaves alone are the parent's; `fit` merges key by key.
    expect(dinero.padding).toEqual({ right: mm(62) });
    expect(dinero.fit).toEqual({ ...DEFAULT_FRAME_FIT, minScale: 0.8 });
    expect(dinero.configPath).toBe('/pageTemplates/1/frames/0');
    expect(dinero.fieldPaths.style).toBe('/pageTemplates/1/frames/0/style');
    expect(dinero.fieldPaths.padding).toBe('/pageTemplates/0/frames/2/padding');
    // The group keeps its kind and gap, with the child's member list.
    expect(t.groups[0]).toMatchObject({ kind: 'stack', gap: mm(6), frames: ['titulo', 'dinero', 'texto'] });
    expect(t.decoration.elements.map((e) => [e.kind, e.id, (e as { resourceId?: string }).resourceId])).toEqual([['image', 'fondo', 'verde'], ['rule', 'linea', undefined]]);
    expect(t.decorationPaths).toEqual(['/pageTemplates/1/decoration/elements/0', '/pageTemplates/1/decoration/elements/1']);
    // The parent is untouched.
    expect(resolvePageTemplate(config([TEMA, child]), 'tema-cajas')!.frames).toHaveLength(4);
  });

  it('applies the variant of the page side after extends, and none on a spread', () => {
    const base: PageTemplate = {
      id: 'base',
      frames: [{ name: 'texto', flow: true }, { name: 'margen', width: mm(30), placement: { anchor: { to: 'container', edge: 'top-left' } } }],
      variants: { recto: { frames: [{ name: 'margen', placement: { anchor: { to: 'container', edge: 'top-right' } } }] } },
    };
    const child: PageTemplate = { id: 'child', extends: 'base', variants: { verso: { header: false, frames: [{ name: 'margen', remove: true }] } } };
    const c = config([base, child]);
    expect(resolvePageTemplate(c, 'child')!.frames.map((f) => f.name)).toEqual(['texto', 'margen']);
    const recto = resolvePageTemplate(c, 'child', { parity: 'recto' })!;
    expect(recto.variant).toBe('recto');
    expect(recto.frames[1]!.placement!.anchor.edge).toBe('top-right');
    expect(recto.frames[1]!.width).toEqual(mm(30));
    expect(recto.frames[1]!.fieldPaths.placement).toBe('/pageTemplates/0/variants/recto/frames/0/placement');
    const verso = resolvePageTemplate(c, 'child', { parity: 'verso' })!;
    expect(verso.variant).toBe('verso');
    expect(verso.header).toBe(false);
    expect(verso.frames.map((f) => f.name)).toEqual(['texto']);
    // A spread has both sides: no variant applies.
    const spread = resolvePageTemplate(config([{ ...base, spread: true, gutter: mm(8) }]), 'base', { parity: 'recto' })!;
    expect(spread.spread).toBe(true);
    expect(spread.gutter).toEqual(mm(8));
    expect(spread.variant).toBeUndefined();
    expect(resolvePageTemplate(c, 'base', { parity: 'recto', spread: true })!.variant).toBeUndefined();
  });

  it('drops a template whose extends loops, and stands alone on an unknown parent', () => {
    const c = config([{ id: 'a', extends: 'b' }, { id: 'b', extends: 'a' }, { id: 'c', extends: 'a' }, { id: 'd', extends: 'zz', frames: [{ name: 'x' }] }]);
    expect(resolvePageTemplate(c, 'a')).toBeUndefined();
    expect(resolvePageTemplate(c, 'b')).toBeUndefined();
    expect(resolvePageTemplate(c, 'c')).toBeUndefined();
    expect(resolvePageTemplate(c, 'd')!.frames.map((f) => f.name)).toEqual(['x']);
    expect(resolvePageTemplate(c, 'd')!.chain).toEqual(['d']);
  });

  it('settles references the way the warnings describe', () => {
    const t = resolvePageTemplate(config([{
      id: 't',
      overflowTemplate: 'missing',
      frames: [
        { name: 'a', style: 'nope', next: 'b', placement: { anchor: { to: '#ghost', edge: 'below' } } },
        { name: 'b', next: 'a' },
        { name: 'c', overflow: { continueIn: 'template:t' } },
        { name: 'd', overflow: { continueIn: 'sideways' } },
      ],
      groups: [{ name: 'g', frames: ['a', 'zz', 'a'] }, { name: 'h', frames: ['a', 'b'] }],
    }]), 't')!;
    const [a, b, c, d] = t.frames;
    expect(a!.style).toBeUndefined();
    expect(a!.placement!.anchor.to).toBe('container');
    expect(a!.next).toBe('b');
    expect(b!.next).toBeUndefined();
    expect(c!.overflow.continueIn).toBe('template:t');
    expect(d!.overflow.continueIn).toBeUndefined();
    expect(t.groups.map((g) => g.frames)).toEqual([['a'], ['b']]);
    expect(t.overflowTemplate).toBeUndefined();
  });
});

describe('validatePageTemplates', () => {
  it('says nothing about a sound template', () => {
    expect(kinds(config([TEMA]))).toEqual([]);
    expect(kinds({})).toEqual([]);
  });

  it('reports every kind with its JSON pointer', () => {
    const c = config([
      { id: 'a', extends: 'b' },
      { id: 'b', extends: 'a' },
      { id: 'a' },
      { id: 'lone', extends: 'tema-caja' },
      {
        id: 'tema-cajas',
        overflowTemplate: 'nada',
        frames: [
          { name: 'x', style: 'cja', next: 'y', minHeight: mm(40), maxHeight: mm(30) },
          { name: 'y', next: 'x', width: mm(80), maxWidth: mm(50) },
          { name: 'x' },
          { name: 'z', placement: { anchor: { to: '#w', edge: 'below' } } },
          { name: 'w', placement: { anchor: { to: '#z', edge: 'below' } } },
          { name: 'v', placement: { anchor: { to: '#nada', edge: 'below' } }, overflow: { continueIn: '#nadie' } },
        ],
        groups: [{ name: 'g', frames: ['x', 'q'] }, { name: 'h', frames: ['x'] }, { name: 'y', frames: [] }],
      },
    ]);
    const resources: Resource[] = [{ id: 'mapa', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, anchors: [{ id: 'madrid', x: 0.5, y: 0.5, style: 'mar' }] } as Resource];
    expect(kinds({ ...c, labelStyles: [{ id: 'ciudad' }] }, resources)).toEqual([
      'templateDuplicate /pageTemplates/2 a',
      'templateExtendsCycle /pageTemplates/0/extends a → b → a',
      'templateExtendsCycle /pageTemplates/1/extends b → a → b',
      'templateExtendsUnknown /pageTemplates/3/extends tema-caja',
      'frameDuplicate /pageTemplates/4/frames/2 x',
      'frameDuplicate /pageTemplates/4/groups/2 y',
      'frameStyleUnknown /pageTemplates/4/frames/0/style cja',
      'groupFrameUnknown /pageTemplates/4/groups/0/frames/1 q',
      'groupFrameTwice /pageTemplates/4/groups/1/frames/0 x',
      'frameAnchorUnknown /pageTemplates/4/frames/5/placement/anchor/to #nada',
      'frameAnchorUnknown /pageTemplates/4/frames/4/placement/anchor/to z → w → z',
      'overflowTargetUnknown /pageTemplates/4/frames/5/overflow/continueIn #nadie',
      'frameChainLoop /pageTemplates/4/frames/1/next x → y → x',
      'overflowTargetUnknown /pageTemplates/4/overflowTemplate nada',
      'frameMinMax /pageTemplates/4/frames/0/minHeight minHeight 40mm > maxHeight 30mm',
      'frameMinMax /pageTemplates/4/frames/1/width width 80mm > maxWidth 50mm',
      'labelStyleUnknown /resources/0/anchors/0/style mar',
    ]);
    const all = collectConfigWarnings({ ...c, labelStyles: [{ id: 'ciudad' }] }, { resources });
    expect(all.find((w) => w.kind === 'templateExtendsUnknown')!.suggestion).toBe('tema-cajas');
    expect(all.find((w) => w.kind === 'frameStyleUnknown')!.suggestion).toBe('caja');
    expect(all.find((w) => w.kind === 'labelStyleUnknown')!.resourceId).toBe('mapa');
    expect(all.find((w) => w.kind === 'frameMinMax')!.used).toBe('40mm');
    // Every kind reads as a line of its own.
    for (const w of all) expect(formatWarning(w), w.kind).not.toMatch(/^Warning "/);
  });

  it('compares lengths in different units', () => {
    const c = config([{ id: 't', frames: [{ name: 'a', minWidth: { value: 2, unit: 'in' }, maxWidth: mm(60), height: { value: 1, unit: 'cm' }, minHeight: { value: 12, unit: 'pt' } }] }]);
    // 2 in = 50.8 mm < 60 mm; 1 cm = 28.3 pt ≥ 12 pt: nothing to say.
    expect(kinds(c)).toEqual([]);
    const tight = config([{ id: 't', frames: [{ name: 'a', height: mm(3), minHeight: { value: 12, unit: 'pt' } }] }]);
    expect(kinds(tight)).toEqual(['frameMinMax /pageTemplates/0/frames/0/height height 3mm < minHeight 12pt']);
  });

  it('points at the entry that wrote a field, through extends and variants', () => {
    const c = config([
      { id: 'base', frames: [{ name: 'a', placement: { anchor: { to: '#b', edge: 'below' } } }, { name: 'b' }] },
      { id: 'child', extends: 'base', frames: [{ name: 'b', remove: true }] },
      { id: 'sided', frames: [{ name: 'a' }], variants: { recto: { frames: [{ name: 'a', style: 'gone', next: 'nowhere' }] } } },
    ]);
    expect(kinds(c)).toEqual([
      'frameAnchorUnknown /pageTemplates/0/frames/0/placement/anchor/to #b',
      'frameStyleUnknown /pageTemplates/2/variants/recto/frames/0/style gone',
      'overflowTargetUnknown /pageTemplates/2/variants/recto/frames/0/next nowhere',
    ]);
  });

  it('reports an anchor loop through a group, and a decoration anchored to nothing', () => {
    const c = config([{
      id: 't',
      frames: [{ name: 'a', placement: { anchor: { to: '#g', edge: 'below' } } }, { name: 'b' }],
      groups: [{ name: 'g', frames: ['a', 'b'] }],
      decoration: { elements: [{ kind: 'rule', id: 'r', placement: { anchor: { to: '#b', edge: 'below' } } } as never, { kind: 'rule', id: 's', placement: { anchor: { to: '#r', edge: 'below' } } } as never, { kind: 'rule', id: 'u', placement: { anchor: { to: '#zz', edge: 'below' } } } as never] },
    }]);
    expect(kinds(c)).toEqual([
      'frameAnchorUnknown /pageTemplates/0/frames/0/placement/anchor/to a → g → a',
      'frameAnchorUnknown /pageTemplates/0/decoration/elements/2/placement/anchor/to #zz',
    ]);
  });

  it('reports unknown keys and words, with the closest one', () => {
    const c = config([{
      id: 't',
      areaa: 'trim',
      area: 'page',
      variants: { rekto: {} },
      frames: [{ name: 'a', heigth: mm(3), verticalAlign: 'center', fit: { minscale: 0.5 }, overflow: { continueIn: 'next-page', marks: false }, takes: 'h7' }],
      groups: [{ name: 'g', kind: 'column', frames: [] }],
    } as never], { labelStyles: [{ id: 'mar', fontstyle: 'italic', textTransform: 'lowercase' } as never, { name: 'no id' } as never] });
    const w = collectConfigWarnings(c);
    expect(w.map((x) => `${x.kind} ${x.path} ${x.value} ${x.suggestion ?? ''}`.trim())).toEqual([
      'unknownConfigKey /pageTemplates/0/areaa areaa area',
      'unknownConfigValue /pageTemplates/0/area page',
      'unknownConfigKey /pageTemplates/0/frames/0/heigth heigth height',
      'unknownConfigKey /pageTemplates/0/frames/0/fit/minscale minscale minScale',
      'unknownConfigKey /pageTemplates/0/frames/0/overflow/marks marks mark',
      'unknownConfigValue /pageTemplates/0/frames/0/verticalAlign center',
      'unknownConfigValue /pageTemplates/0/frames/0/takes h7 h1',
      'unknownConfigValue /pageTemplates/0/groups/0/kind column',
      'unknownConfigKey /pageTemplates/0/variants/rekto rekto recto',
      'unknownConfigKey /labelStyles/0/fontstyle fontstyle fontStyle',
      'unknownConfigValue /labelStyles/0/textTransform lowercase',
      'unknownConfigValue /labelStyles/1/id',
    ]);
  });

  it('checks the templates of htmlViewer.overrides with their own prefix', () => {
    const c: PostextConfig = { calloutStyles: STYLES, htmlViewer: { overrides: { pageTemplates: [{ id: 'x', frames: [{ name: 'a', style: 'nope' }] }] } } };
    expect(validatePageTemplates(c).map((w) => w.path)).toEqual(['/htmlViewer/overrides/pageTemplates/0/frames/0/style']);
  });

  it('checks frame styles against the built-in note when the config has no callout styles', () => {
    expect(kinds({ pageTemplates: [{ id: 't', frames: [{ name: 'a', style: 'note' }, { name: 'b', style: 'box' }] }] })).toEqual([
      'frameStyleUnknown /pageTemplates/0/frames/1/style box',
    ]);
  });
});

describe('label styles', () => {
  it('fill and strip their defaults', () => {
    // The slant and the capitals are left unset when not written: a written
    // 'normal' / 'none' turns off a borrowed paragraph style's (#955).
    expect(resolveLabelStyles([{ id: 'mar', fontStyle: 'italic' }])).toEqual([{ id: 'mar', fontStyle: 'italic', minScale: 0.85 }]);
    expect(resolveLabelStyles([{ id: 'mar', fontStyle: 'normal', textTransform: 'none' }])).toEqual([{ id: 'mar', fontStyle: 'normal', textTransform: 'none', minScale: 0.85 }]);
    expect(stripLabelStylesDefaults([{ id: 'mar', name: 'mar', fontStyle: 'normal', textTransform: 'uppercase', minScale: 0.85 }])).toEqual([{ id: 'mar', textTransform: 'uppercase' }]);
    expect(stripLabelStylesDefaults([])).toBeUndefined();
  });
});

describe('the config sections', () => {
  const c = config([TEMA, { id: 'hijo', extends: 'tema-cajas', area: 'content', frames: [{ name: 'texto', layer: 1 }] }], { labelStyles: [{ id: 'mar', halo: { color: { hex: '#ffffff', model: 'hex' }, width: mm(0.5) } }] });

  it('resolve only when set, so other documents hash as before', () => {
    const plain = resolveAllConfig({});
    expect('pageTemplates' in plain).toBe(false);
    expect('labelStyles' in plain).toBe(false);
    expect('pageTemplates' in resolveAllConfig({ pageTemplates: [] })).toBe(false);
    const r = resolveAllConfig(c);
    expect(r.pageTemplates).toEqual(c.pageTemplates);
    expect(r.pageTemplates).not.toBe(c.pageTemplates);
    expect(r.labelStyles).toEqual([{ id: 'mar', halo: { color: { hex: '#ffffff', model: 'hex' }, width: mm(0.5) }, minScale: 0.85 }]);
    // The resolved configuration resolves its templates too.
    expect(resolvePageTemplate(r, 'hijo')!.frames.map((f) => f.name)).toEqual(['titulo', 'texto', 'dinero', 'dinero-fotos']);
    expect(configFingerprint(resolveAllConfig({ locale: 'es' }))).toBe(configFingerprint(resolveAllConfig({ locale: 'es', pageTemplates: [] })));
  });

  it('survive a save: every field of a template is kept, a restated default too', () => {
    const saved = stripConfigDefaults(c);
    expect(saved.pageTemplates).toEqual(c.pageTemplates);
    expect(saved.labelStyles).toEqual(c.labelStyles);
    // The child's `area: 'content'` and `layer: 1` override the parent.
    expect(saved.pageTemplates![1]).toEqual({ id: 'hijo', extends: 'tema-cajas', area: 'content', frames: [{ name: 'texto', layer: 1 }] });
    expect(stripPageTemplatesDefaults([{ id: 'x', name: undefined, frames: [{ name: 'a', style: undefined }] }])).toEqual([{ id: 'x', frames: [{ name: 'a' }] }]);
    expect(stripConfigDefaults({ pageTemplates: [], labelStyles: [] })).toEqual({});
    for (const id of ['tema-cajas', 'hijo']) {
      for (const parity of [undefined, 'recto', 'verso'] as const) {
        expect(resolvePageTemplate(resolveAllConfig(saved), id, { parity }), `${id} ${parity}`).toEqual(resolvePageTemplate(resolveAllConfig(c), id, { parity }));
      }
    }
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
  });
});

describe('configVersion 15 (#853)', () => {
  it('is the version this engine writes', () => {
    expect(CONFIG_VERSION).toBe(21);
  });

  it('reads a configuration stored under 14 as it is, templates and all', () => {
    const stored = config([TEMA], { labelStyles: [{ id: 'mar' }], bodyText: { fontSize: { value: 10, unit: 'pt' } } });
    // (with the breaks at a slash of 1.51, #1164, as every configuration
    // stored under 18 or less)
    expect(migrateConfig(stored, 14, { content: '::::page{template="tema-cajas"}\n# T\n::::\n' })).toEqual(pinLegacySlashBreaks(stored));
    expect(migrateConfig(stored, 15, { content: 'Words.' })).toEqual(pinLegacySlashBreaks(stored));
    expect(migrateBundleConfig({}, [stored], 14, { content: 'Words.' })).toEqual(pinLegacySlashBreaks(stored));
    expect(migrateBundleConfig({ locale: 'es' }, [{ pageTemplates: [TEMA] }, { labelStyles: [{ id: 'mar' }] }], 15, { content: 'Words.' })).toEqual({ locale: 'es', pageTemplates: [TEMA], labelStyles: [{ id: 'mar' }], bodyText: { breakAfterSlashes: false } });
  });
});
