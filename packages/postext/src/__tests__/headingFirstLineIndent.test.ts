import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { resolveHeadingsConfig, stripHeadingsDefaults } from '../defaults/headings';
import { stripConfigDefaults } from '../defaults';
import { createBundle, openBundle } from '../bundle';
import { computeOutlineFor } from '../pipeline/outline';
import { parseMarkdown } from '../parse/blockParser';
import type { HeadingLevelConfig, PostextConfig } from '../types';
import type { VDTBlock, VDTDocument } from '../vdt';
import { installSizedStub } from './vertical/stub';

// A heading's first-line indent (#636): GB/T 9704 sets every level of head
// two cells in, its turnover lines back at the margin. `em` counts the body
// size, as a heading's `indent` does. The stub measures CJK characters and
// fullwidth forms 1 em, a space ¼ em, Latin ½ em.
installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
const em = (value: number) => ({ value, unit: 'em' as const });

/** 72 dpi: a 10 px body, a 200 px measure (20 body characters). */
const BODY = 10;
const config = (extra: Partial<PostextConfig> = {}, levels: HeadingLevelConfig[] = []): PostextConfig => ({
  locale: 'zh',
  page: { width: pt(240), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(BODY), lineHeight: pt(17.5), textAlign: 'justify', firstLineIndent: em(2) },
  headings: {
    levels: ([
      { level: 1, breakBefore: { enabled: false } },
      { level: 2, fontSize: pt(16), lineHeight: pt(24) },
    ] as HeadingLevelConfig[]).filter((l) => !levels.some((o) => o.level === l.level)).concat(levels),
  },
  ...extra,
});
const vertical = (c: PostextConfig): PostextConfig => ({ ...c, layout: { ...c.layout, writingMode: 'vertical-rl' } });
const gbt: HeadingLevelConfig = { level: 2, fontSize: pt(16), lineHeight: pt(24), firstLineIndent: em(2) };

/** A head that runs to three lines of 16 px characters. */
const ZH = '关于进一步加强和改进机关公文处理工作的若干意见和建议';
const EN = 'A rather long heading that wraps onto a second line here';
const heading = (doc: VDTDocument, text?: string): VDTBlock =>
  doc.blocks.find((b) => b.type === 'heading' && (text === undefined || b.lines.some((l) => l.text.includes(text))))!;
/** Each line's start from the heading's block edge (the top of a vertical
 *  line: its logical x). */
const starts = (h: VDTBlock): number[] => h.lines.map((l) => l.bbox.x - h.bbox.x);

