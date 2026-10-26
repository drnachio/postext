import { describe, expect, it } from 'vitest';
import type { CalloutStyleConfig, PageTemplate, PostextConfig } from 'postext';
import { applyTextChanges } from '../book/textChanges.js';
import { calloutFences, retypeCalloutChanges } from './calloutFences.js';
import { frameStyleLibrary, resolveBookStyles } from './library.js';
import { countFields, mergeSuggestions, parseHex, styleDiff, styleFields, stylesAfterMerging } from './styleCompare.js';
import { placesToKeep, planMerge, planMerges, planRename, rewrittenTexts } from './styleMerge.js';
import { calloutStyleChain, inheritCalloutStyles } from 'postext';
import { DEFAULT_LABELS } from '../types/defaultLabels.js';
import { groupsText, suggestionText } from '../sidebar/sections/callouts/FrameStylesSection/text.js';
import { styleUsage } from './styleUsage.js';
import { planExerciseStyleRename } from './exerciseRefs.js';
import { frameDress, inheritedStyle, previewConfig, previewMarkdown } from './stylePreview.js';

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pad = (v: number) => ({ top: mm(v), right: mm(v), bottom: mm(v), left: mm(v) });

/** A textbook ported page by page: one style per box, most of them the
 *  same box with its padding a hair apart. */
const STYLES: CalloutStyleConfig[] = [
  { id: 'nota', name: 'Nota', border: { enabled: true }, stripe: { enabled: true } },
  { id: 'caja-p4', background: { hex: '#fde9d9', model: 'hex' }, padding: pad(4) },
  { id: 'caja-p5', background: { hex: '#fde9d9', model: 'hex' }, padding: pad(5) },
  { id: 'caja-p6', background: { hex: '#fde9da', model: 'hex' }, padding: pad(3.6) },
  { id: 'caja-p7', background: { hex: '#fde9d9', model: 'hex' }, padding: { ...pad(4), left: mm(9) } },
  {
    id: 'aviso',
    background: { hex: '#ff0000', model: 'hex' },
    border: { enabled: true, width: { value: 1, unit: 'pt' } },
    stripe: { enabled: true },
    icon: { kind: 'glyph', glyph: '!' },
  },
];

const TEMPLATES: PageTemplate[] = [
  {
    id: 'tema',
    frames: [{ name: 'texto', flow: true }, { name: 'dinero', style: 'caja-p5' }],
    variants: { verso: { frames: [{ name: 'dinero', style: 'caja-p6' }] } },
  },
  { id: 'tema-mapa', extends: 'tema' },
];

const CHAPTERS = [
  {
    id: 'c1',
    markdown: [
      '# Uno',
      '',
      ':::callout{type="caja-p4" label="El dinero"}',
      'Texto.',
      ':::',
      '',
      '```md',
      ':::callout{type="caja-p5"}',
      '```',
      '',
      ':::callout{type=caja-p7}',
      'Más.',
      ':::',
      '',
      ':::callout',
      'Sin tipo.',
      ':::',
    ].join('\n'),
  },
  {
    id: 'c2',
    markdown: [
      '::::page{template="tema"}',
      '# Tema',
      '::::',
      '',
      ':::callout{type="caja-p4"}',
      'Otra.',
      ':::',
      ':::callout{type="caja-p4"}',
      ':::',
      ':::callout{type="caja-p4"}',
      ':::',
      ':::callout{ type = \'caja-p6\' }',
      'Y otra.',
      ':::',
      '::::page{template=tema-mapa}',
      '::::',
    ].join('\n'),
  },
];

const CONFIG: PostextConfig = { calloutStyles: STYLES, pageTemplates: TEMPLATES };

describe('calloutFences', () => {
  it('reads every fence outside code, quoted or not, with the range of its type', () => {
    const md = CHAPTERS[0]!.markdown;
    const fences = calloutFences(md);
    expect(fences.map((f) => f.type)).toEqual(['caja-p4', 'caja-p7', '']);
    expect(md.slice(fences[0]!.valueFrom, fences[0]!.valueTo)).toBe('caja-p4');
    expect(md.slice(fences[1]!.valueFrom, fences[1]!.valueTo)).toBe('caja-p7');
    expect(fences[2]!.missing).toBe(true);
    expect(calloutFences(CHAPTERS[1]!.markdown).map((f) => f.type)).toEqual(['caja-p4', 'caja-p4', 'caja-p4', 'caja-p6']);
  });

  it('retypes only the fences naming a style of the set', () => {
    const md = CHAPTERS[0]!.markdown;
    const out = applyTextChanges(md, retypeCalloutChanges(md, new Map([['caja-p7', 'caja'], ['caja-p5', 'caja']])));
    expect(out).toContain(':::callout{type=caja}');
    expect(out).toContain(':::callout{type="caja-p4" label="El dinero"}');
    // A fence inside a code block is text, not a box.
    expect(out).toContain('```md\n:::callout{type="caja-p5"}\n```');
  });
});

