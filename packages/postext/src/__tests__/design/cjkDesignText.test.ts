import { describe, it, expect, afterEach } from 'vitest';
import { layoutDesignSlot, type ResolvedTextPrimitive } from '../../design/layout';
import { resolveDesignSlot, type DesignSlotKind } from '../../defaults/headerFooter';
import { resolveCjkConfig } from '../../defaults/cjk';
import { cjkCompositionOf, setCjkComposition } from '../../measure/cjkPunctuation';
import { setCjkLineBreak } from '../../measure/cjkClasses';
import type { DesignPlaceholderContext } from '../../design/placeholders';
import type { CjkConfig, DesignElement, DesignTextElement } from '../../types';
import type { VDTPage } from '../../vdt';
import { installSizedStub } from '../vertical/stub';

// #637: design text in Chinese takes the body's CJK rules: line-start and
// line-end prohibitions, mark widths, the Han–Latin space. The stub sets a
// Han character and a full-width mark 1 em (20 px at 20 pt, 72 dpi), a
// Latin letter ½ em.
installSizedStub();

const DPI = 72;
const pt = (value: number) => ({ value, unit: 'pt' as const });
const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const placeholders: DesignPlaceholderContext = { kind: 'header', page: stubPage, allPages: [stubPage], metadata: {}, chapterTitleByPageIndex: [] };

const NOTE = '本索引收录前三回选文中的人物，粗体页码为人物出场之页；别名与原名另立参见条目。';

/** Set the document's CJK rules as a build does. */
function useCjk(locale: string, cjk: CjkConfig = {}): void {
  const resolved = resolveCjkConfig(cjk, locale);
  setCjkLineBreak(resolved.lineBreak);
  setCjkComposition(cjkCompositionOf(resolved, DPI, locale));
}

afterEach(() => {
  setCjkLineBreak('gb');
  setCjkComposition(undefined);
});

const element = (content: string, ems: number | undefined, extra: Partial<DesignTextElement> = {}): DesignElement => ({
  kind: 'text', id: 't', content, fontSize: pt(20), lineHeight: 1.5,
  placement: { anchor: { to: 'container', edge: 'top-left' }, ...(ems !== undefined ? { size: { width: pt(ems * 20) } } : {}) },
  ...extra,
} as DesignElement);

const prim = (el: DesignElement, kind: DesignSlotKind = 'heading'): ResolvedTextPrimitive =>
  layoutDesignSlot(resolveDesignSlot({ elements: [el] }, kind), { container: { x: 0, y: 0, width: 2000, height: 1000 }, dpi: DPI, placeholders }, 0).primitives[0] as ResolvedTextPrimitive;

/** Each mark of a line with the width its run gives it. */
function markWidths(p: ResolvedTextPrimitive, marks: string): number[] {
  const out: number[] = [];
  for (const line of p.lines) {
    for (const run of line.runs ?? [{ text: line.text, width: line.width }]) {
      if (marks.includes(run.text)) out.push(run.width);
    }
  }
  return out;
}

const NO_START = '，。；、：！？）》”';
const NO_END = '《“（';

describe('CJK design text (#637)', () => {
  it('sets ，； half width in a zh-Hans note with kaiming marks, and keeps the line rules', () => {
    useCjk('zh-Hans');
    for (let ems = 6; ems <= 24; ems++) {
      const p = prim(element(NOTE, ems));
      const lines = p.lines.map((l) => l.text);
      expect(lines.join('')).toBe(NOTE);
      for (const l of lines) {
        expect(NO_START.includes(l[0]!), `${ems}: ${l}`).toBe(false);
        expect(NO_END.includes(l[l.length - 1]!), `${ems}: ${l}`).toBe(false);
      }
      for (const l of p.lines) expect(l.width).toBeLessThanOrEqual(ems * 20 + 1e-6);
    }
    // A mark inside a line: half an em.
    const wide = prim(element(NOTE, 60));
    expect(wide.lines).toHaveLength(1);
    expect(markWidths(wide, '，；')).toEqual([10, 10]);
    // 。 ends the note: its blank after the glyph goes at the line end.
    expect(wide.lines[0]!.width).toBe(NOTE.length * 20 - 2 * 10 - 10);
  });

  it('sets them full width in zh-Hant with fullwidth marks, under the same line rules', () => {
    useCjk('zh-Hant', { punctuationWidth: 'fullwidth', lineBreak: 'gb' });
    for (let ems = 6; ems <= 24; ems++) {
      const p = prim(element(NOTE, ems));
      for (const l of p.lines.map((x) => x.text)) {
        expect(NO_START.includes(l[0]!), `${ems}: ${l}`).toBe(false);
        expect(NO_END.includes(l[l.length - 1]!), `${ems}: ${l}`).toBe(false);
      }
    }
    const wide = prim(element(NOTE, 60));
    // Every mark at its full em: the line is the text in the element's
    // font, at the glyphs' own advances.
    expect(wide.lines[0]!.runs).toBeUndefined();
    expect(wide.lines[0]!.width).toBe(NOTE.length * 20);
  });

  it('never opens a line with a mark where the Latin wrapper did', () => {
    useCjk('zh-Hans');
    // Seven characters to the line: the Latin wrapper cut after 七 and
    // opened the second line with 。.
    const text = '一二三四五六七。八九十';
    const p = prim(element(text, 7));
    expect(p.lines[1]!.text[0]).not.toBe('。');
    useCjk('zh-Hans', { composeDesignText: false });
    expect(prim(element(text, 7)).lines.map((l) => l.text)).toEqual(['一二三四五六七', '。八九十']);
  });

  it('puts the Han–Latin space between Han and Latin', () => {
    useCjk('zh-Hans');
    const p = prim(element('用iPhone拍照', undefined));
    // 用 + ¼ em + iPhone (6 × ½ em) + ¼ em + 拍照.
    expect(p.lines[0]!.width).toBe(20 + 5 + 60 + 5 + 40);
    const runs = p.lines[0]!.runs!;
    expect(runs.map((r) => r.text).join('')).toBe('用iPhone拍照');
    expect(runs.some((r) => r.inkOffset !== undefined)).toBe(true);
  });

  it('keeps explicit line breaks', () => {
    useCjk('zh-Hans');
    const p = prim(element('第一行。\n第二行，在此。', 30));
    expect(p.lines.map((l) => l.text)).toEqual(['第一行。', '第二行，在此。']);
  });

  it('sets inline marks in their fonts', () => {
    useCjk('zh-Hans');
    const p = prim(element('人物**粗体**，页码。', 30, { inlineMarks: true }));
    const runs = p.lines[0]!.runs!;
    expect(runs.map((r) => r.text).join('')).toBe('人物粗体，页码。');
    const bold = runs.find((r) => r.text.includes('粗体'))!;
    expect(bold.fontString).toMatch(/^(normal )?700 /);
    expect(markWidths(p, '，')).toEqual([10]);
  });

  it('applies to running heads that end in an ellipsis when they fit', () => {
    useCjk('zh-Hans');
    const p = prim(element('第一回，甄士隐梦幻识通灵', 20), 'header');
    expect(markWidths(p, '，')).toEqual([10]);
  });

  it('leaves Latin design text as it was', () => {
    useCjk('zh-Hans');
    const latin = prim(element('The history of the Spanish nation', 8));
    useCjk('zh-Hans', { composeDesignText: false });
    const before = prim(element('The history of the Spanish nation', 8));
    expect(latin.lines).toEqual(before.lines);
    expect(latin.lines.every((l) => l.runs === undefined)).toBe(true);
  });
});