describe('firstLineIndent on a heading level (#636)', () => {
  it('sets the first line two body ems in and the turnover at the margin, whatever the heading size (CJK composer)', () => {
    for (const c of [config({}, [gbt]), vertical(config({}, [gbt]))]) {
      const h = heading(buildDocument({ markdown: `## ${ZH}\n\n正文` }, c));
      expect(h.lines.length).toBeGreaterThanOrEqual(2);
      const [first, ...rest] = starts(h);
      // 2 body ems (20 px), not 2 heading ems (32 px).
      expect(first).toBeCloseTo(2 * BODY, 6);
      for (const s of rest) expect(s).toBeCloseTo(0, 6);
    }
    // The first line is shorter by the indent: 180 px hold eleven 16 px
    // characters, the next line twelve.
    const h = heading(buildDocument({ markdown: `## ${ZH}\n\n正文` }, config({}, [gbt])));
    expect(h.lines[0]!.text).toBe(ZH.slice(0, 11));
    expect(h.lines[1]!.text).toBe(ZH.slice(11, 23));
  });

  it('sets a Latin head broken by Knuth–Plass the same way', () => {
    const c = config({ locale: 'en', bodyText: { fontSize: pt(BODY), lineHeight: pt(17.5), textAlign: 'justify', optimalLineBreaking: true } }, [gbt]);
    const h = heading(buildDocument({ markdown: `## ${EN}\n\nBody` }, c));
    expect(h.lines.length).toBeGreaterThanOrEqual(2);
    const [first, ...rest] = starts(h);
    expect(first).toBeCloseTo(2 * BODY, 6);
    for (const s of rest) expect(s).toBeCloseTo(0, 6);
    // Without it, the first line starts at the margin too.
    const plain = heading(buildDocument({ markdown: `## ${EN}\n\nBody` }, { ...c, headings: { levels: [{ level: 2, fontSize: pt(16), lineHeight: pt(24) }] } }));
    expect(starts(plain)[0]).toBeCloseTo(0, 6);
  });

  it('keeps the start-of-line rule for a head that opens with an opening bracket, as a body paragraph does', () => {
    // A heading at the body size beside a body paragraph with the same text
    // and the same two-em first-line indent: the bracket at the start of the
    // indented line is set alike, under the mainland default (clreq: the
    // indent, then the bracket at full width) and under each
    // `cjk.paragraphStartBracket` pattern, and the lines break alike.
    const same: HeadingLevelConfig = { level: 2, fontSize: pt(BODY), lineHeight: pt(17.5), marginTop: pt(0), marginBottom: pt(0), firstLineIndent: em(2) };
    const text = `（一）${ZH}${ZH}`;
    const body = { fontSize: pt(BODY), lineHeight: pt(17.5), textAlign: 'left' as const, firstLineIndent: em(2), indentAfterHeading: true };
    const firstStart: Record<string, number> = {};
    for (const bracket of [undefined, 'indent', 'half', 'flush'] as const) {
      const c = config({ bodyText: body, ...(bracket ? { cjk: { paragraphStartBracket: bracket } } : {}) }, [same]);
      for (const cfg of [c, vertical(c)]) {
        const doc = buildDocument({ markdown: `正文\n\n## ${text}\n\n${text}` }, cfg);
        const h = heading(doc, '（一）');
        const p = doc.blocks.filter((b) => b.type === 'paragraph')[1]!;
        expect(h.lines.length).toBeGreaterThan(1);
        expect(h.lines.map((l) => [l.text, l.bbox.x - h.bbox.x, l.bbox.width])).toEqual(p.lines.map((l) => [l.text, l.bbox.x - p.bbox.x, l.bbox.width]));
      }
      firstStart[bracket ?? 'default'] = starts(heading(buildDocument({ markdown: `## ${text}` }, c), '（一）'))[0]!;
    }
    expect(firstStart.default).toBeCloseTo(2 * BODY, 6);
    // Pattern ③: the bracket's glyph in the second half of the indent.
    expect(firstStart.half).toBeLessThan(2 * BODY);
    expect(firstStart.half).toBeGreaterThan(BODY);
    // 天付き: the bracket opens the line with no indent.
    expect(firstStart.flush).toBeCloseTo(0, 6);
  });

  it('adds to indent: every line indent in, the first indent + firstLineIndent', () => {
    const both: HeadingLevelConfig = { ...gbt, indent: em(1) };
    for (const c of [config({}, [both]), vertical(config({}, [both]))]) {
      const h = heading(buildDocument({ markdown: `## ${ZH}\n\n正文` }, c));
      const [first, ...rest] = starts(h);
      expect(first).toBeCloseTo(3 * BODY, 6);
      expect(rest.length).toBeGreaterThan(0);
      for (const s of rest) expect(s).toBeCloseTo(1 * BODY, 6);
    }
  });

  it('puts the number after the indent, and the outline number carries no leading space', () => {
    const numbered: HeadingLevelConfig = { ...gbt, numberingTemplate: '（{2:一}）', numberSeparator: '' };
    const c = config({}, [numbered]);
    const markdown = `## ${ZH}\n\n正文`;
    const h = heading(buildDocument({ markdown }, c));
    expect(h.lines[0]!.text.startsWith('（一）')).toBe(true);
    expect(starts(h)[0]).toBeCloseTo(2 * BODY, 6);
    const outline = computeOutlineFor(parseMarkdown(markdown), c);
    const entry = outline.find((e) => e.kind === 'heading' && e.level === 2)!;
    expect(entry.number).toBe('（一）');
    expect(entry.title).toBe(ZH);
  });

  it('centres the first line in the room after the indent, as a centred body paragraph does', () => {
    const c = { ...config({}, [gbt]), headings: { textAlign: 'center' as const, levels: [gbt] } };
    const h = heading(buildDocument({ markdown: `## ${ZH}\n\n正文` }, c));
    expect(h.textAlign).toBe('center');
    expect(starts(h)[0]).toBeCloseTo(2 * BODY, 6);
    expect(starts(h)[1]).toBeCloseTo(0, 6);
  });
});