describe('styleUsage', () => {
  it('counts boxes per chapter, the frames written with a style and the pages laid with them', () => {
    const usage = styleUsage(CONFIG, STYLES, CHAPTERS);
    const p4 = usage.get('caja-p4')!;
    expect(p4.fenceCount).toBe(4);
    expect(p4.fences.map((f) => [f.chapterId, f.offsets.length])).toEqual([['c1', 1], ['c2', 3]]);
    // A fence that names no style takes the first one.
    expect(usage.get('nota')!.fences[0]).toMatchObject({ chapterId: 'c1', implicit: 1 });
    const p5 = usage.get('caja-p5')!;
    expect(p5.frames).toEqual([{ templateId: 'tema', frame: 'dinero', scope: 'base' }]);
    // `tema-mapa` inherits the frame: its page counts too.
    expect(p5.templates).toEqual(['tema', 'tema-mapa']);
    expect(p5.pageCount).toBe(2);
    const p6 = usage.get('caja-p6')!;
    expect(p6.frames).toEqual([{ templateId: 'tema', frame: 'dinero', scope: 'verso' }]);
    expect(p6.fenceCount).toBe(1);
  });
});

describe('styleDiff', () => {
  it('reads lengths within 0.5 mm and colours within ΔE 2 as equal, and ignores id and name', () => {
    const a = styleFields({ id: 'a', name: 'A', padding: pad(4), background: { hex: '#fde9d9', model: 'hex' } });
    const b = styleFields({ id: 'b', name: 'B', padding: pad(4.4), background: { hex: '#FDE9DA', model: 'hex' } });
    expect(styleDiff(a, b)).toEqual([]);
    const c = styleFields({ id: 'c', padding: { ...pad(4), left: mm(4.6) }, background: { hex: '#fdd0b0', model: 'hex' } });
    expect(styleDiff(a, c)).toEqual(['background', 'padding.left']);
  });

  it('converts units before comparing (12 pt is 4.23 mm)', () => {
    const a = styleFields({ id: 'a', padding: pad(4.2) });
    const b = styleFields({ id: 'b', padding: { top: { value: 12, unit: 'pt' }, right: mm(4.2), bottom: mm(4.2), left: mm(4.2) } });
    expect(styleDiff(a, b)).toEqual([]);
  });

  it('parses short and long hex colours', () => {
    expect(parseHex('#fff')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseHex('transparent')).toBeNull();
  });
});

