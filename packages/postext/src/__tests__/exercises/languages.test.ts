import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { parseMarkdown } from '../../parse/index.js';
import { readExercises } from '../../exercises/model.js';
import { stripChipStylesDefaults } from '../../defaults/text/chipStyles.js';
import { expandExercises } from '../../exercises/expand.js';
import { exerciseSettingsOf } from '../../defaults/boxes/exercises.js';
import { areaElements } from '../../exercises/designs.js';
import type { VDTBlock, VDTDocument } from '../../vdt.js';
import type { DesignPathElement, PostextConfig } from '../../types.js';

// Exercises in Chinese, Japanese and Arabic books (#1234): the marks, digits
// and brackets each language prints.

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const config = (extra: PostextConfig): PostextConfig => ({
  headings: { balancing: { enabled: false } },
  page: { width: mm(148), height: mm(210), margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
  layout: { layoutType: 'single' },
  ...extra,
});
const build = (md: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());
const textOf = (b: VDTBlock): string => b.lines.map((l) => (l.segments ?? []).map((s) => (s.chip ? `[${s.chip.blank ? '_' : s.chip.runs.map((r) => r.text).join('')}]` : s.text)).join('')).join(' / ');
const texts = (doc: VDTDocument): string[] => doc.blocks.filter((b) => b.type !== 'callout').map(textOf);

describe('exercises in other scripts (#1234)', () => {
  it('keeps a ruby whole in a gap', () => {
    const { exercises } = readExercises(parseMarkdown(':::exercise\nWrite.\n\n[[{春天|chūn tiān}]] [[a | b]]\n:::\n'));
    const gaps = exercises[0]!.gaps.map((g) => g.gap.options.length);
    expect(gaps).toEqual([1, 2]);
  });

  it('sets a Chinese number with its full-width suffix and no word space', () => {
    const doc = build('# 一\n\n:::exercise\n看拼音，写词语。\n\n- [x] 对\n- [ ] 错\n:::\n', config({
      locale: 'zh-Hans', exerciseStyles: [{ id: 'lx', number: { format: 'simp-chinese-informal', suffix: '、' } }],
    }));
    expect(texts(doc).find((t) => t.includes('看拼音'))).toMatch(/^\[一、\]看拼音/);
  });

  it('prints a true/false bracket and a Chinese inline choice in full-width brackets', () => {
    const md = '# 一\n\n:::exercise{type=truefalse}\n判断。\n\n- [x] 燕子飞回来了。\n:::\n\n:::exercise\n选择。\n\n种子 [[(zhǒng) | zhòng]]\n:::\n';
    const all = texts(build(md, config({ locale: 'zh-Hans', exerciseStyles: [{ id: 'lx', trueFalse: { look: 'bracket' } }] }))).join('\n');
    expect(all).toContain('燕子飞回来了。\t（[_]）');
    expect(all).toContain('（[zhǒng]　[zhòng]）');
  });

  it('numbers items and keys in Arabic-Indic digits, a key split by the Arabic semicolon', () => {
    const md = '# أ\n\n:::exercise{type=truefalse}\nصح أم خطأ؟\n\n- [x] الشمس نجم.\n- [ ] القمر كوكب.\n:::\n\n:::exercise{type=order}\nرتّب.\n\n1. أ\n2. ب\n:::\n';
    const doc = build(md, config({ locale: 'ar', exercises: { solutions: { placement: 'chapterEnd' } } }));
    const all = texts(doc).join('\n');
    expect(all).toContain('١.');
    expect(all).not.toMatch(/(^|\s)[12]\./m);
    expect(all).toContain('١ صح؛ ٢ خطأ');
    expect(all).not.toContain(' · ');
  });

  it('prints no entry at the chapter end for an exercise with nothing to print', () => {
    const md = '# U\n\n:::exercise\nWhy?\n:::\n\n:::exercise\nFill [[in]].\n:::\n';
    const all = texts(build(md, config({ exercises: { solutions: { placement: 'chapterEnd' } } }))).join('\n');
    expect(all).not.toMatch(/^1\.\s*$/m);
    expect(all).toMatch(/^2\.\tin$/m);
  });

  it('paints the synthetic boxes and chips in the palette main colour', () => {
    const green = { hex: '#2f7a55', model: 'hex' as const };
    const doc = build('# U\n\n:::exercise{bank}\nFill [[in]].\n:::\n', config({
      colorPalette: [{ id: 'main-color', name: 'main', value: green }],
      exercises: { solutions: { placement: 'chapterEnd' } },
    }));
    const word = doc.blocks.flatMap((b) => b.lines.flatMap((l) => l.segments ?? [])).find((s) => s.chip && !s.chip.blank && s.chip.runs.some((r) => r.text === 'in'));
    expect(word?.chip?.borderColor?.toLowerCase()).toBe('#2f7a55');
  });

  it('keeps a blank chip style\'s line and least width when stored', () => {
    const line = { id: 'line', underline: 'solid' as const, minWidth: { value: 24, unit: 'mm' as const } };
    expect(stripChipStylesDefaults([line])).toEqual([line]);
  });

  it('draws an exercise\'s writing lines inside the padding of its box', () => {
    const blocks = parseMarkdown(':::exercise{type=open lines=1}\nWhy?\n:::\n');
    const settings = exerciseSettingsOf({ exerciseStyles: [{ id: 'card', box: 'card' }] }, 'en');
    const ctx = { settings, bodySizePt: 10, lineHeightPt: 14, measurePt: 200, boxIds: new Set(['card']) };
    const widthOf = (insets?: Map<string, number>): number => {
      const area = expandExercises(blocks, { ...ctx, ...(insets ? { boxInsets: insets } : {}) }).boxes.find((b) => b.id.includes('-area-'))!;
      const el = area.design!.slot!.elements[0] as DesignPathElement;
      return (el.placement!.size!.width as { value: number }).value;
    };
    expect(widthOf()).toBe(200);
    expect(widthOf(new Map([['card', 30]]))).toBe(170);
  });

  it('keeps a solution printed after its exercise inside the exercise\'s box', () => {
    const blocks = parseMarkdown(':::exercise\nFill [[in]].\n:::\n\nAfter.\n');
    const settings = exerciseSettingsOf({ exercises: { solutions: { placement: 'inverted' } } }, 'en');
    const out = expandExercises(blocks, { settings, bodySizePt: 10, lineHeightPt: 14, measurePt: 200, boxIds: new Set() }).blocks;
    const turned = out.findIndex((b) => b.type === 'containerStart' && b.containerAttrs?.turn === '180');
    const outerEnd = out.findIndex((b) => b.type === 'containerEnd' && b.containerId === out[0]!.containerId);
    expect(turned).toBeGreaterThan(0);
    expect(turned).toBeLessThan(outerEnd);
  });

  it('writes a model answer on 田字格 a character to a square', () => {
    const { elements } = areaElements({ kind: 'tianzige', lines: 2, spacingPt: 20, widthPt: 61, color: { hex: '#888888', model: 'hex' }, weightPt: 0.5,
      answers: ['春风，来'], answerColor: { hex: '#ff0000', model: 'hex' } });
    const texts = elements.filter((e) => e.kind === 'text') as Array<{ content: string; placement: { offset: { x: { value: number }; y: { value: number } } } }>;
    expect(texts.map((t) => [t.content, t.placement.offset.x.value, t.placement.offset.y.value])).toEqual([
      ['春', 0, 0], ['风', 20, 0], ['，', 40, 0], ['来', 0, 20],
    ]);
  });
});