describe('overrides', () => {
  const markdown = [`## 甲${ZH} {firstLineIndent=0}`, `## 乙${ZH} {firstLineIndent=3}`, `## 丙${ZH} {firstLineIndent="15pt"}`, `## 丁${ZH} {firstLineIndent=wide}`, `## 戊${ZH}`]
    .map((h) => `${h}\n\n正文`).join('\n\n');

  it('takes a heading attribute: 0 clears the level, a bare number is body ems, a value that is no length leaves the level', () => {
    for (const c of [config({}, [gbt]), vertical(config({}, [gbt]))]) {
      const doc = buildDocument({ markdown }, c);
      const first = (t: string) => starts(heading(doc, t))[0];
      expect(first('甲')).toBeCloseTo(0, 6);
      expect(first('乙')).toBeCloseTo(3 * BODY, 6);
      expect(first('丙')).toBeCloseTo(15, 6);
      expect(first('丁')).toBeCloseTo(2 * BODY, 6);
      expect(first('戊')).toBeCloseTo(2 * BODY, 6);
      for (const t of ['乙', '丙']) expect(starts(heading(doc, t))[1]).toBeCloseTo(0, 6);
    }
  });

  it('a heading style overrides the level, and its 0 takes the level’s off', () => {
    const c = config({ headingStyles: [{ id: 'deep', firstLineIndent: em(4) }, { id: 'flat', firstLineIndent: em(0) }] }, [gbt]);
    const doc = buildDocument({ markdown: `## 甲${ZH} {style="deep"}\n\n正文\n\n## 乙${ZH} {style="flat"}\n\n正文\n\n## 丙${ZH} {style="deep" firstLineIndent=1}\n\n正文` }, c);
    expect(starts(heading(doc, '甲'))[0]).toBeCloseTo(4 * BODY, 6);
    expect(starts(heading(doc, '乙'))[0]).toBeCloseTo(0, 6);
    expect(starts(heading(doc, '丙'))[0]).toBeCloseTo(1 * BODY, 6);
    // On a level without one.
    const bare = buildDocument({ markdown: `## 甲${ZH} {style="deep"}\n\n正文` }, config({ headingStyles: [{ id: 'deep', firstLineIndent: em(4) }] }));
    expect(starts(heading(bare, '甲'))[0]).toBeCloseTo(4 * BODY, 6);
  });

  it('leaves a heading without it as it was', () => {
    const doc = buildDocument({ markdown: `## ${ZH}\n\n正文` }, config());
    expect(starts(heading(doc))).toEqual(starts(heading(doc)).map(() => 0));
  });
});

describe('configuration', () => {
  it('resolves and strips only when set and non-zero', () => {
    expect('firstLineIndent' in resolveHeadingsConfig({}).levels[1]!).toBe(false);
    const r = resolveHeadingsConfig({ levels: [{ level: 2, firstLineIndent: em(2) }, { level: 3, firstLineIndent: em(0) }] });
    expect(r.levels[1]!.firstLineIndent).toEqual(em(2));
    expect('firstLineIndent' in r.levels[2]!).toBe(false);
    expect(stripHeadingsDefaults({ levels: [{ level: 2, firstLineIndent: em(2) }] })).toEqual({ levels: [{ level: 2, firstLineIndent: em(2) }] });
    expect(stripHeadingsDefaults({ levels: [{ level: 2, firstLineIndent: em(0) }] })).toBeUndefined();
  });

  it('survives strip-defaults and a bundle save and load', async () => {
    const cfg: PostextConfig = {
      headings: { levels: [{ level: 2, firstLineIndent: em(2) }, { level: 3, indent: em(1), firstLineIndent: pt(20) }] },
      headingStyles: [{ id: 'gbt', firstLineIndent: em(2) }],
    };
    const stripped = stripConfigDefaults(cfg);
    expect(stripped.headings?.levels?.find((l) => l.level === 2)?.firstLineIndent).toEqual(em(2));
    expect(stripped.headings?.levels?.find((l) => l.level === 3)).toMatchObject({ indent: em(1), firstLineIndent: pt(20) });
    const { bytes } = await createBundle({ name: 'gbt', locale: 'zh', markdown: `## ${ZH}`, config: stripped });
    const bundle = await openBundle(bytes);
    expect(bundle.config.headings?.levels?.find((l) => l.level === 2)?.firstLineIndent).toEqual(em(2));
    expect(bundle.config.headings?.levels?.find((l) => l.level === 3)).toMatchObject({ indent: em(1), firstLineIndent: pt(20) });
    expect(bundle.config.headingStyles?.find((s) => s.id === 'gbt')?.firstLineIndent).toEqual(em(2));
  });
});