describe('mergeSuggestions', () => {
  it('groups the styles that differ only in padding around the most used one', () => {
    const lib = frameStyleLibrary(CONFIG, CHAPTERS);
    const caja = lib.suggestions.find((s) => s.merge.includes('caja-p5'))!;
    expect(caja.keep).toBe('caja-p4');
    expect(caja.merge).toEqual(['caja-p5', 'caja-p6', 'caja-p7']);
    expect(caja.groups).toEqual(['padding']);
    // Nothing else is near enough: the plain note and the red warning stay.
    expect(lib.suggestions).toHaveLength(1);
    expect(stylesAfterMerging(STYLES.length, lib.suggestions)).toBe(3);
  });

  it('holds back styles that differ in more settings than the threshold', () => {
    const lib = frameStyleLibrary(CONFIG, CHAPTERS, { maxFields: 0 });
    // Only caja-p6 is within the tolerances on every setting.
    expect(lib.suggestions.map((s) => [s.keep, s.merge])).toEqual([['caja-p4', ['caja-p6']]]);
  });

  it('counts the four sides of a padding as one setting', () => {
    expect(countFields(['padding.left', 'padding.top', 'body.color'])).toBe(2);
  });

  it('counts where a box stands for styles of the text, unless asked to compare the look only', () => {
    const fixed = (id: string, y: number): CalloutStyleConfig => ({ id, placement: 'fixed', fixed: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(20), y: mm(y) } }, padding: pad(2) });
    const styles = [fixed('t-31', 31), fixed('t-58', 58), fixed('t-90', 90)];
    const chapters = [{ id: 'c', markdown: styles.map((s) => `:::callout{type="${s.id}"}\nx\n:::`).join('\n\n') }];
    const config: PostextConfig = { calloutStyles: styles };
    const strict = frameStyleLibrary(config, chapters, { maxFields: 0 });
    expect(strict.suggestions).toEqual([]);
    const look = frameStyleLibrary(config, chapters, { maxFields: 0, ignorePosition: true });
    expect(look.suggestions).toEqual([{ keep: 't-31', merge: ['t-58', 't-90'], fields: [], groups: [], moves: 2 }]);
  });

  it('compares styles only frames use on their look: a frame takes its place from the template', () => {
    const styles: CalloutStyleConfig[] = [
      { id: 'a', placement: 'fixed', padding: pad(2) },
      { id: 'b', placement: 'here', padding: pad(2) },
    ];
    const config: PostextConfig = { calloutStyles: styles, pageTemplates: [{ id: 't', frames: [{ name: 'x', style: 'a' }, { name: 'y', style: 'b' }] }] };
    const [s] = mergeSuggestions(styles, frameStyleLibrary(config, []).resolved, styleUsage(config, styles, []), { maxFields: 0 });
    expect(s).toMatchObject({ keep: 'a', merge: ['b'], moves: 0 });
  });
});

describe('planMerge', () => {
  it('rewrites every frame and fence to the kept style and drops the others', () => {
    const plan = planMerge(CONFIG, STYLES, CHAPTERS, 'caja-p4', ['caja-p5', 'caja-p6', 'caja-p7']);
    expect(plan.calloutStyles.map((s) => s.id)).toEqual(['nota', 'caja-p4', 'aviso']);
    expect(plan.frames).toEqual([
      { templateId: 'tema', frame: 'dinero', scope: 'base', from: 'caja-p5' },
      { templateId: 'tema', frame: 'dinero', scope: 'verso', from: 'caja-p6' },
    ]);
    expect(plan.pageTemplates![0]!.frames![1]!.style).toBe('caja-p4');
    expect(plan.pageTemplates![0]!.variants!.verso!.frames![0]!.style).toBe('caja-p4');
    // The child template is left as it was: it inherits the frame.
    expect(plan.pageTemplates![1]).toBe(TEMPLATES[1]);
    expect(plan.fenceCount).toBe(2);
    const texts = rewrittenTexts(CHAPTERS, plan);
    expect(texts.get('c1')).toContain(':::callout{type=caja-p4}');
    expect(texts.get('c2')).toContain(":::callout{ type = 'caja-p4' }");
    expect(calloutFences(texts.get('c1')!).map((f) => f.type)).toEqual(['caja-p4', 'caja-p4', '']);

  });

  it('puts the kept style where the first of the group stood', () => {
    const styles: CalloutStyleConfig[] = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
    expect(planMerge({ calloutStyles: styles }, styles, [], 'z', ['x']).calloutStyles.map((s) => s.id)).toEqual(['z', 'y']);
  });

  it('takes several groups in one rewrite', () => {
    const styles: CalloutStyleConfig[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const chapters = [{ id: 'x', markdown: ':::callout{type=b}\n:::\n:::callout{type=d}\n:::' }];
    const plan = planMerges({ calloutStyles: styles }, styles, chapters, [{ keep: 'a', merge: ['b'] }, { keep: 'd', merge: ['c'] }]);
    expect(plan.calloutStyles.map((s) => s.id)).toEqual(['a', 'd']);
    expect(rewrittenTexts(chapters, plan).get('x')).toBe(':::callout{type=a}\n:::\n:::callout{type=d}\n:::');
  });

  it('a rename rewrites the same references and keeps the style in place', () => {
    const plan = planRename(CONFIG, STYLES, CHAPTERS, 'caja-p6', 'caja-verso');
    expect(plan.calloutStyles.map((s) => s.id)).toEqual(['nota', 'caja-p4', 'caja-p5', 'caja-verso', 'caja-p7', 'aviso']);
    expect(plan.frames).toEqual([{ templateId: 'tema', frame: 'dinero', scope: 'verso', from: 'caja-p6' }]);
    expect(rewrittenTexts(CHAPTERS, plan).get('c2')).toContain("type = 'caja-verso'");
  });
});

describe('styles based on another (#905)', () => {
  const fixed = (id: string, y: number): CalloutStyleConfig => ({ id, placement: 'fixed', fixed: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(20), y: mm(y) } }, padding: pad(2), background: { hex: '#fde9d9', model: 'hex' } });
  const styles = [fixed('t-31', 31), fixed('t-58', 58), { ...fixed('t-90', 90), padding: pad(2.2) }];
  const chapters = [{ id: 'c', markdown: styles.map((s) => `:::callout{type="${s.id}"}\nx\n:::`).join('\n\n') }];
  const config: PostextConfig = { calloutStyles: styles };

  it('a merge on the look keeps a style per place, based on the kept one: no box moves', () => {
    const lib = frameStyleLibrary(config, chapters, { maxFields: 1, ignorePosition: true });
    const places = placesToKeep(lib.suggestions, lib);
    expect([...places.keys()]).toEqual(['t-58', 't-90']);
    const plan = planMerges(config, styles, chapters, lib.suggestions, places);
    expect(plan.from).toEqual([]);
    expect(plan.stays).toEqual(['t-58', 't-90']);
    expect(plan.fenceCount).toBe(0);
    expect(plan.calloutStyles[1]).toEqual({ id: 't-58', extends: 't-31', fixed: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(20), y: mm(58) } } });
    // Each box keeps its place and takes the kept look (its padding too).
    const after = frameStyleLibrary({ calloutStyles: plan.calloutStyles }, chapters);
    const before = frameStyleLibrary(config, chapters);
    expect(after.resolved.map((r) => r.fixed)).toEqual(before.resolved.map((r) => r.fixed));
    expect(after.resolved[2]!.padding).toEqual(before.resolved[0]!.padding);
    expect(inheritCalloutStyles(plan.calloutStyles)[2]!.background).toEqual(styles[0]!.background);
  });

  it('without places the merge moves the boxes, as before', () => {
    const lib = frameStyleLibrary(config, chapters, { maxFields: 1, ignorePosition: true });
    const plan = planMerges(config, styles, chapters, lib.suggestions);
    expect(plan.from).toEqual(['t-58', 't-90']);
    expect(plan.stays).toEqual([]);
    expect(plan.fenceCount).toBe(2);
  });

  it('a rename or a merge keeps the styles based on it pointing at it', () => {
    const based: CalloutStyleConfig[] = [{ id: 'a' }, { id: 'b' }, { id: 'c', extends: 'b' }];
    expect(planRename({ calloutStyles: based }, based, [], 'b', 'base').calloutStyles[2]).toEqual({ id: 'c', extends: 'base' });
    expect(planMerge({ calloutStyles: based }, based, [], 'a', ['b']).calloutStyles).toEqual([{ id: 'a' }, { id: 'c', extends: 'a' }]);
  });
});

describe('the preview of a style', () => {
  it('dresses the box as a frame: in the flow, across the measure, without its fixed place', () => {
    const style: CalloutStyleConfig = { id: 'caja', placement: 'fixed', span: 'side', fixed: { offset: { x: mm(20), y: mm(31) } }, marginBottom: mm(234), label: {} };
    const config = previewConfig({ calloutStyles: STYLES, pageTemplates: TEMPLATES, layout: { layoutType: 'double' } }, style);
    expect(config.calloutStyles).toEqual([{ id: 'caja', placement: 'here', span: 'column', width: 'fill', marginTop: mm(0), marginBottom: mm(0), floatBarrier: false, label: {} }]);
    expect(frameDress(style).fixed).toBeUndefined();
    expect(config.pageTemplates).toBeUndefined();
    expect(config.layout?.layoutType).toBe('single');
    expect(config.header).toEqual({ elements: [] });
  });

  it('widens the sample when the padding leaves less than 40 mm of measure', () => {
    expect(previewConfig({}, { id: 'a' }).page!.width).toEqual(mm(92));
    expect(previewConfig({}, { id: 'b', padding: { left: mm(114.25) } }).page!.width).toEqual(mm(167));
  });

  it('keeps a tab set far along a wide frame on the sample box', () => {
    const style: CalloutStyleConfig = { id: 'pestana', label: { inset: mm(139.74), height: mm(8) } };
    expect(previewConfig({}, style).calloutStyles![0]!.label).toEqual({ inset: mm(4), height: mm(8) });
    expect(previewConfig({}, { id: 'x', label: { inset: mm(6) } }).calloutStyles![0]!.label).toEqual({ inset: mm(6) });
  });

  it('is a single box of the style, with the sample label only when the style has a tab', () => {
    const sample = { text: 'Texto de muestra.', label: 'Una "etiqueta" {rara}' };
    expect(previewMarkdown({ id: 'caja', label: {} }, sample)).toBe(':::callout{type="caja" label="Una etiqueta rara"}\nTexto de muestra.\n:::\n');
    expect(previewMarkdown({ id: 'nota' }, sample)).toBe(':::callout{type="nota"}\nTexto de muestra.\n:::\n');
  });
});

describe('the sample and the merge card of styles based on another (#964)', () => {
  const colour = (hex: string) => ({ hex, model: 'hex' as const });
  const note: CalloutStyleConfig = {
    id: 'note',
    title: 'Good to know',
    background: colour('#e3f1fa'),
    border: { enabled: true, color: colour('#1d70b8'), width: { value: 1, unit: 'pt' } },
    padding: pad(3),
    titleStyle: { fontWeight: 700, color: colour('#1d70b8') },
  };
  const at = (edge: 'top-right' | 'bottom-left') => ({ placement: 'fixed' as const, fixed: { anchor: { to: 'container' as const, edge }, offset: { x: mm(0), y: mm(0) } } });
  const top: CalloutStyleConfig = { id: 'note-top', extends: 'note', ...at('top-right') };
  const foot: CalloutStyleConfig = { id: 'note-foot', extends: 'note', ...at('bottom-left') };
  const book = [note, top, foot];
  const boxes = (ids: string[]) => [{ id: 'c', markdown: ids.map((id) => `:::callout{type="${id}"}\nx\n:::`).join('\n\n') }];

  it('draws a style with what it inherits from its parent, dressed as a frame', () => {
    const config = previewConfig({ calloutStyles: book }, top);
    const [drawn] = config.calloutStyles!;
    expect(drawn).toMatchObject({ id: 'note-top', background: colour('#e3f1fa'), padding: pad(3), title: 'Good to know', placement: 'here', width: 'fill' });
    expect(drawn!.extends).toBeUndefined();
    expect(drawn!.fixed).toBeUndefined();
    // What the engine resolves for the sample is the shared look.
    const [resolved] = resolveBookStyles({}, config.calloutStyles!);
    expect(resolved!.background.hex).toBe('#e3f1fa');
    expect(resolved!.border.enabled).toBe(true);
    expect(resolved!.titleStyle.color?.hex).toBe('#1d70b8');
  });

  it('reads the parent in the book, whatever the style passed in changes', () => {
    const draft: CalloutStyleConfig = { ...top, padding: pad(7) };
    const [drawn] = previewConfig({ calloutStyles: book }, draft).calloutStyles!;
    expect(drawn!.padding).toEqual(pad(7));
    expect(drawn!.background).toEqual(colour('#e3f1fa'));
    // A style the book does not list yet stands last; a missing parent leaves it alone.
    expect(previewConfig({ calloutStyles: [note] }, { id: 'new', extends: 'note' }).calloutStyles![0]!.background).toEqual(colour('#e3f1fa'));
    expect(previewConfig({ calloutStyles: [note] }, { id: 'lost', extends: 'gone', padding: pad(1) }).calloutStyles![0]).toMatchObject({ id: 'lost', padding: pad(1) });
  });

  it('keys the picture on the look the style is drawn with: a change in the parent paints again', () => {
    const a = inheritedStyle({ calloutStyles: book }, top);
    const b = inheritedStyle({ calloutStyles: [{ ...note, background: colour('#ffeecc') }, top, foot] }, top);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(inheritedStyle({ calloutStyles: book }, note)).toBe(note);
  });

  it('compares styles as the engine resolves them: two thin styles on one base look the same', () => {
    const lib = frameStyleLibrary({ calloutStyles: book }, boxes(['note', 'note-top', 'note-foot']), { ignorePosition: true });
    expect(lib.suggestions).toEqual([{ keep: 'note', merge: ['note-top', 'note-foot'], fields: [], groups: [], moves: 2 }]);
    expect(suggestionText(lib.suggestions[0]!, DEFAULT_LABELS)).toBe('These 3 styles look the same: merge?');
  });

  it('names a difference that is the title text as the default title, not the title style', () => {
    const lib = frameStyleLibrary({ calloutStyles: [note, top, { ...foot, title: 'Before you leave' }] }, boxes(['note', 'note-top', 'note-foot']), { ignorePosition: true });
    expect(lib.suggestions[0]).toMatchObject({ keep: 'note', merge: ['note-top', 'note-foot'], groups: ['title'] });
    expect(suggestionText(lib.suggestions[0]!, DEFAULT_LABELS)).toBe('These 3 styles differ only in default title: merge?');
    expect(groupsText(['titleStyle'], DEFAULT_LABELS)).toBe('title style');
  });

  it('a style that overrides a setting of the parent differs from the base in that setting only', () => {
    const lib = frameStyleLibrary({ calloutStyles: [note, { ...top, borderRadius: mm(2) }] }, boxes(['note', 'note-top']), { ignorePosition: true });
    expect(lib.suggestions[0]).toMatchObject({ groups: ['borderRadius'] });
  });

  it('a style that overrides only colours is a variant of its base, not a duplicate (#976)', () => {
    const lib = frameStyleLibrary({ calloutStyles: [note, { ...top, background: colour('#ffeecc') }] }, boxes(['note', 'note-top']), { ignorePosition: true });
    expect(lib.suggestions).toEqual([]);
    expect(lib.kinds).toEqual([{ base: 'note', variants: [expect.objectContaining({ id: 'note-top', extendsBase: true, groups: ['background'] })] }]);
  });

  it('merging a base into the style that is based on it leaves no loop and no look changed', () => {
    const config: PostextConfig = { calloutStyles: book };
    const chapters = boxes(['note', 'note-top', 'note-foot']);
    // The style kept is the child: its parent is merged into it.
    const plan = planMerges(config, book, chapters, [{ keep: 'note-top', merge: ['note'] }]);
    const out = plan.calloutStyles;
    expect(out.map((s) => s.id)).toEqual(['note-top', 'note-foot']);
    for (let i = 0; i < out.length; i++) {
      expect(calloutStyleChain(out, i).cycle).toBeUndefined();
      expect(calloutStyleChain(out, i).unknown).toBeUndefined();
    }
    expect(out[1]!.extends).toBe('note-top');
    const resolved = resolveBookStyles({ calloutStyles: out }, out);
    expect(resolved[0]!.background.hex).toBe('#e3f1fa');
    expect(resolved[0]!.title).toBe('Good to know');
    expect(resolved[0]!.placement).toBe('fixed');
    expect(resolved[1]!.background.hex).toBe('#e3f1fa');
  });

  it('merging a base into a style two steps down its chain leaves no loop', () => {
    const chain: CalloutStyleConfig[] = [{ id: 'a', padding: pad(2) }, { id: 'b', extends: 'a', title: 'B' }, { id: 'c', extends: 'b', background: colour('#112233') }];
    const plan = planMerges({ calloutStyles: chain }, chain, boxes(['a', 'b', 'c']), [{ keep: 'c', merge: ['a'] }]);
    const out = plan.calloutStyles;
    expect(out.map((s) => s.id)).toEqual(['c', 'b']);
    for (let i = 0; i < out.length; i++) {
      const found = calloutStyleChain(out, i);
      expect(found.cycle).toBeUndefined();
      expect(found.unknown).toBeUndefined();
    }
    const resolved = resolveBookStyles({}, out);
    expect(resolved[0]!.padding.left.value).toBe(2);
    expect(resolved[0]!.title).toBe('B');
    expect(resolved[0]!.background.hex).toBe('#112233');
  });
});

describe('kinds of box: one shape in several tints (#976)', () => {
  const colour = (hex: string) => ({ hex, model: 'hex' as const });
  const shape = { border: { enabled: true, color: colour('#222222'), width: { value: 1, unit: 'pt' as const } }, padding: pad(4), borderRadius: mm(2) };
  const tints: CalloutStyleConfig[] = [
    { id: 'caja-amarilla', ...shape, background: colour('#fff3b0') },
    { id: 'caja-rosa', ...shape, background: colour('#f6c3d0'), border: { ...shape.border, color: colour('#aa3355') } },
    { id: 'caja-azul', ...shape, background: colour('#c3e0f6') },
    { id: 'caja-ancha', ...shape, background: colour('#fff3b0'), padding: pad(8) },
  ];
  const chapters = [{ id: 'c', markdown: [':::callout{type="caja-amarilla"}\nx\n:::', ':::callout{type="caja-amarilla"}\nx\n:::', ':::callout{type="caja-rosa"}\nx\n:::'].join('\n\n') }];

  it('groups the tints under the most used and leaves them out of the merge suggestions', () => {
    const lib = frameStyleLibrary({ calloutStyles: tints }, chapters);
    expect(lib.kinds).toHaveLength(1);
    expect(lib.kinds[0]!.base).toBe('caja-amarilla');
    expect(lib.kinds[0]!.variants.map((v) => [v.id, v.extendsBase, v.groups])).toEqual([
      ['caja-rosa', false, ['background', 'border']],
      ['caja-azul', false, ['background']],
    ]);
    // The wider box is a different shape: still a merge candidate.
    expect(lib.suggestions.flatMap((s) => [s.keep, ...s.merge])).toEqual(['caja-amarilla', 'caja-ancha']);
  });

  it('a book with no stored styles has no kinds', () => {
    expect(frameStyleLibrary({}, []).kinds).toEqual([]);
  });
});

describe('what the exercises name (#1244)', () => {
  const styles: CalloutStyleConfig[] = [{ id: 'card' }, { id: 'tray' }, { id: 'key' }];
  const config: PostextConfig = {
    calloutStyles: styles,
    exerciseStyles: [
      { id: 'drill', box: 'card', bank: { box: 'tray', order: 'alpha' }, solutions: { box: 'key', placement: 'after' } },
      { id: 'plain' },
    ],
    exercises: { solutions: { placement: 'chapterEnd', box: 'key' } },
  };

  it('a box style renamed is renamed in the exercise styles and the book\'s solutions', () => {
    const plan = planRename(config, styles, [], 'key', 'answers');
    expect(plan.exerciseStyles![0]).toEqual({ id: 'drill', box: 'card', bank: { box: 'tray', order: 'alpha' }, solutions: { box: 'answers', placement: 'after' } });
    expect(plan.exerciseStyles![1]).toBe(config.exerciseStyles![1]);
    expect(plan.exercises).toEqual({ solutions: { placement: 'chapterEnd', box: 'answers' } });
    const card = planRename(config, styles, [], 'card', 'frame');
    expect(card.exerciseStyles![0]!.box).toBe('frame');
    expect('exercises' in card).toBe(false);
    // A style no exercise names leaves them alone.
    const none = planRename({ ...config, calloutStyles: [...styles, { id: 'other' }] }, [...styles, { id: 'other' }], [], 'other', 'else');
    expect('exerciseStyles' in none || 'exercises' in none).toBe(false);
  });

  it('a box style merged away is named by the kept one', () => {
    const plan = planMerge(config, styles, [], 'card', ['tray']);
    expect(plan.exerciseStyles![0]!.bank).toEqual({ box: 'card', order: 'alpha' });
  });

  it('an exercise style renamed is renamed in every fence that names it, and in the styles based on it', () => {
    const chapters = [
      { id: 'a', markdown: ':::exercise{style=drill type=gaps}\nFill [[in]].\n:::\n\n```md\n:::exercise{style=drill}\n```\n\n:::exercise{style="plain"}\nx\n:::' },
      { id: 'b', markdown: ':::exercise\nNo style.\n:::' },
    ];
    const plan = planExerciseStyleRename([...config.exerciseStyles!, { id: 'drill-2', extends: 'drill' }], chapters, 'drill', 'practice');
    expect(plan.exerciseStyles.map((s) => [s.id, s.extends])).toEqual([['practice', undefined], ['plain', undefined], ['drill-2', 'practice']]);
    expect(plan.fenceCount).toBe(1);
    expect(plan.chapters.map((c) => c.chapterId)).toEqual(['a']);
    expect(applyTextChanges(chapters[0]!.markdown, plan.chapters[0]!.changes)).toContain(':::exercise{style=practice type=gaps}');
    expect(applyTextChanges(chapters[0]!.markdown, plan.chapters[0]!.changes)).toContain('```md\n:::exercise{style=drill}\n```');
  });
});
